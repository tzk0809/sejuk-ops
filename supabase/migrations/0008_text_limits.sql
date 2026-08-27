-- 0008_text_limits.sql — bound the free-text columns.
--
-- Postgres `text` is unbounded. Without these, a single paste could store
-- megabytes in a column that every list query reads, and nothing at the data
-- layer would object. cust_name was capped at creation (0001); the rest were not.
--
-- The application enforces the same numbers (TEXT_LIMITS in lib/uploads.ts) so a
-- person gets a character counter and a readable message. These constraints are
-- the rule: a direct PostgREST call, a bad migration, or a future code path that
-- forgets to validate still cannot write past them.
--
-- Generous rather than tight. The point is to stop pathological input, not to
-- second-guess how much detail a technician needs to record.

alter table orders
  add constraint orders_work_done_len    check (length(work_done)    <= 5000),
  add constraint orders_tech_remarks_len check (length(tech_remarks) <= 2000),
  add constraint orders_problem_desc_len check (length(problem_desc) <= 2000),
  add constraint orders_admin_notes_len  check (length(admin_notes)  <= 2000);

-- Verify:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'orders'::regclass and conname like '%_len';
