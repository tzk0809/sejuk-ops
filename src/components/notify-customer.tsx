'use client';

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
 * They are labelled differently for the same reason. The banner already says
 * "Notify <customer> now" beside it, so its button can name the mechanism —
 * "Open WhatsApp" is what actually happens, and it does not promise a send that
 * only a human can perform. The card has no supporting text, so its button has to
 * name the action instead; the aria-label carries the rest.
 *
 * A client component only because the banner needs to know when the link is
 * opened, so it can stop telling the technician to do something they have just
 * done. The card passes no callback and is inert.
 */
export function NotifyCustomer({
  job,
  variant = 'quiet',
  onOpen,
}: {
  job: OrderWithTech;
  variant?: 'primary' | 'quiet';
  /** Fired when the link is opened. Not a record that anything was sent. */
  onOpen?: () => void;
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
      onClick={onOpen}
      aria-label={`Notify ${job.cust_name} on WhatsApp that ${job.order_no} is complete`}
      // emerald-700, not the 600 that reads as the more natural "success" green:
      // white on 600 measures 3.65:1, under the 4.5:1 WCAG AA floor for 14px
      // text. 700 gives 5.48:1. This is a screen used outdoors on a phone, so
      // contrast is a working requirement rather than a compliance checkbox.
      // min-h-11 on both: small does not mean fiddly on a phone.
      className={
        primary
          ? 'flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 active:bg-emerald-900'
          : 'flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium active:bg-muted'
      }
    >
      <MessageCircle className="size-4" aria-hidden />
      {primary ? 'Open WhatsApp' : 'Notify'}
    </a>
  );
}
