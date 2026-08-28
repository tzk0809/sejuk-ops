'use client';

import { useEffect, useState } from 'react';
import { NotifyCustomer } from '@/components/notify-customer';
import type { OrderWithTech } from '@/lib/types';

/**
 * The confirmation shown once, immediately after a job is submitted.
 *
 * It is driven by `?completed=<order_no>`, and a URL is durable in a way the
 * moment it describes is not. Left alone the parameter survives a refresh, the
 * back button, and a bookmark, so days later the app would still be announcing a
 * completion as if it had just happened. The parameter is therefore consumed:
 * rendered once, then stripped from the address bar.
 *
 * Opening WhatsApp dismisses it for the same reason. The link carries
 * target="_blank", so the page never navigates and never re-renders — without
 * this the banner would still be saying "notify them now" when the technician
 * switched back from the message they had just written.
 *
 * Dismissing is not a claim that anything was sent. Nothing is recorded, here or
 * on the server; this is one screen forgetting a prompt it has already given. The
 * job stays in Recently completed with its own link, so if WhatsApp never opened
 * the way back is still there.
 */
export function CompletionBanner({ job }: { job: OrderWithTech }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only this parameter, rather than blanking the query, so the banner cannot
    // silently discard a filter some later version of this page adds.
    const url = new URL(window.location.href);
    if (!url.searchParams.has('completed')) return;
    url.searchParams.delete('completed');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{job.order_no} is completed.</p>
        <p className="truncate">Notify {job.cust_name} now.</p>
      </div>
      <NotifyCustomer job={job} variant="primary" onOpen={() => setDismissed(true)} />
    </div>
  );
}
