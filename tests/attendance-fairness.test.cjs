/* Behavioral tests for the production attendance model, loader and review forms. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'modules/collaboration/attendance.js'), 'utf8');
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
      const query = { table: name, select() { return this; }, like(_, pattern) { this.pattern = pattern; return this; }, eq(_, value) { this.pattern = value; return this; }, order() { return this; }, limit() { return this; }, range(from, to) { this.from = from; this.to = to; return this; },
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

test('Raw clicks describe pointage, with exact grace boundaries and no automatic absence', () => {
  const { model } = harness();
  assert.equal(model.status(meeting, { at: start }).t, 'Pointage à l’heure');
  assert.equal(model.status(meeting, { at: start + 5 * 60000 }).k, 'ok');
  const late = model.status(meeting, { at: start + 5 * 60000 + 1 });
  assert.equal(late.t, 'Pointage à vérifier');
  assert.equal(late.rawAt, start + 5 * 60000 + 1);
  assert.equal(model.status(meeting, null, { now: start + 2 * 3600000 }).t, 'Présence à confirmer');
  assert.equal(model.status(meeting, null, { now: start + 2 * 3600000 }).k, 'wait');
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
  assert.equal(model.status(meeting, record, options).t, 'Excusé — justificatif accepté');
  assert.equal(model.status(meeting, record, { ...options, decision: { ok: true, at: 99 } }).t, 'Pointage à vérifier', 'An older acceptance does not approve a later resubmission');
});

test('Reviewed conclusions are distinct from immutable click evidence', () => {
  const { model } = harness(); const record = { at: start + 660000 };
  for (const [outcome, key] of Object.entries({ on_time: 'ok', late: 'late', excused: 'ok', absent: 'abs' })) {
    const value = model.status(meeting, record, { events: [requestEvent, { id: 'decision-1', kind: 'decision', request_id: requestEvent.id, outcome, actor_email: reviewer, created_at: new Date(start + 3600000).toISOString() }] });
    assert.equal(value.k, key); assert.equal(value.source, 'review'); assert.equal(value.rawAt, record.at);
  }
  assert.deepEqual(record, { at: start + 660000 });
});

test('Pending and rejected corrections do not invent a late or absent verdict', () => {
  const { model } = harness();
  const pending = model.status(meeting, { at: start + 660000 }, { events: [requestEvent] });
  assert.equal(pending.k, 'wait'); assert.equal(pending.t, 'Vérification en cours');
  const rejected = model.status(meeting, null, { events: [requestEvent, { id: 'd1', kind: 'decision', request_id: requestEvent.id, outcome: 'rejected', created_at: new Date(start + 3600000).toISOString() }], now: start + 7200000 });
  assert.equal(rejected.k, 'wait'); assert.equal(rejected.t, 'Présence à confirmer — demande refusée');
  assert.equal(model.status(meeting, { at: start }, { unavailable: true }).k, 'wait');
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
  assert.match(app.host.innerHTML, /Présence à l’heure confirmée/);
  assert.match(app.host.innerHTML, /reviewer@example.test/);
  assert.match(app.host.innerHTML, /11 min après/);
  assert.match(app.host.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(app.host.innerHTML, /<script>/);
});

test('Correction dialogs trap focus, close with Escape and restore the invoking control', () => {
  const app = harness(); const opener = app.document.createElement('button'); app.document.body.appendChild(opener); opener.focus();
  app.model.request(meeting.id);
  const submit = app.document.getElementById('afAttSubmit'); submit.focus(); let prevented = false;
  app.document.dispatchEvent({ type: 'keydown', key: 'Tab', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(app.document.activeElement.id, 'afAttClose');
  app.document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.equal(app.model.isReviewing(), false); assert.equal(app.document.activeElement, opener);
});
