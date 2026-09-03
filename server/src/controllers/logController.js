import mongoose from 'mongoose';

import { Exercise } from '../models/Exercise.js';
import { ProgressLog } from '../models/ProgressLog.js';
import { WorkoutLog } from '../models/WorkoutLog.js';
import { WorkoutPlan } from '../models/WorkoutPlan.js';
import {
  bodyComposition,
  estimateBodyFat,
  waistToHeightRatio,
} from '../services/bodyComposition.js';
import {
  analyseConsistency,
  estimateOneRepMax,
  recommendProgression,
  sessionVolume,
} from '../services/progression.js';
import {
  consistencyScore,
  evaluateBadges,
  hasBeatenAPreviousBest,
} from '../services/gamification.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { DietPlan } from '../models/DietPlan.js';
import { formatZodError } from '../validation/profileSchemas.js';
import { progressLogSchema, workoutLogSchema } from '../validation/logSchemas.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

const parseOrThrow = (schema, payload) => {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Validation failed', formatZodError(result.error));
  }
  return result.data;
};

/** Normalises a date to midnight UTC — check-ins are per-day, not per-instant. */
const toDayStart = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const round = (v, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/* ============================================================ workout logs */

/**
 * POST /api/logs/workout
 *
 * Every exercise slug is resolved against the exercise collection — the same
 * grounding rule the AI generators follow. A log cannot reference an exercise
 * that does not exist, whatever the client sends.
 */
export const createWorkoutLog = asyncHandler(async (req, res) => {
  const data = parseOrThrow(workoutLogSchema, req.body);

  const slugs = [...new Set(data.exercises.map((e) => e.slug))];
  const records = await Exercise.find({ slug: { $in: slugs } })
    .select('slug name primaryMuscles equipment mechanic')
    .lean();
  const bySlug = new Map(records.map((r) => [r.slug, r]));

  const unknown = slugs.filter((s) => !bySlug.has(s));
  if (unknown.length) {
    throw ApiError.badRequest(
      `These exercises are not in the database: ${unknown.join(', ')}`,
      { unknownSlugs: unknown },
    );
  }

  const exercises = data.exercises.map((entry) => {
    const record = bySlug.get(entry.slug);
    const sets = entry.skipped ? [] : entry.sets;
    const working = sets.filter((s) => s.reps > 0);
    const topSet = working.reduce(
      (best, s) => (s.weightKg > (best?.weightKg ?? -1) ? s : best),
      null,
    );

    return {
      order: entry.order,
      slug: record.slug,
      // Descriptive fields come from the DB, never the request body.
      name: record.name,
      primaryMuscles: record.primaryMuscles,
      equipment: record.equipment,
      mechanic: record.mechanic,
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
      prescribedWeightKg: entry.prescribedWeightKg,
      sets,
      volumeKg: sessionVolume(sets),
      topSetWeightKg: topSet?.weightKg ?? 0,
      estimatedOneRepMaxKg: topSet
        ? estimateOneRepMax(topSet.weightKg, topSet.reps)
        : undefined,
      skipped: entry.skipped,
      notes: entry.notes || undefined,
    };
  });

  const log = await WorkoutLog.create({
    userId: req.user._id,
    planId: mongoose.isValidObjectId(data.planId) ? data.planId : undefined,
    planVersion: data.planVersion,
    dayIndex: data.dayIndex,
    dayName: data.dayName,
    date: data.date,
    durationMinutes: data.durationMinutes,
    exercises,
    totalVolumeKg: round(exercises.reduce((s, e) => s + e.volumeKg, 0), 0),
    totalSets: exercises.reduce((s, e) => s + e.sets.filter((x) => x.reps > 0).length, 0),
    totalReps: exercises.reduce(
      (s, e) => s + e.sets.reduce((t, x) => t + (x.reps ?? 0), 0),
      0,
    ),
    notes: data.notes || undefined,
  });

  res.status(201).json({ success: true, data: log.toObject() });
});

/** GET /api/logs/workout?limit=&from=&to= */
export const listWorkoutLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
  const filter = { userId: req.user._id };

  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }

  const [logs, total] = await Promise.all([
    WorkoutLog.find(filter).sort({ date: -1 }).limit(limit).lean(),
    WorkoutLog.countDocuments(filter),
  ]);

  res.json({ success: true, data: logs, meta: { total, returned: logs.length } });
});

/** GET /api/logs/workout/:id */
export const getWorkoutLog = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid log id');
  }
  const log = await WorkoutLog.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean();
  if (!log) throw ApiError.notFound('Log not found');
  res.json({ success: true, data: log });
});

/** DELETE /api/logs/workout/:id */
export const deleteWorkoutLog = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid log id');
  }
  const result = await WorkoutLog.deleteOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (result.deletedCount === 0) throw ApiError.notFound('Log not found');
  res.json({ success: true, message: 'Log deleted' });
});

/* ========================================================== progress logs */

/**
 * POST /api/logs/progress
 *
 * Upserts by day: re-submitting the same date corrects that check-in rather
 * than creating a duplicate. The body-fat estimate is computed here from the
 * user's height and sex and stored with the record.
 */
export const createProgressLog = asyncHandler(async (req, res) => {
  const data = parseOrThrow(progressLogSchema, req.body);
  const profile = req.user.profile ?? {};

  const date = toDayStart(data.date);
  const measurements = Object.fromEntries(
    Object.entries(data.measurements ?? {}).filter(([, v]) => v !== undefined),
  );

  const weightKg = data.weightKg ?? profile.weightKg;

  const bodyFat = estimateBodyFat({
    gender: profile.gender,
    heightCm: profile.heightCm,
    neckCm: measurements.neckCm,
    waistCm: measurements.waistCm,
    hipCm: measurements.hipCm,
  });

  const composition =
    !bodyFat.unavailable && weightKg ? bodyComposition(weightKg, bodyFat.value) : null;

  const whr = waistToHeightRatio(measurements.waistCm, profile.heightCm);

  const update = {
    weightKg: data.weightKg,
    measurements,
    bodyFatPercent: bodyFat.unavailable ? undefined : bodyFat.value,
    bodyFatCategory: bodyFat.unavailable ? undefined : bodyFat.category,
    leanMassKg: composition?.leanMassKg,
    fatMassKg: composition?.fatMassKg,
    waistToHeightRatio: whr?.value,
    estimatedWith: { heightCm: profile.heightCm, gender: profile.gender },
    notes: data.notes || undefined,
  };

  const log = await ProgressLog.findOneAndUpdate(
    { userId: req.user._id, date },
    { $set: update, $setOnInsert: { userId: req.user._id, date } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  /*
   * A new weigh-in is the user's current weight, so keep the profile in step —
   * calorie and macro targets are computed from it. Bumping profileVersion
   * here would flag every plan stale on each weigh-in, which would be noise,
   * so the weight is updated without a version bump.
   *
   * The previous value must be captured BEFORE the mutation: `profile` is a
   * reference to `req.user.profile`, so comparing against it afterwards would
   * always report "no change".
   */
  const previousWeightKg = profile.weightKg;
  const weightChanged = Boolean(data.weightKg && data.weightKg !== previousWeightKg);

  if (weightChanged) {
    req.user.profile.weightKg = data.weightKg;
    await req.user.save();
  }

  res.status(201).json({
    success: true,
    data: log,
    // Surface why an estimate is missing rather than silently omitting it.
    bodyFatNote: bodyFat.unavailable ? bodyFat.reason : bodyFat.note,
    profileWeightUpdated: weightChanged,
    previousWeightKg: weightChanged ? previousWeightKg : undefined,
  });
});

/** GET /api/logs/progress?limit= */
export const listProgressLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 90, 1), 365);
  const logs = await ProgressLog.find({ userId: req.user._id })
    .sort({ date: -1 })
    .limit(limit)
    .lean();

  res.json({ success: true, data: logs, meta: { returned: logs.length } });
});

/** DELETE /api/logs/progress/:id */
export const deleteProgressLog = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid log id');
  }
  const result = await ProgressLog.deleteOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (result.deletedCount === 0) throw ApiError.notFound('Log not found');
  res.json({ success: true, message: 'Check-in deleted' });
});

/* ============================================================ progression */

/**
 * GET /api/logs/progression/:dayIndex
 *
 * The next prescription for each exercise on a plan day, derived from what the
 * user actually logged. Rule-based and deterministic — see progression.js.
 */
export const getDayProgression = asyncHandler(async (req, res) => {
  const dayIndex = Number(req.params.dayIndex);
  if (!Number.isInteger(dayIndex) || dayIndex < 1) {
    throw ApiError.badRequest('Day index must be a positive integer');
  }

  const plan = await WorkoutPlan.findOne({
    userId: req.user._id,
    isActive: true,
  }).lean();
  if (!plan) throw ApiError.notFound('No active workout plan');

  const day = plan.days.find((d) => d.dayIndex === dayIndex);
  if (!day) throw ApiError.notFound(`Day ${dayIndex} is not in your plan`);

  const slugs = day.exercises.map((e) => e.slug);

  // Pull recent history for these exercises in one query.
  const logs = await WorkoutLog.find({
    userId: req.user._id,
    'exercises.slug': { $in: slugs },
  })
    .sort({ date: -1 })
    .limit(40)
    .select('date exercises.slug exercises.sets')
    .lean();

  const historyBySlug = new Map(slugs.map((s) => [s, []]));
  for (const log of logs) {
    for (const entry of log.exercises) {
      if (!historyBySlug.has(entry.slug)) continue;
      const working = (entry.sets ?? []).filter((s) => (s.reps ?? 0) > 0);
      if (working.length === 0) continue;
      historyBySlug.get(entry.slug).push({ date: log.date, sets: working });
    }
  }

  const exercises = day.exercises.map((exercise) => {
    const history = historyBySlug.get(exercise.slug) ?? [];
    const progression = recommendProgression({
      exercise,
      targetReps: exercise.reps,
      targetSets: exercise.sets,
      history,
    });

    return {
      slug: exercise.slug,
      name: exercise.name,
      equipment: exercise.equipment,
      mechanic: exercise.mechanic,
      primaryMuscles: exercise.primaryMuscles,
      plannedSets: exercise.sets,
      plannedReps: exercise.reps,
      restSeconds: exercise.restSeconds,
      caution: exercise.caution,
      sessionsLogged: history.length,
      lastSession: history[0]
        ? {
            date: history[0].date,
            sets: history[0].sets,
            volumeKg: sessionVolume(history[0].sets),
          }
        : null,
      progression,
    };
  });

  res.json({
    success: true,
    data: {
      dayIndex,
      dayName: day.name,
      focus: day.focus,
      isRecoveryDay: day.isRecoveryDay,
      planVersion: plan.version,
      planId: plan._id,
      exercises,
    },
  });
});

/* ============================================================= dashboard */

/**
 * GET /api/logs/dashboard
 *
 * Everything the progress dashboard renders, in one request: body-metric
 * series, weekly volume, consistency, streaks and personal records.
 */
export const getProgressDashboard = asyncHandler(async (req, res) => {
  const user = req.user;
  const profile = user.profile ?? {};

  const [progressLogs, workoutLogs] = await Promise.all([
    ProgressLog.find({ userId: user._id }).sort({ date: 1 }).limit(365).lean(),
    WorkoutLog.find({ userId: user._id }).sort({ date: -1 }).limit(200).lean(),
  ]);

  /* --- body-metric series, oldest first for charting --------------------- */
  const bodySeries = progressLogs.map((log) => ({
    date: log.date.toISOString().slice(0, 10),
    weightKg: log.weightKg ?? null,
    bodyFatPercent: log.bodyFatPercent ?? null,
    leanMassKg: log.leanMassKg ?? null,
    fatMassKg: log.fatMassKg ?? null,
    waistCm: log.measurements?.waistCm ?? null,
    chestCm: log.measurements?.chestCm ?? null,
    armCm: log.measurements?.armCm ?? null,
    thighCm: log.measurements?.thighCm ?? null,
    hipCm: log.measurements?.hipCm ?? null,
  }));

  /* --- weekly training volume ------------------------------------------- */
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const WEEKS = 12;

  const volumeByWeek = Array.from({ length: WEEKS }, (_, i) => ({
    weeksAgo: WEEKS - 1 - i,
    weekStart: new Date(now - (WEEKS - i) * msPerWeek).toISOString().slice(0, 10),
    volumeKg: 0,
    sessions: 0,
    sets: 0,
  }));

  for (const log of workoutLogs) {
    const weeksAgo = Math.floor((now - new Date(log.date).getTime()) / msPerWeek);
    if (weeksAgo < 0 || weeksAgo >= WEEKS) continue;
    const bucket = volumeByWeek.find((b) => b.weeksAgo === weeksAgo);
    if (!bucket) continue;
    bucket.volumeKg += log.totalVolumeKg ?? 0;
    bucket.sessions += 1;
    bucket.sets += log.totalSets ?? 0;
  }

  /* --- consistency and streaks ----------------------------------------- */
  const consistency = analyseConsistency(workoutLogs, {
    trainingDaysPerWeek: profile.trainingDaysPerWeek ?? 3,
    weeks: 8,
  });

  /* --- personal records ------------------------------------------------- */
  const bestBySlug = new Map();
  for (const log of workoutLogs) {
    for (const entry of log.exercises ?? []) {
      if (!entry.estimatedOneRepMaxKg) continue;
      const current = bestBySlug.get(entry.slug);
      if (!current || entry.estimatedOneRepMaxKg > current.estimatedOneRepMaxKg) {
        bestBySlug.set(entry.slug, {
          slug: entry.slug,
          name: entry.name,
          estimatedOneRepMaxKg: entry.estimatedOneRepMaxKg,
          topSetWeightKg: entry.topSetWeightKg,
          date: log.date,
        });
      }
    }
  }
  const personalRecords = [...bestBySlug.values()]
    .sort((a, b) => b.estimatedOneRepMaxKg - a.estimatedOneRepMaxKg)
    .slice(0, 10);

  /* --- headline deltas -------------------------------------------------- */
  const withWeight = bodySeries.filter((p) => p.weightKg != null);
  const withBodyFat = bodySeries.filter((p) => p.bodyFatPercent != null);

  const delta = (series, key) => {
    if (series.length < 2) return null;
    return round(series[series.length - 1][key] - series[0][key], 1);
  };

  res.json({
    success: true,
    data: {
      hasData: workoutLogs.length > 0 || progressLogs.length > 0,
      bodySeries,
      volumeByWeek,
      consistency,
      personalRecords,
      totals: {
        workoutsLogged: workoutLogs.length,
        checkInsLogged: progressLogs.length,
        totalVolumeKg: round(
          workoutLogs.reduce((s, l) => s + (l.totalVolumeKg ?? 0), 0),
          0,
        ),
        totalSets: workoutLogs.reduce((s, l) => s + (l.totalSets ?? 0), 0),
      },
      current: {
        weightKg: withWeight.at(-1)?.weightKg ?? profile.weightKg ?? null,
        bodyFatPercent: withBodyFat.at(-1)?.bodyFatPercent ?? null,
        bodyFatCategory: progressLogs.at(-1)?.bodyFatCategory ?? null,
        leanMassKg: withBodyFat.at(-1)?.leanMassKg ?? null,
      },
      change: {
        weightKg: delta(withWeight, 'weightKg'),
        bodyFatPercent: delta(withBodyFat, 'bodyFatPercent'),
        leanMassKg: delta(withBodyFat, 'leanMassKg'),
        sinceDate: withWeight[0]?.date ?? null,
      },
      // The estimator needs these, so tell the client what it can compute.
      bodyFatInputsAvailable: Boolean(profile.heightCm && profile.gender),
    },
  });
});

/**
 * GET /api/logs/achievements
 *
 * Streaks, the consistency score and the badge set — all derived from existing
 * logs and plans, never stored. See gamification.js for why.
 */
export const getAchievements = asyncHandler(async (req, res) => {
  const user = req.user;
  const profile = user.profile ?? {};

  const [workoutLogs, progressLogs, workoutPlan, dietPlan, chatCount] =
    await Promise.all([
      WorkoutLog.find({ userId: user._id })
        .sort({ date: -1 })
        .limit(400)
        .select('date totalVolumeKg exercises.slug exercises.estimatedOneRepMaxKg')
        .lean(),
      ProgressLog.find({ userId: user._id }).sort({ date: -1 }).limit(365).lean(),
      WorkoutPlan.exists({ userId: user._id, isActive: true }),
      DietPlan.exists({ userId: user._id, isActive: true }),
      ChatMessage.countDocuments({ userId: user._id }),
    ]);

  const consistency = analyseConsistency(workoutLogs, {
    trainingDaysPerWeek: profile.trainingDaysPerWeek ?? 3,
    weeks: 8,
  });

  const score = consistencyScore({ consistency, workoutLogs, progressLogs });

  const stats = {
    workoutCount: workoutLogs.length,
    checkInCount: progressLogs.length,
    totalVolumeKg: workoutLogs.reduce((sum, l) => sum + (l.totalVolumeKg ?? 0), 0),
    streakWeeks: consistency.streakWeeks,
    consistencyScore: score.score,
    chatCount,
    onboarded: user.onboardingCompleted,
    hasWorkoutPlan: Boolean(workoutPlan),
    hasDietPlan: Boolean(dietPlan),
    hasBeatenAPreviousBest: hasBeatenAPreviousBest(workoutLogs),
  };

  res.json({
    success: true,
    data: { consistency, score, stats, ...evaluateBadges(stats) },
  });
});
