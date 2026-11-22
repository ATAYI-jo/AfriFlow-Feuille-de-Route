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
 assert.match(edge,/FICHE DE PROFIL AFRIFLOW/);
 assert.match(edge,/Statut du compte : non approuve \/ non certifie/);
 assert.match(edge,/Ce document ne constitue pas un certificat de partenariat ou d.actionnariat/);
 assert.match(edge,/statut du compte : approuve/i);
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
