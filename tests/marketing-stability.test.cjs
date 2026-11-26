/* Execute both production Marketing adapters with controlled, out-of-order cloud replies.
   The tiny DOM models connected nodes, bubbling input and queued mutation observers;
   unrelated page timers are registered but never advanced. No network is used. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const index = fs.readFileSync(process.env.AFRIFLOW_MARKETING_TEST_SOURCE || path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.includes('async function marketing()') || source.includes('async function mk()'));
assert.equal(scripts.length, 2, 'Exercise both real inline Marketing adapters');

function harness({ role = 'admin' } = {}) {
  const observers = [], frames = [], requests = [], timers = [];
  let document;
  function target() {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== fn)); },
      dispatchEvent(event) {
        event.target ||= this;
        event.preventDefault ||= function () {};
        for (const fn of listeners.get(event.type) || []) fn.call(this, event);
        if (typeof this['on' + event.type] === 'function') this['on' + event.type](event);
        if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
        return true;
      }
    };
  }
  function changed(node) {
    for (const observer of observers) {
      if (observer.options.childList && (observer.node === node || observer.options.subtree && observer.node.contains(node))) observer.pending = true;
    }
  }
  const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  function matches(node, selector) {
    if (node.tagName === '#TEXT') return false;
    if (selector === '*') return true;
    const tag = selector.match(/^[a-z][\w-]*/i);
    if (tag && node.tagName !== tag[0].toUpperCase()) return false;
    const id = selector.match(/#([\w-]+)/);
    if (id && node.id !== id[1]) return false;
    for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(match[1])) return false;
    for (const match of selector.matchAll(/\[([^=\]\s]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
      if (!node.hasAttribute(match[1]) || match[2] != null && node.getAttribute(match[1]) !== match[2]) return false;
    }
    return true;
  }
  function query(root, selector) {
    const selectors = selector.split(',').map(value => value.trim());
    const result = [];
    function walk(node) {
      for (const child of node.children) {
        if (selectors.some(value => {
          const parts = value.split(/\s+/), last = parts.pop();
          if (!matches(child, last)) return false;
          let ancestor = child.parentNode;
          while (parts.length) {
            const part = parts.pop();
            while (ancestor && !matches(ancestor, part)) ancestor = ancestor.parentNode;
            if (!ancestor) return false;
            ancestor = ancestor.parentNode;
          }
          return true;
        })) result.push(child);
        walk(child);
      }
    }
    walk(root);
    return result;
  }
  function element(tagName) {
    let html = '', text = '';
    const attributes = new Map();
    const node = Object.defineProperties(target(), Object.getOwnPropertyDescriptors({
      tagName: tagName.toUpperCase(), children: [], dataset: {}, style: {}, parentNode: null,
      get attributes() { return [...attributes].map(([name, value]) => ({ name, value })); },
      get isConnected() { return this === document?.body || !!this.parentNode?.isConnected; },
      get nextElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; },
      get firstElementChild() { return this.children[0] || null; },
      get isContentEditable() { return this.getAttribute('contenteditable') === 'true'; },
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = String(value); text = html.replace(/<[^>]*>/g, '');
        this.children.forEach(child => { child.parentNode = null; }); this.children = [];
        const stack = [this];
        for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
          if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
          if (!token.startsWith('<')) continue;
          const match = token.match(/^<([\w-]+)/); if (!match) continue;
          const child = element(match[1]);
          for (const attribute of token.slice(match[0].length, -1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
            child.setAttribute(attribute[1], attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
          }
          const parent = stack[stack.length - 1]; parent.children.push(child); child.parentNode = parent;
          if (!/^(?:br|hr|img|input|meta|link)$/i.test(match[1]) && !token.endsWith('/>')) stack.push(child);
        }
        changed(this);
      },
      get textContent() { return text; },
      set textContent(value) { text = String(value); html = text; this.children.forEach(child => { child.parentNode = null; }); this.children = []; changed(this); },
      setAttribute(name, value) { value = String(value); attributes.set(name, value); if (name === 'id') this.id = value; if (name === 'class') this.className = value; if (name.startsWith('data-')) this.dataset[dataKey(name)] = value; },
      getAttribute(name) { if (name === 'id') return this.id || null; if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null; return attributes.get(name) ?? null; },
      hasAttribute(name) { return this.getAttribute(name) !== null; },
      removeAttribute(name) { attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataKey(name)]; },
      contains(other) { return other === this || this.children.some(child => child.contains(other)); },
      appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); changed(this); return child; },
      prepend(child) { child.remove(); child.parentNode = this; this.children.unshift(child); changed(this); },
      before(child) { const parent = this.parentNode; if (!parent) return; child.remove(); child.parentNode = parent; parent.children.splice(parent.children.indexOf(this), 0, child); changed(parent); },
      remove() { if (!this.parentNode) return; const parent = this.parentNode; parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null; changed(parent); },
      querySelectorAll(selector) { return query(this, selector); },
      querySelector(selector) { return query(this, selector)[0] || null; },
      closest(selector) { return matches(this, selector) ? this : this.parentNode?.closest(selector) || null; },
      focus() { document.activeElement = this; },
      click() { this.dispatchEvent({ type: 'click', bubbles: true }); }
    }));
    node.classList = { contains: cls => String(node.className || '').split(/\s+/).includes(cls) };
    if (tagName === 'template') node.content = node;
    return node;
  }
  document = Object.assign(target(), {
    activeElement: null, createElement: element,
    getElementById(id) { return document.body.querySelector('#' + id); },
    querySelector(selector) { return document.body.querySelector(selector); },
    querySelectorAll(selector) { return document.body.querySelectorAll(selector); }
  });
  document.body = element('body');
  const host = element('section'); host.id = 'viewHost'; document.body.appendChild(host);
  const window = Object.assign(target(), { document, loggedUserEmail: 'admin@example.test', USER_ROLE: role, toast() {}, getSelection() { return { rangeCount: 0 }; } });
  window.__sb = { from() { return { select() { return this; }, eq(_, key) { this.key = key; return this; }, maybeSingle() {
    const key = this.key;
    return new Promise(resolve => requests.push({ key, resolve }));
  } }; } };
  const context = { window, document, console, alert() {},
    setInterval(fn, ms) { timers.push({ fn, ms }); }, setTimeout(fn, ms) { timers.push({ fn, ms }); },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; }
      observe(node, options) { this.node = node; this.options = options; observers.push(this); }
    }
  };
  for (const [i, source] of scripts.entries()) vm.runInNewContext(source, context, { filename: 'index.html:marketing-adapter-' + (i + 1) });
  async function settle() {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      const pending = observers.filter(observer => observer.pending);
      pending.forEach(observer => { observer.pending = false; observer.fn([]); });
      frames.splice(0).forEach(fn => fn());
    }
  }
  return {
    document, window, host, requests, settle,
    doc() { return document.getElementById('mkDoc'); },
    toolbar() { return document.getElementById('mkBar2') || document.getElementById('mkBar'); },
    async visit() { host.innerHTML = '<div class="fdr" data-fdr-view="marketing"><h3>Échéances</h3><div id="b-dl"></div></div>'; await settle(); return this.doc(); },
    async reply(request, html) { request.resolve({ data: html == null ? null : { value: { html } } }); await settle(); },
    async reject(request) { request.resolve({ data: null, error: { message: 'Network unavailable' } }); await settle(); },
    async type(html, notify = true) { const doc = this.doc(); doc.innerHTML = html; if (notify) doc.dispatchEvent({ type: 'input', bubbles: true }); await settle(); }
  };
}

test('Marketing has one loader per visit and becomes editable only after the saved document is loaded', async () => {
  const app = harness(); const doc = await app.visit();
  assert.equal(app.requests.length, 1, 'The two adapters must not fetch and replace the same document independently');
  assert.equal(doc.isContentEditable, false);
  assert.equal(app.toolbar(), null);
  app.host.appendChild(app.document.createElement('span')); await app.settle();
  assert.equal(app.requests.length, 1, 'Subsequent subtree changes must not start another load');
  await app.reply(app.requests[0], '<h2>Published marketing plan</h2>');
  assert.equal(doc.innerHTML, '<h2>Published marketing plan</h2>');
  assert.equal(doc.isContentEditable, true);
  assert.ok(app.toolbar());
  assert.equal(app.requests.length, 1);
});

test('Late responses from a previous Marketing visit cannot replace the current document', async () => {
  const app = harness(); const oldDoc = await app.visit(); const oldRequests = app.requests.slice();
  const currentDoc = await app.visit(); const newRequests = app.requests.slice(oldRequests.length);
  for (const request of newRequests) await app.reply(request, '<p>Current visit</p>');
  for (const request of oldRequests) await app.reply(request, '<p>Stale previous visit</p>');
  assert.equal(oldDoc.isConnected, false);
  assert.equal(currentDoc.innerHTML, '<p>Current visit</p>');
  assert.equal(app.doc(), currentDoc);
  assert.equal(app.document.querySelectorAll('#mkBar2').length, 1);
});

test('Pending Marketing data never overwrites input made before its response', async () => {
  const app = harness(); await app.visit();
  await app.type('<p>My unsaved changes</p>');
  for (const request of app.requests.slice()) await app.reply(request, '<p>Older published copy</p>');
  assert.equal(app.doc().innerHTML, '<p>My unsaved changes</p>');
});

test('A programmatic edit is protected even without a native input event', async () => {
  const app = harness(); await app.visit();
  await app.type('<p>Content inserted by an editor command</p>', false);
  for (const request of app.requests.slice()) await app.reply(request, '<p>Older published copy</p>');
  assert.equal(app.doc().innerHTML, '<p>Content inserted by an editor command</p>');
});

test('A pending response from a previous account is ignored', async () => {
  const app = harness(); await app.visit();
  const before = app.doc().innerHTML;
  app.window.loggedUserEmail = 'different@example.test'; app.window.USER_ROLE = 'shareholder';
  for (const request of app.requests.slice()) await app.reply(request, '<p>Previous account response</p>');
  assert.equal(app.doc().innerHTML, before);
  assert.equal(app.doc().isContentEditable, false);
  assert.equal(app.toolbar(), null);
});

test('A reader receives the existing default document without administrator editing controls', async () => {
  const app = harness({ role: 'shareholder' }); await app.visit();
  for (const request of app.requests.slice()) await app.reply(request, null);
  assert.match(app.doc().innerHTML, /Feuille de route marketing opérationnelle/);
  assert.equal(app.doc().isContentEditable, false);
  assert.equal(app.toolbar(), null);
});

test('A cloud failure offers a local retry without treating the missing response as an empty document', async () => {
  const app = harness(); await app.visit();
  await app.reject(app.requests[0]);
  assert.equal(app.doc().isContentEditable, false);
  assert.doesNotMatch(app.doc().innerHTML, /Feuille de route marketing opérationnelle/);
  const retry = app.doc().querySelector('[data-mk-retry]');
  assert.ok(retry, 'Keep the current route and provide an explicit document retry');
  retry.click(); await app.settle();
  assert.equal(app.requests.length, 2);
  await app.reply(app.requests[1], '<p>Recovered saved document</p>');
  assert.equal(app.doc().innerHTML, '<p>Recovered saved document</p>');
  assert.equal(app.doc().isContentEditable, true);
  assert.ok(app.toolbar());
});
