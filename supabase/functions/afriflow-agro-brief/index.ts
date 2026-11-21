import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl = "https://jgvwdpzevghfavmpjbqp.supabase.co";
const topic = "Actualités mondiales";
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
  url.searchParams.set("q", 'actualités internationales économie diplomatie technologie climat');
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
    "Tu es le rédacteur des actualités mondiales d’AfriFloW. Rédige un bulletin factuel, neutre et entièrement en français pour tous les membres, basé EXCLUSIVEMENT sur le titre principal et les métadonnées ci-dessous.",
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
  const source = sources[0];
  return {
    title: "Actualité mondiale : information à consulter auprès de la source",
    description: clean("Une nouvelle information internationale a été publiée par " + (source?.domain || "une source d’actualité") + ". AfriFloW propose de consulter directement l’article original pour connaître les faits et leur contexte. La rédaction automatique de la synthèse n’a pas abouti ; aucun contenu non vérifié n’a été ajouté.",4000)
  };
}

async function frenchBriefFallback(sources: Array<{ title: string; url: string; domain: string; date: string }>) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
  if (!token || !account) return sourceBrief(sources);
  try {
    const model = "@cf/meta/llama-3.1-8b-instruct";
    const prompt = [
      "Rédige en français un titre (max 160 caractères) et une brève synthèse (max 1000 caractères) de cette actualité internationale pour AfriFloW.",
      "Utilise STRICTEMENT les titres et métadonnées de la liste. Tu ne connais pas le contenu des articles. Ne crée aucun chiffre, fait, citation ou événement non mentionné. Traduis les titres anglais en français. Ne donne pas de conseil financier.",
      "Réponds uniquement avec un objet JSON valide ayant les deux propriétés title et description. N'inclus aucun Markdown.",
      JSON.stringify(sources.slice(0, 5))
    ].join("\n");
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 380 }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error("Rédaction Cloudflare indisponible");
    const output = String(data.result?.response || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const obj = JSON.parse(output);
    const title = clean(obj.title, 160), description = clean(obj.description, 1200);
    if (title.length < 20 || description.length < 120) throw new Error("Bulletin trop court");
    return { title, description };
  } catch (error) {
    console.error("afriflow-agro-brief french fallback", error instanceof Error ? error.message : "error");
    return sourceBrief(sources);
  }
}

/* The daily bulletin is editorial content, not a product photograph: its
   illustration is automatically published, with a strict no-text/no-logo
   prompt so it cannot fabricate a branded package or a factual claim. */
async function createBriefIllustration(service: ReturnType<typeof createClient>, day: string, title: string, description: string) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
  if (!token || !account) throw new Error("Secrets Cloudflare manquants");
  const model = clean(Deno.env.get("CLOUDFLARE_IMAGE_MODEL") || "@cf/black-forest-labs/flux-1-schnell", 120);
  if (!/^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(model)) throw new Error("Modèle Cloudflare invalide");
  const prompt = [
    "High-quality editorial photograph illustrating this specific world-news headline accurately, without asserting visual facts about real people or events.",
    "Neutral professional newsroom photography, coherent subjects and scenery, natural light and realistic details. Avoid generic agriculture imagery unless the news is agricultural.",
    "AfriFloW deep green and warm orange accents. No text, no logos, no branded packaging, no fake data chart, no recognizable real people.",
    `News headline: ${clean(title, 160)}. Context: ${clean(description, 650)}`
  ].join("\n").slice(0, 2048);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, steps: 4 }), signal: AbortSignal.timeout(30000) }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false || typeof result.result?.image !== "string") {
    throw new Error(`Cloudflare image: ${clean(result.errors?.[0]?.message || response.status, 180)}`);
  }
  const bytes = rawB64(result.result.image);
  if (!bytes.byteLength || bytes.byteLength > 9 * 1024 * 1024) throw new Error("Illustration Cloudflare invalide");
  const root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
  if (!root.startsWith("/")) throw new Error("Dossier Dropbox Market non configuré");
  const path = `${root}/news/${day}/${crypto.randomUUID()}.jpg`;
  await uploadDropbox(service, path, bytes);
  return path;
}
/* Original publisher images can only be copied when the feed explicitly
   provides an image-specific CC0/public-domain declaration. Source photos without
   this evidence (including most FAO newsroom photographs) are not redistributed. */
async function licensedSourceIllustration(service: ReturnType<typeof createClient>, day: string, sources: unknown) {
  const list = Array.isArray(sources) ? sources : (sources as Record<string, unknown>)?.articles;
  for (const source of asArray(list) as Array<Record<string, unknown>>) {
    const imageUrl = clean(source.image_url, 1600), license = clean(source.image_license, 200).toLowerCase();
    if (!/^https:\/\//i.test(imageUrl) || !/^(cc0|pdm|public-domain|https:\/\/creativecommons\.org\/(?:publicdomain\/zero|publicdomain\/mark)\/)/i.test(license)) continue;
    try {
      const url = new URL(imageUrl);
      if (!["https:"].includes(url.protocol) || url.username || url.password) continue;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
      const mime = clean(response.headers.get("content-type"), 100).split(";")[0].toLowerCase();
      const contentSize = Number(response.headers.get("content-length") || 0);
      if (!response.ok || !imageExtension(mime) || contentSize > 9 * 1024 * 1024) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength || bytes.byteLength > 9 * 1024 * 1024) continue;
      const root = (Deno.env.get("DROPBOX_MARKET_ROOT") || `${Deno.env.get("DROPBOX_ROOT") || ""}/Market`).replace(/\/+$/, "");
      if (!root.startsWith("/")) throw new Error("Dossier Dropbox Market non configuré");
      const path = `${root}/news/${day}/${crypto.randomUUID()}.${imageExtension(mime)}`;
      await uploadDropbox(service, path, bytes);
      return { path, attribution: clean(source.image_attribution || source.domain || "Source originale", 500),
        url: clean(source.url, 1500), image_url: imageUrl, license };
    } catch (error) {
      console.error("afriflow-agro-brief licensed source image", error instanceof Error ? error.message : "error");
    }
  }
  return null;
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
async function attachBriefIllustration(service: ReturnType<typeof createClient>, id: string, day: string, title: string, description: string, sources: unknown) {
  // A publisher-provided photo takes priority only if its *image* is explicitly
  // labelled CC0/public domain; other photos require the rights holder's permission.
  const original = await licensedSourceIllustration(service, day, sources);
  if (original) {
    const update = await service.from("afriflow_market_products").update({
      original_path: original.path,
      description: `${description}\n\nPhotographie : ${original.attribution}`,
      news_sources: { articles: Array.isArray(sources) ? sources : (sources as Record<string, unknown>)?.articles || [], image_attribution: original }
    }).eq("id", id);
    if (!update.error) return "source";
    console.error("afriflow-agro-brief source image database", update.error.message);
  }
  /* Otherwise prefer a reusable CC0/public-domain photograph from Openverse;
     Cloudflare AI generates an editorial illustration only when those fail. */
  if (/agric|aliment|farm|harvest|mangue|cajou|food|r[eé]colte/i.test(title)) try {
    const open = await openverseIllustration(service, day, title);
    const update = await service.from("afriflow_market_products").update({ original_path: open.path, description: `${description}\n\nIllustration libre : ${open.attribution}`, news_sources: { articles: sources, image_attribution: open } }).eq("id", id);
    if (update.error) throw update.error;
    return "openverse";
  } catch (openError) {
    console.error("afriflow-agro-brief open image", openError instanceof Error ? openError.message : "error");
  }
  try {
    const illustration = await createBriefIllustration(service, day, title, description);
    if (!illustration) throw new Error("Aucun générateur d’image configuré");
    const update = await service.from("afriflow_market_products").update({ original_path: illustration }).eq("id", id);
    if (update.error) throw update.error;
    return "cloudflare";
  } catch (imageError) {
    console.error("afriflow-agro-brief image", imageError instanceof Error ? imageError.message : "error");
    return null;
  }
}

/* Three global-news slots per UTC day. One item per slot, with a stable
   unique label; concurrent retries can never create duplicate editions. */
const slots = ["morning","afternoon","evening"] as const;
type NewsSlot = typeof slots[number];
const queries: Record<NewsSlot,string> = {
  morning: "(international OR monde) (diplomatie OR économie OR géopolitique)",
  afternoon: "(monde OR international) (technologie OR climat OR santé OR science)",
  evening: "(international OR monde) (commerce OR transports OR énergie OR Afrique)"
};
function relevantToAfriFlow(title:string) {
  const text = title.toLocaleLowerCase("fr");
  return /afrique|africain|togo|bénin|burkina|c[eé]d[eé]ao|commerce|export|import|douane|logist|transport|portuaire|fret|agric|alimentaire|approvisionnement|cha[iî]ne d.approvisionnement|cajou|mangue|march[eé] mondial|inflation|taux de change|investissement|entreprise|pme/.test(text);
}
async function worldArticles(slot: NewsSlot) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q",queries[slot]+" when:2d");
  url.searchParams.set("hl","fr");url.searchParams.set("gl","FR");url.searchParams.set("ceid","FR:fr");
  const response=await fetch(url,{signal:AbortSignal.timeout(9000),headers:{"User-Agent":"AfriFloW-world-news/1.0"}});
  if(!response.ok) throw new Error("Fil d’actualités indisponible");
  const xml=await response.text();
  const items=xml.match(/<item>[\s\S]*?<\/item>/g)||[];
  const result=items.map((item)=>{
    const t=item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
    return {title:stripHtml(t?.[1]||t?.[2]||""),
      url:clean(item.match(/<link>([\s\S]*?)<\/link>/)?.[1],1500),
      domain:stripHtml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]||"Presse"),
      date:clean(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1],60)};
  });
  const seen=new Set<string>();
  return result.filter(a=>{
    if(!a.title||!/^https:\/\//.test(a.url)||seen.has(a.url))return false;
    const date=Date.parse(a.date);
    if(!Number.isFinite(date)||Date.now()-date>48*60*60*1000||date>Date.now()+15*60*1000)return false;
    seen.add(a.url);return true;
  }).slice(0,18);
}
async function publishDailyBrief(service: ReturnType<typeof createClient>, day:string, slot:NewsSlot) {
  await service.from("afriflow_market_products").update({is_active:false})
    .eq("listing_type","announcement").in("category",["Veille agroalimentaire","Actualités mondiales"])
    .lt("expires_at",new Date().toISOString());
  const label=`Brief IA · ${day} · ${slot}`;
  const existing=await service.from("afriflow_market_products")
    .select("id,name,original_path").eq("listing_type","announcement")
    .eq("category","Actualités mondiales").eq("promotion_label",label).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data)return {skipped:true,brief:existing.data};
  const candidates=await worldArticles(slot);
  if(!candidates.length)throw new Error("Aucune information récente et sourcée : publication suspendue");
  const recent=await service.from("afriflow_market_products").select("news_sources")
    .eq("listing_type","announcement").in("category",["Veille agroalimentaire","Actualités mondiales"])
    .gte("created_at",new Date(Date.now()-3*24*60*60*1000).toISOString()).limit(100);
  if(recent.error)throw recent.error;
  const already=new Set<string>();
  for(const item of recent.data||[]) {
    const raw=item.news_sources;
    const sources=Array.isArray(raw)?raw:Array.isArray(raw?.articles)?raw.articles:[];
    if(sources[0]?.url)already.add(String(sources[0].url));
  }
  const lead=candidates.find(a=>!already.has(a.url));
  if(!lead)throw new Error("Aucun nouvel article distinct : pas de doublon publié");
  const sources=[lead,...candidates.filter(a=>a.url!==lead.url).slice(0,3)];
  let brief:{title:string;description:string};
  const apiKey=Deno.env.get("GEMINI_API_KEY")||"";
  try { if(!apiKey)throw new Error("Rédaction Gemini indisponible"); brief=await writeBrief(apiKey,sources); }
  catch(error) { console.error("afriflow-world-news writing",error instanceof Error?error.message:"error");brief=await frenchBriefFallback(sources); }
  const isRelevant=relevantToAfriFlow(lead.title);
  const inserted=await service.from("afriflow_market_products").insert({
    name:brief.title,description:brief.description,category:topic,
    listing_type:"announcement",price:null,currency:"XOF",original_path:null,
    is_active:true,is_in_stock:false,audience:"shareholders",news_relevance:isRelevant,
    expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString(),
    promotion_label:label,news_sources:sources
  }).select("id,name,expires_at").single();
  if(inserted.error) {
    if(inserted.error.code==="23505")return {skipped:true};
    throw inserted.error;
  }
  await attachBriefIllustration(service,inserted.data.id,day,brief.title,brief.description,sources);
  return {brief:inserted.data,sourceCount:sources.length,relevant:isRelevant,slot};
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
    const body=await req.json().catch(()=>({}));
    const slot=String(body?.slot||"");
    if(!slots.includes(slot as NewsSlot))return json({error:"Créneau invalide"},400);
    const result=await publishDailyBrief(service,day,slot as NewsSlot);
    return json({ ok: true, result, message: result.skipped ? "Le bulletin du jour existe déjà." : "Bulletin du jour publié." });
  } catch (error) {
    console.error("afriflow-agro-brief", error instanceof Error ? error.message : "error");
    return json({ error: "Le bulletin n’a pas été publié : " + clean(error instanceof Error ? error.message : "erreur", 240) }, 502);
  }
});

