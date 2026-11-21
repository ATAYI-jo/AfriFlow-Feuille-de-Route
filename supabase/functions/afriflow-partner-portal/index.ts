import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set(["https://afriflow-africa.onrender.com", "https://atayi-jo.github.io"]);
function headers(req: Request) {
  const configured = (Deno.env.get("AFRIFLOW_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const allowed = (configured.length ? new Set(configured) : origins).has(origin) ? origin : "";
  return { ...(allowed ? { "Access-Control-Allow-Origin": allowed, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
}
function reply(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function text(value: unknown, length: number) { return String(value ?? "").trim().slice(0, length); }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function positiveInteger(value: unknown) { const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= 1000000 ? n : null; }
function money(value: unknown) { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 999999999999 ? Math.round(n * 100) / 100 : null; }

async function notifyAdmins(service: ReturnType<typeof createClient>, subject: string, body: string, urgent: boolean) {
  const { data: admins, error } = await service.from("afriflow_admins").select("email");
  if (error) throw new Error("Alerte AfriFloW indisponible");
  const token = crypto.randomUUID(), now = new Date().toISOString();
  const rows = (admins || []).map((admin) => ({ key: `msg:${String(admin.email).toLowerCase()}:${token}`, value: { from: "partenaire@afriflow", fromName: "Portail partenaire", to: String(admin.email).toLowerCase(), subject, body, urgent, read: false, ts: Date.now() }, updated_at: now }));
  if (rows.length) { const sent = await service.from("afriflow_state").insert(rows); if (sent.error) throw new Error("Opération enregistrée, mais alerte indisponible"); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return reply(req, { error: "Méthode interdite" }, 405);
  if (req.headers.get("origin") && !headers(req)["Access-Control-Allow-Origin"]) return reply(req, { error: "Origine non autorisée" }, 403);
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply(req, { error: "Connexion requise" }, 401);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await service.auth.getUser(token);
    if (userError || !user?.id || !user.email || !user.email_confirmed_at) return reply(req, { error: "Session invalide" }, 401);
    const body = await req.json(); const action = text(body.action, 40);
    const { data: adminRow } = await service.from("afriflow_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    const isAdmin = Boolean(adminRow);
    const { data: profile } = await service.from("afriflow_market_profiles").select("requested_role,access_mode").eq("user_id", user.id).maybeSingle();
    const isPartner = profile?.requested_role === "partner";
    const isApprovedPartner = isPartner && profile?.access_mode === "partner_approved";

    if (action === "dashboard") {
      if (!isApprovedPartner) return reply(req, { error: "Votre espace partenaire attend une approbation d’AfriFloW." }, 403);
      const [terms, products, orders, reports] = await Promise.all([
        service.from("afriflow_partner_terms").select("commission_rate,is_enabled,payment_notes").eq("partner_user_id", user.id).maybeSingle(),
        service.from("afriflow_market_products").select("id,name,category,description,price,currency,minimum_order_quantity,is_in_stock").eq("listing_type", "product").eq("is_active", true).eq("is_in_stock", true).order("created_at", { ascending: false }).limit(100),
        service.from("afriflow_partner_orders").select("id,product_id,quantity_requested,unit_price,currency,status,note,created_at,product:afriflow_market_products(name)").eq("partner_user_id", user.id).order("created_at", { ascending: false }).limit(100),
        service.from("afriflow_partner_sales_reports").select("id,order_id,product_id,quantity_sold,unit_sale_price,gross_amount,commission_rate,afriflow_amount,partner_net_amount,currency,status,note,created_at,product:afriflow_market_products(name)").eq("partner_user_id", user.id).order("created_at", { ascending: false }).limit(100)
      ]);
      const failure = [terms, products, orders, reports].find((result) => result.error);
      if (failure?.error) throw new Error("Chargement du portail partenaire indisponible");
      return reply(req, { ok: true, enabled: Boolean(terms.data?.is_enabled), terms: terms.data || { commission_rate: 0, payment_notes: "" }, products: products.data || [], orders: orders.data || [], reports: reports.data || [] });
    }

    if (action === "request_order") {
      if (!isApprovedPartner) return reply(req, { error: "Votre espace partenaire attend une approbation d’AfriFloW." }, 403);
      const { data: terms } = await service.from("afriflow_partner_terms").select("is_enabled").eq("partner_user_id", user.id).maybeSingle();
      if (!terms?.is_enabled) return reply(req, { error: "Votre partenariat attend encore l’activation d’AfriFloW." }, 403);
      const productId = text(body.productId, 36), quantity = positiveInteger(body.quantity), note = text(body.note, 1200);
      if (!uuid(productId) || !quantity) return reply(req, { error: "Produit ou quantité invalide" }, 400);
      const { data: product } = await service.from("afriflow_market_products").select("id,name,price,currency,minimum_order_quantity,is_active,is_in_stock,listing_type").eq("id", productId).maybeSingle();
      if (!product?.is_active || !product.is_in_stock || product.listing_type !== "product") return reply(req, { error: "Ce produit n’est plus disponible." }, 409);
      if (product.minimum_order_quantity && quantity < product.minimum_order_quantity) return reply(req, { error: `Quantité minimale : ${product.minimum_order_quantity} unités.` }, 400);
      const saved = await service.from("afriflow_partner_orders").insert({ partner_user_id: user.id, product_id: product.id, quantity_requested: quantity, unit_price: product.price, currency: product.currency, note }).select("id").single();
      if (saved.error) throw new Error("Impossible d’enregistrer la demande produit");
      await notifyAdmins(service, `Partenaire · demande de ${quantity} unités`, `Partenaire : ${user.email}\nProduit : ${product.name}\nQuantité demandée : ${quantity}\nNote : ${note || "Aucune"}`, false);
      return reply(req, { ok: true, message: "Demande envoyée à AfriFloW. Elle apparaîtra dans votre suivi dès validation." });
    }

    if (action === "report_sale") {
      if (!isApprovedPartner) return reply(req, { error: "Votre espace partenaire attend une approbation d’AfriFloW." }, 403);
      const { data: terms } = await service.from("afriflow_partner_terms").select("commission_rate,is_enabled").eq("partner_user_id", user.id).maybeSingle();
      if (!terms?.is_enabled) return reply(req, { error: "Votre partenariat attend encore l’activation d’AfriFloW." }, 403);
      const orderId = text(body.orderId, 36), quantity = positiveInteger(body.quantity), price = money(body.unitSalePrice), note = text(body.note, 1200);
      if (!uuid(orderId) || !quantity || price === null) return reply(req, { error: "Déclaration de vente invalide" }, 400);
      const { data: order } = await service.from("afriflow_partner_orders").select("id,product_id,quantity_requested,currency,status,product:afriflow_market_products(name)").eq("id", orderId).eq("partner_user_id", user.id).maybeSingle();
      if (!order || !["approved", "supplied"].includes(order.status)) return reply(req, { error: "Cette allocation n’est pas encore prête à la vente." }, 409);
      const { data: previous, error: previousError } = await service.from("afriflow_partner_sales_reports").select("quantity_sold").eq("order_id", order.id).in("status", ["pending_review", "validated", "settled"]);
      if (previousError) throw new Error("Impossible de contrôler les quantités déclarées");
      const alreadySold = (previous || []).reduce((sum, row) => sum + Number(row.quantity_sold || 0), 0);
      if (alreadySold + quantity > order.quantity_requested) return reply(req, { error: `Vous pouvez déclarer au maximum ${order.quantity_requested - alreadySold} unité(s) sur cette allocation.` }, 400);
      const gross = Math.round(quantity * price * 100) / 100;
      const afriflowAmount = Math.round(gross * Number(terms.commission_rate) / 100 * 100) / 100;
      const partnerNet = Math.round((gross - afriflowAmount) * 100) / 100;
      const saved = await service.from("afriflow_partner_sales_reports").insert({ partner_user_id: user.id, order_id: order.id, product_id: order.product_id, quantity_sold: quantity, unit_sale_price: price, gross_amount: gross, commission_rate: terms.commission_rate, afriflow_amount: afriflowAmount, partner_net_amount: partnerNet, currency: order.currency, note }).select("id").single();
      if (saved.error) throw new Error("Impossible d’enregistrer la vente");
      const productName = Array.isArray(order.product) ? order.product[0]?.name : order.product?.name;
      await notifyAdmins(service, `Urgent · vente partenaire déclarée`, `Partenaire : ${user.email}\nProduit : ${productName || "Produit"}\nVendu : ${quantity} unité(s)\nChiffre d’affaires : ${gross} ${order.currency}\nPart AfriFloW (${terms.commission_rate} %) : ${afriflowAmount} ${order.currency}\nNet partenaire : ${partnerNet} ${order.currency}\nNote : ${note || "Aucune"}`, true);
      return reply(req, { ok: true, calculation: { gross, afriflowAmount, partnerNet, commissionRate: Number(terms.commission_rate), currency: order.currency }, message: "Vente déclarée. AfriFloW a reçu l’alerte urgente." });
    }

    if (action === "admin_dashboard") {
      if (!isAdmin) return reply(req, { error: "Administration requise" }, 403);
      const [profiles, shareholders, terms, orders, reports] = await Promise.all([
        service.from("afriflow_market_profiles").select("user_id,created_at").eq("requested_role", "partner").order("created_at", { ascending: false }).limit(200),
        service.from("afriflow_market_profiles").select("user_id,access_mode,created_at").eq("requested_role", "shareholder").order("created_at", { ascending: false }).limit(200),
        service.from("afriflow_partner_terms").select("partner_user_id,commission_rate,is_enabled,payment_notes,updated_at"),
        service.from("afriflow_partner_orders").select("id,partner_user_id,product_id,quantity_requested,unit_price,currency,status,note,created_at,product:afriflow_market_products(name)").order("created_at", { ascending: false }).limit(200),
        service.from("afriflow_partner_sales_reports").select("id,partner_user_id,order_id,quantity_sold,gross_amount,commission_rate,afriflow_amount,partner_net_amount,currency,status,created_at,product:afriflow_market_products(name)").order("created_at", { ascending: false }).limit(200)
      ]);
      const failure = [profiles, shareholders, terms, orders, reports].find((result) => result.error); if (failure?.error) throw new Error("Chargement de l’administration partenaire indisponible");
      const users = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const emails: Record<string, string> = {}; (users.data?.users || []).forEach((entry) => { emails[entry.id] = entry.email || "Partenaire"; });
      return reply(req, { ok: true, partners: (profiles.data || []).map((partner) => ({ ...partner, email: emails[partner.user_id] || "Partenaire", terms: (terms.data || []).find((term) => term.partner_user_id === partner.user_id) || null })), shareholders: (shareholders.data || []).map((shareholder) => ({ ...shareholder, email: emails[shareholder.user_id] || "Actionnaire" })), orders: orders.data || [], reports: reports.data || [] });
    }

    if (action === "admin_save_partner") {
      if (!isAdmin) return reply(req, { error: "Administration requise" }, 403);
      const partnerId = text(body.partnerId, 36), rate = money(body.commissionRate), enabled = Boolean(body.enabled), paymentNotes = text(body.paymentNotes, 1200);
      if (!uuid(partnerId) || rate === null || rate > 100) return reply(req, { error: "Réglage partenaire invalide" }, 400);
      const { data: partner } = await service.from("afriflow_market_profiles").select("user_id").eq("user_id", partnerId).eq("requested_role", "partner").maybeSingle();
      if (!partner) return reply(req, { error: "Partenaire introuvable" }, 404);
      const saved = await service.from("afriflow_partner_terms").upsert({ partner_user_id: partnerId, commission_rate: rate, is_enabled: enabled, payment_notes: paymentNotes }, { onConflict: "partner_user_id" });
      if (saved.error) throw new Error("Impossible d’enregistrer les conditions du partenaire");
      // Status controlled by verified administrator through the service-role client.
      const status = await service.from("afriflow_market_profiles")
        .update({ access_mode: enabled ? "partner_approved" : "partner_waiting" })
        .eq("user_id", partnerId).eq("requested_role", "partner");
      if (status.error) throw new Error("Conditions enregistrées, mais statut d’approbation non synchronisé");
      return reply(req, { ok: true, message: enabled ? "Partenaire approuvé : son portail est activé." : "Partenaire mis en attente." });
    }

    if (action === "admin_approve_shareholder") {
      if (!isAdmin) return reply(req, { error: "Administration requise" }, 403);
      const shareholderId = text(body.shareholderId, 36);
      if (!uuid(shareholderId)) return reply(req, { error: "Actionnaire invalide" }, 400);
      const { data: shareholder } = await service.from("afriflow_market_profiles").select("user_id,requested_role,access_mode").eq("user_id", shareholderId).maybeSingle();
      if (!shareholder || shareholder.requested_role !== "shareholder") return reply(req, { error: "Actionnaire introuvable" }, 404);
      const saved = await service.from("afriflow_market_profiles").update({ access_mode: "shareholder_approved" }).eq("user_id", shareholderId);
      if (saved.error) throw new Error("Impossible de valider l’actionnaire");
      await notifyAdmins(service, "Actionnaire validé", "Une demande d’accès actionnaire a été validée par un administrateur AfriFloW.", false);
      return reply(req, { ok: true, message: "Actionnaire validé. Son espace actionnaire pourra désormais être ouvert." });
    }

    if (action === "admin_set_order_status") {
      if (!isAdmin) return reply(req, { error: "Administration requise" }, 403);
      const id = text(body.orderId, 36), status = text(body.status, 20);
      if (!uuid(id) || !["requested", "approved", "supplied", "rejected", "closed"].includes(status)) return reply(req, { error: "Statut de demande invalide" }, 400);
      const saved = await service.from("afriflow_partner_orders").update({ status }).eq("id", id);
      if (saved.error) throw new Error("Mise à jour impossible"); return reply(req, { ok: true });
    }
    if (action === "admin_set_report_status") {
      if (!isAdmin) return reply(req, { error: "Administration requise" }, 403);
      const id = text(body.reportId, 36), status = text(body.status, 20);
      if (!uuid(id) || !["pending_review", "validated", "settled", "rejected"].includes(status)) return reply(req, { error: "Statut de vente invalide" }, 400);
      const saved = await service.from("afriflow_partner_sales_reports").update({ status }).eq("id", id);
      if (saved.error) throw new Error("Mise à jour impossible"); return reply(req, { ok: true });
    }
    return reply(req, { error: "Action inconnue" }, 400);
  } catch (error) {
    console.error("afriflow-partner-portal", error instanceof Error ? error.message : "error");
    return reply(req, { error: error instanceof Error ? error.message : "Portail partenaire indisponible" }, 500);
  }
});
