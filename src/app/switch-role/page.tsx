import { listUsers, getCurrentUser } from '@/lib/session';
import { UserPicker } from '@/components/user-picker';

export const dynamic = 'force-dynamic';

/**
 * The landing page when no session cookie is set, and a deliberate stop for
 * anyone wanting to change who they are acting as.
 *
 * This exists because the alternative — silently defaulting to an admin — grants
 * more access than intended on a failure. Making role selection an explicit
 * screen also makes the demo self-explanatory: a reviewer opening the app is
 * shown, rather than told, that there are three roles with different views.
 */
export default async function SwitchRolePage() {
  const [users, current] = await Promise.all([listUsers(), getCurrentUser()]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Who are you signing in as?</h1>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          This demo has no authentication. Pick a seeded user to act as — each role
          sees a different view of the same data.
        </p>
      </div>

      <UserPicker users={users} currentId={current?.id ?? null} />

      <p className="text-center text-xs text-muted-foreground">
        Your choice is stored in a cookie so the server knows who is asking on every
        request. In production this would be a signed session from real authentication.
      </p>
    </div>
  );
}
