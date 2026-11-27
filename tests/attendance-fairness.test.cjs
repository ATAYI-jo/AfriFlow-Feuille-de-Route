/* Behavioral tests for the production attendance model, loader and review forms. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'modules/collaboration/attendance.js'), 'utf8');
const meetingsSource = fs.readFileSync(path.join(__dirname, '..', 'modules/collaboration/meetings.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = Date.parse('2026-11-26T14:00:00Z');
const meeting = { id: 'mtest01', title: 'Réunion de travail', start, dur: 60, grace: 5 };
const member = 'member@example.test';
const reviewer = 'reviewer@example.test';
const requestEvent = { id: 'request-1', meeting_id: meeting.id, member_email: member, kind: 'request',
  reason: 'J’ai rejoint Teams depuis la notification.', occurred_at: new Date(start).toISOString(),
  actor_email: member, created_at: new Date(start + 12 * 60000).toISOString() };
const clone = value => JSON.parse(JSON.stringify(value));

function harness(options = {}) {
  const calls = [], queries = [], notifications = [], events = [], nodes = [];
  let document;
  function target() {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== fn)); },
      dispatchEvent(event) { event.target ||= this; for (const fn of listeners.get(event.type) || []) fn(event); }
    };
  }
  const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  function matches(node, selector) {
    const tag = selector.match(/^[a-z][\w-]*/i), id = selector.match(/#([\w-]+)/);
    if (tag && node.tagName !== tag[0].toUpperCase() || id && node.id !== id[1]) return false;
    for (const item of selector.matchAll(/\.([\w-]+)/g)) if (!String(node.className || '').split(/\s+/).includes(item[1])) return false;
    for (const item of selector.matchAll(/\[([^=\]\s]+)(?:=["']?([^\]"']*)["']?)?\]/g)) if (!node.hasAttribute(item[1]) || item[2] != null && node.getAttribute(item[1]) !== item[2]) return false;
    return true;
  }
  function element(tag) {
    let content = '', text = '';
    const attrs = new Map();
    const node = Object.defineProperties(target(), Object.getOwnPropertyDescriptors({
      tagName: tag.toUpperCase(), children: [], parentNode: null, dataset: {}, style: {}, value: '', disabled: false,
      get isConnected() { return this === document?.body || !!this.parentNode?.isConnected; },
      get innerHTML() { return content; },
      set innerHTML(value) {
        content = String(value); this.children.forEach(child => { child.parentNode = null; }); this.children = [];
        const stack = [this];
        for (const token of content.match(/<[^>]*>|[^<]+/g) || []) {
          if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
          if (!token.startsWith('<')) continue;
          const found = token.match(/^<([\w-]+)/); if (!found) continue;
          const child = element(found[1]);
          for (const attr of token.slice(found[0].length, -1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) child.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
          stack[stack.length - 1].appendChild(child);
          if (!/^(?:input|br|img|hr|meta|link)$/i.test(found[1]) && !token.endsWith('/>')) stack.push(child);
        }
      },
      get textContent() { return text; }, set textContent(value) { text = String(value); },
      setAttribute(name, value) { value = String(value); attrs.set(name, value); if (name === 'id') this.id = value; if (name === 'class') this.className = value; if (name === 'value') this.value = value; if (name.startsWith('data-')) this.dataset[dataKey(name)] = value; },
      getAttribute(name) { return name.startsWith('data-') ? this.dataset[dataKey(name)] ?? null : name === 'id' ? this.id || null : attrs.get(name) ?? null; },
      hasAttribute(name) { return this.getAttribute(name) !== null; },
      contains(other) { return this === other || this.children.some(child => child.contains(other)); },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
      before(child) { const parent = this.parentNode; child.parentNode = parent; parent.children.splice(parent.children.indexOf(this), 0, child); },
      querySelectorAll(selector) { const result = []; function walk(root) { for (const child of root.children) { if (selector.split(',').some(s => matches(child, s.trim()))) result.push(child); walk(child); } } walk(this); return result; },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      closest(selector) { return selector.split(',').some(s => matches(this, s.trim())) ? this : this.parentNode?.closest(selector) || null; },
      focus() { document.activeElement = this; }
    }));
    nodes.push(node); return node;
  }
  document = Object.assign(target(), {
    activeElement: null, createElement: element,
    getElementById(id) { return document.body.querySelector('#' + id); },
    querySelector(selector) { return document.body.querySelector(selector); },
    querySelectorAll(selector) { return document.body.querySelectorAll(selector); }
  });
  document.body = element('body');
  const host = element('section'); host.id = 'viewHost'; document.body.appendChild(host);
  const config = { events: [], records: [], meetings: [meeting], justifications: [], decisions: [], permissions: [], rpcResult: { data: { id: 'inserted-row' } }, ...options };
  function response(query) {
    if (query.single && query.pattern === 'pub:meetcfg') return { data: { value: { link: '', censeurs: [] } }, error: null };
    const kind = query.table === 'afriflow_attendance_events' ? 'events' : query.pattern?.startsWith('meet:') ? 'meetings'
      : query.pattern?.startsWith('att:jd-') ? 'decisions' : query.pattern?.startsWith('att:j-') ? 'justifications'
        : query.pattern?.startsWith('att:perm-') ? 'permissions' : 'records';
    if (config.errorKind === kind) return { data: null, error: { message: kind + ' unavailable' } };
    let data = config[kind];
    if (kind !== 'events') data = data.map(value => ({ key: value.key || '', value }));
    return { data: data.slice(query.from || 0, query.to == null ? undefined : query.to + 1) };
  }
  const api = {
    from(name) {
      const query = { table: name, select() { return this; }, like(_, pattern) { this.pattern = pattern; return this; }, eq(_, value) { this.pattern = value; return this; }, maybeSingle() { this.single = true; return this; }, order() { return this; }, limit() { return this; }, range(from, to) { this.from = from; this.to = to; return this; },
        then(resolve, reject) { queries.push({ table: this.table, pattern: this.pattern, from: this.from, to: this.to }); return Promise.resolve(config.respond ? config.respond(this, response) : response(this)).then(resolve, reject); }
      };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args: clone(args) }); return config.rpcResult; }
  };
  const window = Object.assign(target(), {
    document, loggedUserEmail: config.account || member, USER_ROLE: config.role || 'shareholder',
    __sb: api, toast(message) { notifications.push(message); }, AfriCensorAccess() { return window.USER_ROLE === 'admin'; }
  });
  window.addEventListener('afriflow:attendance-changed', event => events.push(event));
  const context = vm.createContext({ window, document, console, Intl, Date, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
  vm.runInContext(source, context, { filename: 'modules/collaboration/attendance.js' });
  function data(extra = {}) { return { account: window.loggedUserEmail, justifications: {}, decisions: {}, permissions: {}, events: {}, unavailable: false, ...extra }; }
  return {
    model: window.AfriAttendance, window, document, host, config, calls, queries, events, notifications, context, data,
    input(id, value) { const input = document.getElementById(id); assert.ok(input, 'Missing form control ' + id); input.value = value; },
    async submit() { const form = document.querySelector('form'); assert.ok(form); await form.onsubmit({ preventDefault() {} }); },
    async censor() {
      window.USER_ROLE = 'admin'; window.location = { href: 'https://afriflow.example.test/' }; window.scrollTo = () => {};
      const users = config.users || [{ email: member, name: 'Membre de test' }];
      window.AFRI = { page() {}, async listUsers() { return users; }, async listMembers() { return users; } };
      const home = element('section'); home.id = 'view-home'; document.body.appendChild(home);
      Object.assign(context, { navigator: {}, URL, URLSearchParams, Event: class { constructor(type) { this.type = type; } },
        MutationObserver: class { observe() {} }, setTimeout() { return 0; }, setInterval() { return 0; } });
      vm.runInContext(meetingsSource, context, { filename: 'modules/collaboration/meetings.js' });
      assert.equal(window.AfriOpenCensor({ restore: true }), true);
      for (let i = 0; i < 100; i++) await Promise.resolve();
      assert.match(host.innerHTML, /Réunions et présences/, 'The real Censeur page completed rendering');
    },
    async refreshCensor() { window.dispatchEvent({ type: 'afriflow:attendance-changed' }); for (let i = 0; i < 100; i++) await Promise.resolve(); },
    async personalWithQueryError(kind) {
      config.errorKind = kind;
      Object.assign(context, { jpActive: true, jpGeneration: 0, vh: host, $: id => document.getElementById(id), me: () => window.loggedUserEmail,
        SB: () => api, TB: () => 'afriflow_state', esc: String, toast() {}, localStorage: { getItem() { return null; }, setItem() {} } });
      const from = html.indexOf('async function renderPersonal(){');
      const to = html.indexOf('window.addEventListener("afriflow:attendance-changed"', from);
      assert.ok(from >= 0 && to > from, 'Execute the actual personal-page loading function');
      vm.runInContext(html.slice(from, to), context, { filename: 'index.html:renderPersonal' });
      await vm.runInContext('renderPersonal()', context);
      return document.getElementById('jpRoot').innerHTML;
    }
  };
}

test('Simple attendance labels preserve exact grace boundaries and identify unverified missing pointages', () => {
  const app = harness(), { model } = app;
  assert.equal(model.status(meeting, { at: start }).t, 'Présent');
  assert.equal(model.status(meeting, { at: start + 5 * 60000 }).k, 'ok');
  const late = model.status(meeting, { at: start + 5 * 60000 + 1 });
  assert.equal(late.t, 'Retard');
  assert.equal(late.rawAt, start + 5 * 60000 + 1);
  const absent = model.status(meeting, null, { now: start + 2 * 3600000 });
  assert.equal(absent.t, 'Absent'); assert.equal(absent.category, 'absent'); assert.equal(absent.needsVerification, true);
  assert.equal(model.status(meeting, null, { now: start - 1 }).t, 'À venir');
  model.renderPersonal(app.host, [{ ...meeting, start: Date.now() - 7200000 }], {}, app.data());
  assert.match(app.host.innerHTML, /class="mt-pill mt-abs">Absent<\/span>/);
  assert.match(app.host.innerHTML, /Aucun pointage enregistré · à confirmer/, 'The simple absence label keeps its evidence qualifier visible');
});

test('Missing grace defaults to five minutes and saved scheduling evidence remains authoritative', () => {
  const { model } = harness();
  assert.equal(model.status({ ...meeting, grace: undefined }, { at: start - 120000 }).k, 'ok');
  assert.equal(model.status({ ...meeting, grace: undefined }, { at: start + 300000 }).k, 'ok');
  const record = { at: start + 4 * 60000, scheduledStart: start, graceMinutes: 5 };
  assert.equal(model.status({ ...meeting, start: start - 600000, grace: 0 }, record).k, 'ok');
  assert.deepEqual(record, { at: start + 4 * 60000, scheduledStart: start, graceMinutes: 5 });
});

test('Accepted excuses and permissions apply even when an original click was eleven minutes late', () => {
  const { model } = harness(); const record = { at: start + 660000 };
  assert.equal(model.status(meeting, record, { permission: { reason: 'Autorisation accordée' } }).k, 'ok');
  const options = { justification: { at: 100 }, decision: { ok: true, at: 101 } };
  assert.equal(model.status(meeting, record, options).t, 'Excusé');
  assert.equal(model.status(meeting, record, options).source, 'justification');
  assert.equal(model.status(meeting, record, { ...options, decision: { ok: true, at: 99 } }).t, 'Retard', 'An older acceptance does not approve a later resubmission');
});

test('Reviewed conclusions are distinct from immutable click evidence', () => {
  const { model } = harness(); const record = { at: start + 660000 };
  for (const [outcome, key] of Object.entries({ on_time: 'ok', late: 'late', excused: 'ok', absent: 'abs' })) {
    const value = model.status(meeting, record, { events: [requestEvent, { id: 'decision-1', kind: 'decision', request_id: requestEvent.id, outcome, actor_email: reviewer, created_at: new Date(start + 3600000).toISOString() }] });
    assert.equal(value.k, key); assert.equal(value.source, 'review'); assert.equal(value.rawAt, record.at);
  }
  assert.deepEqual(record, { at: start + 660000 });
});

test('Pending and rejected corrections preserve the main attendance label without confirming raw evidence', () => {
  const { model } = harness();
  const pending = model.status(meeting, { at: start + 660000 }, { events: [requestEvent] });
  assert.equal(pending.k, 'late'); assert.equal(pending.t, 'Retard'); assert.equal(pending.pending.id, requestEvent.id);
  const rejected = model.status(meeting, null, { events: [requestEvent, { id: 'd1', kind: 'decision', request_id: requestEvent.id, outcome: 'rejected', created_at: new Date(start + 3600000).toISOString() }], now: start + 7200000 });
  assert.equal(rejected.t, 'Absent'); assert.equal(rejected.needsVerification, true); assert.equal(rejected.review, null);
  const unavailable = model.status(meeting, { at: start }, { unavailable: true });
  assert.equal(unavailable.k, 'wait'); assert.doesNotMatch(unavailable.t, /^Absent$/);
  assert.equal(model.canRequest(meeting, null, { unavailable: true }), false);
});

test('Accepted justifications, permissions and confirmed reviews remove the verification action and block its handler', () => {
  const key = meeting.id + ':' + member;
  const approvedReview = outcome => ({ events: { [key]: [requestEvent, {
    id: 'approved-' + outcome, kind: 'decision', request_id: requestEvent.id, outcome,
    actor_email: reviewer, reason: 'La participation a été vérifiée.', created_at: new Date(start + 3600000).toISOString()
  }] } });
  const approvedThenRejected = approvedReview('on_time');
  approvedThenRejected.events[key].push({ ...requestEvent, id: 'request-2', created_at: new Date(start + 7200000).toISOString() },
    { id: 'rejected-later', kind: 'decision', request_id: 'request-2', outcome: 'rejected', actor_email: reviewer,
      reason: 'La décision confirmée reste valable.', created_at: new Date(start + 10800000).toISOString() });
  const scenarios = [
    { name: 'current accepted justification', extra: { justifications: { [key]: { at: 100 } }, decisions: { [key]: { ok: true, at: 101 } } }, evidence: /Justificatif accepté/ },
    { name: 'current permission', extra: { permissions: { [key]: { reason: 'Autorisation accordée', by: reviewer, at: 101 } } }, evidence: /Permission accordée/ },
    { name: 'reviewed on-time presence', extra: approvedReview('on_time'), evidence: /La participation a été vérifiée/ },
    { name: 'reviewed excuse', extra: approvedReview('excused'), evidence: /La participation a été vérifiée/ },
    { name: 'reviewed lateness', extra: approvedReview('late'), evidence: /La participation a été vérifiée/ },
    { name: 'reviewed absence', extra: approvedReview('absent'), evidence: /La participation a été vérifiée/ },
    { name: 'confirmed presence followed by a later rejected request', extra: approvedThenRejected, evidence: /La décision confirmée reste valable/ }
  ];
  for (const scenario of scenarios) {
    const app = harness(); const data = app.data(scenario.extra);
    assert.equal(app.model.canRequest(meeting, { at: start + 660000 }, app.model.context(data, meeting.id, member)), false, scenario.name);
    app.model.renderPersonal(app.host, [meeting], { [meeting.id]: { at: start + 660000 } }, data);
    assert.equal(app.host.querySelector('[data-att-request]'), null, scenario.name + ' must not offer another request');
    assert.match(app.host.innerHTML, scenario.evidence, scenario.name + ' retains its approval evidence');
    assert.equal(app.model.request(meeting.id), false, scenario.name + ' also protects the direct request handler');
    assert.equal(app.model.isReviewing(), false); assert.equal(app.calls.length, 0);
  }
});

test('A pending verification keeps its receipt text and cannot open a duplicate request', () => {
  const app = harness(); const data = app.data({ events: { [meeting.id + ':' + member]: [requestEvent] } });
  assert.equal(app.model.canRequest(meeting, { at: start + 660000 }, app.model.context(data, meeting.id, member)), false);
  app.model.renderPersonal(app.host, [meeting], { [meeting.id]: { at: start + 660000 } }, data);
  assert.equal(app.host.querySelector('[data-att-request]'), null);
  assert.match(app.host.innerHTML, /Demande reçue/);
  assert.match(app.host.innerHTML, /Vérification en cours/);
  assert.equal(app.model.request(meeting.id), false);
  assert.equal(app.model.isReviewing(), false); assert.equal(app.calls.length, 0);
});

test('An upcoming meeting without a pointage cannot open verification before it begins', () => {
  const app = harness();
  assert.equal(app.model.canRequest(meeting, null, { now: start - 1 }), false, 'The explicit reference clock controls eligibility');
  assert.equal(app.model.canRequest(meeting, null, { now: start }), true, 'Once the meeting starts an unresolved pointage may be checked');
  assert.equal(app.model.canRequest(meeting, { at: start - 60000 }, { now: start - 1 }), true, 'An existing early pointage retains its normal verification flow');
  const upcoming = { ...meeting, start: Date.now() + 3600000 };
  app.model.renderPersonal(app.host, [upcoming], {}, app.data());
  assert.equal(app.host.querySelector('[data-att-request]'), null);
  assert.equal(app.model.request(upcoming.id), false, 'The direct handler also refuses an upcoming meeting without a pointage');
  assert.equal(app.model.isReviewing(), false); assert.equal(app.calls.length, 0);
});

test('A refused or undecided attendance correction remains requestable', () => {
  const key = meeting.id + ':' + member;
  const scenarios = [
    { name: 'undecided late record', extra: {} },
    { name: 'refused correction', extra: { events: { [key]: [requestEvent, {
      id: 'refused-1', kind: 'decision', request_id: requestEvent.id, outcome: 'rejected',
      reason: 'Informations à compléter.', actor_email: reviewer, created_at: new Date(start + 3600000).toISOString()
    }] } } },
    { name: 'refused legacy justification', extra: { justifications: { [key]: { at: 100 } }, decisions: { [key]: { ok: false, at: 101, reason: 'Informations à compléter.' } } } }
  ];
  for (const scenario of scenarios) {
    const app = harness(); const data = app.data(scenario.extra);
    assert.equal(app.model.canRequest(meeting, { at: start + 660000 }, app.model.context(data, meeting.id, member)), true, scenario.name);
    app.model.renderPersonal(app.host, [meeting], { [meeting.id]: { at: start + 660000 } }, data);
    assert.ok(app.host.querySelector('[data-att-request]'), scenario.name + ' can ask for verification');
    assert.equal(app.model.request(meeting.id), true, scenario.name + ' opens its form');
    assert.equal(app.calls.length, 0, 'Opening the form never submits a request');
  }
});

test('A legacy justification awaiting its current decision does not open a parallel verification request', () => {
  const key = meeting.id + ':' + member;
  for (const decision of [undefined, { ok: true, at: 101 }]) {
    const app = harness();
    const data = app.data({ justifications: { [key]: { at: 102 } }, decisions: decision ? { [key]: decision } : {} });
    const options = app.model.context(data, meeting.id, member), record = { at: start + 660000 };
    assert.equal(app.model.status(meeting, record, options).t, 'Retard', 'A pending or newer justification is not an accepted excuse');
    assert.equal(app.model.canRequest(meeting, record, options), false);
    app.model.renderPersonal(app.host, [meeting], { [meeting.id]: record }, data);
    assert.equal(app.host.querySelector('[data-att-request]'), null);
    assert.match(app.host.innerHTML, /Justificatif en attente/);
    assert.equal(app.model.request(meeting.id), false); assert.equal(app.model.isReviewing(), false);
    assert.equal(app.calls.length, 0);
  }
});

test('The roster shows a single status badge and keeps review eligibility intact', async () => {
  const legacy = { mid: meeting.id, email: member, at: 100 };
  const scenarios = [
    { name: 'accepted justification', options: { justifications: [legacy], decisions: [{ ...legacy, ok: true, at: 101 }] }, requestable: false, text: /Justificatif accepté/ },
    { name: 'permission', options: { permissions: [{ ...legacy, reason: 'Permission accordée' }] }, requestable: false, text: /Permission accordée/ },
    { name: 'confirmed review', options: { events: [requestEvent, { id: 'confirmed-own-row', meeting_id: meeting.id, member_email: member,
      kind: 'decision', request_id: requestEvent.id, outcome: 'on_time', actor_email: reviewer,
      reason: 'Le rapport a été vérifié.', created_at: new Date(start + 3600000).toISOString() }] }, requestable: false, text: /Vérification terminée/ },
    { name: 'pending review', options: { events: [requestEvent] }, requestable: false, text: /Vérification en cours/ },
    { name: 'pending justification', options: { justifications: [legacy] }, requestable: false, text: /Justificatif en cours d’examen/ },
    { name: 'unresolved record', options: {}, requestable: true, text: /Demander une vérification/ }
  ];
  for (const scenario of scenarios) {
    const app = harness({ ...scenario.options, meetings: [{ ...meeting, invitees: [member] }],
      records: [{ key: 'att:' + meeting.id + ':' + member, meet: meeting.id, email: member, at: start + 660000 }] });
    await app.censor();
    assert.equal(app.host.querySelector('[data-att-request]') == null, true, scenario.name);
    assert.match(app.host.innerHTML, /<td data-label="Statut"><span class="mt-pill mt-[^"]+">[^<]+<\/span><\/td>/, scenario.name);
    if (!scenario.requestable) assert.equal(app.model.request(meeting.id), false, 'A stale control cannot reopen ' + scenario.name);
    assert.equal(app.calls.length, 0);
  }
});

test('The real Censeur page keeps unknown historical rosters and loading errors from inventing absences', async () => {
  const app = harness({ meetings: [{ ...meeting, start: Date.now() - 7200000 }],
    users: [{ email: member, name: 'Membre connu' }, { email: 'new@example.test', name: 'Membre arrivé plus tard' }],
    records: [{ key: 'att:' + meeting.id + ':' + member, meet: meeting.id, email: member, at: start }] });
  await app.censor();
  assert.equal(app.host.querySelectorAll('td[data-label="Email"]').length, 1, 'Only the historical record supplies an attendee');
  assert.doesNotMatch(app.host.innerHTML, /<td data-label="Email">new@example\.test<\/td>/);
  assert.match(app.host.innerHTML, /Liste des invités non conservée/);
  app.config.errorKind = 'events'; await app.refreshCensor();
  assert.match(app.host.innerHTML, /Présence indisponible/);
  assert.doesNotMatch(app.host.innerHTML, /class="mt-pill mt-abs">Absent<\/span>/);
  assert.equal(app.host.querySelector('[data-att-request]'), null, 'Failed data cannot authorize a new request');
});

test('Shared loading paginates histories and scopes ordinary member queries to their account', async () => {
  const many = Array.from({ length: 501 }, (_, i) => ({ ...requestEvent, id: 'r' + i }));
  const app = harness({ events: many }); const bundle = await app.model.load();
  assert.equal(bundle.events[meeting.id + ':' + member].length, 501);
  assert.equal(app.queries.filter(q => q.table === 'afriflow_attendance_events').length, 2);
  assert.ok(app.queries.filter(q => q.table !== 'afriflow_attendance_events').every(q => q.pattern.endsWith(':' + member)));
});

test('Every attendance collection failure rejects the whole shared snapshot', async () => {
  for (const kind of ['events', 'justifications', 'decisions', 'permissions']) {
    const app = harness({ errorKind: kind });
    await assert.rejects(app.model.load(), error => error.message === kind + ' unavailable');
  }
});

test('Personal history retains older meetings and pointages beyond one API page', async () => {
  const app = harness({ meetings: Array.from({ length: 501 }, (_, i) => ({ ...meeting, id: 'mtest' + i })),
    records: Array.from({ length: 501 }, (_, i) => ({ meet: 'mtest' + i, email: member, at: start })) });
  const snapshot = await app.model.loadPersonal();
  assert.equal(snapshot.meetings.length, 501);
  assert.equal(snapshot.records.length, 501);
  assert.equal(app.queries.filter(q => q.pattern === 'att:m%:' + member).length, 2);
});

test('A late data response from a previous account never becomes the current attendance snapshot', async () => {
  let release; const delay = new Promise(resolve => { release = resolve; });
  const app = harness({ respond: async (query, normal) => { await delay; return normal(query); } });
  const reading = app.model.load();
  app.window.loggedUserEmail = 'other@example.test'; release();
  await assert.rejects(reading, /session a changé/);
});

test('Late censeur configuration does not break the member’s own view, but revoked review access discards old data', async () => {
  for (const upgrading of [true, false]) {
    let release; const delay = new Promise(resolve => { release = resolve; });
    const app = harness({ role: upgrading ? 'shareholder' : 'admin', respond: async (query, normal) => { await delay; return normal(query); } });
    const reading = app.model.load();
    app.window.USER_ROLE = upgrading ? 'admin' : 'shareholder'; release();
    if (upgrading) assert.equal((await reading).account, member);
    else await assert.rejects(reading, /session a changé/);
  }
});

test('Personal loading shows an error instead of inferring attendance from any failed query', async () => {
  for (const kind of ['meetings', 'records', 'justifications', 'decisions', 'permissions', 'events']) {
    const app = harness(); const rendered = await app.personalWithQueryError(kind);
    assert.match(rendered, /Lecture des présences impossible/);
    assert.match(rendered, /Aucun statut d’absence n’est déduit/);
    assert.doesNotMatch(rendered, /mt-abs|Retard \(\+/);
  }
});

test('Request forms validate the explanation and send only the member’s declaration to the RPC', async () => {
  const app = harness(); const bundle = await app.model.load();
  app.model.renderPersonal(app.host, [meeting], { [meeting.id]: { at: start + 660000 } }, bundle);
  assert.equal(app.model.request(meeting.id), true);
  assert.equal(app.document.activeElement.id, 'afAttTitle', 'Opening a mobile form must not automatically show its keyboard');
  assert.match(app.document.querySelector('.af-att-overlay').innerHTML, /Fuseau de saisie/);
  app.input('afAttReason', 'court'); await app.submit(); assert.equal(app.calls.length, 0);
  app.input('afAttReason', requestEvent.reason); app.input('afAttTime', '2026-11-26T14:00:00');
  await app.submit();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].name, 'af_meeting_attendance_request');
  assert.deepEqual(Object.keys(app.calls[0].args).sort(), ['p_claimed_at', 'p_meeting_id', 'p_reason']);
  assert.equal(app.calls[0].args.p_meeting_id, meeting.id);
  assert.equal(app.calls[0].args.p_claimed_at, new Date('2026-11-26T14:00:00').toISOString());
  assert.equal(app.events.length, 1); assert.equal(app.model.isReviewing(), false);
});

test('An account switch or denied RPC cannot silently submit or dismiss a correction', async () => {
  const app = harness({ rpcResult: { error: { message: 'Accès refusé' } } });
  const data = await app.model.load(); app.model.renderPersonal(app.host, [meeting], { [meeting.id]: { at: start + 660000 } }, data);
  app.model.request(meeting.id); app.input('afAttReason', requestEvent.reason);
  await app.submit(); assert.equal(app.events.length, 0); assert.equal(app.model.isReviewing(), true);
  assert.match(app.document.getElementById('afAttError').textContent, /Accès refusé/);
  app.window.loggedUserEmail = 'other@example.test'; await app.submit();
  assert.equal(app.calls.length, 1); assert.match(app.document.getElementById('afAttError').textContent, /session a changé/);
});

test('Review forms require an explicit conclusion, preserve source evidence and prevent self-review', async () => {
  const app = harness({ account: reviewer, role: 'admin', events: [requestEvent] }); const bundle = await app.model.load();
  app.host.innerHTML = '<details class="mt-m"><p><button data-csdel="mtest01">Supprimer</button></p></details>';
  app.model.decorateCensor(app.host, [meeting], { ['att:' + meeting.id + ':' + member]: { meet: meeting.id, email: member, at: start + 660000 } }, bundle);
  assert.equal(app.model.review(requestEvent.id), true);
  assert.match(app.document.querySelector('.af-att-overlay').innerHTML, /Pointage AfriFlow/);
  assert.match(app.document.querySelector('.af-att-overlay').innerHTML, /Déclaration du membre/);
  app.input('afAttReason', 'Le rapport Teams confirme une arrivée à l’heure.');
  await app.submit(); assert.equal(app.calls.length, 0, 'No default punitive outcome');
  app.input('afAttOutcome', 'on_time'); await app.submit();
  assert.equal(app.calls[0].name, 'af_meeting_attendance_decide');
  assert.deepEqual(Object.keys(app.calls[0].args).sort(), ['p_confirmed_at', 'p_outcome', 'p_reason', 'p_request_id']);
  assert.equal(app.calls[0].args.p_confirmed_at, null);
  const own = harness({ account: member, role: 'admin', events: [requestEvent] }); await own.model.load();
  assert.equal(own.model.review(requestEvent.id), false); assert.equal(own.calls.length, 0);
});

test('Personal history shows the reviewer and reason without injecting untrusted HTML', () => {
  const app = harness();
  const decision = { id: 'd1', kind: 'decision', request_id: requestEvent.id, outcome: 'on_time', actor_email: reviewer,
    reason: '<script>unsafe()</script> Rapport Teams contrôlé.', created_at: new Date(start + 3600000).toISOString() };
  const data = app.data({ events: { [meeting.id + ':' + member]: [requestEvent, decision] } });
  app.model.renderPersonal(app.host, [meeting], { [meeting.id]: { at: start + 660000 } }, data);
  assert.match(app.host.innerHTML, /class="mt-pill mt-ok">Présent<\/span>/);
  assert.match(app.host.innerHTML, /reviewer@example.test/);
  assert.match(app.host.innerHTML, /11 min après/);
  assert.match(app.host.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(app.host.innerHTML, /<script>/);
});

test('Correction dialogs trap focus, close with Escape and restore the invoking control', () => {
  const app = harness(); app.model.renderPersonal(app.host, [meeting], { [meeting.id]: { at: start + 660000 } }, app.data());
  const opener = app.document.createElement('button'); app.document.body.appendChild(opener); opener.focus();
  app.model.request(meeting.id);
  const submit = app.document.getElementById('afAttSubmit'); submit.focus(); let prevented = false;
  app.document.dispatchEvent({ type: 'keydown', key: 'Tab', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(app.document.activeElement.id, 'afAttClose');
  app.document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.equal(app.model.isReviewing(), false); assert.equal(app.document.activeElement, opener);
});
