const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const auth=read("modules/auth/account-management.js");
const core=read("afriflow-core.js");
const profile=read("afriflow-profile.js");
const countries=read("afriflow-countries.js");
const admin=read("market.js");
const signIn=read("supabase/functions/afriflow-member-login/index.ts");
const cert=read("supabase/functions/afriflow-certificates/index.ts");
test("email login stays on Supabase Auth; identifiers have guarded sign-in",()=>{
 assert.match(auth,/auth.signInWithPassword/);
 assert.match(auth,/functions.invoke\("afriflow-member-login"/);
 assert.match(auth,/auth.setSession/);
 assert.match(signIn,/auth.admin.getUserById/);
 assert.match(signIn,/auth.signInWithPassword/);
 assert.match(signIn,/Trop de tentatives/);
 assert.doesNotMatch(signIn,/console.log\(.*password/);
 assert.match(core,/identifiant personnel AfriFloW/);
});
test("member profile shows two immutable references",()=>{
 assert.match(profile,/afriflow_member_ids/);
 assert.match(profile,/login_id,admin_number/);
 assert.match(profile,/Numéro administratif/);
 assert.match(cert,/data.adminNumber/);
 assert.match(cert,/data.loginId/);
});
test("ISO country selections are separate from market",()=>{
 assert.match(countries,/ISO 3166-1/);
 assert.match(countries,/TG/);
 assert.match(countries,/FR/);
 assert.match(profile,/pf_countryCode/);
 assert.match(profile,/country_code:countryCode/);
 assert.match(admin,/market_name:market,country_code:/);
});
