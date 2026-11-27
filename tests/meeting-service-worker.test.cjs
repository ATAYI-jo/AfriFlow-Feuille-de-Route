const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const ORIGIN = 'https://afriflow.pages.dev/';
const ID = 'mabc123';

async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
function worker(options = {}) {
  const listeners = new Map(), opened = [], posted = [], timers = [], channels = [];
  let focused = 0, closed = 0;
  const client = {
    url: ORIGIN + '?draft=unsaved', visibilityState: 'visible',
    focus: async () => { focused++; return client; },
    navigate() { throw new Error('Notification click must never navigate an existing page'); },
    postMessage(data, ports) {
      posted.push(data);
      if (options.throws) throw new Error('Client disappeared');
      if (options.ack) ports[0].postMessage({ accepted: true });
      if (options.badAck) ports[0].postMessage({ accepted: false });
    },
  };
  class MessageChannel {
    constructor() {
      this.port1 = { onmessage: null, onmessageerror: null, close() {} };
      this.port2 = { postMessage: data => { if (this.port1.onmessage) this.port1.onmessage({ data }); }, close() {} };
      channels.push(this);
    }
  }
  const context = {
    URL, Promise, Date, Response, crypto:require('node:crypto').webcrypto,
    caches:{open:async()=>({keys:async()=>[],put:async key=>options.receipts.push(key)})}, MessageChannel: options.noChannel ? undefined : MessageChannel,
    setTimeout(fn, ms) { const timer = { fn, ms, active: true }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.active = false; },
    self: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      registration: { scope: ORIGIN },
      clients: { matchAll: async () => options.noClient ? [] : [client],
        openWindow: async url => { opened.push(url); return {}; } },
    },
  };
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  return {
    opened, posted, timers, channels, client,
    get focused() { return focused; }, get closed() { return closed; },
    click(data = { meetingId: ID }, action = 'join') {
      let task = Promise.resolve();
      listeners.get('notificationclick')({ action,
        notification: { data, close() { closed++; } }, waitUntil(value) { task = value; } });
      return task;
    },
    expire() { for (const timer of timers) if (timer.active) { timer.active = false; timer.fn(); } },
  };
}

test('a notification uses the acknowledged app preview without opening another page or Teams', async () => {
  const h = worker({ ack: true }); await h.click();
  assert.equal(h.focused, 1); assert.equal(h.opened.length, 0);
  assert.equal(h.posted.length, 1); assert.equal(h.posted[0].type, 'afriflow:meeting-request');
  assert.equal(h.posted[0].meetingId, ID); assert.equal(h.posted[0].source, 'push');
  assert.equal(h.client.url, ORIGIN + '?draft=unsaved');
  assert.equal(h.timers[0].active, false);
});

test('an old page that ignores the invitation gets a fresh same-origin fallback after 400ms', async () => {
  const h = worker(); const clicked = h.click(); await settle();
  assert.equal(h.opened.length, 0); assert.equal(h.focused, 0);
  assert.equal(h.timers[0].ms, 400);
  h.expire(); await clicked;
  assert.deepEqual(h.opened, [ORIGIN + '?meeting=' + ID]);
  assert.equal(h.client.url, ORIGIN + '?draft=unsaved');
  assert.equal(h.focused, 0, 'an unacknowledged old page is not mistaken for a working preview');
  h.channels[0].port2.postMessage({ accepted: true }); await settle();
  assert.equal(h.opened.length, 1, 'a late acknowledgement cannot trigger a duplicate action');
});

test('explicit rejection, disappearing clients and missing MessageChannel all fall back safely', async () => {
  for (const options of [{ badAck: true }, { throws: true }, { noChannel: true }]) {
    const h = worker(options); await h.click();
    assert.deepEqual(h.opened, [ORIGIN + '?meeting=' + ID]);
    assert.equal(h.focused, 0);
  }
});

test('closed apps open the meeting preview; forged and legacy external targets are ignored', async () => {
  const h = worker({ noClient: true });
  await h.click({ meetingId: ID, url: 'https://evil.test/', teamsUrl: 'https://teams.microsoft.com/l/meetup-join/legacy' });
  assert.deepEqual(h.opened, [ORIGIN + '?meeting=' + ID]);
  const legacy = worker({ noClient: true });
  await legacy.click({ url: 'https://evil.test/', teamsUrl: 'https://teams.microsoft.com/l/meetup-join/legacy', kind: 'meeting' });
  assert.deepEqual(legacy.opened, [ORIGIN]);
  const invalid = worker({ noClient: true }); await invalid.click({ meetingId: '../external' });
  assert.deepEqual(invalid.opened, [ORIGIN]);
});

test('dismiss closes the notification without navigating, previewing or recording attendance', async () => {
  const h = worker(); await h.click({ meetingId: ID }, 'dismiss');
  assert.equal(h.closed, 1); assert.equal(h.opened.length, 0); assert.equal(h.posted.length, 0); assert.equal(h.focused, 0);
});

test('a start notification tap opens a one-use acceptance link even without action buttons',async()=>{
  for(const action of ['', 'accept']){
    const receipts=[],h=worker({noClient:true,receipts});
    await h.click({meetingId:ID,kind:'meeting',stage:'start',expiresAt:Date.now()+60000},action);
    const opened=new URL(h.opened[0]), receipt=new URL(receipts[0]);
    assert.equal(opened.origin,ORIGIN.slice(0,-1));
    assert.equal(opened.searchParams.get('meeting'),ID);
    assert.equal(new URLSearchParams(opened.hash.slice(1)).get('accept'),receipt.searchParams.get('tap'));
    assert.equal(receipt.searchParams.get('meeting'),ID);
  }
});
