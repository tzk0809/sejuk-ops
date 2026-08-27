-- 0005_create_order.sql — atomic order creation.
--
-- Creating an assigned order is four writes: insert the order, log `created`,
-- set assigned_tech, log `assigned`. supabase-js cannot wrap those in a
-- transaction, so a failure on the fourth would leave an order with a technician
-- attached but status still 'new' — a state the state machine says cannot exist.
--
-- A Postgres function runs inside a single implicit transaction: any raise rolls
-- back all four. The route handler makes one RPC call and gets back the finished
-- order, including the generated order_no.

create or replace function create_order(
  p_actor         uuid,
  p_cust_name     text,
  p_phone         text,
  p_address       text,
  p_service_type  text,
  p_quoted_price  numeric,
  p_problem_desc  text default null,
  p_admin_notes   text default null,
  p_assigned_tech uuid default null
)
returns orders
language plpgsql
as $$
declare
  o          orders;
  tech_role  user_role;
  tech_ok    boolean;
begin
  -- The trigger checks that the ACTOR may assign; it does not check that the
  -- TARGET is a technician. Without this, an order could be assigned to a
  -- manager and the state machine would happily accept it.
  if p_assigned_tech is not null then
    select role, is_active into tech_role, tech_ok
      from users where id = p_assigned_tech;
    if not found then
      raise exception 'assigned user % does not exist', p_assigned_tech;
    end if;
    if tech_role <> 'technician' then
      raise exception 'orders may only be assigned to a technician (% is a %)',
        p_assigned_tech, tech_role;
    end if;
    if not tech_ok then
      raise exception 'cannot assign to a deactivated technician';
    end if;
  end if;

  insert into orders (cust_name, phone, address, problem_desc,
                      service_type, quoted_price, admin_notes)
  values (btrim(p_cust_name), btrim(p_phone), btrim(p_address),
          nullif(btrim(coalesce(p_problem_desc, '')), ''),
          p_service_type, p_quoted_price,
          nullif(btrim(coalesce(p_admin_notes, '')), ''))
  returning * into o;

  insert into actions (order_id, user_id, action_type)
  values (o.id, p_actor, 'created');

  if p_assigned_tech is not null then
    update orders set assigned_tech = p_assigned_tech where id = o.id;
    insert into actions (order_id, user_id, action_type)
    values (o.id, p_actor, 'assigned');
    select * into o from orders where id = o.id;
  end if;

  return o;
end $$;
