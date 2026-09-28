import { createServer } from 'node:http';
import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// Declared here, not beside the encryption helpers: loadConfigStore() runs at module load
// and decrypts tokens, so anything it touches must already be initialised. Declaring it
// further down puts it in the temporal dead zone and every token loads as blank.
const ENCRYPTED_PREFIX = 'enc:v1:';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const envPath = path.join(__dirname, '.env');
const configPath = path.join(__dirname, 'config.json');

loadEnv(envPath);

const PORT = toNumber(process.env.PORT, 4173);

// Multi-account config store. Each account keeps its own token/id/API settings;
// refreshMs is shared. Persisted to Supabase ('config' key) or local config.json;
// .env is a read-only seed for the first account and is never written back.
let configStore = loadConfigStore();

function loadConfigStore() {
  let stored = null;
  try {
    if (existsSync(configPath)) stored = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    // A corrupt config.json is non-fatal - fall back to the env seed.
  }
  if (stored && typeof stored === 'object') return migrateStoredConfig(stored);

  const seed = {
    refreshMs: clamp(toNumber(process.env.DASHBOARD_REFRESH_MS, 60000), 15000, 86400000),
    defaultAccountId: '',
    accounts: [],
    users: []
  };
  if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID) {
    const instagramUserId = sanitizeInstagramUserId(process.env.INSTAGRAM_USER_ID);
    seed.accounts.push(normalizeStoredAccount({
      instagramUserId,
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      graphApiVersion: process.env.GRAPH_API_VERSION || 'v23.0',
      apiMode: process.env.INSTAGRAM_API_MODE || 'auto'
    }));
    seed.defaultAccountId = instagramUserId;
  }
  return seed;
}

// Accept both the new { accounts: [...] } shape and the legacy single-account shape.
function migrateStoredConfig(stored) {
  const users = normalizeStoredUsers(stored.users);
  if (Array.isArray(stored.accounts)) {
    const accounts = stored.accounts.map(normalizeStoredAccount).filter((account) => account.instagramUserId);
    return {
      refreshMs: clamp(toNumber(stored.refreshMs, 60000), 15000, 86400000),
      defaultAccountId: sanitizeInstagramUserId(stored.defaultAccountId) || accounts[0]?.instagramUserId || '',
      accounts,
      users
    };
  }
  const account = normalizeStoredAccount(stored);
  const accounts = account.instagramUserId && account.accessToken ? [account] : [];
  return {
    refreshMs: clamp(toNumber(stored.refreshMs, 60000), 15000, 86400000),
    defaultAccountId: accounts[0]?.instagramUserId || '',
    accounts,
    users
  };
}

// Client logins. Only the scrypt hash is kept; the password itself is shown to the admin
// once at creation/reset and never stored.
function normalizeStoredUsers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((user = {}) => ({
    id: String(user.id || ''),
    login: normalizeLogin(user.login),
    name: String(user.name || '').trim(),
    passwordHash: String(user.passwordHash || ''),
    accountIds: [...new Set((Array.isArray(user.accountIds) ? user.accountIds : []).map(sanitizeInstagramUserId).filter(Boolean))],
    sessionVersion: String(user.sessionVersion || newSessionVersion()),
    disabled: Boolean(user.disabled),
    createdAt: String(user.createdAt || '')
  })).filter((user) => user.id && user.login && user.passwordHash);
}

function normalizeStoredAccount(raw = {}) {
  return {
    instagramUserId: sanitizeInstagramUserId(raw.instagramUserId),
    accessToken: normalizeAccessToken(readStoredToken(raw.accessToken)),
    username: String(raw.username || ''),
    label: String(raw.label || ''),
    profilePictureUrl: String(raw.profilePictureUrl || ''),
    graphApiVersion: normalizeGraphVersion(raw.graphApiVersion),
    apiMode: normalizeApiMode(raw.apiMode),
    ads: normalizeStoredAds(raw.ads)
  };
}

// The Meta ad account whose results this Instagram account's viewers may see.
function normalizeStoredAds(raw) {
  const adAccountId = normalizeAdAccountId(raw?.adAccountId);
  if (!adAccountId) return null;
  return {
    adAccountId,
    accessToken: normalizeAccessToken(readStoredToken(raw.accessToken)),
    name: String(raw.name || ''),
    currency: String(raw.currency || ''),
    timezoneName: String(raw.timezoneName || '')
  };
}

// "act_123", "123" and " act_123 " all mean the same ad account.
export function normalizeAdAccountId(value) {
  const digits = String(value || '').trim().replace(/^act_/i, '').replace(/[^\d]/g, '');
  return digits ? `act_${digits}` : '';
}

function getAccount(id = '') {
  const wanted = sanitizeInstagramUserId(id);
  const { accounts, defaultAccountId } = configStore;
  return accounts.find((account) => account.instagramUserId === wanted)
    || accounts.find((account) => account.instagramUserId === defaultAccountId)
    || accounts[0]
    || null;
}

// Per-request view of one account's connection settings (the shape every graph
// fetch helper already expects: token + id + version + mode + refreshMs).
function accountConfig(account) {
  return account
    ? { ...account, refreshMs: configStore.refreshMs }
    : {
      instagramUserId: '',
      accessToken: '',
      username: '',
      label: '',
      profilePictureUrl: '',
      graphApiVersion: 'v23.0',
      apiMode: 'auto',
      refreshMs: configStore.refreshMs
    };
}

function defaultConfig() {
  return accountConfig(getAccount());
}

// ---------------------------------------------------------------------------
// Authentication
//
// Two roles. The admin is defined by env (ADMIN_LOGIN / ADMIN_PASSWORD) and sees every
// account. Clients are created in /admin, live in configStore.users, and see only the
// accounts in their accountIds. Sessions are a signed cookie rather than a session table,
// so they work across stateless serverless instances.
// ---------------------------------------------------------------------------

const SESSION_COOKIE = 'mid_session';
const CLIENT_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
const LOGIN_PATTERN = /^[a-z0-9._@-]{3,64}$/;
const MIN_PASSWORD_LENGTH = 10;

function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function newSessionVersion() {
  return randomBytes(9).toString('base64url');
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expected = true;
  return error;
}

let devSessionSecret = '';
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Every serverless instance would mint its own secret and reject the others' cookies.
  if (process.env.VERCEL) return '';
  if (!devSessionSecret) {
    devSessionSecret = randomBytes(32).toString('hex');
    console.warn('SESSION_SECRET is not set - using a random per-process secret; logins reset on restart.');
  }
  return devSessionSecret;
}

function adminLogin() {
  return normalizeLogin(process.env.ADMIN_LOGIN || 'admin');
}

// Fail closed: with no ADMIN_PASSWORD there is no admin login at all.
function adminEnabled() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

// Changing ADMIN_PASSWORD (or SESSION_SECRET) invalidates every existing admin session.
function adminSessionVersion(secret) {
  return createHmac('sha256', secret).update(`admin:${process.env.ADMIN_PASSWORD || ''}`).digest('base64url').slice(0, 16);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Constant-time comparison for strings of any length (hashing first equalises lengths).
function safeEqualString(a, b) {
  const digest = (value) => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function signSessionToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

// The payload, only if the signature matches and it has not expired.
export function readSessionToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload && typeof payload.exp === 'number' && payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

// Same-origin paths only: "/x" yes; "//evil.com", "/\evil.com", "https://…" no.
export function safeNextPath(next) {
  const value = String(next || '');
  return /^\/(?![/\\])/.test(value) && !/[\r\n]/.test(value) ? value : '';
}

// Which account id a session may read. Admins keep the old behaviour (any id; getAccount
// falls back to the default). Clients get only their own accounts - an id outside that
// list is a 403, never a silent fallback to another client's data.
export function resolveAllowedAccountId(session, requestedId, existingIds) {
  const wanted = sanitizeInstagramUserId(requestedId);
  if (session?.role === 'admin') return wanted;
  const allowed = (session?.user?.accountIds || []).filter((id) => existingIds.includes(id));
  if (!allowed.length) throw httpError(403, 'No Instagram account has been assigned to this login yet.');
  if (!wanted) return allowed[0];
  if (!allowed.includes(wanted)) throw httpError(403, 'You do not have access to this account.');
  return wanted;
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

function sessionCookie(req, value, maxAgeMs) {
  const secure = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

// Resolved against the *current* store on every request, so disabling a client, resetting
// their password or unassigning an account takes effect on their very next request.
function sessionFromRequest(req) {
  const secret = sessionSecret();
  const payload = readSessionToken(readCookie(req, SESSION_COOKIE), secret);
  if (!payload) return null;
  if (payload.role === 'admin') {
    return adminEnabled() && payload.sub === 'admin' && payload.ver === adminSessionVersion(secret)
      ? { role: 'admin', user: { id: 'admin', login: adminLogin(), name: 'Admin' } }
      : null;
  }
  const user = configStore.users.find((entry) => entry.id === payload.sub);
  if (!user || user.disabled || user.sessionVersion !== payload.ver) return null;
  return { role: 'client', user };
}

function accountFromRequest(requestUrl, session) {
  const id = resolveAllowedAccountId(
    session,
    requestUrl.searchParams.get('account') || '',
    configStore.accounts.map((account) => account.instagramUserId)
  );
  return accountConfig(getAccount(id));
}

function allowedAccounts(session) {
  if (session.role === 'admin') return configStore.accounts;
  const ids = new Set(session.user.accountIds);
  return configStore.accounts.filter((account) => ids.has(account.instagramUserId));
}

// A browser cross-site form/fetch carries the attacker's Origin; ours carries our host.
function isCrossOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

// ponytail: in-memory, so on Vercel each instance counts separately. Generated client
// passwords make brute force impractical anyway; move this to a Supabase counter if a
// shared limit is ever needed.
const loginFailures = new Map(); // login -> [failure timestamps]
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

function tooManyFailures(login) {
  const cutoff = Date.now() - LOGIN_WINDOW_MS;
  const recent = (loginFailures.get(login) || []).filter((time) => time > cutoff);
  loginFailures.set(login, recent);
  return recent.length >= LOGIN_MAX_FAILURES;
}

// Checked against when the login ID doesn't exist, so response time doesn't reveal
// which login IDs are real.
let dummyPasswordHash = '';

async function handleAuthLogin(req, res) {
  if (req.method !== 'POST') return sendJson(res, { error: 'Method not allowed' }, 405);
  const secret = sessionSecret();
  if (!secret) return sendJson(res, { error: 'SESSION_SECRET is not configured on the server.' }, 500);

  const body = await readJsonBody(req);
  const login = normalizeLogin(body.login);
  const password = String(body.password || '');
  if (!login || !password) return sendJson(res, { error: 'Enter your login ID and password.' }, 400);
  if (tooManyFailures(login)) return sendJson(res, { error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  let claims = null;
  let ttl = 0;
  if (login === adminLogin()) {
    if (adminEnabled() && safeEqualString(password, process.env.ADMIN_PASSWORD)) {
      claims = { sub: 'admin', role: 'admin', ver: adminSessionVersion(secret) };
      ttl = ADMIN_SESSION_MS;
    }
  } else {
    await ensureConfigLoaded(true);
    const user = configStore.users.find((entry) => entry.login === login && !entry.disabled);
    dummyPasswordHash ||= await hashPassword(randomBytes(16).toString('hex'));
    const ok = await verifyPassword(password, user?.passwordHash || dummyPasswordHash);
    if (user && ok) {
      claims = { sub: user.id, role: 'client', ver: user.sessionVersion };
      ttl = CLIENT_SESSION_MS;
    }
  }

  if (!claims) {
    // Spraying random login IDs must not grow this map without bound.
    if (loginFailures.size > 10000) loginFailures.clear();
    const failures = loginFailures.get(login) || [];
    failures.push(Date.now());
    loginFailures.set(login, failures);
    return sendJson(res, { error: 'Incorrect login ID or password.' }, 401);
  }

  loginFailures.delete(login);
  res.setHeader('Set-Cookie', sessionCookie(req, signSessionToken({ ...claims, exp: Date.now() + ttl }, secret), ttl));
  const next = safeNextPath(body.next);
  const home = claims.role === 'admin' ? '/admin' : '/';
  const redirect = next && !(claims.role === 'client' && next.startsWith('/admin')) ? next : home;
  return sendJson(res, { ok: true, role: claims.role, redirect });
}

function handleAuthLogout(req, res) {
  // POST only, so another site can't sign people out with an <img src>.
  if (req.method !== 'POST') return sendJson(res, { error: 'Method not allowed' }, 405);
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return sendJson(res, { ok: true });
}

function handleAuthMe(res, session) {
  return sendJson(res, {
    role: session.role,
    login: session.user.login,
    name: session.user.name || session.user.login,
    accountIds: allowedAccounts(session).map((account) => account.instagramUserId)
  });
}

function publicUser(user) {
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    accountIds: user.accountIds,
    disabled: user.disabled,
    createdAt: user.createdAt
  };
}

// GET lists client logins (never hashes), POST creates one, PATCH ?id= updates, DELETE
// ?id= removes. Admin-only - the gate in handleRequest enforces that before we get here.
async function handleClients(req, res, requestUrl) {
  if (req.method === 'GET') {
    return sendJson(res, { clients: configStore.users.map(publicUser) });
  }

  // Fresh read first: this writes the whole store, and a stale copy from another
  // serverless instance would silently clobber accounts or clients saved elsewhere.
  await ensureConfigLoaded(true);
  const knownAccountIds = new Set(configStore.accounts.map((account) => account.instagramUserId));
  const cleanAccountIds = (ids) => [...new Set((Array.isArray(ids) ? ids : [])
    .map(sanitizeInstagramUserId)
    .filter((id) => knownAccountIds.has(id)))];

  if (req.method === 'DELETE') {
    const id = String(requestUrl.searchParams.get('id') || '');
    const remaining = configStore.users.filter((user) => user.id !== id);
    if (remaining.length === configStore.users.length) return sendJson(res, { error: 'Client not found' }, 404);
    configStore.users = remaining;
    const persisted = await saveConfigStore();
    return sendJson(res, { ok: true, clients: configStore.users.map(publicUser), persisted });
  }

  const body = await readJsonBody(req);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return sendJson(res, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  if (req.method === 'POST') {
    const login = normalizeLogin(body.login);
    if (!LOGIN_PATTERN.test(login)) {
      return sendJson(res, { error: 'Login ID must be 3-64 characters: letters, numbers, dot, dash, underscore or @.' }, 400);
    }
    if (login === adminLogin() || configStore.users.some((user) => user.login === login)) {
      return sendJson(res, { error: 'That login ID is already taken.' }, 409);
    }
    if (!password) return sendJson(res, { error: 'A password is required.' }, 400);

    const user = {
      id: randomBytes(12).toString('base64url'),
      login,
      name: String(body.name || '').trim() || login,
      passwordHash: await hashPassword(password),
      accountIds: cleanAccountIds(body.accountIds),
      sessionVersion: newSessionVersion(),
      disabled: false,
      createdAt: new Date().toISOString()
    };
    configStore.users = [...configStore.users, user];
    const persisted = await saveConfigStore();
    return sendJson(res, { ok: true, client: publicUser(user), persisted }, 201);
  }

  if (req.method === 'PATCH') {
    const id = String(requestUrl.searchParams.get('id') || '');
    const existing = configStore.users.find((user) => user.id === id);
    if (!existing) return sendJson(res, { error: 'Client not found' }, 404);

    const next = { ...existing };
    if (typeof body.name === 'string') next.name = body.name.trim() || existing.login;
    if (Array.isArray(body.accountIds)) next.accountIds = cleanAccountIds(body.accountIds);
    if (typeof body.disabled === 'boolean') next.disabled = body.disabled;
    // A new password or a disable signs the client out everywhere. Account changes need no
    // bump: sessions read accountIds fresh on every request.
    if (password) {
      next.passwordHash = await hashPassword(password);
      next.sessionVersion = newSessionVersion();
    }
    if (next.disabled && !existing.disabled) next.sessionVersion = newSessionVersion();

    configStore.users = configStore.users.map((user) => (user.id === id ? next : user));
    const persisted = await saveConfigStore();
    return sendJson(res, { ok: true, client: publicUser(next), persisted });
  }

  return sendJson(res, { error: 'Method not allowed' }, 405);
}

// ---------------------------------------------------------------------------
// Access tokens at rest
//
// We hold client credentials, so tokens are AES-256-GCM encrypted in Supabase / config.json
// when TOKEN_ENCRYPTION_KEY is set. Plaintext values still load, so an existing store
// migrates on its next save. Losing the key means re-entering every token.
// ---------------------------------------------------------------------------

function tokenEncryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64 encoded.');
  return key;
}

export function encryptSecret(value, key) {
  const text = String(value || '');
  if (!key || !text || text.startsWith(ENCRYPTED_PREFIX)) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
}

export function decryptSecret(value, key) {
  const text = String(value || '');
  if (!text.startsWith(ENCRYPTED_PREFIX)) return text; // legacy plaintext
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to read stored tokens.');
  const [ivB64, tagB64, dataB64] = text.slice(ENCRYPTED_PREFIX.length).split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

// A token that can't be decrypted (missing or wrong key) loads as blank rather than taking
// the whole store down; the account then shows up in /admin needing its token re-entered.
function readStoredToken(value) {
  try {
    return decryptSecret(value, tokenEncryptionKey());
  } catch (error) {
    console.error(`Stored access token could not be decrypted: ${error.message}`);
    return '';
  }
}

function storeForPersistence() {
  const key = tokenEncryptionKey();
  return {
    ...configStore,
    accounts: configStore.accounts.map((account) => ({
      ...account,
      accessToken: encryptSecret(account.accessToken, key),
      ads: account.ads ? { ...account.ads, accessToken: encryptSecret(account.ads.accessToken, key) } : null
    }))
  };
}

async function saveConfigStore() {
  // Built outside the try blocks so a bad TOKEN_ENCRYPTION_KEY fails loudly instead of
  // quietly falling back to writing plaintext.
  const persisted = storeForPersistence();
  if (supabaseEnabled()) {
    try {
      if (await kvSet('config', persisted)) return true;
    } catch {
      // fall through to the local file
    }
  }
  try {
    writeFileSync(configPath, JSON.stringify(persisted, null, 2));
    return true;
  } catch {
    return false; // read-only FS without Supabase: config applies in-memory only
  }
}

// Optional Supabase persistence (gives serverless deploys a real store for config +
// metrics history). Uses the REST API directly - no SDK dependency. When the env vars
// are absent everything falls back to env-var config + the local file, unchanged.
let configLoadedAt = 0;
const CONFIG_TTL_MS = 5000;

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

// Load admin-saved config from Supabase. Re-read on a short TTL (not once per process):
// Vercel keeps several warm lambda instances, and an account added through one instance
// must become visible to the others without waiting for a cold start. Mutating handlers
// pass force=true so they never act on a stale copy.
async function ensureConfigLoaded(force = false) {
  if (!supabaseEnabled()) return;
  if (!force && Date.now() - configLoadedAt < CONFIG_TTL_MS) return;
  try {
    const stored = await kvGet('config');
    configLoadedAt = Date.now();
    if (stored && typeof stored === 'object') {
      configStore = migrateStoredConfig(stored);
    }
  } catch {
    // Persisted config is best-effort; keep the current copy and retry after the TTL.
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

// All server caches are per-account Maps keyed by instagramUserId, so switching
// accounts in the UI never evicts another account's data.
const previousContentMetrics = new Map(); // accountId -> Map(mediaId -> comparable metrics)
const dashboardCache = new Map();         // `${accountId}:${limit}:${all}` -> dashboard payload
const audienceCache = new Map();          // accountId -> { value, until }
const accountInsightsCache = new Map();   // accountId -> { value, until }
const followerGrowthCache = new Map();    // accountId -> { value, until }
const profileCache = new Map();           // accountId -> { value, until } (overview cards)
const historyPath = path.join(__dirname, 'metrics-history.json');
let metricsHistory = loadMetricsHistory(); // { accountId: { 'YYYY-MM-DD': { first, last } } }
const demoState = createDemoState();

export async function handleRequest(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Make sure any admin-saved config (incl. the saved refresh interval and client logins)
    // is loaded before any route reads the store.
    await ensureConfigLoaded();
    const { pathname } = requestUrl;

    if (req.method !== 'GET' && req.method !== 'HEAD' && isCrossOrigin(req)) {
      return sendJson(res, { error: 'Cross-origin request blocked.' }, 403);
    }

    // --- Public routes ---------------------------------------------------------
    if (pathname === '/api/auth/login') return await handleAuthLogin(req, res);
    if (pathname === '/api/auth/logout') return handleAuthLogout(req, res);

    if (pathname === '/api/health') {
      const config = defaultConfig();
      return sendJson(res, {
        ok: true,
        mode: hasCredentials(config) ? 'graph-api' : 'demo',
        graphApiVersion: config.graphApiVersion
      });
    }

    if (pathname === '/login' || pathname === '/login.html') {
      return await serveStatic(new URL('/login.html', requestUrl), res);
    }

    // --- Everything below needs a session --------------------------------------
    const session = sessionFromRequest(req);
    const adminPage = ['/admin', '/admin/', '/admin.html'].includes(pathname);

    if (adminPage || ['/', '/index.html'].includes(pathname)) {
      if (!session) return redirect(res, `/login?next=${encodeURIComponent(pathname + requestUrl.search)}`);
      if (adminPage && session.role !== 'admin') return redirect(res, '/');
      return await serveStatic(requestUrl, res);
    }

    if (pathname.startsWith('/api/')) {
      if (!session) return sendJson(res, { error: 'Please log in.' }, 401);
      const adminOnly = pathname.startsWith('/api/config') || pathname.startsWith('/api/admin/') || pathname === '/api/refresh';
      if (adminOnly && session.role !== 'admin') return sendJson(res, { error: 'Admin access required.' }, 403);
    }

    if (pathname === '/api/auth/me') return handleAuthMe(res, session);

    if (pathname === '/api/admin/clients') {
      return await handleClients(req, res, requestUrl);
    }

    if (pathname === '/api/status') {
      return sendJson(res, getStatusPayload(accountFromRequest(requestUrl, session), session));
    }

    if (pathname === '/api/accounts') {
      return sendJson(res, getAccountsPayload(session));
    }

    if (pathname === '/api/accounts/summary') {
      return await handleAccountsSummary(res, session);
    }

    if (pathname === '/api/config/ads') return await handleAdsConfig(req, res, requestUrl);
    if (pathname === '/api/config/ad-accounts') return await handleAdAccountsDiscover(req, res);

    if (requestUrl.pathname === '/api/config') {
      return await handleConfig(req, res, requestUrl);
    }

    if (requestUrl.pathname === '/api/config/default') {
      return await handleConfigDefault(req, res);
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
      const data = await getDashboardData({
        limit,
        allMedia,
        force: requestUrl.searchParams.get('force') === '1',
        activeConfig: accountFromRequest(requestUrl, session)
      });
      return sendJson(res, data);
    }

    if (requestUrl.pathname === '/api/insights/range') {
      return await handleRangeInsights(res, requestUrl, session);
    }

    if (requestUrl.pathname === '/api/live') {
      return await handleLiveStream(req, res, requestUrl, session);
    }

    // Unknown API paths must not fall through to the static handler.
    if (pathname.startsWith('/api/')) return sendJson(res, { error: 'Not found' }, 404);

    return await serveStatic(requestUrl, res);
  } catch (error) {
    // Access denials raised by httpError are expected outcomes - log everything else,
    // including Graph API 4xx failures such as expired tokens.
    if (!error.expected) console.error(error);
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
    if (!adminEnabled()) console.warn('ADMIN_PASSWORD is not set - admin login is disabled.');
    if (!process.env.TOKEN_ENCRYPTION_KEY) console.warn('TOKEN_ENCRYPTION_KEY is not set - access tokens are stored unencrypted.');
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

function getStatusPayload(config = defaultConfig(), session = null) {
  const payload = {
    role: session?.role || '',
    mode: hasCredentials(config) ? 'graph-api' : 'demo',
    graphApiVersion: config.graphApiVersion,
    apiMode: config.apiMode,
    resolvedGraphHost: resolveGraphHost(config),
    hasAccessToken: Boolean(config.accessToken),
    hasInstagramUserId: Boolean(config.instagramUserId),
    // Drives whether the Ads page appears - for clients too.
    hasAds: Boolean(adsGraphConfig(config)),
    instagramUserId: config.instagramUserId,
    username: config.username || '',
    refreshMs: configStore.refreshMs,
    serverTime: new Date().toISOString()
  };
  // Agency-wide facts (how many clients, storage setup) are the admin's business only.
  if (session?.role === 'admin') {
    Object.assign(payload, {
      accountsCount: configStore.accounts.length,
      defaultAccountId: configStore.defaultAccountId,
      supabase: supabaseEnabled(),
      serverless: Boolean(process.env.VERCEL),
      tokenEncryption: Boolean(process.env.TOKEN_ENCRYPTION_KEY)
    });
  }
  return payload;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

// Save the auto-refresh interval so the chosen cadence persists across reloads. It is a
// setting for every viewer, so it is admin-only. Stored in Supabase if configured, else config.json.
async function handleRefreshInterval(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }
  const body = await readJsonBody(req);
  // Fresh read first - this writes the whole store, and a stale copy from another
  // serverless instance would silently clobber accounts saved elsewhere.
  await ensureConfigLoaded(true);
  const refreshMs = clamp(toNumber(body.refreshMs, configStore.refreshMs), 15000, 86400000);
  configStore = { ...configStore, refreshMs };
  const persisted = await saveConfigStore();
  return sendJson(res, { ok: true, refreshMs, persisted });
}

// GET lists accounts (no tokens), POST upserts one account by instagramUserId,
// DELETE ?id= removes one. POST/DELETE need the admin password.
async function handleConfig(req, res, requestUrl) {
  if (req.method === 'GET') {
    return sendJson(res, getConfigPayload());
  }

  if (req.method === 'DELETE') {
    await ensureConfigLoaded(true);
    const id = sanitizeInstagramUserId(requestUrl.searchParams.get('id'));
    const remaining = configStore.accounts.filter((account) => account.instagramUserId !== id);
    if (remaining.length === configStore.accounts.length) {
      return sendJson(res, { error: 'Account not found' }, 404);
    }
    configStore.accounts = remaining;
    if (configStore.defaultAccountId === id) {
      configStore.defaultAccountId = remaining[0]?.instagramUserId || '';
    }
    // No client login may keep pointing at an account that no longer exists.
    configStore.users = configStore.users.map((user) => ({
      ...user,
      accountIds: user.accountIds.filter((accountId) => accountId !== id)
    }));
    clearCache(id);
    const persisted = await saveConfigStore();
    return sendJson(res, { ok: true, config: getConfigPayload(), persisted });
  }

  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const body = await readJsonBody(req);
  await ensureConfigLoaded(true);

  const instagramUserId = sanitizeInstagramUserId(body.instagramUserId || '');
  if (!instagramUserId) {
    return sendJson(res, { error: 'Instagram professional account ID is required' }, 400);
  }

  const existing = configStore.accounts.find((account) => account.instagramUserId === instagramUserId) || null;
  // Editing with a blank token keeps the stored one (same as the old single-account flow).
  const accessToken = normalizeAccessToken(body.accessToken || existing?.accessToken || '');
  if (!accessToken) {
    return sendJson(res, { error: 'Access token is required' }, 400);
  }

  const nextAccount = {
    instagramUserId,
    accessToken,
    username: existing?.username || '',
    label: String(body.label ?? existing?.label ?? '').trim(),
    profilePictureUrl: existing?.profilePictureUrl || '',
    graphApiVersion: normalizeGraphVersion(body.graphApiVersion || existing?.graphApiVersion),
    apiMode: normalizeApiMode(body.apiMode || existing?.apiMode),
    // Editing the Instagram connection never drops its ad account.
    ads: existing?.ads || null
  };

  let validation = null;
  if (body.validate !== false) {
    const account = await graphGet(`/${instagramUserId}`, {
      fields: [
        'id',
        'username',
        'name',
        'profile_picture_url',
        'followers_count',
        'follows_count',
        'media_count'
      ].join(',')
    }, accountConfig(nextAccount));
    const normalized = normalizeAccount(account, nextAccount);
    nextAccount.username = normalized.username;
    nextAccount.profilePictureUrl = normalized.profilePictureUrl;
    validation = { account: normalized };
  }

  if (existing) {
    configStore.accounts = configStore.accounts.map((account) => (
      account.instagramUserId === instagramUserId ? nextAccount : account
    ));
  } else {
    configStore.accounts = [...configStore.accounts, nextAccount];
  }
  if (body.makeDefault || !configStore.defaultAccountId) {
    configStore.defaultAccountId = instagramUserId;
  }
  clearCache(instagramUserId);
  // Persist: Supabase if configured (works on serverless), otherwise local config.json.
  // On a read-only serverless FS with no Supabase, the config still applies in-memory only.
  const persisted = await saveConfigStore();

  return sendJson(res, {
    ok: true,
    config: getConfigPayload(),
    validation,
    persisted
  });
}

async function handleConfigDefault(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }
  const body = await readJsonBody(req);
  await ensureConfigLoaded(true);
  const id = sanitizeInstagramUserId(body.instagramUserId);
  if (!configStore.accounts.some((account) => account.instagramUserId === id)) {
    return sendJson(res, { error: 'Account not found' }, 404);
  }
  configStore.defaultAccountId = id;
  const persisted = await saveConfigStore();
  return sendJson(res, { ok: true, config: getConfigPayload(), persisted });
}

async function handleConfigDiscover(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const body = await readJsonBody(req);

  const fallback = defaultConfig();
  const accessToken = normalizeAccessToken(body.accessToken || fallback.accessToken || '');
  const graphApiVersion = normalizeGraphVersion(body.graphApiVersion || fallback.graphApiVersion);
  const apiMode = normalizeApiMode(body.apiMode || fallback.apiMode);

  if (!accessToken) {
    return sendJson(res, { error: 'Access token is required to discover accounts' }, 400);
  }

  const discoveryConfig = {
    ...fallback,
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
    mode: configStore.accounts.length ? 'graph-api' : 'demo',
    refreshMs: configStore.refreshMs,
    defaultAccountId: configStore.defaultAccountId,
    accounts: configStore.accounts.map((account) => ({
      instagramUserId: account.instagramUserId,
      username: account.username,
      label: account.label,
      profilePictureUrl: account.profilePictureUrl,
      graphApiVersion: account.graphApiVersion,
      apiMode: account.apiMode,
      resolvedGraphHost: resolveGraphHost(account),
      tokenPreview: account.accessToken ? 'token set' : '',
      // Never the ads token itself.
      ads: account.ads ? {
        adAccountId: account.ads.adAccountId,
        name: account.ads.name,
        currency: account.ads.currency,
        tokenSource: account.ads.accessToken ? 'own' : 'account'
      } : null
    })),
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

// Public list for the dashboard's account switcher - ids and labels only, never tokens.
function getAccountsPayload(session) {
  const accounts = allowedAccounts(session);
  return {
    // A client's "default" is their own first account, never the agency default.
    defaultId: session.role === 'admin' ? configStore.defaultAccountId : (accounts[0]?.instagramUserId || ''),
    accounts: accounts.map((account) => ({
      id: account.instagramUserId,
      username: account.username,
      label: account.label,
      profilePictureUrl: account.profilePictureUrl
    }))
  };
}

// Overview cards: one cheap profile call per account (cached ~5 min) plus the latest
// persisted daily snapshot - no media/insights crawl, so it stays fast on serverless.
async function handleAccountsSummary(res, session) {
  await syncHistoryFromSupabase();
  const cards = await Promise.all(allowedAccounts(session).map(async (account) => {
    const card = {
      id: account.instagramUserId,
      username: account.username,
      label: account.label,
      profilePictureUrl: account.profilePictureUrl,
      snapshot: latestHistorySummary(account.instagramUserId)
    };
    try {
      const profile = await fetchProfile(accountConfig(account));
      card.username = profile.username;
      card.name = profile.name;
      card.profilePictureUrl = profile.profilePictureUrl;
      card.followers = profile.followers;
      card.mediaCount = profile.mediaCount;
    } catch (error) {
      card.error = error.message || 'Unable to reach the Graph API for this account.';
    }
    return card;
  }));
  return sendJson(res, {
    mode: cards.length ? 'graph-api' : 'demo',
    defaultId: session.role === 'admin' ? configStore.defaultAccountId : (cards[0]?.id || ''),
    accounts: cards
  });
}

async function fetchProfile(activeConfig) {
  const id = activeConfig.instagramUserId;
  const cached = profileCache.get(id);
  if (cached && cached.until > Date.now()) return cached.value;

  const account = await graphGet(`/${id}`, {
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
  const value = normalizeAccount(account, activeConfig);
  profileCache.set(id, { value, until: Date.now() + 5 * 60 * 1000 });
  return value;
}

// Latest daily snapshot + day-over-day follower change for one account's overview card.
function latestHistorySummary(accountId) {
  const history = metricsHistory[accountId] || {};
  const dates = Object.keys(history).sort();
  const latest = dates.length ? history[dates[dates.length - 1]].last : null;
  if (!latest) return null;
  const prev = dates.length > 1 ? history[dates[dates.length - 2]].last : null;
  return {
    at: latest.at,
    views: latest.views,
    reach: latest.reach,
    interactions: latest.interactions,
    likes: latest.likes,
    items: latest.items,
    followers: latest.followers,
    followerDayNet: prev && typeof prev.followers === 'number' ? latest.followers - prev.followers : null
  };
}

async function handleLiveStream(req, res, requestUrl, session) {
  const activeConfig = accountFromRequest(requestUrl, session);
  const intervalMs = clamp(toNumber(requestUrl.searchParams.get('interval'), configStore.refreshMs), 15000, 86400000);
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
      const data = await getDashboardData({ limit, allMedia, force: !firstSend, activeConfig });
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

async function getDashboardData({ limit = 500, allMedia = true, force = false, activeConfig = null } = {}) {
  await ensureConfigLoaded();
  const config = activeConfig || defaultConfig();
  const cacheKey = `${config.instagramUserId || 'demo'}:${limit}:${allMedia ? 'all' : 'recent'}`;
  // Without force (a plain page load), return the last computed data regardless of age -
  // a real sync only happens on the manual button or the scheduled poll (force=1).
  if (!force && dashboardCache.has(cacheKey)) {
    return dashboardCache.get(cacheKey);
  }

  const data = hasCredentials(config)
    ? await getGraphDashboardData({ limit, allMedia }, config)
    : getDemoDashboardData(limit);

  dashboardCache.set(cacheKey, data);
  return data;
}

async function getGraphDashboardData({ limit = 500, allMedia = true } = {}, activeConfig = defaultConfig()) {
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

  const previousMap = previousContentMetrics.get(activeConfig.instagramUserId) || new Map();
  const content = mediaResponse.media.map((media, index) => normalizeContent(media, insightResults[index] || {}, previousMap));

  // Pull the persisted daily snapshots (Supabase) before composing, so day-over-day
  // deltas + follower trend survive serverless cold starts. No-op without Supabase.
  await syncHistoryFromSupabase();

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
  previousContentMetrics.set(activeConfig.instagramUserId, new Map(dashboard.content.map((item) => [item.id, pickComparableMetrics(item)])));
  [dashboard.audience, dashboard.accountInsights, dashboard.summary.followerTrend] = await Promise.all([
    fetchAudience(activeConfig),
    fetchAccountInsights(activeConfig),
    fetchFollowerGrowth(activeConfig, dashboard.account)
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
  const cached = audienceCache.get(activeConfig.instagramUserId);
  if (cached && cached.until > now) {
    return cached.value;
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

  audienceCache.set(activeConfig.instagramUserId, { value: result, until: now + 30 * 60 * 1000 });
  return result;
}

const ACCOUNT_WINDOW_METRICS = ['views', 'reach', 'total_interactions', 'accounts_engaged', 'profile_views'];

// Totals over a window. One combined call; fall back to per-metric so a single
// unsupported metric never blanks the whole window.
async function accountTotals(id, { since, until }, activeConfig) {
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
      metric: ACCOUNT_WINDOW_METRICS.join(','), period: 'day', metric_type: 'total_value', since, until
    }, activeConfig);
    const map = read(response.data);
    if (Object.keys(map).length) return map;
  } catch {
    // fall through to per-metric
  }
  const map = {};
  await Promise.all(ACCOUNT_WINDOW_METRICS.map(async (metric) => {
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
}

// Reach split into FOLLOWER vs NON_FOLLOWER for the same window.
async function accountFollowType(id, { since, until }, activeConfig) {
  try {
    const response = await graphGet(`/${id}/insights`, {
      metric: 'reach', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', since, until
    }, activeConfig);
    return parseDemographic(response.data || []);
  } catch {
    return {};
  }
}

// Account-level metrics that accept a since/until range, plus the reach split by
// follow_type (followers vs non-followers). All windowable and real - the dashboard
// uses these so the headline numbers can react to a date range honestly, instead of
// only summing the posts currently loaded. Cached ~30 min like fetchAudience.
async function fetchAccountInsights(activeConfig) {
  const now = Date.now();
  const cached = accountInsightsCache.get(activeConfig.instagramUserId);
  if (cached && cached.until > now) {
    return cached.value;
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
  const DAILY_PERFORMANCE_METRICS = ['views', 'reach', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_views'];
  const DAILY_PRODUCT_METRICS = ['views', 'reach', 'total_interactions', 'likes', 'comments', 'shares', 'saves'];
  const DAILY_HISTORY_DAYS = 90;

  const totalsFor = (range) => accountTotals(id, range, activeConfig);
  const followTypeFor = (range) => accountFollowType(id, range, activeConfig);

  const dailyReachFor = async (days = 90) => {
    try {
      const response = await graphGet(`/${id}/insights`, {
        metric: 'reach',
        period: 'day',
        metric_type: 'time_series',
        since: nowSec - days * DAY,
        until: nowSec
      }, activeConfig);
      const series = parseInsightTimeSeries(response.data || [], 'reach');
      return series.length
        ? { available: true, days, series }
        : { available: false, reason: 'Meta returned no daily reach rows for this account.' };
    } catch (error) {
      return { available: false, reason: error.message || 'Daily reach is unavailable.' };
    }
  };

  const monthlyReachFor = async (count = 12) => {
    const windows = calendarMonthWindows(count);
    const series = [];
    await Promise.all(windows.map(async (window) => {
      try {
        const response = await graphGet(`/${id}/insights`, {
          metric: 'reach',
          period: 'day',
          metric_type: 'total_value',
          since: window.since,
          until: window.until
        }, activeConfig);
        const row = (response.data || []).find((item) => item.name === 'reach');
        const value = row?.total_value?.value;
        if (typeof value === 'number') {
          series.push({ ...window, value });
        }
      } catch {
        // Skip a month if Meta declines that specific range.
      }
    }));
    series.sort((a, b) => a.key.localeCompare(b.key));
    return series.length
      ? { available: true, months: count, series }
      : { available: false, reason: 'Meta returned no monthly reach totals for this account.' };
  };

  // One total_value call per week window, like monthlyReachFor - a true unique-accounts
  // reach per week instead of summing daily reach across repeat viewers.
  const weeklyReachFor = async (count = 12) => {
    const windows = calendarWeekWindows(count);
    const series = [];
    await Promise.all(windows.map(async (window) => {
      try {
        const response = await graphGet(`/${id}/insights`, {
          metric: 'reach',
          period: 'day',
          metric_type: 'total_value',
          since: window.since,
          until: window.until
        }, activeConfig);
        const row = (response.data || []).find((item) => item.name === 'reach');
        const value = row?.total_value?.value;
        if (typeof value === 'number') {
          series.push({ ...window, value });
        }
      } catch {
        // Skip a week if Meta declines that specific range.
      }
    }));
    series.sort((a, b) => a.key.localeCompare(b.key));
    return series.length
      ? { available: true, weeks: count, series }
      : { available: false, reason: 'Meta returned no weekly reach totals for this account.' };
  };

  const dailyPerformanceFor = async (dailyReach, days = 90) => {
    const reachSeries = (dailyReach?.series || [])
      .filter((point) => point.endTime && point.date)
      .sort((a, b) => a.endTime.localeCompare(b.endTime));

    if (reachSeries.length < 2) {
      return { available: false, reason: 'Daily performance needs at least two Meta reach buckets to build exact one-day windows.' };
    }

    const startIndex = Math.max(1, reachSeries.length - days);
    const windows = reachSeries.slice(startIndex).map((point, offset) => {
      const previous = reachSeries[startIndex + offset - 1];
      return {
        point,
        since: Math.floor(new Date(previous.endTime).getTime() / 1000) + 1,
        until: Math.floor(new Date(point.endTime).getTime() / 1000)
      };
    }).filter((window) => Number.isFinite(window.since) && Number.isFinite(window.until) && window.since <= window.until);

    const series = await mapLimit(windows, 4, async ({ point, since, until }) => {
      try {
        const [totalsResponse, productResponse] = await Promise.all([
          graphGet(`/${id}/insights`, {
            metric: DAILY_PERFORMANCE_METRICS.join(','),
            period: 'day',
            metric_type: 'total_value',
            since,
            until
          }, activeConfig),
          graphGet(`/${id}/insights`, {
            metric: DAILY_PRODUCT_METRICS.join(','),
            period: 'day',
            metric_type: 'total_value',
            breakdown: 'media_product_type',
            since,
            until
          }, activeConfig)
        ]);

        const rawTotals = parseInsightTotals(totalsResponse.data || []);
        const metrics = normalizeAccountMetrics(rawTotals);
        if (typeof rawTotals.reach !== 'number') metrics.reach = toNumber(point.value, 0);

        return {
          date: point.date,
          endTime: point.endTime,
          since,
          until,
          metrics,
          byProduct: parseProductMetricBreakdowns(productResponse.data || [])
        };
      } catch {
        return null;
      }
    });

    const cleanSeries = series
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    return cleanSeries.length
      ? { available: true, days, series: cleanSeries }
      : { available: false, reason: 'Meta returned no daily account performance totals for this account.' };
  };

  try {
    const byWindow = {};
    const reachByFollowType = {};
    const windowTask = Promise.all(WINDOWS.map(async (w) => {
      const range = { since: nowSec - w.days * DAY, until: nowSec };
      const [totals, followType] = await Promise.all([totalsFor(range), followTypeFor(range)]);
      if (Object.keys(totals).length) byWindow[w.key] = totals;
      if (Object.keys(followType).length) reachByFollowType[w.key] = followType;
    }));
    const dailyReachTask = dailyReachFor(DAILY_HISTORY_DAYS + 1);
    const weeklyReachTask = weeklyReachFor(12);
    const monthlyReachTask = monthlyReachFor(12);

    await windowTask;
    const dailyReach = await dailyReachTask;
    const dailyPerformanceTask = dailyPerformanceFor(dailyReach, DAILY_HISTORY_DAYS);
    const [dailyPerformance, weeklyReach, monthlyReach] = await Promise.all([dailyPerformanceTask, weeklyReachTask, monthlyReachTask]);

    const windows = WINDOWS.filter((w) => byWindow[w.key]);
    const defaultWindow = (windows.find((w) => w.key === 'last_30_days') || windows[windows.length - 1])?.key || null;
    const result = windows.length || dailyReach.available || weeklyReach.available || monthlyReach.available || dailyPerformance.available
      ? {
        available: true,
        windows: windows.map((w) => ({ key: w.key, label: w.label })),
        defaultWindow,
        byWindow,
        reachByFollowType,
        dailyPerformance,
        dailyReach,
        weeklyReach,
        monthlyReach
      }
      : { available: false, reason: 'Account-level insights are unavailable for this account or API version.' };

    accountInsightsCache.set(id, { value: result, until: now + 30 * 60 * 1000 });
    return result;
  } catch (error) {
    return { available: false, reason: error.message || 'Account-level insights are unavailable.' };
  }
}

async function fetchFollowerGrowth(activeConfig, account, days = 90) {
  const now = Date.now();
  const cached = followerGrowthCache.get(activeConfig.instagramUserId);
  if (cached && cached.until > now) {
    return cached.value;
  }

  const id = activeConfig.instagramUserId;
  const DAY = 86400;
  const nowSec = Math.floor(now / 1000);

  try {
    const followerResponse = await graphGet(`/${id}/insights`, {
      metric: 'follower_count',
      period: 'day',
      metric_type: 'time_series',
      since: nowSec - (days + 1) * DAY,
      until: nowSec
    }, activeConfig);

    const rows = parseInsightTimeSeries(followerResponse.data || [], 'follower_count')
      .filter((point) => point.endTime && point.date)
      .sort((a, b) => a.endTime.localeCompare(b.endTime));

    if (rows.length < 2) {
      return { available: false, source: 'graph-api', reason: 'Meta returned too few follower_count rows for a daily follower chart.', dayNet: 0, weekNet: 0, series: [] };
    }

    const startIndex = Math.max(1, rows.length - days);
    const windows = rows.slice(startIndex).map((point, offset) => {
      const previous = rows[startIndex + offset - 1];
      return {
        point,
        since: Math.floor(new Date(previous.endTime).getTime() / 1000) + 1,
        until: Math.floor(new Date(point.endTime).getTime() / 1000)
      };
    }).filter((window) => Number.isFinite(window.since) && Number.isFinite(window.until) && window.since <= window.until);

    const movementRows = await mapLimit(windows, 4, async ({ point, since, until }) => {
      let split = {};
      try {
        const response = await graphGet(`/${id}/insights`, {
          metric: 'follows_and_unfollows',
          period: 'day',
          metric_type: 'total_value',
          breakdown: 'follow_type',
          since,
          until
        }, activeConfig);
        split = parseDemographic(response.data || []);
      } catch {
        split = {};
      }

      const gained = toNumber(point.value, 0);
      const lost = toNumber(split.NON_FOLLOWER, 0);
      return {
        date: point.date,
        endTime: point.endTime,
        gained,
        lost,
        net: gained - lost,
        followers: null
      };
    });

    const series = movementRows
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!series.length) {
      return { available: false, source: 'graph-api', reason: 'Meta returned no daily follower movement rows.', dayNet: 0, weekNet: 0, series: [] };
    }

    // This window always ends today, so there is no movement after it to unwind.
    anchorFollowerSeries(series, account.followers, 0);

    const dayNet = series[series.length - 1]?.net || 0;
    const week = series.slice(-7);
    const weekNet = week.reduce((sum, point) => sum + point.net, 0);
    const gainedWeek = week.reduce((sum, point) => sum + point.gained, 0);
    const lostWeek = week.reduce((sum, point) => sum + point.lost, 0);
    const totalGained = series.reduce((sum, point) => sum + point.gained, 0);
    const totalLost = series.reduce((sum, point) => sum + point.lost, 0);
    const result = {
      available: true,
      source: 'graph-api',
      days,
      estimatedTotals: true,
      currentFollowers: toNumber(account.followers, 0),
      dayNet,
      weekNet,
      gainedWeek,
      lostWeek,
      totalGained,
      totalLost,
      rangeNet: totalGained - totalLost,
      series
    };

    followerGrowthCache.set(id, { value: result, until: now + 30 * 60 * 1000 });
    return result;
  } catch (error) {
    return { available: false, source: 'graph-api', reason: error.message || 'Daily follower movement is unavailable.', dayNet: 0, weekNet: 0, series: [] };
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

function parseInsightTimeSeries(data, metric) {
  const row = (data || []).find((item) => item.name === metric);
  return (row?.values || [])
    .map((point) => {
      const endTime = typeof point.end_time === 'string' ? point.end_time : '';
      const date = endTime.slice(0, 10);
      return {
        date,
        value: toNumber(point.value, null),
        endTime: endTime || null
      };
    })
    .filter((point) => point.date && point.value !== null);
}

// On-demand historical ranges.
//
// Meta only serves reach as a time series - views, interactions, likes, saves and the
// product split are total_value-only, so a day-by-day series costs one Graph call per day.
// Pre-fetching a year would be ~700 calls per refresh, so an arbitrary range is bucketed
// instead: the wider the span, the coarser the bucket, and the call count stays bounded.
const RANGE_GRANULARITIES = [
  { key: 'day', maxDays: 31 },
  { key: 'week', maxDays: 182 },
  { key: 'month', maxDays: Infinity }
];
const RANGE_MAX_BUCKETS = 40;
// Instagram rejects `since` older than ~2 years, matching the 728-day "All time" window.
const RANGE_MAX_LOOKBACK_DAYS = 728;
const rangeInsightsCache = new Map(); // `${accountId}:${kind}:${since}:${until}` -> { value, expires }

const utcDayKey = (date) => date.toISOString().slice(0, 10);

export function rangeWindows(sinceSec, untilSec) {
  if (!Number.isFinite(sinceSec) || !Number.isFinite(untilSec) || sinceSec > untilSec) {
    throw new Error('Invalid range: since must be on or before until.');
  }
  const spanDays = Math.floor((untilSec - sinceSec) / 86400) + 1;
  const granularity = RANGE_GRANULARITIES.find((entry) => spanDays <= entry.maxDays).key;
  const end = new Date(untilSec * 1000);
  const first = new Date(sinceSec * 1000);

  let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  if (granularity === 'week') cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  if (granularity === 'month') cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));

  const windows = [];
  while (cursor <= end && windows.length < RANGE_MAX_BUCKETS) {
    const next = new Date(cursor);
    if (granularity === 'day') next.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularity === 'week') next.setUTCDate(cursor.getUTCDate() + 7);
    else next.setUTCMonth(cursor.getUTCMonth() + 1);

    const since = Math.max(sinceSec, Math.floor(cursor.getTime() / 1000));
    const until = Math.min(untilSec, Math.floor((next.getTime() - 1000) / 1000));
    windows.push({
      key: granularity === 'month' ? utcDayKey(cursor).slice(0, 7) : utcDayKey(cursor),
      label: rangeBucketLabel(cursor, granularity),
      startDate: utcDayKey(new Date(since * 1000)),
      endDate: utcDayKey(new Date(until * 1000)),
      since,
      until
    });
    cursor = next;
  }
  return { granularity, windows };
}

function rangeBucketLabel(date, granularity) {
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  }
  const short = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  return granularity === 'week' ? `Wk of ${short}` : short;
}

// ponytail: no media_product_type breakdown for on-demand ranges - it doubles the call count
// and the tooltip already renders "Product split: Unavailable". To add it, issue a second
// accountTotals with breakdown: 'media_product_type' when granularity === 'day'.
async function fetchRangeInsights(activeConfig, { since, until }) {
  const id = activeConfig.instagramUserId;
  const { granularity, windows } = rangeWindows(since, until);

  let firstError = '';
  const buckets = await mapLimit(windows, 4, async (window) => {
    try {
      const totals = await accountTotals(id, { since: window.since, until: window.until }, activeConfig);
      if (!Object.keys(totals).length) return null;
      return {
        date: window.key,
        key: window.key,
        label: window.label,
        startDate: window.startDate,
        endDate: window.endDate,
        metrics: normalizeAccountMetrics(totals),
        byProduct: {}
      };
    } catch (error) {
      firstError = firstError || error.message || '';
      return null;
    }
  });

  const series = buckets.filter(Boolean);
  if (!series.length) {
    // accountTotals swallows per-metric failures, so ask Meta once more without a net and
    // surface its own wording - a generic "no data" hides an expired token or a metric the
    // account cannot read.
    if (!firstError) {
      try {
        await graphGet(`/${id}/insights`, {
          metric: 'views', period: 'day', metric_type: 'total_value', since, until
        }, activeConfig);
      } catch (error) {
        firstError = error.message || '';
      }
    }
    return {
      available: false,
      granularity,
      series: [],
      reason: firstError || 'Meta returned no account totals for this date range.'
    };
  }

  const [totals, followType] = await Promise.all([
    accountTotals(id, { since, until }, activeConfig).catch(() => ({})),
    accountFollowType(id, { since, until }, activeConfig).catch(() => ({}))
  ]);

  return {
    available: true,
    granularity,
    series,
    totals: normalizeAccountMetrics(totals),
    reachByFollowType: followType
  };
}

// follower_count is a time series, so one call covers the whole span; only the unfollow
// split needs a call per bucket.
// Instagram never returns a historical follower total - only daily movement - so every
// total is today's count walked backwards: first past the movement that happened after the
// range ended (tailNet), then bucket by bucket through the range itself. Mutates `series`,
// setting each bucket's end-of-bucket total, and returns the totals at both ends.
export function anchorFollowerSeries(series, currentFollowers, tailNet = 0) {
  let running = toNumber(currentFollowers, 0) - toNumber(tailNet, 0);
  const endFollowers = running;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    series[index].followers = running;
    running -= toNumber(series[index].net, 0);
  }
  return { endFollowers, startFollowers: running };
}

// Total unfollows over one window. Meta answers this for any span in a single
// total_value call, so a whole-period total costs one call, not one per bucket.
async function unfollowsFor(id, { since, until }, activeConfig) {
  const response = await graphGet(`/${id}/insights`, {
    metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value',
    breakdown: 'follow_type', since, until
  }, activeConfig);
  return toNumber(parseDemographic(response.data || []).NON_FOLLOWER, 0);
}

async function fetchRangeFollowers(activeConfig, account, { since, until }) {
  const id = activeConfig.instagramUserId;
  const nowSec = Math.floor(Date.now() / 1000);
  const { granularity, windows } = rangeWindows(since, until);
  const currentFollowers = toNumber(account?.followers, 0);

  // Meta only reports follower movement, never a historical total. The only anchor is
  // today's count, so gained/lost is fetched from the range start all the way to now and
  // the movement after the range is subtracted back off. One time_series call covers the
  // whole span, so the reach-back is free here and costs one extra call for the tail.
  let dailyGained = [];
  try {
    const response = await graphGet(`/${id}/insights`, {
      metric: 'follower_count', period: 'day', metric_type: 'time_series',
      since, until: Math.max(until, nowSec)
    }, activeConfig);
    dailyGained = parseInsightTimeSeries(response.data || [], 'follower_count');
  } catch (error) {
    return { available: false, granularity, series: [], reason: error.message || 'Daily follower movement is unavailable for this range.' };
  }

  if (!dailyGained.length) {
    return { available: false, granularity, series: [], reason: 'Meta returned no follower_count rows for this date range.' };
  }

  const gainedBetween = (startDate, endDate) => dailyGained
    .filter((point) => point.date >= startDate && point.date <= endDate)
    .reduce((sum, point) => sum + toNumber(point.value, 0), 0);

  let lostFailures = 0;
  const buckets = await mapLimit(windows, 4, async (window) => {
    let lost = 0;
    try {
      lost = await unfollowsFor(id, { since: window.since, until: window.until }, activeConfig);
    } catch {
      lostFailures += 1;
    }
    const gained = gainedBetween(window.startDate, window.endDate);
    return {
      date: window.key, key: window.key, label: window.label,
      startDate: window.startDate, endDate: window.endDate,
      gained, lost, net: gained - lost, followers: null
    };
  });

  const series = buckets.filter(Boolean);
  if (!series.length) {
    return { available: false, granularity, series: [], reason: 'Meta returned no follower movement for this date range.' };
  }

  // Net movement between the end of the range and today. Without this the last bucket
  // would be handed today's follower count, which is wrong for any historical range.
  const rangeEndDate = series[series.length - 1].endDate;
  const todayDate = new Date(nowSec * 1000).toISOString().slice(0, 10);
  let tailNet = 0;
  let tailKnown = true;
  if (rangeEndDate < todayDate) {
    const tailFrom = new Date(Date.parse(`${rangeEndDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    let tailLost = 0;
    try {
      tailLost = await unfollowsFor(id, { since: until + 1, until: nowSec }, activeConfig);
    } catch {
      tailKnown = false;
    }
    tailNet = gainedBetween(tailFrom, todayDate) - tailLost;
  }

  const { endFollowers, startFollowers } = anchorFollowerSeries(series, currentFollowers, tailNet);

  const totalGained = series.reduce((sum, point) => sum + point.gained, 0);
  const totalLost = series.reduce((sum, point) => sum + point.lost, 0);
  return {
    available: true,
    granularity,
    series,
    totalGained,
    totalLost,
    rangeNet: totalGained - totalLost,
    // Followers at the end of the selected range, and just before it started.
    endFollowers,
    startFollowers,
    endDate: rangeEndDate,
    startDate: series[0].startDate,
    currentFollowers,
    // False when Meta declined an unfollow call, so "lost" is understated for that span.
    lostComplete: lostFailures === 0 && tailKnown,
    estimatedTotals: true
  };
}

// ---------------------------------------------------------------------------
// Meta Ads (Marketing API)
//
// Unlike Instagram insights, ad insights take any time_range in one call, so a range costs
// four calls however long it is. Needs a graph.facebook.com token with ads_read -
// Instagram-login (IG...) tokens can't reach the Marketing API.
// ---------------------------------------------------------------------------

// Meta keeps ad insights for 37 months.
const ADS_MAX_LOOKBACK_DAYS = 1120;
const ADS_ACTION_LABELS = {
  link_click: 'Link clicks',
  landing_page_view: 'Landing page views',
  lead: 'Leads',
  purchase: 'Purchases',
  omni_purchase: 'Purchases',
  add_to_cart: 'Adds to cart',
  initiate_checkout: 'Checkouts started',
  complete_registration: 'Registrations',
  post_engagement: 'Post engagements',
  page_engagement: 'Page engagements',
  post_reaction: 'Reactions',
  comment: 'Comments',
  post: 'Shares',
  onsite_conversion_post_save: 'Saves',
  video_view: 'Video plays (3s)',
  like: 'Page likes',
  follow: 'Follows',
  'onsite_conversion.messaging_conversation_started_7d': 'Messaging conversations',
  'onsite_conversion.lead_grouped': 'On-Facebook leads',
  'offsite_conversion.fb_pixel_purchase': 'Website purchases',
  'offsite_conversion.fb_pixel_lead': 'Website leads'
};
const ADS_POSITION_LABELS = {
  feed: 'Feed',
  instagram_stories: 'Stories',
  instagram_reels: 'Reels',
  instagram_explore: 'Explore',
  instagram_explore_grid_home: 'Explore home',
  instagram_profile_feed: 'Profile feed',
  instagram_search: 'Search results',
  facebook_reels: 'Reels',
  facebook_stories: 'Stories',
  marketplace: 'Marketplace',
  video_feeds: 'Video feeds',
  right_hand_column: 'Right column',
  search: 'Search results',
  an_classic: 'Audience Network'
};
const ADS_PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  threads: 'Threads'
};

const humanize = (key) => String(key || 'unknown')
  .replace(/^offsite_conversion\.fb_pixel_|^onsite_conversion\./, '')
  .replace(/[._]+/g, ' ')
  .replace(/^\w/, (letter) => letter.toUpperCase());

// Marketing API returns every metric as a string.
const adsNumber = (value) => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
};

// Daily for up to ~3 months, weekly up to a year, monthly beyond - one call either way,
// this only keeps the chart readable.
export function adsIncrementFor(sinceKey, untilKey) {
  const days = Math.round((Date.parse(`${untilKey}T00:00:00Z`) - Date.parse(`${sinceKey}T00:00:00Z`)) / 86400000) + 1;
  if (days <= 92) return 1;
  if (days <= 365) return 7;
  return 'monthly';
}

function adsActions(row) {
  const costs = new Map((row.cost_per_action_type || []).map((entry) => [entry.action_type, adsNumber(entry.value)]));
  return (row.actions || [])
    .map((entry) => ({
      type: entry.action_type,
      label: ADS_ACTION_LABELS[entry.action_type] || humanize(entry.action_type),
      value: adsNumber(entry.value),
      costPer: costs.has(entry.action_type) ? costs.get(entry.action_type) : null
    }))
    .filter((action) => action.value > 0)
    .sort((a, b) => b.value - a.value);
}

function adsSeriesLabel(row, increment) {
  const start = new Date(`${row.date_start}T00:00:00Z`);
  if (increment === 'monthly') {
    return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(start);
  }
  const short = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(start);
  return increment === 1 ? short : `Wk of ${short}`;
}

// Turns the four raw Marketing API responses into the dashboard's shape. Accuracy rules:
// reach and frequency come only from the whole-range totals row (daily reach is per-day
// unique and can't be added up); CTR/CPC/CPM are Meta's own totals, never averaged across
// rows; placement rows add up spend/impressions/clicks only, because reach per position
// double-counts people seen in more than one position.
export function summarizeAdsInsights({ totalsRows, seriesRows, campaignRows, placementRows, increment, currency }) {
  const total = totalsRows[0] || {};
  const totals = {
    spend: adsNumber(total.spend),
    impressions: adsNumber(total.impressions),
    reach: adsNumber(total.reach),
    frequency: adsNumber(total.frequency),
    clicks: adsNumber(total.clicks),
    linkClicks: adsNumber(total.inline_link_clicks),
    ctr: adsNumber(total.ctr),
    cpc: adsNumber(total.cpc),
    cpm: adsNumber(total.cpm)
  };

  const series = seriesRows
    // A row without a usable date can't be placed on the chart - and formatting it would
    // throw and take the whole ads response down with it.
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date_start || '')))
    .map((row) => ({
      key: increment === 'monthly' ? String(row.date_start).slice(0, 7) : row.date_start,
      label: adsSeriesLabel(row, increment),
      startDate: row.date_start,
      endDate: row.date_stop,
      metrics: {
        spend: adsNumber(row.spend),
        impressions: adsNumber(row.impressions),
        clicks: adsNumber(row.clicks),
        linkClicks: adsNumber(row.inline_link_clicks)
      }
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const campaigns = campaignRows
    .map((row) => ({
      id: row.campaign_id,
      name: row.campaign_name || row.campaign_id,
      objective: humanize(String(row.objective || '').replace(/^OUTCOME_/, '').toLowerCase()),
      spend: adsNumber(row.spend),
      impressions: adsNumber(row.impressions),
      reach: adsNumber(row.reach),
      clicks: adsNumber(row.clicks),
      ctr: adsNumber(row.ctr),
      cpc: adsNumber(row.cpc),
      cpm: adsNumber(row.cpm),
      topAction: adsActions(row)[0] || null
    }))
    .sort((a, b) => b.spend - a.spend);

  const platformMap = new Map();
  const instagramPositions = [];
  for (const row of placementRows) {
    const platform = row.publisher_platform || 'unknown';
    const entry = platformMap.get(platform) || {
      platform,
      label: ADS_PLATFORM_LABELS[platform] || humanize(platform),
      spend: 0,
      impressions: 0,
      clicks: 0
    };
    entry.spend += adsNumber(row.spend);
    entry.impressions += adsNumber(row.impressions);
    entry.clicks += adsNumber(row.clicks);
    platformMap.set(platform, entry);
    if (platform === 'instagram') {
      instagramPositions.push({
        position: row.platform_position,
        label: ADS_POSITION_LABELS[row.platform_position] || humanize(row.platform_position),
        spend: adsNumber(row.spend),
        impressions: adsNumber(row.impressions),
        clicks: adsNumber(row.clicks)
      });
    }
  }

  return {
    currency: currency || '',
    granularity: increment === 1 ? 'day' : (increment === 7 ? 'week' : 'month'),
    totals,
    actions: adsActions(total).slice(0, 6),
    series,
    campaigns,
    platforms: [...platformMap.values()].sort((a, b) => b.spend - a.spend),
    instagramPositions: instagramPositions.sort((a, b) => b.spend - a.spend),
    // Nothing ran in this range - a real answer, not an error.
    empty: totals.impressions === 0 && totals.spend === 0
  };
}

// Follows paging cursors so long ranges or many campaigns aren't silently truncated.
async function graphGetAll(edge, params, activeConfig, maxPages = 10) {
  const rows = [];
  let after = '';
  for (let page = 0; page < maxPages; page += 1) {
    const response = await graphGet(edge, after ? { ...params, after } : params, activeConfig);
    rows.push(...(response.data || []));
    after = response.paging?.next ? response.paging?.cursors?.after : '';
    if (!after) break;
  }
  return rows;
}

// The token ads calls use: the dedicated ads token, else the account's own token when that
// is already a Facebook-host token. Always graph.facebook.com.
function adsGraphConfig(account) {
  const ads = account?.ads;
  if (!ads?.adAccountId) return null;
  const fallback = resolveGraphHost(account) === 'graph.facebook.com' ? account.accessToken : '';
  const accessToken = ads.accessToken || fallback;
  if (!accessToken) return null;
  return { accessToken, graphApiVersion: account.graphApiVersion || 'v23.0', apiMode: 'facebook' };
}

async function fetchAdsInsights(account, { sinceKey, untilKey }) {
  const graphConfig = adsGraphConfig(account);
  if (!graphConfig) {
    return { available: false, noAds: true, reason: 'No ad account is connected to this Instagram account yet.' };
  }
  const edge = `/${account.ads.adAccountId}/insights`;
  const common = { time_range: JSON.stringify({ since: sinceKey, until: untilKey }), limit: 500 };
  const increment = adsIncrementFor(sinceKey, untilKey);
  const actionFields = 'actions,cost_per_action_type';

  try {
    const [totalsRows, seriesRows, campaignRows, placementRows] = await Promise.all([
      graphGetAll(edge, {
        ...common, level: 'account',
        fields: `spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,${actionFields}`
      }, graphConfig),
      graphGetAll(edge, {
        ...common, level: 'account', time_increment: increment,
        fields: 'spend,impressions,clicks,inline_link_clicks'
      }, graphConfig),
      graphGetAll(edge, {
        ...common, level: 'campaign',
        fields: `campaign_id,campaign_name,objective,spend,impressions,reach,clicks,ctr,cpc,cpm,${actionFields}`
      }, graphConfig),
      graphGetAll(edge, {
        ...common, level: 'account', breakdowns: 'publisher_platform,platform_position',
        fields: 'spend,impressions,clicks'
      }, graphConfig)
    ]);
    return {
      available: true,
      adAccount: { id: account.ads.adAccountId, name: account.ads.name || '', timezoneName: account.ads.timezoneName || '' },
      ...summarizeAdsInsights({ totalsRows, seriesRows, campaignRows, placementRows, increment, currency: account.ads.currency })
    };
  } catch (error) {
    // Meta's own wording (e.g. missing ads_read, expired token) beats a generic message.
    return { available: false, reason: error.message || 'Meta declined the ads insights request.' };
  }
}

// POST /api/config/ads {instagramUserId, adAccountId, accessToken?} attaches an ad account to
// an Instagram account; DELETE ?id=<instagramUserId> detaches it. Separate from saving the
// Instagram connection, so an expired Instagram token never blocks connecting ads.
async function handleAdsConfig(req, res, requestUrl) {
  await ensureConfigLoaded(true);

  if (req.method === 'DELETE') {
    const id = sanitizeInstagramUserId(requestUrl.searchParams.get('id'));
    const account = configStore.accounts.find((entry) => entry.instagramUserId === id);
    if (!account) return sendJson(res, { error: 'Account not found' }, 404);
    configStore.accounts = configStore.accounts.map((entry) => (entry === account ? { ...entry, ads: null } : entry));
    const persisted = await saveConfigStore();
    return sendJson(res, { ok: true, config: getConfigPayload(), persisted });
  }

  if (req.method !== 'POST') return sendJson(res, { error: 'Method not allowed' }, 405);
  const body = await readJsonBody(req);
  const account = configStore.accounts.find((entry) => entry.instagramUserId === sanitizeInstagramUserId(body.instagramUserId));
  if (!account) return sendJson(res, { error: 'Pick the Instagram account these ads belong to.' }, 400);

  const adAccountId = normalizeAdAccountId(body.adAccountId);
  if (!adAccountId) return sendJson(res, { error: 'Ad account ID is required (e.g. act_1234567890).' }, 400);

  // Blank token field keeps the stored ads token, like the Instagram token field does.
  const accessToken = normalizeAccessToken(body.accessToken || account.ads?.accessToken || '');
  const candidate = { ...account, ads: { adAccountId, accessToken } };
  const graphConfig = adsGraphConfig(candidate);
  if (!graphConfig) {
    return sendJson(res, { error: 'Paste a Facebook token with ads_read. Instagram-login (IG…) tokens cannot read ads.' }, 400);
  }

  const adAccount = await graphGet(`/${adAccountId}`, { fields: 'id,name,currency,account_status,timezone_name' }, graphConfig);
  const ads = {
    adAccountId,
    accessToken,
    name: adAccount.name || adAccountId,
    currency: adAccount.currency || '',
    timezoneName: adAccount.timezone_name || ''
  };
  configStore.accounts = configStore.accounts.map((entry) => (entry === account ? { ...entry, ads } : entry));
  const persisted = await saveConfigStore();
  return sendJson(res, { ok: true, config: getConfigPayload(), adAccount: { id: adAccountId, name: ads.name, currency: ads.currency }, persisted });
}

// POST /api/config/ad-accounts {accessToken?, instagramUserId?} -> ad accounts the token can read.
async function handleAdAccountsDiscover(req, res) {
  if (req.method !== 'POST') return sendJson(res, { error: 'Method not allowed' }, 405);
  const body = await readJsonBody(req);
  const account = getAccount(body.instagramUserId || '');
  const accessToken = normalizeAccessToken(body.accessToken || account?.ads?.accessToken
    || (account && resolveGraphHost(account) === 'graph.facebook.com' ? account.accessToken : ''));
  if (!accessToken) {
    return sendJson(res, { error: 'Paste a Facebook token with ads_read. Instagram-login (IG…) tokens cannot read ads.' }, 400);
  }
  const rows = await graphGetAll('/me/adaccounts', {
    fields: 'id,name,account_status,currency,timezone_name', limit: 100
  }, { accessToken, graphApiVersion: account?.graphApiVersion || 'v23.0', apiMode: 'facebook' }, 5);
  return sendJson(res, {
    ok: true,
    adAccounts: rows.map((row) => ({
      id: row.id,
      name: row.name || row.id,
      currency: row.currency || '',
      timezoneName: row.timezone_name || '',
      // 1 = active; anything else (disabled, unsettled, closed...) still has history to read.
      active: Number(row.account_status) === 1
    }))
  });
}

// GET /api/insights/range?since=YYYY-MM-DD&until=YYYY-MM-DD&kind=performance|followers|ads
async function handleRangeInsights(res, requestUrl, session) {
  const parseDay = (name) => {
    const raw = requestUrl.searchParams.get(name) || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const time = Date.parse(`${raw}T00:00:00Z`);
    return Number.isFinite(time) ? { key: raw, sec: Math.floor(time / 1000) } : null;
  };

  const start = parseDay('since');
  const finish = parseDay('until');
  if (!start || !finish) {
    return sendJson(res, { error: 'since and until must be YYYY-MM-DD dates.' }, 400);
  }
  if (start.sec > finish.sec) {
    return sendJson(res, { error: 'since must be on or before until.' }, 400);
  }

  const requestedKind = requestUrl.searchParams.get('kind');
  const kind = ['followers', 'ads'].includes(requestedKind) ? requestedKind : 'performance';
  const nowSec = Math.floor(Date.now() / 1000);
  const lookbackDays = kind === 'ads' ? ADS_MAX_LOOKBACK_DAYS : RANGE_MAX_LOOKBACK_DAYS;
  const floorSec = nowSec - lookbackDays * 86400;
  if (finish.sec < floorSec) {
    return sendJson(res, {
      error: kind === 'ads'
        ? 'Meta keeps ad insights for 37 months. Pick a more recent range.'
        : 'Instagram only keeps account insights for about 2 years. Pick a range inside the last 728 days.'
    }, 400);
  }

  const since = Math.max(start.sec, floorSec);
  const until = Math.min(finish.sec + 86399, nowSec);
  // The gate: throws 403 for any account this session may not read - ads included, since
  // an ad account is only ever reached through the Instagram account it belongs to.
  const activeConfig = accountFromRequest(requestUrl, session);

  if (kind === 'ads') {
    const sinceKey = new Date(since * 1000).toISOString().slice(0, 10);
    const untilKey = new Date(until * 1000).toISOString().slice(0, 10);
    const cacheKey = `${activeConfig.instagramUserId}:ads:${activeConfig.ads?.adAccountId || ''}:${sinceKey}:${untilKey}`;
    const cached = rangeInsightsCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return sendJson(res, cached.value);
    const value = {
      ...await fetchAdsInsights(activeConfig, { sinceKey, untilKey }),
      requested: { since: start.key, until: finish.key, kind },
      clamped: since !== start.sec
    };
    // Don't pin a failure (bad token, missing permission) for half an hour.
    if (value.available) rangeInsightsCache.set(cacheKey, { value, expires: Date.now() + 30 * 60 * 1000 });
    return sendJson(res, value);
  }

  if (!hasCredentials(activeConfig)) {
    // ponytail: demo mode has no historical Graph data to stand in for. Wire the demo
    // generator in here if a credential-free walkthrough of old ranges is ever needed.
    return sendJson(res, {
      available: false,
      requested: { since: start.key, until: finish.key, kind },
      reason: 'Demo mode has no historical Instagram data. Connect an account to load older ranges.'
    });
  }

  const cacheKey = `${activeConfig.instagramUserId}:${kind}:${since}:${until}`;
  const cached = rangeInsightsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return sendJson(res, cached.value);
  }

  const payload = kind === 'followers'
    ? await fetchRangeFollowers(activeConfig, await fetchProfile(activeConfig).catch(() => ({})), { since, until })
    : await fetchRangeInsights(activeConfig, { since, until });

  const value = {
    ...payload,
    requested: { since: start.key, until: finish.key, kind },
    clamped: since !== start.sec
  };
  rangeInsightsCache.set(cacheKey, { value, expires: Date.now() + 30 * 60 * 1000 });
  return sendJson(res, value);
}

// Last `count` calendar weeks (Monday start, UTC); the current partial week runs to now.
function calendarWeekWindows(count) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(today);
  currentWeekStart.setUTCDate(today.getUTCDate() - mondayOffset);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(currentWeekStart);
    start.setUTCDate(currentWeekStart.getUTCDate() - (count - 1 - index) * 7);
    const next = new Date(start);
    next.setUTCDate(start.getUTCDate() + 7);
    const untilDate = index === count - 1 ? now : next;
    return {
      key: start.toISOString().slice(0, 10),
      label: `Wk of ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(start)}`,
      since: Math.floor(start.getTime() / 1000),
      until: Math.floor(untilDate.getTime() / 1000)
    };
  });
}

function calendarMonthWindows(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1));
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const untilDate = index === count - 1 ? now : next;
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      key,
      label: new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(start),
      since: Math.floor(start.getTime() / 1000),
      until: Math.floor(untilDate.getTime() / 1000)
    };
  });
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));
  return results;
}

function accountMetricKey(metric) {
  switch (metric) {
    case 'total_interactions': return 'interactions';
    case 'profile_views': return 'profileViews';
    case 'accounts_engaged': return 'accountsEngaged';
    default: return metric;
  }
}

function parseInsightTotals(data) {
  const totals = {};
  for (const row of data || []) {
    const value = row.total_value?.value;
    if (typeof value === 'number') totals[row.name] = value;
  }
  return totals;
}

function normalizeAccountMetrics(totals) {
  return {
    views: toNumber(totals.views, 0),
    reach: toNumber(totals.reach, 0),
    interactions: toNumber(totals.total_interactions, 0),
    likes: toNumber(totals.likes, 0),
    comments: toNumber(totals.comments, 0),
    shares: toNumber(totals.shares, 0),
    saves: toNumber(totals.saves, 0),
    profileViews: toNumber(totals.profile_views, 0),
    accountsEngaged: toNumber(totals.accounts_engaged, 0)
  };
}

function parseProductMetricBreakdowns(data) {
  const byProduct = {};
  for (const row of data || []) {
    const metric = accountMetricKey(row.name);
    const results = row.total_value?.breakdowns?.[0]?.results || [];
    for (const result of results) {
      const product = String(result.dimension_values?.[0] || 'UNKNOWN').toUpperCase();
      if (!byProduct[product]) byProduct[product] = {};
      byProduct[product][metric] = toNumber(result.value, 0);
    }
  }
  return byProduct;
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

async function graphGet(edge, params = {}, activeConfig = defaultConfig()) {
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

async function fetchInsights(mediaId, activeConfig = defaultConfig(), { isReel = false } = {}) {
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

function normalizeAccount(account, activeConfig = defaultConfig()) {
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

function normalizeContent(media, insights, previousMap = new Map()) {
  const previous = previousMap.get(media.id);
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
    graphApiVersion: activeConfig.graphApiVersion,
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

function composeDashboard({ mode, account, content, loadMeta = {}, warnings = [], refreshMs, activeConfig = defaultConfig() }) {
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
    }, activeConfig.instagramUserId || account.id)
    : { available: false };
  const followerTrend = buildFollowerTrend(account, mode);

  return {
    mode,
    graphApiVersion: activeConfig.graphApiVersion,
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
      if (parsed && typeof parsed === 'object') return migrateHistoryShape(parsed);
    }
  } catch {
    // A corrupt or unreadable history file is non-fatal - start fresh.
  }
  return {};
}

// History used to be flat { 'YYYY-MM-DD': {...} } for the one configured account;
// it is now nested per account id. Legacy data belongs to the seeded default account.
function migrateHistoryShape(parsed) {
  const keys = Object.keys(parsed);
  const isLegacy = keys.length && keys.every((key) => /^\d{4}-\d{2}-\d{2}$/.test(key));
  if (!isLegacy) return parsed;
  return { [configStore.defaultAccountId || 'default']: parsed };
}

// Refresh the in-memory history from Supabase so daily deltas and the overview
// cards survive serverless cold starts. No-op without Supabase.
async function syncHistoryFromSupabase() {
  if (!supabaseEnabled()) return;
  try {
    const stored = await kvGet('metrics_history');
    if (stored && typeof stored === 'object') metricsHistory = migrateHistoryShape(stored);
  } catch {
    // best-effort; fall back to whatever is in memory
  }
}

function saveMetricsHistory() {
  try {
    writeFileSync(historyPath, JSON.stringify(metricsHistory, null, 2));
  } catch {
    // Best-effort persistence; never block a dashboard build on a disk error.
  }
}

// Snapshot today's totals for one account and return the change vs the previous
// day's close. On the first day (no prior history) it reports growth so far today.
function trackDailyMetrics(totals, accountId) {
  const key = todayKey();
  const history = metricsHistory[accountId] || (metricsHistory[accountId] = {});
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

  const priorDates = Object.keys(history).filter((date) => date < key).sort();
  const prev = priorDates.length ? history[priorDates[priorDates.length - 1]] : null;

  if (history[key]) {
    history[key].last = snapshot;
  } else {
    history[key] = { first: snapshot, last: snapshot };
  }

  const allDates = Object.keys(history).sort();
  while (allDates.length > 14) {
    delete history[allDates.shift()];
  }
  saveMetricsHistory();

  const baseline = (prev && prev.last) ? prev.last : history[key].first;
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

// Demo trend only. Connected accounts replace this with Graph API follower_count
// and follows_and_unfollows data in fetchFollowerGrowth(), without using storage.
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

  return { available: false, source: 'graph-api', dayNet: 0, weekNet: 0, series: [] };
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
    warnings: ['Demo mode is active. Use the admin page to add your token and Instagram professional account ID.'],
    refreshMs: configStore.refreshMs
  });
  previousContentMetrics.set('demo', new Map(dashboard.content.map((item) => [item.id, pickComparableMetrics(item)])));
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

function hasCredentials(config = defaultConfig()) {
  return Boolean(config.accessToken && config.instagramUserId);
}

// Drop one account's cached data (after a token change or delete), or everything.
function clearCache(accountId = '') {
  if (!accountId) {
    dashboardCache.clear();
    audienceCache.clear();
    accountInsightsCache.clear();
    followerGrowthCache.clear();
    profileCache.clear();
    previousContentMetrics.clear();
    return;
  }
  for (const key of [...dashboardCache.keys()]) {
    if (key.startsWith(`${accountId}:`)) dashboardCache.delete(key);
  }
  audienceCache.delete(accountId);
  accountInsightsCache.delete(accountId);
  followerGrowthCache.delete(accountId);
  profileCache.delete(accountId);
  previousContentMetrics.delete(accountId);
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

function resolveGraphHost(config = defaultConfig()) {
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
