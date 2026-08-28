import { z } from 'zod';
import { REPORT_PERIOD } from '@/lib/time';
import { SERVICE_TYPE } from '@/lib/types';

/**
 * The complete vocabulary the AI is allowed to speak.
 *
 * This file is the security boundary of the AI module. Everything the model
 * produces is parsed here before anything else happens, and nothing that fails
 * this parse reaches a query. The model does not write SQL, does not name
 * tables, and does not choose columns — it fills in three fields from closed
 * lists, and the server decides what that means.
 *
 * The rule this encodes: MODEL OUTPUT IS UNTRUSTED INPUT. It gets the same
 * treatment as a request body off the internet, because that is what it is —
 * a string that arrived over HTTP from a system we do not control, shaped by a
 * user's free text. `lib/validation.ts` does this for the order form; this is
 * the same reflex pointed at a new source.
 */

/**
 * Three operations, because the spec asks three kinds of question:
 *   LIST_JOBS        "What jobs did Ali complete last week?"
 *   COUNT_JOBS       "How many jobs were completed today?"
 *   RANK_TECHNICIANS "Which technician completed the most jobs this week?"
 *
 * LIST_JOBS also returns a count, so COUNT_JOBS is not strictly necessary. It
 * earns its place by NOT shipping rows: a count question gets an integer out of
 * Postgres and sends no order data to the model at all.
 */
export const OPERATION = ['LIST_JOBS', 'COUNT_JOBS', 'RANK_TECHNICIANS'] as const;
export type Operation = (typeof OPERATION)[number];

export const queryIntentSchema = z.object({
  operation: z.enum(OPERATION),

  /**
   * A name as the manager said it, e.g. "Ali". Resolved to a uuid server-side —
   * the model is never given the roster, so it cannot invent an id, and an
   * unknown name comes back as a structured "I don't know that person" rather
   * than as a silent zero.
   *
   * Sanitised rather than merely length-capped: this value is interpolated into
   * a PostgREST `ilike` pattern, where `%` and `_` are wildcards. Stripping
   * everything that is not a name character removes the wildcard entirely
   * instead of trying to escape it.
   */
  technicianName: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .transform((s) => s.replace(/[^\p{L}\p{M}\s'.-]/gu, '').trim())
    .refine((s) => s.length > 0, 'Not a usable name')
    .optional(),

  /** Closed list, and the same list the database CHECK constraint enforces. */
  serviceType: z.enum(SERVICE_TYPE).optional(),

  /**
   * REQUIRED, deliberately. If this were optional, an absent value would have
   * to mean both "the manager meant all time" and "the model forgot", and those
   * cannot be told apart — so a dropped field on "how many today?" would
   * silently answer for all time. Making the model state ALL_TIME explicitly
   * turns a silent wrong answer into a validation failure.
   *
   * Same reasoning as ALL_STATUSES in lib/types.ts: absent and "everything" are
   * different states, so they get different spellings.
   */
  dateRange: z.enum(REPORT_PERIOD),
});

export type QueryIntent = z.infer<typeof queryIntentSchema>;

/**
 * The JSON Schema handed to Gemini. Derived from the zod schema rather than
 * written twice, so the model's instructions and the server's validation cannot
 * drift apart — the classic way this pattern rots is a fourth enum value added
 * to the prompt and forgotten in the validator.
 */
export const queryIntentJsonSchema = z.toJSONSchema(queryIntentSchema);
