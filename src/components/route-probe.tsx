import Link from 'next/link';
import type { User } from '@/lib/types';

/**
 * Placeholder body for the two role-guarded routes while they are being built.
 *
 * It prints who the server thinks you are and which guard the route applies, so
 * role switching and the redirects can be verified on their own — before list
 * rendering, filters and data have anything to do with the outcome.
 */
export function RouteProbe({
  user,
  route,
  allowed,
  guard,
}: {
  user: User;
  route: string;
  allowed: string;
  guard: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="font-mono">{route}</span>
        </h1>
        <p className="text-sm text-muted-foreground">Placeholder — route and guards only.</p>
      </div>

      <dl className="grid gap-3 rounded-lg border bg-background p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Acting as</dt>
          <dd className="font-medium">{user.name}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Role</dt>
          <dd className="font-medium">{user.role}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">User id</dt>
          <dd className="truncate font-mono text-xs">{user.id}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Allowed here</dt>
          <dd className="font-medium">{allowed}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guard</dt>
          <dd>{guard}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/orders" className="text-primary underline">
          /orders
        </Link>
        <Link href="/jobs" className="text-primary underline">
          /jobs
        </Link>
        <Link href="/switch-role" className="text-primary underline">
          /switch-role
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Try each link as each role, and open one directly with no cookie set — every
        route should land you where the guard says it will.
      </p>
    </div>
  );
}
