const state = {
  data: null,
  accountId: '',
  accounts: [],
  defaultAccountId: '',
  pollTimer: null,
  refreshMs: 60000,
  period: 'all',
  chartMetric: 'views',
  reachGranularity: 'day',
  selectedInsight: null,
  selectedContentId: '',
  sort: 'views',
  sortDir: 'desc',
  typeFilter: 'all',
  signalFilter: 'all',
  minViews: 0,
  query: '',
  isRefreshing: false,
  metricsAnimated: false,
  performanceRange: null,
  performanceCompareRange: null,
  reachRange: null,
  reachCompareRange: null,
  followerRange: null,
  followerCompareRange: null,
  rangeCal: null,
  rangeData: new Map(),
  audienceTimeframe: null,
  audienceCompareTimeframe: null,
  accountWindow: null,
  accountRange: null,
  accountCompareRange: null,
  adsRange: null,
  adsCompareRange: null,
  hasAds: null, // null = not checked yet, then true / false from /api/status
  usernameHidden: false,
  role: ''
};

const els = {
  connectionChip: document.querySelector('#connection-chip'),
  syncLoader: document.querySelector('#sync-loader'),
  syncStage: document.querySelector('#sync-stage'),
  syncTip: document.querySelector('#sync-tip'),
  syncFill: document.querySelector('#sync-fill'),
  accountsOverview: document.querySelector('#accounts-overview'),
  accountCards: document.querySelector('#account-cards'),
  overviewRefresh: document.querySelector('#overview-refresh'),
  accountSelect: document.querySelector('#account-select'),
  accountSelectLabel: document.querySelector('#account-select-label'),
  allAccountsLink: document.querySelector('#all-accounts-link'),
  accountAvatar: document.querySelector('#account-avatar'),
  accountTitle: document.querySelector('#account-title'),
  toggleUsername: document.querySelector('#toggle-username'),
  accountMeta: document.querySelector('#account-meta'),
  refreshSelect: document.querySelector('#refresh-select'),
  manualRefresh: document.querySelector('#manual-refresh'),
  warningPanel: document.querySelector('#warning-panel'),
  liveBadge: document.querySelector('#live-badge'),
  lastUpdated: document.querySelector('#last-updated'),
  summaryGrid: document.querySelector('#summary-grid'),
  trendChart: document.querySelector('#trend-chart'),
  periodTabs: document.querySelector('#period-tabs'),
  metricTabs: document.querySelector('#metric-tabs'),
  performanceRangeTrigger: document.querySelector('#performance-range-trigger'),
  performanceRangeLabel: document.querySelector('#performance-range-label'),
  performanceCalendar: document.querySelector('#performance-calendar'),
  reachGranularityTabs: document.querySelector('#reach-granularity-tabs'),
  funnelChart: document.querySelector('#funnel-chart'),
  savesSharesChart: document.querySelector('#saves-shares-chart'),
  heatmapChart: document.querySelector('#heatmap-chart'),
  distributionChart: document.querySelector('#distribution-chart'),
  engagementChart: document.querySelector('#engagement-chart'),
  reachChart: document.querySelector('#reach-chart'),
  reachTitle: document.querySelector('#reach-title'),
  reachRangeTrigger: document.querySelector('#reach-range-trigger'),
  reachRangeLabel: document.querySelector('#reach-range-label'),
  reachCalendar: document.querySelector('#reach-calendar'),
  chartInsight: document.querySelector('#chart-insight'),
  activityFeed: document.querySelector('#activity-feed'),
  topReels: document.querySelector('#top-reels'),
  searchInput: document.querySelector('#search-input'),
  contentTypeSelect: document.querySelector('#content-type-select'),
  signalFilterSelect: document.querySelector('#signal-filter-select'),
  minViewsInput: document.querySelector('#min-views-input'),
  sortSelect: document.querySelector('#sort-select'),
  exportCsv: document.querySelector('#export-csv'),
  reelsTbody: document.querySelector('#reels-tbody'),
  mobileReels: document.querySelector('#mobile-reels'),
  contentMix: document.querySelector('#content-mix'),
  accuracyCenter: document.querySelector('#accuracy-center'),
  followerPanel: document.querySelector('#follower-panel'),
  followerGrowth: document.querySelector('#follower-growth'),
  followerRangeTrigger: document.querySelector('#follower-range-trigger'),
  followerRangeLabel: document.querySelector('#follower-range-label'),
  followerCalendar: document.querySelector('#follower-calendar'),
  genderBreakdown: document.querySelector('#gender-breakdown'),
  genderTimeframe: document.querySelector('#gender-timeframe'),
  genderTimeframeLabel: document.querySelector('#gender-timeframe-label'),
  genderCompare: document.querySelector('#gender-compare'),
  genderCompareLabel: document.querySelector('#gender-compare-label'),
  accountInsights: document.querySelector('#account-insights'),
  accountWindow: document.querySelector('#account-window'),
  accountWindowLabel: document.querySelector('#account-window-label'),
  accountRangeTrigger: document.querySelector('#account-range-trigger'),
  accountRangeLabel: document.querySelector('#account-range-label'),
  accountCalendar: document.querySelector('#account-calendar'),
  audienceDemographics: document.querySelector('#audience-demographics'),
  compareBoard: document.querySelector('#compare-board'),
  contentDetail: document.querySelector('#content-detail'),
  reportBox: document.querySelector('#report-box'),
  copyReport: document.querySelector('#copy-report'),
  exportPdf: document.querySelector('#export-pdf'),
  logoutButton: document.querySelector('#logout-button'),
  adminNavItem: document.querySelector('.nav-item[href="/admin"]'),
  guideNavItem: document.querySelector('.nav-item[href="#guide"]'),
  accountsNavItem: document.querySelector('.nav-item[href="/"]'),
  adsNavItem: document.querySelector('#ads-nav-item'),
  adsRangeTrigger: document.querySelector('#ads-range-trigger'),
  adsRangeLabel: document.querySelector('#ads-range-label'),
  adsCalendar: document.querySelector('#ads-calendar'),
  adsBody: document.querySelector('#ads-body')
};

// Eye-toggle icons (defined before init() runs so applyUsernameMask can use them).
const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// ---------------------------------------------------------------------------
// Shared range calendar + on-demand history
//
// The performance, reach and follower panels all pick a date range the same way, so they
// share one calendar. Each panel is a descriptor saying where its popover lives, which
// days it already has locally, and what to re-render once a range is applied.
//
// The server pre-fetches ~90 days. Anything older is fetched on demand when Apply is
// pressed (/api/insights/range), bucketed by span so the Graph API call count stays small.
// ---------------------------------------------------------------------------

// Instagram rejects insight windows older than ~2 years; the server clamps to the same floor.
const RANGE_FLOOR_DAYS = 728;

const RANGE_PANELS = {
  performance: {
    kind: 'performance',
    calendar: () => els.performanceCalendar,
    trigger: () => els.performanceRangeTrigger,
    rangeKey: 'performanceRange',
    compareKey: 'performanceCompareRange',
    dataDays: () => trendDailySource(chartContent()).points.map((point) => point.key),
    activeRange: () => activePerformanceRange(trendDailySource(chartContent()).points),
    rerender: () => renderCharts()
  },
  reach: {
    kind: 'performance',
    calendar: () => els.reachCalendar,
    trigger: () => els.reachRangeTrigger,
    rangeKey: 'reachRange',
    compareKey: 'reachCompareRange',
    dataDays: () => reachDailySource(chartContent()).points.map((point) => point.key),
    activeRange: () => activeAccountReachRange(reachDailySource(chartContent()).points),
    rerender: () => renderCharts()
  },
  follower: {
    kind: 'followers',
    calendar: () => els.followerCalendar,
    trigger: () => els.followerRangeTrigger,
    rangeKey: 'followerRange',
    compareKey: 'followerCompareRange',
    dataDays: () => (state.data?.summary?.followerTrend?.series || []).map((point) => point.date),
    activeRange: () => activeFollowerRange(state.data?.summary?.followerTrend?.series || []),
    rerender: () => renderFollowerGrowth(),
    // Follower buckets already carry gained/lost/net/followers - pass them through intact.
    mapBucket: (bucket) => ({ ...bucket, key: bucket.key || bucket.date })
  },
  account: {
    kind: 'performance',
    calendar: () => els.accountCalendar,
    trigger: () => els.accountRangeTrigger,
    rangeKey: 'accountRange',
    compareKey: 'accountCompareRange',
    // Nothing is pre-fetched for this panel - every custom range is loaded on Apply.
    dataDays: () => [],
    activeRange: () => {
      const range = normalizedRange(state.accountRange);
      return range ? { start: parseKey(range.start), end: parseKey(range.end) } : null;
    },
    rerender: () => renderAccountInsights(),
    unsetLabel: 'Preset window'
  },
  ads: {
    kind: 'ads',
    calendar: () => els.adsCalendar,
    trigger: () => els.adsRangeTrigger,
    rangeKey: 'adsRange',
    compareKey: 'adsCompareRange',
    dataDays: () => [],
    activeRange: () => {
      const range = normalizedRange(state.adsRange) || defaultAdsRange();
      return { start: parseKey(range.start), end: parseKey(range.end) };
    },
    rerender: () => renderAds(),
    unsetLabel: 'Last 30 days',
    mapBucket: (bucket) => ({ ...bucket, value: metricNumber(bucket.metrics?.spend, 0) })
  }
};

// One percentage-change badge shared by every panel that compares two windows.
// `invert` is for costs (CPC, CPM, cost per result): a rise is bad news, so the colour
// flips while the signed percentage stays truthful.
function deltaBadge(current, previous, invert = false, format = compactNumber) {
  const a = metricNumber(current, 0);
  const b = metricNumber(previous, 0);
  const direction = a === b ? 'flat' : (a > b ? 'up' : 'down');
  const cls = invert && direction !== 'flat' ? (direction === 'up' ? 'down' : 'up') : direction;
  const pct = b === 0 ? null : ((a - b) / Math.abs(b)) * 100;
  const text = pct === null
    ? `vs ${format(b)}`
    : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs ${format(b)}`;
  return `<em class="delta-badge ${cls}">${escapeHtml(text)}</em>`;
}

// Kept as named wrappers so existing call sites (and the reach panel's day-only rule)
// keep working against the shared calendar.
function togglePerformanceCalendar(force) {
  toggleRangeCalendar('performance', force);
}

function toggleReachCalendar(force) {
  toggleRangeCalendar('reach', state.reachGranularity === 'day' ? force : false);
}

function toggleFollowerCalendar(force) {
  toggleRangeCalendar('follower', force);
}

function withCompareSuffix(text, compareRange) {
  const range = normalizedRange(compareRange);
  return range ? `${text} vs ${rangeChipLabel(range)}` : text;
}

function rangeFloorKey() {
  return dayKey(startOfDay(new Date(Date.now() - RANGE_FLOOR_DAYS * 86400000)));
}

function closeAllRangeCalendars() {
  for (const panel of Object.values(RANGE_PANELS)) {
    const el = panel.calendar();
    if (el && !el.hasAttribute('hidden')) {
      el.setAttribute('hidden', '');
      panel.trigger()?.setAttribute('aria-expanded', 'false');
    }
  }
  state.rangeCal = null;
}

function toggleRangeCalendar(panelKey, force) {
  const panel = RANGE_PANELS[panelKey];
  const el = panel?.calendar();
  if (!el) return;

  const shouldOpen = typeof force === 'boolean' ? force : el.hasAttribute('hidden');
  if (!shouldOpen) {
    el.setAttribute('hidden', '');
    panel.trigger()?.setAttribute('aria-expanded', 'false');
    if (state.rangeCal?.panel === panelKey) state.rangeCal = null;
    return;
  }

  closeAllRangeCalendars();
  const active = panel.activeRange();
  const base = active ? active.end : new Date();
  state.rangeCal = {
    panel: panelKey,
    view: new Date(base.getFullYear(), base.getMonth(), 1),
    target: 'primary',
    pending: null,
    draft: {
      primary: state[panel.rangeKey] ? { ...state[panel.rangeKey] } : null,
      compare: state[panel.compareKey] ? { ...state[panel.compareKey] } : null
    }
  };
  renderRangeCalendar();
  el.removeAttribute('hidden');
  panel.trigger()?.setAttribute('aria-expanded', 'true');
}

function anyRangeCalendarOpen() {
  return Object.values(RANGE_PANELS).some((panel) => {
    const el = panel.calendar();
    return el && !el.hasAttribute('hidden');
  });
}

function pickRangeDay(key) {
  const cal = state.rangeCal;
  if (!cal) return;
  if (key > dayKey(new Date()) || key < rangeFloorKey()) return;

  if (!cal.pending) {
    cal.pending = key;
  } else {
    cal.draft[cal.target] = cal.pending <= key
      ? { start: cal.pending, end: key }
      : { start: key, end: cal.pending };
    cal.pending = null;
    // First pick fills Range A, then the calendar offers to fill the comparison next.
    if (cal.target === 'primary' && !cal.draft.compare) cal.target = 'compare';
  }
  renderRangeCalendar();
}

function applyRangeCalendar() {
  const cal = state.rangeCal;
  if (!cal) return;
  const panel = RANGE_PANELS[cal.panel];
  state[panel.rangeKey] = cal.draft.primary;
  state[panel.compareKey] = cal.draft.compare;
  state.selectedInsight = null;
  toggleRangeCalendar(cal.panel, false);
  panel.rerender();
}

function resetRangeCalendar() {
  const cal = state.rangeCal;
  if (!cal) return;
  cal.draft = { primary: null, compare: null };
  cal.pending = null;
  cal.target = 'primary';
  applyRangeCalendar();
}

function rangeChipLabel(range) {
  if (!range) return 'Not set';
  return range.start === range.end
    ? shortDate(range.start)
    : `${shortDate(range.start)} - ${shortDate(range.end)}`;
}

function renderRangeCalendar() {
  const cal = state.rangeCal;
  if (!cal) return;
  const panel = RANGE_PANELS[cal.panel];
  const el = panel.calendar();
  if (!el) return;

  const year = cal.view.getFullYear();
  const month = cal.view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = new Date(year, month, 1).getDay();
  const todayKey = dayKey(new Date());
  const floorKey = rangeFloorKey();
  const dataDays = new Set(panel.dataDays().filter(Boolean));

  const primary = cal.draft.primary;
  const compare = cal.draft.compare;
  // What an unset Range A actually shows differs per panel - say so, not "All available".
  const unsetLabel = panel.unsetLabel || 'All available';
  const pendingKey = cal.pending;

  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  const prevDisabled = dayKey(new Date(year, month, 1)) <= floorKey;
  const nextDisabled = dayKey(new Date(year, month + 1, 1)) > todayKey;

  const blanks = Array.from({ length: lead }, () => '<span class="cal-blank"></span>').join('');
  const cells = Array.from({ length: daysInMonth }, (_, indexNo) => {
    const day = indexNo + 1;
    const key = dayKey(new Date(year, month, day));
    const classes = ['cal-day'];
    const outOfBounds = key > todayKey || key < floorKey;
    if (primary && key >= primary.start && key <= primary.end) classes.push('in-range');
    if (primary && key === primary.start) classes.push('is-start');
    if (primary && key === primary.end) classes.push('is-end');
    if (compare && key >= compare.start && key <= compare.end) classes.push('in-compare');
    if (key === pendingKey) classes.push('is-pending');
    if (key === todayKey) classes.push('is-today');
    if (dataDays.has(key)) classes.push('has-data');
    return `<button class="${classes.join(' ')}" type="button" data-cal-day="${key}"${outOfBounds ? ' disabled' : ''}>${day}</button>`;
  }).join('');

  const selection = pendingKey
    ? `From ${shortDate(pendingKey)} - pick the end day`
    : `Editing ${cal.target === 'compare' ? 'the comparison range' : 'range A'}`;

  el.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" type="button" data-cal-nav="-1" aria-label="Previous month"${prevDisabled ? ' disabled' : ''}>&lt;</button>
      <strong>${escapeHtml(monthLabel)}</strong>
      <button class="cal-nav" type="button" data-cal-nav="1" aria-label="Next month"${nextDisabled ? ' disabled' : ''}>&gt;</button>
    </div>
    <div class="cal-targets">
      <button class="cal-target${cal.target === 'primary' ? ' active' : ''}" type="button" data-cal-target="primary">
        <span>Range A</span><strong>${escapeHtml(primary ? rangeChipLabel(primary) : unsetLabel)}</strong>
      </button>
      <button class="cal-target${cal.target === 'compare' ? ' active' : ''}${compare ? ' has-value' : ''}" type="button" data-cal-target="compare">
        <span>Compare with</span><strong>${escapeHtml(rangeChipLabel(compare))}</strong>
      </button>
    </div>
    <div class="cal-grid cal-weekdays"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
    <div class="cal-grid cal-days">${blanks}${cells}</div>
    <div class="cal-foot">
      <span class="cal-selection">${escapeHtml(selection)}</span>
      <span class="cal-actions">
        <button class="cal-reset" type="button" data-cal-reset>${escapeHtml(unsetLabel)}</button>
        <button class="cal-apply" type="button" data-cal-apply>Apply</button>
      </span>
    </div>
    <p class="cal-hint">Dotted days are already loaded. Older ranges are fetched from Instagram on Apply, at weekly or monthly resolution.</p>
  `;
}

function bindRangeCalendar(panelKey) {
  const panel = RANGE_PANELS[panelKey];
  panel.trigger()?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleRangeCalendar(panelKey);
  });

  panel.calendar()?.addEventListener('click', (event) => {
    event.stopPropagation();
    const cal = state.rangeCal;
    if (!cal) return;

    const nav = event.target.closest('[data-cal-nav]');
    if (nav) {
      cal.view = new Date(cal.view.getFullYear(), cal.view.getMonth() + Number(nav.dataset.calNav), 1);
      renderRangeCalendar();
      return;
    }
    const target = event.target.closest('[data-cal-target]');
    if (target) {
      cal.target = target.dataset.calTarget;
      cal.pending = null;
      renderRangeCalendar();
      return;
    }
    if (event.target.closest('[data-cal-reset]')) {
      resetRangeCalendar();
      return;
    }
    if (event.target.closest('[data-cal-apply]')) {
      applyRangeCalendar();
      return;
    }
    const dayBtn = event.target.closest('[data-cal-day]');
    if (dayBtn && !dayBtn.disabled) pickRangeDay(dayBtn.dataset.calDay);
  });
}

// --- on-demand range data ---------------------------------------------------

function normalizedRange(range) {
  if (!range?.start || !range?.end) return null;
  return range.start <= range.end ? range : { start: range.end, end: range.start };
}

function rangeSpanLabel(range) {
  return range ? `${shortDate(range.start)} - ${shortDate(range.end)}` : '';
}

// True when the locally cached series already spans this range, so no network call is
// needed. Local points are contiguous from the oldest fetched day to today.
function localCoversRange(keys, range) {
  if (!keys.length || !range) return false;
  return range.start >= keys.reduce((min, key) => (key < min ? key : min), keys[0]);
}

// Fetch a historical range once and memoise it. `onDone` re-renders when it lands.
function requestRangeData(kind, range, onDone) {
  const cacheKey = `${kind}:${range.start}:${range.end}`;
  const cached = state.rangeData.get(cacheKey);
  if (cached) return cached;

  const entry = { status: 'loading', range };
  state.rangeData.set(cacheKey, entry);
  fetchJson(withAccount(`/api/insights/range?kind=${kind}&since=${range.start}&until=${range.end}`))
    .then((payload) => {
      state.rangeData.set(cacheKey, payload.available
        ? { status: 'ready', range, payload }
        : { status: 'error', range, reason: payload.reason || 'Instagram returned no data for this range.' });
    })
    .catch((error) => {
      state.rangeData.set(cacheKey, { status: 'error', range, reason: error.message || 'Could not load this range.' });
    })
    .finally(() => onDone());
  return state.rangeData.get(cacheKey);
}

// Resolve a range to chart points: straight from the local series when it covers the
// range, otherwise from the on-demand endpoint.
function resolveRangePoints(panelKey, range, localPoints, onDone) {
  const panel = RANGE_PANELS[panelKey];
  const bounded = normalizedRange(range);
  if (!bounded) return { status: 'empty', points: [] };

  if (localCoversRange(localPoints.map((point) => point.key), bounded)) {
    return {
      status: 'ready',
      granularity: 'day',
      local: true,
      points: localPoints
        .filter((point) => point.key >= bounded.start && point.key <= bounded.end)
        .sort((a, b) => a.key.localeCompare(b.key))
    };
  }

  const entry = requestRangeData(panel.kind, bounded, onDone);
  if (entry.status !== 'ready') return { ...entry, points: [] };
  const mapBucket = panel.mapBucket || ((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    metrics: bucket.metrics || {},
    byProduct: bucket.byProduct || {},
    value: metricNumber(bucket.metrics?.reach, 0),
    content: null
  }));
  return {
    status: 'ready',
    granularity: entry.payload.granularity,
    local: false,
    payload: entry.payload,
    points: entry.payload.series.map(mapBucket)
  };
}

// One place that turns a non-ready range into chart-body HTML, so a slow or refused
// range says why instead of rendering a bare "No data".
function rangeStatusHtml(resolved, range) {
  if (resolved.status === 'loading') {
    return `<div class="chart-empty is-loading">Loading ${escapeHtml(rangeSpanLabel(range))} from Instagram…</div>`;
  }
  if (resolved.status === 'error') {
    return `<div class="chart-empty">${escapeHtml(resolved.reason)}</div>`;
  }
  return '<div class="chart-empty">No data in this date range</div>';
}

function granularityNote(resolved) {
  if (!resolved || resolved.local || resolved.status !== 'ready') return '';
  const word = { day: 'daily', week: 'weekly', month: 'monthly' }[resolved.granularity] || 'bucketed';
  return ` Older ranges are fetched live from Instagram at ${word} resolution.`;
}

// Totals + percentage change between the two selected ranges.
function compareDeltaRow(primary, compare, metrics, primaryRange, compareRange) {
  const sum = (points, read) => points.reduce((total, point) => total + metricNumber(read(point), 0), 0);
  const cells = metrics.map((metric) => {
    const read = metric.read || ((point) => point.metrics?.[metric.key]);
    const a = sum(primary, read);
    const b = sum(compare, read);
    const pct = b === 0 ? null : ((a - b) / Math.abs(b)) * 100;
    const cls = a === b ? 'flat' : (a > b ? 'up' : 'down');
    const pctText = pct === null ? 'n/a' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    return `
      <div class="cmp-cell ${cls}">
        <span class="cmp-metric">${escapeHtml(metric.label)}</span>
        <strong>${compactNumber(a)}</strong>
        <span class="cmp-prev">vs ${compactNumber(b)}</span>
        <span class="cmp-pct">${escapeHtml(pctText)}</span>
      </div>`;
  }).join('');
  return `
    <div class="compare-summary">
      <div class="cmp-legend">
        <span><i class="legend-bar cmp-a"></i>A ${escapeHtml(rangeSpanLabel(primaryRange))}</span>
        <span><i class="legend-bar cmp-b"></i>B ${escapeHtml(rangeSpanLabel(compareRange))}</span>
      </div>
      <div class="cmp-grid">${cells}</div>
    </div>`;
}

// Fold a series into `count` contiguous buckets, summing as it goes. Two ranges are
// compared by position, so a 90-bucket daily range against a 13-bucket weekly one has to
// be levelled first - otherwise the shorter series bunches up at the left and reads as if
// the data ran out.
function resampleSeries(series, count) {
  if (series.length <= count) return series;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * series.length) / count);
    const end = Math.max(Math.floor(((index + 1) * series.length) / count), start + 1);
    const slice = series.slice(start, end);
    return {
      key: slice[0].key,
      label: slice.length > 1 ? `${slice[0].label} - ${slice[slice.length - 1].label}` : slice[0].label,
      value: slice.reduce((sum, point) => sum + point.value, 0)
    };
  });
}

// Two ranges rarely have the same number of buckets, so both are levelled to the coarser
// count and aligned by position: the first slice of A against the first slice of B.
function renderComparisonBars(rawPrimary, rawCompare, options) {
  const toValues = (series) => series.map((point) => ({
    key: point.key,
    label: point.label,
    value: metricNumber(options.read(point), 0)
  }));
  const slots = Math.min(rawPrimary.length, rawCompare.length) || Math.max(rawPrimary.length, rawCompare.length);
  const primary = resampleSeries(toValues(rawPrimary), slots);
  const compare = resampleSeries(toValues(rawCompare), slots);
  const levelled = primary.length !== rawPrimary.length || compare.length !== rawCompare.length;

  const width = 860;
  const height = 292;
  const padding = { top: 18, right: 18, bottom: 46, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...primary.map((point) => point.value), ...compare.map((point) => point.value));
  const slot = innerWidth / slots;
  const groupWidth = Math.min(58, slot * 0.78);
  const gap = Math.max(1.5, Math.min(4, groupWidth * 0.08));
  // One series (no comparison range) gets full-width bars instead of half a pair.
  const seriesCount = compare.length ? 2 : 1;
  const barWidth = Math.max(2, (groupWidth - gap * (seriesCount - 1)) / seriesCount);

  const bar = (point, slotIndex, seriesIndex, seriesLabel, rangeLabel) => {
    if (!point) return '';
    const value = point.value;
    const barHeight = Math.max(value > 0 ? 2 : 0, (value / maxValue) * innerHeight);
    const x = padding.left + slotIndex * slot + (slot - groupWidth) / 2 + seriesIndex * (barWidth + gap);
    const y = padding.top + innerHeight - barHeight;
    return `<rect class="chart-bar cmp-bar ${seriesIndex === 0 ? 'cmp-a' : 'cmp-b'} chart-click" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" role="button" tabindex="0" aria-label="${escapeAttribute(`${seriesLabel} ${point.label}: ${formatNumber(value)}`)}" ${insightAttrs({
      id: `cmp-${seriesIndex}-${slotIndex}-${point.key}`,
      title: `${options.metricLabel} - ${point.label}`,
      subtitle: `${seriesLabel} (${rangeLabel})`,
      source: options.source,
      metrics: [{ label: options.metricLabel, value: formatNumber(value) }]
    })}></rect>`;
  };

  const bars = Array.from({ length: slots }, (_, index) => (
    bar(primary[index], index, 0, options.primaryName || 'Range A', options.primaryLabel)
    + bar(compare[index], index, 1, 'Range B', options.compareLabel)
  )).join('');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + innerHeight - innerHeight * ratio;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + innerWidth}" y2="${y}"></line>
      <text class="chart-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${compactNumber(maxValue * ratio)}</text>
    `;
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(slots / 8));
  const labels = Array.from({ length: slots }, (_, index) => {
    if (index !== 0 && index !== slots - 1 && index % labelEvery !== 0) return '';
    const a = primary[index]?.label || '';
    const b = compare[index]?.label || '';
    const x = padding.left + index * slot + slot / 2;
    return `
      <text class="chart-label" x="${x}" y="${height - 24}" text-anchor="middle">${escapeHtml(a)}</text>
      <text class="chart-label cmp-b-label" x="${x}" y="${height - 12}" text-anchor="middle">${escapeHtml(b)}</text>`;
  }).join('');

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(options.ariaLabel)}">
      ${gridLines}
      ${bars}
      ${labels}
      <text class="chart-axis-label" x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">${escapeHtml(options.metricLabel)}</text>
    </svg>
    <p class="chart-note">${escapeHtml(options.note + (levelled ? ` Both periods are grouped into ${slots} equal slices so the bars line up; the totals above stay exact.` : ''))}</p>`;
}

init();

async function init() {
  try { state.usernameHidden = localStorage.getItem('multia-hide-username') === '1'; } catch {}
  applyUsernameMask();
  bindEvents();

  try {
    const me = await fetchJson('/api/auth/me');
    state.role = me.role;
  } catch {
    return; // fetchJson is already redirecting to sign-in
  }

  state.accountId = new URLSearchParams(location.search).get('account') || '';
  try {
    const info = await fetchJson('/api/accounts');
    state.accounts = info.accounts || [];
    state.defaultAccountId = info.defaultId || '';
  } catch {
    state.accounts = [];
  }
  if (state.accountId && !state.accounts.some((account) => account.id === state.accountId)) {
    state.accountId = ''; // URL names an account that no longer exists (or isn't this login's)
  }
  applyRoleUi();

  // A client with a single account has nothing to choose between - open it directly.
  if (state.role === 'client' && !state.accountId && state.accounts.length === 1) {
    state.accountId = state.accounts[0].id;
  }
  if (state.role === 'client' && !state.accounts.length) {
    showNoAccessNotice();
    return;
  }

  // With registered accounts, `/` is the all-accounts overview and `/?account=<id>`
  // is that account's full dashboard. With none, keep the classic demo dashboard.
  if (state.accounts.length && !state.accountId) {
    enterOverview();
    return;
  }

  populateAccountSwitcher();
  applyPage();
  window.addEventListener('hashchange', applyPage);
  await loadStatus();
  await refreshNow(true, false); // initial load: show last data, do not force a sync
  connectLiveStream();
}

// Append the selected account to a data endpoint so every metric stays per-account.
function withAccount(url) {
  if (!state.accountId) return url;
  return `${url}${url.includes('?') ? '&' : '?'}account=${encodeURIComponent(state.accountId)}`;
}

// Sync loader: the "dashboard assembles itself" panel for the first load, plus a slim
// top sweep bar for background syncs. Stages mirror the real server-side order.
const SYNC_STAGES = [
  'Connecting to Instagram Graph API…',
  'Loading account profile…',
  'Paging through your media…',
  'Fetching insights for every post…',
  'Loading audience demographics…',
  'Measuring follower movement…',
  'Composing your dashboard…'
];

const SYNC_TIPS = [
  "Reach counts unique accounts — repeats don't inflate it.",
  'Velocity is views gained since your last sync.',
  'Saves are the strongest intent signal a viewer can send.',
  'A content score of 80+ marks a Breakout post.',
  'Your best posting window comes from the posting heatmap.',
  'Click any point, bar or segment to see its exact numbers.',
  'Engagement rate is interactions divided by reach.'
];

const syncUi = {
  showTimer: null,
  stageTimer: null,
  tipTimer: null,
  cycleTimer: null,
  progressTimer: null,
  stage: 0,
  tip: 0,
  progress: 0,
  visible: false
};

function startSyncLoader() {
  document.body.classList.add('is-syncing');
  // The full loader is first-load only; a 400ms delay keeps fast cached loads flash-free.
  if (state.data || syncUi.visible || syncUi.showTimer) return;
  syncUi.showTimer = setTimeout(showSyncLoader, 400);
}

function showSyncLoader() {
  syncUi.showTimer = null;
  if (state.data || !els.syncLoader) return;
  syncUi.visible = true;
  syncUi.stage = 0;
  syncUi.tip = 0;
  syncUi.progress = 0;
  if (els.syncFill) els.syncFill.style.width = '0%';
  if (els.syncStage) els.syncStage.textContent = SYNC_STAGES[0];
  els.syncLoader.classList.remove('hidden');

  retriggerAssemble();
  syncUi.cycleTimer = setInterval(retriggerAssemble, 4600);
  syncUi.stageTimer = setInterval(() => {
    if (syncUi.stage < SYNC_STAGES.length - 1) {
      syncUi.stage += 1;
      swapSyncText(els.syncStage, SYNC_STAGES[syncUi.stage]);
    }
  }, 2200);
  syncUi.tipTimer = setInterval(() => {
    syncUi.tip = (syncUi.tip + 1) % SYNC_TIPS.length;
    swapSyncText(els.syncTip, SYNC_TIPS[syncUi.tip]);
  }, 3600);
  syncUi.progressTimer = setInterval(() => {
    // Ease toward 90% and hold - the bar only completes when real data arrives.
    syncUi.progress = Math.min(90, syncUi.progress + (90 - syncUi.progress) * 0.055 + 0.35);
    if (els.syncFill) els.syncFill.style.width = `${syncUi.progress.toFixed(1)}%`;
  }, 300);
}

function stopSyncLoader() {
  document.body.classList.remove('is-syncing');
  if (syncUi.showTimer) {
    clearTimeout(syncUi.showTimer);
    syncUi.showTimer = null;
  }
  if (!syncUi.visible) return;
  [syncUi.stageTimer, syncUi.tipTimer, syncUi.cycleTimer, syncUi.progressTimer].forEach((timer) => clearInterval(timer));
  syncUi.stageTimer = syncUi.tipTimer = syncUi.cycleTimer = syncUi.progressTimer = null;
  syncUi.visible = false;
  if (els.syncFill) els.syncFill.style.width = '100%';
  setTimeout(() => els.syncLoader?.classList.add('hidden'), 350);
}

function swapSyncText(el, text) {
  if (!el) return;
  el.classList.add('swap');
  setTimeout(() => {
    el.textContent = text;
    el.classList.remove('swap');
  }, 200);
}

// Restarting the class-driven animation keeps every SVG element in lockstep each cycle.
function retriggerAssemble() {
  const svg = els.syncLoader?.querySelector('.assemble');
  if (!svg) return;
  svg.classList.remove('play');
  void svg.getBoundingClientRect();
  svg.classList.add('play');
}

// Hash router: each sidebar item is its own page. All pages stay in the DOM and
// keep rendering on every sync - the router only controls which one is visible.
const APP_PAGES = ['overview', 'analytics', 'audience', 'ads', 'content', 'operations', 'pulse', 'reports', 'guide'];

function currentPage() {
  const hash = location.hash.replace('#', '');
  if (hash === 'reels') return 'content'; // legacy anchor
  if (hash === 'guide' && state.role === 'client') return 'overview'; // the guide is for the agency
  return APP_PAGES.includes(hash) ? hash : 'overview';
}

function applyPage() {
  const page = currentPage();
  document.querySelectorAll('.app-page').forEach((section) => {
    section.classList.toggle('active', section.dataset.page === page);
  });
  document.querySelectorAll('.nav-item').forEach((item) => {
    const href = item.getAttribute('href') || '';
    item.classList.toggle('active', href === `#${page}`);
  });
  if (page === 'ads') renderAds();
  window.scrollTo(0, 0);
}

// The server already refuses everything a client may not see; this only tidies the UI so
// they are never offered a link that would bounce them.
// Admin and Guide start hidden in the HTML and are revealed here for the admin only, so a
// client never sees them flash in before the role is known.
function applyRoleUi() {
  const isClient = state.role === 'client';
  els.adminNavItem?.classList.toggle('hidden', isClient);
  els.guideNavItem?.classList.toggle('hidden', isClient);
  els.accountsNavItem?.classList.toggle('hidden', isClient && state.accounts.length < 2);
}

function showNoAccessNotice() {
  document.querySelector('.main').innerHTML = `
    <section class="panel" style="margin:12vh auto 0;max-width:460px">
      <div class="panel-header"><div>
        <p class="section-label">Almost there</p>
        <h2>No account connected yet</h2>
      </div></div>
      <p class="panel-footnote" style="padding:0 18px 18px">Your login works, but no Instagram account has been assigned to it yet. Ask your Multia account manager to connect it.</p>
    </section>`;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  location.replace('/login');
}

// ---------------------------------------------------------------------------
// Meta Ads page
//
// Every figure is Meta's own: reach and frequency come from the whole-range total (never
// added up day by day), and CTR/CPC/CPM are Meta's totals, not averages of rows. The
// server enforces which ad account this login may see - it is reached only through the
// Instagram account the session is already allowed to read.
// ---------------------------------------------------------------------------

function defaultAdsRange() {
  const end = startOfDay(new Date());
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  return { start: dayKey(start), end: dayKey(end) };
}

function updateAdsRangeLabel() {
  if (!els.adsRangeLabel) return;
  const range = normalizedRange(state.adsRange);
  els.adsRangeLabel.textContent = withCompareSuffix(range ? rangeChipLabel(range) : 'Last 30 days', state.adsCompareRange);
}

function adsMoney(value, currency, compact = false) {
  const amount = metricNumber(value, 0);
  if (!currency) return compact ? compactNumber(amount) : formatNumber(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return formatNumber(amount); // unknown currency code - still show the number
  }
}

function renderAds() {
  if (!els.adsBody) return;
  updateAdsRangeLabel();
  // No point offering a date range for ads that aren't connected.
  els.adsRangeTrigger?.closest('.range-control')?.classList.toggle('hidden', state.hasAds !== true);
  if (state.hasAds === null) {
    els.adsBody.innerHTML = '<div class="chart-empty is-loading">Checking ads for this account…</div>';
    return;
  }
  if (!state.hasAds) {
    els.adsBody.innerHTML = adsNotEnabledHtml();
    return;
  }

  const primaryRange = normalizedRange(state.adsRange) || defaultAdsRange();
  const compareRange = normalizedRange(state.adsCompareRange);
  const primary = requestRangeData('ads', primaryRange, renderAds);
  const compare = compareRange ? requestRangeData('ads', compareRange, renderAds) : null;
  if (primary.status !== 'ready') {
    els.adsBody.innerHTML = rangeStatusHtml(primary, primaryRange);
    return;
  }
  if (compare && compare.status !== 'ready') {
    els.adsBody.innerHTML = rangeStatusHtml(compare, compareRange);
    return;
  }

  const a = primary.payload;
  const b = compare ? compare.payload : null;
  if (a.empty && (!b || b.empty)) {
    els.adsBody.innerHTML = `<div class="chart-empty">No ads ran between ${escapeHtml(rangeSpanLabel(primaryRange))}${b ? ' or in the comparison range' : ''}.</div>`;
    return;
  }

  const currency = a.currency || b?.currency || '';
  els.adsBody.innerHTML = [
    b ? `<p class="ai-compare-head">${escapeHtml(rangeSpanLabel(primaryRange))} <span>vs</span> ${escapeHtml(rangeSpanLabel(compareRange))}</p>` : '',
    adsKpiTiles(a, b, currency),
    adsResultTiles(a, b, currency),
    adsSpendChart(a, b, primaryRange, compareRange, currency),
    adsPlacementSplit(a, currency),
    adsCampaignTable(a, b, currency),
    `<p class="panel-footnote">${escapeHtml(adsFootnote(a))}</p>`
  ].join('');
}

// The Ads item is always in the nav; when no ad account is linked the page says so, and
// tells each role what to do about it.
function adsNotEnabledHtml() {
  const account = state.accounts.find((entry) => entry.id === state.accountId) || state.accounts[0];
  const name = account?.username ? `@${account.username}` : 'this account';
  const next = state.role === 'admin'
    ? `<p>Connect the Meta ad account for ${escapeHtml(name)} in Admin → <strong>Meta Ads</strong>. It needs a Facebook token with <strong>ads_read</strong>.</p>
       <a class="primary-button small-button" href="/admin">Connect an ad account</a>`
    : '<p>Your Multia account manager can switch this on by connecting your Meta ad account. Your ad spend, reach, clicks and campaign results will then appear here.</p>';
  return `
    <div class="ads-empty">
      <p class="ads-empty-title">Ads aren't enabled for ${escapeHtml(name)} yet</p>
      ${next}
    </div>`;
}

function adsTile({ label, value, prev, main, sub, invert = false, format }) {
  const delta = prev === undefined || prev === null ? '' : deltaBadge(value, prev, invert, format);
  return `<div class="ai-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(main)}</strong><small>${escapeHtml(sub)}</small>${delta}</div>`;
}

function adsKpiTiles(a, b, currency) {
  const t = a.totals;
  const p = b?.totals;
  const money = (value) => adsMoney(value, currency);
  const fixed = (digits, suffix = '') => (value) => `${metricNumber(value, 0).toFixed(digits)}${suffix}`;
  return `<div class="ai-tiles ads-tiles">${[
    { label: 'Spend', value: t.spend, prev: p?.spend, main: adsMoney(t.spend, currency, true), sub: money(t.spend), format: money },
    { label: 'Impressions', value: t.impressions, prev: p?.impressions, main: compactNumber(t.impressions), sub: formatNumber(t.impressions) },
    { label: 'Reach', value: t.reach, prev: p?.reach, main: compactNumber(t.reach), sub: 'unique people, whole range' },
    { label: 'Frequency', value: t.frequency, prev: p?.frequency, main: fixed(2)(t.frequency), sub: 'times each person saw an ad', format: fixed(2) },
    { label: 'Clicks', value: t.clicks, prev: p?.clicks, main: compactNumber(t.clicks), sub: `${formatNumber(t.linkClicks)} link clicks` },
    { label: 'CTR', value: t.ctr, prev: p?.ctr, main: fixed(2, '%')(t.ctr), sub: 'clicks per impression', format: fixed(2, '%') },
    { label: 'CPC', value: t.cpc, prev: p?.cpc, main: money(t.cpc), sub: 'cost per click', invert: true, format: money },
    { label: 'CPM', value: t.cpm, prev: p?.cpm, main: money(t.cpm), sub: 'cost per 1,000 impressions', invert: true, format: money }
  ].map(adsTile).join('')}</div>`;
}

// What the ads achieved, by Meta's own action types - no invented "results" number.
function adsResultTiles(a, b, currency) {
  if (!a.actions.length) return '';
  const previous = new Map((b?.actions || []).map((action) => [action.type, action]));
  const money = (value) => adsMoney(value, currency);
  const tiles = a.actions.slice(0, 4).map((action) => {
    const prev = b ? previous.get(action.type) : null;
    const cost = action.costPer === null ? 'cost not reported' : `${money(action.costPer)} each`;
    const countDelta = b ? deltaBadge(action.value, prev?.value ?? 0) : '';
    const costDelta = prev && action.costPer !== null && prev.costPer !== null
      ? deltaBadge(action.costPer, prev.costPer, true, money)
      : '';
    return `<div class="ai-tile"><span>${escapeHtml(action.label)}</span><strong>${escapeHtml(compactNumber(action.value))}</strong><small>${escapeHtml(cost)}</small>${countDelta}${costDelta}</div>`;
  });
  return `<p class="ads-subhead">Results</p><div class="ai-tiles ads-tiles">${tiles.join('')}</div>`;
}

function adsSpendChart(a, b, primaryRange, compareRange, currency) {
  if (!a.series.length && !b?.series.length) return '';
  const unit = { day: 'day', week: 'week', month: 'month' }[a.granularity] || 'period';
  return `<p class="ads-subhead">Spend by ${unit}</p>${renderComparisonBars(a.series, b ? b.series : [], {
    read: (point) => point.metrics.spend,
    metricLabel: currency ? `Spend (${currency})` : 'Spend',
    primaryName: b ? 'Range A' : 'Spend',
    primaryLabel: rangeSpanLabel(primaryRange),
    compareLabel: compareRange ? rangeSpanLabel(compareRange) : '',
    ariaLabel: b ? 'Ad spend, range A against range B' : 'Ad spend over time',
    source: 'Meta Marketing API insights, time_increment series.',
    note: b
      ? `Comparing ${rangeSpanLabel(primaryRange)} against ${rangeSpanLabel(compareRange)}, aligned bucket by bucket.`
      : `Spend per ${unit}, in the ad account's currency.`
  })}`;
}

const ADS_PLATFORM_COLORS = ['var(--ink)', 'var(--coral)', 'var(--amber)', 'var(--border-strong)', 'var(--subtle)'];

function adsPlacementSplit(a, currency) {
  const total = a.platforms.reduce((sum, platform) => sum + platform.spend, 0);
  if (!total) return '';
  const color = (index) => ADS_PLATFORM_COLORS[index % ADS_PLATFORM_COLORS.length];
  const segments = a.platforms.map((platform, index) => (
    `<span class="seg" style="width:${(platform.spend / total * 100).toFixed(2)}%;background:${color(index)}"></span>`
  )).join('');
  const legend = a.platforms.map((platform, index) => `
    <div><i style="background:${color(index)}"></i><span>${escapeHtml(platform.label)}</span><strong>${percent(platform.spend / total)}</strong><small>${escapeHtml(adsMoney(platform.spend, currency))}</small></div>`).join('');

  const igTotal = a.instagramPositions.reduce((sum, position) => sum + position.spend, 0);
  const positions = a.instagramPositions.length ? `
    <p class="ads-subhead">Instagram placements</p>
    <div class="table-wrap"><table class="ads-table">
      <thead><tr><th scope="col">Placement</th><th scope="col">Spend</th><th scope="col">Share of IG</th><th scope="col">Impressions</th><th scope="col">Clicks</th></tr></thead>
      <tbody>${a.instagramPositions.map((position) => `
        <tr>
          <td>${escapeHtml(position.label)}</td>
          <td>${escapeHtml(adsMoney(position.spend, currency))}</td>
          <td>${igTotal ? percent(position.spend / igTotal) : '—'}</td>
          <td>${formatNumber(position.impressions)}</td>
          <td>${formatNumber(position.clicks)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : '';

  return `
    <div class="ai-split">
      <div class="ai-split-head"><span>Where the money went</span><small>${escapeHtml(adsMoney(total, currency))} total</small></div>
      <div class="ai-split-bar" role="img" aria-label="Ad spend by platform">${segments}</div>
      <div class="ai-split-legend">${legend}</div>
    </div>${positions}`;
}

function adsCampaignTable(a, b, currency) {
  if (!a.campaigns.length) return '';
  const previous = new Map((b?.campaigns || []).map((campaign) => [campaign.id, campaign]));
  const money = (value) => adsMoney(value, currency);
  const rows = a.campaigns.map((campaign) => {
    const prev = previous.get(campaign.id);
    const change = !b ? '' : (prev ? deltaBadge(campaign.spend, prev.spend, false, money) : '<em class="delta-badge flat">new</em>');
    const top = campaign.topAction
      ? `${compactNumber(campaign.topAction.value)} ${campaign.topAction.label.toLowerCase()}${campaign.topAction.costPer === null ? '' : ` · ${money(campaign.topAction.costPer)} each`}`
      : '—';
    return `
      <tr>
        <td><strong>${escapeHtml(campaign.name)}</strong><small>${escapeHtml(campaign.objective)}</small></td>
        <td>${escapeHtml(money(campaign.spend))}${change}</td>
        <td>${formatNumber(campaign.impressions)}</td>
        <td>${formatNumber(campaign.reach)}</td>
        <td>${formatNumber(campaign.clicks)}</td>
        <td>${campaign.ctr.toFixed(2)}%</td>
        <td>${escapeHtml(money(campaign.cpc))}</td>
        <td>${escapeHtml(money(campaign.cpm))}</td>
        <td>${escapeHtml(top)}</td>
      </tr>`;
  }).join('');

  // Campaigns that only ran in the comparison range would otherwise vanish silently.
  const current = new Set(a.campaigns.map((campaign) => campaign.id));
  const ended = (b?.campaigns || []).filter((campaign) => !current.has(campaign.id) && campaign.spend > 0);
  const endedNote = ended.length
    ? `<p class="panel-footnote">Ran only in the comparison range: ${ended.map((campaign) => `${escapeHtml(campaign.name)} (${escapeHtml(money(campaign.spend))})`).join(', ')}.</p>`
    : '';

  return `
    <p class="ads-subhead">Campaigns</p>
    <div class="table-wrap"><table class="ads-table">
      <thead><tr>
        <th scope="col">Campaign</th><th scope="col">Spend</th><th scope="col">Impressions</th><th scope="col">Reach</th>
        <th scope="col">Clicks</th><th scope="col">CTR</th><th scope="col">CPC</th><th scope="col">CPM</th><th scope="col">Top result</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>${endedNote}`;
}

function adsFootnote(a) {
  const account = a.adAccount || {};
  const name = account.name ? `${account.name} (${account.id})` : (account.id || 'the connected ad account');
  return `Figures come straight from Meta's Marketing API for ${name}${a.currency ? `, in ${a.currency}` : ''}. `
    + `Dates follow the ad account's timezone${account.timezoneName ? ` (${account.timezoneName})` : ''}. `
    + 'Results use the attribution setting of each ad set in Ads Manager. Reach counts unique people across the whole range, so it is never the sum of daily reach.';
}

function populateAccountSwitcher() {
  if (!state.accounts.length) return;
  if (state.role === 'admin' || state.accounts.length > 1) els.allAccountsLink?.classList.remove('hidden');
  if (state.accounts.length < 2 || !els.accountSelect) return;

  els.accountSelect.innerHTML = state.accounts.map((account) => {
    const name = account.label || (account.username ? `@${account.username}` : account.id);
    const selected = account.id === state.accountId ? ' selected' : '';
    return `<option value="${escapeAttribute(account.id)}"${selected}>${escapeHtml(name)}</option>`;
  }).join('');
  els.accountSelectLabel?.classList.remove('hidden');
}

function enterOverview() {
  document.body.classList.add('view-overview');
  els.accountsOverview?.classList.remove('hidden');
  els.accountAvatar.textContent = 'IG';
  els.accountTitle.textContent = 'All accounts';
  els.accountMeta.textContent = `${state.accounts.length} registered account${state.accounts.length === 1 ? '' : 's'}`;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.getAttribute('href') === '/');
  });
  updateConnection('connected', 'Graph API');
  loadOverview();
}

async function loadOverview() {
  els.accountCards.innerHTML = state.accounts
    .map(() => '<article class="account-card skeleton"></article>')
    .join('');
  try {
    const summary = await fetchJson('/api/accounts/summary');
    renderAccountCards(summary.accounts || []);
  } catch (error) {
    els.accountCards.innerHTML = `<p class="overview-empty">${escapeHtml(error.message || 'Unable to load accounts.')}</p>`;
  }
}

function renderAccountCards(accounts) {
  if (!accounts.length) {
    els.accountCards.innerHTML = '<p class="overview-empty">No accounts registered yet. Add one from the <a href="/admin">admin page</a>.</p>';
    return;
  }

  els.accountCards.innerHTML = accounts.map((account) => {
    const name = account.username ? `@${account.username}` : account.id;
    const avatar = safeUrl(account.profilePictureUrl)
      ? `<img src="${escapeAttribute(safeUrl(account.profilePictureUrl))}" alt="" loading="lazy">`
      : escapeHtml(initials(account.username || 'IG'));
    const snapshot = account.snapshot;
    const followers = account.followers ?? snapshot?.followers;
    const dayNet = snapshot?.followerDayNet;
    const netBadge = typeof dayNet === 'number' && dayNet !== 0
      ? `<small class="${dayNet > 0 ? 'up' : 'down'}">${dayNet > 0 ? '+' : ''}${compactNumber(dayNet)} today</small>`
      : '';
    const stat = (label, value) => `
      <div>
        <span>${label}</span>
        <strong>${typeof value === 'number' ? compactNumber(value) : '—'}</strong>
      </div>`;

    return `
      <a class="account-card${account.error ? ' has-error' : ''}" href="/?account=${escapeAttribute(account.id)}">
        <div class="account-card-head">
          <span class="avatar">${avatar}</span>
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(account.label || account.id)}</small>
          </div>
        </div>
        ${account.error
          ? `<p class="account-card-error">${escapeHtml(account.error)}</p>`
          : `<div class="account-card-stats">
              <div><span>Followers</span><strong>${typeof followers === 'number' ? compactNumber(followers) : '—'}</strong>${netBadge}</div>
              ${stat('Views', snapshot?.views)}
              ${stat('Reach', snapshot?.reach)}
              ${stat('Interactions', snapshot?.interactions)}
            </div>`}
        <span class="account-card-cta">Open dashboard &rarr;</span>
      </a>`;
  }).join('');
}

function bindEvents() {
  els.refreshSelect.addEventListener('change', () => {
    state.refreshMs = Number(els.refreshSelect.value);
    connectLiveStream();
    // Persist the chosen interval so it survives reloads. It applies to every viewer,
    // so only the admin saves it; a client's choice lasts for their visit.
    if (state.role !== 'admin') return;
    fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshMs: state.refreshMs })
    }).catch(() => {});
  });

  els.manualRefresh.addEventListener('click', () => refreshNow());
  els.logoutButton?.addEventListener('click', logout);

  // Switching accounts is a plain navigation: the URL is the source of truth and
  // every piece of per-account view state resets cleanly.
  els.accountSelect?.addEventListener('change', () => {
    if (els.accountSelect.value && els.accountSelect.value !== state.accountId) {
      // Keep the current page (hash) when jumping between accounts.
      location.href = `/?account=${encodeURIComponent(els.accountSelect.value)}${location.hash}`;
    }
  });

  els.overviewRefresh?.addEventListener('click', loadOverview);

  els.toggleUsername?.addEventListener('click', () => {
    state.usernameHidden = !state.usernameHidden;
    try { localStorage.setItem('multia-hide-username', state.usernameHidden ? '1' : '0'); } catch {}
    applyUsernameMask();
    if (state.data) renderReport(); // keep the Creator Summary text in sync immediately
  });

  els.periodTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-period]');
    if (!button) return;

    state.period = button.dataset.period;
    els.periodTabs.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    render();
  });

  els.metricTabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-metric]');
    if (!button) return;

    state.chartMetric = button.dataset.metric;
    state.selectedInsight = null;
    els.metricTabs.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    renderCharts();
  });

  els.reachGranularityTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-reach-granularity]');
    if (!button) return;

    state.reachGranularity = button.dataset.reachGranularity;
    state.selectedInsight = null;
    els.reachGranularityTabs.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    renderCharts();
  });

  bindRangeCalendar('performance');
  bindRangeCalendar('reach');
  bindRangeCalendar('follower');
  bindRangeCalendar('account');
  bindRangeCalendar('ads');

  document.addEventListener('click', (event) => {
    if (event.target.closest('.range-control')) return;
    closeAllRangeCalendars();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && anyRangeCalendarOpen()) closeAllRangeCalendars();
  });

  // One delegated binding covers every chart on every page (there are multiple
  // .analytics-grid wrappers since the multipage split - never bind just the first).
  bindInsightSelection(document.querySelector('.main'));

  els.searchInput.addEventListener('input', () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    renderReels();
  });

  els.contentTypeSelect.addEventListener('change', () => {
    state.typeFilter = els.contentTypeSelect.value;
    render();
  });

  els.signalFilterSelect.addEventListener('change', () => {
    state.signalFilter = els.signalFilterSelect.value;
    render();
  });

  els.minViewsInput.addEventListener('input', () => {
    state.minViews = Math.max(0, Number(els.minViewsInput.value || 0));
    render();
  });

  els.sortSelect.addEventListener('change', () => {
    state.sort = els.sortSelect.value;
    state.sortDir = state.sort === 'timestamp' ? 'desc' : 'desc';
    renderReels();
  });

  document.querySelector('.table-wrap')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-sort]');
    if (!button) return;

    if (state.sort === button.dataset.sort) {
      state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      state.sort = button.dataset.sort;
      state.sortDir = defaultSortDir(state.sort);
    }
    if ([...els.sortSelect.options].some((option) => option.value === state.sort)) {
      els.sortSelect.value = state.sort;
    }
    renderReels();
  });

  document.querySelector('#reels')?.addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    const target = event.target.closest('[data-content-id]');
    if (!target) return;

    selectContent(target.dataset.contentId);
  });

  document.querySelector('#reels')?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    if (event.target.closest('a')) return;
    const target = event.target.closest('[data-content-id]');
    if (!target) return;

    event.preventDefault();
    selectContent(target.dataset.contentId);
  });

  els.exportCsv.addEventListener('click', exportCsv);
  els.copyReport.addEventListener('click', copyReport);
  els.exportPdf?.addEventListener('click', exportReportPdf);
  els.genderTimeframe?.addEventListener('change', () => {
    state.audienceTimeframe = els.genderTimeframe.value;
    if (state.audienceCompareTimeframe === state.audienceTimeframe) state.audienceCompareTimeframe = null;
    renderGenderBreakdown();
  });
  els.genderCompare?.addEventListener('change', () => {
    state.audienceCompareTimeframe = els.genderCompare.value || null;
    renderGenderBreakdown();
  });
  els.accountWindow?.addEventListener('change', () => {
    state.accountWindow = els.accountWindow.value;
    // A preset window and a custom range are alternatives - picking one drops the other.
    state.accountRange = null;
    state.accountCompareRange = null;
    renderAccountInsights();
  });
}

async function loadStatus() {
  try {
    const status = await fetchJson(withAccount('/api/status'));
    state.refreshMs = status.refreshMs || state.refreshMs;
    state.hasAds = Boolean(status.hasAds);
    if (currentPage() === 'ads') renderAds();
    els.refreshSelect.value = String(closestRefreshOption(state.refreshMs));
    updateConnection(status.mode === 'graph-api' ? 'connected' : 'demo', status.mode === 'graph-api' ? 'Graph API' : 'Demo mode');
  } catch {
    updateConnection('error', 'Offline');
  }
}

function exportCsv() {
  if (!state.data) return;

  const rows = getVisibleContent();
  const headers = [
    'id',
    'type',
    'caption',
    'views',
    'reach',
    'likes',
    'comments',
    'shares',
    'saves',
    'interactions',
    'engagement_rate',
    'content_score',
    'signals',
    'posted_at',
    'permalink'
  ];
  const csv = [
    headers.join(','),
    ...rows.map((item) => headers.map((key) => csvValue(csvField(item, key))).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `instagram-content-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvField(item, key) {
  if (key === 'type') return item.contentTypeLabel;
  if (key === 'engagement_rate') return item.engagementRate;
  if (key === 'content_score') return item.contentScore;
  if (key === 'signals') return (item.signalTags || []).join('|');
  if (key === 'posted_at') return item.timestamp;
  return item[key] ?? '';
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function refreshNow(silent = false, force = true) {
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  startSyncLoader();
  if (!silent) {
    els.manualRefresh.disabled = true;
    els.manualRefresh.textContent = 'Syncing';
  }

  try {
    // Only a button click or the scheduled poll forces a fresh sync (force=1).
    // A plain page load reads the last data without re-syncing.
    const data = await fetchJson(withAccount(`/api/instagram?all=1&limit=1000${force ? '&force=1' : ''}`));
    updateData(data);
    updateLiveBadge(data.mode === 'graph-api' ? 'connected' : 'demo', data.mode === 'graph-api' ? 'Live' : 'Demo live');
  } catch (error) {
    showWarning([error.message || 'Unable to sync dashboard data']);
    updateConnection('error', 'Sync error');
    updateLiveBadge('error', 'Reconnecting');
  } finally {
    state.isRefreshing = false;
    stopSyncLoader();
    if (!silent) {
      els.manualRefresh.disabled = false;
      els.manualRefresh.textContent = 'Sync now';
    }
  }
}

// Serverless hosts (Vercel) can't hold an SSE connection open, so "live" is interval
// polling. Works the same on a long-running server too - just simpler.
function connectLiveStream() {
  if (state.pollTimer) clearInterval(state.pollTimer);

  if (!state.data) {
    updateLiveBadge('loading', 'Connecting');
  } else {
    updateLiveBadge(state.data.mode === 'graph-api' ? 'connected' : 'demo', state.data.mode === 'graph-api' ? 'Live' : 'Demo live');
  }

  state.pollTimer = setInterval(() => refreshNow(true), state.refreshMs);
}

function updateData(data) {
  state.data = data;
  updateConnection(data.mode === 'graph-api' ? 'connected' : 'demo', data.mode === 'graph-api' ? 'Graph API' : 'Demo mode');
  updateLiveBadge(data.mode === 'graph-api' ? 'connected' : 'demo', data.mode === 'graph-api' ? 'Live' : 'Demo live');
  render();
}

function render() {
  if (!state.data) return;

  renderAccount();
  renderWarnings();
  renderSummary();
  renderCharts();
  renderActivity();
  renderTopReels();
  renderContentMix();
  renderAccuracyCenter();
  renderFollowerPanel();
  renderAudience();
  renderCompareBoard();
  renderReport();
  renderContentDetail();
  renderReels();
}

// Toggle for hiding the username (e.g. for screenshots). Persisted so it stays hidden.
function applyUsernameMask() {
  const hidden = state.usernameHidden;
  if (els.toggleUsername) {
    els.toggleUsername.innerHTML = hidden ? EYE_OFF_SVG : EYE_SVG;
    els.toggleUsername.setAttribute('aria-pressed', String(hidden));
    els.toggleUsername.setAttribute('aria-label', hidden ? 'Show username' : 'Hide username');
    els.toggleUsername.title = hidden ? 'Show username' : 'Hide username';
  }
  if (!state.data) return;
  const username = state.data.account.username || 'instagram';
  els.accountTitle.textContent = hidden ? '@••••••••' : `@${username}`;
  if (!safeUrl(state.data.account.profilePictureUrl)) {
    els.accountAvatar.textContent = hidden ? '•' : initials(username);
  }
}

function renderAccount() {
  const { account, summary, updatedAt, graphApiVersion } = state.data;
  els.accountMeta.textContent = `${formatNumber(account.followers)} followers - ${formatNumber(summary.contentCount)} items loaded - ${graphApiVersion}`;
  els.lastUpdated.textContent = `Updated ${formatTime(updatedAt)}`;

  const profilePictureUrl = safeUrl(account.profilePictureUrl);
  if (profilePictureUrl) {
    els.accountAvatar.innerHTML = `<img src="${escapeAttribute(profilePictureUrl)}" alt="">`;
  } else {
    els.accountAvatar.textContent = initials(account.username);
  }
  applyUsernameMask();
}

function renderWarnings() {
  showWarning(state.data.warnings || []);
}

function signedCompact(value) {
  const number = Number(value) || 0;
  return `${number < 0 ? '−' : '+'}${compactNumber(Math.abs(number))}`;
}

function renderSummary() {
  const summary = state.data.summary;
  const account = state.data.account;
  const day = summary.dayDelta;
  const dayReady = Boolean(day && day.available);
  const dayTitle = dayReady
    ? (day.basis === 'previous-day' ? `Change vs ${shortDate(day.sinceDate)}` : 'Change so far today')
    : 'Change since last sync';
  // Visible note so the user knows exactly what the +/- is measured against.
  const deltaRef = dayReady
    ? (day.sinceTime
      ? `vs ${formatDateTime(day.sinceTime)}`
      : (day.basis === 'previous-day' ? `vs ${shortDate(day.sinceDate)}` : 'vs start of today'))
    : 'vs last sync';
  const viewsDelta = dayReady ? signedCompact(day.views) : `+${compactNumber(summary.deltaViews)}`;
  const interactionsDelta = dayReady ? signedCompact(day.interactions) : `+${compactNumber(summary.deltaInteractions)}`;
  const cards = [
    {
      label: 'Views',
      value: metricCompact(summary.totalViews, 'views'),
      exact: metricExact(summary.totalViews),
      delta: viewsDelta,
      deltaTitle: dayTitle,
      deltaNote: deltaRef,
      sub: `All-time · ${formatNumber(summary.contentCount)} posts`
    },
    {
      label: 'Reach',
      value: metricCompact(summary.totalReach, 'reach'),
      exact: metricExact(summary.totalReach),
      delta: `${percent(summary.totalReach ? summary.totalViews / summary.totalReach : 0)} v/r`,
      sub: 'Sum of post reach · repeats counted'
    },
    {
      label: 'Interactions',
      value: metricCompact(summary.totalInteractions, 'interactions'),
      exact: metricExact(summary.totalInteractions),
      delta: interactionsDelta,
      deltaTitle: dayTitle,
      deltaNote: deltaRef,
      sub: `${compactNumber(summary.totalLikes)} likes`
    },
    {
      label: 'Engagement quality',
      value: metricPercent(summary.engagementRate),
      exact: isMetricKnown(summary.engagementRate)
        ? `${formatNumber(summary.totalInteractions)} interactions / ${formatNumber(summary.totalReach)} reach`
        : 'Unavailable',
      delta: `${compactNumber(summary.reelCount)} reels`,
      sub: `${compactNumber(summary.postCount)} feed posts`
    },
    {
      label: 'Followers',
      value: compactNumber(account.followers),
      exact: formatNumber(account.followers),
      delta: `${formatNumber(account.follows)} following`,
      sub: `${formatNumber(account.mediaCount)} account media`
    }
  ];

  els.summaryGrid.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <h3>${escapeHtml(card.label)}</h3>
      <div class="metric-value">${escapeHtml(card.value)}</div>
      <div class="metric-exact">${escapeHtml(card.exact)}</div>
      <div class="metric-subline">
        <span>${escapeHtml(card.sub)}</span>
        <span class="delta"${card.deltaTitle ? ` title="${escapeAttribute(card.deltaTitle)}"` : ''}>${escapeHtml(card.delta)}</span>
      </div>
      ${card.deltaNote ? `<div class="delta-note">${escapeHtml(card.deltaNote)}</div>` : ''}
    </article>
  `).join('');

  animateMetricCountUp(summary, account);
}

// One-time finisher: the first populated render counts the KPI values up from 0.
function animateMetricCountUp(summary, account) {
  if (state.metricsAnimated) return;
  state.metricsAnimated = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = [
    isMetricKnown(summary.totalViews) ? metricNumber(summary.totalViews) : null,
    isMetricKnown(summary.totalReach) ? metricNumber(summary.totalReach) : null,
    isMetricKnown(summary.totalInteractions) ? metricNumber(summary.totalInteractions) : null,
    null, // engagement quality is a percentage - it lands as-is
    metricNumber(account.followers, null)
  ];
  const valueEls = document.querySelectorAll('#summary-grid .metric-value');
  const startedAt = performance.now();
  const duration = 700;

  const tick = (now) => {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    targets.forEach((target, index) => {
      if (target === null || !valueEls[index]) return;
      valueEls[index].textContent = compactNumber(Math.round(target * eased));
    });
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderCharts() {
  const content = getVisibleContent({ includeQuery: false, includeSignal: false, includeMinViews: false });
  renderTrendChart(content);
  renderAccountReachChart(content);
  renderFunnelChart(content);
  renderSavesSharesChart(content);
  renderHeatmapChart(content);
  renderDistributionChart(content);
  renderEngagementMix(content);
  renderSelectedInsight();
  markSelectedInsight();

  // Date span of the loaded set these charts draw from, shown under each title.
  const rangeLabel = formatRangeLabel(content);
  [
    els.funnelChart,
    els.savesSharesChart,
    els.heatmapChart,
    els.distributionChart,
    els.engagementChart
  ].forEach((bodyEl) => setPanelDates(bodyEl, rangeLabel));
}

function setSelectedInsight(target) {
  const metrics = parseInsightMetrics(target.dataset.metrics);
  state.selectedInsight = {
    id: target.dataset.insightId || target.dataset.insight || '',
    title: target.dataset.title || target.getAttribute('aria-label') || 'Graph value',
    subtitle: target.dataset.subtitle || '',
    source: target.dataset.source || '',
    metrics
  };
  renderSelectedInsight();
  markSelectedInsight();
}

function bindInsightSelection(container) {
  if (!container) return;
  container.addEventListener('click', (event) => {
    const target = event.target.closest('[data-insight]');
    if (!target || !container.contains(target)) return;
    setSelectedInsight(target);
  });

  container.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const target = event.target.closest('[data-insight]');
    if (!target || !container.contains(target)) return;

    event.preventDefault();
    setSelectedInsight(target);
  });
}

function renderSelectedInsight() {
  const targets = document.querySelectorAll('.chart-insight');
  if (!targets.length) return;

  if (!state.selectedInsight) {
    targets.forEach((target) => {
      target.innerHTML = '<p class="insight-empty">Select any point, bar or segment to see its exact numbers.</p>';
    });
    return;
  }

  const insight = state.selectedInsight;
  const html = `
    <div class="insight-copy">
      <strong>${escapeHtml(insight.title)}</strong>
      ${insight.subtitle ? `<span>${escapeHtml(insight.subtitle)}</span>` : ''}
    </div>
    <div class="insight-metrics">
      ${insight.metrics.map((metric) => `
        <div>
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </div>
      `).join('')}
    </div>
    ${insight.source ? `<p class="insight-source">${escapeHtml(insight.source)}</p>` : ''}
  `;
  targets.forEach((target) => {
    target.innerHTML = html;
  });
}

function markSelectedInsight() {
  document.querySelectorAll('[data-insight-id]').forEach((element) => {
    element.classList.toggle('selected', Boolean(state.selectedInsight?.id && element.dataset.insightId === state.selectedInsight.id));
  });
}

function renderLegacyTrendChart(content) {
  const metric = state.chartMetric;
  const metricName = metricTitle(metric);
  const trend = buildTrendFromContent(content, metric);
  setPanelDates(els.trendChart, trend.length ? `${shortDate(trend[0].key)} – ${shortDate(trend[trend.length - 1].key)}` : '');
  const maxValue = Math.max(1, ...trend.map((item) => item.value));
  const scaleRatio = (value) => {
    const safe = Math.max(0, value);
    return safe / maxValue;
  };

  if (!trend.some((item) => item.value > 0)) {
    els.trendChart.innerHTML = '<div class="chart-empty">No metric values in this window</div>';
    return;
  }

  const width = 820;
  const height = 270;
  const padding = { top: 18, right: 18, bottom: 34, left: 58 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const step = trend.length > 1 ? innerWidth / (trend.length - 1) : innerWidth;
  const points = trend.map((item, index) => {
    const x = padding.left + index * step;
    const y = padding.top + innerHeight - scaleRatio(item.value) * innerHeight;
    return { ...item, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${padding.left},${padding.top + innerHeight} ${line} ${padding.left + innerWidth},${padding.top + innerHeight}`;
  const maxContent = Math.max(1, ...trend.map((item) => item.content));
  const bars = points.map((point) => {
    const barWidth = Math.max(7, Math.min(24, step * 0.36));
    const barHeight = Math.max(2, (point.content / maxContent) * innerHeight * 0.34);
    const x = point.x - barWidth / 2;
    const y = padding.top + innerHeight - barHeight;
    return `<rect class="chart-bar chart-click" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" role="button" tabindex="0" aria-label="${escapeAttribute(`${point.label}: ${formatNumber(point.content)} items published`)}" ${insightAttrs({
      id: `trend-count-${point.key}`,
      title: `${point.label} publishing volume`,
      subtitle: 'Items published in this date bucket',
      source: 'Local calculation from loaded media timestamps.',
      metrics: [
        { label: 'Items published', value: formatNumber(point.content) },
        { label: metricName, value: compactNumber(point.value) }
      ]
    })}></rect>`;
  }).join('');
  const labels = points
    .filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 4) === 0)
    .map((point) => `<text class="chart-label" x="${point.x}" y="${height - 10}" text-anchor="middle">${escapeHtml(point.label)}</text>`)
    .join('');
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + innerHeight - innerHeight * ratio;
    const value = maxValue * ratio;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + innerWidth}" y2="${y}"></line>
      <text class="chart-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${compactNumber(value)}</text>
    `;
  }).join('');
  const peak = points.slice().sort((a, b) => b.value - a.value)[0];
  const latestNonZero = points.slice().reverse().find((point) => point.value > 0) || points[points.length - 1];
  const valueLabels = points
    .filter((point) => point === peak || point === latestNonZero)
    .map((point) => `<text class="chart-value-label" x="${point.x}" y="${Math.max(14, point.y - 10)}" text-anchor="${point === latestNonZero ? 'end' : 'middle'}">${compactNumber(point.value)}</text>`)
    .join('');
  const circles = points.map((point) => `<circle class="chart-point chart-click" cx="${point.x}" cy="${point.y}" r="${point === peak ? 5 : 4}" role="button" tabindex="0" aria-label="${escapeAttribute(`${point.label}: ${compactNumber(point.value)} ${metricName}`)}" ${insightAttrs({
    id: `trend-${metric}-${point.key}`,
    title: `${metricName} on ${point.label}`,
    subtitle: `${formatNumber(point.content)} item${point.content === 1 ? '' : 's'} published in this bucket`,
    source: `Line shows total ${metricName.toLowerCase()} from loaded content grouped by publish date.`,
    metrics: [
      { label: metricName, value: compactNumber(point.value) },
      { label: 'Items published', value: formatNumber(point.content) }
    ]
  })}></circle>`).join('');

  els.trendChart.innerHTML = `
    <div class="chart-legend">
      <span><i class="legend-line"></i>${escapeHtml(metricName)}</span>
      <span><i class="legend-bar"></i>Items published</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(metricName)} by publish date">
      ${gridLines}
      ${bars}
      <polygon class="chart-area" points="${area}"></polygon>
      <polyline class="chart-line" points="${line}"></polyline>
      ${circles}
      ${valueLabels}
      ${labels}
      <text class="chart-axis-label" x="${padding.left + innerWidth / 2}" y="${height - 2}" text-anchor="middle">Publish date</text>
      <text class="chart-axis-label" x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">${escapeHtml(metricName)}</text>
    </svg>
  `;
}

function renderTrendChart(content) {
  const source = trendDailySource(content);
  const range = activePerformanceRange(source.points);
  updatePerformanceRangeLabel(range);

  const primaryRange = normalizedRange(state.performanceRange)
    || (range ? { start: dayKey(range.start), end: dayKey(range.end) } : null);
  const resolved = resolveRangePoints('performance', primaryRange, source.points, renderCharts);
  const compareRange = normalizedRange(state.performanceCompareRange);
  const resolvedCompare = compareRange
    ? resolveRangePoints('performance', compareRange, source.points, renderCharts)
    : null;

  if (resolved.status !== 'ready') {
    setPanelDates(els.trendChart, rangeSpanLabel(primaryRange));
    els.trendChart.innerHTML = rangeStatusHtml(resolved, primaryRange);
    return;
  }
  if (resolvedCompare && resolvedCompare.status !== 'ready') {
    setPanelDates(els.trendChart, rangeSpanLabel(primaryRange));
    els.trendChart.innerHTML = rangeStatusHtml(resolvedCompare, compareRange);
    return;
  }

  const points = resolved.points;
  setPanelDates(els.trendChart, points.length ? `${shortDate(points[0].key)} - ${shortDate(points[points.length - 1].key)}` : '');

  if (!points.length || !points.some((point) => trendMetricConfigs().some((metric) => metricValue(point, metric.key) > 0))) {
    els.trendChart.innerHTML = '<div class="chart-empty">No account performance in this date range</div>';
    return;
  }

  if (resolvedCompare && resolvedCompare.points.length) {
    const active = trendMetricConfigs().find((entry) => entry.key === state.chartMetric) || trendMetricConfigs()[0];
    els.trendChart.innerHTML = compareDeltaRow(points, resolvedCompare.points, trendMetricConfigs(), primaryRange, compareRange)
      + renderComparisonBars(points, resolvedCompare.points, {
        read: (point) => metricValue(point, active.key),
        metricLabel: active.label,
        primaryLabel: rangeSpanLabel(primaryRange),
        compareLabel: rangeSpanLabel(compareRange),
        ariaLabel: `${active.label}: range A against range B`,
        source: source.source,
        note: `Comparing ${rangeSpanLabel(primaryRange)} against ${rangeSpanLabel(compareRange)}, aligned bucket by bucket.${granularityNote(resolved)}${granularityNote(resolvedCompare)}`
      });
    return;
  }

  const metrics = trendMetricConfigs();
  const activeMetric = state.chartMetric;
  const width = 860;
  const height = 292;
  const padding = { top: 18, right: 18, bottom: 42, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...points.flatMap((point) => metrics.map((metric) => metricValue(point, metric.key))));
  const slot = innerWidth / points.length;
  const groupWidth = Math.min(58, slot * 0.78);
  const gap = Math.max(1.5, Math.min(4, groupWidth * 0.08));
  const barWidth = Math.max(2, (groupWidth - gap * (metrics.length - 1)) / metrics.length);

  const bars = points.flatMap((point, dayIndex) => metrics.map((metric, metricIndex) => {
    const value = metricValue(point, metric.key);
    const barHeight = Math.max(value > 0 ? 2 : 0, (value / maxValue) * innerHeight);
    const x = padding.left + dayIndex * slot + (slot - groupWidth) / 2 + metricIndex * (barWidth + gap);
    const y = padding.top + innerHeight - barHeight;
    const classes = ['chart-bar', 'trend-bar', metric.key, 'chart-click'];
    if (metric.key === activeMetric) classes.push('active');
    if (metric.key !== activeMetric) classes.push('muted');
    return `<rect class="${classes.join(' ')}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" role="button" tabindex="0" aria-label="${escapeAttribute(`${point.label}: ${formatNumber(value)} ${metric.label.toLowerCase()}`)}" ${insightAttrs({
      id: `trend-${metric.key}-${point.key}`,
      title: `${metric.label} on ${point.label}`,
      subtitle: source.subtitle,
      source: source.source,
      metrics: trendInsightMetrics(point, metric.key)
    })}></rect>`;
  })).join('');

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const labels = points.map((point, index) => (index === 0 || index === points.length - 1 || index % labelEvery === 0)
    ? `<text class="chart-label" x="${padding.left + index * slot + slot / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(point.label)}</text>`
    : '').join('');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + innerHeight - innerHeight * ratio;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + innerWidth}" y2="${y}"></line>
      <text class="chart-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${compactNumber(maxValue * ratio)}</text>
    `;
  }).join('');

  els.trendChart.innerHTML = `
    <div class="chart-legend">
      ${metrics.map((metric) => `<span><i class="legend-bar ${metric.key}"></i>${escapeHtml(metric.label)}</span>`).join('')}
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily account views, reach and interactions">
      ${gridLines}
      ${bars}
      ${labels}
      <text class="chart-axis-label" x="${padding.left + innerWidth / 2}" y="${height - 1}" text-anchor="middle">Day</text>
      <text class="chart-axis-label" x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">Account metrics</text>
    </svg>
    <p class="chart-note">${escapeHtml(source.note + granularityNote(resolved))}</p>
  `;
}

function trendMetricConfigs() {
  return [
    { key: 'views', label: 'Views' },
    { key: 'reach', label: 'Reach' },
    { key: 'interactions', label: 'Interactions' }
  ];
}

function trendDailySource(content) {
  const accountPoints = trendAccountDailyPoints();
  if (accountPoints.length) {
    return {
      type: 'account',
      points: accountPoints,
      subtitle: 'Account activity in this Meta insight day',
      note: 'Day-wise Instagram account totals from Graph API. Product split uses media_product_type when Meta returns it.',
      source: 'Graph API /insights period=day metric_type=total_value, using exact Meta daily bucket windows. This is day-wise account activity, not publish-date grouping.'
    };
  }

  return {
    type: 'content',
    points: trendContentDailyPoints(content),
    subtitle: 'Fallback grouped by publish date',
    note: 'Fallback: loaded media totals grouped by publish date because account daily performance is unavailable.',
    source: 'Fallback from loaded media insights grouped by publish date.'
  };
}

function trendAccountDailyPoints() {
  const daily = state.data?.accountInsights?.dailyPerformance;
  if (!daily?.available || !Array.isArray(daily.series)) return [];
  return daily.series
    .map((point) => ({
      key: point.date,
      label: shortDate(point.date),
      metrics: {
        views: metricNumber(point.metrics?.views, 0),
        reach: metricNumber(point.metrics?.reach, 0),
        interactions: metricNumber(point.metrics?.interactions, 0),
        likes: metricNumber(point.metrics?.likes, 0),
        comments: metricNumber(point.metrics?.comments, 0),
        shares: metricNumber(point.metrics?.shares, 0),
        saves: metricNumber(point.metrics?.saves, 0),
        profileViews: metricNumber(point.metrics?.profileViews, 0)
      },
      byProduct: point.byProduct || {}
    }))
    .filter((point) => point.key);
}

function trendContentDailyPoints(content) {
  const datedContent = content
    .map((item) => ({ item, date: new Date(item.timestamp) }))
    .filter(({ date }) => Number.isFinite(date.getTime()));
  const today = startOfDay(new Date());
  const days = state.period === 'all' ? 30 : Number(state.period);
  const earliest = state.period === 'all' && datedContent.length
    ? startOfDay(new Date(Math.min(...datedContent.map(({ date }) => date.getTime()))))
    : startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  const totalDays = Math.max(1, Math.round((today.getTime() - earliest.getTime()) / 86400000) + 1);
  const stepDays = state.period === 'all' && totalDays > 60 ? Math.ceil(totalDays / 60) : 1;
  const buckets = [];

  for (let offset = 0; offset < totalDays; offset += stepDays) {
    const date = new Date(earliest);
    date.setDate(earliest.getDate() + offset);
    const end = new Date(date);
    end.setDate(date.getDate() + stepDays);
    buckets.push({
      key: dayKey(date),
      label: shortDate(dayKey(date)),
      start: date,
      end,
      metrics: { views: 0, reach: 0, interactions: 0, likes: 0, comments: 0, shares: 0, saves: 0, profileViews: 0 },
      byProduct: {}
    });
  }

  for (const { item, date } of datedContent) {
    const bucket = buckets.find((entry) => date >= entry.start && date < entry.end);
    if (!bucket) continue;
    const product = productKeyForContent(item);
    if (!bucket.byProduct[product]) bucket.byProduct[product] = {};
    ['views', 'reach', 'interactions', 'likes', 'comments', 'shares', 'saves'].forEach((metric) => {
      const value = metricNumber(item[metric], 0);
      bucket.metrics[metric] += value;
      bucket.byProduct[product][metric] = metricNumber(bucket.byProduct[product][metric], 0) + value;
    });
  }

  return buckets;
}

function trendPointsForPeriod(points) {
  const sorted = points.slice().sort((a, b) => a.key.localeCompare(b.key));
  if (state.period === 'all' || !sorted.length) return sorted;

  const days = Number(state.period);
  const latest = parseKey(sorted[sorted.length - 1].key);
  if (!Number.isFinite(latest.getTime())) return sorted;
  const earliest = new Date(latest);
  earliest.setDate(latest.getDate() - (days - 1));
  const earliestKey = dayKey(earliest);
  return sorted.filter((point) => point.key >= earliestKey);
}

function pointDateBounds(points) {
  const times = points
    .map((point) => parseKey(point.key).getTime())
    .filter((time) => Number.isFinite(time));
  if (!times.length) return null;
  return {
    min: startOfDay(new Date(Math.min(...times))),
    max: startOfDay(new Date(Math.max(...times)))
  };
}

function activePerformanceRange(points) {
  const bounds = pointDateBounds(points);
  if (!bounds) return null;
  if (state.performanceRange?.start && state.performanceRange?.end) {
    return { start: startOfDay(parseKey(state.performanceRange.start)), end: startOfDay(parseKey(state.performanceRange.end)) };
  }
  return { start: bounds.min, end: bounds.max };
}

function updatePerformanceRangeLabel(range) {
  if (!els.performanceRangeLabel) return;
  if (!range) {
    els.performanceRangeLabel.textContent = 'No data';
    return;
  }
  els.performanceRangeLabel.textContent = withCompareSuffix(state.performanceRange?.start
    ? `${shortDate(dayKey(range.start))} - ${shortDate(dayKey(range.end))}`
    : 'All available', state.performanceCompareRange);
}

function metricValue(point, metric) {
  return metricNumber(point.metrics?.[metric], 0);
}

function trendInsightMetrics(point, activeMetric) {
  const metrics = trendMetricConfigs().map((metric) => ({
    label: metric.label,
    value: formatNumber(metricValue(point, metric.key))
  }));
  const extraMetrics = [
    ['Likes', point.metrics?.likes],
    ['Comments', point.metrics?.comments],
    ['Shares', point.metrics?.shares],
    ['Saves', point.metrics?.saves],
    ['Profile views', point.metrics?.profileViews]
  ].filter(([, value]) => metricNumber(value, 0) > 0);

  metrics.push(...extraMetrics.map(([label, value]) => ({ label, value: formatNumber(metricNumber(value, 0)) })));

  const productRows = productBreakdownRows(point.byProduct, activeMetric);
  if (productRows.length) {
    metrics.push(...productRows.map((row) => ({
      label: `${row.label} ${metricTitle(activeMetric).toLowerCase()}`,
      value: formatNumber(row.value)
    })));
  } else {
    metrics.push({ label: 'Product split', value: 'Unavailable' });
  }

  return metrics;
}

function productBreakdownRows(byProduct, metric) {
  return Object.entries(byProduct || {})
    .map(([key, values]) => ({
      key,
      label: productTypeLabel(key),
      value: metricNumber(values?.[metric], 0)
    }))
    .filter((row) => row.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function productKeyForContent(item) {
  const product = String(item.productType || '').toUpperCase();
  if (product === 'REELS') return 'REEL';
  if (product === 'STORY') return 'STORY';
  if (product === 'FEED') return 'POST';
  if (product) return product;
  if (item.contentType === 'reel') return 'REEL';
  if (item.contentType === 'story') return 'STORY';
  return 'POST';
}

function productTypeLabel(key) {
  const normalized = String(key || '').toUpperCase();
  return {
    REEL: 'Reels',
    REELS: 'Reels',
    POST: 'Posts',
    FEED: 'Posts',
    STORY: 'Stories',
    STORIES: 'Stories',
    CAROUSEL: 'Carousels',
    UNKNOWN: 'Unknown'
  }[normalized] || normalized.toLowerCase().replace(/(^|_)([a-z])/g, (_, space, letter) => `${space ? ' ' : ''}${letter.toUpperCase()}`);
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  return new Date(`${key}T00:00:00`);
}

function chartContent() {
  if (!state.data) return [];
  return getVisibleContent({ includeQuery: false, includeSignal: false, includeMinViews: false });
}

function reachBounds(content) {
  const times = content
    .map((item) => new Date(item.timestamp).getTime())
    .filter((time) => Number.isFinite(time));
  if (!times.length) return null;
  return {
    min: startOfDay(new Date(Math.min(...times))),
    max: startOfDay(new Date(Math.max(...times)))
  };
}

// Selected range when set, otherwise the most recent 30 days of available data.
function activeReachRange(content) {
  const bounds = reachBounds(content);
  if (!bounds) return null;
  if (state.reachRange?.start && state.reachRange?.end) {
    return { start: startOfDay(parseKey(state.reachRange.start)), end: startOfDay(parseKey(state.reachRange.end)) };
  }
  const end = bounds.max;
  const start = new Date(Math.max(bounds.min.getTime(), end.getTime() - 29 * 86400000));
  return { start: startOfDay(start), end };
}

function buildDailyReach(content, range) {
  if (!range) return [];
  const dated = content
    .map((item) => ({ item, date: startOfDay(new Date(item.timestamp)) }))
    .filter(({ date }) => Number.isFinite(date.getTime()));
  const buckets = [];
  const index = new Map();
  for (let cursor = new Date(range.start); cursor <= range.end; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    const bucket = { key, label: shortDate(key), value: 0, content: 0 };
    buckets.push(bucket);
    index.set(key, bucket);
  }
  for (const { item, date } of dated) {
    const bucket = index.get(dayKey(date));
    if (!bucket) continue;
    bucket.value += metricNumber(item.reach, 0);
    bucket.content += 1;
  }
  return buckets;
}

function updateReachRangeLabel(range) {
  if (!els.reachRangeLabel) return;
  if (!range) {
    els.reachRangeLabel.textContent = 'No data';
    return;
  }
  els.reachRangeLabel.textContent = state.reachRange?.start
    ? `${shortDate(dayKey(range.start))} – ${shortDate(dayKey(range.end))}`
    : 'Last 30 days';
}

function renderReachChart(content) {
  const range = activeReachRange(content);
  updateReachRangeLabel(range);

  if (!range) {
    els.reachChart.innerHTML = '<div class="chart-empty">No reach data yet</div>';
    return;
  }

  const buckets = buildDailyReach(content, range);
  if (!buckets.some((bucket) => bucket.value > 0)) {
    els.reachChart.innerHTML = '<div class="chart-empty">No reach in this date range</div>';
    return;
  }

  const max = Math.max(1, ...buckets.map((bucket) => bucket.value));
  const width = 860;
  const height = 280;
  const padding = { top: 18, right: 18, bottom: 42, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const slot = innerWidth / buckets.length;
  const barWidth = Math.max(2, Math.min(30, slot * 0.72));

  const bars = buckets.map((bucket, indexNo) => {
    const barHeight = Math.max(bucket.value > 0 ? 2 : 0, (bucket.value / max) * innerHeight);
    const x = padding.left + indexNo * slot + (slot - barWidth) / 2;
    const y = padding.top + innerHeight - barHeight;
    return `<rect class="chart-bar reach-bar chart-click" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" role="button" tabindex="0" aria-label="${escapeAttribute(`${bucket.label}: ${formatNumber(bucket.value)} reach`)}" ${insightAttrs({
      id: `reach-day-${bucket.key}`,
      title: `Reach on ${bucket.label}`,
      subtitle: `${formatNumber(bucket.content)} item${bucket.content === 1 ? '' : 's'} published`,
      source: 'Total reach from loaded media grouped by publish day.',
      metrics: [
        { label: 'Reach', value: compactNumber(bucket.value) },
        { label: 'Items published', value: formatNumber(bucket.content) }
      ]
    })}></rect>`;
  }).join('');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + innerHeight - innerHeight * ratio;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + innerWidth}" y2="${y}"></line>
      <text class="chart-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${compactNumber(max * ratio)}</text>
    `;
  }).join('');

  const labelEvery = Math.ceil(buckets.length / 8);
  const labels = buckets.map((bucket, indexNo) => (indexNo === 0 || indexNo === buckets.length - 1 || indexNo % labelEvery === 0)
    ? `<text class="chart-label" x="${padding.left + indexNo * slot + slot / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(bucket.label)}</text>`
    : '').join('');

  els.reachChart.innerHTML = `
    <div class="chart-legend">
      <span><i class="legend-bar reach"></i>Reach by day</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reach by day">
      ${gridLines}
      ${bars}
      ${labels}
      <text class="chart-axis-label" x="${padding.left + innerWidth / 2}" y="${height - 1}" text-anchor="middle">Publish date</text>
      <text class="chart-axis-label" x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">Reach</text>
    </svg>
  `;
}

function reachAccountDailyPoints() {
  const series = state.data?.accountInsights?.dailyReach;
  if (!series?.available || !Array.isArray(series.series)) return [];
  return series.series
    .map((point) => ({
      key: point.date,
      label: shortDate(point.date),
      value: metricNumber(point.value, null),
      content: null,
      endTime: point.endTime || null
    }))
    .filter((point) => point.key && point.value !== null);
}

function reachContentDailyPoints(content) {
  return content
    .map((item) => {
      const date = startOfDay(new Date(item.timestamp));
      if (!Number.isFinite(date.getTime())) return null;
      const key = dayKey(date);
      return {
        key,
        label: shortDate(key),
        value: metricNumber(item.reach, 0),
        content: 1
      };
    })
    .filter(Boolean);
}

function reachDailySource(content) {
  const accountPoints = reachAccountDailyPoints();
  if (accountPoints.length) {
    return {
      type: 'account',
      points: accountPoints,
      legend: 'Account reach by day',
      note: 'Instagram Graph API account reach by day. Dates follow Meta insight buckets.',
      source: 'Graph API /insights reach period=day time_series. This is account-level reach, not reach grouped by post publish date.'
    };
  }
  return {
    type: 'content',
    points: reachContentDailyPoints(content),
    legend: 'Loaded content fallback',
    note: 'Fallback: loaded media reach grouped by publish date.',
    source: 'Fallback from loaded media reach grouped by publish date.'
  };
}

function reachPointBounds(points) {
  const times = points
    .map((point) => parseKey(point.key).getTime())
    .filter((time) => Number.isFinite(time));
  if (!times.length) return null;
  return {
    min: startOfDay(new Date(Math.min(...times))),
    max: startOfDay(new Date(Math.max(...times)))
  };
}

function activeAccountReachRange(points) {
  const bounds = reachPointBounds(points);
  if (!bounds) return null;
  if (state.reachRange?.start && state.reachRange?.end) {
    return { start: startOfDay(parseKey(state.reachRange.start)), end: startOfDay(parseKey(state.reachRange.end)) };
  }
  return { start: bounds.min, end: bounds.max };
}

function buildAccountDailyReach(points, range) {
  if (!range) return [];
  const buckets = [];
  const index = new Map();
  for (let cursor = new Date(range.start); cursor <= range.end; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    const bucket = { key, label: shortDate(key), value: 0, content: 0 };
    buckets.push(bucket);
    index.set(key, bucket);
  }
  for (const point of points) {
    const bucket = index.get(point.key);
    if (!bucket) continue;
    bucket.value += metricNumber(point.value, 0);
    bucket.content += metricNumber(point.content, 0);
  }
  return buckets;
}

function reachAccountWeeklyPoints() {
  const weekly = state.data?.accountInsights?.weeklyReach;
  if (!weekly?.available || !Array.isArray(weekly.series)) return [];
  return weekly.series
    .map((point) => ({
      key: point.key,
      label: point.label || `Wk of ${shortDate(point.key)}`,
      shortLabel: shortDate(point.key),
      value: metricNumber(point.value, null),
      content: null
    }))
    .filter((point) => point.key && point.value !== null);
}

function reachContentWeeklyPoints(content) {
  const grouped = new Map();
  for (const item of content) {
    const date = new Date(item.timestamp);
    if (!Number.isFinite(date.getTime())) continue;
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = dayKey(monday);
    const current = grouped.get(key) || { key, label: `Wk of ${shortDate(key)}`, shortLabel: shortDate(key), value: 0, content: 0 };
    current.value += metricNumber(item.reach, 0);
    current.content += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
}

// "Jul 13 - Jul 19" for a Monday-start week key; the current week is capped at today.
function weekSpanLabel(key) {
  const start = parseKey(key);
  if (!Number.isFinite(start.getTime())) return '';
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const today = startOfDay(new Date());
  const capped = end > today ? today : end;
  return `${shortDate(dayKey(start))} - ${shortDate(dayKey(capped))}`;
}

function reachWeeklySource(content) {
  const accountPoints = reachAccountWeeklyPoints();
  if (accountPoints.length) {
    return {
      type: 'account',
      points: accountPoints,
      legend: 'Account reach by week',
      note: 'Instagram Graph API reach total for each week (Monday start).',
      source: 'Graph API /insights reach period=day total_value for each week window. This avoids summing daily reach across repeat accounts.'
    };
  }
  return {
    type: 'content',
    points: reachContentWeeklyPoints(content),
    legend: 'Loaded content fallback',
    note: 'Fallback: loaded media reach grouped by publish week.',
    source: 'Fallback from loaded media reach grouped by publish week.'
  };
}

function reachAccountMonthlyPoints() {
  const monthly = state.data?.accountInsights?.monthlyReach;
  if (!monthly?.available || !Array.isArray(monthly.series)) return [];
  return monthly.series
    .map((point) => ({
      key: point.key,
      label: point.label || reachMonthLabel(point.key),
      value: metricNumber(point.value, null),
      content: null
    }))
    .filter((point) => point.key && point.value !== null);
}

function reachContentMonthlyPoints(content) {
  const grouped = new Map();
  for (const item of content) {
    const date = new Date(item.timestamp);
    if (!Number.isFinite(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const current = grouped.get(key) || { key, label: reachMonthLabel(key), value: 0, content: 0 };
    current.value += metricNumber(item.reach, 0);
    current.content += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
}

function reachMonthlySource(content) {
  const accountPoints = reachAccountMonthlyPoints();
  if (accountPoints.length) {
    return {
      type: 'account',
      points: accountPoints,
      legend: 'Account reach by month',
      note: 'Instagram Graph API reach total for each calendar month.',
      source: 'Graph API /insights reach period=day total_value for each calendar month. This avoids summing daily reach across repeat accounts.'
    };
  }
  return {
    type: 'content',
    points: reachContentMonthlyPoints(content),
    legend: 'Loaded content fallback',
    note: 'Fallback: loaded media reach grouped by publish month.',
    source: 'Fallback from loaded media reach grouped by publish month.'
  };
}

function updateAccountReachRangeLabel(range) {
  if (!els.reachRangeLabel) return;
  // Weekly and monthly use fixed 12-bucket windows; the calendar applies to daily only.
  const fixedWindow = state.reachGranularity !== 'day';
  if (els.reachRangeTrigger) {
    els.reachRangeTrigger.disabled = fixedWindow;
    els.reachRangeTrigger.setAttribute('aria-expanded', 'false');
  }
  if (fixedWindow) {
    toggleReachCalendar(false);
    els.reachRangeLabel.textContent = state.reachGranularity === 'month' ? 'Last 12 months' : 'Last 12 weeks';
    return;
  }
  if (!range) {
    els.reachRangeLabel.textContent = 'No data';
    return;
  }
  els.reachRangeLabel.textContent = withCompareSuffix(state.reachRange?.start
    ? `${shortDate(dayKey(range.start))} - ${shortDate(dayKey(range.end))}`
    : 'All available', state.reachCompareRange);
}

function renderAccountReachChart(content) {
  if (state.reachGranularity === 'month') {
    renderAccountMonthlyReachChart(content);
    return;
  }
  if (state.reachGranularity === 'week') {
    renderAccountWeeklyReachChart(content);
    return;
  }
  renderAccountDailyReachChart(content);
}

function renderAccountDailyReachChart(content) {
  const source = reachDailySource(content);
  const range = activeAccountReachRange(source.points);
  updateAccountReachRangeLabel(range);
  if (els.reachTitle) els.reachTitle.textContent = 'Reach by day';

  if (!range) {
    els.reachChart.innerHTML = '<div class="chart-empty">No reach data yet</div>';
    return;
  }

  const primaryRange = normalizedRange(state.reachRange) || { start: dayKey(range.start), end: dayKey(range.end) };
  const resolved = resolveRangePoints('reach', primaryRange, source.points, renderCharts);
  const compareRange = normalizedRange(state.reachCompareRange);
  const resolvedCompare = compareRange ? resolveRangePoints('reach', compareRange, source.points, renderCharts) : null;

  if (resolved.status !== 'ready') {
    els.reachChart.innerHTML = rangeStatusHtml(resolved, primaryRange);
    return;
  }
  if (resolvedCompare && resolvedCompare.status !== 'ready') {
    els.reachChart.innerHTML = rangeStatusHtml(resolvedCompare, compareRange);
    return;
  }

  const reachMetric = [{ key: 'reach', label: 'Reach', read: (point) => point.value }];
  if (resolvedCompare && resolvedCompare.points.length) {
    els.reachChart.innerHTML = compareDeltaRow(resolved.points, resolvedCompare.points, reachMetric, primaryRange, compareRange)
      + renderComparisonBars(resolved.points, resolvedCompare.points, {
        read: (point) => metricNumber(point.value, 0),
        metricLabel: 'Reach',
        primaryLabel: rangeSpanLabel(primaryRange),
        compareLabel: rangeSpanLabel(compareRange),
        ariaLabel: 'Reach: range A against range B',
        source: source.source,
        note: `Comparing ${rangeSpanLabel(primaryRange)} against ${rangeSpanLabel(compareRange)}, aligned bucket by bucket.${granularityNote(resolved)}${granularityNote(resolvedCompare)}`
      });
    return;
  }

  const buckets = resolved.local
    ? buildAccountDailyReach(resolved.points, range)
    : resolved.points.map((point) => ({ key: point.key, label: point.label, value: metricNumber(point.value, 0), content: null }));
  if (!buckets.some((bucket) => bucket.value > 0)) {
    els.reachChart.innerHTML = '<div class="chart-empty">No reach in this date range</div>';
    return;
  }

  renderAccountReachBars(buckets, {
    mode: 'day',
    legend: source.legend,
    note: source.note + granularityNote(resolved),
    source: source.source,
    sourceType: source.type,
    axisLabel: 'Day',
    ariaLabel: 'Reach by day',
    maxBarWidth: 30,
    labelCount: 8
  });
}

function renderAccountWeeklyReachChart(content) {
  const source = reachWeeklySource(content);
  updateAccountReachRangeLabel(null);
  if (els.reachTitle) els.reachTitle.textContent = 'Reach by week';

  if (!source.points.length) {
    els.reachChart.innerHTML = '<div class="chart-empty">No weekly reach data yet</div>';
    return;
  }

  renderAccountReachBars(source.points, {
    mode: 'week',
    legend: source.legend,
    note: source.note,
    source: source.source,
    sourceType: source.type,
    axisLabel: 'Week',
    ariaLabel: 'Reach by week',
    maxBarWidth: 40,
    labelCount: 12
  });
}

function renderAccountMonthlyReachChart(content) {
  const source = reachMonthlySource(content);
  updateAccountReachRangeLabel(null);
  if (els.reachTitle) els.reachTitle.textContent = 'Reach by month';

  if (!source.points.length) {
    els.reachChart.innerHTML = '<div class="chart-empty">No monthly reach data yet</div>';
    return;
  }

  renderAccountReachBars(source.points, {
    mode: 'month',
    legend: source.legend,
    note: source.note,
    source: source.source,
    sourceType: source.type,
    axisLabel: 'Month',
    ariaLabel: 'Reach by month',
    maxBarWidth: 44,
    labelCount: 12
  });
}

function renderAccountReachBars(buckets, options) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.value));
  const width = 860;
  const height = 280;
  const padding = { top: 18, right: 18, bottom: 42, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const slot = innerWidth / buckets.length;
  const barWidth = Math.max(2, Math.min(options.maxBarWidth || 30, slot * 0.72));

  const bars = buckets.map((bucket, indexNo) => {
    const barHeight = Math.max(bucket.value > 0 ? 2 : 0, (bucket.value / max) * innerHeight);
    const x = padding.left + indexNo * slot + (slot - barWidth) / 2;
    const y = padding.top + innerHeight - barHeight;
    const metrics = [{ label: 'Reach', value: compactNumber(bucket.value) }];
    if (options.sourceType === 'content') {
      metrics.push({ label: 'Items published', value: formatNumber(bucket.content) });
    }
    let subtitle = options.sourceType === 'content'
      ? `${formatNumber(bucket.content)} item${bucket.content === 1 ? '' : 's'} published`
      : 'Account reach reported by Instagram';
    if (options.mode === 'week') {
      const span = weekSpanLabel(bucket.key);
      if (span) {
        metrics.push({ label: 'Week', value: span });
        if (options.sourceType !== 'content') subtitle = span;
      }
    }
    const title = options.mode === 'day' ? `Reach on ${bucket.label}` : `Reach in ${bucket.label}`;
    return `<rect class="chart-bar reach-bar chart-click" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" role="button" tabindex="0" aria-label="${escapeAttribute(`${bucket.label}: ${formatNumber(bucket.value)} reach`)}" ${insightAttrs({
      id: `reach-${options.mode}-${bucket.key}`,
      title,
      subtitle,
      source: options.source,
      metrics
    })}></rect>`;
  }).join('');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + innerHeight - innerHeight * ratio;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + innerWidth}" y2="${y}"></line>
      <text class="chart-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${compactNumber(max * ratio)}</text>
    `;
  }).join('');

  const labelEvery = Math.max(1, Math.ceil(buckets.length / (options.labelCount || 8)));
  const labels = buckets.map((bucket, indexNo) => (indexNo === 0 || indexNo === buckets.length - 1 || indexNo % labelEvery === 0)
    ? `<text class="chart-label" x="${padding.left + indexNo * slot + slot / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(bucket.shortLabel || bucket.label)}</text>`
    : '').join('');

  els.reachChart.innerHTML = `
    <div class="chart-legend">
      <span><i class="legend-bar reach"></i>${escapeHtml(options.legend)}</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(options.ariaLabel)}">
      ${gridLines}
      ${bars}
      ${labels}
      <text class="chart-axis-label" x="${padding.left + innerWidth / 2}" y="${height - 1}" text-anchor="middle">${escapeHtml(options.axisLabel)}</text>
      <text class="chart-axis-label" x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">Reach</text>
    </svg>
    <p class="chart-note">${escapeHtml(options.note)}</p>
  `;
}

// "Feb 27 – Jun 25" for the date span of a content set (empty string if none).
function formatRangeLabel(content) {
  const times = content
    .map((item) => new Date(item.timestamp).getTime())
    .filter((time) => Number.isFinite(time));
  if (!times.length) return '';
  const min = dayKey(new Date(Math.min(...times)));
  const max = dayKey(new Date(Math.max(...times)));
  return min === max ? shortDate(min) : `${shortDate(min)} – ${shortDate(max)}`;
}

// Write a date-range caption into the panel that holds the given chart body.
function setPanelDates(bodyEl, label) {
  const target = bodyEl?.closest('.panel')?.querySelector('.panel-dates');
  if (target) target.textContent = label || '';
}

function renderEngagementMix(content) {
  const totals = metricTotals(content);
  const segments = [
    { key: 'likes', label: 'Likes', value: metricNumber(totals.likes, 0), color: '#111111', cls: 'likes' },
    { key: 'comments', label: 'Comments', value: metricNumber(totals.comments, 0), color: '#b1b1b1', cls: 'comments' },
    { key: 'saves', label: 'Saves', value: metricNumber(totals.saves, 0), color: '#ed1b24', cls: 'saves' },
    { key: 'shares', label: 'Shares', value: metricNumber(totals.shares, 0), color: '#595959', cls: 'shares' }
  ];
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);

  if (total <= 0) {
    els.engagementChart.innerHTML = '<div class="chart-empty">No engagement breakdown yet</div>';
    return;
  }

  const cx = 90;
  const cy = 90;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const ring = segments
    .filter((seg) => seg.value > 0)
    .map((seg) => {
      const length = (seg.value / total) * circumference;
      const dash = `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`;
      const circle = `<circle class="donut-seg" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="24" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
      offset += length;
      return circle;
    })
    .join('');

  const legend = segments.map((seg) => {
    const share = seg.value / total;
    return `
      <button class="mix-row chart-click" type="button" ${insightAttrs({
        id: `mix-${seg.key}`,
        title: `${seg.label} share of engagement`,
        subtitle: `${percent(share)} of likes, comments, saves and shares`,
        source: 'Engagement composition summed from loaded media interactions.',
        metrics: [
          { label: seg.label, value: compactNumber(seg.value) },
          { label: 'Share of engagement', value: percent(share) }
        ]
      })}>
        <span class="mix-dot mix-${seg.cls}" aria-hidden="true"></span>
        <span class="mix-label">${seg.label}</span>
        <strong>${compactNumber(seg.value)} <small>${percent(share)}</small></strong>
      </button>`;
  }).join('');

  els.engagementChart.innerHTML = `
    <div class="mix-wrap">
      <svg class="donut" viewBox="0 0 180 180" role="img" aria-label="Engagement composition of likes, comments, saves and shares">
        ${ring}
        <text class="donut-center" x="${cx}" y="${cy - 3}" text-anchor="middle">${compactNumber(total)}</text>
        <text class="donut-sub" x="${cx}" y="${cy + 15}" text-anchor="middle">interactions</text>
      </svg>
      <div class="mix-legend">${legend}</div>
    </div>
  `;
}

function renderFunnelChart(content) {
  const totals = metricTotals(content);
  const rows = [
    ['Views', totals.views],
    ['Reach', totals.reach],
    ['Interactions', totals.interactions],
    ['Shares', totals.shares],
    ['Saves', totals.saves]
  ];
  const max = Math.max(1, ...rows.map(([, value]) => value));

  els.funnelChart.innerHTML = `
    <div class="chart-note">Total values from loaded media</div>
    ${rows.map(([label, value], index) => {
      const share = value / max;
      return `
        <button class="bar-row chart-click" type="button" ${insightAttrs({
          id: `funnel-${label.toLowerCase()}`,
          title: `${label} total`,
          subtitle: `${percent(share)} of the largest funnel value`,
          source: 'Graph API metrics summed across the current filtered period and type.',
          metrics: [
            { label, value: compactNumber(value) },
            { label: 'Share of views', value: index === 0 ? '100%' : percent(share) }
          ]
        })}>
          <span>${escapeHtml(label)}</span>
          <div class="bar-track" aria-hidden="true"><span style="width: ${Math.max(2, share * 100)}%"></span></div>
          <strong>${compactNumber(value)} <small>${index === 0 ? 'base' : percent(share)}</small></strong>
        </button>
      `;
    }).join('')}
  `;
}

function renderSavesSharesChart(content) {
  const rows = content
    .filter((item) => isMetricKnown(item.saves) || isMetricKnown(item.shares))
    .slice()
    .sort((a, b) => (metricNumber(b.saves) + metricNumber(b.shares)) - (metricNumber(a.saves) + metricNumber(a.shares)))
    .slice(0, 6);

  if (!rows.length) {
    els.savesSharesChart.innerHTML = '<div class="chart-empty">Saves and shares unavailable</div>';
    return;
  }

  const max = Math.max(1, ...rows.map((item) => metricNumber(item.saves) + metricNumber(item.shares)));
  els.savesSharesChart.innerHTML = `
    <div class="chart-legend compact-legend">
      <span><i class="legend-save"></i>Saves</span>
      <span><i class="legend-share"></i>Shares</span>
    </div>
    ${rows.map((item) => {
    const total = metricNumber(item.saves) + metricNumber(item.shares);
    return `
      <button class="bar-row stacked chart-click" type="button" ${insightAttrs({
        id: `intent-${item.id}`,
        title: item.caption,
        subtitle: `${item.contentTypeLabel || 'Content'} intent signals`,
        source: 'Saves and shares are Graph API insight metrics when Meta returns them.',
        metrics: [
          { label: 'Saves', value: metricCompact(item.saves) },
          { label: 'Shares', value: metricCompact(item.shares) },
          { label: 'Combined', value: compactNumber(total) }
        ]
      })}>
        <span title="${escapeAttribute(item.caption)}">${escapeHtml(item.caption)}</span>
        <div class="bar-track">
          <span class="bar-save" style="width: ${Math.max(2, (metricNumber(item.saves) / max) * 100)}%"></span>
          <span class="bar-share" style="width: ${Math.max(2, (metricNumber(item.shares) / max) * 100)}%"></span>
        </div>
        <strong>${compactNumber(total)} <small>${compactNumber(item.saves)} saved</small></strong>
      </button>
    `;
    }).join('')}
  `;
}

function renderHeatmapChart(content) {
  const slots = buildPostingSlots(content);
  const max = Math.max(1, ...slots.map((slot) => metricNumber(slot.averageViews, 0)));
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const windows = [
    { label: 'Night', time: '00-06' },
    { label: 'Morning', time: '06-12' },
    { label: 'Afternoon', time: '12-18' },
    { label: 'Evening', time: '18-24' }
  ];

  els.heatmapChart.innerHTML = `
    <div class="chart-note">Average views by publish time. Counts show loaded content.</div>
    <div class="heatmap">
      <span></span>
      ${windows.map((window) => `<b><span>${escapeHtml(window.label)}</span><small>${escapeHtml(window.time)}</small></b>`).join('')}
      ${days.map((day, dayIndex) => `
        <b>${day}</b>
        ${windows.map((window, windowIndex) => {
          const slot = slots.find((item) => item.day === dayIndex && item.window === windowIndex) || emptyPostingSlot(dayIndex, windowIndex);
          const hasContent = slot.contentCount > 0;
          const hasViews = slot.viewsCount > 0;
          const averageViews = metricNumber(slot.averageViews, 0);
          const opacity = hasViews ? 0.18 + (averageViews / max) * 0.72 : (hasContent ? 0.12 : 0.08);
          const classes = ['heat-cell', 'chart-click'];
          if (!hasContent) classes.push('empty');
          if (hasContent && !hasViews) classes.push('is-unavailable');
          const title = heatmapTitle(day, window.label, slot);
          return `<button class="${classes.join(' ')}" type="button" style="--heat: ${opacity}" title="${escapeAttribute(title)}" ${insightAttrs({
            id: `heat-${dayIndex}-${windowIndex}`,
            title: `${day} ${window.label}`,
            subtitle: window.time,
            source: 'Average views calculated from loaded content published in this day/time slot. Items without view data are counted separately, not averaged as zero. An average of 0 means Meta currently reports 0 views for the post(s) here - typical for brand-new posts that are still gathering data.',
            metrics: heatmapInsightMetrics(slot)
          })}>
            <strong>${escapeHtml(heatmapValueLabel(slot))}</strong>
            <small>${escapeHtml(hasContent ? pluralLabel(slot.contentCount, 'item') : 'no content')}</small>
          </button>`;
        }).join('')}
      `).join('')}
    </div>
  `;
}

function emptyPostingSlot(day, window) {
  return { day, window, count: 0, contentCount: 0, viewsCount: 0, views: 0, averageViews: null, items: [] };
}

function heatmapValueLabel(slot) {
  if (!slot.contentCount) return '-';
  if (!slot.viewsCount) return 'No data';
  const averageViews = metricNumber(slot.averageViews, 0);
  return averageViews === 0 ? '0 views' : compactNumber(averageViews);
}

function heatmapTitle(day, windowLabel, slot) {
  if (!slot.contentCount) return `${day} ${windowLabel}: no content published`;
  if (!slot.viewsCount) {
    return `${day} ${windowLabel}: ${pluralLabel(slot.contentCount, 'item')} published, views unavailable`;
  }
  const unavailable = slot.contentCount - slot.viewsCount;
  const suffix = unavailable > 0 ? `; ${pluralLabel(unavailable, 'item')} without view data` : '';
  return `${day} ${windowLabel}: ${compactNumber(slot.averageViews)} average views from ${pluralLabel(slot.viewsCount, 'item')}${suffix}`;
}

function heatmapInsightMetrics(slot) {
  const metrics = [
    { label: 'Average views', value: slot.viewsCount ? compactNumber(slot.averageViews) : (slot.contentCount ? 'Views unavailable' : 'No content') },
    { label: 'Content', value: pluralLabel(slot.contentCount, 'item') }
  ];
  if (slot.contentCount) {
    if (slot.viewsCount) metrics.push({ label: 'Total views', value: compactNumber(slot.views) });
    metrics.push({ label: 'With view data', value: pluralLabel(slot.viewsCount, 'item') });
    const unavailable = slot.contentCount - slot.viewsCount;
    if (unavailable > 0) metrics.push({ label: 'Missing views', value: pluralLabel(unavailable, 'item') });

    // Name the actual posts behind the cell (top 3 by views) so an odd number is explainable.
    const ranked = [...(slot.items || [])]
      .sort((a, b) => metricNumber(b.views, -1) - metricNumber(a.views, -1))
      .slice(0, 3);
    ranked.forEach((item, index) => {
      const views = isMetricKnown(item.views) ? `${compactNumber(item.views)} views` : 'views unavailable';
      metrics.push({
        label: ranked.length === 1 ? 'Post' : `Post ${index + 1}`,
        value: `${shortCaption(item.caption)} - ${views} - ${relativeDate(item.timestamp)}`
      });
    });
  }
  return metrics;
}

function shortCaption(value) {
  const text = String(value || 'Untitled').trim();
  return text.length > 34 ? `${text.slice(0, 33)}…` : text;
}

function renderDistributionChart(content) {
  const values = content.map((item) => metricNumber(item.views, null)).filter((value) => value !== null);
  if (!values.length) {
    els.distributionChart.innerHTML = '<div class="chart-empty">Views unavailable</div>';
    return;
  }

  const max = Math.max(...values);
  const bucketCount = 6;
  const bucketSize = Math.max(1, Math.ceil(max / bucketCount));
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    min: index * bucketSize,
    max: (index + 1) * bucketSize,
    count: 0
  }));
  values.forEach((value) => {
    const index = Math.min(bucketCount - 1, Math.floor(value / bucketSize));
    buckets[index].count += 1;
  });
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));

  els.distributionChart.innerHTML = `
    <div class="chart-note">Bar height is number of posts</div>
    <div class="histogram">
      ${buckets.map((bucket) => `
        <button class="hist-bar chart-click" type="button" ${insightAttrs({
          id: `dist-${bucket.min}-${bucket.max}`,
          title: `${compactNumber(bucket.min)}-${compactNumber(bucket.max)} views`,
          subtitle: 'Views distribution bucket',
          source: 'Histogram buckets loaded content by total views.',
          metrics: [
            { label: 'Posts', value: formatNumber(bucket.count) },
            { label: 'View range', value: `${compactNumber(bucket.min)}-${compactNumber(bucket.max)}` }
          ]
        })}>
          <strong>${bucket.count}</strong>
          <span style="height: ${Math.max(4, (bucket.count / maxCount) * 100)}%"></span>
          <small>${compactNumber(bucket.min)}-${compactNumber(bucket.max)}</small>
        </button>
      `).join('')}
    </div>
  `;
}

function renderActivity() {
  const activity = state.data.activity || [];

  if (!activity.length) {
    els.activityFeed.innerHTML = '<div class="empty-rail">No movement yet</div>';
    return;
  }

  els.activityFeed.innerHTML = activity.map((item) => `
    <article class="activity-item">
      <div class="activity-title">
        <strong>${escapeHtml(item.caption)}</strong>
        <span>+${compactNumber(item.deltaViews)}</span>
      </div>
      <p class="activity-copy">${escapeHtml(item.contentTypeLabel || 'Content')} - ${compactNumber(item.deltaInteractions)} new interactions - ${formatTime(item.at)}</p>
    </article>
  `).join('');
}

function renderTopReels() {
  const topReels = getAllContent().slice().sort((a, b) => compareValues(a, b, 'views', 'desc')).slice(0, 5);

  if (!topReels.length) {
    els.topReels.innerHTML = '<div class="empty-rail">Top content will appear here</div>';
    return;
  }

  els.topReels.innerHTML = topReels.map((reel, index) => `
    <article class="top-item">
      <div class="top-title">
        <strong>${index + 1}. ${escapeHtml(reel.caption)}</strong>
        <span>${metricCompact(reel.views, 'views')}</span>
      </div>
      <p class="top-copy">${escapeHtml(reel.contentTypeLabel)} - ${metricCompact(reel.reach, 'reach')} reach - ${metricPercent(reel.engagementRate)} engagement - ${formatNumber(reel.contentScore || 0)} score</p>
    </article>
  `).join('');
}

function renderContentMix() {
  const breakdown = state.data.breakdown || {};
  const rows = [
    ['reel', 'Reels'],
    ['video', 'Videos'],
    ['image', 'Images'],
    ['carousel', 'Carousels'],
    ['post', 'Other posts']
  ].filter(([key]) => Number(breakdown[key] || 0) > 0);

  if (!rows.length) {
    els.contentMix.innerHTML = '<div class="empty-rail">Content mix will appear here</div>';
    return;
  }

  els.contentMix.innerHTML = rows.map(([key, label]) => `
    <div class="mix-row">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(breakdown[key] || 0)}</strong>
    </div>
  `).join('');
}

function renderAccuracyCenter() {
  const diagnostics = state.data.diagnostics || {};
  const availability = diagnostics.metricAvailability || state.data.metricAvailability || {};
  const keys = [
    ['views', 'Views'],
    ['reach', 'Reach'],
    ['interactions', 'Interactions'],
    ['shares', 'Shares'],
    ['saves', 'Saves']
  ];

  els.accuracyCenter.innerHTML = `
    <div class="accuracy-row">
      <span>Source</span>
      <strong>${escapeHtml(diagnostics.dataSource || state.data.mode)}</strong>
    </div>
    <div class="accuracy-row">
      <span>API host</span>
      <strong>${escapeHtml(diagnostics.apiHost || 'local')}</strong>
    </div>
    <div class="accuracy-row">
      <span>Loaded media</span>
      <strong>${formatNumber(diagnostics.loadedCount || state.data.summary.contentCount)}${diagnostics.accountMediaCount ? ` / ${formatNumber(diagnostics.accountMediaCount)} account count` : ''}</strong>
    </div>
    <div class="accuracy-row">
      <span>Page status</span>
      <strong>${escapeHtml(diagnostics.loadStatus || 'Loaded')}</strong>
    </div>
    <div class="coverage-list">
      ${keys.map(([key, label]) => {
        const metric = availability[key] || { available: 0, unavailable: 0, coverage: 0 };
        return `
          <div class="coverage-row">
            <div>
              <span>${escapeHtml(label)}</span>
              <small>${formatNumber(metric.available)} available, ${formatNumber(metric.unavailable)} unavailable</small>
            </div>
            <strong>${percent(metric.coverage || 0)}</strong>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFollowerPanel() {
  const account = state.data.account;
  const summary = state.data.summary;
  const followers = Math.max(1, metricNumber(account.followers, 0));
  const viewsPerFollower = isMetricKnown(summary.totalViews) ? summary.totalViews / followers : null;
  const reachPerFollower = isMetricKnown(summary.totalReach) ? summary.totalReach / followers : null;
  const interactionsPerFollower = isMetricKnown(summary.totalInteractions) ? summary.totalInteractions / followers : null;

  els.followerPanel.innerHTML = `
    <div class="follower-hero">
      <span>Current followers</span>
      <strong>${compactNumber(account.followers)}</strong>
      <small>${formatNumber(account.followers)} exact followers</small>
    </div>
    <div class="follower-metrics">
      ${followerMetric('Following', formatNumber(account.follows), 'Current follows count')}
      ${followerMetric('Account media', formatNumber(account.mediaCount), 'Instagram account media count')}
      ${followerMetric('Views / follower', decimalMetric(viewsPerFollower), `${metricExact(summary.totalViews)} views / ${formatNumber(account.followers)} followers`)}
      ${followerMetric('Reach / follower', decimalMetric(reachPerFollower), `${metricExact(summary.totalReach)} reach / ${formatNumber(account.followers)} followers`)}
      ${followerMetric('Interactions / follower', decimalMetric(interactionsPerFollower), `${metricExact(summary.totalInteractions)} interactions / ${formatNumber(account.followers)} followers`)}
    </div>
    <p class="panel-footnote">Per-follower ratios from the current snapshot. See the Audience page for follower growth over time.</p>
  `;
}

function followerMetric(label, value, detail) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function genderLabel(code) {
  return { F: 'Women', M: 'Men', U: 'Other' }[code] || code;
}

function timeframeLabel(timeframe) {
  return {
    last_14_days: 'last 14 days',
    last_30_days: 'last 30 days',
    last_90_days: 'last 90 days',
    this_week: 'this week',
    this_month: 'this month',
    prev_month: 'last month'
  }[timeframe] || '';
}

function sumValues(map) {
  return Object.values(map || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

const COUNTRY_NAMES = {
  IN: 'India', US: 'United States', AE: 'UAE', GB: 'United Kingdom', CA: 'Canada',
  AU: 'Australia', PK: 'Pakistan', BD: 'Bangladesh', NP: 'Nepal', SG: 'Singapore',
  DE: 'Germany', FR: 'France', BR: 'Brazil', ID: 'Indonesia', SA: 'Saudi Arabia'
};

function countryName(code) {
  return COUNTRY_NAMES[code] || code;
}

const GENDER_COLORS = { F: '#111111', M: '#b1b1b1', U: '#ed1b24' };

function renderAudience() {
  renderAccountInsights();
  renderFollowerGrowth();
  renderGenderBreakdown();
  renderAudienceDemographics();
}

// Account-level windowed totals + reach split (followers vs non-followers). All real:
// in demo mode accountInsights is unavailable, so this shows a connect prompt, not fake data.
// /api/insights/range returns camelCase metric names; ai.byWindow uses Meta's raw names.
function rangeTotalsToWindowShape(totals = {}) {
  return {
    views: totals.views,
    reach: totals.reach,
    accounts_engaged: totals.accountsEngaged,
    total_interactions: totals.interactions,
    profile_views: totals.profileViews
  };
}

function updateAccountRangeLabel() {
  if (!els.accountRangeLabel) return;
  const range = normalizedRange(state.accountRange);
  els.accountRangeLabel.textContent = withCompareSuffix(
    range ? rangeChipLabel(range) : 'Custom range',
    state.accountCompareRange
  );
}

function renderAccountInsights() {
  if (!els.accountInsights) return;
  const ai = state.data.accountInsights;
  const note = '<p class="panel-footnote">Account-level totals straight from Instagram for the selected window — these react to the date range, unlike the post-sum headline cards.</p>';

  if (!ai || !ai.available) {
    if (els.accountWindowLabel) els.accountWindowLabel.hidden = true;
    els.accountInsights.innerHTML = `<div class="chart-empty">${escapeHtml(ai?.reason || 'Account-level insights are unavailable.')}</div>${note}`;
    return;
  }

  const windows = ai.windows || [];
  const selected = (state.accountWindow && windows.some((w) => w.key === state.accountWindow))
    ? state.accountWindow
    : (ai.defaultWindow || windows[0]?.key || null);
  const selectedLabel = windows.find((w) => w.key === selected)?.label || '';
  if (els.accountWindow && els.accountWindowLabel) {
    els.accountWindowLabel.hidden = windows.length === 0;
    els.accountWindow.innerHTML = windows.map((w) => `<option value="${w.key}">${escapeHtml(w.label)}</option>`).join('');
    if (selected) els.accountWindow.value = selected;
  }

  updateAccountRangeLabel();
  const customRange = normalizedRange(state.accountRange);
  const compareRange = normalizedRange(state.accountCompareRange);

  let totals = (selected && ai.byWindow?.[selected]) || {};
  let follow = (selected && ai.reachByFollowType?.[selected]) || {};
  let windowLabel = selectedLabel;
  let compareTotals = null;
  let compareLabel = '';

  // A custom range is fetched from Instagram on Apply, not pre-loaded like the presets.
  if (customRange) {
    const entry = requestRangeData('performance', customRange, renderAccountInsights);
    if (entry.status !== 'ready') {
      els.accountInsights.innerHTML = rangeStatusHtml(entry, customRange) + note;
      return;
    }
    totals = rangeTotalsToWindowShape(entry.payload.totals);
    follow = entry.payload.reachByFollowType || {};
    windowLabel = rangeSpanLabel(customRange);
  }
  if (compareRange) {
    const entry = requestRangeData('performance', compareRange, renderAccountInsights);
    if (entry.status !== 'ready') {
      els.accountInsights.innerHTML = rangeStatusHtml(entry, compareRange) + note;
      return;
    }
    compareTotals = rangeTotalsToWindowShape(entry.payload.totals);
    compareLabel = rangeSpanLabel(compareRange);
  }

  const tiles = [
    ['Views', 'views'],
    ['Reach', 'reach'],
    ['Accounts engaged', 'accounts_engaged'],
    ['Interactions', 'total_interactions'],
    ['Profile views', 'profile_views']
  ].filter(([, key]) => isMetricKnown(totals[key]));

  const compareHead = compareTotals
    ? `<p class="ai-compare-head">${escapeHtml(windowLabel)} <span>vs</span> ${escapeHtml(compareLabel)}</p>`
    : '';

  const tileHtml = tiles.length
    ? `${compareHead}<div class="ai-tiles">${tiles.map(([label, key]) => {
        const value = totals[key];
        const delta = compareTotals ? deltaBadge(value, compareTotals[key]) : '';
        return `<div class="ai-tile"><span>${escapeHtml(label)}</span><strong>${compactNumber(value)}</strong><small>${formatNumber(value)}</small>${delta}</div>`;
      }).join('')}</div>`
    : '<p class="gx-missing">No windowed totals returned for this account.</p>';

  const followers = metricNumber(follow.FOLLOWER, 0);
  const nonFollowers = metricNumber(follow.NON_FOLLOWER, 0);
  const followTotal = followers + nonFollowers;
  const splitHtml = followTotal > 0
    ? `<div class="ai-split">
        <div class="ai-split-head"><span>Reach source</span><small>${escapeHtml(windowLabel)}</small></div>
        <div class="ai-split-bar" role="img" aria-label="Reach by follow type">
          <span class="seg non-follower" style="width:${(nonFollowers / followTotal * 100).toFixed(1)}%"></span>
          <span class="seg follower" style="width:${(followers / followTotal * 100).toFixed(1)}%"></span>
        </div>
        <div class="ai-split-legend">
          <div><i class="non-follower"></i><span>Non-followers</span><strong>${percent(nonFollowers / followTotal)}</strong><small>${compactNumber(nonFollowers)}</small></div>
          <div><i class="follower"></i><span>Followers</span><strong>${percent(followers / followTotal)}</strong><small>${compactNumber(followers)}</small></div>
        </div>
      </div>`
    : '';

  els.accountInsights.innerHTML = `${tileHtml}${splitHtml}${note}`;
}

function renderLegacyFollowerGrowth() {
  const account = state.data.account;
  const trend = state.data.summary.followerTrend || { available: false, dayNet: 0, weekNet: 0, series: [] };
  const series = trend.series || [];

  // Exact reference time/date so the user knows what each net change is measured against.
  const prevPoint = series.length >= 2 ? series[series.length - 2] : null;
  const weekPoint = series.length >= 2 ? series[Math.max(0, series.length - 8)] : null;
  const refLabel = (point) => point
    ? `vs ${point.at ? formatDateTime(point.at) : shortDate(point.date)}`
    : '';
  const dayRef = refLabel(prevPoint);
  const weekRef = refLabel(weekPoint);

  const chip = (label, value, note) => {
    const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    return `<div class="net-chip ${cls}"><span>${escapeHtml(label)}</span><strong>${signedCompact(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`;
  };

  let spark;
  if (series.length >= 2) {
    const maxAbs = Math.max(1, ...series.map((point) => Math.abs(point.net)));
    const width = 360;
    const height = 72;
    const mid = height / 2;
    const slot = width / series.length;
    const barWidth = Math.max(2, Math.min(18, slot * 0.6));
    const bars = series.map((point, index) => {
      const barHeight = Math.max(1, (Math.abs(point.net) / maxAbs) * (mid - 5));
      const x = index * slot + (slot - barWidth) / 2;
      const y = point.net >= 0 ? mid - barHeight : mid;
      return `<rect class="net-bar ${point.net < 0 ? 'down' : 'up'}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2"><title>${escapeHtml(shortDate(point.date))}: ${signedCompact(point.net)}</title></rect>`;
    }).join('');
    spark = `<svg class="net-spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily net follower change"><line class="net-axis" x1="0" y1="${mid}" x2="${width}" y2="${mid}"></line>${bars}</svg>`;
  } else {
    spark = '<p class="panel-footnote">Net change chart starts after the first full day of tracking.</p>';
  }

  els.followerGrowth.innerHTML = `
    <div class="fg-top">
      <div class="fg-hero">
        <span class="fg-label">Current followers</span>
        <strong class="fg-value">${compactNumber(account.followers)}</strong>
        <span class="fg-exact">${formatNumber(account.followers)} total · ${formatNumber(account.follows)} following</span>
      </div>
      <div class="fg-nets">
        ${chip('Net today', trend.dayNet || 0, dayRef)}
        ${chip('Net this week', trend.weekNet || 0, weekRef)}
      </div>
    </div>
    <div class="fg-spark">${spark}</div>
    <p class="panel-footnote">Net change from daily follower snapshots. Instagram never reveals who followed or unfollowed - only aggregate counts.</p>
  `;
}

// Instagram never reports a historical follower total - only daily movement. Every total
// here is today's count walked backwards through net change, which is why the end-of-range
// figure is the one to trust and the start figure is derived from it.
function followerRangeSummary(series) {
  if (!series.length) return null;
  const gained = series.reduce((sum, point) => sum + metricNumber(point.gained, 0), 0);
  const lost = series.reduce((sum, point) => sum + metricNumber(point.lost, 0), 0);
  const net = gained - lost;
  const endFollowers = metricNumber(series[series.length - 1].followers, null);
  const startFollowers = endFollowers === null ? null : endFollowers - net;
  return {
    gained,
    lost,
    net,
    endFollowers,
    startFollowers,
    startDate: series[0].startDate || series[0].date,
    endDate: series[series.length - 1].endDate || series[series.length - 1].date,
    // Growth against the count the range opened with, not against today's total.
    growthPct: startFollowers ? (net / startFollowers) * 100 : null
  };
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function pctText(pct) {
  return pct === null ? 'n/a' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

// Percentage change is only meaningful for counts that cannot go negative. Net follower
// change can flip sign, so that one is reported as a plain difference instead.
function followerCompareCells(a, b) {
  const rows = [
    { label: 'Followers at end', value: a.endFollowers, prev: b.endFollowers, mode: 'pct' },
    { label: 'Gained', value: a.gained, prev: b.gained, mode: 'pct' },
    { label: 'Lost', value: a.lost, prev: b.lost, mode: 'pct', invert: true },
    { label: 'Net change', value: a.net, prev: b.net, mode: 'diff' },
    { label: 'Growth rate', value: a.growthPct, prev: b.growthPct, mode: 'points' }
  ];

  return rows.map((row) => {
    if (row.value === null || row.value === undefined) return '';
    let main;
    let note;
    let direction;

    if (row.mode === 'points') {
      const diff = (row.prev === null || row.prev === undefined) ? null : row.value - row.prev;
      main = row.value === null ? '—' : pctText(row.value);
      note = row.prev === null || row.prev === undefined ? 'vs n/a' : `vs ${pctText(row.prev)}`;
      direction = diff === null || diff === 0 ? 'flat' : (diff > 0 ? 'up' : 'down');
      return cell(row.label, main, note, direction, diff === null ? '' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} pts`);
    }

    if (row.mode === 'diff') {
      const diff = row.value - metricNumber(row.prev, 0);
      main = signedCompact(row.value);
      note = `vs ${signedCompact(metricNumber(row.prev, 0))}`;
      direction = diff === 0 ? 'flat' : (diff > 0 ? 'up' : 'down');
      return cell(row.label, main, note, direction, `${diff > 0 ? '+' : ''}${formatNumber(diff)}`);
    }

    const pct = pctChange(row.value, metricNumber(row.prev, 0));
    // Exact counts, not compact: "2K vs 2K" hides the difference these cells exist to show.
    main = formatNumber(row.value);
    note = `vs ${formatNumber(metricNumber(row.prev, 0))}`;
    // More unfollows is a worse outcome, so the colour flips for "Lost".
    const rising = pct !== null && pct > 0;
    direction = pct === null || pct === 0 ? 'flat' : ((rising !== Boolean(row.invert)) ? 'up' : 'down');
    return cell(row.label, main, note, direction, pctText(pct));
  }).join('');

  function cell(label, main, note, direction, badge) {
    return `
      <div class="cmp-cell ${direction}">
        <span class="cmp-metric">${escapeHtml(label)}</span>
        <strong>${escapeHtml(main)}</strong>
        <span class="cmp-prev">${escapeHtml(note)}</span>
        <span class="cmp-pct">${escapeHtml(badge)}</span>
      </div>`;
  }
}

function followerRangeCard(tag, summary, incomplete) {
  const endLabel = summary.endDate ? shortDate(summary.endDate) : '';
  const startLabel = summary.startDate ? shortDate(summary.startDate) : '';
  return `
    <div class="fg-range-card">
      <span class="fg-range-tag">${escapeHtml(tag)} · ${escapeHtml(startLabel)} - ${escapeHtml(endLabel)}</span>
      <span class="fg-label">Followers on ${escapeHtml(endLabel)}</span>
      <strong class="fg-value">${summary.endFollowers === null ? '—' : compactNumber(summary.endFollowers)}</strong>
      <span class="fg-exact">${summary.endFollowers === null ? 'Total unavailable' : `${formatNumber(summary.endFollowers)} total`}${summary.startFollowers === null ? '' : ` · started at ${formatNumber(summary.startFollowers)}`}</span>
      <span class="fg-range-move">${signedCompact(summary.net)} net · ${formatNumber(summary.gained)} gained · ${formatNumber(summary.lost)} lost${incomplete ? ' (partial)' : ''}</span>
      <span class="fg-range-growth">Growth ${escapeHtml(pctText(summary.growthPct))}</span>
    </div>`;
}

function renderFollowerGrowth() {
  const account = state.data.account;
  const trend = state.data.summary.followerTrend || { available: false, dayNet: 0, weekNet: 0, series: [] };
  const rawSeries = (trend.series || []).map((point) => ({ ...point, key: point.date }));
  const range = activeFollowerRange(rawSeries);
  updateFollowerRangeLabel(range);

  const primaryRange = normalizedRange(state.followerRange)
    || (range ? { start: dayKey(range.start), end: dayKey(range.end) } : null);
  const resolved = resolveRangePoints('follower', primaryRange, rawSeries, renderFollowerGrowth);
  if (resolved.status === 'loading' || resolved.status === 'error') {
    els.followerGrowth.innerHTML = rangeStatusHtml(resolved, primaryRange);
    return;
  }

  const compareRange = normalizedRange(state.followerCompareRange);
  const resolvedCompare = compareRange
    ? resolveRangePoints('follower', compareRange, rawSeries, renderFollowerGrowth)
    : null;
  if (resolvedCompare && (resolvedCompare.status === 'loading' || resolvedCompare.status === 'error')) {
    els.followerGrowth.innerHTML = rangeStatusHtml(resolvedCompare, compareRange);
    return;
  }

  const series = resolved.points;
  const stats = followerRangeStats(series);
  const summary = followerRangeSummary(series);
  const lastPoint = series[series.length - 1] || null;
  const rangeLabel = summary
    ? `${shortDate(summary.startDate)} - ${shortDate(summary.endDate)}`
    : 'No range';
  const lostIncomplete = resolved.payload?.lostComplete === false;

  const chip = (label, value, note) => {
    const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    return `<div class="net-chip ${cls}"><span>${escapeHtml(label)}</span><strong>${signedCompact(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`;
  };

  const chart = trend.available && series.length >= 2
    ? renderFollowerMovementChart(series)
    : `<p class="panel-footnote">${escapeHtml(trend.reason || 'Follower movement chart needs daily Graph API follower rows.')}</p>`;

  const footnote = `<p class="panel-footnote">Graph API provides daily new followers and aggregate follow/unfollow counts. It does not reveal individual users. Instagram never returns a historical follower total, so each total here is today's count walked back through daily net movement.${lostIncomplete ? ' Instagram declined part of the unfollow data for this range, so "lost" is understated.' : ''}</p>`;

  // Comparison view: two ranges side by side, each anchored to its own end date.
  const compareSummary = resolvedCompare ? followerRangeSummary(resolvedCompare.points) : null;
  if (compareSummary && summary) {
    const compareChart = resolvedCompare.points.length >= 2
      ? renderFollowerMovementChart(resolvedCompare.points)
      : '<p class="panel-footnote">Not enough buckets to chart this range.</p>';
    els.followerGrowth.innerHTML = `
      <div class="fg-range-grid">
        ${followerRangeCard('Range A', summary, lostIncomplete)}
        ${followerRangeCard('Range B', compareSummary, resolvedCompare.payload?.lostComplete === false)}
      </div>
      <div class="compare-summary">
        <div class="cmp-grid">${followerCompareCells(summary, compareSummary)}</div>
      </div>
      <div class="fg-spark">
        <p class="fg-chart-tag">Range A · ${escapeHtml(rangeLabel)}</p>
        ${chart}
        <p class="fg-chart-tag">Range B · ${escapeHtml(`${shortDate(compareSummary.startDate)} - ${shortDate(compareSummary.endDate)}`)}</p>
        ${compareChart}
      </div>
      ${footnote}
    `;
    return;
  }

  // Single range: name the end date whenever it is not today, so the headline total is
  // never mistaken for the live follower count.
  const endsToday = !summary || summary.endDate === dayKey(new Date());
  const heroLabel = endsToday ? 'Current followers' : `Followers on ${shortDate(summary.endDate)}`;
  const heroValue = endsToday || summary.endFollowers === null ? account.followers : summary.endFollowers;
  const heroExact = endsToday
    ? `${formatNumber(account.followers)} total - ${formatNumber(account.follows)} following`
    : `${formatNumber(heroValue)} total · ${formatNumber(account.followers)} today`;

  els.followerGrowth.innerHTML = `
    <div class="fg-top">
      <div class="fg-hero">
        <span class="fg-label">${escapeHtml(heroLabel)}</span>
        <strong class="fg-value">${compactNumber(heroValue)}</strong>
        <span class="fg-exact">${escapeHtml(heroExact)}</span>
      </div>
      <div class="fg-nets">
        ${chip('Net latest day', stats.dayNet, lastPoint ? shortDate(lastPoint.date) : '')}
        ${chip('Net 7 days', stats.weekNet, `${formatNumber(stats.gainedWeek)} gained / ${formatNumber(stats.lostWeek)} lost`)}
        ${chip('Net range', stats.rangeNet, rangeLabel)}
      </div>
    </div>
    <div class="fg-summary">
      <div><span>Gained</span><strong>${formatNumber(stats.totalGained)}</strong><small>${escapeHtml(rangeLabel)}</small></div>
      <div><span>Lost</span><strong>${formatNumber(stats.totalLost)}</strong><small>unfollows / lost accounts</small></div>
      <div><span>Growth</span><strong>${escapeHtml(pctText(summary?.growthPct ?? null))}</strong><small>${summary?.startFollowers ? `from ${formatNumber(summary.startFollowers)}` : 'start total unavailable'}</small></div>
    </div>
    <div class="fg-spark">${chart}</div>
    ${footnote}
  `;
}

function renderFollowerMovementChart(series) {
  const width = 760;
  const height = 188;
  const padding = { top: 18, right: 16, bottom: 30, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const barZoneTop = padding.top + 58;
  const barZoneHeight = innerHeight - 58;
  const mid = barZoneTop + barZoneHeight / 2;
  const maxMovement = Math.max(1, ...series.flatMap((point) => [metricNumber(point.gained, 0), metricNumber(point.lost, 0), Math.abs(metricNumber(point.net, 0))]));
  const followerValues = series.map((point) => metricNumber(point.followers, null)).filter((value) => value !== null);
  const minFollowers = Math.min(...followerValues);
  const maxFollowers = Math.max(...followerValues);
  const followerSpan = Math.max(1, maxFollowers - minFollowers);
  const slot = innerWidth / series.length;
  const barWidth = Math.max(2, Math.min(12, slot * 0.52));

  const movementBars = series.map((point, index) => {
    const x = padding.left + index * slot + (slot - barWidth) / 2;
    const gainedHeight = Math.max(point.gained > 0 ? 1 : 0, (metricNumber(point.gained, 0) / maxMovement) * (barZoneHeight / 2 - 4));
    const lostHeight = Math.max(point.lost > 0 ? 1 : 0, (metricNumber(point.lost, 0) / maxMovement) * (barZoneHeight / 2 - 4));
    const label = `${shortDate(point.date)}: ${formatNumber(point.gained)} gained, ${formatNumber(point.lost)} lost, ${signedCompact(point.net)} net`;
    const metrics = followerPointMetrics(point);
    return `
      <rect class="fg-bar gained chart-click" x="${x.toFixed(1)}" y="${(mid - gainedHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${gainedHeight.toFixed(1)}" rx="2" role="button" tabindex="0" aria-label="${escapeAttribute(`${shortDate(point.date)}: ${formatNumber(point.gained)} followers gained`)}" ${insightAttrs({
        id: `followers-gained-${point.date}`,
        title: `Followers gained on ${shortDate(point.date)}`,
        subtitle: 'Daily Graph API follower movement',
        source: 'Graph API follower_count period=day time_series. Lost/unfollowed count comes from follows_and_unfollows follow_type breakdown.',
        metrics
      })}><title>${escapeHtml(label)}</title></rect>
      <rect class="fg-bar lost chart-click" x="${x.toFixed(1)}" y="${mid.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${lostHeight.toFixed(1)}" rx="2" role="button" tabindex="0" aria-label="${escapeAttribute(`${shortDate(point.date)}: ${formatNumber(point.lost)} followers lost`)}" ${insightAttrs({
        id: `followers-lost-${point.date}`,
        title: `Followers lost on ${shortDate(point.date)}`,
        subtitle: 'Daily Graph API follower movement',
        source: 'Graph API follows_and_unfollows period=day total_value, breakdown=follow_type. Instagram does not reveal individual users.',
        metrics
      })}><title>${escapeHtml(label)}</title></rect>
    `;
  }).join('');

  const linePointModels = series.map((point, index) => {
    const x = padding.left + index * slot + slot / 2;
    const value = metricNumber(point.followers, minFollowers);
    const y = padding.top + 4 + (1 - ((value - minFollowers) / followerSpan)) * 48;
    return { point, x, y, value };
  });
  const linePoints = linePointModels.map((model) => `${model.x.toFixed(1)},${model.y.toFixed(1)}`).join(' ');
  const totalDots = linePointModels.map(({ point, x, y, value }) => `<circle class="fg-point chart-click" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" role="button" tabindex="0" aria-label="${escapeAttribute(`${shortDate(point.date)}: ${formatNumber(value)} estimated followers`)}" ${insightAttrs({
    id: `followers-total-${point.date}`,
    title: `Estimated followers on ${shortDate(point.date)}`,
    subtitle: 'Estimated historical follower total',
    source: 'Instagram Graph API gives current followers and daily follower movement. Historical totals are estimated backward from current followers using daily net change.',
    metrics: followerPointMetrics(point)
  })}><title>${escapeHtml(`${shortDate(point.date)}: ${formatNumber(value)} estimated followers`)}</title></circle>`).join('');

  const labelEvery = Math.max(1, Math.ceil(series.length / 6));
  const labels = series.map((point, index) => (index === 0 || index === series.length - 1 || index % labelEvery === 0)
    ? `<text class="chart-label" x="${(padding.left + index * slot + slot / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHtml(shortDate(point.date))}</text>`
    : '').join('');

  return `
    <div class="fg-legend">
      <span><i class="followers"></i>Estimated followers</span>
      <span><i class="gained"></i>Gained</span>
      <span><i class="lost"></i>Lost</span>
    </div>
    <svg class="fg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Follower growth with gained and lost followers">
      <line class="net-axis" x1="${padding.left}" y1="${mid}" x2="${padding.left + innerWidth}" y2="${mid}"></line>
      <text class="chart-label" x="${padding.left - 8}" y="${padding.top + 10}" text-anchor="end">${compactNumber(maxFollowers)}</text>
      <text class="chart-label" x="${padding.left - 8}" y="${padding.top + 56}" text-anchor="end">${compactNumber(minFollowers)}</text>
      ${movementBars}
      <polyline class="fg-line" points="${linePoints}"></polyline>
      ${totalDots}
      ${labels}
    </svg>
  `;
}

function followerPointMetrics(point) {
  return [
    { label: 'Estimated followers', value: formatNumber(point.followers) },
    { label: 'Gained', value: formatNumber(point.gained) },
    { label: 'Lost', value: formatNumber(point.lost) },
    { label: 'Net change', value: signedCompact(point.net) }
  ];
}

function followerDateBounds(series) {
  const times = series
    .map((point) => parseKey(point.date).getTime())
    .filter((time) => Number.isFinite(time));
  if (!times.length) return null;
  return {
    min: startOfDay(new Date(Math.min(...times))),
    max: startOfDay(new Date(Math.max(...times)))
  };
}

function activeFollowerRange(series) {
  const bounds = followerDateBounds(series);
  if (!bounds) return null;
  if (state.followerRange?.start && state.followerRange?.end) {
    return { start: startOfDay(parseKey(state.followerRange.start)), end: startOfDay(parseKey(state.followerRange.end)) };
  }
  return { start: bounds.min, end: bounds.max };
}

function followerRangeStats(series) {
  const week = series.slice(-7);
  const totalGained = series.reduce((sum, point) => sum + metricNumber(point.gained, 0), 0);
  const totalLost = series.reduce((sum, point) => sum + metricNumber(point.lost, 0), 0);
  return {
    dayNet: metricNumber(series[series.length - 1]?.net, 0),
    weekNet: week.reduce((sum, point) => sum + metricNumber(point.net, 0), 0),
    gainedWeek: week.reduce((sum, point) => sum + metricNumber(point.gained, 0), 0),
    lostWeek: week.reduce((sum, point) => sum + metricNumber(point.lost, 0), 0),
    totalGained,
    totalLost,
    rangeNet: totalGained - totalLost
  };
}

function updateFollowerRangeLabel(range) {
  if (!els.followerRangeLabel) return;
  if (!range) {
    els.followerRangeLabel.textContent = 'No data';
    return;
  }
  els.followerRangeLabel.textContent = withCompareSuffix(state.followerRange?.start
    ? `${shortDate(dayKey(range.start))} - ${shortDate(dayKey(range.end))}`
    : 'All available', state.followerCompareRange);
}

function renderGenderBreakdown() {
  const audience = state.data.audience;
  const note = '<p class="panel-footnote">Counts of unique accounts - no individual followers or IDs. Instagram does not provide views broken down by gender.</p>';

  if (!audience || !audience.available) {
    if (els.genderTimeframeLabel) els.genderTimeframeLabel.hidden = true;
    els.genderBreakdown.innerHTML = `<div class="chart-empty">${escapeHtml(audience?.reason || 'Audience demographics are unavailable.')}</div>${note}`;
    return;
  }

  // Window dropdown: only timeframes the API actually returned.
  const timeframes = audience.timeframes || [];
  const selected = (state.audienceTimeframe && timeframes.includes(state.audienceTimeframe))
    ? state.audienceTimeframe
    : (audience.defaultTimeframe || timeframes[0] || null);
  if (els.genderTimeframe && els.genderTimeframeLabel) {
    els.genderTimeframeLabel.hidden = timeframes.length === 0;
    els.genderTimeframe.innerHTML = timeframes
      .map((tf) => `<option value="${tf}">${escapeHtml(timeframeLabel(tf))}</option>`)
      .join('');
    if (selected) els.genderTimeframe.value = selected;
  }

  // Demographics are lifetime metrics with fixed Meta timeframes - no arbitrary since/until -
  // so the comparison picks a second preset. Every timeframe is already loaded, so this is free.
  const compareOptions = timeframes.filter((tf) => tf !== selected);
  const compareTf = compareOptions.includes(state.audienceCompareTimeframe) ? state.audienceCompareTimeframe : null;
  if (els.genderCompare && els.genderCompareLabel) {
    els.genderCompareLabel.hidden = compareOptions.length === 0;
    els.genderCompare.innerHTML = `<option value="">None</option>${compareOptions
      .map((tf) => `<option value="${tf}">${escapeHtml(timeframeLabel(tf))}</option>`)
      .join('')}`;
    els.genderCompare.value = compareTf || '';
  }
  const reachCompare = (compareTf && audience.reachByGender?.[compareTf]) || null;
  const engagedCompare = (compareTf && audience.engagedByGender?.[compareTf]) || null;
  const profileViewsCompare = (compareTf && audience.profileViewsByTimeframe?.[compareTf] != null)
    ? audience.profileViewsByTimeframe[compareTf]
    : null;

  const followersGender = audience.followers?.gender || {};
  const reach = (selected && audience.reachByGender?.[selected]) || {};
  const engaged = (selected && audience.engagedByGender?.[selected]) || {};
  const profileViews = (selected && audience.profileViewsByTimeframe?.[selected] != null)
    ? audience.profileViewsByTimeframe[selected]
    : null;
  const present = ['F', 'M', 'U'].filter((code) => followersGender[code] || reach[code] || engaged[code]);

  const block = (title, map, window, compareMap) => {
    const total = sumValues(map);
    if (!total) {
      return `<div class="gx-metric">
        <div class="gx-metric-head"><span>${escapeHtml(title)}</span></div>
        <p class="gx-missing">Not returned by Instagram for this account / API version.</p>
      </div>`;
    }
    const compareTotal = compareMap ? sumValues(compareMap) : null;
    return `<div class="gx-metric">
      <div class="gx-metric-head"><span>${escapeHtml(title)}</span><small>${escapeHtml(window || compactNumber(total) + ' total')}</small>${compareTotal === null ? '' : deltaBadge(total, compareTotal)}</div>
      ${present.map((code) => {
        const value = map[code] || 0;
        const share = total ? value / total : 0;
        return `<div class="gx-row${compareMap ? ' has-compare' : ''}">
          <span class="gx-name"><i style="background:${GENDER_COLORS[code]}"></i>${escapeHtml(genderLabel(code))}</span>
          <div class="gx-track"><span style="width:${(share * 100).toFixed(1)}%;background:${GENDER_COLORS[code]}"></span></div>
          <strong>${percent(share)} <small>${compactNumber(value)}</small></strong>
          ${compareMap ? deltaBadge(value, compareMap[code]) : ''}
        </div>`;
      }).join('')}
    </div>`;
  };

  els.genderBreakdown.innerHTML = `
    <div class="gx-wrap">
      ${block('Followers', followersGender, 'lifetime')}
      ${block('Reach', reach, timeframeLabel(selected), reachCompare)}
      ${block('Interactions', engaged, timeframeLabel(selected), engagedCompare)}
    </div>
    ${compareTf ? `<p class="gx-compare-head">${escapeHtml(timeframeLabel(selected))} <span>vs</span> ${escapeHtml(timeframeLabel(compareTf))}</p>` : ''}
    <div class="gx-views">
      <div><span>Views (total)</span><strong>${metricCompact(state.data.summary.totalViews)}</strong></div>
      <div><span>Profile views${selected ? ` · ${escapeHtml(timeframeLabel(selected))}` : ''}</span><strong>${profileViews != null ? compactNumber(profileViews) : '—'}</strong>${profileViewsCompare != null && profileViews != null ? deltaBadge(profileViews, profileViewsCompare) : ''}</div>
      <small>Totals only - Instagram doesn't split views or profile views by gender</small>
    </div>
    ${note}
  `;
}

function renderAudienceDemographics() {
  const audience = state.data.audience;
  if (!audience || !audience.available) {
    els.audienceDemographics.innerHTML = `<div class="chart-empty">${escapeHtml(audience?.reason || 'Demographics unavailable.')}</div>`;
    return;
  }

  const followers = audience.followers || {};
  const ageTotal = sumValues(followers.age || {});

  const ageOrder = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const ageMax = Math.max(1, ...Object.values(followers.age || {}));
  const ageBlock = Object.keys(followers.age || {}).length
    ? `<div class="demo-block"><h4>Age</h4>${ageOrder.filter((age) => followers.age[age]).map((age) => {
        const value = followers.age[age];
        const share = ageTotal ? value / ageTotal : 0;
        return `<div class="gx-row"><span class="gx-name">${age}</span><div class="gx-track"><span style="width:${(value / ageMax * 100).toFixed(1)}%"></span></div><strong>${percent(share)}</strong></div>`;
      }).join('')}</div>`
    : '';

  const listBlock = (title, rows, nameFn) => (rows && rows.length)
    ? `<div class="demo-block"><h4>${escapeHtml(title)}</h4>${(() => {
        const max = Math.max(1, ...rows.map((row) => row.value));
        return rows.map((row) => `<div class="gx-row"><span class="gx-name">${escapeHtml(nameFn(row.key))}</span><div class="gx-track"><span style="width:${(row.value / max * 100).toFixed(1)}%"></span></div><strong>${compactNumber(row.value)}</strong></div>`).join('');
      })()}</div>`
    : '';

  els.audienceDemographics.innerHTML = `
    ${ageBlock}
    ${listBlock('Top countries', followers.country, countryName)}
    ${listBlock('Top cities', followers.city, (key) => key)}
    <p class="panel-footnote">Aggregate follower demographics - no individual identities.</p>
  `;
}

function renderCompareBoard() {
  const groups = groupByType(getVisibleContent({ includeQuery: false, includeSignal: false, includeMinViews: false }));
  const rows = Object.values(groups).sort((a, b) => b.count - a.count);

  if (!rows.length) {
    els.compareBoard.innerHTML = '<div class="empty-rail">Content types will appear here</div>';
    return;
  }

  els.compareBoard.innerHTML = rows.map((row) => `
    <article class="compare-card">
      <div>
        <span class="type-pill ${escapeAttribute(row.type)}">${escapeHtml(row.label)}</span>
        <strong>${formatNumber(row.count)} items</strong>
      </div>
      <dl>
        <div><dt>Avg views</dt><dd>${metricCompact(row.averageViews, 'views')}</dd></div>
        <div><dt>Avg reach</dt><dd>${metricCompact(row.averageReach, 'reach')}</dd></div>
        <div><dt>Engagement</dt><dd>${metricPercent(row.engagementRate)}</dd></div>
      </dl>
    </article>
  `).join('');
}

// Single source of truth for the creator summary (text box, clipboard, and PDF).
function buildReportModel() {
  if (!state.data) return null;

  const summary = state.data.summary;
  const account = state.data.account;
  const content = getVisibleContent({ includeQuery: false, includeSignal: false, includeMinViews: false });
  const totals = metricTotals(content);
  const mixTotal = totals.likes + totals.comments + totals.saves + totals.shares;
  const segments = [
    { key: 'likes', label: 'Likes', value: totals.likes, color: '#111111' },
    { key: 'comments', label: 'Comments', value: totals.comments, color: '#b1b1b1' },
    { key: 'saves', label: 'Saves', value: totals.saves, color: '#ed1b24' },
    { key: 'shares', label: 'Shares', value: totals.shares, color: '#595959' }
  ].map((seg) => ({ ...seg, share: mixTotal ? seg.value / mixTotal : 0 }));
  const dominant = segments.slice().sort((a, b) => b.value - a.value)[0];

  const top = content.slice().sort((a, b) => compareValues(a, b, 'views', 'desc')).slice(0, 3);
  const fastest = content.slice().sort((a, b) => compareValues(a, b, 'deltaViews', 'desc'))[0];
  const bestSlot = bestPostingSlot(content);
  const formatLeader = Object.values(groupByType(content))
    .filter((group) => group.averageViews != null)
    .sort((a, b) => (b.averageViews || 0) - (a.averageViews || 0))[0] || null;

  const times = content.map((item) => new Date(item.timestamp).getTime()).filter(Number.isFinite);
  const spanDays = times.length ? Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86400000) + 1) : 0;
  const perWeek = spanDays ? content.length / (spanDays / 7) : 0;

  const day = summary.dayDelta;
  const dayViews = day && day.available
    ? `${signedCompact(day.views)} ${day.basis === 'previous-day' ? `vs ${shortDate(day.sinceDate)}` : 'today'}`
    : null;

  return {
    // Respect the eye-icon toggle so the username stays hidden in the report / PDF / TXT too.
    username: state.usernameHidden ? '••••••••' : (account.username || 'instagram'),
    followers: account.followers,
    range: formatRangeLabel(content) || '—',
    generatedAt: new Date(),
    count: content.length,
    kpis: {
      views: summary.totalViews,
      reach: summary.totalReach,
      interactions: summary.totalInteractions,
      engagementRate: summary.engagementRate,
      dayViews
    },
    mix: { segments, total: mixTotal, dominant },
    top,
    fastest: fastest && fastest.deltaViews > 0 ? fastest : null,
    bestSlot,
    formatLeader,
    cadence: { count: content.length, spanDays, perWeek }
  };
}

function renderReport() {
  els.reportBox.textContent = buildReportText();
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(buildReportText());
    els.copyReport.textContent = 'Copied';
    setTimeout(() => {
      els.copyReport.textContent = 'Copy';
    }, 1400);
  } catch {
    els.copyReport.textContent = 'Select text';
  }
}

function buildReportText(model = buildReportModel()) {
  if (!model) return 'Report will appear after sync.';

  const k = model.kpis;
  const lines = [
    `Instagram Reels report for @${model.username}`,
    `Date range: ${model.range}  ·  Generated: ${model.generatedAt.toLocaleString()}`,
    `Followers: ${formatNumber(model.followers)}  ·  Posts tracked: ${formatNumber(model.count)} (~${model.cadence.perWeek.toFixed(1)}/week)`,
    '',
    `Views: ${metricCompact(k.views)} (${metricExact(k.views)})${k.dayViews ? `  ·  ${k.dayViews}` : ''}`,
    `Reach: ${metricCompact(k.reach)} (${metricExact(k.reach)})`,
    `Interactions: ${metricCompact(k.interactions)} (${metricExact(k.interactions)})`,
    `Engagement rate: ${metricPercent(k.engagementRate)}`,
    '',
    `Engagement mix: ${model.mix.segments.map((s) => `${s.label} ${percent(s.share)}`).join(' · ')}`,
    model.mix.total ? `Signal: ${model.mix.dominant.label} drive ${percent(model.mix.dominant.share)} of engagement.` : 'Signal: engagement breakdown unavailable.',
    '',
    'Top performers:'
  ];
  model.top.forEach((item, index) => {
    lines.push(`  ${index + 1}. "${item.caption}" - ${metricCompact(item.views)} views | ${metricPercent(item.engagementRate)} eng | score ${formatNumber(item.contentScore || 0)}`);
  });
  lines.push('');
  if (model.fastest) lines.push(`Fastest mover: "${model.fastest.caption}" +${compactNumber(model.fastest.deltaViews)} views since last sync.`);
  if (model.bestSlot) lines.push(`Best posting window: ${model.bestSlot.label} - ${compactNumber(model.bestSlot.averageViews)} avg views (${model.bestSlot.count} posts).`);
  if (model.formatLeader) lines.push(`Top format: ${model.formatLeader.label} - ${metricCompact(model.formatLeader.averageViews)} avg views across ${formatNumber(model.formatLeader.count)} posts.`);
  return lines.join('\n');
}

function buildReportHtml(model) {
  const esc = escapeHtml;
  const kpiCard = (label, value, exact) => `
    <div class="kpi">
      <span class="kpi-label">${esc(label)}</span>
      <strong class="kpi-value">${esc(value)}</strong>
      <span class="kpi-exact">${esc(exact)}</span>
    </div>`;
  const k = model.kpis;

  const mix = model.mix.total
    ? `<div class="mixbar">${model.mix.segments.filter((s) => s.value > 0).map((s) => `<span style="width:${(s.share * 100).toFixed(2)}%;background:${s.color}"></span>`).join('')}</div>
       <div class="mixlegend">${model.mix.segments.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} ${percent(s.share)}</span>`).join('')}</div>`
    : '<p class="muted">Engagement breakdown unavailable.</p>';

  const highlights = [];
  if (model.mix.total) highlights.push(`<strong>${esc(model.mix.dominant.label)}</strong> drive <strong>${percent(model.mix.dominant.share)}</strong> of engagement - your strongest distribution signal.`);
  if (model.bestSlot) highlights.push(`Best posting window: <strong>${esc(model.bestSlot.label)}</strong> at ${compactNumber(model.bestSlot.averageViews)} avg views (${model.bestSlot.count} posts).`);
  if (model.fastest) highlights.push(`Fastest mover: <strong>${esc(model.fastest.caption)}</strong> +${compactNumber(model.fastest.deltaViews)} views since last sync.`);
  if (model.formatLeader) highlights.push(`Top format: <strong>${esc(model.formatLeader.label)}</strong> at ${metricCompact(model.formatLeader.averageViews)} avg views.`);
  highlights.push(`Cadence: <strong>${formatNumber(model.count)}</strong> posts over ${model.cadence.spanDays} days (~${model.cadence.perWeek.toFixed(1)}/week).`);

  const rows = model.top.map((item, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="cap">${esc(item.caption || 'Untitled')}</td>
      <td>${metricCompact(item.views)}</td>
      <td>${metricCompact(item.reach)}</td>
      <td>${metricPercent(item.engagementRate)}</td>
      <td>${formatNumber(item.contentScore || 0)}</td>
    </tr>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reels Report - @${esc(model.username)}</title>
<style>
  :root{--ink:#0a0a0a;--muted:#6e6e6e;--line:#e6e6e6;--surface:#f5f5f5;--olive:#ed1b24;--olived:#c8121b;}
  *{box-sizing:border-box;}
  @page{size:A4;margin:16mm;}
  html,body{margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);font-size:12px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .doc{max-width:760px;margin:0 auto;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--olive);padding-bottom:14px;margin-bottom:18px;}
  .brand{display:flex;gap:12px;align-items:center;}
  .mark{width:38px;height:38px;border-radius:9px;background:var(--olived);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:20px;}
  h1{font-size:18px;margin:0;letter-spacing:-0.01em;}
  .sub{color:var(--muted);font-size:12px;margin-top:2px;}
  .head-right{text-align:right;color:var(--muted);font-size:11px;}
  .head-right strong{display:block;color:var(--ink);font-size:13px;}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin:22px 0 8px;}
  .kpis{display:flex;gap:10px;}
  .kpi{flex:1;border:1px solid var(--line);border-radius:9px;padding:11px 12px;background:var(--surface);}
  .kpi-label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;}
  .kpi-value{display:block;font-size:21px;font-weight:500;margin-top:3px;font-variant-numeric:tabular-nums;}
  .kpi-exact{color:var(--muted);font-size:10px;}
  .mixbar{display:flex;height:16px;border-radius:8px;overflow:hidden;border:1px solid var(--line);}
  .mixbar span{display:block;}
  .mixlegend{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11px;}
  .mixlegend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;}
  ul.hi{margin:0;padding-left:18px;}
  ul.hi li{margin:3px 0;}
  table{width:100%;border-collapse:collapse;margin-top:6px;}
  th,td{text-align:right;padding:7px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;}
  th{font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);}
  th:nth-child(2),td.cap{text-align:left;}
  td.rank{color:var(--muted);text-align:left;width:24px;}
  td.cap{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .foot{margin-top:26px;border-top:1px solid var(--line);padding-top:10px;color:var(--muted);font-size:10px;display:flex;justify-content:space-between;}
  .muted{color:var(--muted);}
</style></head>
<body><div class="doc">
  <div class="head">
    <div class="brand">
      <div class="mark">M</div>
      <div>
        <h1>Reels Performance Report</h1>
        <div class="sub">@${esc(model.username)} &middot; ${esc(model.range)}</div>
      </div>
    </div>
    <div class="head-right">
      <strong>${formatNumber(model.followers)} followers</strong>
      Generated ${model.generatedAt.toLocaleDateString()} ${model.generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
  </div>

  <div class="kpis">
    ${kpiCard('Views', metricCompact(k.views), metricExact(k.views))}
    ${kpiCard('Reach', metricCompact(k.reach), metricExact(k.reach))}
    ${kpiCard('Interactions', metricCompact(k.interactions), metricExact(k.interactions))}
    ${kpiCard('Engagement rate', metricPercent(k.engagementRate), k.dayViews || `${formatNumber(model.count)} posts`)}
  </div>

  <h2>Engagement mix</h2>
  ${mix}

  <h2>Highlights</h2>
  <ul class="hi">${highlights.map((h) => `<li>${h}</li>`).join('')}</ul>

  <h2>Top performers</h2>
  <table>
    <thead><tr><th>#</th><th>Content</th><th>Views</th><th>Reach</th><th>Eng.</th><th>Score</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="foot"><span>Generated by Multia &middot; Instagram Ops</span><span>Data range ${esc(model.range)}</span></div>
</div></body></html>`;
}

function exportReportPdf() {
  const model = buildReportModel();
  if (!model) return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildReportHtml(model));
  doc.close();

  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1500);
  };
  iframe.onload = run;
  // document.write can render synchronously without firing onload - run as a fallback.
  setTimeout(run, 300);
}

function selectContent(contentId) {
  state.selectedContentId = contentId || '';
  renderContentDetail();
  renderReels();
}

function renderContentDetail() {
  if (!state.data) return;

  const selected = getAllContent().find((item) => item.id === state.selectedContentId);
  if (!selected) {
    els.contentDetail.innerHTML = '<p class="detail-empty">Select a reel or post to inspect exact content metrics.</p>';
    return;
  }

  const permalink = safeUrl(selected.permalink);
  els.contentDetail.innerHTML = `
    <div class="detail-heading">
      <div>
        <span class="type-pill ${escapeAttribute(selected.contentType)}">${escapeHtml(selected.contentTypeLabel)}</span>
        <strong>${escapeHtml(selected.caption)}</strong>
        <small>${escapeHtml(relativeDate(selected.timestamp))} - ${escapeHtml(signalSummary(selected))}</small>
      </div>
      <div class="detail-actions">
        <span class="score-pill ${scoreClass(selected.contentScore)}">${formatNumber(selected.contentScore || 0)} score</span>
        ${permalink ? `<a class="secondary-button small-button" href="${escapeAttribute(permalink)}" target="_blank" rel="noreferrer">Open</a>` : ''}
      </div>
    </div>
    <div class="detail-grid">
      ${contentMetric('Views', selected.views, selected.metricMeta?.views)}
      ${contentMetric('Reach', selected.reach, selected.metricMeta?.reach)}
      ${contentMetric('Likes', selected.likes, selected.metricMeta?.likes)}
      ${contentMetric('Comments', selected.comments, selected.metricMeta?.comments)}
      ${contentMetric('Shares', selected.shares, selected.metricMeta?.shares)}
      ${contentMetric('Saves', selected.saves, selected.metricMeta?.saves)}
      ${contentMetric('Interactions', selected.interactions, selected.metricMeta?.interactions)}
      ${contentMetric('Engagement', selected.engagementRate, selected.metricMeta?.engagementRate, true)}
      ${contentMetric('Views / hour', selected.viewsPerHour, { label: 'Derived locally from publish time' })}
      ${contentMetric('Velocity', selected.deltaViews, { label: 'Change since previous sync' })}
    </div>
  `;
}

function contentMetric(label, value, meta = {}, isPercent = false) {
  const known = isMetricKnown(value);
  const compact = isPercent ? metricPercent(value) : metricCompact(value);
  const exact = isPercent ? metricPercent(value) : metricExact(value);

  return `
    <div class="detail-metric ${known ? '' : 'is-unavailable'}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(compact)}</strong>
      <small>${escapeHtml(exact)}</small>
      ${meta?.label ? `<em>${escapeHtml(meta.label)}</em>` : ''}
    </div>
  `;
}

function renderReels() {
  if (!state.data) return;

  const reels = getVisibleContent();

  if (!reels.length) {
    els.reelsTbody.innerHTML = `
      <tr>
        <td colspan="10"><div class="empty-table">No content matches this view</div></td>
      </tr>
    `;
    els.mobileReels.innerHTML = '<div class="empty-table">No content matches this view</div>';
    renderSortIndicators();
    return;
  }

  els.reelsTbody.innerHTML = reels.map((reel) => `
    <tr class="content-row ${state.selectedContentId === reel.id ? 'selected' : ''}" data-content-id="${escapeAttribute(reel.id)}" tabindex="0" role="button" aria-label="Inspect ${escapeAttribute(reel.caption)}">
      <td>${reelCell(reel)}</td>
      <td><span class="type-pill ${escapeAttribute(reel.contentType)}">${escapeHtml(reel.contentTypeLabel)}</span></td>
      <td class="number">${metricCell(reel, 'views')}</td>
      <td class="number positive">${numberStack(`+${compactNumber(reel.deltaViews)}`, `+${formatNumber(reel.deltaViews)}`)}</td>
      <td class="number">${metricCell(reel, 'reach')}</td>
      <td class="number">${metricCell(reel, 'interactions')}</td>
      <td class="number">${metricCell(reel, 'engagementRate', true)}</td>
      <td class="number">${watchTimeCell(reel)}</td>
      <td class="number"><span class="score-pill ${scoreClass(reel.contentScore)}">${formatNumber(reel.contentScore || 0)}</span></td>
      <td>${relativeDate(reel.timestamp)}</td>
    </tr>
  `).join('');

  els.mobileReels.innerHTML = reels.map((reel) => `
    <article class="reel-card-mobile ${state.selectedContentId === reel.id ? 'selected' : ''}" data-content-id="${escapeAttribute(reel.id)}" tabindex="0" role="button" aria-label="Inspect ${escapeAttribute(reel.caption)}">
      ${reelCell(reel)}
      <div class="mobile-stats">
        ${mobileStat('Type', reel.contentTypeLabel)}
        ${mobileStat('Views', metricCompact(reel.views, 'views'), metricExact(reel.views))}
        ${mobileStat('Velocity', `+${compactNumber(reel.deltaViews)}`, `+${formatNumber(reel.deltaViews)}`)}
        ${mobileStat('Reach', metricCompact(reel.reach, 'reach'), metricExact(reel.reach))}
        ${mobileStat('Engagement', metricPercent(reel.engagementRate), metricPercent(reel.engagementRate))}
        ${mobileStat('Watch time', watchTimeShort(reel.avgWatchTime))}
        ${mobileStat('Score', formatNumber(reel.contentScore || 0))}
      </div>
    </article>
  `).join('');
  renderSortIndicators();
}

function reelCell(reel) {
  const thumbnailUrl = safeUrl(reel.thumbnailUrl);
  const permalink = safeUrl(reel.permalink);
  const thumb = thumbnailUrl
    ? `<img src="${escapeAttribute(thumbnailUrl)}" alt="">`
    : escapeHtml((reel.contentTypeLabel || 'POST').toUpperCase());
  const link = permalink
    ? `<a href="${escapeAttribute(permalink)}" target="_blank" rel="noreferrer">Open on Instagram</a>`
    : '<span></span>';

  return `
    <div class="reel-cell">
      <div class="thumb">${thumb}</div>
      <div class="caption">
        <strong title="${escapeAttribute(reel.caption)}">${escapeHtml(reel.caption)}</strong>
        <span class="caption-meta">${escapeHtml(signalSummary(reel))}</span>
        ${link}
      </div>
    </div>
  `;
}

function mobileStat(label, value, detail = '') {
  return `
    <div class="mobile-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
    </div>
  `;
}

function getVisibleContent({ includeQuery = true, includeSignal = true, includeMinViews = true } = {}) {
  const query = state.query;

  return filterByPeriod(getAllContent())
    .filter((item) => state.typeFilter === 'all' || item.contentType === state.typeFilter)
    .filter((item) => !includeSignal || state.signalFilter === 'all' || item.signalTags?.includes(state.signalFilter))
    .filter((item) => !includeMinViews || !state.minViews || metricNumber(item.views, 0) >= state.minViews)
    .filter((item) => !includeQuery || !query || item.caption.toLowerCase().includes(query))
    .sort((a, b) => compareValues(a, b, state.sort, state.sortDir));
}

function getAllContent() {
  return state.data?.content || state.data?.reels || [];
}

function filterByPeriod(content) {
  if (state.period === 'all') return [...content];

  const days = Number(state.period);
  const cutoff = Date.now() - days * 86400000;
  return content.filter((item) => new Date(item.timestamp).getTime() >= cutoff);
}

function buildTrendFromContent(content, metric) {
  const datedContent = content
    .map((item) => ({ item, date: new Date(item.timestamp) }))
    .filter(({ date }) => Number.isFinite(date.getTime()));
  const today = startOfDay(new Date());
  const days = state.period === 'all' ? 30 : Number(state.period);
  const earliest = state.period === 'all' && datedContent.length
    ? startOfDay(new Date(Math.min(...datedContent.map(({ date }) => date.getTime()))))
    : startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  const totalDays = Math.max(1, Math.round((today.getTime() - earliest.getTime()) / 86400000) + 1);
  const stepDays = state.period === 'all' && totalDays > 60 ? Math.ceil(totalDays / 60) : 1;
  const buckets = [];

  for (let offset = 0; offset < totalDays; offset += stepDays) {
    const date = new Date(earliest);
    date.setDate(earliest.getDate() + offset);
    const end = new Date(date);
    end.setDate(date.getDate() + stepDays);
    buckets.push({
      key: date.toISOString().slice(0, 10),
      start: date,
      end,
      label: stepDays > 1 ? shortDate(date.toISOString().slice(0, 10)) : shortDate(date.toISOString().slice(0, 10)),
      value: 0,
      content: 0
    });
  }

  for (const { item, date } of datedContent) {
    const bucket = buckets.find((entry) => date >= entry.start && date < entry.end);
    if (!bucket) continue;
    bucket.value += metricNumber(item[metric], 0);
    bucket.content += 1;
  }

  return buckets;
}

function metricTotals(content) {
  return content.reduce((totals, item) => {
    ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'interactions'].forEach((key) => {
      totals[key] += metricNumber(item[key], 0);
    });
    return totals;
  }, {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    interactions: 0
  });
}

function buildPostingSlots(content) {
  const slots = [];
  for (let day = 0; day < 7; day += 1) {
    for (let window = 0; window < 4; window += 1) {
      slots.push(emptyPostingSlot(day, window));
    }
  }

  content.forEach((item) => {
    const date = new Date(item.timestamp);
    if (!Number.isFinite(date.getTime())) return;

    const day = (date.getDay() + 6) % 7;
    const window = Math.min(3, Math.floor(date.getHours() / 6));
    const slot = slots.find((entry) => entry.day === day && entry.window === window);
    if (!slot) return;

    slot.contentCount += 1;
    slot.count = slot.contentCount;
    slot.items.push(item);
    if (!isMetricKnown(item.views)) return;

    slot.viewsCount += 1;
    slot.views += metricNumber(item.views);
    slot.averageViews = Math.round(slot.views / slot.viewsCount);
  });

  return slots;
}

function bestPostingSlot(content) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const windows = ['00:00-06:00', '06:00-12:00', '12:00-18:00', '18:00-24:00'];
  const slot = buildPostingSlots(content)
    .filter((entry) => entry.viewsCount > 0)
    .sort((a, b) => b.averageViews - a.averageViews || b.viewsCount - a.viewsCount)[0];

  return slot ? {
    ...slot,
    count: slot.contentCount,
    label: `${days[slot.day]} ${windows[slot.window]}`
  } : null;
}

function groupByType(content) {
  return content.reduce((groups, item) => {
    const key = item.contentType || 'post';
    if (!groups[key]) {
      groups[key] = {
        type: key,
        label: item.contentTypeLabel || 'Post',
        count: 0,
        views: 0,
        viewsCount: 0,
        reach: 0,
        reachCount: 0,
        interactions: 0,
        interactionsCount: 0
      };
    }

    const group = groups[key];
    group.count += 1;
    if (isMetricKnown(item.views)) {
      group.views += metricNumber(item.views);
      group.viewsCount += 1;
    }
    if (isMetricKnown(item.reach)) {
      group.reach += metricNumber(item.reach);
      group.reachCount += 1;
    }
    if (isMetricKnown(item.interactions)) {
      group.interactions += metricNumber(item.interactions);
      group.interactionsCount += 1;
    }
    group.averageViews = group.viewsCount ? Math.round(group.views / group.viewsCount) : null;
    group.averageReach = group.reachCount ? Math.round(group.reach / group.reachCount) : null;
    group.engagementRate = group.reach > 0 && group.interactionsCount ? group.interactions / group.reach : null;
    return groups;
  }, {});
}

function compareValues(a, b, key, direction = 'desc') {
  const multiplier = direction === 'asc' ? 1 : -1;
  let result = 0;

  if (key === 'timestamp') {
    result = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  } else if (key === 'caption' || key === 'contentTypeLabel') {
    result = String(a[key] || '').localeCompare(String(b[key] || ''));
  } else {
    const left = metricNumber(a[key], null);
    const right = metricNumber(b[key], null);
    if (left === null && right === null) result = 0;
    else if (left === null) return 1;
    else if (right === null) return -1;
    else result = left - right;
  }

  if (result === 0) {
    return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
  }

  return result * multiplier;
}

function defaultSortDir(sort) {
  return sort === 'caption' || sort === 'contentTypeLabel' ? 'asc' : 'desc';
}

function renderSortIndicators() {
  document.querySelectorAll('.sort-button').forEach((button) => {
    const active = button.dataset.sort === state.sort;
    button.classList.toggle('active', active);
    button.dataset.dir = active ? state.sortDir : '';
    button.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

function metricCell(item, key, isPercent = false) {
  const value = item[key];
  const meta = item.metricMeta?.[key];
  const label = meta?.label || (isMetricKnown(value) ? 'Metric value' : 'Unavailable');
  const text = isPercent ? metricPercent(value) : metricCompact(value, key);
  const exact = isPercent ? metricPercent(value) : metricExact(value);
  const unavailable = !isMetricKnown(value);
  const derived = meta?.derived ? ' derived' : '';
  return `
    <span class="number-stack ${unavailable ? 'metric-unavailable' : `metric-source${derived}`}" title="${escapeAttribute(label)}">
      <strong>${escapeHtml(text)}</strong>
      <small>${escapeHtml(exact)}</small>
    </span>
  `;
}

function metricCompact(value) {
  return isMetricKnown(value) ? compactNumber(value) : 'Unavailable';
}

function metricExact(value) {
  return isMetricKnown(value) ? formatNumber(value) : 'Unavailable';
}

function metricPercent(value) {
  return isMetricKnown(value) ? percent(value) : 'Unavailable';
}

function decimalMetric(value) {
  if (!isMetricKnown(value)) return 'Unavailable';
  return new Intl.NumberFormat('en', {
    minimumFractionDigits: value > 0 && value < 10 ? 2 : 1,
    maximumFractionDigits: value > 0 && value < 10 ? 2 : 1
  }).format(value);
}

function numberStack(compact, exact) {
  return `
    <span class="number-stack">
      <strong>${escapeHtml(compact)}</strong>
      <small>${escapeHtml(exact)}</small>
    </span>
  `;
}

// Reels watch-time arrives in milliseconds. Avg is a few seconds; totals run to hours.
function formatDuration(ms) {
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec < 10 ? totalSec.toFixed(1) : Math.round(totalSec)}s`;
  const minutes = Math.floor(totalSec / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(totalSec % 60)}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function watchTimeShort(ms) {
  return isMetricKnown(ms) ? formatDuration(ms) : '—';
}

// Avg watch time per view, with total time watched as the supporting line. Reels only.
function watchTimeCell(reel) {
  if (!isMetricKnown(reel.avgWatchTime)) return '<span class="metric-missing">—</span>';
  const total = isMetricKnown(reel.totalWatchTime) ? `${formatDuration(reel.totalWatchTime)} total` : 'avg / view';
  return numberStack(formatDuration(reel.avgWatchTime), total);
}

function isMetricKnown(value) {
  return metricNumber(value, null) !== null;
}

function metricNumber(value, fallback = 0) {
  if (value === null || typeof value === 'undefined' || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scoreClass(score) {
  if (score >= 80) return 'score-high';
  if (score >= 60) return 'score-good';
  if (score >= 40) return 'score-mid';
  return 'score-low';
}

function signalSummary(item) {
  const tags = item.signalTags || [];
  if (tags.includes('missing-core')) return `${item.contentScoreLabel || 'Watch'} - metrics missing`;
  if (tags.includes('breakout')) return `${item.contentScoreLabel || 'Breakout'} - breakout candidate`;
  if (tags.includes('fast')) return `${item.contentScoreLabel || 'Fast'} - fast mover`;
  return item.contentScoreLabel || 'Tracked';
}

function metricTitle(metric) {
  return {
    views: 'Views',
    reach: 'Reach',
    interactions: 'Interactions'
  }[metric] || 'Metric';
}

function insightAttrs({ id, title, subtitle = '', source = '', metrics = [] }) {
  return [
    'data-insight="true"',
    `data-insight-id="${escapeAttribute(id)}"`,
    `data-title="${escapeAttribute(title)}"`,
    `data-subtitle="${escapeAttribute(subtitle)}"`,
    `data-source="${escapeAttribute(source)}"`,
    `data-metrics="${escapeAttribute(JSON.stringify(metrics))}"`
  ].join(' ');
}

function parseInsightMetrics(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function showWarning(warnings) {
  if (!warnings.length) {
    els.warningPanel.classList.add('hidden');
    els.warningPanel.textContent = '';
    return;
  }

  els.warningPanel.classList.remove('hidden');
  els.warningPanel.textContent = warnings.slice(0, 3).join(' ');
}

function updateConnection(status, label) {
  els.connectionChip.className = `connection-chip ${status}`;
  els.connectionChip.innerHTML = `<span class="status-dot"></span>${escapeHtml(label)}`;
}

function updateLiveBadge(status, label) {
  els.liveBadge.className = `live-badge ${status}`;
  els.liveBadge.textContent = label;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (response.status === 401) {
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error('Signed out');
  }
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.detail || payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function closestRefreshOption(value) {
  const options = [...els.refreshSelect.options].map((option) => Number(option.value));
  return options.reduce((best, option) => Math.abs(option - value) < Math.abs(best - value) ? option : best, options[0]);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value || 0);
}

function pluralLabel(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function compactNumber(value) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000000 ? 1 : 0
  }).format(value || 0);
}

function percent(value) {
  return new Intl.NumberFormat('en', {
    style: 'percent',
    minimumFractionDigits: value > 0 && value < 0.1 ? 1 : 0,
    maximumFractionDigits: 1
  }).format(value || 0);
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

// Exact date + time, e.g. "Jun 27, 9:14 PM" - used for "compared to" captions.
function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function relativeDate(value) {
  const date = new Date(value);
  const days = Math.round((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function shortDate(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(`${value}T00:00:00`));
}

function reachMonthLabel(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}-01T00:00:00`));
}

function initials(value) {
  return String(value || 'IG').slice(0, 2).toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function safeUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
