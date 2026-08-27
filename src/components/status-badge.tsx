import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

// Colour carries meaning: grey = not started, blue = live, amber = needs a
// manager, green = settled.
const STYLES: Record<OrderStatus, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-sky-50 text-sky-700 border-sky-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  job_done: 'bg-amber-100 text-amber-900 border-amber-200',
  reviewed: 'bg-violet-100 text-violet-800 border-violet-200',
  closed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={`font-medium ${STYLES[status]}`}>
      {statusLabel(status)}
    </Badge>
  );
}
