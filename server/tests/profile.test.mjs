/**
 * Integration tests for the Phase 2 profile / onboarding API.
 * Stubs only Google's verification; everything else is the real path.
 *
 *   npm run test:profile
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

let googleUser = {
  googleId: 'google-phase2-test',
  email: 'phase2@example.com',
  name: 'Phase Two',
};

await mock.module('../src/services/googleAuth.js', {
  namedExports: { verifyGoogleIdToken: async () => googleUser },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const buildApp = (await import('../src/app.js')).default;
const { User } = await import('../src/models/User.js');

await connectDB();
await User.deleteMany({ email: googleUser.email });

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
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
};

const dobForAge = (age) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const validProfile = {
  gender: 'male',
  dateOfBirth: dobForAge(24),
  heightCm: 178,
  weightKg: 82,
  goal: 'lose_fat',
  targetWeightKg: 75,
  activityLevel: 'moderate',
  trainingDaysPerWeek: 5,
  preferredSplit: 'ppl',
  availableEquipment: ['barbell', 'dumbbell'],
  dietType: 'vegetarian',
  allergies: ['Peanuts', 'peanuts', ' Shellfish '],
  dislikedFoods: [],
  mealsPerDay: 4,
  injuries: [{ area: 'knee', severity: 'mild', notes: 'old ACL niggle' }],
};

/* --- sign in ------------------------------------------------------------ */
const auth = await req('POST', '/api/auth/google', { credential: 'stub' });
token = auth.body.token;
check('signed in for the test run', () => assert.ok(token));

/* --- options are grounded in the seeded DB ------------------------------ */
const options = await req('GET', '/api/profile/options');
check('options: equipment comes from the seeded exercises', () =>
  assert.ok(options.body.data.equipment.includes('barbell')));
check('options: equipment is non-trivial', () =>
  assert.ok(options.body.data.equipment.length >= 5, `got ${options.body.data.equipment.length}`));
check('options: goals carry calorie adjustments', () => {
  const cut = options.body.data.goals.find((g) => g.value === 'lose_fat');
  assert.equal(cut.calorieAdjustmentPercent, -20);
});
check('options: splits declare minimum training days', () => {
  const ppl = options.body.data.splits.find((s) => s.value === 'ppl');
  assert.equal(ppl.minDays, 3);
});

/* --- profile starts empty ---------------------------------------------- */
const empty = await req('GET', '/api/profile');
check('fresh profile is incomplete', () =>
  assert.equal(empty.body.data.completeness.complete, false));
check('fresh profile has no targets', () =>
  assert.equal(empty.body.data.targets.complete, false));
check('fresh profile reports 0% completeness', () =>
  assert.equal(empty.body.data.completeness.percent, 0));

/* --- preview does not persist ------------------------------------------ */
const preview = await req('POST', '/api/profile/targets/preview', {
  gender: 'male',
  dateOfBirth: dobForAge(25),
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'lose_fat',
});
check('preview computes BMR', () => assert.equal(preview.body.data.bmr, 1805));
check('preview computes macros', () =>
  assert.ok(preview.body.data.macros.protein > 0));

const afterPreview = await req('GET', '/api/profile');
check('preview did NOT persist anything', () =>
  assert.equal(afterPreview.body.data.completeness.percent, 0));

/* --- validation rejects bad input -------------------------------------- */
const badAge = await req('PUT', '/api/profile/onboarding', {
  ...validProfile,
  dateOfBirth: dobForAge(8),
});
check('rejects an under-13 date of birth (400)', () =>
  assert.equal(badAge.status, 400));
check('rejection names the offending field', () =>
  assert.ok(badAge.body.details?.dateOfBirth, JSON.stringify(badAge.body.details)));

const badTarget = await req('PUT', '/api/profile/onboarding', {
  ...validProfile,
  goal: 'lose_fat',
  weightKg: 70,
  targetWeightKg: 90,
});
check('rejects fat-loss goal with a HIGHER target weight', () =>
  assert.equal(badTarget.status, 400));
check('cross-field error is attributed to targetWeightKg', () =>
  assert.ok(badTarget.body.details?.targetWeightKg));

const badSplit = await req('PUT', '/api/profile/onboarding', {
  ...validProfile,
  preferredSplit: 'ppl',
  trainingDaysPerWeek: 2,
});
check('rejects PPL with only 2 training days', () =>
  assert.equal(badSplit.status, 400));

const badEquipment = await req('PUT', '/api/profile/onboarding', {
  ...validProfile,
  availableEquipment: [],
});
check('rejects an empty equipment list', () =>
  assert.equal(badEquipment.status, 400));

const badInjury = await req('PUT', '/api/profile/onboarding', {
  ...validProfile,
  injuries: [{ area: 'left_eyebrow', severity: 'mild' }],
});
check('rejects an unknown injury area', () =>
  assert.equal(badInjury.status, 400));

/* --- onboarding succeeds ----------------------------------------------- */
const onboard = await req('PUT', '/api/profile/onboarding', validProfile);
check('onboarding succeeds (201)', () =>
  assert.equal(onboard.status, 201, JSON.stringify(onboard.body)));
check('onboarding marks the user onboarded', () =>
  assert.equal(onboard.body.user.onboardingCompleted, true));
check('onboarding bumps profileVersion to 1', () =>
  assert.equal(onboard.body.data.profileVersion, 1));
check('onboarding reaches 100% completeness', () =>
  assert.equal(onboard.body.data.completeness.percent, 100));
check('onboarding computes real targets', () => {
  const t = onboard.body.data.targets;
  assert.equal(t.complete, true);
  assert.ok(t.calories > 1200 && t.calories < 4000, `calories ${t.calories}`);
  assert.ok(t.macros.protein > 0 && t.macros.carbs > 0 && t.macros.fats > 0);
});
check('onboarding does NOT flag regeneration on first run', () =>
  assert.equal(onboard.body.data.planRegeneration.required, false));
check('allergies are de-duplicated and normalised', () => {
  const a = onboard.body.data.profile.allergies;
  assert.deepEqual([...a].sort(), ['peanuts', 'shellfish'], JSON.stringify(a));
});
check('fullName falls back to the Google name', () =>
  assert.equal(onboard.body.data.profile.fullName, 'Phase Two'));

/* --- non-plan edit must NOT invalidate the plan ------------------------- */
const renameRes = await req('PATCH', '/api/profile', { fullName: 'Renamed User' });
check('renaming succeeds', () => assert.equal(renameRes.status, 200));
check('renaming reports no plan-relevant change', () =>
  assert.deepEqual(renameRes.body.changedFields, []));
check('renaming does NOT bump profileVersion', () =>
  assert.equal(renameRes.body.data.profileVersion, 1));
check('renaming does NOT flag regeneration', () =>
  assert.equal(renameRes.body.data.planRegeneration.required, false));

/* --- re-saving identical values must be a no-op ------------------------ */
const sameRes = await req('PATCH', '/api/profile', { goal: 'lose_fat' });
check('re-saving the same goal reports no change', () =>
  assert.deepEqual(sameRes.body.changedFields, []));
check('re-saving the same goal does NOT bump the version', () =>
  assert.equal(sameRes.body.data.profileVersion, 1));

/* --- plan-relevant edit MUST invalidate the plan ----------------------- */
const goalRes = await req('PATCH', '/api/profile', { goal: 'build_muscle' });
check('changing the goal is detected', () =>
  assert.deepEqual(goalRes.body.changedFields, ['goal']));
check('changing the goal bumps profileVersion to 2', () =>
  assert.equal(goalRes.body.data.profileVersion, 2));
check('changing the goal flags regeneration', () =>
  assert.equal(goalRes.body.data.planRegeneration.required, true));
check('regeneration reason names the field', () =>
  assert.ok(goalRes.body.data.planRegeneration.reasons.includes('goal')));
check('targets recompute after the goal change', () => {
  // build_muscle is a surplus, so calories must now exceed TDEE.
  const t = goalRes.body.data.targets;
  assert.ok(t.calories > t.tdee, `${t.calories} vs TDEE ${t.tdee}`);
});

/* --- equipment change is detected by content -------------------------- */
const equipSame = await req('PATCH', '/api/profile', {
  availableEquipment: ['barbell', 'dumbbell'],
});
check('identical equipment list is not a change', () =>
  assert.deepEqual(equipSame.body.changedFields, []));

const equipNew = await req('PATCH', '/api/profile', {
  availableEquipment: ['barbell', 'dumbbell', 'cable'],
});
check('added equipment is detected', () =>
  assert.deepEqual(equipNew.body.changedFields, ['availableEquipment']));

/* --- reasons accumulate ------------------------------------------------ */
check('regeneration reasons accumulate across edits', () => {
  const r = equipNew.body.data.planRegeneration.reasons;
  assert.ok(r.includes('goal') && r.includes('availableEquipment'), JSON.stringify(r));
});

/* --- acknowledge clears the flag -------------------------------------- */
const ack = await req('POST', '/api/profile/regeneration/acknowledge');
check('acknowledge clears the regeneration flag', () =>
  assert.equal(ack.body.data.planRegeneration.required, false));
check('acknowledge clears the reasons', () =>
  assert.deepEqual(ack.body.data.planRegeneration.reasons, []));

/* --- empty patch rejected -------------------------------------------- */
const emptyPatch = await req('PATCH', '/api/profile', {});
check('empty PATCH is rejected (400)', () => assert.equal(emptyPatch.status, 400));

/* --- auth required --------------------------------------------------- */
const savedToken = token;
token = null;
const noAuth = await req('GET', '/api/profile');
check('profile requires auth (401)', () => assert.equal(noAuth.status, 401));
token = savedToken;

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await User.deleteMany({ email: googleUser.email });
server.close();
await disconnectDB();
