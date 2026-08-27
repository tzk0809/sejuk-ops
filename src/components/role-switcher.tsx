'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchUser } from '@/app/actions/session';
import type { User } from '@/lib/types';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', technician: 'Technician',
};

export function RoleSwitcher({ users, currentId }: { users: User[]; currentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={currentId}
      disabled={pending}
      onValueChange={(id) => {
        if (typeof id !== 'string' || id === currentId) return;
        startTransition(async () => {
          await switchUser(id);
          router.refresh();
        });
      }}
    >
      <SelectTrigger className="w-[230px]" aria-label="Acting as">
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
