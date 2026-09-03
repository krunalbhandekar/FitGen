import mongoose from 'mongoose';

const { Schema } = mongoose;

export const GOALS = ['lose_fat', 'build_muscle', 'recomp', 'maintain', 'gain_strength'];
export const ACTIVITY_LEVELS = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];
export const SPLIT_TYPES = ['ppl', 'upper_lower', 'bro_split', 'full_body'];
export const DIET_TYPES = ['omnivore', 'vegetarian', 'eggetarian', 'vegan', 'keto'];

/**
 * Injury areas the user can declare. Chosen to map onto the seeded exercise
 * DB's muscle groups plus the joints that actually gate exercise selection, so
 * Phase 3's injury-aware substitution can filter on them directly.
 */
export const INJURY_AREAS = [
  'shoulder',
  'elbow',
  'wrist',
  'neck',
  'upper_back',
  'lower_back',
  'hip',
  'knee',
  'ankle',
  'chest',
  'hamstring',
  'groin',
  'calf',
];

export const INJURY_SEVERITIES = ['mild', 'moderate', 'severe'];

/**
 * Profile is the single source of truth for plan generation (Phase 2+).
 * It lives embedded on the user because it is always read alongside the user
 * and is small; `profileVersion` bumps whenever any plan-relevant field
 * changes so generated plans can record which profile version produced them.
 */
const profileSchema = new Schema(
  {
    // Basic info
    fullName: { type: String, trim: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    heightCm: { type: Number, min: 80, max: 260 },
    weightKg: { type: Number, min: 25, max: 350 },

    // Goals
    goal: { type: String, enum: GOALS },
    targetWeightKg: { type: Number, min: 25, max: 350 },
    activityLevel: { type: String, enum: ACTIVITY_LEVELS },
    trainingDaysPerWeek: { type: Number, min: 1, max: 7 },
    preferredSplit: { type: String, enum: SPLIT_TYPES },

    // Equipment — matches the `equipment` field of the seeded exercise DB
    availableEquipment: { type: [String], default: [] },

    // Diet
    dietType: { type: String, enum: DIET_TYPES },
    allergies: { type: [String], default: [] },
    dislikedFoods: { type: [String], default: [] },
    mealsPerDay: { type: Number, min: 2, max: 8 },

    // Injuries — drives injury-aware exercise substitution (Phase 3)
    injuries: {
      type: [
        {
          _id: false,
          area: { type: String, enum: INJURY_AREAS, required: true },
          severity: { type: String, enum: INJURY_SEVERITIES, required: true },
          notes: { type: String, maxlength: 300 },
        },
      ],
      default: [],
    },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },

    authProvider: {
      type: String,
      enum: ['google'],
      default: 'google',
    },

    // Google has already verified the address; kept explicit for the RBAC story.
    emailVerified: { type: Boolean, default: true },

    onboardingCompleted: { type: Boolean, default: false },
    onboardingCompletedAt: { type: Date },
    profile: { type: profileSchema, default: () => ({}) },
    profileVersion: { type: Number, default: 0 },

    /**
     * Set whenever a plan-relevant profile field changes. Phase 3 reads this to
     * decide whether an existing workout/diet plan is stale, and clears it after
     * regenerating. Storing the reasons lets the UI tell the user *why* their
     * plan needs rebuilding rather than showing an unexplained banner.
     */
    planRegeneration: {
      required: { type: Boolean, default: false },
      reasons: { type: [String], default: [] },
      flaggedAt: { type: Date },
    },

    /**
     * Set when a role is changed by an administrator through the UI.
     *
     * Informational: it distinguishes a role granted deliberately from one that
     * was simply never changed, which the admin roster surfaces. Sign-in does
     * not touch roles at all, so nothing overrides an administrator's decision.
     */
    roleManagedAt: { type: Date },
    roleManagedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    /**
     * Audit trail for role changes. Privilege escalation should never be
     * anonymous, so every change records who made it and when.
     */
    roleHistory: {
      type: [
        {
          _id: false,
          from: { type: String, enum: ['user', 'admin'] },
          to: { type: String, enum: ['user', 'admin'] },
          changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          changedByEmail: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    avatarUrl: this.avatarUrl,
    role: this.role,
    authProvider: this.authProvider,
    emailVerified: this.emailVerified,
    onboardingCompleted: this.onboardingCompleted,
    onboardingCompletedAt: this.onboardingCompletedAt,
    profile: this.profile ?? {},
    profileVersion: this.profileVersion,
    roleManagedAt: this.roleManagedAt,
    planRegeneration: {
      required: this.planRegeneration?.required ?? false,
      reasons: this.planRegeneration?.reasons ?? [],
      flaggedAt: this.planRegeneration?.flaggedAt,
    },
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

export const User = mongoose.model('User', userSchema);
