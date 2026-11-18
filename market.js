/* AfriFloW Market — place de marché publique (mise en page inspirée d'Alibaba). */
(function () {
  "use strict";
  var DEF_TITLE = "AfriFloW – De l’Afrique vers le monde", HERO_KEY = "pub:markethero", HERO_LS = "afriflow_markethero_v1", EXT = ["jpg", "jpeg", "webp", "png"];
  function readHeroLocal() { try { return JSON.parse(localStorage.getItem(HERO_LS) || "{}") || {}; } catch (error) { return {}; } }
  /* Le bandeau est toujours repris depuis le serveur : aucune ancienne image locale ne réapparaît au rechargement. */
  var state = { products: [], adminProducts: [], category: "", term: "", context: { kind: "public" }, timers: [], heroTimer: null, heroIdx: 0, imgs: {}, imgErr: {}, hero: {} };

  function el(id) { return document.getElementById(id); }
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
  function clearTimers() { state.timers.forEach(function (t) { clearTimeout(t); }); state.timers = []; clearHero(); }
  function clearHero() { if (state.heroTimer) { clearInterval(state.heroTimer); state.heroTimer = null; } }
  function open(context) {
    state.context = context || { kind: "public" }; hideWorkspace(); render();
    if (roleMode(state.context.market) === "partner_waiting") return;
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
  async function resolveImage(p) {
    if (sb()) {
      try {
        var r = await sb().functions.invoke("afriflow-market-media", { body: { productId: p.id } });
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
  function applyImage(id, url) {
    state.imgs[id] = url;
    document.querySelectorAll('[data-market-image="' + id + '"]').forEach(function (box) {
      var cur = box.querySelector("img.af-photo");
      if (cur) { if (cur.getAttribute("src") !== url) cur.src = url; return; }
      var im = new Image(); im.className = "af-photo"; im.alt = box.dataset.alt || "Produit AfriFloW"; im.src = url;
      im.onload = function () { if (!box.isConnected) return; box.querySelectorAll(".af-market-fallback").forEach(function (n) { n.remove(); }); box.insertBefore(im, box.firstChild); };
    });
  }
  function scheduleImages(force) {
    state.timers.forEach(function (t) { clearTimeout(t); }); state.timers = [];
    state.products.forEach(function (p) {
      if (!force && state.imgs[p.id]) return;
      resolveImage(p).then(function (url) { if (url) applyImage(p.id, url); else { var b = document.querySelector('[data-market-image="' + p.id + '"] .af-fb-hint'); if (!b && isAdmin()) render(); } });
    });
    var untilNextHour = 3600000 - (Date.now() % 3600000) + 250;
    state.timers.push(setTimeout(function () { if (document.body.classList.contains("af-market-mode")) scheduleImages(true); }, untilNextHour));
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
    var m = modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button><div class="af-detail"><div class="af-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + '</div><div class="af-detail-body"><div class="af-product-cat">' + esc(p.category) + "</div><h2>" + esc(p.name) + '</h2><div class="af-product-price">' + esc(formatPrice(p.price, p.currency)) + "</div><p>" + esc(p.description || "Produit sélectionné par AfriFloW.") + '</p><div class="af-actions"><button type="button" class="af-market-primary" data-q>Demander un devis</button><button type="button" class="af-market-secondary" data-x>Fermer</button></div></div></div>');
    m.querySelector(".af-modal-x").onclick = closeModal; m.querySelector("[data-x]").onclick = closeModal;
    m.querySelector("[data-q]").onclick = function () { closeModal(); openQuote(p); };
  }
  function openQuote(p) {
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

  /* ---------- Rendu ---------- */
  function productCard(product, i) {
    return '<article class="af-product" style="--i:' + i + '"><div class="af-product-media af-media" data-market-image="' + esc(product.id) + '" data-alt="' + esc(product.name) + '">' + media(product) + "</div>"
      + '<div class="af-product-body"><div class="af-product-cat">' + esc(product.category) + "</div><h3>" + esc(product.name) + "</h3><p>" + esc(product.description || "Produit sélectionné par AfriFloW.") + '</p><div class="af-product-price">' + esc(formatPrice(product.price, product.currency)) + "</div>"
      + '<button type="button" class="af-market-primary" data-market-detail="' + esc(product.id) + '">Découvrir ce produit</button></div></article>';
  }
  function featuredCard(p) {
    return '<div class="af-feature-wrap"><article class="af-feature"><div class="af-media af-feature-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + "</div>"
      + '<div class="af-feature-body"><span class="af-chip">' + esc(p.category) + "</span><h3>" + esc(p.name) + '</h3><div class="af-product-price af-big">' + esc(formatPrice(p.price, p.currency)) + "</div><p>" + esc(p.description || "Produit sélectionné par AfriFloW.") + "</p>"
      + '<ul class="af-points"><li>Produit sélectionné par AfriFloW</li><li>Devis personnalisé sur demande</li><li>Contact direct avec l’équipe</li></ul>'
      + '<div class="af-actions"><button type="button" class="af-market-primary" data-market-quote="' + esc(p.id) + '">Demander un devis</button><button type="button" class="af-market-secondary" data-market-detail="' + esc(p.id) + '">Voir les détails</button></div></div></article></div>';
  }
  function productsHtml(products) {
    if (!products.length) return '<div class="af-market-empty">Aucun produit ne correspond à votre recherche pour le moment.</div>';
    if (products.length === 1) return featuredCard(products[0]);
    return '<section id="afMarketGrid" class="af-market-grid" data-n="' + Math.min(products.length, 5) + '">' + products.map(productCard).join("") + "</section>";
  }
  function heroHtml() {
    var h = state.hero, bg = okImg(h.img) ? ' style="--hero-img:url(\'' + h.img + '\')"' : "";
    var picks = state.products.slice(0, 4);
    var slides = '<div class="af-slide on"><div class="af-slide-text"><h1>' + titleHtml(h.title) + '</h1><div class="af-actions"><button type="button" class="af-market-primary" data-act="products">Voir les produits</button><button type="button" class="af-ghost" data-act="quote">Demander un devis</button></div></div><div class="af-slide-media"><img class="af-hero-logo" src="logo.png" alt=""></div></div>';
    picks.forEach(function (p) {
      slides += '<div class="af-slide"><div class="af-slide-text"><span class="af-kicker">Produit à la une</span><h2>' + esc(p.name) + '</h2><div class="af-slide-price">' + esc(formatPrice(p.price, p.currency)) + '</div><button type="button" class="af-market-primary" data-market-detail="' + esc(p.id) + '">Découvrir</button></div><div class="af-slide-media af-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + "</div></div>";
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
      + productsHtml(products) + (isAdmin() ? adminPanel() : "");
  }
  function waitContent() {
    return '<section class="af-market-wait"><h1>Espace partenaire en préparation</h1><p>Votre demande de rôle partenaire est enregistrée. Cet espace sera ouvert prochainement. En attendant, vous pouvez revenir à la vitrine publique de la Marketplace.</p><button type="button" class="af-market-primary" id="afPartnerCatalog">Voir la Marketplace</button></section>';
  }
  function top() {
    var workspace = state.context.kind === "workspace";
    return '<header class="af-market-top"><div class="af-market-topline">'
      + '<a class="af-market-brand" href="#" id="afMarketHome"><img src="logo.png" alt=""><b>Afri<span>FloW</span> Marketplace</b></a>'
      + '<form class="af-market-search" id="afMarketSearch"><input id="afMarketSearchInput" value="' + esc(state.term) + '" type="search" placeholder="Rechercher un produit, une catégorie…" aria-label="Rechercher dans la Marketplace"><button>Rechercher</button></form>'
      + (workspace ? '<button type="button" class="af-market-link" id="afMarketBack">Retour à mon espace</button>' : "")
      + (state.context.kind === "authenticated" ? '<button type="button" class="af-market-link" id="afMarketAccount">Mon compte</button>' : "")
      + (state.context.kind === "authenticated" ? '<button type="button" class="af-market-link" id="afMarketSignOut">Déconnexion</button>' : "")
      + "</div></header>";
  }
  function adminPanel() {
    var choices = state.adminProducts.length ? state.adminProducts : state.products;
    var opts = choices.map(function (product) { return '<option value="' + esc(product.id) + '">' + esc(product.name) + "</option>"; }).join("");
    return '<section class="af-market-admin" id="afMarketAdmin"><h2>Administration de la Marketplace</h2><p>Les originaux et variantes sont envoyés depuis ici vers Dropbox. Seules les variantes approuvées entrent dans la rotation horaire.</p>'
      + '<div class="af-market-admin-grid">'
      + '<form class="af-market-admin-card" id="afProductUpload"><h3>Ajouter un original</h3><div id="afDropboxStatus" class="af-market-status">Vérification de Dropbox…</div><button type="button" class="af-market-secondary" id="afDropboxReconnect">Reconnecter Dropbox</button><label>Nom du produit<input required name="name" maxlength="160"></label><label>Catégorie<input required name="category" maxlength="80" value="Découvrir"></label><label>Prix (facultatif)<input name="price" type="number" min="0" step="0.01"></label><label>Devise<select name="currency"><option>XOF</option><option>EUR</option><option>USD</option></select></label><label>Description<textarea name="description" maxlength="4000"></textarea></label><label>Photo originale<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><small>Le produit est ajouté comme brouillon : publiez-le seulement après contrôle.</small><button class="af-market-primary">Envoyer vers Dropbox</button></form>'
      + '<form class="af-market-admin-card" id="afVariantUpload"><h3>Ajouter une variante</h3><label>Produit<select required name="productId">' + opts + '</select></label><label>Image de variante<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Origine<select name="source"><option value="manual">Retouche manuelle</option><option value="ai">Création IA validée manuellement</option></select></label><label>Consigne / provenance<textarea name="prompt" maxlength="2000" placeholder="Ex. conserver fidèlement le produit, éclairage naturel…"></textarea></label><small>Une variante reste invisible tant qu’elle n’est pas approuvée.</small><button class="af-market-primary">Envoyer la variante</button></form>'
      + '<form class="af-market-admin-card" id="afAiRequest"><h3>Pipeline IA</h3><div id="afAiStatus" class="af-market-status">Vérification de la configuration…</div><label>Produit<select required name="productId">' + opts + '</select></label><label>Consigne de transformation<textarea required name="prompt" minlength="8" maxlength="2000" placeholder="Conserver exactement le produit ; modifier seulement l’ambiance…"></textarea></label><small>L’IA travaille uniquement côté serveur. Chaque variante créée reste en attente de votre approbation.</small><button class="af-market-secondary">Créer une variante IA</button></form>'
      + '</div><div id="afMarketAdminList" class="af-market-admin-list"><p>Chargement des brouillons et variantes…</p></div><div id="afMarketQuotes" class="af-market-admin-list"></div></section>';
  }
  function render() {
    var root = el("market-view"); if (!root) return;
    clearHero();
    root.innerHTML = top() + '<main class="af-market-main">' + (roleMode(state.context.market) === "partner_waiting" ? waitContent() : catalogContent()) + "</main>";
    bind(); startHero();
  }
  function startHero() {
    var hero = el("afHero"); if (!hero) return;
    var slides = hero.querySelectorAll(".af-slide"); if (slides.length < 2) return;
    function go(i) {
      state.heroIdx = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("on", k === state.heroIdx); });
      hero.querySelectorAll(".af-dot").forEach(function (d, k) { d.classList.toggle("on", k === state.heroIdx); });
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
    var partner = el("afPartnerCatalog"); if (partner) partner.onclick = function () { state.context.market = { access_mode: "client" }; render(); loadCatalog(); };
    var search = el("afMarketSearch"); if (search) search.onsubmit = function (event) { event.preventDefault(); state.term = el("afMarketSearchInput").value; render(); loadCatalog(false); };
    document.querySelectorAll("[data-market-category]").forEach(function (button) { button.onclick = function () { state.category = button.dataset.marketCategory || ""; render(); loadCatalog(false); }; });
    document.querySelectorAll("[data-market-detail]").forEach(function (button) { button.onclick = function () { var p = productById(button.dataset.marketDetail); if (p) openDetail(p); }; });
    document.querySelectorAll("[data-market-quote]").forEach(function (button) { button.onclick = function () { var p = productById(button.dataset.marketQuote); if (p) openQuote(p); }; });
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
      var publicCatalog = sb().from("afriflow_market_products").select("id,name,description,category,price,currency,created_at,is_active").eq("is_active", true).order("created_at", { ascending: false }).limit(100);
      var allCatalog = isAdmin() ? sb().from("afriflow_market_products").select("id,name,description,category,price,currency,created_at,is_active").order("created_at", { ascending: false }).limit(100) : null;
      var result = allCatalog ? await Promise.all([publicCatalog, allCatalog]) : [await publicCatalog, null];
      if (result[0].error) throw result[0].error;
      if (result[1] && result[1].error) throw result[1].error;
      state.products = result[0].data || [];
      state.adminProducts = result[1] ? result[1].data || [] : [];
      render(); scheduleImages(false); if (isAdmin()) loadAdminList();
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
    var original = el("afProductUpload"); if (original) original.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(original), file = form.get("image"); if (!(file instanceof File) || !file.size) return notice("Choisissez une photo originale."); try { var data = await toBase64(file); var result = await adminCall("upload_original", { product: { name: form.get("name"), category: form.get("category"), price: form.get("price"), currency: form.get("currency"), description: form.get("description") }, data: data, mime: file.type }); notice(result.message); original.reset(); loadCatalog(); } catch (error) { notice(error.message || "Envoi impossible"); } };
    var variant = el("afVariantUpload"); if (variant) variant.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(variant), file = form.get("image"); if (!(file instanceof File) || !file.size) return notice("Choisissez une image de variante."); try { var result = await adminCall("upload_variant", { productId: form.get("productId"), data: await toBase64(file), mime: file.type, source: form.get("source"), prompt: form.get("prompt") }); notice(result.message); variant.reset(); loadAdminList(); } catch (error) { notice(error.message || "Envoi impossible"); } };
    var ai = el("afAiRequest"); if (ai) ai.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(ai); try { var result = await adminCall("request_ai_variant", { productId: form.get("productId"), prompt: form.get("prompt") }); notice(result.message); loadAdminList(); } catch (error) { notice(error.message || "Aucune génération n'a été lancée."); loadAdminList(); } };
    var reconnect = el("afDropboxReconnect"); if (reconnect) reconnect.onclick = async function () { try { var result = await adminCall("dropbox_authorize"); var nonce = crypto.randomUUID(); sessionStorage.setItem("afriflow_dropbox_oauth_state", nonce); window.location.assign(result.url + "&state=" + encodeURIComponent(nonce)); } catch (error) { notice(error.message || "Connexion Dropbox indisponible."); } };
    var query = new URLSearchParams(window.location.search), code = query.get("code"), oauthState = query.get("state"); if (code && oauthState && oauthState === sessionStorage.getItem("afriflow_dropbox_oauth_state")) { sessionStorage.removeItem("afriflow_dropbox_oauth_state"); history.replaceState({}, "", window.location.pathname + window.location.hash); adminCall("dropbox_complete", { code: code }).then(function (result) { notice(result.message); render(); }).catch(function (error) { notice(error.message || "Connexion Dropbox impossible."); }); }
    adminCall("status").then(function (result) { var status = el("afAiStatus"); if (status) status.textContent = result.aiConfigured ? "IA d’images prête côté serveur : chaque résultat reste à approuver avant publication." : "L’IA d’images n’est pas configurée."; var dropbox = el("afDropboxStatus"); if (dropbox) dropbox.textContent = result.dropboxConnected ? "Dropbox est connecté." : "Dropbox doit être reconnecté avant tout envoi."; }).catch(function () { var status = el("afAiStatus"); if (status) status.textContent = "État du connecteur IA indisponible."; });
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
    loadQuotes();
    try {
      var both = await Promise.all([
        sb().from("afriflow_market_products").select("id,name,is_active,created_at").order("created_at", { ascending: false }).limit(100),
        sb().from("afriflow_market_variants").select("id,product_id,approval_status,source,created_at").order("created_at", { ascending: false }).limit(200)
      ]);
      if (both[0].error) throw both[0].error; if (both[1].error) throw both[1].error;
      var products = both[0].data || [], variants = both[1].data || [];
      list.innerHTML = products.length ? products.map(function (product) {
        var sub = variants.filter(function (variant) { return variant.product_id === product.id; });
        return '<div class="af-market-admin-row"><div><b>' + esc(product.name) + "</b><small>Produit " + (product.is_active ? "visible" : "brouillon") + " · " + sub.length + " variante" + (sub.length > 1 ? "s" : "") + "</small>"
          + sub.map(function (variant) { return "<small>Variante " + esc(variant.source) + " · " + statusTag(variant.approval_status) + ' <button type="button" class="af-market-secondary" data-variant="' + esc(variant.id) + '" data-status="approved">Approuver</button> <button type="button" class="af-market-secondary" data-variant="' + esc(variant.id) + '" data-status="rejected">Refuser</button></small>'; }).join("") + "</div>"
          + '<div class="af-market-admin-actions"><button type="button" class="af-market-secondary" data-product="' + esc(product.id) + '" data-active="' + (product.is_active ? "false" : "true") + '">' + (product.is_active ? "Retirer" : "Publier") + "</button></div></div>";
      }).join("") : '<div class="af-market-empty"><b>Aucun brouillon à publier.</b><br><small>Le bouton « Publier » apparaît ici dès qu’un original a été enregistré avec succès dans Dropbox.</small></div>';
      list.querySelectorAll("[data-product]").forEach(function (button) { button.onclick = async function () { var response = await sb().from("afriflow_market_products").update({ is_active: button.dataset.active === "true" }).eq("id", button.dataset.product); if (response.error) notice(response.error.message); else { notice("Visibilité mise à jour."); loadCatalog(); } }; });
      list.querySelectorAll("[data-variant]").forEach(function (button) { button.onclick = async function () { var update = { approval_status: button.dataset.status, approved_at: button.dataset.status === "approved" ? new Date().toISOString() : null }; var response = await sb().from("afriflow_market_variants").update(update).eq("id", button.dataset.variant); if (response.error) notice(response.error.message); else { notice(button.dataset.status === "approved" ? "Variante approuvée : elle participera à la rotation horaire." : "Variante refusée."); loadAdminList(); } }; });
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
