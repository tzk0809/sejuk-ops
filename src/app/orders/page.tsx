import Link from 'next/link';
import { Suspense } from 'react';
import { listOrders, isSortKey } from '@/lib/orders';
import { requireUser } from '@/lib/session';
import { OrderFilters } from '@/components/order-filters';
import { AccessDenied } from '@/components/access-denied';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { money, shortDate, serviceLabel, truncate } from '@/lib/format';
import { ORDER_STATUS, SERVICE_TYPE } from '@/lib/types';
import type { OrderStatus, ServiceType } from '@/lib/types';

type Params = Promise<{ [k: string]: string | string[] | undefined }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function OrdersPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const user = await requireUser();

  // The desk view. Technicians have /jobs, which answers the same question in a
  // form built for a phone — and having both meant a technician saw their own
  // work described two different ways: "2 open · 1 in progress" there against
  // "10 orders assigned to you" here. Both were true, which is what made it
  // confusing.
  //
  // Checked before the query rather than after: there is no reason to fetch rows
  // for a page that will not render them.
  //
  // This is the affordance, not the boundary. listOrders() still scopes
  // technicians to their own rows, because a guard on one page is not a reason to
  // stop restricting the data — see lib/orders.ts.
  if (user.role === 'technician') {
    return (
      <AccessDenied
        user={user}
        title="Admins and managers only"
        needs="This is the desk view for assigning and reviewing work. Your own jobs are on the field view, which is built for a phone."
        backHref="/jobs"
        backLabel="Go to my jobs"
      />
    );
  }

  // An absent status means no status filter. The per-role default view is
  // applied once at sign-in (landingPathFor) rather than on every param-less
  // visit, so the nav link can show an unfiltered list instead of silently
  // snapping back to the role default.
  const statusParam = one(sp.status);
  const serviceParam = one(sp.service);
  const sortParam = one(sp.sort);

  const orders = await listOrders(user, {
    q: one(sp.q),
    // Validate against the enum rather than trusting the URL: an unknown value
    // would otherwise reach Postgres and fail as a type error.
    status: ORDER_STATUS.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined,
    service: SERVICE_TYPE.includes(serviceParam as ServiceType)
      ? (serviceParam as ServiceType)
      : undefined,
    sort: isSortKey(sortParam) ? sortParam : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
        {user.role === 'admin' && (
          <Button size="lg" nativeButton={false} render={<Link href="/orders/new" />}>
            New order
          </Button>
        )}
      </div>

      <Suspense fallback={null}>
        <OrderFilters />
      </Suspense>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Order No</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="w-[130px]">Phone</TableHead>
              <TableHead className="w-[120px]">Service</TableHead>
              <TableHead className="min-w-[220px]">Problem</TableHead>
              <TableHead className="w-[130px]">Technician</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[110px] text-right">Quoted</TableHead>
              <TableHead className="w-[110px]">Created</TableHead>
              <TableHead className="w-[80px] text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                  No orders match these filters.
                </TableCell>
              </TableRow>
            )}
            {orders.map((o) => (
              <TableRow key={o.id} className="hover:bg-muted/50">
                <TableCell className="font-mono text-xs">
                  <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                    {o.order_no}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">{o.cust_name}</TableCell>
                {/* tel: so an admin on a laptop with a softphone, or on a tablet,
                    can call without retyping. Tabular figures keep the column
                    aligned, which matters for scanning a list of numbers. */}
                <TableCell className="tabular-nums">
                  <a href={`tel:+${o.phone}`} className="hover:underline">{o.phone}</a>
                </TableCell>
                <TableCell>{serviceLabel(o.service_type)}</TableCell>
                <TableCell className="text-muted-foreground" title={o.problem_desc ?? undefined}>
                  {truncate(o.problem_desc, 55)}
                </TableCell>
                <TableCell>
                  {o.technician?.name ?? <span className="text-muted-foreground">Unassigned</span>}
                </TableCell>
                <TableCell>
                  <StatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(o.quoted_price)}</TableCell>
                <TableCell className="text-muted-foreground">{shortDate(o.created_at)}</TableCell>
                {/* The order number is already a link, but one narrow cell being
                    the only target is not discoverable — an explicit action is
                    what an ops table is expected to have. Same destination, so
                    this is an affordance rather than a second route. */}
                <TableCell className="text-right">
                  <Link
                    href={`/orders/${o.id}`}
                    aria-label={`View order ${o.order_no}`}
                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                  >
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
