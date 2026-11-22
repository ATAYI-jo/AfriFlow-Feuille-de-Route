const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const market=read('market.js'), css=read('market.css'), sql=read('supabase/migrations/20261122120000_partner_disputes_tracing.sql');
test('Partner graph uses recorded sales and does not add different currencies',()=>{
 assert.match(market,/function partnerAnalyticsHtml\(reports,orders\)/);
 assert.match(market,/code=codes.length===1\?codes\[0\]:null/);
 assert.match(market,/Chiffre d’affaires déclaré/);
});
test('Allocation trace exposes missing batch rather than inventing one',()=>{
 assert.match(market,/function partnerTraceHtml\(orders,reports,products\)/);
 assert.match(market,/Numéro de lot : non renseigné/);
 assert.match(market,/Dates détaillées de préparation, transport et livraison/);
});
test('Partner can file a dispute and admin can review it',()=>{
 assert.match(market,/id="afPartnerDisputeForm"/);
 assert.match(market,/from\("afriflow_partner_disputes"\)\.insert/);
 assert.match(market,/function loadAdminDisputes\(target\)/);
 assert.match(market,/renderDisputesAdmin: loadAdminDisputes/);
 assert.match(market,/description\.length<15/);
 assert.match(css,/\.af-dispute-admin/);
});
test('Dispute database enforces ownership, admin-only review and audit',()=>{
 assert.match(sql,/foreign key \(order_id,partner_user_id\)/);
 assert.match(sql,/partner_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/af_dispute_admin_update/);
 assert.match(sql,/af_dispute_guard/);
 assert.match(sql,/af_dispute_audit/);
 assert.doesNotMatch(sql,/grant all on public\.afriflow_partner_disputes to anon/i);
});
