import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const origins=new Set(["https://afriflow.pages.dev","https://atayi-jo.github.io"]);
const uuid=(s:unknown)=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const countries={has:(c:unknown)=>typeof c==="string"&&/^[A-Z]{2}$/.test(c)};
const currencies=new Set(["XOF","XAF","EUR","USD","GBP","CAD","CHF","GHS","NGN","MAD","AUD","JPY","ZAR"]);
const scale=(c:string)=>["XOF","XAF","JPY"].includes(c)?1:100;
function unitPriceMinor(value:unknown,from:string,to:string){
 const p=Number(value);if(value==null||!Number.isFinite(p)||p<=0)return NaN;
 let amount=p;
 if(from!==to){
  if(["XOF","XAF"].includes(from)&&to==="EUR")amount=p/655.957;
  else if(from==="EUR"&&["XOF","XAF"].includes(to))amount=p*655.957;
  else return NaN;
 }
 return Math.round(amount*scale(to));
}
// Transactional email only: verified recipients, escaped content, canonical site URL.
function orderEmail(o:any,subject:string,message:string,urgent:boolean){
 const site="https://afriflow.pages.dev/";
 const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as Record<string,string>)[c]);
 const fmt=(v:unknown)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:o.currency}).format(Number(v)/scale(o.currency));
 const items=Array.isArray(o.items)?o.items:[];
 const preview=items.slice(0,3).map((i:any)=>String(i.quantity)+" × "+String(i.name).slice(0,140));
 if(items.length>3)preview.push("+"+(items.length-3)+" autre(s) article(s)");
 const state:Record<string,string>={requested:"En attente de confirmation",accepted:"Acceptée",delivered:"Livraison déclarée",cash_received:"Encaissement déclaré",cancelled:"Annulée"};
 const status=state[o.status]||"Commande enregistrée",ref=String(o.id).slice(0,8).toUpperCase();
 const totalLabel=o.status==="cancelled"?"Total initial":o.status==="cash_received"?"Total de la commande":"Total à régler à la livraison";
 const action=urgent?"Consulter les commandes à valider":"Suivre la commande";
 const summary=[...preview,totalLabel+" : "+fmt(o.total),"Statut : "+status].join("\n");
 const text=subject+"\n\n"+message+"\n\n"+summary+"\n\n"+action+" : "+site;
 const html=`<!doctype html><html lang="fr"><body style="margin:0;background:#eff4ef;color:#20382b;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preview.join(" · ")+" · "+status)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#fff;border:1px solid #dce8df;border-radius:18px"><tr><td style="padding:22px 26px;background:#205a3c;color:#fff;border-radius:17px 17px 0 0"><strong style="font-size:23px">AfriFlow</strong><div style="font-size:12px;margin-top:6px">Du territoire africain vers le monde.</div></td></tr><tr><td style="padding:24px 26px"><p style="font-size:12px;color:#496b55;margin:0 0 10px">COMMANDE #${esc(ref)}</p><h1 style="font-size:22px;line-height:1.35;margin:0 0 12px">${esc(subject)}</h1><p style="font-size:15px;line-height:1.6">${esc(message)}</p><div style="padding:14px;background:#f0f5f1;border-radius:12px"><strong style="color:#205a3c;font-size:14px">${esc(status)}</strong>${preview.map(v=>'<p style="margin:9px 0;font-size:14px">'+esc(v)+'</p>').join("")}<div style="border-top:1px solid #d4e0d7;margin-top:12px;padding-top:12px;font-size:14px">${esc(totalLabel)}<br><strong style="font-size:21px;color:#205a3c">${esc(fmt(o.total))}</strong></div></div><p style="margin:24px 0"><a href="${site}" style="display:inline-block;background:#205a3c;color:#fff;text-decoration:none;padding:13px 19px;border-radius:9px;font-weight:bold">${esc(action)}</a></p><p style="font-size:12px;color:#53675a;line-height:1.5">Connectez-vous à votre compte pour consulter les détails. Aucun lien ne valide automatiquement une commande.</p></td></tr><tr><td style="border-top:1px solid #dce8df;padding:16px 26px;font-size:12px;color:#53675a"><a style="color:#205a3c" href="${site}">afriflow.pages.dev</a> · Notification transactionnelle AfriFlow</td></tr></table></td></tr></table></body></html>`;
 return {text,html};
}
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin","Access-Control-Allow-Origin":origins.has(origin)?origin:"","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
 const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return out({error:"Requête non autorisée."},403);
 try{
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user?.email||!user.email_confirmed_at)return out({error:"Connexion avec adresse vérifiée requise."},401);
 const body=await req.json();
 const adminResult=await db.from("afriflow_admins").select("email").eq("email",user.email.toLowerCase()).maybeSingle();
 if(adminResult.error)throw adminResult.error;
 const admin=!!adminResult.data;
 const country=String(body.country||"").toUpperCase();
 // Notify only the verified parties of a successfully saved order event.
 // The existing push dispatcher consumes unread msg: rows.
 async function orderAlerts(o:any,event:string){
  try{
   const parties=await Promise.all([db.auth.admin.getUserById(o.buyer_user_id),db.auth.admin.getUserById(o.seller_user_id)]);
   const buyer=parties[0].data.user, seller=parties[1].data.user;
   const ref=String(o.id).slice(0,8).toUpperCase();
   const amount=new Intl.NumberFormat("fr-FR",{style:"currency",currency:o.currency}).format(Number(o.total)/scale(o.currency));
   const site="https://afriflow.pages.dev/";
   const descriptions:Record<string,string>={accepted:"Le vendeur a accepté votre commande.",delivered:"Le vendeur a déclaré la livraison. Le règlement reste à confirmer.",cash_received:"Le vendeur a déclaré avoir reçu le règlement.",cancelled:"La demande de commande a été annulée."};
   const recipients:{email:string;subject:string;message:string;urgent:boolean}[]=[];
   if(event==="requested"){
    if(buyer?.email&&buyer.email_confirmed_at)recipients.push({email:buyer.email.toLowerCase(),subject:"Commande #"+ref+" · demande enregistrée",message:"Votre demande de commande est enregistrée. Total : "+amount+". Elle attend la confirmation du vendeur. Aucun paiement en ligne.",urgent:false});
    if(seller?.email&&seller.email_confirmed_at)recipients.push({email:seller.email.toLowerCase(),subject:"Urgent · nouvelle commande #"+ref+" à valider",message:"Une commande de "+amount+" vous a été attribuée. Ouvrez votre portail partenaire, rubrique Commandes, pour vérifier le stock et accepter la demande.",urgent:true});
   }else if(descriptions[event]){
    if(buyer?.email&&buyer.email_confirmed_at)recipients.push({email:buyer.email.toLowerCase(),subject:"Commande #"+ref+" · "+({accepted:"acceptée",delivered:"livraison déclarée",cash_received:"encaissement déclaré",cancelled:"annulée"} as Record<string,string>)[event],message:descriptions[event],urgent:false});
    if(event==="cancelled"&&seller?.email&&seller.email_confirmed_at)recipients.push({email:seller.email.toLowerCase(),subject:"Commande #"+ref+" · annulée",message:"Cette demande a été annulée. Ne préparez pas cette commande.",urgent:false});
   }
   const grouped=new Map<string,typeof recipients[number]>();
   for(const entry of recipients){const prior=grouped.get(entry.email);if(!prior||entry.urgent)grouped.set(entry.email,entry);}
   let internal=0,emails=0;
   for(const entry of grouped.values()){
    const now=new Date(),key="msg:"+entry.email+":cod-"+o.id+"-"+event;
    const row={key,value:{from:user.email!.toLowerCase(),fromName:"AfriFlow · Commandes",to:entry.email,subject:entry.subject,body:entry.message+"\\n\\nConsultez le suivi : "+site,ts:now.getTime(),read:false,urgent:entry.urgent,orderId:o.id},updated_at:now.toISOString()};
    const saved=await db.from("afriflow_state").upsert(row,{onConflict:"key",ignoreDuplicates:true}).select("key");
    if(saved.error){console.error("cod notification write failed",saved.error.code);continue;}
    if(!saved.data?.length)continue;
    internal++;
    // Email remains opt-in at deployment, never expose provider credentials.
    const apiKey=Deno.env.get("AFRIFLOW_ORDER_EMAIL_API_KEY"),sender=Deno.env.get("AFRIFLOW_ORDER_EMAIL_FROM");
    if(apiKey&&sender&&Deno.env.get("AFRIFLOW_ORDER_EMAIL_ENABLED")==="true"){
     try{
      const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify({from:sender,to:[entry.email],subject:entry.subject,...orderEmail(o,entry.subject,entry.message,entry.urgent)}),signal:AbortSignal.timeout(5000)});
      if(response.ok)emails++;else console.error("cod email provider status",response.status);
     }catch(_e){console.error("cod email delivery request failed");}
    }
   }
   return {internal,emails};
  }catch(_e){console.error("cod notification failed");return {internal:0,emails:0};}
 }
 if(body.action==="pending_count"){
  const r=await db.from("afriflow_cod_orders").select("id",{count:"exact",head:true}).eq("seller_user_id",user.id).eq("status","requested");
  if(r.error)throw r.error;return out({count:r.count||0});
 }
 async function eligible(seller:string,code:string){
  const [m,t]=await Promise.all([db.from("afriflow_partner_markets").select("country_code").eq("partner_user_id",seller).maybeSingle(),db.from("afriflow_partner_terms").select("is_enabled,commission_rate").eq("partner_user_id",seller).maybeSingle()]);
  if(m.error||t.error)throw Error("Vérification du vendeur indisponible.");
  return m.data?.country_code===code&&t.data?.is_enabled?t.data:null;
 }
 if(body.action==="routes"){
  const r=await db.from("afriflow_cod_routes").select("country_code,seller_user_id,seller_name,delivery_fee,currency").eq("enabled",true);
  if(r.error)throw r.error;
  const routes=[];for(const x of r.data||[])if(await eligible(x.seller_user_id,x.country_code))routes.push({country_code:x.country_code,seller_name:x.seller_name,delivery_fee:x.delivery_fee,currency:x.currency});
  return out({routes});
 }
 if(body.action==="configure"){
  if(!admin)return out({error:"Administration requise."},403);
  if(!countries.has(country))return out({error:"Marché invalide."},400);
  if(body.enabled===false){const r=await db.from("afriflow_cod_routes").update({enabled:false}).eq("country_code",country);if(r.error)throw r.error;return out({ok:true});}
  const name=String(body.sellerName||"").trim(),fee=Number(body.deliveryFee),currency=String(body.currency||"");
  if(!currencies.has(currency)||body.registrationVerified!==true||!uuid(body.sellerId)||name.length<2||name.length>150||!Number.isSafeInteger(fee)||fee<0||fee>1000000||!await eligible(body.sellerId,country))return out({error:"Vendeur enregistré et partenaire actif affecté à ce marché requis."},400);
  const r=await db.from("afriflow_cod_routes").upsert({country_code:country,seller_user_id:body.sellerId,seller_name:name,delivery_fee:fee,currency,enabled:true,verified_at:new Date().toISOString()});
  if(r.error)throw r.error;return out({ok:true});
 }
 if(body.action==="admin_config"){
  if(!admin)return out({error:"Administration requise."},403);
  const [m,t,r]=await Promise.all([db.from("afriflow_partner_markets").select("partner_user_id,country_code,market_name"),db.from("afriflow_partner_terms").select("partner_user_id").eq("is_enabled",true),db.from("afriflow_cod_routes").select("*")]);
  if(m.error||t.error||r.error)throw Error("Configuration indisponible.");
  const enabled=new Set((t.data||[]).map(x=>x.partner_user_id));
  const candidates=[];for(const x of m.data||[]){const u=await db.auth.admin.getUserById(x.partner_user_id);candidates.push({...x,email:u.data.user?.email||"",eligible:enabled.has(x.partner_user_id)&&countries.has(x.country_code),reason:!countries.has(x.country_code)?"Marché non attribué":!enabled.has(x.partner_user_id)?"Conditions commerciales inactives":"Documents et autorisation à vérifier"});}
  return out({candidates,routes:r.data||[]});
 }
 if(body.action==="create"||body.action==="quote"){
  if((body.action==="create"&&!uuid(body.requestId))||!countries.has(country)||!Array.isArray(body.items)||body.items.length<1||body.items.length>30)return out({error:"Commande invalide."},400);
  if(body.action==="create"){const old=await db.from("afriflow_cod_orders").select("*").eq("buyer_user_id",user.id).eq("request_id",body.requestId).maybeSingle();if(old.error)throw old.error;if(old.data)return out({order:old.data});}
  const name=String(body.name||"").trim(),phone=String(body.phone||"").trim(),address=String(body.address||"").trim();
  if(body.action==="create"&&(name.length<2||name.length>120||!/^\+?[0-9 ()-]{7,25}$/.test(phone)||address.length<5||address.length>400))return out({error:"Coordonnées de livraison invalides."},400);
  const route=await db.from("afriflow_cod_routes").select("*").eq("country_code",country).eq("enabled",true).maybeSingle();
  if(route.error)throw route.error;
  const seller=route.data;if(!seller)return out({error:"Paiement à la livraison non ouvert sur ce marché."},409);
  const terms=await eligible(seller.seller_user_id,country);if(!terms)return out({error:"Vendeur indisponible."},409);
  const quantities=new Map<string,number>();
  for(const item of body.items){if(!uuid(item.id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000)return out({error:"Article invalide."},400);const q=(quantities.get(item.id)||0)+item.quantity;if(q>1000)return out({error:"Quantité excessive."},400);quantities.set(item.id,q);}
  const products=await db.from("afriflow_market_products").select("id,name,price,currency,is_active,is_in_stock,minimum_order_quantity,listing_type,audience").in("id",Array.from(quantities.keys()));
  if(products.error)throw products.error;
  const items=[];let subtotal=0;
  for(const [id,q] of quantities){const p=products.data?.find(x=>x.id===id);const price=unitPriceMinor(p?.price,p?.currency||"",seller.currency);if(!p||!p.is_active||!p.is_in_stock||p.listing_type!=="product"||p.audience!=="public"||!Number.isSafeInteger(price)||price<=0||q<(p.minimum_order_quantity||1))return out({error:"Produit, quantité ou tarif dans cette devise indisponible."},409);subtotal+=price*q;items.push({id,name:p.name,quantity:q,unit_price:price});}
  const total=subtotal+Number(seller.delivery_fee);
  if(!Number.isSafeInteger(total)||total>100000000)return out({error:"Montant hors limites."},409);
  if(body.action==="quote")return out({quote:{subtotal,delivery_fee:seller.delivery_fee,total,currency:seller.currency,seller_name:seller.seller_name}});
  if(body.expectedCurrency!==seller.currency||body.expectedTotal!==total||body.expectedSeller!==seller.seller_name)return out({error:"Le montant, la devise ou le vendeur a changé. Actualisez le panier avant de confirmer."},409);
  const result=await db.from("afriflow_cod_orders").insert({buyer_user_id:user.id,request_id:body.requestId,seller_user_id:seller.seller_user_id,seller_name:seller.seller_name,country_code:country,customer_name:name,phone,address,items,subtotal,delivery_fee:seller.delivery_fee,currency:seller.currency,commission_rate:terms.commission_rate}).select("*").single();
  if(result.error?.code==="23505"){const repeat=await db.from("afriflow_cod_orders").select("*").eq("buyer_user_id",user.id).eq("request_id",body.requestId).single();if(repeat.error)throw repeat.error;return out({order:repeat.data});}
  if(result.error)throw result.error;const alerts=await orderAlerts(result.data,"requested");return out({order:result.data,alerts});
 }
 if(body.action==="list"){
  let q=db.from("afriflow_cod_orders").select("*").order("created_at",{ascending:false}).limit(100);
  if(!admin)q=q.or("buyer_user_id.eq."+user.id+",seller_user_id.eq."+user.id);
  const r=await q;if(r.error)throw r.error;
  return out({orders:(r.data||[]).map(x=>({...x,canFulfill:x.seller_user_id===user.id,canCancel:x.status==="requested"&&(admin||x.buyer_user_id===user.id||x.seller_user_id===user.id)}))});
 }
 if(body.action==="transition"){
  if(!uuid(body.id))return out({error:"Commande invalide."},400);
  const r=await db.from("afriflow_cod_orders").select("*").eq("id",body.id).maybeSingle();if(r.error)throw r.error;
  const o=r.data;if(!o)return out({error:"Commande introuvable."},404);
  const next=String(body.status),seller=o.seller_user_id===user.id;
  const allowed=(next==="cancelled"&&o.status==="requested"&&(seller||admin||o.buyer_user_id===user.id))||(seller&&((o.status==="requested"&&next==="accepted")||(o.status==="accepted"&&next==="delivered")||(o.status==="delivered"&&next==="cash_received"&&body.cashConfirmed===true)));
  if(!allowed)return out({error:"Transition non autorisée."},403);
  const update:Record<string,unknown>={status:next};update[next+"_at"]=new Date().toISOString();
  const done=await db.from("afriflow_cod_orders").update(update).eq("id",o.id).eq("status",o.status).select("*").maybeSingle();
  if(done.error)throw done.error;if(!done.data)return out({error:"Statut modifié entre-temps."},409);
  const alerts=await orderAlerts(done.data,next);return out({order:done.data,alerts});
 }
 return out({error:"Action inconnue."},400);
 }catch(e){console.error("cod",e instanceof Error?e.message:"database error");return out({error:"Service de commande momentanément indisponible."},500);}
});