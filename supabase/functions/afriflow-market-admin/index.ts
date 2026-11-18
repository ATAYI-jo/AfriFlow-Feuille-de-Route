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
const HORDE_API = "https://aihorde.net/api/v2";
const DEFAULT_AUTO_PROMPT = "Créer une mise en scène commerciale sobre et lumineuse autour du produit, avec un décor naturel et professionnel.";
function hordeHeaders() {
  /* The anonymous community key is intentionally used only when no private
     key is configured. It never reaches the browser. A dedicated free Horde
     key can later be added as AI_HORDE_API_KEY for a better queue priority. */
  return { "content-type": "application/json", apikey: Deno.env.get("AI_HORDE_API_KEY") || "0000000000", "Client-Agent": "AfriFloW:1.0:afriflow.info@gmail.com" };
}
function hordePrompt(instruction: string) {
  return ("Photographie e-commerce fidèle du produit fourni. Garde exactement le produit, son emballage, sa forme, ses couleurs, ses proportions, son logo et tout texte lisible. Ne change que le décor, la lumière et le cadrage. " + instruction + " ### produit déformé, emballage modifié, texte illisible, nouveau logo, nouveau produit, mains, personnes, watermark").slice(0, 2800);
}
async function temporaryLink(accessToken: string, path: string) {
  const response = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !/^https:\/\//i.test(String(data?.link || ""))) throw new Error("Original Dropbox indisponible pour la génération IA");
  return String(data.link);
}
async function startHorde(sourceImageUrl: string, instruction: string) {
  const response = await fetch(`${HORDE_API}/generate/async`, {
    method: "POST", headers: hordeHeaders(), signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      prompt: hordePrompt(instruction), source_image: sourceImageUrl, source_processing: "img2img", nsfw: false, censor_nsfw: true,
      params: { n: 1, width: 768, height: 768, steps: 20, cfg_scale: 5, sampler_name: "k_euler_a", denoising_strength: 0.16 },
      allow_downgrade: true, shared: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    const detail = String(data?.message || data?.error || "").replace(/[\r\n]+/g, " ").slice(0, 220);
    throw new Error(detail ? `AI Horde a refusé la génération : ${detail}` : "AI Horde ne peut pas lancer la génération pour le moment");
  }
  return String(data.id);
}
async function generatedImage(url: string) {
  if (!/^https:\/\//i.test(url)) throw new Error("AI Horde a renvoyé une image invalide");
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const mime = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!response.ok || !imageExtension(mime)) throw new Error("L’image générée est indisponible");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 9 * 1024 * 1024) throw new Error("L’image générée est trop volumineuse");
  return { bytes, mime };
}
async function createHordeJob(service: ReturnType<typeof createClient>, productId: string, requestedBy: string, prompt: string) {
  const product = await service.from("afriflow_market_products").select("id,original_path").eq("id", productId).maybeSingle();
  if (product.error || !product.data?.original_path) throw new Error("Produit ou original introuvable");
  const providerRequestId = await startHorde(await temporaryLink(await token(service), product.data.original_path), prompt);
  const job = await service.from("afriflow_market_variant_jobs").insert({ product_id: productId, requested_by: requestedBy, prompt, status: "queued", provider: "ai_horde", provider_request_id: providerRequestId }).select("id,status").single();
  if (job.error) throw job.error;
  return job.data;
}
async function refreshHordeJob(service: ReturnType<typeof createClient>, jobId: string) {
  const job = await service.from("afriflow_market_variant_jobs").select("id,product_id,prompt,status,provider,provider_request_id,completed_variant_id").eq("id", jobId).maybeSingle();
  if (job.error || !job.data) throw new Error("Demande IA introuvable");
  if (job.data.status === "ready" || job.data.status === "failed" || job.data.status === "configuration_missing") return { status: job.data.status, message: job.data.status === "ready" ? "Variante prête à examiner." : "Cette demande est terminée." };
  if (job.data.provider !== "ai_horde" || !job.data.provider_request_id) throw new Error("Demande IA incompatible");
  const response = await fetch(`${HORDE_API}/generate/status/${encodeURIComponent(job.data.provider_request_id)}`, { headers: hordeHeaders(), signal: AbortSignal.timeout(30000) });
  const status = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("AI Horde ne répond pas pour cette demande");
  if (!status?.done) {
    await service.from("afriflow_market_variant_jobs").update({ status: "processing", error_message: null }).eq("id", jobId);
    return { status: "processing", message: "Génération en cours." };
  }
  const generation = Array.isArray(status.generations) ? status.generations.find((item: { img?: unknown; censored?: boolean }) => typeof item?.img === "string" && !item.censored) : null;
  if (!generation?.img) {
    const message = "AI Horde n’a pas livré d’image exploitable.";
    await service.from("afriflow_market_variant_jobs").update({ status: "failed", error_message: message }).eq("id", jobId);
    return { status: "failed", message };
  }
  const image = await generatedImage(generation.img), id = crypto.randomUUID(), root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
  if (!root.startsWith("/")) throw new Error("Dossier Market Dropbox non configuré");
  const path = `${root}/products/${job.data.product_id}/variants/${id}.${imageExtension(image.mime)}`;
  await upload(await token(service), path, image.bytes);
  const variant = await service.from("afriflow_market_variants").insert({ id, product_id: job.data.product_id, storage_path: path, source: "ai", prompt: job.data.prompt, approval_status: "pending" }).select("id,approval_status").single();
  if (variant.error) throw variant.error;
  await service.from("afriflow_market_variant_jobs").update({ status: "ready", error_message: null, completed_variant_id: variant.data.id }).eq("id", jobId);
  return { status: "ready", variant: variant.data, message: "Variante IA prête à examiner." };
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
    if (action === "status") { const dropbox = await dropboxStatus(service); return out(req, { dropboxConfigured: true, dropboxConnected: dropbox.connected, dropboxMessage: dropbox.message, aiConfigured: true, aiMode: "ai_horde", aiAnonymous: !Deno.env.get("AI_HORDE_API_KEY") }); }
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
      const compareAtPrice = product.compareAtPrice === "" || product.compareAtPrice == null ? null : Number(product.compareAtPrice);
      const minimumOrderQuantity = product.minimumOrderQuantity === "" || product.minimumOrderQuantity == null ? null : Number(product.minimumOrderQuantity);
      const originCountry = text(product.originCountry, 80) || null, deliveryInfo = text(product.deliveryInfo, 160) || null, promotionLabel = text(product.promotionLabel, 40) || null;
      if (name.length < 2 || !Number.isFinite(price == null ? 0 : price) || (price != null && price < 0) || !Number.isFinite(compareAtPrice == null ? 0 : compareAtPrice) || (compareAtPrice != null && (price == null || compareAtPrice <= price)) || !Number.isInteger(minimumOrderQuantity == null ? 1 : minimumOrderQuantity) || (minimumOrderQuantity != null && minimumOrderQuantity < 1)) return out(req, { error: "Vérifiez le prix, l’ancien prix et la quantité minimale" }, 400);
      const mime = String(body.mime || ""), ext = imageExtension(mime); if (!ext) return out(req, { error: "Formats autorisés : JPG, PNG ou WebP" }, 400);
      const id = crypto.randomUUID(), root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
      if (!root.startsWith("/")) throw new Error("Dossier Market Dropbox non configuré");
      const path = `${root}/products/${id}/original.${ext}`, bytes = b64(body.data), accessToken = await token(service);
      await upload(accessToken, path, bytes);
      const inserted = await service.from("afriflow_market_products").insert({ id, name, description, category, price, compare_at_price: compareAtPrice, currency: text(product.currency, 3).toUpperCase() || "XOF", minimum_order_quantity: minimumOrderQuantity, origin_country: originCountry, delivery_info: deliveryInfo, promotion_label: promotionLabel, original_path: path, created_by: user.id, is_active: false }).select("id,name,is_active").single();
      if (inserted.error) throw inserted.error;
      let autoJob: { id: string; status: string } | null = null, autoNote = "";
      try { autoJob = await createHordeJob(service, id, user.id, DEFAULT_AUTO_PROMPT); autoNote = " Une variante IA est lancée automatiquement et restera à approuver."; }
      catch (generationError) { autoNote = " L’original est bien enregistré ; la variante automatique sera à relancer plus tard (AI Horde indisponible)."; console.error("afriflow-market-admin auto horde", generationError instanceof Error ? generationError.message : "error"); }
      return out(req, { product: inserted.data, autoJob, message: "Original enregistré dans Dropbox. Activez le produit après vérification." + autoNote });
    }
    if (action === "set_stock") {
      const productId = String(body.productId || ""), inStock = body.inStock;
      if (!isUuid(productId) || typeof inStock !== "boolean") return out(req, { error: "Statut de stock invalide" }, 400);
      const changed = await service.from("afriflow_market_products").update({ is_in_stock: inStock }).eq("id", productId).select("id,name,is_in_stock").single();
      if (changed.error || !changed.data) throw new Error("Impossible de mettre à jour le stock");
      return out(req, { product: changed.data, message: inStock ? "Produit remis en stock." : "Produit marqué en rupture : il reste visible mais ne peut plus recevoir de devis." });
    }
    if (action === "update_product") {
      const productId = String(body.productId || ""), product = body.product || {};
      if (!isUuid(productId)) return out(req, { error: "Produit invalide" }, 400);
      const name = text(product.name, 160), description = text(product.description, 4000), category = text(product.category, 80) || "Découvrir";
      const price = product.price === "" || product.price == null ? null : Number(product.price);
      const compareAtPrice = product.compareAtPrice === "" || product.compareAtPrice == null ? null : Number(product.compareAtPrice);
      const minimumOrderQuantity = product.minimumOrderQuantity === "" || product.minimumOrderQuantity == null ? null : Number(product.minimumOrderQuantity);
      const originCountry = text(product.originCountry, 80) || null, deliveryInfo = text(product.deliveryInfo, 160) || null, promotionLabel = text(product.promotionLabel, 40) || null;
      if (name.length < 2 || !Number.isFinite(price == null ? 0 : price) || (price != null && price < 0) || !Number.isFinite(compareAtPrice == null ? 0 : compareAtPrice) || (compareAtPrice != null && (price == null || compareAtPrice <= price)) || !Number.isInteger(minimumOrderQuantity == null ? 1 : minimumOrderQuantity) || (minimumOrderQuantity != null && minimumOrderQuantity < 1)) return out(req, { error: "Vérifiez le prix, l’ancien prix et la quantité minimale" }, 400);
      const changed = await service.from("afriflow_market_products").update({ name, description, category, price, compare_at_price: compareAtPrice, currency: text(product.currency, 3).toUpperCase() || "XOF", minimum_order_quantity: minimumOrderQuantity, origin_country: originCountry, delivery_info: deliveryInfo, promotion_label: promotionLabel }).eq("id", productId).select("id,name,is_active,is_in_stock").single();
      if (changed.error || !changed.data) throw new Error("Impossible de modifier le produit");
      return out(req, { product: changed.data, message: "Produit mis à jour." });
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
      try {
        const job = await createHordeJob(service, productId, user.id, prompt);
        return out(req, { job, generated: false, message: "Variante IA mise en file d’attente. Elle restera à approuver." });
      } catch (generationError) {
        const message = generationError instanceof Error ? generationError.message : "Erreur de génération IA";
        throw new Error(message);
      }
    }
    if (action === "poll_ai_variant") {
      const jobId = String(body.jobId || ""); if (!isUuid(jobId)) return out(req, { error: "Demande IA invalide" }, 400);
      try { return out(req, await refreshHordeJob(service, jobId)); }
      catch (generationError) {
        const message = generationError instanceof Error ? generationError.message : "Erreur de génération IA";
        await service.from("afriflow_market_variant_jobs").update({ status: "failed", error_message: message.slice(0, 500) }).eq("id", jobId);
        return out(req, { status: "failed", message }, 200);
      }
    }
    return out(req, { error: "Action non reconnue" }, 400);
  } catch (error) {
    console.error("afriflow-market-admin", error instanceof Error ? error.message : "error");
    return out(req, { error: error instanceof Error ? error.message : "Opération Market indisponible" }, 500);
  }
});
