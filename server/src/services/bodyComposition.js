/**
 * Body-composition estimates.
 *
 * Deterministic, like everything in fitnessCalc.js — the LLM is never involved
 * in a number a user might act on.
 *
 * Reference — U.S. Navy circumference method (Hodgdon & Beckett, 1984),
 * metric form:
 *
 *   men:   %BF = 495 / (1.0324 − 0.19077·log10(waist − neck)
 *                              + 0.15456·log10(height)) − 450
 *   women: %BF = 495 / (1.29579 − 0.35004·log10(waist + hip − neck)
 *                                + 0.22100·log10(height)) − 450
 *
 * All circumferences in centimetres. The method is a regression fitted to a
 * military population: it is a useful *trend* tracker for one person over time,
 * and noticeably less reliable as an absolute figure — which is why the UI
 * presents the trend line rather than a single authoritative number.
 */

const round = (value, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

/** Plausible ranges; anything outside is a data-entry error, not a body. */
export const MEASUREMENT_LIMITS = {
  neckCm: [20, 70],
  waistCm: [40, 200],
  hipCm: [50, 200],
  chestCm: [50, 200],
  armCm: [15, 80],
  thighCm: [25, 100],
  calfCm: [20, 70],
};

/**
 * Navy-method body-fat estimate.
 *
 * @returns {{ value: number, category: string } | { unavailable: true, reason: string }}
 */
export const estimateBodyFat = ({ gender, heightCm, neckCm, waistCm, hipCm }) => {
  if (!heightCm || !neckCm || !waistCm) {
    return {
      unavailable: true,
      reason: 'Needs height, neck and waist measurements.',
    };
  }

  // Women's formula requires hip; men's does not.
  const needsHip = gender === 'female';
  if (needsHip && !hipCm) {
    return {
      unavailable: true,
      reason: 'The female formula also needs a hip measurement.',
    };
  }

  let percent;

  if (gender === 'female') {
    const inner = waistCm + hipCm - neckCm;
    if (inner <= 0) {
      return { unavailable: true, reason: 'Measurements are inconsistent.' };
    }
    percent =
      495 /
        (1.29579 - 0.35004 * Math.log10(inner) + 0.221 * Math.log10(heightCm)) -
      450;
  } else {
    /*
     * Male formula. Users who select "other" are estimated with it too, since
     * the method offers no third variant — disclosed to the caller below,
     * matching how the BMR calculation handles the same gap.
     */
    const inner = waistCm - neckCm;
    if (inner <= 0) {
      return {
        unavailable: true,
        reason: 'Waist must be larger than neck for this formula.',
      };
    }
    percent =
      495 /
        (1.0324 - 0.19077 * Math.log10(inner) + 0.15456 * Math.log10(heightCm)) -
      450;
  }

  // The regression can produce nonsense at extreme inputs.
  if (!Number.isFinite(percent) || percent < 2 || percent > 70) {
    return {
      unavailable: true,
      reason: 'The formula produced an implausible result — check your measurements.',
    };
  }

  return {
    value: round(percent),
    category: categoriseBodyFat(percent, gender),
    ...(gender !== 'male' && gender !== 'female'
      ? {
          note: 'Estimated with the male formula — the Navy method defines no third variant.',
        }
      : {}),
  };
};

/**
 * ACE/ACSM-style descriptive bands. Advisory only — these are population
 * descriptors, not health diagnoses.
 */
export const categoriseBodyFat = (percent, gender) => {
  const bands =
    gender === 'female'
      ? [
          [13, 'essential'],
          [20, 'athletic'],
          [24, 'fitness'],
          [31, 'average'],
          [Infinity, 'above average'],
        ]
      : [
          [5, 'essential'],
          [13, 'athletic'],
          [17, 'fitness'],
          [24, 'average'],
          [Infinity, 'above average'],
        ];

  return bands.find(([limit]) => percent < limit)[1];
};

/** Lean mass and fat mass, once a body-fat percentage is known. */
export const bodyComposition = (weightKg, bodyFatPercent) => {
  if (!weightKg || bodyFatPercent == null) return null;
  const fatMass = (weightKg * bodyFatPercent) / 100;
  return {
    fatMassKg: round(fatMass),
    leanMassKg: round(weightKg - fatMass),
  };
};

/**
 * Waist-to-height ratio — a simpler central-adiposity indicator than BMI, and
 * one that needs no body-fat estimate. Below 0.5 is the common guideline.
 */
export const waistToHeightRatio = (waistCm, heightCm) => {
  if (!waistCm || !heightCm) return null;
  const ratio = waistCm / heightCm;
  return {
    value: round(ratio, 2),
    healthy: ratio < 0.5,
  };
};

/** Validates a measurement against its plausible range. */
export const validateMeasurement = (field, value) => {
  const limits = MEASUREMENT_LIMITS[field];
  if (!limits || value == null) return null;
  const [min, max] = limits;
  if (value < min || value > max) {
    return `${field} should be between ${min} and ${max} cm`;
  }
  return null;
};
