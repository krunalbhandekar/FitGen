import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Mirrors the `free-exercise-db` record shape so seeded data stays faithful to
 * the verified source. AI generation (Phase 3) may only reference `slug` values
 * that exist in this collection — that is the grounding contract.
 */
const exerciseSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },

    force: { type: String, enum: ['push', 'pull', 'static', null] },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'expert'],
      index: true,
    },
    mechanic: { type: String, enum: ['compound', 'isolation', null] },
    equipment: { type: String, index: true },
    category: { type: String, index: true },

    primaryMuscles: { type: [String], default: [], index: true },
    secondaryMuscles: { type: [String], default: [] },

    instructions: { type: [String], default: [] },

    // Absolute URLs resolved at seed time from the upstream repo.
    images: { type: [String], default: [] },
    // Demo lookup link (upstream dataset ships images, not hosted video).
    demoUrl: { type: String },

    source: { type: String, default: 'free-exercise-db' },
  },
  { timestamps: true },
);

// Powers the exercise-library search box.
exerciseSchema.index({ name: 'text', primaryMuscles: 'text', equipment: 'text' });

export const Exercise = mongoose.model('Exercise', exerciseSchema);
