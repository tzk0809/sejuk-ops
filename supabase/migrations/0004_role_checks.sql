-- 0004_role_checks.sql — authorization rules, enforced alongside the state machine.
--
-- Replaces actions_apply_transition() from 0002. Migrations are append-only, so
-- 0002 stays as written; this is the live version of the function.
--
-- Rules, from the spec's "Basic System Rules":
--   * only Admin can create orders and assign technicians
--   * only the ASSIGNED technician can start or complete a job
--     (not merely "a technician" — the spec is specific about this)
--   * only Managers may review, reject or close
--   * deactivated users cannot act at all
--
-- IMPORTANT, and this belongs in the README: with a mock role switcher there is
-- no real authentication, so this validates that the CLAIMED actor holds the
-- required role — not that the claim is genuine. It catches bugs, not attackers.
-- It becomes a real authorization boundary only once the actor comes from a
-- verified session.

create or replace function actions_apply_transition()
returns trigger language plpgsql as $$
declare
  cur_status   order_status;
  cur_tech     uuid;
  next_status  order_status;
  actor_role   user_role;
  actor_name   text;
  actor_active boolean;
  fail_reason  text;
begin
  -- FOR UPDATE locks the order row for this transaction, so two concurrent
  -- actions on the same order are serialised instead of racing.
  select status, assigned_tech into cur_status, cur_tech
    from orders where id = new.order_id
    for update;

  if not found then
    raise exception 'order % does not exist', new.order_id;
  end if;

  select role, name, is_active into actor_role, actor_name, actor_active
    from users where id = new.user_id;

  if not found then
    raise exception 'user % does not exist', new.user_id;
  end if;

  if not actor_active then
    raise exception 'not permitted: % is deactivated and cannot act on orders', actor_name;
  end if;

  ------------------------------------------------------- transition table
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

  --------------------------------------------------------- authorization
  fail_reason := case
    when new.action_type in ('created', 'assigned') and actor_role <> 'admin'
      then format('only an admin may %s an order; %s is a %s',
                  new.action_type, actor_name, actor_role)
    -- identity, not role: the technician must be the one this order is assigned to
    when new.action_type in ('started', 'completed')
         and new.user_id is distinct from cur_tech
      then format('only the assigned technician may %s this job; %s is not assigned to it',
                  new.action_type, actor_name)
    when new.action_type in ('reviewed', 'rejected', 'closed') and actor_role <> 'manager'
      then format('only a manager may %s an order; %s is a %s',
                  new.action_type, actor_name, actor_role)
    else null
  end;

  if fail_reason is not null then
    raise exception 'not permitted: %', fail_reason;
  end if;

  ---------------------------------------------------------------- apply
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
