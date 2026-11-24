import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

function line(value: unknown, limit: number) {
  const chars = Array.from(String(value || "").replace(/\s+/gu, " ").trim());
  return chars.length > limit ? chars.slice(0, limit - 1).join("").trimEnd() + "…" : chars.join("");
}
function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function messageEmail(value: Record<string, unknown>, id: string) {
  const subject = line(value.subject, 120) || "Message sans objet";
  const urgentPrefix = /^urgent\s*[·:–—-]\s*/i;
  const urgent = value.urgent === true || (value.urgent == null && urgentPrefix.test(subject));
  const body = String(value.body || "").replace(/\r\n?/g, "\n");
  const fullBody = body || (value.att ? "Ce message contient une pièce jointe." : "");
  const excerpt = line(fullBody, 160);
  const sender = line(value.fromName || value.from, 100) || "AfriFloW";
  const url = new URL("https://afriflow.pages.dev/");
  url.searchParams.set("message", id);

  const heading = (urgent ? subject.replace(urgentPrefix, "") : subject) || "Message";
  const preview = excerpt;
  const bodyHtml = escapeHtml(fullBody).replace(/\n/g, "<br>");
  const attachmentNote = value.att ? "Les pièces jointes sont disponibles dans votre messagerie AfriFloW." : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>@media (prefers-reduced-motion:no-preference){.af-mark{animation:af-appear .65s ease-out 1}}@keyframes af-appear{from{transform:translateY(3px);opacity:.75}to{transform:translateY(0);opacity:1}}</style></head>
<body style="margin:0;background:#f1f5f0;color:#213b2d;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border:1px solid #d6e2d7;border-top:4px solid #236442;border-radius:14px;text-align:left">
<tr><td style="padding:16px 22px;border-bottom:1px solid #dce5dc"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="66" valign="middle"><img class="af-mark" src="https://afriflow.pages.dev/logo.png" width="54" height="45" alt="" style="display:block;border:0"></td>
<td valign="middle" style="font-size:21px;font-weight:bold;color:#184d33">AfriFloW</td></tr></table></td></tr>
<tr><td style="padding:22px;word-break:break-word;overflow-wrap:anywhere">
${urgent ? '<span style="display:inline-block;background:#ffe8e8;color:#8a2633;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:bold">Urgent</span>' : ''}
<h1 style="margin:10px 0 6px;font-size:22px;line-height:1.25;color:#193e2b">${escapeHtml(heading)}</h1>
<p style="margin:0 0 18px;font-size:14px;color:#516657">De ${escapeHtml(sender)}</p>
<p style="font-size:16px;line-height:1.55;margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${bodyHtml}</p>
${attachmentNote ? '<p style="margin:14px 0 0;font-size:13px;color:#516657">'+escapeHtml(attachmentNote)+'</p>' : ""}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td bgcolor="#205e3d" style="border-radius:8px;mso-padding-alt:13px 22px"><a href="${escapeHtml(url.href)}" style="display:inline-block;padding:13px 22px;color:#ffffff;font:700 15px/20px Arial,sans-serif;text-decoration:none">Ouvrir la messagerie</a></td></tr></table>
<p style="margin:10px 0 0;color:#516657;font-size:13px;line-height:1.5">Pour répondre à ce message, accédez à votre messagerie AfriFloW.</p>
</td></tr></table></td></tr></table></body></html>`;
  return {
    subject: "AfriFloW · " + subject,
    text: [urgent ? "Urgent" : "", heading, "De " + sender, fullBody, attachmentNote, "Ouvrir la messagerie AfriFloW : " + url.href].filter(Boolean).join("\n\n"),
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
  if (!data) return new Response("unknown recipient");
  const gmail = Deno.env.get("GMAIL_USER")!;
  const mailer = nodemailer.createTransport({host:"smtp.gmail.com", port:465, secure:true, auth:{user:gmail, pass:Deno.env.get("GMAIL_APP_PASSWORD")}});
  await mailer.sendMail({from:{name:"AfriFloW",address:gmail}, to:{name:"",address:to}, ...messageEmail(record.value,id)});
  return new Response("sent");
});
