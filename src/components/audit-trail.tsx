import { dateTime } from '@/lib/format';
import { statusLabel } from '@/lib/format';
import type { ActionWithUser, ActionType } from '@/lib/types';

const VERB: Record<ActionType, string> = {
  created: 'created the order',
  assigned: 'assigned the job',
  started: 'started work',
  completed: 'marked the job done',
  reviewed: 'reviewed the job',
  rejected: 'sent the job back',
  closed: 'closed the order',
};

const DOT: Record<ActionType, string> = {
  created: 'bg-slate-400',
  assigned: 'bg-sky-500',
  started: 'bg-blue-500',
  completed: 'bg-amber-500',
  reviewed: 'bg-violet-500',
  rejected: 'bg-destructive',
  closed: 'bg-emerald-500',
};

export function AuditTrail({ actions }: { actions: ActionWithUser[] }) {
  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">No recorded actions.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l pl-6">
      {actions.map((a) => (
        <li key={a.id} className="relative">
          <span
            className={`absolute -left-[1.655rem] top-1.5 size-2.5 rounded-full ring-4 ring-background ${DOT[a.action_type]}`}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm">
              <strong className="font-medium">{a.user?.name ?? 'Unknown user'}</strong>{' '}
              {VERB[a.action_type]}
            </span>
            {a.from_status !== a.to_status && (
              <span className="text-xs text-muted-foreground">
                {statusLabel(a.from_status!)} → {statusLabel(a.to_status!)}
              </span>
            )}
          </div>
          <time className="text-xs text-muted-foreground">{dateTime(a.created_at)}</time>
          {a.note && <p className="mt-1 text-sm text-muted-foreground">“{a.note}”</p>}
        </li>
      ))}
    </ol>
  );
}
