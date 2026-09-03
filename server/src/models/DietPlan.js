import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A generated diet plan.
 *
 * Every macro stored here was recomputed by the server from the foods
 * collection — the LLM's own numbers are never persisted. `variance` records
 * how far the finished plan landed from the deterministic targets, which is
 * surfaced in the UI rather than hidden.
 */
const mealItemSchema = new Schema(
  {
    _id: false,
    slug: { type: String, required: true },
    name: { type: String, required: true },
    category: String,
    grams: { type: Number, required: true, min: 1 },
    unit: { type: String, enum: ['g', 'ml'], default: 'g' },
    servingLabel: String,
    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fats: { type: Number, required: true },
    fiber: { type: Number, default: 0 },
  },
  { _id: false },
);

const macroTotalsSchema = new Schema(
  {
    _id: false,
    calories: Number,
    protein: Number,
    carbs: Number,
    fats: Number,
    fiber: Number,
  },
  { _id: false },
);

const mealSchema = new Schema(
  {
    order: { type: Number, required: true },
    name: { type: String, required: true },
    targetCalories: Number,
    items: { type: [mealItemSchema], default: [] },
    totals: macroTotalsSchema,
  },
  { _id: false },
);

const dietPlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profileVersion: { type: Number, required: true },
    version: { type: Number, required: true, default: 1 },
    isActive: { type: Boolean, default: true, index: true },

    // Snapshot of the targets this plan was built against, so the plan stays
    // interpretable even after the user's profile changes.
    targets: {
      calories: Number,
      protein: Number,
      carbs: Number,
      fats: Number,
    },

    meals: { type: [mealSchema], default: [] },
    dailyTotals: macroTotalsSchema,
    variance: {
      calories: Number,
      protein: Number,
      carbs: Number,
      fats: Number,
      caloriePercent: Number,
    },

    excludedFoods: {
      type: [{ _id: false, slug: String, name: String, reason: String }],
      default: [],
    },
    candidatePoolSize: Number,

    generation: {
      generatedBy: { type: String, enum: ['groq', 'hybrid', 'fallback'], required: true },
      model: String,
      attempts: Number,
      durationMs: Number,
      warnings: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

dietPlanSchema.index({ userId: 1, isActive: 1, createdAt: -1 });

export const DietPlan = mongoose.model('DietPlan', dietPlanSchema);
