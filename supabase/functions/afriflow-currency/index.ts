import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set(["https://afriflow.pages.dev","https://afriflow-africa.onrender.com", "https://atayi-jo.github.io"]);
/* XOF and XAF are pegged to the euro.  Keeping that relationship explicit
   avoids presenting an invented conversion when a product is priced in FCFA. */
const currencies = new Set(["XOF", "XAF", "EUR", "USD", "GBP", "CHF", "CAD", "CNY", "JPY", "ZAR"]);
const euroPeg: Record<string, number> = { XOF: 1 / 655.957, XAF: 1 / 655.957 };
function headers(req: Request) {
  const configured = (Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const allowed = (configured.length ? new Set(configured) : origins).has(origin) ? origin : "";
  return { ...(allowed ? { "Access-Control-Allow-Origin": allowed, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" };
}
function reply(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function code(value: unknown) { const result = String(value || "").toUpperCase(); return currencies.has(result) ? result : ""; }
async function frankfurterRate(base: string, quote: string) {
  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Taux indisponible");
  const data = await response.json(), rate = Number(data.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Taux invalide");
  return { rate, date: data.date || new Date().toISOString().slice(0, 10) };
}
async function exchangeRate(base: string, quote: string) {
  if (base === quote) return { rate: 1, date: new Date().toISOString().slice(0, 10), source: "fixed" };
  const sourcePeg = euroPeg[base], targetPeg = euroPeg[quote];
  if (sourcePeg) {
    if (quote === "EUR") return { rate: sourcePeg, date: new Date().toISOString().slice(0, 10), source: "EUR peg" };
    const live = await frankfurterRate("EUR", quote);
    return { rate: sourcePeg * live.rate, date: live.date, source: "EUR peg + Frankfurter" };
  }
  if (targetPeg) {
    if (base === "EUR") return { rate: 1 / targetPeg, date: new Date().toISOString().slice(0, 10), source: "EUR peg" };
    const live = await frankfurterRate(base, "EUR");
    return { rate: live.rate / targetPeg, date: live.date, source: "Frankfurter + EUR peg" };
  }
  const live = await frankfurterRate(base, quote);
  return { rate: live.rate, date: live.date, source: "Frankfurter" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return reply(req, { error: "Méthode interdite" }, 405);
  if (req.headers.get("origin") && !headers(req)["Access-Control-Allow-Origin"]) return reply(req, { error: "Origine non autorisée" }, 403);
  try {
    const body = await req.json().catch(() => ({}));
    const quote = code(body.currency);
    if (!quote) return reply(req, { error: "Devise non prise en charge" }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const day = new Date().toISOString().slice(0, 10), bases = ["XOF", "XAF", "EUR", "USD", "GBP", "CHF", "CAD", "CNY", "JPY", "ZAR"], rates: Record<string, number> = {};
    await Promise.all(bases.map(async (base) => {
      if (base === quote) { rates[base] = 1; return; }
      const key = `pub:fx:${day}:${base}:${quote}`;
      const stored = await service.from("afriflow_state").select("value").eq("key", key).maybeSingle();
      const saved = Number(stored.data?.value?.rate);
      if (!stored.error && Number.isFinite(saved) && saved > 0) { rates[base] = saved; return; }
      const result = await exchangeRate(base, quote);
      rates[base] = result.rate;
      await service.from("afriflow_state").upsert({ key, value: { rate: result.rate, date: result.date || day, source: result.source }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    }));
    return reply(req, { ok: true, currency: quote, rates, source: "Frankfurter", updatedAt: day, estimate: true });
  } catch (error) {
    console.error("afriflow-currency", error instanceof Error ? error.message : "error");
    return reply(req, { error: "Taux de change indisponible" }, 503);
  }
});
