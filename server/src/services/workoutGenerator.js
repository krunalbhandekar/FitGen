import { Exercise } from '../models/Exercise.js';
import {
  estimateTokens,
  generateJson,
  GroqUnavailableError,
  isGroqConfigured,
  TOKEN_BUDGET,
} from './groqClient.js';
import { filterByInjuries, summariseInjuryFiltering } from './injuryRules.js';
import { buildSchedule, guidelinesForGoal } from './splitTemplates.js';

/**
 * AI workout split generator.
 *
 * The architecture is the report's "hybrid AI + verified data" principle made
 * concrete, in four stages:
 *
 *   1. RETRIEVE  — pull only exercises matching the user's equipment, then
 *                  strip anything unsafe for their injuries (deterministic).
 *   2. GENERATE  — ask Groq to *select and order* from that shortlist, with a
 *                  JSON schema and the shortlist embedded in the prompt.
 *   3. GROUND    — discard any slug not in the shortlist. The model physically
 *                  cannot introduce an exercise that isn't in the database,
 *                  because unknown slugs are dropped, not trusted.
 *   4. FALLBACK  — if Groq is unavailable or its output is unusable, build the
 *                  plan deterministically from the same shortlist so the
 *                  feature never hard-fails.
 */

/*
 * Candidate pool size per session.
 *
 * 40 was wasteful: the model only picks 4-6 exercises, and every extra line
 * spends prompt budget against Groq's 8000 tokens/minute free-tier cap. 20
 * ranked candidates give ample choice; `fitToBudget` trims further if a week
 * has many distinct sessions.
 */
const MAX_CANDIDATES_PER_DAY = 20;

/*
 * Output tokens reserved per session.
 *
 * An exercise entry is ~35 tokens, so 6 exercises is ~210. The rest is headroom
 * for the model's reasoning tokens, which count against max_tokens — kept small
 * because groqClient requests `reasoning_effort: low`. Too tight a budget
 * truncates the JSON and Groq rejects the whole response.
 */
const OUTPUT_TOKENS_PER_SESSION = 380;
const OUTPUT_TOKENS_BASE = 400;
const MIN_CANDIDATES_PER_DAY = 8;

/** Pulls equipment-matched, injury-filtered candidates for one day's focus. */
const getCandidates = async ({ focus, equipment, injuries }) => {
  const query = {
    // `focus: null` widens the search to every muscle group — used when a day's
    // own muscles are entirely ruled out by injury.
    ...(focus ? { primaryMuscles: { $in: focus } } : {}),
    // Stretching/cardio entries aren't useful as prescribed resistance work.
    category: { $in: ['strength', 'powerlifting', 'olympic weightlifting', 'strongman'] },
  };
  if (equipment?.length) query.equipment = { $in: equipment };

  const raw = await Exercise.find(query)
    .select('slug name primaryMuscles secondaryMuscles equipment mechanic level force')
    .lean();

  const { safe, blocked, cautions } = filterByInjuries(raw, injuries);

  // Prefer compounds first — they belong early in a session — then cap the
  // list so the prompt stays small and the model isn't swamped with choices.
  const ranked = safe.sort((a, b) => {
    if (a.mechanic === b.mechanic) return a.name.localeCompare(b.name);
    return a.mechanic === 'compound' ? -1 : 1;
  });

  return {
    candidates: ranked.slice(0, MAX_CANDIDATES_PER_DAY),
    totalSafe: safe.length,
    blocked,
    cautions,
  };
};

/* ------------------------------------------------------------------ prompts */

const SYSTEM_PROMPT = `You are a strength & conditioning coach building a week of training sessions.

HARD RULES:
1. You may ONLY use exercise slugs from the CANDIDATES list for that specific session. Never invent a slug, never modify one, never move a slug between sessions.
2. Within each session, order exercises so compound movements come before isolation movements.
3. Do not repeat the same slug within a session.
4. Cover each session's target muscles as evenly as its candidate list allows.
5. Output ONLY a JSON object. No prose, no markdown.

OUTPUT SHAPE:
{"sessions":[{"key":"<session key given to you>","exercises":[{"slug":"<exact slug from that session's CANDIDATES>","sets":<integer 2-6>,"reps":"<rep range e.g. 8-12>","restSeconds":<integer 30-240>,"note":"<short coaching cue, max 90 chars>"}]}]}`;

/**
 * One prompt for the whole week.
 *
 * Originally this made a separate Groq call per training day, which exhausted
 * the free-tier rate limit on any 5+ day split and silently degraded to the
 * fallback engine. Batching every unique session into a single request cuts a
 * 6-day plan from 6 calls to 1.
 */
const buildUserPrompt = ({ sessions, guidelines, profile }) => {
  const [minEx, maxEx] = guidelines.exercises;

  /*
   * Compact encoding: `slug|muscles|mechanic`.
   *
   * The exercise NAME is omitted because the slug already reads as the name,
   * and the server looks the real name up from the database anyway. EQUIPMENT is
   * omitted because every candidate has already been filtered to gear the user
   * owns — telling the model is wasted budget. Roughly a 60% saving per line.
   */
  const sessionBlocks = sessions
    .map(({ day, candidates, cautions }) => {
      const lines = candidates
        .map((exercise) => {
          const caution = cautions.get(exercise.slug) ? ' [CAUTION-light]' : '';
          return `${exercise.slug}|${exercise.primaryMuscles.join(',')}|${
            exercise.mechanic ?? '-'
          }${caution}`;
        })
        .join('\n');

      return `SESSION key="${day.key}" (${day.name}) — target: ${day.focus.join(', ')}
${lines}`;
    })
    .join('\n\n');

  return `LIFTER: goal=${profile.goal}, trains ${profile.trainingDaysPerWeek} days/week.
Prescribe ${minEx}-${maxEx} exercises per session, around ${guidelines.sets} sets of ${guidelines.reps} with ~${guidelines.restSeconds}s rest.
${
  profile.injuries?.length
    ? `Injuries: ${profile.injuries.map((i) => `${i.area}(${i.severity})`).join(', ')}. Unsafe exercises are ALREADY removed from every list; keep anything marked [CAUTION-light] lighter and later in the session.`
    : 'No injuries declared.'
}

Build ${sessions.length} session${sessions.length === 1 ? '' : 's'}, one per key.
Candidate format is slug|muscles|mechanic — use the slug exactly as written.

${sessionBlocks}

Return the JSON object now, with one entry in "sessions" per key above.`;
};

/* --------------------------------------------------------------- grounding */

/**
 * Validates AI output against the candidate shortlist.
 * Unknown slugs are dropped, not repaired — a hallucinated exercise must never
 * reach the user, and silently substituting one would hide the failure.
 */
const groundExercises = (aiExercises, candidates) => {
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const kept = [];
  const rejected = [];
  const seen = new Set();

  // Not `?? []`: a non-array (a string, say) would iterate character by
  // character rather than being rejected outright.
  const entries = Array.isArray(aiExercises) ? aiExercises : [];

  for (const entry of entries) {
    const slug = typeof entry?.slug === 'string' ? entry.slug.trim() : '';
    const match = bySlug.get(slug);

    if (!match) {
      rejected.push({ slug: slug || '(missing)', reason: 'not in the verified candidate list' });
      continue;
    }
    if (seen.has(slug)) {
      rejected.push({ slug, reason: 'duplicate within the same day' });
      continue;
    }
    seen.add(slug);

    const sets = Number(entry.sets);
    const rest = Number(entry.restSeconds);

    kept.push({
      slug: match.slug,
      // Name/muscles/equipment come from the DB, never from the model.
      name: match.name,
      primaryMuscles: match.primaryMuscles,
      equipment: match.equipment,
      mechanic: match.mechanic,
      sets: Number.isFinite(sets) ? Math.min(Math.max(Math.round(sets), 2), 6) : 3,
      reps: typeof entry.reps === 'string' && entry.reps.length <= 12 ? entry.reps : '8-12',
      restSeconds: Number.isFinite(rest) ? Math.min(Math.max(Math.round(rest), 30), 240) : 90,
      note:
        typeof entry.note === 'string' ? entry.note.slice(0, 90) : undefined,
      order: kept.length + 1,
    });
  }

  return { kept, rejected };
};

/* ---------------------------------------------------------------- fallback */

/**
 * Deterministic day builder, used when Groq is unavailable or unusable.
 * Round-robins across the day's target muscles so coverage stays balanced,
 * compounds first.
 */
const buildDayDeterministically = (day, candidates, guidelines) => {
  const [, maxEx] = guidelines.exercises;
  const target = Math.min(maxEx, candidates.length);

  const byMuscle = new Map(day.focus.map((m) => [m, []]));
  for (const exercise of candidates) {
    for (const muscle of exercise.primaryMuscles) {
      if (byMuscle.has(muscle)) byMuscle.get(muscle).push(exercise);
    }
  }

  const picked = [];
  const used = new Set();
  let guard = 0;

  // Round-robin one exercise per muscle group until the day is filled.
  while (picked.length < target && guard < 100) {
    guard += 1;
    let addedThisPass = false;

    for (const muscle of day.focus) {
      if (picked.length >= target) break;
      const pool = byMuscle.get(muscle) ?? [];
      const next = pool.find((e) => !used.has(e.slug));
      if (next) {
        used.add(next.slug);
        picked.push(next);
        addedThisPass = true;
      }
    }
    if (!addedThisPass) break;
  }

  const setsCount = Number(String(guidelines.sets).split('-')[0]) || 3;

  return picked.map((exercise, index) => ({
    slug: exercise.slug,
    name: exercise.name,
    primaryMuscles: exercise.primaryMuscles,
    equipment: exercise.equipment,
    mechanic: exercise.mechanic,
    sets: setsCount,
    reps: guidelines.reps,
    restSeconds: guidelines.restSeconds,
    order: index + 1,
  }));
};

/* ----------------------------------------------------------------- public */

/**
 * Generates a full weekly workout plan.
 *
 * @param {object} profile  The user's stored profile.
 * @param {object} [options]
 * @param {boolean}[options.forceFallback]  Skip Groq (used by tests/demos).
 */
export const generateWorkoutPlan = async (profile, { forceFallback = false } = {}) => {
  const startedAt = Date.now();

  const schedule = buildSchedule(profile.preferredSplit, profile.trainingDaysPerWeek);
  const guidelines = guidelinesForGoal(profile.goal);

  const warnings = [];
  if (schedule.note) warnings.push(schedule.note);

  const useAi = isGroqConfigured() && !forceFallback;
  let generatedBy = useAi ? 'groq' : 'fallback';
  let model = null;
  let totalAttempts = 0;
  const allBlocked = [];

  /*
   * STAGE 1 — retrieval, once per UNIQUE session type.
   *
   * A 6-day PPL week contains only three distinct sessions, and candidate
   * retrieval depends solely on a session's target muscles. Resolving unique
   * sessions rather than calendar days avoids duplicating both the database
   * work and (more importantly) the LLM call.
   */
  const sessionByKey = new Map();

  for (const day of schedule.days) {
    if (sessionByKey.has(day.key)) continue;

    let activeDay = day;
    let { candidates, blocked, cautions, totalSafe } = await getCandidates({
      focus: day.focus,
      equipment: profile.availableEquipment,
      injuries: profile.injuries,
    });
    allBlocked.push(...blocked);

    /*
     * A severe injury can rule out every muscle a session targets — a severe
     * knee leaves a Legs day with nothing safe. Rather than presenting an empty
     * day, widen the search to any safe exercise the user's equipment allows and
     * relabel the session honestly, so the week still contains a real workout.
     */
    if (candidates.length === 0) {
      const widened = await getCandidates({
        focus: null,
        equipment: profile.availableEquipment,
        injuries: profile.injuries,
      });

      if (widened.candidates.length > 0) {
        const safeMuscles = [
          ...new Set(widened.candidates.flatMap((e) => e.primaryMuscles)),
        ].slice(0, 6);

        activeDay = {
          ...day,
          key: `${day.key}_adapted`,
          name: `${day.name} (adapted)`,
          focus: safeMuscles,
          description: `Your injuries rule out the usual ${day.name.toLowerCase()} movements, so this session trains what is safe instead.`,
        };
        candidates = widened.candidates;
        cautions = widened.cautions;
        totalSafe = widened.totalSafe;

        warnings.push(
          `${day.name}: every ${day.focus.join('/')} exercise was excluded by your injuries — substituted a safe alternative session.`,
        );
      } else {
        warnings.push(
          `${day.name}: no exercise in the library matches your equipment and injury constraints — scheduled as active recovery.`,
        );
        sessionByKey.set(day.key, {
          day: {
            ...day,
            name: `${day.name} (recovery)`,
            description:
              'No safe resistance exercise is available for this day. Treat it as active recovery — walking, mobility work or physiotherapy.',
          },
          candidates: [],
          cautions: new Map(),
          totalSafe: 0,
          isRecoveryDay: true,
          exercises: [],
        });
        continue;
      }
    }

    sessionByKey.set(day.key, {
      day: activeDay,
      candidates,
      cautions,
      totalSafe,
      isRecoveryDay: false,
      exercises: null,
    });
  }

  const trainableSessions = [...sessionByKey.values()].filter((s) => !s.isRecoveryDay);

  /*
   * STAGE 2 — one Groq call for every unique session.
   */
  if (useAi && trainableSessions.length > 0) {
    try {
      const maxTokens =
        OUTPUT_TOKENS_BASE + OUTPUT_TOKENS_PER_SESSION * trainableSessions.length;

      /*
       * Fit the prompt to the token budget BEFORE sending.
       *
       * Groq counts prompt + max_tokens against a per-minute cap and rejects an
       * oversized request with 413 — which retrying the same payload cannot
       * fix. Every session must survive (dropping one would leave a hole in the
       * week), so shrink each session's candidate list instead.
       */
      let perSession = MAX_CANDIDATES_PER_DAY;
      let promptSessions = trainableSessions;
      let userPrompt = buildUserPrompt({
        sessions: promptSessions,
        guidelines,
        profile,
      });

      while (
        estimateTokens(userPrompt) + maxTokens > TOKEN_BUDGET &&
        perSession > MIN_CANDIDATES_PER_DAY
      ) {
        perSession = Math.max(MIN_CANDIDATES_PER_DAY, Math.floor(perSession * 0.75));
        promptSessions = trainableSessions.map((session) => ({
          ...session,
          candidates: session.candidates.slice(0, perSession),
        }));
        userPrompt = buildUserPrompt({ sessions: promptSessions, guidelines, profile });
      }

      if (perSession < MAX_CANDIDATES_PER_DAY) {
        warnings.push(
          `Candidate lists trimmed to ${perSession} per session to fit the AI token budget.`,
        );
      }

      const { data, meta } = await generateJson({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        temperature: 0.4,
        maxTokens,
        validate: (parsed) => {
          if (!Array.isArray(parsed?.sessions)) return 'Missing a "sessions" array.';

          const returnedKeys = new Set(parsed.sessions.map((s) => s?.key));
          const missing = trainableSessions
            .map((s) => s.day.key)
            .filter((key) => !returnedKeys.has(key));
          if (missing.length) {
            return `Missing sessions for these keys: ${missing.join(', ')}. Return one entry per key.`;
          }

          // Reject wholesale invention, but tolerate a few slips — grounding
          // drops individual bad slugs without discarding the whole response.
          for (const session of parsed.sessions) {
            const source = trainableSessions.find((s) => s.day.key === session.key);
            if (!source) continue;
            const valid = new Set(source.candidates.map((c) => c.slug));
            const items = session.exercises ?? [];
            if (items.length === 0) return `Session "${session.key}" had no exercises.`;
            const bad = items.map((e) => e?.slug).filter((slug) => !valid.has(slug));
            if (bad.length > items.length / 2) {
              return `Session "${session.key}" used slugs not in its CANDIDATES: ${bad.slice(0, 5).join(', ')}.`;
            }
          }
          return true;
        },
      });

      model = meta.model;
      totalAttempts = meta.attempts;

      /*
       * STAGE 3 — grounding, per session.
       *
       * `validate` should already have rejected a malformed shape, but this
       * must not depend on that: a generator that throws would 500 instead of
       * falling back, defeating the whole never-hard-fail design.
       */
      const returnedSessions = Array.isArray(data?.sessions) ? data.sessions : [];

      for (const session of trainableSessions) {
        const returned = returnedSessions.find((s) => s?.key === session.day.key);
        const { kept, rejected } = groundExercises(returned?.exercises, session.candidates);

        if (rejected.length) {
          warnings.push(
            `${session.day.name}: dropped ${rejected.length} AI suggestion(s) that failed DB grounding.`,
          );
        }
        // Too little survived grounding to call it a real session.
        session.exercises = kept.length >= 2 ? kept : null;
        if (!session.exercises) {
          warnings.push(
            `${session.day.name}: AI output failed grounding, used the deterministic build.`,
          );
        }
      }
    } catch (err) {
      if (!(err instanceof GroqUnavailableError)) throw err;
      warnings.push(
        `AI unavailable (${err.message.slice(0, 120)}) — the whole week used the deterministic engine.`,
      );
    }
  }

  /* STAGE 4 — deterministic fallback for anything still unfilled. */
  for (const session of trainableSessions) {
    if (session.exercises) continue;
    session.exercises = buildDayDeterministically(
      session.day,
      session.candidates,
      guidelines,
    );
    if (useAi) generatedBy = 'hybrid';
  }

  // Cautions come from the deterministic injury rules, never the model.
  for (const session of sessionByKey.values()) {
    for (const exercise of session.exercises ?? []) {
      const caution = session.cautions.get(exercise.slug);
      if (caution) exercise.caution = caution[0];
    }
  }

  // Expand unique sessions back onto the calendar. Repeated day types share a
  // session — the standard way a PPL week runs, with progression across weeks.
  const days = schedule.days.map((day, index) => {
    const session = sessionByKey.get(day.key);
    return {
      dayIndex: index + 1,
      key: session.day.key,
      name: session.day.name,
      focus: session.day.focus,
      description: session.day.description,
      candidatePoolSize: session.totalSafe,
      isRecoveryDay: session.isRecoveryDay,
      // Clone so two calendar days sharing a session don't alias one array.
      exercises: (session.exercises ?? []).map((e) => ({ ...e })),
    };
  });

  if (!isGroqConfigured()) {
    warnings.push('GROQ_API_KEY not configured — plan built with the deterministic engine.');
  }

  return {
    splitType: profile.preferredSplit,
    daysPerWeek: schedule.days.length,
    goal: profile.goal,
    days,
    safetyNotes: summariseInjuryFiltering(profile.injuries ?? [], allBlocked),
    excludedForInjury: allBlocked.slice(0, 50),
    guidelines,
    generation: {
      generatedBy,
      model,
      attempts: totalAttempts,
      uniqueSessions: sessionByKey.size,
      aiCalls: useAi && trainableSessions.length > 0 ? 1 : 0,
      durationMs: Date.now() - startedAt,
      warnings,
    },
  };
};
