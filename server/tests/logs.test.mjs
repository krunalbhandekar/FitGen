/**
 * HTTP-level tests for the Phase 4 logging, progression and dashboard
 * endpoints.
 *
 *   npm run test:logs
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

const EMAIL = 'fitgen-logs-test@example.com';

await mock.module('../src/services/googleAuth.js', {
  namedExports: {
    verifyGoogleIdToken: async () => ({
      googleId: 'google-logs-test',
      email: EMAIL,
      name: 'Log Tester',
    }),
  },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const buildApp = (await import('../src/app.js')).default;
const { User } = await import('../src/models/User.js');
const { WorkoutPlan } = await import('../src/models/WorkoutPlan.js');
const { DietPlan } = await import('../src/models/DietPlan.js');
const { WorkoutLog } = await import('../src/models/WorkoutLog.js');
const { ProgressLog } = await import('../src/models/ProgressLog.js');

await connectDB();

const cleanup = async () => {
  const user = await User.findOne({ email: EMAIL });
  if (user) {
    await Promise.all([
      WorkoutPlan.deleteMany({ userId: user._id }),
      DietPlan.deleteMany({ userId: user._id }),
      WorkoutLog.deleteMany({ userId: user._id }),
      ProgressLog.deleteMany({ userId: user._id }),
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

const iso = (daysAgo = 0) =>
  new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

/* --- sign in and onboard ------------------------------------------------ */
const auth = await req('POST', '/api/auth/google', { credential: 'stub' });
token = auth.body.token;

const dobFor = (age) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
};

await req('PUT', '/api/profile/onboarding', {
  gender: 'male',
  dateOfBirth: dobFor(28),
  heightCm: 180,
  weightKg: 82,
  goal: 'build_muscle',
  activityLevel: 'moderate',
  trainingDaysPerWeek: 3,
  preferredSplit: 'ppl',
  availableEquipment: ['barbell', 'dumbbell', 'body only', 'machine', 'cable'],
  dietType: 'omnivore',
  allergies: [],
  dislikedFoods: [],
  mealsPerDay: 3,
  injuries: [],
});

// A plan is needed for the progression endpoint.
const planRes = await req('POST', '/api/plans/workout/generate', { forceFallback: true });
const plan = planRes.body.data;
const day1 = plan.days[0];

/* --- progression with no history -------------------------------------- */
const freshProg = await req('GET', '/api/logs/progression/1');
await check('progression: available for a plan day', () =>
  assert.equal(freshProg.status, 200, JSON.stringify(freshProg.body).slice(0, 200)));
await check('progression: reports insufficient data before any log', () =>
  assert.ok(
    freshProg.body.data.exercises.every(
      (e) => e.progression.recommendation === 'insufficient_data',
    ),
  ));
await check('progression: rejects a day not in the plan', async () => {
  const r = await req('GET', '/api/logs/progression/99');
  assert.equal(r.status, 404);
});

/* --- grounding on log writes ------------------------------------------ */
const bogus = await req('POST', '/api/logs/workout', {
  date: iso(0),
  exercises: [
    { order: 1, slug: 'Totally_Made_Up_Exercise', sets: [{ setNumber: 1, reps: 10, weightKg: 50 }] },
  ],
});
await check('log write: an unknown exercise slug is rejected', () =>
  assert.equal(bogus.status, 400));
await check('log write: rejection names the unknown slug', () =>
  assert.ok(bogus.body.details?.unknownSlugs?.includes('Totally_Made_Up_Exercise')));

const futureLog = await req('POST', '/api/logs/workout', {
  date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
  exercises: [
    { order: 1, slug: day1.exercises[0].slug, sets: [{ setNumber: 1, reps: 10, weightKg: 50 }] },
  ],
});
await check('log write: a future date is rejected', () =>
  assert.equal(futureLog.status, 400));

const emptyLog = await req('POST', '/api/logs/workout', {
  date: iso(0),
  exercises: [{ order: 1, slug: day1.exercises[0].slug, sets: [] }],
});
await check('log write: a log with no completed sets is rejected', () =>
  assert.equal(emptyLog.status, 400));

/* --- logging a real session ------------------------------------------- */
const buildLog = (daysAgo, reps, weight) => ({
  planId: plan._id,
  planVersion: plan.version,
  dayIndex: 1,
  dayName: day1.name,
  date: iso(daysAgo),
  durationMinutes: 55,
  exercises: day1.exercises.slice(0, 3).map((e, i) => ({
    order: i + 1,
    slug: e.slug,
    targetSets: e.sets,
    targetReps: e.reps,
    sets: Array.from({ length: 3 }, (_, s) => ({
      setNumber: s + 1,
      reps,
      weightKg: weight,
    })),
  })),
  notes: 'felt strong',
});

const first = await req('POST', '/api/logs/workout', buildLog(10, 12, 80));
await check('log write: a valid session is accepted (201)', () =>
  assert.equal(first.status, 201, JSON.stringify(first.body).slice(0, 250)));
await check('log write: volume is computed server-side', () =>
  // 3 exercises × 3 sets × 12 reps × 80kg = 8640
  assert.equal(first.body.data.totalVolumeKg, 8640));
await check('log write: set and rep totals are computed', () => {
  assert.equal(first.body.data.totalSets, 9);
  assert.equal(first.body.data.totalReps, 108);
});
await check('log write: exercise names come from the DB', () =>
  assert.ok(first.body.data.exercises.every((e) => e.name && e.name.length > 1)));
await check('log write: an estimated 1RM is stored', () =>
  assert.ok(first.body.data.exercises[0].estimatedOneRepMaxKg > 80));

/* --- progression reacts to the log ------------------------------------ */
const afterOne = await req('GET', '/api/logs/progression/1');
const firstSlug = day1.exercises[0].slug;
const progressed = afterOne.body.data.exercises.find((e) => e.slug === firstSlug);

await check('progression: picks up the logged session', () =>
  assert.equal(progressed.sessionsLogged, 1));
await check('progression: top-of-range performance recommends more load', () =>
  assert.equal(
    progressed.progression.recommendation,
    'increase_load',
    JSON.stringify(progressed.progression),
  ));
await check('progression: suggests a heavier load than was lifted', () =>
  assert.ok(progressed.progression.suggestedWeightKg > 80));
await check('progression: exposes the last session for context', () => {
  assert.ok(progressed.lastSession);
  assert.equal(progressed.lastSession.volumeKg, 2880);
});

/* --- deload after two poor sessions ----------------------------------- */
await req('POST', '/api/logs/workout', buildLog(6, 5, 100));
await req('POST', '/api/logs/workout', buildLog(3, 5, 100));

const afterBad = await req('GET', '/api/logs/progression/1');
const deloading = afterBad.body.data.exercises.find((e) => e.slug === firstSlug);

await check('progression: two poor sessions trigger a deload', () =>
  assert.equal(
    deloading.progression.recommendation,
    'deload',
    JSON.stringify(deloading.progression),
  ));
await check('progression: deload suggests a lighter load', () =>
  assert.ok(deloading.progression.suggestedWeightKg < 100));

/* --- listing and deleting --------------------------------------------- */
const list = await req('GET', '/api/logs/workout?limit=10');
await check('logs list: returns the logged sessions', () =>
  assert.equal(list.body.data.length, 3));
await check('logs list: newest first', () => {
  const dates = list.body.data.map((l) => new Date(l.date).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});

/*
 * The session-history panel on /log renders directly from this response, so the
 * fields it reads are part of the contract. Pinned here because the natural
 * future optimisation — adding a `.select()` to trim the payload — would blank
 * the rows in the UI without failing anything else.
 */
await check('logs list: carries every field the history UI renders', () => {
  const log = list.body.data[0];
  for (const field of ['_id', 'date', 'dayName', 'totalVolumeKg', 'totalSets']) {
    assert.ok(log[field] != null, `missing ${field}`);
  }
  assert.ok(Array.isArray(log.exercises) && log.exercises.length > 0);

  const exercise = log.exercises[0];
  for (const field of ['slug', 'name', 'sets', 'skipped']) {
    assert.ok(exercise[field] != null, `exercise missing ${field}`);
  }
  const set = exercise.sets[0];
  assert.ok(set.reps != null, 'set missing reps');
  assert.ok(set.weightKg != null, 'set missing weightKg');
});

await check('logs list: reports a total so the UI can paginate', () => {
  assert.equal(typeof list.body.meta?.total, 'number');
  assert.ok(list.body.meta.total >= list.body.data.length);
});

const single = await req('GET', `/api/logs/workout/${first.body.data._id}`);
await check('logs: a single log can be fetched', () => assert.equal(single.status, 200));

const badIdLog = await req('GET', '/api/logs/workout/not-an-id');
await check('logs: a malformed log id is rejected', () =>
  assert.equal(badIdLog.status, 400));

/* --- progress check-ins ----------------------------------------------- */
const checkIn = await req('POST', '/api/logs/progress', {
  date: iso(20),
  weightKg: 84,
  measurements: { neckCm: 39, waistCm: 88, chestCm: 104, armCm: 35 },
});
await check('check-in: accepted (201)', () =>
  assert.equal(checkIn.status, 201, JSON.stringify(checkIn.body).slice(0, 200)));
await check('check-in: body fat is estimated from the measurements', () =>
  assert.ok(
    checkIn.body.data.bodyFatPercent > 10 && checkIn.body.data.bodyFatPercent < 35,
    `got ${checkIn.body.data.bodyFatPercent}`,
  ));
await check('check-in: lean and fat mass are derived', () => {
  const d = checkIn.body.data;
  assert.ok(d.leanMassKg > 0 && d.fatMassKg > 0);
  assert.ok(Math.abs(d.leanMassKg + d.fatMassKg - 84) < 0.5);
});
await check('check-in: waist-to-height ratio is computed', () =>
  assert.ok(checkIn.body.data.waistToHeightRatio > 0.4));
await check('check-in: records the height/sex used for the estimate', () => {
  assert.equal(checkIn.body.data.estimatedWith.heightCm, 180);
  assert.equal(checkIn.body.data.estimatedWith.gender, 'male');
});
await check('check-in: syncs the new weight onto the profile', () =>
  assert.equal(checkIn.body.profileWeightUpdated, true));

const profileAfter = await req('GET', '/api/profile');
await check('check-in: profile weight actually changed', () =>
  assert.equal(profileAfter.body.data.profile.weightKg, 84));
await check('check-in: a weigh-in does NOT flag plans stale', () =>
  assert.equal(profileAfter.body.data.planRegeneration.required, false));

/* --- same-day upsert -------------------------------------------------- */
const sameDay = await req('POST', '/api/logs/progress', {
  date: iso(20),
  weightKg: 83.5,
  measurements: { neckCm: 39, waistCm: 87 },
});
const allCheckIns = await req('GET', '/api/logs/progress');
await check('check-in: re-submitting a date updates rather than duplicates', () =>
  assert.equal(allCheckIns.body.data.length, 1));
await check('check-in: the update took effect', () =>
  assert.equal(sameDay.body.data.weightKg, 83.5));

/* --- measurements too sparse for an estimate -------------------------- */
const weightOnly = await req('POST', '/api/logs/progress', {
  date: iso(10),
  weightKg: 83,
});
await check('check-in: weight alone is accepted', () =>
  assert.equal(weightOnly.status, 201));
await check('check-in: body fat is omitted and the reason given', () => {
  assert.equal(weightOnly.body.data.bodyFatPercent, undefined);
  assert.match(weightOnly.body.bodyFatNote ?? '', /neck|waist/i);
});

const nothing = await req('POST', '/api/logs/progress', { date: iso(1) });
await check('check-in: an empty check-in is rejected', () =>
  assert.equal(nothing.status, 400));

const impossible = await req('POST', '/api/logs/progress', {
  date: iso(1),
  weightKg: 900,
});
await check('check-in: an out-of-range weight is rejected', () =>
  assert.equal(impossible.status, 400));

/* --- dashboard -------------------------------------------------------- */
await req('POST', '/api/logs/progress', {
  date: iso(0),
  weightKg: 85,
  measurements: { neckCm: 39, waistCm: 86, chestCm: 106, armCm: 36 },
});

const dash = await req('GET', '/api/logs/dashboard');
await check('dashboard: returns 200', () => assert.equal(dash.status, 200));
await check('dashboard: reports that data exists', () =>
  assert.equal(dash.body.data.hasData, true));
await check('dashboard: body series is oldest-first for charting', () => {
  const dates = dash.body.data.bodySeries.map((p) => p.date);
  assert.deepEqual(dates, [...dates].sort());
});
await check('dashboard: weekly volume has 12 buckets, oldest first', () => {
  const v = dash.body.data.volumeByWeek;
  assert.equal(v.length, 12);
  assert.equal(v[0].weeksAgo, 11);
  assert.equal(v[11].weeksAgo, 0);
});
await check('dashboard: weekly volume totals match the logs', () => {
  const charted = dash.body.data.volumeByWeek.reduce((s, b) => s + b.volumeKg, 0);
  assert.equal(charted, dash.body.data.totals.totalVolumeKg);
});
await check('dashboard: consistency is computed against the plan frequency', () => {
  const c = dash.body.data.consistency;
  assert.equal(c.trainingDaysPerWeek, 3);
  assert.ok(typeof c.streakWeeks === 'number');
  assert.ok(typeof c.adherencePercent === 'number');
});
await check('dashboard: personal records are ranked by estimated 1RM', () => {
  const prs = dash.body.data.personalRecords;
  assert.ok(prs.length > 0);
  const values = prs.map((p) => p.estimatedOneRepMaxKg);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
});
await check('dashboard: totals reflect the number of logs', () => {
  assert.equal(dash.body.data.totals.workoutsLogged, 3);
  assert.equal(dash.body.data.totals.checkInsLogged, 3);
});
await check('dashboard: current weight is the latest check-in', () =>
  assert.equal(dash.body.data.current.weightKg, 85));
await check('dashboard: change is measured from the first check-in', () => {
  // 83.5 → 85 across the series.
  assert.equal(dash.body.data.change.weightKg, 1.5);
  assert.ok(dash.body.data.change.sinceDate);
});
await check('dashboard: reports whether body fat can be estimated', () =>
  assert.equal(dash.body.data.bodyFatInputsAvailable, true));

/* --- deletion --------------------------------------------------------- */
const del = await req('DELETE', `/api/logs/workout/${first.body.data._id}`);
await check('logs: a workout log can be deleted', () => assert.equal(del.status, 200));
const afterDel = await req('GET', '/api/logs/workout');
await check('logs: deletion is reflected in the list', () =>
  assert.equal(afterDel.body.data.length, 2));

/* --- ownership -------------------------------------------------------- */
const otherEmail = 'fitgen-logs-other@example.com';
await User.deleteMany({ email: otherEmail });
const other = await User.create({
  googleId: 'google-logs-other',
  email: otherEmail,
  name: 'Other',
});
const { signToken } = await import('../src/utils/jwt.js');
const stolen = await fetch(`${base}/api/logs/workout/${afterDel.body.data[0]._id}`, {
  headers: { Authorization: `Bearer ${signToken(other)}` },
});
await check('logs: another user cannot read this log (404)', () =>
  assert.equal(stolen.status, 404));
await User.deleteMany({ email: otherEmail });

/* --- auth ------------------------------------------------------------- */
const saved = token;
token = null;
const unauth = await req('GET', '/api/logs/dashboard');
await check('logs: endpoints require auth (401)', () => assert.equal(unauth.status, 401));
token = saved;

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await cleanup();
server.close();
await disconnectDB();
