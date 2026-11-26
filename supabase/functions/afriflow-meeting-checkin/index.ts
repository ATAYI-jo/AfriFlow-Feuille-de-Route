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
 // Capture trusted arrival before authentication/database latency. The client
 // cannot supply or backdate this value; the database validates and merges it.
 const receivedAt=new Date().toISOString();
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
  const {data,error}=await service.rpc("af_meeting_checkin_write",{
    p_meeting_id:meetingId,p_user_id:user.id,p_received_at:receivedAt,
    p_source:String(payload.source||"home")
  });
  if(error){
    const status=error.code==="42501"?403:error.code==="P0002"?404:error.code==="22023"?409:503;
    return reply(req,{error:status===503?"Pointage indisponible. Réessayez sans fermer cette invitation.":error.message},status);
  }
  if(!data?.ok||!data.record)throw new Error("Réponse de pointage incomplète");
  return reply(req,data);
 }catch(e){console.error("afriflow-meeting-checkin",e instanceof Error?e.message:"error");return reply(req,{error:"Pointage indisponible"},503);}
});
