// Supabase Edge Function: certificate issuance, PDF, and public bearer-token verification.
import { createClient } from "npm:@supabase/supabase-js@2.49.10";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import qrcode from "npm:qrcode-generator@1.4.4";

const ORIGIN="https://afriflow-africa.onrender.com";
const cors={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uuid=(s:unknown)=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const ascii=(s:unknown)=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7e]/g," ").trim();
const string=(s:unknown,max=200)=>typeof s==="string"?s.trim().slice(0,max):"";
function verifyUrl(token:string){return ORIGIN+"/verify-certificate.html?token="+encodeURIComponent(token)}
function publicRow(row:any,valid:boolean){return {number:"AF-"+row.certificate_type.toUpperCase().slice(0,3)+"-"+row.id.slice(0,8).toUpperCase(),type:row.certificate_type,name:row.holder_name,market:row.market_name||null,issuedAt:row.issued_at,status:valid?"active":"invalid"}}
async function eligibility(db:any,row:any){
 const {data:p,error:e}=await db.from("afriflow_market_profiles").select("requested_role,access_mode").eq("user_id",row.holder_user_id).maybeSingle();
 if(e||!p)return false;
 if(row.certificate_type==="partner"){
  if(p.requested_role!=="partner"||p.access_mode!=="partner_approved")return false;
  const [terms,market]=await Promise.all([
   db.from("afriflow_partner_terms").select("is_enabled").eq("partner_user_id",row.holder_user_id).maybeSingle(),
   db.from("afriflow_partner_markets").select("market_name").eq("partner_user_id",row.holder_user_id).maybeSingle()
  ]);
  return Boolean(terms.data?.is_enabled&&market.data?.market_name===row.market_name);
 }
 return p.requested_role==="shareholder"&&p.access_mode==="shareholder_approved"&&row.legal_evidence_confirmed===true;
}
function lines(text:string,font:any,size:number,maxWidth:number){
 const words=ascii(text).split(/\s+/),out:string[]=[];let line="";
 for(const word of words){
  const next=line?line+" "+word:word;
  if(font.widthOfTextAtSize(next,size)>maxWidth&&line){out.push(line);line=word;}else line=next;
 }
 if(line)out.push(line);
 return out;
}
async function certificatePdf(row:any){
 const doc=await PDFDocument.create(),page=doc.addPage([595.28,841.89]),{width:w,height:h}=page.getSize();
 const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 // Use the official AfriFloW logo when its public PNG can be fetched;
 // failure must never block certificate generation.
 try{
  const response=await fetch(ORIGIN+"/logo.png",{signal:AbortSignal.timeout(2500)});
  if(response.ok&&response.headers.get("content-type")?.includes("image/png")){
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length<600000){
    const logo=await doc.embedPng(bytes),size=logo.scaleToFit(62,58);
    page.drawImage(logo,{x:70,y:h-117,width:size.width,height:size.height});
   }
  }
 }catch(_e){}

 const green=rgb(.10,.34,.22),muted=rgb(.34,.42,.38),gold=rgb(.73,.55,.18);
 page.drawRectangle({x:0,y:h-18,width:w,height:18,color:green});
 page.drawRectangle({x:32,y:32,width:w-64,height:h-80,borderColor:green,borderWidth:1.2});
 page.drawRectangle({x:40,y:40,width:w-80,height:h-96,borderColor:gold,borderWidth:.5});
 function center(str:string,y:number,f:any,size:number,color=green){const t=ascii(str);page.drawText(t,{x:(w-f.widthOfTextAtSize(t,size))/2,y,size,font:f,color});}
 center("AFRIFLOW",h-90,bold,28);
 center("Du territoire africain vers le monde",h-115,font,11,muted);
 const isPartner=row.certificate_type==="partner";
 center(isPartner?"CERTIFICAT DE PARTENARIAT COMMERCIAL":"ATTESTATION DE STATUT ACTIONNAIRE",h-183,bold,isPartner?17:16);
 center(isPartner?"Commercial Partnership Certificate":"Shareholder Status Attestation",h-207,font,10,muted);
 center("La Direction d'AfriFloW atteste que",h-270,font,12,muted);
 const name=ascii(row.holder_name);
 center(name,h-315,bold,Math.min(21,Math.max(12,410/(Math.max(1,name.length)*.55))),green);
 const para=isPartner
  ?"est reconnu(e) comme partenaire commercial d'AfriFloW sur le marche indique ci-dessous, selon les conditions contractuelles en vigueur."
  :"est reconnu(e) comme actionnaire d'AfriFloW, apres verification des justificatifs par la Direction. Ce document ne constitue pas un titre de propriete.";
 let y=h-365;for(const l of lines(para,font,11,450)){center(l,y,font,11,muted);y-=19;}
 if(isPartner){center("MARCHE COMMERCIAL ATTRIBUE",h-450,bold,11,gold);center(row.market_name,h-475,bold,17,green)}
 const no="AF-"+row.certificate_type.toUpperCase().slice(0,3)+"-"+row.id.slice(0,8).toUpperCase();
 page.drawText("Reference : "+no,{x:80,y:310,size:10,font:bold,color:green});
 page.drawText("Date d'emission : "+new Date(row.issued_at).toLocaleDateString("fr-FR",{timeZone:"UTC"}),{x:80,y:286,size:10,font,color:muted});
 page.drawText("Statut lors de l'emission : Actif",{x:80,y:264,size:10,font,color:muted});
 page.drawText("Validation electronique AfriFloW",{x:80,y:222,size:11,font:bold,color:green});
 page.drawText("Document verifiable en ligne. Aucune signature manuscrite simulee.",{x:80,y:201,size:9,font,color:muted});
 const qr=qrcode(0,"M");qr.addData(verifyUrl(row.verification_token));qr.make();
 const count=qr.getModuleCount(),unit=2.65,qx=w-80-count*unit,qy=175;
 page.drawRectangle({x:qx-6,y:qy-6,width:count*unit+12,height:count*unit+12,color:rgb(1,1,1)});
 for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c))page.drawRectangle({x:qx+c*unit,y:qy+(count-1-r)*unit,width:unit+.03,height:unit+.03,color:green});
 page.drawText("Scannez pour verifier",{x:qx-5,y:qy-22,size:8,font,color:muted});
 center("Verification de validite : ce certificat peut etre revoque.",80,font,8,muted);
 return doc.save();
}

async function liveProfile(db:any,userId:string){
 const [identity,role,market,terms,ids]=await Promise.all([
  db.from("afriflow_profiles").select("first_name,last_name,job_title,organization,country,city,birth_date").eq("user_id",userId).maybeSingle(),
  db.from("afriflow_market_profiles").select("requested_role,access_mode").eq("user_id",userId).maybeSingle(),
  db.from("afriflow_partner_markets").select("market_name").eq("partner_user_id",userId).maybeSingle(),
  db.from("afriflow_partner_terms").select("is_enabled").eq("partner_user_id",userId).maybeSingle(),
  db.from("afriflow_member_ids").select("login_id,admin_number").eq("user_id",userId).maybeSingle()
 ]);
 for(const x of [identity,role,market,terms,ids])if(x.error)throw x.error;
 const p=identity.data||{},r=role.data||{},type=["partner","shareholder"].includes(r.requested_role)?r.requested_role:"member";
 const approved=type!=="member"&&r.access_mode===type+"_approved"&&(type!=="partner"||terms.data?.is_enabled===true);
 const marketName=type==="partner"?string(market.data?.market_name,80):"";
 return {loginId:ids.data?.login_id||null,adminNumber:ids.data?.admin_number||null,name:string([p.first_name,p.last_name].filter(Boolean).join(" "),160)||"Membre AfriFloW",
   type,approved,market:marketName||null,roleStatus:string(r.access_mode,40)||"non renseigne",
   job:string(p.job_title,120)||null,birth:string(p.birth_date,10)||null,organization:string(p.organization,120)||null,
   country:string(p.country,80)||null,city:string(p.city,80)||null};
}
async function profilePdf(data:any){
 // Institutional A4 certificate inspired by the user-provided school certificate:
 // clean white sheet, left-aligned body, subtle table rule, no border or seal.
 const doc=await PDFDocument.create();
 const page=doc.addPage([595.28,841.89]),w=595.28,h=841.89;
 const body=await doc.embedFont(StandardFonts.Helvetica),
       bold=await doc.embedFont(StandardFonts.HelveticaBold),
       italic=await doc.embedFont(StandardFonts.HelveticaOblique);
 // AfriFloW identity: institutional deep green + living green and mango-orange accents.
 // The document keeps a white background and sober typography; color is used sparingly.
 const ink=rgb(.08,.10,.10),grey=rgb(.34,.38,.37),
       green=rgb(24/255,93/255,52/255),
       leaf=rgb(60/255,145/255,55/255),
       orange=rgb(231/255,135/255,17/255);
 const x=63,right=w-62,contentWidth=right-x;
 const write=(value:string,atX:number,y:number,font:any=body,size=11,color=ink)=>{
  page.drawText(ascii(value),{x:atX,y,font,size,color});
 };
 const centered=(value:string,y:number,font:any=body,size=11,color=ink)=>{
  const t=ascii(value);write(t,(w-font.widthOfTextAtSize(t,size))/2,y,font,size,color);
 };
 const wrapped=(value:string,atX:number,y:number,width:number,font:any=body,size=11,leading=16)=>{
  for(const line of lines(value,font,size,width)){write(line,atX,y,font,size);y-=leading}
  return y;
 };
 // Brand is the only image. No decorative frame, simulated stamp or fake signature.
 try{
  const resp=await fetch(ORIGIN+"/logo.png",{signal:AbortSignal.timeout(2200)});
  if(resp.ok&&resp.headers.get("content-type")?.includes("image/png")){
   const bytes=new Uint8Array(await resp.arrayBuffer());
   if(bytes.length<600000){const logo=await doc.embedPng(bytes),size=logo.scaleToFit(65,58);page.drawImage(logo,{x:(w-size.width)/2,y:h-118,width:size.width,height:size.height})}
  }
 }catch(_e){}
 // Balanced visual anchor below the centered official AfriFloW logo.
 page.drawLine({start:{x:w/2-31,y:h-131},end:{x:w/2+17,y:h-131},thickness:2.5,color:leaf});
 page.drawLine({start:{x:w/2+19,y:h-131},end:{x:w/2+31,y:h-131},thickness:2.5,color:orange});
 const title="ATTESTATION DE "+(data.approved&&data.type==="partner"?"PARTENARIAT COMMERCIAL":data.approved&&data.type==="shareholder"?"STATUT ACTIONNAIRE":"PROFIL");
 centered(title,h-157,bold,title.length>35?14:16,green);
 centered("AfriFloW profile attestation",h-175,italic,10,grey);
 write("La Direction d'AfriFloW constate que",x,h-248,body,11);
 write("AfriFloW management confirms that",x,h-265,italic,10,grey);
 let name=ascii(data.name||"Membre AfriFloW"),nameSize=15;
 while(nameSize>10&&bold.widthOfTextAtSize(name,nameSize)>contentWidth)nameSize--;
 write(name,x,h-305,bold,nameSize,ink);
 if(data.adminNumber)write("N° de dossier administratif : "+data.adminNumber,x,h-327,body,10,grey);
 let yy=h-344;
 if(data.birth){write("Date de naissance (date of birth) : "+new Date(data.birth+"T12:00:00Z").toLocaleDateString("fr-FR",{timeZone:"UTC"}),x,yy,body,10.5);yy-=19;}
 if(data.city||data.country){write("Localisation (location) : "+[data.city,data.country].filter(Boolean).join(", "),x,yy,body,10.5);yy-=19;}
 if(data.organization){write("Organisation (organization) : "+data.organization,x,yy,body,10.5);yy-=19;}
 yy-=30;
 const intro=data.approved&&data.type==="partner"
  ?"est enregistre(e) comme partenaire commercial approuve(e) dans AfriFloW, pour le marche indique ci-dessous."
  :data.approved&&data.type==="shareholder"
  ?"dispose d'un compte actionnaire approuve dans la plateforme AfriFloW, sous reserve des actes sociaux applicables."
  :"dispose d'un profil AfriFloW dont le statut institutionnel reste a confirmer.";
 yy=wrapped(intro,x,yy,contentWidth,body,11,16);
 yy-=13;
 page.drawLine({start:{x,y:yy},end:{x:right,y:yy},thickness:1,color:green});
 page.drawLine({start:{x:right-47,y:yy},end:{x:right,y:yy},thickness:2.2,color:orange});
 yy-=33;
 const labelX=x,valueX=240,valueWidth=right-valueX;
 function row(label:string,value:string){
  write(label,labelX,yy,bold,10,green);
  const next=wrapped(value||"Non renseigne",valueX,yy,valueWidth,body,10.5,15);
  yy=Math.min(yy-25,next-12);
 }
 if(data.loginId)row("Identifiant (login ID) :",data.loginId);
 row("Role (role) :",data.type==="partner"?"Partenaire commercial":data.type==="shareholder"?"Actionnaire":"Membre AfriFloW");
 row("Statut (status) :",data.approved?"Approuve dans AfriFloW":"En attente ou non approuve");
 if(data.type==="partner")row("Marche commercial (market) :",data.market||"Non renseigne");
 if(data.job)row("Fonction (position) :",data.job);
 // Date and organizational sign-off are textual, not a representation of
 // signed legal certification. No seal, no stamp and no imitated handwriting.
 const date=new Date().toLocaleDateString("fr-FR",{timeZone:"UTC"});
 const signX=325;
 write("Etabli automatiquement le "+date,signX,152,body,10);
 write("Automatically generated on "+date,signX,136,italic,9.5,grey);
 write("Pour AfriFloW",signX,103,body,11);
 write("La Direction",signX,85,bold,11,green);
 // Plain disclaimer is mandatory because an account role does not establish
 // legal share ownership or a signed commercial mandate.
 page.drawLine({start:{x,y:59},end:{x:right,y:59},thickness:.5,color:leaf});
 page.drawLine({start:{x:right-40,y:59},end:{x:right,y:59},thickness:1.3,color:orange});
 write("Document genere depuis les donnees du profil, sans signature ni tampon.",x,46,italic,8,grey);
 write("Ne remplace pas un acte d'actionnariat ou un accord de partenariat.",x,34,italic,8,grey);
 return doc.save();
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.headers.get("origin")&&req.headers.get("origin")!==ORIGIN)return json({error:"Origine non autorisee"},403);
 if(!["GET","POST"].includes(req.method))return json({error:"Methode non autorisee"},405);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const url=new URL(req.url),body=req.method==="POST"?await req.json().catch(()=>({})):{};
  const action=string(req.method==="GET"?url.searchParams.get("action"):body.action,25);
  if(action==="verify"&&req.method==="GET"){
   const token=url.searchParams.get("token")||"";
   if(!/^[0-9a-f]{64}$/i.test(token))return json({valid:false},404);
   const {data:row}=await db.from("afriflow_certificates").select("*").eq("verification_token",token).maybeSingle();
   if(!row)return json({valid:false},404);
   const valid=row.status==="active"&&await eligibility(db,row);
   return json({valid,certificate:publicRow(row,valid)});
  }
  const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!bearer)return json({error:"Authentification requise"},401);
  const {data:{user},error:userError}=await db.auth.getUser(bearer);
  if(userError||!user?.id||!user.email||!user.email_confirmed_at)return json({error:"Session invalide"},401);
  const {data:admin}=await db.from("afriflow_admins").select("email").ilike("email",user.email).maybeSingle();
  const isAdmin=!!admin;
  if(action==="profile_summary"){
    const result=await liveProfile(db,user.id);
    return json({profile:result});
  }
  if(action==="profile_pdf"){
    const data=await liveProfile(db,user.id);
    const pdf=await profilePdf(data);
    return new Response(pdf,{status:200,headers:{...cors,"Content-Type":"application/octet-stream","Content-Disposition":'attachment; filename="AfriFloW-profil.pdf"',"Cache-Control":"no-store"}});
  }
  if(action==="mine"){
   const {data, error}=await db.from("afriflow_certificates").select("*").eq("holder_user_id",user.id).order("issued_at",{ascending:false}).limit(20);
   if(error)throw error;
   const result=[];
   for(const row of data||[]){
    const valid=row.status==="active"&&await eligibility(db,row);
    result.push({...publicRow(row,valid),id:row.id,verifyUrl:verifyUrl(row.verification_token)});
   }
   return json({certificates:result});
  }
  if(action==="admin_list"){
   if(!isAdmin)return json({error:"Administration requise"},403);
   const {data,error}=await db.from("afriflow_certificates").select("id,holder_user_id,holder_name,certificate_type,market_name,issued_at,status").order("issued_at",{ascending:false}).limit(250);
   if(error)throw error;
   return json({certificates:data||[]});
  }
  if(action==="issue"){return json({error:"Émission manuelle désactivée : les attestations sont générées automatiquement depuis le profil."},410);}
  if(action==="revoke"){
   if(!isAdmin)return json({error:"Administration requise"},403);
   const id=string(body.certificateId,40),reason=string(body.reason,300);
   if(!uuid(id)||reason.length<5)return json({error:"Certificat et motif de revocation requis"},400);
   const {error}=await db.from("afriflow_certificates").update({status:"revoked",revoked_at:new Date().toISOString(),revoked_by:user.id,revocation_reason:reason}).eq("id",id).eq("status","active");
   if(error)throw error;return json({ok:true});
  }
  if(action==="download"){
   const id=string(body.certificateId,40);if(!uuid(id))return json({error:"Certificat invalide"},400);
   const {data:row,error}=await db.from("afriflow_certificates").select("*").eq("id",id).maybeSingle();
   if(error||!row)return json({error:"Certificat introuvable"},404);
   if(row.holder_user_id!==user.id&&!isAdmin)return json({error:"Acces refuse"},403);
   if(row.status!=="active"||!(await eligibility(db,row)))return json({error:"Ce certificat n'est plus valide. Une reemission est necessaire."},409);
   const pdf=await certificatePdf(row);
   return new Response(pdf,{status:200,headers:{...cors,"Content-Type":"application/octet-stream","Content-Disposition":'attachment; filename="AfriFloW-certificat-'+row.id.slice(0,8)+'.pdf"',"Cache-Control":"no-store"}});
  }
  return json({error:"Action inconnue"},400);
 }catch(e){console.error("Certificate service error",e);return json({error:"Service certificats momentanement indisponible"},500);}
});
