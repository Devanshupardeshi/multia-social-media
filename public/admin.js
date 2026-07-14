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
  accountsList: document.querySelector('#accounts-list'),
  configForm: document.querySelector('#config-form'),
  tokenInput: document.querySelector('#token-input'),
  igUserIdInput: document.querySelector('#ig-user-id-input'),
  labelInput: document.querySelector('#label-input'),
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
  els.accountsList.addEventListener('click', onAccountAction);

  const saved = sessionStorage.getItem(PW_KEY);
  if (saved) tryLogin(saved, { silent: true });
}

async function onAccountAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id, username, label } = button.dataset;

  if (action === 'edit') {
    els.igUserIdInput.value = id;
    els.labelInput.value = label || '';
    els.tokenInput.value = '';
    els.tokenInput.placeholder = 'Stored token kept — paste to replace';
    setFeedback(`Editing @${username || id}. Save and test applies the changes.`, '');
    els.igUserIdInput.focus();
    return;
  }

  button.disabled = true;
  try {
    if (action === 'default') {
      await postJson('/api/config/default', { instagramUserId: id });
      setFeedback(`@${username || id} is now the default account.`, 'success');
    } else if (action === 'delete') {
      if (!window.confirm(`Remove @${username || id} from the dashboard? Its saved token is deleted.`)) return;
      await deleteJson(`/api/config?id=${encodeURIComponent(id)}`);
      setFeedback(`Removed @${username || id}.`, 'success');
    }
    await Promise.all([loadStatus(), loadConfig()]);
  } catch (error) {
    setFeedback(error.message || 'Action failed', 'error');
  } finally {
    button.disabled = false;
  }
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
    els.statusRow.innerHTML = `
      <div><span>Mode</span><strong>${s.mode === 'graph-api' ? 'Graph API' : 'Demo'}</strong></div>
      <div><span>Accounts</span><strong>${Number(s.accountsCount) || 0}</strong></div>
      <div><span>Default account</span><strong>${escapeHtml(s.username ? `@${s.username}` : (s.defaultAccountId || '—'))}</strong></div>
      <div><span>API version</span><strong>${escapeHtml(s.graphApiVersion || '—')}</strong></div>
      <div><span>Host</span><strong>${escapeHtml(s.resolvedGraphHost || '—')}</strong></div>`;
  } catch {
    els.statusRow.innerHTML = '<div><span>Status</span><strong>Unavailable</strong></div>';
  }
}

async function loadConfig() {
  try {
    const config = await getJson('/api/config');
    const accounts = config.accounts || [];
    els.configState.className = `config-state ${accounts.length ? 'connected' : 'demo'}`;
    els.configState.textContent = accounts.length
      ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} configured`
      : 'Not connected';
    renderAccountsList(accounts, config.defaultAccountId || '');
    els.graphVersionInput.value = els.graphVersionInput.value || 'v23.0';
    els.tokenInput.placeholder = 'Paste token to add or replace an account';
  } catch (error) {
    setFeedback(error.message || 'Unable to load settings', 'error');
  }
}

function renderAccountsList(accounts, defaultAccountId) {
  if (!accounts.length) {
    els.accountsList.innerHTML = '<p class="accounts-empty">No accounts yet. Add the first one below — the dashboard runs in demo mode until then.</p>';
    return;
  }

  els.accountsList.innerHTML = accounts.map((account) => {
    const isDefault = account.instagramUserId === defaultAccountId;
    const avatar = account.profilePictureUrl
      ? `<img src="${escapeAttribute(account.profilePictureUrl)}" alt="">`
      : escapeHtml((account.username || 'IG').slice(0, 2).toUpperCase());
    const attrs = `data-id="${escapeAttribute(account.instagramUserId)}" data-username="${escapeAttribute(account.username)}" data-label="${escapeAttribute(account.label)}"`;
    return `
      <div class="account-row">
        <span class="avatar">${avatar}</span>
        <div class="account-row-name">
          <strong>@${escapeHtml(account.username || 'instagram')}${isDefault ? ' <span class="default-badge">Default</span>' : ''}</strong>
          <small>${escapeHtml(account.label ? `${account.label} · ` : '')}${escapeHtml(account.instagramUserId)}</small>
        </div>
        <div class="account-row-actions">
          <button class="secondary-button small-button" type="button" data-action="edit" ${attrs}>Edit</button>
          ${isDefault ? '' : `<button class="secondary-button small-button" type="button" data-action="default" ${attrs}>Make default</button>`}
          <button class="secondary-button small-button" type="button" data-action="delete" ${attrs}>Delete</button>
        </div>
      </div>`;
  }).join('');
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
      label: els.labelInput.value.trim(),
      graphApiVersion: els.graphVersionInput.value.trim(),
      apiMode: els.apiModeInput.value,
      validate: true
    });
    await Promise.all([loadStatus(), loadConfig()]);
    els.tokenInput.value = '';
    setFeedback(`Connected @${payload.validation?.account?.username || els.igUserIdInput.value.trim()} — it now appears on the dashboard overview.`, 'success');
    if (payload.persisted === false) {
      els.persistNote.hidden = false;
      els.persistNote.textContent = 'Applied for now, but it could not be saved permanently. Connect Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to persist accounts across restarts/deploys.';
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

async function deleteJson(url) {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPw }
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
