// Exercise the actual scheduling handler and attendance conversion in separate
// processes: a process's TZ must not leak into another scenario or test suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const cases = {
  'Europe/Paris': { local: ['13:00', '14:00'], offsets: [-60, -120] },
  'Africa/Lome': { local: ['12:00', '12:00'], offsets: [0, 0] },
  'Asia/Kolkata': { local: ['17:30', '17:30'], offsets: [-330, -330] },
};
const days = ['2026-01-15', '2026-07-15'];

function expose(source, code) {
  const end = source.lastIndexOf('})();');
  assert.ok(end > 0, 'Production module must keep its closing IIFE');
  return source.slice(0, end) + code + '\n' + source.slice(end);
}

async function fixture() {
  const scenario = cases[process.env.TZ];
  assert.ok(scenario, 'Fixture requires an explicit test timezone');
  const nodes = {}, writes = [], notices = [];
  const eventTarget = () => ({ addEventListener() {}, removeEventListener() {}, dispatchEvent() {} });
  const document = Object.assign(eventTarget(), {
    getElementById(id) { return nodes[id] || null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const window = Object.assign(eventTarget(), {
    document, loggedUserEmail: 'member@example.test', USER_ROLE: 'admin',
    location: { href: 'https://afriflow.pages.dev/' }, toast(value) { notices.push(value); },
    __sb: { from() { return { async upsert(value) { writes.push(JSON.parse(JSON.stringify(value))); return { error: null }; } }; } },
  });
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-01-01T00:00:00Z'])); }
    static now() { return Date.parse('2026-01-01T00:00:00Z'); }
  }
  const context = vm.createContext({ window, document, navigator: {}, Date: FixtureDate, Intl,
    URL, URLSearchParams, console, setTimeout() {}, setInterval() {},
    MutationObserver: class { observe() {} }, Event: class {}, CustomEvent: class {},
  });
  const attendance = fs.readFileSync(path.join(root, 'modules/collaboration/attendance.js'), 'utf8');
  vm.runInContext(expose(attendance,
    'window.__timezoneAttendance = { dateLabel: dateLabel, zone: zone, readTime: readTime };'), context);
  const meetings = fs.readFileSync(path.join(root, 'modules/collaboration/meetings.js'), 'utf8');
  vm.runInContext(expose(meetings,
    'roster = [me()]; window.__timezoneMeetings = { fdt: fdt, fh: fh, create: onClick };'), context);

  const time = window.__timezoneAttendance, scheduler = window.__timezoneMeetings;
  const rows = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i], local = scenario.local[i], instant = Date.parse(day + 'T12:00:00Z');
    for (const [id, value] of Object.entries({ csT: 'Réunion de test', csD: day, csH: local,
      csU: '60', csG: '5', csL: '', csAudience: 'all' })) nodes[id] = { id, value };
    nodes.csErr = { textContent: '' }; nodes.viewHost = { dataset: {} };
    const button = { id: 'csGo', dataset: {} };
    await scheduler.create({ target: { closest() { return button; } } });
    assert.equal(nodes.csErr.textContent, '', 'Scheduling accepted the local date and time');
    assert.equal(writes.length, i + 1, 'Exactly one local, mocked upsert for each meeting');
    const meeting = writes[i].value;
    const record = { at: instant + 11 * 60000, scheduledStart: instant, graceMinutes: 5 };
    const value = window.AfriAttendance.status(meeting, record);
    const changedMeeting = { ...meeting, start: instant + 3600000, grace: 120 };
    const boundary = window.AfriAttendance.status(meeting, { ...record, at: instant + 5 * 60000 });
    const afterBoundary = window.AfriAttendance.status(meeting, { ...record, at: instant + 5 * 60000 + 1 });
    rows.push({ day, local, instant, meeting, offset: new Date(instant).getTimezoneOffset(),
      label: time.dateLabel(instant), full: scheduler.fdt(instant), short: scheduler.fh(instant),
      declared: time.readTime({ value: day + 'T' + local + ':45' }),
      rawAt: value.rawAt, offsetMinutes: value.offsetMinutes, status: value.k,
      snapshotOffsetMinutes: window.AfriAttendance.status(changedMeeting, record).offsetMinutes,
      boundary: boundary.k, afterBoundary: afterBoundary.k,
    });
  }
  assert.equal(time.readTime({ value: '' }), null, 'Optional arrival time stays absent');
  assert.throws(() => time.readTime({ value: 'not-a-date' }), /date et une heure valides/);
  process.stdout.write(JSON.stringify({ zone: time.zone(), rows, notices }));
}

if (process.argv[2] === '--timezone-fixture') {
  fixture().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const test = require('node:test');
  const results = new Map();
  function run(zone) {
    if (!results.has(zone)) {
      const result = spawnSync(process.execPath, [__filename, '--timezone-fixture'], {
        cwd: root, env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      results.set(zone, JSON.parse(result.stdout));
    }
    return results.get(zone);
  }
  for (const [zone, expected] of Object.entries(cases)) {
    test(zone + ': local scheduling preserves the same absolute winter and summer instants', () => {
      const output = run(zone);
      // Some ICU versions canonicalize Asia/Kolkata to the equivalent Asia/Calcutta.
      assert.ok(output.zone === zone || zone === 'Asia/Kolkata' && output.zone === 'Asia/Calcutta');
      for (const [i, row] of output.rows.entries()) {
        assert.equal(row.meeting.start, Date.parse(days[i] + 'T12:00:00Z'));
        assert.equal(row.meeting.timeZone, output.zone);
        assert.equal(row.meeting.dur, 60); assert.equal(row.meeting.grace, 5);
        assert.equal(row.offset, expected.offsets[i]);
      }
    });
    test(zone + ': display follows device time and datetime-local sends UTC with seconds intact', () => {
      for (const [i, row] of run(zone).rows.entries()) {
        assert.equal(row.short, expected.local[i]);
        assert.ok(row.full.includes(expected.local[i]));
        assert.ok(row.label.includes(expected.local[i] + ':00'));
        assert.equal(row.declared, days[i] + 'T12:00:45.000Z');
      }
    });
    test(zone + ': eleven minutes and the grace boundary do not depend on the timezone', () => {
      for (const row of run(zone).rows) {
        assert.equal(row.rawAt, row.instant + 11 * 60000);
        assert.equal(row.offsetMinutes, 11); assert.equal(row.snapshotOffsetMinutes, 11);
        assert.equal(row.status, 'late');
        assert.equal(row.boundary, 'ok');
        assert.equal(row.afterBoundary, 'late');
      }
    });
  }
}
