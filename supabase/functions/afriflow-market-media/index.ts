import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_MARKET_APP_KEY = "fabkaj1klaccpeg";
function rawB64(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
async function cryptoKey() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}
async function savedRefresh(service: ReturnType<typeof createClient>) {
  const stored = await service.from("afriflow_private_integrations").select("ciphertext,iv").eq("key", "dropbox_refresh_token").maybeSingle();
  if (stored.error || !stored.data) return "";
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: rawB64(stored.data.iv) }, await cryptoKey(), rawB64(stored.data.ciphertext)));
  } catch { return ""; }
}

const fallbackOrigins = new Set([
  "https://afriflow-africa.onrender.com",
  "https://atayi-jo.github.io",
]);
function allowedOrigin(req: Request) {
  const configured = (Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = configured.length ? new Set(configured) : fallbackOrigins;
  const origin = req.headers.get("origin") || "";
  return allowed.has(origin) ? origin : "";
}
function headers(req: Request) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "private, max-age=300",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
function safeDropboxPath(path: string, root: string) {
  if (!path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "." || part === "..")) throw new Error("Chemin média invalide");
  if (root && path.toLowerCase() !== root.toLowerCase() && !path.toLowerCase().startsWith(root.toLowerCase() + "/")) throw new Error("Chemin média hors du dossier autorisé");
  return path;
}
async function dropboxToken(service: ReturnType<typeof createClient>) {
  const appKey = Deno.env.get("DROPBOX_APP_KEY") || DROPBOX_MARKET_APP_KEY;
  const refreshToken = await savedRefresh(service) || Deno.env.get("DROPBOX_REFRESH_TOKEN") || "";
  const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: appKey });
  const secret = Deno.env.get("DROPBOX_APP_SECRET");
  if (secret) params.set("client_secret", secret);
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Connexion Dropbox indisponible");
  return data.access_token as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "Méthode interdite" }, 405);
  if (req.headers.get("origin") && !allowedOrigin(req)) return json(req, { error: "Origine non autorisée" }, 403);
  try {
    const payload = await req.json();
    const productId = String(payload.productId || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return json(req, { error: "Produit invalide" }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const product = await service.from("afriflow_market_products")
      .select("id,original_path,is_active").eq("id", productId).eq("is_active", true).maybeSingle();
    if (product.error) throw product.error;
    if (!product.data) return json(req, { error: "Produit indisponible" }, 404);

    const variants = await service.from("afriflow_market_variants")
      .select("id,storage_path").eq("product_id", productId).eq("approval_status", "approved").order("approved_at", { ascending: true }).order("id", { ascending: true });
    if (variants.error) throw variants.error;
    const approved = variants.data || [];
    const hour = Math.floor(Date.now() / 3_600_000);
    const selected = approved.length ? approved[hour % approved.length] : null;
    const root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
    const path = safeDropboxPath(selected?.storage_path || product.data.original_path, root);
    const token = await dropboxToken(service);
    const response = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const link = await response.json();
    if (!response.ok || !link.link) throw new Error("Image temporairement indisponible");
    return json(req, { url: link.link, variantId: selected?.id || null, fallback: !selected });
  } catch (error) {
    console.error("afriflow-market-media", error instanceof Error ? error.message : "error");
    return json(req, { error: "Image Market indisponible" }, 503);
  }
});
