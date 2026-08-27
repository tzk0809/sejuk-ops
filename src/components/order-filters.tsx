'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  ORDER_STATUS, SERVICE_TYPE, ORDER_STATUS_LABEL, SERVICE_TYPE_LABEL, ALL_STATUSES,
  type OrderStatus, type ServiceType,
} from '@/lib/types';

const SORT_OPTIONS = [
  ['newest', 'Newest first'], ['oldest', 'Oldest first'],
  ['price_high', 'Highest quote'], ['price_low', 'Lowest quote'],
  ['status', 'Status'], ['service', 'Service type'],
] as const;

const ALL_SERVICES = 'all';

export function OrderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');

  const push = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      // status is never removed: an absent status re-triggers the role default.
      if (k === 'status') next.set(k, v || ALL_STATUSES);
      else if (!v || v === ALL_SERVICES) next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  // Debounce the search box so typing does not fire a query per keystroke.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (q === current) return;
    const t = setTimeout(() => push({ q: q || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters =
    ['q', 'service', 'sort'].some((k) => params.get(k)) ||
    (params.get('status') ?? ALL_STATUSES) !== ALL_STATUSES;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search customer, address, phone, order no, technician"
        className="h-9 w-full bg-background sm:w-80"
        aria-label="Search orders"
      />

      <Select value={params.get('status') ?? ALL_STATUSES} onValueChange={(v) => push({ status: v as string | null })}>
        <SelectTrigger className="h-9 w-[150px] bg-background" aria-label="Filter by status">
          {/* base-ui renders the raw stored value unless given a formatter */}
          <SelectValue>
            {(v) => ORDER_STATUS_LABEL[v as OrderStatus] ?? 'All statuses'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
          {ORDER_STATUS.map((s) => (
            <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={params.get('service') ?? ALL_SERVICES} onValueChange={(v) => push({ service: v as string | null })}>
        <SelectTrigger className="h-9 w-[150px] bg-background" aria-label="Filter by service type">
          <SelectValue>
            {(v) => SERVICE_TYPE_LABEL[v as ServiceType] ?? 'All services'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SERVICES}>All services</SelectItem>
          {SERVICE_TYPE.map((s) => (
            <SelectItem key={s} value={s}>{SERVICE_TYPE_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={params.get('sort') ?? 'newest'} onValueChange={(v) => push({ sort: v as string | null })}>
        <SelectTrigger className="h-9 w-[150px] bg-background" aria-label="Sort orders">
          <SelectValue>
            {(v) => SORT_OPTIONS.find(([key]) => key === v)?.[1] ?? 'Newest first'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map(([v, label]) => (
            <SelectItem key={v} value={v}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost" size="sm"
          onClick={() => {
            setQ('');
            router.replace(`${pathname}?status=${ALL_STATUSES}`);
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
