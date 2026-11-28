import { createClient } from "npm:@supabase/supabase-js@2";

const defaultOrigins=new Set(["https://afriflow.pages.dev","https://atayi-jo.github.io"]);
function headers(req:Request){
  const origin=req.headers.get("origin")||"";
  const configured=(Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS")||"").split(",").map(s=>s.trim()).filter(Boolean);
  const allowed=configured.length?new Set(configured):defaultOrigins;
  return {
    ...(allowed.has(origin)?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{}),
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Content-Type":"application/json",
    "Cache-Control":"no-store"
  };
}
function reply(req:Request,obj:unknown,status=200){
  return new Response(JSON.stringify(obj),{status,headers:headers(req)});
}
function str(value:unknown,max=500){return String(value??"").trim().slice(0,max);}
function uuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
const decisions=new Set(["classify_client","classify_partner","classify_shareholder","approve","reject","revoke"]);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});
  if(req.method!=="POST")return reply(req,{error:"Méthode non autorisée"},405);
  if(req.headers.get("origin")&&!headers(req)["Access-Control-Allow-Origin"])return reply(req,{error:"Origine non autorisée"},403);
  try{
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    if(!token)return reply(req,{error:"Connexion requise"},401);
    const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:auth,error:authError}=await service.auth.getUser(token);
    const user=auth.user;
    if(authError||!user?.email||!user.email_confirmed_at)return reply(req,{error:"Session invalide"},401);
    const {data:administrator,error:adminError}=await service.from("afriflow_admins")
      .select("email").eq("email",user.email.toLowerCase()).maybeSingle();
    if(adminError||!administrator)return reply(req,{error:"Accès administrateur requis"},403);
    const body=await req.json().catch(()=>({}));
    const action=str(body.action,40);
    if(action==="list"){
      const [profiles,records]=await Promise.all([
        service.from("afriflow_market_profiles")
          .select("user_id,requested_role,access_mode,created_at")
          .order("created_at",{ascending:false}).limit(1000),
        service.from("afriflow_access_audit")
          .select("target_user_id,administrator_user_id,previous_role,previous_access,new_role,new_access,action,reason,created_at")
          .order("created_at",{ascending:false}).limit(100)
      ]);
      if(profiles.error||records.error)throw new Error("Liste des accès indisponible");
      const entries=[] as Array<{id:string,email:string,created_at:string}>;
      for(let page=1;page<=10;page++){
        const r=await service.auth.admin.listUsers({page,perPage:100});
        if(r.error)throw new Error("Liste des utilisateurs indisponible");
        entries.push(...(r.data?.users||[]).map(x=>({id:x.id,email:x.email||"",created_at:x.created_at||""})));
        if((r.data?.users||[]).length<100)break;
      }
      const emails=new Map(entries.map(e=>[e.id,e.email]));
      return reply(req,{ok:true,users:(profiles.data||[]).map(p=>({
        ...p,email:emails.get(p.user_id)||"",legacy:p.access_mode==="collaborator"
      })),history:records.data||[]});
    }
    if(action==="decide"){
      const userId=str(body.userId,36),decision=str(body.decision,40),reason=str(body.reason,500);
      if(!uuid(userId)||!decisions.has(decision))return reply(req,{error:"Demande invalide"},400);
      const done=await service.rpc("af_access_admin_decide",{
        p_actor:user.id,p_target:userId,p_action:decision,p_reason:reason
      });
      if(done.error)return reply(req,{error:done.error.message||"Décision refusée"},409);
      return reply(req,{ok:true,message:"Décision appliquée et enregistrée.",access_mode:done.data});
    }
    return reply(req,{error:"Action inconnue"},400);
  }catch(error){
    console.error("afriflow-access-admin:",error instanceof Error?error.message:"error");
    return reply(req,{error:"Administration des accès indisponible"},503);
  }
});
