'use client';

import { useTransition, useState } from 'react';
import { switchUser } from '@/app/actions/session';
import type { User, UserRole } from '@/lib/types';

const ROLE_COPY: Record<UserRole, { label: string; blurb: string; ring: string }> = {
  admin: {
    label: 'Admin',
    blurb: 'Creates orders and assigns technicians. Sees every order.',
    ring: 'hover:border-sky-400 focus-visible:border-sky-400',
  },
  manager: {
    label: 'Manager',
    blurb: 'Reviews completed jobs. Opens on the review queue.',
    ring: 'hover:border-violet-400 focus-visible:border-violet-400',
  },
  technician: {
    label: 'Technician',
    blurb: 'Sees only jobs assigned to them, and completes them in the field.',
    ring: 'hover:border-blue-400 focus-visible:border-blue-400',
  },
};

const ORDER: UserRole[] = ['admin', 'manager', 'technician'];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function UserPicker({ users, currentId }: { users: User[]; currentId: string | null }) {
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<string | null>(null);

  const choose = (id: string) => {
    setChoosing(id);
    // goHome: true — the action redirects to whichever view suits the role.
    startTransition(() => void switchUser(id, true));
  };

  const grouped = ORDER.map((role) => ({ role, list: users.filter((u) => u.role === role) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="space-y-6">
      {grouped.map(({ role, list }) => (
        <section key={role} className="space-y-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold">{ROLE_COPY[role].label}</h2>
            <p className="text-xs text-muted-foreground">{ROLE_COPY[role].blurb}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((u) => {
              const isCurrent = u.id === currentId;
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={pending}
                  onClick={() => choose(u.id)}
                  aria-current={isCurrent || undefined}
                  className={`flex items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors disabled:opacity-60 ${ROLE_COPY[role].ring} ${
                    isCurrent ? 'border-foreground/40 ring-2 ring-foreground/10' : ''
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {initials(u.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {choosing === u.id && pending
                        ? 'Signing in…'
                        : isCurrent
                          ? 'Currently acting as'
                          : ROLE_COPY[role].label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
