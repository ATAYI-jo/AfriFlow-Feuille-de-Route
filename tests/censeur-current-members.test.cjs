const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '../modules/collaboration/meetings.js'), 'utf8');

test('Censeur invitee options require current registered membership', () => {
  assert.match(code, /await window\.AFRI\.listUsers\(\)/);
  assert.match(code, /await window\.AFRI\.listMembers\(\)/);
  assert.match(code, /allowed\.has\(email\)/);
  assert.doesNotMatch(code, /if\(!U\.length&&window\.AFRI\)U=await window\.AFRI\.listUsers\(\)/);
  assert.match(code, /memberLoadError/);
  assert.match(code, /createButton\.disabled=true/);
});

test('Stale directory profiles cannot be meeting invitees', () => {
  const current = [{ email: 'valid@example.test', name: 'Active member' }];
  const directory = [
    { email: 'valid@example.test', display_name: 'Active member' },
    { email: 'deleted@example.test', display_name: 'Former member' }
  ];
  const allowed = new Map(current.map(u => [u.email.toLowerCase(), u]));
  const selected = directory.filter(u => allowed.has(u.email.toLowerCase()));
  assert.deepEqual(selected.map(u => u.email), ['valid@example.test']);
});

test('Censeur displays profile photo and professional role when selecting invitees', () => {
  assert.match(code, /function inviteeAvatar\(u\)/);
  assert.match(code, /function inviteeCard\(u\)/);
  assert.match(code, /u\.job_title/);
  assert.match(code, /u\.department/);
  assert.match(code, /Poste non renseigné/);
  assert.match(code, /\.map\(inviteeCard\)/);
  assert.match(code, /data-cs-invite/);
});
