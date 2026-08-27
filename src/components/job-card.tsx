'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startJob } from '@/app/actions/jobs';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { money, serviceLabel } from '@/lib/format';
import type { OrderWithTech } from '@/lib/types';
import { ChevronDown, Phone, MapPin } from 'lucide-react';

/** 60123456789 -> +60 12-345 6789, readable without losing the dialable form. */
function prettyPhone(raw: string) {
  const m = raw.match(/^60(\d{2})(\d{3})(\d{4,5})$/);
  return m ? `+60 ${m[1]}-${m[2]} ${m[3]}` : raw;
}

export function JobCard({ job }: { job: OrderWithTech }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onStart = () => {
    setError(null);
    startTransition(async () => {
      const res = await startJob(job.id);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  };

  return (
    <li className="rounded-xl border bg-background shadow-sm">
      {/* Tapping the header expands. Actions live outside it so a mis-tap while
          scrolling cannot start or complete a job. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{job.order_no}</span>
            <StatusBadge status={job.status} />
          </div>
          <p className="truncate text-base font-semibold leading-tight">{job.cust_name}</p>
          <p className="text-sm text-muted-foreground">{serviceLabel(job.service_type)}</p>
        </div>
        <ChevronDown
          className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {/* Phone and address are the two things a technician acts on before doing
          anything else, so they are one tap each rather than text to copy. */}
      <div className="grid grid-cols-2 gap-2 px-4">
        <a
          href={`tel:+${job.phone}`}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm font-medium active:bg-muted"
        >
          <Phone className="size-4" aria-hidden />
          {prettyPhone(job.phone)}
        </a>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm font-medium active:bg-muted"
        >
          <MapPin className="size-4" aria-hidden />
          Directions
        </a>
      </div>

      <p className="px-4 pt-2 text-sm text-muted-foreground">{job.address}</p>

      {open && (
        <dl className="space-y-3 px-4 pt-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Quoted</dt>
            <dd className="tabular-nums">{money(job.quoted_price)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Problem reported
            </dt>
            <dd>{job.problem_desc ?? '—'}</dd>
          </div>
          {job.admin_notes && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes from admin
              </dt>
              <dd>{job.admin_notes}</dd>
            </div>
          )}
        </dl>
      )}

      {error && (
        <p className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="p-4 pt-3">
        {job.status === 'assigned' ? (
          <Button size="lg" className="min-h-11 w-full" disabled={pending} onClick={onStart}>
            {pending ? 'Starting…' : 'Start job'}
          </Button>
        ) : (
          <Button
            size="lg"
            className="min-h-11 w-full"
            nativeButton={false}
            render={<Link href={`/jobs/${job.id}/complete`} />}
          >
            Complete job
          </Button>
        )}
      </div>
    </li>
  );
}
