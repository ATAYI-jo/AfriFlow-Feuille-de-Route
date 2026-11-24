/* AfriFloW — commandes avec paiement à la livraison. */
(function(){
"use strict";
const labels={BF:"Burkina Faso",TG:"Togo",BJ:"Bénin",CI:"Côte d’Ivoire",SN:"Sénégal"};
const statuses={requested:"Demandée — non confirmée",accepted:"Acceptée — à livrer",delivered:"Livrée — règlement non confirmé",cash_received:"Encaissement déclaré par le vendeur",cancelled:"Annulée"};
const money=n=>Number(n).toLocaleString("fr-FR")+" FCFA";
function node(tag,txt,parent){const x=document.createElement(tag);if(txt!=null)x.textContent=txt;if(parent)parent.appendChild(x);return x;}
function button(parent,label,fn){const b=node("button",label,parent);b.type="button";b.className="af-market-secondary";b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){node("p",e.message||"Opération indisponible.",parent);}finally{b.disabled=false;}};return b;}
function field(parent,label,type){const l=node("label",label,parent);const i=node("input",null,l);i.type=type||"text";i.required=true;return i;}
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
 const form=node("form",null,host),select=node("select",null,node("label","Marché de livraison",form));
 for(const r of data.routes){const opt=node("option",labels[r.country_code]||r.country_code,select);opt.value=r.country_code;}
 const seller=node("p",null,form),totalLine=node("p",null,form);
 const name=field(form,"Nom complet");name.maxLength=120;
 const phone=field(form,"Téléphone","tel");phone.maxLength=25;
 const address=field(form,"Adresse complète et ville");address.maxLength=400;
 const status=node("p",null,form);status.setAttribute("role","status");
 const submit=node("button","Envoyer la demande de commande",form);submit.type="submit";submit.className="af-market-primary";
 const valid=cart.length&&cart.every(x=>x.currency==="XOF"&&x.price!=null&&Number.isSafeInteger(Number(x.price))&&Number(x.price)>0&&Number.isSafeInteger(x.quantity)&&x.quantity>0);
 const subtotal=valid?cart.reduce((a,x)=>a+Number(x.price)*x.quantity,0):0;
 const ref=crypto.randomUUID();
 function update(){const route=data.routes.find(r=>r.country_code===select.value);seller.textContent="Vendeur : "+route.seller_name;totalLine.textContent=valid?"Produits : "+money(subtotal)+" · Livraison : "+money(route.delivery_fee)+" · Total : "+money(subtotal+Number(route.delivery_fee)):"Le panier doit contenir des produits tarifés en FCFA.";submit.disabled=!valid;}
 select.onchange=update;update();
 form.onsubmit=async e=>{e.preventDefault();if(!valid)return;submit.disabled=true;try{
 const route=data.routes.find(r=>r.country_code===select.value);
 const result=await call("create",{country:select.value,requestId:ref,name:name.value,phone:phone.value,address:address.value,items:cart.map(x=>({id:x.id,quantity:x.quantity})),expectedTotal:subtotal+Number(route.delivery_fee),expectedSeller:route.seller_name});
 host.replaceChildren();node("h3","Demande enregistrée",host);node("p","Référence : "+result.order.id,host);node("p","Total : "+money(result.order.total)+" · En attente de confirmation du vendeur. Aucun paiement reçu.",host);
 }catch(e){status.textContent=e.message;submit.disabled=false;}};
}
async function orderList(host){
 host.replaceChildren();const {orders}=await call("list");
 if(!orders.length){node("p","Aucune commande enregistrée.",host);return;}
 for(const o of orders){const card=node("article",null,host);card.className="mt-box";card.style.marginTop="10px";
 node("strong",statuses[o.status]||o.status,card);node("p",o.id+" · "+(labels[o.country_code]||o.country_code)+" · "+o.seller_name,card);
 node("p",o.customer_name+" · "+o.phone+" · "+o.address,card);
 for(const item of o.items||[])node("p",item.quantity+" × "+item.name+" — "+money(item.unit_price),card);
 node("p","Total à régler : "+money(o.total),card);
 if(o.status==="cash_received")node("p","Commission contractuelle indicative sur les produits : "+money(Math.round(Number(o.subtotal)*Number(o.commission_rate)/100))+" — reversement non confirmé.",card);
 async function change(status,cashConfirmed=false){await call("transition",{id:o.id,status,cashConfirmed});await orderList(host);}
 if(o.canFulfill&&o.status==="requested")button(card,"Accepter après contrôle du stock",()=>change("accepted"));
 if(o.canFulfill&&o.status==="accepted")button(card,"Confirmer la livraison",()=>change("delivered"));
 if(o.canFulfill&&o.status==="delivered")button(card,"Confirmer l’encaissement réel",async()=>{if(window.confirm("Confirmez uniquement si le vendeur a effectivement reçu "+money(o.total)+". Continuer ?"))await change("cash_received",true);});
 if(o.canCancel)button(card,"Annuler la demande",()=>change("cancelled"));
 }
}
function mount(host,admin=false){
 if(!host)return;host.replaceChildren();
 const details=node("details",null,host);node("summary","Commandes · paiement à la livraison",details);const content=node("div",null,details);
 details.ontoggle=async()=>{if(!details.open||content.dataset.loaded)return;content.dataset.loaded="1";try{
 if(admin){
 const {candidates,routes}=await call("admin_config");
 node("p","Activez exclusivement un vendeur régulièrement enregistré, autorisé à vendre et encaisser sur le marché concerné. AfriFloW est créée au Burkina Faso.",content);
 const form=node("form",null,content);const select=node("select",null,node("label","Partenaire actif",form));
 for(const c of candidates){const opt=node("option",(labels[c.country_code]||c.country_code)+" — "+(c.email||c.partner_user_id),select);opt.value=c.partner_user_id;}
 const name=field(form,"Nom légal du vendeur");const fee=field(form,"Frais de livraison (FCFA)","number");fee.min="0";fee.max="1000000";fee.step="1";fee.value="0";
 const check=node("input",null,node("label","Documents et autorisation du vendeur vérifiés ",form));check.type="checkbox";check.required=true;
 const save=node("button","Activer ce marché",form);save.type="submit";save.disabled=!candidates.length;
 if(!candidates.length)node("p","Aucun partenaire éligible sur les marchés disponibles.",form);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const c=candidates.find(x=>x.partner_user_id===select.value);await call("configure",{country:c.country_code,sellerId:c.partner_user_id,sellerName:name.value,deliveryFee:Number(fee.value),registrationVerified:check.checked});node("p","Marché configuré. Actualisez pour consulter son statut.",form);}catch(e){node("p",e.message,form);}finally{save.disabled=false;}};
 for(const r of routes.filter(x=>x.enabled)){node("p",(labels[r.country_code]||r.country_code)+" — "+r.seller_name,content);button(content,"Désactiver "+(labels[r.country_code]||r.country_code),async()=>{await call("configure",{country:r.country_code,enabled:false});mount(host,true);});}
 }
 const list=node("div",null,content);button(content,"Actualiser les commandes",()=>orderList(list));await orderList(list);
 }catch(e){node("p",e.message,content);delete content.dataset.loaded;}};
}
window.AfriCOD={checkout,mount};
})();