/**
 * HTTP-level tests for the Phase 3 plan endpoints.
 *
 * Uses `forceFallback` so the suite is fast and doesn't burn Groq rate limit —
 * the AI path itself is covered by generation.test.mjs. What matters here is the
 * routing, plan versioning, stale detection and regeneration-flag lifecycle.
 *
 *   npm run test:plans
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

const EMAIL = 'fitgen-plans-test@example.com';

await mock.module('../src/services/googleAuth.js', {
  namedExports: {
    verifyGoogleIdToken: async () => ({
      googleId: 'google-plans-test',
      email: EMAIL,
      name: 'Plan Tester',
    }),
  },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const buildApp = (await import('../src/app.js')).default;
const { User } = await import('../src/models/User.js');
const { WorkoutPlan } = await import('../src/models/WorkoutPlan.js');
const { DietPlan } = await import('../src/models/DietPlan.js');

await connectDB();

const cleanup = async () => {
  const user = await User.findOne({ email: EMAIL });
  if (user) {
    await Promise.all([
      WorkoutPlan.deleteMany({ userId: user._id }),
      DietPlan.deleteMany({ userId: user._id }),
    ]);
  }
  await User.deleteMany({ email: EMAIL });
};
await cleanup();

const app = buildApp();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

let token;
const req = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

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
  return d.toISOString().slice(0, 10);
};

/* --- sign in ------------------------------------------------------------ */
const auth = await req('POST', '/api/auth/google', { credential: 'stub' });
token = auth.body.token;

/* --- generation is blocked before onboarding ---------------------------- */
const tooEarly = await req('POST', '/api/plans/workout/generate', { forceFallback: true });
await check('generation refused before onboarding (400)', () =>
  assert.equal(tooEarly.status, 400));
await check('refusal names the missing fields', () =>
  assert.ok(Array.isArray(tooEarly.body.details?.missing)));

/* --- onboard ------------------------------------------------------------ */
await req('PUT', '/api/profile/onboarding', {
  gender: 'female',
  dateOfBirth: dob(27),
  heightCm: 165,
  weightKg: 62,
  goal: 'recomp',
  activityLevel: 'light',
  trainingDaysPerWeek: 4,
  preferredSplit: 'upper_lower',
  availableEquipment: ['dumbbell', 'body only'],
  dietType: 'eggetarian',
  allergies: [],
  dislikedFoods: [],
  mealsPerDay: 3,
  injuries: [],
});

/* --- status before any plan --------------------------------------------- */
const emptyStatus = await req('GET', '/api/plans/status');
await check('status: reports no workout plan yet', () =>
  assert.equal(emptyStatus.body.data.workout, null));
await check('status: reports no diet plan yet', () =>
  assert.equal(emptyStatus.body.data.diet, null));
await check('status: exposes whether AI is available', () =>
  assert.equal(typeof emptyStatus.body.data.aiAvailable, 'boolean'));

const noPlan = await req('GET', '/api/plans/workout');
await check('GET workout returns null when none exists', () =>
  assert.equal(noPlan.body.data, null));

/* --- generate workout --------------------------------------------------- */
const w1 = await req('POST', '/api/plans/workout/generate', { forceFallback: true });
await check('workout generate returns 201', () =>
  assert.equal(w1.status, 201, JSON.stringify(w1.body).slice(0, 200)));
await check('workout plan is version 1', () => assert.equal(w1.body.data.version, 1));
await check('workout plan is active', () => assert.equal(w1.body.data.isActive, true));
await check('workout plan has 4 days as requested', () =>
  assert.equal(w1.body.data.days.length, 4));
await check('workout plan records the profile version it was built from', () =>
  assert.equal(w1.body.data.profileVersion, 1));
await check('workout plan records its provenance', () =>
  assert.equal(w1.body.data.generation.generatedBy, 'fallback'));
await check('workout days contain grounded exercises', () =>
  assert.ok(w1.body.data.days.every((d) => d.exercises.length > 0)));
await check('workout respects equipment (dumbbell / body only)', () => {
  const foreign = w1.body.data.days
    .flatMap((d) => d.exercises)
    .filter((e) => !['dumbbell', 'body only'].includes(e.equipment));
  assert.deepEqual(foreign.map((e) => e.equipment), []);
});

/* --- regenerate supersedes --------------------------------------------- */
const w2 = await req('POST', '/api/plans/workout/generate', { forceFallback: true });
await check('regenerating increments to version 2', () =>
  assert.equal(w2.body.data.version, 2));

const active = await req('GET', '/api/plans/workout');
await check('the active plan is the newest version', () =>
  assert.equal(active.body.data.version, 2));

const history = await req('GET', '/api/plans/workout/history');
await check('history keeps both versions', () =>
  assert.equal(history.body.data.length, 2));
await check('history has exactly one active plan', () =>
  assert.equal(history.body.data.filter((p) => p.isActive).length, 1));

/* --- generate diet ------------------------------------------------------ */
const d1 = await req('POST', '/api/plans/diet/generate', { forceFallback: true });
await check('diet generate returns 201', () =>
  assert.equal(d1.status, 201, JSON.stringify(d1.body).slice(0, 200)));
await check('diet plan has 3 meals as requested', () =>
  assert.equal(d1.body.data.meals.length, 3));
await check('diet plan snapshots the targets it was built against', () =>
  assert.ok(d1.body.data.targets.calories > 0));
await check('diet daily totals are the sum of its meals', () => {
  const sum = d1.body.data.meals.reduce((s, m) => s + m.totals.calories, 0);
  assert.ok(Math.abs(sum - d1.body.data.dailyTotals.calories) <= 2);
});
await check('diet plan reports variance from target', () =>
  assert.equal(typeof d1.body.data.variance.caloriePercent, 'number'));

/* --- meal swap ---------------------------------------------------------- */
const before = d1.body.data.meals[1];
const swap = await req('POST', '/api/plans/diet/meals/2/swap');
await check('meal swap succeeds', () =>
  assert.equal(swap.status, 200, JSON.stringify(swap.body).slice(0, 200)));
await check('swap keeps the same number of meals', () =>
  assert.equal(swap.body.data.meals.length, 3));
await check('swap only replaces the requested meal', () => {
  assert.deepEqual(
    swap.body.data.meals[0].items.map((i) => i.slug),
    d1.body.data.meals[0].items.map((i) => i.slug),
  );
});
await check('swapped meal keeps its name and order', () => {
  const after = swap.body.data.meals[1];
  assert.equal(after.order, before.order);
  assert.equal(after.name, before.name);
});
await check('swap recomputes daily totals consistently', () => {
  const sum = swap.body.data.meals.reduce((s, m) => s + m.totals.calories, 0);
  assert.ok(Math.abs(sum - swap.body.data.dailyTotals.calories) <= 2);
});
await check('swap recomputes variance', () => {
  const expected = swap.body.data.dailyTotals.calories - swap.body.data.targets.calories;
  assert.ok(Math.abs(swap.body.data.variance.calories - expected) <= 1);
});

const badSwap = await req('POST', '/api/plans/diet/meals/99/swap');
await check('swapping a nonexistent meal is rejected', () =>
  assert.ok(badSwap.status === 400 || badSwap.status === 404, `got ${badSwap.status}`));

/* --- regeneration flag lifecycle --------------------------------------- */
const synced = await req('GET', '/api/profile');
await check('flag stays clear while plans match the profile', () =>
  assert.equal(synced.body.data.planRegeneration.required, false));

// A plan-relevant change must invalidate both plans.
await req('PATCH', '/api/profile', { goal: 'build_muscle' });

const afterChange = await req('GET', '/api/profile');
await check('changing the goal raises the regeneration flag', () =>
  assert.equal(afterChange.body.data.planRegeneration.required, true));

const staleStatus = await req('GET', '/api/plans/status');
await check('status marks the workout plan stale', () =>
  assert.equal(staleStatus.body.data.workout.stale, true));
await check('status marks the diet plan stale', () =>
  assert.equal(staleStatus.body.data.diet.stale, true));

const staleGet = await req('GET', '/api/plans/workout');
await check('GET workout exposes the stale flag', () =>
  assert.equal(staleGet.body.data.stale, true));

// Regenerating only ONE plan must NOT clear the flag — the other is still stale.
await req('POST', '/api/plans/workout/generate', { forceFallback: true });
const halfSynced = await req('GET', '/api/profile');
await check('regenerating only the workout leaves the flag set', () =>
  assert.equal(halfSynced.body.data.planRegeneration.required, true));

// Regenerating both clears it.
await req('POST', '/api/plans/diet/generate', { forceFallback: true });
const fullySynced = await req('GET', '/api/profile');
await check('regenerating both plans clears the flag', () =>
  assert.equal(fullySynced.body.data.planRegeneration.required, false));

const freshStatus = await req('GET', '/api/plans/status');
await check('neither plan is stale after regenerating both', () => {
  assert.equal(freshStatus.body.data.workout.stale, false);
  assert.equal(freshStatus.body.data.diet.stale, false);
});

/* --- history + read-only version detail -------------------------------- */
const fullHistory = await req('GET', '/api/plans/workout/history');
await check('history rows expose an id the client can fetch', () =>
  assert.ok(fullHistory.body.data.every((p) => typeof p._id === 'string')));
await check('history is newest-first', () => {
  const versions = fullHistory.body.data.map((p) => p.version);
  assert.deepEqual(versions, [...versions].sort((a, b) => b - a));
});
await check('history rows carry the profile version each was built from', () =>
  assert.ok(fullHistory.body.data.every((p) => typeof p.profileVersion === 'number')));
await check('history rows carry provenance', () =>
  assert.ok(fullHistory.body.data.every((p) => p.generation?.generatedBy)));

const archived = fullHistory.body.data.find((p) => !p.isActive);
const detail = await req('GET', `/api/plans/workout/${archived._id}`);
await check('an archived workout version can be fetched in full', () => {
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.version, archived.version);
  assert.ok(detail.body.data.days.length > 0, 'detail should include days');
});
await check('an archived version is correctly flagged stale', () =>
  assert.equal(detail.body.data.stale, archived.profileVersion !== staleStatus.body.data.profileVersion));

const dietHistory = await req('GET', '/api/plans/diet/history');
const dietDetail = await req('GET', `/api/plans/diet/${dietHistory.body.data[0]._id}`);
await check('an archived diet version can be fetched in full', () => {
  assert.equal(dietDetail.status, 200);
  assert.ok(dietDetail.body.data.meals.length > 0, 'detail should include meals');
});

const badId = await req('GET', '/api/plans/workout/not-an-objectid');
await check('a malformed plan id is rejected (400)', () =>
  assert.equal(badId.status, 400));

const missingId = await req('GET', '/api/plans/workout/507f1f77bcf86cd799439011');
await check('an unknown plan id returns 404', () =>
  assert.equal(missingId.status, 404));

/* --- ownership: a plan id must not be readable by another user ---------- */
const otherEmail = 'fitgen-plans-other@example.com';
await User.deleteMany({ email: otherEmail });
const other = await User.create({
  googleId: 'google-plans-other',
  email: otherEmail,
  name: 'Other User',
});
const { signToken } = await import('../src/utils/jwt.js');
const otherToken = signToken(other);

const stolen = await fetch(`${base}/api/plans/workout/${archived._id}`, {
  headers: { Authorization: `Bearer ${otherToken}` },
});
await check('another user cannot read this plan by id (404)', () =>
  assert.equal(stolen.status, 404));
await User.deleteMany({ email: otherEmail });

/* --- auth --------------------------------------------------------------- */
const saved = token;
token = null;
const unauth = await req('GET', '/api/plans/workout');
await check('plan endpoints require auth (401)', () => assert.equal(unauth.status, 401));
token = saved;

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await cleanup();
server.close();
await disconnectDB();
