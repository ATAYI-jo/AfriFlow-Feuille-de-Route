const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const market=read("market.js");
const css=read("market.css");
const edge=read("supabase/functions/afriflow-access-admin/index.ts");
const sql=read("supabase/migrations/20261121125500_access_admin_console.sql");
test("Administrators can see an account access console",()=>{
  assert.match(market,/function loadAccessAdmin\(targetId\)/);
  assert.match(market,/id="afAccessAdmin"/);
  assert.match(market,/loadQuotes\(\); loadPartnerAdmin\(\); loadAccessAdmin\(\)/);
  assert.match(market,/afriflow-access-admin/);
  assert.match(css,/#afAccessAdmin \.af-access-user/);
});
test("Only verified administrators can list or change access",()=>{
  assert.match(edge,/service\.auth\.getUser\(token\)/);
  assert.match(edge,/from\("afriflow_admins"\)/);
  assert.match(edge,/if\(adminError\|\|!administrator\)/);
  assert.match(edge,/action==="decide"/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.af_access_admin_decide/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.af_access_admin_decide/);
});
test("Existing collaborators never become shareholders automatically",()=>{
  assert.match(sql,/old\.access_mode='collaborator'/);
  assert.match(sql,/WHEN 'shareholder' THEN 'shareholder_pending'/);
  assert.match(sql,/WHEN 'partner' THEN 'partner_waiting'/);
  assert.match(sql,/p_action='approve'/);
});
test("Admin decisions and audit writes are atomic",()=>{
  assert.match(edge,/service\.rpc\("af_access_admin_decide"/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/INSERT INTO public\.afriflow_access_audit/);
  assert.match(sql,/p_actor=p_target/);
});

test("Access approval RPC can read auth.users without exposing it to clients",()=>{
  const fix=read("supabase/migrations/20261122100000_access_admin_security_definer_fix.sql");
  assert.match(fix,/SECURITY DEFINER/);
  assert.match(fix,/SET search_path = ''/);
  assert.match(fix,/FROM PUBLIC, anon, authenticated/);
  assert.match(fix,/TO service_role/);
});
