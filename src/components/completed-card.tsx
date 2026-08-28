import { MessageCircle } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { shortDate, timeOnly, serviceLabel } from '@/lib/format';
import { waLink, customerCompletionMessage } from '@/lib/notify';
import type { OrderWithTech } from '@/lib/types';

/**
 * A finished job in the technician's list, with the customer notification.
 *
 * Deliberately lighter than JobCard, and not a variant of it. JobCard is built
 * around acting on a job — expand for the brief, tap to call, tap for directions,
 * Start or Complete — and its button branches to "Complete job" for any status
 * that is not `assigned`, so a finished job rendered through it would offer a
 * button leading to a page that refuses the request.
 *
 * The weight is the point as well as the code. Open work is what this screen is
 * for; finished work is here so the notification stays reachable, and a card as
 * heavy as an open one would compete with the jobs still to be done.
 *
 * A server component: the link is an anchor, nothing here needs state, and this
 * screen is a phone in the field, so it costs no client JavaScript.
 */
export function CompletedCard({ job }: { job: OrderWithTech }) {
  // Module 3's trigger condition, evaluated against the row rather than fired by
  // the completion write. It is true for as long as the job stays completed, so
  // the link survives a refresh, a dead battery, and a customer who calls a day
  // later saying they were never told.
  const message = customerCompletionMessage(job);

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-background/60 p-4">
      {/* min-w-0 so the truncate below has something to bite on: without it a
          long customer name pushes the button off a 375px screen. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{job.order_no}</span>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-1.5 truncate text-sm font-medium leading-tight">{job.cust_name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {serviceLabel(job.service_type)} · {shortDate(job.completed_at)} ·{' '}
          {timeOnly(job.completed_at)}
        </p>
      </div>

      {/* Compact and outlined rather than a full-width primary button. Ten of
          these stacked would otherwise push the actual work off the screen, and
          this is the secondary half of a field view. min-h-11 keeps it a real
          tap target on a phone despite being small. */}
      {message && (
        <a
          href={waLink(job.phone, message)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Notify ${job.cust_name} on WhatsApp that ${job.order_no} is complete`}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium active:bg-muted"
        >
          <MessageCircle className="size-4" aria-hidden />
          Notify
        </a>
      )}
    </li>
  );
}
