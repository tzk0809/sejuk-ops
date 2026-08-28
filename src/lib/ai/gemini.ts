import 'server-only';
import { GoogleGenAI } from '@google/genai';
import {
  geminiResponseSchema,
  interpretationSchema,
  type Interpretation,
} from '@/lib/ai/intent';

/**
 * The two places a language model appears in this module — and neither of them
 * touches the database.
 *
 *   interpret()  English question           -> validated intent (or a refusal)
 *   narrate()    already-retrieved result   -> a sentence
 *
 * Between them sits lib/ai/queries.ts, which is ordinary TypeScript. That gap
 * is the architecture: the model chooses among three queries and fills in
 * parameters from closed lists, and the server decides what that means and what
 * it is allowed to read.
 *
 * GEMINI_API_KEY is read here, in server-only code. Like SUPABASE_SERVICE_ROLE_KEY
 * it has no NEXT_PUBLIC_ prefix, so Next will not inline it into a client
 * bundle, and `import 'server-only'` turns an accidental client import into a
 * build error rather than a runtime mystery.
 */

/**
 * Two models, one per call, and the reason is quota rather than capability.
 *
 * The Gemini free tier allows 20 requests per day PER MODEL
 * (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Answering one question
 * costs two calls, so a single model would cap the whole feature at ten
 * questions a day — discovered the hard way, by exhausting gemini-3.5-flash
 * during testing and watching every question start returning an outage.
 *
 * Because the quota is per model, splitting the two calls across two models
 * doubles the budget for free. On a paid key both constants would be the same
 * model and this comment would be a curiosity.
 *
 * Both are pinned rather than `-latest`: a model that silently changes under a
 * submitted assessment is a demo that cannot be reproduced.
 *
 * Ids were not assumed. Each candidate was called with this module's real
 * schema and prompt, and timed:
 *
 *   gemini-2.5-flash       retired — "no longer available to new users"
 *   gemini-3.7-flash       "currently experiencing high demand"
 *   gemini-3.5-flash       ~3s, correct; quota exhausted during testing
 *   gemini-3.6-flash       ~39s (!), correct. Reasons at length about a
 *                          three-way classification, and rejects
 *                          `thinkingBudget: 0` with 400 invalid argument, so
 *                          the thinking cannot be turned off. Unusable behind
 *                          a text box someone is waiting at.
 *   gemini-3.1-flash-lite  ~1s, correct intent
 *   gemini-3.5-flash-lite  ~1s, correct phrasing
 *
 * The lite tier winning is not a compromise. Choosing between three operations
 * and copying a name across is not a reasoning problem, and paying 39 seconds
 * of chain-of-thought for it buys nothing.
 */

/** Question -> intent. */
const INTERPRET_MODEL = 'gemini-3.1-flash-lite';

/** Rephrasing a sentence that is already correct; a failure here falls back to
 *  that sentence unchanged. Different model from INTERPRET_MODEL for the quota
 *  reason above, not because the task needs a different one. */
const NARRATE_MODEL = 'gemini-3.5-flash-lite';

/** Free-tier exhaustion is recoverable information, not a generic outage, and
 *  the two want different sentences in front of a user. */
export class QuotaExceededError extends Error {}

const asQuotaError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  return /429|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(message)
    ? new QuotaExceededError(message)
    : (error instanceof Error ? error : new Error(message));
};

/**
 * Bounded so a slow model cannot hold a request open indefinitely. Both calls
 * fall back to something correct, so a timeout degrades rather than fails.
 *
 * Eight seconds against a measured ~1s for both models — generous enough to
 * absorb a slow response, tight enough that a manager is not left staring at a
 * spinner. This is a ceiling, not a target: it is what caught gemini-3.6-flash
 * taking 39 seconds, which is exactly the job it exists to do.
 */
const TIMEOUT_MS = 8_000;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('Missing GEMINI_API_KEY. Add it to .env.local.');
}
const ai = new GoogleGenAI({ apiKey });

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI request timed out')), ms)),
  ]);

/**
 * Nothing here grants any capability. The model cannot reach the database
 * whatever this says, so the prompt is guidance for producing a USEFUL intent,
 * never the thing that stops a dangerous one. The stop is the zod parse below
 * and the closed query set in queries.ts.
 *
 * It deliberately does NOT contain the technician roster. Names are resolved
 * against the database, so the model cannot invent a colleague, the prompt
 * cannot go stale as staff change, and no personal data is sent to Google
 * before it is needed.
 */
const SYSTEM_PROMPT = `
You turn a manager's question about an air-conditioning service company into a
structured query intent. You never see the database and never write queries.

Operations:
- LIST_JOBS: the user wants to see which jobs were completed.
- COUNT_JOBS: the user wants only a number.
- RANK_TECHNICIANS: the user wants to compare technicians, or asks who did the
  most or fewest.

Rules:
- dateRange is required. Never calculate a date. You do not know today's date.
  Choose the closest period word; use ALL_TIME when no period is mentioned.
- Copy technicianName exactly as the user wrote it. Do not guess a full name.
- Set supported=false for anything not about completed service jobs, service
  types or technicians — including questions about customers, phone numbers,
  addresses, prices, payments or uploaded documents, which you cannot access.
`.trim();

/**
 * Question -> intent. The result is parsed with zod before it is returned, so a
 * malformed or hostile response is a refusal rather than a fallthrough.
 *
 * The user's question is untrusted text and reaches the model. A prompt
 * injection can, at most, make it choose a different one of three operations
 * with different parameters — which is exactly why the query set is closed. The
 * blast radius is bounded by design rather than by the model's compliance.
 */
export async function interpret(question: string): Promise<Interpretation> {
  let response;
  try {
    response = await withTimeout(
      ai.models.generateContent({
        model: INTERPRET_MODEL,
        contents: question,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: geminiResponseSchema as unknown as Record<string, unknown>,
          temperature: 0,
        },
      }),
      TIMEOUT_MS,
    );
  } catch (error) {
    throw asQuotaError(error);
  }

  const raw = response.text;
  if (!raw) return { supported: false, reason: 'I did not understand that question.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { supported: false, reason: 'I did not understand that question.' };
  }

  // THE BOUNDARY. Model output is untrusted input, and gets the same treatment
  // as a request body: if it does not parse, nothing runs.
  const result = interpretationSchema.safeParse(parsed);
  if (!result.success) {
    return { supported: false, reason: 'I could not turn that into a question I can answer.' };
  }
  return result.data;
}

/**
 * Answer -> better-phrased answer. The model rephrases a sentence that is
 * already correct; it never sees rows and never summarises them.
 *
 * That is the difference between a formatter and a calculator: there is no
 * arithmetic left to get wrong, because every figure is already present in the
 * text being rewritten.
 *
 * It deliberately does NOT receive the QueryResult. Passing it made the model
 * paste raw window instants into the reply — "for the window from
 * 2026-08-27T16:00:00.000Z to..." — because they were in front of it and looked
 * relevant. The structured result was redundant anyway: formatAnswer has
 * already put every fact from it into `deterministic`. Sending less is both a
 * better answer and less data leaving the building.
 */
export async function narrate(question: string, deterministic: string): Promise<string> {
  const response = await withTimeout(
    ai.models.generateContent({
      model: NARRATE_MODEL,
      contents: [
        `Question: ${question}`,
        `Correct answer: ${deterministic}`,
      ].join('\n\n'),
      config: {
        systemInstruction: `
Rewrite the correct answer as a natural reply to the question, for a manager
reading it in an operations dashboard.

- Every figure, order number and name must come from the correct answer. Never
  add, total, average or infer anything that is not already there.
- Keep the date range in the reply. It is how the reader checks the question was
  understood.
- Keep any list as a list, one item per line. Two or three sentences at most.
- Plain text. No markdown headings, no preamble, no follow-up offer.
`.trim(),
        temperature: 0.2,
      },
    }),
    TIMEOUT_MS,
  );

  const text = response.text?.trim();
  return text && text.length > 0 ? text : deterministic;
}
