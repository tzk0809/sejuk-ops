'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/session';
import { BUCKET, MAX_FILES, rejectReason, storagePath } from '@/lib/uploads';
import { TEXT_LIMITS } from '@/lib/validation';
import type { OrderDoc } from '@/lib/types';

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Mark a job started. Inserts an `actions` row and lets the state machine move
 * the order — application code never writes `orders.status`.
 *
 * The checks here are for the message, not the enforcement. The trigger in 0004
 * already refuses a `started` action from anyone who is not the assigned
 * technician, and refuses it entirely unless the order is `assigned`. What this
 * adds is a sentence a person can read instead of a raw Postgres exception.
 */
export async function startJob(orderId: string): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: 'Your session has expired. Choose a user again.' };

  if (actor.role !== 'technician') {
    return { ok: false, message: 'Only the assigned technician can start a job.' };
  }

  const { error } = await db
    .from('actions')
    .insert({ order_id: orderId, user_id: actor.id, action_type: 'started' });

  if (error) {
    // Postgres messages from the trigger are already specific — e.g. "illegal
    // transition: cannot started an order in status in_progress" — so they are
    // surfaced rather than replaced with something vaguer.
    return { ok: false, message: error.message };
  }

  revalidatePath('/jobs');
  revalidatePath('/orders');
  return { ok: true };
}

/**
 * Mint a one-shot signed URL so the browser can PUT a file straight to Supabase
 * Storage, bypassing Vercel entirely.
 *
 * Only the token crosses to the client, never the service_role key, and the
 * token is scoped to a single path this function chose — the browser cannot
 * pick where the file lands, so it cannot write over another order's files.
 */
export async function createUploadUrl(
  orderId: string,
  file: { name: string; type: string; size: number },
): Promise<
  { ok: true; path: string; token: string; signedUrl: string } | { ok: false; message: string }
> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: 'Your session has expired. Choose a user again.' };

  // The picker checked this too. That check is UX; this one is the rule — a
  // direct call to this action never ran the picker.
  const reason = rejectReason(file);
  if (reason) return { ok: false, message: reason };

  // Only the assigned technician, and only while the job is in progress.
  const { data: order } = await db
    .from('orders')
    .select('id, status, assigned_tech, order_docs')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return { ok: false, message: 'Job not found.' };
  if (order.assigned_tech !== actor.id) {
    return { ok: false, message: 'Only the assigned technician can upload to this job.' };
  }
  if (order.status !== 'in_progress') {
    return { ok: false, message: `This job is ${order.status.replace('_', ' ')}; uploads are closed.` };
  }

  const existing = (order.order_docs as unknown[] | null)?.length ?? 0;
  if (existing >= MAX_FILES) {
    return { ok: false, message: `This job already has ${MAX_FILES} files.` };
  }

  const path = storagePath(orderId, file.name);
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    return { ok: false, message: error?.message ?? 'Could not prepare the upload.' };
  }
  return { ok: true, path, token: data.token, signedUrl: data.signedUrl };
}

/**
 * Record a finished upload against the order.
 *
 * Called after the browser's direct PUT succeeds. Appending per-file rather than
 * at submit means a technician who uploads five photos then loses signal keeps
 * them — otherwise the files sit orphaned in storage with nothing pointing at
 * them. The <= 6 CHECK on orders.order_docs (0001) is the backstop if two
 * uploads race.
 */
export async function confirmUpload(
  orderId: string,
  doc: OrderDoc,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: 'Your session has expired.' };

  const { data: order } = await db
    .from('orders')
    .select('order_docs, assigned_tech, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return { ok: false, message: 'Job not found.' };
  if (order.assigned_tech !== actor.id) {
    return { ok: false, message: 'Only the assigned technician can upload to this job.' };
  }

  const docs = [...((order.order_docs as OrderDoc[] | null) ?? []), doc];
  if (docs.length > MAX_FILES) {
    // Roll back the orphan we just created in storage.
    await db.storage.from(BUCKET).remove([doc.url]);
    return { ok: false, message: `This job already has ${MAX_FILES} files.` };
  }

  const { error } = await db.from('orders').update({ order_docs: docs }).eq('id', orderId);
  if (error) {
    await db.storage.from(BUCKET).remove([doc.url]);
    return { ok: false, message: error.message };
  }

  revalidatePath(`/jobs/${orderId}/complete`);
  return { ok: true };
}

/** Remove one attached file, from both the row and storage. */
export async function removeUpload(orderId: string, path: string): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: 'Your session has expired.' };

  const { data: order } = await db
    .from('orders')
    .select('order_docs, assigned_tech, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return { ok: false, message: 'Job not found.' };
  if (order.assigned_tech !== actor.id) {
    return { ok: false, message: 'Only the assigned technician can change this job.' };
  }
  if (order.status !== 'in_progress') {
    return { ok: false, message: 'This job is no longer editable.' };
  }

  const docs = ((order.order_docs as OrderDoc[] | null) ?? []).filter((d) => d.url !== path);
  const { error } = await db.from('orders').update({ order_docs: docs }).eq('id', orderId);
  if (error) return { ok: false, message: error.message };

  // Row first, storage second: a file left in the bucket is waste, but a row
  // pointing at a deleted file is a broken image on the manager's screen.
  await db.storage.from(BUCKET).remove([path]);

  revalidatePath(`/jobs/${orderId}/complete`);
  return { ok: true };
}

/** Finish the job. One RPC, one transaction — see 0007_complete_job.sql. */
export async function completeJob(
  orderId: string,
  fields: { work_done: string; tech_remarks: string; extra_charges: string },
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: 'Your session has expired.' };

  if (!fields.work_done.trim()) {
    return { ok: false, message: 'Describe the work done before completing the job.' };
  }

  if (fields.work_done.length > TEXT_LIMITS.work_done) {
    return { ok: false, message: `Work done is limited to ${TEXT_LIMITS.work_done} characters.` };
  }
  if (fields.tech_remarks.length > TEXT_LIMITS.tech_remarks) {
    return { ok: false, message: `Remarks are limited to ${TEXT_LIMITS.tech_remarks} characters.` };
  }

  const extra = fields.extra_charges.trim();
  if (extra && !/^\d+(\.\d{1,2})?$/.test(extra)) {
    return { ok: false, message: 'Extra charges must be an amount, e.g. 80 or 80.50.' };
  }

  const { error } = await db.rpc('complete_job', {
    p_actor: actor.id,
    p_order_id: orderId,
    p_work_done: fields.work_done,
    p_tech_remarks: fields.tech_remarks || null,
    p_extra_charges: extra ? Number(extra) : null,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/jobs');
  revalidatePath('/orders');
  return { ok: true };
}
