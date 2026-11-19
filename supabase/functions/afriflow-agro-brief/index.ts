import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl = "https://jgvwdpzevghfavmpjbqp.supabase.co";
const topic = "Veille agroalimentaire";
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function clean(value: unknown, limit: number) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit); }
function today() { return new Date().toISOString().slice(0, 10); }
function asArray(value: unknown) { return Array.isArray(value) ? value : []; }

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

async function recentArticles() {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", "(agroalimentaire OR agriculture OR \"food security\" OR \"food prices\" OR agri-food)");
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "8");
  url.searchParams.set("timespan", "1d");
  url.searchParams.set("sort", "DateDesc");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "AfriFloW-agro-brief/1.0" } });
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

async function writeBrief(apiKey: string, sources: Array<{ title: string; url: string; domain: string; date: string }>) {
  const model = clean(Deno.env.get("GEMINI_AGRO_MODEL") || "gemini-2.0-flash", 80);
  const prompt = [
    "Tu es le rédacteur de veille d’AfriFloW. Rédige en français un bref bulletin factuel pour des actionnaires, basé EXCLUSIVEMENT sur les titres et métadonnées ci-dessous.",
    "Ne prétends jamais avoir lu les articles. Ne donne ni conseil financier, ni prix, ni chiffre qui n’est pas fourni. Si les sources sont insuffisantes, réponds avec un titre prudent et une synthèse qui le dit.",
    "Réponds strictement en JSON valide : {\"title\":\"...\",\"description\":\"...\"}. title: 45 à 140 caractères. description: 350 à 1200 caractères, une synthèse claire qui cite les domaines sources entre parenthèses.",
    JSON.stringify(sources)
  ].join("\n\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, responseMimeType: "application/json" } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(clean(data?.error?.message, 240) || "Gemini ne peut pas rédiger le bulletin");
  const raw = clean(data?.candidates?.[0]?.content?.parts?.[0]?.text, 5000).replace(/^```json\s*|\s*```$/g, "");
  let brief: Record<string, unknown> = {};
  try { brief = JSON.parse(raw); } catch { throw new Error("Réponse IA invalide"); }
  const title = clean(brief.title, 160), description = clean(brief.description, 4000);
  if (title.length < 20 || description.length < 180) throw new Error("Bulletin IA trop court");
  return { title, description };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode interdite" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const actor = await authorize(req, service);
  if (!actor) return json({ error: "Accès non autorisé" }, 401);
  const day = today();
  try {
    await service.from("afriflow_market_products").update({ is_active: false }).eq("listing_type", "announcement").eq("audience", "shareholders").lt("expires_at", new Date().toISOString());
    const existing = await service.from("afriflow_market_products").select("id,name,expires_at").eq("listing_type", "announcement").eq("audience", "shareholders").eq("promotion_label", `Brief IA · ${day}`).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return json({ ok: true, skipped: true, brief: existing.data, message: "Le bulletin du jour existe déjà." });
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
    if (!apiKey) return json({ error: "GEMINI_API_KEY doit être configurée côté serveur avant la publication automatique." }, 503);
    const sources = await recentArticles();
    if (sources.length < 2) return json({ error: "Pas assez de sources récentes pour publier un bulletin fiable." }, 503);
    const brief = await writeBrief(apiKey, sources);
    const inserted = await service.from("afriflow_market_products").insert({
      name: brief.title, description: brief.description, category: topic, listing_type: "announcement", price: null, currency: "XOF", original_path: null,
      is_active: true, is_in_stock: false, audience: "shareholders", expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      promotion_label: `Brief IA · ${day}`, news_sources: sources
    }).select("id,name,expires_at").single();
    if (inserted.error) throw inserted.error;
    return json({ ok: true, brief: inserted.data, sourceCount: sources.length, message: "Brief agroalimentaire publié pour les actionnaires." });
  } catch (error) {
    console.error("afriflow-agro-brief", error instanceof Error ? error.message : "error");
    return json({ error: error instanceof Error ? error.message : "Publication automatique indisponible" }, 503);
  }
});
