import 'server-only';
import { db } from '@/lib/supabase/server';
import type { ActionWithUser } from '@/lib/types';

/**
 * The audit trail for one order. Rows are written by the state machine trigger,
 * never by application code, so this is a record of what actually happened
 * rather than what someone remembered to log.
 */
export async function listActions(orderId: string): Promise<ActionWithUser[]> {
  const { data, error } = await db
    .from('actions')
    .select('*, user:users(id, name, role)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw new Error(`Failed to load history: ${error.message}`);
  return (data ?? []) as unknown as ActionWithUser[];
}
