'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeJob } from '@/app/actions/jobs';
import { JobUploader } from '@/components/job-uploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { money } from '@/lib/format';
import type { OrderWithTech } from '@/lib/types';

export function CompleteJobForm({ job }: { job: OrderWithTech }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [workDone, setWorkDone] = useState(job.work_done ?? '');
  const [remarks, setRemarks] = useState(job.tech_remarks ?? '');
  const [extra, setExtra] = useState(job.extra_charges ?? '');

  // Mirrors the generated column in Postgres so the technician sees the total
  // before submitting. The database still computes the stored value — this is a
  // preview, never the source of truth.
  const extraNum = /^\d+(\.\d{1,2})?$/.test(extra.trim()) ? Number(extra) : 0;
  const finalAmount = Number(job.quoted_price) + extraNum;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await completeJob(job.id, {
        work_done: workDone,
        tech_remarks: remarks,
        extra_charges: extra,
      });
      if (!res.ok) setError(res.message);
      else router.push(`/jobs?completed=${encodeURIComponent(job.order_no)}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-1.5">
        <Label htmlFor="work_done">
          Work done <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="work_done"
          value={workDone}
          onChange={(e) => setWorkDone(e.target.value)}
          rows={4}
          placeholder="What did you actually do? e.g. Chemical wash on indoor and outdoor unit, drain line flushed."
          className="text-base"
        />
        <p className="text-xs text-muted-foreground">
          This is what the manager reviews and what justifies the charge.
        </p>
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="extra_charges">Extra charges (RM)</Label>
        <Input
          id="extra_charges"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="min-h-11 text-base"
        />
        <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Quoted {money(job.quoted_price)}
            {extraNum > 0 && ` + ${money(extraNum)}`}
          </span>
          <span className="font-semibold tabular-nums">{money(finalAmount)}</span>
        </div>
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="tech_remarks">Remarks</Label>
        <Textarea
          id="tech_remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          placeholder="Anything else worth noting. e.g. Customer not home, left with the guard."
          className="text-base"
        />
      </section>

      <JobUploader orderId={job.id} docs={job.order_docs ?? []} />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="min-h-12 w-full text-base" disabled={pending}>
        {pending ? 'Completing…' : 'Complete job'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Files upload as you add them — only this button finishes the job.
      </p>
    </form>
  );
}
