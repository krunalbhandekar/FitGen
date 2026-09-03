import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A logged training session — what the user *actually* performed, as distinct
 * from what the plan prescribed.
 *
 * The plan's prescription is copied onto each entry (`targetSets`,
 * `targetReps`, `prescribedWeightKg`) so a log stays interpretable after the
 * plan is regenerated. Without that snapshot, comparing performance to target
 * would silently change meaning whenever a new plan version appeared.
 */
const loggedSetSchema = new Schema(
  {
    _id: false,
    setNumber: { type: Number, required: true, min: 1, max: 20 },
    reps: { type: Number, required: true, min: 0, max: 500 },
    weightKg: { type: Number, default: 0, min: 0, max: 700 },
    // Rate of Perceived Exertion, 1-10. Optional: useful signal, extra friction.
    rpe: { type: Number, min: 1, max: 10 },
  },
  { _id: false },
);

const loggedExerciseSchema = new Schema(
  {
    _id: false,
    order: { type: Number, required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    primaryMuscles: { type: [String], default: [] },
    equipment: String,
    mechanic: String,

    // Snapshot of what was prescribed, for later comparison.
    targetSets: Number,
    targetReps: String,
    prescribedWeightKg: Number,

    sets: { type: [loggedSetSchema], default: [] },

    // Derived at write time so charts don't recompute across every document.
    volumeKg: { type: Number, default: 0 },
    topSetWeightKg: { type: Number, default: 0 },
    estimatedOneRepMaxKg: Number,

    skipped: { type: Boolean, default: false },
    notes: { type: String, maxlength: 300 },
  },
  { _id: false },
);

const workoutLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Which plan and day this session came from. Kept as loose references: a
    // log must survive its plan being superseded or deleted.
    planId: { type: Schema.Types.ObjectId, ref: 'WorkoutPlan' },
    planVersion: Number,
    dayIndex: Number,
    dayName: String,

    date: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, min: 1, max: 600 },

    exercises: { type: [loggedExerciseSchema], default: [] },

    totalVolumeKg: { type: Number, default: 0 },
    totalSets: { type: Number, default: 0 },
    totalReps: { type: Number, default: 0 },

    notes: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);

// Progress charts and the progression engine both read newest-first per user.
workoutLogSchema.index({ userId: 1, date: -1 });
// Per-exercise history lookups for progression.
workoutLogSchema.index({ userId: 1, 'exercises.slug': 1, date: -1 });

export const WorkoutLog = mongoose.model('WorkoutLog', workoutLogSchema);
