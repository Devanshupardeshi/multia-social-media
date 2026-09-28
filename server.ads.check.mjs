// Self-check for the Meta Ads aggregation in server.mjs, against fixture rows shaped like
// real Marketing API responses (every metric arrives as a string).
// Run: node server.ads.check.mjs
// VERCEL=1 keeps server.mjs from opening a listener on import.
process.env.VERCEL = '1';

import assert from 'node:assert/strict';

const { summarizeAdsInsights, adsIncrementFor, normalizeAdAccountId } = await import('./server.mjs');

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);

// --- Bucket size: one call regardless, this only keeps the chart readable ----------------
assert.equal(adsIncrementFor('2026-08-01', '2026-08-31'), 1);
assert.equal(adsIncrementFor('2026-06-01', '2026-08-31'), 1);        // 92 days
assert.equal(adsIncrementFor('2026-05-31', '2026-08-31'), 7);        // 93 days
assert.equal(adsIncrementFor('2025-09-01', '2026-08-31'), 7);        // 365 days
assert.equal(adsIncrementFor('2025-08-31', '2026-08-31'), 'monthly'); // 366 days
assert.equal(adsIncrementFor('2026-08-31', '2026-08-31'), 1);        // single day

// --- Ad account ids ------------------------------------------------------------------------
assert.equal(normalizeAdAccountId('1234567890'), 'act_1234567890');
assert.equal(normalizeAdAccountId('act_1234567890'), 'act_1234567890');
assert.equal(normalizeAdAccountId('  ACT_1234567890 '), 'act_1234567890');
assert.equal(normalizeAdAccountId('act_'), '');
assert.equal(normalizeAdAccountId(''), '');
assert.equal(normalizeAdAccountId('act_12/../me'), 'act_12', 'no path injection into the Graph edge');

// --- A realistic three-day range -------------------------------------------------------------
const totalsRows = [{
  spend: '1234.56', impressions: '100000', reach: '40000', frequency: '2.5',
  clicks: '3000', inline_link_clicks: '2500', ctr: '3', cpc: '0.41152', cpm: '12.3456',
  actions: [
    { action_type: 'post_engagement', value: '5000' },
    { action_type: 'link_click', value: '2500' },
    { action_type: 'lead', value: '40' },
    { action_type: 'some_new_meta_action', value: '7' },
    { action_type: 'video_view', value: '0' }
  ],
  cost_per_action_type: [
    { action_type: 'link_click', value: '0.493824' },
    { action_type: 'lead', value: '30.864' }
  ],
  date_start: '2026-08-01', date_stop: '2026-08-03'
}];

// Daily rows carry their own per-day reach in real responses; it must never be summed.
const seriesRows = [
  { date_start: '2026-08-03', date_stop: '2026-08-03', spend: '400.56', impressions: '30000', clicks: '900', inline_link_clicks: '700', reach: '15000' },
  { date_start: '2026-08-01', date_stop: '2026-08-01', spend: '500', impressions: '40000', clicks: '1200', inline_link_clicks: '1000', reach: '20000' },
  { date_start: '2026-08-02', date_stop: '2026-08-02', spend: '334', impressions: '30000', clicks: '900', inline_link_clicks: '800', reach: '18000' }
];

const campaignRows = [
  {
    campaign_id: '11', campaign_name: 'Small test', objective: 'OUTCOME_TRAFFIC',
    spend: '34.56', impressions: '5000', reach: '4000', clicks: '100', ctr: '2', cpc: '0.3456', cpm: '6.912',
    actions: [{ action_type: 'link_click', value: '80' }], cost_per_action_type: [{ action_type: 'link_click', value: '0.432' }]
  },
  {
    campaign_id: '22', campaign_name: 'Main lead gen', objective: 'OUTCOME_LEADS',
    spend: '1200', impressions: '95000', reach: '38000', clicks: '2900', ctr: '3.05', cpc: '0.4138', cpm: '12.63',
    actions: [{ action_type: 'link_click', value: '2420' }, { action_type: 'lead', value: '40' }],
    cost_per_action_type: [{ action_type: 'lead', value: '30' }]
  }
];

const placementRows = [
  { publisher_platform: 'facebook', platform_position: 'feed', spend: '300', impressions: '25000', clicks: '700' },
  { publisher_platform: 'instagram', platform_position: 'feed', spend: '500', impressions: '40000', clicks: '1300' },
  { publisher_platform: 'instagram', platform_position: 'instagram_reels', spend: '250.56', impressions: '20000', clicks: '600' },
  { publisher_platform: 'instagram', platform_position: 'instagram_stories', spend: '150', impressions: '10000', clicks: '300' },
  { publisher_platform: 'audience_network', platform_position: 'an_classic', spend: '34', impressions: '5000', clicks: '100' }
];

const result = summarizeAdsInsights({ totalsRows, seriesRows, campaignRows, placementRows, increment: 1, currency: 'INR' });

// Totals: parsed from strings, taken as Meta reports them.
assert.equal(result.currency, 'INR');
assert.equal(result.granularity, 'day');
assert.equal(result.empty, false);
close(result.totals.spend, 1234.56, 'spend');
assert.equal(result.totals.impressions, 100000);
assert.equal(result.totals.linkClicks, 2500);
close(result.totals.cpm, 12.3456, 'cpm');

// Reach and frequency come from the totals row, not from adding daily reach.
const summedDailyReach = seriesRows.reduce((sum, row) => sum + Number(row.reach), 0);
assert.equal(result.totals.reach, 40000, 'reach is the deduplicated total');
assert.notEqual(result.totals.reach, summedDailyReach, 'never the sum of daily reach (53,000 here)');
assert.equal(result.totals.frequency, 2.5);
assert.ok(result.series.every((point) => !('reach' in point.metrics)), 'no per-bucket reach to add up by mistake');

// CTR/CPC are Meta's totals, not averages of per-row ratios.
assert.equal(result.totals.ctr, 3);
close(result.totals.cpc, 0.41152, 'cpc');

// Series: sorted by date whatever order Meta returns, additive metrics sum to the totals.
assert.deepEqual(result.series.map((point) => point.key), ['2026-08-01', '2026-08-02', '2026-08-03']);
assert.equal(result.series[0].label, 'Aug 1');
close(result.series.reduce((sum, point) => sum + point.metrics.spend, 0), result.totals.spend, 'daily spend adds up to total spend');
assert.equal(result.series.reduce((sum, point) => sum + point.metrics.impressions, 0), result.totals.impressions);

// Actions: zero-value dropped, biggest first, known labels, unknown humanised, cost attached.
assert.deepEqual(result.actions.map((action) => action.type), ['post_engagement', 'link_click', 'lead', 'some_new_meta_action']);
assert.equal(result.actions[1].label, 'Link clicks');
close(result.actions[1].costPer, 0.493824, 'cost per link click');
assert.equal(result.actions[0].costPer, null, 'no cost reported -> null, not 0');
assert.equal(result.actions[3].label, 'Some new meta action');

// Campaigns: biggest spend first, objective readable, top action picked.
assert.deepEqual(result.campaigns.map((campaign) => campaign.id), ['22', '11']);
assert.equal(result.campaigns[0].objective, 'Leads');
assert.equal(result.campaigns[0].topAction.type, 'link_click');
assert.equal(result.campaigns[1].objective, 'Traffic');

// Placements: platforms add up spend exactly, Instagram positions add up to Instagram.
assert.deepEqual(result.platforms.map((platform) => platform.platform), ['instagram', 'facebook', 'audience_network']);
close(result.platforms.reduce((sum, platform) => sum + platform.spend, 0), result.totals.spend, 'FB + IG + AN spend = total spend');
const instagram = result.platforms.find((platform) => platform.platform === 'instagram');
close(instagram.spend, 900.56, 'instagram spend');
close(result.instagramPositions.reduce((sum, position) => sum + position.spend, 0), instagram.spend, 'IG positions = IG spend');
assert.deepEqual(result.instagramPositions.map((position) => position.label), ['Feed', 'Reels', 'Stories']);
assert.ok(result.platforms.every((platform) => !('reach' in platform)), 'reach per position double counts - not aggregated');

// --- Weekly and monthly labels ----------------------------------------------------------------
{
  const weekly = summarizeAdsInsights({ totalsRows, seriesRows: [seriesRows[1]], campaignRows: [], placementRows: [], increment: 7, currency: 'INR' });
  assert.equal(weekly.granularity, 'week');
  assert.equal(weekly.series[0].label, 'Wk of Aug 1');
  const monthly = summarizeAdsInsights({ totalsRows, seriesRows: [seriesRows[1]], campaignRows: [], placementRows: [], increment: 'monthly', currency: 'INR' });
  assert.equal(monthly.granularity, 'month');
  assert.equal(monthly.series[0].key, '2026-08');
  assert.equal(monthly.series[0].label, 'Aug 2026');
}

// --- A range with no delivery is an answer, not a crash ----------------------------------------
{
  const none = summarizeAdsInsights({ totalsRows: [], seriesRows: [], campaignRows: [], placementRows: [], increment: 1, currency: 'USD' });
  assert.equal(none.empty, true);
  assert.equal(none.totals.spend, 0);
  assert.equal(none.totals.reach, 0);
  assert.deepEqual(none.actions, []);
  assert.deepEqual(none.campaigns, []);
}

// --- A series row without a date is skipped, not fatal -----------------------------------------
// (Found by the end-to-end run: formatting an undated row threw "Invalid time value" and
// blanked the whole Ads page.)
{
  const partial = summarizeAdsInsights({
    totalsRows,
    seriesRows: [{ spend: '5', impressions: '10' }, seriesRows[1], { date_start: 'garbage', spend: '1' }],
    campaignRows: [], placementRows: [], increment: 1, currency: 'INR'
  });
  assert.deepEqual(partial.series.map((point) => point.key), ['2026-08-01'], 'only the dated row survives');
  close(partial.totals.spend, 1234.56, 'totals unaffected - they come from the totals row');
}

// --- Junk values degrade to 0 instead of NaN ---------------------------------------------------
{
  const junk = summarizeAdsInsights({
    totalsRows: [{ spend: 'n/a', impressions: undefined, reach: null, ctr: '' }],
    seriesRows: [], campaignRows: [], placementRows: [], increment: 1, currency: ''
  });
  assert.ok(Object.values(junk.totals).every(Number.isFinite), 'no NaN anywhere in totals');
}

console.log('ads: all checks passed');
