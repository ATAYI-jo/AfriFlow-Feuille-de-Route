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
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "AfriFlow-agro-brief/1.0" } });
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
  url.searchParams.set("q", 'Afrique (économie OR innovation OR entrepreneuriat OR diplomatie OR climat) when:2d');
  url.searchParams.set("hl", "fr");
  url.searchParams.set("gl", "FR");
  url.searchParams.set("ceid", "FR:fr");
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "AfriFlow-agro-brief/1.0" } });
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
    headers: { "User-Agent": "AfriFlow-agro-brief/1.0" }
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


function articleTextFromMarkup(html: string) {
  const decode = (input: string) => input.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#x27);/gi, (key) =>
    ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#39;": "'", "&#x27;": "'" } as Record<string,string>)[key.toLowerCase()] || " ");
  const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
  const desc = metadata.find(tag => /(?:name|property)=["'](?:description|og:description)["']/i.test(tag));
  const description = desc ? decode(desc.match(/content=["']([^"']{100,2000})["']/i)?.[1] || "") : "";
  let articleBody = "";
  for(const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const json = JSON.parse(block[1]);
      const flat = Array.isArray(json) ? json : Array.isArray(json?.["@graph"]) ? json["@graph"] : [json];
      const found = flat.find((node:Record<string,unknown>) => typeof node?.articleBody === "string") as Record<string,unknown> | undefined;
      if(found) { articleBody=String(found.articleBody);break; }
    } catch {}
  }
  const article=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "";
  const paragraphs=[...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m=>decode(m[1].replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim())
    .filter(t=>t.length>65 && !/cookie|newsletter|abonnez-vous|share this|subscribe/i.test(t))
    .slice(0,25).join(" ");
  return clean(articleBody || paragraphs || description, 7000);
}
async function fetchSourceArticle(source:{url:string;title:string;domain:string;date:string}) {
  const url=new URL(source.url);
  const allowed=["france24.com","bbc.com","bbc.co.uk","theguardian.com","news.un.org","reuters.com","apnews.com","rfi.fr"];
  if(url.protocol!=="https:" || url.username || url.password ||
    !allowed.some(host=>url.hostname===host || url.hostname.endsWith("."+host))) return "";
  try {
    const res=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:"error",
      headers:{"Accept":"text/html","User-Agent":"AfriFlow-news-editor/1.0"}});
    if(!res.ok || !/text\/html/i.test(res.headers.get("content-type")||""))return "";
    const html=(await res.text()).slice(0,350000);
    return articleTextFromMarkup(html);
  } catch(e) {
    console.error("afriflow-world-news source unavailable",source.domain,e instanceof Error?e.message:"error");return "";
  }
}

async function writeBrief(apiKey: string, sources: Array<{ title: string; url: string; domain: string; date: string }>, articleText: string) {
  const model = clean(Deno.env.get("GEMINI_AGRO_MODEL") || "gemini-3.8-flash", 80);
  const prompt = [
    "Tu es journaliste de synthèse pour AfriFlow. Rédige un texte informatif approfondi en français fondé exclusivement sur le contenu vérifié ci-dessous, sans prétendre avoir lu ce qui manque.",
    "Priorité à l’actualité des pays africains, à leur économie, leurs entreprises, leurs innovations, leurs échanges et leurs enjeux régionaux lorsque les sources le documentent. Explique les faits, le contexte et les acteurs sans ajouter de liens avec l’Afrique non attestés. Attribue les prises de position et ne transforme jamais une accusation ou un débat en fait établi. Aucun fait ou chiffre inventé.",
    "Réponds strictement en JSON valide : {\"title\":\"...\",\"description\":\"...\"}. title: 45 à 140 caractères. description: 750 à 2200 caractères, 3 à 5 paragraphes informatifs et structurés en texte simple.",
    JSON.stringify(sources.slice(0,2)),
    "Contenu vérifiable de l’article principal : "+articleText.slice(0,6500)
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
  const title = clean(brief.title, 160), description = String(brief.description || "").trim().slice(0,4000);
  if (title.length < 20 || description.length < 450) throw new Error("Synthèse IA trop courte");
  return { title, description };
}

function sourceBrief(sources: Array<{ title: string; url: string; domain: string; date: string }>) {
  const lead = sources[0];
  const title=clean(lead?.title || "Actualité africaine : consulter la source",160);
  const domain=clean(lead?.domain || "une source journalistique",100);
  return {
    title,
    description: clean("Actualité relayée par " + domain + " : « " + title + " ». AfriFlow présente ce sujet à partir du titre et des métadonnées de la publication d’origine. Aucun détail supplémentaire n’est affirmé sans vérification du texte complet. Consultez l’article source pour comprendre les faits et leur contexte.",4000)
  };
}

async function frenchBriefFallback(sources: Array<{ title: string; url: string; domain: string; date: string }>, articleText: string) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
  if (!token || !account) return sourceBrief(sources);
  try {
    const model = "@cf/meta/llama-3.1-8b-instruct";
    const prompt = [
      "Rédige en français un titre (max 160 caractères) et une synthèse journalistique détaillée (entre 650 et 1600 caractères) de cette actualité pour AfriFlow.",
      "Utilise STRICTEMENT le contenu vérifiable fourni sur l’Afrique. Explique faits, contexte, acteurs et enjeux ; privilégie les dimensions économiques, entrepreneuriales et régionales uniquement si elles sont documentées. Attribue les propos. Ne transforme aucune question en affirmation et n’invente rien.",
      "Réponds uniquement avec un objet JSON valide ayant les deux propriétés title et description. N'inclus aucun Markdown.",
      JSON.stringify(sources.slice(0, 2)),
      "Contenu vérifiable : "+articleText.slice(0,6000)
    ].join("\n");
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 950 }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error("Rédaction Cloudflare indisponible");
    const raw = data.result?.response ?? data.result?.output ?? "";
    const output = typeof raw === "string" ? raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim() : "";
    const obj = (raw && typeof raw === "object" && !Array.isArray(raw))
      ? raw : JSON.parse(output);
    const title = clean(obj.title, 160), description = String(obj.description || "").trim().slice(0,2200);
    if (title.length < 20 || description.length < 400) throw new Error("Synthèse insuffisante");
    return { title, description };
  } catch (error) {
    console.error("afriflow-agro-brief french fallback", error instanceof Error ? error.message : "error");
    throw new Error("Impossible de rédiger une synthèse détaillée fiable");
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
    "Professional conceptual editorial illustration directly matching the supplied international-news topic. Do NOT depict a real event or assert a photographed scene.",
    "For geopolitical/military/diplomatic news, depict abstract diplomacy: a conference table, empty chairs, restrained European blue and amber accents, subtle documentary graphics. NO battle scenes, alleged military activities, weapons, real people or invented flags. For other stories, represent their actual subject rather than agriculture.",
    "No captions, no typography, no invented insignia, no logos, no fake data charts. Clearly illustrative rather than misleading photojournalism.",
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
  const search = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "AfriFlow-news/1.0" } });
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
  morning: "Afrique économie commerce régional investissements coopération",
  afternoon: "Afrique innovation numérique climat santé recherche",
  evening: "Afrique industrie entrepreneuriat logistique agriculture énergie"
};
// Broad African coverage across francophone and anglophone regions.
// General-purpose feeds are eligible only when a headline explicitly concerns Africa.
const africaTitle = /afri(c|qu)|maghreb|sahel|c[eé]d[eé]ao|uemoa|[ée]gypte|maroc|alg[eé]rie|tunisie|libye|soudan|[ée]thiop|[ée]rythr[eé]e|somal|djibouti|s[eé]n[eé]gal|mauritan|mali|niger|burkina|guin[eé]e|c[oô]te d.ivoire|ivoirien|ghana|togo|b[eé]nin|nig[eé]ria|cameroun|tchad|gabon|congo|rdc|r[eé]publique centrafricaine|rwanda|burundi|ouganda|uganda|kenya|tanzanie|mozamb|zambie|zimbabwe|angola|namibie|botswana|eswatini|malawi|madagascar|seychelles|maurice|cap.vert|gambie|liberia|sierra leone|afcon|can 2027/i;
function relevantToAfriFlow(title:string) {
  return /commerce|export|import|douane|logist|transport|portuaire|fret|agric|alimentaire|approvisionnement|cajou|mangue|march[eé]|inflation|change|invest|entreprise|pme|startup|start.up|num[eé]ri|finance|banque|[ée]nerg|industrie|emploi|innovation/i.test(title);
}
async function worldArticles(slot: NewsSlot) {
  // African desk sources first. The other feeds only supplement with articles
  // explicitly identified as African by their title, never generic world news.
  const africa = [
    {url:"https://www.rfi.fr/fr/afrique/rss",domain:"RFI Afrique"},
    {url:"https://feeds.bbci.co.uk/news/world/africa/rss.xml",domain:"BBC Afrique"}
  ];
  const feeds:Record<NewsSlot,Array<{url:string;domain:string}>> = {
    morning:[...africa,{url:"https://www.france24.com/fr/rss",domain:"France 24"}],
    afternoon:[...africa,{url:"https://feeds.bbci.co.uk/news/technology/rss.xml",domain:"BBC News"}],
    evening:[...africa,{url:"https://feeds.bbci.co.uk/news/business/rss.xml",domain:"BBC News"}]
  };
  const results=await Promise.allSettled(feeds[slot].map(async(feed)=>{
    const response=await fetch(feed.url,{signal:AbortSignal.timeout(8500),
      headers:{"User-Agent":"AfriFlow-WorldNews/1.0","Accept":"application/rss+xml, application/xml, text/xml"}});
    if(!response.ok)throw new Error(feed.domain+": "+response.status);
    const xml=await response.text();
    const items=xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
    return items.map(item=>{
      const titleTag=item.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]||"";
      const title=stripHtml(titleTag.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/,"$1"));
      const linkRaw=item.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i)?.[1]||"";
      const url=clean(linkRaw.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/,"$1").replace(/&amp;/g,"&"),1500);
      const date=clean(item.match(/<(?:pubDate|dc:date)>([\s\S]*?)<\/(?:pubDate|dc:date)>/i)?.[1],70);
      return {title,url,domain:feed.domain,date};
    });
  }));
  const all=results.flatMap((result)=>result.status==="fulfilled"?result.value:[]);
  const seen=new Set<string>();
  const recent=all.filter(article=>{
    if(!article.title||!/^https:\/\//.test(article.url)||seen.has(article.url)||/\?$/.test(article.title)||/\/videos?\/|\/émissions\/|%c3%a9missions|\/opinion\//i.test(article.url))return false;
    const date=Date.parse(article.date);
    if(!Number.isFinite(date)||Date.now()-date>72*60*60*1000||date>Date.now()+15*60*1000)return false;
    seen.add(article.url);return true;
  });
  // Only Africa-focused dispatches: do not fill an empty slot with unrelated
  // European, American or global headlines.
  const african = recent.filter(article =>
    article.domain === "RFI Afrique" || article.domain === "BBC Afrique" || africaTitle.test(article.title));
  if(!african.length)throw new Error("Aucune actualité africaine récente provenant des sources vérifiées");
  const patterns:Record<NewsSlot,RegExp>={
    morning:/diplomat|économ|gover|politic|politique|international|sommet|conflit|accord|peace|minister|présiden|presiden|economy|trade|world|guerre/i,
    afternoon:/tech|science|climat|climate|environnement|environment|santé|health|recherch|innovation|numéri|digital|intelligenc|énerg|space|spatial/i,
    evening:/business|entreprise|marché|market|inflation|commerce|trade|transport|logist|industrie|économ|econom|invest|banque|bank|afrique|africa|energy|énergie/i
  };
  return african.sort((a,b)=>{
    const score=(x:typeof a)=>
      (patterns[slot].test(x.title)?100:0)+(relevantToAfriFlow(x.title)?75:0)
      +(x.domain==="RFI Afrique"||x.domain==="BBC Afrique"?40:0)
      +(Number.isFinite(Date.parse(x.date))?Date.parse(x.date)/1e13:0);
    return score(b)-score(a);
  }).slice(0,20);
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
  // RSS alone is not enough to assert the facts. Try distinct headlines until
  // an actual article provides sufficient verifiable content.
  let lead:typeof candidates[number]|undefined, bodyText="";
  for(const candidate of candidates.filter(a=>!already.has(a.url)).slice(0,8)) {
    const article=await fetchSourceArticle(candidate);
    if(article.length>=350){lead=candidate;bodyText=article;break;}
  }
  if(!lead)throw new Error("Aucun nouvel article africain avec texte vérifiable suffisant : publication suspendue");
  const sources=[lead,...candidates.filter(a=>a.url!==lead.url).slice(0,3)];
  const sourceContext=bodyText.slice(0,6500);
  let brief:{title:string;description:string};
  const apiKey=Deno.env.get("GEMINI_API_KEY")||"";
  try { if(!apiKey)throw new Error("Rédaction Gemini indisponible"); brief=await writeBrief(apiKey,sources,sourceContext); }
  catch(error) { console.error("afriflow-world-news writing",error instanceof Error?error.message:"error");brief=await frenchBriefFallback(sources,sourceContext); }
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
    // Admin-only or cron-protected editorial repair for an existing world-news image.
    if(body?.action==="regenerate_image") {
      const id=String(body?.article_id||"");
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        return json({error:"Identifiant invalide"},400);
      const record=await service.from("afriflow_market_products")
        .select("id,name,description,category,listing_type,is_active")
        .eq("id",id).maybeSingle();
      if(record.error)throw record.error;
      if(!record.data || record.data.category!=="Actualités mondiales" ||
        record.data.listing_type!=="announcement" || !record.data.is_active)
        return json({error:"Article introuvable"},404);
      const path=await createBriefIllustration(service,day,record.data.name,record.data.description);
      const update=await service.from("afriflow_market_products").update({original_path:path}).eq("id",id);
      if(update.error)throw update.error;
      return json({ok:true,article_id:id,image_updated:true});
    }
    const slot=String(body?.slot||"");
    if(!slots.includes(slot as NewsSlot))return json({error:"Créneau invalide"},400);
    const result=await publishDailyBrief(service,day,slot as NewsSlot);
    return json({ ok: true, result, message: result.skipped ? "Le bulletin du jour existe déjà." : "Bulletin du jour publié." });
  } catch (error) {
    console.error("afriflow-agro-brief", error instanceof Error ? error.message : "error");
    return json({ error: "Le bulletin n’a pas été publié : " + clean(error instanceof Error ? error.message : "erreur", 240) }, 502);
  }
});

