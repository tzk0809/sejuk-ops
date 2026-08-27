'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/session';
import { createOrderSchema, formDataToInput, type FormState } from '@/lib/validation';

/**
 * Create an order. Validation runs here on the server as well as in the browser:
 * the client-side pass is UX (immediate feedback), this one is correctness. A
 * form submitted with JS disabled, a replayed request, or a direct POST all
 * arrive here, and none of them ran the browser checks.
 */
export async function createOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await getCurrentUser();
  if (!actor) {
    return {
      ok: false,
      errors: {},
      message: 'Your session has expired. Choose a user again to continue.',
      values: formDataToInput(formData),
    };
  }

  // Same mapping the browser used, from the same module.
  const raw = formDataToInput(formData);

  // Only Admin can create orders. The database enforces this too (0004), but
  // catching it here turns a Postgres exception into a message a human can read.
  if (actor.role !== 'admin') {
    return {
      ok: false,
      errors: {},
      message: `Only an admin can create orders. You are acting as ${actor.name} (${actor.role}).`,
      values: raw,
    };
  }

  const parsed = createOrderSchema.safeParse(raw);

  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, errors: flat.fieldErrors as Record<string, string[]>, values: raw };
  }

  const v = parsed.data;

  // One RPC, four writes, one transaction. See 0005_create_order.sql.
  const { data, error } = await db.rpc('create_order', {
    p_actor: actor.id,
    p_cust_name: v.cust_name,
    p_phone: v.phone,
    p_address: v.address,
    p_service_type: v.service_type,
    p_quoted_price: Number(v.quoted_price),
    p_problem_desc: v.problem_desc || null,
    p_admin_notes: v.admin_notes || null,
    p_assigned_tech: v.assigned_tech || null,
  });

  if (error || !data) {
    return {
      ok: false,
      errors: {},
      message: error?.message ?? 'Could not create the order.',
      values: raw,
    };
  }

  revalidatePath('/orders');
  // redirect() throws, so it must sit outside any try/catch above.
  redirect(`/orders/${(data as { id: string }).id}?created=1`);
}
