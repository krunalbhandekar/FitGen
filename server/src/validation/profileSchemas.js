import { z } from 'zod';
import {
  ACTIVITY_LEVELS,
  DIET_TYPES,
  GOALS,
  INJURY_AREAS,
  INJURY_SEVERITIES,
  SPLIT_TYPES,
} from '../models/User.js';

/**
 * Server-side validation for profile writes.
 *
 * The client validates too (React Hook Form) for immediate feedback, but that
 * is a UX affordance — this is the boundary that actually protects the data,
 * since anyone can POST directly to the API.
 */

const MIN_AGE = 13;
const MAX_AGE = 100;

const dateOfBirth = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be a valid date')
  .transform((value) => new Date(value))
  .refine((date) => date < new Date(), 'Date of birth cannot be in the future')
  .refine((date) => {
    const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return age >= MIN_AGE && age <= MAX_AGE;
  }, `Age must be between ${MIN_AGE} and ${MAX_AGE}`);

const injury = z.object({
  area: z.enum(INJURY_AREAS),
  severity: z.enum(INJURY_SEVERITIES),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

/**
 * Free-text lists (allergies, disliked foods) are trimmed, de-duplicated,
 * lower-cased and capped — they are matched against food names in Phase 3, and
 * an unbounded list would be both a bad prompt and an abuse vector.
 */
const tagList = (max = 25) =>
  z
    .array(z.string().trim().min(1).max(60))
    .max(max)
    .transform((list) => [...new Set(list.map((item) => item.toLowerCase()))]);

/** Individual field rules, reused by both the full and partial schemas. */
const fields = {
  fullName: z.string().trim().min(1).max(80),
  gender: z.enum(['male', 'female', 'other']),
  dateOfBirth,
  heightCm: z.coerce.number().min(80).max(260),
  weightKg: z.coerce.number().min(25).max(350),

  goal: z.enum(GOALS),
  targetWeightKg: z.coerce.number().min(25).max(350),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  trainingDaysPerWeek: z.coerce.number().int().min(1).max(7),
  preferredSplit: z.enum(SPLIT_TYPES),

  availableEquipment: z.array(z.string().trim().min(1)).min(1).max(30),

  dietType: z.enum(DIET_TYPES),
  allergies: tagList(),
  dislikedFoods: tagList(),
  mealsPerDay: z.coerce.number().int().min(2).max(8),

  injuries: z.array(injury).max(12),
};

/**
 * Cross-field rules that only make sense once several values are known.
 * Applied to both schemas so a partial edit cannot sneak past them.
 */
const withCrossFieldRules = (schema) =>
  schema
    .refine(
      (data) =>
        !(
          data.goal === 'lose_fat' &&
          data.targetWeightKg &&
          data.weightKg &&
          data.targetWeightKg > data.weightKg
        ),
      {
        message: 'A fat-loss goal needs a target weight below your current weight',
        path: ['targetWeightKg'],
      },
    )
    .refine(
      (data) =>
        !(
          data.goal === 'build_muscle' &&
          data.targetWeightKg &&
          data.weightKg &&
          data.targetWeightKg < data.weightKg
        ),
      {
        message: 'A muscle-building goal needs a target weight at or above your current weight',
        path: ['targetWeightKg'],
      },
    )
    .refine(
      (data) =>
        !(
          data.preferredSplit === 'ppl' &&
          data.trainingDaysPerWeek &&
          data.trainingDaysPerWeek < 3
        ),
      {
        message: 'Push/Pull/Legs needs at least 3 training days per week',
        path: ['preferredSplit'],
      },
    )
    .refine(
      (data) =>
        !(
          data.preferredSplit === 'upper_lower' &&
          data.trainingDaysPerWeek &&
          data.trainingDaysPerWeek < 2
        ),
      {
        message: 'Upper/Lower needs at least 2 training days per week',
        path: ['preferredSplit'],
      },
    );

/** Onboarding: every plan-critical field must be supplied at once. */
export const onboardingSchema = withCrossFieldRules(
  z.object({
    fullName: fields.fullName.optional(),
    gender: fields.gender,
    dateOfBirth: fields.dateOfBirth,
    heightCm: fields.heightCm,
    weightKg: fields.weightKg,

    goal: fields.goal,
    targetWeightKg: fields.targetWeightKg.optional(),
    activityLevel: fields.activityLevel,
    trainingDaysPerWeek: fields.trainingDaysPerWeek,
    preferredSplit: fields.preferredSplit,

    availableEquipment: fields.availableEquipment,

    dietType: fields.dietType,
    allergies: fields.allergies.optional().default([]),
    dislikedFoods: fields.dislikedFoods.optional().default([]),
    mealsPerDay: fields.mealsPerDay,

    injuries: fields.injuries.optional().default([]),
  }),
);

/** Profile edit: any subset, but at least one field. */
export const profileUpdateSchema = withCrossFieldRules(
  z
    .object(
      Object.fromEntries(
        Object.entries(fields).map(([key, schema]) => [key, schema.optional()]),
      ),
    )
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Provide at least one field to update',
    }),
);

/** Unsaved preview: only what the formulas need. */
export const targetsPreviewSchema = z.object({
  gender: fields.gender,
  dateOfBirth: fields.dateOfBirth,
  heightCm: fields.heightCm,
  weightKg: fields.weightKg,
  activityLevel: fields.activityLevel,
  goal: fields.goal,
  targetWeightKg: fields.targetWeightKg.optional(),
});

/** Flattens a ZodError into `{ field: message }` for the API response. */
export const formatZodError = (error) =>
  Object.fromEntries(
    error.issues.map((issue) => [issue.path.join('.') || '_root', issue.message]),
  );
