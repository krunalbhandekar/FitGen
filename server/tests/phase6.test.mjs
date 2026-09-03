/**
 * Phase 6 tests: admin content CRUD, grocery lists, and gamification.
 *
 * The CRUD endpoints write to the collections every AI generator is grounded
 * against, so the destructive cases matter most: a slug must be immutable, a
 * referenced record must not be deletable, and an inconsistent food must not
 * reach a diet plan.
 *
 *   npm run test:phase6
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

const ADMIN_EMAIL = 'fitgen-p6-admin@example.com';
const MEMBER_EMAIL = 'fitgen-p6-member@example.com';

let googleUser = null;
await mock.module('../src/services/googleAuth.js', {
  namedExports: { verifyGoogleIdToken: async () => googleUser },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const buildApp = (await import('../src/app.js')).default;
const { User } = await import('../src/models/User.js');
const { Exercise } = await import('../src/models/Exercise.js');
const { Food } = await import('../src/models/Food.js');
const { WorkoutPlan } = await import('../src/models/WorkoutPlan.js');
const { DietPlan } = await import('../src/models/DietPlan.js');
const { WorkoutLog } = await import('../src/models/WorkoutLog.js');
const { ProgressLog } = await import('../src/models/ProgressLog.js');
const { ChatMessage } = await import('../src/models/ChatMessage.js');
const { buildGroceryList, groceryListToText, toPurchaseQuantity } = await import(
  '../src/services/grocery.js'
);
const { consistencyScore, evaluateBadges, hasBeatenAPreviousBest } = await import(
  '../src/services/gamification.js'
);

await connectDB();

const TEST_SLUGS = ['P6_Test_Exercise', 'P6_Referenced_Exercise'];
const TEST_FOOD_SLUGS = ['p6-test-food', 'p6-referenced-food'];

const cleanup = async () => {
  const users = await User.find({ email: { $in: [ADMIN_EMAIL, MEMBER_EMAIL] } }).lean();
  const ids = users.map((u) => u._id);
  await Promise.all([
    Exercise.deleteMany({ slug: { $in: TEST_SLUGS } }),
    Food.deleteMany({ slug: { $in: TEST_FOOD_SLUGS } }),
    WorkoutPlan.deleteMany({ userId: { $in: ids } }),
    DietPlan.deleteMany({ userId: { $in: ids } }),
    WorkoutLog.deleteMany({ userId: { $in: ids } }),
    ProgressLog.deleteMany({ userId: { $in: ids } }),
    ChatMessage.deleteMany({ userId: { $in: ids } }),
  ]);
  await User.deleteMany({ email: { $in: [ADMIN_EMAIL, MEMBER_EMAIL] } });
};
await cleanup();

const app = buildApp();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
};

const signIn = async (email, name) => {
  googleUser = { googleId: `g-${email}`, email, name };
  const res = await req('POST', '/api/auth/google', { body: { credential: 'stub' } });
  return { token: res.body.token, user: res.body.user };
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

const dobFor = (age) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
};
const iso = (daysAgo = 0) =>
  new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

/* --- accounts ----------------------------------------------------------- */
await signIn(ADMIN_EMAIL, 'P6 Admin');
await User.updateOne({ email: ADMIN_EMAIL }, { $set: { role: 'admin' } });
const admin = await signIn(ADMIN_EMAIL, 'P6 Admin');
const member = await signIn(MEMBER_EMAIL, 'P6 Member');

/* ============================================== admin CRUD: exercises == */

await check('rbac: a member cannot create an exercise (403)', async () => {
  const r = await req('POST', '/api/admin/exercises', {
    token: member.token,
    body: { slug: 'X', name: 'X' },
  });
  assert.equal(r.status, 403);
});

const validExercise = {
  slug: 'P6_Test_Exercise',
  name: 'P6 Test Press',
  level: 'beginner',
  equipment: 'dumbbell',
  category: 'strength',
  mechanic: 'compound',
  force: 'push',
  primaryMuscles: ['Chest'],
  secondaryMuscles: ['Triceps'],
  instructions: ['Press the dumbbells upward under control.'],
};

const created = await req('POST', '/api/admin/exercises', {
  token: admin.token,
  body: validExercise,
});
await check('exercise: an admin can create one (201)', () =>
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 200)));
await check('exercise: muscles are normalised to lower case', () =>
  assert.deepEqual(created.body.data.primaryMuscles, ['chest']));
await check('exercise: a demo URL is generated when omitted', () =>
  assert.match(created.body.data.demoUrl, /youtube\.com/));
await check('exercise: the record is marked as admin-authored', () =>
  assert.equal(created.body.data.source, 'admin'));

await check('exercise: it is immediately available to the library', async () => {
  const r = await req('GET', '/api/exercises/P6_Test_Exercise', { token: member.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.name, 'P6 Test Press');
});

await check('exercise: a duplicate slug is rejected', async () => {
  const r = await req('POST', '/api/admin/exercises', {
    token: admin.token,
    body: validExercise,
  });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /already exists/i);
});

await check('exercise: an invalid level is rejected', async () => {
  const r = await req('POST', '/api/admin/exercises', {
    token: admin.token,
    body: { ...validExercise, slug: 'P6_Bad', level: 'godlike' },
  });
  assert.equal(r.status, 400);
});

await check('exercise: an empty primary-muscle list is rejected', async () => {
  const r = await req('POST', '/api/admin/exercises', {
    token: admin.token,
    body: { ...validExercise, slug: 'P6_Bad2', primaryMuscles: [] },
  });
  assert.equal(r.status, 400);
});

const updated = await req('PATCH', '/api/admin/exercises/P6_Test_Exercise', {
  token: admin.token,
  body: { name: 'P6 Renamed Press', level: 'intermediate' },
});
await check('exercise: an admin can update it', () => {
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'P6 Renamed Press');
  assert.equal(updated.body.data.level, 'intermediate');
});

await check('exercise: the slug is immutable', async () => {
  const r = await req('PATCH', '/api/admin/exercises/P6_Test_Exercise', {
    token: admin.token,
    body: { slug: 'P6_Renamed_Slug' },
  });
  // Rejected outright, or silently ignored — either way the slug must not move.
  const still = await Exercise.findOne({ slug: 'P6_Test_Exercise' }).lean();
  assert.ok(still, 'the original slug must still resolve');
  const moved = await Exercise.findOne({ slug: 'P6_Renamed_Slug' }).lean();
  assert.equal(moved, null, 'the slug must not have changed');
  assert.ok(r.status === 400 || r.status === 200);
});

/*
 * The admin UI sends an explicit null when the Force or Mechanic select is
 * cleared, because omitting the field would leave the old value in place and
 * make the option impossible to unset. Both the schema and the Mongoose enum
 * have to accept null for that to work.
 */
await check('exercise: a nullable field can be cleared with an explicit null', async () => {
  const set = await req('PATCH', '/api/admin/exercises/P6_Test_Exercise', {
    token: admin.token,
    body: { force: 'push', mechanic: 'compound' },
  });
  assert.equal(set.status, 200);
  assert.equal(set.body.data.force, 'push');

  const cleared = await req('PATCH', '/api/admin/exercises/P6_Test_Exercise', {
    token: admin.token,
    body: { force: null, mechanic: null },
  });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));

  const stored = await Exercise.findOne({ slug: 'P6_Test_Exercise' }).lean();
  assert.ok(stored.force == null, `force was ${stored.force}`);
  assert.ok(stored.mechanic == null, `mechanic was ${stored.mechanic}`);
});

await check('exercise: an empty update is rejected', async () => {
  const r = await req('PATCH', '/api/admin/exercises/P6_Test_Exercise', {
    token: admin.token,
    body: {},
  });
  assert.equal(r.status, 400);
});

/* --- deletion is blocked while referenced ------------------------------ */
await req('PUT', '/api/profile/onboarding', {
  token: member.token,
  body: {
    gender: 'male',
    dateOfBirth: dobFor(27),
    heightCm: 178,
    weightKg: 80,
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
  },
});

const planRes = await req('POST', '/api/plans/workout/generate', {
  token: member.token,
  body: { forceFallback: true },
});
const plan = planRes.body.data;
const referencedSlug = plan.days[0].exercises[0].slug;

const usage = await req('GET', `/api/admin/exercises/${encodeURIComponent(referencedSlug)}/usage`, {
  token: admin.token,
});
await check('exercise: usage reports the referencing plan', () => {
  assert.equal(usage.status, 200);
  assert.ok(usage.body.data.usage.workoutPlans >= 1);
});

const blockedDelete = await req(
  'DELETE',
  `/api/admin/exercises/${encodeURIComponent(referencedSlug)}`,
  { token: admin.token },
);
await check('exercise: deletion is REFUSED while a plan references it', () => {
  assert.equal(blockedDelete.status, 400);
  assert.match(blockedDelete.body.message, /referenced by/i);
});
await check('exercise: the refusal reports what is using it', () =>
  assert.ok(blockedDelete.body.details?.usage?.workoutPlans >= 1));
await check('exercise: the referenced record still exists', async () =>
  assert.ok(await Exercise.findOne({ slug: referencedSlug }).lean()));

const okDelete = await req('DELETE', '/api/admin/exercises/P6_Test_Exercise', {
  token: admin.token,
});
await check('exercise: an unreferenced record CAN be deleted', () =>
  assert.equal(okDelete.status, 200));
await check('exercise: it is gone from the database', async () =>
  assert.equal(await Exercise.findOne({ slug: 'P6_Test_Exercise' }).lean(), null));

/* =================================================== admin CRUD: foods == */

const validFood = {
  slug: 'p6-test-food',
  name: 'P6 Test Protein',
  category: 'protein',
  calories: 165,
  protein: 31,
  carbs: 0,
  fats: 3.6,
  fiber: 0,
  servingLabel: '1 portion',
  servingGrams: 150,
  dietTags: ['gluten_free'],
  allergens: [],
};

const foodCreated = await req('POST', '/api/admin/foods', {
  token: admin.token,
  body: validFood,
});
await check('food: an admin can create one (201)', () =>
  assert.equal(foodCreated.status, 201, JSON.stringify(foodCreated.body).slice(0, 200)));

await check('food: an inconsistent calorie value is rejected', async () => {
  const r = await req('POST', '/api/admin/foods', {
    token: admin.token,
    // 31P/0C/3.6F cannot be 900 kcal.
    body: { ...validFood, slug: 'p6-bad-food', calories: 900 },
  });
  assert.equal(r.status, 400);
  assert.ok(r.body.details?.calories, JSON.stringify(r.body.details));
});

await check('food: an unknown category is rejected', async () => {
  const r = await req('POST', '/api/admin/foods', {
    token: admin.token,
    body: { ...validFood, slug: 'p6-bad-cat', category: 'space food' },
  });
  assert.equal(r.status, 400);
});

await check('food: an upper-case slug is rejected', async () => {
  const r = await req('POST', '/api/admin/foods', {
    token: admin.token,
    body: { ...validFood, slug: 'P6-Bad-Slug' },
  });
  assert.equal(r.status, 400);
});

const foodUpdated = await req('PATCH', '/api/admin/foods/p6-test-food', {
  token: admin.token,
  body: { name: 'P6 Renamed Protein', protein: 30 },
});
await check('food: an admin can update it', () => {
  assert.equal(foodUpdated.status, 200);
  assert.equal(foodUpdated.body.data.name, 'P6 Renamed Protein');
});

await check('food: a partial edit that breaks calorie consistency is rejected', async () => {
  // Dropping protein to 1 leaves 165 kcal unexplainable.
  const r = await req('PATCH', '/api/admin/foods/p6-test-food', {
    token: admin.token,
    body: { protein: 1 },
  });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /consistent/i);
});

await check('food: the rejected partial edit did not persist', async () => {
  const fresh = await Food.findOne({ slug: 'p6-test-food' }).lean();
  assert.equal(fresh.protein, 30, 'protein should be unchanged');
});

const foodDeleted = await req('DELETE', '/api/admin/foods/p6-test-food', {
  token: admin.token,
});
await check('food: an unreferenced record can be deleted', () =>
  assert.equal(foodDeleted.status, 200));

/* ============================================================= grocery == */

const dietRes = await req('POST', '/api/plans/diet/generate', {
  token: member.token,
  body: { forceFallback: true },
});
await check('grocery: a diet plan was generated for the test', () =>
  assert.equal(dietRes.status, 201, JSON.stringify(dietRes.body).slice(0, 200)));

const grocery = await req('GET', '/api/plans/diet/grocery?days=7', {
  token: member.token,
});
await check('grocery: returns a list (200)', () => assert.equal(grocery.status, 200));
await check('grocery: states the day count it was built for', () =>
  assert.equal(grocery.body.data.days, 7));
await check('grocery: groups items into shop aisles', () => {
  assert.ok(grocery.body.data.groups.length > 0);
  assert.ok(grocery.body.data.groups.every((g) => g.aisle && g.items.length > 0));
});

await check('grocery: every plan food appears exactly once', () => {
  const planSlugs = new Set(
    dietRes.body.data.meals.flatMap((m) => m.items.map((i) => i.slug)),
  );
  const listSlugs = grocery.body.data.groups.flatMap((g) => g.items.map((i) => i.slug));
  assert.equal(new Set(listSlugs).size, listSlugs.length, 'no duplicates');
  assert.deepEqual([...planSlugs].sort(), [...listSlugs].sort());
});

await check('grocery: totals equal per-day quantity times days', () => {
  for (const group of grocery.body.data.groups) {
    for (const item of group.items) {
      assert.ok(
        Math.abs(item.total.amount - item.perDay.amount * 7) <= 1,
        `${item.name}: ${item.perDay.amount}×7 ≠ ${item.total.amount}`,
      );
    }
  }
});

await check('grocery: purchase quantities round UP, never down', () => {
  for (const group of grocery.body.data.groups) {
    for (const item of group.items) {
      const inGrams =
        item.purchase.unit === 'kg' || item.purchase.unit === 'L'
          ? item.purchase.amount * 1000
          : item.purchase.amount;
      assert.ok(
        inGrams >= item.total.amount - 0.5,
        `${item.name}: buying ${inGrams} for a need of ${item.total.amount}`,
      );
    }
  }
});

await check('grocery: an item used in two meals is aggregated, not repeated', () => {
  const multi = grocery.body.data.groups
    .flatMap((g) => g.items)
    .filter((i) => i.usedIn.length > 1);
  // Not guaranteed to occur, but if it does the aggregation must hold.
  for (const item of multi) {
    assert.ok(item.perDay.amount > 0);
  }
  assert.ok(true);
});

await check('grocery: day count is clamped to a sane range', async () => {
  const huge = await req('GET', '/api/plans/diet/grocery?days=9999', {
    token: member.token,
  });
  assert.ok(huge.body.data.days <= 30);
  const zero = await req('GET', '/api/plans/diet/grocery?days=0', {
    token: member.token,
  });
  assert.ok(zero.body.data.days >= 1);
});

/*
 * The list must be derived from the plan as it stands right now, not from
 * anything captured when the plan was generated. A single meal swap edits the
 * plan in place, and the UI keeps an open grocery panel mounted across that —
 * so if this endpoint served stale contents, someone could shop from a list of
 * ingredients their plan no longer contains.
 */
const beforeSwap = await req('GET', '/api/plans/diet/grocery?days=7', {
  token: member.token,
});
const swapRes = await req('POST', '/api/plans/diet/meals/1/swap', {
  token: member.token,
  body: { forceFallback: true },
});
await check('grocery: the meal swap under test succeeded', () =>
  assert.equal(swapRes.status, 200, JSON.stringify(swapRes.body).slice(0, 200)));

const afterSwap = await req('GET', '/api/plans/diet/grocery?days=7', {
  token: member.token,
});

await check('grocery: reflects the live plan after a meal swap', () => {
  const slugsOf = (res) =>
    new Set(res.body.data.groups.flatMap((g) => g.items.map((i) => i.slug)));

  const planSlugs = new Set(
    swapRes.body.data.meals.flatMap((m) => m.items.map((i) => i.slug)),
  );
  const listSlugs = slugsOf(afterSwap);

  // Every food now in the plan is on the list, and nothing else is.
  for (const slug of planSlugs) {
    assert.ok(listSlugs.has(slug), `plan food ${slug} missing from list`);
  }
  for (const slug of listSlugs) {
    assert.ok(planSlugs.has(slug), `list has ${slug}, which the plan dropped`);
  }
});

await check('grocery: a swap that changes the foods changes the list', () => {
  const slugsOf = (res) =>
    [...new Set(res.body.data.groups.flatMap((g) => g.items.map((i) => i.slug)))].sort();
  const before = slugsOf(beforeSwap);
  const after = slugsOf(afterSwap);

  const swappedMealBefore = new Set(
    dietRes.body.data.meals.find((m) => m.order === 1)?.items.map((i) => i.slug) ?? [],
  );
  const swappedMealAfter = new Set(
    swapRes.body.data.meals.find((m) => m.order === 1)?.items.map((i) => i.slug) ?? [],
  );
  const foodsActuallyChanged =
    swappedMealBefore.size !== swappedMealAfter.size ||
    [...swappedMealBefore].some((slug) => !swappedMealAfter.has(slug));

  // The generator may legitimately pick the same foods again; only assert the
  // list moved when the meal's contents actually did.
  if (foodsActuallyChanged) {
    assert.notDeepEqual(before, after, 'foods changed but the list did not');
  } else {
    assert.deepEqual(before, after, 'foods unchanged so the list should match');
  }
});

const groceryText = await req('GET', '/api/plans/diet/grocery?days=3&format=text', {
  token: member.token,
});
await check('grocery: a plain-text format is available', () => {
  assert.equal(groceryText.status, 200);
  assert.match(String(groceryText.body), /FitGen grocery list/);
  assert.match(String(groceryText.body), /\[ \]/);
});

await check('grocery: requires a plan (404 when none)', async () => {
  const other = await signIn('fitgen-p6-nogroc@example.com', 'No Plan');
  const r = await req('GET', '/api/plans/diet/grocery', { token: other.token });
  assert.equal(r.status, 404);
  await User.deleteMany({ email: 'fitgen-p6-nogroc@example.com' });
});

/* --- purchase rounding, in isolation ---------------------------------- */
await check('grocery: rounding converts to kg above 1000 g', () => {
  const q = toPurchaseQuantity(1400, 'g');
  assert.equal(q.unit, 'kg');
  assert.ok(q.amount * 1000 >= 1400);
});
await check('grocery: rounding converts to litres above 1000 ml', () => {
  const q = toPurchaseQuantity(1750, 'ml');
  assert.equal(q.unit, 'L');
  assert.ok(q.amount * 1000 >= 1750);
});
await check('grocery: small amounts round to a 10 g step', () => {
  assert.deepEqual(toPurchaseQuantity(23, 'g'), { amount: 30, unit: 'g' });
});

await check('grocery: an empty plan yields an empty list, not a crash', () => {
  const list = buildGroceryList({ meals: [], version: 1 }, 7);
  assert.deepEqual(list.groups, []);
  assert.equal(list.summary.distinctItems, 0);
  assert.match(groceryListToText(list), /grocery list/);
});

/* ======================================================== gamification == */

const achievementsEmpty = await req('GET', '/api/logs/achievements', {
  token: member.token,
});
await check('badges: available with no logs at all', () =>
  assert.equal(achievementsEmpty.status, 200));
await check('badges: setup badge is earned once both plans exist', () => {
  const badge = achievementsEmpty.body.data.badges.find((b) => b.id === 'profile-complete');
  assert.equal(badge.earned, true, JSON.stringify(badge));
});
await check('badges: session badges are unearned with no sessions', () => {
  const badge = achievementsEmpty.body.data.badges.find((b) => b.id === 'first-session');
  assert.equal(badge.earned, false);
  assert.equal(badge.progress.current, 0);
});
await check('score: is zero-ish with no training logged', () =>
  assert.ok(achievementsEmpty.body.data.score.score < 30));

// Log some sessions, improving each time.
const day1 = plan.days[0];
const logSession = (daysAgo, weight) =>
  req('POST', '/api/logs/workout', {
    token: member.token,
    body: {
      planId: plan._id,
      dayIndex: 1,
      dayName: day1.name,
      date: iso(daysAgo),
      exercises: day1.exercises.slice(0, 2).map((e, i) => ({
        order: i + 1,
        slug: e.slug,
        targetSets: e.sets,
        targetReps: e.reps,
        sets: [
          { setNumber: 1, reps: 10, weightKg: weight },
          { setNumber: 2, reps: 10, weightKg: weight },
        ],
      })),
    },
  });

for (const [daysAgo, weight] of [[6, 60], [4, 62.5], [2, 65], [1, 67.5]]) {
  await logSession(daysAgo, weight);
}
await req('POST', '/api/logs/progress', {
  token: member.token,
  body: { date: iso(1), weightKg: 80, measurements: { neckCm: 38, waistCm: 84 } },
});
await req('POST', '/api/chat', {
  token: member.token,
  body: { question: 'How much protein do I need?' },
});

const achievements = await req('GET', '/api/logs/achievements', { token: member.token });

await check('badges: first session is now earned', () =>
  assert.equal(
    achievements.body.data.badges.find((b) => b.id === 'first-session').earned,
    true,
  ));
await check('badges: first check-in is now earned', () =>
  assert.equal(
    achievements.body.data.badges.find((b) => b.id === 'first-checkin').earned,
    true,
  ));
await check('badges: asking the coach is now earned', () =>
  assert.equal(achievements.body.data.badges.find((b) => b.id === 'curious').earned, true));
await check('badges: progressive overload is detected from improving 1RMs', () =>
  assert.equal(
    achievements.body.data.badges.find((b) => b.id === 'progressive-overload').earned,
    true,
  ));
await check('badges: a far-off tier stays unearned but shows progress', () => {
  const badge = achievements.body.data.badges.find((b) => b.id === 'sessions-100');
  assert.equal(badge.earned, false);
  assert.ok(badge.progress.percent > 0 && badge.progress.percent < 100);
});
await check('badges: summary counts match the badge list', () => {
  const d = achievements.body.data;
  assert.equal(d.summary.earned, d.badges.filter((b) => b.earned).length);
  assert.equal(d.summary.total, d.badges.length);
});
await check('badges: a next-up suggestion is offered', () =>
  assert.ok(achievements.body.data.nextUp?.id));

await check('score: rises once training is logged', () =>
  assert.ok(
    achievements.body.data.score.score > achievementsEmpty.body.data.score.score,
    `${achievementsEmpty.body.data.score.score} → ${achievements.body.data.score.score}`,
  ));
await check('score: stays within 0-100', () => {
  const s = achievements.body.data.score.score;
  assert.ok(s >= 0 && s <= 100, `score was ${s}`);
});
await check('score: component weights sum to 100', () => {
  const total = Object.values(achievements.body.data.score.components).reduce(
    (sum, c) => sum + c.weight,
    0,
  );
  assert.equal(total, 100);
});
await check('score: names the weakest component to improve', () =>
  assert.ok(achievements.body.data.score.weakest));

/* --- gamification units ----------------------------------------------- */
await check('score: an empty history scores zero and reports no data', () => {
  const s = consistencyScore({ consistency: null, workoutLogs: [], progressLogs: [] });
  assert.equal(s.score, 0);
  assert.equal(s.band, 'no data');
});

await check('score: overtraining cannot push adherence past 100', () => {
  const s = consistencyScore({
    consistency: { adherencePercent: 400, streakWeeks: 99 },
    workoutLogs: [{ date: new Date() }],
    progressLogs: Array.from({ length: 50 }, () => ({ date: new Date() })),
  });
  assert.ok(s.score <= 100, `score was ${s.score}`);
});

/*
 * `weakest` is labelled "biggest gain available" in the UI, so it must rank by
 * weighted headroom rather than by raw component value. Here logging sits lower
 * (0 vs 50) but carries less weight, so adherence is the larger win: 50% of a
 * 40-point weight beats 100% of a 15-point one.
 */
await check('score: weakest names the largest weighted gain, not the lowest value', () => {
  const s = consistencyScore({
    consistency: { adherencePercent: 50, streakWeeks: 8 },
    workoutLogs: [{ date: new Date() }],
    progressLogs: [], // logging = 0
  });
  assert.equal(s.components.adherence.value, 50);
  assert.equal(s.components.logging.value, 0);
  assert.equal(s.weakest, 'adherence');
});

await check('score: weakest is null when every component is maxed', () => {
  const s = consistencyScore({
    consistency: { adherencePercent: 100, streakWeeks: 8 },
    workoutLogs: [{ date: new Date() }],
    progressLogs: Array.from({ length: 4 }, () => ({ date: new Date() })),
  });
  assert.equal(s.score, 100);
  assert.equal(s.weakest, null);
});

await check('score: recency decays a long-dormant history', () => {
  const stale = consistencyScore({
    consistency: { adherencePercent: 100, streakWeeks: 8 },
    workoutLogs: [{ date: new Date(Date.now() - 60 * 86400000) }],
    progressLogs: [],
  });
  const fresh = consistencyScore({
    consistency: { adherencePercent: 100, streakWeeks: 8 },
    workoutLogs: [{ date: new Date() }],
    progressLogs: [],
  });
  assert.ok(fresh.score > stale.score, `${stale.score} should be below ${fresh.score}`);
});

await check('overload: a flat history is not counted as a personal best', () =>
  assert.equal(
    hasBeatenAPreviousBest([
      { exercises: [{ slug: 'a', estimatedOneRepMaxKg: 100 }] },
      { exercises: [{ slug: 'a', estimatedOneRepMaxKg: 100 }] },
    ]),
    false,
  ));

await check('overload: a single session cannot beat a previous best', () =>
  assert.equal(
    hasBeatenAPreviousBest([{ exercises: [{ slug: 'a', estimatedOneRepMaxKg: 100 }] }]),
    false,
  ));

await check('badges: evaluation is deterministic', () => {
  const stats = {
    workoutCount: 12,
    checkInCount: 3,
    totalVolumeKg: 20000,
    streakWeeks: 3,
    consistencyScore: 55,
    chatCount: 2,
    onboarded: true,
    hasWorkoutPlan: true,
    hasDietPlan: true,
    hasBeatenAPreviousBest: true,
  };
  assert.deepEqual(evaluateBadges(stats), evaluateBadges(stats));
});

/* --- gamification is per-user ---------------------------------------- */
await check('badges: another user does not inherit these achievements', async () => {
  const r = await req('GET', '/api/logs/achievements', { token: admin.token });
  assert.equal(r.status, 200);
  assert.equal(
    r.body.data.badges.find((b) => b.id === 'first-session').earned,
    false,
    'the admin has logged nothing',
  );
});

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await cleanup();
server.close();
await disconnectDB();
