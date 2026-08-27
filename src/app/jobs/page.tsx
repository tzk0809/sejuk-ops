import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { RouteProbe } from '@/components/route-probe';

// Placeholder for Module 2: the mobile-first technician job list.

export default async function JobsPage() {
  const user = await requireUser();

  // Field view, for phones. Admins and managers belong on /orders.
  if (user.role !== 'technician') redirect('/orders');

  return (
    <RouteProbe
      user={user}
      route="/jobs"
      allowed="technician"
      guard="No session -> /switch-role. Admin or manager -> /orders."
    />
  );
}
