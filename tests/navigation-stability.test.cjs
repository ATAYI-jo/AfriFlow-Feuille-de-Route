/* Navigation behavior, using the complete production workspace module and isolated DOM/network fakes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(process.env.AFRIFLOW_WORKSPACE_TEST_SOURCE || path.join(__dirname, '..', 'afriflow-workspace.js'), 'utf8');
const routeKey = 'afriflow_last_view_v1';
const email = 'member@example.test';

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
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function element(id) {
  const classes = new Set();
  return Object.assign(eventTarget(), {
    id, style: {}, dataset: {}, innerHTML: '', textContent: '', value: '',
    setAttribute() {}, removeAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value),
      contains: value => classes.has(value), toggle(value, on) { if (on) classes.add(value); else classes.delete(value); } }
  });
}
function harness(options = {}) {
  const nodes = new Map(), timeouts = [], intervals = [], scrolls = [], market = [], requests = [], events = [];
  const doc = Object.assign(eventTarget(), {
    readyState: options.readyState || 'loading', hidden: false, activeElement: null,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); },
    querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return element(''); },
    body: element('body')
  });
  const sessionStorage = storage(options.saved ? { [routeKey]: JSON.stringify(options.saved) } : {});
  const context = Object.assign(eventTarget(), {
    document: doc, sessionStorage, localStorage: storage(), console,
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    Event: class Event { constructor(type) { this.type = type; } },
    loggedUserEmail: options.email || email, USER_ROLE: options.role || 'reader',
    afriMarketSession: { access_mode: options.access || 'shareholder_approved' },
    __TABLE: 'afriflow_state',
    __sb: { from() {
      const request = { key: '' };
      const query = {
        select() { return query; }, eq(_field, value) { request.key = value; return query; },
        maybeSingle() {
          requests.push(request);
          return new Promise((resolve, reject) => { request.resolve = value => resolve({ data: { value } }); request.reject = reject; });
        }
      };
      return query;
    } },
    setTimeout(fn, ms) { const item = { fn, ms, active: true }; timeouts.push(item); return item; },
    clearTimeout(item) { if (item) item.active = false; },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {},
    scrollY: 0, scrollTo(x, y) { scrolls.push([x, y]); context.scrollY = y; },
    matchMedia() { return { matches: true }; },
    AFRI: { page() {} }, alert() {}, confirm() { return false; }
  });
  context.window = context;
  if (options.marketReady !== false) context.AfriMarket = { open(value) { market.push(value); } };
  context.addEventListener('afriflow:navigate', event => events.push({ id: event.detail.id, previous: event.detail.previous }));
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'afriflow-workspace.js' });
  const h = {
    context, doc, nodes, scrolls, market, requests, events,
    saved() { return JSON.parse(sessionStorage.getItem(routeKey) || 'null'); },
    ready() { doc.readyState = 'complete'; doc.dispatchEvent({ type: 'DOMContentLoaded' }); },
    signal() { context.dispatchEvent({ type: 'afriflow:navigation-ready' }); },
    navigate(id) {
      const button = { dataset: { id } };
      doc.getElementById('side').dispatchEvent({ type: 'click', target: { closest() { return button; } } });
    },
    timers(ms = 1100) {
      for (const item of [...timeouts]) {
        if (item.active && item.ms <= ms) { item.active = false; item.fn(); }
      }
    },
    poll() { for (const item of intervals.filter(item => item.ms === 30000)) item.fn(); },
    openAux(id, api, allowed = () => true) {
      const calls = [];
      context[api] = function(options) {
        if (!allowed()) return false;
        calls.push({ restore: options && options.restore });
        h.navigate('home');
        context.AfriNav.remember(id);
        doc.getElementById('viewHost').innerHTML = 'Visible ' + id;
        return true;
      };
      return calls;
    }
  };
  return h;
}
const saved = (id, y = 0, account = email) => ({ email: account, id, y });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('A saved Marketplace waits for parsed modules and can retry module readiness', () => {
  const h = harness({ saved: saved('market'), marketReady: false });
  h.context.onRole();
  assert.equal(h.market.length, 0);
  h.ready();
  assert.equal(h.market.length, 0);
  h.context.AfriMarket = { open(value) { h.market.push(value); } };
  h.signal();
  assert.equal(h.market.length, 1);
  assert.equal(h.saved().id, 'market');
  h.signal(); h.context.onRole();
  assert.equal(h.market.length, 1, 'Later role changes must not reopen the page');
});

test('Marketplace does not restore while the document is still parsing', () => {
  const h = harness({ saved: saved('market') });
  h.context.onRole();
  assert.equal(h.market.length, 0);
  h.ready();
  assert.equal(h.market.length, 1);
});

test('Auxiliary pages restore their route and original scroll after the Home cleanup', () => {
  for (const [id, api] of Object.entries({ documents: 'AfriOpenDocuments', marketing: 'AfriOpenMarketing',
    deadlines: 'AfriOpenDeadlines', censor: 'AfriOpenCensor', personal: 'AfriOpenPersonal' })) {
    const h = harness({ saved: saved(id, 620) });
    const calls = h.openAux(id, api);
    h.context.onRole(); h.ready(); h.timers();
    assert.deepEqual(calls, [{ restore: true }], id);
    assert.equal(h.saved().id, id);
    assert.equal(h.saved().y, 620, id + ' must preserve the snapshot through temporary Home');
    assert.deepEqual(h.scrolls.at(-1), [0, 620]);
  }
});

test('Censor restoration waits for its verified permission callback', () => {
  const h = harness({ saved: saved('censor') });
  let permitted = false;
  const calls = h.openAux('censor', 'AfriOpenCensor', () => permitted);
  h.ready(); h.context.onRole();
  assert.equal(calls.length, 0);
  permitted = true; h.signal();
  assert.equal(calls.length, 1);
});

test('Stored routes stay scoped to the account and verified workspace permission', () => {
  const mismatch = harness({ saved: saved('market', 10, 'another@example.test') });
  mismatch.ready(); mismatch.context.onRole();
  assert.equal(mismatch.market.length, 0);
  assert.equal(mismatch.context.AfriNav.saved(), null);
  for (const id of ['admin', 'partners']) {
    const h = harness({ saved: saved(id) });
    h.ready(); h.context.onRole();
    assert.equal(h.doc.getElementById('viewHost').innerHTML, '');
    assert.equal(h.requests.length, 0);
  }
  const client = harness({ saved: saved('documents'), access: 'client' });
  const calls = client.openAux('documents', 'AfriOpenDocuments');
  client.ready(); client.context.onRole(); client.signal();
  assert.equal(calls.length, 0);
});

test('An unknown saved cloud page restores once its navigation data arrives', () => {
  const h = harness({ saved: saved('p_cloud', 420) });
  h.ready(); h.context.onRole();
  assert.equal(h.requests.length, 0);
  h.context.applyExtra({ nav: [{ id: 'p_cloud', n: 'Cloud documents' }] });
  assert.equal(h.saved().id, 'p_cloud');
  assert.equal(h.requests.length, 1, 'Restoring cloud data should not render the page twice');
  assert.equal(h.requests[0].key, 'pub:p_cloud');
  h.timers();
  assert.equal(h.saved().y, 420);
  assert.deepEqual(h.scrolls.at(-1), [0, 420]);
});

test('Explicit navigation wins over delayed initial restoration', () => {
  const h = harness({ saved: saved('documents') });
  const calls = h.openAux('documents', 'AfriOpenDocuments');
  h.context.onRole();
  h.navigate('market');
  h.ready(); h.signal(); h.context.onRole();
  assert.equal(calls.length, 0);
  assert.equal(h.saved().id, 'market');
  const cloud = harness({ saved: saved('p_cloud') });
  cloud.ready(); cloud.context.onRole(); cloud.navigate('home');
  cloud.context.applyExtra({ nav: [{ id: 'p_cloud', n: 'Cloud documents' }] });
  assert.equal(cloud.requests.length, 0);
  assert.equal(cloud.saved().id, 'home');
});

test('Delayed scroll restoration yields to navigation or a user scroll gesture', () => {
  for (const action of ['navigation', 'wheel']) {
    const h = harness({ saved: saved('market', 850) });
    h.context.onRole(); h.ready(); h.context.onRole();
    if (action === 'navigation') { h.navigate('home'); h.navigate('market'); }
    else h.context.dispatchEvent({ type: 'wheel' });
    h.scrolls.length = 0;
    h.timers();
    assert.deepEqual(h.scrolls, [], action);
  }
});

test('Navigation events announce route changes without repeatedly closing the same page', () => {
  const h = harness();
  h.context.AfriNav.remember('documents');
  h.context.AfriNav.remember('documents');
  h.context.AfriNav.remember('deadlines');
  assert.deepEqual(h.events, [
    { id: 'documents', previous: 'home' },
    { id: 'deadlines', previous: 'documents' }
  ]);
});

test('A late publication response cannot replace a newer visit to the same page', async () => {
  const h = harness();
  h.navigate('direction');
  h.navigate('home');
  h.navigate('direction');
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ at: 2, docs: [] });
  await settle();
  const current = h.doc.getElementById('viewHost').innerHTML;
  assert.match(current, /Direction/);
  h.requests[0].reject(new Error('Earlier request failed'));
  await settle();
  assert.equal(h.doc.getElementById('viewHost').innerHTML, current);
});

test('A delayed background publication poll cannot send Documents back to Home', async () => {
  const h = harness();
  h.navigate('direction');
  h.requests[0].resolve({ at: 1, docs: [] });
  await settle();
  h.poll();
  assert.equal(h.requests.length, 2);
  h.openAux('documents', 'AfriOpenDocuments');
  h.context.AfriOpenDocuments();
  h.requests[1].resolve({ at: 2, docs: [] });
  await settle();
  assert.equal(h.saved().id, 'documents');
  assert.equal(h.doc.getElementById('viewHost').innerHTML, 'Visible documents');
});

test('A background update on the current page preserves its reading position', async () => {
  const h = harness();
  h.navigate('direction');
  h.requests[0].resolve({ at: 1, docs: [] });
  await settle();
  h.context.scrollY = 570;
  h.scrolls.length = 0;
  h.poll();
  h.requests[1].resolve({ at: 2, docs: [] });
  await settle();
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve({ at: 2, docs: [] });
  await settle();
  assert.deepEqual(h.scrolls, [[0, 570]]);
  assert.equal(h.saved().id, 'direction');
});

test('Cloud data does not rebuild a page while its form has focus', () => {
  const h = harness();
  h.doc.activeElement = { tagName: 'INPUT' };
  assert.equal(h.context.applyExtra({ nav: [{ id: 'p_cloud', n: 'Cloud documents' }] }), false);
  assert.equal(h.context.EXTRA.nav.length, 0);
});

test('Marketplace initialization respects an already verified administrator workspace', () => {
  const marketSource = fs.readFileSync(process.env.AFRIFLOW_MARKET_TEST_SOURCE || path.join(__dirname, '..', 'market.js'), 'utf8');
  const start = marketSource.indexOf('  window.afriMarketInitial = function () {');
  const end = marketSource.indexOf('  if (document.readyState', start);
  assert.ok(start >= 0 && end > start, 'Production initializer must be present');
  for (const scenario of [
    { role: 'admin', access: 'client', expected: [] },
    { role: 'reader', access: 'shareholder_approved', expected: [] },
    { role: 'reader', access: 'client', expected: ['authenticated'] },
    { role: 'reader', access: null, expected: ['public'] }
  ]) {
    const calls = [];
    const window = { afriMarketSession: scenario.access ? { access_mode: scenario.access } : null };
    vm.runInNewContext(marketSource.slice(start, end), { window,
      isAdmin: () => scenario.role === 'admin',
      shouldUseMarket: profile => profile.access_mode === 'client',
      open: context => calls.push(context.kind), openPublic: () => calls.push('public') });
    window.afriMarketInitial();
    assert.deepEqual(calls, scenario.expected, scenario.role + '/' + scenario.access);
  }
});
