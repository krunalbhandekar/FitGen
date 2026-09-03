/**
 * Unit tests for the deterministic fitness calculations.
 * No database or network needed:  npm run test:calc
 */
import assert from 'node:assert/strict';
import {
  calculateAge,
  calculateBMI,
  calculateBMR,
  calculateMacros,
  calculateTDEE,
  calculateTargets,
  detectPlanRelevantChanges,
  profileCompleteness,
} from '../src/services/fitnessCalc.js';

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
  d.setDate(d.getDate() - 1); // ensure the birthday has passed
  return d.toISOString();
};

/* ------------------------------------------------------------------ BMR */
// Worked by hand: 10(80) + 6.25(180) - 5(25) + 5 = 800 + 1125 - 125 + 5 = 1805
check('BMR male, hand-computed', () =>
  assert.equal(calculateBMR({ weightKg: 80, heightCm: 180, age: 25, gender: 'male' }), 1805));

// 10(60) + 6.25(165) - 5(30) - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
check('BMR female, hand-computed', () =>
  assert.equal(
    calculateBMR({ weightKg: 60, heightCm: 165, age: 30, gender: 'female' }),
    1320.25,
  ));

check('BMR "other" sits between male and female', () => {
  const args = { weightKg: 70, heightCm: 170, age: 28 };
  const male = calculateBMR({ ...args, gender: 'male' });
  const female = calculateBMR({ ...args, gender: 'female' });
  const other = calculateBMR({ ...args, gender: 'other' });
  assert.ok(other < male && other > female, `${female} < ${other} < ${male}`);
});

/* ----------------------------------------------------------------- TDEE */
check('TDEE applies the sedentary multiplier', () =>
  assert.equal(calculateTDEE(2000, 'sedentary'), 2400));
check('TDEE applies the very_active multiplier', () =>
  assert.equal(calculateTDEE(2000, 'very_active'), 3800));
check('TDEE falls back to sedentary for an unknown level', () =>
  assert.equal(calculateTDEE(2000, 'nonsense'), 2400));

/* ------------------------------------------------------------------ age */
check('age from DOB', () => assert.equal(calculateAge(dobForAge(25)), 25));
check('age rejects garbage', () => assert.equal(calculateAge('not-a-date'), null));
check('age handles null', () => assert.equal(calculateAge(null), null));

/* ------------------------------------------------------------------ BMI */
check('BMI value + category', () => {
  const bmi = calculateBMI(80, 180);
  assert.equal(bmi.value, 24.7);
  assert.equal(bmi.category, 'healthy');
});
check('BMI flags obese', () => assert.equal(calculateBMI(110, 170).category, 'obese'));
check('BMI flags underweight', () =>
  assert.equal(calculateBMI(45, 175).category, 'underweight'));

/* --------------------------------------------------------------- macros */
check('macros reconcile with the calorie target (±2%)', () => {
  const m = calculateMacros({ calories: 2500, weightKg: 80, goal: 'build_muscle' });
  const drift = Math.abs(m.caloriesFromMacros - 2500) / 2500;
  assert.ok(drift < 0.02, `drift ${(drift * 100).toFixed(1)}% — ${JSON.stringify(m)}`);
});

check('macro percentages sum to ~100', () => {
  const m = calculateMacros({ calories: 2200, weightKg: 70, goal: 'lose_fat' });
  const sum = m.percentages.protein + m.percentages.carbs + m.percentages.fats;
  assert.ok(Math.abs(sum - 100) <= 1, `sum was ${sum}`);
});

check('cutting protein is higher than maintenance protein', () => {
  const cut = calculateMacros({ calories: 2000, weightKg: 80, goal: 'lose_fat' });
  const maintain = calculateMacros({ calories: 2000, weightKg: 80, goal: 'maintain' });
  assert.ok(cut.protein > maintain.protein, `${cut.protein} vs ${maintain.protein}`);
});

check('no negative macros under an extreme deficit', () => {
  const m = calculateMacros({ calories: 1400, weightKg: 150, goal: 'lose_fat' });
  assert.ok(m.protein > 0 && m.carbs >= 0 && m.fats > 0, JSON.stringify(m));
});

check('extreme deficit reports its compromise instead of hiding it', () => {
  const m = calculateMacros({ calories: 1400, weightKg: 150, goal: 'lose_fat' });
  assert.ok(m.notes.length > 0, 'expected at least one note');
});

/* -------------------------------------------------------------- targets */
const baseProfile = {
  weightKg: 80,
  heightCm: 180,
  gender: 'male',
  dateOfBirth: dobForAge(25),
  activityLevel: 'moderate',
  goal: 'lose_fat',
  targetWeightKg: 72,
};

check('targets: incomplete profile reports what is missing', () => {
  const t = calculateTargets({ weightKg: 80 });
  assert.equal(t.complete, false);
  assert.ok(t.missing.includes('heightCm'));
  assert.ok(t.missing.includes('goal'));
});

check('targets: complete profile computes the full set', () => {
  const t = calculateTargets(baseProfile);
  assert.equal(t.complete, true);
  assert.equal(t.bmr, 1805);
  assert.equal(t.tdee, Math.round(1805 * 1.55)); // 2798
  assert.equal(t.calories, Math.round(1805 * 1.55 * 0.8)); // 2238
});

check('targets: cutting projects weight loss', () => {
  const t = calculateTargets(baseProfile);
  assert.ok(t.projection.weeklyWeightChangeKg < 0, 'expected negative change');
});

check('targets: bulking projects weight gain', () => {
  const t = calculateTargets({ ...baseProfile, goal: 'build_muscle' });
  assert.ok(t.projection.weeklyWeightChangeKg > 0, 'expected positive change');
});

check('targets: maintain produces no calorie delta', () => {
  const t = calculateTargets({ ...baseProfile, goal: 'maintain' });
  assert.equal(t.projection.dailyDeltaKcal, 0);
});

check('targets: weeksToTarget is positive and finite', () => {
  const t = calculateTargets(baseProfile);
  assert.ok(t.projection.weeksToTarget > 0 && Number.isFinite(t.projection.weeksToTarget));
});

check('targets: safety floor lifts an absurdly low result', () => {
  // Tiny, sedentary, aggressive cut — the raw formula would go under the floor.
  const t = calculateTargets({
    weightKg: 40,
    heightCm: 145,
    gender: 'female',
    dateOfBirth: dobForAge(60),
    activityLevel: 'sedentary',
    goal: 'lose_fat',
  });
  assert.ok(t.calories >= 1200, `calories were ${t.calories}`);
  assert.ok(t.assumptions.length > 0, 'expected the floor to be disclosed');
});

check('targets: "other" gender discloses the BMR assumption', () => {
  const t = calculateTargets({ ...baseProfile, gender: 'other' });
  assert.ok(
    t.assumptions.some((a) => a.includes('midpoint')),
    JSON.stringify(t.assumptions),
  );
});

check('targets are deterministic — same input, same output', () => {
  assert.deepEqual(calculateTargets(baseProfile), calculateTargets(baseProfile));
});

/* --------------------------------------------------------- completeness */
check('completeness: empty profile is 0%', () => {
  const c = profileCompleteness({});
  assert.equal(c.complete, false);
  assert.equal(c.percent, 0);
});

check('completeness: empty equipment array counts as missing', () => {
  const c = profileCompleteness({ availableEquipment: [] });
  assert.ok(c.missing.includes('availableEquipment'));
});

check('completeness: fully populated profile is 100%', () => {
  const c = profileCompleteness({
    gender: 'male',
    dateOfBirth: dobForAge(25),
    heightCm: 180,
    weightKg: 80,
    goal: 'lose_fat',
    activityLevel: 'moderate',
    trainingDaysPerWeek: 4,
    preferredSplit: 'ppl',
    availableEquipment: ['barbell'],
    dietType: 'omnivore',
    mealsPerDay: 3,
  });
  assert.equal(c.complete, true, JSON.stringify(c.missing));
  assert.equal(c.percent, 100);
});

/* ------------------------------------------------------- change detection */
check('change detection: ignores untouched fields', () =>
  assert.deepEqual(detectPlanRelevantChanges({ goal: 'lose_fat' }, {}), []));

check('change detection: catches a changed goal', () =>
  assert.deepEqual(
    detectPlanRelevantChanges({ goal: 'lose_fat' }, { goal: 'build_muscle' }),
    ['goal'],
  ));

check('change detection: ignores a same-value write', () =>
  assert.deepEqual(
    detectPlanRelevantChanges({ goal: 'lose_fat' }, { goal: 'lose_fat' }),
    [],
  ));

check('change detection: compares equipment arrays by content', () => {
  assert.deepEqual(
    detectPlanRelevantChanges(
      { availableEquipment: ['barbell', 'dumbbell'] },
      { availableEquipment: ['barbell', 'dumbbell'] },
    ),
    [],
  );
  assert.deepEqual(
    detectPlanRelevantChanges(
      { availableEquipment: ['barbell'] },
      { availableEquipment: ['barbell', 'cable'] },
    ),
    ['availableEquipment'],
  );
});

check('change detection: ignores non-plan fields like fullName', () =>
  assert.deepEqual(
    detectPlanRelevantChanges({ fullName: 'A' }, { fullName: 'B' }),
    [],
  ));

check('change detection: compares dates by value, not identity', () => {
  const iso = dobForAge(25);
  assert.deepEqual(
    detectPlanRelevantChanges({ dateOfBirth: new Date(iso) }, { dateOfBirth: iso }),
    [],
  );
});

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);
