/**
 * Adversarial tests for the DB grounding layer.
 *
 * The other suites prove that a *well-behaved* model produces grounded plans.
 * This one proves the layer actually defends: it feeds the generators
 * deliberately fabricated LLM responses — invented exercise slugs, invented
 * foods, lies about names and macros, absurd portions, cross-session leakage —
 * and asserts none of it reaches the stored plan.
 *
 * `generateJson` is stubbed, so no network call is made and the injected
 * response is fully controlled. The stub reads the real prompt to discover
 * genuine slugs, exactly as the model would, then returns a mix of real and
 * fake. Note this deliberately bypasses the retry `validate` gate in order to
 * isolate grounding — the last line of defence — though one test below invokes
 * that gate directly.
 *
 *   npm run test:grounding
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'stub-key';

const real = await import('../src/services/groqClient.js');

/** Set by each test to the response the "model" should return. */
let nextResponse = null;
/** Captures what the generator asked for, so tests can inspect the prompt. */
let lastCall = null;

await mock.module('../src/services/groqClient.js', {
  namedExports: {
    ...real,
    isGroqConfigured: () => true,
    generateJson: async ({ system, user, validate, maxTokens }) => {
      lastCall = { system, user, validate, maxTokens };
      const data = typeof nextResponse === 'function' ? nextResponse(user) : nextResponse;
      return {
        data,
        meta: { model: 'injected-stub', attempts: 1, durationMs: 1, usage: null, problems: [] },
      };
    },
  },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { Exercise } = await import('../src/models/Exercise.js');
const { Food } = await import('../src/models/Food.js');
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

const profile = {
  gender: 'male',
  dateOfBirth: dob(26),
  heightCm: 180,
  weightKg: 80,
  goal: 'build_muscle',
  activityLevel: 'moderate',
  trainingDaysPerWeek: 3,
  preferredSplit: 'ppl',
  availableEquipment: ['barbell', 'dumbbell', 'cable', 'body only', 'machine'],
  dietType: 'omnivore',
  allergies: [],
  dislikedFoods: [],
  mealsPerDay: 3,
  injuries: [],
};
const targets = calculateTargets(profile);

const FAKE_EXERCISES = [
  'Superman_Mega_Press',
  'Quantum_Deadlift_9000',
  'Telekinetic_Row',
  'Barbell_Bench_Press_ULTRA', // plausible-looking near-miss of a real slug
];
const FAKE_FOODS = ['unicorn-steak', 'moon-cheese', 'protein-air', 'white-rice-cooked-XL'];

/* ---------------------------------------------------------- prompt parsing */

/** Extracts each session key and its genuine candidate slugs from the prompt. */
const parseWorkoutPrompt = (user) =>
  user
    .split('SESSION key="')
    .slice(1)
    .map((block) => ({
      key: block.slice(0, block.indexOf('"')),
      slugs: [...block.matchAll(/^(\S+)\|[^|\n]*\|/gm)].map((m) => m[1]),
    }));

/** Extracts genuine food slugs from the diet prompt. */
const parseDietPrompt = (user) => [
  ...new Set([...user.matchAll(/([a-z0-9][a-z0-9-]*):\d/g)].map((m) => m[1])),
];

/* ============================================ workout: injected fabrications */

/* --- 1. every slug invented -------------------------------------------- */
nextResponse = (user) => ({
  sessions: parseWorkoutPrompt(user).map(({ key }) => ({
    key,
    exercises: FAKE_EXERCISES.map((slug) => ({
      slug,
      sets: 4,
      reps: '8-12',
      restSeconds: 90,
    })),
  })),
});
const allFake = await generateWorkoutPlan(profile);
const allFakeSlugs = allFake.days.flatMap((d) => d.exercises.map((e) => e.slug));

await check('workout: a fully fabricated response yields no fake exercises', () => {
  const leaked = allFakeSlugs.filter((s) => FAKE_EXERCISES.includes(s));
  assert.deepEqual(leaked, [], `fabricated slugs reached the plan: ${leaked.join(', ')}`);
});
await check('workout: fabricated response falls back rather than producing nothing', () => {
  assert.ok(
    allFake.days.every((d) => d.exercises.length > 0),
    'plan should still be usable via the deterministic engine',
  );
  assert.equal(allFake.generation.generatedBy, 'hybrid');
});
await check('workout: the rejection is disclosed in the warnings', () => {
  assert.ok(
    allFake.generation.warnings.some((w) => /grounding/i.test(w)),
    JSON.stringify(allFake.generation.warnings),
  );
});
await check('workout: every surviving slug exists in the database', async () => {
  const found = await Exercise.find({ slug: { $in: allFakeSlugs } }).select('slug').lean();
  assert.equal(found.length, new Set(allFakeSlugs).size);
});

/* --- 2. half real, half invented --------------------------------------- */
nextResponse = (user) => ({
  sessions: parseWorkoutPrompt(user).map(({ key, slugs }) => ({
    key,
    exercises: [
      ...slugs.slice(0, 4).map((slug) => ({ slug, sets: 4, reps: '8-12', restSeconds: 90 })),
      ...FAKE_EXERCISES.map((slug) => ({ slug, sets: 4, reps: '8-12', restSeconds: 90 })),
    ],
  })),
});
const mixed = await generateWorkoutPlan(profile);

await check('workout: real picks are kept when mixed with fabrications', () => {
  assert.ok(
    mixed.days.every((d) => d.exercises.length === 4),
    `expected 4 real survivors per day, got ${mixed.days.map((d) => d.exercises.length).join(',')}`,
  );
});
await check('workout: fabrications are stripped from a mixed response', () => {
  const leaked = mixed.days
    .flatMap((d) => d.exercises.map((e) => e.slug))
    .filter((s) => FAKE_EXERCISES.includes(s));
  assert.deepEqual(leaked, []);
});
await check('workout: a mixed response still counts as AI-generated', () =>
  assert.equal(mixed.generation.generatedBy, 'groq'));

/* --- 3. the DB is authoritative for descriptive fields ----------------- */
nextResponse = (user) => ({
  sessions: parseWorkoutPrompt(user).map(({ key, slugs }) => ({
    key,
    exercises: slugs.slice(0, 3).map((slug) => ({
      slug,
      // Everything below is a lie the model should not be able to persist.
      name: 'TOTALLY WRONG NAME',
      primaryMuscles: ['eyebrows'],
      equipment: 'jetpack',
      sets: 4,
      reps: '8-12',
      restSeconds: 90,
    })),
  })),
});
const lying = await generateWorkoutPlan(profile);
const lyingSlugs = lying.days.flatMap((d) => d.exercises.map((e) => e.slug));
const dbRecords = new Map(
  (await Exercise.find({ slug: { $in: lyingSlugs } })
    .select('slug name primaryMuscles equipment')
    .lean()).map((e) => [e.slug, e]),
);

await check('workout: exercise NAMES come from the DB, not the model', () => {
  for (const day of lying.days) {
    for (const exercise of day.exercises) {
      assert.equal(exercise.name, dbRecords.get(exercise.slug).name);
      assert.notEqual(exercise.name, 'TOTALLY WRONG NAME');
    }
  }
});
await check('workout: muscles and equipment come from the DB, not the model', () => {
  for (const day of lying.days) {
    for (const exercise of day.exercises) {
      const record = dbRecords.get(exercise.slug);
      assert.deepEqual(exercise.primaryMuscles, record.primaryMuscles);
      assert.equal(exercise.equipment, record.equipment);
      assert.notEqual(exercise.equipment, 'jetpack');
    }
  }
});

/* --- 4. cross-session leakage ------------------------------------------ */
nextResponse = (user) => {
  const sessions = parseWorkoutPrompt(user);
  // Give every session the FIRST session's candidates — legs would receive
  // push exercises, which are real slugs but not valid for that day.
  const foreign = sessions[0].slugs.slice(0, 5);
  return {
    sessions: sessions.map(({ key }) => ({
      key,
      exercises: foreign.map((slug) => ({ slug, sets: 4, reps: '8-12', restSeconds: 90 })),
    })),
  };
};
const leaked = await generateWorkoutPlan(profile);

await check('workout: a real slug from the WRONG session is rejected', async () => {
  // Each day's exercises must match that day's own target muscles.
  for (const day of leaked.days) {
    for (const exercise of day.exercises) {
      const overlaps = exercise.primaryMuscles.some((m) => day.focus.includes(m));
      assert.ok(
        overlaps,
        `${exercise.name} (${exercise.primaryMuscles.join(',')}) does not belong in ${day.name} (${day.focus.join(',')})`,
      );
    }
  }
});

/* --- 5. out-of-range numbers are clamped ------------------------------- */
nextResponse = (user) => ({
  sessions: parseWorkoutPrompt(user).map(({ key, slugs }) => ({
    key,
    exercises: slugs.slice(0, 3).map((slug, i) => ({
      slug,
      sets: [999, -5, 0][i],
      reps: 'x'.repeat(200),
      restSeconds: [99999, -100, 0][i],
    })),
  })),
});
const absurd = await generateWorkoutPlan(profile);

await check('workout: absurd set counts are clamped to 2-6', () => {
  for (const day of absurd.days) {
    for (const e of day.exercises) {
      assert.ok(e.sets >= 2 && e.sets <= 6, `sets=${e.sets}`);
    }
  }
});
await check('workout: absurd rest values are clamped to 30-240s', () => {
  for (const day of absurd.days) {
    for (const e of day.exercises) {
      assert.ok(e.restSeconds >= 30 && e.restSeconds <= 240, `rest=${e.restSeconds}`);
    }
  }
});
await check('workout: an overlong rep string is replaced with a sane default', () => {
  for (const day of absurd.days) {
    for (const e of day.exercises) {
      assert.ok(e.reps.length <= 12, `reps="${e.reps}"`);
    }
  }
});

/* --- 6. duplicates within a session ----------------------------------- */
nextResponse = (user) => ({
  sessions: parseWorkoutPrompt(user).map(({ key, slugs }) => ({
    key,
    exercises: [slugs[0], slugs[0], slugs[0], slugs[1]].map((slug) => ({
      slug,
      sets: 3,
      reps: '10',
      restSeconds: 60,
    })),
  })),
});
const dupes = await generateWorkoutPlan(profile);

await check('workout: repeated slugs are de-duplicated within a session', () => {
  for (const day of dupes.days) {
    const slugs = day.exercises.map((e) => e.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${day.name}: ${slugs.join(',')}`);
  }
});

/* --- 7. the retry gate rejects a mostly-fake response ----------------- */
await check('workout: the validate gate rejects a mostly-fabricated response', () => {
  assert.ok(lastCall?.validate, 'no validate callback was passed');
  const verdict = lastCall.validate({
    sessions: parseWorkoutPrompt(lastCall.user).map(({ key }) => ({
      key,
      exercises: FAKE_EXERCISES.map((slug) => ({ slug })),
    })),
  });
  assert.notEqual(verdict, true, 'validate should have rejected fabricated slugs');
  assert.match(String(verdict), /CANDIDATES/i);
});
await check('workout: the validate gate accepts a genuine response', () => {
  const sessions = parseWorkoutPrompt(lastCall.user);
  const verdict = lastCall.validate({
    sessions: sessions.map(({ key, slugs }) => ({
      key,
      exercises: slugs.slice(0, 4).map((slug) => ({ slug })),
    })),
  });
  assert.equal(verdict, true, `validate rejected a valid response: ${verdict}`);
});

/* =============================================== diet: injected fabrications */

/* --- 8. invented foods ------------------------------------------------- */
nextResponse = (user) => {
  const realSlugs = parseDietPrompt(user);
  return {
    meals: ['Breakfast', 'Lunch', 'Dinner'].map((name, i) => ({
      name,
      items: [
        { slug: realSlugs[i * 2], grams: 150 },
        { slug: FAKE_FOODS[i], grams: 200 },
        { slug: realSlugs[i * 2 + 1], grams: 100 },
      ],
    })),
  };
};
const dietMixed = await generateDietPlan(profile, targets);
const dietSlugs = dietMixed.meals.flatMap((m) => m.items.map((i) => i.slug));

await check('diet: invented food slugs never reach the plan', () => {
  const bad = dietSlugs.filter((s) => FAKE_FOODS.includes(s));
  assert.deepEqual(bad, [], `fabricated foods reached the plan: ${bad.join(', ')}`);
});
await check('diet: genuine foods in the same response are kept', () => {
  assert.ok(dietMixed.meals.every((m) => m.items.length === 2), 'expected 2 survivors per meal');
});
await check('diet: every surviving food exists in the database', async () => {
  const found = await Food.find({ slug: { $in: dietSlugs } }).select('slug').lean();
  assert.equal(found.length, new Set(dietSlugs).size);
});
await check('diet: the rejection is disclosed in the warnings', () =>
  assert.ok(
    dietMixed.generation.warnings.some((w) => /grounding/i.test(w)),
    JSON.stringify(dietMixed.generation.warnings),
  ));

/* --- 9. the model lies about nutrition -------------------------------- */
nextResponse = (user) => {
  const realSlugs = parseDietPrompt(user);
  return {
    meals: ['Breakfast', 'Lunch', 'Dinner'].map((name, i) => ({
      name,
      items: [
        {
          slug: realSlugs[i],
          grams: 100,
          // Fabricated nutrition the server must ignore entirely.
          calories: 99999,
          protein: 500,
          carbs: 0,
          fats: 0,
        },
      ],
    })),
  };
};
const lyingDiet = await generateDietPlan(profile, targets);
const lyingFoods = new Map(
  (await Food.find({ slug: { $in: lyingDiet.meals.flatMap((m) => m.items.map((i) => i.slug)) } })
    .select('slug name calories protein carbs fats')
    .lean()).map((f) => [f.slug, f]),
);

await check('diet: fabricated calorie claims are discarded and recomputed', () => {
  for (const meal of lyingDiet.meals) {
    for (const item of meal.items) {
      const food = lyingFoods.get(item.slug);
      const expected = Math.round((food.calories * item.grams) / 100);
      assert.ok(
        Math.abs(item.calories - expected) <= 1,
        `${item.name}: stored ${item.calories} kcal, DB math says ${expected}`,
      );
      assert.notEqual(item.calories, 99999);
    }
  }
});
await check('diet: fabricated protein claims are discarded and recomputed', () => {
  for (const meal of lyingDiet.meals) {
    for (const item of meal.items) {
      const food = lyingFoods.get(item.slug);
      const expected = Math.round(((food.protein * item.grams) / 100) * 10) / 10;
      assert.ok(Math.abs(item.protein - expected) <= 0.2, `${item.name}: ${item.protein} vs ${expected}`);
      assert.notEqual(item.protein, 500);
    }
  }
});
await check('diet: daily totals stay internally consistent after the lies', () => {
  const sum = lyingDiet.meals.reduce((s, m) => s + m.totals.calories, 0);
  assert.ok(Math.abs(sum - lyingDiet.dailyTotals.calories) <= 2);
});

/* --- 10. absurd portions --------------------------------------------- */
nextResponse = (user) => {
  const realSlugs = parseDietPrompt(user);
  return {
    meals: ['Breakfast', 'Lunch', 'Dinner'].map((name, i) => ({
      name,
      items: [
        { slug: realSlugs[i * 2], grams: 500000 },
        { slug: realSlugs[i * 2 + 1], grams: -50 },
      ],
    })),
  };
};
const absurdDiet = await generateDietPlan(profile, targets);

await check('diet: absurd gram amounts are clamped to a sane range', () => {
  for (const meal of absurdDiet.meals) {
    for (const item of meal.items) {
      assert.ok(item.grams >= 10 && item.grams <= 600, `${item.name}: ${item.grams}g`);
    }
  }
});
await check('diet: negative gram amounts never produce negative macros', () => {
  for (const meal of absurdDiet.meals) {
    for (const item of meal.items) {
      assert.ok(item.calories >= 0 && item.protein >= 0, `${item.name}`);
    }
  }
});

/* --- 11. a meal with nothing salvageable ------------------------------ */
nextResponse = () => ({
  meals: ['Breakfast', 'Lunch', 'Dinner'].map((name) => ({
    name,
    items: FAKE_FOODS.map((slug) => ({ slug, grams: 100 })),
  })),
});
const hopeless = await generateDietPlan(profile, targets);

await check('diet: an entirely fabricated day falls back to real foods', async () => {
  const slugs = hopeless.meals.flatMap((m) => m.items.map((i) => i.slug));
  assert.ok(slugs.length > 0, 'plan should not be empty');
  const bad = slugs.filter((s) => FAKE_FOODS.includes(s));
  assert.deepEqual(bad, []);
  const found = await Food.find({ slug: { $in: slugs } }).select('slug').lean();
  assert.equal(found.length, new Set(slugs).size);
});
await check('diet: the fallback is disclosed, not silent', () =>
  assert.ok(
    hopeless.generation.warnings.length > 0,
    'expected a warning explaining the fallback',
  ));

/* --- 12. missing / malformed shapes ---------------------------------- */
for (const [label, response] of [
  ['null', null],
  ['empty object', {}],
  ['sessions not an array', { sessions: 'nope' }],
  ['items missing', { meals: [{ name: 'Breakfast' }] }],
]) {
  nextResponse = () => response;
  await check(`workout: survives a malformed response (${label})`, async () => {
    const plan = await generateWorkoutPlan(profile);
    assert.ok(plan.days.length === 3, 'schedule should still be built');
    assert.ok(plan.days.every((d) => d.exercises.length > 0), 'fallback should fill it');
  });
  await check(`diet: survives a malformed response (${label})`, async () => {
    const plan = await generateDietPlan(profile, targets);
    assert.ok(plan.meals.length === 3, 'meals should still be built');
    assert.ok(
      plan.meals.every((m) => m.items.length > 0),
      'fallback should fill every meal',
    );
  });
}

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await disconnectDB();
