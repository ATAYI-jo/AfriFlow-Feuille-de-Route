import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SITE_URL, canReceiveMeeting, canReceiveNews, canReceiveScheduled, loadRecipientDirectory, meetingNotification, normalizeEmail, notificationTtl } from "../_shared/meeting-notifications.ts";
import type { NotificationEnvelope } from "../_shared/meeting-notifications.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ALLOWED_ORIGINS = new Set([
  "https://afriflow.pages.dev",
  "https://atayi-jo.github.io",
]);
const ownSite = SITE_URL;
const clean = (x: unknown) => String(x ?? "").slice(0, 260);
function headers(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://afriflow.pages.dev",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-afri-cron",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: headers(req)});
}
async function settings(key: string) {
  const {data,error} = await sb.from("afriflow_push_settings").select("value").eq("key",key).maybeSingle();
  if(error) throw error;
  return data?.value ?? null;
}
async function vapid() {
  let config = await settings("vapid");
  if(config?.publicKey && config?.privateKey) return config;
  const generated = webpush.generateVAPIDKeys();
  const proposed = {publicKey:generated.publicKey, privateKey:generated.privateKey};
  const {error} = await sb.from("afriflow_push_settings")
    .insert({key:"vapid",value:proposed});
  // Another simultaneous invocation may have initialized the keys.
  if(error && error.code !== "23505") throw error;
  config = await settings("vapid");
  if(!config?.publicKey || !config?.privateKey) throw Error("VAPID initialization failed");
  return config;
}
type Subscription = {endpoint:string;user_email:string;p256dh:string;auth_key:string};
async function deliver(eventKey: string, dest: Subscription, payload: NotificationEnvelope, keys: {publicKey:string;privateKey:string}) {
  if(notificationTtl(payload,Date.now())<=0)return "expired";
  const {error:claimError} = await sb.from("afriflow_push_deliveries")
    .insert({event_key:eventKey,endpoint:dest.endpoint});
  if(claimError) {
    if(claimError.code === "23505") return "already";
    throw claimError;
  }
  try {
    const ttl=notificationTtl(payload,Date.now());
    if(ttl<=0)return "expired";
    await webpush.sendNotification(
      {endpoint:dest.endpoint,keys:{p256dh:dest.p256dh,auth:dest.auth_key}},
      JSON.stringify(payload),
      {vapidDetails:{
        subject:ownSite,
        publicKey:keys.publicKey,
        privateKey:keys.privateKey,
      },TTL:ttl,urgency:"high"},
    );
    return "sent";
  } catch(error) {
    const status = Number((error as {statusCode?:number}).statusCode || 0);
    if(status === 404 || status === 410) {
      await sb.from("afriflow_push_subscriptions").delete().eq("endpoint",dest.endpoint);
    } else {
      // Releasing the claim allows the next minute to retry transient failures.
      await sb.from("afriflow_push_deliveries").delete().eq("event_key",eventKey).eq("endpoint",dest.endpoint);
    }
    return "failed";
  }
}
async function dispatch() {
  const keys = await vapid();
  const now=Date.now();
  const {data:subscriptions,error:subErr} = await sb.from("afriflow_push_subscriptions")
    .select("endpoint,user_email,p256dh,auth_key").limit(2000);
  if(subErr) throw subErr;
  const subs = (subscriptions || []) as Subscription[];
  if(!subs.length)return {subscribers:0,sent:0,failed:0};
  const recipients=await loadRecipientDirectory(sb);
  const byEmail = new Map<string,Subscription[]>();
  for (const sub of subs) {
    const e=normalizeEmail(sub.user_email);
    byEmail.set(e,[...(byEmail.get(e)||[]),sub]);
  }
  const pending:{key:string;dest:Subscription;payload:NotificationEnvelope}[]=[];
  const {data:messages,error:msgError} = await sb.from("afriflow_state")
    .select("key,value,updated_at")
    .like("key","msg:%")
    .gte("updated_at",new Date(now-3*60*1000).toISOString())
    .limit(500);
  if(msgError) throw msgError;
  for(const m of messages || []) {
    const v=m.value || {};
    if(v.read || !v.to)continue;
    const recipient=String(v.to).toLowerCase().trim();
    if(!String(m.key).startsWith("msg:"+recipient+":")) continue;
    for(const dest of byEmail.get(recipient)||[]) {
      pending.push({key:"message:"+m.key,dest,payload:{
        title:"AfriFlow · Nouveau message",
        body:clean(v.subject || "Vous avez un nouveau message"),
        tag:"msg-"+m.key,kind:"message",url:ownSite,
      }});
    }
  }
  const {data:meetings,error:meetError}=await sb.from("afriflow_state")
    .select("key,value").like("key","meet:%").limit(500);
  if(meetError)throw meetError;
  for(const m of meetings||[]) {
    const v=m.value || {};
    if(m.key!=="meet:"+v.id)continue;
    const notification=meetingNotification(v,now);
    if(!notification)continue;
    for(const dest of subs) {
      if(!canReceiveMeeting(recipients,dest,v))continue;
      pending.push({key:notification.eventKey,dest,payload:notification.payload});
    }
  }
  const {data:deadlines}=await sb.from("afriflow_state").select("value").eq("key","pub:deadlines").maybeSingle();
  const today=new Date(now).toISOString().slice(0,10);
  for(const due of deadlines?.value?.items||[]) {
    if(due.done || due.due!==today || !due.id)continue;
    const localHour=new Date(now).getUTCHours();
    if(localHour!==8)continue;
    for(const dest of subs){
      if(!canReceiveScheduled(recipients,dest))continue;
      pending.push({key:"deadline:"+today+":"+due.id,dest,payload:{
        title:"AfriFlow · Échéance aujourd’hui",body:clean(due.title),
        tag:"deadline-"+due.id,kind:"reminder",url:ownSite,
      }});
    }
  }
 const {data:news,error:newsError} = await sb.from("afriflow_market_products")
   .select("id,name,created_at").eq("is_active",true)
   .eq("listing_type","announcement").in("category",["Veille agroalimentaire","Actualités mondiales"])
   .eq("audience","shareholders").like("promotion_label","Brief IA · %")
   .gte("created_at",new Date(now-15*60*1000).toISOString())
   .order("created_at",{ascending:false}).limit(15);
 if(newsError) throw newsError;
 for(const article of news||[]) {
   for(const dest of subs) {
     if(!canReceiveNews(recipients,dest)) continue;
     const key="agro-news:"+article.id;
     pending.push({key,dest,payload:{title:"Actualité AfriFlow",
       body:clean(article.name),tag:key,kind:"news",url:ownSite}});
   }
 }

  let sent=0,failed=0;
  // Bound execution to avoid Edge Function timeouts; remaining notifications retry via cron.
  for(const task of pending.slice(0,160)) {
    const state=await deliver(task.key,task.dest,task.payload,keys);
    if(state==="sent")sent++;
    if(state==="failed")failed++;
  }
  return {subscribers:subs.length,selected:Math.min(pending.length,160),sent,failed};
}
async function dispatchMessage(req: Request, messageKey: unknown) {
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return {status:401,data:{error:"login_required"}};
  const {data:verified,error:verifyError}=await sb.auth.getUser(auth.slice(7));
  const sender=String(verified?.user?.email||"").toLowerCase();
  if(verifyError || !sender)return {status:401,data:{error:"invalid_session"}};
  const key=String(messageKey||"");
  if(!key || key.length>100)return {status:400,data:{error:"invalid_message"}};
  const {data:messages,error:messageError}=await sb.from("afriflow_state")
    .select("key,value").like("key","msg:%:"+key).limit(20);
  if(messageError)throw messageError;
  const message=(messages||[]).find((row:any)=>{
    const v=row.value||{};
    return String(v.from||"").toLowerCase()===sender &&
      String(row.key||"").startsWith("msg:"+String(v.to||"").toLowerCase()+":");
  });
  if(!message)return {status:404,data:{error:"message_not_found"}};
  const value=message.value||{}, recipient=String(value.to||"").toLowerCase();
  const {data:devices,error:deviceError}=await sb.from("afriflow_push_subscriptions")
    .select("endpoint,user_email,p256dh,auth_key").eq("user_email",recipient).limit(20);
  if(deviceError)throw deviceError;
  const keys=await vapid(),eventKey="message:"+String(message.key);
  const states=await Promise.all((devices||[]).map(async(dest:Subscription)=>deliver(eventKey,dest,{
    title:"AfriFlow · Nouveau message",
    body:clean(value.subject || "Vous avez un nouveau message"),
    tag:"msg-"+String(message.key),kind:"message",url:ownSite,
  },keys)));
  return {status:200,data:{registered:(devices||[]).length,sent:states.filter(x=>x==="sent").length,already_sent:states.filter(x=>x==="already").length,failed:states.filter(x=>x==="failed").length}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});
  try {
    if(req.method==="GET") {
      const {publicKey}=await vapid();
      return json(req,{publicKey});
    }
    if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
    const body=await req.json();
    if(body?.action==="message") {
      const result=await dispatchMessage(req,body.message_key);
      return json(req,result.data,result.status);
    }
    if(body?.action==="test") {
      const auth=req.headers.get("Authorization")||"";
      if(!auth.startsWith("Bearer "))return json(req,{error:"login_required"},401);
      const {data:verified,error:verifyError}=await sb.auth.getUser(auth.slice(7));
      if(verifyError || !verified?.user?.email)return json(req,{error:"invalid_session"},401);
      const email=verified.user.email.toLowerCase();
      const {data:devices,error:deviceError}=await sb.from("afriflow_push_subscriptions")
        .select("endpoint,user_email,p256dh,auth_key").eq("user_email",email).limit(10);
      if(deviceError)throw deviceError;
      if(!(devices||[]).length)return json(req,{error:"no_registered_device"},409);
      const keys=await vapid();
      // At most one test per endpoint every two minutes.
      const eventKey="selftest:"+email+":"+Math.floor(Date.now()/120000);
      const state=await Promise.all((devices||[]).map(async(d:Subscription)=>
        await deliver(eventKey,d,{
          title:"AfriFlow · Notification de test",
          body:"Si vous voyez ce message sur votre écran verrouillé, les notifications Web Push fonctionnent.",
          tag:"afri-selftest",kind:"test",url:ownSite,
        },keys)));
      return json(req,{registered:devices.length,sent:state.filter(x=>x==="sent").length,
        failed:state.filter(x=>x==="failed").length,
        already_sent:state.filter(x=>x==="already").length});
    }
    if(body?.action!=="dispatch")return json(req,{error:"invalid_action"},400);
    const expected=String((await settings("cron_token"))?.token||"");
    const actual=String(req.headers.get("x-afri-cron")||"");
    if(!expected||actual.length!==expected.length)return json(req,{error:"forbidden"},403);
    let match=0;
    for(let i=0;i<expected.length;i++)match|=(expected.charCodeAt(i)^actual.charCodeAt(i));
    if(match!==0)return json(req,{error:"forbidden"},403);
    return json(req,await dispatch());
  } catch(e) {
    console.error("AfriFlow push failed:",(e as Error).message);
    return json(req,{error:"push_service_unavailable"},500);
  }
});
