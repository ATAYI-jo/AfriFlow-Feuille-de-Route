const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const workspace=read("afriflow-workspace.js");
const html=read("index.html");
const core=read("afriflow-core.js");
test("Last route is scoped to the signed-in account and restored after auth",()=>{
  assert.match(workspace,/LAST_VIEW_KEY="afriflow_last_view_v1"/);
  assert.match(workspace,/v\.email===String\(window\.loggedUserEmail\|\|""\)\.toLowerCase\(\)/);
  assert.match(workspace,/window\.onRole=function\(\)\{buildNav\(\);if\(!viewRestored\)restorePreviousView\(\)/);
  assert.match(workspace,/if\(saved\.id==="admin"&&!isAdmin\(\)\)return/);
});
test("Marketplace, personal register and workspace sections retain their navigation",()=>{
  assert.match(workspace,/rememberView\("market"\)/);
  assert.match(workspace,/rememberView\(id\)/);
  assert.match(html,/window\.AfriNav\.remember\("personal"\)/);
  assert.match(workspace,/window\.AfriOpenPersonal\(\)/);
  assert.match(workspace,/window\.addEventListener\("pagehide"/);
});
test("Logout clears saved navigation without granting access",()=>{
  assert.match(core,/if\(window\.AfriNav\)window\.AfriNav\.clear\(\)/);
  assert.match(workspace,/window\.AfriNav\.clear\(\);show\("home"\)/);
});
