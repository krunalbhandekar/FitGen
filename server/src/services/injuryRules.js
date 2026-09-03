/**
 * Injury-aware exercise filtering.
 *
 * This is deliberately deterministic and runs *before* the LLM sees anything:
 * unsafe exercises are removed from the candidate list, so the model cannot
 * prescribe one even if it wanted to. Asking an LLM to "avoid exercises that
 * hurt the knee" is a suggestion; removing them from the input is a guarantee.
 *
 * The maps below translate a user-declared injury area into the muscle
 * vocabulary actually used by the seeded `free-exercise-db` records.
 */

/** Injury area → muscles (as spelled in the exercise DB) that load it. */
export const INJURY_MUSCLE_MAP = {
  shoulder: ['shoulders', 'chest', 'traps'],
  elbow: ['triceps', 'biceps', 'forearms'],
  wrist: ['forearms', 'biceps'],
  neck: ['neck', 'traps'],
  upper_back: ['middle back', 'traps', 'lats'],
  lower_back: ['lower back', 'glutes', 'hamstrings'],
  hip: ['glutes', 'abductors', 'adductors'],
  knee: ['quadriceps', 'hamstrings', 'calves'],
  ankle: ['calves'],
  chest: ['chest'],
  hamstring: ['hamstrings', 'glutes'],
  groin: ['adductors', 'abductors'],
  calf: ['calves'],
};

/**
 * Areas where axial/spinal loading is the real risk, not just the muscle.
 * For these, severe cases also drop heavy compound movements that load the
 * spine even when the injured muscle isn't the primary mover.
 */
const AXIAL_LOAD_AREAS = new Set(['lower_back', 'neck', 'upper_back']);

const AXIAL_RISK_EQUIPMENT = new Set(['barbell', 'e-z curl bar']);

/**
 * Severity determines how aggressively we filter:
 *
 * - severe   → exclude if the area's muscles appear as PRIMARY or SECONDARY,
 *              plus axial-loading compounds for spinal areas
 * - moderate → exclude if they appear as PRIMARY
 * - mild     → keep, but attach a caution note
 */
export const SEVERITY_POLICY = {
  severe: { blocksPrimary: true, blocksSecondary: true, blocksAxial: true },
  moderate: { blocksPrimary: true, blocksSecondary: false, blocksAxial: false },
  mild: { blocksPrimary: false, blocksSecondary: false, blocksAxial: false },
};

const norm = (list) => (list ?? []).map((m) => String(m).toLowerCase());

/**
 * Decides whether one exercise is safe given one injury.
 * @returns {{ blocked: boolean, reason?: string, caution?: string }}
 */
export const assessExercise = (exercise, injury) => {
  const muscles = INJURY_MUSCLE_MAP[injury.area];
  if (!muscles) return { blocked: false };

  const policy = SEVERITY_POLICY[injury.severity] ?? SEVERITY_POLICY.moderate;

  const primary = norm(exercise.primaryMuscles);
  const secondary = norm(exercise.secondaryMuscles);

  const hitsPrimary = muscles.some((m) => primary.includes(m));
  const hitsSecondary = muscles.some((m) => secondary.includes(m));

  if (policy.blocksPrimary && hitsPrimary) {
    return {
      blocked: true,
      reason: `directly loads the ${injury.area.replace('_', ' ')} (${injury.severity})`,
    };
  }

  if (policy.blocksSecondary && hitsSecondary) {
    return {
      blocked: true,
      reason: `indirectly loads the ${injury.area.replace('_', ' ')} (${injury.severity})`,
    };
  }

  if (
    policy.blocksAxial &&
    AXIAL_LOAD_AREAS.has(injury.area) &&
    exercise.mechanic === 'compound' &&
    AXIAL_RISK_EQUIPMENT.has(exercise.equipment)
  ) {
    return {
      blocked: true,
      reason: `heavy spinal loading with a ${injury.area.replace('_', ' ')} injury`,
    };
  }

  if (!policy.blocksPrimary && (hitsPrimary || hitsSecondary)) {
    return {
      blocked: false,
      caution: `Involves the ${injury.area.replace('_', ' ')} — reduce load and stop if it aggravates.`,
    };
  }

  return { blocked: false };
};

/**
 * Filters a list of exercises against every declared injury.
 *
 * @returns {{ safe: Array, blocked: Array, cautions: Map<string,string[]> }}
 */
export const filterByInjuries = (exercises, injuries = []) => {
  if (!injuries.length) {
    return { safe: exercises, blocked: [], cautions: new Map() };
  }

  const safe = [];
  const blocked = [];
  const cautions = new Map();

  for (const exercise of exercises) {
    let isBlocked = false;
    const notes = [];

    for (const injury of injuries) {
      const verdict = assessExercise(exercise, injury);
      if (verdict.blocked) {
        blocked.push({
          slug: exercise.slug,
          name: exercise.name,
          reason: verdict.reason,
          area: injury.area,
        });
        isBlocked = true;
        break;
      }
      if (verdict.caution) notes.push(verdict.caution);
    }

    if (!isBlocked) {
      safe.push(exercise);
      if (notes.length) cautions.set(exercise.slug, notes);
    }
  }

  return { safe, blocked, cautions };
};

/** Human-readable summary for the plan's `safetyNotes`. */
export const summariseInjuryFiltering = (injuries, blocked) => {
  if (!injuries.length) return [];

  const byArea = new Map();
  for (const entry of blocked) {
    byArea.set(entry.area, (byArea.get(entry.area) ?? 0) + 1);
  }

  return injuries.map((injury) => {
    const count = byArea.get(injury.area) ?? 0;
    const area = injury.area.replace('_', ' ');
    return count > 0
      ? `${area} (${injury.severity}): ${count} exercise${count === 1 ? '' : 's'} excluded from selection.`
      : `${area} (${injury.severity}): no exercises needed excluding, load monitored.`;
  });
};
