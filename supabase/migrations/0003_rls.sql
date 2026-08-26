-- 0003_rls.sql — close the PostgREST door.
--
-- Supabase exposes every table in `public` over PostgREST, and grants the `anon`
-- role privileges on them by default. The anon key ships in the browser bundle
-- (NEXT_PUBLIC_), so without RLS anyone who views source can POST straight to
-- /rest/v1/orders and bypass every rule the application enforces.
--
-- RLS is enabled here with DELIBERATELY NO POLICIES. That is deny-all for anon
-- and authenticated. `service_role` bypasses RLS by design, so all data access
-- happens in Next.js server code holding SUPABASE_SERVICE_ROLE_KEY, which never
-- reaches the browser.
--
-- Why no policies keyed to the role switcher: there is no real auth, so
-- auth.uid() is null and any "role" a policy could read is client-supplied.
-- A policy the client can satisfy by lying is worse than no policy, because it
-- looks like protection in the dashboard.

alter table users   enable row level security;
alter table orders  enable row level security;
alter table actions enable row level security;

-- Defence in depth: even if a policy is added carelessly later, anon and
-- authenticated hold no table privileges to exercise it.
revoke all on users, orders, actions from anon, authenticated;
revoke all on sequence order_no_seq from anon, authenticated;

-- Verify (expect rowsecurity = true, and no rows from pg_policies):
--   select relname, relrowsecurity from pg_class
--    where relname in ('users','orders','actions');
--   select * from pg_policies where schemaname = 'public';
