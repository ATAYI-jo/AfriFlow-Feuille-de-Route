import { createClient } from "npm:@supabase/supabase-js@2";

const fallbackOrigins = new Set(["https://afriflow-africa.onrender.com", "https://atayi-jo.github.io"]);
function cors(req: Request) {
  const origins = (Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const accepted = (origins.length ? new Set(origins) : fallbackOrigins).has(origin) ? origin : "";
  return { ...(accepted ? { "Access-Control-Allow-Origin": accepted, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
}
function out(req: Request, data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: cors(req) }); }
function text(value: unknown, maximum: number) { return String(value || "").trim().slice(0, maximum); }
function imageExtension(mime: string) { return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mime] || ""; }
function b64(value: unknown) { const data = String(value || ""); if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length > 10_500_000) throw new Error("Image invalide ou trop volumineuse"); const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0)); if (bytes.byteLength > 7 * 1024 * 1024) throw new Error("Image trop volumineuse (maximum 7 Mo)"); return bytes; }
async function token() {
  const key = Deno.env.get("DROPBOX_APP_KEY") || "", refresh = Deno.env.get("DROPBOX_REFRESH_TOKEN") || "";
  if (!key || !refresh) throw new Error("Dropbox serveur non configurée");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: key });
  const secret = Deno.env.get("DROPBOX_APP_SECRET"); if (secret) body.set("client_secret", secret);
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json(); if (!response.ok || !data.access_token) throw new Error("Dropbox nécessite une reconnexion administrateur"); return data.access_token as string;
}
async function upload(accessToken: string, path: string, bytes: Uint8Array) {
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: false, mute: true }), "Content-Type": "application/octet-stream" }, body: bytes });
  if (!response.ok) throw new Error("Dropbox a refusé l'enregistrement de l'image");
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, { error: "Méthode interdite" }, 405);
  const origin = req.headers.get("origin"); if (origin && !cors(req)["Access-Control-Allow-Origin"]) return out(req, { error: "Origine non autorisée" }, 403);
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return out(req, { error: "Connexion requise" }, 401);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await service.auth.getUser(jwt);
    if (error || !user?.email || !user.email_confirmed_at) return out(req, { error: "Session invalide" }, 401);
    const admin = await service.from("afriflow_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    if (admin.error || !admin.data) return out(req, { error: "Accès réservé à l'administrateur" }, 403);
    const body = await req.json(); const action = String(body.action || "status");
    const configured = Boolean(Deno.env.get("AFRIFLOW_IMAGE_AI_URL") && Deno.env.get("AFRIFLOW_IMAGE_AI_KEY"));
    if (action === "status") return out(req, { dropboxConfigured: Boolean(Deno.env.get("DROPBOX_APP_KEY") && Deno.env.get("DROPBOX_REFRESH_TOKEN")), aiConfigured: configured, aiMode: configured ? "connector_required" : "not_configured" });
    if (action === "upload_original") {
      const product = body.product || {}, name = text(product.name, 160), description = text(product.description, 4000), category = text(product.category, 80) || "Découvrir";
      const price = product.price === "" || product.price == null ? null : Number(product.price);
      if (name.length < 2 || !Number.isFinite(price == null ? 0 : price) || (price != null && price < 0)) return out(req, { error: "Vérifiez le nom et le prix du produit" }, 400);
      const mime = String(body.mime || ""), ext = imageExtension(mime); if (!ext) return out(req, { error: "Formats autorisés : JPG, PNG ou WebP" }, 400);
      const id = crypto.randomUUID(), root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
      if (!root.startsWith("/")) throw new Error("Dossier Market Dropbox non configuré");
      const path = `${root}/products/${id}/original.${ext}`, bytes = b64(body.data), accessToken = await token();
      await upload(accessToken, path, bytes);
      const inserted = await service.from("afriflow_market_products").insert({ id, name, description, category, price, currency: text(product.currency, 3).toUpperCase() || "XOF", original_path: path, created_by: user.id, is_active: false }).select("id,name,is_active").single();
      if (inserted.error) throw inserted.error;
      return out(req, { product: inserted.data, message: "Original enregistré dans Dropbox. Activez le produit après vérification." });
    }
    if (action === "upload_variant") {
      const productId = String(body.productId || ""); if (!isUuid(productId)) return out(req, { error: "Produit invalide" }, 400);
      const mime = String(body.mime || ""), ext = imageExtension(mime); if (!ext) return out(req, { error: "Formats autorisés : JPG, PNG ou WebP" }, 400);
      const product = await service.from("afriflow_market_products").select("id").eq("id", productId).maybeSingle(); if (product.error || !product.data) return out(req, { error: "Produit introuvable" }, 404);
      const id = crypto.randomUUID(), root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
      const path = `${root}/products/${productId}/variants/${id}.${ext}`; await upload(await token(), path, b64(body.data));
      const inserted = await service.from("afriflow_market_variants").insert({ id, product_id: productId, storage_path: path, source: body.source === "ai" ? "ai" : "manual", prompt: text(body.prompt, 2000), approval_status: "pending" }).select("id,approval_status").single();
      if (inserted.error) throw inserted.error; return out(req, { variant: inserted.data, message: "Variante enregistrée dans Dropbox. Elle reste hors rotation jusqu'à approbation." });
    }
    if (action === "request_ai_variant") {
      const productId = String(body.productId || ""), prompt = text(body.prompt, 2000); if (!isUuid(productId) || prompt.length < 8) return out(req, { error: "Produit et consigne détaillée requis" }, 400);
      const job = await service.from("afriflow_market_variant_jobs").insert({ product_id: productId, requested_by: user.id, prompt, status: configured ? "queued" : "configuration_missing", error_message: configured ? null : "Aucun fournisseur IA sécurisé n'est configuré." }).select("id,status,error_message").single();
      if (job.error) throw job.error;
      // Intentionally no browser-side generation and no provider-specific guesswork.
      return out(req, { job: job.data, generated: false, message: configured ? "Demande enregistrée pour le connecteur IA serveur." : "Aucune génération lancée : configurez d'abord le fournisseur IA côté serveur." }, configured ? 202 : 503);
    }
    return out(req, { error: "Action non reconnue" }, 400);
  } catch (error) {
    console.error("afriflow-market-admin", error instanceof Error ? error.message : "error");
    return out(req, { error: error instanceof Error ? error.message : "Opération Market indisponible" }, 500);
  }
});
