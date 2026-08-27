import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { User, UserRole } from '@/lib/types';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  technician: 'Technician',
};

/**
 * Shown when someone reaches a page their role cannot use.
 *
 * Deliberately a message rather than a redirect. Silently relocating someone is
 * indistinguishable from mistyping a URL — they end up somewhere else with no
 * idea whether the app moved them or they misclicked. Saying what happened also
 * makes the role model visible to anyone exploring the demo.
 *
 * This is a UX affordance, not a security control. The real restrictions are the
 * viewer scoping in lib/orders.ts, the role checks in the server actions, and
 * the trigger in 0004_role_checks.sql.
 */
export function AccessDenied({
  user,
  title,
  needs,
  backHref,
  backLabel,
}: {
  user: User;
  title: string;
  needs: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          You are acting as <strong className="text-foreground">{user.name}</strong> (
          {ROLE_LABEL[user.role]}). {needs}
        </p>
        <p className="text-muted-foreground">
          Change who you are acting as using the selector in the header, or from the
          full list.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="lg" nativeButton={false} render={<Link href={backHref} />}>
            {backLabel}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            nativeButton={false}
            render={<Link href="/switch-role" />}
          >
            Switch user
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
