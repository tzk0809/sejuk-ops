import { requireUser } from '@/lib/session';
import { listMyJobs, listRecentlyCompleted } from '@/lib/jobs';
import { JobCard } from '@/components/job-card';
import { CompletedCard } from '@/components/completed-card';
import { AccessDenied } from '@/components/access-denied';

type Props = {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
};

export default async function JobsPage({ searchParams }: Props) {
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

  const sp = await searchParams;

  // Independent reads of the same table; no reason to wait for one before the other.
  const [jobs, completed] = await Promise.all([
    listMyJobs(user),
    listRecentlyCompleted(user),
  ]);

  const inProgress = jobs.filter((j) => j.status === 'in_progress').length;

  // completeJob redirects here with ?completed=<order_no>. Confirmed against what
  // was actually finished rather than reflected from the URL: a hand-edited or
  // bookmarked parameter would otherwise render a success message for a job that
  // was never done.
  const claimed = typeof sp.completed === 'string' ? sp.completed : null;
  const justCompleted = claimed
    ? (completed.find((j) => j.order_no === claimed) ?? null)
    : null;

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

      {justCompleted && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">{justCompleted.order_no} marked done.</p>
          <p>{justCompleted.cust_name} — it is with your manager for review.</p>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-xl border bg-background p-8 text-center">
          <p className="text-sm text-muted-foreground">No open jobs assigned to you.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </ul>
      )}

      {/* Kept out of the count and the heading above: this is not work to do.
          It exists so a finished job does not vanish the instant it is submitted,
          which also keeps its customer notification reachable afterwards. */}
      {completed.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recently completed</h2>
          <ul className="space-y-2">
            {completed.map((job) => (
              <CompletedCard key={job.id} job={job} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
