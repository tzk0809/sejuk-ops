'use client';

import { useTransition } from 'react';
import { switchUser } from '@/app/actions/session';
import type { User } from '@/lib/types';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', technician: 'Technician',
};

export function RoleSwitcher({ users, currentId }: { users: User[]; currentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={currentId}
      disabled={pending}
      onValueChange={(id) => {
        if (typeof id !== 'string' || id === currentId) return;
        // `true` sends the caller to the new role's landing view. Switching who
        // you are is exactly the moment the role's default filter applies — a
        // manager who switches in should arrive at the review queue, not at an
        // unfiltered list of every order. The sign-in picker already does this;
        // the dropdown was the one path that did not.
        startTransition(() => void switchUser(id, true));
      }}
    >
      {/* 230px does not fit beside the brand and sign-out on a 375px screen — it
          forced the brand to wrap to three lines and burst out of the header.
          Narrower on mobile, full width from sm up. */}
      <SelectTrigger className="w-[150px] sm:w-[230px]" aria-label="Acting as">
        <SelectValue>
          {(v) => {
            const u = users.find((x) => x.id === v);
            return u ? `${u.name} · ${ROLE_LABEL[u.role] ?? u.role}` : 'Select user';
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name} · {ROLE_LABEL[u.role] ?? u.role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
