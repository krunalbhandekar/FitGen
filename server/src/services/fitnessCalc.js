/**
 * Deterministic fitness calculations.
 *
 * Every number here is computed from a published formula — never from the LLM.
 * That split is deliberate: identical inputs must always produce identical
 * targets, which an LLM cannot guarantee. Groq is used only for the
 * *personalisation* layer in Phase 3 (which exercises pair, how meals compose),
 * constrained to the seeded database.
 *
 * References:
 * - BMR: Mifflin MD, St Jeor ST, et al. "A new predictive equation for resting
 *   energy expenditure in healthy individuals." Am J Clin Nutr. 1990;51(2):241-7.
 * - Activity multipliers: standard Harris-Benedict/Mifflin PAL factors.
 * - Protein targets: Morton et al. (2018) meta-analysis; ~1.6 g/kg saturates
 *   hypertrophy response, with higher intakes used to protect lean mass in a
 *   deficit (Helms et al., 2014).
 */

const round = (value, dp = 0) => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/* ------------------------------------------------------------------ constants */

export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS = {
  sedentary: 'Desk job, little deliberate movement',
  light: 'Light exercise 1–3 days/week',
  moderate: 'Moderate exercise 3–5 days/week',
  active: 'Hard exercise 6–7 days/week',
  very_active: 'Physical job or twice-daily training',
};

/**
 * Calorie adjustment per goal, as a fraction of TDEE.
 * Deliberately conservative: a 20% deficit is aggressive enough to show weekly
 * progress without the lean-mass loss and adherence failure of a crash deficit.
 */
export const GOAL_ADJUSTMENTS = {
  lose_fat: -0.2,
  recomp: -0.05,
  maintain: 0,
  gain_strength: 0.08,
  build_muscle: 0.12,
};

export const GOAL_LABELS = {
  lose_fat: 'Lose fat',
  recomp: 'Body recomposition',
  maintain: 'Maintain',
  gain_strength: 'Gain strength',
  build_muscle: 'Build muscle',
};

/** Protein in g per kg of bodyweight, by goal. */
const PROTEIN_PER_KG = {
  lose_fat: 2.2,
  recomp: 2.2,
  maintain: 1.6,
  gain_strength: 1.8,
  build_muscle: 1.8,
};

const FAT_CALORIE_SHARE = 0.25;
const MIN_FAT_PER_KG = 0.6; // hormonal-health floor
const ABSOLUTE_MIN_FAT_PER_KG = 0.4; // only breached to keep carbs viable
const MIN_CARBS_G = 50; // brain/CNS + training fuel floor

// Never prescribe below these, regardless of formula output.
const CALORIE_FLOOR = { male: 1500, female: 1200, other: 1350 };

const KCAL = { protein: 4, carbs: 4, fats: 9 };

/* -------------------------------------------------------------------- helpers */

/** Whole years, accounting for whether this year's birthday has passed. */
export const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
};

/**
 * Mifflin-St Jeor resting energy expenditure (kcal/day).
 *
 * The sex term is a constant offset (+5 male, -161 female). For users who
 * select "other" we use the midpoint (-78) rather than guessing, and surface
 * that as an assumption in the response.
 */
export const calculateBMR = ({ weightKg, heightCm, age, gender }) => {
  const offsets = { male: 5, female: -161, other: -78 };
  const offset = offsets[gender] ?? offsets.other;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + offset;
};

export const calculateTDEE = (bmr, activityLevel) =>
  bmr * (ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.sedentary);

export const calculateBMI = (weightKg, heightCm) => {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  let category;
  if (bmi < 18.5) category = 'underweight';
  else if (bmi < 25) category = 'healthy';
  else if (bmi < 30) category = 'overweight';
  else category = 'obese';

  return { value: round(bmi, 1), category };
};

/**
 * Splits a calorie target into grams of protein / fats / carbs.
 *
 * Order of operations matters: protein is anchored to bodyweight (it protects
 * lean mass and is the least negotiable), fat takes a calorie share subject to
 * a hormonal floor, and carbs absorb the remainder. Because a large deficit
 * combined with a heavy bodyweight can drive the remainder negative, fat is
 * then trimmed toward an absolute floor, and only if that is still not enough
 * is protein reduced — with the compromise reported back to the caller rather
 * than hidden.
 */
export const calculateMacros = ({ calories, weightKg, goal }) => {
  const notes = [];

  let proteinG = (PROTEIN_PER_KG[goal] ?? 1.8) * weightKg;
  let fatG = Math.max(
    (calories * FAT_CALORIE_SHARE) / KCAL.fats,
    MIN_FAT_PER_KG * weightKg,
  );

  let remaining = calories - proteinG * KCAL.protein - fatG * KCAL.fats;

  if (remaining < MIN_CARBS_G * KCAL.carbs) {
    // Step 1: trim fat toward its absolute floor.
    const fatFloorG = ABSOLUTE_MIN_FAT_PER_KG * weightKg;
    const deficitKcal = MIN_CARBS_G * KCAL.carbs - remaining;
    const trimmableG = Math.max(fatG - fatFloorG, 0);
    const trimG = Math.min(trimmableG, deficitKcal / KCAL.fats);

    if (trimG > 0) {
      fatG -= trimG;
      remaining += trimG * KCAL.fats;
      notes.push('Fat reduced toward its minimum to keep carbohydrates viable.');
    }
  }

  if (remaining < MIN_CARBS_G * KCAL.carbs) {
    // Step 2: reduce protein as a last resort.
    const deficitKcal = MIN_CARBS_G * KCAL.carbs - remaining;
    const reduceG = Math.min(deficitKcal / KCAL.protein, proteinG * 0.25);
    proteinG -= reduceG;
    remaining += reduceG * KCAL.protein;
    notes.push(
      'Protein target reduced slightly — your calorie target is very low relative to your bodyweight. Consider a smaller deficit.',
    );
  }

  const carbsG = Math.max(remaining / KCAL.carbs, 0);

  const macros = {
    protein: round(proteinG),
    carbs: round(carbsG),
    fats: round(fatG),
  };

  // Rounding to whole grams shifts the total slightly; report the honest sum
  // so the UI never shows macros that contradict the calorie figure.
  const kcalFromMacros =
    macros.protein * KCAL.protein +
    macros.carbs * KCAL.carbs +
    macros.fats * KCAL.fats;

  return {
    ...macros,
    proteinPerKg: round(macros.protein / weightKg, 2),
    caloriesFromMacros: round(kcalFromMacros),
    percentages: {
      protein: round((macros.protein * KCAL.protein * 100) / kcalFromMacros),
      carbs: round((macros.carbs * KCAL.carbs * 100) / kcalFromMacros),
      fats: round((macros.fats * KCAL.fats * 100) / kcalFromMacros),
    },
    notes,
  };
};

/**
 * Full target computation from a profile.
 *
 * Returns `null` when the profile lacks the fields the formulas need, so
 * callers can render an "incomplete" state instead of NaN.
 */
export const calculateTargets = (profile = {}) => {
  const { weightKg, heightCm, gender, dateOfBirth, activityLevel, goal } = profile;

  const age = calculateAge(dateOfBirth);

  const missing = [];
  if (!weightKg) missing.push('weightKg');
  if (!heightCm) missing.push('heightCm');
  if (age === null) missing.push('dateOfBirth');
  if (!activityLevel) missing.push('activityLevel');
  if (!goal) missing.push('goal');

  if (missing.length) return { complete: false, missing };

  const assumptions = [];
  if (!gender || gender === 'other') {
    assumptions.push(
      'BMR uses the midpoint of the male and female Mifflin-St Jeor constants.',
    );
  }

  const bmr = calculateBMR({ weightKg, heightCm, age, gender });
  const tdee = calculateTDEE(bmr, activityLevel);

  const adjustment = GOAL_ADJUSTMENTS[goal] ?? 0;
  let calories = tdee * (1 + adjustment);

  // Safety floors: never below BMR (except a mild deficit) or the absolute floor.
  const floor = CALORIE_FLOOR[gender] ?? CALORIE_FLOOR.other;
  if (calories < floor) {
    calories = floor;
    assumptions.push(
      `Calorie target raised to the ${floor} kcal safety floor for your profile.`,
    );
  }
  if (calories < bmr * 0.9) {
    calories = bmr * 0.9;
    assumptions.push(
      'Calorie target raised to 90% of BMR — deeper deficits risk lean-mass loss.',
    );
  }

  const macros = calculateMacros({ calories, weightKg, goal });
  const bmi = calculateBMI(weightKg, heightCm);

  // Rate of change: 7700 kcal ≈ 1 kg of body mass.
  const dailyDelta = calories - tdee;
  const weeklyWeightChangeKg = round((dailyDelta * 7) / 7700, 2);

  return {
    complete: true,
    age,
    bmr: round(bmr),
    tdee: round(tdee),
    calories: round(calories),
    activityMultiplier: ACTIVITY_MULTIPLIERS[activityLevel],
    goalAdjustmentPercent: round(adjustment * 100),
    macros,
    bmi,
    projection: {
      dailyDeltaKcal: round(dailyDelta),
      weeklyWeightChangeKg,
      // Only meaningful when moving toward a stated target weight.
      weeksToTarget:
        profile.targetWeightKg && Math.abs(weeklyWeightChangeKg) > 0.01
          ? Math.abs(
              round((profile.targetWeightKg - weightKg) / weeklyWeightChangeKg, 0),
            )
          : null,
    },
    hydrationMl: round(weightKg * 35),
    assumptions: [...assumptions, ...macros.notes],
  };
};

/* ---------------------------------------------------------- profile completeness */

/** Fields that must be present before Phase 3 can generate a plan. */
export const REQUIRED_PROFILE_FIELDS = [
  'gender',
  'dateOfBirth',
  'heightCm',
  'weightKg',
  'goal',
  'activityLevel',
  'trainingDaysPerWeek',
  'preferredSplit',
  'availableEquipment',
  'dietType',
  'mealsPerDay',
];

export const profileCompleteness = (profile = {}) => {
  const missing = REQUIRED_PROFILE_FIELDS.filter((field) => {
    const value = profile[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || value === '';
  });

  return {
    complete: missing.length === 0,
    missing,
    percent: round(
      ((REQUIRED_PROFILE_FIELDS.length - missing.length) /
        REQUIRED_PROFILE_FIELDS.length) *
        100,
    ),
  };
};

/**
 * Fields that invalidate an existing generated plan when changed.
 * Editing a nickname should not throw away a workout plan; changing available
 * equipment must.
 */
export const PLAN_RELEVANT_FIELDS = [
  'gender',
  'dateOfBirth',
  'heightCm',
  'weightKg',
  'goal',
  'targetWeightKg',
  'activityLevel',
  'trainingDaysPerWeek',
  'preferredSplit',
  'availableEquipment',
  'dietType',
  'allergies',
  'dislikedFoods',
  'mealsPerDay',
  'injuries',
];

const sameValue = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  if (a instanceof Date || b instanceof Date) {
    return new Date(a ?? 0).getTime() === new Date(b ?? 0).getTime();
  }
  return a === b;
};

/** Returns the plan-relevant field names that actually changed. */
export const detectPlanRelevantChanges = (previous = {}, next = {}) =>
  PLAN_RELEVANT_FIELDS.filter(
    (field) =>
      Object.prototype.hasOwnProperty.call(next, field) &&
      !sameValue(previous[field], next[field]),
  );
