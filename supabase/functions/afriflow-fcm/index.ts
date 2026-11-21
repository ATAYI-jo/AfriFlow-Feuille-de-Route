import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const CORS=["https://afriflow-africa.onrender.com","https://atayi-jo.github.io"];
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "Content-Type":"application/json","Cache-Control":"no-store",
 "Access-Control-Allow-Origin":CORS.includes(req.headers.get("origin")||"")?req.headers.get("origin")!:"https://afriflow-africa.onrender.com",
 "Access-Control-Allow-Headers":"authorization,content-type,x-afri-cron",
 "Access-Control-Allow-Methods":"OPTIONS,POST"
}});
const clean=(v:unknown)=>String(v||"").slice(0,240);
function validTeams(value:unknown){
 try{const u=new URL(String(value||""));return u.protocol==="https:"&&["teams.microsoft.com","teams.live.com","teams.microsoft.us"].includes(u.hostname)?u.href:"";}
 catch{return "";}
}
function base64url(data:Uint8Array){return btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");}
const utf=(s:string)=>new TextEncoder().encode(s);
function pemDecode(pem:string){return Uint8Array.from(atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"")),c=>c.charCodeAt(0));}
async function googleToken(){
 const raw=Deno.env.get("AFRIFLOW_FIREBASE_SERVICE_ACCOUNT_JSON");
 if(!raw)throw new Error("Firebase service account is not configured");
 const account=JSON.parse(raw);
 if(!account.client_email||!account.private_key||!account.project_id)throw Error("Incomplete Firebase service credentials");
 const now=Math.floor(Date.now()/1000);
 const header=base64url(utf(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const payload=base64url(utf(JSON.stringify({iss:account.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging",
   aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500})));
 const message=header+"."+payload;
 const key=await crypto.subtle.importKey("pkcs8",pemDecode(account.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,utf(message)));
 const assertion=message+"."+base64url(sig);
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 if(!response.ok)throw Error("Firebase service account token rejected: "+response.status);
 const data=await response.json();
 return {accessToken:String(data.access_token),project:String(account.project_id)};
}
type Device={token:string,user_email:string};
async function send(eventKey:string,device:Device,content:{title:string;body:string;kind:string;teamsUrl?:string},oauth:{accessToken:string;project:string}){
 const {error:claim}=await sb.from("afriflow_fcm_deliveries").insert({event_key:eventKey,token:device.token});
 if(claim){if(claim.code==="23505")return "already";throw claim;}
 try{
   const response=await fetch("https://fcm.googleapis.com/v1/projects/"+encodeURIComponent(oauth.project)+"/messages:send",{
     method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+oauth.accessToken},
     body:JSON.stringify({message:{token:device.token,data:{
       title:content.title,body:content.body,kind:content.kind,teamsUrl:content.teamsUrl||"",
     },android:{priority:"HIGH",ttl:"3600s"}}})
   });
   if(response.ok)return "sent";
   const data=await response.text();
   if(response.status===404||response.status===410||data.includes("UNREGISTERED")){
     await sb.from("afriflow_fcm_devices").delete().eq("token",device.token);
   }else{
     await sb.from("afriflow_fcm_deliveries").delete().eq("token",device.token).eq("event_key",eventKey);
   }
   console.warn("FCM delivery rejected",response.status,data.slice(0,240));
   return "failed";
 }catch(e){
   await sb.from("afriflow_fcm_deliveries").delete().eq("token",device.token).eq("event_key",eventKey);
   console.warn("FCM network failure",(e as Error).message);
   return "failed";
 }
}
async function dispatch(){
 if(!Deno.env.get("AFRIFLOW_FIREBASE_SERVICE_ACCOUNT_JSON"))return {configured:false,sent:0};
 const {data:devices,error:err}=await sb.from("afriflow_fcm_devices").select("token,user_email").limit(2000);
 if(err)throw err;
 if(!(devices||[]).length)return {configured:true,devices:0,sent:0};
 const oauth=await googleToken();
 const byEmail=new Map<string,Device[]>();
 for(const d of devices as Device[]){const k=d.user_email.toLowerCase();byEmail.set(k,[...(byEmail.get(k)||[]),d]);}
 const now=Date.now(),pending:{key:string;device:Device;content:{title:string;body:string;kind:string;teamsUrl?:string}}[]=[];
 const {data:messages,error:messageErr}=await sb.from("afriflow_state").select("key,value,updated_at")
   .like("key","msg:%").gte("updated_at",new Date(now-3*60000).toISOString()).limit(500);
 if(messageErr)throw messageErr;
 for(const row of messages||[]){
   const m=row.value||{},to=String(m.to||"").trim().toLowerCase();
   if(!to||m.read||!String(row.key).startsWith("msg:"+to+":"))continue;
   for(const device of byEmail.get(to)||[])pending.push({key:"msg:"+row.key,device,content:{
     title:"AfriFloW · Nouveau message",body:clean(m.subject||"Vous avez reçu un message"),kind:"message"}});
 }
 const {data:meetings,error:meetErr}=await sb.from("afriflow_state").select("value").like("key","meet:%").limit(500);
 if(meetErr)throw meetErr;
 const {data:config}=await sb.from("afriflow_state").select("value").eq("key","pub:meetcfg").maybeSingle();
 for(const row of meetings||[]){
   const m=row.value||{},start=Number(m.start);
   if(!m.id||!Number.isFinite(start))continue;
   const delta=start-now,starting=delta<=0&&delta>=-120000,soon=delta>0&&delta<=15*60000&&delta>=13*60000;
   if(!starting&&!soon)continue;
   const key="meeting:"+m.id+":"+start+":"+(starting?"start":"soon");
   const content={title:starting?"AfriFloW · Réunion maintenant":"AfriFloW · Réunion dans 15 min",
     body:clean(m.title||"Réunion programmée"),kind:"meeting",teamsUrl:validTeams(m.link||config?.value?.link)};
   for(const device of devices as Device[])pending.push({key,device,content});
 }
 const {data:reminders}=await sb.from("afriflow_state").select("value").eq("key","pub:deadlines").maybeSingle();
 const today=new Date(now).toISOString().slice(0,10);
 if(new Date(now).getUTCHours()===8)for(const task of reminders?.value?.items||[]){
   if(task.done||task.due!==today||!task.id)continue;
   for(const device of devices as Device[])pending.push({key:"deadline:"+today+":"+task.id,device,content:{
     title:"AfriFloW · Échéance aujourd’hui",body:clean(task.title),kind:"reminder"}});
 }
 const [{data:members,error:memberError},{data:profiles,error:profileError},{data:admins,error:adminError}] = await Promise.all([
   sb.from("afriflow_market_profiles").select("user_id").limit(2000),
   sb.from("afriflow_profiles").select("user_id,email").limit(2000),
   sb.from("afriflow_admins").select("email").limit(2000)
 ]);
 if(memberError || profileError || adminError) throw (memberError || profileError || adminError);
 const ids = new Set((members||[]).map((m:any)=>String(m.user_id)));
 const authorizedNewsEmails = new Set((profiles||[]).filter((p:any)=>ids.has(String(p.user_id)))
   .map((p:any)=>String(p.email||"").toLowerCase()));
 (admins||[]).forEach((a:any)=>authorizedNewsEmails.add(String(a.email||"").toLowerCase()));
 const {data:news,error:newsError} = await sb.from("afriflow_market_products")
   .select("id,name,created_at").eq("is_active",true)
   .eq("listing_type","announcement").in("category",["Veille agroalimentaire","Actualités mondiales"])
   .eq("audience","shareholders").like("promotion_label","Brief IA · %")
   .gte("created_at",new Date(now-15*60*1000).toISOString())
   .order("created_at",{ascending:false}).limit(15);
 if(newsError) throw newsError;
 for(const article of news||[]) {
   for(const device of devices as Device[]) {
     if(!authorizedNewsEmails.has(device.user_email.toLowerCase())) continue;
     pending.push({key:"agro-news:"+article.id,device,content:{
       title:"Actualité AfriFloW",body:clean(article.name),kind:"news"}});
   }
 }

 let sent=0,failed=0;
 for(const item of pending.slice(0,160)){
   const status=await send(item.key,item.device,item.content,oauth);
   if(status==="sent")sent++;
   if(status==="failed")failed++;
 }
 return {configured:true,devices:devices?.length||0,pending:pending.length,sent,failed};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return json(req,{ok:true});
 if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
 try{
   const data=await req.json();
   if(data?.action==="register"){
     const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
     if(!jwt)return json(req,{error:"missing_auth"},401);
     const {data:auth,error}=await sb.auth.getUser(jwt);
     if(error||!auth?.user?.id||!auth?.user?.email)return json(req,{error:"invalid_auth"},401);
     const token=String(data.token||"").trim();
     if(token.length<30||token.length>4096||!/^[\w:\-]+$/.test(token))return json(req,{error:"invalid_fcm_token"},400);
     const email=auth.user.email.toLowerCase();
     const result=await sb.from("afriflow_fcm_devices").upsert({token,user_id:auth.user.id,user_email:email,updated_at:new Date().toISOString()},{onConflict:"token"});
     if(result.error)throw result.error;
     return json(req,{ok:true,registered:true});
   }
   if(data?.action==="dispatch"){
     const token=String(req.headers.get("x-afri-cron")||"");
     const {data:stored,error}=await sb.from("afriflow_push_settings").select("value").eq("key","cron_token").single();
     if(error)throw error;
     const expected=String(stored.value?.token||"");
     if(!expected||expected.length!==token.length)return json(req,{error:"forbidden"},403);
     let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^token.charCodeAt(i);
     if(diff!==0)return json(req,{error:"forbidden"},403);
     return json(req,await dispatch());
   }
   return json(req,{error:"unknown_action"},400);
 }catch(e){console.error("AfriFloW FCM error",(e as Error).message);return json(req,{error:"service_unavailable"},500);}
});