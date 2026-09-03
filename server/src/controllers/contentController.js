import { DietPlan } from '../models/DietPlan.js';
import { Exercise } from '../models/Exercise.js';
import { Food } from '../models/Food.js';
import { WorkoutLog } from '../models/WorkoutLog.js';
import { WorkoutPlan } from '../models/WorkoutPlan.js';
import {
  exerciseCreateSchema,
  exerciseUpdateSchema,
  foodCreateSchema,
  foodUpdateSchema,
} from '../validation/contentSchemas.js';
import { formatZodError } from '../validation/profileSchemas.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/**
 * Admin CRUD for the two verified databases.
 *
 * These collections are the grounding source for every AI generator, so writes
 * here are the one place a bad record could propagate into plans. Two
 * protections follow from that:
 *
 *  - A slug is IMMUTABLE. Plans and logs reference exercises and foods by slug;
 *    renaming one would orphan every reference silently.
 *  - A DELETE is refused while anything references the record. Removing a food
 *    that appears in a stored diet plan would leave that plan's macros
 *    unreconstructable, so the endpoint reports what is using it instead.
 */

const parseOrThrow = (schema, payload) => {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Validation failed', formatZodError(result.error));
  }
  return result.data;
};

/**
 * Rejects an update with nothing in it.
 *
 * Checked on the RAW body rather than in the zod schema: a partial schema keeps
 * the create schema's array defaults, so an empty body parses into several
 * defaulted keys and a schema-level "at least one field" check would always
 * pass. Only the request body knows whether the caller actually sent anything.
 */
const requireFields = (body) => {
  const keys = Object.keys(body ?? {});
  if (keys.length === 0) {
    throw ApiError.badRequest('Provide at least one field to update');
  }
  return keys;
};

/* ================================================================ exercises */

/** POST /api/admin/exercises */
export const createExercise = asyncHandler(async (req, res) => {
  const data = parseOrThrow(exerciseCreateSchema, req.body);

  const existing = await Exercise.findOne({ slug: data.slug }).select('slug').lean();
  if (existing) {
    throw ApiError.badRequest(`An exercise with slug "${data.slug}" already exists`);
  }

  const exercise = await Exercise.create({
    ...data,
    demoUrl:
      data.demoUrl ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${data.name} exercise form`,
      )}`,
    source: 'admin',
  });

  res.status(201).json({ success: true, message: 'Exercise created', data: exercise.toObject() });
});

/** PATCH /api/admin/exercises/:slug */
export const updateExercise = asyncHandler(async (req, res) => {
  const sent = requireFields(req.body);
  const data = parseOrThrow(exerciseUpdateSchema, req.body);

  // The slug is stripped by the schema; say so rather than silently ignoring an
  // attempt to rename the grounding handle.
  if (sent.includes('slug')) {
    throw ApiError.badRequest(
      'An exercise slug cannot be changed — plans and logs reference it. Create a new exercise instead.',
    );
  }

  const exercise = await Exercise.findOneAndUpdate(
    { slug: req.params.slug },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

  if (!exercise) throw ApiError.notFound('Exercise not found');

  res.json({ success: true, message: 'Exercise updated', data: exercise });
});

/**
 * GET /api/admin/exercises/:slug/usage
 * What would break if this record were deleted.
 */
const exerciseUsage = async (slug) => {
  const [plans, logs] = await Promise.all([
    WorkoutPlan.countDocuments({ 'days.exercises.slug': slug }),
    WorkoutLog.countDocuments({ 'exercises.slug': slug }),
  ]);
  return { workoutPlans: plans, workoutLogs: logs, total: plans + logs };
};

export const getExerciseUsage = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findOne({ slug: req.params.slug }).select('slug name').lean();
  if (!exercise) throw ApiError.notFound('Exercise not found');

  res.json({
    success: true,
    data: { slug: exercise.slug, name: exercise.name, usage: await exerciseUsage(exercise.slug) },
  });
});

/** DELETE /api/admin/exercises/:slug */
export const deleteExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findOne({ slug: req.params.slug }).select('slug name').lean();
  if (!exercise) throw ApiError.notFound('Exercise not found');

  const usage = await exerciseUsage(exercise.slug);
  if (usage.total > 0) {
    throw ApiError.badRequest(
      `"${exercise.name}" is referenced by ${usage.workoutPlans} plan(s) and ${usage.workoutLogs} log(s). Deleting it would leave those records unreadable.`,
      { usage },
    );
  }

  await Exercise.deleteOne({ slug: exercise.slug });
  res.json({ success: true, message: `Deleted ${exercise.name}` });
});

/* ==================================================================== foods */

/** POST /api/admin/foods */
export const createFood = asyncHandler(async (req, res) => {
  const data = parseOrThrow(foodCreateSchema, req.body);

  const existing = await Food.findOne({ slug: data.slug }).select('slug').lean();
  if (existing) {
    throw ApiError.badRequest(`A food with slug "${data.slug}" already exists`);
  }

  const food = await Food.create({ ...data, source: 'admin' });
  res.status(201).json({ success: true, message: 'Food created', data: food.toObject() });
});

/** PATCH /api/admin/foods/:slug */
export const updateFood = asyncHandler(async (req, res) => {
  const sent = requireFields(req.body);
  const data = parseOrThrow(foodUpdateSchema, req.body);

  if (sent.includes('slug')) {
    throw ApiError.badRequest(
      'A food slug cannot be changed — diet plans reference it. Create a new food instead.',
    );
  }

  /*
   * A partial macro edit could break the calorie consistency the create schema
   * enforces, so re-check the merged record rather than only the changed field.
   */
  const current = await Food.findOne({ slug: req.params.slug }).lean();
  if (!current) throw ApiError.notFound('Food not found');

  const merged = { ...current, ...data };
  const fromProteinFat = merged.protein * 4 + merged.fats * 9;
  const net = fromProteinFat + Math.max(merged.carbs - (merged.fiber ?? 0), 0) * 4;
  const total = fromProteinFat + merged.carbs * 4;

  if (total > 0 && merged.calories >= 10) {
    if (merged.calories < net * 0.85 || merged.calories > total * 1.15) {
      throw ApiError.badRequest(
        'After this change, calories would not be consistent with the macros',
        {
          calories: `Stated ${merged.calories} kcal is outside the plausible ${Math.round(
            net * 0.85,
          )}–${Math.round(total * 1.15)} kcal range`,
        },
      );
    }
  }

  const food = await Food.findOneAndUpdate(
    { slug: req.params.slug },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

  res.json({ success: true, message: 'Food updated', data: food });
});

const foodUsage = async (slug) => {
  const plans = await DietPlan.countDocuments({ 'meals.items.slug': slug });
  return { dietPlans: plans, total: plans };
};

/** GET /api/admin/foods/:slug/usage */
export const getFoodUsage = asyncHandler(async (req, res) => {
  const food = await Food.findOne({ slug: req.params.slug }).select('slug name').lean();
  if (!food) throw ApiError.notFound('Food not found');

  res.json({
    success: true,
    data: { slug: food.slug, name: food.name, usage: await foodUsage(food.slug) },
  });
});

/** DELETE /api/admin/foods/:slug */
export const deleteFood = asyncHandler(async (req, res) => {
  const food = await Food.findOne({ slug: req.params.slug }).select('slug name').lean();
  if (!food) throw ApiError.notFound('Food not found');

  const usage = await foodUsage(food.slug);
  if (usage.total > 0) {
    throw ApiError.badRequest(
      `"${food.name}" appears in ${usage.dietPlans} stored diet plan(s). Deleting it would make those plans' macros unreconstructable.`,
      { usage },
    );
  }

  await Food.deleteOne({ slug: food.slug });
  res.json({ success: true, message: `Deleted ${food.name}` });
});
