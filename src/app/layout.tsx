import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getCurrentUser, listUsers, homePathFor } from '@/lib/session';
import { RoleSwitcher } from '@/components/role-switcher';
import { Toaster } from '@/components/ui/sonner';
import { AssistantFab } from '@/components/assistant-fab';
import { SignOutButton } from '@/components/sign-out-button';

export const metadata: Metadata = {
  title: 'Sejuk Sejuk Service — Operations',
  description: 'Internal operations system: orders, technician jobs, manager review.',
};

// Session state is per-request, so nothing here may be statically cached.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // May be null: the visitor has not chosen a user yet, and is on /switch-role. (first time visit)
  const user = await getCurrentUser();
  const users = user ? await listUsers() : [];

  return (
    <html lang="en">
      <body className="min-h-dvh bg-muted/30 antialiased">
        <header className="sticky top-0 z-40 border-b bg-background">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4">
            <Link href="/" className="shrink-0 whitespace-nowrap font-semibold tracking-tight">
              Sejuk Sejuk <span className="font-normal text-muted-foreground">Ops</span>
            </Link>

            {user && (
              <>
                <nav className="hidden gap-1 text-sm sm:flex">
                  <Link
                    href={homePathFor(user.role)}
                    className="rounded-md px-3 py-1.5 hover:bg-muted"
                  >
                    {user.role === 'technician' ? 'My jobs' : 'Orders'}
                  </Link>
                </nav>
                <div className="ml-auto flex items-center gap-3">
                  <span className="hidden text-xs text-muted-foreground sm:inline">Acting as</span>
                  <RoleSwitcher users={users} currentId={user.id} />
                  <SignOutButton />
                </div>
              </>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        {/* Floating, so the assistant is reachable from whatever screen raised
            the question rather than from a route the manager has to navigate to
            and back from. Managers only — see the component. */}
        {user?.role === 'manager' && <AssistantFab />}
        <Toaster />
      </body>
    </html>
  );
}
