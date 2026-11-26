const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function desktop() {
  const handlers = new Map(), notifications = [], previews = [], opened = [], navigated = [], timers = [];
  let reveals = 0;
  class Notification {
    constructor(options) { this.options = options; this.handlers = new Map(); notifications.push(this); }
    on(name, handler) { this.handlers.set(name, handler); }
    show() { this.shown = true; }
    close() { this.closed = true; }
  }
  const electron = {
    app: { requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }), isReady: () => false },
    Notification, ipcMain: { on: (name, handler) => handlers.set(name, handler), handle: (name, handler) => handlers.set(name, handler) },
    shell: { openExternal: async url => opened.push(url) }
  };
  const window = {
    isDestroyed: () => false, isMinimized: () => false,
    show() { reveals++; }, focus() {}, loadURL(url) { navigated.push(url); return Promise.resolve(); },
    webContents: { getURL: () => 'https://afriflow.pages.dev/', isLoading: () => false, send: (name, data) => previews.push({ name, data }) }
  };
  const context = vm.createContext({
    require(name) { return name === 'electron' ? electron : name === 'electron-updater' ? { autoUpdater: {} } : require(name); },
    __dirname: path.join(__dirname, '..', 'desktop'), process: { argv: [], platform: 'linux' },
    URL, console, __testWindow: window, setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; }, setInterval() {}
  });
  vm.runInContext(read('desktop/main.js'), context, { filename: 'desktop/main.js' });
  vm.runInContext('win = __testWindow;', context);
  const trusted = { sender: { getURL: () => 'https://afriflow.pages.dev/' } };
  return { context, notifications, previews, opened, navigated, timers, trusted,
    get reveals() { return reveals; },
    present(value, event = trusted) { handlers.get('afriflow:present-incoming-meeting')(event, value); }
  };
}

function envelope(extra = {}) {
  const now = Date.now();
  return { meetingId: 'm123abc', meetingTitle: 'Réunion des partenaires', start: now - 1000, dur: 60,
    end: now + 3599000, stage: 'start', expiresAt: now + 120000, ...extra };
}

test('Desktop invitations notify once and preview the real meeting only after a notification click', () => {
  const app = desktop(), meeting = envelope();
  app.present(meeting); app.present(meeting);
  assert.equal(app.notifications.length, 1);
  assert.match(app.notifications[0].options.title, /Réunion à rejoindre/);
  assert.equal(app.reveals, 0, 'A background timer cannot steal focus');
  assert.equal(app.previews.length, 0);
  assert.equal(app.opened.length, 0);
  app.notifications[0].handlers.get('click')();
  assert.equal(app.reveals, 1);
  assert.equal(app.previews[0].name, 'afriflow:incoming-meeting');
  assert.equal(app.previews[0].data.meetingId, meeting.meetingId);
  assert.equal(app.previews[0].data.start, meeting.start);
  assert.equal(app.previews[0].data.dur, 60);
  assert.equal(app.opened.length, 0, 'A preview is not a Teams launch');
  assert.equal(app.navigated.length, 0);
  app.timers[0].fn();
  assert.equal(app.notifications[0].closed, true);
});

test('Desktop rejects untrusted, malformed, and expired meeting payloads', () => {
  const app = desktop();
  app.present(envelope(), { sender: { getURL: () => 'https://untrusted.example/' } });
  app.present(envelope({ meetingId: 'https://untrusted.example/' }));
  app.present(envelope({ expiresAt: Date.now() - 1 }));
  app.present(envelope({ end: 0, dur: -1 }));
  assert.equal(app.notifications.length, 0);
  assert.equal(app.opened.length, 0);
});

test('An existing desktop meeting deep link opens a preview without reloading the current page', () => {
  const app = desktop();
  assert.equal(app.context.messageTarget(['afriflow://meeting?meeting=m123abc']), 'https://afriflow.pages.dev/?meeting=m123abc');
  assert.equal(app.context.messageTarget(['afriflow://meeting?meeting=invalid']), '');
  assert.equal(app.context.openLinkedMessage(['afriflow://meeting?meeting=m123abc']), true);
  assert.equal(app.previews[0].data.meetingId, 'm123abc');
  assert.equal(app.navigated.length, 0);
  assert.equal(app.opened.length, 0);
});

test('Preload preserves and queues a meeting identifier until the web preview handler is registered', () => {
  const handlers = new Map(), sent = [], received = [];
  let api;
  const context = {
    require() { return { contextBridge: { exposeInMainWorld(_, value) { api = value; } }, ipcRenderer: {
      on: (name, fn) => handlers.set(name, fn), send: (name, data) => sent.push({ name, data }), invoke() {}
    } }; }, window: { dispatchEvent() {} }
  };
  vm.runInNewContext(read('desktop/preload.js'), context, { filename: 'desktop/preload.js' });
  const original = envelope();
  handlers.get('afriflow:incoming-meeting')({}, original);
  api.onIncomingMeeting(data => received.push(data));
  assert.equal(received.length, 1);
  assert.equal(received[0].meetingId, original.meetingId);
  assert.equal(received[0].dur, 60);
  api.presentIncomingMeeting(original);
  assert.equal(sent[0].data.meetingId, original.meetingId);
  handlers.get('afriflow:incoming-meeting')({}, { meetingId: 'invalid' });
  assert.equal(received.length, 1);
});

test('Android meeting actions route to AfriFlow with expiry and no restricted call-screen permission', () => {
  const service = read('android/app/src/main/java/africa/afriflow/app/AfriMessagingService.java');
  const activity = read('android/app/src/main/java/africa/afriflow/app/MainActivity.java');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(service, /appendQueryParameter\("meeting",meetingId\)/);
  assert.match(service, /addAction\(0,"Rejoindre",openPi\)/);
  assert.match(service, /setTimeoutAfter\(expiresAt-now\)/);
  assert.match(service, /mgr\.notify\(tag,0,notification\.build\(\)\)/);
  assert.doesNotMatch(service, /parse\(teams\)|CallStyle|setFullScreenIntent/);
  assert.match(activity, /afriflow:meeting-request/);
  assert.match(activity, /JSONObject\.quote\(id\)/);
  assert.match(manifest, /AfriMessagingService\$DismissReceiver" android:exported="false"/);
  assert.doesNotMatch(manifest, /USE_FULL_SCREEN_INTENT|MANAGE_OWN_CALLS/);
});
