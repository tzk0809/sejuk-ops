import { requireUser } from '@/lib/session';
import { AccessDenied } from '@/components/access-denied';
import { AskWindow } from '@/components/ask-window';

/**
 * The AI assistant, as a full page. Managers only.
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
        needs="The AI assistant reports across every technician's completed work, so it is limited to managers."
        backHref="/orders"
        backLabel="Go to orders"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">AI assistant</h1>
      <AskWindow />
    </div>
  );
}
