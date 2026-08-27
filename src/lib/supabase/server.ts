import 'server-only';
import { createClient } from '@supabase/supabase-js';

// The ONLY Supabase client in this app, and it is server-only.
//
// 0003_rls.sql enables RLS on every table with no policies, so the anon key can
// read and write nothing. All access runs here with the service_role key, which
// bypasses RLS and never reaches the browser.
//
// `import 'server-only'` makes that a build error rather than a convention: if a
// 'use client' file ever imports this module, the build fails and names the
// violation. Note what it does NOT do: Next.js already refuses to inline env vars
// without a NEXT_PUBLIC_ prefix into client bundles, so the key would arrive as
// `undefined` rather than leaking. The value here is turning a mystery runtime
// crash into a clear build-time error, and guarding secrets that are not env
// vars at all.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Copy them from Supabase > Project Settings > API Keys into .env.local.',
  );
}

export const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
