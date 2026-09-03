import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A generated workout plan.
 *
 * Plans are versioned rather than overwritten: `profileVersion` records which
 * profile produced this plan, so the app can tell when a plan has gone stale,
 * and history is preserved for the report's "adaptive system" story.
 */
const planExerciseSchema = new Schema(
  {
    _id: false,
    order: { type: Number, required: true },
    // Always a slug that exists in the exercises collection — enforced by the
    // grounding step in workoutGenerator.js.
    slug: { type: String, required: true },
    name: { type: String, required: true },
    primaryMuscles: { type: [String], default: [] },
    equipment: String,
    mechanic: String,
    sets: { type: Number, required: true, min: 1, max: 10 },
    reps: { type: String, required: true },
    restSeconds: { type: Number, required: true, min: 15, max: 600 },
    note: String,
    caution: String,
  },
  { _id: false },
);

const planDaySchema = new Schema(
  {
    dayIndex: { type: Number, required: true },
    key: String,
    name: { type: String, required: true },
    focus: { type: [String], default: [] },
    description: String,
    candidatePoolSize: Number,
    // True when injuries left no safe resistance work for this day.
    isRecoveryDay: { type: Boolean, default: false },
    exercises: { type: [planExerciseSchema], default: [] },
  },
  { _id: false },
);

const workoutPlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profileVersion: { type: Number, required: true },
    version: { type: Number, required: true, default: 1 },
    isActive: { type: Boolean, default: true, index: true },

    splitType: { type: String, required: true },
    daysPerWeek: { type: Number, required: true },
    goal: { type: String, required: true },

    days: { type: [planDaySchema], default: [] },

    safetyNotes: { type: [String], default: [] },
    excludedForInjury: {
      type: [{ _id: false, slug: String, name: String, reason: String, area: String }],
      default: [],
    },
    guidelines: { type: Schema.Types.Mixed },

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

// Fast lookup of "the plan to show this user right now".
workoutPlanSchema.index({ userId: 1, isActive: 1, createdAt: -1 });

export const WorkoutPlan = mongoose.model('WorkoutPlan', workoutPlanSchema);
