import { z } from 'zod';
import { DIET_TAGS, FOOD_CATEGORIES } from '../models/Food.js';

/**
 * Validation for admin-managed exercise and food records.
 *
 * These write to the collections the AI generators are grounded against, so the
 * schemas are strict: a malformed record here would propagate into generated
 * plans, where the grounding layer would silently drop it and the user would
 * simply see a shorter session.
 */

const slug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_\-/.]*$/,
    'Use letters, numbers, underscores, hyphens, dots or slashes',
  );

const muscleList = z
  .array(z.string().trim().min(2).max(40))
  .max(10)
  .transform((list) => [...new Set(list.map((m) => m.toLowerCase()))]);

export const exerciseCreateSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(140),
  force: z.enum(['push', 'pull', 'static']).nullish(),
  level: z.enum(['beginner', 'intermediate', 'expert']),
  mechanic: z.enum(['compound', 'isolation']).nullish(),
  equipment: z.string().trim().min(2).max(40).toLowerCase(),
  category: z.string().trim().min(2).max(40).toLowerCase(),
  primaryMuscles: muscleList.refine((l) => l.length > 0, 'At least one primary muscle'),
  secondaryMuscles: muscleList.optional().default([]),
  instructions: z.array(z.string().trim().min(3).max(600)).max(20).optional().default([]),
  images: z.array(z.string().trim().url()).max(6).optional().default([]),
  demoUrl: z.string().trim().url().optional().or(z.literal('')),
});

/**
 * Updates allow any subset of fields.
 *
 * Built by `.partial().omit()` off the create schema, EXCEPT that emptiness is
 * not checked here: `.partial()` preserves the `.default([])` on array fields,
 * so an empty body parses to three defaulted keys and any "at least one field"
 * refinement would pass. The controller checks the raw request body instead.
 *
 * The slug is omitted because it is the grounding handle that plans and logs
 * reference — changing it would orphan every reference silently.
 */
export const exerciseUpdateSchema = exerciseCreateSchema
  .partial()
  .omit({ slug: true });

const macro = z.coerce.number().min(0).max(100);

export const foodCreateSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens'),
    name: z.string().trim().min(2).max(140),
    category: z.enum(FOOD_CATEGORIES),
    per: z.enum(['100g', '100ml']).optional().default('100g'),
    calories: z.coerce.number().min(0).max(900),
    protein: macro,
    carbs: macro,
    fats: macro,
    fiber: macro.optional().default(0),
    servingLabel: z.string().trim().max(60).optional().or(z.literal('')),
    servingGrams: z.coerce.number().min(1).max(2000).optional(),
    dietTags: z.array(z.enum(DIET_TAGS)).max(6).optional().default([]),
    allergens: z
      .array(z.string().trim().min(2).max(40))
      .max(10)
      .optional()
      .default([])
      .transform((list) => [...new Set(list.map((a) => a.toLowerCase()))]),
  })
  /*
   * The same internal-consistency check the seeder applies: stated calories
   * must sit inside the band that the 4/4/9 arithmetic allows, accounting for
   * sources differing over whether fibre counts toward carbohydrate. Catches a
   * misplaced decimal or a swapped field before it reaches a diet plan.
   */
  .refine(
    (food) => {
      const fromProteinFat = food.protein * 4 + food.fats * 9;
      const net = fromProteinFat + Math.max(food.carbs - (food.fiber ?? 0), 0) * 4;
      const total = fromProteinFat + food.carbs * 4;
      if (total === 0 || food.calories < 10) return true;
      return food.calories >= net * 0.85 && food.calories <= total * 1.15;
    },
    {
      message:
        'Calories are not consistent with the macros — check the 4/4/9 arithmetic',
      path: ['calories'],
    },
  );

export const foodUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    category: z.enum(FOOD_CATEGORIES).optional(),
    per: z.enum(['100g', '100ml']).optional(),
    calories: z.coerce.number().min(0).max(900).optional(),
    protein: macro.optional(),
    carbs: macro.optional(),
    fats: macro.optional(),
    fiber: macro.optional(),
    servingLabel: z.string().trim().max(60).optional().or(z.literal('')),
    servingGrams: z.coerce.number().min(1).max(2000).optional(),
    dietTags: z.array(z.enum(DIET_TAGS)).max(6).optional(),
    allergens: z
      .array(z.string().trim().min(2).max(40))
      .max(10)
      .optional()
      .transform((list) =>
        list ? [...new Set(list.map((a) => a.toLowerCase()))] : list,
      ),
  })
  // Emptiness is checked on the raw body in the controller — see the note on
  // exerciseUpdateSchema for why a refinement here cannot do it reliably.
  .strip();
