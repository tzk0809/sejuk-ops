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
import { TEXT_LIMITS } from '@/lib/validation';
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
  const extraTrimmed = extra.trim();
  const extraValid = extraTrimmed === '' || /^\d+(\.\d{1,2})?$/.test(extraTrimmed);
  const extraNum = extraValid && extraTrimmed ? Number(extraTrimmed) : 0;
  const finalAmount = Number(job.quoted_price) + extraNum;

  // Said out loud rather than silently treating the value as zero, which made an
  // invalid amount look like it had been accepted.
  const extraError = extraValid
    ? null
    : 'Amounts take at most 2 decimal places, e.g. 80 or 80.50.';
  const workDoneError =
    workDone.length > TEXT_LIMITS.work_done
      ? `Too long by ${workDone.length - TEXT_LIMITS.work_done} characters.`
      : null;
  const remarksError =
    remarks.length > TEXT_LIMITS.tech_remarks
      ? `Too long by ${remarks.length - TEXT_LIMITS.tech_remarks} characters.`
      : null;
  const blocked = Boolean(extraError || workDoneError || remarksError);

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
          // aria-invalid, not a colour class: it is what a screen reader
          // announces, so the error state is never carried by colour alone.
          // The visible cues are the red counter and the message below.
          aria-invalid={Boolean(workDoneError)}
          aria-describedby={workDoneError ? 'work_done_error' : undefined}
          placeholder="What did you actually do? e.g. Chemical wash on indoor and outdoor unit, drain line flushed."
          className="text-base"
        />
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            This is what the manager reviews and what justifies the charge.
          </p>
          <span
            className={`shrink-0 text-xs tabular-nums ${
              workDoneError ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {workDone.length}/{TEXT_LIMITS.work_done}
          </span>
        </div>
        {workDoneError && (
          <p id="work_done_error" className="text-xs font-medium text-destructive">
            {workDoneError}
          </p>
        )}
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
          aria-invalid={Boolean(extraError)}
          aria-describedby={extraError ? 'extra_charges_error' : undefined}
        />
        {extraError && (
          <p id="extra_charges_error" className="text-xs font-medium text-destructive">
            {extraError}
          </p>
        )}
        <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Quoted {money(job.quoted_price)}
            {extraNum > 0 && ` + ${money(extraNum)}`}
          </span>
          <span className="font-semibold tabular-nums">
            {extraError ? '—' : money(finalAmount)}
          </span>
        </div>
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="tech_remarks">Remarks</Label>
        <Textarea
          id="tech_remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          aria-invalid={Boolean(remarksError)}
          aria-describedby={remarksError ? 'tech_remarks_error' : undefined}
          placeholder="Anything else worth noting. e.g. Customer not home, left with the guard."
          className="text-base"
        />
        <div className="flex items-baseline justify-between gap-3">
          {remarksError ? (
            <p id="tech_remarks_error" className="text-xs font-medium text-destructive">
              {remarksError}
            </p>
          ) : (
            <span />
          )}
          <span
            className={`shrink-0 text-xs tabular-nums ${
              remarksError ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {remarks.length}/{TEXT_LIMITS.tech_remarks}
          </span>
        </div>
      </section>

      <JobUploader orderId={job.id} docs={job.order_docs ?? []} />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="min-h-12 w-full text-base"
        disabled={pending || blocked}
      >
        {pending ? 'Completing…' : 'Complete job'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Files upload as you add them — only this button finishes the job.
      </p>
    </form>
  );
}
