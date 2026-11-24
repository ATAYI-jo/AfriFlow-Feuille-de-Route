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
  const sender = line(value.fromName || value.from, 100) || "AfriFloW";
  const excerpt = line(value.body, 160) || (value.att ? "Ce message contient une pièce jointe." : "");
  const url = new URL("https://afriflow.pages.dev/");
  url.searchParams.set("message", id);
  const title = "AfriFloW · " + subject;
  return {
    subject: title,
    text: [subject, "De " + sender, excerpt, "Cliquez sur le lien pour lire la suite dans votre messagerie AfriFloW.", url.href].filter(Boolean).join("\n\n"),
    html: '<div lang="fr" style="font:16px/1.5 Arial,sans-serif;color:#193024"><h2>' + escapeHtml(subject) + '</h2><p>De ' + escapeHtml(sender) + '</p><p>' + escapeHtml(excerpt) + '</p><p>Cliquez sur le lien pour lire la suite dans votre messagerie AfriFloW.</p><a style="color:#17643e;font-weight:bold" href="' + escapeHtml(url.href) + '">Lire la suite</a></div>',
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
