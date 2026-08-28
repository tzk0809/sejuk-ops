import 'server-only';
import { GoogleGenAI } from '@google/genai';
import {
  geminiResponseSchema,
  interpretationSchema,
  type Interpretation,
} from '@/lib/ai/intent';
import type { QueryResult } from '@/lib/ai/queries';

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
 * Pinned rather than `gemini-flash-latest`. A model that silently changes under
 * a submitted assessment is a demo that cannot be reproduced; the cost is
 * having to bump this by hand.
 *
 * Chosen by calling the models endpoint and then actually sending this module's
 * response schema to each candidate, not by assuming an id:
 *   gemini-2.5-flash  retired — "no longer available to new users"
 *   gemini-3.7-flash  returned "currently experiencing high demand"
 *   gemini-3.5-flash  returned the correct intent for all three spec questions
 *
 * Flash tier rather than Pro: this call classifies a sentence into one of three
 * operations and copies a name across. Reasoning capacity is not the constraint;
 * latency in front of a manager is.
 */
const MODEL = 'gemini-3.5-flash';

/** Bounded so a hung model call cannot hold a request open indefinitely. Both
 *  calls fall back to something correct, so a timeout degrades rather than fails. */
const TIMEOUT_MS = 12_000;

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
  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
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
 * Result -> prose. Given the retrieved data and the answer already computed
 * from it, produce a more natural phrasing of the SAME facts.
 *
 * `deterministic` is passed in and the model is told to rephrase it rather than
 * to summarise raw rows. That is the difference between a formatter and a
 * calculator: there is no arithmetic left to get wrong, because every number
 * is already in the sentence it is being asked to rewrite.
 */
export async function narrate(
  question: string,
  result: QueryResult,
  deterministic: string,
): Promise<string> {
  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: [
        `Question: ${question}`,
        `Retrieved data: ${JSON.stringify(result)}`,
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
