'use client';

import { useState, useTransition } from 'react';
import { ask, type AskResult } from '@/app/actions/ask';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { serviceLabel, shortDate } from '@/lib/format';

/**
 * The manager's query window.
 *
 * The prose answer and the table are rendered from two different sources on
 * purpose. The sentence is the model's phrasing; the table underneath is
 * rendered straight from the rows the database returned. If the model ever
 * miscounts or invents an order number, the authoritative list is sitting
 * directly below it — the reader does not have to take the sentence on trust.
 *
 * `ask` still returns the parsed intent and the resolved window, and the panel
 * deliberately no longer shows them. The auditability they gave — seeing that
 * "last week" was read as LAST_WEEK and resolved to two specific instants — now
 * rests on the window label inside the answer itself ("17–23 Aug 2026"), which
 * is the part a manager would actually check. The rest was developer detail in
 * a manager's panel.
 */

/** Real questions from the spec, so the window is usable without instructions. */
const EXAMPLES = [
  'What jobs did Ali complete last week?',
  'Which technician completed the most jobs this week?',
  'How many jobs were completed today?',
];

export function AskWindow({
  /** Focus the input on mount. Set by the floating panel, where opening it IS
   *  the intent to type; not set on /ask, where stealing focus would fight a
   *  keyboard user arriving from the nav. */
  autoFocus = false,
  /** Tightens spacing for the 28rem panel. The page version has room to breathe. */
  compact = false,
}: { autoFocus?: boolean; compact?: boolean } = {}) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || pending) return;
    setQuestion(trimmed);
    setAsked(trimmed);
    // The previous answer is cleared before the new one is requested. Leaving it
    // on screen next to a spinner reads as though it is the answer to the
    // question now in the box.
    setResult(null);
    startTransition(async () => setResult(await ask(trimmed)));
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(question); }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={compact ? 'Ask about completed jobs…' : 'Ask about completed jobs, technicians or service types…'}
          aria-label="Ask the AI assistant about completed jobs"
          maxLength={300}
          autoFocus={autoFocus}
          className={compact ? 'h-10' : 'h-11'}
        />
        <Button
          type="submit"
          disabled={pending || !question.trim()}
          className={compact ? 'h-10 px-4' : 'h-11 px-6'}
        >
          {pending ? '…' : 'Ask'}
        </Button>
      </form>

      {!result && !pending && (
        // Stacked in the panel, wrapped on the page. Three pills side by side in
        // 28rem truncate to uselessness.
        <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-2'}>
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => submit(e)}
              className={
                compact
                  ? 'rounded-md border bg-background px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted'
                  : 'rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'
              }
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <p className="text-sm text-muted-foreground">Retrieving data for “{asked}”…</p>
      )}

      {result && !result.ok && (
        // Scope refusals and outages both land here, and both say what CAN be
        // asked. A dead end with no way forward is the worst version of this.
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {result.message}
        </div>
      )}

      {result && result.ok && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-4">
            <p className="whitespace-pre-line text-sm leading-relaxed">{result.answer}</p>
            {!result.phrasedByAi && (
              // Honest about which layer produced the words. The numbers are the
              // same either way; the phrasing is not.
              <p className="mt-3 text-xs text-muted-foreground">
                Phrased directly from the query result — the AI phrasing step was unavailable.
              </p>
            )}
          </div>

          {/* Rendered from the rows, not from the model. */}
          {result.data.kind === 'LIST_JOBS' && result.data.jobs.length > 0 && (
            <ResultTable
              head={['Order', 'Service', 'Completed']}
              rows={result.data.jobs.map((j) => [
                j.order_no, serviceLabel(j.service_type), shortDate(j.completed_at),
              ])}
            />
          )}

          {result.data.kind === 'RANK_TECHNICIANS' && result.data.ranking.length > 0 && (
            <ResultTable
              head={['Technician', 'Jobs completed']}
              rows={result.data.ranking.map((r) => [r.name, String(r.count)])}
            />
          )}

        </div>
      )}
    </div>
  );
}

function ResultTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? 'px-4 py-2 font-medium' : 'px-4 py-2'}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
