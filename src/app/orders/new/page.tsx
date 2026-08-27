import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { RouteProbe } from '@/components/route-probe';

// Placeholder for the order creation form. The built version is parked at
// page.tsx.bak alongside order-form.tsx.bak, actions/orders.ts.bak and
// validation.ts.bak; the create_order() RPC it calls is already applied to the
// database by migration 0005.

export default async function NewOrderPage() {
  const user = await requireUser();

  // Only Admin can create orders. Enforced again in the server action and a
  // third time by the trigger in 0004 — this redirect is only convenience.
  if (user.role !== 'admin') redirect('/orders');

  return (
    <RouteProbe
      user={user}
      route="/orders/new"
      allowed="admin"
      guard="No session -> /switch-role. Manager or technician -> /orders."
    />
  );
}
