/**
 * Grocery list generation.
 *
 * The report asks for a list "from the weekly meal plan". A generated diet plan
 * covers ONE day intended to be repeated (see report §9.6), so a week is that
 * day multiplied by the number of days requested — which is stated in the
 * output rather than left implicit.
 *
 * Entirely deterministic: it aggregates what the plan already contains, so the
 * same plan always produces the same list.
 */

const round = (value, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

/** Shop-floor grouping, which is not the same as the nutrition category. */
const AISLES = {
  protein: 'Meat, fish & protein',
  dairy: 'Dairy & chilled',
  legume: 'Pulses & legumes',
  grain: 'Grains & staples',
  vegetable: 'Fruit & vegetables',
  fruit: 'Fruit & vegetables',
  nut_seed: 'Nuts, seeds & spreads',
  fat: 'Oils & fats',
  beverage: 'Drinks',
  supplement: 'Supplements',
  prepared: 'Prepared & other',
};

const AISLE_ORDER = [
  'Fruit & vegetables',
  'Meat, fish & protein',
  'Dairy & chilled',
  'Pulses & legumes',
  'Grains & staples',
  'Nuts, seeds & spreads',
  'Oils & fats',
  'Drinks',
  'Supplements',
  'Prepared & other',
];

/**
 * Rounds a shopping quantity to something you can actually buy.
 *
 * A plan may call for 137 g of oats a day; over seven days that is 959 g, and
 * asking someone to buy exactly that is useless. Quantities are rounded UP to a
 * sensible step so the list is sufficient rather than precise.
 */
export const toPurchaseQuantity = (grams, unit) => {
  if (unit === 'ml') {
    if (grams >= 1000) return { amount: round(Math.ceil(grams / 500) * 500 / 1000, 1), unit: 'L' };
    return { amount: Math.ceil(grams / 50) * 50, unit: 'ml' };
  }
  if (grams >= 1000) {
    return { amount: round(Math.ceil(grams / 250) * 250 / 1000, 2), unit: 'kg' };
  }
  if (grams >= 100) return { amount: Math.ceil(grams / 50) * 50, unit: 'g' };
  return { amount: Math.ceil(grams / 10) * 10, unit: 'g' };
};

/**
 * Builds a grocery list from a stored diet plan.
 *
 * @param {object} plan   A DietPlan document (or its plain object).
 * @param {number} days   How many days the plan is being shopped for.
 */
export const buildGroceryList = (plan, days = 7) => {
  const dayCount = Math.min(Math.max(Math.round(Number(days) || 7), 1), 30);

  // Aggregate identical foods across every meal, then scale by the day count.
  const totals = new Map();

  for (const meal of plan.meals ?? []) {
    for (const item of meal.items ?? []) {
      const existing = totals.get(item.slug);
      if (existing) {
        existing.gramsPerDay += item.grams;
        existing.caloriesPerDay += item.calories;
        if (!existing.meals.includes(meal.name)) existing.meals.push(meal.name);
      } else {
        totals.set(item.slug, {
          slug: item.slug,
          name: item.name,
          category: item.category ?? 'prepared',
          unit: item.unit ?? 'g',
          gramsPerDay: item.grams,
          caloriesPerDay: item.calories,
          servingLabel: item.servingLabel,
          meals: [meal.name],
        });
      }
    }
  }

  const items = [...totals.values()].map((entry) => {
    const totalGrams = entry.gramsPerDay * dayCount;
    const purchase = toPurchaseQuantity(totalGrams, entry.unit);

    return {
      slug: entry.slug,
      name: entry.name,
      category: entry.category,
      aisle: AISLES[entry.category] ?? 'Prepared & other',
      perDay: { amount: round(entry.gramsPerDay), unit: entry.unit },
      total: { amount: round(totalGrams), unit: entry.unit },
      // What to actually put in the basket.
      purchase,
      caloriesTotal: round(entry.caloriesPerDay * dayCount),
      usedIn: entry.meals,
    };
  });

  // Group by aisle, in shop order, with items alphabetical inside each.
  const grouped = AISLE_ORDER.map((aisle) => ({
    aisle,
    items: items
      .filter((item) => item.aisle === aisle)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);

  return {
    days: dayCount,
    generatedFrom: {
      planVersion: plan.version,
      targetCalories: plan.targets?.calories,
      dailyCalories: plan.dailyTotals?.calories,
    },
    groups: grouped,
    summary: {
      distinctItems: items.length,
      aisles: grouped.length,
      totalCalories: round(items.reduce((sum, i) => sum + i.caloriesTotal, 0)),
      // Useful sanity check: the list should feed exactly `days` days.
      caloriesPerDay: round(
        items.reduce((sum, i) => sum + i.caloriesTotal, 0) / dayCount,
      ),
    },
  };
};

/** Plain-text rendering, for copying into a notes app or a message. */
export const groceryListToText = (list) => {
  const lines = [
    `FitGen grocery list — ${list.days} day${list.days === 1 ? '' : 's'}`,
    `${list.summary.distinctItems} items · about ${list.summary.caloriesPerDay} kcal/day`,
    '',
  ];

  for (const group of list.groups) {
    lines.push(group.aisle.toUpperCase());
    for (const item of group.items) {
      lines.push(`  [ ] ${item.name} — ${item.purchase.amount}${item.purchase.unit}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
};
