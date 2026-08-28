import { ORDER_STATUS_LABEL, SERVICE_TYPE_LABEL } from '@/lib/types';
import type { OrderStatus, ServiceType } from '@/lib/types';

/**
 * Every timestamp column is `timestamptz`, so Postgres hands back an instant in
 * UTC. Rendering it needs a timezone, and leaving that to the runtime picks a
 * different one depending on where the code happens to run: a dev machine in
 * Malaysia, a Vercel function in UTC, a technician's phone in whatever the
 * device is set to. The same instant would then display as three different
 * times, and the UTC one — the deployed one — would be eight hours early.
 *
 * Pinning it makes the output a function of the data alone. It also keeps
 * server and client renders identical, so a formatted date moved into a client
 * component later cannot produce a hydration mismatch.
 *
 * Hard-coded because the company operates in one country. A business spanning
 * timezones would store the branch's zone and format per-branch, which is a
 * different feature, not a config value.
 */
const TZ = 'Asia/Kuala_Lumpur';

export const money = (v: string | number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : new Intl.NumberFormat('en-MY', {
        style: 'currency', currency: 'MYR', minimumFractionDigits: 2,
      }).format(Number(v));

export const shortDate = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleDateString('en-MY',
    { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });

export const dateTime = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleString('en-MY',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: TZ });

/**
 * Time without the date, for the WhatsApp completion message. The customer is
 * reading it the same day the job was done, so the date is noise — and a message
 * to a person should read like one.
 *
 * `hour: 'numeric'` rather than '2-digit' so it renders "2:30 pm", not
 * "02:30 pm". Noon and midnight still come out as 12, not 0.
 */
export const timeOnly = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleTimeString('en-MY',
    { hour: 'numeric', minute: '2-digit', timeZone: TZ });

export const serviceLabel = (s: ServiceType) => SERVICE_TYPE_LABEL[s] ?? s;
export const statusLabel = (s: OrderStatus) => ORDER_STATUS_LABEL[s] ?? s;

/** Truncate free text for table cells, which must not wrap unboundedly. */
export const truncate = (s: string | null, n = 60) =>
  !s ? '—' : s.length <= n ? s : `${s.slice(0, n - 1)}…`;
