import mongoose from 'mongoose';

import { DietPlan } from '../models/DietPlan.js';
import { WorkoutPlan } from '../models/WorkoutPlan.js';
import { generateDietPlan, regenerateMeal } from '../services/dietGenerator.js';
import { generateWorkoutPlan } from '../services/workoutGenerator.js';
import { isGroqConfigured } from '../services/groqClient.js';
import { buildGroceryList, groceryListToText } from '../services/grocery.js';
import { calculateTargets, profileCompleteness } from '../services/fitnessCalc.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/** Both generators need a fully onboarded profile to produce anything sane. */
const requireCompleteProfile = (user) => {
  const profile = user.profile?.toObject ? user.profile.toObject() : (user.profile ?? {});
  const completeness = profileCompleteness(profile);

  if (!user.onboardingCompleted || !completeness.complete) {
    throw ApiError.badRequest(
      'Complete your profile before generating a plan',
      { missing: completeness.missing },
    );
  }
  return profile;
};

/**
 * Clears the stale-plan flag once both plan types have been rebuilt against the
 * current profile version. Clearing after only one would wrongly imply the
 * other is up to date.
 */
const clearRegenerationIfSynced = async (user) => {
  const [workout, diet] = await Promise.all([
    WorkoutPlan.findOne({ userId: user._id, isActive: true }).select('profileVersion').lean(),
    DietPlan.findOne({ userId: user._id, isActive: true }).select('profileVersion').lean(),
  ]);

  const synced =
    workout?.profileVersion === user.profileVersion &&
    diet?.profileVersion === user.profileVersion;

  if (synced && user.planRegeneration?.required) {
    user.planRegeneration = { required: false, reasons: [], flaggedAt: undefined };
    await user.save();
  }

  return synced;
};

/** Marks previous plans inactive and stores the new one as version N+1. */
const supersede = async (Model, userId, payload) => {
  const previous = await Model.findOne({ userId }).sort({ version: -1 }).select('version').lean();
  const version = (previous?.version ?? 0) + 1;

  await Model.updateMany({ userId, isActive: true }, { $set: { isActive: false } });

  return Model.create({ ...payload, userId, version, isActive: true });
};

/* ------------------------------------------------------------------ status */

/** GET /api/plans/status — what exists, and whether it is current. */
export const getPlanStatus = asyncHandler(async (req, res) => {
  const user = req.user;

  const [workout, diet] = await Promise.all([
    WorkoutPlan.findOne({ userId: user._id, isActive: true })
      .select('version profileVersion createdAt generation.generatedBy daysPerWeek splitType')
      .lean(),
    DietPlan.findOne({ userId: user._id, isActive: true })
      .select('version profileVersion createdAt generation.generatedBy dailyTotals variance')
      .lean(),
  ]);

  res.json({
    success: true,
    data: {
      aiAvailable: isGroqConfigured(),
      profileVersion: user.profileVersion,
      onboardingCompleted: user.onboardingCompleted,
      workout: workout
        ? { ...workout, stale: workout.profileVersion !== user.profileVersion }
        : null,
      diet: diet ? { ...diet, stale: diet.profileVersion !== user.profileVersion } : null,
    },
  });
});

/* ----------------------------------------------------------------- workout */

/** POST /api/plans/workout/generate */
export const createWorkoutPlan = asyncHandler(async (req, res) => {
  const user = req.user;
  const profile = requireCompleteProfile(user);

  const generated = await generateWorkoutPlan(profile, {
    forceFallback: req.body?.forceFallback === true,
  });

  const plan = await supersede(WorkoutPlan, user._id, {
    ...generated,
    profileVersion: user.profileVersion,
  });

  await clearRegenerationIfSynced(user);

  res.status(201).json({ success: true, data: plan.toObject() });
});

/** GET /api/plans/workout — the active plan. */
export const getWorkoutPlan = asyncHandler(async (req, res) => {
  const plan = await WorkoutPlan.findOne({ userId: req.user._id, isActive: true }).lean();

  res.json({
    success: true,
    data: plan
      ? { ...plan, stale: plan.profileVersion !== req.user.profileVersion }
      : null,
  });
});

/** GET /api/plans/workout/history */
export const getWorkoutHistory = asyncHandler(async (req, res) => {
  const plans = await WorkoutPlan.find({ userId: req.user._id })
    .sort({ version: -1 })
    .limit(20)
    .select('version profileVersion splitType daysPerWeek goal createdAt isActive generation.generatedBy')
    .lean();

  res.json({ success: true, data: plans });
});

/* -------------------------------------------------------------------- diet */

/** POST /api/plans/diet/generate */
export const createDietPlan = asyncHandler(async (req, res) => {
  const user = req.user;
  const profile = requireCompleteProfile(user);

  const targets = calculateTargets(profile);
  if (!targets.complete) {
    throw ApiError.badRequest('Your profile is missing fields needed to compute targets', {
      missing: targets.missing,
    });
  }

  let generated;
  try {
    generated = await generateDietPlan(profile, targets, {
      forceFallback: req.body?.forceFallback === true,
    });
  } catch (err) {
    // A too-restrictive diet is a user-fixable problem, not a server fault.
    throw ApiError.badRequest(err.message);
  }

  const plan = await supersede(DietPlan, user._id, {
    ...generated,
    profileVersion: user.profileVersion,
  });

  await clearRegenerationIfSynced(user);

  res.status(201).json({ success: true, data: plan.toObject() });
});

/** GET /api/plans/diet */
export const getDietPlan = asyncHandler(async (req, res) => {
  const plan = await DietPlan.findOne({ userId: req.user._id, isActive: true }).lean();

  res.json({
    success: true,
    data: plan
      ? { ...plan, stale: plan.profileVersion !== req.user.profileVersion }
      : null,
  });
});

/**
 * Fetches one archived plan by id, scoped to the owner.
 *
 * The `userId` filter is the access control: without it, any authenticated user
 * could read another user's plan by guessing an ObjectId.
 */
const findOwnedPlan = async (Model, userId, id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid plan id');
  }
  const plan = await Model.findOne({ _id: id, userId }).lean();
  if (!plan) throw ApiError.notFound('Plan not found');
  return plan;
};

/** GET /api/plans/workout/:id — a specific version, read-only. */
export const getWorkoutPlanById = asyncHandler(async (req, res) => {
  const plan = await findOwnedPlan(WorkoutPlan, req.user._id, req.params.id);
  res.json({
    success: true,
    data: { ...plan, stale: plan.profileVersion !== req.user.profileVersion },
  });
});

/** GET /api/plans/diet/:id — a specific version, read-only. */
export const getDietPlanById = asyncHandler(async (req, res) => {
  const plan = await findOwnedPlan(DietPlan, req.user._id, req.params.id);
  res.json({
    success: true,
    data: { ...plan, stale: plan.profileVersion !== req.user.profileVersion },
  });
});

/** GET /api/plans/diet/history */
export const getDietHistory = asyncHandler(async (req, res) => {
  const plans = await DietPlan.find({ userId: req.user._id })
    .sort({ version: -1 })
    .limit(20)
    .select('version profileVersion targets dailyTotals variance createdAt isActive generation.generatedBy')
    .lean();

  res.json({ success: true, data: plans });
});

/**
 * POST /api/plans/diet/meals/:order/swap
 *
 * Regenerates one meal in place, keeping the rest of the day. Daily totals and
 * variance are recomputed from the DB afterwards, so the plan stays internally
 * consistent.
 */
export const swapMeal = asyncHandler(async (req, res) => {
  const user = req.user;
  const profile = requireCompleteProfile(user);

  const order = Number(req.params.order);
  if (!Number.isInteger(order) || order < 1) {
    throw ApiError.badRequest('Meal order must be a positive integer');
  }

  const plan = await DietPlan.findOne({ userId: user._id, isActive: true });
  if (!plan) throw ApiError.notFound('No active diet plan to modify');

  const targets = calculateTargets(profile);
  if (!targets.complete) {
    throw ApiError.badRequest('Cannot swap a meal without complete targets');
  }

  let replacement;
  try {
    replacement = await regenerateMeal(profile, targets, plan.toObject(), order);
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }

  const index = plan.meals.findIndex((meal) => meal.order === order);
  if (index === -1) throw ApiError.notFound(`Meal ${order} not found`);

  plan.meals[index] = {
    order: replacement.order,
    name: replacement.name,
    targetCalories: replacement.targetCalories,
    items: replacement.items,
    totals: replacement.totals,
  };

  // Recompute the day from the stored items — never trust a cached total.
  const dailyTotals = plan.meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + (meal.totals?.calories ?? 0),
      protein: acc.protein + (meal.totals?.protein ?? 0),
      carbs: acc.carbs + (meal.totals?.carbs ?? 0),
      fats: acc.fats + (meal.totals?.fats ?? 0),
      fiber: acc.fiber + (meal.totals?.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
  );

  const round = (v, dp = 0) => {
    const f = 10 ** dp;
    return Math.round(v * f) / f;
  };

  plan.dailyTotals = {
    calories: round(dailyTotals.calories),
    protein: round(dailyTotals.protein, 1),
    carbs: round(dailyTotals.carbs, 1),
    fats: round(dailyTotals.fats, 1),
    fiber: round(dailyTotals.fiber, 1),
  };

  plan.variance = {
    calories: round(plan.dailyTotals.calories - plan.targets.calories),
    protein: round(plan.dailyTotals.protein - plan.targets.protein, 1),
    carbs: round(plan.dailyTotals.carbs - plan.targets.carbs, 1),
    fats: round(plan.dailyTotals.fats - plan.targets.fats, 1),
    caloriePercent: round(
      ((plan.dailyTotals.calories - plan.targets.calories) / plan.targets.calories) * 100,
      1,
    ),
  };

  plan.markModified('meals');
  await plan.save();

  res.json({
    success: true,
    message: `${replacement.name} regenerated`,
    data: plan.toObject(),
    swapped: replacement.generation,
  });
});

/**
 * GET /api/plans/diet/grocery?days=7&format=json|text
 *
 * A shopping list aggregated from the active diet plan. The plan covers one day
 * (report §9.6), so `days` multiplies it — stated in the response rather than
 * assumed.
 */
export const getGroceryList = asyncHandler(async (req, res) => {
  const plan = await DietPlan.findOne({ userId: req.user._id, isActive: true }).lean();
  if (!plan) {
    throw ApiError.notFound('Generate a diet plan first — there is nothing to shop for');
  }

  const list = buildGroceryList(plan, req.query.days);

  if (req.query.format === 'text') {
    res.type('text/plain').send(groceryListToText(list));
    return;
  }

  res.json({ success: true, data: list });
});
