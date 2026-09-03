import { Food } from '../models/Food.js';
import {
  estimateTokens,
  generateJson,
  GroqUnavailableError,
  isGroqConfigured,
  TOKEN_BUDGET,
} from './groqClient.js';

/**
 * AI diet plan generator.
 *
 * Division of labour, matching the report's architecture principle:
 *
 *   AI   decides COMPOSITION — which foods belong together in a meal, and
 *        roughly how much of each. This is the genuinely subjective part.
 *   CODE decides NUMBERS — every macro is recomputed from the food database,
 *        and portions are then scaled deterministically to hit the targets.
 *
 * The model's own arithmetic is never trusted or stored. If it claims a meal
 * has 40 g of protein, that claim is discarded and recomputed from grams × the
 * DB's per-100 g values. This makes an LLM arithmetic slip structurally
 * incapable of producing a wrong macro total.
 */

/*
 * Food candidates sent to the model. Trimmed from 90 to stay inside Groq's
 * free-tier 8000 tokens/minute cap, which counts prompt + reserved output.
 */
const MAX_CANDIDATES = 55;
const MIN_CANDIDATES_IN_PROMPT = 20;
const OUTPUT_TOKENS_PER_MEAL = 260;
const OUTPUT_TOKENS_BASE = 400;
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.2;
const PORTION_MIN_G = 10;
const PORTION_MAX_G = 600;

/** How far over the protein target is tolerated before trimming back. */
const PROTEIN_OVERSHOOT_TOLERANCE = 0.12;
/** No single protein portion is cut by more than this fraction. */
const MAX_PROTEIN_REDUCTION = 0.5;
/** Trim rounds — a dominant protein source needs several capped cuts. */
const PROTEIN_TRIM_ROUNDS = 5;

/** Meal names and their share of daily calories, by meals-per-day. */
const MEAL_TEMPLATES = {
  2: [
    { name: 'Brunch', share: 0.5 },
    { name: 'Dinner', share: 0.5 },
  ],
  3: [
    { name: 'Breakfast', share: 0.3 },
    { name: 'Lunch', share: 0.4 },
    { name: 'Dinner', share: 0.3 },
  ],
  4: [
    { name: 'Breakfast', share: 0.25 },
    { name: 'Lunch', share: 0.35 },
    { name: 'Snack', share: 0.12 },
    { name: 'Dinner', share: 0.28 },
  ],
  5: [
    { name: 'Breakfast', share: 0.22 },
    { name: 'Mid-morning snack', share: 0.11 },
    { name: 'Lunch', share: 0.3 },
    { name: 'Evening snack', share: 0.12 },
    { name: 'Dinner', share: 0.25 },
  ],
  6: [
    { name: 'Breakfast', share: 0.2 },
    { name: 'Mid-morning snack', share: 0.1 },
    { name: 'Lunch', share: 0.26 },
    { name: 'Pre-workout', share: 0.12 },
    { name: 'Post-workout', share: 0.12 },
    { name: 'Dinner', share: 0.2 },
  ],
};

export const mealTemplateFor = (mealsPerDay) => {
  const count = Math.min(Math.max(Number(mealsPerDay) || 3, 2), 8);
  if (MEAL_TEMPLATES[count]) return MEAL_TEMPLATES[count];

  // 7-8 meals: even split.
  return Array.from({ length: count }, (_, i) => ({
    name: i === 0 ? 'Breakfast' : i === count - 1 ? 'Dinner' : `Meal ${i + 1}`,
    share: 1 / count,
  }));
};

/* --------------------------------------------------------------- retrieval */

/** Maps a diet type onto the `dietTags` stored on each food. */
const DIET_TAG_FOR_TYPE = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  eggetarian: 'eggetarian',
  keto: 'keto',
  omnivore: null, // no restriction
};

/**
 * Builds the candidate food list: diet-compatible, allergen-free and
 * excluding disliked foods. Like the workout generator, unsafe or unsuitable
 * options are removed before the model sees anything.
 */
export const getFoodCandidates = async (profile) => {
  const query = {};

  const tag = DIET_TAG_FOR_TYPE[profile.dietType];
  if (tag) query.dietTags = tag;

  const foods = await Food.find(query)
    .select('slug name category per calories protein carbs fats fiber servingLabel servingGrams allergens dietTags')
    .lean();

  const allergies = (profile.allergies ?? []).map((a) => a.toLowerCase());
  const disliked = (profile.dislikedFoods ?? []).map((d) => d.toLowerCase());

  const excluded = [];
  const safe = foods.filter((food) => {
    const allergenHit = (food.allergens ?? []).find((allergen) =>
      allergies.some(
        (a) => allergen.toLowerCase().includes(a) || a.includes(allergen.toLowerCase()),
      ),
    );
    if (allergenHit) {
      excluded.push({ slug: food.slug, name: food.name, reason: `allergen: ${allergenHit}` });
      return false;
    }

    // Also match the allergy term against the food name ("peanuts" → Peanut Butter).
    const nameHit = allergies.find((a) => food.name.toLowerCase().includes(a));
    if (nameHit) {
      excluded.push({ slug: food.slug, name: food.name, reason: `allergen: ${nameHit}` });
      return false;
    }

    const dislikeHit = disliked.find((d) => food.name.toLowerCase().includes(d));
    if (dislikeHit) {
      excluded.push({ slug: food.slug, name: food.name, reason: `disliked: ${dislikeHit}` });
      return false;
    }

    return true;
  });

  return { candidates: safe, excluded };
};

/* --------------------------------------------------------------- numerics */

const round = (value, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

/** Recomputes one item's macros from its gram amount and the DB record. */
export const computeItem = (food, grams) => {
  const factor = grams / 100;
  return {
    slug: food.slug,
    name: food.name,
    category: food.category,
    grams: round(grams),
    unit: food.per === '100ml' ? 'ml' : 'g',
    servingLabel: food.servingLabel,
    calories: round(food.calories * factor),
    protein: round(food.protein * factor, 1),
    carbs: round(food.carbs * factor, 1),
    fats: round(food.fats * factor, 1),
    fiber: round((food.fiber ?? 0) * factor, 1),
  };
};

const sumMacros = (items) =>
  items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fats: acc.fats + item.fats,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
  );

const roundTotals = (totals) => ({
  calories: round(totals.calories),
  protein: round(totals.protein, 1),
  carbs: round(totals.carbs, 1),
  fats: round(totals.fats, 1),
  fiber: round(totals.fiber, 1),
});

/**
 * Scales portions to hit the calorie and macro targets.
 *
 * Three passes, all deterministic and bounded:
 *   1. global calorie scaling
 *   2. raise protein if it falls short
 *   3. trim protein if it overshoots, restoring the calories via carb/fat foods
 *
 * Passes 2 and 3 are mutually exclusive. Every portion stays within
 * [10 g, 600 g] and no meal is scaled beyond ~2x, so the plan can never arrive
 * at "eat 1.8 kg of broccoli".
 */
export const scaleToTargets = (meals, foodsBySlug, targets) => {
  const notes = [];

  // --- pass 1: global calorie scaling -------------------------------------
  let totals = sumMacros(meals.flatMap((m) => m.items));

  if (totals.calories > 0) {
    const rawFactor = targets.calories / totals.calories;
    const factor = Math.min(Math.max(rawFactor, SCALE_MIN), SCALE_MAX);

    if (Math.abs(rawFactor - factor) > 0.01) {
      notes.push(
        `Portion scaling was capped — the AI's initial portions were far from your calorie target.`,
      );
    }

    for (const meal of meals) {
      meal.items = meal.items.map((item) => {
        const food = foodsBySlug.get(item.slug);
        const grams = Math.min(
          Math.max(item.grams * factor, PORTION_MIN_G),
          PORTION_MAX_G,
        );
        return computeItem(food, grams);
      });
    }
  }

  // --- pass 2: protein priority -------------------------------------------
  totals = sumMacros(meals.flatMap((m) => m.items));
  const proteinGap = targets.macros.protein - totals.protein;

  if (proteinGap > targets.macros.protein * 0.1) {
    // Raise the most protein-dense items first; they move protein with the
    // least collateral effect on carbs and fats.
    const ranked = meals
      .flatMap((meal) => meal.items.map((item) => ({ meal, item })))
      .map((entry) => ({
        ...entry,
        density: foodsBySlug.get(entry.item.slug)?.protein ?? 0,
      }))
      .filter((entry) => entry.density > 8)
      .sort((a, b) => b.density - a.density)
      .slice(0, 3);

    let remaining = proteinGap;
    for (const entry of ranked) {
      if (remaining <= 0) break;
      const food = foodsBySlug.get(entry.item.slug);
      const extraGrams = Math.min(
        (remaining / food.protein) * 100,
        entry.item.grams * 0.6,
        PORTION_MAX_G - entry.item.grams,
      );
      if (extraGrams <= 0) continue;

      const updated = computeItem(food, entry.item.grams + extraGrams);
      const mealIndex = entry.meal.items.findIndex((i) => i.slug === entry.item.slug);
      if (mealIndex !== -1) entry.meal.items[mealIndex] = updated;
      remaining -= updated.protein - entry.item.protein;
    }

    if (remaining > targets.macros.protein * 0.1) {
      notes.push(
        'Protein target not fully reachable from the selected foods — consider adding a protein supplement or a higher-protein food.',
      );
    }
  }

  /*
   * --- pass 3: protein overshoot ------------------------------------------
   *
   * Pass 2 only ever raises protein. When the model picks protein-dense foods,
   * calorie scaling can land the total exactly while protein runs far over —
   * which necessarily starves carbs and fats, the training-fuel macros.
   *
   * This trims the protein-dense items back, then restores the lost calories
   * using the carb/fat-leaning items so the calorie target still holds.
   * Mutually exclusive with pass 2: only one of the two can ever apply.
   */
  totals = sumMacros(meals.flatMap((m) => m.items));
  const proteinExcess = totals.protein - targets.macros.protein;

  if (proteinExcess > targets.macros.protein * PROTEIN_OVERSHOOT_TOLERANCE) {
    /*
     * Trim in rounds. Each round cuts a protein-dense portion by at most
     * MAX_PROTEIN_REDUCTION, so a single dominant protein source (300 g of whey,
     * say) needs several passes to converge — one pass alone would leave it
     * far over target. Bounded rounds keep this deterministic and terminating.
     */
    for (let round = 0; round < PROTEIN_TRIM_ROUNDS; round += 1) {
      const roundTotals = sumMacros(meals.flatMap((m) => m.items));
      let remaining = roundTotals.protein - targets.macros.protein;
      if (remaining <= targets.macros.protein * PROTEIN_OVERSHOOT_TOLERANCE) break;

      const dense = meals
        .flatMap((meal) => meal.items.map((item) => ({ meal, item })))
        .map((entry) => ({
          ...entry,
          density: foodsBySlug.get(entry.item.slug)?.protein ?? 0,
        }))
        .filter((entry) => entry.density > 12)
        .sort((a, b) => b.density - a.density);

      if (dense.length === 0) break;

      let changed = false;
      for (const entry of dense) {
        if (remaining <= 0) break;
        const food = foodsBySlug.get(entry.item.slug);
        const index = entry.meal.items.findIndex((i) => i.slug === entry.item.slug);
        if (index === -1) continue;
        const current = entry.meal.items[index];

        const reduceGrams = Math.min(
          (remaining / food.protein) * 100,
          current.grams * MAX_PROTEIN_REDUCTION,
          current.grams - PORTION_MIN_G,
        );
        if (reduceGrams <= 0.5) continue;

        const updated = computeItem(food, current.grams - reduceGrams);
        entry.meal.items[index] = updated;
        remaining -= current.protein - updated.protein;
        changed = true;
      }

      // Nothing could move — every dense portion is already at its floor.
      if (!changed) break;
    }

    // Trimming protein removed calories too — put them back into the
    // carb/fat-leaning items rather than leaving the day under target.
    totals = sumMacros(meals.flatMap((m) => m.items));
    const calorieGap = targets.calories - totals.calories;

    if (calorieGap > targets.calories * 0.02) {
      const fuel = meals
        .flatMap((meal) => meal.items.map((item) => ({ meal, item })))
        .filter((entry) => (foodsBySlug.get(entry.item.slug)?.protein ?? 0) <= 12);

      const fuelCalories = fuel.reduce((sum, entry) => sum + entry.item.calories, 0);

      if (fuelCalories > 0) {
        const factor = Math.min(1 + calorieGap / fuelCalories, SCALE_MAX);
        for (const entry of fuel) {
          const food = foodsBySlug.get(entry.item.slug);
          const index = entry.meal.items.findIndex((i) => i.slug === entry.item.slug);
          if (index === -1) continue;
          const grams = Math.min(
            Math.max(entry.meal.items[index].grams * factor, PORTION_MIN_G),
            PORTION_MAX_G,
          );
          entry.meal.items[index] = computeItem(food, grams);
        }
      } else {
        notes.push(
          'Protein was trimmed toward your target, but the plan has no carb- or fat-leaning foods to restore the calories with.',
        );
      }

      /*
       * Portion caps mean the carb/fat items cannot always absorb the calories
       * the protein trim removed — a day built from very few foods simply can't
       * satisfy both targets. Say so rather than shipping a quietly low day.
       */
      const afterRestore = sumMacros(meals.flatMap((m) => m.items));
      const residual = targets.calories - afterRestore.calories;
      if (residual > targets.calories * 0.05) {
        notes.push(
          `This plan lands about ${Math.round(residual)} kcal under target: the remaining foods hit their portion limits. Regenerate for a wider spread of foods, or add a carbohydrate source.`,
        );
      }
    }

    notes.push(
      'Protein-dense portions were reduced toward your target so carbohydrates and fats were not squeezed out.',
    );
  }

  // --- finalise ------------------------------------------------------------
  for (const meal of meals) {
    meal.totals = roundTotals(sumMacros(meal.items));
  }

  const finalTotals = roundTotals(sumMacros(meals.flatMap((m) => m.items)));

  const variance = {
    calories: round(finalTotals.calories - targets.calories),
    protein: round(finalTotals.protein - targets.macros.protein, 1),
    carbs: round(finalTotals.carbs - targets.macros.carbs, 1),
    fats: round(finalTotals.fats - targets.macros.fats, 1),
    caloriePercent: round(
      ((finalTotals.calories - targets.calories) / targets.calories) * 100,
      1,
    ),
  };

  return { meals, totals: finalTotals, variance, notes };
};

/* ----------------------------------------------------------------- prompts */

const SYSTEM_PROMPT = `You are a sports nutritionist composing one day of meals.

HARD RULES:
1. You may ONLY use food slugs from the CANDIDATES list. Never invent a slug.
2. Give a realistic gram amount for each food (grams, or ml for liquids).
3. Each meal should contain 2-4 foods and be a plausible real meal, not a random pile of ingredients.
4. Include a protein source in every main meal.
5. Do NOT compute calories or macros — only choose foods and portions. The system computes nutrition itself.
6. Output ONLY a JSON object. No prose, no markdown.

OUTPUT SHAPE:
{"meals":[{"name":"<meal name given to you>","items":[{"slug":"<exact slug from CANDIDATES>","grams":<number>}]}]}`;

const buildUserPrompt = ({ profile, targets, template, candidates }) => {
  const grouped = candidates.reduce((acc, food) => {
    (acc[food.category] ??= []).push(food);
    return acc;
  }, {});

  /*
   * Compact encoding: `slug:kcal/P/C/F` per 100 g.
   *
   * The display NAME is dropped — the slug carries it and the server resolves
   * the real name from the database. The "per 100g" suffix is stated once in
   * the header rather than on every line.
   */
  const candidateLines = Object.entries(grouped)
    .map(([category, foods]) => {
      const items = foods
        .map((f) => `${f.slug}:${f.calories}/${f.protein}/${f.carbs}/${f.fats}`)
        .join(' ');
      return `${category.toUpperCase()}: ${items}`;
    })
    .join('\n');

  return `DAILY TARGETS (portions get scaled by the system — aim close):
${targets.calories} kcal, protein ${targets.macros.protein}g, carbs ${targets.macros.carbs}g, fats ${targets.macros.fats}g
EATER: ${profile.dietType} diet, goal ${profile.goal}. Unsuitable foods are already removed.

MEALS TO BUILD (use these exact names, in this order):
${template.map((m) => `${m.name} (~${Math.round(m.share * targets.calories)} kcal)`).join('\n')}

CANDIDATES — format is slug:kcal/protein/carbs/fats per 100g. Use slugs exactly as written.
${candidateLines}

Return the JSON object now.`;
};

/* --------------------------------------------------------------- grounding */

/** Keeps only items whose slug exists in the candidate set. */
const groundMeals = (aiMeals, template, foodsBySlug) => {
  const rejected = [];

  // Guard the shape rather than trusting it: a malformed response must fall
  // back, never throw.
  const returned = Array.isArray(aiMeals) ? aiMeals : [];

  const meals = template.map((slot) => {
    const match =
      returned.find(
        (m) => String(m?.name ?? '').toLowerCase() === slot.name.toLowerCase(),
      ) ?? null;

    const items = [];
    const seen = new Set();
    const rawItems = Array.isArray(match?.items) ? match.items : [];

    for (const rawItem of rawItems) {
      const slug = typeof rawItem?.slug === 'string' ? rawItem.slug.trim() : '';
      const food = foodsBySlug.get(slug);

      if (!food) {
        rejected.push({ slug: slug || '(missing)', meal: slot.name, reason: 'not in the verified food database' });
        continue;
      }
      if (seen.has(slug)) continue;
      seen.add(slug);

      const grams = Number(rawItem.grams);
      const safeGrams = Number.isFinite(grams)
        ? Math.min(Math.max(grams, PORTION_MIN_G), PORTION_MAX_G)
        : (food.servingGrams ?? 100);

      items.push(computeItem(food, safeGrams));
    }

    return { name: slot.name, share: slot.share, items };
  });

  return { meals, rejected };
};

/* ---------------------------------------------------------------- fallback */

/**
 * Deterministic meal builder: picks a protein, a carb and a vegetable/fat per
 * meal from the candidate pool, rotating so the day isn't repetitive.
 */
const buildDeterministically = (template, candidates) => {
  const byCategory = (categories) =>
    candidates.filter((f) => categories.includes(f.category));

  const proteins = byCategory(['protein', 'dairy', 'legume', 'supplement']);
  const carbs = byCategory(['grain', 'fruit']);
  const veg = byCategory(['vegetable']);
  const fats = byCategory(['nut_seed', 'fat']);

  const pick = (pool, index) => (pool.length ? pool[index % pool.length] : null);

  return template.map((slot, index) => {
    const items = [];

    const protein = pick(proteins, index);
    if (protein) items.push(computeItem(protein, protein.servingGrams ?? 120));

    const carb = pick(carbs, index);
    if (carb) items.push(computeItem(carb, carb.servingGrams ?? 100));

    // Alternate a vegetable and a fat source so meals differ across the day.
    const extra = index % 2 === 0 ? pick(veg, index) : pick(fats, index);
    if (extra) items.push(computeItem(extra, extra.servingGrams ?? 50));

    return { name: slot.name, share: slot.share, items };
  });
};

/* ----------------------------------------------------------------- public */

/**
 * Generates a full day's diet plan matched to the user's macro targets.
 *
 * @param {object} profile
 * @param {object} targets  Output of calculateTargets() — must be complete.
 */
export const generateDietPlan = async (profile, targets, { forceFallback = false } = {}) => {
  const startedAt = Date.now();

  if (!targets?.complete) {
    throw new Error('Cannot generate a diet plan without complete macro targets');
  }

  const template = mealTemplateFor(profile.mealsPerDay);
  const { candidates, excluded } = await getFoodCandidates(profile);

  if (candidates.length < 6) {
    throw new Error(
      `Only ${candidates.length} foods match your diet and allergy settings — too few to build a plan. Try relaxing a restriction.`,
    );
  }

  const foodsBySlug = new Map(candidates.map((f) => [f.slug, f]));
  const warnings = [];

  const useAi = isGroqConfigured() && !forceFallback;
  let generatedBy = useAi ? 'groq' : 'fallback';
  let model = null;
  let attempts = 0;

  let meals = null;

  if (useAi) {
    try {
      const maxTokens = OUTPUT_TOKENS_BASE + OUTPUT_TOKENS_PER_MEAL * template.length;

      /*
       * Fit the prompt to the token budget before sending — Groq counts
       * prompt + max_tokens against a per-minute cap and returns 413 for an
       * oversized request, which retrying cannot fix.
       */
      let poolSize = MAX_CANDIDATES;
      let userPrompt = buildUserPrompt({
        profile,
        targets,
        template,
        candidates: candidates.slice(0, poolSize),
      });

      while (
        estimateTokens(userPrompt) + maxTokens > TOKEN_BUDGET &&
        poolSize > MIN_CANDIDATES_IN_PROMPT
      ) {
        poolSize = Math.max(MIN_CANDIDATES_IN_PROMPT, Math.floor(poolSize * 0.75));
        userPrompt = buildUserPrompt({
          profile,
          targets,
          template,
          candidates: candidates.slice(0, poolSize),
        });
      }

      if (poolSize < MAX_CANDIDATES) {
        warnings.push(
          `Food list trimmed to ${poolSize} options to fit the AI token budget.`,
        );
      }

      const { data, meta } = await generateJson({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        temperature: 0.5,
        maxTokens,
        validate: (parsed) => {
          if (!Array.isArray(parsed?.meals)) return 'Missing a "meals" array.';
          if (parsed.meals.length < template.length) {
            return `Expected ${template.length} meals, got ${parsed.meals.length}.`;
          }
          const valid = new Set(candidates.map((c) => c.slug));
          const bad = parsed.meals
            .flatMap((m) => (m?.items ?? []).map((i) => i?.slug))
            .filter((slug) => !valid.has(slug));
          if (bad.length > 3) {
            return `These slugs are not in CANDIDATES: ${bad.slice(0, 5).join(', ')}. Use only exact slugs from the list.`;
          }
          return true;
        },
      });

      model = meta.model;
      attempts = meta.attempts;

      const grounded = groundMeals(data?.meals, template, foodsBySlug);
      if (grounded.rejected.length) {
        warnings.push(
          `Dropped ${grounded.rejected.length} AI food suggestion(s) that failed DB grounding.`,
        );
      }

      // Every meal must have survived with at least one real food.
      const emptyMeals = grounded.meals.filter((m) => m.items.length === 0);
      if (emptyMeals.length === 0) {
        meals = grounded.meals;
      } else {
        warnings.push(
          `${emptyMeals.length} meal(s) had no valid foods after grounding — used the deterministic builder.`,
        );
      }
    } catch (err) {
      if (!(err instanceof GroqUnavailableError)) throw err;
      warnings.push(`AI unavailable (${err.message.slice(0, 80)}) — used the deterministic builder.`);
    }
  }

  if (!meals) {
    meals = buildDeterministically(template, candidates);
    generatedBy = useAi ? 'hybrid' : 'fallback';
  }

  if (!isGroqConfigured()) {
    warnings.push('GROQ_API_KEY not configured — plan built with the deterministic engine.');
  }

  // Numbers are ours, not the model's.
  const scaled = scaleToTargets(meals, foodsBySlug, targets);
  warnings.push(...scaled.notes);

  return {
    targets: {
      calories: targets.calories,
      protein: targets.macros.protein,
      carbs: targets.macros.carbs,
      fats: targets.macros.fats,
    },
    meals: scaled.meals.map((meal, index) => ({
      order: index + 1,
      name: meal.name,
      targetCalories: Math.round(meal.share * targets.calories),
      items: meal.items,
      totals: meal.totals,
    })),
    dailyTotals: scaled.totals,
    variance: scaled.variance,
    excludedFoods: excluded.slice(0, 50),
    candidatePoolSize: candidates.length,
    generation: {
      generatedBy,
      model,
      attempts,
      durationMs: Date.now() - startedAt,
      warnings,
    },
  };
};

/**
 * Regenerates a single meal while keeping the rest of the day intact
 * (AI feature #3 in the report). The replacement is grounded and re-scaled to
 * the same calorie share the original meal occupied.
 */
export const regenerateMeal = async (profile, targets, existingPlan, mealOrder) => {
  const template = mealTemplateFor(profile.mealsPerDay);
  const slot = existingPlan.meals.find((m) => m.order === mealOrder);
  if (!slot) throw new Error(`Meal ${mealOrder} not found in this plan`);

  const { candidates } = await getFoodCandidates(profile);
  const foodsBySlug = new Map(candidates.map((f) => [f.slug, f]));

  // Avoid repeating what's already elsewhere in the day.
  const usedElsewhere = new Set(
    existingPlan.meals
      .filter((m) => m.order !== mealOrder)
      .flatMap((m) => m.items.map((i) => i.slug)),
  );
  const pool = candidates.filter((f) => !usedElsewhere.has(f.slug));
  const usablePool = pool.length >= 6 ? pool : candidates;

  const targetCalories = slot.targetCalories;
  const warnings = [];
  let items = null;
  let generatedBy = 'fallback';
  let model = null;

  if (isGroqConfigured()) {
    try {
      const { data, meta } = await generateJson({
        system: SYSTEM_PROMPT,
        user: `Rebuild ONE meal only.

MEAL: ${slot.name} (~${targetCalories} kcal)
DIET: ${profile.dietType}
AVOID repeating these, they appear in other meals today: ${[...usedElsewhere].slice(0, 20).join(', ') || 'none'}
ALSO AVOID the current contents: ${slot.items.map((i) => i.slug).join(', ')}

CANDIDATES — format slug:kcal/protein/carbs/fats per 100g. Only these slugs are valid.
${usablePool
  .slice(0, MAX_CANDIDATES)
  .map((f) => `${f.slug}:${f.calories}/${f.protein}/${f.carbs}/${f.fats}`)
  .join(' ')}

Return {"meals":[{"name":"${slot.name}","items":[{"slug":"...","grams":<number>}]}]}`,
        temperature: 0.8, // higher: the point is to get something different
        maxTokens: 600,
        validate: (parsed) =>
          Array.isArray(parsed?.meals) && parsed.meals[0]?.items?.length
            ? true
            : 'Expected one meal with a non-empty items array.',
      });

      model = meta.model;
      const grounded = groundMeals(
        data?.meals,
        [{ name: slot.name, share: targetCalories / targets.calories }],
        foodsBySlug,
      );
      if (grounded.meals[0]?.items.length) {
        items = grounded.meals[0].items;
        generatedBy = 'groq';
      }
      if (grounded.rejected.length) {
        warnings.push(`Dropped ${grounded.rejected.length} suggestion(s) that failed grounding.`);
      }
    } catch (err) {
      if (!(err instanceof GroqUnavailableError)) throw err;
      warnings.push('AI unavailable — swapped using the deterministic builder.');
    }
  }

  if (!items) {
    const built = buildDeterministically(
      [{ name: slot.name, share: targetCalories / targets.calories }],
      usablePool,
    );
    items = built[0].items;
  }

  // Scale the replacement to the calorie share the old meal held.
  const currentCalories = items.reduce((sum, i) => sum + i.calories, 0);
  if (currentCalories > 0) {
    const factor = Math.min(
      Math.max(targetCalories / currentCalories, SCALE_MIN),
      SCALE_MAX,
    );
    items = items.map((item) =>
      computeItem(
        foodsBySlug.get(item.slug),
        Math.min(Math.max(item.grams * factor, PORTION_MIN_G), PORTION_MAX_G),
      ),
    );
  }

  return {
    order: mealOrder,
    name: slot.name,
    targetCalories,
    items,
    totals: roundTotals(sumMacros(items)),
    generation: { generatedBy, model, warnings },
  };
};
