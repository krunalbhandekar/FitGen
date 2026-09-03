/**
 * Weekly split structure.
 *
 * The *shape* of a training week (which day trains what, how many days) is
 * settled sports-science convention, not a judgement call — so it is computed
 * here rather than asked of the LLM. The model's job is only to choose and
 * order exercises within a day that has already been defined.
 *
 * Muscle names match the seeded exercise DB vocabulary exactly.
 */

export const DAY_TEMPLATES = {
  push: {
    name: 'Push',
    focus: ['chest', 'shoulders', 'triceps'],
    description: 'Chest, shoulders and triceps — pressing patterns.',
  },
  pull: {
    name: 'Pull',
    focus: ['lats', 'middle back', 'biceps', 'traps'],
    description: 'Back and biceps — pulling patterns.',
  },
  legs: {
    name: 'Legs',
    focus: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
    description: 'Lower body — squat and hinge patterns.',
  },
  upper: {
    name: 'Upper',
    focus: ['chest', 'lats', 'shoulders', 'middle back', 'biceps', 'triceps'],
    description: 'Whole upper body.',
  },
  lower: {
    name: 'Lower',
    focus: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
    description: 'Whole lower body.',
  },
  full_body: {
    name: 'Full Body',
    focus: ['chest', 'lats', 'quadriceps', 'hamstrings', 'shoulders', 'glutes'],
    description: 'Compound-led session covering the whole body.',
  },
  chest: {
    name: 'Chest',
    focus: ['chest', 'triceps'],
    description: 'Chest-focused with triceps support.',
  },
  back: {
    name: 'Back',
    focus: ['lats', 'middle back', 'biceps'],
    description: 'Back-focused with biceps support.',
  },
  shoulders: {
    name: 'Shoulders',
    focus: ['shoulders', 'traps'],
    description: 'Deltoids and traps.',
  },
  arms: {
    name: 'Arms',
    focus: ['biceps', 'triceps', 'forearms'],
    description: 'Direct arm work.',
  },
};

/**
 * Ordered day sequences per split and training frequency.
 * Sequences are chosen so consecutive days don't repeat the same muscles where
 * the frequency allows it.
 */
const SCHEDULES = {
  ppl: {
    3: ['push', 'pull', 'legs'],
    4: ['push', 'pull', 'legs', 'upper'],
    5: ['push', 'pull', 'legs', 'push', 'pull'],
    6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
    7: ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'full_body'],
  },
  upper_lower: {
    2: ['upper', 'lower'],
    3: ['upper', 'lower', 'full_body'],
    4: ['upper', 'lower', 'upper', 'lower'],
    5: ['upper', 'lower', 'upper', 'lower', 'full_body'],
    6: ['upper', 'lower', 'upper', 'lower', 'upper', 'lower'],
    7: ['upper', 'lower', 'upper', 'lower', 'upper', 'lower', 'full_body'],
  },
  bro_split: {
    4: ['chest', 'back', 'shoulders', 'legs'],
    5: ['chest', 'back', 'shoulders', 'arms', 'legs'],
    6: ['chest', 'back', 'shoulders', 'arms', 'legs', 'full_body'],
    7: ['chest', 'back', 'shoulders', 'arms', 'legs', 'full_body', 'full_body'],
  },
  full_body: {
    2: ['full_body', 'full_body'],
    3: ['full_body', 'full_body', 'full_body'],
    4: ['full_body', 'full_body', 'full_body', 'full_body'],
    5: ['full_body', 'upper', 'lower', 'full_body', 'upper'],
    6: ['full_body', 'upper', 'lower', 'full_body', 'upper', 'lower'],
    7: ['full_body', 'upper', 'lower', 'full_body', 'upper', 'lower', 'full_body'],
  },
};

/** Minimum training days each split needs to make sense. */
export const SPLIT_MIN_DAYS = {
  ppl: 3,
  upper_lower: 2,
  bro_split: 4,
  full_body: 2,
};

/**
 * Builds the week's day sequence, falling back sensibly when the requested
 * frequency isn't directly supported (e.g. PPL with 2 days becomes full body).
 *
 * @returns {{ days: Array<{key,name,focus,description}>, note?: string }}
 */
export const buildSchedule = (splitType, daysPerWeek) => {
  const clampedDays = Math.min(Math.max(Number(daysPerWeek) || 3, 1), 7);
  const table = SCHEDULES[splitType];

  if (!table) {
    return {
      days: Array.from({ length: clampedDays }, () => DAY_TEMPLATES.full_body),
      note: `Unknown split "${splitType}" — defaulted to full body.`,
    };
  }

  let note;
  let sequence = table[clampedDays];

  if (!sequence) {
    const minimum = SPLIT_MIN_DAYS[splitType];
    if (clampedDays < minimum) {
      // Too few days for this split: full body is the correct substitute.
      sequence = Array.from({ length: clampedDays }, () => 'full_body');
      note = `${splitType.replace('_', '/')} needs at least ${minimum} days a week; built a ${clampedDays}-day full-body week instead.`;
    } else {
      // Otherwise repeat the base sequence to fill the week.
      const base = table[SPLIT_MIN_DAYS[splitType]] ?? ['full_body'];
      sequence = Array.from(
        { length: clampedDays },
        (_, i) => base[i % base.length],
      );
    }
  }

  return {
    days: sequence.map((key) => ({ key, ...DAY_TEMPLATES[key] })),
    note,
  };
};

/**
 * Volume prescription per goal — sets and rep ranges are goal-dependent and
 * well established, so they are computed, not generated.
 */
export const VOLUME_GUIDELINES = {
  build_muscle: { exercises: [4, 6], sets: '3-4', reps: '8-12', restSeconds: 90 },
  gain_strength: { exercises: [4, 5], sets: '4-5', reps: '3-6', restSeconds: 180 },
  lose_fat: { exercises: [5, 6], sets: '3', reps: '10-15', restSeconds: 60 },
  recomp: { exercises: [4, 6], sets: '3-4', reps: '8-12', restSeconds: 90 },
  maintain: { exercises: [4, 5], sets: '3', reps: '8-12', restSeconds: 90 },
};

export const guidelinesForGoal = (goal) =>
  VOLUME_GUIDELINES[goal] ?? VOLUME_GUIDELINES.maintain;
