const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function documentsHarness(responses) {
  const host = { innerHTML: '', style: {} };
  const home = { style: {} };
  const events = new EventTarget();
  const routes = [];
  const scrolls = [];
  let current = 'home';
  const context = {
    Event, CustomEvent, console,
    loggedUserEmail: 'member@example.test', USER_ROLE: 'reader',
    setTimeout: () => 1,
    addEventListener: events.addEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    scrollTo: (...args) => scrolls.push(args),
    AFRI: { page() {} },
    document: {
      getElementById: id => id === 'viewHost' ? host : id === 'view-home' ? home : null,
      querySelector: selector => selector.includes('[data-id="home"]')
        ? { click: () => context.AfriNav.remember('home') } : null,
      dispatchEvent() {}
    },
    __sb: { from: () => ({ select: () => ({ eq: () => ({
      maybeSingle: () => {
        assert.ok(responses.length, 'Unexpected document reload');
        return responses.shift().promise;
      }
    }) }) }) }
  };
  context.AfriNav = {
    current: () => current,
    remember(id) {
      routes.push(id);
      if (id === current) return;
      const previous = current;
      current = id;
      events.dispatchEvent(new CustomEvent('afriflow:navigate', { detail: { id, previous } }));
    }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'modules/documents/dropbox-browser.js'), 'utf8'), context);
  return { context, host, routes, scrolls };
}

test('Documents records its actual route after the Home cleanup', async () => {
  const pending = deferred();
  const { context, host, routes, scrolls } = documentsHarness([pending]);
  assert.equal(context.AfriOpenDocuments({ restore: true }), true);
  assert.deepEqual(routes, ['home', 'documents']);
  assert.equal(context.AfriNav.current(), 'documents');
  assert.deepEqual(scrolls, [], 'Restoration must leave scroll positioning to the router');
  pending.resolve({ data: { value: { items: [] } } });
  await flush();
  assert.match(host.innerHTML, /Aucun document/);
});

test('A delayed Documents response cannot replace a newly selected page', async () => {
  const pending = deferred();
  const { context, host } = documentsHarness([pending]);
  context.AfriOpenDocuments();
  context.AfriNav.remember('marketing');
  host.innerHTML = '<h1>Marketing</h1>';
  pending.resolve({ data: { value: { items: [] } } });
  await flush();
  assert.equal(host.innerHTML, '<h1>Marketing</h1>');
});

test('An earlier Documents request cannot overwrite a later visit', async () => {
  const first = deferred(), second = deferred();
  const { context, host } = documentsHarness([first, second]);
  context.AfriOpenDocuments();
  context.AfriNav.remember('marketing');
  context.AfriOpenDocuments();
  second.resolve({ data: { value: { items: [{ path: '/latest.pdf', title: 'Current document' }] } } });
  await flush();
  assert.match(host.innerHTML, /Current document/);
  first.resolve({ data: { value: { items: [{ path: '/old.pdf', title: 'Stale document' }] } } });
  await flush();
  assert.match(host.innerHTML, /Current document/);
  assert.doesNotMatch(host.innerHTML, /Stale document/);
});

test('Document restoration never opens for an anonymous visitor', () => {
  const { context, host, routes } = documentsHarness([]);
  context.loggedUserEmail = '';
  assert.equal(context.AfriOpenDocuments({ restore: true }), false);
  assert.equal(host.innerHTML, '');
  assert.deepEqual(routes, []);
});
