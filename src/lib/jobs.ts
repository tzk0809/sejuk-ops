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

/**
 * How far back the technician's completed list reaches, and how many rows it
 * shows. Both are judgement calls with a cost at each end: too short and the
 * WhatsApp link expires before anyone chases an un-notified customer, too long
 * and the field view quietly turns into a history page. A week covers a weekend
 * plus slack.
 */
export const RECENT_DAYS = 7;
const RECENT_LIMIT = 10;

/**
 * What this technician finished recently.
 *
 * Keyed on `completed_at`, NOT on `status = 'job_done'`. Status looks like the
 * obvious filter and is the wrong one: the moment a manager approves the job it
 * becomes `reviewed`, the row would leave this list, and the customer
 * notification link would vanish with it — for a reason that has nothing to do
 * with whether the customer was ever told. A prompt manager would destroy the
 * link within minutes.
 *
 * Keying on the timestamp also composes with the state machine for free. The
 * trigger clears `completed_at` on `rejected`, and a NULL fails this comparison,
 * so a bounced job drops out of here and reappears in listMyJobs with no
 * special-casing anywhere.
 *
 * `closed` is the one status excluded, and it is a deliberate exception to the
 * rule above rather than a hole in it. `reviewed` lands minutes after completion,
 * by someone else, while a notification may genuinely still be pending — that is
 * the case this list exists to survive. `closed` is terminal: it is reached after
 * review, two people have handled the order, and it has left the workflow. A
 * technician's phone is the smallest screen in the system, and a card offering an
 * action on a finished order is noise under a heading that implies otherwise.
 *
 * The cost, honestly: this reintroduces a status dependency, so a customer who
 * rings two days after closure saying nobody told them leaves the technician with
 * no link — someone else's action removed it, which is the failure mode the
 * timestamp keying exists to prevent. Accepted because closure means the order
 * has already passed two people, so a missing notification surfaces through the
 * business rather than through this card.
 *
 * Separate from listMyJobs rather than widening it: the two lists answer
 * different questions and want opposite orderings — open work is oldest-first so
 * the queue drains in order, finished work is newest-first so what you just did
 * is on top. One query serving both needs a sort that is wrong for one of them.
 */
export async function listRecentlyCompleted(
  viewer: Pick<User, 'id'>,
): Promise<OrderWithTech[]> {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();

  const { data, error } = await db
    .from('orders')
    .select(SELECT)
    .eq('assigned_tech', viewer.id)
    .gte('completed_at', since)
    .neq('status', 'closed')
    .order('completed_at', { ascending: false })
    .limit(RECENT_LIMIT);

  if (error) throw new Error(`Failed to load completed jobs: ${error.message}`);
  return (data ?? []) as unknown as OrderWithTech[];
}
