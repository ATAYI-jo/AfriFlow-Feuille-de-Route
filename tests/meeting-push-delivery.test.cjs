const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sharedSource = stripTypeScriptTypes(read('supabase/functions/_shared/meeting-notifications.ts'))
  .replace(/^export /gm, '');
const sharedNames = ['SITE_URL', 'buildRecipientDirectory', 'loadRecipientDirectory', 'normalizeEmail',
  'canReceiveScheduled', 'canReceiveNews', 'canReceiveMeeting',
  'meetingNotification', 'notificationTtl', 'fcmData'];
const shared = vm.runInNewContext(sharedSource + '\n({' + sharedNames.join(',') + '})', { URL });
const now = Date.parse('2026-11-26T12:00:00Z');
const meeting = { id: 'mabc123', title: 'Réunion équipe', start: now, dur: 60,
  link: 'https://teams.microsoft.com/l/meetup-join/fixture', invitees: ['approved@example.test'] };
const profiles = [
  { user_id: 'approved-id', email: 'approved@example.test' },
  { user_id: 'collaborator-id', email: 'collaborator@example.test' },
  { user_id: 'client-id', email: 'client@example.test' },
  { user_id: 'pending-id', email: 'pending@example.test' },
  { user_id: 'admin-id', email: 'admin@example.test' },
];
const members = [
  { user_id: 'approved-id', access_mode: 'shareholder_approved' },
  { user_id: 'collaborator-id', access_mode: 'collaborator' },
  { user_id: 'client-id', access_mode: 'client', requested_role: 'shareholder' },
  { user_id: 'pending-id', access_mode: 'shareholder_pending' },
];
const admins = [{ email: 'admin@example.test' }];
const directory = shared.buildRecipientDirectory(members, profiles, admins);
const recipient = (email, userId) => ({ user_email: email, ...(userId === undefined ? {} : { user_id: userId }) });

test('scheduled notifications require approved access, the canonical profile and matching FCM account', () => {
  for (const email of ['approved@example.test', 'collaborator@example.test', 'admin@example.test']) {
    assert.equal(shared.canReceiveScheduled(directory, recipient(email)), true);
  }
  for (const email of ['client@example.test', 'pending@example.test', 'unknown@example.test']) {
    assert.equal(shared.canReceiveScheduled(directory, recipient(email)), false);
  }
  assert.equal(shared.canReceiveScheduled(directory, recipient(' APPROVED@EXAMPLE.TEST ', 'approved-id')), true);
  assert.equal(shared.canReceiveScheduled(directory, recipient('approved@example.test', 'other-account')), false);
  const ambiguous = shared.buildRecipientDirectory(members, [...profiles, { user_id: 'other', email: 'approved@example.test' }], admins);
  assert.equal(shared.canReceiveScheduled(ambiguous, recipient('approved@example.test')), false);
});

test('explicit rosters are respected, including empty lists, while legacy meetings retain eligible-all delivery', () => {
  assert.equal(shared.canReceiveMeeting(directory, recipient('approved@example.test'), meeting), true);
  assert.equal(shared.canReceiveMeeting(directory, recipient('collaborator@example.test'), meeting), false);
  assert.equal(shared.canReceiveMeeting(directory, recipient('admin@example.test'), meeting), false);
  assert.equal(shared.canReceiveMeeting(directory, recipient('approved@example.test'), { ...meeting, invitees: [] }), false);
  assert.equal(shared.canReceiveMeeting(directory, recipient('approved@example.test'), { ...meeting, invitees: [' APPROVED@EXAMPLE.TEST '] }), true);
  assert.equal(shared.canReceiveMeeting(directory, recipient('collaborator@example.test'), { ...meeting, invitees: null }), true);
  assert.equal(shared.canReceiveMeeting(directory, recipient('client@example.test'), { ...meeting, invitees: null }), false);
  assert.equal(shared.canReceiveNews(directory, recipient('client@example.test')), true, 'news keeps its separate market-member policy');
});

test('meeting stages use server time, explicit expiry and short transport TTLs', () => {
  assert.equal(shared.meetingNotification(meeting, now - 15 * 60000 - 1), null);
  const soon = shared.meetingNotification(meeting, now - 15 * 60000).payload;
  assert.equal(soon.stage, 'soon');
  assert.equal(soon.expiresAt, now);
  assert.equal(shared.notificationTtl(soon, now - 15 * 60000), 300);
  assert.equal(shared.notificationTtl(soon, now - 59999), 59);
  assert.equal(shared.notificationTtl(soon, now), 0);
  const starting = shared.meetingNotification(meeting, now).payload;
  assert.equal(starting.stage, 'start');
  assert.equal(starting.end, now + 60 * 60000);
  assert.equal(starting.expiresAt, now + 10 * 60000);
  assert.equal(shared.meetingNotification(meeting, now + 10 * 60000), null);
  assert.equal(shared.meetingNotification({ ...meeting, dur: 2 }, now).payload.expiresAt, now + 2 * 60000);
  assert.equal(shared.meetingNotification({ ...meeting, dur: 0 }, now), null);
  assert.equal(shared.meetingNotification({ ...meeting, dur: 'invalid' }, now), null);
  assert.equal(shared.meetingNotification({ ...meeting, cancelled: true }, now), null);
});

test('meeting payloads expose only the authenticated AfriFlow route, including for old clients', () => {
  const payload = shared.meetingNotification(meeting, now).payload;
  assert.equal(payload.url, 'https://afriflow.pages.dev/?meeting=mabc123');
  assert.equal(payload.meetingId, meeting.id);
  assert.equal(payload.meetingTitle, meeting.title);
  for (const link of [meeting.link, 'https://teams.microsoft.com.evil.test/x', 'javascript:alert(1)',
    'http://teams.microsoft.com/x', 'https://user:pass@teams.microsoft.com/x', 'https://teams.microsoft.com:444/x']) {
    const notice = shared.meetingNotification({ ...meeting, link }, now).payload;
    assert.equal(notice.teamsUrl, undefined, 'legacy SW/APK direct-Teams actions must not be enabled');
    assert.equal(notice.link, undefined);
    assert.equal(notice.url, 'https://afriflow.pages.dev/?meeting=mabc123');
    assert.ok(!JSON.stringify(notice).includes(link));
  }
  assert.equal(shared.meetingNotification({ ...meeting, id: '../evil' }, now), null);
});

test('metadata revisions preserve occurrence claims, and FCM preserves every envelope field as a string', () => {
  const original = shared.meetingNotification(meeting, now);
  const revised = shared.meetingNotification({ ...meeting, title: 'Titre corrigé', invitees: null, link: '' }, now);
  assert.equal(original.eventKey, revised.eventKey);
  assert.notEqual(original.eventKey, shared.meetingNotification({ ...meeting, start: now - 60000 }, now).eventKey);
  const data = shared.fcmData(original.payload);
  for (const [key, value] of Object.entries(original.payload)) assert.equal(data[key], String(value));
});

// Fully in-memory Supabase and delivery transports: no real database, auth,
// notification endpoint or external network request is ever used by these tests.
function dispatcher(transport, options = {}) {
  let currentTime = options.now ?? now, handler;
  const sent = [], claims = new Set(), claimAttempts = [];
  const devices = profiles.map((profile, index) => ({ token: 'fixture-token-' + index,
    endpoint: 'https://push.invalid/' + index, user_email: profile.email, user_id: profile.user_id,
    p256dh: 'fixture-key', auth_key: 'fixture-auth' }));
  devices.push({ ...devices[0], token: 'stale-token', endpoint: 'https://push.invalid/orphan',
    user_id: 'wrong-account', ...(transport === 'push' ? { user_email: 'orphan@example.test' } : {}) });
  const rows = {
    afriflow_push_subscriptions: devices,
    afriflow_fcm_devices: devices,
    afriflow_market_profiles: members,
    afriflow_profiles: profiles,
    afriflow_admins: admins,
    afriflow_push_settings: [{ key: 'vapid', value: { publicKey: 'fixture', privateKey: 'fixture' } },
      { key: 'cron_token', value: { token: 'fixture-cron' } }],
    afriflow_state: [{ key: 'meet:' + meeting.id, value: { ...meeting, ...options.meeting } }],
    afriflow_market_products: [],
  };
  function query(table) {
    const filters = []; let operation = 'select', inserted, columns = '*', one = false, limit = Infinity;
    const builder = {
      select(value) { columns = value; return this; },
      limit(value) { limit = value; return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      gte(key, value) { filters.push(row => row[key] >= value); return this; },
      like(key, value) { filters.push(row => String(row[key] || '').startsWith(value.split('%')[0])); return this; },
      order() { return this; },
      maybeSingle() { one = true; return this; },
      single() { one = true; return this; },
      insert(value) { operation = 'insert'; inserted = value; return this; },
      delete() { operation = 'delete'; return this; },
      then(resolve, reject) {
        try {
          if (options.failTable === table) return Promise.resolve({ data: null, error: { message: 'fixture failure' } }).then(resolve, reject);
          if (operation === 'insert') {
            assert.match(table, /^afriflow_(push|fcm)_deliveries$/, 'only mocked delivery claims may be written');
            const key = table + ':' + inserted.event_key + ':' + (inserted.endpoint || inserted.token);
            claimAttempts.push(inserted.event_key);
            if (claims.has(key)) return Promise.resolve({ error: { code: '23505' } }).then(resolve, reject);
            claims.add(key);
            if (options.expireAfterClaim) currentTime = now + 10 * 60000;
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          if (operation === 'delete') return Promise.resolve({ error: null }).then(resolve, reject);
          const values = (rows[table] || []).filter(row => filters.every(filter => filter(row))).slice(0, limit)
            .map(row => columns === '*' ? row : Object.fromEntries(columns.split(',').map(key => [key, row[key]])));
          return Promise.resolve({ data: one ? values[0] || null : values, error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return builder;
  }
  const client = { from: query };
  class ServerDate extends Date { constructor(...args) { super(...(args.length ? args : [currentTime])); } static now() { return currentTime; } }
  const environment = {
    SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
    AFRIFLOW_FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'fixture@example.test', private_key: 'AQ==', project_id: 'fixture' }),
  };
  const context = { ...shared, URL, URLSearchParams, Request, Response, TextEncoder, Uint8Array,
    btoa, atob, Date: ServerDate, console: { error() {}, warn() {} },
    createClient: () => client,
    Deno: { env: { get: key => environment[key] }, serve: callback => { handler = callback; } },
    webpush: { sendNotification: async (device, payload, config) => { sent.push({ target: device.endpoint, payload: JSON.parse(payload), ttl: config.TTL }); } },
    crypto: { subtle: { importKey: async () => ({}), sign: async () => new Uint8Array([1, 2, 3]) } },
    fetch: async (url, init) => {
      if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'fixture-token' }));
      assert.equal(url, 'https://fcm.googleapis.com/v1/projects/fixture/messages:send', 'unexpected external request');
      const { message } = JSON.parse(init.body);
      sent.push({ target: message.token, payload: message.data, ttl: message.android.ttl });
      return new Response(JSON.stringify({ name: 'fixture-delivery' }));
    },
  };
  const source = stripTypeScriptTypes(read('supabase/functions/afriflow-' + transport + '/index.ts'))
    .replace(/^import .*;\s*$/gm, '');
  vm.runInNewContext(source, context, { filename: transport + '-fixture.ts' });
  return { sent, claims, claimAttempts, rows, async run() {
    const response = await handler(new Request('https://edge.invalid', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-afri-cron': 'fixture-cron' }, body: JSON.stringify({ action: 'dispatch' }) }));
    return { status: response.status, body: await response.json() };
  } };
}

for (const transport of ['push', 'fcm']) {
  test(transport + ' dispatcher only delivers the explicit approved roster and complete envelope', async () => {
    const fixture = dispatcher(transport, { meeting: { invitees: ['approved@example.test', 'client@example.test', 'pending@example.test'] } });
    assert.equal((await fixture.run()).status, 200);
    assert.equal(fixture.sent.length, 1);
    const payload = fixture.sent[0].payload;
    assert.equal(payload.meetingId, meeting.id);
    assert.equal(payload.meetingTitle, meeting.title);
    assert.equal(Number(payload.start), now);
    assert.equal(Number(payload.end), now + 60 * 60000);
    assert.equal(Number(payload.expiresAt), now + 10 * 60000);
    assert.equal(payload.stage, 'start');
    assert.equal(payload.url, 'https://afriflow.pages.dev/?meeting=mabc123');
    assert.equal(payload.teamsUrl, undefined, 'old clients cannot bypass check-in from a raw Teams action');
    assert.equal(parseInt(fixture.sent[0].ttl, 10), 300);
    fixture.rows.afriflow_state[0].value.title = 'Modification après envoi';
    await fixture.run();
    assert.equal(fixture.sent.length, 1, 'a revision cannot resend a claimed occurrence');
  });

  test(transport + ' legacy meeting only reaches approved members and admins', async () => {
    const fixture = dispatcher(transport, { meeting: { invitees: null } });
    assert.equal((await fixture.run()).status, 200);
    assert.equal(fixture.sent.length, 3);
  });

  test(transport + ' dispatcher skips expired meetings and rechecks expiry after claiming', async () => {
    const expired = dispatcher(transport, { now: now + 10 * 60000 });
    assert.equal((await expired.run()).status, 200);
    assert.equal(expired.sent.length, 0);
    assert.equal(expired.claimAttempts.length, 0);
    const delayed = dispatcher(transport, { expireAfterClaim: true });
    assert.equal((await delayed.run()).status, 200);
    assert.equal(delayed.sent.length, 0, 'queue/claim latency cannot send an expired meeting');
  });

  test(transport + ' recipient lookup failures fail closed without delivery', async () => {
    const fixture = dispatcher(transport, { failTable: 'afriflow_market_profiles' });
    assert.equal((await fixture.run()).status, 500);
    assert.equal(fixture.sent.length, 0);
    assert.equal(fixture.claimAttempts.length, 0);
  });
}
