const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const profile=read('afriflow-profile.js'),workspace=read('afriflow-workspace.js'),market=read('market.js');
const edge=read('supabase/functions/afriflow-certificates/index.ts'),sql=read('supabase/migrations/20261122170000_member_certificates.sql');
const verify=read('verify-certificate.html');
test('Member profile provides verified PDF and access only to own certificates',()=>{
 assert.match(profile,/function loadCertificatesProfile\(/);
 assert.match(profile,/certificateCall\("profile_summary"\)/);
 assert.match(profile,/certificateCall\("profile_pdf"/);
 assert.match(edge,/\.eq\("holder_user_id",user\.id\)/);
 assert.match(edge,/row\.holder_user_id!==user\.id&&!isAdmin/);
});
const eligibilitySource=edge.slice(edge.indexOf('async function eligibility('),edge.indexOf('function lines(')).replaceAll(':any','');
const eligible=require('node:vm').runInNewContext('('+eligibilitySource+')');
function certificateDb(profile,enabled,market){
 const tables={afriflow_market_profiles:profile,afriflow_partner_terms:{is_enabled:enabled},afriflow_partner_markets:{market_name:market}};
 return {from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:tables[table]})})})})};
}
test('Partner role, current terms and assigned market are checked server-side',async()=>{
 const row={certificate_type:'partner',holder_user_id:'fixture',market_name:'Lomé'};
 const profile={requested_role:'partner',access_mode:'partner_approved'};
 assert.equal(await eligible(certificateDb(profile,true,'Lomé'),row),true);
 assert.equal(await eligible(certificateDb(profile,false,'Lomé'),row),false);
 assert.equal(await eligible(certificateDb(profile,true,'Dakar'),row),false);
 assert.equal(await eligible(certificateDb({...profile,access_mode:'partner_waiting'},true,'Lomé'),row),false);
 assert.match(sql,/certificate_market_required/);
});
test('Existing shareholder certificates require legal evidence and manual issuance is closed',async()=>{
 const row={certificate_type:'shareholder',holder_user_id:'fixture',legal_evidence_confirmed:true};
 const db=certificateDb({requested_role:'shareholder',access_mode:'shareholder_approved'});
 assert.equal(await eligible(db,row),true);
 assert.equal(await eligible(db,{...row,legal_evidence_confirmed:false}),false);
 assert.match(edge,/if\(action==="issue"\)\{return json\(.*?,410\)/);
 assert.match(sql,/certificate_shareholder_evidence/);
});
test('PDF contains QR verification and issuance reference, supports revocation',()=>{
 assert.match(edge,/certificatePdf\(row/);
 assert.match(edge,/qr\.addData\(verifyUrl\(row\.verification_token\)\)/);
 assert.match(edge,/action==="revoke"/);
 assert.match(edge,/row\.status==="active"&&await eligibility\(db,row\)/);
 assert.match(verify,/action=verify/);
});
test('Certificate registry excludes direct client reads and keeps token private',()=>{
 assert.match(sql,/revoke all on public\.afriflow_certificates from anon,authenticated,public/);
 assert.match(sql,/enable row level security/);
 assert.doesNotMatch(sql,/create policy.*for select to authenticated/i);
 assert.match(edge,/if\(action==="admin_list"\)\{\s*if\(!isAdmin\)return json/);
});
