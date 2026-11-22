const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const profile=read('afriflow-profile.js'),workspace=read('afriflow-workspace.js'),market=read('market.js');
const edge=read('supabase/functions/afriflow-certificates/index.ts'),sql=read('supabase/migrations/20261122170000_member_certificates.sql');
const verify=read('verify-certificate.html');
test('Member profile provides verified PDF and access only to own certificates',()=>{
 assert.match(profile,/function loadCertificatesProfile\(/);
 assert.match(profile,/certificateCall\("mine"\)/);
 assert.match(profile,/certificateCall\("download"/);
 assert.match(edge,/\.eq\("holder_user_id",user\.id\)/);
 assert.match(edge,/row\.holder_user_id!==user\.id&&!isAdmin/);
});
test('Partner role and assigned market are checked server-side',()=>{
 assert.match(edge,/profile\.requested_role/);
 assert.match(edge,/market\.data\?\.market_name===row\.market_name/);
 assert.match(edge,/!market\|\|!termsRes\.data\?\.is_enabled/);
 assert.match(sql,/certificate_market_required/);
});
test('Shareholder legal documentation and administrative issuance are required',()=>{
 assert.match(edge,/legalEvidenceConfirmed!==true/);
 assert.match(market,/Justificatifs d.actionnariat vérifiés/);
 assert.match(edge,/if\(!isAdmin\)return json/);
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
 assert.match(workspace,/partnersCertificates/);
});
