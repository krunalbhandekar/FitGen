/**
 * Unit tests for the Phase 4 pure logic: progressive overload, deload,
 * consistency, and the Navy body-fat estimator.
 *
 * No database or network needed:  npm run test:progression
 */
import assert from 'node:assert/strict';
import {
  analyseConsistency,
  estimateOneRepMax,
  loadIncrementFor,
  parseRepRange,
  recommendProgression,
  RECOMMENDATIONS,
  roundToIncrement,
  sessionVolume,
} from '../src/services/progression.js';
import {
  bodyComposition,
  categoriseBodyFat,
  estimateBodyFat,
  waistToHeightRatio,
} from '../src/services/bodyComposition.js';

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

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const BARBELL_SQUAT = {
  equipment: 'barbell',
  mechanic: 'compound',
  primaryMuscles: ['quadriceps'],
};
const BARBELL_CURL = {
  equipment: 'e-z curl bar',
  mechanic: 'isolation',
  primaryMuscles: ['biceps'],
};
const DUMBBELL_PRESS = {
  equipment: 'dumbbell',
  mechanic: 'compound',
  primaryMuscles: ['chest'],
};
const PUSHUP = { equipment: 'body only', mechanic: 'compound', primaryMuscles: ['chest'] };

/* ------------------------------------------------------------- rep parsing */

check('rep range: parses "8-12"', () =>
  assert.deepEqual(parseRepRange('8-12'), { min: 8, max: 12 }));
check('rep range: parses an en-dash', () =>
  assert.deepEqual(parseRepRange('8–12'), { min: 8, max: 12 }));
check('rep range: parses "10 to 15"', () =>
  assert.deepEqual(parseRepRange('10 to 15'), { min: 10, max: 15 }));
check('rep range: parses a single number', () =>
  assert.deepEqual(parseRepRange('5'), { min: 5, max: 5 }));
check('rep range: falls back on garbage', () =>
  assert.deepEqual(parseRepRange('as many as possible'), { min: 8, max: 12 }));
check('rep range: falls back on null', () =>
  assert.deepEqual(parseRepRange(null), { min: 8, max: 12 }));

/* --------------------------------------------------------- load increments */

check('increment: barbell lower-body compound gets the big jump', () =>
  assert.equal(loadIncrementFor(BARBELL_SQUAT), 5));
check('increment: isolation work gets a small jump', () =>
  assert.equal(loadIncrementFor(BARBELL_CURL), 2.5));
check('increment: dumbbells move in per-hand steps', () =>
  assert.equal(loadIncrementFor(DUMBBELL_PRESS), 2));
check('increment: bodyweight has no load step', () =>
  assert.equal(loadIncrementFor(PUSHUP), 0));
check('increment: unknown equipment falls back to 2.5', () =>
  assert.equal(loadIncrementFor({ equipment: 'alien tech', mechanic: 'compound' }), 2.5));

check('rounding: snaps to the equipment increment', () => {
  assert.equal(roundToIncrement(83.7, 5), 85);
  assert.equal(roundToIncrement(81.2, 5), 80);
  assert.equal(roundToIncrement(22.4, 2.5), 22.5);
});
check('rounding: never returns below one increment', () =>
  assert.equal(roundToIncrement(0.4, 2.5), 2.5));

/* ------------------------------------------------------------------- e1RM */

check('e1RM: a single rep is the load itself', () =>
  assert.equal(estimateOneRepMax(100, 1), 100));
check('e1RM: Epley for 10 reps at 100kg ≈ 133', () =>
  assert.equal(estimateOneRepMax(100, 10), 133.3));
check('e1RM: higher reps at the same load estimate higher', () =>
  assert.ok(estimateOneRepMax(80, 12) > estimateOneRepMax(80, 6)));
check('e1RM: returns null on missing input', () => {
  assert.equal(estimateOneRepMax(0, 5), null);
  assert.equal(estimateOneRepMax(100, 0), null);
});

/* ----------------------------------------------------------------- volume */

check('volume: sums load × reps across sets', () =>
  assert.equal(
    sessionVolume([
      { weightKg: 100, reps: 10 },
      { weightKg: 100, reps: 8 },
    ]),
    1800,
  ));
check('volume: bodyweight sets contribute zero load', () =>
  assert.equal(sessionVolume([{ weightKg: 0, reps: 20 }]), 0));
check('volume: tolerates empty input', () => assert.equal(sessionVolume([]), 0));

/* -------------------------------------------------------- progression: new */

check('progression: no history asks for a first log', () => {
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.insufficient_data);
});

check('progression: a session with no completed sets is insufficient', () => {
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [{ date: daysAgo(2), sets: [{ reps: 0, weightKg: 60 }] }],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.insufficient_data);
});

/* --------------------------------------------------- progression: increase */

check('progression: all sets at top of range → add load', () => {
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [
      {
        date: daysAgo(2),
        sets: [
          { reps: 12, weightKg: 80 },
          { reps: 12, weightKg: 80 },
          { reps: 12, weightKg: 80 },
        ],
      },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.increase_load);
  assert.equal(r.suggestedWeightKg, 85, 'expected +5kg for a barbell squat');
  assert.equal(r.previousWeightKg, 80);
});

check('progression: increase respects the equipment increment', () => {
  const r = recommendProgression({
    exercise: DUMBBELL_PRESS,
    targetReps: '8-12',
    targetSets: 3,
    history: [
      {
        date: daysAgo(2),
        sets: [
          { reps: 12, weightKg: 20 },
          { reps: 12, weightKg: 20 },
          { reps: 12, weightKg: 20 },
        ],
      },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.increase_load);
  assert.equal(r.suggestedWeightKg, 22);
});

check('progression: bodyweight movements add reps, not load', () => {
  const r = recommendProgression({
    exercise: PUSHUP,
    targetReps: '10-15',
    targetSets: 3,
    history: [
      {
        date: daysAgo(2),
        sets: [
          { reps: 15, weightKg: 0 },
          { reps: 15, weightKg: 0 },
          { reps: 15, weightKg: 0 },
        ],
      },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.add_reps);
  assert.equal(r.suggestedWeightKg, null);
  assert.match(r.targetReps, /12-17/);
});

check('progression: hitting top reps on too FEW sets does not add load', () => {
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 4,
    history: [{ date: daysAgo(2), sets: [{ reps: 12, weightKg: 80 }] }],
  });
  assert.notEqual(r.recommendation, RECOMMENDATIONS.increase_load);
});

/* ------------------------------------------------------- progression: hold */

check('progression: mid-range performance → add reps at the same load', () => {
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [
      {
        date: daysAgo(2),
        sets: [
          { reps: 10, weightKg: 80 },
          { reps: 9, weightKg: 80 },
          { reps: 8, weightKg: 80 },
        ],
      },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.add_reps);
  assert.equal(r.suggestedWeightKg, 80);
});

check('progression: one bad session holds rather than deloading', () => {
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [
      {
        date: daysAgo(2),
        sets: [
          { reps: 6, weightKg: 80 },
          { reps: 5, weightKg: 80 },
        ],
      },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.hold, 'a single off day is not a deload');
});

/* ----------------------------------------------------- progression: deload */

check('progression: two failing sessions → deload ~10%', () => {
  const bad = {
    sets: [
      { reps: 6, weightKg: 100 },
      { reps: 5, weightKg: 100 },
      { reps: 5, weightKg: 100 },
    ],
  };
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [
      { date: daysAgo(2), ...bad },
      { date: daysAgo(5), ...bad },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.deload);
  assert.equal(r.suggestedWeightKg, 90, '100kg − 10% snapped to a 5kg step');
  assert.ok(r.suggestedWeightKg < r.previousWeightKg);
});

check('progression: bodyweight movements are never load-deloaded', () => {
  const bad = { sets: [{ reps: 4, weightKg: 0 }, { reps: 3, weightKg: 0 }] };
  const r = recommendProgression({
    exercise: PUSHUP,
    targetReps: '10-15',
    targetSets: 3,
    history: [
      { date: daysAgo(2), ...bad },
      { date: daysAgo(5), ...bad },
    ],
  });
  assert.notEqual(r.recommendation, RECOMMENDATIONS.deload);
});

/* ------------------------------------------------- progression: stall reset */

check('progression: three flat sessions trigger a stall reset', () => {
  // Inside the range every time, but volume never moves.
  const flat = {
    sets: [
      { reps: 10, weightKg: 100 },
      { reps: 10, weightKg: 100 },
      { reps: 10, weightKg: 100 },
    ],
  };
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [
      { date: daysAgo(2), ...flat },
      { date: daysAgo(5), ...flat },
      { date: daysAgo(9), ...flat },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.reset_stall);
  assert.ok(r.suggestedWeightKg < 100);
});

check('progression: improving volume is NOT treated as a stall', () => {
  const r = recommendProgression({
    exercise: BARBELL_SQUAT,
    targetReps: '8-12',
    targetSets: 3,
    history: [
      { date: daysAgo(2), sets: [{ reps: 11, weightKg: 100 }, { reps: 11, weightKg: 100 }, { reps: 10, weightKg: 100 }] },
      { date: daysAgo(5), sets: [{ reps: 10, weightKg: 100 }, { reps: 10, weightKg: 100 }, { reps: 9, weightKg: 100 }] },
      { date: daysAgo(9), sets: [{ reps: 9, weightKg: 100 }, { reps: 9, weightKg: 100 }, { reps: 8, weightKg: 100 }] },
    ],
  });
  assert.equal(r.recommendation, RECOMMENDATIONS.add_reps);
});

check('progression: is deterministic for identical history', () => {
  const history = [
    { date: daysAgo(2), sets: [{ reps: 12, weightKg: 80 }, { reps: 12, weightKg: 80 }, { reps: 12, weightKg: 80 }] },
  ];
  const args = { exercise: BARBELL_SQUAT, targetReps: '8-12', targetSets: 3, history };
  assert.deepEqual(recommendProgression(args), recommendProgression(args));
});

/* ------------------------------------------------------------ consistency */

check('consistency: no logs means no streak', () => {
  const c = analyseConsistency([], { trainingDaysPerWeek: 4 });
  assert.equal(c.streakWeeks, 0);
  assert.equal(c.totalSessions, 0);
  assert.equal(c.adherencePercent, 0);
});

check('consistency: a met week counts toward the streak', () => {
  const logs = [0, 1, 2].map((d) => ({ date: daysAgo(d) }));
  const c = analyseConsistency(logs, { trainingDaysPerWeek: 3, weeks: 4 });
  assert.equal(c.sessionsThisWeek, 3);
  assert.equal(c.streakWeeks, 1);
});

check('consistency: an unmet week breaks the streak', () => {
  // 3 sessions this week, only 1 last week, target 3.
  const logs = [...[0, 1, 2].map((d) => ({ date: daysAgo(d) })), { date: daysAgo(9) }];
  const c = analyseConsistency(logs, { trainingDaysPerWeek: 3, weeks: 4 });
  assert.equal(c.streakWeeks, 1, 'streak should stop at the incomplete week');
});

check('consistency: counts consecutive met weeks', () => {
  const logs = [
    ...[0, 1, 2].map((d) => ({ date: daysAgo(d) })),
    ...[7, 8, 9].map((d) => ({ date: daysAgo(d) })),
    ...[14, 15, 16].map((d) => ({ date: daysAgo(d) })),
  ];
  const c = analyseConsistency(logs, { trainingDaysPerWeek: 3, weeks: 6 });
  assert.equal(c.streakWeeks, 3);
});

check('consistency: weekly buckets are oldest-first for charting', () => {
  const c = analyseConsistency([], { weeks: 5 });
  assert.equal(c.weekly.length, 5);
  assert.equal(c.weekly[0].weeksAgo, 4);
  assert.equal(c.weekly[4].weeksAgo, 0);
});

check('consistency: adherence is a percentage of planned sessions', () => {
  const logs = [0, 1, 2, 3].map((d) => ({ date: daysAgo(d) }));
  const c = analyseConsistency(logs, { trainingDaysPerWeek: 4, weeks: 2 });
  assert.equal(c.adherencePercent, 50, '4 of 8 planned sessions');
});

/* ------------------------------------------------------------- body fat */

check('body fat: male Navy formula, hand-checked', () => {
  // 180cm, neck 38, waist 85 → published tables put this near 18%.
  const bf = estimateBodyFat({ gender: 'male', heightCm: 180, neckCm: 38, waistCm: 85 });
  assert.ok(!bf.unavailable, bf.reason);
  assert.ok(bf.value > 15 && bf.value < 21, `got ${bf.value}%`);
});

check('body fat: female Navy formula, hand-checked', () => {
  const bf = estimateBodyFat({
    gender: 'female',
    heightCm: 165,
    neckCm: 32,
    waistCm: 72,
    hipCm: 96,
  });
  assert.ok(!bf.unavailable, bf.reason);
  assert.ok(bf.value > 22 && bf.value < 32, `got ${bf.value}%`);
});

check('body fat: a larger waist estimates higher', () => {
  const lean = estimateBodyFat({ gender: 'male', heightCm: 180, neckCm: 38, waistCm: 78 });
  const heavier = estimateBodyFat({ gender: 'male', heightCm: 180, neckCm: 38, waistCm: 100 });
  assert.ok(heavier.value > lean.value, `${heavier.value} should exceed ${lean.value}`);
});

check('body fat: female formula requires a hip measurement', () => {
  const bf = estimateBodyFat({ gender: 'female', heightCm: 165, neckCm: 32, waistCm: 72 });
  assert.equal(bf.unavailable, true);
  assert.match(bf.reason, /hip/i);
});

check('body fat: missing measurements report what is needed', () => {
  const bf = estimateBodyFat({ gender: 'male', heightCm: 180 });
  assert.equal(bf.unavailable, true);
  assert.match(bf.reason, /neck|waist/i);
});

check('body fat: waist smaller than neck is rejected, not NaN', () => {
  const bf = estimateBodyFat({ gender: 'male', heightCm: 180, neckCm: 45, waistCm: 40 });
  assert.equal(bf.unavailable, true);
});

check('body fat: "other" gender is estimated and disclosed', () => {
  const bf = estimateBodyFat({ gender: 'other', heightCm: 175, neckCm: 37, waistCm: 82 });
  assert.ok(!bf.unavailable, bf.reason);
  assert.match(bf.note ?? '', /male formula/i);
});

check('body fat: categories differ by sex at the same percentage', () => {
  assert.notEqual(categoriseBodyFat(20, 'male'), categoriseBodyFat(20, 'female'));
});

check('body fat: category ordering is sane', () => {
  assert.equal(categoriseBodyFat(4, 'male'), 'essential');
  assert.equal(categoriseBodyFat(11, 'male'), 'athletic');
  assert.equal(categoriseBodyFat(30, 'male'), 'above average');
});

check('composition: fat and lean mass sum to bodyweight', () => {
  const c = bodyComposition(80, 20);
  assert.equal(c.fatMassKg, 16);
  assert.equal(c.leanMassKg, 64);
  assert.equal(c.fatMassKg + c.leanMassKg, 80);
});

check('waist-to-height: flags the 0.5 guideline', () => {
  assert.equal(waistToHeightRatio(80, 180).healthy, true);
  assert.equal(waistToHeightRatio(95, 180).healthy, false);
  assert.equal(waistToHeightRatio(90, 180).value, 0.5);
});

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);
