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
function bytesToB64(bytes: Uint8Array) { const chunks: string[] = []; for (let index = 0; index < bytes.length; index += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000))); return btoa(chunks.join("")); }
function b64Raw(bytes: Uint8Array) { return bytesToB64(bytes); }
function rawB64(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
async function cryptoKey() { const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")); return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
const DROPBOX_MARKET_APP_KEY = "fabkaj1klaccpeg";
async function savedValue(service: ReturnType<typeof createClient>, key: string) {
  const stored = await service.from("afriflow_private_integrations").select("ciphertext,iv").eq("key", key).maybeSingle();
  if (stored.error || !stored.data) return "";
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: rawB64(stored.data.iv) }, await cryptoKey(), rawB64(stored.data.ciphertext))); } catch { return ""; }
}
async function saveValue(service: ReturnType<typeof createClient>, key: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(value)));
  const result = await service.from("afriflow_private_integrations").upsert({ key, ciphertext: b64Raw(encrypted), iv: b64Raw(iv), updated_at: new Date().toISOString() });
  if (result.error) throw new Error("Impossible d'enregistrer la connexion Dropbox");
}
async function savedRefresh(service: ReturnType<typeof createClient>) { return savedValue(service, "dropbox_refresh_token"); }
async function saveRefresh(service: ReturnType<typeof createClient>, refresh: string) { return saveValue(service, "dropbox_refresh_token", refresh); }
function b64url(bytes: Uint8Array) { return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function codeChallenge(value: string) { return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function redirectUri() { return Deno.env.get("AFRIFLOW_DROPBOX_REDIRECT_URI") || "https://afriflow-africa.onrender.com"; }
async function token(service: ReturnType<typeof createClient>) {
  const key = DROPBOX_MARKET_APP_KEY, refresh = await savedRefresh(service) || Deno.env.get("DROPBOX_REFRESH_TOKEN") || "";
  if (!key || !refresh) throw new Error("Dropbox serveur non configurée");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: key });
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json(); if (!response.ok || !data.access_token) throw new Error("Dropbox nécessite une reconnexion administrateur"); return data.access_token as string;
}
async function upload(accessToken: string, path: string, bytes: Uint8Array) {
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: false, mute: true }), "Content-Type": "application/octet-stream" }, body: bytes });
  if (!response.ok) { const detail = (await response.text()).slice(0, 180); throw new Error(`Dropbox a refusé l'enregistrement (${response.status})${detail ? " : " + detail : ""}`); }
}
async function dropboxStatus(service: ReturnType<typeof createClient>) {
  try {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { Authorization: `Bearer ${await token(service)}` } });
    return { connected: response.ok, message: response.ok ? "Dropbox est connecté." : "Dropbox doit être reconnecté." };
  } catch { return { connected: false, message: "Dropbox doit être reconnecté." }; }
}
async function download(accessToken: string, path: string) {
  const response = await fetch("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Dropbox-API-Arg": JSON.stringify({ path }) } });
  if (!response.ok) throw new Error("Original Dropbox indisponible pour la génération IA");
  return new Uint8Array(await response.arrayBuffer());
}
async function generateImage(original: Uint8Array, mime: string, instruction: string) {
  const key = Deno.env.get("GEMINI_API_KEY") || "", model = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
  if (!key) throw new Error("IA d'images non configurée");
  const prompt = "Crée une variante commerciale fidèle de la photo produit fournie. Conserve exactement le produit, sa forme, sa matière, son emballage, ses couleurs et tout texte lisible. Ne change que le décor, l'éclairage ou la mise en scène selon cette consigne : " + instruction;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, signal: AbortSignal.timeout(60000), body: JSON.stringify({ contents: [{ parts: [{ text: prompt.slice(0, 2800) }, { inlineData: { mimeType: mime, data: bytesToB64(original) } }] }], generationConfig: { responseModalities: ["IMAGE"] } }) });
  const result = await response.json(); if (!response.ok) throw new Error("Génération IA indisponible");
  const image = (result.candidates?.[0]?.content?.parts || []).find((part: { inlineData?: { data?: string } }) => part.inlineData?.data)?.inlineData;
  if (!image?.data || !imageExtension(image.mimeType || "")) throw new Error("L'IA n'a renvoyé aucune image exploitable");
  return { bytes: b64(image.data), mime: image.mimeType as string };
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
    const configured = Boolean(Deno.env.get("GEMINI_API_KEY"));
    if (action === "status") { const dropbox = await dropboxStatus(service); return out(req, { dropboxConfigured: true, dropboxConnected: dropbox.connected, dropboxMessage: dropbox.message, aiConfigured: configured, aiMode: configured ? "gemini_image" : "not_configured" }); }
    if (action === "dropbox_authorize") {
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(48))); await saveValue(service, "dropbox_oauth_verifier", verifier);
      const url = new URL("https://www.dropbox.com/oauth2/authorize"); url.searchParams.set("client_id", DROPBOX_MARKET_APP_KEY); url.searchParams.set("response_type", "code"); url.searchParams.set("token_access_type", "offline"); url.searchParams.set("redirect_uri", redirectUri()); url.searchParams.set("scope", "account_info.read files.metadata.read files.content.read files.content.write"); url.searchParams.set("code_challenge", await codeChallenge(verifier)); url.searchParams.set("code_challenge_method", "S256");
      return out(req, { url: url.toString() });
    }
    if (action === "dropbox_complete") {
      const code = text(body.code, 1000); if (!/^[A-Za-z0-9._-]{8,1000}$/.test(code)) return out(req, { error: "Code Dropbox invalide" }, 400);
      const verifier = await savedValue(service, "dropbox_oauth_verifier"); if (!verifier) return out(req, { error: "Demande Dropbox expirée : recommencez la reconnexion." }, 400);
      const params = new URLSearchParams({ grant_type: "authorization_code", code, client_id: DROPBOX_MARKET_APP_KEY, code_verifier: verifier, redirect_uri: redirectUri() });
      const exchange = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params }); const data = await exchange.json();
      if (!exchange.ok || !data.refresh_token) return out(req, { error: "Dropbox a refusé la nouvelle autorisation" }, 502);
      await saveRefresh(service, data.refresh_token); const check = await dropboxStatus(service); if (!check.connected) return out(req, { error: "Nouvelle connexion Dropbox non valide" }, 502);
      return out(req, { message: "Dropbox est reconnecté avec le droit d’écriture." });
    }
    if (action === "upload_original") {
      const product = body.product || {}, name = text(product.name, 160), description = text(product.description, 4000), category = text(product.category, 80) || "Découvrir";
      const price = product.price === "" || product.price == null ? null : Number(product.price);
      if (name.length < 2 || !Number.isFinite(price == null ? 0 : price) || (price != null && price < 0)) return out(req, { error: "Vérifiez le nom et le prix du produit" }, 400);
      const mime = String(body.mime || ""), ext = imageExtension(mime); if (!ext) return out(req, { error: "Formats autorisés : JPG, PNG ou WebP" }, 400);
      const id = crypto.randomUUID(), root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
      if (!root.startsWith("/")) throw new Error("Dossier Market Dropbox non configuré");
      const path = `${root}/products/${id}/original.${ext}`, bytes = b64(body.data), accessToken = await token(service);
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
      const path = `${root}/products/${productId}/variants/${id}.${ext}`; await upload(await token(service), path, b64(body.data));
      const inserted = await service.from("afriflow_market_variants").insert({ id, product_id: productId, storage_path: path, source: body.source === "ai" ? "ai" : "manual", prompt: text(body.prompt, 2000), approval_status: "pending" }).select("id,approval_status").single();
      if (inserted.error) throw inserted.error; return out(req, { variant: inserted.data, message: "Variante enregistrée dans Dropbox. Elle reste hors rotation jusqu'à approbation." });
    }
    if (action === "request_ai_variant") {
      const productId = String(body.productId || ""), prompt = text(body.prompt, 2000); if (!isUuid(productId) || prompt.length < 8) return out(req, { error: "Produit et consigne détaillée requis" }, 400);
      const job = await service.from("afriflow_market_variant_jobs").insert({ product_id: productId, requested_by: user.id, prompt, status: configured ? "processing" : "configuration_missing", error_message: configured ? null : "IA d'images non configurée." }).select("id,status,error_message").single();
      if (job.error) throw job.error;
      if (!configured) return out(req, { job: job.data, generated: false, message: "Aucune génération lancée : configurez l'IA d'images côté serveur." }, 503);
      try {
        const product = await service.from("afriflow_market_products").select("id,original_path").eq("id", productId).maybeSingle(); if (product.error || !product.data?.original_path) throw new Error("Produit ou original introuvable");
        const originalMime = product.data.original_path.endsWith(".png") ? "image/png" : product.data.original_path.endsWith(".webp") ? "image/webp" : "image/jpeg";
        const generated = await generateImage(await download(await token(service), product.data.original_path), originalMime, prompt), id = crypto.randomUUID(), root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, ""), ext = imageExtension(generated.mime);
        if (!root.startsWith("/")) throw new Error("Dossier Market Dropbox non configuré");
        const path = `${root}/products/${productId}/variants/${id}.${ext}`; await upload(await token(service), path, generated.bytes);
        const variant = await service.from("afriflow_market_variants").insert({ id, product_id: productId, storage_path: path, source: "ai", prompt, approval_status: "pending" }).select("id,approval_status").single(); if (variant.error) throw variant.error;
        await service.from("afriflow_market_variant_jobs").update({ status: "ready", error_message: null }).eq("id", job.data.id);
        return out(req, { job: job.data, variant: variant.data, generated: true, message: "Variante IA créée et placée en attente d'approbation." });
      } catch (generationError) {
        const message = generationError instanceof Error ? generationError.message : "Erreur de génération IA";
        await service.from("afriflow_market_variant_jobs").update({ status: "failed", error_message: message.slice(0, 500) }).eq("id", job.data.id);
        throw new Error(message);
      }
    }
    return out(req, { error: "Action non reconnue" }, 400);
  } catch (error) {
    console.error("afriflow-market-admin", error instanceof Error ? error.message : "error");
    return out(req, { error: error instanceof Error ? error.message : "Opération Market indisponible" }, 500);
  }
});
