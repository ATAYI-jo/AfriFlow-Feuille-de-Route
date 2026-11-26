/* Exercise deployed-version checks without a browser, network, or credentials. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'updates.js'), 'utf8');

function harness(options = {}) {
  let now = 100000, version = 'initial', unavailable = false, reloads = 0;
  const intervals = [], elements = [], events = [];
  const storage = new Map([['afriflow_site_fingerprint_v2', options.stored || 'yesterday']]);
  function target() {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      dispatchEvent(event) {
        for (const fn of listeners.get(event.type) || []) fn(event);
      }
    };
  }
  function element(tagName) {
    const el = Object.assign(target(), {
      tagName: tagName.toUpperCase(), children: [], hidden: false, disabled: false,
      attributes: {}, style: {}, textContent: '',
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); },
      getAttribute(name) { return this.attributes[name]; },
      focus() { document.activeElement = this; },
      click() { if (!this.disabled) this.dispatchEvent({ type: 'click', target: this }); }
    });
    elements.push(el);
    return el;
  }
  const document = Object.assign(target(), {
    readyState: 'complete', hidden: false, activeElement: null,
    createElement: element,
    getElementById(id) { return elements.find(el => el.id === id) || null; },
    querySelector(selector) {
      return elements.find(el => ['afExcel', 'dwApp'].includes(el.id) && !el.hidden && selector.includes('#' + el.id)) || null;
    }
  });
  document.head = element('head');
  document.body = element('body');
  const window = Object.assign(target(), { document });
  window.addEventListener('afriflow-update-ready', event => events.push(event));
  const navigator = { onLine: true };
  const location = { href: 'https://afriflow.pages.dev/', origin: 'https://afriflow.pages.dev', search: '', hash: '', reload() { reloads++; } };
  const context = {
    window, document, navigator, location, URL, TextEncoder, Uint8Array,
    Date: class extends Date { static now() { return now; } },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    crypto: { subtle: { async digest(_, bytes) { return createHash('sha256').update(bytes).digest(); } } },
    async fetch(url) {
      const failed = unavailable;
      const content = url.endsWith('afriflow-alerts.js') ? version : 'unchanged source:' + url;
      return { ok: !failed, status: failed ? 503 : 200, async text() { return content; } };
    },
    setInterval(fn, delay) { intervals.push({ fn, delay }); },
    console
  };
  vm.runInNewContext(source, context, { filename: 'updates.js' });
  async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
  return {
    document, window, navigator, location, events, settle,
    get reloads() { return reloads; },
    setVersion(value) { version = value; },
    setUnavailable(value) { unavailable = value; },
    setEditorOpen(value, id = 'afExcel') {
      let editor = document.getElementById(id);
      if (!editor) { editor = element('section'); editor.id = id; document.body.appendChild(editor); }
      editor.hidden = !value;
    },
    notice() { return document.getElementById('afUpdateNotice'); },
    button(label) { return elements.find(el => el.tagName === 'BUTTON' && el.textContent === label); },
    async advance(ms = 120000) {
      now += ms;
      for (const timer of intervals) timer.fn();
      await settle();
    },
    async foreground() {
      document.hidden = false;
      window.dispatchEvent({ type: 'focus' });
      document.dispatchEvent({ type: 'visibilitychange' });
      await settle();
    }
  };
}

test('A stale saved fingerprint never reloads or flags the newly opened page', async () => {
  const app = harness({ stored: 'an-earlier-deployment' });
  await app.settle();
  await app.advance(120000);
  await app.foreground();
  await app.advance(240000);
  assert.equal(app.reloads, 0);
  assert.equal(app.events.length, 0);
  assert.ok(!app.notice() || app.notice().hidden);
});

test('A deployment while idle or returning to the foreground only offers an update', async () => {
  const app = harness();
  await app.settle();
  app.setVersion('deployment-2');
  await app.advance(120000);
  await app.foreground();
  app.window.dispatchEvent({ type: 'online' });
  app.window.dispatchEvent({ type: 'afriflow:refresh' });
  await app.settle();
  await app.advance(240000);
  assert.equal(app.reloads, 0);
  assert.equal(app.events.length, 1);
  assert.equal(app.notice().hidden, false);
  assert.equal(app.document.activeElement, null, 'The notice must not steal keyboard focus');
});

test('Reload happens once, only after the explicit Actualiser action', async () => {
  const app = harness();
  await app.settle();
  app.setVersion('deployment-2');
  await app.advance();
  app.button('Actualiser').click();
  app.button('Actualiser').click();
  await app.foreground();
  await app.advance();
  assert.equal(app.reloads, 1);
});

test('Plus tard dismisses that deployment for this page session', async () => {
  const app = harness();
  await app.settle();
  app.setVersion('deployment-2');
  await app.advance();
  app.button('Plus tard').click();
  assert.equal(app.notice().hidden, true);
  await app.advance();
  await app.foreground();
  assert.equal(app.notice().hidden, true);
  assert.equal(app.events.length, 1);
  assert.equal(app.reloads, 0);
  app.setVersion('deployment-3');
  await app.advance();
  assert.equal(app.notice().hidden, false);
  assert.equal(app.events.length, 2);
});

test('A failed deployment check neither announces an update nor reloads', async () => {
  const app = harness();
  await app.settle();
  app.setUnavailable(true);
  app.setVersion('deployment-2');
  await app.advance();
  await app.foreground();
  assert.equal(app.reloads, 0);
  assert.equal(app.events.length, 0);
  app.setUnavailable(false);
  await app.advance();
  assert.equal(app.events.length, 1, 'A later successful check still detects the real deployment');
});

test('The explicit update action cannot discard an open document or interrupt OAuth', async () => {
  const app = harness();
  await app.settle();
  app.setVersion('deployment-2');
  await app.advance();
  app.setEditorOpen(true);
  app.button('Actualiser').click();
  assert.equal(app.reloads, 0);
  app.setEditorOpen(false);
  app.setEditorOpen(true, 'dwApp');
  app.button('Actualiser').click();
  assert.equal(app.reloads, 0, 'The actual Word editor uses #dwApp and can have unfocused edits');
  app.setEditorOpen(false, 'dwApp');
  app.location.search = '?code=oauth-return';
  app.button('Actualiser').click();
  assert.equal(app.reloads, 0);
  app.location.search = '';
  app.navigator.onLine = false;
  app.button('Actualiser').click();
  assert.equal(app.reloads, 0);
  app.navigator.onLine = true;
  app.button('Actualiser').click();
  assert.equal(app.reloads, 1);
});

test('Background tabs wait until visible to display a detected update', async () => {
  const app = harness();
  await app.settle();
  app.document.hidden = true;
  app.setVersion('deployment-2');
  await app.advance();
  app.window.dispatchEvent({ type: 'online' });
  await app.settle();
  assert.ok(!app.notice() || app.notice().hidden);
  assert.equal(app.reloads, 0);
  await app.foreground();
  assert.equal(app.notice().hidden, false);
  assert.equal(app.reloads, 0);
});

test('A rollback to the loaded version removes an outdated update notice', async () => {
  const app = harness();
  await app.settle();
  app.setVersion('deployment-2');
  await app.advance();
  assert.equal(app.notice().hidden, false);
  app.setVersion('initial');
  await app.advance();
  assert.equal(app.notice().hidden, true);
  assert.equal(app.reloads, 0);
});
