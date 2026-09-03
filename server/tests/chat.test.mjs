/**
 * Chatbot tests: safety triage, grounding, out-of-scope handling, and the HTTP
 * surface.
 *
 * The LLM is stubbed so the assertions are deterministic and no rate limit is
 * consumed. Crucially, one group injects a model that tries to answer from its
 * own knowledge and cite sources it was never given — the equivalent of the
 * Phase 3 adversarial grounding suite.
 *
 *   npm run test:chat
 */
import { mock } from 'node:test';
import assert from 'node:assert/strict';

const EMAIL = 'fitgen-chat-test@example.com';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'stub-key';

const realGroq = await import('../src/services/groqClient.js');

/** Set per test; receives the prompt and returns the "model" response. */
let nextResponse = null;
let lastCall = null;
let aiConfigured = true;

await mock.module('../src/services/groqClient.js', {
  namedExports: {
    ...realGroq,
    isGroqConfigured: () => aiConfigured,
    generateJson: async ({ system, user, validate, maxTokens }) => {
      lastCall = { system, user, validate, maxTokens };
      if (nextResponse === '__throw__') {
        throw new realGroq.GroqUnavailableError('stubbed outage');
      }
      const data = typeof nextResponse === 'function' ? nextResponse(user) : nextResponse;
      return {
        data,
        meta: { model: 'stub', attempts: 1, durationMs: 1, usage: null, problems: [] },
      };
    },
  },
});

await mock.module('../src/services/googleAuth.js', {
  namedExports: {
    verifyGoogleIdToken: async () => ({
      googleId: 'google-chat-test',
      email: EMAIL,
      name: 'Chat Tester',
    }),
  },
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const buildApp = (await import('../src/app.js')).default;
const { User } = await import('../src/models/User.js');
const { ChatMessage } = await import('../src/models/ChatMessage.js');
const { answerQuestion, triageSafety } = await import('../src/services/chatService.js');
const { knowledgeBase } = await import('../src/data/knowledgeBase.js');

await connectDB();

const cleanup = async () => {
  const user = await User.findOne({ email: EMAIL });
  if (user) await ChatMessage.deleteMany({ userId: user._id });
  await User.deleteMany({ email: EMAIL });
};
await cleanup();

const app = buildApp();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

let token;
const req = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
};

/** A well-behaved model: cites whatever ids the prompt supplied. */
const goodModel = (user) => {
  const ids = [...user.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  return {
    answer:
      'Here is a grounded answer built entirely from the supplied passages, long enough to pass the minimum length check.',
    citations: ids.slice(0, 2),
    grounded: true,
    suggestFollowUp: ['And what about recovery?'],
  };
};

/* ============================================================ safety gate == */

const SAFETY_CASES = [
  ['I have chest pain during squats, what should I do?', 'emergency'],
  ['I cannot breathe properly when I run', 'emergency'],
  ['Do I have a torn rotator cuff?', 'diagnosis'],
  ['I think I tore my ACL, how do I train around it?', 'diagnosis'],
  ['What dose of testosterone should I take?', 'medication'],
  ['Are SARMs safe to use?', 'medication'],
  ['Should I take clenbuterol to cut?', 'medication'],
  ['I want to eat 500 calories a day to lose weight fast', 'disordered-eating'],
  ['Should I use laxatives to drop weight?', 'disordered-eating'],
  ['Can I keep lifting heavy in my third trimester?', 'pregnancy'],
  ['I am 12 years old, can I lift weights?', 'minor'],
];

for (const [question, expected] of SAFETY_CASES) {
  await check(`safety: refuses "${question.slice(0, 42)}…" (${expected})`, () => {
    const verdict = triageSafety(question);
    assert.ok(verdict?.refused, 'expected a refusal');
    assert.equal(verdict.reason, expected);
    assert.ok(verdict.answer.length > 50, 'refusal should explain itself');
  });
}

/** Ordinary gym language that must NOT trip the safety rules. */
const SAFE_CASES = [
  'How do I train chest without a bench?',
  'My legs are painfully sore after squats, is that normal?',
  'Is chest day better before or after back day?',
  'How much protein should I eat?',
  'My shoulders hurt when I bench, how should I fix my form?',
  'What supplements actually work?',
  'How do I lose belly fat?',
];

for (const question of SAFE_CASES) {
  await check(`safety: allows "${question.slice(0, 45)}…"`, () =>
    assert.equal(triageSafety(question), null, 'should not be refused'));
}

await check('safety: a refusal never calls the LLM', async () => {
  lastCall = null;
  nextResponse = goodModel;
  const result = await answerQuestion({ question: 'Do I have a herniated disc?' });
  assert.equal(result.refused, true);
  assert.equal(lastCall, null, 'the model must not be invoked for a refusal');
  assert.deepEqual(result.retrieval, []);
});

/* ========================================================== retrieval gate = */

await check('scope: an unrelated question never calls the LLM', async () => {
  lastCall = null;
  nextResponse = goodModel;
  const result = await answerQuestion({ question: 'Who won the 1998 World Cup?' });
  assert.equal(result.outOfScope, true);
  assert.equal(result.grounded, false);
  assert.equal(lastCall, null, 'no passages means no request');
  assert.deepEqual(result.citations, []);
});

await check('scope: the out-of-scope reply states the boundary', async () => {
  const result = await answerQuestion({ question: 'What is the tallest mountain?' });
  assert.match(result.answer, /knowledge base/i);
  assert.ok(result.suggestFollowUp.length > 0, 'should offer in-scope starters');
});

await check('scope: an in-scope question does reach the LLM', async () => {
  lastCall = null;
  nextResponse = goodModel;
  const result = await answerQuestion({ question: 'How much creatine should I take?' });
  assert.ok(lastCall, 'expected a model call');
  assert.equal(result.grounded, true);
  assert.ok(result.retrieval.length > 0);
});

await check('retrieval: the prompt contains only retrieved passages', async () => {
  nextResponse = goodModel;
  await answerQuestion({ question: 'How much creatine should I take?' });
  const ids = [...lastCall.user.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const known = new Set(knowledgeBase.map((e) => e.id));
  assert.ok(ids.length > 0 && ids.length <= 4, `got ${ids.length} passages`);
  assert.ok(ids.every((id) => known.has(id)), 'all passages must be real entries');
});

/* ====================================================== grounding: adversarial */

await check('grounding: fabricated citation ids are stripped', async () => {
  nextResponse = () => ({
    answer:
      'Creatine should be dosed at 50 grams daily according to my own knowledge, which is dangerous nonsense.',
    citations: ['totally-made-up-entry', 'creatine-mega-dosing'],
    grounded: true,
  });
  const result = await answerQuestion({ question: 'How much creatine should I take?' });
  assert.deepEqual(result.citations, [], 'invented ids must not survive');
  assert.equal(result.grounded, false, 'no real citation means not grounded');
});

await check('grounding: a real id mixed with fakes keeps only the real one', async () => {
  nextResponse = (user) => {
    const ids = [...user.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    return {
      answer: 'A partially honest answer that cites one real source and two inventions.',
      citations: [ids[0], 'invented-one', 'invented-two'],
      grounded: true,
    };
  };
  const result = await answerQuestion({ question: 'How much protein do I need?' });
  assert.equal(result.citations.length, 1);
  assert.ok(knowledgeBase.some((e) => e.id === result.citations[0]));
  assert.equal(result.grounded, true);
});

await check('grounding: an answer citing nothing is marked ungrounded', async () => {
  nextResponse = () => ({
    answer: 'I happen to know the answer from training myself, so here it is without any source.',
    citations: [],
    grounded: true,
  });
  const result = await answerQuestion({ question: 'How many rest days do I need?' });
  assert.equal(result.grounded, false);
  assert.ok(
    result.generation.warnings.some((w) => /without citing/i.test(w)),
    JSON.stringify(result.generation.warnings),
  );
});

await check('grounding: the model may honestly report it cannot answer', async () => {
  nextResponse = () => ({
    answer: 'The sources provided do not cover that specific question, so I cannot answer it.',
    citations: [],
    grounded: false,
  });
  const result = await answerQuestion({ question: 'How much creatine should I take?' });
  assert.equal(result.grounded, false);
});

await check('grounding: the validate gate rejects invented citations', async () => {
  nextResponse = goodModel;
  await answerQuestion({ question: 'What is progressive overload?' });
  const verdict = lastCall.validate({
    answer: 'A long enough answer string to clear the minimum length requirement.',
    citations: ['not-a-real-entry'],
    grounded: true,
  });
  assert.notEqual(verdict, true);
  assert.match(String(verdict), /SOURCES|Cite only/i);
});

await check('grounding: the validate gate accepts a genuine response', async () => {
  nextResponse = goodModel;
  await answerQuestion({ question: 'What is progressive overload?' });
  const ids = [...lastCall.user.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(
    lastCall.validate({
      answer: 'A long enough answer string to clear the minimum length requirement.',
      citations: [ids[0]],
      grounded: true,
    }),
    true,
  );
});

await check('grounding: malformed model output degrades to the passage', async () => {
  nextResponse = '__throw__';
  const result = await answerQuestion({ question: 'How much creatine should I take?' });
  assert.equal(result.generation.generatedBy, 'fallback');
  assert.equal(result.citations.length, 1);
  assert.ok(result.answer.length > 100, 'should serve the real entry text');
  assert.ok(knowledgeBase.some((e) => e.id === result.citations[0]));
});

await check('grounding: with no API key, the passage is served verbatim', async () => {
  aiConfigured = false;
  const result = await answerQuestion({ question: 'How much creatine should I take?' });
  assert.equal(result.generation.generatedBy, 'fallback');
  assert.equal(result.grounded, true);
  const entry = knowledgeBase.find((e) => e.id === result.citations[0]);
  assert.ok(result.answer.includes(entry.answer.slice(0, 60)));
  aiConfigured = true;
});

await check('grounding: the system prompt forbids outside knowledge', async () => {
  nextResponse = goodModel;
  await answerQuestion({ question: 'How much protein do I need?' });
  assert.match(lastCall.system, /ONLY using the SOURCES/i);
  assert.match(lastCall.system, /Do NOT answer from your own knowledge/i);
});

/* ============================================================ personalisation */

await check('context: the prompt includes the user profile', async () => {
  nextResponse = goodModel;
  await answerQuestion({
    question: 'How much protein do I need?',
    profile: {
      goal: 'lose_fat',
      trainingDaysPerWeek: 5,
      injuries: [{ area: 'knee', severity: 'mild' }],
    },
  });
  assert.match(lastCall.user, /lose fat/i);
  assert.match(lastCall.user, /5 days\/week/i);
  assert.match(lastCall.user, /knee \(mild\)/i);
});

await check('context: prior turns are supplied for follow-ups', async () => {
  nextResponse = goodModel;
  await answerQuestion({
    question: 'What about for women?',
    history: [{ question: 'How much protein do I need?', answer: 'Around 1.6-2.2 g per kg.' }],
  });
  assert.match(lastCall.user, /RECENT CONVERSATION/);
  assert.match(lastCall.user, /1\.6-2\.2/);
});

/* ================================================================== HTTP == */

const auth = await req('POST', '/api/auth/google', { credential: 'stub' });
token = auth.body.token;

const meta = await req('GET', '/api/chat/meta');
await check('http: meta reports the knowledge-base size', () => {
  assert.equal(meta.status, 200);
  assert.equal(meta.body.data.knowledge.entries, knowledgeBase.length);
  assert.ok(meta.body.data.knowledge.categories.length > 0);
});
await check('http: meta offers starter questions', () =>
  assert.ok(meta.body.data.suggestions.length > 0));
await check('http: meta states the scope boundary', () =>
  assert.match(meta.body.data.scope, /not medical advice/i));

nextResponse = goodModel;
const first = await req('POST', '/api/chat', { question: 'How much creatine should I take?' });
await check('http: a question returns 201 with an answer', () => {
  assert.equal(first.status, 201, JSON.stringify(first.body).slice(0, 200));
  assert.ok(first.body.data.answer.length > 20);
});
await check('http: sources are expanded to titles', () => {
  assert.ok(first.body.data.sources.length > 0);
  assert.ok(first.body.data.sources.every((s) => s.title && s.categoryLabel));
});
await check('http: the retrieval trace is returned', () =>
  assert.ok(first.body.data.retrieval.every((r) => typeof r.score === 'number')));
await check('http: a sessionId is issued', () =>
  assert.ok(first.body.data.sessionId?.length > 10));

const sessionId = first.body.data.sessionId;
const second = await req('POST', '/api/chat', {
  question: 'And how many rest days do I need?',
  sessionId,
});
await check('http: a follow-up stays in the same session', () =>
  assert.equal(second.body.data.sessionId, sessionId));
await check('http: the follow-up prompt carried prior turns', () =>
  assert.match(lastCall.user, /RECENT CONVERSATION/));

const history = await req('GET', `/api/chat/history?sessionId=${sessionId}`);
await check('http: history returns the session oldest-first', () => {
  assert.equal(history.body.data.length, 2);
  assert.match(history.body.data[0].question, /creatine/i);
});
await check('http: history persists the retrieval trace', () =>
  assert.ok(history.body.data[0].retrieval.length > 0));

const sessions = await req('GET', '/api/chat/sessions');
await check('http: sessions lists the conversation', () => {
  assert.ok(sessions.body.data.length >= 1);
  const s = sessions.body.data.find((x) => x.sessionId === sessionId);
  assert.equal(s.messages, 2);
  assert.match(s.title, /creatine/i);
});

const refusalRes = await req('POST', '/api/chat', {
  question: 'What dose of anabolic steroids should I run?',
});
await check('http: a refusal is persisted and flagged', () => {
  assert.equal(refusalRes.body.data.refused, true);
  assert.deepEqual(refusalRes.body.data.sources, []);
});

const voice = await req('POST', '/api/chat', {
  question: 'How deep should I squat?',
  inputMode: 'voice',
});
await check('http: voice input mode is recorded', async () => {
  assert.equal(voice.status, 201);
  const saved = await ChatMessage.findById(voice.body.data.id).lean();
  assert.equal(saved.inputMode, 'voice');
});

const tooShort = await req('POST', '/api/chat', { question: 'hi' });
await check('http: a too-short question is rejected', () =>
  assert.equal(tooShort.status, 400));

const knowledge = await req('GET', '/api/chat/knowledge');
await check('http: the knowledge base is browsable', () => {
  assert.equal(knowledge.body.data.length, knowledgeBase.length);
  assert.ok(knowledge.body.data.every((e) => e.answer && e.title));
});

const filtered = await req('GET', '/api/chat/knowledge?category=supplements');
await check('http: knowledge can be filtered by category', () =>
  assert.ok(
    filtered.body.data.length > 0 &&
      filtered.body.data.every((e) => e.category === 'supplements'),
  ));

const cleared = await req('DELETE', `/api/chat/history?sessionId=${sessionId}`);
await check('http: one session can be cleared', () => {
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.deletedCount, 2);
});

const remaining = await req('GET', '/api/chat/history');
await check('http: clearing one session leaves the others', () =>
  assert.ok(remaining.body.data.length >= 1));

const savedToken = token;
token = null;
const unauth = await req('POST', '/api/chat', { question: 'How much protein?' });
await check('http: chat requires auth (401)', () => assert.equal(unauth.status, 401));
token = savedToken;

console.log('\n' + results.join('\n'));
const passed = results.filter((r) => r.includes('PASS')).length;
const failed = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed\n`);

await cleanup();
server.close();
await disconnectDB();
