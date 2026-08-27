// Types mirroring the Supabase schema (supabase/migrations/0001_init.sql).
//
// Hand-written rather than generated: `supabase gen types` needs the CLI logged
// in against the project, which is a detour on a two-day build. The trade-off is
// that these can drift from the schema — the migrations are the source of truth.

/**
 * "All statuses" as an explicit URL value. An ABSENT status parameter means the
 * visitor has just arrived and should get their role's default view, so the two
 * states must stay distinguishable.
 *
 * It lives here, not in the filter component, because a value exported from a
 * 'use client' module reaches a server component as a client reference rather
 * than the string itself.
 */
export const ALL_STATUSES = 'all';

export const ORDER_STATUS = [
  'new', 'assigned', 'in_progress', 'job_done', 'reviewed', 'closed',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const USER_ROLE = ['admin', 'technician', 'manager'] as const;
export type UserRole = (typeof USER_ROLE)[number];

export const ACTION_TYPE = [
  'created', 'assigned', 'started', 'completed', 'reviewed', 'rejected', 'closed',
] as const;
export type ActionType = (typeof ACTION_TYPE)[number];

export const SERVICE_TYPE = [
  'installation', 'cleaning', 'servicing', 'repair', 'gas_refill',
] as const;
export type ServiceType = (typeof SERVICE_TYPE)[number];

/** Human-facing labels. The enum values are the storage format; these are the UI. */
export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  installation: 'Installation',
  cleaning: 'Cleaning',
  servicing: 'Servicing',
  repair: 'Repair',
  gas_refill: 'Gas Refill',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  job_done: 'Job Done',
  reviewed: 'Reviewed',
  closed: 'Closed',
};

export type User = {
  id: string;
  name: string;
  role: UserRole;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

/** One uploaded file inside orders.order_docs (max 6, enforced by CHECK). */
export type OrderDoc = {
  url: string;
  name: string;
  type: string;
  size: number;
  uploaded_at: string;
};

export type Order = {
  id: string;
  order_no: string;
  cust_name: string;
  phone: string;
  address: string;
  problem_desc: string | null;
  service_type: ServiceType;
  quoted_price: string;
  assigned_tech: string | null;
  admin_notes: string | null;
  status: OrderStatus;
  work_done: string | null;
  tech_remarks: string | null;
  extra_charges: string | null;
  /** Generated column: quoted_price + extra_charges. Never written directly. */
  final_amount: string;
  completed_at: string | null;
  order_docs: OrderDoc[];
  amount_paid: string | null;
  payment_proof_url: string | null;
  created_at: string;
};

/** An order joined with its technician, as the list and detail pages read it. */
export type OrderWithTech = Order & {
  technician: Pick<User, 'id' | 'name'> | null;
};

export type Action = {
  id: number;
  order_id: string;
  user_id: string;
  action_type: ActionType;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  note: string | null;
  created_at: string;
};

export type ActionWithUser = Action & {
  user: Pick<User, 'id' | 'name' | 'role'> | null;
};
