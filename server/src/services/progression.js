/**
 * Progressive overload and auto-deload.
 *
 * The *decision* is rule-based and deterministic: whether to add load, hold, or
 * deload follows from what the user actually lifted, and identical logs must
 * always produce the identical recommendation. An LLM is optionally used later
 * to phrase the reasoning in coaching language, never to choose the numbers —
 * the same split as everywhere else in FitGen.
 *
 * The rules implement standard double progression: work up the rep range at a
 * fixed load, then add load and drop back to the bottom of the range.
 */

const round = (value, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

/**
 * Smallest sensible load jump, by equipment.
 *
 * Lower-body compounds tolerate larger jumps than small isolation work, and
 * dumbbells move in per-hand increments, so a flat "+2.5 kg" would be wrong in
 * both directions.
 */
const LOAD_INCREMENTS = {
  barbell: { compound: 5, isolation: 2.5 },
  'e-z curl bar': { compound: 2.5, isolation: 2.5 },
  dumbbell: { compound: 2, isolation: 1 },
  kettlebells: { compound: 4, isolation: 2 },
  machine: { compound: 5, isolation: 2.5 },
  cable: { compound: 2.5, isolation: 2.5 },
  bands: { compound: 0, isolation: 0 },
  'body only': { compound: 0, isolation: 0 },
};

const DEFAULT_INCREMENT = { compound: 2.5, isolation: 2.5 };

/** Lower-body movements earn the larger increment. */
const LOWER_BODY = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves']);

export const loadIncrementFor = (exercise) => {
  const table = LOAD_INCREMENTS[exercise?.equipment] ?? DEFAULT_INCREMENT;
  const mechanic = exercise?.mechanic === 'compound' ? 'compound' : 'isolation';
  let increment = table[mechanic];

  // Squat/hinge patterns progress faster than upper-body pressing.
  const isLowerBody = (exercise?.primaryMuscles ?? []).some((m) => LOWER_BODY.has(m));
  if (isLowerBody && increment > 0 && mechanic === 'compound') {
    increment = Math.max(increment, 5);
  }

  return increment;
};

/** Parses "8-12" / "10" / "8 to 12" into a numeric range. */
export const parseRepRange = (reps) => {
  const text = String(reps ?? '').trim();
  const match = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (match) {
    return { min: Number(match[1]), max: Number(match[2]) };
  }
  const single = text.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n };
  }
  return { min: 8, max: 12 };
};

/** Epley estimated one-rep max — a load-and-reps-independent strength proxy. */
export const estimateOneRepMax = (weightKg, reps) => {
  if (!weightKg || !reps || reps < 1) return null;
  if (reps === 1) return round(weightKg);
  return round(weightKg * (1 + reps / 30));
};

/** Total load moved: the simplest honest measure of session work. */
export const sessionVolume = (sets = []) =>
  round(
    sets.reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
    0,
  );

/* ------------------------------------------------------- decision constants */

/** Consecutive under-performing sessions before load is cut. */
const SESSIONS_BEFORE_DELOAD = 2;
/** Consecutive stalled sessions (no volume gain) before a reset. */
const SESSIONS_BEFORE_STALL_RESET = 3;
/** Fraction of load removed by a deload. */
const DELOAD_FRACTION = 0.1;
/** A set within this many reps of target still counts as hitting it. */
const REP_TOLERANCE = 0;

export const RECOMMENDATIONS = {
  increase_load: 'increase_load',
  add_reps: 'add_reps',
  hold: 'hold',
  deload: 'deload',
  reset_stall: 'reset_stall',
  insufficient_data: 'insufficient_data',
};

/* ------------------------------------------------------------ core decision */

/**
 * Recommends the next prescription for ONE exercise.
 *
 * @param {object} options
 * @param {object} options.exercise      DB record (equipment, mechanic, muscles).
 * @param {string} options.targetReps    Prescribed range, e.g. "8-12".
 * @param {number} options.targetSets    Prescribed set count.
 * @param {Array}  options.history       Performances, MOST RECENT FIRST. Each:
 *                                       { date, sets: [{reps, weightKg}] }
 */
export const recommendProgression = ({ exercise, targetReps, targetSets, history = [] }) => {
  const range = parseRepRange(targetReps);
  const increment = loadIncrementFor(exercise);
  const isBodyweight = increment === 0;

  if (history.length === 0) {
    return {
      recommendation: RECOMMENDATIONS.insufficient_data,
      reason: 'No logged sessions yet — record one to start tracking progression.',
      targetReps,
      targetSets,
      suggestedWeightKg: null,
      increment,
    };
  }

  const latest = history[0];
  const workingSets = (latest.sets ?? []).filter((s) => (s.reps ?? 0) > 0);

  if (workingSets.length === 0) {
    return {
      recommendation: RECOMMENDATIONS.insufficient_data,
      reason: 'The last session has no completed sets.',
      targetReps,
      targetSets,
      suggestedWeightKg: null,
      increment,
    };
  }

  // The load actually used — the heaviest working set, not an average, since
  // that is what the next session has to beat.
  const currentLoad = Math.max(...workingSets.map((s) => s.weightKg ?? 0));
  const setsAtTopOfRange = workingSets.filter(
    (s) => (s.reps ?? 0) >= range.max - REP_TOLERANCE,
  ).length;
  const setsBelowRange = workingSets.filter((s) => (s.reps ?? 0) < range.min).length;
  const completedAllSets = workingSets.length >= targetSets;

  /* --- deload: repeatedly failing to reach the bottom of the range ------- */
  const recentFailures = history
    .slice(0, SESSIONS_BEFORE_DELOAD)
    .filter((session) => {
      const sets = (session.sets ?? []).filter((s) => (s.reps ?? 0) > 0);
      if (sets.length === 0) return false;
      return sets.some((s) => (s.reps ?? 0) < range.min);
    });

  if (
    recentFailures.length >= SESSIONS_BEFORE_DELOAD &&
    history.length >= SESSIONS_BEFORE_DELOAD &&
    !isBodyweight &&
    currentLoad > 0
  ) {
    const deloaded = roundToIncrement(currentLoad * (1 - DELOAD_FRACTION), increment);
    return {
      recommendation: RECOMMENDATIONS.deload,
      reason: `You fell below ${range.min} reps in your last ${SESSIONS_BEFORE_DELOAD} sessions. Cutting the load about 10% to rebuild.`,
      targetReps,
      targetSets,
      suggestedWeightKg: deloaded,
      previousWeightKg: currentLoad,
      increment,
    };
  }

  /* --- stall reset: volume flat across several sessions ------------------ */
  if (history.length >= SESSIONS_BEFORE_STALL_RESET && !isBodyweight && currentLoad > 0) {
    const volumes = history
      .slice(0, SESSIONS_BEFORE_STALL_RESET)
      .map((session) => sessionVolume(session.sets));

    // No session improved on the one before it (history is newest-first).
    const stalled = volumes.every((v, i) => i === 0 || v <= volumes[i - 1] * 1.01);
    const noProgress = Math.max(...volumes) - Math.min(...volumes) <= Math.max(...volumes) * 0.03;

    if (stalled && noProgress) {
      const deloaded = roundToIncrement(currentLoad * (1 - DELOAD_FRACTION), increment);
      return {
        recommendation: RECOMMENDATIONS.reset_stall,
        reason: `Volume has been flat for ${SESSIONS_BEFORE_STALL_RESET} sessions. A small step back usually breaks a plateau faster than grinding on.`,
        targetReps,
        targetSets,
        suggestedWeightKg: deloaded,
        previousWeightKg: currentLoad,
        increment,
      };
    }
  }

  /* --- progress: every set at the top of the range ----------------------- */
  if (setsAtTopOfRange >= workingSets.length && completedAllSets) {
    if (isBodyweight) {
      return {
        recommendation: RECOMMENDATIONS.add_reps,
        reason: `You hit ${range.max} reps on every set. This is a bodyweight movement, so add reps or slow the tempo rather than load.`,
        targetReps: `${range.min + 2}-${range.max + 2}`,
        targetSets,
        suggestedWeightKg: null,
        increment,
      };
    }
    return {
      recommendation: RECOMMENDATIONS.increase_load,
      reason: `You hit ${range.max} reps on all ${workingSets.length} sets. Add ${increment} kg and work back up from ${range.min} reps.`,
      targetReps,
      targetSets,
      suggestedWeightKg: roundToIncrement(currentLoad + increment, increment),
      previousWeightKg: currentLoad,
      increment,
    };
  }

  /* --- hold: inside the range, keep climbing ----------------------------- */
  if (setsBelowRange === 0) {
    return {
      recommendation: RECOMMENDATIONS.add_reps,
      reason: `You're inside the ${range.min}-${range.max} range. Stay at ${currentLoad} kg and add reps until every set reaches ${range.max}.`,
      targetReps,
      targetSets,
      suggestedWeightKg: currentLoad || null,
      previousWeightKg: currentLoad,
      increment,
    };
  }

  /* --- otherwise: repeat the session ------------------------------------ */
  return {
    recommendation: RECOMMENDATIONS.hold,
    reason: `Some sets fell below ${range.min} reps. Repeat this session at ${currentLoad} kg before adding load.`,
    targetReps,
    targetSets,
    suggestedWeightKg: currentLoad || null,
    previousWeightKg: currentLoad,
    increment,
  };
};

/** Snaps a load to a liftable value for the equipment's plate/pin steps. */
export const roundToIncrement = (weight, increment) => {
  if (!increment || increment <= 0) return round(weight);
  return round(Math.max(Math.round(weight / increment) * increment, increment));
};

/* ------------------------------------------------------------- consistency */

/**
 * Training consistency over a window, plus the current streak.
 *
 * A "streak" here counts consecutive *weeks* in which the user met their
 * planned frequency — not consecutive days, which would punish anyone following
 * a sane programme with rest days.
 */
export const analyseConsistency = (logs = [], { trainingDaysPerWeek = 3, weeks = 8 } = {}) => {
  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  const buckets = Array.from({ length: weeks }, (_, i) => ({
    weeksAgo: i,
    start: new Date(now.getTime() - (i + 1) * msPerWeek),
    end: new Date(now.getTime() - i * msPerWeek),
    sessions: 0,
  }));

  for (const log of logs) {
    const date = new Date(log.date ?? log.createdAt);
    for (const bucket of buckets) {
      if (date > bucket.start && date <= bucket.end) {
        bucket.sessions += 1;
        break;
      }
    }
  }

  // Streak: consecutive complete weeks from the most recent one backwards.
  let streakWeeks = 0;
  for (const bucket of buckets) {
    if (bucket.sessions >= trainingDaysPerWeek) streakWeeks += 1;
    else break;
  }

  const totalSessions = buckets.reduce((sum, b) => sum + b.sessions, 0);
  const expected = trainingDaysPerWeek * weeks;

  return {
    streakWeeks,
    sessionsThisWeek: buckets[0]?.sessions ?? 0,
    trainingDaysPerWeek,
    totalSessions,
    windowWeeks: weeks,
    adherencePercent: expected > 0 ? Math.round((totalSessions / expected) * 100) : 0,
    // Oldest first, so charts read left to right.
    weekly: [...buckets].reverse().map((b) => ({
      weeksAgo: b.weeksAgo,
      sessions: b.sessions,
      target: trainingDaysPerWeek,
      weekStart: b.start.toISOString().slice(0, 10),
    })),
  };
};
