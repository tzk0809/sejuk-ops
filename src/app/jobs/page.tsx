import { requireUser } from '@/lib/session';
import { listMyJobs } from '@/lib/jobs';
import { JobCard } from '@/components/job-card';
import { AccessDenied } from '@/components/access-denied';

export default async function JobsPage() {
  const user = await requireUser();

  // Field view, for phones. Say so rather than silently bouncing.
  if (user.role !== 'technician') {
    return (
      <AccessDenied
        user={user}
        title="Technicians only"
        needs="This is the field view technicians use to complete jobs on a phone."
        backHref="/orders"
        backLabel="Go to Orders"
      />
    );
  }

  const jobs = await listMyJobs(user);
  const inProgress = jobs.filter((j) => j.status === 'in_progress').length;

  return (
    // Narrow by design: this is a phone screen first, and a wide column of cards
    // on a desktop reads worse than a centred one.
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My jobs</h1>
        <p className="text-sm text-muted-foreground">
          {jobs.length === 0
            ? 'Nothing open right now.'
            : `${jobs.length} open${inProgress > 0 ? ` · ${inProgress} in progress` : ''}`}
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border bg-background p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No jobs assigned to you are waiting. Completed work stays visible to your
            manager for review.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </ul>
      )}
    </div>
  );
}
