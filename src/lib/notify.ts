import { timeOnly } from '@/lib/format';
import type { Order, User } from '@/lib/types';

// WhatsApp notification (Module 3).
//
// The spec's trigger condition is "status = Job Done" — a STATE, not an event.
// That distinction decides the whole shape of this module. Nothing here fires on
// the completion write; these builders are called at render time against a row,
// so the link exists for as long as the row satisfies the condition. A technician
// who misses it, refreshes, or comes back tomorrow still has it.
//
// There is deliberately no backend trigger, webhook or queue. A deep link has no
// send step — the "notification" is a human tapping a link, and a human cannot be
// enqueued. A trigger only earns its place once something automated consumes it,
// which means the WhatsApp Business API and a paid vendor. See DEBT.md.
//
// LIMITATION: nothing is sent until someone taps, the recipient sees the sender's
// personal number rather than a company one, and we record nothing about it —
// control passes to another application and never comes back, so "did they press
// send" is not a question this system can answer. Recording the click and calling
// it "notified" would be a worse answer than admitting the gap.

/**
 * `wa.me` takes the number in international form with no `+`, no spaces and no
 * leading zero — exactly what normalisePhone() stores, which is why phone
 * numbers are normalised on the way in rather than at each point of use.
 *
 * Stripping non-digits here only removes presentational characters from a number
 * that is ALREADY international. It does not convert a local `012…` to `6012…`,
 * and deliberately does not try: that is normalisePhone()'s job, done once at the
 * write boundary. Every phone in the table arrives through order validation or
 * the seed, and both store the 60… form, so this function can rely on it — but it
 * relies on the convention rather than enforcing it, which is worth knowing if a
 * third write path is ever added.
 *
 * `https://wa.me/...` rather than the `whatsapp://` app scheme, which fails on a
 * desktop without the app installed — and the manager's half of this system is a
 * desktop. api.whatsapp.com/send is the same thing under an older name.
 */
export function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

/**
 * Narrower than OrderWithTech on purpose: it states exactly what a message needs,
 * and requires the two fields that a half-built message would otherwise render as
 * "—" inside a customer's WhatsApp.
 */
type CompletedOrder = Pick<Order, 'cust_name' | 'order_no' | 'completed_at'> & {
  technician: Pick<User, 'name'> | null;
};

/**
 * The spec's template, verbatim.
 *
 * Deliberately NOT included: the final amount. The spec does not ask for it, and
 * a pre-filled draft is editable by whoever sends it — a price is the last thing
 * that should travel in a message a human can alter before it reaches a customer.
 *
 * `order_no` rather than the UUID: this is the reason the two identifiers are
 * separate columns. "Job a3f8b2c1-9d4e-…" is unreadable in a WhatsApp message.
 *
 * Returns null rather than a garbled string when the row cannot support a
 * coherent message. Neither field can be null for a genuinely completed job — the
 * trigger sets completed_at in the same statement as the status, and completion
 * requires an assigned technician — but the alternative to checking is a cast,
 * and the failure it would hide is a broken sentence sent to a real customer.
 */
export function customerCompletionMessage(order: CompletedOrder): string | null {
  if (!order.completed_at || !order.technician) return null;

  return [
    `Hi ${order.cust_name},`,
    `Job ${order.order_no} has been completed by Technician ${order.technician.name} at ${timeOnly(order.completed_at)}.`,
    'Please check and leave feedback.',
    '',
    'Thank you!',
  ].join('\n');
}
