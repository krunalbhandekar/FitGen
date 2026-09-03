/**
 * Streaks, badges and the consistency score.
 *
 * Everything here is DERIVED from data the user already generated — workout
 * logs, check-ins and plans. Nothing is stored.
 *
 * That is a deliberate choice: a stored `badges` array is a second source of
 * truth that drifts the moment a log is deleted or backdated, and it invites
 * the classic bug where a badge stays awarded after the thing that earned it is
 * gone. Recomputing is cheap at this scale and cannot disagree with the logs.
 */

const round = (value, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

const DAY = 24 * 60 * 60 * 1000;

/* ---------------------------------------------------------- consistency score */

/**
 * A single 0–100 figure, weighted across four things that actually indicate
 * adherence. Weights are a reasoned split, not a derived constant:
 *
 *   adherence  40  did you train as often as you planned
 *   recency    25  have you trained lately (a great month last year is not
 *                  consistency)
 *   streak     20  consecutive complete weeks
 *   logging    15  are you recording check-ins, not just training
 */
export const CONSISTENCY_WEIGHTS = {
  adherence: 40,
  recency: 25,
  streak: 20,
  logging: 15,
};

/** Streak weeks needed to max that component. */
const STREAK_TARGET_WEEKS = 8;
/** A check-in this often counts as fully logging. */
const CHECKIN_TARGET_PER_MONTH = 4;

export const consistencyScore = ({ consistency, workoutLogs = [], progressLogs = [] }) => {
  // --- adherence: capped at 100, so overtraining does not inflate the score.
  const adherence = Math.min(consistency?.adherencePercent ?? 0, 100);

  // --- recency: full marks within 3 days, decaying to zero at 21.
  const lastWorkout = workoutLogs[0]?.date ?? workoutLogs[0]?.createdAt;
  let recency = 0;
  if (lastWorkout) {
    const daysAgo = (Date.now() - new Date(lastWorkout).getTime()) / DAY;
    if (daysAgo <= 3) recency = 100;
    else if (daysAgo >= 21) recency = 0;
    else recency = round(((21 - daysAgo) / 18) * 100);
  }

  // --- streak
  const streak = Math.min(
    ((consistency?.streakWeeks ?? 0) / STREAK_TARGET_WEEKS) * 100,
    100,
  );

  // --- logging: check-ins in the last 30 days.
  const recentCheckIns = progressLogs.filter(
    (log) => Date.now() - new Date(log.date).getTime() <= 30 * DAY,
  ).length;
  const logging = Math.min((recentCheckIns / CHECKIN_TARGET_PER_MONTH) * 100, 100);

  const components = { adherence, recency, streak, logging };

  const score = round(
    Object.entries(CONSISTENCY_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + (components[key] / 100) * weight,
      0,
    ),
  );

  let band;
  if (score >= 85) band = 'excellent';
  else if (score >= 65) band = 'strong';
  else if (score >= 40) band = 'building';
  else if (score > 0) band = 'getting started';
  else band = 'no data';

  return {
    score,
    band,
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [
        key,
        { value: round(value), weight: CONSISTENCY_WEIGHTS[key] },
      ]),
    ),
    /*
     * The component where improvement would move the score most.
     *
     * That is the largest *weighted headroom* — how many points are still on
     * the table — not simply the lowest component. A component sitting at zero
     * with a small weight is worth less than a mid-range component with a large
     * one: logging at 0/100 (weight 15) offers 15 points, while adherence at
     * 50/100 (weight 40) offers 20. Ranking by the raw value would send the
     * user after the smaller win.
     *
     * Null when there is nothing to gain — no data at all, or everything maxed.
     */
    weakest:
      score === 0
        ? null
        : (Object.entries(components)
            .map(([key, value]) => ({
              key,
              gain: ((100 - value) / 100) * CONSISTENCY_WEIGHTS[key],
            }))
            .filter((entry) => entry.gain > 0)
            .sort((a, b) => b.gain - a.gain)[0]?.key ?? null),
  };
};

/* -------------------------------------------------------------------- badges */

/**
 * Badge catalogue.
 *
 * Each badge is a pure predicate over the user's data plus a `progress`
 * function, so a locked badge can show how close it is rather than being an
 * opaque grey box. Tiered families (sessions, streaks) let early progress feel
 * real without cheapening the later tiers.
 */
export const BADGES = [
  /* --- getting started --- */
  {
    id: 'first-session',
    name: 'First Rep',
    description: 'Log your first training session.',
    tier: 'bronze',
    group: 'sessions',
    earned: (d) => d.workoutCount >= 1,
    progress: (d) => ({ current: Math.min(d.workoutCount, 1), target: 1 }),
  },
  {
    id: 'first-checkin',
    name: 'Baseline Set',
    description: 'Record your first body check-in.',
    tier: 'bronze',
    group: 'tracking',
    earned: (d) => d.checkInCount >= 1,
    progress: (d) => ({ current: Math.min(d.checkInCount, 1), target: 1 }),
  },
  {
    id: 'profile-complete',
    name: 'Fully Kitted',
    description: 'Complete your profile and generate both plans.',
    tier: 'bronze',
    group: 'setup',
    earned: (d) => d.onboarded && d.hasWorkoutPlan && d.hasDietPlan,
    progress: (d) => ({
      current: [d.onboarded, d.hasWorkoutPlan, d.hasDietPlan].filter(Boolean).length,
      target: 3,
    }),
  },

  /* --- session volume tiers --- */
  {
    id: 'sessions-10',
    name: 'Ten Down',
    description: 'Log 10 training sessions.',
    tier: 'bronze',
    group: 'sessions',
    earned: (d) => d.workoutCount >= 10,
    progress: (d) => ({ current: Math.min(d.workoutCount, 10), target: 10 }),
  },
  {
    id: 'sessions-50',
    name: 'Half Century',
    description: 'Log 50 training sessions.',
    tier: 'silver',
    group: 'sessions',
    earned: (d) => d.workoutCount >= 50,
    progress: (d) => ({ current: Math.min(d.workoutCount, 50), target: 50 }),
  },
  {
    id: 'sessions-100',
    name: 'Centurion',
    description: 'Log 100 training sessions.',
    tier: 'gold',
    group: 'sessions',
    earned: (d) => d.workoutCount >= 100,
    progress: (d) => ({ current: Math.min(d.workoutCount, 100), target: 100 }),
  },

  /* --- streak tiers --- */
  {
    id: 'streak-2',
    name: 'Back-to-Back',
    description: 'Hit your planned frequency two weeks running.',
    tier: 'bronze',
    group: 'streak',
    earned: (d) => d.streakWeeks >= 2,
    progress: (d) => ({ current: Math.min(d.streakWeeks, 2), target: 2 }),
  },
  {
    id: 'streak-4',
    name: 'Month Locked In',
    description: 'Four consecutive weeks at your planned frequency.',
    tier: 'silver',
    group: 'streak',
    earned: (d) => d.streakWeeks >= 4,
    progress: (d) => ({ current: Math.min(d.streakWeeks, 4), target: 4 }),
  },
  {
    id: 'streak-12',
    name: 'Quarter Season',
    description: 'Twelve consecutive weeks at your planned frequency.',
    tier: 'gold',
    group: 'streak',
    earned: (d) => d.streakWeeks >= 12,
    progress: (d) => ({ current: Math.min(d.streakWeeks, 12), target: 12 }),
  },

  /* --- volume moved --- */
  {
    id: 'volume-10t',
    name: 'Ten Tonnes',
    description: 'Move 10,000 kg of total volume.',
    tier: 'bronze',
    group: 'volume',
    earned: (d) => d.totalVolumeKg >= 10_000,
    progress: (d) => ({ current: Math.min(d.totalVolumeKg, 10_000), target: 10_000 }),
  },
  {
    id: 'volume-100t',
    name: 'Hundred Tonnes',
    description: 'Move 100,000 kg of total volume.',
    tier: 'silver',
    group: 'volume',
    earned: (d) => d.totalVolumeKg >= 100_000,
    progress: (d) => ({ current: Math.min(d.totalVolumeKg, 100_000), target: 100_000 }),
  },
  {
    id: 'volume-500t',
    name: 'Half a Million',
    description: 'Move 500,000 kg of total volume.',
    tier: 'gold',
    group: 'volume',
    earned: (d) => d.totalVolumeKg >= 500_000,
    progress: (d) => ({ current: Math.min(d.totalVolumeKg, 500_000), target: 500_000 }),
  },

  /* --- progression behaviour, not just turning up --- */
  {
    id: 'progressive-overload',
    name: 'Overloaded',
    description: 'Beat a previous best on the same exercise.',
    tier: 'silver',
    group: 'progression',
    earned: (d) => d.hasBeatenAPreviousBest,
    progress: (d) => ({ current: d.hasBeatenAPreviousBest ? 1 : 0, target: 1 }),
  },
  {
    id: 'consistency-80',
    name: 'Reliable',
    description: 'Reach a consistency score of 80.',
    tier: 'silver',
    group: 'consistency',
    earned: (d) => d.consistencyScore >= 80,
    progress: (d) => ({ current: Math.min(d.consistencyScore, 80), target: 80 }),
  },
  {
    id: 'tracking-10',
    name: 'Measured',
    description: 'Record 10 body check-ins.',
    tier: 'silver',
    group: 'tracking',
    earned: (d) => d.checkInCount >= 10,
    progress: (d) => ({ current: Math.min(d.checkInCount, 10), target: 10 }),
  },
  {
    id: 'curious',
    name: 'Asked the Coach',
    description: 'Ask the AI coach a question.',
    tier: 'bronze',
    group: 'engagement',
    earned: (d) => d.chatCount >= 1,
    progress: (d) => ({ current: Math.min(d.chatCount, 1), target: 1 }),
  },
];

export const BADGE_TIERS = ['bronze', 'silver', 'gold'];

/**
 * Evaluates the catalogue against a user's derived stats.
 *
 * @param {object} stats  See `buildBadgeInput` in the controller.
 */
export const evaluateBadges = (stats) => {
  const evaluated = BADGES.map((badge) => {
    const earned = Boolean(badge.earned(stats));
    const { current, target } = badge.progress(stats);
    return {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      tier: badge.tier,
      group: badge.group,
      earned,
      progress: {
        current: round(current, 1),
        target,
        percent: target > 0 ? Math.min(round((current / target) * 100), 100) : 0,
      },
    };
  });

  const earned = evaluated.filter((b) => b.earned);

  // Nearest unearned badge, so the UI can suggest one concrete next thing.
  const nextUp = evaluated
    .filter((b) => !b.earned && b.progress.percent > 0)
    .sort((a, b) => b.progress.percent - a.progress.percent)[0] ?? null;

  return {
    badges: evaluated,
    summary: {
      earned: earned.length,
      total: evaluated.length,
      byTier: Object.fromEntries(
        BADGE_TIERS.map((tier) => [
          tier,
          {
            earned: earned.filter((b) => b.tier === tier).length,
            total: evaluated.filter((b) => b.tier === tier).length,
          },
        ]),
      ),
    },
    nextUp,
  };
};

/**
 * Detects whether the user has ever beaten a previous best on an exercise.
 *
 * Uses the stored estimated 1RM per logged exercise: if a later session exceeds
 * an earlier one for the same slug, progressive overload actually happened —
 * which is a more meaningful achievement than session count.
 */
export const hasBeatenAPreviousBest = (workoutLogs = []) => {
  // Logs arrive newest-first; walk oldest-first so "previous" means previous.
  const chronological = [...workoutLogs].reverse();
  const best = new Map();

  for (const log of chronological) {
    for (const entry of log.exercises ?? []) {
      const value = entry.estimatedOneRepMaxKg;
      if (!value) continue;
      const previous = best.get(entry.slug);
      if (previous !== undefined && value > previous) return true;
      if (previous === undefined || value > previous) best.set(entry.slug, value);
    }
  }
  return false;
};
