import { Exercise } from '../models/Exercise.js';
import {
  ACTIVITY_LEVELS,
  DIET_TYPES,
  GOALS,
  INJURY_AREAS,
  INJURY_SEVERITIES,
  SPLIT_TYPES,
} from '../models/User.js';
import {
  ACTIVITY_LABELS,
  ACTIVITY_MULTIPLIERS,
  GOAL_ADJUSTMENTS,
  GOAL_LABELS,
  calculateTargets,
  detectPlanRelevantChanges,
  profileCompleteness,
} from '../services/fitnessCalc.js';
import {
  formatZodError,
  onboardingSchema,
  profileUpdateSchema,
  targetsPreviewSchema,
} from '../validation/profileSchemas.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/** Parses with a zod schema, converting failures into a 400 with field details. */
const parseOrThrow = (schema, payload) => {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Validation failed', formatZodError(result.error));
  }
  return result.data;
};

/**
 * Builds the full profile response: the stored profile, the computed targets
 * and how complete it is. One endpoint so the client never has to stitch
 * together a half-loaded view.
 */
const buildProfileResponse = (user) => {
  const profile = user.profile?.toObject
    ? user.profile.toObject()
    : (user.profile ?? {});

  return {
    profile,
    targets: calculateTargets(profile),
    completeness: profileCompleteness(profile),
    onboardingCompleted: user.onboardingCompleted,
    profileVersion: user.profileVersion,
    planRegeneration: {
      required: user.planRegeneration?.required ?? false,
      reasons: user.planRegeneration?.reasons ?? [],
      flaggedAt: user.planRegeneration?.flaggedAt,
    },
  };
};

/** GET /api/profile */
export const getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: buildProfileResponse(req.user) });
});

/**
 * GET /api/profile/options
 *
 * The vocabulary the onboarding wizard renders. Equipment comes from a DISTINCT
 * over the seeded exercise collection rather than a hard-coded list, so a user
 * can never select equipment that no exercise actually uses — the same
 * grounding principle the AI layer follows in Phase 3.
 */
export const getProfileOptions = asyncHandler(async (_req, res) => {
  const equipment = (await Exercise.distinct('equipment'))
    .filter(Boolean)
    .sort();

  res.json({
    success: true,
    data: {
      genders: ['male', 'female', 'other'],
      goals: GOALS.map((value) => ({
        value,
        label: GOAL_LABELS[value],
        calorieAdjustmentPercent: Math.round((GOAL_ADJUSTMENTS[value] ?? 0) * 100),
      })),
      activityLevels: ACTIVITY_LEVELS.map((value) => ({
        value,
        label: ACTIVITY_LABELS[value],
        multiplier: ACTIVITY_MULTIPLIERS[value],
      })),
      splits: SPLIT_TYPES.map((value) => ({
        value,
        label: {
          ppl: 'Push / Pull / Legs',
          upper_lower: 'Upper / Lower',
          bro_split: 'Bro split (one muscle per day)',
          full_body: 'Full body',
        }[value],
        minDays: { ppl: 3, upper_lower: 2, bro_split: 4, full_body: 2 }[value],
      })),
      equipment,
      dietTypes: DIET_TYPES,
      injuryAreas: INJURY_AREAS,
      injurySeverities: INJURY_SEVERITIES,
    },
  });
});

/**
 * POST /api/profile/targets/preview
 *
 * Computes targets without saving, so the wizard can show live BMR/TDEE/macro
 * figures as the user types. Deliberately does not touch the database.
 */
export const previewTargets = asyncHandler(async (req, res) => {
  const data = parseOrThrow(targetsPreviewSchema, req.body);
  res.json({ success: true, data: calculateTargets(data) });
});

/**
 * PUT /api/profile/onboarding
 *
 * One-time wizard submission. Idempotent: re-submitting overwrites the profile
 * rather than erroring, which matters because a user can refresh the final step.
 */
export const completeOnboarding = asyncHandler(async (req, res) => {
  const data = parseOrThrow(onboardingSchema, req.body);
  const user = req.user;

  Object.assign(user.profile, data);

  // Fall back to the Google display name so downstream views always have one.
  if (!user.profile.fullName) user.profile.fullName = user.name;

  const wasAlreadyComplete = user.onboardingCompleted;
  user.onboardingCompleted = true;
  user.onboardingCompletedAt = user.onboardingCompletedAt ?? new Date();
  user.profileVersion += 1;

  // A first-time onboarding has no plan yet, so there is nothing stale to flag.
  // Re-running it after the fact does invalidate any existing plan.
  if (wasAlreadyComplete) {
    user.planRegeneration = {
      required: true,
      reasons: ['Onboarding was completed again'],
      flaggedAt: new Date(),
    };
  }

  await user.save();

  res.status(wasAlreadyComplete ? 200 : 201).json({
    success: true,
    message: 'Profile saved',
    data: buildProfileResponse(user),
    user: user.toPublicJSON(),
  });
});

/**
 * PATCH /api/profile
 *
 * Ongoing edits. Only bumps `profileVersion` and raises the regeneration flag
 * when a *plan-relevant* field actually changed value — editing a display name,
 * or re-saving the same values, must not invalidate a generated plan.
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const data = parseOrThrow(profileUpdateSchema, req.body);
  const user = req.user;

  const before = user.profile?.toObject
    ? user.profile.toObject()
    : { ...(user.profile ?? {}) };

  const changedFields = detectPlanRelevantChanges(before, data);

  Object.assign(user.profile, data);

  if (changedFields.length > 0) {
    user.profileVersion += 1;

    const existingReasons = user.onboardingCompleted
      ? (user.planRegeneration?.reasons ?? [])
      : [];

    user.planRegeneration = {
      // Nothing to regenerate until the profile has been completed once.
      required: user.onboardingCompleted,
      reasons: [...new Set([...existingReasons, ...changedFields])],
      flaggedAt: new Date(),
    };
  }

  await user.save();

  res.json({
    success: true,
    message: changedFields.length
      ? `Updated. ${changedFields.length} plan-relevant field${
          changedFields.length > 1 ? 's' : ''
        } changed.`
      : 'Updated.',
    changedFields,
    data: buildProfileResponse(user),
    user: user.toPublicJSON(),
  });
});

/**
 * POST /api/profile/regeneration/acknowledge
 *
 * Clears the stale-plan flag. In Phase 1–2 this is the user dismissing the
 * banner; from Phase 3 the plan generator will call the same logic after it
 * successfully rebuilds a plan.
 */
export const acknowledgeRegeneration = asyncHandler(async (req, res) => {
  const user = req.user;
  user.planRegeneration = { required: false, reasons: [], flaggedAt: undefined };
  await user.save();

  res.json({
    success: true,
    message: 'Regeneration flag cleared',
    data: buildProfileResponse(user),
  });
});
