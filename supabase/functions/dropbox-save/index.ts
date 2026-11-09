import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
const root = (Deno.env.get("DROPBOX_ROOT") || "").replace(/\/+$/, "");
function validPath(raw: string) {
  if (!raw || !raw.startsWith("/") || raw.includes("\\") || raw.split("/").some(p => p === ".." || p === "." || !p)) return false;
  if (root && raw.toLowerCase() !== root.toLowerCase() && !raw.toLowerCase().startsWith(root.toLowerCase()+"/")) return false;
  return true;
}
async function api(token: string, endpoint: string, data: unknown) {
  const r = await fetch("https://api.dropboxapi.com/2/" + endpoint, {
    method: "POST", headers: { Authorization: "Bearer "+token, "Content-Type":"application/json" },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error("Dropbox " + endpoint + " : " + r.status + " " + (await r.text()).slice(0,160));
  return r.json();
}
async function dbxToken() {
  const r=await fetch("https://api.dropboxapi.com/oauth2/token",{
    method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"refresh_token",
      refresh_token:Deno.env.get("DROPBOX_REFRESH_TOKEN")||"",
      client_id:Deno.env.get("DROPBOX_APP_KEY")||"",
      client_secret:Deno.env.get("DROPBOX_APP_SECRET")||""
    })
  });
  const j=await r.json();if(!r.ok||!j.access_token)throw new Error("Dropbox : authentification impossible");
  return j.access_token as string;
}
Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return respond({error:"Méthode interdite"},405);
  try{
    const access=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    if(!access)return respond({error:"Connexion requise"},401);
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userResult=await service.auth.getUser(access);
    const user=userResult.data.user;
    if(userResult.error||!user?.email||!user.email_confirmed_at)return respond({error:"Session invalide"},401);
    const email=user.email.toLowerCase();
    const [adminResult,userRow,listed]=await Promise.all([
      service.from("afriflow_admins").select("email").eq("email",email).maybeSingle(),
      service.from("afriflow_state").select("value").eq("key","user:"+email).maybeSingle(),
      service.from("afriflow_state").select("value").eq("key","pub:dbxshow").maybeSingle()
    ]);
    if(adminResult.error||userRow.error||listed.error)throw new Error("Impossible de vérifier les autorisations");
    const admin=!!adminResult.data;
    const grants=Array.isArray(userRow.data?.value?.grants)?userRow.data.value.grants:[];
    if(!admin&&!grants.includes("all")&&!grants.includes("documents")){
      return respond({error:"Permission absente. Demandez l'autorisation à l'administrateur."},403);
    }
    const input=await req.json();
    const path=String(input.path||"");
    const data=String(input.data||"");
    if(!validPath(path)||!(/\.(docx|xlsx)$/i.test(path)))return respond({error:"Seuls les documents DOCX et XLSX autorisés peuvent être modifiés."},400);
    if(!Array.isArray(listed.data?.value?.items)||!listed.data.value.items.some((x:any)=>x&&x.path===path))return respond({error:"Fichier non publié sur AfriFloW"},403);
    if(data.length>11000000||data.length<50||!/^[-A-Za-z0-9+/=]+$/.test(data))return respond({error:"Fichier invalide ou trop volumineux (8 Mo maximum)."},400);
    const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
    if(bytes.length>8*1024*1024||bytes[0]!==80||bytes[1]!==75)return respond({error:"Le document doit être un fichier Office ZIP valide."},400);
    const token=await dbxToken();
    // Conserver une copie de la version précédente : si la sauvegarde échoue,
    // on n'écrase pas le fichier d'origine.
    const now=new Date().toISOString().replace(/[:.]/g,"-");
    const backup=path.replace(/\.(docx|xlsx)$/i,(".sauvegarde-"+now+"$&"));
    await api(token,"files/copy_v2",{from_path:path,to_path:backup,autorename:false});
    const upload=await fetch("https://content.dropboxapi.com/2/files/upload",{
      method:"POST",
      headers:{
        "Authorization":"Bearer "+token,
        "Dropbox-API-Arg":JSON.stringify({path,mode:"overwrite",autorename:false,mute:false}),
        "Content-Type":"application/octet-stream"
      },
      body:bytes
    });
    if(!upload.ok)throw new Error("Enregistrement Dropbox refusé : "+upload.status+" "+(await upload.text()).slice(0,160));
    return respond({success:true,backup:true});
  }catch(e){console.error("dropbox-save:",e instanceof Error?e.message:"error");return respond({error:"Enregistrement impossible : "+(e instanceof Error?e.message:"erreur serveur")},500)}
});
