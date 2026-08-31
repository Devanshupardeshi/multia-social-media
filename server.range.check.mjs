// Self-check for rangeWindows(): the bucketing that keeps an on-demand historical range
// to a bounded number of Graph API calls. Run: node server.range.check.mjs
// VERCEL=1 keeps server.mjs from opening a listener on import.
process.env.VERCEL = '1';

import assert from 'node:assert/strict';

const { rangeWindows, anchorFollowerSeries } = await import('./server.mjs');

const DAY = 86400;
const sec = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);
const endOf = (iso) => sec(iso) + DAY - 1;

// Buckets must tile the requested span exactly: no gap, no overlap, nothing outside it.
function assertContiguous(label, result, since, until) {
  const { windows } = result;
  assert.ok(windows.length > 0, `${label}: expected at least one bucket`);
  assert.equal(windows[0].since, since, `${label}: first bucket must start at since`);
  assert.equal(windows[windows.length - 1].until, until, `${label}: last bucket must end at until`);
  for (let i = 1; i < windows.length; i += 1) {
    assert.equal(windows[i].since, windows[i - 1].until + 1, `${label}: gap/overlap at bucket ${i}`);
  }
  for (const window of windows) {
    assert.ok(window.since <= window.until, `${label}: inverted bucket ${window.key}`);
    assert.ok(window.key && window.label && window.startDate && window.endDate, `${label}: bucket missing labels`);
  }
}

// 1. A month-long span stays day-by-day.
{
  const since = sec('2026-06-01');
  const until = endOf('2026-06-30');
  const result = rangeWindows(since, until);
  assert.equal(result.granularity, 'day');
  assert.equal(result.windows.length, 30);
  assert.equal(result.windows[0].key, '2026-06-01');
  assert.equal(result.windows[29].key, '2026-06-30');
  assertContiguous('30-day', result, since, until);
}

// 2. A 3-month span drops to weekly - the case the dashboard hit as "No data".
{
  const since = sec('2026-06-01');
  const until = endOf('2026-08-31');
  const result = rangeWindows(since, until);
  assert.equal(result.granularity, 'week');
  assert.ok(result.windows.length <= 14, `expected <= 14 weekly buckets, got ${result.windows.length}`);
  assertContiguous('92-day', result, since, until);
}

// 3. Just past the daily cutoff flips to weekly, not silently back to daily.
{
  assert.equal(rangeWindows(sec('2026-06-01'), endOf('2026-07-01')).granularity, 'day');   // 31 days
  assert.equal(rangeWindows(sec('2026-06-01'), endOf('2026-07-02')).granularity, 'week');  // 32 days
}

// 4. Over half a year goes monthly, and stays well under the call budget.
{
  const since = sec('2025-07-01');
  const until = endOf('2026-08-31');
  const result = rangeWindows(since, until);
  assert.equal(result.granularity, 'month');
  assert.ok(result.windows.length <= 14, `expected <= 14 monthly buckets, got ${result.windows.length}`);
  assert.equal(result.windows[0].key, '2025-07');
  assertContiguous('14-month', result, since, until);
}

// 5. A single day is one bucket.
{
  const since = sec('2026-08-31');
  const until = endOf('2026-08-31');
  const result = rangeWindows(since, until);
  assert.equal(result.granularity, 'day');
  assert.equal(result.windows.length, 1);
  assertContiguous('single day', result, since, until);
}

// 6. Bad input is rejected rather than silently producing an empty chart.
{
  assert.throws(() => rangeWindows(sec('2026-08-31'), sec('2026-06-01')), /since must be on or before until/);
  assert.throws(() => rangeWindows(Number.NaN, sec('2026-06-01')), /Invalid range/);
}

console.log('rangeWindows: all checks passed');

// --- anchorFollowerSeries -------------------------------------------------
// Instagram gives no historical follower total, so totals are today's count walked back
// through net movement. Getting the anchor wrong silently reports today's count for a
// range that ended months ago, which is exactly the bug this guards.

// 7. A range ending today anchors its last bucket to the current count.
{
  const series = [{ net: 10 }, { net: -4 }, { net: 6 }];
  const { endFollowers, startFollowers } = anchorFollowerSeries(series, 1000, 0);
  assert.equal(endFollowers, 1000, 'last bucket must equal the current count');
  assert.equal(series[2].followers, 1000);
  assert.equal(series[1].followers, 994);   // 1000 - 6
  assert.equal(series[0].followers, 998);   // 994 + 4
  assert.equal(startFollowers, 988);        // 998 - 10
  assert.equal(endFollowers - startFollowers, 10 - 4 + 6, 'end - start must equal total net');
}

// 8. A historical range is anchored to its own end date, NOT to today.
{
  const series = [{ net: 100 }, { net: 50 }];
  // 438 followers were gained after the range closed.
  const { endFollowers, startFollowers } = anchorFollowerSeries(series, 2207, 438);
  assert.equal(endFollowers, 1769, 'end total must exclude movement after the range');
  assert.notEqual(endFollowers, 2207, 'must not report today’s count for a past range');
  assert.equal(series[1].followers, 1769);
  assert.equal(series[0].followers, 1719);
  assert.equal(startFollowers, 1619);
  assert.equal(endFollowers - startFollowers, 150);
}

// 9. Negative net (a shrinking account) walks back upward, and a tail can be negative too.
{
  const series = [{ net: -20 }, { net: -30 }];
  const { endFollowers, startFollowers } = anchorFollowerSeries(series, 500, -10);
  assert.equal(endFollowers, 510, 'a negative tail means the account was larger at range end');
  assert.equal(startFollowers, 560);
  assert.equal(endFollowers - startFollowers, -50);
}

// 10. Missing/!finite inputs degrade to 0 rather than poisoning the series with NaN.
{
  const series = [{ net: 5 }, {}];
  const { endFollowers, startFollowers } = anchorFollowerSeries(series, undefined, undefined);
  assert.equal(endFollowers, 0);
  assert.equal(startFollowers, -5);
  assert.ok(series.every((point) => Number.isFinite(point.followers)), 'no NaN totals');
}

// 11. An empty series returns the same value at both ends instead of throwing.
{
  const { endFollowers, startFollowers } = anchorFollowerSeries([], 1234, 34);
  assert.equal(endFollowers, 1200);
  assert.equal(startFollowers, 1200);
}

console.log('anchorFollowerSeries: all checks passed');
