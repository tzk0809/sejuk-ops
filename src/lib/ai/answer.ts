import { serviceLabel, shortDate } from '@/lib/format';
import type { QueryResult } from '@/lib/ai/queries';

/**
 * A query result to an English answer, deterministically.
 *
 * This is the whole answering system. The LLM prose layer in gemini.ts is a
 * rephrasing of what this produces, and falls back to it whenever the model is
 * slow, unavailable, or over quota — so the assistant degrades to a correct,
 * plain answer rather than to an error.
 *
 * The point worth making about it: this function cannot hallucinate. Every
 * number it prints came out of Postgres, and every order number came out of a
 * row. Deleting the LLM formatting entirely would leave the system answering
 * correctly, just less fluently.
 *
 * Every answer names the window it counted — "(17–23 Aug 2026)" — so a manager
 * can check that "last week" meant what they meant, instead of trusting it.
 */
export function formatAnswer(result: QueryResult): string {
  switch (result.kind) {
    case 'UNKNOWN_TECHNICIAN':
      // NOT "0 jobs". A zero for someone who does not exist is a confident
      // wrong answer, and nobody double-checks those.
      return result.known.length
        ? `I couldn't find a technician named "${result.asked}". The technicians on record are ${list(result.known)}.`
        : `I couldn't find a technician named "${result.asked}".`;

    case 'AMBIGUOUS_TECHNICIAN':
      return `More than one technician matches "${result.asked}": ${list(result.matches)}. Which one did you mean?`;

    case 'COUNT_JOBS': {
      const who = result.technician ?? null;
      const what = jobNoun(result.count, result.serviceType);
      return who
        ? `${who} completed ${result.count} ${what}${scope(result)}.`
        : `${result.count} ${what} ${result.count === 1 ? 'was' : 'were'} completed${scope(result)}.`;
    }

    case 'LIST_JOBS': {
      const who = result.technician;
      const what = jobNoun(result.count, result.serviceType);
      const head = who
        ? `${who} completed ${result.count} ${what}${scope(result)}`
        : `${result.count} ${what} ${result.count === 1 ? 'was' : 'were'} completed${scope(result)}`;

      if (result.count === 0) return `${head}.`;

      const lines = result.jobs.map(
        (j) => `- ${j.order_no} — ${serviceLabel(j.service_type)} (${shortDate(j.completed_at)})`,
      );
      // Says so rather than quietly showing 50 of 120.
      const more = result.truncated
        ? `\n…showing the ${result.jobs.length} most recent of ${result.count}.`
        : '';
      return `${head}:\n${lines.join('\n')}${more}`;
    }

    case 'RANK_TECHNICIANS': {
      if (result.ranking.length === 0) {
        return `No jobs were completed${scope(result)}.`;
      }
      const [top, ...rest] = result.ranking;
      // A tie is reported as a tie. Picking one arbitrarily would be a wrong
      // answer that looks exactly like a right one.
      const tied = result.ranking.filter((r) => r.count === top.count);
      const lead = tied.length > 1
        ? `${list(tied.map((t) => t.name))} are tied on ${top.count} ${jobNoun(top.count)}${scope(result)}`
        : `${top.name} completed the most jobs${scope(result)}: ${top.count}`;

      if (rest.length === 0) return `${lead}.`;
      const others = result.ranking.map((r) => `- ${r.name}: ${r.count}`).join('\n');
      return `${lead}.\n\nFull ranking:\n${others}`;
    }
  }
}

/** "(17–23 Aug 2026)", or nothing at all when the question had no window. */
const scope = (r: { window: { label: string } | null }) =>
  r.window ? ` (${r.window.label})` : ' in total';

const jobNoun = (n: number, service?: string | null) => {
  const noun = n === 1 ? 'job' : 'jobs';
  return service ? `${serviceLabel(service as never).toLowerCase()} ${noun}` : noun;
};

/** "Ali, Bala and John" — an Oxford-comma-free list, because it is read aloud. */
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
