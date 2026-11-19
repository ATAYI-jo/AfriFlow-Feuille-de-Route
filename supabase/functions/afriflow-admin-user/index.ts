import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set(["https://afriflow-africa.onrender.com", "https://atayi-jo.github.io"]);
function headers(req: Request) {
  const configured = (Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const allowed = (configured.length ? new Set(configured) : origins).has(origin) ? origin : "";
  return { ...(allowed ? { "Access-Control-Allow-Origin": allowed, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
}
function reply(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function email(value: unknown) { const result = String(value ?? "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : ""; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return reply(req, { error: "Méthode interdite" }, 405);
  if (req.headers.get("origin") && !headers(req)["Access-Control-Allow-Origin"]) return reply(req, { error: "Origine non autorisée" }, 403);
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply(req, { error: "Connexion requise" }, 401);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user: actor }, error: actorError } = await service.auth.getUser(token);
    if (actorError || !actor?.id || !actor.email) return reply(req, { error: "Session invalide" }, 401);
    const { data: admin } = await service.from("afriflow_admins").select("email").eq("email", actor.email.toLowerCase()).maybeSingle();
    if (!admin) return reply(req, { error: "Administration requise" }, 403);
    const body = await req.json();
    if (body.action !== "delete_member") return reply(req, { error: "Action inconnue" }, 400);
    const targetEmail = email(body.email);
    if (!targetEmail) return reply(req, { error: "Adresse invalide" }, 400);
    if (targetEmail === actor.email.toLowerCase()) return reply(req, { error: "Un administrateur ne peut pas supprimer son propre compte ici." }, 400);
    const admins = await service.from("afriflow_admins").select("email").eq("email", targetEmail).maybeSingle();
    if (admins.data) return reply(req, { error: "La suppression d’un autre administrateur est protégée." }, 403);
    const users = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const target = (users.data?.users || []).find((entry) => entry.email?.toLowerCase() === targetEmail);
    if (!target) return reply(req, { error: "Compte introuvable" }, 404);
    const id = target.id;
    const operations = await Promise.all([
      service.from("afriflow_state").delete().eq("key", "user:" + targetEmail),
      service.from("afriflow_state").delete().eq("key", "req:" + targetEmail),
      service.from("afriflow_state").delete().like("key", "msg:" + targetEmail + ":%"),
      service.from("afriflow_state").delete().like("key", "sent:" + targetEmail + ":%"),
      service.from("afriflow_state").delete().eq("value->>from", targetEmail),
      service.from("afriflow_state").delete().eq("value->>to", targetEmail),
      service.from("afriflow_profiles").delete().eq("user_id", id),
      service.from("afriflow_member_directory").delete().eq("user_id", id),
      service.from("afriflow_market_profiles").delete().eq("user_id", id),
      service.from("afriflow_ai_usage").delete().eq("user_id", id),
      service.from("afriflow_fcm_devices").delete().eq("user_id", id),
      service.from("afriflow_partner_sales_reports").delete().eq("partner_user_id", id),
      service.from("afriflow_participants").delete().eq("email", targetEmail),
    ]);
    if (operations.some((result) => result.error)) throw new Error("Impossible d’effacer toutes les données du membre");
    const partnerReports = await service.from("afriflow_partner_sales_reports").delete().eq("partner_user_id", id);
    if (partnerReports.error) throw new Error("Impossible d’effacer l’historique partenaire");
    const partnerOrders = await service.from("afriflow_partner_orders").delete().eq("partner_user_id", id);
    if (partnerOrders.error) throw new Error("Impossible d’effacer les commandes partenaire");
    const partnerTerms = await service.from("afriflow_partner_terms").delete().eq("partner_user_id", id);
    if (partnerTerms.error) throw new Error("Impossible d’effacer les conditions partenaire");
    const deleted = await service.auth.admin.deleteUser(id);
    if (deleted.error) throw new Error("Suppression du compte impossible");
    return reply(req, { ok: true, message: "Compte et données personnelles supprimés. Une future inscription repartira de zéro." });
  } catch (error) {
    console.error("afriflow-admin-user", error instanceof Error ? error.message : "error");
    return reply(req, { error: error instanceof Error ? error.message : "Suppression indisponible" }, 500);
  }
});
