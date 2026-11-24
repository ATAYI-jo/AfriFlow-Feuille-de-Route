import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const origins=new Set(["https://afriflow.pages.dev","https://afriflow-africa.onrender.com","https://atayi-jo.github.io"]);
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
  if(result.error)throw result.error;return out({order:result.data});
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
  return out({order:done.data});
 }
 return out({error:"Action inconnue."},400);
 }catch(e){console.error("cod",e instanceof Error?e.message:"database error");return out({error:"Service de commande momentanément indisponible."},500);}
});