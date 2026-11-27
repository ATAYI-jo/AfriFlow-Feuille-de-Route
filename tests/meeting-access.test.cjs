// Exercise the complete production meeting controller with delayed, in-memory
// server replies. No browser, external Teams page or network service is opened.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'modules/collaboration/meetings.js'), 'utf8');
const NOW = Date.parse('2026-11-26T12:00:00Z');
const ID = 'mabc123';
const EMAIL = 'member@example.test';
const SERVER_LINK = 'https://teams.microsoft.com/l/meetup-join/server-confirmed';
const MEETING = { id: ID, title: 'Réunion enregistrée', start: NOW, dur: 60, grace: 5,
  invitees: [EMAIL], link: 'https://teams.microsoft.com/l/meetup-join/old-client-link' };
const RECORD = { meet: ID, email: EMAIL, at: NOW - 60000, schemaVersion: 2, evidence: 'afriflow_join_request' };
const reply = (record = RECORD) => ({ data: { ok: true, record, serverNow: NOW,
  meeting: { ...MEETING, link: SERVER_LINK } }, error: null });

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); return true; },
  };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

function harness(options = {}) {
  const events = [], tabs = [], invocations = [], nativeOpens = [], assigned = [], shown = [], notices = [];
  const timers = [], intervals = [], reads = [], held = new Map();
  const card = { id: 'meetCard', innerHTML: '', dataset: {}, style: {} };
  const state = { meetings: [{ ...MEETING }], pointages: [], fail: '', nativeResult: { ok: true }, showResult: true };
  const statuses=[],times=[],drawn=[];
  function element(){const label={};Object.defineProperty(label,'textContent',{set:value=>statuses.push(value)});return {classList:{add(){}},querySelector:name=>name==='p'?label:name==='.af-pointage-photo'?{getAttribute:()=>null,set src(value){drawn.push(value)}}:name==='time'?{set dateTime(value){times.push(value)}}:{},remove(){}}}
  const surface={createElement:element,head:{appendChild(){}},body:{appendChild(){}}};
  const document = Object.assign(target(), {
    hidden: false,
    getElementById(id) { return id === 'meetCard' ? card : id==='sideAvatar'?options.header:null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    ...surface,
  });
  const location = { href: 'https://afriflow.pages.dev/' + (options.deepLink ? '?meeting=' + ID : ''),
    assign(url) { events.push('assign'); assigned.push(url); } };
  const window = Object.assign(target(), {
    document, location, loggedUserEmail: EMAIL, USER_ROLE: 'collaborator',
    history: { state: {}, replaceState(_state, _title, url) { location.href = url; } },
    toast(message) { notices.push(message); },
    open(url, name) {
      events.push('blank');
      assert.equal(url, 'about:blank'); assert.equal(name, '_blank');
      if (options.blockPopup) return null;
      const tab = { opener: window, document: { ...surface }, closed: false, destinations: [],
        location: { replace(target) { events.push('replace'); tab.destinations.push(target); } },
        close() { events.push('close'); tab.closed = true; } };
      tabs.push(tab); return tab;
    },
    AfriAttendance: { load: async () => ({ events: [] }), context: () => ({}), status: () => ({ k: 'wait', t: 'À confirmer' }),
      isReviewing: () => false, decorateCensor() {} },
    AfriFlowAlerts: { enabled: () => true, showMeeting(meeting, opts) { shown.push({ meeting, options: opts }); return state.showResult; } },
  });
  if(options.tap){
    location.href += '#accept=12345678-abcd-4000-8000-123456789abc&until='+(NOW+60000);
    window.caches={open:async()=>({delete:async key=>options.tap==='valid' && key===location.href.split('#')[0]+'&until='+(NOW+60000)+'&tap=12345678-abcd-4000-8000-123456789abc'})};
  }
  if (options.platform === 'native') window.AfriFlowNative = { async openTeams(url) { events.push('native'); nativeOpens.push(url); return state.nativeResult; } };
  if (options.platform === 'android') window.AfriFlowAndroid = { postMessage() { throw new Error('Android join must use the authenticated URL handoff'); } };
  const serviceWorker = target();
  function query() {
    let key = '', pattern = '', columns = '', first = false;
    const q = {
      select(value) { columns = value; return this; }, eq(_field, value) { key = value; return this; },
      like(_field, value) { pattern = value; return this; }, order() { return this; }, limit() { return this; }, range() { return this; },
      maybeSingle() { first = true; return this; },
      then(resolve, reject) {
        const kind = key === 'pub:meetcfg' ? 'config' : key.startsWith('meet:') ? 'preview' : pattern.startsWith('meet:') ? 'meetings' : 'pointages';
        reads.push({ kind, key, pattern, columns, first });
        let result;
        if (state.fail === kind) result = { data: null, error: { message: 'Connexion indisponible' } };
        else if (kind === 'config') result = { data: { value: { link: MEETING.link, censeurs: [] } }, error: null };
        else if (kind === 'preview') result = { data: state.meetings.find(m => 'meet:' + m.id === key) ? { value: state.meetings.find(m => 'meet:' + m.id === key) } : null, error: null };
        else if (kind === 'meetings') result = { data: state.meetings.map(value => ({ key: 'meet:' + value.id, value })), error: null };
        else result = { data: state.pointages, error: null };
        const hold = held.get(kind);
        if (hold) { held.delete(kind); hold.release = () => hold.resolve(result); return hold.promise.then(resolve, reject); }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  }
  window.__sb = { from: query, rpc(name, payload) {
    assert.equal(name, 'af_meeting_preview', 'preview is the only read-only RPC in this controller');
    reads.push({ kind: 'preview-rpc', name, payload });
    const meeting = state.meetings.find(item => item.id === payload.p_meeting_id);
    const invited = meeting && (!Array.isArray(meeting.invitees) || meeting.invitees.includes(window.loggedUserEmail));
    const result = invited ? { data: { meeting, serverNow: NOW }, error: null } :
      { data: null, error: { message: 'Cette réunion est indisponible ou votre compte n’est pas invité.' } };
    const hold = held.get('preview');
    if (hold) { held.delete('preview'); hold.release = () => hold.resolve(result); return hold.promise; }
    return Promise.resolve(result);
  }, functions: { invoke(name, payload) {
    events.push('invoke'); assert.equal(name, 'afriflow-meeting-checkin');
    const pending = deferred(); invocations.push({ ...pending, payload }); return pending.promise;
  } } };
  class DeviceDate extends Date { constructor(...args) { super(...(args.length ? args : [options.now ?? NOW])); } static now() { return options.now ?? NOW; } }
  vm.runInNewContext(source, { window, document, navigator: { serviceWorker, ...options.device }, URL, URLSearchParams,
    Date: DeviceDate, Intl, console, Event: class { constructor(type) { this.type = type; } },
    alert: message => notices.push(message), confirm: () => false,
    setTimeout(fn, ms) { if(ms===2100){Promise.resolve().then(fn);return 0;} timers.push({ fn, ms }); return timers.length; },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
    MutationObserver: class { observe() {} },
  }, { filename: 'modules/collaboration/meetings.js' });
  return { window, document, state, card, statuses, times, drawn, events, tabs, invocations, nativeOpens, assigned, shown, notices, reads,
    async refresh() { window.dispatchEvent({ type: 'afriflow:attendance-changed' }); await settle(); },
    async fire(type) { window.dispatchEvent({ type }); await settle(); },
    draw() { intervals.find(item => item.ms === 1000).fn(); },
    hold(kind) { const value = deferred(); held.set(kind, value); return value; },
  };
}

test('browser opens its blank tab synchronously, then uses only the server-confirmed Teams link', async () => {
  const h = harness();
  const joined = h.window.AfriMeetings.join(ID, { source: 'home' });
  assert.deepEqual(h.events, ['blank', 'invoke']);
  assert.equal(h.tabs[0].opener, null);
  assert.equal(h.tabs[0].destinations.length, 0);
  assert.deepEqual(h.statuses, []);
  assert.equal(h.invocations[0].payload.body.meetingId, ID);
  h.invocations[0].resolve(reply());
  assert.equal((await joined).ok, true);
  assert.deepEqual(h.statuses,['Vous êtes connecté']);
  assert.deepEqual(h.tabs[0].destinations, [SERVER_LINK]);
});

test('a duplicate join while check-in is pending creates neither another tab nor another request', async () => {
  const h = harness(); const first = h.window.AfriMeetings.join(ID);
  assert.equal((await h.window.AfriMeetings.join(ID)).ok, false);
  assert.equal(h.tabs.length, 1); assert.equal(h.invocations.length, 1);
  h.invocations[0].resolve(reply()); await first;
});

test('rejected and uninvited check-ins close the placeholder and never open Teams', async () => {
  for (const reason of ['Vous ne faites pas partie des personnes invitées', 'Session invalide']) {
    const h = harness(); const joined = h.window.AfriMeetings.join(ID);
    h.invocations[0].resolve({ data: null, error: { message: 'Edge error', context: { json: async () => ({ error: reason }) } } });
    const result = await joined;
    assert.equal(result.ok, false); assert.equal(result.error, reason);
    assert.equal(h.tabs[0].closed, true); assert.equal(h.tabs[0].destinations.length, 0);
    const retry = h.window.AfriMeetings.join(ID);
    assert.equal(h.invocations.length, 2, 'failure must release the in-flight guard');
    h.invocations[1].resolve(reply()); await retry;
  }
});

test('blocked popups do not start a check-in, and malformed server URLs cannot navigate', async () => {
  const blocked = harness({ blockPopup: true });
  assert.equal((await blocked.window.AfriMeetings.join(ID)).ok, false);
  assert.equal(blocked.invocations.length, 0);
  const h = harness(); const joined = h.window.AfriMeetings.join(ID);
  const response = reply(); response.data.meeting.link = 'https://teams.microsoft.com.evil.test/';
  h.invocations[0].resolve(response);
  assert.equal((await joined).ok, false);
  assert.equal(h.tabs[0].closed, true); assert.equal(h.tabs[0].destinations.length, 0);
});

test('an incorrect device clock never suppresses the authoritative check-in request', async () => {
  const h = harness({ now: NOW + 365 * 86400000 });
  const joined = h.window.AfriMeetings.join(ID);
  assert.equal(h.invocations.length, 1);
  h.invocations[0].resolve(reply());
  assert.equal((await joined).record.at, RECORD.at);
  assert.deepEqual(h.tabs[0].destinations, [SERVER_LINK]);
});

test('Android hands off the server URL only after a successful check-in', async () => {
  const h = harness({ platform: 'android' }); const joined = h.window.AfriMeetings.join(ID, { source: 'android' });
  assert.equal(h.tabs.length, 0); assert.equal(h.assigned.length, 0);
  assert.equal(h.invocations[0].payload.body.source, 'android');
  h.invocations[0].resolve(reply());
  assert.equal((await joined).ok, true); assert.deepEqual(h.assigned, [SERVER_LINK]);
  assert.deepEqual(h.events, ['invoke', 'assign']);
});

test('native launch waits for check-in; opening failure retains the record and rejoin asks the server again', async () => {
  const h = harness({ platform: 'native' }); await h.refresh();
  h.state.nativeResult = { ok: false };
  const first = h.window.AfriMeetings.join(ID, { source: 'desktop' });
  assert.equal(h.nativeOpens.length, 0); assert.equal(h.tabs.length, 0);
  h.invocations[0].resolve(reply());
  const failed = await first;
  assert.equal(failed.ok, false); assert.match(failed.error, /Pointage conservé/);
  h.draw(); assert.match(h.card.innerHTML, /pointage enregistré/);
  h.state.nativeResult = { ok: true };
  const second = h.window.AfriMeetings.join(ID, { source: 'desktop' });
  assert.equal(h.invocations.length, 2, 'local cache must not bypass current server authorization');
  h.invocations[1].resolve(reply());
  assert.equal((await second).record.at, RECORD.at);
  assert.deepEqual(h.nativeOpens, [SERVER_LINK, SERVER_LINK]);
});

test('a successful response for a departed account cannot open Teams or mark the new account', async () => {
  const h = harness(); const joined = h.window.AfriMeetings.join(ID);
  h.window.loggedUserEmail = 'other@example.test';
  h.invocations[0].resolve(reply());
  assert.equal((await joined).ok, false);
  assert.equal(h.tabs[0].closed, true); assert.equal(h.tabs[0].destinations.length, 0);
  h.state.meetings = [{ ...MEETING, invitees: ['other@example.test'] }];
  await h.refresh(); assert.doesNotMatch(h.card.innerHTML, /pointage enregistré/);
});

test('a notification deep link only previews the invitation and never records attendance automatically', async () => {
  const h = harness({ deepLink: true }); await h.fire('load');
  assert.equal(h.shown.length, 1); assert.equal(h.shown[0].meeting.id, ID);
  assert.equal(h.shown[0].meeting.serverNow, NOW, 'server clock is forwarded to the invitation presentation');
  assert.equal(h.tabs.length, 0); assert.equal(h.invocations.length, 0);
  assert.equal(new URL(h.window.location.href).searchParams.has('meeting'), false);
});

test('uninvited previews do not show an invitation or perform a check-in', async () => {
  const h = harness(); h.state.meetings = [{ ...MEETING, invitees: ['someone-else@example.test'] }];
  await assert.rejects(h.window.AfriMeetings.preview(ID), error => /pas invité/.test(error.message));
  assert.equal(h.shown.length, 0); assert.equal(h.tabs.length, 0); assert.equal(h.invocations.length, 0);
});

test('an invitation that could not be displayed remains pending instead of losing its deep link', async () => {
  const h = harness({ deepLink: true }); h.state.showResult = false;
  await h.fire('load');
  assert.equal(new URL(h.window.location.href).searchParams.get('meeting'), ID);
  assert.equal(h.invocations.length, 0);
  h.state.showResult = true;
  await h.fire('afriflow:alerts-ready');
  assert.equal(h.shown.length, 2);
  assert.equal(new URL(h.window.location.href).searchParams.has('meeting'), false);
});

test('a delayed invitation response is ignored after the account changes', async () => {
  const h = harness(); const delayed = h.hold('preview');
  const preview = h.window.AfriMeetings.preview(ID);
  h.window.loggedUserEmail = 'other@example.test'; delayed.release();
  await assert.rejects(preview, /session a changé/);
  assert.equal(h.shown.length, 0); assert.equal(h.invocations.length, 0);
});

test('failed refreshes preserve the last good meetings and pointages', async () => {
  const h = harness(); h.state.pointages = [{ key: 'att:' + ID + ':' + EMAIL, value: RECORD }];
  await h.refresh();
  assert.match(h.card.innerHTML, /Réunion enregistrée/); assert.match(h.card.innerHTML, /pointage enregistré/);
  h.state.meetings = []; h.state.pointages = []; h.state.fail = 'meetings';
  await h.refresh(); h.draw();
  assert.match(h.card.innerHTML, /Réunion enregistrée/); assert.match(h.card.innerHTML, /pointage enregistré/);
});

test('a late load response from the previous account cannot overwrite the current meeting list', async () => {
  const h = harness(); const delayed = h.hold('meetings');
  await h.refresh(); assert.equal(typeof delayed.release, 'function');
  h.window.loggedUserEmail = 'other@example.test';
  h.state.meetings = [{ ...MEETING, title: 'Réunion du nouveau compte', invitees: ['other@example.test'] }];
  await h.refresh();
  delayed.release(); await settle(); h.draw();
  assert.match(h.card.innerHTML, /Réunion du nouveau compte/);
  assert.doesNotMatch(h.card.innerHTML, /Réunion enregistrée/);
});

test('a one-use notification tap checks in and opens Teams in its own window',async()=>{
  const h=harness({deepLink:true,tap:'valid'});
  await h.fire('load');
  assert.equal(h.invocations.length,1);
  assert.equal(h.tabs.length,0);
  h.invocations[0].resolve(reply());await settle();
  assert.deepEqual(h.assigned,[SERVER_LINK]);
});
test('an unrecognized tap falls back to preview without checking in',async()=>{
  const h=harness({deepLink:true,tap:'unknown'});
  await h.fire('load');
  assert.equal(h.invocations.length,0);
  assert.equal(h.shown.length,1);
});

test('home counts down to the start, then allows joining until the end', async () => {
  const options={now:NOW-3661000},h=harness(options);
  await h.refresh();
  for(const id of [0,1,2])assert.match(h.card.innerHTML,new RegExp('id="mtDigit'+id+'">01'));
  assert.doesNotMatch(h.card.innerHTML,/meetGo|Rejoindre/);
  options.now=NOW;h.draw();
  assert.match(h.card.innerHTML,/id="meetGo"/);
  options.now=NOW+MEETING.dur*60000;h.draw();
  assert.match(h.card.innerHTML,/Aucune réunion programmée/);
  assert.doesNotMatch(h.card.innerHTML,/meetGo|Rejoindre|role="timer"/);
});

test('check-in uses the active profile portrait and the server pointage timestamp',async()=>{
  const image={currentSrc:'data:image/png;base64,AA==',complete:true,naturalWidth:240,naturalHeight:320};
  for(const owner of [EMAIL,'other@example.test']){
    const h=harness({header:{dataset:{profileOwner:owner},querySelector:()=>image}});
    const joined=h.window.AfriMeetings.join(ID);
    h.invocations[0].resolve(reply());
    assert.equal((await joined).ok,true);
    assert.equal(h.drawn.includes(image.currentSrc),owner===EMAIL);
    assert.deepEqual(h.times,[new Date(RECORD.at).toISOString()]);
  }
});

test('mobile web check-in stays inside AfriFlow until Teams opens',async()=>{
  for(const device of [{userAgent:'iPhone'}, {userAgent:'Android'}, {platform:'MacIntel',maxTouchPoints:5}]){
    const h=harness({device});
    const joined=h.window.AfriMeetings.join(ID);
    assert.equal(h.tabs.length,0);
    assert.deepEqual(h.assigned,[]);
    h.invocations[0].resolve(reply());
    assert.equal((await joined).ok,true);
    assert.deepEqual(h.statuses,['Vous êtes connecté']);
    assert.deepEqual(h.assigned,[SERVER_LINK]);
  }
});
