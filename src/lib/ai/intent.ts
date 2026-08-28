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
 * What the model actually returns: an intent, or a refusal.
 *
 * The envelope exists because a schema that only describes an intent forces the
 * model to produce one for every input. Asked "what is our refund policy?" it
 * would invent a LIST_JOBS. Making "I can't answer that" a first-class, typed
 * outcome is how the module handles being asked something it has no query for —
 * the alternative is a plausible answer to a question nobody asked.
 */
export const interpretationSchema = z.discriminatedUnion('supported', [
  z.object({ supported: z.literal(true), intent: queryIntentSchema }),
  z.object({ supported: z.literal(false), reason: z.string().max(300) }),
]);

export type Interpretation = z.infer<typeof interpretationSchema>;

/**
 * The response schema handed to Gemini, in its OpenAPI-subset dialect.
 *
 * The object shape is written out here while zod above validates it — the two
 * descriptions of the same thing that could drift. What CANNOT drift is the
 * part that matters: every enum below is spread from the same constant the zod
 * schema uses, so a new period or service type is impossible to add to one and
 * forget in the other. Generating this from zod was rejected because
 * z.toJSONSchema emits keys ($schema, additionalProperties) that Gemini
 * rejects, and stripping them is more fragile than sharing the arrays.
 */
export const geminiResponseSchema = {
  type: 'object',
  properties: {
    supported: {
      type: 'boolean',
      description: 'False if the question is not about completed service jobs or technicians.',
    },
    reason: {
      type: 'string',
      description: 'When unsupported, one short sentence saying what cannot be answered.',
    },
    intent: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: [...OPERATION] },
        technicianName: {
          type: 'string',
          description: 'Technician name exactly as the user wrote it. Omit if none was named.',
        },
        serviceType: { type: 'string', enum: [...SERVICE_TYPE] },
        dateRange: {
          type: 'string',
          enum: [...REPORT_PERIOD],
          description:
            'Required. Never compute a date yourself — pick the closest word. ALL_TIME if no period was mentioned.',
        },
      },
      required: ['operation', 'dateRange'],
    },
  },
  required: ['supported'],
} as const;
