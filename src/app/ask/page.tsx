import { requireUser } from '@/lib/session';
import { AccessDenied } from '@/components/access-denied';
import { AskWindow } from '@/components/ask-window';

/**
 * The operations query window. Managers only.
 *
 * Guarded here AND inside the server action AND inside runQuery. This one is
 * the affordance — it explains rather than 404s — while the action's check is
 * the boundary, because a page guard does nothing for someone who calls the
 * action directly. Same layering as the orders page and listOrders().
 */
export default async function AskPage() {
  const user = await requireUser();

  if (user.role !== 'manager') {
    return (
      <AccessDenied
        user={user}
        title="Managers only"
        needs="The operations query window reports across every technician's completed work, so it is limited to managers."
        backHref="/orders"
        backLabel="Go to orders"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations query</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about completed jobs, technician workload and service types in plain English.
          Answers are built from the records the system retrieves, not from the model&rsquo;s memory.
        </p>
      </div>
      <AskWindow />
    </div>
  );
}
