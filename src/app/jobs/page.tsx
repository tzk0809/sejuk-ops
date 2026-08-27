import { requireUser } from '@/lib/session';
import { RouteProbe } from '@/components/route-probe';
import { AccessDenied } from '@/components/access-denied';

// Placeholder for Module 2: the mobile-first technician job list.

export default async function JobsPage() {
  const user = await requireUser();

  // Field view, for phones. Say so rather than silently bouncing.
  if (user.role !== 'technician') {
    return (
      <AccessDenied
        user={user}
        title="Technicians only"
        needs="This is the field view technicians use to complete jobs on a phone."
        backHref="/orders"
        backLabel="Go to Orders"
      />
    );
  }

  return (
    <RouteProbe
      user={user}
      route="/jobs"
      allowed="technician"
      guard="No session -> /switch-role. Admin or manager -> Technicians only message."
    />
  );
}
