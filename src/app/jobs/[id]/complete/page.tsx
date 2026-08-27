import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { getMyJob } from '@/lib/jobs';
import { CompleteJobForm } from '@/components/complete-job-form';
import { AccessDenied } from '@/components/access-denied';
import { StatusBadge } from '@/components/status-badge';
import { serviceLabel } from '@/lib/format';

export default async function CompleteJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  if (user.role !== 'technician') {
    return (
      <AccessDenied
        user={user}
        title="Technicians only"
        needs="Only the assigned technician can record work on a job."
        backHref="/orders"
        backLabel="Go to Orders"
      />
    );
  }

  // Scoped to the viewer, so another technician's job id 404s rather than
  // rendering a form that the trigger would reject on submit.
  const job = await getMyJob(user, id);
  if (!job) notFound();

  if (job.status !== 'in_progress') {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-xl border bg-background p-6 text-center">
          <p className="font-medium">This job is not in progress.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.order_no} is <StatusBadge status={job.status} />. Work can only be
            recorded while a job is in progress — start it first.
          </p>
          <Link href="/jobs" className="mt-4 inline-block text-sm text-primary underline">
            Back to my jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
          ← My jobs
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{job.order_no}</span>
          <StatusBadge status={job.status} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{job.cust_name}</h1>
        <p className="text-sm text-muted-foreground">
          {serviceLabel(job.service_type)} · {job.address}
        </p>
      </div>

      <div className="rounded-xl border bg-background p-4">
        <CompleteJobForm job={job} />
      </div>
    </div>
  );
}
