import 'server-only';
import { db } from '@/lib/supabase/server';
import { resolveWindow, type ReportWindow } from '@/lib/time';
import type { ServiceType, User } from '@/lib/types';
import type { QueryIntent } from '@/lib/ai/intent';

/**
 * The complete set of database queries the AI module can run. Three functions,
 * all in this file, all parameterised — that finite, readable list is what the
 * spec means by "controlled queries", and why the assistant cannot be said to
 * have unrestricted access to the database.
 *
 * Two rules hold everywhere below.
 *
 * 1. PROJECTION IS PART OF THE CONTROL. Every select names its columns. The
 *    result of these functions is sent to Google, so `select('*')` would ship
 *    customer names, phone numbers and addresses to a third party as a side
 *    effect of a laziness. Nothing here can return a customer field, a payment
 *    field, an uploaded document, admin notes or technician remarks, because
 *    no query names them.
 *
 * 2. THE SERVER COUNTS; THE MODEL NARRATES. Every number in the final answer
 *    exists as a field on these results. Models are unreliable at arithmetic
 *    over lists and volunteer totals nobody asked for, so they are never asked
 *    to compute one.
 */

/** The only order columns the AI module may see. */
const JOB_FIELDS = 'order_no, service_type, completed_at';

/** Bound on rows handed to the model. A manager asking for a list wants to read
 *  it; anything longer is a report, not an answer. */
const LIST_LIMIT = 50;

export type JobRow = {
  order_no: string;
  service_type: ServiceType;
  completed_at: string;
};

export type QueryResult =
  | { kind: 'LIST_JOBS'; window: ReportWindow | null; technician: string | null;
      serviceType: ServiceType | null; count: number; truncated: boolean; jobs: JobRow[] }
  | { kind: 'COUNT_JOBS'; window: ReportWindow | null; technician: string | null;
      serviceType: ServiceType | null; count: number }
  | { kind: 'RANK_TECHNICIANS'; window: ReportWindow | null;
      ranking: { name: string; count: number }[] }
  | { kind: 'UNKNOWN_TECHNICIAN'; asked: string; known: string[] }
  | { kind: 'AMBIGUOUS_TECHNICIAN'; asked: string; matches: string[] };

/**
 * "Completed" is `completed_at is not null`, NOT `status = 'job_done'`.
 *
 * Status moves on for reasons that have nothing to do with whether the work was
 * done: the moment a manager reviews a job it becomes `reviewed`, then `closed`.
 * Filtering on `job_done` would answer "Ali completed 0 jobs last week" for a
 * week in which he completed three — because all three had since been closed.
 * Verified against the seed: the 17–23 Aug window holds 10 completions, 7
 * closed and 3 reviewed, and exactly 0 with status `job_done`.
 *
 * `completed_at` is also the column the state machine maintains. The trigger
 * writes it in the same statement as `status`, and clears it on rejection, so a
 * bounced job leaves these counts with no special-casing here. Same reasoning
 * as listRecentlyCompleted in lib/jobs.ts.
 */
const COMPLETED = 'completed_at';

/** ALL_TIME is a period but not a window, so it resolves to "no bounds". */
const windowFor = (intent: QueryIntent, now: Date): ReportWindow | null =>
  intent.dateRange === 'ALL_TIME' ? null : resolveWindow(intent.dateRange, now);

/**
 * A name as a human said it, to a row. Returns a structured miss rather than an
 * empty result set: "Ali completed 0 jobs" for a technician who does not exist
 * is a confident wrong answer, and those are worse than errors because nobody
 * checks them.
 *
 * Inactive technicians are deliberately included. Someone who has left the
 * company still completed the jobs they completed, and a question about last
 * month should not quietly lose their history.
 */
type TechLookup =
  | { match: Pick<User, 'id' | 'name'> }
  | { ambiguous: string[] }
  | { known: string[] };

async function resolveTechnician(name: string): Promise<TechLookup> {
  const { data, error } = await db
    .from('users')
    .select('id, name')
    .eq('role', 'technician')
    .ilike('name', name); // case-insensitive exact match first

  if (error) throw new Error(`Failed to resolve technician: ${error.message}`);
  if (data && data.length === 1) return { match: data[0] as Pick<User, 'id' | 'name'> };
  if (data && data.length > 1) {
    return { ambiguous: data.map((u) => u.name as string) };
  }

  // No exact match — try a contains search, so "Ali B" finds "Ali Bin Hassan".
  const { data: partial } = await db
    .from('users')
    .select('id, name')
    .eq('role', 'technician')
    .ilike('name', `%${name}%`);

  if (partial && partial.length === 1) return { match: partial[0] as Pick<User, 'id' | 'name'> };
  if (partial && partial.length > 1) {
    return { ambiguous: partial.map((u) => u.name as string) };
  }

  const { data: all } = await db
    .from('users')
    .select('name')
    .eq('role', 'technician')
    .eq('is_active', true)
    .order('name');

  return { known: (all ?? []).map((u) => u.name as string) };
}

// The three branches below apply the same predicate in the same order against
// the same COMPLETED column, so they cannot disagree about what they count.
// Deliberately repeated rather than extracted: Supabase's builder types are
// generic over the selected columns, and a helper that takes and returns one
// defeats inference outright (TS2589, "excessively deep"). Four duplicated
// lines are cheaper than casting the types away.

/**
 * Runs one intent. The single entry point from the route, so there is exactly
 * one place where a validated intent becomes a database call.
 *
 * `viewer` is checked here as well as in the route. The route's check is the
 * one that runs first; this one exists so that a future second call site cannot
 * skip it — the same argument as scoping getOrder as well as listOrders.
 */
export async function runQuery(
  intent: QueryIntent,
  viewer: Pick<User, 'id' | 'role'>,
  now: Date,
): Promise<QueryResult> {
  if (viewer.role !== 'manager') {
    throw new Error('The operations query window is available to managers only.');
  }

  const window = windowFor(intent, now);

  let techId: string | null = null;
  let techName: string | null = null;
  if (intent.technicianName) {
    const resolved = await resolveTechnician(intent.technicianName);
    if ('known' in resolved) {
      return { kind: 'UNKNOWN_TECHNICIAN', asked: intent.technicianName, known: resolved.known };
    }
    if ('ambiguous' in resolved) {
      return { kind: 'AMBIGUOUS_TECHNICIAN', asked: intent.technicianName, matches: resolved.ambiguous };
    }
    techId = resolved.match.id;
    techName = resolved.match.name;
  }

  switch (intent.operation) {
    case 'COUNT_JOBS': {
      // head: true asks Postgres for the count and returns no rows at all, so a
      // count question sends zero order data to the model.
      let q = db.from('orders')
        .select(JOB_FIELDS, { count: 'exact', head: true })
        .not(COMPLETED, 'is', null);
      if (window) q = q.gte(COMPLETED, window.from).lt(COMPLETED, window.to);
      if (intent.serviceType) q = q.eq('service_type', intent.serviceType);
      if (techId) q = q.eq('assigned_tech', techId);

      const { count, error } = await q;
      if (error) throw new Error(`Query failed: ${error.message}`);
      return {
        kind: 'COUNT_JOBS', window, technician: techName,
        serviceType: intent.serviceType ?? null, count: count ?? 0,
      };
    }

    case 'LIST_JOBS': {
      let q = db.from('orders')
        .select(JOB_FIELDS, { count: 'exact' })
        .not(COMPLETED, 'is', null);
      if (window) q = q.gte(COMPLETED, window.from).lt(COMPLETED, window.to);
      if (intent.serviceType) q = q.eq('service_type', intent.serviceType);
      if (techId) q = q.eq('assigned_tech', techId);

      const { data, count, error } = await q
        .order(COMPLETED, { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw new Error(`Query failed: ${error.message}`);

      const jobs = (data ?? []) as JobRow[];
      const total = count ?? jobs.length;
      return {
        kind: 'LIST_JOBS', window, technician: techName,
        serviceType: intent.serviceType ?? null,
        // The count is the TOTAL, not jobs.length — otherwise a truncated list
        // would make the sentence disagree with the table under it.
        count: total, truncated: total > jobs.length, jobs,
      };
    }

    case 'RANK_TECHNICIANS': {
      // PostgREST cannot GROUP BY, so the tally happens here. At this volume
      // that is cheaper than a migration for an RPC, and it keeps the counting
      // in TypeScript where the rest of the counting already is.
      let q = db.from('orders')
        .select('assigned_tech, technician:users!orders_assigned_tech_fkey(name)')
        .not(COMPLETED, 'is', null)
        .not('assigned_tech', 'is', null);
      if (window) q = q.gte(COMPLETED, window.from).lt(COMPLETED, window.to);
      if (intent.serviceType) q = q.eq('service_type', intent.serviceType);

      const { data, error } = await q;
      if (error) throw new Error(`Query failed: ${error.message}`);

      const tally = new Map<string, number>();
      for (const row of (data ?? []) as unknown as { technician: { name: string } | null }[]) {
        const name = row.technician?.name;
        if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
      }

      const ranking = [...tally.entries()]
        .map(([name, count]) => ({ name, count }))
        // Ties break alphabetically so the order is stable between identical
        // questions. A leaderboard that reshuffles on refresh looks broken.
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

      return { kind: 'RANK_TECHNICIANS', window, ranking };
    }
  }
}
