import Groq from 'groq-sdk';
import { env } from '../config/env.js';

/**
 * Thin Groq wrapper for JSON-constrained generation.
 *
 * Every generator in Phase 3 goes through here so retry, timeout and JSON
 * parsing behave identically, and so a missing API key degrades to a
 * deterministic fallback rather than a 500.
 *
 * NOTE ON MODEL CHOICE: the project report specifies Llama 3.1/3.3, but Groq
 * has since retired those from its serving catalogue. `openai/gpt-oss-120b` is
 * the most capable general model currently offered and handles the constrained
 * JSON output this phase needs. Override with GROQ_MODEL if the catalogue
 * changes again — nothing else in the codebase depends on the model name.
 */
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

/**
 * Groq's free ("on_demand") tier caps *tokens per minute*, and counts
 * `prompt_tokens + max_tokens` against that cap — reserving output tokens costs
 * you budget even if the model doesn't use them. Exceeding it returns 413, not
 * 429, and retrying the same request cannot help.
 *
 * 8000 is the observed free-tier TPM limit. The budget below leaves headroom so
 * two generations in the same minute don't collide.
 */
/** Models that accept the `reasoning_effort` parameter. */
const SUPPORTS_REASONING_EFFORT = /gpt-oss/i;

export const TPM_LIMIT = Number(process.env.GROQ_TPM_LIMIT ?? 8000);
export const TOKEN_BUDGET = Math.floor(TPM_LIMIT * 0.62);

/**
 * Cheap token estimate. Deliberately pessimistic (~3.4 chars/token rather than
 * the usual ~4) because exercise slugs like `Barbell_Bench_Press_-_Medium_Grip`
 * tokenise far worse than prose, and under-estimating costs a failed request.
 */
export const estimateTokens = (text) => Math.ceil(String(text).length / 3.4);

/**
 * Shrinks a list until the whole prompt fits the budget.
 *
 * @param {object}   options
 * @param {Array}    options.items         Candidates, most important first.
 * @param {function} options.render        (items) => prompt string.
 * @param {number}   options.maxTokens     Output tokens to be reserved.
 * @param {number}   [options.minItems]    Never trim below this.
 * @returns {{ items: Array, prompt: string, estimatedTokens: number, trimmed: number }}
 */
export const fitToBudget = ({ items, render, maxTokens, minItems = 6 }) => {
  let current = [...items];
  let prompt = render(current);

  const fits = () => estimateTokens(prompt) + maxTokens <= TOKEN_BUDGET;

  while (!fits() && current.length > minItems) {
    // Drop the tail — callers rank candidates so the most useful come first.
    const nextLength = Math.max(minItems, Math.floor(current.length * 0.75));
    current = current.slice(0, nextLength);
    prompt = render(current);
  }

  return {
    items: current,
    prompt,
    estimatedTokens: estimateTokens(prompt),
    trimmed: items.length - current.length,
  };
};

/** Turns Groq's raw rate-limit errors into something a user can act on. */
export const humaniseGroqError = (message = '') => {
  if (/tokens per minute|Request too large/i.test(message)) {
    return `The request exceeded Groq's free-tier limit of ${TPM_LIMIT} tokens per minute. Wait about a minute and try again.`;
  }
  if (/rate.?limit/i.test(message)) {
    return 'Groq is rate-limiting requests on the free tier. Wait about a minute and try again.';
  }
  if (/timeout|ETIMEDOUT|aborted/i.test(message)) {
    return 'Groq took too long to respond. Try again.';
  }
  if (/Failed to validate JSON/i.test(message)) {
    return 'The model returned malformed JSON on every attempt. Try generating again.';
  }
  return message.slice(0, 160);
};

const client = env.groqApiKey
  ? new Groq({ apiKey: env.groqApiKey, timeout: 45_000, maxRetries: 0 })
  : null;

export const isGroqConfigured = () => Boolean(client);

export class GroqUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GroqUnavailableError';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Strips markdown fences and leading prose some models add despite JSON mode,
 * then parses. Returns null rather than throwing so the caller can retry.
 */
const extractJson = (raw) => {
  if (!raw) return null;

  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    // Fall back to the outermost {...} span.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

/**
 * Calls Groq expecting a JSON object back.
 *
 * @param {object}  options
 * @param {string}  options.system      System prompt.
 * @param {string}  options.user        User prompt.
 * @param {number}  [options.temperature]
 * @param {number}  [options.maxTokens]
 * @param {number}  [options.attempts]  Total tries before giving up.
 * @param {function}[options.validate]  (parsed) => true | string(reason).
 *                                      A rejected result is retried with the
 *                                      reason appended, which fixes most
 *                                      schema slips without a second design.
 * @returns {Promise<{data: object, meta: object}>}
 */
export const generateJson = async ({
  system,
  user,
  temperature = 0.4,
  maxTokens = 4000,
  attempts = 3,
  validate,
}) => {
  if (!client) {
    throw new GroqUnavailableError(
      'GROQ_API_KEY is not set — AI generation is unavailable',
    );
  }

  const startedAt = Date.now();
  const problems = [];
  let messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let completion;
    try {
      completion = await client.chat.completions.create({
        model: env.groqModel,
        messages,
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: maxTokens,
        /*
         * gpt-oss models emit internal reasoning tokens that count against
         * max_tokens. At the default effort they consumed ~575 of a 780-token
         * completion, truncating the JSON mid-object — which Groq then rejects
         * with a 400 "Failed to validate JSON".
         *
         * Every FitGen prompt is a constrained selection from a supplied list,
         * where deep deliberation adds little: dropping to "low" cut reasoning
         * from 578 to 29 tokens with no loss of output quality. Only sent for
         * models known to accept it.
         */
        ...(SUPPORTS_REASONING_EFFORT.test(env.groqModel)
          ? { reasoning_effort: 'low' }
          : {}),
      });
    } catch (err) {
      problems.push(`attempt ${attempt}: request failed — ${err.message}`);

      // Rate limits and transient 5xx are worth waiting out; other 4xx is not.
      // 413 ("request too large") specifically cannot be fixed by retrying the
      // same payload — the caller must shrink it, so fail fast and say so.
      const status = err.status ?? err.response?.status;
      // Groq returns 400 "Failed to validate JSON" when a response is truncated
      // or malformed. That is sampling-dependent, so one more attempt is worth
      // it — unlike a 413, which the same payload can never satisfy.
      const malformedJson =
        status === 400 && /Failed to validate JSON/i.test(err.message ?? '');
      const retryable =
        status === 429 || status >= 500 || status === undefined || malformedJson;
      if (!retryable || attempt === attempts) {
        throw new GroqUnavailableError(humaniseGroqError(err.message));
      }

      /*
       * A 429 needs real patience — Groq's free tier measures its window in
       * seconds, so a 500 ms retry just burns the remaining attempts. Honour
       * the Retry-After hint when present, and back off hard when it isn't.
       */
      if (status === 429) {
        const hinted = Number(
          err.headers?.['retry-after'] ?? err.response?.headers?.get?.('retry-after'),
        );
        const waitMs = Number.isFinite(hinted) && hinted > 0
          ? Math.min(hinted * 1000 + 250, 20_000)
          : Math.min(2000 * 2 ** (attempt - 1), 20_000);
        await sleep(waitMs);
      } else {
        await sleep(500 * attempt);
      }
      continue;
    }

    const raw = completion.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(raw);

    if (!parsed) {
      problems.push(`attempt ${attempt}: response was not valid JSON`);
      messages = [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 2000) },
        {
          role: 'user',
          content:
            'That was not valid JSON. Reply with the JSON object only — no prose, no markdown fences.',
        },
      ];
      continue;
    }

    const verdict = validate ? validate(parsed) : true;
    if (verdict === true) {
      return {
        data: parsed,
        meta: {
          model: env.groqModel,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          usage: completion.usage ?? null,
          problems,
        },
      };
    }

    problems.push(`attempt ${attempt}: ${verdict}`);
    messages = [
      ...messages,
      { role: 'assistant', content: raw.slice(0, 2000) },
      {
        role: 'user',
        content: `That response was rejected: ${verdict}\nReturn corrected JSON only.`,
      },
    ];
  }

  throw new GroqUnavailableError(
    `Groq did not return a usable response after ${attempts} attempts. ${problems.join(' | ')}`,
  );
};
