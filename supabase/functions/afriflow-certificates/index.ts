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
  if(action==="issue"){
   if(!isAdmin)return json({error:"Administration requise"},403);
   const target=string(body.userId,40),type=string(body.type,20);
   if(!uuid(target)||!["partner","shareholder"].includes(type))return json({error:"Parametres invalides"},400);
   const {data:profile}=await db.from("afriflow_market_profiles").select("requested_role,access_mode").eq("user_id",target).maybeSingle();
   if(!profile||profile.requested_role!==type||profile.access_mode!==type+"_approved")return json({error:"Compte non approuve pour ce type de certificat"},409);
   const {data:identity}=await db.from("afriflow_profiles").select("first_name,last_name").eq("user_id",target).maybeSingle();
   const fullName=string([identity?.first_name,identity?.last_name].filter(Boolean).join(" "),160);
   if(fullName.length<3)return json({error:"Le titulaire doit completer son nom et prenom dans son profil."},409);
   let market:string|null=null;
   if(type==="partner"){
    const [marketRes,termsRes]=await Promise.all([
     db.from("afriflow_partner_markets").select("market_name").eq("partner_user_id",target).maybeSingle(),
     db.from("afriflow_partner_terms").select("is_enabled").eq("partner_user_id",target).maybeSingle()
    ]);
    market=string(marketRes.data?.market_name,80)||null;
    if(!market||!termsRes.data?.is_enabled)return json({error:"Le marche commercial et les conditions actives sont requis pour emettre le certificat partenaire."},409);
   }else if(body.legalEvidenceConfirmed!==true)return json({error:"Verifiez les justificatifs d'actionnariat avant emission."},409);
   const {data:existing,error:existingError}=await db.from("afriflow_certificates").select("id").eq("holder_user_id",target).eq("certificate_type",type).eq("status","active");
   if(existingError)throw existingError;
   // Explicit replacement; existing certificates are revoked before a new certificate is issued.
   if((existing||[]).length){const r=await db.from("afriflow_certificates").update({status:"revoked",revoked_at:new Date().toISOString(),revoked_by:user.id,revocation_reason:"Reemission"}).eq("holder_user_id",target).eq("certificate_type",type).eq("status","active");if(r.error)throw r.error;}
   const random=new Uint8Array(32);crypto.getRandomValues(random);const token=Array.from(random,x=>x.toString(16).padStart(2,"0")).join("");
   const {data:issued,error:issueErr}=await db.from("afriflow_certificates").insert({
    holder_user_id:target,certificate_type:type,holder_name:fullName,market_name:market,
    issued_by:user.id,verification_token:token,legal_evidence_confirmed:type==="shareholder"
   }).select("id").single();
   if(issueErr)throw issueErr;
   return json({ok:true,certificateId:issued.id});
  }
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
   return new Response(pdf,{status:200,headers:{...cors,"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="AfriFloW-certificat-'+row.id.slice(0,8)+'.pdf"',"Cache-Control":"no-store"}});
  }
  return json({error:"Action inconnue"},400);
 }catch(e){console.error("Certificate service error",e);return json({error:"Service certificats momentanement indisponible"},500);}
});
