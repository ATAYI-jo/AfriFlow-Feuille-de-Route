import { createClient } from "npm:@supabase/supabase-js@2";

const bucketRoot=(Deno.env.get("DROPBOX_PARTNER_ROOT")||"/AfriFlow").replace(/\/+$/,"");
const allowedOrigins=new Set(["https://afriflow.pages.dev","https://atayi-jo.github.io"]);
const maxBytes=25*1024*1024, maxChunk=2*1024*1024;
const mimeExt:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm"};
function headers(req:Request){
 const origin=req.headers.get("origin")||"";
 const allowed=origin&&allowedOrigins.has(origin)?origin:"https://afriflow.pages.dev";
 return {"Access-Control-Allow-Origin":allowed,"Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
}
function reply(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:headers(req)});}
const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
function decodeB64(t:string){
 if(t.length>(maxChunk*4/3+64)||!/^[A-Za-z0-9+/]*={0,2}$/.test(t))throw Error("Morceau de fichier invalide");
 const bytes=Uint8Array.from(atob(t),c=>c.charCodeAt(0));
 if(bytes.byteLength>maxChunk)throw Error("Morceau supérieur à 2 Mo");
 return bytes;
}
function short(value:unknown,n=200){return String(value||"").slice(0,n);}
function validUuid(value:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));}
function safeCountry(market:any){let name=String(market?.market_name||"Marche").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48);return String(market?.country_code||"XX").toUpperCase().replace(/[^A-Z]/g,"").slice(0,2)+"-"+(name||"Marche");}
function escapedName(name:string){return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").slice(0,100);}
function caseRoot(market:any,uid:string,id:string){return bucketRoot+"/Marches/"+safeCountry(market)+"/Partenaires/"+uid+"/Signalements/"+id;}
async function savedRefresh(){
 const stored=await service.from("afriflow_private_integrations").select("ciphertext,iv").eq("key","dropbox_refresh_token").maybeSingle();
 if(stored.error||!stored.data)return "";
 try {
  const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""));
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
  const byte=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:byte(stored.data.iv)},key,byte(stored.data.ciphertext)));
 }catch{return "";}
}
async function token(){
 const refresh=await savedRefresh()||Deno.env.get("DROPBOX_REFRESH_TOKEN")||"";
 const key=Deno.env.get("DROPBOX_APP_KEY")||"fabkaj1klaccpeg";
 if(!refresh)throw Error("Connexion Dropbox serveur non configurée");
 const params=new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,client_id:key});
 const secret=Deno.env.get("DROPBOX_APP_SECRET");if(secret)params.set("client_secret",secret);
 const res=await fetch("https://api.dropboxapi.com/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
 const data=await res.json();if(!res.ok||!data.access_token)throw Error("Autorisation Dropbox à renouveler");
 return data.access_token as string;
}
async function api(t:string,endpoint:string,payload:any){
 const response=await fetch("https://api.dropboxapi.com/2/"+endpoint,{method:"POST",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!response.ok)throw Error("Dropbox "+endpoint+" : "+response.status);
 return response.json();
}
async function contentApi(t:string,endpoint:string,args:any,data:Uint8Array){
 const response=await fetch("https://content.dropboxapi.com/2/files/"+endpoint,{method:"POST",headers:{Authorization:"Bearer "+t,"Dropbox-API-Arg":JSON.stringify(args),"Content-Type":"application/octet-stream"},body:data});
 if(!response.ok)throw Error("Dropbox "+endpoint+" : "+response.status+" "+(await response.text()).slice(0,140));
 return response.json();
}
async function ensureFolders(t:string,full:string){
 let current="";
 for(const segment of full.split("/").filter(Boolean)){
  current+="/"+segment;
  const response=await fetch("https://api.dropboxapi.com/2/files/create_folder_v2",{method:"POST",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},body:JSON.stringify({path:current,autorename:false})});
  if(!response.ok){const e=await response.text();if(response.status!==409||!e.includes("conflict"))throw Error("Dossier Dropbox indisponible : "+current);}
 }
}
async function signedTicket(data:any){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
 const bytes=new TextEncoder().encode(JSON.stringify(data));
 const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,bytes));
 const encode=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 return encode(bytes)+"."+encode(sig);
}
async function ticketData(ticket:string){
 const pair=ticket.split(".");if(pair.length!==2)throw Error("Session d'envoi invalide");
 const decode=(v:string)=>Uint8Array.from(atob(v.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-v.length%4)%4)),c=>c.charCodeAt(0));
 const bytes=decode(pair[0]),sig=decode(pair[1]);
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
 if(!await crypto.subtle.verify("HMAC",key,sig,bytes))throw Error("Session d'envoi non autorisée");
 const data=JSON.parse(new TextDecoder().decode(bytes));if(data.exp<Date.now())throw Error("Session expirée");
 return data;
}
async function archiveDispute(t:string,dispute:any,market:any,uid:string){
 const root=caseRoot(market,uid,dispute.id);
 await ensureFolders(t,root);
 const files=await service.from("afriflow_partner_dropbox_files").select("file_name,dropbox_path,content_type,file_size,created_at").eq("dispute_id",dispute.id);
 if(files.error)throw files.error;
 const data=new TextEncoder().encode(JSON.stringify({format:"AfriFloW partner case v1",exported_at:new Date().toISOString(),dispute:dispute,files:files.data||[]},null,2));
 await contentApi(t,"upload",{path:root+"/Dossier_Signalement.json",mode:"overwrite",autorename:false,mute:true},data);
 return root+"/Dossier_Signalement.json";
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});
 if(req.method!=="POST")return reply(req,{error:"Méthode interdite"},405);
 const origin=req.headers.get("origin");if(origin&&!allowedOrigins.has(origin))return reply(req,{error:"Origine non autorisée"},403);
 try{
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const {data:{user},error:authError}=jwt?await service.auth.getUser(jwt):{data:{user:null},error:new Error("JWT missing")};
  if(authError||!user)return reply(req,{error:"Session invalide"},401);
  const input=await req.json(),action=String(input.action||"");
  const disputeId=String(input.disputeId||"");
  if(!validUuid(disputeId))return reply(req,{error:"Identifiant de signalement invalide"},400);
  const disputeRes=await service.from("afriflow_partner_disputes").select("id,partner_user_id,order_id,category,description,batch_reference,status,admin_response,created_at,updated_at").eq("id",disputeId).maybeSingle();
  if(disputeRes.error||!disputeRes.data)return reply(req,{error:"Signalement introuvable"},404);
  const dispute=disputeRes.data;
  const adminRes=user.email?await service.from("afriflow_admins").select("email").eq("email",user.email.toLowerCase()).maybeSingle():{data:null};
  const admin=!!adminRes.data;
  if(dispute.partner_user_id!==user.id&&!admin)return reply(req,{error:"Accès interdit"},403);
  const owner=dispute.partner_user_id;
  const marketRes=await service.from("afriflow_partner_markets").select("country_code,market_name").eq("partner_user_id",owner).maybeSingle();
  if(marketRes.error)throw marketRes.error;
  const market=marketRes.data;
  if(!market)return reply(req,{error:"Marché du partenaire non attribué"},409);
  if(action==="status"){return reply(req,{ok:true,provider:"Dropbox",path:caseRoot(market,owner,disputeId)});}
  const t=await token();
  if(action==="archive"){
   return reply(req,{ok:true,path:await archiveDispute(t,dispute,market,owner)});
  }
  if(action==="download"){
   const fileId=String(input.fileId||"");
   if(!validUuid(fileId))return reply(req,{error:"Fichier invalide"},400);
   const f=await service.from("afriflow_partner_dropbox_files").select("dropbox_path,file_name").eq("id",fileId).eq("dispute_id",disputeId).maybeSingle();
   if(f.error||!f.data)return reply(req,{error:"Pièce introuvable"},404);
   const link=await api(t,"files/get_temporary_link",{path:f.data.dropbox_path});
   return reply(req,{ok:true,url:link.link});
  }
  if(!["upload_start","upload_append","upload_finish"].includes(action))return reply(req,{error:"Action inconnue"},400);
  if(user.id!==owner)return reply(req,{error:"Seul le partenaire peut déposer une preuve"},403);
  const size=Number(input.size),name=short(input.fileName,180),mime=short(input.mime,60),uuid=String(input.fileId||"");
  if(!validUuid(uuid)||!mimeExt[mime]||!Number.isSafeInteger(size)||size<1||size>maxBytes||!name)return reply(req,{error:"Fichier invalide (25 Mo maximum)"},400);
  const bytes=decodeB64(String(input.data||""));
  if(action==="upload_start"){
   if(bytes.length<1||bytes.length>size)return reply(req,{error:"Bloc de fichier invalide"},400);
   const started=await contentApi(t,"upload_session/start",{close:false},bytes);
   const ticket=await signedTicket({uid:owner,disputeId,fileId:uuid,fileName:name,mime,size,sessionId:started.session_id,exp:Date.now()+45*60*1000});
   return reply(req,{ok:true,ticket,offset:bytes.length});
  }
  const session=await ticketData(String(input.ticket||""));
  if(session.uid!==owner||session.disputeId!==disputeId||session.fileId!==uuid||session.fileName!==name||session.mime!==mime||session.size!==size)throw Error("Session non autorisée");
  const offset=Number(input.offset);
  if(!Number.isSafeInteger(offset)||offset<0||offset+bytes.length>size)throw Error("Décalage d'envoi invalide");
  const cursor={session_id:session.sessionId,offset};
  if(action==="upload_append"){
   if(offset+bytes.length===size)throw Error("Dernier bloc : action finish requise");
   await contentApi(t,"upload_session/append_v2",{cursor,close:false},bytes);
   return reply(req,{ok:true,offset:offset+bytes.length});
  }
  if(offset+bytes.length!==size)throw Error("Fichier incomplet");
  const directory=caseRoot(market,owner,disputeId)+"/"+(mime.startsWith("image/")?"Photos":"Videos");
  await ensureFolders(t,directory);
  const destination=directory+"/"+uuid+"."+mimeExt[mime];
  await contentApi(t,"upload_session/finish",{cursor,commit:{path:destination,mode:"add",autorename:false,mute:true}},bytes);
  const inserted=await service.from("afriflow_partner_dropbox_files").insert({dispute_id:disputeId,partner_user_id:owner,dropbox_path:destination,file_name:escapedName(name),content_type:mime,file_size:size}).select("id").single();
  if(inserted.error)throw Error("Fichier déposé dans Dropbox, mais index indisponible : "+inserted.error.message);
  let archived=true;try{await archiveDispute(t,dispute,market,owner);}catch(error){archived=false;console.error("Archive Dropbox",error);}
  return reply(req,{ok:true,fileId:inserted.data.id,path:destination,archived});
 }catch(error){console.error("Partner Dropbox error",error instanceof Error?error.message:"error");return reply(req,{error:error instanceof Error?error.message:"Opération indisponible"},500);}
});
