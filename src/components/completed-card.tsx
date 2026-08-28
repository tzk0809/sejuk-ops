import { StatusBadge } from '@/components/status-badge';
import { shortDate, timeOnly, serviceLabel } from '@/lib/format';
import type { OrderWithTech } from '@/lib/types';

/**
 * A finished job in the technician's list.
 *
 * Deliberately lighter than JobCard, and not a variant of it. JobCard is built
 * around acting on a job — expand for the brief, tap to call, tap for directions,
 * Start or Complete — and its button branches to "Complete job" for any status
 * that is not `assigned`, so a finished job rendered through it would offer a
 * button leading to a page that refuses the request.
 *
 * The weight is the point as well as the code. Open work is what this screen is
 * for; finished work is here so the notification link stays reachable, and a card
 * as heavy as an open one would compete with the jobs still to be done.
 *
 * A server component: nothing here is interactive, and this screen is a phone in
 * the field, so it costs no client JavaScript.
 */
export function CompletedCard({ job }: { job: OrderWithTech }) {
  return (
    <li className="rounded-xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{job.order_no}</span>
        <StatusBadge status={job.status} />
      </div>
      <p className="mt-1.5 truncate text-sm font-medium leading-tight">{job.cust_name}</p>
      <p className="text-sm text-muted-foreground">
        {serviceLabel(job.service_type)} · {shortDate(job.completed_at)} ·{' '}
        {timeOnly(job.completed_at)}
      </p>
    </li>
  );
}
