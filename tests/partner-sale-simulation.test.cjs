const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const market=read('market.js'),css=read('market.css');
test('Simulation uses client calculation, not sale-report APIs or DB mutation',()=>{
 const start=market.indexOf('function runPartnerSaleSimulation()'),end=market.indexOf('function updatePartnerCalculation()',start);
 assert.ok(start>0 && end>start);
 const simulator=market.slice(start,end);
 assert.match(simulator,/gross=round\(quantity\*price\)/);
 assert.match(simulator,/share=round\(gross\*rate\/100\)/);
 assert.match(simulator,/Simulation/);
 assert.doesNotMatch(simulator,/partnerCall|\.insert\(|\.update\(|fetch\(/);
});
test('Real sale flow still requires an approved allocation',()=>{
 assert.match(market,/order\.status === "approved" \|\| order\.status === "supplied"/);
 assert.match(market,/partnerCall\("report_sale"/);
 assert.match(market,/Aucune allocation validée/);
});
test('Sales simulator is distinct, mobile friendly and currency-aware',()=>{
 assert.match(market,/id="afPartnerSimulator"/);
 assert.match(market,/Déclarer une vente réelle/);
 assert.match(market,/currency=String\(product&&product\.currency\|\|"XOF"\)/);
 assert.match(market,/currency=String\(order\.currency\|\|"XOF"\)/);
 assert.match(css,/#afPartnerSimulator/);
});
