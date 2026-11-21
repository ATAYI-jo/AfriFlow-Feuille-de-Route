/* Regression guardrails for first-login profile selection and data boundaries. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const accounts = read('modules/auth/account-management.js');
const core = read('afriflow-core.js');
const market = read('market.js');
const html = read('index.html');
const sql = read('supabase/migrations/20261121130000_roles_onboarding_approval.sql');
const portal = read('supabase/functions/afriflow-partner-portal/index.ts');
const view = read('supabase/functions/dropbox-view/index.ts');
const save = read('supabase/functions/dropbox-save/index.ts');

test('Unknown OAuth users must explicitly choose a profile once', () => {
  assert.match(accounts,/access_mode:"onboarding_required"/);
  assert.match(accounts,/AFRI\.promptRoleChoice\s*=/);
  for (const role of ['client','partner','shareholder']) {
    assert.ok(accounts.includes('data-af-role="'+role+'"'), 'Missing choice '+role);
  }
  assert.match(accounts,/var info = await finish\(user\)/);
  assert.doesNotMatch(accounts,/finish\(user, oauthIntent\)/);
});
test('Client and pending applicants cannot initialize shareholder collaboration', () => {
  assert.match(core,/accessMode!=="shareholder_approved"/);
  assert.ok(!core.includes('accessMode!=="collaborator"'));
  assert.match(accounts,/var allowed=isA\|\|market\.access_mode==="shareholder_approved"/);
  assert.match(market,/Cet espace est réservé aux actionnaires approuvés/);
  assert.match(market,/partner_approved/);
});
test('The shareholder UI is cloaked until profile-based routing finishes', () => {
  assert.match(html,/af-role-checking/);
  assert.match(html,/html\.af-role-checking #view-home/);
  assert.match(market,/document\.documentElement\.classList\.remove\("af-role-checking"\)/);
});
test('Approval and sensitive data checks exist server-side', () => {
  assert.match(sql,/Approbation reservee au serveur/);
  assert.match(sql,/as restrictive for all to authenticated/i);
  assert.match(sql,/shareholder_approved/);
  assert.match(sql,/partner_approved/);
  assert.match(portal,/const isApprovedPartner/);
  assert.match(portal,/access_mode: enabled \? "partner_approved" : "partner_waiting"/);
  assert.match(view,/Documents réservés aux actionnaires approuvés/);
  assert.match(save,/Édition réservée aux actionnaires approuvés/);
});
