import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const envPath = path.join(__dirname, '.env');

loadEnv(envPath);

const PORT = toNumber(process.env.PORT, 4173);
let dashboardConfig = {
  graphApiVersion: normalizeGraphVersion(process.env.GRAPH_API_VERSION || 'v23.0'),
  apiMode: normalizeApiMode(process.env.INSTAGRAM_API_MODE || 'auto'),
  accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  instagramUserId: process.env.INSTAGRAM_USER_ID || '',
  refreshMs: clamp(toNumber(process.env.DASHBOARD_REFRESH_MS, 60000), 15000, 86400000)
};

// Optional Supabase persistence (gives serverless deploys a real store for config +
// metrics history). Uses the REST API directly - no SDK dependency. When the env vars
// are absent everything falls back to env-var config + the local file, unchanged.
let configLoaded = false;

function supabaseEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// Read one value from the kv_store table; null if missing or Supabase isn't configured.
async function kvGet(storeKey) {
  if (!supabaseEnabled()) return null;
  const url = `${process.env.SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(storeKey)}&select=value`;
  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0].value : null;
}

// Upsert one value into kv_store (merge-duplicates on the primary key).
async function kvSet(storeKey, value) {
  if (!supabaseEnabled()) return false;
  const url = `${process.env.SUPABASE_URL}/rest/v1/kv_store`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...supabaseHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key: storeKey, value, updated_at: new Date().toISOString() }])
  });
  return response.ok;
}

// Load admin-saved config from Supabase once per process (cold start). Stored config
// overrides env-var defaults so the /admin page can manage the connection on Vercel.
async function ensureConfigLoaded() {
  if (configLoaded) return;
  configLoaded = true;
  if (!supabaseEnabled()) return;
  try {
    const stored = await kvGet('config');
    if (stored && typeof stored === 'object') {
      dashboardConfig = { ...dashboardConfig, ...stored };
    }
  } catch {
    // Persisted config is best-effort; fall back to env vars.
  }
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon']
]);

let previousContentMetrics = new Map();
const historyPath = path.join(__dirname, 'metrics-history.json');
let metricsHistory = loadMetricsHistory();
let cachedLiveData = null;
let cachedUntil = 0;
let cachedKey = '';
let cachedAudience = null;
let cachedAudienceUntil = 0;
let cachedAudienceId = '';
let cachedAccountInsights = null;
let cachedAccountInsightsUntil = 0;
let cachedAccountInsightsId = '';
const demoState = createDemoState();

export async function handleRequest(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Make sure any admin-saved config (incl. the saved refresh interval) is loaded
    // before any route reads dashboardConfig.
    await ensureConfigLoaded();

    if (requestUrl.pathname === '/api/admin/login') {
      return await handleAdminLogin(req, res);
    }

    if (requestUrl.pathname === '/api/health') {
      return sendJson(res, {
        ok: true,
        mode: hasCredentials() ? 'graph-api' : 'demo',
        graphApiVersion: dashboardConfig.graphApiVersion
      });
    }

    if (requestUrl.pathname === '/api/status') {
      return sendJson(res, getStatusPayload());
    }

    if (requestUrl.pathname === '/api/config') {
      return await handleConfig(req, res);
    }

    if (requestUrl.pathname === '/api/config/discover') {
      return await handleConfigDiscover(req, res);
    }

    if (requestUrl.pathname === '/api/refresh') {
      return await handleRefreshInterval(req, res);
    }

    if (requestUrl.pathname === '/api/instagram') {
      const limit = clamp(toNumber(requestUrl.searchParams.get('limit'), 500), 5, 2000);
      const allMedia = requestUrl.searchParams.get('all') !== '0';
      const data = await getDashboardData({ limit, allMedia, force: requestUrl.searchParams.get('force') === '1' });
      return sendJson(res, data);
    }

    if (requestUrl.pathname === '/api/live') {
      return await handleLiveStream(req, res, requestUrl);
    }

    return await serveStatic(requestUrl, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, {
        error: error.statusCode ? error.message : 'Dashboard server error',
        detail: error.statusCode ? undefined : error.message
      }, error.statusCode || 500);
    } else {
      res.end();
    }
  }
}

// On Vercel the function is invoked per-request (no long-lived listener); locally and on
// any always-on host we start a normal HTTP server. process.env.VERCEL is set by Vercel.
if (!process.env.VERCEL) {
  createServer(handleRequest).listen(PORT, '0.0.0.0', () => {
    console.log(`Instagram dashboard running at http://localhost:${PORT}`);
    console.log(`Data mode: ${hasCredentials() ? 'Instagram Graph API' : 'demo data'}`);
  });
}

function loadEnv(envPath) {
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function getStatusPayload() {
  return {
    mode: hasCredentials() ? 'graph-api' : 'demo',
    graphApiVersion: dashboardConfig.graphApiVersion,
    apiMode: dashboardConfig.apiMode,
    resolvedGraphHost: resolveGraphHost(dashboardConfig),
    hasAccessToken: Boolean(dashboardConfig.accessToken),
    hasInstagramUserId: Boolean(dashboardConfig.instagramUserId),
    instagramUserId: dashboardConfig.instagramUserId,
    refreshMs: dashboardConfig.refreshMs,
    serverTime: new Date().toISOString()
  };
}

// The admin password gates settings changes (save/discover) so the dashboard can be
// deployed publicly while only the /admin page can change the connection. Override the
// default by setting ADMIN_PASSWORD in the host's environment variables.
function adminPassword() {
  return process.env.ADMIN_PASSWORD || 'Devanshu@0609';
}

function isAuthed(req, body) {
  const provided = req.headers['x-admin-password'] || (body && body.adminPassword) || '';
  return typeof provided === 'string' && provided.length > 0 && provided === adminPassword();
}

async function handleAdminLogin(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }
  const body = await readJsonBody(req);
  if (typeof body.password === 'string' && body.password === adminPassword()) {
    return sendJson(res, { ok: true });
  }
  return sendJson(res, { error: 'Incorrect password' }, 401);
}

// Save just the auto-refresh interval (non-sensitive, no admin password needed) so the
// user's chosen cadence persists across reloads. Stored in Supabase if configured, else .env.
async function handleRefreshInterval(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }
  const body = await readJsonBody(req);
  const refreshMs = clamp(toNumber(body.refreshMs, dashboardConfig.refreshMs), 15000, 86400000);
  dashboardConfig = { ...dashboardConfig, refreshMs };
  process.env.DASHBOARD_REFRESH_MS = String(refreshMs);

  let persisted = false;
  if (supabaseEnabled()) {
    try {
      persisted = await kvSet('config', dashboardConfig);
    } catch {
      persisted = false;
    }
  }
  if (!persisted) {
    try {
      writeDashboardEnv(dashboardConfig);
      persisted = true;
    } catch {
      persisted = false;
    }
  }
  return sendJson(res, { ok: true, refreshMs, persisted });
}

async function handleConfig(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, getConfigPayload());
  }

  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const body = await readJsonBody(req);
  if (!isAuthed(req, body)) {
    return sendJson(res, { error: 'Admin password required' }, 401);
  }
  const accessToken = normalizeAccessToken(body.accessToken || dashboardConfig.accessToken || '');
  const instagramUserId = sanitizeInstagramUserId(body.instagramUserId || dashboardConfig.instagramUserId || '');
  const graphApiVersion = normalizeGraphVersion(body.graphApiVersion || dashboardConfig.graphApiVersion);
  const apiMode = normalizeApiMode(body.apiMode || dashboardConfig.apiMode);
  const refreshMs = clamp(toNumber(body.refreshMs, dashboardConfig.refreshMs), 15000, 86400000);

  if (!accessToken) {
    return sendJson(res, { error: 'Access token is required' }, 400);
  }

  if (!instagramUserId) {
    return sendJson(res, { error: 'Instagram professional account ID is required' }, 400);
  }

  const nextConfig = {
    accessToken,
    instagramUserId,
    graphApiVersion,
    apiMode,
    refreshMs
  };

  let validation = null;
  if (body.validate !== false) {
    const account = await graphGet(`/${nextConfig.instagramUserId}`, {
      fields: [
        'id',
        'username',
        'name',
        'profile_picture_url',
        'followers_count',
        'follows_count',
        'media_count'
      ].join(',')
    }, nextConfig);
    validation = {
      account: normalizeAccount(account, nextConfig)
    };
  }

  dashboardConfig = nextConfig;
  process.env.INSTAGRAM_ACCESS_TOKEN = nextConfig.accessToken;
  process.env.INSTAGRAM_USER_ID = nextConfig.instagramUserId;
  process.env.GRAPH_API_VERSION = nextConfig.graphApiVersion;
  process.env.INSTAGRAM_API_MODE = nextConfig.apiMode;
  process.env.DASHBOARD_REFRESH_MS = String(nextConfig.refreshMs);
  clearCache();
  // Persist: Supabase if configured (works on serverless), otherwise the local .env file.
  // On a read-only serverless FS with no Supabase, the config still applies in-memory only.
  let persisted = false;
  if (supabaseEnabled()) {
    try {
      persisted = await kvSet('config', nextConfig);
    } catch {
      persisted = false;
    }
  }
  if (!persisted) {
    try {
      writeDashboardEnv(nextConfig);
      persisted = true;
    } catch {
      persisted = false;
    }
  }

  return sendJson(res, {
    ok: true,
    config: getConfigPayload(),
    validation,
    persisted
  });
}

async function handleConfigDiscover(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const body = await readJsonBody(req);
  if (!isAuthed(req, body)) {
    return sendJson(res, { error: 'Admin password required' }, 401);
  }

  const accessToken = normalizeAccessToken(body.accessToken || dashboardConfig.accessToken || '');
  const graphApiVersion = normalizeGraphVersion(body.graphApiVersion || dashboardConfig.graphApiVersion);
  const apiMode = normalizeApiMode(body.apiMode || dashboardConfig.apiMode);

  if (!accessToken) {
    return sendJson(res, { error: 'Access token is required to discover accounts' }, 400);
  }

  const discoveryConfig = {
    ...dashboardConfig,
    accessToken,
    graphApiVersion,
    apiMode: apiMode === 'auto' ? 'facebook' : apiMode
  };

  if (resolveGraphHost(discoveryConfig) !== 'graph.facebook.com') {
    return sendJson(res, {
      error: 'Find account works only with Facebook Login/System User tokens. For the Instagram token generator shown in your screenshot, paste the Instagram account ID shown under the username.'
    }, 400);
  }

  const response = await graphGet('/me/accounts', {
    fields: 'id,name,instagram_business_account{id,username,profile_picture_url}',
    limit: 100
  }, discoveryConfig);
  const accounts = (response.data || [])
    .filter((page) => page.instagram_business_account)
    .map((page) => ({
      pageId: page.id,
      pageName: page.name,
      instagramUserId: page.instagram_business_account.id,
      username: page.instagram_business_account.username || '',
      profilePictureUrl: page.instagram_business_account.profile_picture_url || ''
    }));

  return sendJson(res, {
    ok: true,
    accounts,
    note: accounts.length ? '' : 'No connected Instagram professional accounts were found for this token.'
  });
}

function getConfigPayload() {
  return {
    mode: hasCredentials() ? 'graph-api' : 'demo',
    graphApiVersion: dashboardConfig.graphApiVersion,
    apiMode: dashboardConfig.apiMode,
    resolvedGraphHost: resolveGraphHost(dashboardConfig),
    hasAccessToken: Boolean(dashboardConfig.accessToken),
    tokenPreview: dashboardConfig.accessToken ? 'token set' : '',
    instagramUserId: dashboardConfig.instagramUserId,
    refreshMs: dashboardConfig.refreshMs,
    requiredPermissions: [
      'instagram_basic',
      'instagram_manage_insights',
      'read_insights'
    ],
    optionalDiscoveryPermissions: [
      'pages_show_list',
      'pages_read_engagement'
    ]
  };
}

async function handleLiveStream(req, res, requestUrl) {
  const intervalMs = clamp(toNumber(requestUrl.searchParams.get('interval'), dashboardConfig.refreshMs), 15000, 86400000);
  const limit = clamp(toNumber(requestUrl.searchParams.get('limit'), 500), 5, 2000);
  const allMedia = requestUrl.searchParams.get('all') !== '0';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let closed = false;
  let firstSend = true;
  const send = async () => {
    if (closed) return;

    try {
      const data = await getDashboardData({ limit, allMedia, force: !firstSend });
      firstSend = false;
      res.write(`event: dashboard\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      res.write(`event: dashboard-error\n`);
      res.write(`data: ${JSON.stringify({ message: error.message, at: new Date().toISOString() })}\n\n`);
    }
  };

  await send();
  const timer = setInterval(send, intervalMs);
  const heartbeat = setInterval(() => {
    if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15000);

  req.on('close', () => {
    closed = true;
    clearInterval(timer);
    clearInterval(heartbeat);
  });
}

async function getDashboardData({ limit = 500, allMedia = true, force = false } = {}) {
  await ensureConfigLoaded();
  const now = Date.now();
  const cacheKey = `${limit}:${allMedia ? 'all' : 'recent'}`;
  // Without force (a plain page load), return the last computed data regardless of age -
  // a real sync only happens on the manual button or the scheduled poll (force=1).
  if (!force && cachedLiveData && cachedKey === cacheKey) {
    return cachedLiveData;
  }

  const data = hasCredentials()
    ? await getGraphDashboardData({ limit, allMedia })
    : getDemoDashboardData(limit);

  cachedLiveData = data;
  cachedUntil = now + Math.min(dashboardConfig.refreshMs, 20000);
  cachedKey = cacheKey;
  return data;
}

async function getGraphDashboardData({ limit = 500, allMedia = true } = {}, activeConfig = dashboardConfig) {
  const warnings = [];
  const account = await graphGet(`/${activeConfig.instagramUserId}`, {
    fields: [
      'id',
      'username',
      'name',
      'profile_picture_url',
      'followers_count',
      'follows_count',
      'media_count'
    ].join(',')
  }, activeConfig);

  const mediaResponse = await fetchAllMedia(activeConfig, { limit, allMedia });
  warnings.push(...mediaResponse.warnings);

  // Concurrency is high so loading every post's insights fits inside a serverless
  // function's time budget (Vercel caps at 60s); the total call count is unchanged.
  const insightConcurrency = clamp(toNumber(process.env.INSIGHT_CONCURRENCY, 16), 1, 32);
  const insightResults = await mapWithConcurrency(mediaResponse.media, insightConcurrency, async (media) => {
    const result = await fetchInsights(media.id, activeConfig, { isReel: media.media_product_type === 'REELS' });
    if (result.warning) warnings.push(`Insights for ${media.id}: ${result.warning}`);
    return result.metrics;
  });

  const content = mediaResponse.media.map((media, index) => normalizeContent(media, insightResults[index] || {}));

  // Pull the persisted daily snapshots (Supabase) before composing, so day-over-day
  // deltas + follower trend survive serverless cold starts. No-op without Supabase.
  if (supabaseEnabled()) {
    try {
      const stored = await kvGet('metrics_history');
      if (stored && typeof stored === 'object') metricsHistory = stored;
    } catch {
      // best-effort; fall back to whatever is in memory
    }
  }

  const dashboard = composeDashboard({
    mode: 'graph-api',
    account: normalizeAccount(account, activeConfig),
    content,
    loadMeta: {
      loadedCount: content.length,
      requestedLimit: limit,
      allMedia,
      hasMore: mediaResponse.hasMore
    },
    warnings,
    refreshMs: activeConfig.refreshMs,
    activeConfig
  });
  previousContentMetrics = new Map(dashboard.content.map((item) => [item.id, pickComparableMetrics(item)]));
  [dashboard.audience, dashboard.accountInsights] = await Promise.all([
    fetchAudience(activeConfig),
    fetchAccountInsights(activeConfig)
  ]);

  // Persist the snapshot composeDashboard just updated (via trackDailyMetrics).
  if (supabaseEnabled()) {
    try {
      await kvSet('metrics_history', metricsHistory);
    } catch {
      // best-effort persistence
    }
  }

  return dashboard;
}

// Aggregate audience demographics + reach/interactions by gender. All counts are of
// unique accounts per demographic bucket - Instagram never returns individual users.
// Requires >=100 followers, instagram_manage_insights, and a recent API version.
// Cached ~30 min: demographics change slowly and each refresh is several API calls.
async function fetchAudience(activeConfig) {
  const now = Date.now();
  if (cachedAudience && cachedAudienceUntil > now && cachedAudienceId === activeConfig.instagramUserId) {
    return cachedAudience;
  }

  // Windows offered in the "By gender" dropdown. Meta returns empty for some windows
  // on some accounts (e.g. last_30_days), so we keep only the ones that actually return rows.
  const TIMEFRAMES = ['this_week', 'last_14_days', 'last_30_days', 'last_90_days', 'this_month', 'prev_month'];

  // Follower demographics are lifetime; just use the first timeframe that returns rows.
  const demographic = async (metric, breakdown) => {
    for (const timeframe of TIMEFRAMES) {
      try {
        const response = await graphGet(`/${activeConfig.instagramUserId}/insights`, {
          metric, period: 'lifetime', timeframe, metric_type: 'total_value', breakdown
        }, activeConfig);
        const map = parseDemographic(response.data || []);
        if (Object.keys(map).length) return map;
      } catch {
        // try the next timeframe
      }
    }
    return {};
  };

  // Reach/interactions by gender for every window, so the dropdown can switch instantly.
  const genderByTimeframe = async (metric) => {
    const byWindow = {};
    for (const timeframe of TIMEFRAMES) {
      try {
        const response = await graphGet(`/${activeConfig.instagramUserId}/insights`, {
          metric, period: 'lifetime', timeframe, metric_type: 'total_value', breakdown: 'gender'
        }, activeConfig);
        const map = parseDemographic(response.data || []);
        if (Object.keys(map).length) byWindow[timeframe] = map;
      } catch {
        // skip windows the API declines
      }
    }
    return byWindow;
  };

  // Profile views: no gender breakdown, but it accepts since/until so we can total it
  // per window and have it react to the same dropdown as reach/interactions.
  const profileViewsFor = async (timeframe) => {
    try {
      const { since, until } = timeframeRange(timeframe);
      const response = await graphGet(`/${activeConfig.instagramUserId}/insights`, {
        metric: 'profile_views', period: 'day', metric_type: 'total_value', since, until
      }, activeConfig);
      const value = response.data?.[0]?.total_value?.value;
      return typeof value === 'number' ? value : null;
    } catch {
      return null;
    }
  };

  let result;
  try {
    const [fgGender, fgAge, fgCountry, fgCity, reachByGender, engagedByGender] = await Promise.all([
      demographic('follower_demographics', 'gender'),
      demographic('follower_demographics', 'age'),
      demographic('follower_demographics', 'country'),
      demographic('follower_demographics', 'city'),
      genderByTimeframe('reached_audience_demographics'),
      genderByTimeframe('engaged_audience_demographics')
    ]);

    const timeframes = TIMEFRAMES.filter((tf) => reachByGender[tf] || engagedByGender[tf]);
    const preferred = ['last_90_days', 'last_30_days', 'this_month', 'last_14_days', 'this_week', 'prev_month'];
    const defaultTimeframe = preferred.find((tf) => timeframes.includes(tf)) || timeframes[0] || null;

    const profileViewsEntries = await Promise.all(timeframes.map(async (tf) => [tf, await profileViewsFor(tf)]));
    const profileViewsByTimeframe = Object.fromEntries(profileViewsEntries.filter(([, value]) => value != null));

    const hasAny = Object.keys(fgGender).length || timeframes.length;
    result = hasAny
      ? {
        available: true,
        followers: { gender: fgGender, age: fgAge, country: topEntries(fgCountry, 6), city: topEntries(fgCity, 6) },
        reachByGender,
        engagedByGender,
        timeframes,
        defaultTimeframe,
        profileViewsByTimeframe
      }
      : { available: false, reason: 'Audience demographics need a professional account with 100+ followers and a recent API version.' };
  } catch (error) {
    result = { available: false, reason: error.message || 'Audience demographics are unavailable for this account.' };
  }

  cachedAudience = result;
  cachedAudienceUntil = now + 30 * 60 * 1000;
  cachedAudienceId = activeConfig.instagramUserId;
  return result;
}

// Account-level metrics that accept a since/until range, plus the reach split by
// follow_type (followers vs non-followers). All windowable and real - the dashboard
// uses these so the headline numbers can react to a date range honestly, instead of
// only summing the posts currently loaded. Cached ~30 min like fetchAudience.
async function fetchAccountInsights(activeConfig) {
  const now = Date.now();
  if (cachedAccountInsights && cachedAccountInsightsUntil > now && cachedAccountInsightsId === activeConfig.instagramUserId) {
    return cachedAccountInsights;
  }

  const id = activeConfig.instagramUserId;
  const DAY = 86400;
  const nowSec = Math.floor(now / 1000);
  // Instagram only keeps account insights for ~2 years and rejects since older than
  // that (730d errors), so "All time" uses the safe maximum window of 728 days.
  const WINDOWS = [
    { key: 'last_7_days', label: 'Last 7 days', days: 7 },
    { key: 'last_14_days', label: 'Last 14 days', days: 14 },
    { key: 'last_30_days', label: 'Last 30 days', days: 30 },
    { key: 'last_90_days', label: 'Last 90 days', days: 90 },
    { key: 'all_time', label: 'All time', days: 728 }
  ];
  const METRICS = ['views', 'reach', 'total_interactions', 'accounts_engaged', 'profile_views'];

  // Totals over a window. One combined call; fall back to per-metric so a single
  // unsupported metric never blanks the whole window.
  const totalsFor = async ({ since, until }) => {
    const read = (rows) => {
      const map = {};
      for (const row of rows || []) {
        const value = row.total_value?.value;
        if (typeof value === 'number') map[row.name] = value;
      }
      return map;
    };
    try {
      const response = await graphGet(`/${id}/insights`, {
        metric: METRICS.join(','), period: 'day', metric_type: 'total_value', since, until
      }, activeConfig);
      const map = read(response.data);
      if (Object.keys(map).length) return map;
    } catch {
      // fall through to per-metric
    }
    const map = {};
    await Promise.all(METRICS.map(async (metric) => {
      try {
        const response = await graphGet(`/${id}/insights`, {
          metric, period: 'day', metric_type: 'total_value', since, until
        }, activeConfig);
        Object.assign(map, read(response.data));
      } catch {
        // skip metrics the API declines for this account/version
      }
    }));
    return map;
  };

  // Reach split into FOLLOWER vs NON_FOLLOWER for the same window.
  const followTypeFor = async ({ since, until }) => {
    try {
      const response = await graphGet(`/${id}/insights`, {
        metric: 'reach', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', since, until
      }, activeConfig);
      return parseDemographic(response.data || []);
    } catch {
      return {};
    }
  };

  try {
    const byWindow = {};
    const reachByFollowType = {};
    await Promise.all(WINDOWS.map(async (w) => {
      const range = { since: nowSec - w.days * DAY, until: nowSec };
      const [totals, followType] = await Promise.all([totalsFor(range), followTypeFor(range)]);
      if (Object.keys(totals).length) byWindow[w.key] = totals;
      if (Object.keys(followType).length) reachByFollowType[w.key] = followType;
    }));

    const windows = WINDOWS.filter((w) => byWindow[w.key]);
    const defaultWindow = (windows.find((w) => w.key === 'last_30_days') || windows[windows.length - 1])?.key || null;
    const result = windows.length
      ? {
        available: true,
        windows: windows.map((w) => ({ key: w.key, label: w.label })),
        defaultWindow,
        byWindow,
        reachByFollowType
      }
      : { available: false, reason: 'Account-level insights are unavailable for this account or API version.' };

    cachedAccountInsights = result;
    cachedAccountInsightsUntil = now + 30 * 60 * 1000;
    cachedAccountInsightsId = id;
    return result;
  } catch (error) {
    return { available: false, reason: error.message || 'Account-level insights are unavailable.' };
  }
}

// Map a demographic timeframe to a unix since/until range (seconds) for day metrics.
function timeframeRange(timeframe) {
  const DAY = 86400;
  const now = Math.floor(Date.now() / 1000);
  const startOfMonth = (offset) => {
    const date = new Date();
    return Math.floor(new Date(date.getFullYear(), date.getMonth() + offset, 1).getTime() / 1000);
  };
  switch (timeframe) {
    case 'this_week': return { since: now - 7 * DAY, until: now };
    case 'last_14_days': return { since: now - 14 * DAY, until: now };
    case 'last_30_days': return { since: now - 30 * DAY, until: now };
    case 'last_90_days': return { since: now - 90 * DAY, until: now };
    case 'this_month': return { since: startOfMonth(0), until: now };
    case 'prev_month': return { since: startOfMonth(-1), until: startOfMonth(0) };
    default: return { since: now - 30 * DAY, until: now };
  }
}

// Flatten Graph API total_value breakdown results into a { dimension: value } map.
function parseDemographic(data) {
  const results = data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
  const map = {};
  for (const row of results) {
    const dimension = (row.dimension_values || []).join(' ');
    if (dimension) map[dimension] = toNumber(row.value, 0);
  }
  return map;
}

// Largest N entries of a { key: value } map, as [{ key, value }] descending.
function topEntries(map, count) {
  if (!map) return [];
  return Object.entries(map)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}

async function fetchAllMedia(activeConfig, { limit = 500, allMedia = true } = {}) {
  const warnings = [];
  const media = [];
  // allMedia means "every post, always": page until the account is exhausted, ignoring
  // limit. maxPages is only a safety valve against a runaway cursor (20k posts).
  const pageSize = allMedia ? 100 : Math.min(100, limit);
  const cap = allMedia ? Infinity : limit;
  const maxPages = allMedia ? 200 : 1;
  let after = '';
  let fields = mediaFieldSets()[0];
  let hasMore = false;

  for (let page = 0; page < maxPages && media.length < cap; page += 1) {
    const pageLimit = allMedia ? pageSize : Math.min(pageSize, limit - media.length);
    let response;
    try {
      response = await graphGet(`/${activeConfig.instagramUserId}/media`, {
        limit: pageLimit,
        after,
        fields: fields.join(',')
      }, activeConfig);
    } catch (error) {
      if (page > 0) throw error;

      fields = mediaFieldSets()[1];
      warnings.push('Some media metadata fields were unavailable, so the dashboard loaded the compatible field set.');
      response = await graphGet(`/${activeConfig.instagramUserId}/media`, {
        limit: pageLimit,
        after,
        fields: fields.join(',')
      }, activeConfig);
    }

    media.push(...(response.data || []));
    after = response.paging?.cursors?.after || '';
    hasMore = Boolean(after || response.paging?.next);

    if (!allMedia || !hasMore) break;
  }

  return {
    // hasMore is true only if posts remain unloaded (non-all mode, or the safety cap hit).
    media: allMedia ? media : media.slice(0, limit),
    hasMore: allMedia ? hasMore : (hasMore && media.length >= limit),
    warnings
  };
}

function mediaFieldSets() {
  return [
    [
      'id',
      'caption',
      'media_type',
      'media_product_type',
      'media_url',
      'permalink',
      'thumbnail_url',
      'timestamp',
      'like_count',
      'comments_count'
    ],
    [
      'id',
      'caption',
      'media_type',
      'media_url',
      'permalink',
      'thumbnail_url',
      'timestamp'
    ]
  ];
}

async function graphGet(edge, params = {}, activeConfig = dashboardConfig) {
  const host = resolveGraphHost(activeConfig);
  const url = new URL(`https://${host}/${activeConfig.graphApiVersion}${edge}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set('access_token', activeConfig.accessToken);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MultiaInstagramDashboard/1.0'
    }
  });
  const body = await response.text();
  let payload;

  try {
    payload = JSON.parse(body);
  } catch {
    payload = { raw: body };
  }

  if (!response.ok || payload.error) {
    const message = payload.error?.message || `Graph API returned ${response.status}`;
    const error = new Error(message);
    error.payload = payload;
    error.statusCode = response.status || 502;
    error.graphHost = host;
    throw error;
  }

  return payload;
}

async function fetchInsights(mediaId, activeConfig = dashboardConfig, { isReel = false } = {}) {
  // Reels expose watch-time metrics (avg + total time watched) that other media don't.
  const reelMetrics = isReel ? ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'] : [];
  const metricGroups = [
    ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', ...reelMetrics],
    ['impressions', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', ...reelMetrics],
    ['plays', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', ...reelMetrics],
    ['plays', 'reach', 'saved', 'shares', 'total_interactions'],
    ['reach', 'saved', 'shares', 'total_interactions']
  ];

  let lastError = null;
  for (const metrics of metricGroups) {
    try {
      const response = await graphGet(`/${mediaId}/insights`, { metric: metrics.join(',') }, activeConfig);
      return { metrics: parseInsights(response.data || []) };
    } catch (error) {
      lastError = error;
    }
  }

  const fallbackMetrics = ['views', 'plays', 'impressions', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', ...reelMetrics];
  const partial = {};

  for (const metric of fallbackMetrics) {
    try {
      const response = await graphGet(`/${mediaId}/insights`, { metric }, activeConfig);
      Object.assign(partial, parseInsights(response.data || []));
    } catch {
      // Metric names and eligibility vary across API versions; partial data is still useful.
    }
  }

  return {
    metrics: partial,
    warning: lastError ? lastError.message : 'Some insight metrics were unavailable'
  };
}

function parseInsights(rows) {
  const metrics = {};
  for (const row of rows) {
    metrics[row.name] = insightValue(row);
  }
  return metrics;
}

function insightValue(row) {
  if (row.total_value && typeof row.total_value.value !== 'undefined') {
    return toNumber(row.total_value.value, 0);
  }

  if (Array.isArray(row.values) && row.values.length) {
    const latest = row.values[row.values.length - 1];
    return toNumber(latest.value, 0);
  }

  if (typeof row.value !== 'undefined') return toNumber(row.value, 0);
  return 0;
}

function normalizeAccount(account, activeConfig = dashboardConfig) {
  return {
    id: account.id || activeConfig.instagramUserId,
    username: account.username || 'instagram',
    name: account.name || account.username || 'Instagram account',
    profilePictureUrl: account.profile_picture_url || '',
    followers: toNumber(account.followers_count, 0),
    follows: toNumber(account.follows_count, 0),
    mediaCount: toNumber(account.media_count, 0)
  };
}

function normalizeContent(media, insights) {
  const previous = previousContentMetrics.get(media.id);
  const contentType = getContentType(media);
  const viewsMetric = pickMetric(insights, ['views', 'plays', 'video_views', 'impressions']);
  const reachMetric = pickMetric(insights, ['reach']);
  const likesMetric = pickMetric(insights, ['likes']) || pickMediaMetric(media, 'like_count');
  const commentsMetric = pickMetric(insights, ['comments']) || pickMediaMetric(media, 'comments_count');
  const sharesMetric = pickMetric(insights, ['shares']);
  const savesMetric = pickMetric(insights, ['saved', 'saves']);
  const interactionMetric = pickInteractionMetric(insights, [likesMetric, commentsMetric, sharesMetric, savesMetric]);

  const views = metricValue(viewsMetric);
  const reach = metricValue(reachMetric);
  const likes = metricValue(likesMetric);
  const comments = metricValue(commentsMetric);
  const shares = metricValue(sharesMetric);
  const saves = metricValue(savesMetric);
  const interactions = metricValue(interactionMetric);
  // Reels-only watch-time metrics (milliseconds). null for non-reels or unsupported versions.
  const avgWatchTime = knownNumber(insights.ig_reels_avg_watch_time);
  const totalWatchTime = knownNumber(insights.ig_reels_video_view_total_time);
  const engagementRate = isKnownNumber(reach) && reach > 0 && isKnownNumber(interactions)
    ? interactions / reach
    : null;
  const deltaViews = previous && isKnownNumber(views) && isKnownNumber(previous.views)
    ? Math.max(0, views - previous.views)
    : 0;
  const deltaInteractions = previous && isKnownNumber(interactions) && isKnownNumber(previous.interactions)
    ? Math.max(0, interactions - previous.interactions)
    : 0;

  return {
    id: media.id,
    caption: firstLine(media.caption || 'Untitled content'),
    contentType,
    contentTypeLabel: labelContentType(contentType),
    mediaType: media.media_type || 'VIDEO',
    productType: media.media_product_type || 'REELS',
    permalink: media.permalink || '',
    thumbnailUrl: media.thumbnail_url || media.media_url || '',
    timestamp: media.timestamp || new Date().toISOString(),
    views,
    reach,
    likes,
    comments,
    shares,
    saves,
    interactions,
    avgWatchTime,
    totalWatchTime,
    engagementRate,
    deltaViews,
    deltaInteractions,
    metricMeta: {
      views: buildMetricMeta(viewsMetric),
      reach: buildMetricMeta(reachMetric),
      likes: buildMetricMeta(likesMetric),
      comments: buildMetricMeta(commentsMetric),
      shares: buildMetricMeta(sharesMetric),
      saves: buildMetricMeta(savesMetric),
      interactions: buildMetricMeta(interactionMetric),
      engagementRate: buildMetricMeta(engagementRate === null ? null : {
        value: engagementRate,
        source: 'derived:interactions_reach',
        derived: true
      })
    }
  };
}

function getContentType(media) {
  if (media.media_product_type === 'REELS') return 'reel';
  if (media.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (media.media_type === 'IMAGE') return 'image';
  if (media.media_type === 'VIDEO') return 'video';
  return 'post';
}

function labelContentType(type) {
  return {
    reel: 'Reel',
    video: 'Video',
    image: 'Image',
    carousel: 'Carousel',
    post: 'Post'
  }[type] || 'Post';
}

function pickMetric(insights, keys) {
  for (const key of keys) {
    if (!hasOwn(insights, key)) continue;
    const value = knownNumber(insights[key]);
    if (value !== null) {
      return {
        value,
        source: `api:${key}`,
        rawKey: key,
        derived: false
      };
    }
  }

  return null;
}

function pickMediaMetric(media, key) {
  if (!hasOwn(media, key)) return null;

  const value = knownNumber(media[key]);
  if (value === null) return null;

  return {
    value,
    source: `media:${key}`,
    rawKey: key,
    derived: false
  };
}

function pickInteractionMetric(insights, componentMetrics) {
  const direct = pickMetric(insights, ['total_interactions']);
  if (direct) return direct;

  const knownComponents = componentMetrics.filter(Boolean);
  if (!knownComponents.length) return null;

  return {
    value: knownComponents.reduce((sum, metric) => sum + metric.value, 0),
    source: knownComponents.length === componentMetrics.length
      ? 'derived:likes_comments_shares_saves'
      : 'derived:partial_components',
    rawKey: 'derived_interactions',
    derived: true,
    partial: knownComponents.length !== componentMetrics.length
  };
}

function metricValue(metric) {
  return metric ? metric.value : null;
}

function buildMetricMeta(metric) {
  if (!metric) {
    return {
      available: false,
      source: 'unavailable',
      label: 'Unavailable from Graph API',
      derived: false,
      partial: false
    };
  }

  return {
    available: true,
    source: metric.source,
    label: metricLabel(metric.source),
    derived: Boolean(metric.derived),
    partial: Boolean(metric.partial),
    rawKey: metric.rawKey || ''
  };
}

function metricLabel(source) {
  if (!source) return 'Unavailable';
  if (source.startsWith('api:')) return `Graph API ${source.slice(4)}`;
  if (source.startsWith('media:')) return `Media field ${source.slice(6)}`;
  if (source === 'derived:partial_components') return 'Derived from available components';
  if (source.startsWith('derived:')) return 'Derived locally';
  return source;
}

function enrichContentAnalytics(content) {
  const prepared = content.map((item) => ({
    ...item,
    metricMeta: ensureMetricMeta(item)
  }));
  const maxViews = Math.max(1, ...prepared.map((item) => knownNumber(item.views, 0)));
  const maxInteractions = Math.max(1, ...prepared.map((item) => knownNumber(item.interactions, 0)));
  const maxVelocity = Math.max(1, ...prepared.map((item) => knownNumber(item.deltaViews, 0)));
  const maxEngagement = Math.max(0.001, ...prepared.map((item) => knownNumber(item.engagementRate, 0)));
  const maxSavesShares = Math.max(1, ...prepared.map((item) => knownNumber(item.saves, 0) + knownNumber(item.shares, 0)));

  return prepared.map((item, index) => {
    const ageHours = Math.max(1, (Date.now() - new Date(item.timestamp).getTime()) / 3600000);
    const views = knownNumber(item.views, 0);
    const interactions = knownNumber(item.interactions, 0);
    const velocity = knownNumber(item.deltaViews, 0);
    const engagementRate = knownNumber(item.engagementRate, 0);
    const savesShares = knownNumber(item.saves, 0) + knownNumber(item.shares, 0);
    const viewsPerHour = isKnownNumber(item.views) ? views / ageHours : null;
    const contentScore = Math.round(
      (views / maxViews) * 35
      + (interactions / maxInteractions) * 20
      + (velocity / maxVelocity) * 20
      + (engagementRate / maxEngagement) * 15
      + (savesShares / maxSavesShares) * 10
    );
    const signalTags = [];

    if (contentScore >= 75) signalTags.push('breakout');
    if (velocity > 0 && velocity >= maxVelocity * 0.5) signalTags.push('fast');
    if (!item.metricMeta.views.available || !item.metricMeta.reach.available || !item.metricMeta.interactions.available) {
      signalTags.push('missing-core');
    }

    return {
      ...item,
      originalIndex: index,
      viewsPerHour,
      contentScore,
      contentScoreLabel: scoreLabel(contentScore),
      signalTags
    };
  });
}

function ensureMetricMeta(item) {
  const keys = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'interactions', 'engagementRate'];
  const existing = item.metricMeta || {};

  return keys.reduce((meta, key) => {
    if (existing[key]) {
      meta[key] = existing[key];
    } else {
      meta[key] = buildMetricMeta(isKnownNumber(item[key]) ? {
        value: item[key],
        source: key === 'engagementRate' ? 'derived:interactions_reach' : 'demo:metric',
        derived: key === 'engagementRate'
      } : null);
    }
    return meta;
  }, {});
}

function scoreLabel(score) {
  if (score >= 80) return 'Breakout';
  if (score >= 60) return 'Strong';
  if (score >= 40) return 'Steady';
  return 'Watch';
}

function pickComparableMetrics(reel) {
  return {
    views: knownNumber(reel.views),
    interactions: knownNumber(reel.interactions)
  };
}

function buildMetricAvailability(content) {
  const keys = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'interactions', 'engagementRate'];

  return keys.reduce((availability, key) => {
    const available = content.filter((item) => isKnownNumber(item[key])).length;
    availability[key] = {
      available,
      unavailable: Math.max(0, content.length - available),
      coverage: content.length ? available / content.length : 1
    };
    return availability;
  }, {});
}

function buildDiagnostics({ mode, account, loadMeta, metricAvailability, activeConfig, updatedAt }) {
  return {
    dataSource: mode === 'graph-api' ? 'Instagram Graph API' : 'Demo data',
    apiHost: mode === 'graph-api' ? resolveGraphHost(activeConfig) : 'local demo',
    apiMode: mode === 'graph-api' ? activeConfig.apiMode : 'demo',
    graphApiVersion: activeConfig.graphApiVersion || dashboardConfig.graphApiVersion,
    accountMediaCount: account.mediaCount,
    loadedCount: loadMeta.loadedCount || 0,
    requestedLimit: loadMeta.requestedLimit || 0,
    hasMore: Boolean(loadMeta.hasMore),
    allMedia: Boolean(loadMeta.allMedia),
    loadStatus: loadMeta.hasMore ? 'More media may be available beyond the local limit' : 'All returned pages loaded',
    metricAvailability,
    updatedAt,
    notes: [
      'Totals sum only metrics returned by Meta or explicitly derived from returned fields.',
      'Unavailable means Meta did not return that metric for the media/token combination.',
      'Velocity and content score are local calculations since the last live sync.'
    ]
  };
}

function buildAvailabilityWarnings(metricAvailability, contentCount) {
  if (!contentCount) return [];

  return ['views', 'reach', 'interactions'].flatMap((key) => {
    const metric = metricAvailability[key];
    if (!metric || metric.unavailable === 0) return [];
    return `${metric.unavailable} ${key} values are unavailable from Meta for the current loaded media.`;
  });
}

function composeDashboard({ mode, account, content, loadMeta = {}, warnings = [], refreshMs, activeConfig = dashboardConfig }) {
  const enrichedContent = enrichContentAnalytics(content);
  const sorted = [...enrichedContent].sort((a, b) => metricSortValue(b.views) - metricSortValue(a.views));
  const breakdown = buildContentBreakdown(enrichedContent);
  const metricAvailability = buildMetricAvailability(enrichedContent);
  const totals = enrichedContent.reduce((sum, item) => {
    sum.views += knownNumber(item.views, 0);
    sum.reach += knownNumber(item.reach, 0);
    sum.likes += knownNumber(item.likes, 0);
    sum.comments += knownNumber(item.comments, 0);
    sum.shares += knownNumber(item.shares, 0);
    sum.saves += knownNumber(item.saves, 0);
    sum.interactions += knownNumber(item.interactions, 0);
    sum.deltaViews += item.deltaViews;
    sum.deltaInteractions += item.deltaInteractions;
    return sum;
  }, {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    interactions: 0,
    deltaViews: 0,
    deltaInteractions: 0
  });

  const engagementRate = totals.reach > 0 && metricAvailability.interactions.available
    ? totals.interactions / totals.reach
    : null;
  const now = new Date().toISOString();
  const reelCount = breakdown.reel || 0;
  const postCount = enrichedContent.length - reelCount;
  const diagnostics = buildDiagnostics({
    mode,
    account,
    loadMeta,
    metricAvailability,
    activeConfig,
    updatedAt: now
  });
  const combinedWarnings = unique([
    ...warnings,
    ...buildAvailabilityWarnings(metricAvailability, enrichedContent.length)
  ]);

  // Day-over-day change for the KPI cards. Only tracked for the real connected
  // account so demo ticks never pollute the baseline; demo falls back to the
  // since-last-sync delta on the client.
  const dayDelta = mode === 'graph-api'
    ? trackDailyMetrics({
      views: totals.views,
      reach: totals.reach,
      interactions: totals.interactions,
      likes: totals.likes,
      items: enrichedContent.length,
      followers: account.followers,
      follows: account.follows
    })
    : { available: false };
  const followerTrend = buildFollowerTrend(account, mode);

  return {
    mode,
    graphApiVersion: activeConfig.graphApiVersion || dashboardConfig.graphApiVersion,
    updatedAt: now,
    refreshMs,
    account,
    summary: {
      contentCount: enrichedContent.length,
      reelCount,
      postCount,
      imageCount: breakdown.image || 0,
      carouselCount: breakdown.carousel || 0,
      videoCount: breakdown.video || 0,
      totalViews: totals.views,
      totalReach: totals.reach,
      totalLikes: totals.likes,
      totalComments: totals.comments,
      totalShares: totals.shares,
      totalSaves: totals.saves,
      totalInteractions: totals.interactions,
      engagementRate,
      deltaViews: totals.deltaViews,
      deltaInteractions: totals.deltaInteractions,
      dayDelta,
      followerTrend,
      topContentViews: sorted[0]?.views || 0,
      averageViews: metricAvailability.views.available ? Math.round(totals.views / metricAvailability.views.available) : null,
      averageInteractions: metricAvailability.interactions.available ? Math.round(totals.interactions / metricAvailability.interactions.available) : null
    },
    breakdown,
    diagnostics,
    metricAvailability,
    loadMeta,
    content: sorted,
    reels: sorted,
    trend: buildTrend(enrichedContent, 14),
    topContent: sorted.slice(0, 5),
    topReels: sorted.slice(0, 5),
    activity: buildActivity(sorted),
    warnings: combinedWarnings
  };
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadMetricsHistory() {
  try {
    if (existsSync(historyPath)) {
      const parsed = JSON.parse(readFileSync(historyPath, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // A corrupt or unreadable history file is non-fatal - start fresh.
  }
  return {};
}

function saveMetricsHistory() {
  try {
    writeFileSync(historyPath, JSON.stringify(metricsHistory, null, 2));
  } catch {
    // Best-effort persistence; never block a dashboard build on a disk error.
  }
}

// Snapshot today's totals and return the change vs the previous day's close.
// On the first day (no prior history) it reports growth so far today instead.
function trackDailyMetrics(totals) {
  const key = todayKey();
  const snapshot = {
    at: new Date().toISOString(),
    views: totals.views,
    reach: totals.reach,
    interactions: totals.interactions,
    likes: totals.likes,
    items: totals.items,
    followers: totals.followers,
    follows: totals.follows
  };

  const priorDates = Object.keys(metricsHistory).filter((date) => date < key).sort();
  const prev = priorDates.length ? metricsHistory[priorDates[priorDates.length - 1]] : null;

  if (metricsHistory[key]) {
    metricsHistory[key].last = snapshot;
  } else {
    metricsHistory[key] = { first: snapshot, last: snapshot };
  }

  const allDates = Object.keys(metricsHistory).sort();
  while (allDates.length > 14) {
    delete metricsHistory[allDates.shift()];
  }
  saveMetricsHistory();

  const baseline = (prev && prev.last) ? prev.last : metricsHistory[key].first;
  const basis = (prev && prev.last) ? 'previous-day' : 'today';
  const sinceDate = (prev && prev.last) ? priorDates[priorDates.length - 1] : key;

  return {
    available: true,
    basis,
    sinceDate,
    sinceTime: baseline.at || null,
    views: snapshot.views - baseline.views,
    reach: snapshot.reach - baseline.reach,
    interactions: snapshot.interactions - baseline.interactions,
    likes: snapshot.likes - baseline.likes,
    items: snapshot.items - baseline.items
  };
}

// Net follower change over time from the stored daily snapshots (aggregate only -
// Instagram never exposes which users followed or unfollowed).
function buildFollowerTrend(account, mode) {
  if (mode !== 'graph-api') {
    // Demo: synthesize a believable 14-day series so the page renders without a token.
    const today = new Date();
    let running = account.followers - 1300;
    const series = [];
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const net = Math.round(Math.sin(i * 1.1) * 90 + 120 - (i % 4) * 30);
      running += net;
      series.push({ date: date.toISOString().slice(0, 10), followers: running, net });
    }
    const weekNet = series.slice(-7).reduce((sum, point) => sum + point.net, 0);
    return { available: true, dayNet: series[series.length - 1].net, weekNet, series };
  }

  const dates = Object.keys(metricsHistory).sort();
  const series = [];
  let prevFollowers = null;
  for (const date of dates) {
    const followers = metricsHistory[date]?.last?.followers;
    if (typeof followers !== 'number') continue;
    const at = metricsHistory[date]?.last?.at || null;
    series.push({ date, at, followers, net: prevFollowers === null ? 0 : followers - prevFollowers });
    prevFollowers = followers;
  }

  if (series.length < 2) {
    return { available: false, dayNet: 0, weekNet: 0, series };
  }
  const dayNet = series[series.length - 1].net;
  const weekNet = series.slice(-7).reduce((sum, point) => sum + point.net, 0);
  return { available: true, dayNet, weekNet, series };
}

function buildContentBreakdown(content) {
  return content.reduce((counts, item) => {
    counts[item.contentType] = (counts[item.contentType] || 0) + 1;
    return counts;
  }, {
    reel: 0,
    video: 0,
    image: 0,
    carousel: 0,
    post: 0
  });
}

function buildTrend(content, days) {
  const today = new Date();
  const buckets = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - index);
    buckets.push({
      date: date.toISOString().slice(0, 10),
      views: 0,
      reach: 0,
      interactions: 0,
      content: 0
    });
  }

  const byDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  for (const item of content) {
    const key = new Date(item.timestamp).toISOString().slice(0, 10);
    const bucket = byDate.get(key);
    if (!bucket) continue;

    bucket.views += item.views;
    bucket.reach += item.reach;
    bucket.interactions += item.interactions;
    bucket.content += 1;
  }

  return buckets;
}

function buildActivity(content) {
  return content
    .filter((item) => item.deltaViews > 0 || item.deltaInteractions > 0)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      caption: item.caption,
      contentTypeLabel: item.contentTypeLabel,
      permalink: item.permalink,
      deltaViews: item.deltaViews,
      deltaInteractions: item.deltaInteractions,
      at: new Date().toISOString()
    }));
}

function getDemoDashboardData(limit) {
  advanceDemoState();
  const content = demoState.content.slice(0, limit).map((item) => ({ ...item }));
  const dashboard = composeDashboard({
    mode: 'demo',
    account: demoState.account,
    content,
    loadMeta: {
      loadedCount: content.length,
      requestedLimit: limit,
      allMedia: true,
      hasMore: demoState.content.length > content.length
    },
    warnings: ['Demo mode is active. Use the Connect Graph API panel to add your token and Instagram professional account ID.'],
    refreshMs: dashboardConfig.refreshMs
  });
  previousContentMetrics = new Map(dashboard.content.map((item) => [item.id, pickComparableMetrics(item)]));
  dashboard.audience = demoAudience();
  // No synthesized account insights or reach-source split - these are real-data-only.
  dashboard.accountInsights = { available: false, reason: 'Connect your Instagram account to see windowed account-level insights and reach source.' };

  return dashboard;
}

function demoAudience() {
  return {
    available: true,
    followers: {
      gender: { F: 78300, M: 48800, U: 1300 },
      age: { '13-17': 4000, '18-24': 36000, '25-34': 54000, '35-44': 22000, '45-54': 9000, '55-64': 2400, '65+': 1000 },
      country: [{ key: 'IN', value: 91000 }, { key: 'US', value: 11500 }, { key: 'AE', value: 6400 }, { key: 'GB', value: 4200 }, { key: 'CA', value: 3000 }, { key: 'AU', value: 2100 }],
      city: [{ key: 'Mumbai', value: 24000 }, { key: 'Delhi', value: 18500 }, { key: 'Bengaluru', value: 12000 }, { key: 'Pune', value: 8200 }, { key: 'Hyderabad', value: 6400 }, { key: 'Dubai', value: 5100 }]
    },
    reachByGender: {
      this_week: { F: 36462, M: 22302, U: 17431 },
      last_14_days: { F: 178294, M: 114740, U: 87056 },
      last_90_days: { F: 1830899, M: 1014418, U: 910989 },
      this_month: { F: 1823987, M: 1006444, U: 906626 }
    },
    engagedByGender: {
      this_week: { F: 4100, M: 2300, U: 900 },
      last_14_days: { F: 21000, M: 11800, U: 4600 },
      last_90_days: { F: 142000, M: 78000, U: 30000 },
      this_month: { F: 138000, M: 75000, U: 29000 }
    },
    timeframes: ['this_week', 'last_14_days', 'last_90_days', 'this_month'],
    defaultTimeframe: 'last_90_days',
    profileViewsByTimeframe: {
      this_week: 559,
      last_14_days: 1180,
      last_90_days: 32768,
      this_month: 18900
    }
  };
}

function createDemoState() {
  const samples = [
    ['reel', 'Launch day edit: 4 hooks that stopped the scroll'],
    ['video', 'Behind the scenes: production floor in 18 seconds'],
    ['reel', 'Creator collab cutdown with product reveal'],
    ['image', 'Client result snapshot from the new campaign'],
    ['carousel', 'Trend breakdown: five frames that explain the CTA'],
    ['reel', 'Founder POV: what changed this month'],
    ['image', 'Before and after: studio setup refresh'],
    ['video', 'Tutorial: three edits that lift retention'],
    ['reel', 'New offer teaser with comments prompt'],
    ['carousel', 'Weekend recap with audience questions'],
    ['image', 'UGC proof post from customers'],
    ['carousel', 'Myth vs fact: short-form ad edition'],
    ['reel', 'Day in the life: social team sprint'],
    ['image', 'Product close-up with texture shots'],
    ['video', 'Live event clip with fast captions'],
    ['carousel', 'Case study snapshot: first 72 hours'],
    ['reel', 'Comment reply reel with customer objection'],
    ['image', 'Announcement post with launch countdown'],
    ['carousel', 'Monthly analytics recap for the team'],
    ['video', 'Longer demo cutdown from webinar footage']
  ];

  const now = Date.now();
  const content = samples.map(([contentType, caption], index) => {
    const ageDays = index % 13;
    const videoMultiplier = ['reel', 'video'].includes(contentType) ? 1 : 0.38;
    const views = Math.round((186000 / (index + 1) + 18000 + Math.random() * 42000) * videoMultiplier);
    const reach = Math.round(views * (0.56 + Math.random() * 0.22));
    const likes = Math.round(views * (0.018 + Math.random() * 0.018));
    const comments = Math.round(views * (0.0015 + Math.random() * 0.003));
    const shares = Math.round(views * (0.003 + Math.random() * 0.006));
    const saves = Math.round(views * (0.0025 + Math.random() * 0.006));
    const interactions = likes + comments + shares + saves;

    return {
      id: `demo-${index + 1}`,
      caption,
      contentType,
      contentTypeLabel: labelContentType(contentType),
      mediaType: contentType === 'image' ? 'IMAGE' : contentType === 'carousel' ? 'CAROUSEL_ALBUM' : 'VIDEO',
      productType: contentType === 'reel' ? 'REELS' : 'FEED',
      permalink: 'https://www.instagram.com/',
      thumbnailUrl: '',
      timestamp: new Date(now - ageDays * 86400000 - index * 3600000).toISOString(),
      views,
      reach,
      likes,
      comments,
      shares,
      saves,
      interactions,
      engagementRate: reach > 0 ? interactions / reach : 0,
      deltaViews: 0,
      deltaInteractions: 0
    };
  });

  return {
    lastAdvance: Date.now(),
    account: {
      id: 'demo-account',
      username: 'multia.social',
      name: 'Multia Social',
      profilePictureUrl: '',
      followers: 128400,
      follows: 422,
      mediaCount: 386
    },
    content
  };
}

function advanceDemoState() {
  const now = Date.now();
  const elapsed = Math.max(1, Math.round((now - demoState.lastAdvance) / 1000));
  if (elapsed < 3) return;

  demoState.lastAdvance = now;

  demoState.content = demoState.content.map((item, index) => {
    const momentum = Math.max(1, 12 - index);
    const typeMultiplier = ['reel', 'video'].includes(item.contentType) ? 1 : 0.42;
    const deltaViews = Math.round((Math.random() * 18 + momentum * 4) * Math.min(elapsed, 90) * typeMultiplier / 10);
    const deltaInteractions = Math.round(deltaViews * (0.025 + Math.random() * 0.02));
    const shares = Math.round(deltaInteractions * 0.22);
    const saves = Math.round(deltaInteractions * 0.18);
    const comments = Math.max(0, Math.round(deltaInteractions * 0.08));
    const likes = Math.max(0, deltaInteractions - shares - saves - comments);
    const reachDelta = Math.round(deltaViews * (0.48 + Math.random() * 0.22));

    return {
      ...item,
      views: item.views + deltaViews,
      reach: item.reach + reachDelta,
      likes: item.likes + likes,
      comments: item.comments + comments,
      shares: item.shares + shares,
      saves: item.saves + saves,
      interactions: item.interactions + deltaInteractions,
      engagementRate: (item.interactions + deltaInteractions) / Math.max(1, item.reach + reachDelta),
      deltaViews,
      deltaInteractions
    };
  });
}

async function serveStatic(requestUrl, res) {
  let pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';
  const decodedPath = decodeURIComponent(pathname);
  const requestedPath = path.normalize(path.join(publicDir, decodedPath));

  if (!requestedPath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(requestedPath);
    const filePath = fileStat.isDirectory() ? path.join(requestedPath, 'index.html') : requestedPath;
    const ext = path.extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes.get(ext) || 'application/octet-stream',
      'Cache-Control': ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(req) {
  // Vercel's Node runtime may already have parsed the body into req.body.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200000) {
      throw new Error('Request body is too large');
    }
  }

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function hasCredentials(config = dashboardConfig) {
  return Boolean(config.accessToken && config.instagramUserId);
}

function clearCache() {
  cachedLiveData = null;
  cachedUntil = 0;
  cachedKey = '';
  previousContentMetrics = new Map();
}

function writeDashboardEnv(config) {
  const values = {
    INSTAGRAM_ACCESS_TOKEN: config.accessToken,
    INSTAGRAM_USER_ID: config.instagramUserId,
    GRAPH_API_VERSION: config.graphApiVersion,
    INSTAGRAM_API_MODE: config.apiMode,
    DASHBOARD_REFRESH_MS: String(config.refreshMs),
    PORT: String(PORT)
  };
  const lines = existsSync(envPath)
    ? readFileSync(envPath, 'utf8').split(/\r?\n/)
    : [];
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !(match[1] in values)) return line;

    seen.add(match[1]);
    return `${match[1]}=${quoteEnv(values[match[1]])}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${quoteEnv(value)}`);
    }
  }

  writeFileSync(envPath, `${nextLines.filter((line, index, all) => line || index < all.length - 1).join('\n').replace(/\n+$/u, '')}\n`);
}

function quoteEnv(value) {
  return JSON.stringify(String(value || ''));
}

function sanitizeInstagramUserId(value) {
  return String(value || '').trim().replace(/[^\d]/g, '');
}

function normalizeAccessToken(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function normalizeApiMode(value) {
  return ['auto', 'instagram', 'facebook'].includes(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : 'auto';
}

function resolveGraphHost(config = dashboardConfig) {
  const mode = normalizeApiMode(config.apiMode);
  if (mode === 'instagram') return 'graph.instagram.com';
  if (mode === 'facebook') return 'graph.facebook.com';

  return looksLikeInstagramToken(config.accessToken)
    ? 'graph.instagram.com'
    : 'graph.facebook.com';
}

function looksLikeInstagramToken(value) {
  const token = normalizeAccessToken(value);
  return token.startsWith('IG') || token.startsWith('IIG');
}

function normalizeGraphVersion(value) {
  const trimmed = String(value || 'v23.0').trim().toLowerCase();
  const match = trimmed.match(/^v?\d{1,2}\.\d$/);
  return match ? (trimmed.startsWith('v') ? trimmed : `v${trimmed}`) : 'v23.0';
}

function isLocalRequest(req) {
  const address = req.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function firstLine(value) {
  return String(value).split(/\r?\n/)[0].trim().slice(0, 140) || 'Untitled reel';
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isKnownNumber(value) {
  return knownNumber(value) !== null;
}

function knownNumber(value, fallback = null) {
  if (value === null || typeof value === 'undefined' || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metricSortValue(value) {
  return knownNumber(value, Number.NEGATIVE_INFINITY);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
