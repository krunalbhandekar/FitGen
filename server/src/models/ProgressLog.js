import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A body-metrics check-in: weight, optional circumference measurements, and the
 * body-fat estimate derived from them.
 *
 * `bodyFatPercent` is stored rather than computed on read because it depends on
 * the user's height and sex *at the time of measurement* — recomputing later
 * against a changed profile would silently rewrite history.
 */
const measurementsSchema = new Schema(
  {
    _id: false,
    neckCm: { type: Number, min: 20, max: 70 },
    waistCm: { type: Number, min: 40, max: 200 },
    hipCm: { type: Number, min: 50, max: 200 },
    chestCm: { type: Number, min: 50, max: 200 },
    armCm: { type: Number, min: 15, max: 80 },
    thighCm: { type: Number, min: 25, max: 100 },
    calfCm: { type: Number, min: 20, max: 70 },
  },
  { _id: false },
);

const progressLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },

    weightKg: { type: Number, min: 25, max: 350 },
    measurements: { type: measurementsSchema, default: () => ({}) },

    // Derived from the measurements above via the Navy method.
    bodyFatPercent: { type: Number, min: 2, max: 70 },
    bodyFatCategory: String,
    leanMassKg: Number,
    fatMassKg: Number,
    waistToHeightRatio: Number,

    // Height and sex used for the estimate, so it stays reproducible.
    estimatedWith: {
      heightCm: Number,
      gender: String,
    },

    notes: { type: String, maxlength: 500 },
    photoUrl: String,
  },
  { timestamps: true },
);

progressLogSchema.index({ userId: 1, date: -1 });
// One check-in per user per day: a second write to the same date updates it.
progressLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const ProgressLog = mongoose.model('ProgressLog', progressLogSchema);
