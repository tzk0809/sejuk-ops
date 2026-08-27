import { ORDER_STATUS_LABEL, SERVICE_TYPE_LABEL } from '@/lib/types';
import type { OrderStatus, ServiceType } from '@/lib/types';

export const money = (v: string | number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : new Intl.NumberFormat('en-MY', {
        style: 'currency', currency: 'MYR', minimumFractionDigits: 2,
      }).format(Number(v));

export const shortDate = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleDateString('en-MY',
    { day: '2-digit', month: 'short', year: 'numeric' });

export const dateTime = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleString('en-MY',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const serviceLabel = (s: ServiceType) => SERVICE_TYPE_LABEL[s] ?? s;
export const statusLabel = (s: OrderStatus) => ORDER_STATUS_LABEL[s] ?? s;

/** Truncate free text for table cells, which must not wrap unboundedly. */
export const truncate = (s: string | null, n = 60) =>
  !s ? '—' : s.length <= n ? s : `${s.slice(0, n - 1)}…`;
