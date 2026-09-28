// Admin page. Access is enforced by the server: /admin is only served to an admin session,
// and every /api/config* and /api/admin/* call is rejected without one. This script never
// sees or stores a password - the session cookie is HttpOnly.

const els = {
  logoutBtn: document.querySelector('#logout-btn'),
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
  persistNote: document.querySelector('#persist-note'),
  clientsList: document.querySelector('#clients-list'),
  clientForm: document.querySelector('#client-form'),
  clientName: document.querySelector('#client-name'),
  clientLogin: document.querySelector('#client-login'),
  clientPassword: document.querySelector('#client-password'),
  clientPasswordLabel: document.querySelector('#client-password-label'),
  generatePassword: document.querySelector('#generate-password'),
  clientAccounts: document.querySelector('#client-accounts'),
  saveClient: document.querySelector('#save-client'),
  cancelClient: document.querySelector('#cancel-client'),
  clientFeedback: document.querySelector('#client-feedback'),
  credentialCard: document.querySelector('#credential-card'),
  credentialText: document.querySelector('#credential-text'),
  copyCredentials: document.querySelector('#copy-credentials')
};

const state = {
  accounts: [],
  clients: [],
  editingClientId: ''
};

init();

async function init() {
  els.configForm.addEventListener('submit', saveConfig);
  els.discoverAccount.addEventListener('click', discoverAccounts);
  els.discoveredAccounts.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ig-user-id]');
    if (!button) return;
    els.igUserIdInput.value = button.dataset.igUserId;
    setFeedback(`Selected @${button.dataset.username || 'instagram'} (${button.dataset.igUserId})`, 'success');
  });
  els.accountsList.addEventListener('click', onAccountAction);
  els.clientForm.addEventListener('submit', saveClient);
  els.clientsList.addEventListener('click', onClientAction);
  els.generatePassword.addEventListener('click', () => {
    els.clientPassword.value = generatePassword();
  });
  els.cancelClient.addEventListener('click', resetClientForm);
  els.copyCredentials.addEventListener('click', copyCredentials);
  els.logoutBtn.addEventListener('click', logout);

  await Promise.all([loadStatus(), loadConfig()]);
  await loadClients();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  location.replace('/login');
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
      await sendJson('POST', '/api/config/default', { instagramUserId: id });
      setFeedback(`@${username || id} is now the default account.`, 'success');
    } else if (action === 'delete') {
      if (!window.confirm(`Remove @${username || id} from the dashboard? Its saved token is deleted, and any client login loses access to it.`)) return;
      await sendJson('DELETE', `/api/config?id=${encodeURIComponent(id)}`);
      setFeedback(`Removed @${username || id}.`, 'success');
    }
    await Promise.all([loadStatus(), loadConfig()]);
    await loadClients();
  } catch (error) {
    setFeedback(error.message || 'Action failed', 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadStatus() {
  try {
    const s = await getJson('/api/status');
    const storage = s.supabase
      ? '<span class="pill-ok">Supabase</span>'
      : (s.serverless ? '<span class="pill-no">In-memory only</span>' : 'Local file');
    els.statusRow.innerHTML = `
      <div><span>Mode</span><strong>${s.mode === 'graph-api' ? 'Graph API' : 'Demo'}</strong></div>
      <div><span>Accounts</span><strong>${Number(s.accountsCount) || 0}</strong></div>
      <div><span>Default account</span><strong>${escapeHtml(s.username ? `@${s.username}` : (s.defaultAccountId || '—'))}</strong></div>
      <div><span>API version</span><strong>${escapeHtml(s.graphApiVersion || '—')}</strong></div>
      <div><span>Host</span><strong>${escapeHtml(s.resolvedGraphHost || '—')}</strong></div>
      <div><span>Storage</span><strong>${storage}</strong></div>
      <div><span>Token encryption</span><strong>${s.tokenEncryption ? '<span class="pill-ok">On</span>' : '<span class="pill-no">Off</span>'}</strong></div>`;
    if (s.serverless && !s.supabase) {
      setFeedback('Accounts and client logins will NOT persist: this deployment has no Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars, run supabase-schema.sql once, then redeploy.', 'error');
    }
  } catch {
    els.statusRow.innerHTML = '<div><span>Status</span><strong>Unavailable</strong></div>';
  }
}

async function loadConfig() {
  try {
    const config = await getJson('/api/config');
    const accounts = config.accounts || [];
    state.accounts = accounts;
    els.configState.className = `config-state ${accounts.length ? 'connected' : 'demo'}`;
    els.configState.textContent = accounts.length
      ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} configured`
      : 'Not connected';
    renderAccountsList(accounts, config.defaultAccountId || '');
    renderClientAccountChoices();
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

// ---------------------------------------------------------------------------
// Client logins
// ---------------------------------------------------------------------------

async function loadClients() {
  try {
    const payload = await getJson('/api/admin/clients');
    state.clients = payload.clients || [];
    renderClientsList();
  } catch (error) {
    setClientFeedback(error.message || 'Unable to load client logins', 'error');
  }
}

function accountName(id) {
  const account = state.accounts.find((entry) => entry.instagramUserId === id);
  return account ? `@${account.username || account.instagramUserId}` : id;
}

function renderClientsList() {
  if (!state.clients.length) {
    els.clientsList.innerHTML = '<p class="accounts-empty">No client logins yet. Create one below and assign the accounts they may see.</p>';
    return;
  }

  els.clientsList.innerHTML = state.clients.map((client) => {
    const accounts = client.accountIds.length
      ? client.accountIds.map(accountName).join(', ')
      : 'No accounts assigned — this login sees nothing';
    const attrs = `data-id="${escapeAttribute(client.id)}" data-login="${escapeAttribute(client.login)}"`;
    return `
      <div class="account-row">
        <span class="avatar">${escapeHtml((client.name || client.login).slice(0, 2).toUpperCase())}</span>
        <div class="account-row-name">
          <strong>${escapeHtml(client.name || client.login)}${client.disabled ? ' <span class="off-badge">Disabled</span>' : ''}</strong>
          <small>Login: ${escapeHtml(client.login)} · ${escapeHtml(accounts)}</small>
        </div>
        <div class="account-row-actions">
          <button class="secondary-button small-button" type="button" data-client-action="edit" ${attrs}>Edit</button>
          <button class="secondary-button small-button" type="button" data-client-action="reset" ${attrs}>Reset password</button>
          <button class="secondary-button small-button" type="button" data-client-action="${client.disabled ? 'enable' : 'disable'}" ${attrs}>${client.disabled ? 'Enable' : 'Disable'}</button>
          <button class="secondary-button small-button" type="button" data-client-action="delete" ${attrs}>Delete</button>
        </div>
      </div>`;
  }).join('');
}

function renderClientAccountChoices(selected = currentlyCheckedAccounts()) {
  if (!state.accounts.length) {
    els.clientAccounts.innerHTML = '<p class="accounts-empty">Connect an Instagram account first.</p>';
    return;
  }
  const chosen = new Set(selected);
  els.clientAccounts.innerHTML = state.accounts.map((account) => `
    <label>
      <input type="checkbox" value="${escapeAttribute(account.instagramUserId)}"${chosen.has(account.instagramUserId) ? ' checked' : ''}>
      @${escapeHtml(account.username || account.instagramUserId)}${account.label ? ` <small>· ${escapeHtml(account.label)}</small>` : ''}
    </label>`).join('');
}

function currentlyCheckedAccounts() {
  return [...els.clientAccounts.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

async function onClientAction(event) {
  const button = event.target.closest('button[data-client-action]');
  if (!button) return;
  const { clientAction: action, id, login } = button.dataset;
  const client = state.clients.find((entry) => entry.id === id);
  if (!client) return;

  if (action === 'edit') {
    state.editingClientId = id;
    els.clientName.value = client.name;
    els.clientLogin.value = client.login;
    els.clientLogin.disabled = true;
    els.clientPassword.value = '';
    els.clientPassword.placeholder = 'Leave blank to keep the current password';
    els.clientPasswordLabel.textContent = 'New password (optional)';
    els.saveClient.textContent = 'Save changes';
    els.cancelClient.hidden = false;
    els.credentialCard.hidden = true;
    renderClientAccountChoices(client.accountIds);
    setClientFeedback(`Editing ${client.name || client.login}.`, '');
    els.clientName.focus();
    return;
  }

  button.disabled = true;
  try {
    if (action === 'reset') {
      if (!window.confirm(`Reset the password for ${login}? They'll be signed out everywhere and need the new one.`)) return;
      const password = generatePassword();
      await sendJson('PATCH', `/api/admin/clients?id=${encodeURIComponent(id)}`, { password });
      showCredentials(client.login, password);
      setClientFeedback(`New password set for ${login}.`, 'success');
    } else if (action === 'disable' || action === 'enable') {
      await sendJson('PATCH', `/api/admin/clients?id=${encodeURIComponent(id)}`, { disabled: action === 'disable' });
      setClientFeedback(action === 'disable' ? `${login} is disabled and signed out.` : `${login} can sign in again.`, 'success');
    } else if (action === 'delete') {
      if (!window.confirm(`Delete the login ${login}? They lose access immediately.`)) return;
      await sendJson('DELETE', `/api/admin/clients?id=${encodeURIComponent(id)}`);
      if (state.editingClientId === id) resetClientForm();
      setClientFeedback(`Deleted ${login}.`, 'success');
    }
    await loadClients();
  } catch (error) {
    setClientFeedback(error.message || 'Action failed', 'error');
  } finally {
    button.disabled = false;
  }
}

async function saveClient(event) {
  event.preventDefault();
  const password = els.clientPassword.value;
  const body = {
    name: els.clientName.value.trim(),
    accountIds: currentlyCheckedAccounts()
  };
  if (password) body.password = password;

  els.saveClient.disabled = true;
  try {
    if (state.editingClientId) {
      const payload = await sendJson('PATCH', `/api/admin/clients?id=${encodeURIComponent(state.editingClientId)}`, body);
      if (password) showCredentials(payload.client.login, password);
      setClientFeedback(`Saved ${payload.client.name || payload.client.login}.`, 'success');
      resetClientForm({ keepCredentials: Boolean(password), keepFeedback: true });
    } else {
      body.login = els.clientLogin.value.trim();
      const payload = await sendJson('POST', '/api/admin/clients', body);
      showCredentials(payload.client.login, password);
      setClientFeedback(
        payload.client.accountIds.length
          ? `Created ${payload.client.login}.`
          : `Created ${payload.client.login} — but no account is assigned yet, so they'll see nothing until you edit it.`,
        payload.client.accountIds.length ? 'success' : 'error'
      );
      resetClientForm({ keepCredentials: true, keepFeedback: true });
    }
    await loadClients();
  } catch (error) {
    setClientFeedback(error.message || 'Unable to save this client', 'error');
  } finally {
    els.saveClient.disabled = false;
  }
}

function resetClientForm({ keepCredentials = false, keepFeedback = false } = {}) {
  state.editingClientId = '';
  els.clientForm.reset();
  els.clientLogin.disabled = false;
  els.clientPassword.placeholder = 'At least 10 characters';
  els.clientPasswordLabel.textContent = 'Password';
  els.saveClient.textContent = 'Create client';
  els.cancelClient.hidden = true;
  renderClientAccountChoices([]);
  if (!keepCredentials) els.credentialCard.hidden = true;
  if (!keepFeedback) setClientFeedback('', '');
}

function showCredentials(login, password) {
  els.credentialText.textContent = [
    'Multia Instagram dashboard',
    `Link: ${location.origin}/login`,
    `Login ID: ${login}`,
    `Password: ${password}`
  ].join('\n');
  els.credentialCard.hidden = false;
}

async function copyCredentials() {
  const text = els.credentialText.textContent;
  try {
    await navigator.clipboard.writeText(text);
    els.copyCredentials.textContent = 'Copied';
  } catch {
    // Clipboard API blocked (e.g. insecure context) - select it so Ctrl+C works.
    const range = document.createRange();
    range.selectNodeContents(els.credentialText);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    els.copyCredentials.textContent = 'Press Ctrl+C to copy';
  }
  setTimeout(() => { els.copyCredentials.textContent = 'Copy login details'; }, 2000);
}

// 16 characters without look-alikes (0/O, 1/l/I), from the browser's CSPRNG. Rejection
// sampling keeps every character equally likely.
function generatePassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

function setClientFeedback(message, type = '') {
  els.clientFeedback.className = `config-feedback ${type}`;
  els.clientFeedback.textContent = message || '';
}

// ---------------------------------------------------------------------------
// Account connection
// ---------------------------------------------------------------------------

async function saveConfig(event) {
  event.preventDefault();
  setBusy(true, 'Testing');
  setFeedback('Testing Graph API access…', '');
  els.persistNote.hidden = true;

  try {
    const payload = await sendJson('POST', '/api/config', {
      accessToken: els.tokenInput.value.trim(),
      instagramUserId: els.igUserIdInput.value.trim(),
      label: els.labelInput.value.trim(),
      graphApiVersion: els.graphVersionInput.value.trim(),
      apiMode: els.apiModeInput.value,
      validate: true
    });
    await Promise.all([loadStatus(), loadConfig()]);
    renderClientsList();
    els.tokenInput.value = '';
    setFeedback(`Connected @${payload.validation?.account?.username || els.igUserIdInput.value.trim()} — assign it to a client login above.`, 'success');
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
    const payload = await sendJson('POST', '/api/config/discover', {
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

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function getJson(url) {
  return sendJson('GET', url);
}

async function sendJson(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  // Session expired or revoked mid-visit: back to sign-in, returning here afterwards.
  if (res.status === 401) {
    location.replace('/login?next=/admin');
    throw new Error('Signed out');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
