const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=x=>fs.readFileSync(path.join(__dirname,"..",x),"utf8");
const edge=read("supabase/functions/afriflow-certificates/index.ts");
const profile=read("afriflow-profile.js"),workspace=read("afriflow-workspace.js");
test("Every logged in member receives a live role-aware profile summary",()=>{
 assert.match(edge,/action==="profile_summary"/);
 assert.match(edge,/action==="profile_pdf"/);
 assert.match(edge,/const data=await liveProfile\(db,user\.id\)/);
 assert.match(edge,/afriflow_market_profiles/);
 assert.match(edge,/afriflow_partner_markets/);
 assert.match(edge,/Non renseigne/);
});
test("Unapproved and ordinary members do not receive a false corporate certificate",()=>{
 const title=edge.match(/const title=(.*?);/)[1];
 const evaluateTitle=require('node:vm').runInNewContext('(data)=>('+title+')');
 for(const type of ['member','partner','shareholder']){
   assert.equal(evaluateTitle({type,approved:false}),'ATTESTATION DE PROFIL');
 }
 assert.equal(evaluateTitle({type:'partner',approved:true}),'ATTESTATION DE PARTENARIAT COMMERCIAL');
 assert.equal(evaluateTitle({type:'shareholder',approved:true}),'ATTESTATION DE STATUT ACTIONNAIRE');
 assert.match(edge,/data.approved\?"Approuve dans AfriFlow":"En attente ou non approuve"/);
});
test("Profile offers immediate document preview and PDF download without manual issue",()=>{
 assert.match(profile,/certificateCall\("profile_summary"\)/);
 assert.match(profile,/certificateCall\("profile_pdf"\)/);
 assert.match(profile,/id="pfProfileView"/);
 assert.match(profile,/id="pfProfilePdf"/);
 assert.doesNotMatch(profile,/Aucun certificat actif/);
 assert.doesNotMatch(workspace,/partnersCertificates/);
 assert.match(edge,/Émission manuelle désactivée/);
});
test("Only authenticated account owner can request live profile document",()=>{
 assert.match(edge,/db\.auth\.getUser\(bearer\)/);
 assert.match(edge,/if\(!bearer\)return json\(\{error:"Authentification requise"\},401\)/);
 assert.match(edge,/const data=await liveProfile\(db,user\.id\)/);
 assert.doesNotMatch(profile,/certificateCall\("issue"/);
});
