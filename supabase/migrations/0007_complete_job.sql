-- 0007_complete_job.sql — atomic job completion.
--
-- Completing a job is two writes: save what the technician recorded, then log
-- the `completed` action that moves the state machine and stamps completed_at.
-- Split across two supabase-js calls, a failure between them leaves work_done
-- saved on a job still showing In Progress — the technician believes they
-- submitted, the manager never sees it in the review queue.
--
-- Same reasoning as create_order (0005): one function, one implicit transaction.
--
-- Files are NOT written here. They are appended to order_docs as each upload
-- lands, so a technician who uploads five photos and then loses signal keeps
-- the photos rather than orphaning them in storage.

create or replace function complete_job(
  p_actor         uuid,
  p_order_id      uuid,
  p_work_done     text,
  p_tech_remarks  text default null,
  p_extra_charges numeric default null
)
returns orders
language plpgsql
as $$
declare
  o orders;
begin
  if btrim(coalesce(p_work_done, '')) = '' then
    raise exception 'work done is required to complete a job';
  end if;

  if p_extra_charges is not null and p_extra_charges < 0 then
    raise exception 'extra charges cannot be negative';
  end if;

  update orders
     set work_done     = btrim(p_work_done),
         tech_remarks  = nullif(btrim(coalesce(p_tech_remarks, '')), ''),
         extra_charges = p_extra_charges
   where id = p_order_id
  returning * into o;

  if not found then
    raise exception 'order % does not exist', p_order_id;
  end if;

  -- The trigger validates the transition and that the actor is the assigned
  -- technician, then sets status and completed_at in one statement. If it
  -- raises, the update above is rolled back with it.
  insert into actions (order_id, user_id, action_type)
  values (p_order_id, p_actor, 'completed');

  select * into o from orders where id = p_order_id;
  return o;
end $$;
