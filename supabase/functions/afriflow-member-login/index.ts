// Username sign-in bridge: validates the password with Supabase Auth.
// Identifiers are public-ish; the private email is never disclosed to a visitor.
import { createClient } from "npm:@supabase/supabase-js@2.49.10";
const ORIGIN="https://afriflow.pages.dev";
const cors={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store"};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const invalid=()=>response({error:"Identifiant ou mot de passe incorrect."},401);
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return response({error:"Méthode non autorisée"},405);
 if(req.headers.get("origin")!==ORIGIN)return response({error:"Origine non autorisée"},403);
 const payload=await req.json().catch(()=>({}));
 const login=typeof payload?.identifier==="string"?payload.identifier.trim().toUpperCase():"";
 const password=typeof payload?.password==="string"?payload.password:"";
 if(!/^AF-[0-9]{6,12}$/.test(login)||!password||password.length>1024)return invalid();
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 // Limit failed attempts for the identifier without storing emails, plaintext passwords, or IP addresses.
 const bytes=new TextEncoder().encode(login);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 try{
  const since=new Date(Date.now()-15*60*1000).toISOString();
  const {count,error:countError}=await db.from("afriflow_login_attempts").select("id",{head:true,count:"exact"}).eq("login_key",key).gte("attempted_at",since);
  if(countError)throw countError;
  if((count||0)>=10)return response({error:"Trop de tentatives. Réessayez ultérieurement ou utilisez votre adresse e-mail."},429);
  const {data:account,error:lookupError}=await db.from("afriflow_member_ids").select("user_id").eq("login_id",login).maybeSingle();
  if(lookupError)throw lookupError;
  // Do not reveal account existence and avoid a fast path for nonexistent identifiers.
  let email="";
  if(account?.user_id){
   const u=await db.auth.admin.getUserById(account.user_id);
   email=u.data?.user?.email||"";
  }
  if(!email)email="unknown-"+key.slice(0,24)+"@invalid.afriflow.local";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  if(!anonKey)throw new Error("SUPABASE_ANON_KEY not configured");
  const auth=createClient(Deno.env.get("SUPABASE_URL")!,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.signInWithPassword({
    email,password,options:payload.captchaToken?{captchaToken:String(payload.captchaToken).slice(0,4096)}:undefined
  });
  if(error||!account?.user_id||!data?.session?.access_token||!data.session.refresh_token){
    await db.from("afriflow_login_attempts").insert({login_key:key});
    return invalid();
  }
  // The session is issued by Supabase Auth after password verification, never by the service role.
  return response({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch(e){console.error("Member login failed safely:",(e as Error).message);return response({error:"Connexion par identifiant momentanément indisponible."},503)}
});
