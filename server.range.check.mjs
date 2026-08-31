// Self-check for rangeWindows(): the bucketing that keeps an on-demand historical range
// to a bounded number of Graph API calls. Run: node server.range.check.mjs
// VERCEL=1 keeps server.mjs from opening a listener on import.
process.env.VERCEL = '1';

import assert from 'node:assert/strict';

const { rangeWindows } = await import('./server.mjs');

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
