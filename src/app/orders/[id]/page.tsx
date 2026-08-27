import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrder } from '@/lib/orders';
import { requireUser } from '@/lib/session';
import { listActions } from '@/lib/actions';
import { StatusBadge } from '@/components/status-badge';
import { AuditTrail } from '@/components/audit-trail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { money, dateTime, serviceLabel } from '@/lib/format';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const justCreated = sp.created === '1';

  const user = await requireUser();
  const order = await getOrder(user, id);
  if (!order) notFound();

  const actions = await listActions(order.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Orders
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.order_no}</h1>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {justCreated && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">Order created.</p>
          <p>
            {order.cust_name} · {serviceLabel(order.service_type)} ·{' '}
            {money(order.quoted_price)}
            {order.technician ? ` · assigned to ${order.technician.name}` : ' · not yet assigned'}
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">{order.cust_name}</Field>
            <Field label="Phone">
              <span className="font-mono">{order.phone}</span>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">{order.address}</Field>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Service</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Service type">{serviceLabel(order.service_type)}</Field>
            <Field label="Technician">
              {order.technician?.name ?? (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field label="Problem described">
                {order.problem_desc ?? <span className="text-muted-foreground">—</span>}
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Admin notes">
                {order.admin_notes ?? <span className="text-muted-foreground">—</span>}
              </Field>
            </div>
          </dl>

          <Separator className="my-5" />

          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Quoted">
              <span className="tabular-nums">{money(order.quoted_price)}</span>
            </Field>
            <Field label="Extra charges">
              <span className="tabular-nums">{money(order.extra_charges)}</span>
            </Field>
            <Field label="Final amount">
              <span className="font-semibold tabular-nums">{money(order.final_amount)}</span>
            </Field>
          </dl>
        </CardContent>
      </Card>

      {order.work_done && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Work completed</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <Field label="Work done">{order.work_done}</Field>
              <Field label="Technician remarks">
                {order.tech_remarks ?? <span className="text-muted-foreground">—</span>}
              </Field>
              <Field label="Completed at">{dateTime(order.completed_at)}</Field>
              {order.amount_paid && (
                <Field label="Amount paid">
                  <span className="tabular-nums">{money(order.amount_paid)}</span>
                </Field>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTrail actions={actions} />
        </CardContent>
      </Card>
    </div>
  );
}
