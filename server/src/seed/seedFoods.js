import { Food } from '../models/Food.js';
import { foods } from '../data/foods.js';

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[()%]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * A food's declared `base` diet expands into every diet it is compatible with,
 * so the diet generator can filter with a single `dietTags` query.
 */
const DIET_EXPANSION = {
  vegan: ['vegan', 'vegetarian', 'eggetarian'],
  vegetarian: ['vegetarian', 'eggetarian'],
  eggetarian: ['eggetarian'],
  nonveg: [],
};

// Keto tolerates a low net-carb load; 10 g per 100 g is the usual cutoff.
const KETO_MAX_NET_CARBS = 10;

const buildDietTags = (food) => {
  const tags = [...(DIET_EXPANSION[food.base] ?? [])];

  if (food.glutenFree !== false) tags.push('gluten_free');

  const netCarbs = Math.max(food.carbs - (food.fiber ?? 0), 0);
  if (netCarbs <= KETO_MAX_NET_CARBS) tags.push('keto');

  return [...new Set(tags)];
};

const TOLERANCE = 0.15;
// Below this, rounding on a 1-2 kcal value dominates any real signal.
const MIN_CALORIES_TO_CHECK = 10;

/**
 * Cross-checks stated calories against 4/4/9 kcal macro math to catch
 * transcription errors in the curated dataset.
 *
 * Reference sources are not consistent about fiber: some apply Atwater factors
 * to *total* carbohydrate, others to net carbs (total minus fiber). Rather than
 * pick one and flag every food that followed the other convention, the check
 * accepts any value inside the band both conventions span, plus a tolerance for
 * rounding and cooking-state variation.
 */
const validateCalories = (food) => {
  const fiber = food.fiber ?? 0;
  const fromProteinFat = food.protein * 4 + food.fats * 9;
  const netEstimate = fromProteinFat + Math.max(food.carbs - fiber, 0) * 4;
  const totalEstimate = fromProteinFat + food.carbs * 4;

  if (totalEstimate === 0 || food.calories < MIN_CALORIES_TO_CHECK) return null;

  const lower = netEstimate * (1 - TOLERANCE);
  const upper = totalEstimate * (1 + TOLERANCE);

  if (food.calories >= lower && food.calories <= upper) return null;

  return `${food.name}: stated ${food.calories} kcal is outside the plausible ${lower.toFixed(
    0,
  )}–${upper.toFixed(0)} kcal range (P${food.protein}/C${food.carbs}/F${food.fats}, fiber ${fiber})`;
};

const toFood = (raw) => ({
  slug: slugify(raw.name),
  name: raw.name,
  category: raw.category,
  per: raw.per ?? '100g',
  calories: raw.calories,
  protein: raw.protein,
  carbs: raw.carbs,
  fats: raw.fats,
  fiber: raw.fiber ?? 0,
  servingLabel: raw.servingLabel,
  servingGrams: raw.servingGrams,
  dietTags: buildDietTags(raw),
  allergens: raw.allergens ?? [],
  source: 'fitgen-curated',
});

export const seedFoods = async ({ fresh = false } = {}) => {
  console.log(`[seed:foods] preparing ${foods.length} curated records`);

  const warnings = foods.map(validateCalories).filter(Boolean);
  if (warnings.length) {
    console.warn(`[seed:foods] ${warnings.length} macro drift warning(s):`);
    warnings.forEach((w) => console.warn(`  ! ${w}`));
  }

  if (fresh) {
    const { deletedCount } = await Food.deleteMany({});
    console.log(`[seed:foods] cleared ${deletedCount} existing documents`);
  }

  const seen = new Set();
  const operations = [];

  for (const record of foods) {
    const doc = toFood(record);
    if (seen.has(doc.slug)) {
      console.warn(`[seed:foods] duplicate slug skipped: ${doc.slug}`);
      continue;
    }
    seen.add(doc.slug);

    operations.push({
      updateOne: {
        filter: { slug: doc.slug },
        update: { $set: doc },
        upsert: true,
      },
    });
  }

  const result = await Food.bulkWrite(operations, { ordered: false });
  const total = await Food.countDocuments();

  console.log(
    `[seed:foods] done — ${result.upsertedCount ?? 0} inserted, ${
      result.modifiedCount ?? 0
    } updated, ${total} total`,
  );

  return {
    inserted: result.upsertedCount ?? 0,
    updated: result.modifiedCount ?? 0,
    total,
    warnings,
  };
};
