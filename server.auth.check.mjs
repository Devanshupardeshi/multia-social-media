// Self-check for the authentication and isolation helpers in server.mjs.
// Run: node server.auth.check.mjs
// VERCEL=1 keeps server.mjs from opening a listener on import.
process.env.VERCEL = '1';

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Regression guard: the config store loads (and decrypts tokens) at module load. A helper
// constant declared too late once made every token load as blank - silently, apart from
// this log line. Capture errors during import and fail if any token failed to load.
const loadErrors = [];
const originalError = console.error;
console.error = (...args) => loadErrors.push(args.join(' '));

const {
  hashPassword,
  verifyPassword,
  signSessionToken,
  readSessionToken,
  safeNextPath,
  resolveAllowedAccountId,
  encryptSecret,
  decryptSecret
} = await import('./server.mjs');

console.error = originalError;
assert.deepEqual(
  loadErrors.filter((line) => /could not be decrypted/.test(line)),
  [],
  'every stored token must load at startup'
);

// --- Passwords --------------------------------------------------------------
{
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt\$[^$]+\$[^$]+$/, 'hash format');
  assert.ok(!hash.includes('correct horse battery'), 'hash must not contain the password');
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('correct horse batterY', hash), false, 'one character off');
  assert.equal(await verifyPassword('', hash), false);
  assert.notEqual(await hashPassword('same'), await hashPassword('same'), 'salted: same password, different hashes');
  assert.equal(await verifyPassword('anything', ''), false, 'no stored hash');
  assert.equal(await verifyPassword('anything', 'md5$abc$def'), false, 'unknown scheme');
}

// --- Session tokens ---------------------------------------------------------
{
  const secret = 'test-secret';
  const now = 1_000_000;
  const claims = { sub: 'u1', role: 'client', ver: 'v1', exp: now + 60_000 };
  const token = signSessionToken(claims, secret);

  assert.deepEqual(readSessionToken(token, secret, now), claims, 'round trip');
  assert.equal(readSessionToken(token, 'other-secret', now), null, 'wrong secret');
  assert.equal(readSessionToken(token, secret, now + 60_001), null, 'expired');
  assert.equal(readSessionToken(token, '', now), null, 'no secret configured');
  assert.equal(readSessionToken('', secret, now), null, 'no cookie');
  assert.equal(readSessionToken('garbage', secret, now), null, 'no signature');

  // Escalation attempt: rewrite the payload to role=admin and keep the old signature.
  const [, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...claims, role: 'admin', sub: 'admin' })).toString('base64url');
  assert.equal(readSessionToken(`${forged}.${signature}`, secret, now), null, 'tampered payload');

  // Flip one signature character.
  const [body] = token.split('.');
  const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
  assert.equal(readSessionToken(`${body}.${flipped}`, secret, now), null, 'tampered signature');

  const noExp = signSessionToken({ sub: 'u1', role: 'client', ver: 'v1' }, secret);
  assert.equal(readSessionToken(noExp, secret, now), null, 'a token without exp is never valid');
}

// --- Account isolation --------------------------------------------------------
{
  const existing = ['111', '222', '333'];
  const admin = { role: 'admin', user: { id: 'admin' } };
  const client = { role: 'client', user: { accountIds: ['222'] } };
  const twoAccounts = { role: 'client', user: { accountIds: ['333', '222'] } };
  const orphan = { role: 'client', user: { accountIds: ['999'] } }; // assigned account was deleted
  const none = { role: 'client', user: { accountIds: [] } };
  const deny = (fn, pattern) => assert.throws(fn, (error) => error.statusCode === 403 && pattern.test(error.message));

  // Admin: unchanged behaviour - any id passes through (getAccount applies the default).
  assert.equal(resolveAllowedAccountId(admin, '111', existing), '111');
  assert.equal(resolveAllowedAccountId(admin, '', existing), '');

  // Client: only their own.
  assert.equal(resolveAllowedAccountId(client, '222', existing), '222', 'own account');
  assert.equal(resolveAllowedAccountId(client, '', existing), '222', 'empty id -> their first account');
  assert.equal(resolveAllowedAccountId(twoAccounts, '', existing), '333', 'first in their own order');
  deny(() => resolveAllowedAccountId(client, '111', existing), /do not have access/);
  deny(() => resolveAllowedAccountId(client, '444', existing), /do not have access/); // unknown: no default fallback
  deny(() => resolveAllowedAccountId(orphan, '', existing), /No Instagram account/);
  deny(() => resolveAllowedAccountId(orphan, '999', existing), /No Instagram account/);
  deny(() => resolveAllowedAccountId(none, '', existing), /No Instagram account/);

  // Ids are sanitised the same way the store sanitises them - no bypass via padding.
  assert.equal(resolveAllowedAccountId(client, ' 222 ', existing), '222');
  deny(() => resolveAllowedAccountId(client, '111&account=222', existing), /do not have access/);

  // No session at all is never an admin.
  deny(() => resolveAllowedAccountId(null, '111', existing), /No Instagram account/);
}

// --- Token encryption at rest ------------------------------------------------
{
  const key = randomBytes(32);
  const token = 'EAAB-example-access-token';
  const sealed = encryptSecret(token, key);

  assert.ok(sealed.startsWith('enc:v1:'), 'prefix');
  assert.ok(!sealed.includes(token), 'ciphertext must not contain the token');
  assert.equal(decryptSecret(sealed, key), token, 'round trip');
  assert.notEqual(encryptSecret(token, key), sealed, 'fresh IV every time');
  assert.equal(encryptSecret(sealed, key), sealed, 'already-encrypted values are not double-wrapped');

  assert.equal(encryptSecret(token, null), token, 'no key -> stored as-is');
  assert.equal(decryptSecret(token, key), token, 'legacy plaintext still loads');
  assert.equal(decryptSecret('', key), '', 'empty stays empty');

  assert.throws(() => decryptSecret(sealed, randomBytes(32)), 'wrong key');
  assert.throws(() => decryptSecret(sealed, null), /TOKEN_ENCRYPTION_KEY is required/);
  const tampered = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => decryptSecret(tampered, key), 'GCM rejects tampered ciphertext');
}

// --- Post-login redirect -------------------------------------------------------
{
  assert.equal(safeNextPath('/'), '/');
  assert.equal(safeNextPath('/?account=222'), '/?account=222');
  assert.equal(safeNextPath('/admin'), '/admin');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', 'javascript:alert(1)', '', null, '/x\r\nSet-Cookie: a=b']) {
    assert.equal(safeNextPath(bad), '', `must reject ${JSON.stringify(bad)}`);
  }
}

console.log('auth: all checks passed');
