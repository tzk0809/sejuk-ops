-- 0001_init.sql — Sejuk Sejuk Service, operations schema
-- Run in Supabase SQL Editor. Re-running requires a reset first:
--   drop table if exists actions, orders, users cascade;
--   drop type  if exists order_action_type, order_status, user_role;
--   drop sequence if exists order_no_seq;

-- ----------------------------------------------------------------- types
-- Native enums, not text + check, for the three value sets the application
-- branches on. The trigger in 0002 switches on status and action_type; a value
-- present in the database but absent from that CASE is a bug, so rigidity is
-- the point. Enums also give Supabase's type generator real TS union types
-- instead of `string`, so a typo like 'inprogress' fails at compile time.
create type user_role         as enum ('admin', 'technician', 'manager');
create type order_status      as enum ('new', 'assigned', 'in_progress',
                                       'job_done', 'reviewed', 'closed');
create type order_action_type as enum ('created', 'assigned', 'started',
                                       'completed', 'reviewed', 'rejected', 'closed');

-- ---------------------------------------------------------------- users
-- One row per person who can act in the system. No auth: rows are seeded and
-- the role switcher selects which row you currently are.
create table users (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  role        user_role   not null,
  phone       text,
  address     text,
  -- Soft delete. Technicians who leave are deactivated, never deleted, so their
  -- completed orders keep pointing at a real row.
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- orders
-- Human-readable order numbers come from a sequence. nextval() is atomic and
-- non-transactional: two concurrent inserts can never receive the same value.
-- (count(*)+1 can, which is why it is not used.) A rolled-back insert leaves a
-- gap in the numbering; gaps are acceptable, duplicates are not.
create sequence order_no_seq start 1001;

create table orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text        not null unique
                  default ('ORD-' || lpad(nextval('order_no_seq')::text, 5, '0')),

  -- Module 1: admin-entered
  cust_name     text        not null check (length(cust_name) <= 100),
  phone         text        not null,
  address       text        not null,
  problem_desc  text,
  -- Left as text + check deliberately: service types are business data, not
  -- application logic. In production this becomes a lookup table so ops can add
  -- a service line without a migration, and carry a display label, default
  -- price and is_active alongside it.
  service_type  text        not null check (service_type in
                  ('installation', 'cleaning', 'servicing', 'repair', 'gas_refill')),
  quoted_price  numeric(10,2) not null check (quoted_price >= 0),
  -- Nullable: an order may be created before anyone is free to take it.
  -- restrict, not set null / cascade: technicians are soft-deleted, so a hard
  -- delete that would orphan history should fail loudly instead.
  assigned_tech uuid        references users(id) on delete restrict,
  admin_notes   text,

  status        order_status not null default 'new',

  -- Module 2: technician-entered
  work_done     text,
  tech_remarks  text,
  extra_charges numeric(10,2) check (extra_charges >= 0),
  -- What the customer OWES. Generated: never set by hand, so it cannot disagree
  -- with its inputs. Stored, so the AI module can SUM() and index it.
  final_amount  numeric(10,2)
                  generated always as
                  (coalesce(quoted_price, 0) + coalesce(extra_charges, 0)) stored,
  completed_at  timestamptz,

  -- Up to 6 mixed files. Elements: {url, name, type, size, uploaded_at}.
  -- The UI also caps this at 6 (that is UX); this CHECK is correctness — a bug,
  -- a retry, or a direct API call cannot write a 7th.
  order_docs    jsonb       not null default '[]'::jsonb
                  check (jsonb_typeof(order_docs) = 'array'
                         and jsonb_array_length(order_docs) <= 6),

  -- Payment (spec bonus, recorded but not processed)
  amount_paid       numeric(10,2) check (amount_paid is null or final_amount is null or amount_paid <= final_amount),
  payment_proof_url text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -------------------------------------------------------------- actions
-- Audit trail: "key actions should be traceable".
create table actions (
  id          bigint generated always as identity primary key,
  order_id    uuid              not null references orders(id) on delete restrict,
  user_id     uuid              not null references users(id)  on delete restrict,
  action_type order_action_type not null,
  -- Stamped by the trigger in 0002, never by the application.
  from_status order_status,
  to_status   order_status,
  note        text,
  created_at  timestamptz       not null default now()
);

-- -------------------------------------------------------------- indexes
-- Shaped by the three AI questions the spec names:
--   "jobs technician Ali completed last week"       -> (assigned_tech, completed_at)
--   "which technician completed the most this week" -> same
--   "how many jobs completed today"                 -> completed_at
create index orders_tech_completed_idx on orders (assigned_tech, completed_at);
create index orders_completed_at_idx   on orders (completed_at);
create index orders_status_idx         on orders (status);
create index actions_order_idx         on actions (order_id, created_at);
