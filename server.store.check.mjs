// Self-check for Supabase persistence: the paths where a shared database could lose data.
// Drives the real handleRequest against a mocked Supabase REST API. Run: node server.store.check.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

// In-process secrets only - never the real .env values.
Object.assign(process.env, {
  VERCEL: '1',
  SUPABASE_URL: 'https://mock-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
  SESSION_SECRET: randomBytes(32).toString('base64url'),
  ADMIN_LOGIN: 'admin',
  ADMIN_PASSWORD: 'store-check-' + randomBytes(6).toString('hex')
});

// The local config.json must never be written while Supabase is the store - snapshot it.
const localConfigPath = new URL('./config.json', import.meta.url);
const localBefore = existsSync(localConfigPath) ? readFileSync(localConfigPath, 'utf8') : null;

// ---- Mock Supabase ------------------------------------------------------------------------
const db = new Map();          // kv_store: key -> value
const writes = [];             // every upsert, in order
let failReads = false;
let failWrites = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.host, 'mock-project.supabase.co', `unexpected network call to ${url.host}`);
  assert.equal(init.headers?.apikey, 'mock-service-role-key', 'service key sent as apikey');
  const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  if ((init.method || 'GET') === 'GET') {
    if (failReads) return reply(500, '{"message":"upstream timeout"}');
    const key = url.searchParams.get('key').replace(/^eq\./, '');
    return reply(200, db.has(key) ? [{ value: db.get(key) }] : []);
  }
  if (failWrites) return reply(404, '{"message":"relation \\"public.kv_store\\" does not exist"}');
  for (const row of JSON.parse(init.body)) {
    db.set(row.key, row.value);
    writes.push(row);
  }
  return reply(201, '');
};

const { handleRequest, openStoredToken, sealForStorage, encryptSecret, supabaseHeaders } = await import('./server.mjs');

// ---- Key formats: new sb_secret_ keys must never be sent as a Bearer token -------------------
assert.deepEqual(supabaseHeaders('sb_secret_abc123'), { apikey: 'sb_secret_abc123' }, 'sb_secret_: apikey header only');
assert.deepEqual(supabaseHeaders('eyJhbGciOi.legacy.jwt'), { apikey: 'eyJhbGciOi.legacy.jwt', Authorization: 'Bearer eyJhbGciOi.legacy.jwt' }, 'legacy service_role JWT: both headers');

async function call(method, path, { body, cookie } = {}) {
  const res = {
    headers: {}, chunks: [], statusCode: 200,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(s, h = {}) { this.statusCode = s; for (const [k, v] of Object.entries(h)) this.headers[k.toLowerCase()] = v; },
    write(c) { this.chunks.push(c); },
    end(c) { if (c) this.chunks.push(c); }
  };
  await handleRequest({ method, url: path, headers: { host: 'localhost', ...(cookie ? { cookie } : {}) }, body }, res);
  const text = res.chunks.join('');
  return { status: res.statusCode, json: text ? JSON.parse(text) : null, cookie: String(res.headers['set-cookie'] || '').split(';')[0] };
}

const quiet = async (fn) => {
  const original = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = original; }
};

// ---- Pure: ciphertext survives a server with the wrong key -----------------------------
{
  const keyA = randomBytes(32);
  const keyB = randomBytes(32);
  const sealedWithA = encryptSecret('EAA-real-token', keyA);

  const opened = await quiet(() => openStoredToken(sealedWithA, keyB));
  assert.deepEqual(opened, { token: '', sealed: sealedWithA }, 'wrong key: blank token, ciphertext kept');
  assert.equal(sealForStorage('', opened.sealed, keyB), sealedWithA, 'written back byte-for-byte, not blanked');
  assert.equal(openStoredToken(sealForStorage('', opened.sealed, keyB), keyA).token, 'EAA-real-token', 'the right key still opens it afterwards');

  const reentered = sealForStorage('EAA-new-token', sealedWithA, keyB);
  assert.equal(openStoredToken(reentered, keyB).token, 'EAA-new-token', 're-entering a token replaces the old ciphertext');
  assert.equal(sealForStorage('', '', keyB), '', 'nothing to keep -> empty');
}

// ---- The database already holds the agency's data ---------------------------------------
db.set('config', {
  refreshMs: 60000,
  defaultAccountId: '111',
  accounts: [
    { instagramUserId: '111', accessToken: 'EAAtoken111', username: 'brand_one', graphApiVersion: 'v23.0', apiMode: 'facebook' },
    { instagramUserId: '222', accessToken: 'EAAtoken222', username: 'brand_two', graphApiVersion: 'v23.0', apiMode: 'facebook' }
  ],
  users: []
});

const admin = await call('POST', '/api/auth/login', { body: { login: 'admin', password: process.env.ADMIN_PASSWORD } });
assert.equal(admin.status, 200);

// 1. A read failure before a save must block the save, not overwrite the database.
{
  failReads = true;
  const blocked = await quiet(() => call('POST', '/api/admin/clients', { cookie: admin.cookie, body: { login: 'acme', password: 'acme-password-1', accountIds: ['111'] } }));
  failReads = false;
  assert.equal(blocked.status, 503, 'unreadable store -> 503');
  assert.match(blocked.json.error, /nothing was saved/);
  assert.equal(writes.length, 0, 'no write happened');
  assert.equal(db.get('config').accounts.length, 2, 'database untouched');
}

// 2. A normal save reads the database first and keeps everything already in it.
{
  const created = await call('POST', '/api/admin/clients', { cookie: admin.cookie, body: { login: 'acme', password: 'acme-password-1', accountIds: ['111'] } });
  assert.equal(created.status, 201);
  assert.equal(created.json.persisted, true);
  const saved = db.get('config');
  assert.deepEqual(saved.accounts.map((a) => a.instagramUserId), ['111', '222'], 'existing accounts preserved');
  assert.equal(saved.users.length, 1);
  assert.ok(saved.users[0].passwordHash.startsWith('scrypt$'), 'only the hash is stored');
  assert.ok(!JSON.stringify(saved).includes('acme-password-1'), 'plaintext password never stored');

  // A client created "on another instance" (written straight to the DB) can sign in here.
  const client = await call('POST', '/api/auth/login', { body: { login: 'acme', password: 'acme-password-1' } });
  assert.equal(client.status, 200, 'client login reads the database');
}

// 3. A failed write is reported honestly and never falls back to the local file.
{
  failWrites = true;
  const result = await quiet(() => call('POST', '/api/admin/clients', { cookie: admin.cookie, body: { login: 'bravo', password: 'bravo-password-1', accountIds: [] } }));
  failWrites = false;
  assert.equal(result.json.persisted, false, 'write failure -> persisted: false, not a fake "saved"');
}

// 4. Data written by a server holding a different TOKEN_ENCRYPTION_KEY is not destroyed.
{
  const otherKey = randomBytes(32);
  const sealed111 = encryptSecret('EAAtoken111', otherKey);
  const sealed222 = encryptSecret('EAAtoken222', otherKey);
  const current = db.get('config');
  db.set('config', {
    ...current,
    accounts: current.accounts.map((a) => ({ ...a, accessToken: a.instagramUserId === '111' ? sealed111 : sealed222 }))
  });

  // This server has no key at all - it can't open either token. Saving anything must still
  // write both ciphertexts back unchanged.
  const edit = await quiet(() => call('POST', '/api/admin/clients', { cookie: admin.cookie, body: { login: 'charlie', password: 'charlie-password1', accountIds: ['222'] } }));
  assert.equal(edit.status, 201);
  const after = db.get('config').accounts;
  assert.equal(after.find((a) => a.instagramUserId === '111').accessToken, sealed111, 'token 111 ciphertext preserved');
  assert.equal(after.find((a) => a.instagramUserId === '222').accessToken, sealed222, 'token 222 ciphertext preserved');
  assert.ok(after.every((a) => !('sealedToken' in a)), 'bookkeeping field never persisted');
}

// ---- Local file untouched throughout -------------------------------------------------------
const localAfter = existsSync(localConfigPath) ? readFileSync(localConfigPath, 'utf8') : null;
assert.equal(localAfter, localBefore, 'config.json must not be written while Supabase is the store');

console.log('store: all checks passed');
