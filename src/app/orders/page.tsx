import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { RouteProbe } from '@/components/route-probe';

// Placeholder. The built list lives in page.full.tsx.bak; restore with:
//   mv src/app/orders/page.full.tsx.bak src/app/orders/page.tsx

export default async function OrdersPage() {
  const user = await requireUser();

  // Desktop view, for the people at desks. Technicians belong on /jobs.
  if (user.role === 'technician') redirect('/jobs');

  return (
    <RouteProbe
      user={user}
      route="/orders"
      allowed="admin, manager"
      guard="No session -> /switch-role. Technician -> /jobs."
    />
  );
}
