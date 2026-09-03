/**
 * Guards the AI prompts against Groq's tokens-per-minute cap.
 *
 * Groq counts `prompt_tokens + max_tokens` against the free tier's 8000 TPM and
 * rejects an oversized request with 413 — which retrying cannot fix. This suite
 * builds the real prompts for the worst-case profiles and asserts they fit,
 * so a prompt-size regression fails here rather than in production.
 *
 *   npm run test:budget
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

// Ensure the AI path is taken even if the developer has no key configured.
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key-not-used';

const real = await import('../src/services/groqClient.js');
const { estimateTokens, TOKEN_BUDGET, TPM_LIMIT } = real;

/** Captures each generateJson call instead of hitting the network. */
const calls = [];
await mock.module('../src/services/groqClient.js', {
  namedExports: {
    ...real,
    isGroqConfigured: () => true,
    generateJson: async ({ system, user, maxTokens }) => {
      calls.push({
        promptTokens: estimateTokens(`${system}\n${user}`),
        maxTokens,
        user,
      });
      // Force the caller down its fallback path; we only want the prompt.
      throw new real.GroqUnavailableError('captured for measurement');
    },
  },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { generateWorkoutPlan } = await import('../src/services/workoutGenerator.js');
const { generateDietPlan } = await import('../src/services/dietGenerator.js');
const { calculateTargets } = await import('../src/services/fitnessCalc.js');

await connectDB();

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
};

const dob = (age) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString();
};

const ALL_EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'body only',
  'machine',
  'kettlebells',
  'bands',
  'e-z curl bar',
  'exercise ball',
  'medicine ball',
  'other',
];

const profileFor = (over = {}) => ({
  gender: 'male',
  dateOfBirth: dob(25),
  heightCm: 178,
  weightKg: 82,
  goal: 'build_muscle',
  targetWeightKg: 86,
  activityLevel: 'moderate',
  trainingDaysPerWeek: 6,
  preferredSplit: 'ppl',
  availableEquipment: ALL_EQUIPMENT,
  dietType: 'omnivore',
  allergies: [],
  dislikedFoods: [],
  mealsPerDay: 6,
  injuries: [],
  ...over,
});

console.log(`\nGroq TPM limit ${TPM_LIMIT} · prompt+output budget ${TOKEN_BUDGET}\n`);

/* --- workout: worst-case shapes ---------------------------------------- */
const workoutCases = [
  ['ppl / 6 days / all equipment', {}],
  ['bro_split / 7 days', { preferredSplit: 'bro_split', trainingDaysPerWeek: 7 }],
  ['full_body / 7 days', { preferredSplit: 'full_body', trainingDaysPerWeek: 7 }],
  ['upper_lower / 6 days', { preferredSplit: 'upper_lower', trainingDaysPerWeek: 6 }],
  ['ppl / 3 days', { trainingDaysPerWeek: 3 }],
];

for (const [label, over] of workoutCases) {
  calls.length = 0;
  await generateWorkoutPlan(profileFor(over));

  const call = calls[0];
  await check(`workout prompt fits budget — ${label}`, () => {
    assert.ok(call, 'generateJson was never called');
    const total = call.promptTokens + call.maxTokens;
    assert.ok(
      total <= TOKEN_BUDGET,
      `${total} tokens (prompt ${call.promptTokens} + max ${call.maxTokens}) exceeds ${TOKEN_BUDGET}`,
    );
  });
  if (call) {
    console.log(
      `  workout  ${label.padEnd(30)} prompt ${String(call.promptTokens).padStart(5)} + max ${String(call.maxTokens).padStart(4)} = ${String(call.promptTokens + call.maxTokens).padStart(5)}`,
    );
  }
}

/* --- diet: worst-case shapes ------------------------------------------- */
const dietCases = [
  ['omnivore / 6 meals', {}],
  ['omnivore / 8 meals', { mealsPerDay: 8 }],
  ['vegan / 3 meals', { dietType: 'vegan', mealsPerDay: 3 }],
  ['keto / 5 meals', { dietType: 'keto', mealsPerDay: 5 }],
];

for (const [label, over] of dietCases) {
  calls.length = 0;
  const profile = profileFor(over);
  await generateDietPlan(profile, calculateTargets(profile));

  const call = calls[0];
  await check(`diet prompt fits budget — ${label}`, () => {
    assert.ok(call, 'generateJson was never called');
    const total = call.promptTokens + call.maxTokens;
    assert.ok(
      total <= TOKEN_BUDGET,
      `${total} tokens (prompt ${call.promptTokens} + max ${call.maxTokens}) exceeds ${TOKEN_BUDGET}`,
    );
  });
  if (call) {
    console.log(
      `  diet     ${label.padEnd(30)} prompt ${String(call.promptTokens).padStart(5)} + max ${String(call.maxTokens).padStart(4)} = ${String(call.promptTokens + call.maxTokens).padStart(5)}`,
    );
  }
}

/* --- the prompt must still carry what grounding needs ------------------ */
calls.length = 0;
await generateWorkoutPlan(profileFor());
await check('compressed workout prompt still lists real slugs', () => {
  assert.match(calls[0].user, /[A-Z][a-z]+_[A-Za-z_-]+\|/, 'no slug|muscle lines found');
});
await check('compressed workout prompt still states every session key', () => {
  for (const key of ['push', 'pull', 'legs']) {
    assert.ok(calls[0].user.includes(`key="${key}"`), `missing key ${key}`);
  }
});

calls.length = 0;
const dietProfile = profileFor({ mealsPerDay: 3 });
await generateDietPlan(dietProfile, calculateTargets(dietProfile));
await check('compressed diet prompt still lists slug:macros entries', () => {
  assert.match(calls[0].user, /[a-z0-9-]+:\d+\/[\d.]+\/[\d.]+\/[\d.]+/);
});
await check('compressed diet prompt still names every meal', () => {
  for (const name of ['Breakfast', 'Lunch', 'Dinner']) {
    assert.ok(calls[0].user.includes(name), `missing meal ${name}`);
  }
});

/* --- estimator sanity -------------------------------------------------- */
await check('token estimator is conservative (over-estimates prose)', () => {
  // ~4 chars/token is typical English; ours must not under-estimate that.
  const text = 'the quick brown fox jumps over the lazy dog '.repeat(20);
  assert.ok(estimateTokens(text) >= text.length / 4);
});

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await disconnectDB();
