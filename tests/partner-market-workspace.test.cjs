const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const work=read("afriflow-workspace.js"),market=read("market.js"),css=read("market.css");
const sql=read("supabase/migrations/20261122150000_partner_market_assignments.sql");
test("Dedicated Partners page is admin-only and survives reload",()=>{
 assert.match(work,/base\.push\(\{id:"partners",n:"Partenaires"\}\)/);
 assert.match(work,/if\(\(id==="admin"\|\|id==="partners"\)&&!isAdmin\(\)\)/);
 assert.match(work,/if\(id==="admin"\)\{adminSection="overview";renAdmin\(\);\}else if\(id==="partners"\)renPartners\(\)/);
 assert.match(work,/saved\.id==="partners"/);
});
test("Each commercial partner has a market and traceable requests",()=>{
 assert.match(market,/function loadPartnerManagement\(targetId\)/);
 assert.match(market,/partnerCall\("admin_dashboard"\)/);
 assert.match(market,/afriflow_partner_markets/);
 assert.match(market,/Non renseigné/);
 assert.match(market,/data-market-assignment/);
 assert.match(market,/admin_set_order_status/);
 assert.match(market,/admin_set_report_status/);
 assert.match(css,/\.af-partner-market-card/);
});
test("Market assignment writes require administrator identity",()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/afriflow_private\.is_admin\(\)/);
 assert.match(sql,/assigned_by=\(select auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/grant .* to anon/i);
});


test("Partners is a compact read-only market overview, without duplicate approval panels",()=>{
 const partnerPage=work.slice(work.indexOf("async function renPartners()"),work.indexOf("async function renAdmin()"));
 const marketView=market.slice(market.indexOf("async function loadPartnerManagement("),market.indexOf("async function loadPartnerAssignmentsAdmin("));
 assert.match(partnerPage,/Situation commerciale par marché/);
 assert.doesNotMatch(partnerPage,/id="partnersAccess"|id="partnersTerms"|id="partnersDisputes"/);
 assert.match(marketView,/var groups=new Map\(\)/);
 assert.match(marketView,/af-market-kpis/);
 assert.match(marketView,/af-market-summary-details/);
 assert.match(marketView,/data-partner-mark-seen/);
 assert.doesNotMatch(marketView,/data-market-assignment|admin_set_order_status|admin_set_report_status/);
 assert.match(work,/renderMarketAssignmentsAdmin\("adMarketAssignments"\)/);
 assert.match(market,/renderMarketAssignmentsAdmin: loadPartnerAssignmentsAdmin/);
 assert.match(css,/\.af-market-summary/);
});
