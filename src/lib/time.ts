/**
 * The company operates in one timezone, and that is a business fact rather than
 * a rendering preference — so it lives here, not in format.ts, which imports it.
 *
 * Every timestamp column is `timestamptz`, which stores an instant, not a date.
 * "Today" and "this week" are calendar boxes, and a calendar needs a place to be
 * drawn. Malaysia is UTC+8, so the Malaysian box is shifted eight hours from the
 * UTC one: anything completed between 16:00 and 23:59 UTC is already tomorrow in
 * Kuala Lumpur. Supabase runs in UTC and so does Vercel, so drawing the box with
 * `current_date` or `new Date().toISOString()` files a job finished at 00:30 on
 * Friday in Malaysia under Thursday — silently, and only in production, because
 * a dev machine here is already on Malaysian time.
 */
export const TZ = 'Asia/Kuala_Lumpur';

/**
 * The same fact as a number, because the arithmetic below needs an offset and
 * `TZ` is a name. Two spellings of one fact that nothing in the language keeps
 * in step, so time.test.ts asserts they agree.
 *
 * A constant is correct here and nowhere else: Malaysia has no DST and has been
 * fixed at +08:00 since 1982 (before that, +07:30 — a completion timestamped
 * pre-1982 would be half an hour wrong; none exist). A business spanning
 * timezones, or one in a DST zone, needs Temporal or a tz library, because there
 * the offset depends on *when* you ask.
 */
export const OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * The date vocabulary the AI is allowed to use. A closed list, because the model
 * must never do date arithmetic: it does not know today's date, it does not know
 * the company is in Malaysia, and it is bad at both. It picks a word; the server
 * resolves it.
 *
 * Uppercase, unlike the snake_case Postgres enums in types.ts, so a value's
 * spelling tells you whether it came from the model or from the database.
 */
export const REPORT_PERIOD = [
  'TODAY', 'THIS_WEEK', 'LAST_WEEK', 'THIS_MONTH', 'ALL_TIME',
] as const;
export type ReportPeriod = (typeof REPORT_PERIOD)[number];

/**
 * ALL_TIME is a period but not a window — it has no edges. Excluding it from the
 * resolver's input type keeps the return type honest (two real instants, never
 * null) and pushes the one null check up to the caller, which has to branch
 * anyway to decide whether to apply the filters at all.
 */
export type WindowPeriod = Exclude<ReportPeriod, 'ALL_TIME'>;

export type ReportWindow = {
  /** Inclusive start, ISO. */
  from: string;
  /**
   * EXCLUSIVE end, ISO. Half-open [from, to) so a job completed at exactly
   * midnight lands in one box, not both and not neither.
   */
  to: string;
  /**
   * The window in Malaysian calendar terms, e.g. "17–23 Aug 2026". The answer
   * states the window it counted, so a manager can audit it instead of trusting
   * it — and computing it here rather than in the formatter means the label and
   * the query cannot disagree.
   */
  label: string;
};

// --------------------------------------------------------------- wall clock
// Shifting an instant by the offset makes the getUTC* accessors read Malaysian
// wall-clock time. Floor there, then shift back to get a real instant again.

const wall = (at: Date) => new Date(at.getTime() + OFFSET_MS);

/**
 * A Malaysian wall-clock midnight, as a real instant. Date.UTC normalises
 * out-of-range values, so `day - 3` or `month + 1` is safe across boundaries.
 */
const instantAt = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d) - OFFSET_MS);

const startOfDay = (at: Date) => {
  const w = wall(at);
  return instantAt(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
};

/** Monday-start, matching Postgres date_trunc('week', ...) and the ISO week. */
const startOfWeek = (at: Date) => {
  const w = wall(at);
  const mondayOffset = (w.getUTCDay() + 6) % 7; // Sun 0 -> 6, Mon 1 -> 0
  return instantAt(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - mondayOffset);
};

const startOfMonth = (at: Date) => {
  const w = wall(at);
  return instantAt(w.getUTCFullYear(), w.getUTCMonth(), 1);
};

const addDays = (at: Date, n: number) => {
  const w = wall(at);
  return instantAt(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + n);
};

const addMonths = (at: Date, n: number) => {
  const w = wall(at);
  return instantAt(w.getUTCFullYear(), w.getUTCMonth() + n, 1);
};

// -------------------------------------------------------------------- label

const part = (at: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-MY', { timeZone: TZ, ...opts }).format(at);

/** Malaysian calendar date as YYYY-MM-DD, for deciding which box a date is in. */
const ymd = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);

/**
 * `to` is exclusive, so the last day the window actually covers is one
 * millisecond earlier. Labelling THIS_WEEK "24–31 Aug" when it ends on Sunday
 * the 30th would be a small lie in the one sentence that exists to be audited.
 */
const describe = (from: Date, toExclusive: Date): string => {
  const last = new Date(toExclusive.getTime() - 1);
  const [fy, fm] = ymd(from).split('-');
  const [ly, lm] = ymd(last).split('-');

  if (ymd(from) === ymd(last)) {
    return part(from, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (fy === ly && fm === lm) {
    return `${part(from, { day: 'numeric' })}–${part(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (fy === ly) {
    return `${part(from, { day: 'numeric', month: 'short' })} – ${part(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${part(from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${part(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

// ----------------------------------------------------------------- resolver

/**
 * A period word to the two instants that bound it, drawn on the Malaysian
 * calendar.
 *
 * `now` is a parameter rather than `Date.now()` read inside, so this is a pure
 * function of its inputs and the test can pin the clock. Reading the clock
 * internally would make the timezone assertion untestable: the test would have
 * to compute its own expectation with the same arithmetic, and prove nothing.
 *
 * THIS_WEEK and THIS_MONTH run to the end of the calendar box rather than to
 * `now`. No completion can be in the future, so the count is identical, and
 * clamping would make the label say "24–28 Aug" for a week that is 24–30.
 */
export function resolveWindow(period: WindowPeriod, now: Date): ReportWindow {
  let from: Date;
  let to: Date;

  switch (period) {
    case 'TODAY':
      from = startOfDay(now);
      to = addDays(from, 1);
      break;
    case 'THIS_WEEK':
      from = startOfWeek(now);
      to = addDays(from, 7);
      break;
    case 'LAST_WEEK':
      to = startOfWeek(now);
      from = addDays(to, -7);
      break;
    case 'THIS_MONTH':
      from = startOfMonth(now);
      to = addMonths(from, 1);
      break;
    default:
      // Unreachable in TypeScript; reachable at runtime, because the value the
      // caller is handing us originated from the model.
      throw new Error(`Not a resolvable window: ${period as string}`);
  }

  return { from: from.toISOString(), to: to.toISOString(), label: describe(from, to) };
}

/**
 * What the runtime's tz database says the offset is, rounded to the minute.
 *
 * Used only by the test, to assert OFFSET_MS and TZ still agree. Rounded
 * because formatToParts is second-precision, so reconstructing the instant
 * drops the milliseconds and an exact comparison reports 7.99998 hours — which
 * is why deriving the offset at runtime was rejected in favour of a constant
 * plus this guard.
 */
export function tzOffsetMs(tz: string, at: Date): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at).reduce<Record<string, string>>((acc, x) => {
    acc[x.type] = x.value;
    return acc;
  }, {});

  const asIfUtc = Date.UTC(
    +p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second,
  );
  return Math.round((asIfUtc - at.getTime()) / 60_000) * 60_000;
}
