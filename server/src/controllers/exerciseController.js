import { Exercise } from '../models/Exercise.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

const csv = (value) =>
  typeof value === 'string'
    ? value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
    : [];

/**
 * GET /api/exercises
 * Filters: ?muscle=chest,triceps &equipment=barbell &level=beginner
 *          &category=strength &search=press &page=1 &limit=24
 */
export const listExercises = asyncHandler(async (req, res) => {
  const page = clamp(req.query.page, 1, 500, 1);
  const limit = clamp(req.query.limit, 1, 100, 24);

  const filter = {};

  const muscles = csv(req.query.muscle);
  if (muscles.length) filter.primaryMuscles = { $in: muscles };

  const equipment = csv(req.query.equipment);
  if (equipment.length) filter.equipment = { $in: equipment };

  const levels = csv(req.query.level);
  if (levels.length) filter.level = { $in: levels };

  const categories = csv(req.query.category);
  if (categories.length) filter.category = { $in: categories };

  const search = (req.query.search ?? '').trim();
  if (search) {
    // Regex (not $text) so partial words like "pres" still match.
    filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    Exercise.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Exercise.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      hasMore: page * limit < total,
    },
  });
});

/** GET /api/exercises/filters — distinct values used to build the filter UI. */
export const getExerciseFilters = asyncHandler(async (_req, res) => {
  const [muscles, equipment, levels, categories] = await Promise.all([
    Exercise.distinct('primaryMuscles'),
    Exercise.distinct('equipment'),
    Exercise.distinct('level'),
    Exercise.distinct('category'),
  ]);

  const clean = (list) => list.filter(Boolean).sort();

  res.json({
    success: true,
    data: {
      muscles: clean(muscles),
      equipment: clean(equipment),
      levels: clean(levels),
      categories: clean(categories),
    },
  });
});

/** GET /api/exercises/:slug */
export const getExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findOne({ slug: req.params.slug }).lean();
  if (!exercise) throw ApiError.notFound('Exercise not found');
  res.json({ success: true, data: exercise });
});
