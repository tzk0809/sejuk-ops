import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { listOrders, isSortKey, DEFAULT_STATUS } from '@/lib/orders';
import { requireUser } from '@/lib/session';
import { OrderFilters } from '@/components/order-filters';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { money, shortDate, serviceLabel, truncate } from '@/lib/format';
import { ORDER_STATUS, SERVICE_TYPE, ALL_STATUSES } from '@/lib/types';
import type { OrderStatus, ServiceType } from '@/lib/types';

type Params = Promise<{ [k: string]: string | string[] | undefined }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const HEADING: Record<string, string> = {
  admin: 'Orders',
  manager: 'Orders',
  technician: 'My jobs',
};

export default async function OrdersPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const user = await requireUser();

  const statusParam = one(sp.status);

  // No status in the URL means the visitor has just arrived, so send them to
  // their role's default view — as a redirect rather than a silent filter, so
  // the URL always says exactly what is being shown and Clear behaves sensibly.
  if (statusParam === undefined) {
    const fallback = DEFAULT_STATUS[user.role];
    const next = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : [[k, one(v)!]])),
    );
    next.set('status', fallback ?? ALL_STATUSES);
    redirect(`/orders?${next.toString()}`);
  }

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
          <h1 className="text-2xl font-semibold tracking-tight">{HEADING[user.role]}</h1>
          <p className="text-sm text-muted-foreground">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
            {user.role === 'technician' && ' assigned to you'}
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
              <TableHead className="w-[120px]">Service</TableHead>
              <TableHead className="min-w-[220px]">Problem</TableHead>
              <TableHead className="w-[130px]">Technician</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[110px] text-right">Quoted</TableHead>
              <TableHead className="w-[110px]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
