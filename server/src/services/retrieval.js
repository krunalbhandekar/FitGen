/**
 * Retrieval pipeline for the RAG chatbot.
 *
 * APPROACH — and an honest note on it. The project report suggests "embeddings
 * + cosine similarity". Groq is inference-only and exposes no embeddings
 * endpoint (verified against the live API), and a local neural embedding model
 * would add ~100 MB and a slow cold start on a free-tier host. So this uses
 * **TF-IDF term vectors with cosine similarity** — sparse lexical vectors
 * rather than dense neural ones.
 *
 * The trade-off is real: lexical retrieval matches words, not meaning, so a
 * paraphrase using entirely different vocabulary can miss. Three things
 * compensate, and together they work well on a curated corpus of this size:
 *
 *   1. Each entry carries several alternate QUESTION phrasings, weighted more
 *      heavily than its prose — users tend to phrase things like a question.
 *   2. A domain synonym map expands gym jargon before matching, so "DOMS",
 *      "sore" and "soreness" all reach the same entry.
 *   3. Light suffix stemming collapses inflections ("lifting" → "lift").
 *
 * Everything here is deterministic: the same question always retrieves the same
 * passages, which matters because it makes the chatbot's behaviour testable.
 */

/* ------------------------------------------------------------- tokenisation */

/** Words carrying no retrieval signal. */
const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by', 'can',
  'did', 'do', 'does', 'doing', 'done', 'for', 'from', 'get', 'got', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'just', 'me', 'more', 'most', 'my', 'no', 'not', 'of', 'on',
  'one', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'to', 'too', 'up', 'use', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with',
  'would', 'you', 'your',
]);

/**
 * Domain synonyms. Each key expands to itself plus its aliases, so a query and
 * a document that use different words for the same thing still meet.
 */
const SYNONYMS = {
  doms: ['soreness', 'sore'],
  sore: ['soreness', 'doms'],
  soreness: ['sore', 'doms'],
  ache: ['sore', 'soreness'],
  eccentric: ['lower', 'lowering', 'tempo'],
  lower: ['lowering', 'eccentric', 'tempo'],
  lowering: ['lower', 'eccentric', 'tempo'],
  gains: ['muscle', 'growth', 'hypertrophy'],
  growth: ['muscle', 'hypertrophy', 'gains'],
  hypertrophy: ['muscle', 'growth', 'gains'],
  bulk: ['surplus', 'gain', 'bulking'],
  bulking: ['surplus', 'gain', 'bulk'],
  cut: ['deficit', 'fat', 'loss'],
  cutting: ['deficit', 'fat', 'loss'],
  shred: ['deficit', 'fat', 'loss'],
  lean: ['deficit', 'fat', 'loss'],
  ohp: ['overhead', 'press', 'shoulder'],
  bench: ['bench', 'press', 'chest'],
  squat: ['squat', 'legs', 'quad'],
  deadlift: ['deadlift', 'hinge', 'back'],
  abs: ['abdominal', 'core', 'stomach'],
  tummy: ['belly', 'abdominal', 'stomach'],
  belly: ['abdominal', 'stomach', 'fat'],
  cardio: ['conditioning', 'aerobic', 'running'],
  preworkout: ['caffeine', 'stimulant', 'pre'],
  supp: ['supplement'],
  supps: ['supplement', 'supplements'],
  protein: ['protein', 'whey'],
  whey: ['protein', 'whey'],
  shake: ['protein', 'whey', 'powder'],
  reps: ['rep', 'repetition'],
  rep: ['reps', 'repetition'],
  sets: ['set', 'volume'],
  rir: ['failure', 'effort', 'intensity'],
  rpe: ['failure', 'effort', 'intensity'],
  stuck: ['plateau', 'stall'],
  plateau: ['stall', 'stuck'],
  stall: ['plateau', 'stuck'],
  rest: ['recovery', 'rest'],
  recovery: ['rest', 'recover'],
  sleep: ['sleep', 'recovery'],
  injury: ['injured', 'pain', 'hurt'],
  injured: ['injury', 'pain', 'hurt'],
  hurt: ['pain', 'injury'],
  pain: ['hurt', 'injury'],
  newbie: ['beginner', 'novice', 'start'],
  beginner: ['novice', 'start', 'newbie'],
  toned: ['tone', 'toning', 'definition'],
  tone: ['toned', 'toning', 'definition'],
  water: ['hydration', 'fluid'],
  booze: ['alcohol', 'drinking'],
  drinking: ['alcohol'],
  form: ['technique'],
  technique: ['form'],
};

/**
 * Very light suffix stemming. A full Porter stemmer is overkill for a corpus
 * this size, and over-stemming would merge unrelated fitness terms.
 */
const stem = (word) => {
  if (word.length <= 4) return word;
  for (const suffix of ['ing', 'edly', 'ies', 'ed', 'es', 's', 'ly']) {
    // Require a 4-character stem: at 3 this turned "shred" into "shr", which
    // matched nothing. "lifted"/"lifting" still both reduce to "lift".
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      const base = word.slice(0, -suffix.length);
      // "ies" -> "y" reads better than a bare stem ("bodies" -> "body").
      return suffix === 'ies' ? `${base}y` : base;
    }
  }
  return word;
};

export const tokenize = (text) =>
  String(text ?? '')
    .toLowerCase()
    // Keep letters and digits only; hyphens become separators.
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);

/** Tokenises and then adds synonym expansions of the raw words. */
export const expandTokens = (text) => {
  const raw = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const tokens = tokenize(text);
  const expansions = [];

  for (const word of raw) {
    const aliases = SYNONYMS[word];
    if (aliases) expansions.push(...aliases.map(stem));
  }

  return [...tokens, ...expansions];
};

/* ------------------------------------------------------------------- index */

/** Distinct query terms a document must match to count as relevant. */
const MIN_TERM_OVERLAP = 2;
/** A one-term match must clear this much higher score to survive. */
const SINGLE_TERM_MIN_SCORE = 0.3;

/** How much more a term in a QUESTION counts than one in the answer prose. */
const QUESTION_WEIGHT = 3;
const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;

const termFrequency = (tokens) => {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

/**
 * Builds a TF-IDF index over the knowledge base.
 *
 * Returns vectors normalised to unit length, so cosine similarity reduces to a
 * dot product at query time.
 */
export const buildIndex = (entries) => {
  const documents = entries.map((entry) => {
    // Weighted field concatenation: repeat high-signal fields so their terms
    // carry more weight in the term-frequency count.
    const parts = [
      ...Array(TITLE_WEIGHT).fill(entry.title ?? ''),
      ...Array(QUESTION_WEIGHT).fill((entry.questions ?? []).join(' ')),
      ...Array(TAG_WEIGHT).fill((entry.tags ?? []).join(' ')),
      entry.answer ?? '',
      entry.category ?? '',
    ];
    return { entry, tokens: expandTokens(parts.join(' ')) };
  });

  // Document frequency per term.
  const documentFrequency = new Map();
  for (const doc of documents) {
    for (const term of new Set(doc.tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const total = documents.length;
  const idf = new Map();
  for (const [term, df] of documentFrequency) {
    // Smoothed IDF; +1 keeps a term present in every document from going to 0.
    idf.set(term, Math.log((total + 1) / (df + 1)) + 1);
  }

  const vectors = documents.map(({ entry, tokens }) => {
    const tf = termFrequency(tokens);
    const vector = new Map();
    let norm = 0;

    for (const [term, count] of tf) {
      // Sublinear TF: a term appearing 10 times is not 10x as informative.
      const weight = (1 + Math.log(count)) * (idf.get(term) ?? 1);
      vector.set(term, weight);
      norm += weight * weight;
    }

    norm = Math.sqrt(norm) || 1;
    for (const [term, weight] of vector) {
      vector.set(term, weight / norm);
    }

    return { entry, vector };
  });

  return { vectors, idf, size: total };
};

/* ------------------------------------------------------------------ search */

/**
 * Cosine similarity between a query and every indexed document.
 *
 * @param {string} query
 * @param {object} index      Output of buildIndex().
 * @param {object} [options]
 * @param {number} [options.limit]        Max passages to return.
 * @param {number} [options.minScore]     Similarity floor; below it, a passage
 *                                        is treated as irrelevant rather than
 *                                        "the best of a bad set".
 * @returns {Array<{entry, score}>}
 */
export const search = (query, index, { limit = 4, minScore = 0.08 } = {}) => {
  const tokens = expandTokens(query);
  if (tokens.length === 0) return [];

  const queryTerms = new Set(tokens);

  // Build the query vector with the same weighting scheme, then normalise.
  const tf = termFrequency(tokens);
  const queryVector = new Map();
  let norm = 0;

  for (const [term, count] of tf) {
    const weight = (1 + Math.log(count)) * (index.idf.get(term) ?? 1);
    queryVector.set(term, weight);
    norm += weight * weight;
  }
  norm = Math.sqrt(norm) || 1;

  const scored = index.vectors.map(({ entry, vector }) => {
    let dot = 0;
    let overlap = 0;

    // Iterate the shorter map — the query is almost always much shorter.
    for (const [term, weight] of queryVector) {
      const docWeight = vector.get(term);
      if (docWeight) {
        dot += (weight / norm) * docWeight;
        overlap += 1;
      }
    }
    return { entry, score: Number(dot.toFixed(4)), overlap };
  });

  /*
   * Coverage requirement, not just a score floor.
   *
   * A single rare word in common is a coincidence, not relevance: "Who won the
   * 1998 World Cup?" scored 0.10 against the free-weights entry purely because
   * that entry happens to contain "real-world". Genuine matches overlap on two
   * or more distinct terms and score far higher (measured: >=0.37 with >=2
   * overlap, versus 0.10 with 1).
   *
   * The single-term escape hatch keeps short but specific queries working —
   * "creatine?" has only one term to match, so demanding two would be absurd;
   * instead it must clear a much higher score.
   */
  return scored
    .filter(
      (r) =>
        r.score >= minScore &&
        (r.overlap >= MIN_TERM_OVERLAP ||
          r.score >= SINGLE_TERM_MIN_SCORE ||
          queryTerms.size < MIN_TERM_OVERLAP),
    )
    .map(({ entry, score }) => ({ entry, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

/**
 * Cached index. The knowledge base is small and static, so building it once per
 * process is far cheaper than recomputing per request or storing vectors.
 */
let cached = null;

export const getIndex = (entries) => {
  if (!cached || cached.size !== entries.length) {
    cached = buildIndex(entries);
  }
  return cached;
};

export const resetIndex = () => {
  cached = null;
};
