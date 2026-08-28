'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from '@/app/actions/session';

/**
 * Leaves the demo and returns to the picker.
 *
 * Named "Sign out" rather than "Switch user" even though there is no real
 * authentication: it clears the cookie, and a control that empties your session
 * should say so. The role dropdown beside it is the switch-without-leaving path,
 * so the two are not duplicates — one changes who you are, this one stops being
 * anyone.
 *
 * Icon-only above the dropdown's 230px on small screens; the label is carried by
 * aria-label and the tooltip rather than by visible text, because the header is
 * already the widest thing on a phone.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void signOut())}
      aria-label="Sign out and choose a different user"
      title="Sign out"
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <LogOut className="size-4" />
    </button>
  );
}
