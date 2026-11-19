/* AfriFloW Market — place de marché publique (mise en page inspirée d'Alibaba). */
(function () {
  "use strict";
  var DEF_TITLE = "AfriFloW – De l’Afrique vers le monde", HERO_KEY = "pub:markethero", HERO_LS = "afriflow_markethero_v1", EXT = ["jpg", "jpeg", "webp", "png"];
  function readHeroLocal() { try { return JSON.parse(localStorage.getItem(HERO_LS) || "{}") || {}; } catch (error) { return {}; } }
  /* Le bandeau est toujours repris depuis le serveur : aucune ancienne image locale ne réapparaît au rechargement. */
  var state = { products: [], adminProducts: [], category: "", term: "", context: { kind: "public" }, timers: [], heroTimer: null, rotationTimer: null, rotationStep: 0, heroIdx: 0, imgs: {}, imgErr: {}, hero: {}, aiPolling: {}, partner: null, partnerAdmin: null, cart: [], favorites: [] };

  function el(id) { return document.getElementById(id); }
  function loadStored(key, fallback) { try { var value = JSON.parse(localStorage.getItem(key) || ""); return Array.isArray(value) ? value : fallback; } catch (error) { return fallback; } }
  function persistShop() { try { localStorage.setItem("afriflow_market_cart_v1", JSON.stringify(state.cart)); localStorage.setItem("afriflow_market_favorites_v1", JSON.stringify(state.favorites)); } catch (error) {} }
  state.cart = loadStored("afriflow_market_cart_v1", []); state.favorites = loadStored("afriflow_market_favorites_v1", []);
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function sb() { return window.__sb; }
  function isAdmin() { return window.USER_ROLE === "admin"; }
  function notice(message) { if (window.toast) window.toast(message); else window.alert(message); }
  function okImg(d) { return typeof d === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(d); }
  function formatPrice(value, currency) {
    if (value == null || value === "") return "Sur demande";
    try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "XOF", maximumFractionDigits: 2 }).format(Number(value)); }
    catch (error) { return Number(value).toLocaleString("fr-FR") + " " + (currency || "XOF"); }
  }
  function discountPercent(product) {
    var current = Number(product.price), previous = Number(product.compare_at_price);
    return Number.isFinite(current) && Number.isFinite(previous) && previous > current ? Math.round((1 - current / previous) * 100) : 0;
  }
  function salesFacts(product) {
    var facts = [];
    if (Number(product.minimum_order_quantity) > 1) facts.push("Minimum : " + Number(product.minimum_order_quantity) + " unités");
    if (product.origin_country) facts.push("Origine : " + product.origin_country);
    if (product.delivery_info) facts.push(product.delivery_info);
    return facts;
  }
  function inStock(product) { return product.is_in_stock !== false; }
  function isAnnouncement(product) { return product && product.listing_type === "announcement"; }
  function titleHtml(text) { return esc(text || DEF_TITLE).replace(/(Afri)(Flo[wW])/, "$1<span>$2</span>"); }
  function roleMode(profile) { return profile && profile.access_mode || "client"; }
  function shouldUseMarket(profile) { return ["client", "shareholder_pending", "partner_waiting"].indexOf(roleMode(profile)) > -1; }
  function productById(id) { return state.products.filter(function (p) { return p.id === id; })[0] || state.adminProducts.filter(function (p) { return p.id === id; })[0]; }

  function hideWorkspace() {
    document.body.classList.add("af-market-mode");
    var auth = el("auth-screen"); if (auth) auth.classList.add("off");
  }
  function showWorkspace() {
    document.body.classList.remove("af-market-mode");
    var box = el("market-view"); if (box) box.innerHTML = "";
  }
  function clearTimers() { state.timers.forEach(function (t) { clearTimeout(t); }); state.timers = []; if (state.rotationTimer) { clearInterval(state.rotationTimer); state.rotationTimer = null; } clearHero(); }
  function clearHero() { if (state.heroTimer) { clearInterval(state.heroTimer); state.heroTimer = null; } }
  function open(context) {
    state.context = context || { kind: "public" }; hideWorkspace(); render();
    if (roleMode(state.context.market) === "partner_waiting") { loadPartnerPortal(); return; }
    loadHero(); loadCatalog();
  }
  function openPublic() { open({ kind: "public", market: { access_mode: "public" } }); }
  function closeToWorkspace() {
    clearTimers(); showWorkspace();
    var home = document.querySelector('#navList .nv[data-id="home"]');
    if (home) home.click();
  }
  function openAuth(mode) {
    var auth = el("auth-screen"); if (!auth) return;
    if (window.setAuthMode) window.setAuthMode(mode || "login");
    document.body.classList.add("af-auth-open");
    auth.classList.remove("off");
  }
  function closeAuth() { var auth = el("auth-screen"); if (auth) auth.classList.add("off"); document.body.classList.remove("af-auth-open"); }
  function categoryList() { var seen = {}; state.products.forEach(function (product) { if (product.category) seen[product.category] = true; }); return Object.keys(seen).sort(); }
  function filteredProducts() {
    var term = state.term.trim().toLocaleLowerCase("fr");
    return state.products.filter(function (product) {
      if (isAnnouncement(product)) return false;
      return (!state.category || product.category === state.category) && (!term || [product.name, product.description, product.category].join(" ").toLocaleLowerCase("fr").indexOf(term) > -1);
    });
  }

  /* ---------- Images : Dropbox (fonction serveur) puis dossier products/ du site ---------- */
  function slug(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function probe(url) { return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(true); }; i.onerror = function () { ok(false); }; i.src = url; }); }
  async function staticImage(p) {
    var names = [slug(p.name), p.id].filter(Boolean);
    for (var n = 0; n < names.length; n++) for (var e = 0; e < EXT.length; e++) {
      var url = "products/" + names[n] + "." + EXT[e];
      if (await probe(url)) return url;
    }
    return "";
  }
  async function resolveImage(p, rotation) {
    if (sb()) {
      try {
        var r = await sb().functions.invoke("afriflow-market-media", { body: { productId: p.id, rotation: rotation || 0 } });
        if (!r.error && r.data && r.data.url) { delete state.imgErr[p.id]; return r.data.url; }
        state.imgErr[p.id] = r.error ? String(r.error.message || r.error) : "aucune image trouvée dans Dropbox";
      } catch (error) { state.imgErr[p.id] = String(error && error.message || error); }
    }
    var fallback = await staticImage(p);
    if (fallback) delete state.imgErr[p.id];
    else if (isAdmin()) console.warn("Image du produit « " + p.name + " » introuvable :", state.imgErr[p.id]);
    return fallback;
  }
  function fallbackHtml(p) {
    var hint = isAdmin() && state.imgErr[p.id] ? '<small class="af-fb-hint">Photo non chargée (visible par vous seul) : ' + esc(state.imgErr[p.id]) + "</small>" : "";
    return '<span class="af-market-fallback"><img class="af-fb-logo" src="logo.png" alt=""><em>' + esc(p.name) + "</em>" + hint + "</span>";
  }
  function media(p) { var u = state.imgs[p.id]; return u ? '<img class="af-photo" src="' + esc(u) + '" alt="' + esc(p.name) + '">' : fallbackHtml(p); }
  function fitMedia(box, image) {
    if (!box || !image || !image.naturalWidth || !image.naturalHeight) return;
    var ratio = Math.max(0.62, Math.min(1.75, image.naturalWidth / image.naturalHeight));
    box.style.setProperty("--media-ratio", ratio.toFixed(3));
  }
  function applyImage(id, url) {
    state.imgs[id] = url;
    document.querySelectorAll('[data-market-hero="' + id + '"]').forEach(function (slide) {
      var next = "url('" + String(url).replace(/'/g, "%27") + "')", previous = slide.style.getPropertyValue("--slide-img");
      if (previous && previous !== next && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        slide.style.setProperty("--previous-slide-img", previous);
        slide.classList.add("af-image-crossfade");
        slide.style.setProperty("--slide-img", next);
        requestAnimationFrame(function () { requestAnimationFrame(function () { slide.classList.remove("af-image-crossfade"); }); });
      } else slide.style.setProperty("--slide-img", next);
      slide.classList.add("has-image");
    });
    document.querySelectorAll('[data-market-image="' + id + '"]').forEach(function (box) {
      var cur = box.querySelector("img.af-photo");
      if (cur) { cur.onload = function () { fitMedia(box, cur); }; if (cur.getAttribute("src") !== url) cur.src = url; else fitMedia(box, cur); return; }
      var im = new Image(); im.className = "af-photo"; im.alt = box.dataset.alt || "Produit AfriFloW"; im.src = url;
      im.onload = function () { if (!box.isConnected) return; fitMedia(box, im); box.querySelectorAll(".af-market-fallback").forEach(function (n) { n.remove(); }); box.insertBefore(im, box.firstChild); };
    });
  }
  function loadInitialImages() {
    /* Only load the first visible cards. Loading every Dropbox link repeatedly
       made a large catalogue perform needless requests on every ten-second turn. */
    state.products.slice(0, 8).forEach(function (p) {
      if (state.imgs[p.id]) return;
      resolveImage(p, 0).then(function (url) { if (url) applyImage(p.id, url); else { var b = document.querySelector('[data-market-image="' + p.id + '"] .af-fb-hint'); if (!b && isAdmin()) render(); } });
    });
  }
  function rotateVisibleHero() {
    var slide = document.querySelector(".af-product-slide.on[data-market-hero]");
    if (!slide) return;
    var p = productById(slide.dataset.marketHero); if (!p) return;
    resolveImage(p, state.rotationStep).then(function (url) { if (url) applyImage(p.id, url); });
  }
  function scheduleImages() {
    loadInitialImages();
    if (!state.rotationTimer) state.rotationTimer = setInterval(function () {
      if (!document.body.classList.contains("af-market-mode") || document.hidden) return;
      state.rotationStep += 1; rotateVisibleHero();
    }, 10000);
  }

  /* ---------- Bandeau éditable ---------- */
  async function loadHero() {
    if (!sb()) return;
    try {
      var r = await sb().from("afriflow_state").select("value").eq("key", HERO_KEY).maybeSingle();
      if (r.data && r.data.value && JSON.stringify(r.data.value) !== JSON.stringify(state.hero)) {
        state.hero = r.data.value;
        try { localStorage.setItem(HERO_LS, JSON.stringify(state.hero)); } catch (error) {}
        if (!el("afModal")) render();
      }
    } catch (error) {}
  }
  function shrink(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        var q = 0.8, d = c.toDataURL("image/jpeg", q); while (d.length > 600000 && q > 0.35) { q -= 0.1; d = c.toDataURL("image/jpeg", q); } cb(d);
      };
      im.onerror = function () { notice("Image illisible."); }; im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function heroEditor() {
    if (!isAdmin()) return;
    var img = state.hero.img || "";
    var m = modal('<h3>Modifier le bandeau</h3><label for="afhT">Titre</label><input type="text" id="afhT" maxlength="90" autocomplete="off"><label for="afhF">Image de fond (facultatif)</label><input type="file" id="afhF" accept="image/*"><div id="afhP"></div><div class="af-actions"><button type="button" class="af-market-primary" id="afhOk">Enregistrer</button><button type="button" class="af-market-secondary" id="afhNo">Annuler</button><button type="button" class="af-market-secondary" id="afhRm">Retirer l’image</button><button type="button" class="af-market-secondary" id="afhRs">Texte d’origine</button></div>');
    var T = m.querySelector("#afhT"); T.value = state.hero.title || DEF_TITLE;
    function prev() { m.querySelector("#afhP").innerHTML = okImg(img) ? '<img class="af-hero-prev" src="' + img + '" alt="">' : ""; } prev();
    m.querySelector("#afhF").onchange = function () { var f = this.files[0]; if (f) shrink(f, function (d) { img = d; prev(); }); };
    m.querySelector("#afhRm").onclick = function () { img = ""; prev(); };
    m.querySelector("#afhRs").onclick = function () { T.value = DEF_TITLE; };
    m.querySelector("#afhNo").onclick = closeModal;
    m.querySelector("#afhOk").onclick = async function () {
      var b = this; b.disabled = true;
      var t = T.value.trim();
      state.hero = { title: t === DEF_TITLE ? "" : t, img: img, at: Date.now() };
      try { localStorage.setItem(HERO_LS, JSON.stringify(state.hero)); } catch (error) {}
      try {
        var r = await sb().from("afriflow_state").upsert({ key: HERO_KEY, value: state.hero, updated_at: new Date().toISOString() });
        if (r.error) throw r.error; notice("Bandeau enregistré pour tous les visiteurs.");
      } catch (error) { notice("Enregistré sur cet appareil seulement : " + (error.message || error)); }
      closeModal(); render();
    };
    T.focus();
  }

  /* ---------- Fenêtres ---------- */
  function modal(html) {
    closeModal();
    var m = document.createElement("div"); m.className = "af-modal"; m.id = "afModal";
    m.innerHTML = '<div class="af-modal-box" role="dialog" aria-modal="true">' + html + "</div>";
    m.addEventListener("click", function (e) { if (e.target === m) closeModal(); });
    document.body.appendChild(m); return m;
  }
  function closeModal() { var m = el("afModal"); if (m) m.remove(); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  function openDetail(p) {
    if (isAnnouncement(p)) {
      var announcement = modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button><div class="af-detail af-announcement-detail"><div class="af-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + '</div><div class="af-detail-body"><span class="af-product-cat">ANNONCE AFRIFLOW</span><h2>' + esc(p.name) + '</h2><p>' + esc(p.description || "") + '</p><div class="af-actions"><button type="button" class="af-market-secondary" data-x>Fermer</button></div></div></div>');
      announcement.querySelector(".af-modal-x").onclick = closeModal; announcement.querySelector("[data-x]").onclick = closeModal; return;
    }
    var discount = discountPercent(p), facts = salesFacts(p);
    var available = inStock(p);
    var m = modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button><div class="af-detail' + (available ? '' : ' is-out-of-stock') + '"><div class="af-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + (available ? '' : '<span class="af-stock-badge">Rupture de stock</span>') + '</div><div class="af-detail-body">' + (p.promotion_label || discount ? '<span class="af-promo">' + esc(p.promotion_label || "Offre spéciale") + '</span>' : '') + '<div class="af-product-cat">' + esc(p.category) + "</div><h2>" + esc(p.name) + '</h2><div class="af-price-line"><div class="af-product-price">' + esc(formatPrice(p.price, p.currency)) + "</div>" + (discount ? '<span class="af-old-price">' + esc(formatPrice(p.compare_at_price, p.currency)) + '</span><span class="af-discount">-' + discount + '%</span>' : '') + '</div><p>' + esc(p.description || "Produit sélectionné par AfriFloW.") + '</p>' + (facts.length ? '<ul class="af-sales-facts">' + facts.map(function (fact) { return '<li>' + esc(fact) + '</li>'; }).join('') + '</ul>' : '') + '<div class="af-actions">' + (available ? '<button type="button" class="af-market-primary" data-q>Demander un devis</button>' : '<span class="af-stock-note">Indisponible pour le moment</span>') + '<button type="button" class="af-market-secondary" data-x>Fermer</button></div></div></div>');
    m.querySelector(".af-modal-x").onclick = closeModal; m.querySelector("[data-x]").onclick = closeModal;
    var quote = m.querySelector("[data-q]"); if (quote) quote.onclick = function () { closeModal(); openQuote(p); };
  }
  function openQuote(p) {
    if (!inStock(p)) { notice("Ce produit est actuellement en rupture de stock."); return; }
    if (state.context.kind === "public") { notice("Identifiez-vous uniquement pour envoyer votre devis et recevoir la réponse."); openAuth(); return; }
    var m = modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button><h3>Demander un devis</h3><p class="af-quote-prod">' + esc(p.name) + '</p><label for="afqQ">Quantité souhaitée</label><input id="afqQ" type="text" maxlength="60" placeholder="Ex. 200 sachets"><label for="afqM">Message</label><textarea id="afqM" rows="4" maxlength="1500" placeholder="Pays de livraison, délais, questions…"></textarea><div class="af-actions"><button type="button" class="af-market-primary" id="afqGo">Envoyer ma demande</button><button type="button" class="af-market-secondary" id="afqNo">Annuler</button></div>');
    m.querySelector(".af-modal-x").onclick = closeModal; m.querySelector("#afqNo").onclick = closeModal;
    m.querySelector("#afqGo").onclick = async function () {
      var b = this; b.disabled = true;
      try {
        var request = { productId: p.id, qty: m.querySelector("#afqQ").value.trim(), message: m.querySelector("#afqM").value.trim() };
        var r = await sb().functions.invoke("afriflow-market-quote", { body: request });
        if (r.error) { var details = ""; try { details = (await r.error.context.json()).error || ""; } catch (ignore) {} throw new Error(details || r.error.message); }
        if (r.data && r.data.error) throw new Error(r.data.error);
        closeModal(); notice("Demande envoyée à AfriFloW. L’équipe a reçu une alerte urgente et vous répondra rapidement.");
      } catch (error) { b.disabled = false; notice("Envoi impossible : " + (error.message || error)); }
    };
  }

  /* ---------- Portail commercial partenaire ---------- */
  async function partnerCall(action, body) {
    var result = await sb().functions.invoke("afriflow-partner-portal", { body: Object.assign({ action: action }, body || {}) });
    if (result.error) { var message = result.error.message || "Service partenaire indisponible"; try { var details = await result.error.context.json(); message = details.error || message; } catch (ignore) {} throw new Error(message); }
    if (result.data && result.data.error) throw new Error(result.data.error);
    return result.data;
  }
  function partnerMoney(amount, currency) { return formatPrice(amount, currency || "XOF"); }
  function partnerStatus(status) {
    var labels = { requested: "À valider", approved: "Validée", supplied: "Prête à vendre", rejected: "Refusée", closed: "Clôturée", pending_review: "À contrôler", validated: "Validée", settled: "Réglée" };
    return '<span class="af-market-tag ' + esc(status) + '">' + esc(labels[status] || status) + "</span>";
  }
  function partnerContent() {
    var data = state.partner;
    if (!data) return '<section class="af-market-wait"><h1>Préparation de votre espace partenaire</h1><p>Nous vérifions vos conditions commerciales sécurisées…</p></section>';
    if (!data.enabled) return '<section class="af-market-wait"><h1>Votre partenariat attend validation</h1><p>AfriFloW doit d’abord définir votre pourcentage commercial et activer votre accès. Vos droits de partenaire ne sont jamais attribués automatiquement.</p><button type="button" class="af-market-secondary" id="afPartnerRefresh">Actualiser</button></section>';
    var terms = data.terms || {}, orders = data.orders || [], reports = data.reports || [], products = data.products || [];
    var pending = reports.filter(function (report) { return report.status === "pending_review"; });
    var gross = reports.filter(function (report) { return report.status !== "rejected"; }).reduce(function (sum, report) { return sum + Number(report.gross_amount || 0); }, 0);
    var due = reports.filter(function (report) { return report.status !== "rejected" && report.status !== "settled"; }).reduce(function (sum, report) { return sum + Number(report.afriflow_amount || 0); }, 0);
    var sellable = orders.filter(function (order) { return order.status === "approved" || order.status === "supplied"; });
    var productOpts = products.map(function (product) { return '<option value="' + esc(product.id) + '">' + esc(product.name) + ' · ' + esc(partnerMoney(product.price, product.currency)) + '</option>'; }).join("");
    var orderOpts = sellable.map(function (order) { var product = Array.isArray(order.product) ? order.product[0] : order.product; return '<option value="' + esc(order.id) + '">' + esc(product && product.name || "Produit") + ' · allocation ' + esc(order.quantity_requested) + ' unités</option>'; }).join("");
    return '<section class="af-partner-portal"><header class="af-partner-head"><div><span>PARTENAIRE COMMERCIAL</span><h1>Votre activité, en toute clarté.</h1><p>Commandez vos produits, déclarez vos ventes et suivez chaque montant en temps réel.</p></div><div class="af-partner-rate"><small>Part AfriFloW</small><strong>' + esc(Number(terms.commission_rate || 0).toLocaleString("fr-FR")) + ' %</strong><em>définie pour votre partenariat</em></div></header>'
      + '<div class="af-partner-kpis"><article><small>Chiffre d’affaires déclaré</small><b>' + esc(partnerMoney(gross, reports[0] && reports[0].currency || "XOF")) + '</b><span>Toutes ventes hors refus</span></article><article><small>À reverser à AfriFloW</small><b>' + esc(partnerMoney(due, reports[0] && reports[0].currency || "XOF")) + '</b><span>Selon votre taux personnalisé</span></article><article><small>Déclarations à contrôler</small><b>' + pending.length + '</b><span>AfriFloW est déjà alerté</span></article></div>'
      + '<div class="af-partner-grid"><form class="af-partner-card" id="afPartnerOrder"><h2>Préparer une commande</h2><p>Choisissez un produit et la quantité souhaitée. AfriFloW confirme ensuite votre allocation.</p><label>Produit<select required name="productId"><option value="">Sélectionner un produit</option>' + productOpts + '</select></label><label>Quantité demandée<input required name="quantity" type="number" min="1" step="1" placeholder="Ex. 100"></label><label>Message facultatif<textarea name="note" maxlength="1200" placeholder="Lieu de vente, délai souhaité…"></textarea></label><button class="af-market-primary">Envoyer la demande</button></form>'
      + '<form class="af-partner-card af-partner-report" id="afPartnerSale"><h2>Déclarer une vente</h2><p>Le calcul est fait côté AfriFloW et une alerte urgente est envoyée à l’équipe.</p><label>Allocation validée<select required name="orderId"><option value="">Sélectionner une allocation</option>' + orderOpts + '</select></label><div class="af-partner-duo"><label>Quantité vendue<input required name="quantity" type="number" min="1" step="1"></label><label>Prix unitaire de vente<input required name="unitSalePrice" type="number" min="0" step="0.01"></label></div><label>Note facultative<textarea name="note" maxlength="1200" placeholder="Canal de vente, précision…"></textarea></label><div id="afPartnerCalc" class="af-partner-calc">Le montant net partenaire et la part AfriFloW seront calculés automatiquement.</div><button class="af-market-primary"' + (sellable.length ? "" : " disabled") + '>Déclarer et alerter</button></form></div>'
      + '<section class="af-partner-card af-partner-follow"><h2>Suivi des allocations</h2>' + (orders.length ? '<div class="af-partner-list">' + orders.map(function (order) { var product = Array.isArray(order.product) ? order.product[0] : order.product; return '<article><div><b>' + esc(product && product.name || "Produit") + '</b><small>' + esc(order.quantity_requested) + ' unités demandées · ' + esc(partnerMoney(order.unit_price, order.currency)) + ' / unité</small></div>' + partnerStatus(order.status) + '</article>'; }).join("") + '</div>' : '<p class="af-partner-empty">Aucune demande produit pour le moment.</p>') + '</section>'
      + '<section class="af-partner-card af-partner-follow"><h2>Historique financier</h2>' + (reports.length ? '<div class="af-partner-list">' + reports.map(function (report) { var product = Array.isArray(report.product) ? report.product[0] : report.product; return '<article><div><b>' + esc(product && product.name || "Produit") + '</b><small>' + esc(report.quantity_sold) + ' vendu(s) · CA ' + esc(partnerMoney(report.gross_amount, report.currency)) + ' · net partenaire ' + esc(partnerMoney(report.partner_net_amount, report.currency)) + '</small></div>' + partnerStatus(report.status) + '</article>'; }).join("") + '</div>' : '<p class="af-partner-empty">Vos ventes déclarées apparaîtront ici.</p>') + '</section>'
      + (terms.payment_notes ? '<p class="af-partner-note"><b>Note AfriFloW :</b> ' + esc(terms.payment_notes) + '</p>' : '') + '</section>';
  }
  async function loadPartnerPortal() {
    if (!sb()) return;
    try { state.partner = await partnerCall("dashboard"); render(); }
    catch (error) { state.partner = { enabled: false, error: error.message || "Portail indisponible" }; render(); notice(error.message || "Portail partenaire indisponible"); }
  }
  function updatePartnerCalculation() {
    var box = el("afPartnerCalc"), form = el("afPartnerSale"), terms = state.partner && state.partner.terms; if (!box || !form || !terms) return;
    var quantity = Number(form.querySelector('[name="quantity"]').value), unit = Number(form.querySelector('[name="unitSalePrice"]').value), rate = Number(terms.commission_rate || 0);
    if (!(quantity > 0) || !(unit >= 0)) { box.textContent = "Le montant net partenaire et la part AfriFloW seront calculés automatiquement."; return; }
    var gross = quantity * unit, share = gross * rate / 100, net = gross - share;
    box.innerHTML = '<b>Prévision :</b> CA ' + esc(partnerMoney(gross, "XOF")) + ' · AfriFloW ' + esc(partnerMoney(share, "XOF")) + ' · <b>net partenaire ' + esc(partnerMoney(net, "XOF")) + '</b>';
  }
  async function loadPartnerAdmin() {
    var box = el("afPartnerAdmin"); if (!box || !isAdmin() || !sb()) return;
    try {
      state.partnerAdmin = await partnerCall("admin_dashboard"); var partners = state.partnerAdmin.partners || [];
      var orders = state.partnerAdmin.orders || [], reports = state.partnerAdmin.reports || [];
      function choices(current, values, labels) { return values.map(function (value) { return '<option value="' + value + '"' + (current === value ? " selected" : "") + '>' + labels[value] + '</option>'; }).join(""); }
      var orderLabels = { requested: "À valider", approved: "Validée", supplied: "Prête à vendre", rejected: "Refusée", closed: "Clôturée" }, reportLabels = { pending_review: "À contrôler", validated: "Validée", settled: "Réglée", rejected: "Refusée" };
      box.innerHTML = '<h3>Partenaires commerciaux</h3><p>Activez un partenaire uniquement après validation, puis fixez sa part AfriFloW. Les calculs et alertes restent sécurisés côté serveur.</p>' + (partners.length ? partners.map(function (partner) { var term = partner.terms || {}; return '<form class="af-partner-admin-row" data-partner="' + esc(partner.user_id) + '"><div><b>' + esc(partner.email) + '</b><small>' + (term.is_enabled ? "Accès commercial actif" : "En attente d’activation") + '</small></div><label>Part AfriFloW (%)<input required name="rate" type="number" min="0" max="100" step="0.01" value="' + esc(term.commission_rate || 0) + '"></label><label class="af-partner-enable"><input name="enabled" type="checkbox"' + (term.is_enabled ? " checked" : "") + '> Activer</label><label>Instruction de règlement<input name="notes" maxlength="1200" value="' + esc(term.payment_notes || "") + '"></label><button class="af-market-secondary">Enregistrer</button></form>'; }).join("") : '<p class="af-partner-empty">Aucun partenaire n’a encore demandé cet accès.</p>')
        + '<h3 class="af-partner-admin-subtitle">Allocations à traiter</h3>' + (orders.length ? orders.map(function (order) { var product = Array.isArray(order.product) ? order.product[0] : order.product; return '<form class="af-partner-admin-row af-partner-status-row" data-order="' + esc(order.id) + '"><div><b>' + esc(product && product.name || "Produit") + '</b><small>' + esc(order.quantity_requested) + ' unités · partenaire ' + esc((partners.filter(function (p) { return p.user_id === order.partner_user_id; })[0] || {}).email || "") + '</small></div><label>Statut<select name="status">' + choices(order.status, ["requested", "approved", "supplied", "rejected", "closed"], orderLabels) + '</select></label><button class="af-market-secondary">Mettre à jour</button></form>'; }).join("") : '<p class="af-partner-empty">Aucune allocation à traiter.</p>')
        + '<h3 class="af-partner-admin-subtitle">Ventes déclarées</h3>' + (reports.length ? reports.map(function (report) { var product = Array.isArray(report.product) ? report.product[0] : report.product; return '<form class="af-partner-admin-row af-partner-status-row" data-report="' + esc(report.id) + '"><div><b>' + esc(product && product.name || "Produit") + '</b><small>CA ' + esc(partnerMoney(report.gross_amount, report.currency)) + ' · part AfriFloW ' + esc(partnerMoney(report.afriflow_amount, report.currency)) + '</small></div><label>Statut<select name="status">' + choices(report.status, ["pending_review", "validated", "settled", "rejected"], reportLabels) + '</select></label><button class="af-market-secondary">Mettre à jour</button></form>'; }).join("") : '<p class="af-partner-empty">Aucune vente déclarée.</p>');
      box.querySelectorAll("form[data-partner]").forEach(function (form) { form.onsubmit = async function (event) { event.preventDefault(); var button = form.querySelector("button"), fields = new FormData(form); button.disabled = true; try { var result = await partnerCall("admin_save_partner", { partnerId: form.dataset.partner, commissionRate: fields.get("rate"), enabled: fields.get("enabled") === "on", paymentNotes: fields.get("notes") }); notice(result.message); loadPartnerAdmin(); } catch (error) { notice(error.message || "Mise à jour impossible"); button.disabled = false; } }; });
      box.querySelectorAll("form[data-order]").forEach(function (form) { form.onsubmit = async function (event) { event.preventDefault(); var button = form.querySelector("button"), fields = new FormData(form); button.disabled = true; try { await partnerCall("admin_set_order_status", { orderId: form.dataset.order, status: fields.get("status") }); notice("Allocation mise à jour."); loadPartnerAdmin(); } catch (error) { notice(error.message || "Mise à jour impossible"); button.disabled = false; } }; });
      box.querySelectorAll("form[data-report]").forEach(function (form) { form.onsubmit = async function (event) { event.preventDefault(); var button = form.querySelector("button"), fields = new FormData(form); button.disabled = true; try { await partnerCall("admin_set_report_status", { reportId: form.dataset.report, status: fields.get("status") }); notice("Vente mise à jour."); loadPartnerAdmin(); } catch (error) { notice(error.message || "Mise à jour impossible"); button.disabled = false; } }; });
    } catch (error) { box.innerHTML = '<p class="af-market-error">Gestion des partenaires indisponible.</p>'; }
  }

  /* ---------- Panier et favoris (données stockées uniquement dans ce navigateur) ---------- */
  function cartCount() { return state.cart.reduce(function (sum, row) { return sum + Number(row.quantity || 0); }, 0); }
  function cartTotal() { return state.cart.reduce(function (sum, row) { return sum + Number(row.quantity || 0) * Number(row.price || 0); }, 0); }
  function addToCart(product) {
    if (!product || !inStock(product)) return notice("Ce produit est actuellement indisponible.");
    var row = state.cart.filter(function (item) { return item.id === product.id; })[0];
    if (row) row.quantity += 1;
    else state.cart.push({ id: product.id, name: product.name, price: product.price, currency: product.currency, quantity: Math.max(1, Number(product.minimum_order_quantity) || 1) });
    persistShop(); render(); notice("Produit ajouté au panier.");
  }
  function toggleFavorite(product) {
    if (!product) return; var index = state.favorites.indexOf(product.id);
    if (index < 0) { state.favorites.push(product.id); notice("Ajouté à vos favoris."); } else { state.favorites.splice(index, 1); notice("Retiré de vos favoris."); }
    persistShop(); render();
  }
  function openCart() {
    if (!state.cart.length) return notice("Votre panier est vide pour le moment.");
    var currency = state.cart[0].currency || "XOF";
    var html = '<button type="button" class="af-modal-x" aria-label="Fermer">×</button><div class="af-cart"><h3>Mon panier <span>' + cartCount() + ' article' + (cartCount() > 1 ? "s" : "") + '</span></h3><p>Préparez votre demande : AfriFloW confirmera les prix, stocks et délais avant tout paiement.</p><div class="af-cart-list">' + state.cart.map(function (row) { return '<article><div><b>' + esc(row.name) + '</b><small>' + esc(formatPrice(row.price, row.currency)) + ' / unité</small></div><div class="af-cart-qty"><button type="button" data-cart-minus="' + esc(row.id) + '">−</button><b>' + esc(row.quantity) + '</b><button type="button" data-cart-plus="' + esc(row.id) + '">+</button></div><button type="button" class="af-cart-remove" data-cart-remove="' + esc(row.id) + '">Retirer</button></article>'; }).join("") + '</div><div class="af-cart-total"><span>Total estimatif</span><b>' + esc(formatPrice(cartTotal(), currency)) + '</b></div><div class="af-actions"><button type="button" class="af-market-primary" id="afCartQuote">Demander un devis groupé</button><button type="button" class="af-market-secondary" id="afCartClose">Continuer mes achats</button></div></div>';
    var m = modal(html); m.querySelector(".af-modal-x").onclick = closeModal; m.querySelector("#afCartClose").onclick = closeModal;
    m.querySelectorAll("[data-cart-plus]").forEach(function (button) { button.onclick = function () { var row = state.cart.filter(function (x) { return x.id === button.dataset.cartPlus; })[0]; if (row) { row.quantity += 1; persistShop(); closeModal(); openCart(); } }; });
    m.querySelectorAll("[data-cart-minus]").forEach(function (button) { button.onclick = function () { var row = state.cart.filter(function (x) { return x.id === button.dataset.cartMinus; })[0]; if (row) { row.quantity -= 1; if (row.quantity < 1) state.cart = state.cart.filter(function (x) { return x.id !== row.id; }); persistShop(); closeModal(); if (state.cart.length) openCart(); else render(); } }; });
    m.querySelectorAll("[data-cart-remove]").forEach(function (button) { button.onclick = function () { state.cart = state.cart.filter(function (x) { return x.id !== button.dataset.cartRemove; }); persistShop(); closeModal(); if (state.cart.length) openCart(); else render(); }; });
    m.querySelector("#afCartQuote").onclick = async function () {
      if (state.context.kind === "public") { closeModal(); openAuth("login"); return; }
      var send = this; send.disabled = true;
      try {
        for (var i = 0; i < state.cart.length; i += 1) { var item = state.cart[i]; var response = await sb().functions.invoke("afriflow-market-quote", { body: { productId: item.id, qty: String(item.quantity), message: "Demande groupée depuis le panier AfriFloW." } }); if (response.error || response.data && response.data.error) throw new Error(response.data && response.data.error || response.error.message); }
        state.cart = []; persistShop(); closeModal(); render(); notice("Votre demande groupée a été envoyée à AfriFloW.");
      } catch (error) { send.disabled = false; notice("Envoi impossible : " + (error.message || error)); }
    };
  }

  /* ---------- Rendu ---------- */
  function productCard(product, i) {
    var discount = discountPercent(product), facts = salesFacts(product), available = inStock(product);
    return '<article class="af-product' + (available ? '' : ' is-out-of-stock') + '" style="--i:' + i + '"><div class="af-product-media af-media" data-market-image="' + esc(product.id) + '" data-alt="' + esc(product.name) + '">' + media(product) + (product.promotion_label || discount ? '<span class="af-promo">' + esc(product.promotion_label || "Offre spéciale") + '</span>' : '') + '<button type="button" class="af-favorite' + (state.favorites.indexOf(product.id) > -1 ? ' on' : '') + '" data-favorite="' + esc(product.id) + '" aria-label="Ajouter aux favoris">♥</button>' + (available ? '' : '<span class="af-stock-badge">Rupture de stock</span>') + "</div>"
      + '<div class="af-product-body"><div class="af-product-cat">' + esc(product.category) + '</div><h3>' + esc(product.name) + '</h3><div class="af-product-assurance">Sélection contrôlée AfriFloW</div><div class="af-price-line"><div class="af-product-price">' + esc(formatPrice(product.price, product.currency)) + '</div>' + (discount ? '<span class="af-old-price">' + esc(formatPrice(product.compare_at_price, product.currency)) + '</span><span class="af-discount">-' + discount + '%</span>' : '') + '</div>'
      + '<div class="af-product-meta">' + (product.minimum_order_quantity ? '<span><b>Minimum :</b> ' + esc(product.minimum_order_quantity) + ' unité' + (Number(product.minimum_order_quantity) > 1 ? 's' : '') + '</span>' : '<span>Quantité à convenir</span>') + (product.origin_country ? '<span>· ' + esc(product.origin_country) + '</span>' : '') + '</div><div class="af-verified"><i>✓</i><b>Certifié</b> <span>par AfriFloW</span></div>'
      + '<div class="af-card-actions">' + (available ? '<button type="button" class="af-market-primary" data-add-cart="' + esc(product.id) + '">Ajouter</button>' : '<button type="button" class="af-market-unavailable" disabled>Rupture</button>') + '<button type="button" class="af-market-secondary" data-market-detail="' + esc(product.id) + '">Détails</button></div></div></article>';
  }
  function featuredCard(p) {
    var available = inStock(p), discount = discountPercent(p);
    return '<div class="af-feature-wrap"><article class="af-feature' + (available ? '' : ' is-out-of-stock') + '"><div class="af-media af-feature-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + (available ? '' : '<span class="af-stock-badge">Rupture de stock</span>') + "</div>"
      + '<div class="af-feature-body"><div class="af-feature-top"><span class="af-chip">' + esc(p.promotion_label || "Produit à la une") + '</span><span class="af-verified"><i>✓</i><b>Certifié</b> <span>AfriFloW</span></span></div><h3>' + esc(p.name) + '</h3><div class="af-feature-pricing"><div class="af-product-price af-big">' + esc(formatPrice(p.price, p.currency)) + '</div>' + (discount ? '<div><span class="af-old-price">' + esc(formatPrice(p.compare_at_price, p.currency)) + '</span><span class="af-discount">-' + discount + '%</span></div>' : '') + '</div><p>' + esc(p.description || "Produit sélectionné par AfriFloW.") + "</p>"
      + '<div class="af-feature-meta">' + (p.minimum_order_quantity ? 'Commande minimum : <b>' + esc(p.minimum_order_quantity) + ' unité' + (Number(p.minimum_order_quantity) > 1 ? 's' : '') + '</b>' : 'Quantité sur demande') + (p.origin_country ? ' <span>· Origine : ' + esc(p.origin_country) + '</span>' : '') + '</div><ul class="af-points"><li>Produit contrôlé par AfriFloW</li><li>Devis personnalisé sur demande</li><li>Contact direct avec l’équipe</li></ul>'
      + '<div class="af-actions">' + (available ? '<button type="button" class="af-market-primary" data-add-cart="' + esc(p.id) + '">Ajouter au panier</button>' : '<button type="button" class="af-market-unavailable" disabled>Rupture de stock</button>') + '<button type="button" class="af-market-secondary" data-market-detail="' + esc(p.id) + '">Voir les détails</button></div></div></article></div>';
  }
  function productsHtml(products) {
    if (!products.length) return '<div class="af-market-empty">Aucun produit ne correspond à votre recherche pour le moment.</div>';
    if (products.length === 1) return featuredCard(products[0]);
    return '<section id="afMarketGrid" class="af-market-grid" data-n="' + Math.min(products.length, 5) + '">' + products.map(productCard).join("") + "</section>";
  }
  function announcementCard(item) {
    return '<article class="af-announcement"><div class="af-announcement-media af-media" data-market-image="' + esc(item.id) + '" data-alt="' + esc(item.name) + '">' + media(item) + '</div><div class="af-announcement-body"><span>ANNONCE AFRIFLOW</span><h3>' + esc(item.name) + '</h3><p>' + esc(item.description || "Découvrez les nouveautés et informations AfriFloW.") + '</p><button type="button" class="af-market-secondary" data-market-detail="' + esc(item.id) + '">Lire l’annonce</button></div></article>';
  }
  function announcementsHtml() {
    var items = state.products.filter(isAnnouncement).slice(0, 6);
    if (!items.length) return "";
    return '<section class="af-announcements"><div class="af-market-section-head"><h2>À la une chez AfriFloW</h2><p>Actualités, lancements et informations utiles</p></div><div class="af-announcements-grid">' + items.map(announcementCard).join("") + "</div></section>";
  }
  function heroHtml() {
    var h = state.hero, bg = okImg(h.img) ? ' style="--hero-img:url(\'' + h.img + '\')"' : "";
    var picks = state.products.filter(function (product) { return !isAnnouncement(product); }).slice(0, 4);
    var slides = '<div class="af-slide on"><img class="af-hero-watermark" src="logo.png" alt=""><div class="af-slide-text"><h1>' + titleHtml(h.title) + '</h1><div class="af-actions"><button type="button" class="af-market-primary" data-act="products">Voir les produits</button><button type="button" class="af-ghost" data-act="quote">Demander un devis</button></div></div></div>';
    picks.forEach(function (p) {
      var image = state.imgs[p.id] ? ' style="--slide-img:url(\'' + String(state.imgs[p.id]).replace(/'/g, "%27") + '\')"' : "";
      var discount = discountPercent(p);
      slides += '<div class="af-slide af-product-slide" data-market-hero="' + esc(p.id) + '"' + image + '><img class="af-hero-watermark" src="logo.png" alt=""><div class="af-slide-text"><span class="af-kicker">' + esc(p.promotion_label || "Produit à la une") + '</span><h2>' + esc(p.name) + '</h2><div class="af-slide-price">' + esc(formatPrice(p.price, p.currency)) + '</div>' + (discount ? '<div class="af-slide-deal"><span>' + esc(formatPrice(p.compare_at_price, p.currency)) + '</span><b>−' + discount + '%</b></div>' : '') + '<button type="button" class="af-market-primary" data-market-detail="' + esc(p.id) + '">Découvrir</button></div></div>';
    });
    var dots = picks.length ? '<div class="af-dots">' + [0].concat(picks.map(function (_, i) { return i + 1; })).map(function (i) { return '<button type="button" class="af-dot' + (i === 0 ? " on" : "") + '" data-go="' + i + '" aria-label="Diapositive ' + (i + 1) + '"></button>'; }).join("") + "</div>" : "";
    return '<div class="af-ali-hero" id="afHero"' + bg + ">" + slides + dots + (isAdmin() ? '<button type="button" class="af-hero-pencil" data-act="hero-edit" title="Modifier le texte et l’image du bandeau" aria-label="Modifier le bandeau">✎</button>' : "") + "</div>";
  }
  function sideHtml() {
    var member = state.context.kind === "authenticated";
    return '<aside class="af-ali-side"><div class="af-side-hello"><img src="logo.png" alt=""><div><b>Bienvenue sur AfriFloW</b><small>' + (member ? "Votre espace client" : "Achetez et échangez en direct") + "</small></div></div>"
      + (member ? '<button type="button" class="af-market-primary" id="afMarketProfile">Mon compte</button>' : '')
      + '<button type="button" class="af-market-secondary" data-act="quote">Demander un devis</button>'
      + '<ul class="af-side-list"><li>Produits d’Afrique, sélectionnés</li><li>Contact direct avec AfriFloW</li><li>De l’Afrique vers le monde</li></ul></aside>';
  }
  function catsHtml() {
    var cats = categoryList();
    return '<aside class="af-ali-cats" aria-label="Catégories"><h3>Catégories</h3><button type="button" data-market-category="" class="' + (!state.category ? "on" : "") + '">Toute la Marketplace <i>›</i></button>'
      + cats.map(function (c) { return '<button type="button" data-market-category="' + esc(c) + '" class="' + (state.category === c ? "on" : "") + '">' + esc(c) + " <i>›</i></button>"; }).join("") + "</aside>";
  }
  function catalogContent() {
    var products = filteredProducts();
    return '<section class="af-ali">' + catsHtml() + heroHtml() + sideHtml() + "</section>"
      + '<div class="af-market-section-head" id="afProductsTop"><h2>' + (state.category ? esc(state.category) : "Nos produits") + "</h2><p>" + (products.length ? products.length + " produit" + (products.length > 1 ? "s" : "") : "Catalogue en préparation") + "</p></div>"
      + announcementsHtml() + productsHtml(products) + (isAdmin() ? adminPanel() : "");
  }
  function waitContent() {
    return '<section class="af-market-wait"><h1>Espace partenaire en préparation</h1><p>Votre demande de rôle partenaire est enregistrée. Cet espace sera ouvert prochainement. En attendant, vous pouvez revenir à la vitrine publique de la Marketplace.</p><button type="button" class="af-market-primary" id="afPartnerCatalog">Voir la Marketplace</button></section>';
  }
  function top() {
    var workspace = state.context.kind === "workspace", partner = roleMode(state.context.market) === "partner_waiting";
    return '<header class="af-market-top"><div class="af-market-topline">'
      + '<a class="af-market-brand" href="#" id="afMarketHome"><img src="logo.png" alt=""><b>Afri<span>FloW</span> Marketplace</b></a>'
      + (partner ? '<div class="af-market-search af-partner-top-label">Portail commercial partenaire</div>' : '<form class="af-market-search" id="afMarketSearch"><input id="afMarketSearchInput" value="' + esc(state.term) + '" type="search" placeholder="Rechercher un produit, une catégorie…" aria-label="Rechercher dans la Marketplace"><button>Rechercher</button></form>')
      + (workspace ? '<button type="button" class="af-market-link" id="afMarketBack">Retour à mon espace</button>' : "")
      + (state.context.kind === "authenticated" ? '<button type="button" class="af-market-link" id="afMarketAccount">Mon compte</button>' : "")
      + (!partner ? '<button type="button" class="af-market-cart" id="afMarketCart" aria-label="Ouvrir le panier">Panier <b>' + cartCount() + '</b></button>' : '')
      + (state.context.kind === "authenticated" ? '<button type="button" class="af-market-link" id="afMarketSignOut">Déconnexion</button>' : "")
      + '</div>' + (!partner ? '<nav class="af-market-nav" aria-label="Navigation Marketplace"><button type="button" data-market-category="">Tout le marché</button>' + categoryList().slice(0, 7).map(function (category) { return '<button type="button" data-market-category="' + esc(category) + '">' + esc(category) + '</button>'; }).join("") + '<button type="button" data-market-favorites>Favoris (' + state.favorites.length + ')</button><span>Produits contrôlés · Devis sécurisé · Support AfriFloW</span></nav>' : '') + "</header>";
  }
  function adminPanel() {
    var choices = state.adminProducts.length ? state.adminProducts : state.products;
    var opts = choices.map(function (product) { return '<option value="' + esc(product.id) + '">' + esc(product.name) + "</option>"; }).join("");
    return '<section class="af-market-admin" id="afMarketAdmin"><h2>Administration de la Marketplace</h2><p>Les originaux et variantes sont envoyés depuis ici vers Dropbox. Seules les variantes approuvées entrent dans la rotation horaire.</p>'
      + '<div class="af-market-admin-grid">'
      + '<form class="af-market-admin-card" id="afProductUpload"><h3>Ajouter une fiche</h3><div id="afDropboxStatus" class="af-market-status">Vérification de Dropbox…</div><button type="button" class="af-market-secondary" id="afDropboxReconnect">Reconnecter Dropbox</button><label>Type de fiche<select name="listingType"><option value="product">Produit commercial</option><option value="announcement">Annonce / actualité</option></select></label><label>Nom du produit ou titre de l’annonce<input required name="name" maxlength="160"></label><label>Catégorie<input required name="category" maxlength="80" value="Découvrir"></label><label>Prix (facultatif pour une annonce)<input name="price" type="number" min="0" step="0.01"></label><label>Ancien prix (promotion réelle)<input name="compareAtPrice" type="number" min="0" step="0.01"></label><label>Devise<select name="currency"><option>XOF</option><option>EUR</option><option>USD</option></select></label><label>Quantité minimale (facultatif)<input name="minimumOrderQuantity" type="number" min="1" step="1"></label><label>Pays / origine (facultatif)<input name="originCountry" maxlength="80" placeholder="Ex. Togo"></label><label>Délai ou livraison (facultatif)<input name="deliveryInfo" maxlength="160" placeholder="Ex. Expédition sous 3 à 5 jours"></label><label>Badge promotion (facultatif)<input name="promotionLabel" maxlength="40" placeholder="Ex. Offre de lancement"></label><label>Description<textarea name="description" maxlength="4000"></textarea></label><label>Photo originale<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><small>Les annonces sont séparées des produits et ne sont jamais ajoutées au panier.</small><button class="af-market-primary">Envoyer vers Dropbox</button></form>'
      + '<form class="af-market-admin-card" id="afVariantUpload"><h3>Ajouter une variante</h3><label>Produit<select required name="productId">' + opts + '</select></label><label>Image de variante<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Origine<select name="source"><option value="manual">Retouche manuelle</option><option value="ai">Création IA validée manuellement</option></select></label><label>Consigne / provenance<textarea name="prompt" maxlength="2000" placeholder="Ex. conserver fidèlement le produit, éclairage naturel…"></textarea></label><small>Une variante reste invisible tant qu’elle n’est pas approuvée.</small><button class="af-market-primary">Envoyer la variante</button></form>'
      + '<form class="af-market-admin-card" id="afAiRequest"><h3>Pipeline IA</h3><div id="afAiStatus" class="af-market-status">Vérification de la configuration…</div><label>Produit<select required name="productId">' + opts + '</select></label><label>Consigne de transformation<textarea required name="prompt" minlength="8" maxlength="2000" placeholder="Conserver exactement le produit ; modifier seulement l’ambiance…"></textarea></label><small>L’IA travaille uniquement côté serveur. Chaque variante créée reste en attente de votre approbation.</small><button class="af-market-secondary">Créer une variante IA</button></form>'
      + '</div><div id="afMarketAdminList" class="af-market-admin-list"><p>Chargement des brouillons et variantes…</p></div><div id="afMarketQuotes" class="af-market-admin-list"></div><div id="afPartnerAdmin" class="af-partner-admin"><p>Chargement des partenaires commerciaux…</p></div></section>';
  }
  function render() {
    var root = el("market-view"); if (!root) return;
    clearHero();
    root.innerHTML = top() + '<main class="af-market-main">' + (roleMode(state.context.market) === "partner_waiting" ? partnerContent() : catalogContent()) + "</main>";
    bind(); startHero();
  }
  function startHero() {
    var hero = el("afHero"); if (!hero) return;
    var slides = hero.querySelectorAll(".af-slide"); if (slides.length < 2) return;
    function go(i) {
      state.heroIdx = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("on", k === state.heroIdx); });
      hero.querySelectorAll(".af-dot").forEach(function (d, k) { d.classList.toggle("on", k === state.heroIdx); });
      rotateVisibleHero();
    }
    go(Math.min(state.heroIdx, slides.length - 1));
    hero.querySelectorAll(".af-dot").forEach(function (d) { d.onclick = function () { go(+d.dataset.go); }; });
    var paused = false; hero.onmouseenter = function () { paused = true; }; hero.onmouseleave = function () { paused = false; };
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    state.heroTimer = setInterval(function () { if (!paused && !document.hidden) go(state.heroIdx + 1); }, 5500);
  }
  function bind() {
    var home = el("afMarketHome"); if (home) home.onclick = function (event) { event.preventDefault(); state.category = ""; state.term = ""; render(); loadCatalog(); };
    var back = el("afMarketBack"); if (back) back.onclick = closeToWorkspace;
    var signIn = el("afMarketSignIn"); if (signIn) signIn.onclick = function () { openAuth("login"); };
    var sideIn = el("afSideSignIn"); if (sideIn) sideIn.onclick = function () { openAuth("login"); };
    var sideUp = el("afSideSignUp"); if (sideUp) sideUp.onclick = function () { openAuth("register"); };
    [el("afMarketProfile"), el("afMarketAccount")].forEach(function (button) { if (button) button.onclick = function () { if (window.AfriProfileOpen) window.AfriProfileOpen(); else notice("Votre profil est indisponible pour le moment."); }; });
    var signOut = el("afMarketSignOut"); if (signOut) signOut.onclick = function () { if (window.logout) window.logout(); };
    var cart = el("afMarketCart"); if (cart) cart.onclick = openCart;
    var partner = el("afPartnerCatalog"); if (partner) partner.onclick = function () { state.context.market = { access_mode: "client" }; render(); loadCatalog(); };
    var refreshPartner = el("afPartnerRefresh"); if (refreshPartner) refreshPartner.onclick = loadPartnerPortal;
    var orderForm = el("afPartnerOrder"); if (orderForm) orderForm.onsubmit = async function (event) { event.preventDefault(); var button = orderForm.querySelector("button"), form = new FormData(orderForm); button.disabled = true; try { var result = await partnerCall("request_order", { productId: form.get("productId"), quantity: form.get("quantity"), note: form.get("note") }); notice(result.message); loadPartnerPortal(); } catch (error) { button.disabled = false; notice(error.message || "Demande impossible"); } };
    var saleForm = el("afPartnerSale"); if (saleForm) { saleForm.querySelectorAll("input").forEach(function (input) { input.oninput = updatePartnerCalculation; }); saleForm.onsubmit = async function (event) { event.preventDefault(); var button = saleForm.querySelector("button"), form = new FormData(saleForm); button.disabled = true; try { var result = await partnerCall("report_sale", { orderId: form.get("orderId"), quantity: form.get("quantity"), unitSalePrice: form.get("unitSalePrice"), note: form.get("note") }); notice(result.message + " Net partenaire : " + partnerMoney(result.calculation.partnerNet, result.calculation.currency)); loadPartnerPortal(); } catch (error) { button.disabled = false; notice(error.message || "Déclaration impossible"); } }; }
    var search = el("afMarketSearch"); if (search) search.onsubmit = function (event) { event.preventDefault(); state.term = el("afMarketSearchInput").value; render(); loadCatalog(false); };
    document.querySelectorAll("[data-market-category]").forEach(function (button) { button.onclick = function () { state.category = button.dataset.marketCategory || ""; render(); loadCatalog(false); }; });
    document.querySelectorAll("[data-market-favorites]").forEach(function (button) { button.onclick = function () { var favorites = state.products.filter(function (product) { return state.favorites.indexOf(product.id) > -1; }); if (!favorites.length) return notice("Vous n’avez pas encore enregistré de favori."); state.term = ""; state.category = ""; var target = el("afProductsTop"); if (target) target.scrollIntoView({ behavior: "smooth" }); var grid = el("afMarketGrid"); if (grid) { grid.innerHTML = favorites.map(productCard).join(""); bind(); } }; });
    document.querySelectorAll("[data-market-detail]").forEach(function (button) { button.onclick = function () { var p = productById(button.dataset.marketDetail); if (p) openDetail(p); }; });
    document.querySelectorAll("[data-market-quote]").forEach(function (button) { button.onclick = function () { var p = productById(button.dataset.marketQuote); if (p) openQuote(p); }; });
    document.querySelectorAll("[data-add-cart]").forEach(function (button) { button.onclick = function () { addToCart(productById(button.dataset.addCart)); }; });
    document.querySelectorAll("[data-favorite]").forEach(function (button) { button.onclick = function () { toggleFavorite(productById(button.dataset.favorite)); }; });
    document.querySelectorAll("[data-act]").forEach(function (button) {
      button.onclick = function () {
        var a = button.dataset.act;
        if (a === "products") { var t = el("afProductsTop"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }
        else if (a === "quote") { var f = filteredProducts()[0] || state.products[0]; if (f) openQuote(f); else notice("Le catalogue est en préparation."); }
        else if (a === "hero-edit") heroEditor();
      };
    });
    if (isAdmin()) bindAdmin();
  }
  /* Inclinaison 3D douce sur la carte vedette et les cartes produits */
  if (!window.__afTilt) {
    window.__afTilt = 1;
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var c = e.target.closest && e.target.closest(".af-feature,.af-product"); if (!c) return;
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      c.style.setProperty("--ry", (x * 8).toFixed(1) + "deg"); c.style.setProperty("--rx", (-y * 8).toFixed(1) + "deg");
    }, { passive: true });
    document.addEventListener("pointerout", function (e) {
      var c = e.target.closest && e.target.closest(".af-feature,.af-product");
      if (c && !c.contains(e.relatedTarget)) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
    }, { passive: true });
  }

  async function loadCatalog(refresh) {
    if (!sb()) { showCatalogError("Le catalogue sera disponible dès que le service est connecté."); return; }
    var grid = el("afMarketGrid"); if (refresh !== false && grid) grid.innerHTML = '<div class="af-market-empty">Chargement de la Marketplace…</div>';
    try {
      var fields = "id,name,description,category,listing_type,price,compare_at_price,currency,minimum_order_quantity,origin_country,delivery_info,promotion_label,is_in_stock,created_at,is_active";
      var publicCatalog = sb().from("afriflow_market_products").select(fields).eq("is_active", true).order("created_at", { ascending: false }).limit(100);
      var allCatalog = isAdmin() ? sb().from("afriflow_market_products").select(fields).order("created_at", { ascending: false }).limit(100) : null;
      var result = allCatalog ? await Promise.all([publicCatalog, allCatalog]) : [await publicCatalog, null];
      if (result[0].error) throw result[0].error;
      if (result[1] && result[1].error) throw result[1].error;
      state.products = result[0].data || [];
      state.adminProducts = result[1] ? result[1].data || [] : [];
      render(); scheduleImages(); if (isAdmin()) loadAdminList();
    } catch (error) { showCatalogError("Le catalogue est momentanément indisponible."); }
  }
  function showCatalogError(message) { var grid = el("afMarketGrid"); if (grid) grid.innerHTML = '<div class="af-market-error">' + esc(message) + "</div>"; }

  /* ---------- Administration (inchangée) ---------- */
  function toBase64(file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result).split(",")[1]); }; reader.onerror = reject; reader.readAsDataURL(file); }); }
  async function adminCall(action, body) {
    var result = await sb().functions.invoke("afriflow-market-admin", { body: Object.assign({ action: action }, body || {}) });
    if (result.error) { var message = result.error.message || "Service Marketplace indisponible"; try { var details = await result.error.context.json(); message = details.error || message; } catch (error) {} throw new Error(message); }
    if (result.data && result.data.error) throw new Error(result.data.error); return result.data;
  }
  function bindAdmin() {
    var original = el("afProductUpload"); if (original) original.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(original), file = form.get("image"); if (!(file instanceof File) || !file.size) return notice("Choisissez une photo originale."); try { var data = await toBase64(file); var result = await adminCall("upload_original", { product: { listingType: form.get("listingType"), name: form.get("name"), category: form.get("category"), price: form.get("price"), compareAtPrice: form.get("compareAtPrice"), currency: form.get("currency"), minimumOrderQuantity: form.get("minimumOrderQuantity"), originCountry: form.get("originCountry"), deliveryInfo: form.get("deliveryInfo"), promotionLabel: form.get("promotionLabel"), description: form.get("description") }, data: data, mime: file.type }); notice(result.message); original.reset(); loadCatalog(); if (result.autoJob && result.autoJob.id) pollAiJob(result.autoJob.id); } catch (error) { notice(error.message || "Envoi impossible"); } };
    var variant = el("afVariantUpload"); if (variant) variant.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(variant), file = form.get("image"); if (!(file instanceof File) || !file.size) return notice("Choisissez une image de variante."); try { var result = await adminCall("upload_variant", { productId: form.get("productId"), data: await toBase64(file), mime: file.type, source: form.get("source"), prompt: form.get("prompt") }); notice(result.message); variant.reset(); loadAdminList(); } catch (error) { notice(error.message || "Envoi impossible"); } };
    var ai = el("afAiRequest"); if (ai) ai.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(ai); try { var result = await adminCall("request_ai_variant", { productId: form.get("productId"), prompt: form.get("prompt") }); notice(result.message); loadAdminList(); if (result.job && result.job.id) pollAiJob(result.job.id); } catch (error) { notice(error.message || "Aucune génération n'a été lancée."); loadAdminList(); } };
    var reconnect = el("afDropboxReconnect"); if (reconnect) reconnect.onclick = async function () { try { var result = await adminCall("dropbox_authorize"); var nonce = crypto.randomUUID(); sessionStorage.setItem("afriflow_dropbox_oauth_state", nonce); window.location.assign(result.url + "&state=" + encodeURIComponent(nonce)); } catch (error) { notice(error.message || "Connexion Dropbox indisponible."); } };
    var query = new URLSearchParams(window.location.search), code = query.get("code"), oauthState = query.get("state"); if (code && oauthState && oauthState === sessionStorage.getItem("afriflow_dropbox_oauth_state")) { sessionStorage.removeItem("afriflow_dropbox_oauth_state"); history.replaceState({}, "", window.location.pathname + window.location.hash); adminCall("dropbox_complete", { code: code }).then(function (result) { notice(result.message); render(); }).catch(function (error) { notice(error.message || "Connexion Dropbox impossible."); }); }
    adminCall("status").then(function (result) { var status = el("afAiStatus"); if (status) status.textContent = result.aiConfigured ? "AI Horde génère automatiquement une variante après chaque original. Chaque résultat reste à votre approbation." : "L’IA d’images n’est pas configurée."; var dropbox = el("afDropboxStatus"); if (dropbox) dropbox.textContent = result.dropboxConnected ? "Dropbox est connecté." : "Dropbox doit être reconnecté avant tout envoi."; }).catch(function () { var status = el("afAiStatus"); if (status) status.textContent = "État du connecteur IA indisponible."; });
  }
  function jobLabel(job) { return job.status === "ready" ? "Variante prête à examiner" : job.status === "failed" ? "Génération refusée : " + (job.error_message || "erreur inconnue") : "Génération automatique en cours"; }
  function editorField(value) { return esc(value == null ? "" : value); }
  function openProductEditor(product) {
    if (!product) return;
    var currencies = ["XOF", "EUR", "USD"].map(function (currency) { return '<option' + ((product.currency || "XOF") === currency ? " selected" : "") + '>' + currency + "</option>"; }).join("");
    var m = modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button><form class="af-product-edit" id="afProductEdit"><h3>Modifier la fiche</h3><label>Type<select name="listingType"><option value="product"' + (!isAnnouncement(product) ? ' selected' : '') + '>Produit commercial</option><option value="announcement"' + (isAnnouncement(product) ? ' selected' : '') + '>Annonce / actualité</option></select></label><label>Nom du produit ou titre de l’annonce<input required name="name" maxlength="160" value="' + editorField(product.name) + '"></label><label>Catégorie<input required name="category" maxlength="80" value="' + editorField(product.category) + '"></label><div class="af-edit-grid"><label>Prix<input name="price" type="number" min="0" step="0.01" value="' + editorField(product.price) + '"></label><label>Ancien prix<input name="compareAtPrice" type="number" min="0" step="0.01" value="' + editorField(product.compare_at_price) + '"></label><label>Devise<select name="currency">' + currencies + '</select></label><label>Quantité minimale<input name="minimumOrderQuantity" type="number" min="1" step="1" value="' + editorField(product.minimum_order_quantity) + '"></label></div><label>Pays / origine<input name="originCountry" maxlength="80" value="' + editorField(product.origin_country) + '"></label><label>Délai ou livraison<input name="deliveryInfo" maxlength="160" value="' + editorField(product.delivery_info) + '"></label><label>Badge promotion<input name="promotionLabel" maxlength="40" value="' + editorField(product.promotion_label) + '"></label><label>Description<textarea name="description" maxlength="4000">' + editorField(product.description) + '</textarea></label><label>Remplacer la photo (facultatif)<input name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><small>Une annonce ne sera pas proposée au panier.</small><div class="af-actions"><button type="submit" class="af-market-primary">Enregistrer les modifications</button><button type="button" class="af-market-secondary" data-cancel>Annuler</button></div></form>');
    m.querySelector(".af-modal-x").onclick = closeModal; m.querySelector("[data-cancel]").onclick = closeModal;
    m.querySelector("#afProductEdit").onsubmit = async function (event) { event.preventDefault(); var form = new FormData(this), button = this.querySelector("button[type=submit]"), file = form.get("image"); button.disabled = true; try { var payload = { productId: product.id, product: { listingType: form.get("listingType"), name: form.get("name"), category: form.get("category"), price: form.get("price"), compareAtPrice: form.get("compareAtPrice"), currency: form.get("currency"), minimumOrderQuantity: form.get("minimumOrderQuantity"), originCountry: form.get("originCountry"), deliveryInfo: form.get("deliveryInfo"), promotionLabel: form.get("promotionLabel"), description: form.get("description") } }; if (file instanceof File && file.size) { payload.data = await toBase64(file); payload.mime = file.type; } var result = await adminCall("update_product", payload); closeModal(); notice(result.message); loadCatalog(); } catch (error) { button.disabled = false; notice(error.message || "Modification impossible"); } };
  }
  function pollAiJob(id, attempt) {
    if (!id || state.aiPolling[id]) return;
    state.aiPolling[id] = true;
    (async function () {
      try {
        var result = await adminCall("poll_ai_variant", { jobId: id });
        if (result.status === "ready") { delete state.aiPolling[id]; notice("Variante IA prête : visualisez-la puis approuvez-la ou refusez-la."); loadAdminList(); loadCatalog(false); return; }
        if (result.status === "failed") { delete state.aiPolling[id]; notice("La génération IA n’a pas abouti : " + (result.message || "réessayez plus tard.")); loadAdminList(); return; }
        if ((attempt || 0) >= 39) { delete state.aiPolling[id]; loadAdminList(); return; }
        var timer = setTimeout(function () { delete state.aiPolling[id]; pollAiJob(id, (attempt || 0) + 1); }, 15000); state.timers.push(timer);
      } catch (error) { delete state.aiPolling[id]; loadAdminList(); }
    })();
  }
  function statusTag(status) { return '<span class="af-market-tag ' + esc(status) + '">' + esc(status === "approved" ? "Approuvée" : status === "rejected" ? "Refusée" : "En attente") + "</span>"; }
  async function loadQuotes() {
    var box = el("afMarketQuotes"); if (!box || !sb()) return;
    try {
      var r = await sb().from("afriflow_state").select("key,value,updated_at").like("key", "quote:%").order("updated_at", { ascending: false }).limit(50);
      if (r.error) throw r.error; var rows = r.data || [];
      box.innerHTML = "<h3>Demandes de devis (" + rows.length + ")</h3>" + (rows.length ? rows.map(function (x) { var v = x.value || {}; return '<div class="af-market-admin-row"><div><b>' + esc(v.product) + "</b><small>" + esc(v.name || "") + " · " + esc(v.email) + " · " + new Date(v.ts || x.updated_at).toLocaleString("fr-FR") + "</small><small>" + esc(v.qty ? "Quantité : " + v.qty : "") + "</small><small>" + esc(v.message || "") + "</small></div></div>"; }).join("") : "<small>Aucune demande pour le moment.</small>");
    } catch (error) { box.innerHTML = ""; }
  }
  async function loadAdminList() {
    var list = el("afMarketAdminList"); if (!list || !sb()) return;
    loadQuotes(); loadPartnerAdmin();
    try {
      var both = await Promise.all([
        sb().from("afriflow_market_products").select("id,name,description,category,listing_type,price,compare_at_price,currency,minimum_order_quantity,origin_country,delivery_info,promotion_label,is_in_stock,is_active,created_at").order("created_at", { ascending: false }).limit(100),
        sb().from("afriflow_market_variants").select("id,product_id,approval_status,source,created_at").order("created_at", { ascending: false }).limit(200),
        sb().from("afriflow_market_variant_jobs").select("id,product_id,status,error_message,created_at").order("created_at", { ascending: false }).limit(100)
      ]);
      if (both[0].error) throw both[0].error; if (both[1].error) throw both[1].error; if (both[2].error) throw both[2].error;
      var products = both[0].data || [], variants = both[1].data || [], jobs = both[2].data || [];
      list.innerHTML = products.length ? products.map(function (product) {
        var sub = variants.filter(function (variant) { return variant.product_id === product.id; }), pending = jobs.filter(function (job) { return job.product_id === product.id; });
        return '<div class="af-market-admin-row"><div><b>' + esc(product.name) + "</b><small>" + (isAnnouncement(product) ? "Annonce" : "Produit") + " " + (product.is_active ? "visible" : "brouillon") + " · " + (isAnnouncement(product) ? "hors panier" : (inStock(product) ? "en stock" : "rupture")) + " · " + sub.length + " variante" + (sub.length > 1 ? "s" : "") + "</small>"
          + sub.map(function (variant) { return "<small>Variante " + esc(variant.source) + " · " + statusTag(variant.approval_status) + ' <button type="button" class="af-market-secondary" data-variant="' + esc(variant.id) + '" data-status="approved">Approuver</button> <button type="button" class="af-market-secondary" data-variant="' + esc(variant.id) + '" data-status="rejected">Refuser</button></small>'; }).join("")
          + pending.map(function (job) { return '<small class="af-market-job">' + esc(jobLabel(job)) + ((job.status === "queued" || job.status === "processing") ? ' <button type="button" class="af-market-secondary" data-job="' + esc(job.id) + '">Actualiser</button>' : "") + "</small>"; }).join("") + "</div>"
          + '<div class="af-market-admin-actions"><button type="button" class="af-market-secondary" data-edit="' + esc(product.id) + '">Modifier</button><button type="button" class="af-market-secondary" data-stock="' + esc(product.id) + '" data-in-stock="' + (inStock(product) ? "false" : "true") + '">' + (inStock(product) ? "Rupture" : "Remettre en stock") + '</button><button type="button" class="af-market-secondary" data-product="' + esc(product.id) + '" data-active="' + (product.is_active ? "false" : "true") + '">' + (product.is_active ? "Retirer" : "Publier") + '</button><button type="button" class="af-market-danger" data-delete="' + esc(product.id) + '">Supprimer</button></div></div>';
      }).join("") : '<div class="af-market-empty"><b>Aucun brouillon à publier.</b><br><small>Le bouton « Publier » apparaît ici dès qu’un original a été enregistré avec succès dans Dropbox.</small></div>';
      list.querySelectorAll("[data-product]").forEach(function (button) { button.onclick = async function () { var response = await sb().from("afriflow_market_products").update({ is_active: button.dataset.active === "true" }).eq("id", button.dataset.product); if (response.error) notice(response.error.message); else { notice("Visibilité mise à jour."); loadCatalog(); } }; });
      list.querySelectorAll("[data-edit]").forEach(function (button) { button.onclick = function () { openProductEditor(products.filter(function (product) { return product.id === button.dataset.edit; })[0]); }; });
      list.querySelectorAll("[data-stock]").forEach(function (button) { button.onclick = async function () { button.disabled = true; try { var result = await adminCall("set_stock", { productId: button.dataset.stock, inStock: button.dataset.inStock === "true" }); notice(result.message); loadCatalog(); } catch (error) { button.disabled = false; notice(error.message || "Mise à jour du stock impossible"); } }; });
      list.querySelectorAll("[data-delete]").forEach(function (button) { button.onclick = async function () { var product = products.filter(function (item) { return item.id === button.dataset.delete; })[0]; if (!product || !confirm('Supprimer définitivement « ' + product.name + ' » et ses images ? Cette action est irréversible.')) return; button.disabled = true; try { var result = await adminCall("delete_product", { productId: product.id }); notice(result.message); loadCatalog(); } catch (error) { button.disabled = false; notice(error.message || "Suppression impossible"); } }; });
      list.querySelectorAll("[data-variant]").forEach(function (button) { button.onclick = async function () { var update = { approval_status: button.dataset.status, approved_at: button.dataset.status === "approved" ? new Date().toISOString() : null }; var response = await sb().from("afriflow_market_variants").update(update).eq("id", button.dataset.variant); if (response.error) notice(response.error.message); else { notice(button.dataset.status === "approved" ? "Variante approuvée : elle participera à la rotation horaire." : "Variante refusée."); loadAdminList(); } }; });
      list.querySelectorAll("[data-job]").forEach(function (button) { button.onclick = function () { pollAiJob(button.dataset.job); }; });
      jobs.filter(function (job) { return job.status === "queued" || job.status === "processing"; }).slice(0, 3).forEach(function (job) { pollAiJob(job.id); });
    } catch (error) { list.innerHTML = '<p class="af-market-error">Gestion du catalogue indisponible : ' + esc(error.message || error) + "</p>"; }
  }

  window.AfriMarket = { open: open, openPublic: openPublic, closeToWorkspace: closeToWorkspace, openAuth: openAuth, closeAuth: closeAuth, shouldUseMarket: shouldUseMarket };
  window.afriMarketInitial = function () {
    if (window.afriMarketSession) {
      if (shouldUseMarket(window.afriMarketSession)) open({ kind: "authenticated", market: window.afriMarketSession });
      return;
    }
    openPublic();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", window.afriMarketInitial); else window.afriMarketInitial();
})();
