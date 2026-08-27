import { z } from 'zod';
import { SERVICE_TYPE } from '@/lib/types';

/**
 * Malaysian phone numbers. Admins type whatever is on the customer's card, so
 * both local (0123456789) and international (60123456789) forms are accepted and
 * normalised to 60… on save.
 *
 * Storing one canonical form matters beyond tidiness: Module 3's wa.me deep link
 * requires the international form with no leading + or 0. Normalising at the edge
 * means nothing downstream has to guess which format a row holds.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let n = digits;
  if (n.startsWith('60')) n = n.slice(2);
  else if (n.startsWith('0')) n = n.slice(1);
  else return null;
  // Malaysian subscriber numbers after the country code: 8-10 digits
  // (mobile 1XXXXXXXX / 1XXXXXXXXX, landline 3XXXXXXX and friends).
  if (!/^\d{8,10}$/.test(n)) return null;
  return `60${n}`;
}

const phone = z
  .string()
  .trim()
  .min(1, 'Phone is required')
  .transform((v, ctx) => {
    const normalised = normalisePhone(v);
    if (!normalised) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a Malaysian number, e.g. 012-345 6789 or 60123456789',
      });
      return z.NEVER;
    }
    return normalised;
  });

/**
 * Length caps for the free-text columns. Postgres `text` is unbounded, so without
 * a limit somewhere a single paste could store megabytes in a column that every
 * list query reads.
 *
 * Defined once and used by the create-order schema below, the completion action,
 * and the character counters in the completion form — so a limit cannot be
 * tightened in one place and forgotten in another. Mirrored by CHECK constraints
 * in 0008.
 */
export const TEXT_LIMITS = {
  work_done: 5000,
  tech_remarks: 2000,
  problem_desc: 2000,
  admin_notes: 2000,
} as const;

export const createOrderSchema = z.object({
  cust_name: z.string().trim().min(2, 'Customer name is required').max(100, 'Max 100 characters'),
  phone,
  address: z.string().trim().min(5, 'Address is required'),
  service_type: z.enum(SERVICE_TYPE, { message: 'Choose a service type' }),
  quoted_price: z
    .string()
    .trim()
    .min(1, 'Quoted price is required')
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Enter an amount, e.g. 250 or 250.00')
    .refine((v) => Number(v) >= 0, 'Price cannot be negative'),
  problem_desc: z
    .string().trim()
    .max(TEXT_LIMITS.problem_desc, `Max ${TEXT_LIMITS.problem_desc} characters`)
    .optional().or(z.literal('')),
  admin_notes: z
    .string().trim()
    .max(TEXT_LIMITS.admin_notes, `Max ${TEXT_LIMITS.admin_notes} characters`)
    .optional().or(z.literal('')),
  assigned_tech: z.string().uuid('Choose a technician').optional().or(z.literal('')),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;

/**
 * The "Leave unassigned" option needs a non-empty value for the Select
 * component, so it round-trips through the form as a sentinel.
 */
export const UNASSIGNED = '__none__';

export const ORDER_FIELDS = [
  'cust_name', 'phone', 'address', 'service_type', 'quoted_price',
  'problem_desc', 'admin_notes', 'assigned_tech',
] as const;

/**
 * FormData -> schema input. Shared by the browser and the server action so the
 * two validation passes agree on the *mapping* as well as the rules. Duplicating
 * this mapping would be the obvious place for the two layers to silently drift.
 */
export function formDataToInput(fd: FormData): Record<string, string> {
  const raw = Object.fromEntries(
    ORDER_FIELDS.map((k) => [k, String(fd.get(k) ?? '')]),
  );
  if (raw.assigned_tech === UNASSIGNED) raw.assigned_tech = '';
  return raw;
}

/**
 * Shape returned to the form. On failure the submitted values come back too, so
 * a validation error does not wipe everything the admin typed — the inputs are
 * uncontrolled, so without this they reset to empty on every failed submit.
 */
export type FormState =
  | { ok: true; orderId: string }
  | {
      ok: false;
      errors: Record<string, string[]>;
      message?: string;
      values: Record<string, string>;
    }
  | null;
