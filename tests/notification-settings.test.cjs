const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'modules/collaboration/notification-settings.js'), 'utf8');

function harness(options = {}) {
  let document, enabled = false;
  const calls = [], nodes = [];
  function target() {
    const listeners = new Map();
    return { addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== fn)); },
      dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); } };
  }
  function element(tag) {
    let html = '';
    const node = Object.defineProperties(target(), Object.getOwnPropertyDescriptors({
      tagName: tag.toUpperCase(), children: [], parentNode: null, disabled: false, hidden: false, textContent: '', attrs: {},
      get isConnected() { return this === document?.body || !!this.parentNode?.isConnected; },
      get innerHTML() { return html; }, set innerHTML(value) {
        html = String(value); this.children.forEach(child => { child.parentNode = null; }); this.children = [];
        for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
          const child = element(match[1]); const id = /\bid="([^"]+)"/.exec(match[2]); if (id) child.id = id[1];
          this.appendChild(child);
        }
      },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
      contains(other) { return other === this || this.children.some(child => child.contains(other)); },
      setAttribute(name, value) { this.attrs[name] = value; },
      querySelectorAll(selector) { const result = []; function walk(root) { for (const child of root.children) { if (selector.startsWith('#') ? child.id === selector.slice(1) : child.tagName === selector.toUpperCase()) result.push(child); walk(child); } } walk(this); return result; },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      focus() { document.activeElement = this; }
    }));
    nodes.push(node); return node;
  }
  document = Object.assign(target(), { activeElement: null, createElement: element, getElementById(id) { return document.body.querySelector('#' + id); } });
  document.body = element('body');
  const window = Object.assign(target(), { loggedUserEmail: 'camille@example.test', document,
    AfriFlowAlerts: { enabled: () => enabled, enable() { calls.push('enable'); enabled = true; } },
    AfriFlowPush: {
      supported: () => options.supported !== false,
      async subscribe() { calls.push('subscribe'); return options.subscription || { ok: true }; },
      async registerAndroidNative() { calls.push('android'); },
      async diagnostics() { calls.push('diagnostics'); return options.diagnostics || { registered: true, server: true }; },
      test() { throw new Error('Settings must never send a test notification'); }
    }
  });
  if (options.kind === 'android') window.AfriFlowAndroid = { postMessage() {} };
  if (options.kind === 'desktop') window.AfriFlowNative = {};
  if (!options.noNotification) window.Notification = {
    permission: options.permission || 'default',
    async requestPermission() { calls.push('permission'); const value = await (options.permissionPromise || options.permissionResult || 'granted'); window.Notification.permission = value; return value; }
  };
  const navigator = { userAgent: options.ios ? 'Mozilla iPhone Safari' : 'Desktop browser', platform: '', maxTouchPoints: 0 };
  vm.runInNewContext(source, { window, document, navigator }, { filename: 'notification-settings.js' });
  return { window, document, calls, open: () => window.AfriNotificationSettings.open(),
    node: id => document.getElementById(id), click(id) { return document.getElementById(id).onclick(); } };
}

test('Loading and opening settings do not activate or request anything; Verify is read-only', async () => {
  const app = harness(); assert.deepEqual(app.calls, []);
  app.open(); assert.deepEqual(app.calls, []);
  assert.equal(app.document.activeElement.id, 'afNotifTitle');
  await app.click('afNotifVerify');
  assert.deepEqual(app.calls, ['diagnostics']);
  assert.match(app.node('afNotifMessage').textContent, /n’envoie aucune notification/);
});

test('Browser activation requests permission from the explicit click before subscribing', async () => {
  const app = harness(); app.open();
  await app.click('afNotifActivate');
  assert.deepEqual(app.calls, ['enable', 'permission', 'subscribe']);
  assert.match(app.node('afNotifStatus').innerHTML, /Appareil inscrit pour ce compte/);
});

test('Denied and unsupported browsers never prompt or subscribe', async () => {
  const denied = harness({ permission: 'denied' }); denied.open();
  assert.equal(denied.node('afNotifActivate').disabled, true); await denied.click('afNotifActivate');
  assert.deepEqual(denied.calls, []); assert.match(denied.node('afNotifGuide').textContent, /réglages de notifications du système/);
  const ios = harness({ supported: false, noNotification: true, ios: true }); ios.open();
  assert.equal(ios.node('afNotifActivate').disabled, true); await ios.click('afNotifActivate');
  assert.deepEqual(ios.calls, []); assert.match(ios.node('afNotifGuide').textContent, /écran d’accueil/);
});

test('Refused or dismissed permission is never reported as a successful subscription', async () => {
  for (const permissionResult of ['denied', 'default']) {
    const app = harness({ permissionResult }); app.open(); await app.click('afNotifActivate');
    assert.deepEqual(app.calls, ['enable', 'permission']);
    assert.doesNotMatch(app.node('afNotifStatus').innerHTML, /Appareil inscrit/);
  }
});

test('Changing accounts while permission is pending prevents subscription and closes the old panel', async () => {
  let grant; const permissionPromise = new Promise(resolve => { grant = resolve; });
  const app = harness({ permissionPromise }); app.open(); const activating = app.click('afNotifActivate');
  app.window.loggedUserEmail = 'different@example.test'; app.window.dispatchEvent({ type: 'afriflow:verified-role' });
  grant('granted'); await activating;
  assert.deepEqual(app.calls, ['enable', 'permission']); assert.equal(app.node('afNotifTitle'), null);
});

test('A late diagnostic result from a former account never reopens its settings', async () => {
  let complete; const diagnostics = new Promise(resolve => { complete = resolve; });
  const app = harness({ diagnostics }); app.open(); const reading = app.click('afNotifVerify');
  app.window.loggedUserEmail = ''; app.window.dispatchEvent({ type: 'afriflow:auth-ready' });
  complete({ registered: true, server: true }); await reading;
  assert.equal(app.node('afNotifTitle'), null); assert.deepEqual(app.calls, ['diagnostics']);
  assert.equal(app.open(), false);
});

test('Android activation keeps system registration unconfirmed even when the bridge returns no status', async () => {
  const app = harness({ kind: 'android', noNotification: true }); app.open();
  await app.click('afNotifActivate'); await app.click('afNotifVerify');
  assert.deepEqual(app.calls, ['enable', 'android']);
  assert.match(app.node('afNotifMessage').textContent, /n’est pas confirmée/);
  assert.doesNotMatch(app.node('afNotifMessage').textContent, /Demande d’activation effectuée|Appareil inscrit/);
  assert.equal(app.node('afNotifVerify').hidden, true);
});

test('Reverse Tab from the initially focused title stays inside notification settings', () => {
  const app = harness(); app.open();
  assert.equal(app.document.activeElement.id, 'afNotifTitle');
  const event = { type: 'keydown', key: 'Tab', shiftKey: true, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } };
  app.document.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(app.document.activeElement.id, 'afNotifActivate');
});

test('An inert settings dialog ignores call keyboard handling and survives the call dismissal', () => {
  const app = harness(); app.open();
  const overlay = app.document.body.children[0]; overlay.inert = true;
  const escape = { type: 'keydown', key: 'Escape', defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } };
  app.document.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, false); assert.ok(app.node('afNotifTitle'));
  overlay.inert = false;
  app.document.dispatchEvent({ ...escape, defaultPrevented: true });
  assert.ok(app.node('afNotifTitle'), 'Escape already consumed by the call cannot close the underlying settings');
  app.document.dispatchEvent({ ...escape });
  assert.equal(app.node('afNotifTitle'), null);
});

test('Windows activation explains the tray and exit limit without browser push calls', async () => {
  const app = harness({ kind: 'desktop' }); app.open(); await app.click('afNotifActivate');
  assert.deepEqual(app.calls, ['enable']);
  assert.match(app.node('afNotifGuide').textContent, /Quitter complètement l’application interrompt/);
  assert.equal(app.node('afNotifVerify').hidden, true);
});
