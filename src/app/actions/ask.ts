'use server';

import { z } from 'zod';
import { getCurrentUser } from '@/lib/session';
import { interpret, narrate, QuotaExceededError } from '@/lib/ai/gemini';
import { runQuery, type QueryResult } from '@/lib/ai/queries';
import { formatAnswer } from '@/lib/ai/answer';
import type { QueryIntent } from '@/lib/ai/intent';

/**
 * The AI assistant, end to end.
 *
 * A server action rather than a route handler, to match the rest of the app —
 * every other write goes through src/app/actions/*. It gets the session cookie
 * for free, needs no fetch or JSON plumbing on the client, and the types flow
 * straight through. A route handler would be the right call if anything outside
 * this app ever needed to ask; nothing does.
 *
 * The flow, and what each step is for:
 *
 *   1. authorize        managers only, from the cookie, before anything runs
 *   2. validate input   the question is bounded text
 *   3. interpret        LLM #1 -> intent, parsed by zod. NO DATABASE ACCESS.
 *   4. run              one of three hand-written queries. NO MODEL OUTPUT
 *                       except two validated parameters.
 *   5. format           deterministic answer, computed from the retrieved rows
 *   6. narrate          LLM #2 rephrases step 5. NO DATABASE ACCESS.
 *
 * Steps 3 and 6 are the only places a model appears; step 4 is the only place
 * the database appears. They never overlap, which is what makes the query
 * surface enumerable — and what the spec means by "controlled queries".
 */

export type AskResult =
  | { ok: true; answer: string; intent: QueryIntent; data: QueryResult; phrasedByAi: boolean }
  | { ok: false; message: string };

const questionSchema = z.string().trim().min(3).max(300);

export async function ask(question: string): Promise<AskResult> {
  // 1. Authorization. The spec puts this window in the manager's hands, and the
  //    check lives here rather than in the nav: hiding a link is not a control.
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: 'Your session has expired. Choose a user again.' };
  if (actor.role !== 'manager') {
    return { ok: false, message: 'The AI assistant is available to managers.' };
  }

  // 2. The question is untrusted text, and is bounded before it costs anything.
  const q = questionSchema.safeParse(question);
  if (!q.success) {
    return { ok: false, message: 'Ask a question between 3 and 300 characters.' };
  }

  // 3. Interpret. Everything past this point treats the result as untrusted.
  let interpretation;
  try {
    interpretation = await interpret(q.data);
  } catch (error) {
    // Logged, not swallowed. Without this line a provider outage, a quota
    // rejection and a bug in our own parsing all reach the user as the same
    // sentence and leave nothing behind to tell them apart — which is exactly
    // what happened the first time this path fired, on a transient "model is
    // experiencing high demand" from the API.
    console.error('[ask] interpret failed', error);

    // Free-tier exhaustion and a provider outage are different problems and the
    // difference is actionable: one resets tomorrow, the other might clear in a
    // minute. Reporting both as "unavailable" is what made this take an hour to
    // recognise the first time it happened.
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        message:
          'The daily AI quota for this demo key has been used up (the Gemini free tier allows ' +
          '20 requests per model per day). It resets tomorrow — the orders list still has the data.',
      };
    }

    // A model outage must not read as "no jobs found". It reads as an outage.
    return {
      ok: false,
      message: 'The assistant is unavailable right now. The orders list still has the data.',
    };
  }

  if (!interpretation.supported) {
    return {
      ok: false,
      message:
        `${interpretation.reason} I can answer questions about completed jobs, ` +
        'service types and technician workload — for example "how many jobs were ' +
        'completed today" or "which technician completed the most jobs this week".',
    };
  }

  // 4. Retrieve. One clock is read here and passed down, so the window cannot
  //    shift between resolving it and querying with it.
  let data: QueryResult;
  try {
    data = await runQuery(interpretation.intent, actor, new Date());
  } catch (error) {
    // Database errors are logged, not shown: a raw Postgres message leaks table
    // and column names to anyone who can type in the box.
    console.error('[ask] query failed', error);
    return { ok: false, message: 'Something went wrong retrieving that. Please try again.' };
  }

  // 5. The answer, computed from the retrieved rows. Correct on its own.
  const deterministic = formatAnswer(data);

  // 6. Phrasing. Decorative by design — if it fails, step 5 is what ships, and
  //    the caller is told which one it got.
  try {
    const answer = await narrate(q.data, deterministic);
    return { ok: true, answer, intent: interpretation.intent, data, phrasedByAi: true };
  } catch {
    return { ok: true, answer: deterministic, intent: interpretation.intent, data, phrasedByAi: false };
  }
}
