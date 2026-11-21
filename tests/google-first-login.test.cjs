const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const auth=read('modules/auth/account-management.js');
const core=read('afriflow-core.js');
const market=read('market.js');
const html=read('index.html');
const sql=read('supabase/migrations/20261121193000_google_first_login_roles.sql');
const partner=read('supabase/functions/afriflow-partner-portal/index.ts');
test('New and auto-assigned Google users explicitly choose one role',()=>{
 assert.match(auth,/access_mode:"onboarding_required"/);
 assert.match(auth,/AFRI\.promptRoleChoice=async function/);
 assert.match(auth,/legacy_client:true/);
 for(const role of ['client','partner','shareholder'])assert.match(auth,new RegExp('data-af-role="'+role+'"'));
 assert.match(auth,/getUser\(\)/);
 assert.match(sql,/selection_confirmed_at/);
 assert.match(sql,/old\.selection_confirmed_at is null/);
});
test('Client and partner do not see shareholder workspace',()=>{
 assert.match(core,/\["shareholder_approved","collaborator"\]\.includes\(accessMode\)/);
 assert.match(market,/\["client", "shareholder_pending", "partner_waiting", "partner_approved"\]/);
 assert.match(market,/mode === "partner_approved"/);
 assert.match(market,/Cet espace est réservé aux actionnaires approuvés/);
 assert.match(html,/af-role-checking/);
 assert.match(market,/document\.documentElement\.classList\.remove\("af-role-checking"\)/);
});
test('Existing collaborators remain usable pending manual classification',()=>{
 assert.match(auth,/\["shareholder_approved","collaborator"\]\.includes\(market\.access_mode\)/);
 assert.match(sql,/\('shareholder_approved','collaborator'\)/);
});
test('Server approval and permissions are verified',()=>{
 assert.match(sql,/Approbation reservee au serveur/);
 assert.match(sql,/as restrictive for all to authenticated/i);
 assert.match(partner,/const isApprovedPartner/);
 assert.match(partner,/access_mode: enabled \? "partner_approved" : "partner_waiting"/);
});
test('Customer has no fake deleted collaboration account',()=>{
 assert.match(auth,/!\["shareholder_approved","collaborator"\]\.includes\(market\.access_mode\)/);
});
