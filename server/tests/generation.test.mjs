/**
 * Phase 3 generation tests.
 *
 * Runs BOTH engines twice: once with the deterministic fallback forced, and
 * once against the live Groq API (skipped automatically when GROQ_API_KEY is
 * unset). The grounding assertions are the important ones — every slug a plan
 * contains must exist in the seeded database.
 *
 *   npm run test:generation
 */
import assert from 'node:assert/strict';

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { Exercise } = await import('../src/models/Exercise.js');
const { Food } = await import('../src/models/Food.js');
const { generateWorkoutPlan } = await import('../src/services/workoutGenerator.js');
const { generateDietPlan, mealTemplateFor, scaleToTargets, computeItem } =
  await import('../src/services/dietGenerator.js');
const { calculateTargets } = await import('../src/services/fitnessCalc.js');
const { isGroqConfigured } = await import('../src/services/groqClient.js');
const { assessExercise, filterByInjuries } = await import('../src/services/injuryRules.js');
const { buildSchedule } = await import('../src/services/splitTemplates.js');

await connectDB();

const results = [];
/**
 * Awaits `fn` so async assertions are genuinely enforced. An earlier version
 * called fn() without awaiting, which made every async check report PASS
 * regardless of outcome — including the grounding checks that matter most.
 */
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
};

const dobForAge = (age) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString();
};

const profile = {
  gender: 'male',
  dateOfBirth: dobForAge(24),
  heightCm: 178,
  weightKg: 82,
  goal: 'build_muscle',
  targetWeightKg: 86,
  activityLevel: 'moderate',
  trainingDaysPerWeek: 5,
  preferredSplit: 'ppl',
  availableEquipment: ['barbell', 'dumbbell', 'cable', 'body only', 'machine'],
  dietType: 'vegetarian',
  allergies: ['peanuts'],
  dislikedFoods: [],
  mealsPerDay: 4,
  injuries: [{ area: 'knee', severity: 'severe' }],
};

/* ================================================================= units == */

/* --- split scheduling --------------------------------------------------- */
await check('schedule: PPL over 6 days repeats the cycle twice', () => {
  const { days } = buildSchedule('ppl', 6);
  assert.equal(days.length, 6);
  assert.deepEqual(days.map((d) => d.key), ['push', 'pull', 'legs', 'push', 'pull', 'legs']);
});

await check('schedule: PPL with too few days falls back to full body', () => {
  const { days, note } = buildSchedule('ppl', 2);
  assert.equal(days.length, 2);
  assert.ok(days.every((d) => d.key === 'full_body'));
  assert.ok(note, 'expected an explanatory note');
});

await check('schedule: day count always matches the request', () => {
  for (const split of ['ppl', 'upper_lower', 'bro_split', 'full_body']) {
    for (let d = 1; d <= 7; d += 1) {
      assert.equal(buildSchedule(split, d).days.length, d, `${split}/${d}`);
    }
  }
});

/* --- injury rules ------------------------------------------------------- */
await check('injury: severe knee blocks a quad-primary exercise', () => {
  const verdict = assessExercise(
    { primaryMuscles: ['quadriceps'], secondaryMuscles: [], mechanic: 'compound', equipment: 'barbell' },
    { area: 'knee', severity: 'severe' },
  );
  assert.equal(verdict.blocked, true);
});

await check('injury: mild knee allows it but attaches a caution', () => {
  const verdict = assessExercise(
    { primaryMuscles: ['quadriceps'], secondaryMuscles: [], mechanic: 'isolation', equipment: 'machine' },
    { area: 'knee', severity: 'mild' },
  );
  assert.equal(verdict.blocked, false);
  assert.ok(verdict.caution);
});

await check('injury: moderate blocks primary but permits secondary', () => {
  const asPrimary = assessExercise(
    { primaryMuscles: ['quadriceps'], secondaryMuscles: [] },
    { area: 'knee', severity: 'moderate' },
  );
  const asSecondary = assessExercise(
    { primaryMuscles: ['chest'], secondaryMuscles: ['quadriceps'] },
    { area: 'knee', severity: 'moderate' },
  );
  assert.equal(asPrimary.blocked, true);
  assert.equal(asSecondary.blocked, false);
});

await check('injury: severe lower back blocks barbell compounds (axial load)', () => {
  const verdict = assessExercise(
    { primaryMuscles: ['chest'], secondaryMuscles: [], mechanic: 'compound', equipment: 'barbell' },
    { area: 'lower_back', severity: 'severe' },
  );
  assert.equal(verdict.blocked, true);
});

await check('injury: an unrelated exercise is untouched', () => {
  const verdict = assessExercise(
    { primaryMuscles: ['biceps'], secondaryMuscles: [], mechanic: 'isolation', equipment: 'dumbbell' },
    { area: 'knee', severity: 'severe' },
  );
  assert.equal(verdict.blocked, false);
  assert.equal(verdict.caution, undefined);
});

await check('injury: no injuries means nothing is filtered', () => {
  const list = [{ slug: 'a', primaryMuscles: ['quadriceps'] }];
  const { safe, blocked } = filterByInjuries(list, []);
  assert.equal(safe.length, 1);
  assert.equal(blocked.length, 0);
});

/* --- meal templates ----------------------------------------------------- */
await check('meals: template shares sum to 1', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const sum = mealTemplateFor(count).reduce((s, m) => s + m.share, 0);
    assert.ok(Math.abs(sum - 1) < 0.001, `${count} meals summed to ${sum}`);
  }
});

await check('meals: template length matches meals per day', () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8]) {
    assert.equal(mealTemplateFor(count).length, count);
  }
});

/* --- protein overshoot correction --------------------------------------- */
await check('scaling: trims protein when the plan overshoots badly', async () => {
  const whey = await Food.findOne({ slug: 'whey-protein-isolate' }).lean();
  const rice = await Food.findOne({ slug: 'white-rice-cooked' }).lean();
  const oil = await Food.findOne({ slug: 'olive-oil' }).lean();
  assert.ok(whey && rice && oil, 'seed data missing');

  const foodsBySlug = new Map([[whey.slug, whey], [rice.slug, rice], [oil.slug, oil]]);
  // Deliberately protein-heavy: 300g of isolate is ~240g protein.
  const meals = [
    {
      name: 'Lunch',
      share: 1,
      items: [computeItem(whey, 300), computeItem(rice, 100), computeItem(oil, 10)],
    },
  ];

  const targets = { calories: 2200, macros: { protein: 140, carbs: 250, fats: 60 } };
  const { totals, notes } = scaleToTargets(meals, foodsBySlug, targets);

  const overshoot = (totals.protein - targets.macros.protein) / targets.macros.protein;
  assert.ok(
    overshoot <= 0.15,
    `protein still ${totals.protein}g against a ${targets.macros.protein}g target (+${(overshoot * 100).toFixed(0)}%)`,
  );
  assert.ok(notes.some((n) => /trimmed|reduced/i.test(n)), 'expected the trim to be disclosed');
});

await check('scaling: discloses when few foods cannot hit both targets', async () => {
  // Only three foods: trimming the whey removes calories that 600 g of rice
  // plus oil cannot replace. Physically impossible, so it must be reported.
  const whey = await Food.findOne({ slug: 'whey-protein-isolate' }).lean();
  const rice = await Food.findOne({ slug: 'white-rice-cooked' }).lean();
  const oil = await Food.findOne({ slug: 'olive-oil' }).lean();
  const foodsBySlug = new Map([[whey.slug, whey], [rice.slug, rice], [oil.slug, oil]]);
  const meals = [
    {
      name: 'Lunch',
      share: 1,
      items: [computeItem(whey, 300), computeItem(rice, 100), computeItem(oil, 10)],
    },
  ];
  const { totals, notes } = scaleToTargets(meals, foodsBySlug, {
    calories: 2200,
    macros: { protein: 140, carbs: 250, fats: 60 },
  });

  if (totals.calories < 2200 * 0.95) {
    assert.ok(
      notes.some((n) => /under target/i.test(n)),
      `calories came to ${totals.calories} with no disclosure: ${JSON.stringify(notes)}`,
    );
  }
});

await check('scaling: trimming protein keeps calories on target (realistic spread)', async () => {
  // A realistic day: protein spread across meals with genuine carb/fat sources
  // to absorb the calories the trim releases.
  const [whey, rice, oats, broccoli, oil] = await Promise.all([
    Food.findOne({ slug: 'whey-protein-isolate' }).lean(),
    Food.findOne({ slug: 'white-rice-cooked' }).lean(),
    Food.findOne({ slug: 'rolled-oats-dry' }).lean(),
    Food.findOne({ slug: 'broccoli' }).lean(),
    Food.findOne({ slug: 'olive-oil' }).lean(),
  ]);
  const foodsBySlug = new Map(
    [whey, rice, oats, broccoli, oil].map((f) => [f.slug, f]),
  );
  const meals = [
    { name: 'Breakfast', share: 0.3, items: [computeItem(whey, 40), computeItem(oats, 80)] },
    {
      name: 'Lunch',
      share: 0.4,
      items: [computeItem(whey, 60), computeItem(rice, 200), computeItem(broccoli, 150)],
    },
    {
      name: 'Dinner',
      share: 0.3,
      items: [computeItem(whey, 50), computeItem(rice, 150), computeItem(oil, 15)],
    },
  ];

  const targets = { calories: 2200, macros: { protein: 140, carbs: 250, fats: 60 } };
  const { totals } = scaleToTargets(meals, foodsBySlug, targets);

  const calorieDrift = Math.abs(totals.calories - targets.calories) / targets.calories;
  const proteinDrift = (totals.protein - targets.macros.protein) / targets.macros.protein;

  assert.ok(calorieDrift <= 0.05, `calories drifted ${(calorieDrift * 100).toFixed(1)}%`);
  assert.ok(proteinDrift <= 0.15, `protein over by ${(proteinDrift * 100).toFixed(0)}%`);
});

await check('scaling: a protein SHORTFALL is still raised, not trimmed', async () => {
  const rice = await Food.findOne({ slug: 'white-rice-cooked' }).lean();
  const paneer = await Food.findOne({ slug: 'paneer-full-fat' }).lean();
  const foodsBySlug = new Map([[rice.slug, rice], [paneer.slug, paneer]]);
  const meals = [
    { name: 'Lunch', share: 1, items: [computeItem(rice, 300), computeItem(paneer, 50)] },
  ];
  const before = meals[0].items.reduce((s, i) => s + i.protein, 0);
  const targets = { calories: 1800, macros: { protein: 140, carbs: 200, fats: 50 } };
  const { totals } = scaleToTargets(meals, foodsBySlug, targets);
  assert.ok(totals.protein > before, `protein went ${before} -> ${totals.protein}`);
});

/* --- portion scaling ---------------------------------------------------- */
await check('scaling: moves daily calories toward the target', async () => {
  const rice = await Food.findOne({ slug: 'white-rice-cooked' }).lean();
  const paneer = await Food.findOne({ slug: 'paneer-full-fat' }).lean();
  assert.ok(rice && paneer, 'seed data missing');

  const foodsBySlug = new Map([
    [rice.slug, rice],
    [paneer.slug, paneer],
  ]);
  const meals = [
    { name: 'Lunch', share: 1, items: [computeItem(rice, 100), computeItem(paneer, 100)] },
  ];
  const before = meals[0].items.reduce((s, i) => s + i.calories, 0);

  const targets = {
    calories: 2000,
    macros: { protein: 150, carbs: 200, fats: 60 },
  };
  const { totals } = scaleToTargets(meals, foodsBySlug, targets);

  assert.ok(
    Math.abs(totals.calories - 2000) < Math.abs(before - 2000),
    `scaling did not improve: ${before} → ${totals.calories}`,
  );
});

await check('scaling: never produces an absurd portion size', async () => {
  const lettuce = await Food.findOne({ slug: 'lettuce' }).lean();
  const foodsBySlug = new Map([[lettuce.slug, lettuce]]);
  const meals = [{ name: 'Lunch', share: 1, items: [computeItem(lettuce, 50)] }];

  const { meals: scaled } = scaleToTargets(meals, foodsBySlug, {
    calories: 3000,
    macros: { protein: 200, carbs: 300, fats: 80 },
  });

  // 3000 kcal of lettuce is impossible; the cap must prevent a silly number.
  assert.ok(scaled[0].items[0].grams <= 600, `got ${scaled[0].items[0].grams}g`);
});

/* =========================================================== integration == */

const targets = calculateTargets(profile);
await check('targets are complete for the test profile', () => assert.equal(targets.complete, true));

/* --- workout: deterministic fallback ------------------------------------ */
const fallbackWorkout = await generateWorkoutPlan(profile, { forceFallback: true });

await check('workout(fallback): produces the requested number of days', () =>
  assert.equal(fallbackWorkout.days.length, 5));

await check('workout(fallback): marked as fallback', () =>
  assert.equal(fallbackWorkout.generation.generatedBy, 'fallback'));

await check('workout(fallback): every day has exercises', () =>
  assert.ok(fallbackWorkout.days.every((d) => d.exercises.length > 0)));

const allFallbackSlugs = fallbackWorkout.days.flatMap((d) => d.exercises.map((e) => e.slug));
const dbSlugs = new Set(
  (await Exercise.find({ slug: { $in: allFallbackSlugs } }).select('slug').lean()).map((e) => e.slug),
);

await check('workout(fallback): GROUNDING — every slug exists in the exercise DB', () => {
  const missing = allFallbackSlugs.filter((s) => !dbSlugs.has(s));
  assert.deepEqual(missing, [], `unknown slugs: ${missing.join(', ')}`);
});

await check('workout(fallback): INJURY — no quad/hamstring/calf work with a severe knee', async () => {
  const used = await Exercise.find({ slug: { $in: allFallbackSlugs } })
    .select('slug name primaryMuscles secondaryMuscles')
    .lean();
  const unsafe = used.filter((e) =>
    [...e.primaryMuscles, ...e.secondaryMuscles].some((m) =>
      ['quadriceps', 'hamstrings', 'calves'].includes(m),
    ),
  );
  assert.deepEqual(unsafe.map((e) => e.name), [], 'knee-loading exercises leaked into the plan');
});

await check('workout(fallback): EQUIPMENT — only uses what the user has', async () => {
  const used = await Exercise.find({ slug: { $in: allFallbackSlugs } }).select('equipment').lean();
  const foreign = used.filter((e) => !profile.availableEquipment.includes(e.equipment));
  assert.deepEqual(foreign.map((e) => e.equipment), []);
});

await check('workout(fallback): no duplicate exercise within a day', () => {
  for (const day of fallbackWorkout.days) {
    const slugs = day.exercises.map((e) => e.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${day.name} had duplicates`);
  }
});

await check('workout(fallback): sets and rest are in sane ranges', () => {
  for (const day of fallbackWorkout.days) {
    for (const e of day.exercises) {
      assert.ok(e.sets >= 2 && e.sets <= 6, `${e.name} sets=${e.sets}`);
      assert.ok(e.restSeconds >= 30 && e.restSeconds <= 240, `${e.name} rest=${e.restSeconds}`);
    }
  }
});

await check('workout(fallback): reports the injury filtering it performed', () =>
  assert.ok(fallbackWorkout.safetyNotes.length > 0));

/* --- diet: deterministic fallback --------------------------------------- */
const fallbackDiet = await generateDietPlan(profile, targets, { forceFallback: true });

await check('diet(fallback): builds the requested number of meals', () =>
  assert.equal(fallbackDiet.meals.length, 4));

const allFoodSlugs = fallbackDiet.meals.flatMap((m) => m.items.map((i) => i.slug));
const dbFoodSlugs = new Set(
  (await Food.find({ slug: { $in: allFoodSlugs } }).select('slug').lean()).map((f) => f.slug),
);

await check('diet(fallback): GROUNDING — every food slug exists in the food DB', () => {
  const missing = allFoodSlugs.filter((s) => !dbFoodSlugs.has(s));
  assert.deepEqual(missing, [], `unknown slugs: ${missing.join(', ')}`);
});

await check('diet(fallback): DIET TYPE — vegetarian plan contains no meat/fish', async () => {
  const used = await Food.find({ slug: { $in: allFoodSlugs } }).select('name dietTags').lean();
  const violations = used.filter((f) => !f.dietTags.includes('vegetarian'));
  assert.deepEqual(violations.map((f) => f.name), []);
});

await check('diet(fallback): ALLERGY — no peanut food despite a peanut allergy', async () => {
  const used = await Food.find({ slug: { $in: allFoodSlugs } }).select('name allergens').lean();
  const violations = used.filter(
    (f) => f.name.toLowerCase().includes('peanut') || (f.allergens ?? []).includes('peanuts'),
  );
  assert.deepEqual(violations.map((f) => f.name), []);
});

await check('diet(fallback): meal totals equal the sum of their items', () => {
  for (const meal of fallbackDiet.meals) {
    const sum = meal.items.reduce((s, i) => s + i.calories, 0);
    assert.ok(Math.abs(sum - meal.totals.calories) <= 1, `${meal.name}: ${sum} vs ${meal.totals.calories}`);
  }
});

await check('diet(fallback): daily totals equal the sum of the meals', () => {
  const sum = fallbackDiet.meals.reduce((s, m) => s + m.totals.calories, 0);
  assert.ok(Math.abs(sum - fallbackDiet.dailyTotals.calories) <= 2);
});

await check('diet(fallback): macros reconcile with stated calories (4/4/9)', () => {
  const t = fallbackDiet.dailyTotals;
  const computed = t.protein * 4 + t.carbs * 4 + t.fats * 9;
  const drift = Math.abs(computed - t.calories) / t.calories;
  assert.ok(drift < 0.12, `drift ${(drift * 100).toFixed(1)}%`);
});

await check('diet(fallback): variance is reported, not hidden', () =>
  assert.ok(typeof fallbackDiet.variance.caloriePercent === 'number'));

/* --- live Groq ---------------------------------------------------------- */
if (isGroqConfigured()) {
  const aiWorkout = await generateWorkoutPlan(profile);

  await check('workout(groq): used the AI path', () =>
    assert.ok(['groq', 'hybrid'].includes(aiWorkout.generation.generatedBy),
      `generatedBy=${aiWorkout.generation.generatedBy}`));

  const aiSlugs = aiWorkout.days.flatMap((d) => d.exercises.map((e) => e.slug));
  const aiDbSlugs = new Set(
    (await Exercise.find({ slug: { $in: aiSlugs } }).select('slug').lean()).map((e) => e.slug),
  );

  await check('workout(groq): GROUNDING — no hallucinated exercise reached the plan', () => {
    const missing = aiSlugs.filter((s) => !aiDbSlugs.has(s));
    assert.deepEqual(missing, [], `hallucinated: ${missing.join(', ')}`);
  });

  await check('workout(groq): INJURY — severe knee still respected', async () => {
    const used = await Exercise.find({ slug: { $in: aiSlugs } })
      .select('name primaryMuscles secondaryMuscles')
      .lean();
    const unsafe = used.filter((e) =>
      [...e.primaryMuscles, ...e.secondaryMuscles].some((m) =>
        ['quadriceps', 'hamstrings', 'calves'].includes(m),
      ),
    );
    assert.deepEqual(unsafe.map((e) => e.name), []);
  });

  await check('workout(groq): EQUIPMENT respected', async () => {
    const used = await Exercise.find({ slug: { $in: aiSlugs } }).select('equipment').lean();
    assert.deepEqual(
      used.filter((e) => !profile.availableEquipment.includes(e.equipment)).map((e) => e.equipment),
      [],
    );
  });

  await check('workout(groq): every day is non-empty', () =>
    assert.ok(aiWorkout.days.every((d) => d.exercises.length >= 2)));

  const aiDiet = await generateDietPlan(profile, targets);

  await check('diet(groq): used the AI path', () =>
    assert.ok(['groq', 'hybrid'].includes(aiDiet.generation.generatedBy),
      `generatedBy=${aiDiet.generation.generatedBy}`));

  const aiFoodSlugs = aiDiet.meals.flatMap((m) => m.items.map((i) => i.slug));
  const aiDbFoods = new Set(
    (await Food.find({ slug: { $in: aiFoodSlugs } }).select('slug').lean()).map((f) => f.slug),
  );

  await check('diet(groq): GROUNDING — no hallucinated food reached the plan', () => {
    const missing = aiFoodSlugs.filter((s) => !aiDbFoods.has(s));
    assert.deepEqual(missing, [], `hallucinated: ${missing.join(', ')}`);
  });

  await check('diet(groq): DIET TYPE respected', async () => {
    const used = await Food.find({ slug: { $in: aiFoodSlugs } }).select('name dietTags').lean();
    assert.deepEqual(used.filter((f) => !f.dietTags.includes('vegetarian')).map((f) => f.name), []);
  });

  await check('diet(groq): ALLERGY respected', async () => {
    const used = await Food.find({ slug: { $in: aiFoodSlugs } }).select('name').lean();
    assert.deepEqual(used.filter((f) => f.name.toLowerCase().includes('peanut')).map((f) => f.name), []);
  });

  await check('diet(groq): calories land within 15% of target after scaling', () =>
    assert.ok(
      Math.abs(aiDiet.variance.caloriePercent) <= 15,
      `off by ${aiDiet.variance.caloriePercent}%`,
    ));

  await check('diet(groq): macros reconcile with stated calories', () => {
    const t = aiDiet.dailyTotals;
    const computed = t.protein * 4 + t.carbs * 4 + t.fats * 9;
    assert.ok(Math.abs(computed - t.calories) / t.calories < 0.12);
  });

  console.log(
    `\n[groq] workout ${aiWorkout.generation.durationMs}ms via ${aiWorkout.generation.model}` +
      `\n[groq] diet    ${aiDiet.generation.durationMs}ms, calories ${aiDiet.dailyTotals.calories}/${targets.calories} (${aiDiet.variance.caloriePercent}%)` +
      `\n[groq] protein ${aiDiet.dailyTotals.protein}g / ${targets.macros.protein}g target`,
  );
  if (aiWorkout.generation.warnings.length) {
    console.log('[groq] workout warnings:', aiWorkout.generation.warnings.join(' | '));
  }
  if (aiDiet.generation.warnings.length) {
    console.log('[groq] diet warnings:', aiDiet.generation.warnings.join(' | '));
  }
} else {
  results.push('  SKIP  live Groq tests (GROQ_API_KEY not set)');
}

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await disconnectDB();
