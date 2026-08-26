-- state_machine_test.sql — verifies the order state machine and schema constraints.
--
-- Run in the Supabase SQL Editor. Everything happens inside a transaction that
-- is rolled back, so the script leaves no data behind and can be re-run freely.
--
-- Reading the output: every row should have ok = true. Any false row names the
-- step that failed and what actually happened.

begin;

create temp table _results (step int, name text, ok boolean, detail text)
  on commit drop;

do $$
declare
  admin_id uuid;
  tech_id  uuid;
  mgr_id   uuid;
  tech2_id uuid;
  o        uuid;
  o2       uuid;
  st       order_status;
  cat      timestamptz;
  fs       order_status;
  ts_      order_status;
  fa       numeric;
  n        int;
  ok       boolean;
  detail   text;
begin
  ---------------------------------------------------------------- setup
  insert into users (name, role) values ('Test Admin', 'admin')      returning id into admin_id;
  insert into users (name, role) values ('Test Tech',  'technician') returning id into tech_id;
  insert into users (name, role) values ('Test Mgr',   'manager')    returning id into mgr_id;

  insert into orders (cust_name, phone, address, service_type, quoted_price)
  values ('Test Customer', '60100000000', 'Test Address', 'cleaning', 250.00)
  returning id, status, final_amount into o, st, fa;

  -- 1: a new order defaults to 'new'
  insert into _results values (1, 'new order defaults to status new',
    st = 'new', format('got %s', st));

  -- 2: final_amount generated with extra_charges still null
  insert into _results values (2, 'final_amount = quoted when no extras',
    fa = 250.00, format('got %s', fa));

  ---------------------------------------------- illegal: skip to reviewed
  begin
    insert into actions (order_id, user_id, action_type) values (o, mgr_id, 'reviewed');
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (3, 'cannot review an order in status new', ok, detail);

  ------------------------------------------------------ legal: assigned
  update orders set assigned_tech = tech_id where id = o;
  insert into actions (order_id, user_id, action_type) values (o, admin_id, 'assigned');
  select status into st from orders where id = o;
  select from_status, to_status into fs, ts_
    from actions where order_id = o and action_type = 'assigned';
  insert into _results values (4, 'assigned: new -> assigned',
    st = 'assigned', format('got %s', st));
  insert into _results values (5, 'trigger stamped from_status/to_status on the audit row',
    fs = 'new' and ts_ = 'assigned', format('got %s -> %s', fs, ts_));

  ------------------------- illegal: complete without starting (strict rule)
  begin
    insert into actions (order_id, user_id, action_type) values (o, tech_id, 'completed');
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (6, 'cannot complete an order that was never started', ok, detail);

  --------------------------------------------- legal: started, completed
  insert into actions (order_id, user_id, action_type) values (o, tech_id, 'started');
  select status into st from orders where id = o;
  insert into _results values (7, 'started: assigned -> in_progress',
    st = 'in_progress', format('got %s', st));

  update orders set work_done = 'Serviced unit', extra_charges = 80.00 where id = o;
  insert into actions (order_id, user_id, action_type) values (o, tech_id, 'completed');
  select status, completed_at, final_amount into st, cat, fa from orders where id = o;
  insert into _results values (8, 'completed: in_progress -> job_done',
    st = 'job_done', format('got %s', st));
  insert into _results values (9, 'completed_at set in the same statement as status',
    cat is not null, format('got %s', cat));
  insert into _results values (10, 'final_amount recomputed after extra_charges (250 + 80)',
    fa = 330.00, format('got %s', fa));

  ------------------------------------- illegal: direct status write (UPDATE)
  begin
    update orders set status = 'closed' where id = o;
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (11, 'orders.status cannot be written directly', ok, detail);

  ------------------------------------------------------ legal: rejected
  insert into actions (order_id, user_id, action_type, note)
  values (o, mgr_id, 'rejected', 'Photos unclear');
  select status, completed_at into st, cat from orders where id = o;
  insert into _results values (12, 'rejected: job_done -> in_progress',
    st = 'in_progress', format('got %s', st));
  insert into _results values (13, 'completed_at cleared on rejection',
    cat is null, format('got %s', cat));

  --------------------------------------------- legal: re-complete, review, close
  insert into actions (order_id, user_id, action_type) values (o, tech_id, 'completed');
  insert into actions (order_id, user_id, action_type) values (o, mgr_id,  'reviewed');
  select status into st from orders where id = o;
  insert into _results values (14, 'reviewed: job_done -> reviewed',
    st = 'reviewed', format('got %s', st));

  insert into actions (order_id, user_id, action_type) values (o, mgr_id, 'closed');
  select status into st from orders where id = o;
  insert into _results values (15, 'closed: reviewed -> closed',
    st = 'closed', format('got %s', st));

  select count(*) into n from actions where order_id = o;
  insert into _results values (16, 'audit trail accumulated one row per action',
    n = 7, format('got %s rows', n));

  ------------------------------------------------ constraint: <= 6 files
  begin
    update orders set order_docs = (
      select jsonb_agg(jsonb_build_object('url', 'u' || i, 'name', 'f' || i,
                                          'type', 'image/jpeg', 'size', 1))
      from generate_series(1, 7) i)
    where id = o;
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (17, 'order_docs rejects a 7th file', ok, detail);

  ------------------------------------------------ enum rejects bad value
  begin
    execute format(
      'insert into actions (order_id, user_id, action_type) values (%L, %L, %L)',
      o, admin_id, 'cancelled');
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (18, 'action_type enum rejects an unknown value', ok, detail);

  --------------------------------------- on delete restrict protects history
  begin
    delete from users where id = tech_id;
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (19, 'cannot hard-delete a technician with orders', ok, detail);

  ------------------------------------------- authorization (0004_role_checks)
  insert into users (name, role) values ('Test Tech 2', 'technician') returning id into tech2_id;

  insert into orders (cust_name, phone, address, service_type, quoted_price, assigned_tech)
  values ('Test Customer 2', '60100000001', 'Addr 2', 'repair', 100.00, tech_id)
  returning id into o2;

  -- 20: a technician cannot assign (admin only)
  begin
    insert into actions (order_id, user_id, action_type) values (o2, tech_id, 'assigned');
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (20, 'only an admin may assign', ok, detail);

  insert into actions (order_id, user_id, action_type) values (o2, admin_id, 'assigned');

  -- 21: a technician who is NOT the assigned one cannot start it
  begin
    insert into actions (order_id, user_id, action_type) values (o2, tech2_id, 'started');
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (21, 'only the ASSIGNED technician may start a job', ok, detail);

  insert into actions (order_id, user_id, action_type) values (o2, tech_id, 'started');
  insert into actions (order_id, user_id, action_type) values (o2, tech_id, 'completed');

  -- 22: an admin cannot review (manager only)
  begin
    insert into actions (order_id, user_id, action_type) values (o2, admin_id, 'reviewed');
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (22, 'only a manager may review', ok, detail);

  -- 23: a deactivated user cannot act, whatever their role
  update users set is_active = false where id = mgr_id;
  begin
    insert into actions (order_id, user_id, action_type) values (o2, mgr_id, 'reviewed');
    -- Raising here rolls back this subtransaction, so a statement that WRONGLY
    -- succeeded leaves no side effect to corrupt the assertions that follow.
    raise exception 'ASSERT_FAIL: expected an exception, none was raised';
  exception when others then
    if sqlerrm like 'ASSERT_FAIL:%' then
      ok := false; detail := 'no exception raised - the rule did not fire';
    else
      ok := true; detail := sqlerrm;
    end if;
  end;
  insert into _results values (23, 'a deactivated user cannot act', ok, detail);

  -- 24: reactivating restores the ability, proving 23 failed for the right reason
  update users set is_active = true where id = mgr_id;
  insert into actions (order_id, user_id, action_type) values (o2, mgr_id, 'reviewed');
  select status into st from orders where id = o2;
  insert into _results values (24, 'reactivated manager may review', st = 'reviewed',
    format('got %s', st));
end $$;

select step, name, ok, detail from _results order by step;

rollback;
