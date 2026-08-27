import 'server-only';
import { db } from '@/lib/supabase/server';
import type { OrderWithTech, OrderStatus, ServiceType, User } from '@/lib/types';

// The technician join. Named so PostgREST knows which FK to follow — orders has
// exactly one reference to users today, but naming it keeps the query correct if
// a second one is ever added.
const SELECT = '*, technician:users!orders_assigned_tech_fkey(id, name)';

export const SORTS = {
  newest: { column: 'created_at', ascending: false, label: 'Newest first' },
  oldest: { column: 'created_at', ascending: true, label: 'Oldest first' },
  price_high: { column: 'quoted_price', ascending: false, label: 'Highest quote' },
  price_low: { column: 'quoted_price', ascending: true, label: 'Lowest quote' },
  status: { column: 'status', ascending: true, label: 'Status' },
  service: { column: 'service_type', ascending: true, label: 'Service type' },
} as const;

export type SortKey = keyof typeof SORTS;
export const isSortKey = (v: string | undefined): v is SortKey => !!v && v in SORTS;

export type OrderFilters = {
  q?: string;
  status?: OrderStatus;
  service?: ServiceType;
  sort?: SortKey;
};

/**
 * Filtering, searching and sorting run in Postgres rather than the browser.
 * The browser never receives rows it will not display, the (assigned_tech,
 * completed_at) and status indexes from 0001 do the work, and because the
 * filters live in searchParams the resulting view is a shareable URL.
 *
 * `viewer` scopes the result to what that person is allowed to see. This is the
 * actual guard, not the UI: a technician who edits the URL, removes a filter, or
 * calls the page directly still gets only their own jobs, because the restriction
 * is applied to the query rather than to the rendering.
 */
export async function listOrders(
  viewer: Pick<User, 'id' | 'role'>,
  f: OrderFilters,
): Promise<OrderWithTech[]> {
  let query = db.from('orders').select(SELECT);

  // Technicians see only what is assigned to them. Admins and managers see all.
  if (viewer.role === 'technician') query = query.eq('assigned_tech', viewer.id);

  if (f.status) query = query.eq('status', f.status);
  if (f.service) query = query.eq('service_type', f.service);

  const term = f.q?.trim();
  if (term) {
    // Technician is on the joined table, so PostgREST cannot ILIKE it directly.
    // Resolve matching technicians to ids first, then include them in the OR.
    const { data: techs } = await db
      .from('users')
      .select('id')
      .eq('role', 'technician')
      .ilike('name', `%${term}%`);

    const escaped = term.replace(/[,()]/g, ' ');
    const clauses = [
      `cust_name.ilike.%${escaped}%`,
      `address.ilike.%${escaped}%`,
      `phone.ilike.%${escaped}%`,
      `order_no.ilike.%${escaped}%`,
    ];
    if (techs?.length) {
      clauses.push(`assigned_tech.in.(${techs.map((t) => t.id).join(',')})`);
    }
    query = query.or(clauses.join(','));
  }

  const sort = SORTS[f.sort ?? 'newest'];
  query = query.order(sort.column, { ascending: sort.ascending });

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return (data ?? []) as unknown as OrderWithTech[];
}

/**
 * One order, scoped the same way as the list. Without the viewer check a
 * technician could read any order by pasting its id into the URL — the list
 * filter would look like it was protecting the data while the detail page handed
 * it over. Scoping has to happen wherever rows are fetched, not once.
 */
export async function getOrder(
  viewer: Pick<User, 'id' | 'role'>,
  id: string,
): Promise<OrderWithTech | null> {
  let query = db.from('orders').select(SELECT).eq('id', id);
  if (viewer.role === 'technician') query = query.eq('assigned_tech', viewer.id);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load order: ${error.message}`);
  return (data as unknown as OrderWithTech) ?? null;
}

export async function listTechnicians() {
  const { data, error } = await db
    .from('users')
    .select('id, name')
    .eq('role', 'technician')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(`Failed to load technicians: ${error.message}`);
  return data;
}
