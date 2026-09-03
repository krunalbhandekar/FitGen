/**
 * FitGen curated nutrition database.
 *
 * All macro values are per 100 g (or per 100 ml where `per: '100ml'`), sourced
 * from USDA FoodData Central and IFCT (Indian Food Composition Tables) values.
 * Cooked-state is stated in the name wherever it materially changes the numbers.
 *
 * `base` declares the strictest diet the food belongs to; the seeder expands it
 * into the `dietTags` array (vegan food also fits vegetarian/eggetarian menus).
 * `keto` and `gluten_free` tags are derived in the seeder too — see
 * `src/seed/seedFoods.js`. Keep this file declarative: no computed values.
 *
 * base: 'vegan' | 'vegetarian' (dairy) | 'eggetarian' (egg) | 'nonveg'
 */

export const foods = [
  // ---------------------------------------------------------------- protein
  { name: 'Chicken Breast (cooked)', category: 'protein', base: 'nonveg', calories: 165, protein: 31, carbs: 0, fats: 3.6, servingLabel: '1 medium fillet', servingGrams: 150 },
  { name: 'Chicken Thigh (cooked)', category: 'protein', base: 'nonveg', calories: 209, protein: 26, carbs: 0, fats: 10.9, servingLabel: '1 thigh', servingGrams: 120 },
  { name: 'Chicken Sausage', category: 'protein', base: 'nonveg', calories: 172, protein: 14, carbs: 3, fats: 11, servingLabel: '2 sausages', servingGrams: 100 },
  { name: 'Whole Egg (raw)', category: 'protein', base: 'eggetarian', calories: 143, protein: 12.6, carbs: 0.7, fats: 9.5, servingLabel: '2 large eggs', servingGrams: 100, allergens: ['egg'] },
  { name: 'Egg White', category: 'protein', base: 'eggetarian', calories: 52, protein: 10.9, carbs: 0.7, fats: 0.2, servingLabel: '3 egg whites', servingGrams: 100, allergens: ['egg'] },
  { name: 'Paneer (full fat)', category: 'protein', base: 'vegetarian', calories: 296, protein: 18, carbs: 3.6, fats: 22, servingLabel: '1 small bowl', servingGrams: 100, allergens: ['milk'] },
  { name: 'Tofu (firm)', category: 'protein', base: 'vegan', calories: 144, protein: 17.3, carbs: 2.8, fats: 8.7, fiber: 2.3, servingLabel: '1 slab', servingGrams: 100, allergens: ['soy'] },
  { name: 'Soya Chunks (dry)', category: 'protein', base: 'vegan', calories: 345, protein: 52, carbs: 33, fats: 0.5, fiber: 13, servingLabel: '1 cup dry', servingGrams: 50, allergens: ['soy'] },
  { name: 'Greek Yogurt (non-fat)', category: 'protein', base: 'vegetarian', calories: 59, protein: 10, carbs: 3.6, fats: 0.4, servingLabel: '1 cup', servingGrams: 170, allergens: ['milk'] },
  { name: 'Cottage Cheese (low fat)', category: 'protein', base: 'vegetarian', calories: 82, protein: 11, carbs: 3.4, fats: 2.3, servingLabel: '1/2 cup', servingGrams: 110, allergens: ['milk'] },
  { name: 'Salmon (cooked)', category: 'protein', base: 'nonveg', calories: 208, protein: 22.1, carbs: 0, fats: 12.4, servingLabel: '1 fillet', servingGrams: 140, allergens: ['fish'] },
  { name: 'Tilapia (cooked)', category: 'protein', base: 'nonveg', calories: 128, protein: 26, carbs: 0, fats: 2.7, servingLabel: '1 fillet', servingGrams: 130, allergens: ['fish'] },
  { name: 'Rohu Fish (cooked)', category: 'protein', base: 'nonveg', calories: 143, protein: 22, carbs: 0, fats: 5.5, servingLabel: '1 piece', servingGrams: 120, allergens: ['fish'] },
  { name: 'Tuna (canned in water)', category: 'protein', base: 'nonveg', calories: 116, protein: 25.5, carbs: 0, fats: 0.8, servingLabel: '1 can drained', servingGrams: 100, allergens: ['fish'] },
  { name: 'Prawns (cooked)', category: 'protein', base: 'nonveg', calories: 99, protein: 24, carbs: 0.2, fats: 0.3, servingLabel: '1 cup', servingGrams: 100, allergens: ['shellfish'] },
  { name: 'Lean Beef Mince (cooked)', category: 'protein', base: 'nonveg', calories: 217, protein: 26, carbs: 0, fats: 11.7, servingLabel: '1 serving', servingGrams: 120 },
  { name: 'Mutton (cooked)', category: 'protein', base: 'nonveg', calories: 258, protein: 25.6, carbs: 0, fats: 16.5, servingLabel: '1 serving', servingGrams: 120 },

  // ------------------------------------------------------------ supplement
  { name: 'Whey Protein Isolate', category: 'supplement', base: 'vegetarian', calories: 370, protein: 80, carbs: 6, fats: 3, servingLabel: '1 scoop', servingGrams: 30, allergens: ['milk'] },
  { name: 'Whey Protein Concentrate', category: 'supplement', base: 'vegetarian', calories: 400, protein: 72, carbs: 10, fats: 7, servingLabel: '1 scoop', servingGrams: 32, allergens: ['milk'] },
  { name: 'Casein Protein Powder', category: 'supplement', base: 'vegetarian', calories: 360, protein: 75, carbs: 7, fats: 2, servingLabel: '1 scoop', servingGrams: 33, allergens: ['milk'] },
  { name: 'Plant Protein Powder (pea + rice)', category: 'supplement', base: 'vegan', calories: 375, protein: 75, carbs: 8, fats: 5, servingLabel: '1 scoop', servingGrams: 32 },
  { name: 'Creatine Monohydrate', category: 'supplement', base: 'vegan', calories: 0, protein: 0, carbs: 0, fats: 0, servingLabel: '1 tsp', servingGrams: 5 },
  { name: 'Protein Bar (generic)', category: 'supplement', base: 'vegetarian', calories: 380, protein: 30, carbs: 40, fats: 10, fiber: 5, servingLabel: '1 bar', servingGrams: 60, allergens: ['milk'] },

  // ------------------------------------------------------------------ grain
  { name: 'White Rice (cooked)', category: 'grain', base: 'vegan', calories: 130, protein: 2.7, carbs: 28, fats: 0.3, fiber: 0.4, servingLabel: '1 cup', servingGrams: 158 },
  { name: 'Brown Rice (cooked)', category: 'grain', base: 'vegan', calories: 123, protein: 2.7, carbs: 25.6, fats: 1, fiber: 1.6, servingLabel: '1 cup', servingGrams: 195 },
  { name: 'Basmati Rice (dry)', category: 'grain', base: 'vegan', calories: 356, protein: 8, carbs: 78, fats: 1, fiber: 1.3, servingLabel: '1/2 cup dry', servingGrams: 90 },
  { name: 'Roti / Chapati (whole wheat)', category: 'grain', base: 'vegan', calories: 264, protein: 9, carbs: 46, fats: 6, fiber: 5, servingLabel: '1 medium roti', servingGrams: 40, glutenFree: false, allergens: ['gluten'] },
  { name: 'Whole Wheat Flour (atta)', category: 'grain', base: 'vegan', calories: 340, protein: 12.6, carbs: 72, fats: 2.5, fiber: 10.7, servingLabel: '1 cup', servingGrams: 120, glutenFree: false, allergens: ['gluten'] },
  { name: 'Whole Wheat Bread', category: 'grain', base: 'vegan', calories: 247, protein: 13, carbs: 41, fats: 3.4, fiber: 7, servingLabel: '2 slices', servingGrams: 60, glutenFree: false, allergens: ['gluten'] },
  { name: 'Rolled Oats (dry)', category: 'grain', base: 'vegan', calories: 389, protein: 16.9, carbs: 66.3, fats: 6.9, fiber: 10.6, servingLabel: '1/2 cup', servingGrams: 40 },
  { name: 'Quinoa (cooked)', category: 'grain', base: 'vegan', calories: 120, protein: 4.4, carbs: 21.3, fats: 1.9, fiber: 2.8, servingLabel: '1 cup', servingGrams: 185 },
  { name: 'Poha / Flattened Rice (dry)', category: 'grain', base: 'vegan', calories: 346, protein: 6.6, carbs: 77, fats: 1.2, fiber: 2.4, servingLabel: '1 cup dry', servingGrams: 50 },
  { name: 'Pasta (cooked)', category: 'grain', base: 'vegan', calories: 158, protein: 5.8, carbs: 31, fats: 0.9, fiber: 1.8, servingLabel: '1 cup', servingGrams: 140, glutenFree: false, allergens: ['gluten'] },
  { name: 'Whole Wheat Pasta (cooked)', category: 'grain', base: 'vegan', calories: 124, protein: 5, carbs: 25, fats: 0.5, fiber: 3.9, servingLabel: '1 cup', servingGrams: 140, glutenFree: false, allergens: ['gluten'] },
  { name: 'Ragi Flour (finger millet)', category: 'grain', base: 'vegan', calories: 328, protein: 7.3, carbs: 72, fats: 1.3, fiber: 11.5, servingLabel: '1/2 cup', servingGrams: 60 },
  { name: 'Bajra Flour (pearl millet)', category: 'grain', base: 'vegan', calories: 361, protein: 11.6, carbs: 67, fats: 5, fiber: 11.3, servingLabel: '1/2 cup', servingGrams: 60 },
  { name: 'Corn Flakes', category: 'grain', base: 'vegan', calories: 357, protein: 7.5, carbs: 84, fats: 0.4, fiber: 3, servingLabel: '1 cup', servingGrams: 30 },
  { name: 'Rice Cakes', category: 'grain', base: 'vegan', calories: 387, protein: 8.2, carbs: 81.5, fats: 2.8, fiber: 4.2, servingLabel: '2 cakes', servingGrams: 18 },
  { name: 'Boiled Corn', category: 'grain', base: 'vegan', calories: 96, protein: 3.4, carbs: 21, fats: 1.5, fiber: 2.4, servingLabel: '1 cup', servingGrams: 160 },
  { name: 'Makhana / Fox Nuts', category: 'grain', base: 'vegan', calories: 347, protein: 9.7, carbs: 77, fats: 0.1, fiber: 14.5, servingLabel: '1 bowl', servingGrams: 30 },

  // ----------------------------------------------------------------- legume
  { name: 'Chickpeas / Chana (boiled)', category: 'legume', base: 'vegan', calories: 164, protein: 8.9, carbs: 27.4, fats: 2.6, fiber: 7.6, servingLabel: '1 cup', servingGrams: 164 },
  { name: 'Black Chana (boiled)', category: 'legume', base: 'vegan', calories: 160, protein: 9, carbs: 27, fats: 2.5, fiber: 8, servingLabel: '1 cup', servingGrams: 160 },
  { name: 'Kidney Beans / Rajma (boiled)', category: 'legume', base: 'vegan', calories: 127, protein: 8.7, carbs: 22.8, fats: 0.5, fiber: 6.4, servingLabel: '1 cup', servingGrams: 177 },
  { name: 'Toor Dal (cooked)', category: 'legume', base: 'vegan', calories: 116, protein: 7, carbs: 20, fats: 0.4, fiber: 5, servingLabel: '1 bowl', servingGrams: 150 },
  { name: 'Moong Dal (cooked)', category: 'legume', base: 'vegan', calories: 105, protein: 7, carbs: 19, fats: 0.4, fiber: 5.5, servingLabel: '1 bowl', servingGrams: 150 },
  { name: 'Masoor Dal (cooked)', category: 'legume', base: 'vegan', calories: 116, protein: 9, carbs: 20, fats: 0.4, fiber: 5.5, servingLabel: '1 bowl', servingGrams: 150 },
  { name: 'Chana Dal (cooked)', category: 'legume', base: 'vegan', calories: 120, protein: 7, carbs: 20, fats: 1, fiber: 5, servingLabel: '1 bowl', servingGrams: 150 },
  { name: 'Lentils (dry, generic)', category: 'legume', base: 'vegan', calories: 353, protein: 25, carbs: 60, fats: 1.1, fiber: 30.5, servingLabel: '1/2 cup dry', servingGrams: 95 },
  { name: 'Soybean (boiled)', category: 'legume', base: 'vegan', calories: 172, protein: 18.2, carbs: 8.4, fats: 9, fiber: 6, servingLabel: '1 cup', servingGrams: 172, allergens: ['soy'] },
  { name: 'Green Peas', category: 'legume', base: 'vegan', calories: 81, protein: 5.4, carbs: 14.5, fats: 0.4, fiber: 5.7, servingLabel: '1 cup', servingGrams: 145 },
  { name: 'Sprouted Moong', category: 'legume', base: 'vegan', calories: 105, protein: 8, carbs: 15, fats: 1, fiber: 4, servingLabel: '1 bowl', servingGrams: 100 },

  // -------------------------------------------------------------- vegetable
  { name: 'Broccoli', category: 'vegetable', base: 'vegan', calories: 34, protein: 2.8, carbs: 6.6, fats: 0.4, fiber: 2.6, servingLabel: '1 cup', servingGrams: 91 },
  { name: 'Spinach / Palak', category: 'vegetable', base: 'vegan', calories: 23, protein: 2.9, carbs: 3.6, fats: 0.4, fiber: 2.2, servingLabel: '1 bunch cooked', servingGrams: 100 },
  { name: 'Cauliflower', category: 'vegetable', base: 'vegan', calories: 25, protein: 1.9, carbs: 5, fats: 0.3, fiber: 2, servingLabel: '1 cup', servingGrams: 100 },
  { name: 'Carrot', category: 'vegetable', base: 'vegan', calories: 41, protein: 0.9, carbs: 9.6, fats: 0.2, fiber: 2.8, servingLabel: '1 medium', servingGrams: 60 },
  { name: 'Tomato', category: 'vegetable', base: 'vegan', calories: 18, protein: 0.9, carbs: 3.9, fats: 0.2, fiber: 1.2, servingLabel: '1 medium', servingGrams: 120 },
  { name: 'Onion', category: 'vegetable', base: 'vegan', calories: 40, protein: 1.1, carbs: 9.3, fats: 0.1, fiber: 1.7, servingLabel: '1 medium', servingGrams: 110 },
  { name: 'Cucumber', category: 'vegetable', base: 'vegan', calories: 15, protein: 0.7, carbs: 3.6, fats: 0.1, fiber: 0.5, servingLabel: '1 medium', servingGrams: 200 },
  { name: 'Capsicum / Bell Pepper', category: 'vegetable', base: 'vegan', calories: 26, protein: 1, carbs: 6, fats: 0.3, fiber: 2.1, servingLabel: '1 medium', servingGrams: 120 },
  { name: 'Cabbage', category: 'vegetable', base: 'vegan', calories: 25, protein: 1.3, carbs: 5.8, fats: 0.1, fiber: 2.5, servingLabel: '1 cup', servingGrams: 89 },
  { name: 'Bottle Gourd / Lauki', category: 'vegetable', base: 'vegan', calories: 14, protein: 0.6, carbs: 3.4, fats: 0.1, fiber: 0.5, servingLabel: '1 bowl', servingGrams: 150 },
  { name: 'Okra / Bhindi', category: 'vegetable', base: 'vegan', calories: 33, protein: 1.9, carbs: 7.5, fats: 0.2, fiber: 3.2, servingLabel: '1 cup', servingGrams: 100 },
  { name: 'Mushroom', category: 'vegetable', base: 'vegan', calories: 22, protein: 3.1, carbs: 3.3, fats: 0.3, fiber: 1, servingLabel: '1 cup', servingGrams: 96 },
  { name: 'Beetroot', category: 'vegetable', base: 'vegan', calories: 43, protein: 1.6, carbs: 9.6, fats: 0.2, fiber: 2.8, servingLabel: '1 medium', servingGrams: 100 },
  { name: 'Green Beans', category: 'vegetable', base: 'vegan', calories: 31, protein: 1.8, carbs: 7, fats: 0.2, fiber: 2.7, servingLabel: '1 cup', servingGrams: 100 },
  { name: 'Brinjal / Eggplant', category: 'vegetable', base: 'vegan', calories: 25, protein: 1, carbs: 5.9, fats: 0.2, fiber: 3, servingLabel: '1 cup', servingGrams: 100 },
  { name: 'Pumpkin', category: 'vegetable', base: 'vegan', calories: 26, protein: 1, carbs: 6.5, fats: 0.1, fiber: 0.5, servingLabel: '1 cup', servingGrams: 116 },
  { name: 'Bitter Gourd / Karela', category: 'vegetable', base: 'vegan', calories: 17, protein: 1, carbs: 3.7, fats: 0.2, fiber: 2.8, servingLabel: '1 cup', servingGrams: 100 },
  { name: 'Lettuce', category: 'vegetable', base: 'vegan', calories: 15, protein: 1.4, carbs: 2.9, fats: 0.2, fiber: 1.3, servingLabel: '2 cups', servingGrams: 100 },
  { name: 'Zucchini', category: 'vegetable', base: 'vegan', calories: 17, protein: 1.2, carbs: 3.1, fats: 0.3, fiber: 1, servingLabel: '1 cup', servingGrams: 124 },
  { name: 'Sweet Potato (boiled)', category: 'vegetable', base: 'vegan', calories: 90, protein: 2, carbs: 20.7, fats: 0.1, fiber: 3.3, servingLabel: '1 medium', servingGrams: 150 },
  { name: 'Potato (boiled)', category: 'vegetable', base: 'vegan', calories: 87, protein: 1.9, carbs: 20.1, fats: 0.1, fiber: 1.8, servingLabel: '1 medium', servingGrams: 150 },

  // ------------------------------------------------------------------ fruit
  { name: 'Banana', category: 'fruit', base: 'vegan', calories: 89, protein: 1.1, carbs: 22.8, fats: 0.3, fiber: 2.6, servingLabel: '1 medium', servingGrams: 118 },
  { name: 'Apple', category: 'fruit', base: 'vegan', calories: 52, protein: 0.3, carbs: 13.8, fats: 0.2, fiber: 2.4, servingLabel: '1 medium', servingGrams: 182 },
  { name: 'Orange', category: 'fruit', base: 'vegan', calories: 47, protein: 0.9, carbs: 11.8, fats: 0.1, fiber: 2.4, servingLabel: '1 medium', servingGrams: 130 },
  { name: 'Mango', category: 'fruit', base: 'vegan', calories: 60, protein: 0.8, carbs: 15, fats: 0.4, fiber: 1.6, servingLabel: '1 cup diced', servingGrams: 165 },
  { name: 'Papaya', category: 'fruit', base: 'vegan', calories: 43, protein: 0.5, carbs: 10.8, fats: 0.3, fiber: 1.7, servingLabel: '1 cup', servingGrams: 145 },
  { name: 'Watermelon', category: 'fruit', base: 'vegan', calories: 30, protein: 0.6, carbs: 7.6, fats: 0.2, fiber: 0.4, servingLabel: '1 cup', servingGrams: 152 },
  { name: 'Grapes', category: 'fruit', base: 'vegan', calories: 69, protein: 0.7, carbs: 18.1, fats: 0.2, fiber: 0.9, servingLabel: '1 cup', servingGrams: 151 },
  { name: 'Pomegranate', category: 'fruit', base: 'vegan', calories: 83, protein: 1.7, carbs: 18.7, fats: 1.2, fiber: 4, servingLabel: '1 cup', servingGrams: 174 },
  { name: 'Guava', category: 'fruit', base: 'vegan', calories: 68, protein: 2.6, carbs: 14.3, fats: 1, fiber: 5.4, servingLabel: '1 medium', servingGrams: 100 },
  { name: 'Strawberry', category: 'fruit', base: 'vegan', calories: 32, protein: 0.7, carbs: 7.7, fats: 0.3, fiber: 2, servingLabel: '1 cup', servingGrams: 152 },
  { name: 'Blueberry', category: 'fruit', base: 'vegan', calories: 57, protein: 0.7, carbs: 14.5, fats: 0.3, fiber: 2.4, servingLabel: '1 cup', servingGrams: 148 },
  { name: 'Pineapple', category: 'fruit', base: 'vegan', calories: 50, protein: 0.5, carbs: 13.1, fats: 0.1, fiber: 1.4, servingLabel: '1 cup', servingGrams: 165 },
  { name: 'Avocado', category: 'fruit', base: 'vegan', calories: 160, protein: 2, carbs: 8.5, fats: 14.7, fiber: 6.7, servingLabel: '1/2 medium', servingGrams: 100 },
  { name: 'Dates', category: 'fruit', base: 'vegan', calories: 282, protein: 2.5, carbs: 75, fats: 0.4, fiber: 8, servingLabel: '3 dates', servingGrams: 25 },

  // ------------------------------------------------------------------ dairy
  { name: 'Whole Milk', category: 'dairy', base: 'vegetarian', per: '100ml', calories: 61, protein: 3.2, carbs: 4.8, fats: 3.3, servingLabel: '1 glass', servingGrams: 250, allergens: ['milk'] },
  { name: 'Skim Milk', category: 'dairy', base: 'vegetarian', per: '100ml', calories: 34, protein: 3.4, carbs: 5, fats: 0.1, servingLabel: '1 glass', servingGrams: 250, allergens: ['milk'] },
  { name: 'Curd / Plain Yogurt', category: 'dairy', base: 'vegetarian', calories: 61, protein: 3.5, carbs: 4.7, fats: 3.3, servingLabel: '1 bowl', servingGrams: 150, allergens: ['milk'] },
  { name: 'Buttermilk / Chaas', category: 'dairy', base: 'vegetarian', per: '100ml', calories: 40, protein: 3.3, carbs: 4.8, fats: 0.9, servingLabel: '1 glass', servingGrams: 250, allergens: ['milk'] },
  { name: 'Cheddar Cheese', category: 'dairy', base: 'vegetarian', calories: 403, protein: 25, carbs: 1.3, fats: 33, servingLabel: '1 slice', servingGrams: 28, allergens: ['milk'] },
  { name: 'Mozzarella Cheese', category: 'dairy', base: 'vegetarian', calories: 300, protein: 22, carbs: 2.2, fats: 22, servingLabel: '1 slice', servingGrams: 28, allergens: ['milk'] },
  { name: 'Processed Cheese Slice', category: 'dairy', base: 'vegetarian', calories: 350, protein: 20, carbs: 2, fats: 28, servingLabel: '1 slice', servingGrams: 20, allergens: ['milk'] },

  // -------------------------------------------------------------------- fat
  { name: 'Butter', category: 'fat', base: 'vegetarian', calories: 717, protein: 0.9, carbs: 0.1, fats: 81, servingLabel: '1 tsp', servingGrams: 5, allergens: ['milk'] },
  { name: 'Ghee', category: 'fat', base: 'vegetarian', calories: 900, protein: 0, carbs: 0, fats: 100, servingLabel: '1 tsp', servingGrams: 5, allergens: ['milk'] },
  { name: 'Olive Oil', category: 'fat', base: 'vegan', calories: 884, protein: 0, carbs: 0, fats: 100, servingLabel: '1 tbsp', servingGrams: 14 },
  { name: 'Coconut Oil', category: 'fat', base: 'vegan', calories: 862, protein: 0, carbs: 0, fats: 100, servingLabel: '1 tbsp', servingGrams: 14 },
  { name: 'Mustard Oil', category: 'fat', base: 'vegan', calories: 884, protein: 0, carbs: 0, fats: 100, servingLabel: '1 tbsp', servingGrams: 14 },
  { name: 'Sunflower Oil', category: 'fat', base: 'vegan', calories: 884, protein: 0, carbs: 0, fats: 100, servingLabel: '1 tbsp', servingGrams: 14 },

  // --------------------------------------------------------------- nut_seed
  { name: 'Almonds', category: 'nut_seed', base: 'vegan', calories: 579, protein: 21.2, carbs: 21.6, fats: 49.9, fiber: 12.5, servingLabel: '10 almonds', servingGrams: 14, allergens: ['tree_nuts'] },
  { name: 'Walnuts', category: 'nut_seed', base: 'vegan', calories: 654, protein: 15.2, carbs: 13.7, fats: 65.2, fiber: 6.7, servingLabel: '5 halves', servingGrams: 15, allergens: ['tree_nuts'] },
  { name: 'Cashews', category: 'nut_seed', base: 'vegan', calories: 553, protein: 18.2, carbs: 30.2, fats: 43.9, fiber: 3.3, servingLabel: '10 cashews', servingGrams: 17, allergens: ['tree_nuts'] },
  { name: 'Pistachios', category: 'nut_seed', base: 'vegan', calories: 560, protein: 20.2, carbs: 27.2, fats: 45.3, fiber: 10.3, servingLabel: '1 handful', servingGrams: 28, allergens: ['tree_nuts'] },
  { name: 'Peanuts', category: 'nut_seed', base: 'vegan', calories: 567, protein: 25.8, carbs: 16.1, fats: 49.2, fiber: 8.5, servingLabel: '1 handful', servingGrams: 28, allergens: ['peanuts'] },
  { name: 'Peanut Butter', category: 'nut_seed', base: 'vegan', calories: 588, protein: 25, carbs: 20, fats: 50, fiber: 6, servingLabel: '1 tbsp', servingGrams: 16, allergens: ['peanuts'] },
  { name: 'Chia Seeds', category: 'nut_seed', base: 'vegan', calories: 486, protein: 16.5, carbs: 42.1, fats: 30.7, fiber: 34.4, servingLabel: '1 tbsp', servingGrams: 12 },
  { name: 'Flax Seeds', category: 'nut_seed', base: 'vegan', calories: 534, protein: 18.3, carbs: 28.9, fats: 42.2, fiber: 27.3, servingLabel: '1 tbsp', servingGrams: 10 },
  { name: 'Pumpkin Seeds', category: 'nut_seed', base: 'vegan', calories: 559, protein: 30.2, carbs: 10.7, fats: 49, fiber: 6, servingLabel: '1 tbsp', servingGrams: 15 },
  { name: 'Sunflower Seeds', category: 'nut_seed', base: 'vegan', calories: 584, protein: 20.8, carbs: 20, fats: 51.5, fiber: 8.6, servingLabel: '1 tbsp', servingGrams: 15 },
  { name: 'Desiccated Coconut', category: 'nut_seed', base: 'vegan', calories: 660, protein: 6.9, carbs: 24, fats: 64.5, fiber: 16, servingLabel: '2 tbsp', servingGrams: 20 },
  { name: 'Dark Chocolate (70%)', category: 'nut_seed', base: 'vegetarian', calories: 598, protein: 7.8, carbs: 45.9, fats: 42.6, fiber: 10.9, servingLabel: '2 squares', servingGrams: 20, allergens: ['milk'] },

  // --------------------------------------------------------------- beverage
  { name: 'Black Coffee (no sugar)', category: 'beverage', base: 'vegan', per: '100ml', calories: 2, protein: 0.3, carbs: 0, fats: 0, servingLabel: '1 cup', servingGrams: 240 },
  { name: 'Green Tea (no sugar)', category: 'beverage', base: 'vegan', per: '100ml', calories: 1, protein: 0, carbs: 0.2, fats: 0, servingLabel: '1 cup', servingGrams: 240 },
  { name: 'Coconut Water', category: 'beverage', base: 'vegan', per: '100ml', calories: 19, protein: 0.7, carbs: 3.7, fats: 0.2, fiber: 1.1, servingLabel: '1 glass', servingGrams: 240 },
  { name: 'Orange Juice (fresh)', category: 'beverage', base: 'vegan', per: '100ml', calories: 45, protein: 0.7, carbs: 10.4, fats: 0.2, servingLabel: '1 glass', servingGrams: 240 },

  // --------------------------------------------------------------- prepared
  { name: 'Dal Tadka', category: 'prepared', base: 'vegetarian', calories: 116, protein: 5, carbs: 13, fats: 5, fiber: 3.5, servingLabel: '1 bowl', servingGrams: 200 },
  { name: 'Chicken Curry', category: 'prepared', base: 'nonveg', calories: 145, protein: 13, carbs: 4, fats: 8, servingLabel: '1 bowl', servingGrams: 200 },
  { name: 'Rajma Masala', category: 'prepared', base: 'vegan', calories: 140, protein: 6, carbs: 18, fats: 4.5, fiber: 5, servingLabel: '1 bowl', servingGrams: 200 },
  { name: 'Chole Masala', category: 'prepared', base: 'vegan', calories: 155, protein: 7, carbs: 20, fats: 5, fiber: 6, servingLabel: '1 bowl', servingGrams: 200 },
  { name: 'Paneer Butter Masala', category: 'prepared', base: 'vegetarian', calories: 230, protein: 8, carbs: 10, fats: 18, servingLabel: '1 bowl', servingGrams: 200, allergens: ['milk'] },
  { name: 'Veg Pulao', category: 'prepared', base: 'vegan', calories: 165, protein: 3.5, carbs: 25, fats: 5.5, fiber: 2, servingLabel: '1 plate', servingGrams: 250 },
  { name: 'Moong Dal Khichdi', category: 'prepared', base: 'vegan', calories: 120, protein: 4.5, carbs: 19, fats: 2.5, fiber: 2.5, servingLabel: '1 bowl', servingGrams: 250 },
  { name: 'Sambar', category: 'prepared', base: 'vegan', calories: 70, protein: 3, carbs: 9, fats: 2.5, fiber: 2.5, servingLabel: '1 bowl', servingGrams: 200 },
  { name: 'Idli', category: 'prepared', base: 'vegan', calories: 132, protein: 4, carbs: 25, fats: 0.5, fiber: 1.5, servingLabel: '2 idli', servingGrams: 100 },
  { name: 'Plain Dosa', category: 'prepared', base: 'vegan', calories: 168, protein: 4, carbs: 29, fats: 4, fiber: 1.5, servingLabel: '1 dosa', servingGrams: 100 },
  { name: 'Upma', category: 'prepared', base: 'vegan', calories: 160, protein: 3.5, carbs: 25, fats: 5, fiber: 2, servingLabel: '1 bowl', servingGrams: 200, glutenFree: false, allergens: ['gluten'] },
  { name: 'Besan Chilla', category: 'prepared', base: 'vegan', calories: 170, protein: 8, carbs: 18, fats: 7, fiber: 4, servingLabel: '2 chilla', servingGrams: 150 },
  { name: 'Omelette (2 egg)', category: 'prepared', base: 'eggetarian', calories: 154, protein: 11, carbs: 1, fats: 12, servingLabel: '1 omelette', servingGrams: 120, allergens: ['egg'] },
  { name: 'Grilled Chicken Salad', category: 'prepared', base: 'nonveg', calories: 120, protein: 14, carbs: 5, fats: 5, fiber: 2, servingLabel: '1 plate', servingGrams: 250 },
];

export default foods;
