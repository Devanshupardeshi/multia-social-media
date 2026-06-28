const state = {
  data: null,
  pollTimer: null,
  refreshMs: 60000,
  period: 'all',
  chartMetric: 'views',
  chartScale: 'log',
  selectedInsight: null,
  selectedContentId: '',
  sort: 'views',
  sortDir: 'desc',
  typeFilter: 'all',
  signalFilter: 'all',
  minViews: 0,
  query: '',
  isRefreshing: false,
  reachRange: null,
  reachCal: null,
  audienceTimeframe: null,
  accountWindow: null
};

const els = {
  connectionChip: document.querySelector('#connection-chip'),
  accountAvatar: document.querySelector('#account-avatar'),
  accountTitle: document.querySelector('#account-title'),
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
  scaleTabs: document.querySelector('#scale-tabs'),
  funnelChart: document.querySelector('#funnel-chart'),
  savesSharesChart: document.querySelector('#saves-shares-chart'),
  heatmapChart: document.querySelector('#heatmap-chart'),
  scatterChart: document.querySelector('#scatter-chart'),
  distributionChart: document.querySelector('#distribution-chart'),
  engagementChart: document.querySelector('#engagement-chart'),
  reachChart: document.querySelector('#reach-chart'),
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
  genderBreakdown: document.querySelector('#gender-breakdown'),
  genderTimeframe: document.querySelector('#gender-timeframe'),
  genderTimeframeLabel: document.querySelector('#gender-timeframe-label'),
  accountInsights: document.querySelector('#account-insights'),
  accountWindow: document.querySelector('#account-window'),
  accountWindowLabel: document.querySelector('#account-window-label'),
  audienceDemographics: document.querySelector('#audience-demographics'),
  compareBoard: document.querySelector('#compare-board'),
  contentDetail: document.querySelector('#content-detail'),
  reportBox: document.querySelector('#report-box'),
  copyReport: document.querySelector('#copy-report'),
  exportPdf: document.querySelector('#export-pdf')
};

init();

async function init() {
  bindEvents();
  await loadStatus();
  await refreshNow();
  connectLiveStream();
}

function bindEvents() {
  els.refreshSelect.addEventListener('change', () => {
    state.refreshMs = Number(els.refreshSelect.value);
    connectLiveStream();
  });

  els.manualRefresh.addEventListener('click', () => refreshNow());

  els.periodTabs.addEventListener('click', (event) => {
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

  els.scaleTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-scale]');
    if (!button) return;

    state.chartScale = button.dataset.scale;
    els.scaleTabs.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    renderCharts();
  });

  els.reachRangeTrigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleReachCalendar();
  });

  els.reachCalendar?.addEventListener('click', (event) => {
    event.stopPropagation();
    const nav = event.target.closest('[data-cal-nav]');
    if (nav && state.reachCal) {
      state.reachCal.view = new Date(state.reachCal.view.getFullYear(), state.reachCal.view.getMonth() + Number(nav.dataset.calNav), 1);
      renderReachCalendar();
      return;
    }
    if (event.target.closest('[data-cal-reset]')) {
      state.reachRange = null;
      toggleReachCalendar(false);
      renderCharts();
      return;
    }
    const dayBtn = event.target.closest('[data-cal-day]');
    if (dayBtn) pickReachDay(dayBtn.dataset.calDay);
  });

  document.addEventListener('click', (event) => {
    if (!els.reachCalendar || els.reachCalendar.hasAttribute('hidden')) return;
    if (event.target.closest('.range-control')) return;
    toggleReachCalendar(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.reachCalendar && !els.reachCalendar.hasAttribute('hidden')) {
      toggleReachCalendar(false);
    }
  });

  document.querySelector('.analytics-grid')?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-insight]');
    if (!target) return;

    setSelectedInsight(target);
  });

  document.querySelector('.analytics-grid')?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const target = event.target.closest('[data-insight]');
    if (!target) return;

    event.preventDefault();
    setSelectedInsight(target);
  });

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
    renderGenderBreakdown();
  });
  els.accountWindow?.addEventListener('change', () => {
    state.accountWindow = els.accountWindow.value;
    renderAccountInsights();
  });
}

async function loadStatus() {
  try {
    const status = await fetchJson('/api/status');
    state.refreshMs = status.refreshMs || state.refreshMs;
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

async function refreshNow(silent = false) {
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  if (!silent) {
    els.manualRefresh.disabled = true;
    els.manualRefresh.textContent = 'Syncing';
  }

  try {
    const data = await fetchJson('/api/instagram?force=1&all=1&limit=1000');
    updateData(data);
    updateLiveBadge(data.mode === 'graph-api' ? 'connected' : 'demo', data.mode === 'graph-api' ? 'Live' : 'Demo live');
  } catch (error) {
    showWarning([error.message || 'Unable to sync dashboard data']);
    updateConnection('error', 'Sync error');
    updateLiveBadge('error', 'Reconnecting');
  } finally {
    state.isRefreshing = false;
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

function renderAccount() {
  const { account, summary, updatedAt, graphApiVersion } = state.data;
  els.accountTitle.textContent = `@${account.username}`;
  els.accountMeta.textContent = `${formatNumber(account.followers)} followers - ${formatNumber(summary.contentCount)} items loaded - ${graphApiVersion}`;
  els.lastUpdated.textContent = `Updated ${formatTime(updatedAt)}`;

  const profilePictureUrl = safeUrl(account.profilePictureUrl);
  if (profilePictureUrl) {
    els.accountAvatar.innerHTML = `<img src="${escapeAttribute(profilePictureUrl)}" alt="">`;
  } else {
    els.accountAvatar.textContent = initials(account.username);
  }
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
  const viewsDelta = dayReady ? signedCompact(day.views) : `+${compactNumber(summary.deltaViews)}`;
  const interactionsDelta = dayReady ? signedCompact(day.interactions) : `+${compactNumber(summary.deltaInteractions)}`;
  const cards = [
    {
      label: 'Views',
      value: metricCompact(summary.totalViews, 'views'),
      exact: metricExact(summary.totalViews),
      delta: viewsDelta,
      deltaTitle: dayTitle,
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
    </article>
  `).join('');
}

function renderCharts() {
  const content = getVisibleContent({ includeQuery: false, includeSignal: false, includeMinViews: false });
  renderTrendChart(content);
  renderReachChart(content);
  renderFunnelChart(content);
  renderSavesSharesChart(content);
  renderHeatmapChart(content);
  renderScatterChart(content);
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
    els.scatterChart,
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

function renderTrendChart(content) {
  const metric = state.chartMetric;
  const metricName = metricTitle(metric);
  const trend = buildTrendFromContent(content, metric);
  setPanelDates(els.trendChart, trend.length ? `${shortDate(trend[0].key)} – ${shortDate(trend[trend.length - 1].key)}` : '');
  const maxValue = Math.max(1, ...trend.map((item) => item.value));
  // Log scale keeps a single viral spike from flattening every other day into the baseline.
  const useLog = state.chartScale !== 'linear';
  const logMax = Math.log10(maxValue + 1);
  const scaleRatio = (value) => {
    const safe = Math.max(0, value);
    if (useLog) return logMax > 0 ? Math.log10(safe + 1) / logMax : 0;
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
    const value = useLog ? Math.pow(10, ratio * logMax) - 1 : maxValue * ratio;
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

function toggleReachCalendar(force) {
  if (!els.reachCalendar) return;
  const shouldOpen = typeof force === 'boolean' ? force : els.reachCalendar.hasAttribute('hidden');
  if (shouldOpen) {
    const range = activeReachRange(chartContent());
    const base = range ? range.end : new Date();
    state.reachCal = { view: new Date(base.getFullYear(), base.getMonth(), 1), pendingStart: null };
    renderReachCalendar();
    els.reachCalendar.removeAttribute('hidden');
    els.reachRangeTrigger.setAttribute('aria-expanded', 'true');
  } else {
    els.reachCalendar.setAttribute('hidden', '');
    els.reachRangeTrigger.setAttribute('aria-expanded', 'false');
  }
}

function pickReachDay(key) {
  const cal = state.reachCal;
  if (!cal) return;
  if (!cal.pendingStart) {
    cal.pendingStart = key;
    renderReachCalendar();
    return;
  }
  state.reachRange = cal.pendingStart <= key
    ? { start: cal.pendingStart, end: key }
    : { start: key, end: cal.pendingStart };
  cal.pendingStart = null;
  toggleReachCalendar(false);
  renderCharts();
}

function renderReachCalendar() {
  const cal = state.reachCal;
  if (!cal) return;

  const view = cal.view;
  const year = view.getFullYear();
  const month = view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = new Date(year, month, 1).getDay();
  const todayKey = dayKey(new Date());

  const content = chartContent();
  const dataDays = new Set(content
    .map((item) => {
      const date = new Date(item.timestamp);
      return Number.isFinite(date.getTime()) ? dayKey(date) : null;
    })
    .filter(Boolean));

  const active = activeReachRange(content);
  const rangeStart = cal.pendingStart || (active && dayKey(active.start));
  const rangeEnd = cal.pendingStart ? null : (active && dayKey(active.end));

  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  const blanks = Array.from({ length: lead }, () => '<span class="cal-blank"></span>').join('');
  const cells = Array.from({ length: daysInMonth }, (_, indexNo) => {
    const day = indexNo + 1;
    const key = dayKey(new Date(year, month, day));
    const classes = ['cal-day'];
    if (rangeStart && rangeEnd && key >= rangeStart && key <= rangeEnd) classes.push('in-range');
    if (key === rangeStart) classes.push('is-start');
    if (key === rangeEnd) classes.push('is-end');
    if (key === todayKey) classes.push('is-today');
    if (dataDays.has(key)) classes.push('has-data');
    return `<button class="${classes.join(' ')}" type="button" data-cal-day="${key}">${day}</button>`;
  }).join('');

  const selection = cal.pendingStart
    ? `From ${shortDate(cal.pendingStart)} — pick an end day`
    : (active ? `${shortDate(dayKey(active.start))} – ${shortDate(dayKey(active.end))}` : 'Pick a start day');

  els.reachCalendar.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" type="button" data-cal-nav="-1" aria-label="Previous month">‹</button>
      <strong>${escapeHtml(monthLabel)}</strong>
      <button class="cal-nav" type="button" data-cal-nav="1" aria-label="Next month">›</button>
    </div>
    <div class="cal-grid cal-weekdays"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
    <div class="cal-grid cal-days">${blanks}${cells}</div>
    <div class="cal-foot">
      <span class="cal-selection">${escapeHtml(selection)}</span>
      <button class="cal-reset" type="button" data-cal-reset>Reset</button>
    </div>
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
    { key: 'likes', label: 'Likes', value: metricNumber(totals.likes, 0), color: 'var(--primary-dark)', cls: 'likes' },
    { key: 'comments', label: 'Comments', value: metricNumber(totals.comments, 0), color: 'var(--amber)', cls: 'comments' },
    { key: 'saves', label: 'Saves', value: metricNumber(totals.saves, 0), color: 'var(--blue)', cls: 'saves' },
    { key: 'shares', label: 'Shares', value: metricNumber(totals.shares, 0), color: 'var(--coral)', cls: 'shares' }
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
  const max = Math.max(1, ...slots.map((slot) => slot.averageViews));
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const windows = [
    { label: 'Night', time: '00-06' },
    { label: 'Morning', time: '06-12' },
    { label: 'Afternoon', time: '12-18' },
    { label: 'Evening', time: '18-24' }
  ];

  els.heatmapChart.innerHTML = `
    <div class="chart-note">Cell value is average views</div>
    <div class="heatmap">
      <span></span>
      ${windows.map((window) => `<b><span>${escapeHtml(window.label)}</span><small>${escapeHtml(window.time)}</small></b>`).join('')}
      ${days.map((day, dayIndex) => `
        <b>${day}</b>
        ${windows.map((window, windowIndex) => {
          const slot = slots.find((item) => item.day === dayIndex && item.window === windowIndex) || { count: 0, averageViews: 0 };
          const opacity = slot.count ? 0.18 + (slot.averageViews / max) * 0.72 : 0.08;
          const title = `${day} ${window.label}: ${compactNumber(slot.averageViews)} average views from ${slot.count} posts`;
          return `<button class="heat-cell chart-click" type="button" style="--heat: ${opacity}" title="${escapeAttribute(title)}" ${insightAttrs({
            id: `heat-${dayIndex}-${windowIndex}`,
            title: `${day} ${window.label}`,
            subtitle: window.time,
            source: 'Average views calculated from loaded posts published in this day/time slot.',
            metrics: [
              { label: 'Average views', value: slot.count ? compactNumber(slot.averageViews) : 'No posts' },
              { label: 'Posts', value: formatNumber(slot.count) }
            ]
          })}>
            <strong>${slot.count ? compactNumber(slot.averageViews) : '-'}</strong>
            <small>${slot.count ? `${slot.count} posts` : 'no posts'}</small>
          </button>`;
        }).join('')}
      `).join('')}
    </div>
  `;
}

function renderScatterChart(content) {
  const points = content.filter((item) => isMetricKnown(item.reach) && isMetricKnown(item.engagementRate));
  if (!points.length) {
    els.scatterChart.innerHTML = '<div class="chart-empty">Reach or engagement unavailable</div>';
    return;
  }

  const width = 430;
  const height = 230;
  const padding = { top: 18, right: 18, bottom: 34, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxReach = Math.max(1, ...points.map((item) => metricNumber(item.reach)));
  const maxEngagement = Math.max(0.01, ...points.map((item) => metricNumber(item.engagementRate)));
  const maxViews = Math.max(1, ...points.map((item) => metricNumber(item.views)));
  const circles = points.slice(0, 160).map((item) => {
    const x = padding.left + (metricNumber(item.reach) / maxReach) * innerWidth;
    const y = padding.top + innerHeight - (metricNumber(item.engagementRate) / maxEngagement) * innerHeight;
    const radius = 3 + (metricNumber(item.views) / maxViews) * 7;
    return `<circle class="scatter-point chart-click ${escapeAttribute(item.contentType)}" cx="${x}" cy="${y}" r="${radius}" role="button" tabindex="0" aria-label="${escapeAttribute(`${item.caption}: ${compactNumber(item.reach)} reach, ${percent(item.engagementRate)} engagement`)}" ${insightAttrs({
      id: `scatter-${item.id}`,
      title: item.caption,
      subtitle: `${item.contentTypeLabel || 'Content'} quality position`,
      source: 'X-axis is reach, Y-axis is engagement rate, dot size is views.',
      metrics: [
        { label: 'Reach', value: metricCompact(item.reach) },
        { label: 'Engagement', value: metricPercent(item.engagementRate) },
        { label: 'Views', value: metricCompact(item.views) },
        { label: 'Score', value: formatNumber(item.contentScore || 0) }
      ]
    })}><title>${escapeHtml(item.caption)} - ${compactNumber(item.reach)} reach - ${percent(item.engagementRate)}</title></circle>`;
  }).join('');

  els.scatterChart.innerHTML = `
    <div class="chart-legend compact-legend">
      <span><i class="legend-line"></i>Reels</span>
      <span><i class="legend-save"></i>Videos</span>
      <span><i class="legend-share"></i>Images</span>
      <span><i class="legend-amber"></i>Carousels</span>
    </div>
    <svg class="mini-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reach versus engagement scatter chart">
      <line class="chart-grid" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight}"></line>
      <line class="chart-grid" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}"></line>
      <line class="chart-grid light" x1="${padding.left}" y1="${padding.top + innerHeight / 2}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight / 2}"></line>
      <line class="chart-grid light" x1="${padding.left + innerWidth / 2}" y1="${padding.top}" x2="${padding.left + innerWidth / 2}" y2="${padding.top + innerHeight}"></line>
      ${circles}
      <text class="chart-label" x="${padding.left}" y="${height - 8}">0 reach</text>
      <text class="chart-label" x="${padding.left + innerWidth}" y="${height - 8}" text-anchor="end">${compactNumber(maxReach)} reach</text>
      <text class="chart-label" x="${padding.left - 8}" y="${padding.top + innerHeight}" text-anchor="end">0%</text>
      <text class="chart-label" x="${padding.left - 8}" y="${padding.top + 4}" text-anchor="end">${percent(maxEngagement)}</text>
      <text class="chart-axis-label" x="${padding.left + innerWidth / 2}" y="${height - 22}" text-anchor="middle">Reach</text>
      <text class="chart-axis-label" x="14" y="${padding.top + innerHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${padding.top + innerHeight / 2})">Engagement rate</text>
    </svg>
  `;
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

const GENDER_COLORS = { F: 'var(--primary)', M: 'var(--blue)', U: 'var(--amber)' };

function renderAudience() {
  renderAccountInsights();
  renderFollowerGrowth();
  renderGenderBreakdown();
  renderAudienceDemographics();
}

// Account-level windowed totals + reach split (followers vs non-followers). All real:
// in demo mode accountInsights is unavailable, so this shows a connect prompt, not fake data.
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

  const totals = (selected && ai.byWindow?.[selected]) || {};
  const tiles = [
    ['Views', totals.views],
    ['Reach', totals.reach],
    ['Accounts engaged', totals.accounts_engaged],
    ['Interactions', totals.total_interactions],
    ['Profile views', totals.profile_views]
  ].filter(([, value]) => isMetricKnown(value));

  const tileHtml = tiles.length
    ? `<div class="ai-tiles">${tiles.map(([label, value]) => `
        <div class="ai-tile"><span>${escapeHtml(label)}</span><strong>${compactNumber(value)}</strong><small>${formatNumber(value)}</small></div>
      `).join('')}</div>`
    : '<p class="gx-missing">No windowed totals returned for this account.</p>';

  const follow = (selected && ai.reachByFollowType?.[selected]) || {};
  const followers = metricNumber(follow.FOLLOWER, 0);
  const nonFollowers = metricNumber(follow.NON_FOLLOWER, 0);
  const followTotal = followers + nonFollowers;
  const splitHtml = followTotal > 0
    ? `<div class="ai-split">
        <div class="ai-split-head"><span>Reach source</span><small>${escapeHtml(selectedLabel)}</small></div>
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

function renderFollowerGrowth() {
  const account = state.data.account;
  const trend = state.data.summary.followerTrend || { available: false, dayNet: 0, weekNet: 0, series: [] };
  const series = trend.series || [];

  const chip = (label, value) => {
    const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    return `<div class="net-chip ${cls}"><span>${escapeHtml(label)}</span><strong>${signedCompact(value)}</strong></div>`;
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
        ${chip('Net today', trend.dayNet || 0)}
        ${chip('Net this week', trend.weekNet || 0)}
      </div>
    </div>
    <div class="fg-spark">${spark}</div>
    <p class="panel-footnote">Net change from daily follower snapshots. Instagram never reveals who followed or unfollowed - only aggregate counts.</p>
  `;
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

  const followersGender = audience.followers?.gender || {};
  const reach = (selected && audience.reachByGender?.[selected]) || {};
  const engaged = (selected && audience.engagedByGender?.[selected]) || {};
  const profileViews = (selected && audience.profileViewsByTimeframe?.[selected] != null)
    ? audience.profileViewsByTimeframe[selected]
    : null;
  const present = ['F', 'M', 'U'].filter((code) => followersGender[code] || reach[code] || engaged[code]);

  const block = (title, map, window) => {
    const total = sumValues(map);
    if (!total) {
      return `<div class="gx-metric">
        <div class="gx-metric-head"><span>${escapeHtml(title)}</span></div>
        <p class="gx-missing">Not returned by Instagram for this account / API version.</p>
      </div>`;
    }
    return `<div class="gx-metric">
      <div class="gx-metric-head"><span>${escapeHtml(title)}</span><small>${escapeHtml(window || compactNumber(total) + ' total')}</small></div>
      ${present.map((code) => {
        const value = map[code] || 0;
        const share = total ? value / total : 0;
        return `<div class="gx-row">
          <span class="gx-name"><i style="background:${GENDER_COLORS[code]}"></i>${escapeHtml(genderLabel(code))}</span>
          <div class="gx-track"><span style="width:${(share * 100).toFixed(1)}%;background:${GENDER_COLORS[code]}"></span></div>
          <strong>${percent(share)} <small>${compactNumber(value)}</small></strong>
        </div>`;
      }).join('')}
    </div>`;
  };

  els.genderBreakdown.innerHTML = `
    <div class="gx-wrap">
      ${block('Followers', followersGender, 'lifetime')}
      ${block('Reach', reach, timeframeLabel(selected))}
      ${block('Interactions', engaged, timeframeLabel(selected))}
    </div>
    <div class="gx-views">
      <div><span>Views (total)</span><strong>${metricCompact(state.data.summary.totalViews)}</strong></div>
      <div><span>Profile views${selected ? ` · ${escapeHtml(timeframeLabel(selected))}` : ''}</span><strong>${profileViews != null ? compactNumber(profileViews) : '—'}</strong></div>
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
    { key: 'likes', label: 'Likes', value: totals.likes, color: '#46431f' },
    { key: 'comments', label: 'Comments', value: totals.comments, color: '#b88a18' },
    { key: 'saves', label: 'Saves', value: totals.saves, color: '#2f6fb0' },
    { key: 'shares', label: 'Shares', value: totals.shares, color: '#c0573a' }
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
    username: account.username || 'instagram',
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
  :root{--ink:#26261d;--muted:#6b6b5e;--line:#e4e4dc;--surface:#f7f7f3;--olive:#5b6b2f;--olived:#3f4a22;}
  *{box-sizing:border-box;}
  @page{size:A4;margin:16mm;}
  html,body{margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);font-size:12px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .doc{max-width:760px;margin:0 auto;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--olive);padding-bottom:14px;margin-bottom:18px;}
  .brand{display:flex;gap:12px;align-items:center;}
  .mark{width:38px;height:38px;border-radius:9px;background:var(--olived);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;}
  h1{font-size:18px;margin:0;letter-spacing:-0.01em;}
  .sub{color:var(--muted);font-size:12px;margin-top:2px;}
  .head-right{text-align:right;color:var(--muted);font-size:11px;}
  .head-right strong{display:block;color:var(--ink);font-size:13px;}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin:22px 0 8px;}
  .kpis{display:flex;gap:10px;}
  .kpi{flex:1;border:1px solid var(--line);border-radius:9px;padding:11px 12px;background:var(--surface);}
  .kpi-label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;}
  .kpi-value{display:block;font-size:21px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums;}
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
      slots.push({ day, window, count: 0, views: 0, averageViews: 0 });
    }
  }

  content.forEach((item) => {
    if (!isMetricKnown(item.views)) return;

    const date = new Date(item.timestamp);
    if (!Number.isFinite(date.getTime())) return;

    const day = (date.getDay() + 6) % 7;
    const window = Math.min(3, Math.floor(date.getHours() / 6));
    const slot = slots.find((entry) => entry.day === day && entry.window === window);
    if (!slot) return;

    slot.count += 1;
    slot.views += metricNumber(item.views);
    slot.averageViews = Math.round(slot.views / slot.count);
  });

  return slots;
}

function bestPostingSlot(content) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const windows = ['00:00-06:00', '06:00-12:00', '12:00-18:00', '18:00-24:00'];
  const slot = buildPostingSlots(content)
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.averageViews - a.averageViews || b.count - a.count)[0];

  return slot ? {
    ...slot,
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
