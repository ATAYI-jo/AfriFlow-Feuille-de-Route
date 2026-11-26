/* Deterministic startup ordering with the production account, workspace and routing code. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const accountSource = read('modules/auth/account-management.js');
const workspaceSource = read('afriflow-workspace.js');
const coreSource = read('afriflow-core.js');
const marketSource = read('market.js');
const email = 'member@example.test';
const routeKey = 'afriflow_last_view_v1';
const sessionKey = 'afriflow_session_v1';
const settle = async () => { for (let i = 0; i < 45; i++) await Promise.resolve(); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, once: options && options.once });
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item.fn !== fn));
    },
    dispatchEvent(event) {
      for (const item of [...(listeners.get(event.type) || [])]) {
        if (item.once) this.removeEventListener(event.type, item.fn);
        item.fn(event);
      }
      return true;
    }
  };
}
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function snippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'Production section must exist: ' + startMarker);
  return source.slice(start, end);
}

function harness(options = {}) {
  const stages = { session: deferred(), identity: deferred(), role: deferred() };
  const trace = [], nodes = new Map(), timers = [];
  let context, authChange;
  function element(id) {
    const classes = new Set();
    return Object.assign(eventTarget(), {
      id, hidden: false, style: {}, dataset: {}, innerHTML: '', textContent: '', value: '',
      setAttribute() {}, removeAttribute() {}, appendChild() {}, remove() {}, focus() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) {
          names.forEach(name => {
            if (classes.delete(name)) trace.push({ kind: 'class-removed', id, name,
              route: context && context.AfriNav ? context.AfriNav.current() : null });
          });
        },
        contains: name => classes.has(name),
        toggle(name, force) {
          const on = force === undefined ? !classes.has(name) : force;
          if (on) classes.add(name); else classes.delete(name);
          return on;
        }
      }
    });
  }
  const document = Object.assign(eventTarget(), {
    readyState: 'loading', hidden: false, activeElement: null,
    getElementById(id) {
      if (id === 'logout-btn' || id === 'reqBtn') return null;
      if (!nodes.has(id)) nodes.set(id, element(id));
      return nodes.get(id);
    },
    querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return element(''); },
    documentElement: element('html'), body: element('body'), head: element('head')
  });
  const sessionStorage = storage({ [routeKey]: JSON.stringify({ email, id: options.route || 'marketing', y: 380 }) });
  const localStorage = storage(options.cached === false ? {} : { [sessionKey]: JSON.stringify({ e: email }) });
  const profile = { requested_role: 'shareholder', access_mode: options.access || 'shareholder_approved', selection_confirmed_at: '2026-11-01' };
  const user = { id: 'user-test', email, user_metadata: { full_name: 'Test Member' } };
  const client = {
    auth: {
      getSession() { trace.push({ kind: 'session-request' }); return stages.session.promise; },
      getUser() { trace.push({ kind: 'identity-request' }); return stages.identity.promise; },
      onAuthStateChange(fn) { authChange = fn; }, signOut() { trace.push({ kind: 'signout' }); return Promise.resolve({}); }
    },
    rpc() { trace.push({ kind: 'role-request' }); return stages.role.promise; },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        maybeSingle() {
          if (table === 'afriflow_market_profiles' && options.profileError) return Promise.reject(new Error('Failed to fetch profile'));
          const value = table === 'afriflow_market_profiles' ? profile
            : { value: { email, name: 'Test Member', grants: [] } };
          return Promise.resolve({ data: value });
        },
        insert() { return Promise.resolve({ error: { code: '23505' } }); }
      };
      return query;
    },
    channel() { const ch = { on() { return ch; }, subscribe() {}, track() {}, untrack() {} }; return ch; },
    removeChannel() {}
  };
  context = Object.assign(eventTarget(), {
    document, localStorage, sessionStorage, URL, URLSearchParams, console,
    location: { search: options.search || '', hash: options.hash || '', pathname: '/', href: 'https://afriflow.pages.dev/' },
    history: { replaceState() {} }, navigator: { onLine: true },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    Event: class Event { constructor(type) { this.type = type; } },
    loggedUserEmail: '', __sb: client, __TABLE: 'afriflow_state',
    __oauthQuery: options.search || '', __oauthReturn: options.hash || '',
    setTimeout(fn, ms) { const item = { fn, ms, active: true }; timers.push(item); return item; },
    clearTimeout(item) { if (item) item.active = false; }, setInterval() { return 0; }, clearInterval() {},
    scrollY: 0, scrollTo(_x, y) { context.scrollY = y; }, matchMedia() { return { matches: true }; },
    $: id => document.getElementById(id), ic: () => '', esc: value => String(value),
    renderRoadmap() { trace.push({ kind: 'roadmap-render' }); }, recordUserAction() {},
    showPasswordRecovery() { trace.push({ kind: 'recovery-open' }); },
    closeDrawer() {}, alert() {}, confirm() { return false; }
  });
  context.window = context;
  const visibleMarket = kind => {
    trace.push({ kind: 'market-open', mode: kind });
    document.body.classList.add('af-market-mode');
    document.documentElement.classList.remove('af-role-checking');
    if (context.AfriStartup) context.AfriStartup.routeReady();
  };
  context.AfriMarket = {
    open: value => visibleMarket(value.kind), openPublic: () => visibleMarket('public'),
    openAuth(mode) { document.body.classList.add('af-auth-open'); trace.push({ kind: 'auth-open', mode }); }
  };
  const vmContext = vm.createContext(context);
  const run = code => vm.runInContext(code, vmContext);
  document.documentElement.classList.add('af-startup-pending', 'af-role-checking');
  run(read('modules/ui/startup.js'));
  run(snippet(coreSource, 'var USER_ROLE =', '/* La session Supabase'));
  run(workspaceSource);
  function navigate(id) {
    const button = { dataset: { id } };
    document.getElementById('side').dispatchEvent({ type: 'click', target: { closest() { return button; } } });
  }
  context.AfriOpenMarketing = function() {
    navigate('home');
    context.AfriNav.remember('marketing');
    document.getElementById('view-home').style.display = 'none';
    document.getElementById('viewHost').style.display = '';
    trace.push({ kind: 'chosen-page', route: 'marketing' });
    return true;
  };
  return { context, document, trace, stages, user, localStorage, sessionStorage, run,
    accounts() { run(accountSource); },
    market() {
      context.isAdmin = () => context.USER_ROLE === 'admin';
      context.shouldUseMarket = p => ['client', 'shareholder_pending', 'partner_waiting', 'partner_approved'].includes(p.access_mode);
      context.open = value => visibleMarket(value.kind);
      context.openPublic = () => visibleMarket('public');
      run(snippet(marketSource, '  window.afriMarketInitial = function () {', '\n})();'));
    },
    ready() { document.readyState = 'complete'; document.dispatchEvent({ type: 'DOMContentLoaded' }); },
    authEvent(event) { if (authChange) authChange(event, { user }); },
    timers(ms) { for (const timer of [...timers]) if (timer.active && timer.ms <= ms) { timer.active = false; timer.fn(); } }
  };
}

function opened(h, kind) { return h.trace.filter(event => event.kind === 'market-open' && (!kind || event.mode === kind)); }
function pending(h) {
  assert.equal(h.context.AfriStartup.state(), 'pending');
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  assert.equal(opened(h).length, 0, 'No temporary destination may render before session verification');
}
function resolveSession(h) { h.stages.session.resolve({ data: { session: { user: h.user } } }); }
function resolveIdentity(h) { h.stages.identity.resolve({ data: { user: h.user } }); }

test('A slow returning session reveals Marketing directly after all verification stages', async () => {
  const h = harness();
  h.accounts(); h.market(); h.ready();
  await settle(); pending(h);
  resolveSession(h); await settle(); pending(h);
  resolveIdentity(h); await settle(); pending(h);
  h.stages.role.resolve({ data: false }); await settle();
  assert.equal(h.context.AfriStartup.state(), 'authenticated');
  assert.equal(h.context.AfriNav.current(), 'marketing');
  assert.equal(opened(h).length, 0);
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
  const release = h.trace.find(event => event.kind === 'class-removed' && event.name === 'af-startup-pending');
  assert.equal(release.route, 'marketing', 'The destination must be selected before the startup screen disappears');
});

test('Interactive parsing waits for deferred scripts and DOMContentLoaded before entering the saved page', async () => {
  const h = harness();
  h.accounts();
  h.document.readyState = 'interactive';
  resolveSession(h); resolveIdentity(h); h.stages.role.resolve({ data: false });
  await settle();
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  assert.equal(h.trace.some(event => event.kind === 'chosen-page'), false);
  h.market(); await settle();
  assert.equal(opened(h).length, 0);
  h.ready(); await settle();
  assert.equal(h.context.AfriNav.current(), 'marketing');
  assert.equal(h.context.AfriStartup.state(), 'authenticated');
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
});

test('Verified guests open Marketplace once even if auth settles before its module', async () => {
  const h = harness({ cached: false });
  h.accounts();
  h.stages.session.resolve({ data: { session: null } });
  await settle();
  assert.equal(h.context.AfriStartup.state(), 'guest');
  assert.equal(opened(h).length, 0);
  h.market(); h.ready(); await settle();
  assert.equal(opened(h, 'public').length, 1);
  h.context.afriMarketInitial(); h.context.afriMarketInitial();
  h.context.AfriStartup.resolveAuth('guest'); await settle();
  assert.equal(opened(h, 'public').length, 1);
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
});

test('An invalid session signs out and opens the guest route after verification', async () => {
  const h = harness();
  h.accounts(); h.market(); h.ready();
  resolveSession(h); await settle();
  h.stages.identity.resolve({ error: { status: 401, message: 'Invalid session' }, data: { user: null } });
  await settle();
  assert.equal(h.context.AfriStartup.state(), 'guest');
  assert.equal(h.trace.filter(event => event.kind === 'signout').length, 1);
  assert.equal(h.localStorage.getItem(sessionKey), null);
  assert.equal(opened(h, 'public').length, 1);
  assert.equal(h.trace.some(event => event.kind === 'chosen-page'), false);
});

test('Transient identity, role and profile errors preserve the session and show a retry state', async () => {
  for (const failure of ['identity', 'role', 'profile']) {
    const h = harness({ profileError: failure === 'profile', access: failure === 'role' ? 'client' : 'shareholder_approved' });
    h.accounts(); h.market(); h.ready();
    resolveSession(h); await settle();
    if (failure === 'identity') h.stages.identity.resolve({ error: { message: 'Failed to fetch', status: 0 }, data: { user: null } });
    else {
      resolveIdentity(h);
      h.stages.role.resolve(failure === 'role' ? { data: null, error: { message: 'Network unavailable' } } : { data: false });
    }
    await settle();
    assert.equal(h.context.AfriStartup.state(), 'error', failure);
    assert.notEqual(h.localStorage.getItem(sessionKey), null, failure);
    assert.equal(h.trace.filter(event => event.kind === 'signout').length, 0, failure);
    assert.equal(opened(h).length, 0, failure);
    assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true, failure);
    assert.equal(h.document.getElementById('afStartupRetry').hidden, false, failure);
  }
});

test('Verified auth waits for a late saved page implementation before revealing a destination', async () => {
  const h = harness();
  const openMarketing = h.context.AfriOpenMarketing;
  delete h.context.AfriOpenMarketing;
  h.accounts(); h.market(); h.ready();
  resolveSession(h); resolveIdentity(h); h.stages.role.resolve({ data: false });
  await settle();
  assert.equal(h.context.AfriStartup.state(), 'authenticated');
  assert.equal(opened(h).length, 0);
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  h.context.AfriOpenMarketing = openMarketing;
  h.context.dispatchEvent({ type: 'afriflow:navigation-ready' });
  await settle();
  assert.equal(h.context.AfriNav.current(), 'marketing');
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
});

test('A formerly privileged saved page safely falls back to Home and completes startup', async () => {
  for (const route of ['admin', 'partners']) {
    const h = harness({ route });
    h.accounts(); h.market(); h.ready();
    resolveSession(h); resolveIdentity(h); h.stages.role.resolve({ data: false });
    await settle();
    assert.equal(h.context.AfriStartup.state(), 'authenticated', route);
    assert.equal(h.context.AfriNav.current(), 'home', route);
    assert.equal(h.document.getElementById('viewHost').style.display, 'none', route);
    assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false, route);
    assert.equal(opened(h).length, 0, route);
  }
});

test('An unknown saved page waits for cloud navigation before treating it as removed', async () => {
  const h = harness({ route: 'p_removed' });
  h.accounts(); h.market(); h.ready();
  resolveSession(h); resolveIdentity(h); h.stages.role.resolve({ data: false });
  await settle();
  assert.equal(h.context.AfriStartup.state(), 'authenticated');
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  h.context.dispatchEvent({ type: 'afriflow:navigation-ready' });
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  assert.equal(JSON.parse(h.sessionStorage.getItem(routeKey)).id, 'p_removed');
  h.context.dispatchEvent({ type: 'afriflow:workspace-ready' });
  await settle();
  assert.equal(h.context.AfriNav.current(), 'home');
  assert.equal(JSON.parse(h.sessionStorage.getItem(routeKey)).id, 'home');
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
  assert.equal(opened(h).length, 0);
});

test('Pending Censor access keeps startup covered, while confirmed denial returns to Home', async () => {
  const h = harness({ route: 'censor' });
  let permission = null;
  h.context.AfriOpenCensor = () => false;
  h.context.AfriCensorAccess = () => permission;
  h.accounts(); h.market(); h.ready();
  resolveSession(h); resolveIdentity(h); h.stages.role.resolve({ data: false });
  await settle();
  assert.equal(h.context.AfriStartup.state(), 'authenticated');
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  h.context.dispatchEvent({ type: 'afriflow:navigation-ready' });
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  permission = false;
  h.context.dispatchEvent({ type: 'afriflow:navigation-ready' });
  await settle();
  assert.equal(h.context.AfriNav.current(), 'home');
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
  assert.notEqual(h.localStorage.getItem(sessionKey), null);
  assert.equal(opened(h).length, 0);
});

test('Authenticated customers open their Marketplace once without a public intermediate page', async () => {
  const h = harness({ access: 'client' });
  h.accounts(); h.market(); h.ready();
  resolveSession(h); resolveIdentity(h); h.stages.role.resolve({ data: false });
  await settle();
  assert.equal(h.context.AfriStartup.state(), 'authenticated');
  assert.equal(opened(h, 'public').length, 0);
  assert.equal(opened(h, 'authenticated').length, 1);
  h.context.afriMarketInitial(); h.context.afriMarketInitial();
  assert.equal(opened(h, 'authenticated').length, 1);
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
});

test('OAuth URL recovery and SIGNED_IN events share one verification and one final route', async () => {
  const h = harness({ search: '?code=test-oauth-code' });
  h.accounts(); h.market(); h.ready();
  resolveSession(h); await settle();
  h.authEvent('SIGNED_IN'); h.timers(0); await settle();
  assert.equal(h.trace.filter(event => event.kind === 'identity-request').length, 1);
  assert.equal(opened(h).length, 0);
  resolveIdentity(h); h.stages.role.resolve({ data: false }); await settle();
  assert.equal(h.context.AfriStartup.state(), 'authenticated');
  assert.equal(h.trace.filter(event => event.kind === 'chosen-page').length, 1);
  h.authEvent('SIGNED_IN'); h.timers(0); await settle();
  assert.equal(h.trace.filter(event => event.kind === 'chosen-page').length, 1);
  assert.equal(h.trace.filter(event => event.kind === 'identity-request').length, 1);
  assert.equal(opened(h).length, 0);
});

test('Password recovery waits for DOM readiness and never opens the ordinary saved route', async () => {
  const h = harness({ hash: '#type=recovery&access_token=test-recovery-token' });
  h.accounts(); h.market();
  resolveSession(h); await settle();
  assert.equal(h.trace.filter(event => event.kind === 'recovery-open').length, 0);
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), true);
  h.ready(); await settle();
  assert.equal(h.context.AfriStartup.state(), 'recovery');
  assert.equal(h.trace.filter(event => event.kind === 'recovery-open').length, 1);
  h.authEvent('SIGNED_IN'); h.timers(0); await settle();
  assert.equal(h.trace.some(event => event.kind === 'identity-request' || event.kind === 'chosen-page'), false);
  assert.equal(opened(h).length, 0);
  assert.equal(h.document.documentElement.classList.contains('af-startup-pending'), false);
});

test('OAuth refusal mounts the sign-in error behind the startup screen before revealing it', async () => {
  const h = harness({ search: '?error=access_denied&error_description=Access%20denied' });
  h.accounts(); h.market(); await settle();
  assert.equal(opened(h).length, 0);
  h.ready(); await settle();
  assert.equal(h.context.AfriStartup.state(), 'login');
  assert.equal(h.trace.filter(event => event.kind === 'auth-open').length, 1);
  assert.notEqual(h.document.getElementById('authError').textContent, '');
  const authIndex = h.trace.findIndex(event => event.kind === 'auth-open');
  const releaseIndex = h.trace.findIndex(event => event.kind === 'class-removed' && event.name === 'af-startup-pending');
  assert.ok(releaseIndex > authIndex);
  assert.equal(h.trace.some(event => event.kind === 'chosen-page'), false);
});
