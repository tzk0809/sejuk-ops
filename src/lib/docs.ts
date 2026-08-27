import 'server-only';
import { db } from '@/lib/supabase/server';
import { BUCKET } from '@/lib/uploads';
import type { OrderDoc } from '@/lib/types';

export type SignedDoc = OrderDoc & { signedUrl: string | null };

/** One hour: long enough to read a page and open a file, short enough that a
 *  copied URL is not a permanent public link to a customer's home. */
const EXPIRES_IN = 60 * 60;

/**
 * Attach a short-lived read URL to each uploaded file.
 *
 * The bucket is private (0006) with no storage policies, so nothing is readable
 * by URL alone. Signing happens here, on the server, with the service_role key —
 * the browser receives a time-limited link to one specific object and never a
 * credential that would let it list or fetch anything else.
 *
 * A file whose signing fails comes back with `signedUrl: null` rather than
 * throwing, so one missing object cannot blank out the whole review page.
 */
export async function signDocs(docs: OrderDoc[] | null): Promise<SignedDoc[]> {
  if (!docs || docs.length === 0) return [];

  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrls(docs.map((d) => d.url), EXPIRES_IN);

  if (error || !data) return docs.map((d) => ({ ...d, signedUrl: null }));

  const byPath = new Map(data.map((r) => [r.path, r.signedUrl]));
  return docs.map((d) => ({ ...d, signedUrl: byPath.get(d.url) ?? null }));
}
