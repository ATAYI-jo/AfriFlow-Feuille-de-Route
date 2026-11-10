import { createClient } from "npm:@supabase/supabase-js@2";
const originSet=new Set(["https://afriflow-africa.onrender.com","https://atayi-jo.github.io"]);
const root=(Deno.env.get("DROPBOX_ROOT")||"").replace(/\/+$/,"");
function cors(req:Request){const o=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":originSet.has(o)?o:"https://afriflow-africa.onrender.com","Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"}}
function out(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors(req)})}
function safePath(input:unknown){const p=String(input||"");if(!p.startsWith("/")||p.includes("\\")||p.split("/").includes("..")||p.split("/").includes("."))throw Error("Chemin Dropbox invalide");if(root&&p.toLowerCase()!==root.toLowerCase()&&!p.toLowerCase().startsWith(root.toLowerCase()+"/"))throw Error("Chemin hors du dossier autorisé");return p}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return out(req,{error:"Méthode interdite"},405);
 try{
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt)return out(req,{error:"Connexion requise"},401);
  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await supabase.auth.getUser(jwt);
  if(error||!user?.email||!user.email_confirmed_at)return out(req,{error:"Session invalide"},401);
  const email=user.email.toLowerCase();
  const check=await supabase.from("afriflow_admins").select("email").eq("email",email).maybeSingle();
  if(check.error||!check.data)return out(req,{error:"Accès réservé à l'administrateur"},403);
  const body=await req.json();
  const action=String(body.action||"status");
  const appKey=Deno.env.get("DROPBOX_APP_KEY")||"",refresh=Deno.env.get("DROPBOX_REFRESH_TOKEN")||"";
  if(action==="status")return out(req,{connected:Boolean(appKey&&refresh),mode:"server",root:root||"/"});
  if(action!=="upload")return out(req,{error:"Action non reconnue"},400);
  if(!appKey||!refresh)return out(req,{error:"Connexion Dropbox serveur non configurée"},503);
  const dest=safePath(body.path);
  if(!/\.(pdf|txt|png|jpe?g|docx|xlsx|csv|json|zip|webp)$/i.test(dest))return out(req,{error:"Format de fichier non autorisé"},400);
  const b64=String(body.data||"");
  if(b64.length>10500000||b64.length<1||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return out(req,{error:"Document invalide ou trop volumineux"},413);
  const bytes=Uint8Array.from(atob(b64),x=>x.charCodeAt(0));
  if(bytes.byteLength>7*1024*1024)return out(req,{error:"Document trop volumineux (maximum 7 Mo)"},413);
  const params=new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,client_id:appKey});
  const secret=Deno.env.get("DROPBOX_APP_SECRET");
  if(secret)params.set("client_secret",secret);
  const refreshResponse=await fetch("https://api.dropboxapi.com/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
  const token=await refreshResponse.json();
  if(!refreshResponse.ok||!token.access_token)return out(req,{error:"Dropbox serveur : reconnexion administrateur nécessaire"},503);
  const upload=await fetch("https://content.dropboxapi.com/2/files/upload",{method:"POST",headers:{Authorization:"Bearer "+token.access_token,"Dropbox-API-Arg":JSON.stringify({path:dest,mode:"overwrite",autorename:false,mute:true}),"Content-Type":"application/octet-stream"},body:bytes});
  if(!upload.ok){console.error("Dropbox upload HTTP",upload.status);return out(req,{error:"Dropbox a refusé l'enregistrement ("+upload.status+")"},502)}
  return out(req,{success:true});
 }catch(e){console.error("Dropbox admin upload failed",(e as Error).message);return out(req,{error:"Opération Dropbox indisponible"},500)}
});