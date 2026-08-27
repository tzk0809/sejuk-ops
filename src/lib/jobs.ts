import 'server-only';
import { db } from '@/lib/supabase/server';
import type { OrderWithTech, User } from '@/lib/types';

const SELECT = '*, technician:users!orders_assigned_tech_fkey(id, name)';

/**
 * A technician's open work: everything assigned to them that is not finished.
 *
 * Not "today's jobs" — the schema records when an order was created and when it
 * was completed, but never when it is *meant* to happen. There is no scheduled
 * date, so a day-based view is not a query this data model can answer. The spec
 * asks for "assigned jobs", and for a technician holding a handful of them the
 * open list is the day's work.
 *
 * Ordered in_progress first: the job someone is halfway through matters more
 * than one they have not started. Within each group, oldest first, so the queue
 * drains in the order it arrived.
 */
export async function listMyJobs(viewer: Pick<User, 'id'>): Promise<OrderWithTech[]> {
  const { data, error } = await db
    .from('orders')
    .select(SELECT)
    .eq('assigned_tech', viewer.id)
    .in('status', ['in_progress', 'assigned'])
    .order('status', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load jobs: ${error.message}`);
  return (data ?? []) as unknown as OrderWithTech[];
}

/**
 * One job, by id, scoped to the technician it belongs to.
 *
 * The scope is the guard: a technician editing the URL to another technician's
 * job id gets nothing back, and the page 404s. Relying on the list to hide it
 * would leave the detail route open.
 */
export async function getMyJob(
  viewer: Pick<User, 'id'>,
  id: string,
): Promise<OrderWithTech | null> {
  const { data, error } = await db
    .from('orders')
    .select(SELECT)
    .eq('id', id)
    .eq('assigned_tech', viewer.id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load job: ${error.message}`);
  return (data as unknown as OrderWithTech) ?? null;
}
