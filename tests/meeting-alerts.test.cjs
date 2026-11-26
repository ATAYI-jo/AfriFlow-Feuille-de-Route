const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.AFRIFLOW_ALERTS_TEST_SOURCE || path.join(__dirname, '..', 'afriflow-alerts.js'), 'utf8');

function harness(options = {}) {
  let now = options.now || 1800000000000, monotonic = 0, nextTimer = 0, document;
  const timers = new Map(), joins = [], notifications = [], nativeNotices = [], requests = [], vibrations = [];
  const storage = new Map(options.legacyChoice ? [['afriflow_alerts_enabled_v1', options.legacyChoice]] : []);
  const owner = 'member@example.test';
  function events() {
    const handlers = new Map();
    return {
      addEventListener(name, fn) { handlers.set(name, [...(handlers.get(name) || []), fn]); },
      dispatchEvent(event) {
        event.target ||= this; event.preventDefault ||= function () { this.defaultPrevented = true; };
        for (const handler of handlers.get(event.type) || []) handler.call(this, event);
        return !event.defaultPrevented;
      }
    };
  }
  function element(tagName) {
    const node = Object.assign(events(), {
      tagName: tagName.toUpperCase(), children: [], parentNode: null, style: {}, attributes: {},
      hidden: false, inert: false, disabled: false, textContent: '',
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = value; if (name === 'hidden') this.hidden = true; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      contains(child) { return child === this || this.children.some(node => node.contains(child)); },
      querySelectorAll(selector) {
        return this.children.flatMap(child => [
          ...((selector === 'button' && child.tagName === 'BUTTON' || selector === '#' + child.id) ? [child] : []),
          ...child.querySelectorAll(selector)
        ]);
      },
      focus() { document.activeElement = this; document.dispatchEvent({ type: 'focusin' }); },
      click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
    });
    Object.defineProperty(node, 'isConnected', { get() { return node === document.body || !!node.parentNode?.isConnected; } });
    return node;
  }
  document = Object.assign(events(), {
    readyState: 'complete', hidden: !!options.hidden,
    createElement: element, createElementNS: (_, tag) => element(tag),
    getElementById(id) { return this.body.querySelectorAll('#' + id)[0] || null; }
  });
  document.body = element('body'); document.body.style.overflow = 'auto';
  const original = document.body.appendChild(element('button')); original.id = 'origin'; document.activeElement = original;
  const window = Object.assign(events(), { document, loggedUserEmail: owner });
  if (options.android) window.AfriFlowAndroid = {};
  if (options.desktop) window.AfriFlowNative = {
    meetingInvitationsVersion: options.legacyDesktop ? 0 : 1,
    isBackground: () => !!options.hidden,
    presentIncomingMeeting: data => nativeNotices.push(data),
    notify: data => nativeNotices.push(data),
    onIncomingMeeting: fn => { window.incomingMeeting = fn; }
  };
  window.AfriMeetings = { join(id, settings) {
    return new Promise((resolve, reject) => joins.push({ id, settings, resolve, reject }));
  } };
  window.addEventListener('afriflow:meeting-request', event => requests.push(event.detail));
  const meeting = (extra = {}) => ({ id: 'm123abc', title: 'Point d’équipe', start: now - 10000, dur: 60,
    link: 'https://teams.microsoft.com/l/meetup-join/example', invitees: [owner], ...extra });
  let meetings = options.meetings ? options.meetings(meeting) : [];
  window.__sb = { from() {
    const query = {
      pattern: '', select() { return this; }, like(_, value) { this.pattern = value; return this; },
      eq(_, value) { this.pattern = value; return this; }, order() { return this; }, limit() { return this; },
      maybeSingle() { return this; }, then(resolve) { return Promise.resolve({ data: this.pattern === 'meet:%' ? meetings.map(value => ({ value })) : [] }).then(resolve); }
    };
    return query;
  } };
  const context = {
    window, document, navigator: { onLine: true, vibrate(value) { vibrations.push(value); } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    Date: class extends Date { static now() { return now; } },
    performance: { now: () => monotonic },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms, at: monotonic + ms, interval: false }); return id; },
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms, at: monotonic + ms, interval: true }); return id; },
    clearTimeout(id) { timers.delete(id); }, clearInterval(id) { timers.delete(id); },
    Notification: class { constructor(title, details) { notifications.push({ title, details }); } }, console
  };
  vm.runInNewContext(source, context, { filename: 'afriflow-alerts.js' });
  if(options.enabled)window.AfriFlowAlerts.enable();
  async function settle() { for (let i = 0; i < 25; i++) await Promise.resolve(); }
  return {
    window, document, navigator: context.navigator, storage, original, joins, notifications, nativeNotices, requests, vibrations, timers, meeting, settle,
    get(id) { return document.getElementById(id); },
    show(value = meeting(), settings) { return window.AfriFlowAlerts.showMeeting(value, settings); },
    setMeetings(value) { meetings = value; },
    shiftWallClock(ms) { now += ms; },
    async poll() { window.dispatchEvent({ type: 'afriflow:refresh' }); await settle(); },
    async advance(ms) {
      now += ms; monotonic += ms;
      for (const [id, timer] of [...timers]) {
        if (!timers.has(id) || timer.at > monotonic) continue;
        if (timer.interval) timer.at = monotonic + timer.ms; else timers.delete(id);
        timer.fn();
      }
      await settle();
    }
  };
}

test('A deliberate preview works with alerts disabled; only Join calls the shared check-in flow', async () => {
  const app = harness(); await app.settle();
  assert.equal(app.show(), true);
  assert.equal(app.get('af-meet-call').hidden, false);
  assert.equal(app.get('af-meet-title').textContent, 'Point d’équipe');
  assert.equal(app.get('af-meet-duration').textContent, 'Durée prévue : 60 min');
  assert.equal(app.joins.length, 0);
  assert.equal(app.notifications.length, 0, 'The visible dialog must not duplicate a system notification');
  assert.equal(app.original.inert, true);
  app.get('af-meet-accept').click(); app.get('af-meet-accept').click();
  assert.equal(app.joins.length, 1);
  assert.equal(app.joins[0].id, 'm123abc');
  assert.equal(app.joins[0].settings.source, 'alert');
  assert.equal(app.get('af-meet-call').getAttribute('aria-busy'), 'true');
  app.joins[0].resolve({ ok: true }); await app.settle();
  assert.equal(app.get('af-meet-call').hidden, true);
  assert.equal(app.document.activeElement, app.original);
  assert.equal(app.document.body.style.overflow, 'auto');
  assert.equal(app.original.inert, false);
});

test('A failed Join stays in the invitation with an inline error and an explicit retry', async () => {
  const app = harness({ android: true }); await app.settle(); app.show();
  app.get('af-meet-accept').click();
  assert.equal(app.joins[0].settings.source, 'android');
  app.joins[0].resolve({ ok: false, error: 'Votre présence n’a pas pu être enregistrée.' }); await app.settle();
  assert.equal(app.get('af-meet-call').hidden, false);
  assert.equal(app.get('af-meet-accept').disabled, false);
  assert.equal(app.get('af-meet-status').textContent, 'Votre présence n’a pas pu être enregistrée.');
  app.get('af-meet-accept').click();
  assert.equal(app.joins[1].id, 'm123abc');
  app.get('af-meet-reject').click();
  app.joins[1].reject(new Error('Late response')); await app.settle();
  assert.equal(app.get('af-meet-call').hidden, true, 'A late response cannot reopen a dismissed invitation');
});

test('The invitation traps keyboard focus, closes with Escape, and restores the previous focus', async () => {
  const app = harness(); await app.settle(); app.show();
  assert.equal(app.document.activeElement, app.get('af-meet-accept'));
  const next = { type: 'keydown', key: 'Tab' }; app.document.dispatchEvent(next);
  assert.equal(next.defaultPrevented, true);
  assert.equal(app.document.activeElement, app.get('af-meet-close'));
  app.document.dispatchEvent({ type: 'keydown', key: 'Tab', shiftKey: true });
  assert.equal(app.document.activeElement, app.get('af-meet-accept'));
  app.document.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(app.get('af-meet-call').hidden, true);
  assert.equal(app.document.activeElement, app.original);
});

test('Automatic invitations require opt-in and invitation membership, even for broadly readable meetings', async () => {
  const disabled = harness({ meetings: m => [m()] }); await disabled.settle();
  assert.equal(disabled.get('af-meet-call').hidden, true);
  const outsider = harness({ enabled: true, meetings: m => [m({ invitees: ['someone-else@example.test'] })] }); await outsider.settle();
  assert.equal(outsider.get('af-meet-call').hidden, true);
  const invited = harness({ enabled: true, meetings: m => [m()] }); await invited.settle();
  assert.equal(invited.get('af-meet-call').hidden, false);
  invited.get('af-meet-reject').click(); await invited.poll();
  assert.equal(invited.get('af-meet-call').hidden, true, 'A dismissed automatic invitation is not repeated');
  assert.equal(invited.joins.length, 0);
});

test('Expiry and logout dismiss the preview and stop its ringtone timers', async () => {
  const app = harness({ enabled: true }); await app.settle();
  app.show(app.meeting(), { automatic: true });
  assert.ok([...app.timers.values()].some(timer => timer.ms === 2400));
  app.window.loggedUserEmail = ''; app.window.dispatchEvent({ type: 'afriflow:verified-role' });
  assert.equal(app.get('af-meet-call').hidden, true);
  assert.ok(![...app.timers.values()].some(timer => timer.ms === 2400));
  assert.equal(app.vibrations.at(-1), 0);
  app.window.loggedUserEmail = 'member@example.test';
  app.show(app.meeting({ start: 1800000000000 - 59000, dur: 1 }));
  await app.advance(2000);
  assert.equal(app.get('af-meet-call').hidden, true);
  assert.equal(app.show(app.meeting({ start: 1, dur: 1 })), false);
});

test('A background desktop reminder preserves the real meeting ID and waits for a notification tap', async () => {
  const app = harness({ enabled: true, desktop: true, hidden: true, meetings: m => [m()] }); await app.settle();
  assert.equal(app.get('af-meet-call').hidden, true);
  assert.equal(app.nativeNotices.length, 1);
  assert.equal(app.nativeNotices[0].meetingId, 'm123abc');
  assert.equal(app.nativeNotices[0].dur, 60);
  assert.equal(app.joins.length, 0);
  app.window.incomingMeeting(app.nativeNotices[0]);
  assert.equal(app.requests[0].meetingId, 'm123abc');
  assert.equal(app.requests[0].source, 'desktop');
  assert.equal(app.joins.length, 0);
  app.window.incomingMeeting({ meetingId: 'invented', expiresAt: 1 });
  assert.equal(app.requests.length, 1);
});

test('Hidden web pages do not consume a reminder before a visible invitation is possible', async () => {
  const app = harness({ enabled: true, hidden: true, meetings: m => [m()] }); await app.settle();
  assert.equal(app.get('af-meet-call').hidden, true);
  app.document.hidden = false; await app.poll();
  assert.equal(app.get('af-meet-call').hidden, false);
});

test('A verified preview and Join use server time despite a wrong or changing device clock', async () => {
  const serverNow = 1800000000000;
  const app = harness({ now: serverNow + 86400000 }); await app.settle();
  assert.equal(app.show(app.meeting({ serverNow, start: serverNow - 10000, dur: 60 })), true);
  assert.equal(app.get('af-meet-incoming').textContent, 'Réunion à rejoindre');
  app.shiftWallClock(86400000);
  app.get('af-meet-accept').click();
  assert.equal(app.joins.length, 1, 'The device clock must not reject a server-authorized meeting');
  app.joins[0].resolve({ ok: true }); await app.settle();
  app.show(app.meeting({ serverNow, start: serverNow - 59000, dur: 1 }));
  app.shiftWallClock(-86400000 * 5); await app.advance(2000);
  assert.equal(app.get('af-meet-call').hidden, true, 'Expiry follows elapsed time even after the device clock moves backwards');
});

test('An older desktop wrapper receives a usable notification until its meeting protocol is upgraded', async () => {
  const app = harness({ enabled: true, desktop: true, legacyDesktop: true, hidden: true, meetings: m => [m()] }); await app.settle();
  assert.equal(app.nativeNotices.length, 1);
  assert.match(app.nativeNotices[0].title, /Réunion à rejoindre/);
  await app.poll(); assert.equal(app.nativeNotices.length, 1);
  app.document.hidden = false;
  app.window.AfriFlowNative.isBackground = () => false;
  await app.poll();
  assert.equal(app.get('af-meet-call').hidden, false);
});

test('Polling and a delayed foreground push share deduplication, while an explicit tap can reopen the preview', async () => {
  const app = harness({ enabled: true }); await app.settle(); const meeting = app.meeting();
  assert.equal(app.show(meeting, { automatic: true }), true);
  app.get('af-meet-reject').click();
  assert.equal(app.show(meeting, { automatic: true }), false);
  assert.equal(app.show(meeting, { source: 'push' }), true);
  app.get('af-meet-accept').click();
  assert.equal(app.joins[0].settings.source, 'push');
});

test('An account’s alert approval never overrides another account’s refusal or inherits legacy global consent', async () => {
  const app = harness({ legacyChoice: 'yes' }); await app.settle();
  const alerts = app.window.AfriFlowAlerts;
  assert.equal(alerts.enabled(), false, 'The old device-global yes is not attributable to this account');
  alerts.enable(); assert.equal(alerts.enabled(), true);
  app.window.loggedUserEmail = 'other@example.test';
  assert.equal(alerts.enabled(), false, 'Consent changes immediately, even before an authentication event');
  alerts.disable();
  app.window.loggedUserEmail = ' MEMBER@EXAMPLE.TEST ';
  assert.equal(alerts.enabled(), true, 'The first account retains its own normalized approval');
  assert.equal(app.show(app.meeting(), { automatic: true }), true);
  app.window.loggedUserEmail = 'other@example.test';
  assert.equal(alerts.enabled(), false, 'The second account’s explicit refusal remains in force');
  assert.equal(app.get('af-meet-call').hidden, true, 'The previous account’s ringing invitation is dismissed');
  app.setMeetings([app.meeting({ invitees: ['other@example.test'] })]); await app.poll();
  assert.equal(app.get('af-meet-call').hidden, true);
  app.window.loggedUserEmail = ''; alerts.enable();
  assert.equal(alerts.enabled(), false, 'Anonymous sessions cannot establish alert consent');
});

test('Alert approval is separate for browser, installed PWA, Electron and Android WebView contexts', async () => {
  const app = harness(); await app.settle(); const alerts = app.window.AfriFlowAlerts;
  alerts.enable();
  app.window.matchMedia = () => ({ matches: true });
  assert.equal(alerts.enabled(), false); alerts.enable();
  app.window.matchMedia = () => ({ matches: false });
  assert.equal(alerts.enabled(), true, 'Returning to the browser restores only its own approval');
  app.navigator.userAgent = 'AfriFlow Electron/40';
  assert.equal(alerts.enabled(), false); alerts.enable();
  app.navigator.userAgent = 'Mozilla Android; wv)';
  assert.equal(alerts.enabled(), false); alerts.disable();
  app.navigator.standalone = true;
  assert.equal(alerts.enabled(), true, 'iOS standalone uses the same installed context as first-use');
  app.navigator.standalone = false;
  assert.equal(alerts.enabled(), false, 'The Android WebView refusal is preserved independently');
});
