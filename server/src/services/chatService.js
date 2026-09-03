import { knowledgeBase } from '../data/knowledgeBase.js';
import {
  estimateTokens,
  generateJson,
  GroqUnavailableError,
  isGroqConfigured,
  TOKEN_BUDGET,
} from './groqClient.js';
import { getIndex, search } from './retrieval.js';

/**
 * RAG chatbot.
 *
 * Three gates sit between a question and an answer, in this order:
 *
 *   1. SAFETY TRIAGE — medical, emergency and disordered-eating questions are
 *      refused and redirected BEFORE anything else runs. No retrieval, no LLM
 *      call. A fitness FAQ must not be the thing that answers "is this chest
 *      pain serious".
 *
 *   2. RETRIEVAL — cosine similarity over the curated knowledge base. If
 *      nothing clears the relevance floor, the assistant says it does not know
 *      and the LLM is never called. That is the single most important property
 *      here: the chatbot cannot answer outside its knowledge base, because
 *      with no passages there is no request.
 *
 *   3. GROUNDED GENERATION — Groq is given ONLY the retrieved passages and
 *      instructed to answer from them and cite them. The response is then
 *      checked: cited ids must be ones actually supplied, and an answer citing
 *      nothing is treated as ungrounded.
 */

/* ------------------------------------------------------------ safety triage */

/**
 * Patterns that must never reach a fitness FAQ.
 *
 * Deliberately matched on intent phrases rather than bare keywords: "chest" or
 * "pain" alone are perfectly ordinary gym vocabulary ("chest day", "is this
 * soreness normal"), and blocking those would make the assistant useless.
 */
const SAFETY_RULES = [
  {
    id: 'emergency',
    test: /\b(chest pain|heart attack|can'?t breathe|cannot breathe|shortness of breath|fainted|passed out|collapsed|numb(ness)? (in|down) my (arm|leg)|blood in|coughing blood)\b/i,
    response:
      'That sounds like something to get looked at urgently rather than researched. Chest pain, breathing difficulty, fainting or sudden numbness need immediate medical attention — please contact emergency services or get to a doctor now. I am a fitness FAQ and cannot help with this.',
  },
  {
    id: 'diagnosis',
    test: /\b(do i have|is it|diagnos\w*|torn|tear|fracture|broken|hernia|slipped disc|tendonitis|impingement|sciatica)\b.*\b(injur\w*|acl|meniscus|rotator cuff|disc|ligament|tendon|muscle tear)\b|\b(acl|meniscus|rotator cuff|slipped disc|hernia)\b/i,
    response:
      'I cannot diagnose an injury — that needs someone who can physically assess you. A physiotherapist or doctor is the right call, especially for anything involving a joint, sharp or one-sided pain, swelling, or symptoms that persist at rest.\n\nWhat I can help with once you know what you are dealing with: you can record the affected area in your FitGen profile under Injuries, and your generated plans will route around exercises that load it.',
  },
  {
    id: 'medication',
    test: /\b(steroid|anabolic|sarms?|trt|testosterone|clenbuterol|dnp|peptide|hgh|insulin|thyroid|ozempic|semaglutide|prescription|medication|antidepressant|blood pressure (pill|tablet|medication))\b/i,
    response:
      'I will not advise on medications, hormones or performance-enhancing drugs — dosing and interactions are genuinely dangerous territory and belong with a doctor or pharmacist who knows your history.\n\nMy knowledge base covers training, recovery and ordinary nutrition supplements like creatine and caffeine, if any of that is useful instead.',
  },
  {
    id: 'disordered-eating',
    test: /\b(purge|purging|laxatives?|starve myself|starving myself|not eating|stop eating|anorexi\w*|bulimi\w*|binge and|make myself sick|500 calories a day|extremely low calorie)\b/i,
    response:
      'I am not the right source for this, and I would rather say so plainly than give you a number. Very low intakes and compensatory behaviours carry real health risks, and the useful next step is a conversation with a doctor or a registered dietitian.\n\nIf you are struggling with food or body image, please consider talking to someone — a GP is a good starting point and can refer you on.',
  },
  {
    id: 'pregnancy',
    test: /\b(pregnan\w*|expecting|postpartum|post-partum|breastfeed\w*|trimester)\b/i,
    response:
      'Training and nutrition during pregnancy or postpartum need individual medical guidance — recommendations change by trimester and by circumstance, and general advice can be actively unhelpful. Please speak to your doctor or midwife, ideally alongside a physiotherapist experienced in this area.',
  },
  {
    id: 'minor',
    test: /\b(i am|i'?m) (9|10|11|12|13|14) (years old|)\b|\b(my son|my daughter|my child) (is|)\s?(9|10|11|12|13|14)\b/i,
    response:
      'Training guidance for children and young teenagers differs from adult advice, and my knowledge base is written for adults. A coach experienced with youth athletes, or a paediatrician, is the right source here.',
  },
];

/** Runs safety triage. Returns a refusal, or null to continue. */
export const triageSafety = (question) => {
  for (const rule of SAFETY_RULES) {
    if (rule.test.test(question)) {
      return { refused: true, reason: rule.id, answer: rule.response };
    }
  }
  return null;
};

/* ------------------------------------------------------------------ prompts */

const SYSTEM_PROMPT = `You are FitGen's gym assistant. You answer questions about training, recovery, technique and sports nutrition.

ABSOLUTE RULES:
1. Answer ONLY using the SOURCES provided in the user message. They are your entire permitted knowledge.
2. If the SOURCES do not contain the answer, set "grounded" to false and say plainly that your knowledge base does not cover it. Do NOT answer from your own knowledge.
3. Cite the id of every source you used in "citations". Never cite an id that was not provided.
4. Never diagnose an injury, never advise on medication or performance-enhancing drugs, and recommend a professional where the question needs one.
5. Do not invent numbers, doses or protocols. If a figure is not in the SOURCES, do not state one.

STYLE:
- Talk like a knowledgeable coach: direct, practical, no hype and no filler.
- 2-4 short paragraphs maximum. Use the user's context if it makes the answer more specific.
- Do not mention "sources", "passages" or "knowledge base" in the answer text itself; just answer well.
- Plain text only. No markdown headings.

OUTPUT SHAPE:
{"answer":"<your reply>","citations":["<source id>"],"grounded":true|false,"suggestFollowUp":["<short follow-up question>"]}`;

/** Compact user context so answers can be specific without leaking noise. */
const buildContext = (profile = {}) => {
  const bits = [];
  if (profile.goal) bits.push(`goal: ${profile.goal.replace(/_/g, ' ')}`);
  if (profile.trainingDaysPerWeek) bits.push(`trains ${profile.trainingDaysPerWeek} days/week`);
  if (profile.preferredSplit) bits.push(`split: ${profile.preferredSplit.replace(/_/g, ' ')}`);
  if (profile.dietType) bits.push(`diet: ${profile.dietType}`);
  if (profile.injuries?.length) {
    bits.push(`injuries: ${profile.injuries.map((i) => `${i.area} (${i.severity})`).join(', ')}`);
  }
  return bits.length ? bits.join(' · ') : 'no profile details available';
};

const buildUserPrompt = ({ question, passages, profile, history }) => {
  const sources = passages
    .map(
      ({ entry }, i) =>
        `[${i + 1}] id="${entry.id}" (${entry.category}) — ${entry.title}\n${entry.answer}`,
    )
    .join('\n\n');

  const conversation = history.length
    ? `\nRECENT CONVERSATION (for context on follow-up questions):\n${history
        .map((h) => `User: ${h.question}\nYou: ${h.answer.slice(0, 300)}`)
        .join('\n')}\n`
    : '';

  return `USER CONTEXT: ${buildContext(profile)}
${conversation}
SOURCES — your entire permitted knowledge for this answer:

${sources}

USER QUESTION: ${question}

Answer from the SOURCES above. Return the JSON object now.`;
};

/* ---------------------------------------------------------------- responses */

const NO_KNOWLEDGE_ANSWER = (question) =>
  `I do not have anything on that in my knowledge base, so I would rather say so than guess.\n\nI cover training programming and progressive overload, exercise technique for the main lifts, recovery and sleep, and evidence-based supplements and nutrition. If "${question.slice(0, 80)}" fits one of those, try rephrasing it — otherwise it is outside what I have been given.`;

/** Starter prompts shown in an empty chat, drawn from the real corpus. */
export const getSuggestions = (count = 6) => {
  const picks = [
    'How much protein do I need to build muscle?',
    'Should I take creatine, and how much?',
    'What is progressive overload?',
    'Why am I stuck at the same weight?',
    'How deep should I squat?',
    'How many rest days do I need?',
    'Will cardio kill my gains?',
    'Should I train to failure?',
  ];
  return picks.slice(0, count);
};

export const getKnowledgeStats = () => {
  const byCategory = knowledgeBase.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] ?? 0) + 1;
    return acc;
  }, {});
  return { entries: knowledgeBase.length, byCategory };
};

/* ------------------------------------------------------------------- answer */

/**
 * Answers one question.
 *
 * @param {object}  options
 * @param {string}  options.question
 * @param {object}  [options.profile]  User profile, for tailoring.
 * @param {Array}   [options.history]  Prior {question, answer} turns, oldest first.
 */
export const answerQuestion = async ({ question, profile = {}, history = [] }) => {
  const startedAt = Date.now();
  const trimmed = String(question ?? '').trim();

  if (trimmed.length < 3) {
    return {
      answer: 'Ask me something about training, recovery, technique or nutrition.',
      citations: [],
      grounded: false,
      refused: false,
      retrieval: [],
      generation: { generatedBy: 'rule', durationMs: Date.now() - startedAt },
    };
  }

  /* --- gate 1: safety ---------------------------------------------------- */
  const refusal = triageSafety(trimmed);
  if (refusal) {
    return {
      answer: refusal.answer,
      citations: [],
      grounded: true, // a deliberate, correct refusal, not a failure
      refused: true,
      refusalReason: refusal.reason,
      retrieval: [],
      suggestFollowUp: [],
      generation: { generatedBy: 'safety-rule', durationMs: Date.now() - startedAt },
    };
  }

  /* --- gate 2: retrieval ------------------------------------------------- */
  const index = getIndex(knowledgeBase);
  const passages = search(trimmed, index, { limit: 4 });

  if (passages.length === 0) {
    // No relevant passage means no LLM call at all — this is what makes
    // "cannot answer outside the knowledge base" structural.
    return {
      answer: NO_KNOWLEDGE_ANSWER(trimmed),
      citations: [],
      grounded: false,
      refused: false,
      outOfScope: true,
      retrieval: [],
      suggestFollowUp: getSuggestions(3),
      generation: { generatedBy: 'rule', durationMs: Date.now() - startedAt },
    };
  }

  const retrievalMeta = passages.map(({ entry, score }) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    score,
  }));

  /* --- no LLM configured: serve the best passage verbatim ---------------- */
  if (!isGroqConfigured()) {
    const best = passages[0].entry;
    return {
      answer: `${best.answer}\n\n(AI phrasing is unavailable, so this is the knowledge-base entry as written.)`,
      citations: [best.id],
      grounded: true,
      refused: false,
      retrieval: retrievalMeta,
      suggestFollowUp: [],
      generation: {
        generatedBy: 'fallback',
        durationMs: Date.now() - startedAt,
        warnings: ['GROQ_API_KEY not configured — returned the retrieved passage directly.'],
      },
    };
  }

  /* --- gate 3: grounded generation --------------------------------------- */
  const validIds = new Set(passages.map((p) => p.entry.id));
  const warnings = [];
  const maxTokens = 900;

  // Keep the newest turns and drop older ones if the prompt runs long.
  let recentHistory = history.slice(-2);
  let userPrompt = buildUserPrompt({ question: trimmed, passages, profile, history: recentHistory });

  while (estimateTokens(userPrompt) + maxTokens > TOKEN_BUDGET && recentHistory.length > 0) {
    recentHistory = recentHistory.slice(1);
    userPrompt = buildUserPrompt({ question: trimmed, passages, profile, history: recentHistory });
  }

  try {
    const { data, meta } = await generateJson({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.3,
      maxTokens,
      validate: (parsed) => {
        if (typeof parsed?.answer !== 'string' || parsed.answer.trim().length < 20) {
          return 'The "answer" field must be a non-trivial string.';
        }
        if (!Array.isArray(parsed.citations)) return 'Missing a "citations" array.';
        const invented = parsed.citations.filter((id) => !validIds.has(id));
        if (invented.length) {
          return `These citation ids were not in SOURCES: ${invented.join(', ')}. Cite only the ids provided.`;
        }
        return true;
      },
    });

    // Drop any citation not actually supplied, even if validate let it through.
    const citations = (data.citations ?? []).filter((id) => validIds.has(id));

    const claimsGrounded = data.grounded !== false;
    if (claimsGrounded && citations.length === 0) {
      warnings.push('The model answered without citing a source; treated as ungrounded.');
    }

    return {
      answer: data.answer.trim(),
      citations,
      // Grounded only if the model both claims it and cites something real.
      grounded: claimsGrounded && citations.length > 0,
      refused: false,
      retrieval: retrievalMeta,
      suggestFollowUp: Array.isArray(data.suggestFollowUp)
        ? data.suggestFollowUp.filter((s) => typeof s === 'string').slice(0, 3)
        : [],
      generation: {
        generatedBy: 'groq',
        model: meta.model,
        attempts: meta.attempts,
        durationMs: Date.now() - startedAt,
        warnings,
      },
    };
  } catch (err) {
    if (!(err instanceof GroqUnavailableError)) throw err;

    // The LLM only phrases the answer; the knowledge is already retrieved, so
    // a failure degrades to the passage itself rather than to nothing.
    const best = passages[0].entry;
    return {
      answer: `${best.answer}\n\n(I could not reach the AI service to phrase this, so here is the knowledge-base entry as written.)`,
      citations: [best.id],
      grounded: true,
      refused: false,
      retrieval: retrievalMeta,
      suggestFollowUp: [],
      generation: {
        generatedBy: 'fallback',
        durationMs: Date.now() - startedAt,
        warnings: [`AI unavailable: ${err.message.slice(0, 120)}`],
      },
    };
  }
};
