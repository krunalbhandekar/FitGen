import mongoose from 'mongoose';

const { Schema } = mongoose;

export const FOOD_CATEGORIES = [
  'protein',
  'grain',
  'legume',
  'vegetable',
  'fruit',
  'dairy',
  'fat',
  'nut_seed',
  'beverage',
  'supplement',
  'prepared',
];

export const DIET_TAGS = ['vegetarian', 'eggetarian', 'vegan', 'gluten_free', 'keto'];

/**
 * Nutrition is stored per 100 g (or per 100 ml for liquids) so the diet
 * generator can scale any serving size deterministically. Calories are stored
 * rather than recomputed, but the seeder validates them against the
 * 4/4/9 kcal macro math to catch bad data.
 */
const foodSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    category: { type: String, enum: FOOD_CATEGORIES, required: true, index: true },

    per: { type: String, enum: ['100g', '100ml'], default: '100g' },
    calories: { type: Number, required: true, min: 0 },
    protein: { type: Number, required: true, min: 0 },
    carbs: { type: Number, required: true, min: 0 },
    fats: { type: Number, required: true, min: 0 },
    fiber: { type: Number, default: 0, min: 0 },

    // Human-friendly portion used when rendering a meal plan.
    servingLabel: { type: String },
    servingGrams: { type: Number, min: 1 },

    dietTags: { type: [String], enum: DIET_TAGS, default: [], index: true },
    allergens: { type: [String], default: [] },

    source: { type: String, default: 'fitgen-curated' },
  },
  { timestamps: true },
);

foodSchema.index({ name: 'text', category: 'text' });

export const Food = mongoose.model('Food', foodSchema);
