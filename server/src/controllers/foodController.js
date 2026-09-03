import { Food } from '../models/Food.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/**
 * GET /api/foods
 * Filters: ?category=protein &dietTag=vegan &search=paneer &limit=50
 */
export const listFoods = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filter = {};

  if (req.query.category) filter.category = req.query.category;
  if (req.query.dietTag) filter.dietTags = req.query.dietTag;

  const search = (req.query.search ?? '').trim();
  if (search) {
    filter.name = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
    };
  }

  const [items, total] = await Promise.all([
    Food.find(filter).sort({ name: 1 }).limit(limit).lean(),
    Food.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, meta: { total, returned: items.length } });
});

/** GET /api/foods/:slug */
export const getFood = asyncHandler(async (req, res) => {
  const food = await Food.findOne({ slug: req.params.slug }).lean();
  if (!food) throw ApiError.notFound('Food not found');
  res.json({ success: true, data: food });
});
