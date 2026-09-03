/**
 * Retrieval-quality tests for the RAG pipeline.
 *
 * These matter more than they might appear: if retrieval returns the wrong
 * passage, the chatbot answers the wrong question confidently, and grounding
 * offers no protection because the passage IS from the knowledge base. So each
 * case asserts the EXPECTED entry id ranks first for a realistic phrasing —
 * including slang and abbreviations a user would actually type.
 *
 *   npm run test:retrieval
 */
import assert from 'node:assert/strict';
import { knowledgeBase } from '../src/data/knowledgeBase.js';
import { buildIndex, expandTokens, search, tokenize } from '../src/services/retrieval.js';

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
};

const index = buildIndex(knowledgeBase);

/** Asserts the expected entry is the top hit. */
const expectTop = (query, expectedId) => {
  const hits = search(query, index);
  assert.ok(hits.length > 0, `no results for "${query}"`);
  assert.equal(
    hits[0].entry.id,
    expectedId,
    `"${query}" → got "${hits[0].entry.id}" (${hits[0].score}), expected "${expectedId}". Top 3: ${hits
      .slice(0, 3)
      .map((h) => `${h.entry.id}:${h.score}`)
      .join(', ')}`,
  );
};

/** Asserts the expected entry appears somewhere in the results. */
const expectIncludes = (query, expectedId) => {
  const hits = search(query, index);
  assert.ok(
    hits.some((h) => h.entry.id === expectedId),
    `"${query}" did not retrieve "${expectedId}". Got: ${hits
      .map((h) => `${h.entry.id}:${h.score}`)
      .join(', ')}`,
  );
};

/* ------------------------------------------------------------- tokenisation */

check('tokenize: strips stopwords', () => {
  const tokens = tokenize('How much protein should I have in a day');
  assert.ok(!tokens.includes('how'));
  assert.ok(!tokens.includes('should'));
  assert.ok(tokens.includes('protein'));
});

check('tokenize: stems inflections to a common form', () => {
  assert.deepEqual(tokenize('lifting'), tokenize('lifted'));
});

check('tokenize: keeps short domain terms intact', () => {
  const tokens = tokenize('RIR and RPE');
  assert.ok(tokens.includes('rir'));
  assert.ok(tokens.includes('rpe'));
});

check('expandTokens: DOMS reaches soreness vocabulary', () => {
  const tokens = expandTokens('what is DOMS');
  assert.ok(
    tokens.some((t) => t.startsWith('sore')),
    JSON.stringify(tokens),
  );
});

check('expandTokens: slang expands to canonical terms', () => {
  assert.ok(expandTokens('how do I shred').some((t) => t === 'deficit'));
  assert.ok(expandTokens('supps worth taking').some((t) => t.startsWith('supplement')));
});

/* ------------------------------------------------------------------- index */

check('index: covers every knowledge-base entry', () =>
  assert.equal(index.vectors.length, knowledgeBase.length));

check('index: every entry has a non-empty vector', () =>
  assert.ok(index.vectors.every((v) => v.vector.size > 0)));

check('index: vectors are unit-normalised', () => {
  for (const { entry, vector } of index.vectors) {
    let norm = 0;
    for (const w of vector.values()) norm += w * w;
    assert.ok(
      Math.abs(Math.sqrt(norm) - 1) < 0.001,
      `${entry.id} norm was ${Math.sqrt(norm)}`,
    );
  }
});

check('index: knowledge-base ids are unique', () => {
  const ids = knowledgeBase.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

check('index: every entry has questions, tags and an answer', () => {
  for (const entry of knowledgeBase) {
    assert.ok(entry.questions?.length > 0, `${entry.id} has no questions`);
    assert.ok(entry.tags?.length > 0, `${entry.id} has no tags`);
    assert.ok(entry.answer?.length > 150, `${entry.id} answer is too thin`);
    assert.ok(entry.category, `${entry.id} has no category`);
  }
});

/* ------------------------------------------------- retrieval: supplements */

check('retrieval: creatine dosage', () => expectTop('how much creatine should i take', 'creatine-basics'));
check('retrieval: creatine safety', () => expectTop('is creatine bad for kidneys', 'creatine-basics'));
check('retrieval: protein amount', () => expectTop('how much protein per day to build muscle', 'protein-requirements'));
check('retrieval: anabolic window', () => expectTop('do i need a shake right after my workout', 'protein-timing'));
check('retrieval: BCAAs', () => expectTop('are bcaas worth the money', 'bcaa-eaa'));
check('retrieval: caffeine dose', () => expectTop('how much caffeine before training', 'caffeine-preworkout'));
check('retrieval: pre-workout slang', () => expectIncludes('is preworkout necessary', 'caffeine-preworkout'));
check('retrieval: whey choice', () => expectTop('which protein powder is best isolate or concentrate', 'whey-vs-food'));
check('retrieval: beta-alanine', () => expectTop('does beta alanine do anything', 'other-supplements'));

/* ---------------------------------------------------- retrieval: recovery */

check('retrieval: sleep', () => expectTop('how much sleep for muscle growth', 'sleep-recovery'));
check('retrieval: DOMS abbreviation', () => expectTop('what is doms', 'doms-soreness'));
check('retrieval: soreness phrasing', () => expectTop('why are my legs so sore after leg day', 'doms-soreness'));
check('retrieval: training while sore', () => expectIncludes('should i train if im still sore', 'doms-soreness'));
check('retrieval: rest days', () => expectTop('how many rest days per week do i need', 'rest-days'));
check('retrieval: deload', () => expectTop('what is a deload week', 'deload'));
check('retrieval: stretching', () => expectTop('should i stretch before lifting weights', 'stretching-warmup'));

/* -------------------------------------------------------- retrieval: form */

check('retrieval: squat depth', () => expectTop('how deep should i squat', 'squat-form'));
check('retrieval: knees over toes', () => expectIncludes('are knees over toes bad', 'squat-form'));
check('retrieval: deadlift back pain', () => expectTop('my lower back hurts after deadlifts', 'deadlift-form'));
check('retrieval: bench shoulder pain', () => expectTop('why do my shoulders hurt when i bench press', 'bench-form'));
check('retrieval: bench arch', () => expectIncludes('should i arch my back benching', 'bench-form'));
check('retrieval: rows', () => expectTop('i only feel my biceps when i row', 'row-pulldown-form'));
check('retrieval: overhead press', () => expectTop('how do i overhead press without leaning back', 'overhead-press-form'));
check('retrieval: tempo', () => expectTop('how fast should i lower the weight', 'range-of-motion-tempo'));

/* ---------------------------------------------------- retrieval: training */

check('retrieval: progressive overload', () => expectTop('what is progressive overload', 'progressive-overload'));
check('retrieval: when to add weight', () => expectIncludes('when should i add more weight to the bar', 'progressive-overload'));
check('retrieval: plateau', () => expectTop('i am stuck at the same weight for weeks', 'plateau-breaking'));
check('retrieval: volume', () => expectTop('how many sets per muscle per week', 'training-volume'));
check('retrieval: failure training', () => expectTop('should i train to failure every set', 'training-to-failure'));
check('retrieval: RIR', () => expectIncludes('what does rir mean', 'training-to-failure'));
check('retrieval: rest between sets', () => expectTop('how long to rest between sets', 'rest-between-sets'));
check('retrieval: cardio interference', () => expectTop('will cardio kill my gains', 'cardio-interference'));
check('retrieval: beginner', () => expectTop('i am a complete beginner where do i start', 'beginner-start'));
check('retrieval: machines', () => expectTop('are machines as good as free weights', 'machines-vs-free-weights'));
check('retrieval: home training', () => expectTop('can i build muscle at home without a gym', 'home-bodyweight'));

/* --------------------------------------------------- retrieval: nutrition */

check('retrieval: fat loss rate', () => expectTop('how fast should i lose weight', 'fat-loss-rate'));
check('retrieval: cutting slang', () => expectIncludes('how big should my deficit be when cutting', 'fat-loss-rate'));
check('retrieval: lean bulk', () => expectTop('how do i lean bulk without getting fat', 'lean-bulk'));
check('retrieval: recomp', () => expectTop('can i lose fat and build muscle at the same time', 'recomp'));
check('retrieval: diet break', () => expectTop('should i take a diet break', 'diet-breaks'));
check('retrieval: belly fat', () => expectTop('how do i lose belly fat', 'spot-reduction'));
check('retrieval: toning', () => expectTop('how do i tone up without getting bulky', 'toning-vs-bulking'));
check('retrieval: hydration', () => expectTop('how much water should i drink daily', 'hydration'));
check('retrieval: alcohol', () => expectTop('does drinking alcohol affect gains', 'alcohol'));
check('retrieval: muscle gain rate', () => expectTop('how long until i see results', 'muscle-gain-rate'));

/* ------------------------------------------------------ retrieval: safety */

check('retrieval: pain vs soreness', () => expectTop('is this pain normal or am i injured', 'pain-vs-discomfort'));

/* ------------------------------------------------------- off-topic queries */

check('retrieval: an unrelated question returns nothing', () => {
  const hits = search('what is the capital of France', index);
  assert.equal(hits.length, 0, `expected no hits, got ${hits.map((h) => h.entry.id).join(', ')}`);
});

check('retrieval: gibberish returns nothing', () => {
  assert.equal(search('asdfgh qwerty zxcvb', index).length, 0);
});

check('retrieval: empty query returns nothing', () => {
  assert.equal(search('', index).length, 0);
  assert.equal(search('   ', index).length, 0);
});

check('retrieval: an adjacent-but-absent topic scores low or nothing', () => {
  // Nothing in the KB covers marathon pacing; it must not confidently match.
  const hits = search('what pace should i run a marathon at', index);
  assert.ok(
    hits.length === 0 || hits[0].score < 0.3,
    `expected weak match, got ${hits[0]?.entry.id}:${hits[0]?.score}`,
  );
});

/* ----------------------------------------------------------- determinism */

check('retrieval: identical queries give identical results', () => {
  const a = search('how much protein', index);
  const b = search('how much protein', index);
  assert.deepEqual(
    a.map((h) => [h.entry.id, h.score]),
    b.map((h) => [h.entry.id, h.score]),
  );
});

check('retrieval: scores are ordered descending', () => {
  const hits = search('creatine and protein for building muscle', index);
  const scores = hits.map((h) => h.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

check('retrieval: respects the result limit', () =>
  assert.ok(search('muscle training protein', index, { limit: 2 }).length <= 2));

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);
