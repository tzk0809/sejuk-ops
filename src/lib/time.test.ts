import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFSET_MS, TZ, resolveWindow, tzOffsetMs } from './time.ts';

/**
 * Run with `npm test`. No framework: Node runs TypeScript directly and ships
 * node:test, so this costs nothing to install — the same reasoning that made
 * the state machine a plain SQL script instead of pgTAP.
 *
 * Every expected value below is hand-typed, never computed. A test that derives
 * its expectation with the implementation's own arithmetic passes even when the
 * implementation is wrong, which is the failure this suite exists to avoid.
 *
 * THE CLOCK IS PINNED INSIDE THE DIVERGENCE STRIP.
 *
 * 2026-08-27T16:56:16Z is 28 Aug 00:56 in Kuala Lumpur — a real completed_at,
 * ORD-01085. The choice is load-bearing. Between 16:00 and 23:59 UTC the two
 * calendars name different days, so a UTC implementation gets a different date
 * as well as a different instant. Pinning the clock at, say, 08:29Z would make
 * the label assertions pass under UTC, because both calendars would agree it
 * was the 28th, and half this suite would prove nothing.
 */
const NOW = new Date('2026-08-27T16:56:16.000Z'); // = Fri 28 Aug 2026, 00:56 MYT

test('TODAY: the Malaysian day flips at 16:00 UTC, not at 00:00 UTC', () => {
  // One millisecond before Malaysian midnight: still the 27th there.
  assert.equal(
    resolveWindow('TODAY', new Date('2026-08-27T15:59:59.999Z')).from,
    '2026-08-26T16:00:00.000Z',
  );
  // Malaysian midnight exactly: the 28th has begun.
  assert.equal(
    resolveWindow('TODAY', new Date('2026-08-27T16:00:00.000Z')).from,
    '2026-08-27T16:00:00.000Z',
  );
});

test('TODAY resolves to the Malaysian calendar day', () => {
  assert.deepEqual(resolveWindow('TODAY', NOW), {
    from: '2026-08-27T16:00:00.000Z',
    to: '2026-08-28T16:00:00.000Z',
    label: '28 Aug 2026',
  });
});

test('THIS_WEEK runs Monday to Monday in Malaysian time', () => {
  assert.deepEqual(resolveWindow('THIS_WEEK', NOW), {
    from: '2026-08-23T16:00:00.000Z', // Mon 24 Aug 00:00 MYT
    to: '2026-08-30T16:00:00.000Z',   // Mon 31 Aug 00:00 MYT
    label: '24–30 Aug 2026',
  });
});

test('LAST_WEEK is the previous calendar week, not the trailing seven days', () => {
  assert.deepEqual(resolveWindow('LAST_WEEK', NOW), {
    from: '2026-08-16T16:00:00.000Z', // Mon 17 Aug 00:00 MYT
    to: '2026-08-23T16:00:00.000Z',   // Mon 24 Aug 00:00 MYT
    label: '17–23 Aug 2026',
  });
});

test('THIS_MONTH resolves to the Malaysian calendar month', () => {
  assert.deepEqual(resolveWindow('THIS_MONTH', NOW), {
    from: '2026-07-31T16:00:00.000Z', // 1 Aug 00:00 MYT
    to: '2026-08-31T16:00:00.000Z',   // 1 Sep 00:00 MYT
    label: '1–31 Aug 2026',
  });
});

test('THIS_MONTH rolls over on the Malaysian month boundary', () => {
  // 31 Aug 16:30 UTC is already 1 Sep in Malaysia. A UTC implementation would
  // answer August here — the loudest version of this bug, a whole month wrong.
  assert.deepEqual(resolveWindow('THIS_MONTH', new Date('2026-08-31T16:30:00.000Z')), {
    from: '2026-08-31T16:00:00.000Z',
    to: '2026-09-30T16:00:00.000Z',
    label: '1–30 Sept 2026', // en-MY abbreviates September as "Sept"
  });
});

test('windows are half-open, so weeks join without gap or overlap', () => {
  // If `to` were inclusive, a job completed at exactly Monday midnight would be
  // counted in both weeks. If either edge were off by a day, there would be a
  // hole between them that no window covers.
  assert.equal(
    resolveWindow('LAST_WEEK', NOW).to,
    resolveWindow('THIS_WEEK', NOW).from,
  );
});

test('OFFSET_MS still agrees with TZ', () => {
  // The two constants are one fact spelled twice; nothing in the language keeps
  // them in step. This is the assertion that fails on OFFSET_MS = 7h — the date
  // assertions above would too, but this one names the actual cause.
  assert.equal(tzOffsetMs(TZ, NOW), OFFSET_MS);
});

test('ALL_TIME is not a window and is rejected', () => {
  assert.throws(
    // @ts-expect-error — excluded by the type; reachable at runtime because the
    // value originates from the model, and types do not exist at runtime.
    () => resolveWindow('ALL_TIME', NOW),
    /Not a resolvable window/,
  );
});
