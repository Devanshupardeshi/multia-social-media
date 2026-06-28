const PW_KEY = 'multia-admin-pw';

const els = {
  lockView: document.querySelector('#lock-view'),
  adminView: document.querySelector('#admin-view'),
  lockForm: document.querySelector('#lock-form'),
  adminPassword: document.querySelector('#admin-password'),
  unlockBtn: document.querySelector('#unlock-btn'),
  lockFeedback: document.querySelector('#lock-feedback'),
  configState: document.querySelector('#config-state'),
  statusRow: document.querySelector('#status-row'),
  configForm: document.querySelector('#config-form'),
  tokenInput: document.querySelector('#token-input'),
  igUserIdInput: document.querySelector('#ig-user-id-input'),
  graphVersionInput: document.querySelector('#graph-version-input'),
  apiModeInput: document.querySelector('#api-mode-input'),
  saveConfig: document.querySelector('#save-config'),
  discoverAccount: document.querySelector('#discover-account'),
  discoveredAccounts: document.querySelector('#discovered-accounts'),
  configFeedback: document.querySelector('#config-feedback'),
  persistNote: document.querySelector('#persist-note')
};

let adminPw = '';

init();

function init() {
  els.lockForm.addEventListener('submit', onUnlock);
  els.configForm.addEventListener('submit', saveConfig);
  els.discoverAccount.addEventListener('click', discoverAccounts);
  els.discoveredAccounts.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ig-user-id]');
    if (!button) return;
    els.igUserIdInput.value = button.dataset.igUserId;
    setFeedback(`Selected @${button.dataset.username || 'instagram'} (${button.dataset.igUserId})`, 'success');
  });

  const saved = sessionStorage.getItem(PW_KEY);
  if (saved) tryLogin(saved, { silent: true });
}

async function onUnlock(event) {
  event.preventDefault();
  await tryLogin(els.adminPassword.value, { silent: false });
}

async function tryLogin(password, { silent }) {
  if (!password) return;
  els.unlockBtn.disabled = true;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) throw new Error('Incorrect password');
    adminPw = password;
    sessionStorage.setItem(PW_KEY, password);
    els.lockView.hidden = true;
    els.adminView.hidden = false;
    await Promise.all([loadStatus(), loadConfig()]);
  } catch (error) {
    sessionStorage.removeItem(PW_KEY);
    if (!silent) {
      els.lockFeedback.className = 'config-feedback error';
      els.lockFeedback.textContent = error.message || 'Incorrect password';
    }
  } finally {
    els.unlockBtn.disabled = false;
  }
}

async function loadStatus() {
  try {
    const s = await getJson('/api/status');
    const yes = (v) => v ? '<span class="pill-ok">Yes</span>' : '<span class="pill-no">No</span>';
    els.statusRow.innerHTML = `
      <div><span>Mode</span><strong>${s.mode === 'graph-api' ? 'Graph API' : 'Demo'}</strong></div>
      <div><span>Token set</span><strong>${yes(s.hasAccessToken)}</strong></div>
      <div><span>Account ID</span><strong>${escapeHtml(s.instagramUserId || '—')}</strong></div>
      <div><span>API version</span><strong>${escapeHtml(s.graphApiVersion || '—')}</strong></div>
      <div><span>Host</span><strong>${escapeHtml(s.resolvedGraphHost || '—')}</strong></div>`;
  } catch {
    els.statusRow.innerHTML = '<div><span>Status</span><strong>Unavailable</strong></div>';
  }
}

async function loadConfig() {
  try {
    const config = await getJson('/api/config');
    const connected = Boolean(config.hasAccessToken && config.instagramUserId);
    els.configState.className = `config-state ${connected ? 'connected' : 'demo'}`;
    els.configState.textContent = connected ? `Configured ${config.instagramUserId}` : 'Not connected';
    els.igUserIdInput.value = config.instagramUserId || '';
    els.graphVersionInput.value = config.graphApiVersion || 'v23.0';
    els.apiModeInput.value = config.apiMode || 'auto';
    els.tokenInput.value = '';
    els.tokenInput.placeholder = connected
      ? `Stored ${config.tokenPreview || 'token'} — paste to replace`
      : 'Paste token to connect';
  } catch (error) {
    setFeedback(error.message || 'Unable to load settings', 'error');
  }
}

async function saveConfig(event) {
  event.preventDefault();
  setBusy(true, 'Testing');
  setFeedback('Testing Graph API access…', '');
  els.persistNote.hidden = true;

  try {
    const payload = await postJson('/api/config', {
      accessToken: els.tokenInput.value.trim(),
      instagramUserId: els.igUserIdInput.value.trim(),
      graphApiVersion: els.graphVersionInput.value.trim(),
      apiMode: els.apiModeInput.value,
      validate: true
    });
    await Promise.all([loadStatus(), loadConfig()]);
    setFeedback(`Connected to @${payload.validation?.account?.username || payload.config.instagramUserId}`, 'success');
    if (payload.persisted === false) {
      els.persistNote.hidden = false;
      els.persistNote.textContent = 'Applied for now, but it could not be saved permanently. Connect Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to persist settings, or set INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID as Vercel env vars and redeploy.';
    }
  } catch (error) {
    setFeedback(error.message || 'Unable to validate these credentials', 'error');
  } finally {
    setBusy(false);
  }
}

async function discoverAccounts() {
  setBusy(true, 'Finding');
  setFeedback('Looking for connected Instagram professional accounts…', '');
  els.discoveredAccounts.innerHTML = '';

  try {
    const payload = await postJson('/api/config/discover', {
      accessToken: els.tokenInput.value.trim(),
      graphApiVersion: els.graphVersionInput.value.trim(),
      apiMode: els.apiModeInput.value
    });
    renderDiscovered(payload.accounts || []);
    setFeedback(payload.accounts?.length ? 'Choose an account below, then Save and test.' : payload.note, payload.accounts?.length ? 'success' : 'error');
  } catch (error) {
    setFeedback(`${error.message || 'Unable to discover accounts'} Add pages_show_list and pages_read_engagement, or paste the Instagram account ID manually.`, 'error');
  } finally {
    setBusy(false);
  }
}

function renderDiscovered(accounts) {
  els.discoveredAccounts.innerHTML = accounts.map((account) => `
    <button class="account-option" type="button" data-ig-user-id="${escapeAttribute(account.instagramUserId)}" data-username="${escapeAttribute(account.username)}">
      <strong>@${escapeHtml(account.username || 'instagram')}</strong>
      <small>${escapeHtml(account.instagramUserId)} · ${escapeHtml(account.pageName || '')}</small>
    </button>`).join('');
}

function setBusy(isBusy, label = 'Save and test') {
  els.saveConfig.disabled = isBusy;
  els.discoverAccount.disabled = isBusy;
  els.saveConfig.textContent = isBusy ? label : 'Save and test';
}

function setFeedback(message, type = '') {
  els.configFeedback.className = `config-feedback ${type}`;
  els.configFeedback.textContent = message || '';
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'x-admin-password': adminPw } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPw },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
