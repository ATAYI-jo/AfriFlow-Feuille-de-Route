const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.AFRIFLOW_PUSH_TEST_SOURCE || path.join(__dirname, '..', 'afriflow-push.js'), 'utf8');

function harness(initiallyEnabled, options = {}) {
  let enabled = initiallyEnabled, subscription = null;
  const calls = { subscribe: 0, upsert: 0, getUser: 0, getSession: 0, fetch: [] }, timers = [], storage = new Map();
  const account = 'camille@example.test';
  function target() { const listeners = new Map(); return { addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); }, dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); } }; }
  const worker = { pushManager: { async getSubscription() { return subscription; }, async subscribe() {
    calls.subscribe++;
    subscription = { toJSON() { return { endpoint: 'https://push.example.test/device', keys: { p256dh: 'fake-public', auth: 'fake-auth' } }; }, async unsubscribe() { subscription = null; return true; } };
    return subscription;
  } } };
  const api = { auth: {
    async getUser() { calls.getUser++; return { data: { user: { email: account } } }; },
    async getSession() { calls.getSession++; return { data: { session: { access_token: 'fake-jwt-for-test', user: { email: account } } } }; }
  }, from() { return { async upsert() { calls.upsert++; return { error: null }; }, delete() { return { eq() { return this; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } }; } }; } };
  const document = Object.assign(target(), { readyState: 'complete', hidden: false });
  const navigator = { serviceWorker: { ready: options.workerReady || Promise.resolve(worker) } };
  const Notification = { permission: 'granted', requestPermission() { throw new Error('No automatic permission prompt allowed'); } };
  const window = Object.assign(target(), { loggedUserEmail: account, isSecureContext: true, PushManager: function () {}, Notification,
    __sb: api, AfriFlowAlerts: { enabled: () => enabled } });
  vm.runInNewContext(source, { window, document, navigator, Notification, atob, Uint8Array, Date,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setInterval(fn) { timers.push(fn); }, console: { info() {} },
    async fetch(url, request = {}) { calls.fetch.push({ method: request.method || 'GET', body: request.body && JSON.parse(request.body), authorization: request.headers?.Authorization }); if (request.method !== 'POST' && options.publicKeyReady) await options.publicKeyReady; return { ok: true, async json() { return request.method === 'POST' ? { sent: 1 } : { publicKey: 'AQID' }; } }; }
  }, { filename: 'afriflow-push.js' });
  async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
  return { calls, window, document, worker, timers, settle, disable() { enabled = false; }, api: window.AfriFlowPush };
}

test('Granted OS permission never re-enrolls this browser after explicit AfriFlow opt-out', async () => {
  const app = harness(true); await app.settle();
  assert.equal(app.calls.subscribe, 1, 'Initial authorized enrollment proves the registration path is exercised');
  app.disable(); await app.api.unsubscribe();
  const before = structuredClone(app.calls);
  app.window.dispatchEvent({ type: 'focus' }); app.window.dispatchEvent({ type: 'online' });
  app.document.dispatchEvent({ type: 'visibilitychange' }); app.timers.forEach(fn => fn());
  await app.settle();
  assert.deepEqual(app.calls, before);
  const explicit = await app.api.subscribe();
  assert.equal(explicit.ok, false); assert.equal(explicit.reason, 'alerts_disabled');
});

test('An opted-out sender delivers the authorized message request without subscribing itself', async () => {
  const app = harness(false); await app.settle();
  const result = await app.api.notifyMessage('message-fixture-1');
  assert.equal(result.ok, true);
  assert.equal(app.calls.subscribe, 0); assert.equal(app.calls.upsert, 0); assert.equal(app.calls.getUser, 0);
  assert.equal(app.calls.getSession, 1); assert.equal(app.calls.fetch.length, 1);
  assert.deepEqual(app.calls.fetch[0], { method: 'POST', body: { action: 'message', message_key: 'message-fixture-1' }, authorization: 'Bearer fake-jwt-for-test' });
});

test('Disabling alerts while the public key is loading prevents subscription and persistence', async () => {
  let release;
  const publicKeyReady = new Promise(resolve => { release = resolve; });
  const app = harness(true, { publicKeyReady }); await app.settle();
  assert.equal(app.calls.getUser, 1);
  assert.equal(app.calls.fetch.length, 1, 'Enrollment is waiting for the public key response');
  assert.equal(app.calls.subscribe, 0);
  const pending = app.api.subscribe();
  app.disable(); release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(app.calls.subscribe, 0); assert.equal(app.calls.upsert, 0);
});

test('An account change while the worker is loading abandons the former account enrollment', async () => {
  let release;
  const workerReady = new Promise(resolve => { release = resolve; });
  const app = harness(true, { workerReady }); await app.settle();
  assert.equal(app.calls.getUser, 1, 'The initial account was verified before the worker wait');
  assert.equal(app.calls.fetch.length, 0); assert.equal(app.calls.subscribe, 0);
  const pending = app.api.subscribe();
  app.window.loggedUserEmail = 'different@example.test'; release(app.worker);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(app.calls.subscribe, 0); assert.equal(app.calls.upsert, 0);
});
