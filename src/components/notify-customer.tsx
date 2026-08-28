import { MessageCircle } from 'lucide-react';
import { waLink, customerCompletionMessage } from '@/lib/notify';
import type { OrderWithTech } from '@/lib/types';

/**
 * The Module 3 link, in the two places a technician meets it.
 *
 * One component rather than two anchors because the interesting part — build the
 * message from the row, bail out if the row cannot support one, encode it into a
 * wa.me URL, open it safely — is identical in both. Duplicating that is how one
 * copy quietly loses `rel="noopener"` or keeps calling a builder whose shape has
 * changed.
 *
 * The two variants are not redundant placements of the same thing. `primary` is
 * the call to action at the moment the job is submitted, when notifying is the
 * obvious next step and the technician is still holding the phone. `quiet` is the
 * recovery path on a card, for the refresh, the flat battery, and the customer
 * ringing the next day. Different moments, different weight.
 *
 * A server component: an anchor needs no state, and this screen is a phone in the
 * field, so it costs no client JavaScript.
 */
export function NotifyCustomer({
  job,
  variant = 'quiet',
}: {
  job: OrderWithTech;
  variant?: 'primary' | 'quiet';
}) {
  // Module 3's trigger condition, evaluated against the row rather than fired by
  // the completion write — so it is true for as long as the job stays completed.
  const message = customerCompletionMessage(job);
  if (!message) return null;

  const primary = variant === 'primary';

  return (
    <a
      href={waLink(job.phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Notify ${job.cust_name} on WhatsApp that ${job.order_no} is complete`}
      // min-h-11 on both: small does not mean fiddly on a phone.
      className={
        primary
          ? 'flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80'
          : 'flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium active:bg-muted'
      }
    >
      <MessageCircle className="size-4" aria-hidden />
      {primary ? 'Notify customer' : 'Notify'}
    </a>
  );
}
