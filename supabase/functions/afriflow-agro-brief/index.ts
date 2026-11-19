import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl = "https://jgvwdpzevghfavmpjbqp.supabase.co";
const topic = "Veille agroalimentaire";
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function clean(value: unknown, limit: number) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit); }
function today() { return new Date().toISOString().slice(0, 10); }
function asArray(value: unknown) { return Array.isArray(value) ? value : []; }
function bytesToB64(bytes: Uint8Array) { const chunks: string[] = []; for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000))); return btoa(chunks.join("")); }
function rawB64(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
function imageExtension(mime: string) { return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mime] || ""; }
async function cryptoKey() { const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")); return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]); }
async function dropboxRefresh(service: ReturnType<typeof createClient>) {
  const fallback = Deno.env.get("DROPBOX_REFRESH_TOKEN") || "";
  const stored = await service.from("afriflow_private_integrations").select("ciphertext,iv").eq("key", "dropbox_refresh_token").maybeSingle();
  if (stored.error || !stored.data) return fallback;
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: rawB64(stored.data.iv) }, await cryptoKey(), rawB64(stored.data.ciphertext))); } catch { return fallback; }
}
async function dropboxToken(service: ReturnType<typeof createClient>) {
  const refresh = await dropboxRefresh(service);
  if (!refresh) throw new Error("Dropbox non configuré pour les illustrations IA");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: "fabkaj1klaccpeg" });
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("Dropbox ne peut pas recevoir l’illustration IA");
  return String(data.access_token);
}
async function uploadDropbox(service: ReturnType<typeof createClient>, path: string, bytes: Uint8Array) {
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { Authorization: `Bearer ${await dropboxToken(service)}`, "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: false, mute: true }), "Content-Type": "application/octet-stream" }, body: bytes });
  if (!response.ok) throw new Error("Dropbox a refusé l’illustration IA");
}

async function authorize(req: Request, service: ReturnType<typeof createClient>) {
  const cronSecret = Deno.env.get("AFRIFLOW_AGRO_CRON_SECRET") || "";
  if (cronSecret && req.headers.get("x-afriflow-cron-secret") === cronSecret) return "cron";
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return "";
  const { data: { user }, error } = await service.auth.getUser(token);
  if (error || !user?.email || !user.email_confirmed_at) return "";
  const admin = await service.from("afriflow_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  return admin.data ? "admin" : "";
}

async function gdeltArticles() {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", "(agroalimentaire OR agriculture OR \"food security\" OR \"food prices\" OR agri-food)");
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "8");
  url.searchParams.set("timespan", "1d");
  url.searchParams.set("sort", "DateDesc");
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "AfriFloW-agro-brief/1.0" } });
  if (!response.ok) throw new Error("Les sources d’actualité sont indisponibles");
  const data = await response.json().catch(() => ({}));
  const dedupe = new Set<string>();
  return asArray(data.articles).map((article: Record<string, unknown>) => {
    const link = clean(article.url, 1500), title = clean(article.title, 280), domain = clean(article.domain, 140), date = clean(article.seendate, 40);
    return { title, url: link, domain, date };
  }).filter((article: { title: string; url: string }) => {
    if (!article.title || !/^https:\/\//.test(article.url) || dedupe.has(article.url)) return false;
    dedupe.add(article.url); return true;
  }).slice(0, 5);
}

function stripHtml(value: string) {
  return clean(value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), 280);
}

async function googleNewsArticles() {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", 'agroalimentaire OR agriculture OR "sécurité alimentaire"');
  url.searchParams.set("hl", "fr");
  url.searchParams.set("gl", "FR");
  url.searchParams.set("ceid", "FR:fr");
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "AfriFloW-agro-brief/1.0" } });
  if (!response.ok) return [];
  const xml = await response.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const dedupe = new Set<string>();
  return items.map((item) => {
    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
    const title = stripHtml(titleMatch?.[1] || titleMatch?.[2] || "");
    const link = clean(item.match(/<link>([\s\S]*?)<\/link/)?.[1], 1500);
    const domain = clean(item.match(/<source[^>]*>([\s\S]*?)<\/source/)?.[1], 140) || "Google News";
    const date = clean(item.match(/<pubDate>([\s\S]*?)<\/pubDate/)?.[1], 40);
    return { title, url: link, domain, date };
  }).filter((article) => {
    if (!article.title || !/^https:\/\//.test(article.url) || dedupe.has(article.url)) return false;
    dedupe.add(article.url); return true;
  }).slice(0, 5);
}

async function faoNewsArticles() {
  const response = await fetch("https://www.fao.org/feeds/fao-newsroom-rss", {
    signal: AbortSignal.timeout(7000),
    headers: { "User-Agent": "AfriFloW-agro-brief/1.0" }
  });
  if (!response.ok) return [];
  const xml = await response.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const dedupe = new Set<string>();
  return items.map((item) => {
    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
    const title = stripHtml(titleMatch?.[1] || titleMatch?.[2] || "");
    const link = clean(item.match(/<link>([\s\S]*?)<\/link/)?.[1], 1500);
    const date = clean(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1], 40);
    return { title, url: link, domain: "FAO", date };
  }).filter((article) => {
    if (!article.title || !/^https:\/\//.test(article.url) || dedupe.has(article.url)) return false;
    dedupe.add(article.url); return true;
  }).slice(0, 5);
}

async function recentArticles() {
  const requireArticles = async (loader: () => Promise<Array<{ title: string; url: string; domain: string; date: string }>>) => {
    const articles = await loader();
    if (!articles.length) throw new Error("Aucune actualité exploitable");
    return articles;
  };
  try {
    return await Promise.any([
      requireArticles(gdeltArticles),
      requireArticles(googleNewsArticles),
      requireArticles(faoNewsArticles)
    ]);
  } catch {
    return [];
  }
}
function stableAgroReference() {
  return [{ title: "À savoir : les indices internationaux des prix alimentaires sont publiés mensuellement", url: "https://www.fao.org/worldfoodsituation/foodpricesindex", domain: "FAO", date: today() }];
}

async function writeBrief(apiKey: string, sources: Array<{ title: string; url: string; domain: string; date: string }>) {
  const model = clean(Deno.env.get("GEMINI_AGRO_MODEL") || "gemini-3.8-flash", 80);
  const prompt = [
    "Tu es le rédacteur de veille d’AfriFloW. Rédige en français un bref bulletin factuel pour des actionnaires, basé EXCLUSIVEMENT sur les titres et métadonnées ci-dessous.",
    "Ne prétends jamais avoir lu les articles. Ne donne ni conseil financier, ni prix, ni chiffre qui n’est pas fourni. Si les sources sont insuffisantes, réponds avec un titre prudent et une synthèse qui le dit.",
    "Réponds strictement en JSON valide : {\"title\":\"...\",\"description\":\"...\"}. title: 45 à 140 caractères. description: 350 à 1200 caractères, une synthèse claire qui cite les domaines sources entre parenthèses.",
    JSON.stringify(sources)
  ].join("\n\n");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(6000),
    body: JSON.stringify({ model, input: prompt, store: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(clean(data?.error?.message, 240) || "Gemini ne peut pas rédiger le bulletin");
  const outputStep = asArray(data?.steps).find((step: Record<string, unknown>) => step?.type === "model_output") as Record<string, unknown> | undefined;
  const outputContent = asArray(outputStep?.content)[0] as Record<string, unknown> | undefined;
  const raw = clean(data?.output_text || data?.interaction?.output_text || outputContent?.text, 5000).replace(/^```json\s*|\s*```$/g, "");
  let brief: Record<string, unknown> = {};
  try { brief = JSON.parse(raw); } catch { throw new Error("Réponse IA invalide"); }
  const title = clean(brief.title, 160), description = clean(brief.description, 4000);
  if (title.length < 20 || description.length < 180) throw new Error("Bulletin IA trop court");
  return { title, description };
}

function sourceBrief(sources: Array<{ title: string; url: string; domain: string; date: string }>) {
  const lead = sources[0];
  const domains = [...new Set(sources.map((source) => source.domain).filter(Boolean))].slice(0, 4).join(", ");
  const related = sources.slice(1, 3).map((source) => source.title).filter(Boolean).join(" · ");
  return {
    title: clean(lead?.title || "Veille agroalimentaire : signaux du jour", 160),
    description: clean(`Point de veille AfriFloW préparé à partir de sources récentes. Sujet principal : ${lead?.title || "actualité agroalimentaire"}. ${related ? `Autres signaux suivis : ${related}. ` : ""}Cette publication est informative et ne constitue ni un conseil financier ni une cotation de marché. Sources répertoriées : ${domains || "sources spécialisées"}.`, 4000)
  };
}

/* The daily bulletin is editorial content, not a product photograph: its
   illustration is automatically published, with a strict no-text/no-logo
   prompt so it cannot fabricate a branded package or a factual claim. */
async function createBriefIllustration(service: ReturnType<typeof createClient>, day: string, title: string, description: string) {
  const key = Deno.env.get("GEMINI_IMAGE_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
  const provider = String(Deno.env.get("AFRIFLOW_IMAGE_PROVIDER") || "").toLowerCase();
  if (!key || (provider && provider !== "gemini")) return null;
  const model = clean(Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-lite-image-preview", 100);
  const prompt = [
    "Créer une illustration éditoriale premium pour une actualité agroalimentaire africaine.",
    "Style : photographie de magazine, lumière naturelle, composition verticale ou carrée, ingrédients ou produits alimentaires finis réalistes, couleurs AfriFloW vert profond, orange chaud et or discret.",
    "Ne montrer aucun emballage de marque, aucun logo, aucun texte, aucun prix, aucune personne identifiable, aucune carte, aucun graphique. Ne pas inventer de fait précis.",
    `Sujet : ${clean(title, 180)}. Contexte : ${clean(description, 800)}`
  ].join("\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(clean(data?.error?.message, 220) || "Gemini Image indisponible");
  const parts = asArray(data?.candidates?.[0]?.content?.parts) as Array<Record<string, unknown>>;
  const item = parts.find((part) => typeof (part.inlineData as Record<string, unknown> | undefined)?.data === "string");
  const inline = item?.inlineData as Record<string, unknown> | undefined, mime = clean(inline?.mimeType, 80).toLowerCase();
  if (!inline?.data || !imageExtension(mime)) throw new Error("Gemini Image n’a pas renvoyé d’illustration utilisable");
  const bytes = rawB64(String(inline.data));
  if (!bytes.byteLength || bytes.byteLength > 9 * 1024 * 1024) throw new Error("Illustration IA invalide");
  const root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
  if (!root.startsWith("/")) throw new Error("Dossier Market Dropbox non configuré");
  const path = `${root}/news/${day}/${crypto.randomUUID()}.${imageExtension(mime)}`;
  await uploadDropbox(service, path, bytes);
  return path;
}
async function openverseIllustration(service: ReturnType<typeof createClient>, day: string, title: string) {
  const url = new URL("https://api.openverse.org/v1/images");
  url.searchParams.set("q", `${clean(title, 120)} agriculture food`);
  url.searchParams.set("license", "cc0,pdm");
  url.searchParams.set("mature", "false");
  url.searchParams.set("page_size", "6");
  const search = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "AfriFloW-news/1.0" } });
  const data = await search.json().catch(() => ({}));
  const candidate = asArray(data?.results).find((item: Record<string, unknown>) => /^https:\/\//.test(String(item?.url || "")) && /image\/(jpeg|png|webp)/i.test(String(item?.filetype || "image/jpeg"))) as Record<string, unknown> | undefined;
  if (!search.ok || !candidate) throw new Error("Aucune illustration libre exploitable");
  const image = await fetch(String(candidate.url), { signal: AbortSignal.timeout(8000) });
  const mime = clean(image.headers.get("content-type"), 80).split(";")[0].toLowerCase();
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!image.ok || !imageExtension(mime) || !bytes.byteLength || bytes.byteLength > 9 * 1024 * 1024) throw new Error("Illustration libre indisponible");
  const root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
  if (!root.startsWith("/")) throw new Error("Dossier Market Dropbox non configuré");
  const path = `${root}/news/${day}/${crypto.randomUUID()}.${imageExtension(mime)}`;
  await uploadDropbox(service, path, bytes);
  return { path, attribution: clean(candidate.attribution || `${candidate.creator || "Auteur inconnu"} · ${candidate.license || "licence ouverte"}`, 500), url: clean(candidate.foreign_landing_url || candidate.url, 1500) };
}

async function publishDailyBrief(service: ReturnType<typeof createClient>, day: string) {
    await service.from("afriflow_market_products").update({ is_active: false }).eq("listing_type", "announcement").eq("audience", "shareholders").lt("expires_at", new Date().toISOString());
    const existing = await service.from("afriflow_market_products").select("id,name,expires_at").eq("listing_type", "announcement").eq("audience", "shareholders").eq("promotion_label", `Brief IA · ${day}`).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { skipped: true, brief: existing.data };
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
    if (!apiKey) throw new Error("GEMINI_API_KEY doit être configurée côté serveur avant la publication automatique.");
    const liveSources = await recentArticles();
    const sources = liveSources.length ? liveSources : stableAgroReference();
    let brief: { title: string; description: string };
    try { brief = await writeBrief(apiKey, sources); }
    catch (error) { console.error("afriflow-agro-brief writing", error instanceof Error ? error.message : "error"); brief = sourceBrief(sources); }
    const inserted = await service.from("afriflow_market_products").insert({
      name: brief.title, description: brief.description, category: topic, listing_type: "announcement", price: null, currency: "XOF", original_path: null,
      is_active: true, is_in_stock: false, audience: "shareholders", expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      promotion_label: `Brief IA · ${day}`, news_sources: sources
    }).select("id,name,expires_at").single();
    if (inserted.error) throw inserted.error;
    /* The article exists even if image generation fails; readers never lose the
       daily brief because a visual provider is slow or temporarily unavailable. */
    try {
      const illustration = await createBriefIllustration(service, day, brief.title, brief.description);
      if (illustration) {
        const imageUpdate = await service.from("afriflow_market_products").update({ original_path: illustration }).eq("id", inserted.data.id);
        if (imageUpdate.error) throw imageUpdate.error;
      }
    } catch (error) {
      console.error("afriflow-agro-brief image", error instanceof Error ? error.message : "error");
      try {
        const open = await openverseIllustration(service, day, brief.title);
        const update = await service.from("afriflow_market_products").update({ original_path: open.path, description: `${brief.description}\n\nIllustration libre : ${open.attribution}`, news_sources: { articles: sources, image_attribution: open } }).eq("id", inserted.data.id);
        if (update.error) throw update.error;
      } catch (fallbackError) { console.error("afriflow-agro-brief open image", fallbackError instanceof Error ? fallbackError.message : "error"); }
    }
  return { brief: inserted.data, sourceCount: sources.length };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode interdite" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const actor = await authorize(req, service);
  if (!actor) return json({ error: "Accès non autorisé" }, 401);
  const day = today();
  try {
    const result = await publishDailyBrief(service, day);
    return json({ ok: true, result, message: result.skipped ? "Le bulletin du jour existe déjà." : "Bulletin du jour publié." });
  } catch (error) {
    console.error("afriflow-agro-brief", error instanceof Error ? error.message : "error");
    return json({ error: "Le bulletin n’a pas été publié : " + clean(error instanceof Error ? error.message : "erreur", 240) }, 502);
  }
});

