-- 0002_status_trigger.sql — the order state machine, enforced in the database.
--
-- Design: application code NEVER writes orders.status. It inserts a row into
-- `actions`. A trigger validates the transition and applies it. Consequences:
--   * one write path, so status and completed_at cannot drift apart
--   * illegal transitions raise, rather than silently corrupting state
--   * the audit trail is a byproduct of the mechanism, not something a
--     developer has to remember to log

-- ------------------------------------------------- guard: no direct writes
-- orders.status may only change from inside actions_apply_transition(), which
-- sets a transaction-local flag first. Anything else raises.
create or replace function orders_block_direct_status_write()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.status_write', true), 'off') <> 'on'
  then
    raise exception
      'orders.status is not directly writable (attempted % -> %). Insert an actions row instead.',
      old.status, new.status;
  end if;
  return new;
end $$;

create trigger orders_block_direct_status_write_trg
  before update on orders
  for each row execute function orders_block_direct_status_write();

-- --------------------------------------------------- the transition table
create or replace function actions_apply_transition()
returns trigger language plpgsql as $$
declare
  cur_status  order_status;
  next_status order_status;
begin
  -- FOR UPDATE locks the order row for this transaction, so two concurrent
  -- actions on the same order are serialised instead of racing.
  select status into cur_status
    from orders where id = new.order_id
    for update;

  if not found then
    raise exception 'order % does not exist', new.order_id;
  end if;

  next_status := case
    -- logged at creation; records who created it, changes nothing
    when new.action_type = 'created'                                   then cur_status
    when new.action_type = 'assigned'  and cur_status = 'new'          then 'assigned'::order_status
    -- fired by an explicit "Start job" tap in the technician portal
    when new.action_type = 'started'   and cur_status = 'assigned'     then 'in_progress'::order_status
    -- only from in_progress: a job must be explicitly started before it can be
    -- completed, so in_progress is a real state rather than an optional one
    when new.action_type = 'completed' and cur_status = 'in_progress'  then 'job_done'::order_status
    when new.action_type = 'reviewed'  and cur_status = 'job_done'     then 'reviewed'::order_status
    when new.action_type = 'rejected'  and cur_status = 'job_done'     then 'in_progress'::order_status
    when new.action_type = 'closed'    and cur_status = 'reviewed'     then 'closed'::order_status
    else null::order_status
  end;

  if next_status is null then
    raise exception 'illegal transition: cannot % an order in status %',
      new.action_type, cur_status;
  end if;

  -- stamp the audit row with where it moved from and to
  new.from_status := cur_status;
  new.to_status   := next_status;

  perform set_config('app.status_write', 'on', true);

  update orders
     set status = next_status,
         -- set and cleared in the SAME statement that moves status, so the two
         -- can never disagree
         completed_at = case
           when new.action_type = 'completed' then now()
           when new.action_type = 'rejected'  then null
           else completed_at
         end
   where id = new.order_id;

  perform set_config('app.status_write', 'off', true);

  return new;
end $$;

create trigger actions_apply_transition_trg
  before insert on actions
  for each row execute function actions_apply_transition();
