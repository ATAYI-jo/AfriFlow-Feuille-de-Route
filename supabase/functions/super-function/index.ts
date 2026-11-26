import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

function line(value: unknown, limit: number) {
  const chars = Array.from(String(value || "").replace(/\s+/gu, " ").trim());
  return chars.length > limit ? chars.slice(0, limit - 1).join("").trimEnd() + "…" : chars.join("");
}
function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
type Sender = {name:string; fullName?:string; address?:string; photo?:{content:string; contentType:string; filename:string; cid:string; encoding:"base64"}};
function isPersonal(value: Record<string, unknown>, id:string) {
  return /^[0-9]{10,17}:[a-z0-9]{1,16}$/.test(id) && !value.orderId && !value.quoteKey;
}
function systemSender(value: Record<string, unknown>):Sender {
  return {name: value.urgent === true || (value.urgent == null && /^urgent\s*[·:–—-]/i.test(String(value.subject||""))) ? "AfriFlow · Alerte" : "AfriFlow"};
}
function validEmail(value:unknown) {
  const email=String(value||"").trim().toLowerCase();
  return email.length<=254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ? email : "";
}
function publicPhoto(kind:unknown,value:unknown):Sender["photo"] {
  if(kind!=="photo" || typeof value!=="string" || value.length>350000)return undefined;
  const match=/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match || match[2].length%4!==0)return undefined;
  const format=match[1]==="jpg"?"jpeg":match[1];
  try {
    const head=atob(match[2].slice(0,24));
    if(format==="png"&&!head.startsWith("\x89PNG\r\n\x1a\n"))return undefined;
    if(format==="jpeg"&&!head.startsWith("\xff\xd8\xff"))return undefined;
    if(format==="webp"&&!(head.startsWith("RIFF")&&head.slice(8,12)==="WEBP"))return undefined;
  }catch{return undefined;}
  return {content:match[2],contentType:"image/"+format,filename:"portrait."+format,cid:"sender-portrait@afriflow",encoding:"base64"};
}
async function identifySender(db:any,value:Record<string,unknown>,id:string):Promise<Sender> {
  if(!isPersonal(value,id))return systemSender(value);
  const email=validEmail(value.from);
  if(!email)return {name:"AfriFlow"};
  const {data:profile,error}=await db.from("afriflow_profiles").select("user_id,first_name,last_name").eq("email",email).maybeSingle();
  if(error||!profile?.user_id)return {name:"AfriFlow"};
  const {data:auth,error:authError}=await db.auth.admin.getUserById(profile.user_id);
  if(authError || !auth?.user?.email_confirmed_at || validEmail(auth.user.email)!==email)return {name:"AfriFlow"};
  const givenNames = String(profile.first_name || "").trim().replace(/\s+/gu, " ");
  const name = givenNames.split(" ")[0] || "Membre";
  const fullName = [givenNames, String(profile.last_name || "").trim()].filter(Boolean).join(" ") || name;
  const {data:directory}=await db.from("afriflow_member_directory").select("avatar_kind,avatar_value").eq("user_id",profile.user_id).maybeSingle();
  return {name,fullName,address:email,photo:publicPhoto(directory?.avatar_kind,directory?.avatar_value)};
}
export function messageEmail(value: Record<string, unknown>, id: string, identity:Sender = systemSender(value)) {
  const subject = line(value.subject, 120) || "Message sans objet";
  const urgentPrefix = /^urgent\s*[·:–—-]\s*/i;
  const urgent = value.urgent === true || (value.urgent == null && urgentPrefix.test(subject));
  const body = String(value.body || "").replace(/\r\n?/g, "\n");
  const fullBody = body || (value.att ? "Ce message contient une pièce jointe." : "");
  const excerpt = line(fullBody, 160);
  const sender = identity.fullName || identity.name;
  const initials = sender.split(/\s+/u).slice(0,2).map(word=>Array.from(word)[0]||"").join("").toUpperCase();
  const senderBadge = identity.address ? (identity.photo
    ? '<img src="cid:sender-portrait@afriflow" width="46" height="46" alt="" style="display:block;border-radius:50%;object-fit:cover;border:0">'
    : '<span style="display:block;width:46px;height:46px;line-height:46px;text-align:center;border-radius:50%;background:#e4efe7;color:#205e3d;font-size:17px;font-weight:bold">'+escapeHtml(initials)+'</span>') : "";
  const senderEmail = identity.address ? '<div style="font-size:12px;color:#516657;overflow-wrap:anywhere">'+escapeHtml(identity.address)+'</div>' : "";
  const url = new URL("https://afriflow.pages.dev/");
  url.searchParams.set("message", id);

  const heading = (urgent ? subject.replace(urgentPrefix, "") : subject) || "Message";
  const preview = excerpt;
  const bodyHtml = escapeHtml(fullBody).replace(/\n/g, "<br>");
  const attachmentNote = value.att ? "Les pièces jointes sont disponibles dans votre messagerie AfriFlow." : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>@media (prefers-reduced-motion:no-preference){.af-mark{animation:af-appear .65s ease-out 1}}@keyframes af-appear{from{transform:translateY(3px);opacity:.75}to{transform:translateY(0);opacity:1}}</style></head>
<body style="margin:0;background:#f1f5f0;color:#213b2d;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border:1px solid #d6e2d7;border-top:4px solid #236442;border-radius:14px;text-align:left">
<tr><td style="padding:16px 22px;border-bottom:1px solid #dce5dc"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="66" valign="middle"><img class="af-mark" src="https://afriflow.pages.dev/logo.png" width="54" height="45" alt="" style="display:block;border:0"></td>
<td valign="middle" style="font-size:21px;font-weight:bold;color:#184d33">AfriFlow</td></tr></table></td></tr>
<tr><td style="padding:22px;word-break:break-word;overflow-wrap:anywhere">
${urgent ? '<span style="display:inline-block;background:#ffe8e8;color:#8a2633;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:bold">Urgent</span>' : ''}
<h1 style="margin:10px 0 6px;font-size:22px;line-height:1.25;color:#193e2b">${escapeHtml(heading)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
${senderBadge ? '<td valign="middle" width="58">'+senderBadge+'</td>' : ""}
<td valign="middle" style="font-size:14px;color:#516657"><strong>De ${escapeHtml(sender)}</strong>${senderEmail}</td></tr></table>
<p style="font-size:16px;line-height:1.55;margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${bodyHtml}</p>
${attachmentNote ? '<p style="margin:14px 0 0;font-size:13px;color:#516657">'+escapeHtml(attachmentNote)+'</p>' : ""}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td bgcolor="#205e3d" style="border-radius:8px;mso-padding-alt:13px 22px"><a href="${escapeHtml(url.href)}" style="display:inline-block;padding:13px 22px;color:#ffffff;font:700 15px/20px Arial,sans-serif;text-decoration:none">Ouvrir la messagerie</a></td></tr></table>
<p style="margin:10px 0 0;color:#516657;font-size:13px;line-height:1.5">${identity.address ? "Vous pouvez répondre à ce courriel ou utiliser votre messagerie AfriFlow. Une réponse par courriel ne sera pas ajoutée automatiquement à la conversation AfriFlow." : "Pour répondre à ce message, accédez à votre messagerie AfriFlow."}</p>
</td></tr></table></td></tr></table></body></html>`;
  return {
    subject: "AfriFlow · " + subject,
    text: [urgent ? "Urgent" : "", heading, "De " + sender + (identity.address ? " (" + identity.address + ")" : ""), fullBody, attachmentNote, "Ouvrir la messagerie AfriFlow : " + url.href].filter(Boolean).join("\n\n"),
    html,
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("forbidden", {status:403});
  const {record} = await req.json();
  const to = String(record?.value?.to || "").trim().toLowerCase();
  const prefix = "msg:" + to + ":";
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(to) || !String(record?.key || "").startsWith(prefix)) return new Response("ignored");
  const id = record.key.slice(prefix.length);
  if (!id || id.length > 240) return new Response("ignored");
  if (record.value.orderId && id.startsWith("cod-") && Deno.env.get("AFRIFLOW_ORDER_EMAIL_ENABLED") === "true" && Deno.env.get("AFRIFLOW_ORDER_EMAIL_API_KEY") && Deno.env.get("AFRIFLOW_ORDER_EMAIL_FROM")) return new Response("order email handled separately");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data,error} = await db.from("afriflow_state").select("key").eq("key", "user:" + to).maybeSingle();
  if (error) return new Response("recipient lookup unavailable", {status:503});
  if (!data) {
    const profile = await db.from("afriflow_profiles").select("user_id").eq("email", to).maybeSingle();
    if (profile.error) return new Response("recipient lookup unavailable", {status:503});
    if (!profile.data) return new Response("unknown recipient");
    const account = await db.auth.admin.getUserById(profile.data.user_id);
    if (account.error && account.error.status !== 404) return new Response("recipient lookup unavailable", {status:503});
    const user = account.data?.user;
    if (!user?.email_confirmed_at || user.email?.toLowerCase() !== to) return new Response("unknown recipient");
  }
  const gmail = Deno.env.get("GMAIL_USER")!;
  const mailer = nodemailer.createTransport({host:"smtp.gmail.com", port:465, secure:true, auth:{user:gmail, pass:Deno.env.get("GMAIL_APP_PASSWORD")}});
  const identity=await identifySender(db,record.value,id);
  await mailer.sendMail({
    from:{name:identity.address?identity.name+" • AfriFlow":identity.name,address:"Afriflow.info@gmail.com"},
    to:{name:"",address:to},
    ...(identity.address?{replyTo:{name:identity.name,address:identity.address}}:{}),
    ...(identity.photo?{attachments:[identity.photo]}:{}),
    ...messageEmail(record.value,id,identity),
  });
  return new Response("sent");
});
