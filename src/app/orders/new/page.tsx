import Link from 'next/link';
import { listTechnicians } from '@/lib/orders';
import { requireUser } from '@/lib/session';
import { OrderForm } from '@/components/order-form';
import { AccessDenied } from '@/components/access-denied';
import { Card, CardContent } from '@/components/ui/card';

export default async function NewOrderPage() {
  const [user, technicians] = await Promise.all([requireUser(), listTechnicians()]);

  if (user.role !== 'admin') {
    return (
      <AccessDenied
        user={user}
        title="Admins only"
        needs="Only an admin can create orders and assign technicians."
        backHref="/orders"
        backLabel="Go to Orders"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Orders
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New order</h1>
        <p className="text-sm text-muted-foreground">
          The order number is generated automatically on save.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <OrderForm technicians={technicians ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
