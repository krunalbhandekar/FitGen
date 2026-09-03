import { z } from 'zod';

/**
 * Validation for Phase 4 writes. As with the profile schemas, the client
 * validates for feedback and this validates for correctness — anyone can POST
 * directly to the API.
 */

/** Rejects dates in the future or absurdly far past. */
const logDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Must be a valid date')
  .transform((v) => new Date(v))
  .refine(
    (d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
    'You cannot log a session in the future',
  )
  .refine(
    (d) => d.getTime() > Date.now() - 3 * 365 * 24 * 60 * 60 * 1000,
    'That date is more than three years ago',
  );

const loggedSet = z.object({
  setNumber: z.coerce.number().int().min(1).max(20),
  reps: z.coerce.number().int().min(0).max(500),
  weightKg: z.coerce.number().min(0).max(700).optional().default(0),
  rpe: z.coerce.number().min(1).max(10).optional(),
});

const loggedExercise = z.object({
  order: z.coerce.number().int().min(1),
  slug: z.string().trim().min(1),
  targetSets: z.coerce.number().int().min(1).max(20).optional(),
  targetReps: z.string().trim().max(20).optional(),
  prescribedWeightKg: z.coerce.number().min(0).max(700).optional(),
  sets: z.array(loggedSet).max(20),
  skipped: z.boolean().optional().default(false),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export const workoutLogSchema = z
  .object({
    planId: z.string().trim().optional(),
    planVersion: z.coerce.number().int().optional(),
    dayIndex: z.coerce.number().int().min(1).max(7).optional(),
    dayName: z.string().trim().max(60).optional(),
    date: logDate,
    durationMinutes: z.coerce.number().int().min(1).max(600).optional(),
    exercises: z.array(loggedExercise).min(1, 'Log at least one exercise').max(30),
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .refine(
    (data) =>
      data.exercises.some((e) => !e.skipped && e.sets.some((s) => s.reps > 0)),
    {
      message: 'At least one set with reps above zero is needed',
      path: ['exercises'],
    },
  );

const measurements = z.object({
  neckCm: z.coerce.number().min(20).max(70).optional(),
  waistCm: z.coerce.number().min(40).max(200).optional(),
  hipCm: z.coerce.number().min(50).max(200).optional(),
  chestCm: z.coerce.number().min(50).max(200).optional(),
  armCm: z.coerce.number().min(15).max(80).optional(),
  thighCm: z.coerce.number().min(25).max(100).optional(),
  calfCm: z.coerce.number().min(20).max(70).optional(),
});

export const progressLogSchema = z
  .object({
    date: logDate,
    weightKg: z.coerce.number().min(25).max(350).optional(),
    measurements: measurements.optional().default({}),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine(
    (data) =>
      data.weightKg !== undefined ||
      Object.values(data.measurements ?? {}).some((v) => v !== undefined),
    { message: 'Record a weight or at least one measurement' },
  );
