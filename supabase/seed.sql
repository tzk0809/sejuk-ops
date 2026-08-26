-- seed.sql -- 36 demo orders across 4 technicians over 14 days.
--
-- Orders are driven through the REAL state machine: every status change happens
-- by inserting an `actions` row with a role-correct actor, exactly as the app
-- will. Nothing writes orders.status directly. Two consequences:
--   * the audit trail is populated with ~100 real rows, so "key actions should
--     be traceable" is demonstrable rather than merely described
--   * if the trigger has a bug, the seed fails loudly instead of producing data
--     that could never have arisen through the UI
--
-- Timestamps are back-dated AFTER the chain runs (the trigger stamps now()).
-- That update touches only timestamps, never status, so the UPDATE guard in
-- 0002 does not fire.
--
-- Shaped so the spec's three example AI questions have interesting answers:
--   * Bala leads THIS week (6 completions vs 2-3) -> "who completed the most" has a winner
--   * 3 jobs completed today                      -> "how many completed today" is not zero
--   * completions split across both weeks          -> "last week" differs from "this week"
--
-- order_docs is left empty: real files arrive through Module 2's upload.
-- Re-runnable: wipes all data first.

begin;

delete from actions;
delete from orders;
delete from users;

insert into users (name, role, phone) values
  ('Aminah Rashid', 'admin',      '60122000001'),
  ('Kamal Hashim',  'manager',    '60122000002'),
  ('Ali',           'technician', '60123000001'),
  ('John',          'technician', '60123000002'),
  ('Bala',          'technician', '60123000003'),
  ('Yusoff',        'technician', '60123000004');

create temp table _seed (
  cust_name text, phone text, address text, service_type text,
  quoted_price numeric, extra_charges numeric, tech_name text,
  target text, days_ago int, problem text, work text
) on commit drop;

insert into _seed values
  ('Ahmad Faizal', '60122000000', 'No. 12, Jalan Sejuk, Shah Alam', 'cleaning', 90, 40, 'Ali', 'closed', 6, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed'),
  ('Tan Wei Ming', '60122000137', '23-A, Jalan SS15/4, Subang Jaya', 'servicing', 165, 0, 'Yusoff', 'closed', 6, 'Routine 6-month servicing for 2 units', 'Serviced 2 units, filters cleaned, gas pressure checked'),
  ('Siti Nurhaliza', '60122000274', 'Blok C, Pangsapuri Sri Indah, Cheras', 'repair', 255, 0, 'Bala', 'reviewed', 5, 'Unit not cooling, suspect compressor fault', 'Replaced faulty capacitor and contactor, tested cooling'),
  ('R. Kumaran', '60122000411', 'No. 8, Lorong Meranti, Petaling Jaya', 'gas_refill', 210, 120, 'John', 'reviewed', 5, 'Cooling weak, likely low refrigerant', 'Topped up R32 refrigerant, leak test passed'),
  ('Lim Chee Kong', '60122000548', '45, Jalan Damai, Ampang', 'installation', 630, 0, 'Bala', 'reviewed', 4, 'New 1.5HP unit installation, living room', 'Mounted indoor unit, ran piping, vacuum test and commissioning'),
  ('Nurul Aina', '60122000685', 'Unit 12-3, Menara Hartamas, Kuala Lumpur', 'cleaning', 95, 0, 'Ali', 'reviewed', 3, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed'),
  ('Mohd Hafiz', '60122000822', 'No. 3, Taman Bukit Emas, Kajang', 'servicing', 140, 85, 'Yusoff', 'reviewed', 3, 'Routine 6-month servicing for 2 units', 'Serviced 2 units, filters cleaned, gas pressure checked'),
  ('Chong Mei Ling', '60122000959', '78, Jalan Kenari, Puchong', 'repair', 440, 0, 'Bala', 'reviewed', 2, 'Unit not cooling, suspect compressor fault', 'Replaced faulty capacitor and contactor, tested cooling'),
  ('Suresh Pillai', '60122001096', 'No. 19, Jalan Mutiara, Klang', 'gas_refill', 215, 0, 'John', 'job_done', 2, 'Cooling weak, likely low refrigerant', 'Topped up R32 refrigerant, leak test passed'),
  ('Farah Adilah', '60122001233', 'Lot 5, Taman Perindustrian, Seri Kembangan', 'installation', 815, 60, 'Bala', 'job_done', 1, 'New 1.5HP unit installation, living room', 'Mounted indoor unit, ran piping, vacuum test and commissioning'),
  ('Wong Kar Wai', '60122001370', 'No. 12, Jalan Sejuk, Shah Alam', 'cleaning', 100, 0, 'John', 'job_done', 1, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed'),
  ('Zulkifli Rahman', '60122001507', '23-A, Jalan SS15/4, Subang Jaya', 'servicing', 185, 0, 'Bala', 'job_done', 0, 'Routine 6-month servicing for 2 units', 'Serviced 2 units, filters cleaned, gas pressure checked'),
  ('Priya Devi', '60122001644', 'Blok C, Pangsapuri Sri Indah, Cheras', 'repair', 355, 40, 'Bala', 'job_done', 0, 'Unit not cooling, suspect compressor fault', 'Replaced faulty capacitor and contactor, tested cooling'),
  ('Lee Sook Yee', '60122001781', 'No. 8, Lorong Meranti, Petaling Jaya', 'gas_refill', 220, 0, 'Ali', 'job_done', 0, 'Cooling weak, likely low refrigerant', 'Topped up R32 refrigerant, leak test passed'),
  ('Amirul Hakim', '60122001918', '45, Jalan Damai, Ampang', 'installation', 580, 0, 'Ali', 'closed', 8, 'New 1.5HP unit installation, living room', 'Mounted indoor unit, ran piping, vacuum test and commissioning'),
  ('Goh Boon Huat', '60122002055', 'Unit 12-3, Menara Hartamas, Kuala Lumpur', 'cleaning', 105, 120, 'Ali', 'closed', 10, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed'),
  ('Kavitha Raj', '60122002192', 'No. 3, Taman Bukit Emas, Kajang', 'servicing', 160, 0, 'Ali', 'closed', 12, 'Routine 6-month servicing for 2 units', 'Serviced 2 units, filters cleaned, gas pressure checked'),
  ('Norazlina Yusof', '60122002329', '78, Jalan Kenari, Puchong', 'repair', 270, 0, 'John', 'closed', 9, 'Unit not cooling, suspect compressor fault', 'Replaced faulty capacitor and contactor, tested cooling'),
  ('Teoh Ai Wen', '60122002466', 'No. 19, Jalan Mutiara, Klang', 'gas_refill', 225, 85, 'John', 'closed', 13, 'Cooling weak, likely low refrigerant', 'Topped up R32 refrigerant, leak test passed'),
  ('Ibrahim Salleh', '60122002603', 'Lot 5, Taman Perindustrian, Seri Kembangan', 'installation', 765, 0, 'Bala', 'closed', 8, 'New 1.5HP unit installation, living room', 'Mounted indoor unit, ran piping, vacuum test and commissioning'),
  ('Vimala Krishnan', '60122002740', 'No. 12, Jalan Sejuk, Shah Alam', 'cleaning', 110, 0, 'Bala', 'closed', 11, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed'),
  ('Choo Kok Leong', '60122002877', '23-A, Jalan SS15/4, Subang Jaya', 'servicing', 135, 60, 'Yusoff', 'closed', 9, 'Routine 6-month servicing for 2 units', 'Serviced 2 units, filters cleaned, gas pressure checked'),
  ('Hasnah Ismail', '60122003014', 'Blok C, Pangsapuri Sri Indah, Cheras', 'repair', 185, 0, 'Yusoff', 'closed', 11, 'Unit not cooling, suspect compressor fault', 'Replaced faulty capacitor and contactor, tested cooling'),
  ('Danial Iskandar', '60122003151', 'No. 8, Lorong Meranti, Petaling Jaya', 'gas_refill', 230, 0, 'Yusoff', 'closed', 13, 'Cooling weak, likely low refrigerant', 'Topped up R32 refrigerant, leak test passed'),
  ('Yap Hui Shan', '60122003288', '45, Jalan Damai, Ampang', 'installation', 530, 0, 'Ali', 'in_progress', 0, 'New 1.5HP unit installation, living room', 'Mounted indoor unit, ran piping, vacuum test and commissioning'),
  ('Sanjay Menon', '60122003425', 'Unit 12-3, Menara Hartamas, Kuala Lumpur', 'cleaning', 115, 0, 'John', 'in_progress', 1, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed'),
  ('Rohaya Kamarudin', '60122003562', 'No. 3, Taman Bukit Emas, Kajang', 'servicing', 180, 0, 'Bala', 'in_progress', 0, 'Routine 6-month servicing for 2 units', 'Serviced 2 units, filters cleaned, gas pressure checked'),
  ('Ong Chin Hock', '60122003699', '78, Jalan Kenari, Puchong', 'repair', 370, 0, 'Yusoff', 'in_progress', 1, 'Unit not cooling, suspect compressor fault', 'Replaced faulty capacitor and contactor, tested cooling'),
  ('Devi Anandan', '60122003836', 'No. 19, Jalan Mutiara, Klang', 'gas_refill', 235, 0, 'Ali', 'assigned', 1, 'Cooling weak, likely low refrigerant', 'Topped up R32 refrigerant, leak test passed'),
  ('Faridah Omar', '60122003973', 'Lot 5, Taman Perindustrian, Seri Kembangan', 'installation', 715, 0, 'John', 'assigned', 2, 'New 1.5HP unit installation, living room', 'Mounted indoor unit, ran piping, vacuum test and commissioning'),
  ('Cheong Wai Kit', '60122004110', 'No. 12, Jalan Sejuk, Shah Alam', 'cleaning', 120, 0, 'Bala', 'assigned', 0, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed'),
  ('Nadia Sofea', '60122004247', '23-A, Jalan SS15/4, Subang Jaya', 'servicing', 155, 0, 'Yusoff', 'assigned', 2, 'Routine 6-month servicing for 2 units', 'Serviced 2 units, filters cleaned, gas pressure checked'),
  ('Rajesh Nair', '60122004384', 'Blok C, Pangsapuri Sri Indah, Cheras', 'repair', 285, 0, 'Ali', 'assigned', 3, 'Unit not cooling, suspect compressor fault', 'Replaced faulty capacitor and contactor, tested cooling'),
  ('Low Jia Hui', '60122004521', 'No. 8, Lorong Meranti, Petaling Jaya', 'gas_refill', 240, 0, null, 'new', 0, 'Cooling weak, likely low refrigerant', 'Topped up R32 refrigerant, leak test passed'),
  ('Syafiq Zainal', '60122004658', '45, Jalan Damai, Ampang', 'installation', 900, 0, null, 'new', 1, 'New 1.5HP unit installation, living room', 'Mounted indoor unit, ran piping, vacuum test and commissioning'),
  ('Angeline Tan', '60122004795', 'Unit 12-3, Menara Hartamas, Kuala Lumpur', 'cleaning', 125, 0, null, 'new', 2, 'Aircond blowing weak, needs full cleaning', 'Chemical wash on indoor and outdoor unit, drain line flushed');

do $$
declare
  admin_id uuid; mgr_id uuid; o uuid; tech uuid;
  r record; created_ts timestamptz; done_ts timestamptz;
begin
  select id into admin_id from users where role = 'admin'   limit 1;
  select id into mgr_id   from users where role = 'manager' limit 1;

  for r in select * from _seed loop
    tech := null;
    if r.tech_name is not null then
      select id into tech from users where name = r.tech_name;
    end if;

    created_ts := now() - make_interval(days => r.days_ago + 1);
    done_ts    := now() - make_interval(days => r.days_ago, hours => 3);

    insert into orders (cust_name, phone, address, problem_desc, service_type,
                        quoted_price, admin_notes)
    values (r.cust_name, r.phone, r.address, r.problem, r.service_type,
            r.quoted_price, 'Customer contacted by phone.')
    returning id into o;

    insert into actions (order_id, user_id, action_type) values (o, admin_id, 'created');

    if r.target <> 'new' then
      update orders set assigned_tech = tech where id = o;
      insert into actions (order_id, user_id, action_type) values (o, admin_id, 'assigned');
    end if;

    if r.target in ('in_progress', 'job_done', 'reviewed', 'closed') then
      insert into actions (order_id, user_id, action_type) values (o, tech, 'started');
    end if;

    if r.target in ('job_done', 'reviewed', 'closed') then
      update orders
         set work_done     = r.work,
             extra_charges = nullif(r.extra_charges, 0),
             tech_remarks  = case when r.extra_charges > 0
                                  then 'Additional parts required, customer informed.'
                                  else 'Customer satisfied, unit tested before leaving.' end
       where id = o;
      insert into actions (order_id, user_id, action_type) values (o, tech, 'completed');
    end if;

    if r.target in ('reviewed', 'closed') then
      insert into actions (order_id, user_id, action_type) values (o, mgr_id, 'reviewed');
    end if;

    if r.target = 'closed' then
      insert into actions (order_id, user_id, action_type) values (o, mgr_id, 'closed');
      update orders set amount_paid = final_amount where id = o;
    end if;

    -- back-date: timestamps only, status untouched, so the UPDATE guard stays quiet
    update orders
       set created_at   = created_ts,
           completed_at = case when completed_at is not null then done_ts else null end
     where id = o;

    update actions set created_at = created_ts + interval '30 minutes'
     where order_id = o and action_type in ('created', 'assigned');
    update actions set created_at = done_ts - interval '2 hours'
     where order_id = o and action_type = 'started';
    update actions set created_at = done_ts
     where order_id = o and action_type = 'completed';
    update actions set created_at = done_ts + interval '1 day'
     where order_id = o and action_type = 'reviewed';
    update actions set created_at = done_ts + interval '2 days'
     where order_id = o and action_type = 'closed';
  end loop;
end $$;

commit;

-- verification
select status, count(*) from orders group by status order by status;

select u.name as technician,
       count(*) filter (where o.completed_at >= date_trunc('week', now()))       as this_week,
       count(*) filter (where o.completed_at >= now() - interval '14 days'
                          and o.completed_at <  date_trunc('week', now()))       as earlier,
       count(*) filter (where o.completed_at::date = current_date)               as today
  from orders o join users u on u.id = o.assigned_tech
 where o.completed_at is not null
 group by u.name order by this_week desc;

select count(*) as audit_rows from actions;
