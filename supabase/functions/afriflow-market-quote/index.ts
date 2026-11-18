import { createClient } from "npm:@supabase/supabase-js@2";

const fallbackOrigins = new Set(["https://afriflow-africa.onrender.com", "https://atayi-jo.github.io"]);
function cors(req: Request) {
  const configured = (Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const accepted = (configured.length ? new Set(configured) : fallbackOrigins).has(origin) ? origin : "";
  return { ...(accepted ? { "Access-Control-Allow-Origin": accepted, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
}
function out(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors(req) }); }
function clean(value: unknown, max: number) { return String(value || "").trim().slice(0, max); }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, { error: "Méthode interdite" }, 405);
  if (req.headers.get("origin") && !cors(req)["Access-Control-Allow-Origin"]) return out(req, { error: "Origine non autorisée" }, 403);
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return out(req, { error: "Connexion requise" }, 401);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await service.auth.getUser(jwt);
    if (userError || !user?.email || !user.email_confirmed_at) return out(req, { error: "Session invalide" }, 401);
    const body = await req.json(), productId = clean(body.productId, 36), quantity = clean(body.qty, 60), message = clean(body.message, 1500);
    if (!uuid(productId)) return out(req, { error: "Produit invalide" }, 400);
    const product = await service.from("afriflow_market_products").select("id,name,is_active,is_in_stock").eq("id", productId).maybeSingle();
    if (product.error || !product.data?.is_active) return out(req, { error: "Produit introuvable" }, 404);
    if (!product.data.is_in_stock) return out(req, { error: "Ce produit est actuellement en rupture de stock" }, 409);
    const now = new Date(), ts = now.getTime(), token = crypto.randomUUID(), email = user.email.toLowerCase();
    const quote = { productId, product: product.data.name, qty: quantity, message, email, name: clean(user.user_metadata?.full_name || user.user_metadata?.name, 160), ts };
    const quoteRow = await service.from("afriflow_state").insert({ key: `quote:${ts}:${token}`, value: quote, updated_at: now.toISOString() });
    if (quoteRow.error) throw new Error("Impossible d’enregistrer la demande de devis");
    const admins = await service.from("afriflow_admins").select("email");
    if (admins.error) throw new Error("Impossible d’alerter l’équipe AfriFloW");
    const subject = `Urgent · nouveau devis pour ${product.data.name}`;
    const mail = { from: email, fromName: quote.name || email, subject, body: `Nouvelle demande de devis\n\nProduit : ${product.data.name}\nQuantité : ${quantity || "non précisée"}\nMessage : ${message || "aucun message"}\nClient : ${email}`, ts, read: false, urgent: true, quoteKey: `quote:${ts}:${token}` };
    const rows = (admins.data || []).map((admin) => ({ key: `msg:${String(admin.email).toLowerCase()}:${token}`, value: { ...mail, to: String(admin.email).toLowerCase() }, updated_at: now.toISOString() }));
    if (rows.length) {
      const sent = await service.from("afriflow_state").insert(rows);
      if (sent.error) throw new Error("Devis enregistré, mais l’alerte urgente n’a pas pu être envoyée");
    }
    return out(req, { ok: true, alerted: rows.length });
  } catch (error) {
    console.error("afriflow-market-quote", error instanceof Error ? error.message : "error");
    return out(req, { error: error instanceof Error ? error.message : "Envoi du devis indisponible" }, 500);
  }
});
