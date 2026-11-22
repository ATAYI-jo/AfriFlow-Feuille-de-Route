import { createClient } from "npm:@supabase/supabase-js@2";

const origins=new Set(["https://afriflow.pages.dev","https://afriflow-africa.onrender.com","https://atayi-jo.github.io"]);
function cors(req:Request){
 const origin=req.headers.get("origin")||"",custom=(Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS")||"").split(",").map(x=>x.trim()).filter(Boolean);
 return {...((custom.length?new Set(custom):origins).has(origin)?{"Access-Control-Allow-Origin":origin,Vary:"Origin"}:{}),
 "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
 "Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
}
function reply(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors(req)});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return reply(req,{error:"Méthode interdite"},405);
 if(req.headers.get("origin")&&!cors(req)["Access-Control-Allow-Origin"])return reply(req,{error:"Origine interdite"},403);
 try{
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return reply(req,{error:"Connexion requise"},401);
  const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authErr}=await service.auth.getUser(token),user=auth.user;
  if(authErr||!user?.id||!user.email||!user.email_confirmed_at)return reply(req,{error:"Session invalide"},401);
  const payload=await req.json().catch(()=>({}));
  const meetingId=String(payload.meetingId||"");
  if(!/^m[a-z0-9]{5,35}$/.test(meetingId))return reply(req,{error:"Réunion invalide"},400);
  const {data:row,error:rowErr}=await service.from("afriflow_state").select("value").eq("key","meet:"+meetingId).maybeSingle();
  if(rowErr||!row?.value)return reply(req,{error:"Réunion introuvable"},404);
  const m=row.value,email=user.email.toLowerCase(),now=Date.now();
  const {data:admin}=await service.from("afriflow_admins").select("email").eq("email",email).maybeSingle();
  const {data:profile}=await service.from("afriflow_market_profiles").select("access_mode").eq("user_id",user.id).maybeSingle();
  if(!admin&&!["collaborator","shareholder_approved"].includes(profile?.access_mode||""))
    return reply(req,{error:"Cette réunion est réservée aux membres autorisés"},403);
  const invitees=Array.isArray(m.invitees)?m.invitees.map((v:unknown)=>String(v).trim().toLowerCase()):null;
  if(invitees&&!invitees.includes(email)&&!admin)
    return reply(req,{error:"Vous ne faites pas partie des personnes invitées"},403);
  const start=Number(m.start),end=start+Number(m.dur)*60000;
  if(!Number.isFinite(start)||!Number.isFinite(end)||now<start-15*60000||now>end)
    return reply(req,{error:"La présence ne peut être enregistrée qu'entre 15 minutes avant le début et la fin de la réunion"},409);
  const key="att:"+meetingId+":"+email;
  const {data:old,error:readErr}=await service.from("afriflow_state").select("value").eq("key",key).maybeSingle();
  if(readErr)throw new Error("Lecture de la présence impossible");
  if(old?.value)return reply(req,{ok:true,first:true,record:old.value});
  const record={meet:meetingId,email,name:String(user.user_metadata?.full_name||email).slice(0,120),at:now};
  const added=await service.from("afriflow_state").insert({key,value:record,updated_at:new Date(now).toISOString()});
  if(added.error){
    if(added.error.code!=="23505")throw new Error("Écriture de présence impossible");
    const prior=await service.from("afriflow_state").select("value").eq("key",key).maybeSingle();
    if(!prior.data?.value)throw new Error("Relecture de présence impossible");
    return reply(req,{ok:true,first:true,record:prior.data.value});
  }
  return reply(req,{ok:true,first:true,record});
 }catch(e){console.error("afriflow-meeting-checkin",e instanceof Error?e.message:"error");return reply(req,{error:"Pointage indisponible"},503);}
});
