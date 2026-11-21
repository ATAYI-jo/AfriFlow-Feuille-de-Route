/* Role-onboarding protections: no automatic Client on new Google OAuth sessions. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const auth=read('modules/auth/account-management.js');
const core=read('afriflow-core.js');
const sql=read('supabase/migrations/20261121193000_confirm_initial_market_role.sql');
test('First-time OAuth and old automatic clients must select a role',()=>{
 assert.match(auth,/role_selected_at/);
 assert.match(auth,/access_mode:"onboarding_required"/);
 assert.match(auth,/AFRI\.promptRoleChoice\s*=/);
 for(const role of ['client','partner','shareholder'])
   assert.ok(auth.includes('data-af-role="'+role+'"'));
 assert.match(auth,/var info = await finish\(user\)/);
 assert.ok(!auth.includes('finish(user, oauthIntent)'));
 assert.match(auth,/\.is\("role_selected_at",null\)/);
});
test('No collaboration bootstrap or navigation while onboarding is required',()=>{
 assert.match(auth,/if\(market\.access_mode==="onboarding_required"\)/);
 assert.match(core,/if\(market&&market\.access_mode==="onboarding_required"\)/);
 assert.match(auth,/await AFRI\.promptRoleChoice\(\)/);
});
test('Role choice remains a one-time server-confirmed event',()=>{
 assert.match(sql,/add column if not exists role_selected_at/);
 assert.match(sql,/old\.role_selected_at is not null/);
 assert.match(sql,/Profil déjà choisi/);
 assert.match(sql,/new\.access_mode := 'shareholder_pending'/);
 assert.match(sql,/new\.access_mode := 'partner_waiting'/);
 assert.match(sql,/where access_mode = 'collaborator'/);
});
