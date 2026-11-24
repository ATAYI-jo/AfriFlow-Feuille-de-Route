/* AfriFloW — commandes avec paiement à la livraison. */
(function(){
"use strict";
const labels={BF:"Burkina Faso",TG:"Togo",BJ:"Bénin",CI:"Côte d’Ivoire",SN:"Sénégal",FR:"France"};
const currencies=["XOF","XAF","EUR","USD","GBP","CAD","CHF","GHS","NGN","MAD","AUD","JPY","ZAR"];
const scale=c=>["XOF","XAF","JPY"].includes(c)?1:100;
const countryName=c=>{if(!c)return "Non attribué";try{return labels[c]||new Intl.DisplayNames(["fr"],{type:"region"}).of(c)||c;}catch(e){return labels[c]||c;}};
function defaultCurrency(c){const map={FR:"EUR",BE:"EUR",DE:"EUR",IT:"EUR",ES:"EUR",PT:"EUR",NL:"EUR",LU:"EUR",IE:"EUR",AT:"EUR",FI:"EUR",GR:"EUR",BF:"XOF",TG:"XOF",BJ:"XOF",CI:"XOF",SN:"XOF",ML:"XOF",NE:"XOF",GW:"XOF",CM:"XAF",GA:"XAF",TD:"XAF",CG:"XAF",CF:"XAF",GQ:"XAF",US:"USD",GB:"GBP",CA:"CAD",CH:"CHF",GH:"GHS",NG:"NGN",MA:"MAD",AU:"AUD",JP:"JPY",ZA:"ZAR"};return map[c]||"";}
function layout(form){form.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;align-items:end;margin:16px 0";}
const statuses={requested:"Demandée — non confirmée",accepted:"Acceptée — à livrer",delivered:"Livrée — règlement non confirmé",cash_received:"Encaissement déclaré par le vendeur",cancelled:"Annulée"};
const money=(n,c="XOF")=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:c,maximumFractionDigits:scale(c)===1?0:2}).format(Number(n)/scale(c));
function node(tag,txt,parent){const x=document.createElement(tag);if(txt!=null)x.textContent=txt;if(parent)parent.appendChild(x);return x;}
function button(parent,label,fn){const b=node("button",label,parent);b.type="button";b.className="af-market-secondary";b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){node("p",e.message||"Opération indisponible.",parent);}finally{b.disabled=false;}};return b;}
function field(parent,label,type){const l=node("label",label,parent);l.style.cssText="display:grid;gap:6px;min-width:0";const i=node("input",null,l);i.style.cssText="width:100%;box-sizing:border-box";i.type=type||"text";i.required=true;return i;}
async function call(action,body={}){
 const client=window.__sb;if(!client)throw Error("Service indisponible.");
 const {data:{session}}=await client.auth.getSession();if(!session)throw Error("Connectez-vous pour passer ou consulter une commande.");
 const r=await client.functions.invoke("afriflow-cod",{body:{action,...body}});
 if(r.error){let msg="Service de commande indisponible.";try{msg=(await r.error.context.json()).error||msg;}catch(e){}throw Error(msg);}
 if(r.data?.error)throw Error(r.data.error);return r.data;
}
async function checkout(host,cart,login){
 host.replaceChildren();
 node("h3","Paiement à la livraison",host);
 node("p","Aucun paiement en ligne. Le vendeur identifié doit confirmer le stock et la commande avant livraison.",host);
 const client=window.__sb;const session=client&&(await client.auth.getSession()).data.session;
 if(!session){node("p","Une connexion est nécessaire pour sécuriser et suivre votre commande.",host);button(host,"Se connecter",login);return;}
 const data=await call("routes");
 if(!data.routes.length){node("p","Aucun vendeur autorisé n’est encore configuré. Utilisez la demande de devis en attendant.",host);return;}
 const form=node("form",null,host);layout(form);const select=node("select",null,node("label","Marché de livraison",form));select.style.cssText="display:block;width:100%;margin-top:6px";
 for(const r of data.routes){const opt=node("option",countryName(r.country_code),select);opt.value=r.country_code;}
 const seller=node("p",null,form),totalLine=node("p",null,form);
 const name=field(form,"Nom complet");name.maxLength=120;
 const phone=field(form,"Téléphone","tel");phone.maxLength=25;
 const address=field(form,"Adresse complète et ville");address.maxLength=400;
 const status=node("p",null,form);status.setAttribute("role","status");
 const submit=node("button","Envoyer la demande de commande",form);submit.type="submit";submit.className="af-market-primary";
 let quote=null,sequence=0;const ref=crypto.randomUUID();
 const items=cart.map(x=>({id:x.id,quantity:x.quantity}));
 async function update(){
 const n=++sequence;quote=null;submit.disabled=true;
 const route=data.routes.find(r=>r.country_code===select.value);seller.textContent="Vendeur : "+route.seller_name;totalLine.textContent="Calcul du prix par le serveur…";status.textContent="";
 try{const result=await call("quote",{country:select.value,items});if(n!==sequence)return;quote=result.quote;totalLine.textContent="Produits : "+money(quote.subtotal,quote.currency)+" · Livraison : "+money(quote.delivery_fee,quote.currency)+" · Total : "+money(quote.total,quote.currency);submit.disabled=false;}
 catch(e){if(n!==sequence)return;totalLine.textContent="Tarif indisponible";status.textContent=e.message;}
 }
 select.onchange=update;await update();
 form.onsubmit=async e=>{e.preventDefault();if(!quote)return;submit.disabled=true;const accepted=quote;
 try{const result=await call("create",{country:select.value,requestId:ref,name:name.value,phone:phone.value,address:address.value,items,expectedTotal:accepted.total,expectedCurrency:accepted.currency,expectedSeller:accepted.seller_name});
 host.replaceChildren();node("h3","Demande enregistrée",host);node("p","Référence : "+result.order.id,host);node("p","Total : "+money(result.order.total,result.order.currency)+" · En attente de confirmation du vendeur. Aucun paiement reçu.",host);
 }catch(e){status.textContent=e.message;submit.disabled=false;}};

}
function orderLine(parent,label,value){const line=node("div",null,parent);line.className="af-cod-line";node("span",label,line);node("strong",value,line);return line;}
function orderReference(id){return String(id||"").slice(0,8).toUpperCase();}
const orderStages=[["requested","Demande"],["accepted","Acceptée"],["delivered","Livrée"],["cash_received","Encaissement"]];
function orderCard(o,host,refresh){
 const card=node("article",null,host);card.className="af-cod-card";
 const head=node("header",null,card);head.className="af-cod-head";
 const title=node("div",null,head);node("h4","Commande #"+orderReference(o.id),title);
 const date=new Date(o.created_at);node("small",Number.isFinite(date.getTime())?date.toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"Commande enregistrée",title);
 const status=node("span",statuses[o.status]||"Statut inconnu",head);status.className="af-cod-status";status.dataset.status=o.status;
 if(o.status!=="cancelled"){
  const current=orderStages.findIndex(x=>x[0]===o.status);
  if(current>=0){const steps=node("ol",null,card);steps.className="af-cod-steps";steps.setAttribute("aria-label","Progression de la commande");
   orderStages.forEach((stage,index)=>{const li=node("li",null,steps);if(index<=current)li.classList.add("done");if(index===current)li.setAttribute("aria-current","step");node("span",index<current?"✓":String(index+1),li).className="af-cod-step-dot";node("span",stage[1],li);});}
 }
 const seller=node("div",null,card);seller.className="af-cod-seller";node("small","Marché de livraison",seller);node("strong",countryName(o.country_code),seller);node("small","Vendeur : "+(o.seller_name||"Non renseigné"),seller);
 const items=node("div",null,card);items.className="af-cod-items";node("h5","Articles",items);
 for(const item of o.items||[]){
  const row=node("div",null,items);row.className="af-cod-item";
  const info=node("div",null,row);node("strong",item.name,info);node("small",item.quantity+" × "+money(item.unit_price,o.currency),info);
  node("strong",money(Number(item.quantity)*Number(item.unit_price),o.currency),row);
 }
 const amounts=node("div",null,card);amounts.className="af-cod-amounts";
 orderLine(amounts,"Sous-total",money(o.subtotal,o.currency));orderLine(amounts,"Livraison",money(o.delivery_fee,o.currency));
 const total=orderLine(amounts,o.status==="cancelled"?"Total initial":o.status==="cash_received"?"Total de la commande":"Total à régler",money(o.total,o.currency));total.classList.add("af-cod-total");
 const note=node("p",o.status==="cancelled"?"Demande annulée.":o.status==="cash_received"?"Encaissement déclaré par le vendeur.":"Paiement à la livraison · aucun paiement en ligne.",card);note.className="af-cod-note";
 const details=node("details",null,card);details.className="af-cod-details";node("summary","Coordonnées de livraison et référence",details);
 orderLine(details,"Destinataire",o.customer_name||"Non renseigné");orderLine(details,"Téléphone",o.phone||"Non renseigné");orderLine(details,"Adresse",o.address||"Non renseignée");orderLine(details,"Référence complète",o.id);
 if(o.status==="cash_received"){const commission=node("p","Commission contractuelle indicative sur les produits : "+money(Math.round(Number(o.subtotal)*Number(o.commission_rate)/100),o.currency)+" — reversement non confirmé.",card);commission.className="af-cod-note";}
 const actions=node("div",null,card);actions.className="af-cod-actions";
 async function change(status,cashConfirmed=false){await call("transition",{id:o.id,status,cashConfirmed});await refresh();}
 if(o.canFulfill&&o.status==="requested")button(actions,"Accepter après contrôle du stock",()=>change("accepted")).classList.add("af-cod-primary");
 if(o.canFulfill&&o.status==="accepted")button(actions,"Confirmer la livraison",()=>change("delivered")).classList.add("af-cod-primary");
 if(o.canFulfill&&o.status==="delivered")button(actions,"Confirmer l’encaissement réel",async()=>{if(window.confirm("Confirmez uniquement si le vendeur a effectivement reçu "+money(o.total,o.currency)+". Continuer ?"))await change("cash_received",true);}).classList.add("af-cod-primary");
 if(o.canCancel)button(actions,"Annuler la demande",async()=>{if(window.confirm("Annuler cette demande de commande ?"))await change("cancelled");}).classList.add("af-cod-cancel");
 if(!actions.children.length)actions.remove();
 return card;
}
async function orderList(host){
 const {orders}=await call("list");if(!host.isConnected)return;host.replaceChildren();
 if(!orders.length){node("p","Aucune commande enregistrée.",host).className="af-cod-empty";return;}
 for(const o of orders)orderCard(o,host,()=>orderList(host));
}
function mount(host,admin=false){
 if(!host)return;host.replaceChildren();
 const details=node("details",null,host);details.className="af-cod-section";node("summary",admin?"Commandes · paiement à la livraison":"Mes commandes",details);const content=node("div",null,details);content.className="af-cod-content";
 details.ontoggle=async()=>{if(!details.open||content.dataset.loaded)return;content.dataset.loaded="1";try{
 if(admin){
 const {candidates,routes}=await call("admin_config");
 node("p","Activez exclusivement un vendeur régulièrement enregistré, autorisé à vendre et encaisser sur le marché concerné. AfriFloW est créée au Burkina Faso.",content);
 const form=node("form",null,content);layout(form);
 const selectLabel=node("label","Partenaire commercial",form);selectLabel.style.cssText="display:grid;gap:6px";const select=node("select",null,selectLabel);select.style.width="100%";
 const first=node("option","Sélectionner un partenaire",select);first.value="";
 for(const c of candidates){const opt=node("option",countryName(c.country_code)+" — "+(c.email||c.partner_user_id)+(c.eligible?"":" — "+c.reason),select);opt.value=c.partner_user_id;opt.disabled=!c.eligible;}
 const name=field(form,"Nom légal du vendeur");
 const currencyLabel=node("label","Devise du règlement",form);currencyLabel.style.cssText="display:grid;gap:6px";const currency=node("select",null,currencyLabel);currency.style.width="100%";currency.required=true;node("option","Sélectionner une devise",currency).value="";
 for(const cur of currencies)node("option",cur,currency).value=cur;
 const fee=field(form,"Frais de livraison (dans la devise choisie)","number");fee.min="0";fee.max="1000000";fee.step="0.01";fee.value="0";
 const checkLabel=node("label",null,form);checkLabel.style.cssText="display:flex;align-items:center;gap:8px;grid-column:1/-1";const check=node("input",null,checkLabel);check.type="checkbox";check.required=true;check.style.width="auto";node("span","Documents et autorisation de vente et d’encaissement vérifiés",checkLabel);
 const save=node("button","Activer ce marché",form);save.type="submit";save.disabled=true;save.className="af-market-primary";const status=node("p",null,form);status.setAttribute("role","status");status.style.gridColumn="1/-1";
 function refresh(){const c=candidates.find(x=>x.partner_user_id===select.value&&x.eligible);const existing=c&&routes.find(r=>r.country_code===c.country_code&&r.seller_user_id===c.partner_user_id);name.value=existing?.seller_name||"";currency.value=existing?.currency||defaultCurrency(c?.country_code);fee.value=existing?String(Number(existing.delivery_fee)/scale(existing.currency||"XOF")):"0";check.checked=false;save.disabled=!c;status.textContent=c?"Marché : "+countryName(c.country_code)+" · vérification administrative requise.":"Sélectionnez un partenaire éligible.";fee.step=scale(currency.value)===1?"1":"0.01";}
 select.onchange=refresh;currency.onchange=()=>{fee.step=scale(currency.value)===1?"1":"0.01";};refresh();
 if(!candidates.some(c=>c.eligible))node("p","Aucun partenaire actif affecté à un marché.",content);
 const unavailable=candidates.filter(c=>!c.eligible);if(unavailable.length){const d=node("details",null,content);node("summary","Partenaires non éligibles ("+unavailable.length+")",d);for(const c of unavailable)node("p",(c.email||c.partner_user_id)+" — "+c.reason,d);}
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const c=candidates.find(x=>x.partner_user_id===select.value&&x.eligible);if(!c)throw Error("Sélectionnez un partenaire éligible.");const amount=Number(fee.value)*scale(currency.value);if(!Number.isFinite(amount)||Math.abs(amount-Math.round(amount))>0.000001)throw Error("Frais incompatibles avec la devise.");await call("configure",{country:c.country_code,sellerId:c.partner_user_id,sellerName:name.value,deliveryFee:Math.round(amount),currency:currency.value,registrationVerified:check.checked});status.textContent="Marché configuré.";check.checked=false;}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
 for(const r of routes.filter(x=>x.enabled)){node("p",countryName(r.country_code)+" — "+r.seller_name+" · "+money(r.delivery_fee,r.currency),content);button(content,"Désactiver "+countryName(r.country_code),async()=>{await call("configure",{country:r.country_code,enabled:false});mount(host,true);});}

 }
 const bar=node("div",null,content);bar.className="af-cod-list-bar";node("h4",admin?"Commandes enregistrées":"Suivi des commandes",bar);const list=node("div",null,content);list.className="af-cod-list";button(bar,"Actualiser",()=>orderList(list)).classList.add("af-cod-refresh");await orderList(list);
 }catch(e){node("p",e.message,content);delete content.dataset.loaded;}};
}
window.AfriCOD={checkout,mount};
})();