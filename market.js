/* AfriFloW Market — place de marché publique (mise en page inspirée d'Alibaba). */
(function () {
  "use strict";
  var DEF_TITLE = "AfriFloW – De l’Afrique vers le monde", HERO_KEY = "pub:markethero", HERO_LS = "afriflow_markethero_v1", EXT = ["jpg", "jpeg", "webp", "png"];
  function readHeroLocal() { try { return JSON.parse(localStorage.getItem(HERO_LS) || "{}") || {}; } catch (error) { return {}; } }
  /* Le bandeau est toujours repris depuis le serveur : aucune ancienne image locale ne réapparaît au rechargement. */
  var state = { products: [], adminProducts: [], category: "", term: "", context: { kind: "public" }, timers: [], heroTimer: null, rotationTimer: null, rotationStep: 0, heroIdx: 0, imgs: {}, imgErr: {}, hero: {}, aiPolling: {}, partner: null, partnerAdmin: null, disputes: [], disputeFiles: [], disputesAdmin: [], adminDisputeFiles: [], cart: [], favorites: [], currency: { code: "", rates: {}, loading: false } };

  function el(id) { return document.getElementById(id); }
  function loadStored(key, fallback) { try { var value = JSON.parse(localStorage.getItem(key) || ""); return Array.isArray(value) ? value : fallback; } catch (error) { return fallback; } }
  function shopScope() { var email = state.context && state.context.kind === "authenticated" && window.loggedUserEmail; return email ? String(email).trim().toLowerCase().replace(/[^a-z0-9]/g, "_") : "visitor"; }
  function shopKey(name) { return "afriflow_market_" + name + "_v2_" + shopScope(); }
  function loadShop() { state.cart = loadStored(shopKey("cart"), []); state.favorites = loadStored(shopKey("favorites"), []); }
  function persistShop() { try { localStorage.setItem(shopKey("cart"), JSON.stringify(state.cart)); localStorage.setItem(shopKey("favorites"), JSON.stringify(state.favorites)); } catch (error) {} }
  loadShop();
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function icon(name) {
    var paths = {
      search: '<circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path>',
      bag: '<path d="M6 8h12l1 12H5L6 8Z"></path><path d="M9 8a3 3 0 0 1 6 0"></path>',
      user: '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 21a7 7 0 0 1 14 0"></path>',
      back: '<path d="m12 19-7-7 7-7"></path><path d="M5 12h14"></path>',
      heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z"></path>',
      logout: '<path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M14 4h5v16h-5"></path>',
      grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
      news: '<path d="M4 4h16v16H4z"></path><path d="M8 8h8M8 12h8M8 16h5"></path>',
      globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"></path>',
      categories: '<path d="M4 5h7v7H4zM14 5h6v6h-6zM4 15h7v5H4zM14 14h6v6h-6z"></path>',
      down: '<path d="m5 9 7 7 7-7"></path>',
      alert: '<path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 17h.01"></path>',
      camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"></path><circle cx="12" cy="13" r="3"></circle>',
      video: '<rect x="3" y="6" width="14" height="12" rx="2"></rect><path d="m17 10 4-3v10l-4-3"></path>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path>',
      leaf: '<path d="M20 4C9 4 5 9 5 16c8 1 15-3 15-12Z"></path><path d="M4 20c3-6 6-8 11-11"></path>',
      home: '<path d="m3 10 9-7 9 7v11H3z"></path><path d="M9 21v-7h6v7"></path>',
      sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"></path>'
    };
    return '<svg class="af-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.bag) + '</svg>';
  }
  function sb() { return window.__sb; }
  function isAdmin() { return window.USER_ROLE === "admin"; }
  function notice(message) { if (window.toast) window.toast(message); else window.alert(message); }
  function okImg(d) { return typeof d === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(d); }
  function detectedCurrency() {
    var zone = "";
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (error) {}
    if (["Africa/Abidjan", "Africa/Bamako", "Africa/Bissau", "Africa/Conakry", "Africa/Dakar", "Africa/Lome", "Africa/Niamey", "Africa/Ouagadougou"].indexOf(zone) > -1) return "XOF";
    if (["Africa/Bangui", "Africa/Brazzaville", "Africa/Douala", "Africa/Kinshasa", "Africa/Libreville", "Africa/Malabo", "Africa/Ndjamena"].indexOf(zone) > -1) return "XAF";
    if (/^Europe\//.test(zone)) return "EUR";
    if (/^America\//.test(zone)) return "USD";
    return "XOF";
  }
  function preferredCurrency() {
    var saved = "";
    try { saved = String(localStorage.getItem("afriflow_market_currency") || "").toUpperCase(); } catch (error) {}
    return ["XOF", "XAF", "EUR", "USD", "GBP", "CHF", "CAD", "CNY", "JPY", "ZAR"].indexOf(saved) > -1 ? saved : detectedCurrency();
  }
  function currentCurrency() { return state.currency.code || preferredCurrency(); }
  function convertedPrice(value, currency) {
    var base = String(currency || "XOF").toUpperCase(), target = currentCurrency(), amount = Number(value);
    if (!Number.isFinite(amount) || base === target) return amount;
    var rate = Number(state.currency.rates[base]);
    return Number.isFinite(rate) && rate > 0 ? amount * rate : amount;
  }
  function formatPrice(value, currency) {
    if (value == null || value === "") return "Sur demande";
    var target = currentCurrency(), amount = convertedPrice(value, currency);
    try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: target, maximumFractionDigits: target === "XOF" ? 0 : 2 }).format(amount); }
    catch (error) { return amount.toLocaleString("fr-FR") + " " + target; }
  }
  async function loadCurrencyRates() {
    var target = preferredCurrency(), before = state.currency.code + JSON.stringify(state.currency.rates);
    state.currency.code = target;
    if (!sb()) return;
    state.currency.loading = true;
    try {
      var result = await sb().functions.invoke("afriflow-currency", { body: { currency: target } });
      if (result.error || !result.data || result.data.error) throw new Error(result.data && result.data.error || "Taux indisponible");
      state.currency.rates = result.data.rates || {};
    } catch (error) { state.currency.rates = {}; }
    finally {
      state.currency.loading = false;
      if (before !== state.currency.code + JSON.stringify(state.currency.rates) && el("market-view")) render();
    }
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
  function shouldUseMarket(profile) { return ["client", "shareholder_pending", "partner_waiting", "partner_approved"].indexOf(roleMode(profile)) > -1; }
  function productById(id) { return state.products.filter(function (p) { return p.id === id; })[0] || state.adminProducts.filter(function (p) { return p.id === id; })[0]; }

  function hideWorkspace() {
    document.body.classList.add("af-market-mode");
    document.documentElement.classList.remove("af-role-checking");
    var auth = el("auth-screen"); if (auth) auth.classList.add("off");
  }
  function showWorkspace() {
    document.body.classList.remove("af-market-mode");
    var box = el("market-view"); if (box) box.innerHTML = "";
  }
  function clearTimers() { state.timers.forEach(function (t) { clearTimeout(t); }); state.timers = []; if (state.rotationTimer) { clearInterval(state.rotationTimer); state.rotationTimer = null; } clearHero(); }
  function clearHero() { if (state.heroTimer) { clearInterval(state.heroTimer); state.heroTimer = null; } }
  function open(context) {
    state.context = context || { kind: "public" }; loadShop(); state.currency.code = preferredCurrency(); hideWorkspace(); render(); loadCurrencyRates();
    if (roleMode(state.context.market) === "partner_approved") { loadPartnerPortal(); loadCatalog(); return; }
    if (roleMode(state.context.market) === "partner_waiting") { loadCatalog(); return; }
    loadHero(); loadCatalog();
  }
  function openPublic() { open({ kind: "public", market: { access_mode: "public" } }); }
  function closeToWorkspace() {
    var profile=window.afriMarketSession;
    if (!(profile && profile.access_mode === "shareholder_approved") && window.USER_ROLE !== "admin") {
      notice("Cet espace est réservé aux actionnaires approuvés.");
      return;
    }
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
  function announcementMedia(p) {
    if (p.original_path) return '<div class="af-product-media af-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + '<span class="af-promo">Annonce AfriFloW</span></div>';
    return '<div class="af-product-media af-announcement-placeholder"><img src="logo.png" alt=""><span>Veille AfriFloW</span><small>Illustration en préparation</small></div>';
  }
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
      if (box.classList.contains("af-showcase-picture")) {
        box.style.setProperty("--showcase-bg", 'url("' + String(url).replace(/"/g,"%22") + '")');
      }
      var cur = box.querySelector("img.af-photo");
      if (cur) { cur.onload = function () { fitMedia(box, cur); }; if (cur.getAttribute("src") !== url) cur.src = url; else fitMedia(box, cur); return; }
      var im = new Image(); im.className = "af-photo"; im.alt = box.dataset.alt || "Produit AfriFloW"; im.src = url;
      im.onload = function () { if (!box.isConnected) return; fitMedia(box, im); box.querySelectorAll(".af-market-fallback, .af-showcase-placeholder").forEach(function (n) { n.remove(); }); box.insertBefore(im, box.firstChild); };
    });
  }
  function loadInitialImages() {
    /* Only load the first visible cards. Loading every Dropbox link repeatedly
       made a large catalogue perform needless requests on every ten-second turn. */
    // Include all visible welcome-panel headlines, even when they fall beyond
    // the initial catalogue slice. Images still resolve through the secured media API.
    var visibleNews = state.context.kind !== "public" ? state.products.filter(function (item) {
      return isAnnouncement(item) &&
        (item.category === "Actualités mondiales" || item.category === "Veille agroalimentaire");
    }).slice(0, 3) : [];
    var batch = state.products.slice(0, 8).concat(visibleNews.filter(function (item) {
      return !state.products.slice(0, 8).some(function (p) { return p.id === item.id; });
    }));
    // Promotional cards may show products outside the initial eight cards.
    var additional = state.products.filter(function (item) {
      return !isAnnouncement(item) && (item.is_active !== false);
    }).slice(0, 10);
    additional.forEach(function (item) {
      if (!batch.some(function (p) { return p.id === item.id; })) batch.push(item);
    });
    batch.forEach(function (p) {
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

  function announcementSources(p) {
    var raw = p && p.news_sources;
    var articles = Array.isArray(raw) ? raw : raw && Array.isArray(raw.articles) ? raw.articles : [];
    var seen = {};
    var links = articles.filter(function (item) {
      var url = item && String(item.url || "").trim();
      if (!/^https:\/\//i.test(url) || seen[url]) return false;
      seen[url] = true;
      return true;
    }).slice(0, 5);
    if (!links.length) return "";
    return '<section class="af-news-sources" aria-label="Sources des informations"><h3>Sources et articles d’origine</h3><p>Ce bulletin est une synthèse AfriFloW des titres publiés par les médias cités, et non une reproduction intégrale de leurs articles.</p><ul>'
      + links.map(function (item, index) {
          var label = String(item.domain || "Source") + " — " + String(item.title || "Lire l’article original");
          return '<li><a href="' + esc(String(item.url).trim()) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' + esc(label) + ' ↗</a></li>';
        }).join("")
      + '</ul></section>';
  }
  function openDetail(p) {
    if (isAnnouncement(p)) {
      var announcementVisual = p.original_path ? '<div class="af-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + '</div>' : '<div class="af-media af-announcement-placeholder"><img src="logo.png" alt=""><span>Veille AfriFloW</span><small>Illustration en préparation</small></div>';
      var announcement = modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button><div class="af-detail af-announcement-detail">' + announcementVisual + '<div class="af-detail-body"><span class="af-product-cat">ACTUALITÉ AFRIFLOW</span>' + relevantBell(p) + '<h2>' + esc(p.name) + '</h2><p>' + esc(p.description || "") + '</p>' + announcementSources(p) + '<div class="af-actions"><button type="button" class="af-market-secondary" data-x>Fermer</button></div></div></div>');
      announcement.querySelector(".af-modal-x").onclick = closeModal; announcement.querySelector("[data-x]").onclick = closeModal; if (p.original_path) scheduleImages(); return;
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

  function disputeType(v){
    return ({qualite:"Qualité",quantite:"Quantité",livraison:"Livraison",emballage:"Emballage",tracabilite:"Traçabilité",autre:"Autre"})[v]||v;
  }
  function disputeStatus(v){
    return ({open:"Ouverte",in_review:"En cours d’examen",resolved:"Résolue",rejected:"Non retenue"})[v]||v;
  }
  function partnerTraceHtml(orders,reports,products){
    return '<section class="af-partner-card af-trace" aria-label="Traçabilité des allocations"><h2>Traçabilité des produits</h2><p>Informations vérifiées dans les demandes et déclarations AfriFloW. Une étape non enregistrée n’est pas présentée comme réalisée.</p>'
      +(orders.length?orders.map(function(o){
        var p=products.filter(function(x){return x.id===o.product_id})[0]||((Array.isArray(o.product)?o.product[0]:o.product)||{});
        var sales=reports.filter(function(r){return r.order_id===o.id});
        var qty=sales.filter(function(r){return r.status!=="rejected"}).reduce(function(n,r){return n+Number(r.quantity_sold||0)},0);
        return '<details class="af-trace-item"><summary><b>'+esc(p.name||"Produit")+'</b> · '+esc(String(o.quantity_requested||0))+' unités · '+partnerStatus(o.status)+'</summary>'
          +'<div class="af-trace-meta"><span>Identifiant allocation : <code>'+esc(o.id)+'</code></span><span>Origine déclarée : '+esc(p.origin_country||"Non renseignée")+'</span><span>Numéro de lot : non renseigné dans le système actuel</span><span>Quantités vendues déclarées (hors rejets) : '+esc(qty)+'</span></div>'
          +'<ol class="af-trace-steps"><li>Demande enregistrée : '+esc(new Date(o.created_at).toLocaleString("fr-FR"))+'</li>'
          +'<li>Statut actuel : '+esc(partnerStatus(o.status).replace(/<[^>]*>/g,""))+' (dernière mise à jour : '+esc(new Date(o.updated_at||o.created_at).toLocaleString("fr-FR"))+')</li>'
          +sales.map(function(r){return '<li>Vente déclarée le '+esc(new Date(r.created_at).toLocaleString("fr-FR"))+' · '+esc(r.quantity_sold)+' unités · '+esc(disputeStatus(r.status))+'</li>'}).join("")
          +'</ol><p><small>Les dates détaillées de préparation, transport et livraison ne sont pas encore renseignées.</small></p></details>';
      }).join(""):'<p>Aucune allocation à tracer.</p>')+'</section>';
  }
  function partnerAnalyticsHtml(reports,orders){
    function rawMoney(n,c){
      try{return new Intl.NumberFormat("fr-FR",{style:"currency",currency:c,maximumFractionDigits:c==="XOF"||c==="XAF"?0:2}).format(n)}
      catch(e){return Number(n).toLocaleString("fr-FR")+" "+c}
    }
    var accepted=reports.filter(function(r){return r.status!=="rejected"});
    var currencies={};accepted.forEach(function(r){currencies[r.currency||"XOF"]=true});
    var codes=Object.keys(currencies);
    var code=codes.length===1?codes[0]:null;
    var rows=[],now=new Date();
    for(var i=5;i>=0;i--){
      var d=new Date(now.getFullYear(),now.getMonth()-i,1),year=d.getFullYear(),month=d.getMonth();
      var sample=code?accepted.filter(function(r){var x=new Date(r.created_at);return (r.currency||"XOF")===code&&x.getFullYear()===year&&x.getMonth()===month}):[];
      rows.push({label:d.toLocaleDateString("fr-FR",{month:"short"}),total:sample.reduce(function(n,r){return n+Number(r.gross_amount||0)},0)});
    }
    var max=Math.max(1,...rows.map(function(r){return r.total}));
    return '<section class="af-partner-card af-analytics"><h2>Tableau de bord commercial</h2><div class="af-analytics-stats"><span><b>'+orders.length+'</b> Allocations</span><span><b>'+reports.length+'</b> Déclarations de ventes</span><span><b>'+reports.filter(function(r){return r.status==="pending_review"}).length+'</b> En contrôle</span></div>'
      +(code?'<h3>Évolution mensuelle des ventes déclarées ('+esc(code)+')</h3><div class="af-chart" role="img" aria-label="Chiffre d’affaires déclaré des six derniers mois"><div class="af-chart-bars">'
        +rows.map(function(r){return '<div class="af-chart-col" title="'+esc(r.label)+' : '+esc(rawMoney(r.total,code))+'"><span>'+esc(r.total?rawMoney(r.total,code):"0")+'</span><div class="af-chart-bar" style="height:'+Math.max(3,Math.round(r.total/max*110))+'px"></div><small>'+esc(r.label)+'</small></div>'}).join("")+'</div></div>'
        :'<p>Graphique monétaire indisponible : aucune vente enregistrée ou plusieurs devises différentes. Les montants ne sont pas additionnés entre devises.</p>')
      +'<small>Indicateurs calculés uniquement à partir des allocations et ventes déclarées dans AfriFloW ; ils ne remplacent pas une comptabilité validée.</small></section>';
  }
  function partnerDisputesHtml(orders,products){
    var opts=orders.map(function(o){
      var p=products.filter(function(x){return x.id===o.product_id})[0]||((Array.isArray(o.product)?o.product[0]:o.product)||{});
      return '<option value="'+esc(o.id)+'">'+esc(p.name||"Produit")+' · '+esc(o.quantity_requested)+' unités</option>';
    }).join("");
    return '<section class="af-partner-card af-disputes af-partner-section" id="afPartnerDisputeSection"><div class="af-dispute-title"><span class="af-dispute-mark" aria-hidden="true">'+icon("alert")+'</span><div><h2>Signaler un problème de produit</h2><p>Votre signalement est confidentiel et suivi par AfriFloW.</p></div></div><p>Contestez un défaut de qualité, de quantité, d’emballage, de livraison ou de traçabilité. AfriFloW répondra dans votre espace.</p>'
      +'<form id="afPartnerDisputeForm"><label>Allocation concernée<select name="orderId" required><option value="">Choisir une allocation</option>'+opts+'</select></label>'
      +'<label>Nature du problème<select name="category" required><option value="qualite">Qualité du produit</option><option value="quantite">Quantité manquante</option><option value="livraison">Livraison ou transport</option><option value="emballage">Emballage endommagé</option><option value="tracabilite">Origine / lot / traçabilité</option><option value="autre">Autre</option></select></label>'
      +'<label>Référence du lot, si connue<input name="batch" maxlength="100" placeholder="Facultatif — code imprimé sur le sachet"></label>'
      +'<label>Expliquez précisément le problème<textarea name="description" required minlength="15" maxlength="3000" rows="4" placeholder="Produit, quantité, défaut constaté, date, conséquences…"></textarea></label>'
      +'<label class="af-dispute-attachments">Photos ou vidéos du produit (facultatif)<input type="file" name="evidence" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple><small>Jusqu’à 3 fichiers, 25 Mo maximum chacun. Les pièces sont conservées de manière sécurisée par AfriFloW. Seuls le partenaire concerné et l’administration autorisée peuvent y accéder.</small></label>'
      +'<p class="af-partner-form-status" id="afPartnerDisputeStatus" role="status" aria-live="polite"></p>'
      +'<button type="submit" class="af-market-primary"'+(orders.length?"":" disabled") +'>Envoyer la contestation</button></form>'
      +'<h3>Mes contestations ('+state.disputes.length+')</h3>'
      +(state.disputes.length?state.disputes.map(function(d){return '<article class="af-dispute-entry"><div><b>'+esc(disputeType(d.category))+'</b> · '+esc(disputeStatus(d.status))+'</div><small>'+esc(new Date(d.created_at).toLocaleString("fr-FR"))+' · Allocation '+esc(d.order_id)+'</small><p>'+esc(d.description)+'</p>'+(d.batch_reference?'<small>Lot déclaré : '+esc(d.batch_reference)+'</small>':'')+(d.admin_response?'<p><b>Réponse AfriFloW :</b> '+esc(d.admin_response)+'</p>':'')
        +disputeEvidenceHtml(d.id,state.disputeFiles)+'</article>'}).join(""):'<p>Aucune contestation envoyée.</p>')
      +'</section>';
  }

  async function partnerDropboxCall(body){
    var r=await sb().functions.invoke("afriflow-partner-dropbox",{body:body});
    if(r.error||!r.data||r.data.error)throw new Error(r.data&&r.data.error||r.error&&r.error.message||"Service de fichiers AfriFloW temporairement indisponible");
    return r.data;
  }
  function partnerChunkBase64(bytes){
    var s="";for(var i=0;i<bytes.length;i+=16384)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));
    return btoa(s);
  }
  async function partnerDropboxUpload(disputeId,file,onProgress){
    var fileId=crypto.randomUUID(),size=2*1024*1024,offset=0,ticket="",last=null;
    while(offset<file.size){
      var end=Math.min(file.size,offset+size);
      var bytes=new Uint8Array(await file.slice(offset,end).arrayBuffer());
      var action=!ticket?"upload_start":end===file.size?"upload_finish":"upload_append";
      last=await partnerDropboxCall({action:action,disputeId:disputeId,fileId:fileId,fileName:file.name,mime:file.type,size:file.size,offset:offset,ticket:ticket,data:partnerChunkBase64(bytes)});
      ticket=last.ticket||ticket;offset=end;
      if(onProgress)onProgress(offset,file.size);
    }
    if(last&&last.ticket){
      last=await partnerDropboxCall({action:"upload_finish",disputeId:disputeId,fileId:fileId,fileName:file.name,mime:file.type,size:file.size,offset:file.size,ticket:ticket,data:""});
    }
    return last;
  }
  function disputeEvidenceHtml(disputeId,files){
    var items=(files||[]).filter(function(f){return f.dispute_id===disputeId});
    return items.length?'<div class="af-dispute-evidence-list"><strong>Pièces jointes</strong>'
      +items.map(function(f){return '<button type="button" class="af-dispute-evidence-link" data-dispute-file="'+esc(f.object_path||"")+'" data-dropbox-file="'+esc(f.id||"")+'" data-dispute-id="'+esc(disputeId)+'">'+icon(f.content_type.startsWith("video/")?"video":"camera")+'<span>'+esc(f.file_name)+'</span>'+'</button>';}).join("")
      +'</div>':"";
  }
  function bindDisputeEvidenceLinks(root){
    if(!root||!sb())return;
    root.querySelectorAll("[data-dispute-file]").forEach(function(button){
      button.onclick=async function(){
        var path=button.dataset.disputeFile;
        var tab=window.open("about:blank","_blank");
        if(tab){tab.opener=null;tab.document.title="Pièce jointe AfriFloW";}
        try{
          var url;
          if(button.dataset.dropboxFile){
            url=(await partnerDropboxCall({action:"download",disputeId:button.dataset.disputeId,fileId:button.dataset.dropboxFile})).url;
          }else{
            var result=await sb().storage.from("afriflow-partner-evidence").createSignedUrl(path,90);
            if(result.error||!result.data||!result.data.signedUrl)throw new Error(result.error&&result.error.message||"Lien indisponible");
            url=result.data.signedUrl;
          }
          if(tab)tab.location.replace(url);
          else window.location.assign(url);
        }catch(error){if(tab)tab.close();notice("Impossible d’ouvrir la pièce : "+error.message);}
      };
    });
  }
  async function loadPartnerDisputes(){
    if(!sb())return;
    var result=await sb().from("afriflow_partner_disputes").select("id,order_id,category,description,batch_reference,status,admin_response,created_at").order("created_at",{ascending:false}).limit(100);
    if(result.error){notice("Contestations indisponibles : "+result.error.message);return}
    state.disputes=result.data||[];
    var ids=state.disputes.map(function(d){return d.id});
    if(ids.length){
      var media=await Promise.all([
        sb().from("afriflow_partner_dispute_files").select("dispute_id,object_path,file_name,content_type").in("dispute_id",ids),
        sb().from("afriflow_partner_dropbox_files").select("id,dispute_id,dropbox_path,file_name,content_type").in("dispute_id",ids)
      ]);
      state.disputeFiles=(media[0].data||[]).concat(media[1].data||[]);
      if(media[0].error||media[1].error)notice("Certaines pièces jointes sont indisponibles.");
    }else state.disputeFiles=[];
    if(roleMode(state.context.market)==="partner_approved")render();
  }
  async function loadAdminDisputes(target){
    var host=el(target);if(!host||!isAdmin()||!sb())return;
    var r=await sb().from("afriflow_partner_disputes").select("id,partner_user_id,order_id,category,description,batch_reference,status,admin_response,created_at").order("created_at",{ascending:false}).limit(150);
    if(r.error){host.textContent="Contestations indisponibles : "+r.error.message;return}
    if(!host.isConnected)return;
    var fileIds=(r.data||[]).map(function(d){return d.id});
    var fileRows=fileIds.length?await Promise.all([
      sb().from("afriflow_partner_dispute_files").select("dispute_id,object_path,file_name,content_type").in("dispute_id",fileIds),
      sb().from("afriflow_partner_dropbox_files").select("id,dispute_id,dropbox_path,file_name,content_type").in("dispute_id",fileIds)
    ]):[{data:[]},{data:[]}];
    state.adminDisputeFiles=(fileRows[0].data||[]).concat(fileRows[1].data||[]);
    host.innerHTML='<h3>Contestations des partenaires ('+r.data.length+')</h3>'
      +(r.data.length?r.data.map(function(d){
        return '<form class="af-dispute-admin" data-dispute="'+esc(d.id)+'"><b>'+esc(disputeType(d.category))+'</b> · '+esc(d.partner_user_id)+'<small>Allocation : '+esc(d.order_id)+' · '+esc(new Date(d.created_at).toLocaleString("fr-FR"))+'</small><p>'+esc(d.description)+'</p>'
        +(d.batch_reference?'<small>Lot indiqué : '+esc(d.batch_reference)+'</small>':'')
        +disputeEvidenceHtml(d.id,state.adminDisputeFiles)
        +'<label>État<select name="status"><option value="open"'+(d.status==="open"?' selected':'')+'>Ouverte</option><option value="in_review"'+(d.status==="in_review"?' selected':'')+'>En cours</option><option value="resolved"'+(d.status==="resolved"?' selected':'')+'>Résolue</option><option value="rejected"'+(d.status==="rejected"?' selected':'')+'>Non retenue</option></select></label>'
        +'<label>Réponse au partenaire<textarea name="response" maxlength="3000" rows="3">'+esc(d.admin_response||"")+'</textarea></label><button type="submit" class="af-market-secondary">Enregistrer la décision</button></form>';
      }).join(""):'<p>Aucune contestation en attente ou enregistrée.</p>');
    bindDisputeEvidenceLinks(host);
    host.querySelectorAll("form[data-dispute]").forEach(function(form){
      form.onsubmit=async function(ev){
        ev.preventDefault();
        var b=form.querySelector("button"),fields=new FormData(form),status=String(fields.get("status")),response=String(fields.get("response")||"").trim();
        if(["resolved","rejected"].includes(status)&&response.length<10){notice("Indiquez une réponse d’au moins 10 caractères pour clôturer.");return}
        b.disabled=true;
        var result=await sb().from("afriflow_partner_disputes").update({status:status,admin_response:response||null}).eq("id",form.dataset.dispute).select("id");
        if(result.error){notice(result.error.message);b.disabled=false;return}
        try{await partnerDropboxCall({action:"archive",disputeId:form.dataset.dispute});}
        catch(error){notice("Décision enregistrée, mais archive Dropbox à synchroniser : "+error.message);}
        notice("Décision enregistrée.");loadAdminDisputes(target);
      };
    });
  }
  function partnerDisplayName() {
    var profile = window.afriMarketSession || {};
    var complete = String(window.USER_NAME || profile.display_name || "").trim();
    if (!complete) complete = [profile.first_name,profile.last_name].filter(Boolean).join(" ").trim();
    return complete || "Partenaire";
  }
  // The commercial market determines the display currency, not the partner's nationality.
  // Never convert settled or pending earnings without a verified exchange rate.
  function partnerMarketCurrency(code, reports) {
    var table = {
      XOF:"BJ BF CI GW ML NE SN TG".split(" "), XAF:"CM CF CG GA GQ TD".split(" "),
      EUR:"AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA".split(" "),
      USD:"EC FM MH PA PW SV TL US ZW".split(" "), GBP:["GB"], CAD:["CA"],
      GHS:["GH"], NGN:["NG"], GMD:["GM"], GNF:["GN"], SLL:["SL"], LRD:["LR"],
      DZD:["DZ"], MAD:["MA"], TND:["TN"], LYD:["LY"], EGP:["EG"], SDG:["SD"],
      ETB:["ET"], ERN:["ER"], DJF:["DJ"], SOS:["SO"], KES:["KE"], UGX:["UG"], TZS:["TZ"],
      RWF:["RW"], BIF:["BI"], CDF:["CD"], AOA:["AO"], ZMW:["ZM"], MWK:["MW"], MZN:["MZ"],
      ZAR:["ZA"], NAD:["NA"], BWP:["BW"], SZL:["SZ"], LSL:["LS"], MGA:["MG"], MUR:["MU"],
      SCR:["SC"], CVE:["CV"], STN:["ST"], KMF:["KM"], SSP:["SS"], MRU:["MR"], KWD:["KW"],
      AED:["AE"], CNY:["CN"], JPY:["JP"], INR:["IN"], BRL:["BR"], CHF:["CH"], AUD:["AU"],
      NZD:["NZ"], TRY:["TR"], RUB:["RU"], KRW:["KR"], SAR:["SA"], QAR:["QA"]
    };
    var iso=String(code||"").toUpperCase();
    var currency=Object.keys(table).filter(function(key){return table[key].indexOf(iso)>-1;})[0];
    if(currency)return currency;
    var fromSales = Array.from(new Set((reports||[]).map(function(r){return String(r.currency||"").toUpperCase();}).filter(function(value){return /^[A-Z]{3}$/.test(value);})));
    return fromSales.length===1 ? fromSales[0] : null;
  }
  function partnerEarningsHtml(reports, statuses, marketCurrency) {
    var totals=Object.create(null);
    reports.filter(function(r){return statuses.indexOf(r.status)>-1;}).forEach(function(r){
      var currency=String(r.currency||marketCurrency||"").toUpperCase();
      var amount=Number(r.partner_net_amount);
      if(!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(amount)||amount<0)return;
      totals[currency]=(totals[currency]||0)+amount;
    });
    var currencies=Object.keys(totals).sort(function(a,b){return (a===marketCurrency?-1:0)-(b===marketCurrency?-1:0)||a.localeCompare(b);});
    if(!currencies.length){
      return marketCurrency ? '<span class="af-partner-money-line">'+esc(partnerFormatEarnings(0,marketCurrency))+'</span>'
        : '<span class="af-partner-money-line">Devise du marché non renseignée</span>';
    }
    return currencies.map(function(currency){
      return '<span class="af-partner-money-line">'+esc(partnerFormatEarnings(totals[currency],currency))+'</span>';
    }).join("");
  }
  function partnerFormatEarnings(amount, currency){
    var n=Number(amount)||0,decimals=["XOF","XAF","GNF","DJF","KMF","RWF","UGX","JPY","KRW"].indexOf(currency)>-1?0:2;
    var digits=new Intl.NumberFormat("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:decimals}).format(n);
    return digits+" "+(currency==="XOF"||currency==="XAF"?"FCFA":currency);
  }
  function assignedPartnerMarket() {
    var market = state.partner && state.partner.market;
    return {
      name: market && typeof market.market_name==="string" && market.market_name.trim() ? market.market_name.trim() : (state.partner ? "Marché non attribué" : "Chargement du marché…"),
      code: market && /^[A-Z]{2}$/.test(String(market.country_code||"").toUpperCase()) ? String(market.country_code).toUpperCase() : ""
    };
  }
  function partnerLandingHeader() {
    var data=state.partner,reports=data&&data.enabled&&Array.isArray(data.reports)?data.reports:[];
    var market=assignedPartnerMarket(), currency=partnerMarketCurrency(market.code,reports);
    var ready=Boolean(data&&data.enabled), toValidate=partnerEarningsHtml(reports,["pending_review"],currency);
    var validated=partnerEarningsHtml(reports,["validated"],currency);
    return '<section class="af-partner-landing" aria-label="Tableau de bord partenaire">'
      + '<div class="af-partner-wallet" aria-label="Solde commercial du partenaire">'
      + '<div class="af-partner-wallet-top"><img class="af-partner-company-logo" src="logo.png" alt="AfriFloW" loading="lazy"><span class="af-partner-market-tag" aria-label="Marché attribué">'+esc(market.name)+'</span></div>'
      + '<div class="af-partner-wallet-body">'
      + '<h2>Vos gains sur ventes</h2>'
      + '<div class="af-partner-wallet-value" data-af-partner-amount>'+(ready?toValidate:'<span class="af-partner-money-line">Chargement des ventes…</span>')+'</div>'
      + '<p>Part partenaire des ventes déclarées, en attente de validation par AfriFloW.</p>'
      + '<div class="af-partner-wallet-pending"><span>Validé<small>Part partenaire des ventes validées par AfriFloW, non encore réglées</small></span><strong>'+(ready?validated:'—')+'</strong></div>'
      + '</div></div>'
      + '<div class="af-partner-welcome" aria-label="Accueil du partenaire"><div class="af-partner-identity"><strong class="af-partner-full-name">'+esc(partnerDisplayName())+'</strong></div>'
      + '<h1 class="af-partner-welcome-title" aria-label="Bienvenue"><span class="af-welcome-animated af-partner-welcome-word" lang="fr" aria-hidden="true">Bienvenue</span></h1>'
      + '<div class="af-partner-welcome-logo" id="afPartnerCountryLogo"><img src="logo.png" alt="Logo officiel AfriFloW" loading="lazy"></div></div>'
      + '</section>';
  }
  function partnerLandingProducts() {
    var products=filteredProducts().filter(function(item){return !isAnnouncement(item);});
    return '<section class="af-partner-catalog" aria-label="Produits AfriFloW"><div class="af-market-section-head" id="afProductsTop"><h2>Nos produits AfriFloW</h2><p>Découvrez les références disponibles à la vente.</p></div>'
      + productsHtml(products) + '</section>';
  }
  function partnerContent() {
    var data = state.partner;
    if (!data) return '<section class="af-market-wait"><h1>Préparation de votre espace partenaire</h1><p>Nous vérifions vos conditions commerciales sécurisées…</p></section>';
    if (!data.enabled) return '<section class="af-market-wait"><h1>Votre partenariat attend validation</h1><p>AfriFloW doit d’abord définir votre pourcentage commercial et activer votre accès. Vos droits de partenaire ne sont jamais attribués automatiquement.</p><button type="button" class="af-market-secondary" id="afPartnerRefresh">Actualiser</button></section>';
    var terms = data.terms || {}, orders = data.orders || [], reports = data.reports || [], products = data.products || [];
    var pending = reports.filter(function (report) { return report.status === "pending_review"; });
    var gross = reports.filter(function (report) { return report.status !== "rejected"; }).reduce(function (sum, report) { return sum + Number(report.gross_amount || 0); }, 0);
    var due = reports.filter(function (report) { return report.status !== "rejected" && report.status !== "settled"; }).reduce(function (sum, report) { return sum + Number(report.afriflow_amount || 0); }, 0);
    var reportCurrencies={};reports.filter(function(r){return r.status!=="rejected"}).forEach(function(r){reportCurrencies[r.currency||"XOF"]=true});
    var separateCurrencies=Object.keys(reportCurrencies).length>1;
    var grossText=separateCurrencies?"Plusieurs devises":partnerMoney(gross,reports[0]&&reports[0].currency||"XOF");
    var dueText=separateCurrencies?"Plusieurs devises":partnerMoney(due,reports[0]&&reports[0].currency||"XOF");
    var sellable = orders.filter(function (order) { return order.status === "approved" || order.status === "supplied"; });
    var productOpts = products.map(function (product) { return '<option value="' + esc(product.id) + '">' + esc(product.name) + ' · ' + esc(partnerFormatEarnings(product.price,product.currency||"XOF")) + '</option>'; }).join("");
    var orderOpts = sellable.map(function (order) { var product = Array.isArray(order.product) ? order.product[0] : order.product; return '<option value="' + esc(order.id) + '">' + esc(product && product.name || "Produit") + ' · allocation ' + esc(order.quantity_requested) + ' unités</option>'; }).join("");
    var simulatorOpts=products.map(function(product){return '<option value="'+esc(product.id)+'">'+esc(product.name)+' · '+esc(partnerFormatEarnings(product.price,product.currency||"XOF"))+'</option>'}).join("");
    return '<section class="af-partner-portal" id="afPartnerActivity"><div class="af-partner-portal-intro"><h2>Votre activité commerciale</h2><p>Préparez les allocations, déclarez vos ventes et consultez vos résultats.</p><span>Part AfriFloW : ' + esc(Number(terms.commission_rate || 0).toLocaleString("fr-FR")) + ' %</span></div>'
      + '<div class="af-partner-kpis"><article><small>Chiffre d’affaires déclaré</small><b>' + esc(grossText) + '</b><span>Toutes ventes hors refus</span></article><article><small>À reverser à AfriFloW</small><b>' + esc(dueText) + '</b><span>Selon votre taux personnalisé</span></article><article><small>Déclarations à contrôler</small><b>' + pending.length + '</b><span>AfriFloW est déjà alerté</span></article></div>'
      + '<section class="af-partner-card af-sale-simulator af-partner-section" aria-label="Simulateur de vente"><div class="af-sale-sim-header"><h2>Simuler une vente</h2><span class="af-sim-badge">Simulation · Aucun enregistrement</span></div><p>Testez librement un scénario commercial. Les ventes simulées ne modifient ni les stocks, ni le chiffre d’affaires déclaré, ni les commissions dues. Aucune alerte n’est envoyée.</p>'
      +'<form id="afPartnerSimulator" class="af-partner-sim-form"><label>Produit<select required name="productId"><option value="">Choisir un produit</option>'+simulatorOpts+'</select></label><label>Quantité prévue<input name="quantity" type="number" min="1" max="1000000" step="1" required placeholder="Ex. 50"></label><div class="af-sim-catalog-price"><span>Prix catalogue unitaire</span><strong id="afSimulationCatalogPrice">Sélectionnez un produit</strong><small id="afSimulationFormula">Quantité × prix catalogue = chiffre d’affaires prévisionnel</small></div><div id="afSimulationOutput" class="af-sim-output" role="status" aria-live="polite">Sélectionnez un produit et indiquez la quantité pour obtenir une simulation.</div><button type="submit" class="af-market-secondary af-partner-submit">Calculer la simulation</button></form>'
      +'<small>Les prévisions sont indicatives, hors éventuels frais, taxes, remises ou retours. Pour enregistrer une véritable vente, utilisez la déclaration ci-dessous après validation de votre allocation.</small></section>'
      + '<div class="af-partner-grid"><form class="af-partner-card af-partner-section af-partner-order" id="afPartnerOrder"><h2>1. Préparer une commande</h2><p>Sélectionnez les produits souhaités. AfriFloW valide ensuite votre allocation avant toute vente réelle.</p><label>Produit<select required name="productId"><option value="">Sélectionner un produit</option>' + productOpts + '</select></label><label>Quantité demandée<input required name="quantity" type="number" min="1" step="1" placeholder="Ex. 100"></label><label>Message facultatif<textarea name="note" maxlength="1200" placeholder="Lieu de vente, délai souhaité…"></textarea></label><button type="submit" class="af-market-primary af-partner-submit">Envoyer la demande</button><p class="af-partner-form-status" id="afPartnerOrderStatus" aria-live="polite"></p></form>'
      + '<form class="af-partner-card af-partner-report af-partner-section" id="afPartnerSale"><h2>2. Déclarer une vente réelle</h2><p>Une allocation validée est obligatoire. Le prix unitaire est fixé dans cette allocation, sans saisie manuelle.</p><label>Allocation validée<select required name="orderId"><option value="">Sélectionner une allocation</option>' + orderOpts + '</select></label>'+(sellable.length?"":'<p class="af-sale-not-ready">Aucune allocation validée. Vos demandes doivent être approuvées par AfriFloW avant une déclaration réelle. Le simulateur ci-dessus reste accessible.</p>')+'<div class="af-partner-duo"><label>Quantité vendue<input required name="quantity" type="number" min="1" step="1"></label><div class="af-partner-price-readonly"><span>Prix unitaire d’allocation</span><strong id="afPartnerSaleUnitPrice">Sélectionnez une allocation</strong><small>Fixé lors de la commande, non modifiable</small></div></div><label>Note facultative<textarea name="note" maxlength="1200" placeholder="Canal de vente, précision…"></textarea></label><div id="afPartnerCalc" class="af-partner-calc">Le montant net partenaire et la part AfriFloW seront calculés automatiquement.</div><button type="submit" class="af-market-primary af-partner-submit"' + (sellable.length ? "" : " disabled") + '>Déclarer et alerter</button><p class="af-partner-form-status" id="afPartnerSaleStatus" aria-live="polite"></p></form></div>'
      + '<div class="af-partner-mosaic" id="afPartnerInsights"><div class="af-partner-mosaic-heading"><h2>Suivi et accompagnement</h2><p>Vos résultats, allocations, documents et signalements au même endroit.</p></div>'
      + partnerAnalyticsHtml(reports,orders)
      + partnerTraceHtml(orders,reports,products)
      + partnerDisputesHtml(orders,products)
      + '<section class="af-partner-card af-partner-follow"><h2>Suivi des allocations</h2>' + (orders.length ? '<div class="af-partner-list">' + orders.map(function (order) { var product = Array.isArray(order.product) ? order.product[0] : order.product; return '<article><div><b>' + esc(product && product.name || "Produit") + '</b><small>' + esc(order.quantity_requested) + ' unités demandées · ' + esc(partnerMoney(order.unit_price, order.currency)) + ' / unité</small></div>' + partnerStatus(order.status) + '</article>'; }).join("") + '</div>' : '<p class="af-partner-empty">Aucune demande produit pour le moment.</p>') + '</section>'
      + '<section class="af-partner-card af-partner-follow"><h2>Historique financier</h2>' + (reports.length ? '<div class="af-partner-list">' + reports.map(function (report) { var product = Array.isArray(report.product) ? report.product[0] : report.product; return '<article><div><b>' + esc(product && product.name || "Produit") + '</b><small>' + esc(report.quantity_sold) + ' vendu(s) · CA ' + esc(partnerMoney(report.gross_amount, report.currency)) + ' · net partenaire ' + esc(partnerMoney(report.partner_net_amount, report.currency)) + '</small></div>' + partnerStatus(report.status) + '</article>'; }).join("") + '</div>' : '<p class="af-partner-empty">Vos ventes déclarées apparaîtront ici.</p>') + '</section>'
      + '</div>'
      + (terms.payment_notes ? '<aside class="af-partner-note" aria-label="Conditions financières AfriFloW"><b>Note AfriFloW :</b> ' + esc(terms.payment_notes) + '</aside>' : '') + '</section>';
  }
  async function loadPartnerPortal() {
    if (!sb()) return;
    try { state.partner = await partnerCall("dashboard"); render(); await loadPartnerDisputes(); }
    catch (error) { state.partner = { enabled: false, error: error.message || "Portail indisponible" }; render(); notice(error.message || "Portail partenaire indisponible"); }
  }

  function runPartnerSaleSimulation(){
    var form=el("afPartnerSimulator"),out=el("afSimulationOutput"),data=state.partner;
    if(!form||!out||!data)return;
    var selected=form.querySelector('[name="productId"]').value;
    var product=(data.products||[]).find(function(p){return p.id===selected});
    var rawQty=form.querySelector('[name="quantity"]').value.trim();
    var quantity=Number(rawQty),price=product&&product.price!=null?Number(product.price):NaN;
    var currency=String(product&&product.currency||"XOF").toUpperCase();
    var rate=Number(data.terms&&data.terms.commission_rate);
    var priceBox=el("afSimulationCatalogPrice"),formula=el("afSimulationFormula");
    if(priceBox)priceBox.textContent=product&&Number.isFinite(price)&&price>=0?partnerFormatEarnings(price,currency):"Sélectionnez un produit";
    if(formula)formula.textContent=product&&Number.isSafeInteger(quantity)&&quantity>0&&Number.isFinite(price)&&price>=0
      ?quantity.toLocaleString("fr-FR")+" × "+partnerFormatEarnings(price,currency)+" = "+partnerFormatEarnings(Math.round(quantity*price*100)/100,currency)
      :"Quantité × prix catalogue = chiffre d’affaires prévisionnel";
    if(!product||!rawQty||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||!Number.isFinite(price)||price<0||!Number.isFinite(rate)||rate<0||rate>100){
      out.textContent="Sélectionnez un produit et indiquez une quantité valide pour calculer la simulation.";
      return;
    }
    var round=function(n){return Math.round((n+Number.EPSILON)*100)/100};
    var gross=round(quantity*price),share=round(gross*rate/100),net=round(gross-share);
    if(!Number.isFinite(gross)||gross>1000000000000){out.textContent="Montant trop élevé pour cette simulation.";return}
    out.innerHTML='<strong>Simulation — sans enregistrement</strong>'
      +'<div class="af-sim-formula">'+esc(quantity.toLocaleString("fr-FR"))+' × '+esc(partnerFormatEarnings(price,currency))+' = <strong>'+esc(partnerFormatEarnings(gross,currency))+'</strong></div>'
      +'<div class="af-sim-stats"><span>Chiffre d’affaires prévu<b>'+esc(partnerFormatEarnings(gross,currency))+'</b></span><span>Part AfriFloW ('+esc(rate)+' %)<b>'+esc(partnerFormatEarnings(share,currency))+'</b></span><span>Part partenaire ('+esc(round(100-rate))+' %)<b>'+esc(partnerFormatEarnings(net,currency))+'</b></span></div>'
      +'<small>Simulation indicative. Aucun stock, paiement ou montant dû n’a été modifié.</small>';
  }
  function updatePartnerCalculation() {
    var box=el("afPartnerCalc"),form=el("afPartnerSale"),terms=state.partner&&state.partner.terms;
    if(!box||!form||!terms)return;
    var orderId=form.querySelector('[name="orderId"]').value;
    var order=(state.partner&&state.partner.orders||[]).find(function(o){return o.id===orderId&&["approved","supplied"].includes(o.status)});
    var unitBox=el("afPartnerSaleUnitPrice");
    if(!order){
      if(unitBox)unitBox.textContent="Sélectionnez une allocation";
      box.textContent="Sélectionnez une allocation validée pour afficher le calcul.";
      return;
    }
    var unit=Number(order.unit_price),currency=String(order.currency||"XOF").toUpperCase();
    if(unitBox)unitBox.textContent=Number.isFinite(unit)&&unit>=0?partnerFormatEarnings(unit,currency):"Prix indisponible";
    var rawQty=form.querySelector('[name="quantity"]').value;
    var qty=Number(rawQty),rate=Number(terms.commission_rate);
    if(rawQty===""||!Number.isSafeInteger(qty)||qty<1||!Number.isFinite(unit)||unit<0||!Number.isFinite(rate)||rate<0||rate>100){
      box.textContent="Indiquez la quantité vendue pour calculer les montants.";
      return;
    }
    var round=function(n){return Math.round((n+Number.EPSILON)*100)/100};
    var gross=round(qty*unit),share=round(gross*rate/100),net=round(gross-share);
    box.innerHTML='<strong>Calcul de la vente</strong><div class="af-sim-formula">'+esc(qty.toLocaleString("fr-FR"))+' × '+esc(partnerFormatEarnings(unit,currency))+' = <b>'+esc(partnerFormatEarnings(gross,currency))+'</b></div>'
      +'<div class="af-sim-stats"><span>CA déclaré<b>'+esc(partnerFormatEarnings(gross,currency))+'</b></span><span>Part AfriFloW<b>'+esc(partnerFormatEarnings(share,currency))+'</b></span><span>Part partenaire<b>'+esc(partnerFormatEarnings(net,currency))+'</b></span></div>';
  }
  async function accessCall(action,body) {
    var result=await sb().functions.invoke("afriflow-access-admin",{body:Object.assign({action:action},body||{})});
    if(result.error){
      var message=result.error.message||"Service de gestion des accès indisponible";
      try{var details=await result.error.context.json();message=details.error||message;}catch(ignore){}
      throw new Error(message);
    }
    if(result.data&&result.data.error)throw new Error(result.data.error);
    return result.data;
  }
  /* Gestion des comptes : décisions exclusivement exécutées par la fonction admin. */
  async function loadAccessAdmin(targetId) {
    // Reuse the exact same server-controlled approvals in Marketplace and Administration.
    var host=el(targetId||"afAccessAdmin");
    if(!host||!isAdmin()||!sb())return;
    try{
      var data=await accessCall("list");
      if(!host.isConnected)return;
      var users=data.users||[], history=data.history||[];
      var pendingPartners=users.filter(function(u){return u.access_mode==="partner_waiting"});
      var sortedUsers=users.slice().sort(function(a,b){
        return Number(b.access_mode==="partner_waiting")-Number(a.access_mode==="partner_waiting");
      });
      var nClient=users.filter(function(u){return u.access_mode==="client"}).length;
      var nPartner=users.filter(function(u){return u.requested_role==="partner"}).length;
      var nShareholder=users.filter(function(u){return u.requested_role==="shareholder"}).length;
      var legacy=users.filter(function(u){return u.legacy});
      var labels={client:"Client",collaborator:"Ancien collaborateur",partner_waiting:"Partenaire en attente",partner_approved:"Partenaire approuvé",shareholder_pending:"Actionnaire en attente",shareholder_approved:"Actionnaire approuvé"};
      host.innerHTML='<h3>Administration · Gestion des utilisateurs et des accès</h3>'
       +'<p>Demandes de partenariat en attente : <b>'+pendingPartners.length+'</b>. Vérifiez l’identité du demandeur avant de cliquer sur Approuver. Les décisions sont enregistrées côté serveur.</p>'
       +'<p>La connexion Google ne confère aucun droit. Classez les anciens comptes, puis approuvez les demandes vérifiées.</p>'
       +'<div class="af-access-summary"><span>Clients <b>'+nClient+'</b></span><span>Partenaires <b>'+nPartner+'</b></span><span>Actionnaires <b>'+nShareholder+'</b></span><span>Historiques à examiner <b>'+legacy.length+'</b></span></div>'
       +'<label class="af-access-filter">Rechercher un compte<input id="afAccessSearch" type="search" placeholder="Nom ou e-mail" autocomplete="off"></label>'
       +'<div id="afAccessRows">'+(sortedUsers.length?sortedUsers.map(function(u){
         var actions=u.legacy?'<option value="classify_client">Classer Client</option><option value="classify_partner">Classer Partenaire (en attente)</option><option value="classify_shareholder">Classer Actionnaire (en attente)</option>':
           (u.access_mode==="partner_waiting"||u.access_mode==="shareholder_pending"?'<option value="approve">Approuver</option><option value="reject">Refuser / maintenir en attente</option>':
           (u.access_mode==="partner_approved"||u.access_mode==="shareholder_approved"?'<option value="revoke">Révoquer l’accès</option>':""));
         return '<form class="af-access-user" data-access-user="'+esc(u.user_id)+'" data-search="'+esc(((u.email||"")+" "+(u.name||"")).toLowerCase())+'">'
           +'<div><strong>'+esc(u.email||u.user_id)+'</strong><small>'+esc(u.name||"")+' · '+esc(labels[u.access_mode]||u.access_mode)+'</small></div>'
           +(actions?'<select name="decision" aria-label="Décision pour '+esc(u.email||"ce compte")+'">'+actions+'</select><input name="reason" maxlength="500" placeholder="Motif (recommandé)" aria-label="Motif de décision"><button type="submit" class="af-market-secondary">Appliquer</button>':'<span class="af-partner-enabled">Aucune action nécessaire</span>')
           +'</form>';
       }).join(""):'<p>Aucun utilisateur enregistré.</p>')+'</div>'
       +'<h4>Historique des décisions</h4><div class="af-access-history">'
       +(history.length?history.map(function(h){return '<p><time>'+esc(new Date(h.created_at).toLocaleString("fr-FR"))+'</time> · '+esc(h.action)+' · '+esc(h.previous_access||"—")+' → '+esc(h.new_access)+' · '+esc(h.reason||"Sans motif")+'</p>';}).join(""):'<p>Aucune décision enregistrée.</p>')
       +'</div>';
      var search=host.querySelector("#afAccessSearch");
      if(search)search.oninput=function(){var value=search.value.trim().toLowerCase();host.querySelectorAll("[data-access-user]").forEach(function(row){row.hidden=!!value&&!row.dataset.search.includes(value);});};
      host.querySelectorAll("form[data-access-user]").forEach(function(form){
        form.onsubmit=async function(event){
          event.preventDefault();
          var fields=new FormData(form), decision=String(fields.get("decision")||"");
          if(!decision)return;
          var button=form.querySelector('button[type="submit"]'),reason=String(fields.get("reason")||"");
          var signature=decision+"|"+reason;
          // Two deliberate clicks, without unsupported window.confirm() in the app.
          if(form.dataset.confirming!==signature){
            form.dataset.confirming=signature;
            button.textContent="Confirmer la décision";
            button.setAttribute("aria-label","Confirmer "+decision+" pour "+(form.querySelector("strong").textContent||"ce compte"));
            return;
          }
          button.disabled=true;
          try{
            var result=await accessCall("decide",{
              userId:form.dataset.accessUser,decision:decision,reason:reason
            });
            notice(result.message||"Décision enregistrée");loadAccessAdmin(targetId);if(!targetId)loadPartnerAdmin();
          }catch(error){notice(error.message||"Décision impossible");button.disabled=false;}
        };
      });
      host.querySelectorAll("form[data-access-user]").forEach(function(form){
        form.onchange=function(){form.dataset.confirming="";var b=form.querySelector('button[type="submit"]');if(b){b.textContent="Appliquer";b.removeAttribute("aria-label")}};
        var reason=form.querySelector('[name="reason"]');
        if(reason)reason.oninput=form.onchange;
      });
    }catch(error){if(host.isConnected)host.innerHTML='<p class="af-market-error">'+esc(error.message||"Gestion des utilisateurs indisponible")+'</p>';}
  }

  // Commercial conditions shown in both Administration and Marketplace.
  // Saving never approves a partner by itself; the administrator must still
  // explicitly approve the identity through afriflow-access-admin.
  async function loadPartnerTermsAdmin(targetId) {
    var host=el(targetId);
    if(!host||!isAdmin()||!sb())return;
    try {
      var result=await partnerCall("admin_dashboard");
      if(!host.isConnected)return;
      var partners=(result.partners||[]).filter(function(p){return p&&p.user_id});
      host.innerHTML='<h3>Conditions commerciales des partenaires</h3>'
        +'<p>Avant d’approuver un partenaire, définissez la part AfriFloW, les instructions de règlement et cochez Activer. Cette étape ne valide pas le compte automatiquement.</p>'
        +(partners.length?partners.map(function(p){
          var t=p.terms||{},rate=Number(t.commission_rate||0);
          return '<form class="af-partner-admin-row" data-partner-terms="'+esc(p.user_id)+'">'
            +'<div><strong>'+esc(p.email||"Partenaire")+'</strong><small>'+(t.is_enabled?'Conditions commerciales activées':'Conditions commerciales à configurer')+'</small></div>'
            +'<label>Part AfriFloW (%)<input required name="rate" type="number" min="0" max="100" step="0.01" value="'+esc(rate)+'"></label>'
            +'<label class="af-partner-enable"><input type="checkbox" name="enabled"'+(t.is_enabled?' checked':'')+'> Activer</label>'
            +'<label>Instructions de règlement<input name="notes" maxlength="1200" value="'+esc(t.payment_notes||"")+'"></label>'
            +'<button type="submit" class="af-market-secondary">Enregistrer</button></form>';
        }).join(""):'<p>Aucun compte partenaire à configurer.</p>');
      host.querySelectorAll("form[data-partner-terms]").forEach(function(form){
        form.onsubmit=async function(ev){
          ev.preventDefault();
          var button=form.querySelector('button[type="submit"]'),fields=new FormData(form);
          var rate=Number(fields.get("rate"));
          if(!Number.isFinite(rate)||rate<0||rate>100){notice("La part AfriFloW doit être comprise entre 0 et 100 %.");return}
          button.disabled=true;
          try{
            var saved=await partnerCall("admin_save_partner",{
              partnerId:form.dataset.partnerTerms,commissionRate:rate,
              enabled:fields.get("enabled")==="on",
              paymentNotes:String(fields.get("notes")||"")
            });
            notice(saved.message||"Conditions commerciales enregistrées.");
            loadPartnerTermsAdmin(targetId);
          }catch(error){notice(error.message||"Enregistrement impossible.");button.disabled=false}
        };
      });
    }catch(error){
      if(host.isConnected)host.innerHTML='<p class="af-market-error">'+esc(error.message||"Conditions commerciales indisponibles")+'</p>';
    }
  }
  /* Espace de pilotage par marché : les validations utilisent toujours les fonctions
     serveur existantes ; le navigateur ne peut pas accorder des droits d'approbation. */

  async function certificatesCall(action,body){
    var result=await sb().functions.invoke("afriflow-certificates",{body:Object.assign({action:action},body||{})});
    if(result.error){var msg=result.error.message||"Certificats indisponibles";try{var details=await result.error.context.json();msg=details.error||msg}catch(e){}throw new Error(msg)}
    if(result.data&&result.data.error)throw new Error(result.data.error);
    return result.data;
  }
  async function loadCertificateAdmin(targetId){
    var host=el(targetId);if(!host||!isAdmin()||!sb())return;
    try{
      var results=await Promise.all([partnerCall("admin_dashboard"),certificatesCall("admin_list")]);
      if(!host.isConnected)return;
      var data=results[0],certs=results[1].certificates||[];
      var people=(data.partners||[]).map(function(x){return Object.assign({},x,{kind:"partner"})}).concat((data.shareholders||[]).map(function(x){return Object.assign({},x,{kind:"shareholder"})}));
      host.innerHTML='<p>Émission administrative après validation. Les anciens certificats sont révoqués lors d’une réémission.</p>'
      +(people.length?people.map(function(person){
        var active=certs.filter(function(c){return c.holder_user_id===person.user_id&&c.certificate_type===person.kind&&c.status==="active"})[0];
        var roleOk=person.kind==="partner"?(person.terms&&person.terms.is_enabled):person.access_mode==="shareholder_approved";
        return '<article class="af-cert-admin-row"><div><strong>'+esc(person.email||"Membre")+'</strong><small>'+esc(person.kind==="partner"?"Partenaire commercial":"Actionnaire")+(active?' · Certificat émis le '+esc(new Date(active.issued_at).toLocaleDateString("fr-FR")):" · Aucun certificat actif")+'</small></div>'
          +'<div class="af-cert-actions">'+(person.kind==="shareholder"?'<label><input type="checkbox" data-cert-evidence> Justificatifs d’actionnariat vérifiés par la Direction</label>':'')
          +'<button type="button" class="af-market-secondary" data-cert-issue="'+esc(person.user_id)+'" data-cert-type="'+esc(person.kind)+'"'+(roleOk?'':' disabled')+'>'+(active?"Réémettre":"Émettre le certificat")+'</button>'
          +(active?'<label>Motif de révocation<input type="text" data-cert-reason minlength="5" maxlength="300" placeholder="Motif obligatoire"></label><button type="button" class="af-market-secondary" data-cert-revoke="'+esc(active.id)+'">Révoquer</button>':'')+'</div></article>';
      }).join(""):'<p>Aucun partenaire ou actionnaire déclaré.</p>');
      host.querySelectorAll("[data-cert-issue]").forEach(function(btn){btn.onclick=async function(){
        var evidence=btn.closest(".af-cert-admin-row").querySelector("[data-cert-evidence]");
        if(evidence&&!evidence.checked){notice("Vérifiez les justificatifs d’actionnariat avant émission.");return}
        if(btn.dataset.confirm!=="yes"){btn.dataset.confirm="yes";btn.textContent="Confirmer l’émission";return}
        btn.disabled=true;
        try{await certificatesCall("issue",{userId:btn.dataset.certIssue,type:btn.dataset.certType,legalEvidenceConfirmed:!!(evidence&&evidence.checked)});notice("Certificat émis. Le titulaire peut désormais le télécharger dans son profil.");loadCertificateAdmin(targetId)}
        catch(err){notice(err.message||"Émission impossible");btn.disabled=false}
      }});
      host.querySelectorAll("[data-cert-revoke]").forEach(function(btn){btn.onclick=async function(){
        var field=btn.closest(".af-cert-admin-row").querySelector("[data-cert-reason]"),reason=field?field.value.trim():"";
        if(reason.length<5){notice("Le motif doit comporter au moins cinq caractères.");return}
        if(btn.dataset.confirm!=="yes"){btn.dataset.confirm="yes";btn.textContent="Confirmer la révocation";return}
        btn.disabled=true;try{await certificatesCall("revoke",{certificateId:btn.dataset.certRevoke,reason:reason});notice("Certificat révoqué.");loadCertificateAdmin(targetId)}
        catch(err){notice(err.message||"Révocation impossible");btn.disabled=false}
      }});
    }catch(e){if(host.isConnected)host.innerHTML='<p class="af-market-error">Certificats indisponibles : '+esc(e.message||e)+'</p>'}
  }
  async function loadPartnerManagement(targetId){
    var host=el(targetId);
    if(!host||!isAdmin()||!sb())return;
    try{
      var results=await Promise.all([
        partnerCall("admin_dashboard"),
        sb().from("afriflow_partner_markets").select("partner_user_id,market_name,country_code,updated_at"),
        sb().from("afriflow_partner_events").select("id,partner_user_id,source_type,created_at").order("created_at",{ascending:false}).limit(500),
        sb().from("afriflow_partner_event_reads").select("event_id,admin_user_id").limit(1000),
        sb().from("afriflow_partner_disputes").select("id,partner_user_id,order_id,category,description,batch_reference,status,admin_response,created_at").order("created_at",{ascending:false}).limit(500),
        sb().auth.getUser()
      ]);
      if(!host.isConnected)return;
      var data=results[0]||{},marketsRes=results[1],eventsRes=results[2],readsRes=results[3],disputesRes=results[4],identity=results[5];
      var failure=[marketsRes,eventsRes,readsRes,disputesRes].find(function(r){return r.error;});
      if(failure)throw failure.error;
      var adminId=identity.data&&identity.data.user&&identity.data.user.id;
      if(!adminId)throw new Error("Session administrateur indisponible.");
      var seen=new Set((readsRes.data||[]).filter(function(row){return row.admin_user_id===adminId}).map(function(row){return row.event_id}));
      var unread=(eventsRes.data||[]).filter(function(row){return !seen.has(row.id)});
      if(window.AfriPartnerUnreadUpdate)window.AfriPartnerUnreadUpdate(unread.length);
      var orders=data.orders||[],reports=data.reports||[],disputes=disputesRes.data||[],partners=data.partners||[],marketMap={};
      (marketsRes.data||[]).forEach(function(m){marketMap[m.partner_user_id]={name:String(m.market_name||"").trim(),code:String(m.country_code||"").toUpperCase()};});
      var groups=new Map();
      partners.forEach(function(partner){
        var market=marketMap[partner.user_id]||{},name=market.name||"Marché non attribué";
        var key=(market.code||"XX")+"|"+name.toLocaleLowerCase("fr");
        if(!groups.has(key))groups.set(key,{name:name,code:market.code||"",partners:[],orders:[],sales:[],disputes:[],events:[]});
        groups.get(key).partners.push(partner);
      });
      var groupList=Array.from(groups.values()).sort(function(x,y){
        if(x.name==="Marché non attribué")return 1;
        if(y.name==="Marché non attribué")return -1;
        return x.name.localeCompare(y.name,"fr");
      });
      var byPartner=function(id,rows){return rows.filter(function(x){return x.partner_user_id===id})};
      var isOpenDispute=function(d){return !["resolved","closed","rejected"].includes(String(d.status||"").toLowerCase())};
      var isPendingOrder=function(o){return o.status==="requested"};
      var isPendingSale=function(s){return s.status==="pending_review"};
      groupList.forEach(function(group){
        group.partners.forEach(function(p){
          group.orders.push.apply(group.orders,byPartner(p.user_id,orders));
          group.sales.push.apply(group.sales,byPartner(p.user_id,reports));
          group.disputes.push.apply(group.disputes,byPartner(p.user_id,disputes));
          group.events.push.apply(group.events,byPartner(p.user_id,unread));
        });
      });
      var counts={partners:partners.length,markets:groupList.filter(function(g){return !!g.code||g.name!=="Marché non attribué"}).length,
        orders:orders.filter(isPendingOrder).length,sales:reports.filter(isPendingSale).length,
        disputes:disputes.filter(isOpenDispute).length,alerts:unread.length};
      var iconStats={partners:"user",markets:"globe",orders:"grid",sales:"bag",disputes:"alert",alerts:"bell"};
      var summary=[["markets","Marchés"],["partners","Partenaires"],["orders","Demandes à examiner"],
        ["sales","Ventes à contrôler"],["disputes","Contestations ouvertes"],["alerts","Notifications"]];
      var notices={order:"Demande",sale:"Vente",dispute:"Contestation"};
      function countryShape(code){
        if(!/^[A-Z]{2}$/.test(code))return icon("globe");
        return '<img alt="" style="width:42px;height:42px;object-fit:contain;flex-shrink:0" src="https://raw.githubusercontent.com/djaiss/mapsicon/master/all/'+code.toLowerCase()+'/vector.svg" referrerpolicy="no-referrer">';
      }
      function detailButton(kind,index,label,ico){
        return '<button type="button" class="af-market-secondary" data-market-detail="'+kind+'" data-market-index="'+index+'" style="cursor:pointer;display:inline-flex;align-items:center;gap:7px">'+icon(ico)+esc(label)+'</button>';
      }
      function openMarketDetail(kind,index){
        if(!isAdmin())return;
        var g=index===""?null:groupList[Number(index)];
        var rows={markets:groupList.filter(function(x){return x.name!=="Marché non attribué"}),partners:g?g.partners:partners,orders:(g?g.orders:orders).filter(isPendingOrder),sales:(g?g.sales:reports).filter(isPendingSale),disputes:(g?g.disputes:disputes).filter(isOpenDispute),alerts:g?g.events:unread}[kind]||[];
        var labels={requested:"À valider",approved:"Validée",supplied:"Prête à vendre",rejected:"Refusée",closed:"Clôturée",pending_review:"À contrôler",validated:"Validée",settled:"Réglée",open:"Ouverte",in_review:"En cours",resolved:"Résolue"};
        function line(label,value){return value==null||value===""?"":'<p style="margin:6px 0;overflow-wrap:anywhere"><strong>'+esc(label)+' :</strong> '+esc(value)+'</p>';}
        function person(id){return (partners.find(function(p){return p.user_id===id})||{}).email||id;}
        var title=(summary.find(function(x){return x[0]===kind})||[])[1]||"Détails";
        var m=modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button><h3>'+esc(title)+(g?' · '+esc(g.name):'')+'</h3><div style="max-height:65vh;overflow:auto">'+(rows.length?rows.map(function(row){
          var product=Array.isArray(row.product)?row.product[0]:row.product;
          var body=kind==="markets"?line("Marché",row.name)+line("Pays",row.code)+line("Partenaires",row.partners.length):kind==="partners"?line("Partenaire",row.email)+line("Marché",(marketMap[row.user_id]||{}).name||"Non attribué"):line("Partenaire",person(row.partner_user_id))+line("Date",row.created_at?new Date(row.created_at).toLocaleString("fr-FR"):null)+line("Statut",labels[row.status]||row.status)+line("Produit",product&&product.name)+line("Quantité demandée",row.quantity_requested)+line("Chiffre d’affaires",row.gross_amount==null?null:partnerMoney(row.gross_amount,row.currency))+line("Catégorie",row.category?disputeType(row.category):null)+line("Description",row.description)+line("Allocation",row.order_id)+line("Lot",row.batch_reference)+line("Réponse AfriFloW",row.admin_response)+line("Événement",notices[row.source_type]||row.source_type);
          return '<article class="af-market-summary-partner" style="margin:10px 0;padding:14px">'+body+'</article>';
        }).join(""):'<p>Aucun élément correspondant.</p>')+'</div>');
        m.querySelector(".af-modal-x").onclick=closeModal;
        m.querySelector(".af-modal-x").focus();
      }
      host.innerHTML='<div class="af-market-overview">'
        +'<div class="af-market-kpis">'+summary.map(function(info){return '<button type="button" data-market-detail="'+info[0]+'" data-market-index="" class="af-market-kpi" style="cursor:pointer;text-align:left">'+icon(iconStats[info[0]])+'<span>'+esc(info[1])+'</span><strong>'+counts[info[0]]+'</strong></button>';}).join("")+'</div>'
        +'<div class="af-market-overview-filter"><label for="afMarketStatusFilter">Afficher un marché</label><select id="afMarketStatusFilter"><option value="">Tous les marchés</option>'
        +groupList.map(function(g,i){return '<option value="'+i+'">'+esc(g.name)+(g.code?' ('+esc(g.code)+')':'')+'</option>';}).join("")+'</select></div>'
        +(groupList.length?groupList.map(function(group,index){
          var ordersPending=group.orders.filter(isPendingOrder),salesPending=group.sales.filter(isPendingSale),
              disputesOpen=group.disputes.filter(isOpenDispute),alerts=group.events.length;
          return '<section class="af-market-summary'+(alerts?' af-market-summary-attention':'')+'" data-market-summary="'+index+'">'
            +'<div class="af-market-summary-top"><div class="af-market-summary-country">'+countryShape(group.code)+'<div><h4>'+esc(group.name)+'</h4>'
            +'<small>'+(group.code?'Pays : '+esc(group.code):'Pays non renseigné')+' · '+group.partners.length+' partenaire(s)</small></div></div>'
            +(alerts?'<span class="af-market-summary-alert">'+icon("bell")+' '+alerts+' nouvelle(s)</span>':'')+'</div>'
            +'<div class="af-market-summary-stats">'+detailButton("orders",index,ordersPending.length+" demande(s) en attente","grid")+detailButton("sales",index,salesPending.length+" vente(s) à contrôler","bag")+detailButton("disputes",index,disputesOpen.length+" contestation(s) ouverte(s)","alert")+'</div>'
            +'<details class="af-market-summary-details"'+(alerts?' open':'')+'><summary>Voir les partenaires et leurs activités</summary>'
            +'<div class="af-market-summary-partners">'+group.partners.map(function(p){
              var pOrders=byPartner(p.user_id,orders),pSales=byPartner(p.user_id,reports),
                  pDisputes=byPartner(p.user_id,disputes),pUnread=byPartner(p.user_id,unread);
              return '<article class="af-market-summary-partner'+(pUnread.length?' af-market-summary-partner-alert':'')+'"><div class="af-market-summary-partner-head"><div>'
                +'<strong>'+esc(p.email||"Partenaire")+'</strong><small>'
                +pOrders.filter(isPendingOrder).length+' demande(s) · '+pSales.filter(isPendingSale).length+' vente(s) à contrôler · '
                +pDisputes.filter(isOpenDispute).length+' contestation(s) ouverte(s)</small></div>'
                +(pUnread.length?'<span class="af-market-summary-unread">'+pUnread.length+' nouvelle(s)</span>':'')+'</div>'
                +(pUnread.length?'<div class="af-market-summary-events">'+pUnread.map(function(event){
                  return '<span>'+icon(event.source_type==="order"?"grid":event.source_type==="sale"?"bag":"alert")
                    +esc(notices[event.source_type]||"Événement")+' · '+esc(new Date(event.created_at).toLocaleString("fr-FR"))+'</span>';
                }).join("")+'</div><button type="button" class="af-market-secondary" data-partner-mark-seen="'+esc(p.user_id)+'">Marquer comme consultées</button>':'')
                +'</article>';
            }).join("")+'</div></details></section>';
        }).join(""):'<p class="af-market-empty">Aucun marché ni partenaire enregistré.</p>')+'</div>';
      host.querySelectorAll("[data-market-detail]").forEach(function(button){button.onclick=function(){openMarketDetail(button.dataset.marketDetail,button.dataset.marketIndex);};});
      host.querySelectorAll(".af-market-summary-country img").forEach(function(img){img.onerror=function(){var span=document.createElement("span");span.innerHTML=icon("globe");img.replaceWith(span);};});
      var select=host.querySelector("#afMarketStatusFilter");
      if(select)select.onchange=function(){
        host.querySelectorAll("[data-market-summary]").forEach(function(card){
          card.hidden=select.value!==""&&card.dataset.marketSummary!==select.value;
        });
      };
      host.querySelectorAll("[data-partner-mark-seen]").forEach(function(button){
        button.onclick=async function(){
          button.disabled=true;
          var relevant=unread.filter(function(event){return event.partner_user_id===button.dataset.partnerMarkSeen});
          var entries=relevant.map(function(event){return {event_id:event.id,admin_user_id:adminId}});
          if(!entries.length)return;
          var saved=await sb().from("afriflow_partner_event_reads").upsert(entries,{onConflict:"event_id,admin_user_id"});
          if(saved.error){button.disabled=false;notice("Impossible de marquer les notifications : "+saved.error.message);return;}
          loadPartnerManagement(targetId);
        };
      });
    }catch(error){
      if(host.isConnected)host.innerHTML='<p class="af-market-error">Situation des marchés indisponible : '+esc(error.message||error)+'</p>';
    }
  }
  async function loadPartnerAssignmentsAdmin(targetId){
    var host=el(targetId);
    if(!host||!isAdmin()||!sb())return;
    try{
      var results=await Promise.all([
        partnerCall("admin_dashboard"),
        sb().from("afriflow_partner_markets").select("partner_user_id,market_name,country_code")
      ]);
      if(!host.isConnected)return;
      var data=results[0]||{},m=results[1];
      if(m.error)throw m.error;
      var assigned={};
      (m.data||[]).forEach(function(row){assigned[row.partner_user_id]=row;});
      var people=data.partners||[];
      host.innerHTML='<p>Réservez les modifications d’affectation à Administration. Elles ne figurent plus dans le tableau de suivi.</p>'
        +(people.length?people.map(function(p){
          var record=assigned[p.user_id]||{};
          return '<form class="af-admin-market-assignment" data-market-assignment="'+esc(p.user_id)+'">'
            +'<strong>'+esc(p.email||"Partenaire")+'</strong>'
            +'<label>Marché commercial<input name="market" required minlength="2" maxlength="80" value="'+esc(record.market_name||"")+'" placeholder="Ex. Marché togolais"></label>'
            +'<label>Pays du marché<select name="country_code">'+(window.AfriCountries?window.AfriCountries.options(record.country_code||""):'<option value="">Non renseigné</option>')+'</select></label>'
            +'<button type="submit" class="af-market-secondary">Enregistrer</button></form>';
        }).join(""):'<p>Aucun partenaire enregistré.</p>');
      host.querySelectorAll("form[data-market-assignment]").forEach(function(form){
        form.onsubmit=async function(event){
          event.preventDefault();
          var button=form.querySelector('button[type="submit"]'),market=form.querySelector('[name="market"]').value.trim();
          if(market.length<2||market.length>80)return notice("Le marché doit contenir entre 2 et 80 caractères.");
          var current=await sb().auth.getUser(),user=current.data&&current.data.user;
          if(!user)return notice("Session administrateur indisponible.");
          button.disabled=true;
          var row={partner_user_id:form.dataset.marketAssignment,market_name:market,
            country_code:form.querySelector('[name="country_code"]').value||null,
            assigned_by:user.id,updated_at:new Date().toISOString()};
          var r=await sb().from("afriflow_partner_markets").upsert(row,{onConflict:"partner_user_id"});
          if(r.error){button.disabled=false;notice("Affectation impossible : "+r.error.message);return;}
          notice("Marché attribué.");loadPartnerAssignmentsAdmin(targetId);
        };
      });
    }catch(error){if(host.isConnected)host.innerHTML='<p class="af-market-error">Affectations indisponibles : '+esc(error.message||error)+'</p>';}
  }
  async function loadPartnerAdmin() {
    var box = el("afPartnerAdmin"); if (!box || !isAdmin() || !sb()) return;
    try {
      state.partnerAdmin = await partnerCall("admin_dashboard");loadAdminDisputes("afDisputeAdmin"); var partners = state.partnerAdmin.partners || [], shareholders = state.partnerAdmin.shareholders || [];
      var orders = state.partnerAdmin.orders || [], reports = state.partnerAdmin.reports || [];
      function choices(current, values, labels) { return values.map(function (value) { return '<option value="' + value + '"' + (current === value ? " selected" : "") + '>' + labels[value] + '</option>'; }).join(""); }
      var orderLabels = { requested: "À valider", approved: "Validée", supplied: "Prête à vendre", rejected: "Refusée", closed: "Clôturée" }, reportLabels = { pending_review: "À contrôler", validated: "Validée", settled: "Réglée", rejected: "Refusée" };
      box.innerHTML = '<h3>Demandes actionnaires</h3><p>Une demande actionnaire ne donne aucun droit automatiquement. Validez-la seulement après contrôle.</p>' + (shareholders.length ? shareholders.map(function (shareholder) { var approved = shareholder.access_mode === "shareholder_approved"; return '<form class="af-partner-admin-row" data-shareholder="' + esc(shareholder.user_id) + '"><div><b>' + esc(shareholder.email) + '</b><small>' + (approved ? "Accès actionnaire validé" : "En attente de validation") + '</small></div>' + (approved ? '<span class="af-partner-enabled">Validé</span>' : '<button class="af-market-secondary">Valider l’actionnaire</button>') + '</form>'; }).join("") : '<p class="af-partner-empty">Aucune demande actionnaire en attente.</p>')
        + '<h3 class="af-partner-admin-subtitle">Partenaires commerciaux</h3><p>Activez un partenaire uniquement après validation, puis fixez sa part AfriFloW. Les calculs et alertes restent sécurisés côté serveur.</p>' + (partners.length ? partners.map(function (partner) { var term = partner.terms || {}; return '<form class="af-partner-admin-row" data-partner="' + esc(partner.user_id) + '"><div><b>' + esc(partner.email) + '</b><small>' + (term.is_enabled ? "Accès commercial actif" : "En attente d’activation") + '</small></div><label>Part AfriFloW (%)<input required name="rate" type="number" min="0" max="100" step="0.01" value="' + esc(term.commission_rate || 0) + '"></label><label class="af-partner-enable"><input name="enabled" type="checkbox"' + (term.is_enabled ? " checked" : "") + '> Activer</label><label>Instruction de règlement<input name="notes" maxlength="1200" value="' + esc(term.payment_notes || "") + '"></label><button class="af-market-secondary">Enregistrer</button></form>'; }).join("") : '<p class="af-partner-empty">Aucun partenaire n’a encore demandé cet accès.</p>')
        + '<h3 class="af-partner-admin-subtitle">Allocations à traiter</h3>' + (orders.length ? orders.map(function (order) { var product = Array.isArray(order.product) ? order.product[0] : order.product; return '<form class="af-partner-admin-row af-partner-status-row" data-order="' + esc(order.id) + '"><div><b>' + esc(product && product.name || "Produit") + '</b><small>' + esc(order.quantity_requested) + ' unités · partenaire ' + esc((partners.filter(function (p) { return p.user_id === order.partner_user_id; })[0] || {}).email || "") + '</small></div><label>Statut<select name="status">' + choices(order.status, ["requested", "approved", "supplied", "rejected", "closed"], orderLabels) + '</select></label><button class="af-market-secondary">Mettre à jour</button></form>'; }).join("") : '<p class="af-partner-empty">Aucune allocation à traiter.</p>')
        + '<h3 class="af-partner-admin-subtitle">Ventes déclarées</h3>' + (reports.length ? reports.map(function (report) { var product = Array.isArray(report.product) ? report.product[0] : report.product; return '<form class="af-partner-admin-row af-partner-status-row" data-report="' + esc(report.id) + '"><div><b>' + esc(product && product.name || "Produit") + '</b><small>CA ' + esc(partnerMoney(report.gross_amount, report.currency)) + ' · part AfriFloW ' + esc(partnerMoney(report.afriflow_amount, report.currency)) + '</small></div><label>Statut<select name="status">' + choices(report.status, ["pending_review", "validated", "settled", "rejected"], reportLabels) + '</select></label><button class="af-market-secondary">Mettre à jour</button></form>'; }).join("") : '<p class="af-partner-empty">Aucune vente déclarée.</p>');
      box.querySelectorAll("form[data-partner]").forEach(function (form) { form.onsubmit = async function (event) { event.preventDefault(); var button = form.querySelector("button"), fields = new FormData(form); button.disabled = true; try { var result = await partnerCall("admin_save_partner", { partnerId: form.dataset.partner, commissionRate: fields.get("rate"), enabled: fields.get("enabled") === "on", paymentNotes: fields.get("notes") }); notice(result.message); loadPartnerAdmin(); } catch (error) { notice(error.message || "Mise à jour impossible"); button.disabled = false; } }; });
      box.querySelectorAll("form[data-shareholder]").forEach(function (form) { form.onsubmit = async function (event) { event.preventDefault(); var button = form.querySelector("button"); if (!button) return; button.disabled = true; try { var result = await partnerCall("admin_approve_shareholder", { shareholderId: form.dataset.shareholder }); notice(result.message); loadPartnerAdmin(); } catch (error) { notice(error.message || "Validation impossible"); button.disabled = false; } }; });
      box.querySelectorAll("form[data-order]").forEach(function (form) { form.onsubmit = async function (event) { event.preventDefault(); var button = form.querySelector("button"), fields = new FormData(form); button.disabled = true; try { await partnerCall("admin_set_order_status", { orderId: form.dataset.order, status: fields.get("status") }); notice("Allocation mise à jour."); loadPartnerAdmin(); } catch (error) { notice(error.message || "Mise à jour impossible"); button.disabled = false; } }; });
      box.querySelectorAll("form[data-report]").forEach(function (form) { form.onsubmit = async function (event) { event.preventDefault(); var button = form.querySelector("button"), fields = new FormData(form); button.disabled = true; try { await partnerCall("admin_set_report_status", { reportId: form.dataset.report, status: fields.get("status") }); notice("Vente mise à jour."); loadPartnerAdmin(); } catch (error) { notice(error.message || "Mise à jour impossible"); button.disabled = false; } }; });
    } catch (error) { box.innerHTML = '<p class="af-market-error">Gestion des partenaires indisponible.</p>'; }
  }

  /* ---------- Panier et favoris (données stockées uniquement dans ce navigateur) ---------- */
  function cartCount() { return state.cart.reduce(function (sum, row) { return sum + Number(row.quantity || 0); }, 0); }
  function cartTotal() { return state.cart.reduce(function (sum, row) { return sum + Number(row.quantity || 0) * convertedPrice(row.price, row.currency); }, 0); }
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
    var currency = currentCurrency();
  // Guest checkout: present transparent, non-transactional preparatory flow until the
  // merchant is approved and a server-side FedaPay payment session is deployed.
  function openGuestCheckout() {
    if (!state.cart.length) return notice("Votre panier est vide.");
    var html = '<button type="button" class="af-modal-x" aria-label="Fermer">×</button>' +
      '<div class="af-cart af-guest-checkout"><h3>Commander sans compte</h3>' +
      '<p>Préparez votre commande en tant qu’invité. Aucun compte AfriFloW n’est requis.</p>' +
      '<div class="af-guest-step"><strong>1. Livraison</strong>' +
      '<label for="afGuestCountry">Pays de livraison</label><select id="afGuestCountry">' +
      ['Burkina Faso','Togo','Bénin','Côte d’Ivoire','Ghana','Sénégal','France','Belgique','Allemagne','Canada','Autre pays'].map(function(country){return '<option>'+esc(country)+'</option>';}).join('') +
      '</select><p>Les frais et délais de livraison seront confirmés avant tout encaissement.</p></div>' +
      '<div class="af-guest-step"><strong>2. Moyen de paiement souhaité</strong>' +
      '<label><input type="radio" name="afGuestPay" value="card" checked> Carte bancaire (Visa / Mastercard)</label>' +
      '<label><input type="radio" name="afGuestPay" value="mobile"> Mobile Money (selon le pays)</label></div>' +
      '<div class="af-guest-step"><strong>3. Récapitulatif</strong>' +
      '<p>' + esc(cartCount()) + ' article(s) · Total produits estimatif : <b>' + esc(formatPrice(cartTotal(),currentCurrency())) + '</b></p>' +
      '<p>Prix, disponibilité, taxes, conversion et livraison à vérifier côté serveur avant tout paiement.</p></div>' +
      '<div class="af-guest-pending" role="status"><strong>Paiement invité en préparation</strong>' +
      '<p>Le compte marchand AfriFloW est en cours de validation chez FedaPay. Le paiement réel et la confirmation de commande ne sont pas encore disponibles.</p></div>' +
      '<div class="af-actions"><button type="button" class="af-market-secondary" id="afGuestBack">Retour au panier</button></div></div>';
    var m=modal(html);
    m.querySelector(".af-modal-x").onclick=closeModal;
    m.querySelector("#afGuestBack").onclick=function(){closeModal();openCart();};
  }
    var html = '<button type="button" class="af-modal-x" aria-label="Fermer">×</button><div class="af-cart"><h3>Mon panier <span>' + cartCount() + ' article' + (cartCount() > 1 ? "s" : "") + '</span></h3><p>Préparez votre demande : AfriFloW confirmera les prix, stocks et délais avant tout paiement.</p><div class="af-cart-list">' + state.cart.map(function (row) { return '<article><div><b>' + esc(row.name) + '</b><small>' + esc(formatPrice(row.price, row.currency)) + ' / unité</small></div><div class="af-cart-qty"><button type="button" data-cart-minus="' + esc(row.id) + '">−</button><b>' + esc(row.quantity) + '</b><button type="button" data-cart-plus="' + esc(row.id) + '">+</button></div><button type="button" class="af-cart-remove" data-cart-remove="' + esc(row.id) + '">Retirer</button></article>'; }).join("") + '</div><div class="af-cart-total"><span>Total estimatif</span><b>' + esc(formatPrice(cartTotal(), currency)) + '</b><small>Conversion indicative : le devis final reste le montant de référence.</small></div><div class="af-actions"><button type="button" class="af-market-primary" id="afCartGuest">Commander sans compte</button><button type="button" class="af-market-primary" id="afCartQuote">Demander un devis groupé</button><button type="button" class="af-market-secondary" id="afCartClose">Continuer mes achats</button></div></div>';
    var m = modal(html); m.querySelector(".af-modal-x").onclick = closeModal; m.querySelector("#afCartClose").onclick = closeModal;
    m.querySelectorAll("[data-cart-plus]").forEach(function (button) { button.onclick = function () { var row = state.cart.filter(function (x) { return x.id === button.dataset.cartPlus; })[0]; if (row) { row.quantity += 1; persistShop(); closeModal(); openCart(); } }; });
    m.querySelectorAll("[data-cart-minus]").forEach(function (button) { button.onclick = function () { var row = state.cart.filter(function (x) { return x.id === button.dataset.cartMinus; })[0]; if (row) { row.quantity -= 1; if (row.quantity < 1) state.cart = state.cart.filter(function (x) { return x.id !== row.id; }); persistShop(); closeModal(); if (state.cart.length) openCart(); else render(); } }; });
    m.querySelectorAll("[data-cart-remove]").forEach(function (button) { button.onclick = function () { state.cart = state.cart.filter(function (x) { return x.id !== button.dataset.cartRemove; }); persistShop(); closeModal(); if (state.cart.length) openCart(); else render(); }; });
    m.querySelector("#afCartGuest").onclick = openGuestCheckout;
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
    return '<article class="af-product' + (available ? '' : ' is-out-of-stock') + '" style="--i:' + i + '" tabindex="0" role="button" data-market-detail="' + esc(product.id) + '" aria-label="Voir les détails de ' + esc(product.name) + '"><div class="af-product-media af-media" data-market-image="' + esc(product.id) + '" data-alt="' + esc(product.name) + '">' + media(product) + (product.promotion_label || discount ? '<span class="af-promo">' + esc(product.promotion_label || "Offre spéciale") + '</span>' : '') + '<button type="button" class="af-favorite' + (state.favorites.indexOf(product.id) > -1 ? ' on' : '') + '" data-favorite="' + esc(product.id) + '" aria-label="Ajouter aux favoris">' + icon("heart") + '</button>' + (available ? '' : '<span class="af-stock-badge">Rupture de stock</span>') + "</div>"
      + '<div class="af-product-body"><div class="af-product-cat">' + esc(product.category) + '</div><h3>' + esc(product.name) + '</h3><div class="af-price-line"><div class="af-product-price">' + esc(formatPrice(product.price, product.currency)) + '</div>' + (discount ? '<span class="af-old-price">' + esc(formatPrice(product.compare_at_price, product.currency)) + '</span><span class="af-discount">-' + discount + '%</span>' : '') + '</div>'
      + '<div class="af-product-meta">' + (product.minimum_order_quantity ? '<span>Min. ' + esc(product.minimum_order_quantity) + ' unité' + (Number(product.minimum_order_quantity) > 1 ? 's' : '') + '</span>' : '<span>Sur demande</span>') + (product.origin_country ? '<span>' + esc(product.origin_country) + '</span>' : '') + '</div><div class="af-verified"><i>✓</i><b>Certifié</b><span>AfriFloW</span></div>'
      + '<div class="af-card-actions">' + (available ? '<button type="button" class="af-market-primary" data-add-cart="' + esc(product.id) + '">' + icon("bag") + '<span>Ajouter</span></button>' : '<button type="button" class="af-market-unavailable" disabled>Rupture</button>') + '<button type="button" class="af-market-secondary" data-market-detail="' + esc(product.id) + '">Détails</button></div></div></article>';
  }
  function featuredCard(p) {
    var available = inStock(p), discount = discountPercent(p);
    return '<div class="af-feature-wrap"><article class="af-feature' + (available ? '' : ' is-out-of-stock') + '"><div class="af-media af-feature-media" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' + media(p) + (available ? '' : '<span class="af-stock-badge">Rupture de stock</span>') + "</div>"
      + '<div class="af-feature-body"><div class="af-feature-top"><span class="af-chip">' + esc(p.promotion_label || "Produit à la une") + '</span><span class="af-verified"><i>✓</i><b>Certifié</b> <span>AfriFloW</span></span></div><h3>' + esc(p.name) + '</h3><div class="af-feature-pricing"><div class="af-product-price af-big">' + esc(formatPrice(p.price, p.currency)) + '</div>' + (discount ? '<div><span class="af-old-price">' + esc(formatPrice(p.compare_at_price, p.currency)) + '</span><span class="af-discount">-' + discount + '%</span></div>' : '') + '</div><p>' + esc(p.description || "Produit sélectionné par AfriFloW.") + "</p>"
      + '<div class="af-feature-meta">' + (p.minimum_order_quantity ? 'Commande minimum : <b>' + esc(p.minimum_order_quantity) + ' unité' + (Number(p.minimum_order_quantity) > 1 ? 's' : '') + '</b>' : 'Quantité sur demande') + (p.origin_country ? ' <span>· Origine : ' + esc(p.origin_country) + '</span>' : '') + '</div><ul class="af-points"><li>Produit contrôlé par AfriFloW</li><li>Devis personnalisé sur demande</li><li>Contact direct avec l’équipe</li></ul>'
      + '<div class="af-actions">' + (available ? '<button type="button" class="af-market-primary" data-add-cart="' + esc(p.id) + '">' + icon("bag") + '<span>Ajouter au panier</span></button>' : '<button type="button" class="af-market-unavailable" disabled>Rupture de stock</button>') + '<button type="button" class="af-market-secondary" data-market-detail="' + esc(p.id) + '">Voir les détails</button></div></div></article></div>';
  }
  function productsHtml(products) {
    if (!products.length) return '<div class="af-market-empty">Aucun produit ne correspond à votre recherche pour le moment.</div>';
    if (products.length === 1 && !isAnnouncement(products[0])) return featuredCard(products[0]);
    return '<section id="afMarketGrid" class="af-market-grid" data-n="' + Math.min(products.length, 5) + '">' + products.map(function (item, index) { return isAnnouncement(item) ? announcementCard(item) : productCard(item, index); }).join("") + "</section>";
  }
  function relevantBell(item) {
    return item && item.news_relevance === true
      ? '<span class="af-news-relevance" title="Actualité en lien avec les activités AfriFloW" aria-label="Actualité pertinente pour AfriFloW">'+icon("bell")+' Pertinent pour AfriFloW</span>'
      : "";
  }
  function announcementCard(item) {
    return '<article class="af-product af-announcement-card" tabindex="0" role="button" data-market-detail="' + esc(item.id) + '" aria-label="Lire l’annonce : ' + esc(item.name) + '">' + announcementMedia(item) + '<div class="af-product-body"><div class="af-product-cat">Information · actualité</div>' + relevantBell(item) + '<h3>' + esc(item.name) + '</h3><div class="af-product-assurance">Publication officielle AfriFloW</div><p class="af-announcement-text">' + esc(item.description || "Découvrez les nouveautés et informations AfriFloW.") + '</p><div class="af-announcement-label">Lire l’annonce</div></div></article>';
  }
  function announcementsHtml() {
    var items = state.products.filter(isAnnouncement).slice(0, 6);
    if (!items.length) return "";
    return '<section class="af-announcements" id="afMarketNews"><div class="af-market-section-head"><h2>À la une chez AfriFloW</h2><p>Actualités, lancements et informations utiles</p></div><div class="af-market-grid af-announcements-grid">' + items.map(announcementCard).join("") + "</div></section>";
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
    // The welcome panel is rendered for both signed-in members and visitors.
    // Private news are taken only from the catalogue returned under Supabase RLS.
    var member = state.context && state.context.kind !== "public";
    if (!member) {
      return '<aside class="af-ali-side af-welcome-guest" aria-label="Bienvenue sur AfriFloW"><h2 class="af-welcome-animated" aria-hidden="true" lang="fr">Bienvenue</h2></aside>';
    }
    var news = state.products.filter(function (item) {
      return isAnnouncement(item) &&
        (item.category === "Actualités mondiales" || item.category === "Veille agroalimentaire");
    }).slice(0, 3);
    var headline = '<div class="af-side-news-heading"><span aria-hidden="true">'+icon("news")+'</span><h2>Actualités AfriFloW</h2></div>';
    var body = news.length
      ? '<ul class="af-side-news-list">' + news.map(function (item) {
          return '<li><button type="button" class="af-side-news-item" data-market-detail="' + esc(item.id) +
            '" aria-label="Lire l’actualité : ' + esc(item.name) + '">' +
            '<span class="af-side-news-thumb" data-market-image="' + esc(item.id) + '" data-alt="' + esc(item.name) + '">' +
              (state.imgs[item.id]
                ? '<img class="af-photo" src="' + esc(state.imgs[item.id]) + '" alt="" loading="lazy">'
                : '<span class="af-market-fallback"><img src="logo.png" alt="" aria-hidden="true"></span>') +
            '</span>' +
            '<span class="af-side-news-copy">' +
              (item.news_relevance === true ? '<span class="af-side-news-bell" aria-label="Pertinent pour AfriFloW">'+icon("bell")+'</span>' : '') +
              '<span>' + esc(item.name) + '</span>' +
            '</span></button></li>';
        }).join("") + '</ul>'
      : '<p class="af-side-news-empty">Les nouvelles actualités apparaîtront ici après publication.</p>';
    return '<aside class="af-ali-side af-welcome-member" aria-label="Actualités réservées aux membres">' +
      headline + body + '<p class="af-side-news-footnote">Cliquez sur une actualité pour lire l’article et ses sources.</p></aside>';
  }
  function marketCategoryIcon(category) {
    var text = String(category || "").toLocaleLowerCase("fr");
    if (text.indexOf("actualité") > -1 || text.indexOf("veille") > -1) return icon("news");
    if (text.indexOf("fruit") > -1 || text.indexOf("agri") > -1) return icon("leaf");
    if (text.indexOf("bienvenue") > -1 || text.indexOf("afriflow") > -1) return icon("home");
    return icon("categories");
  }
  function catsHtml() {
    var cats = categoryList();
    return '<aside class="af-ali-cats" id="afMarketCategories" aria-label="Catégories"><h3>' + icon("categories") + ' Catégories</h3><div class="af-cat-scroll">' +
      '<button type="button" data-market-category="" class="' + (!state.category ? "on" : "") + '">' + icon("grid") + '<span>Toute la Marketplace</span><i>›</i></button>' +
      cats.map(function (c) { return '<button type="button" data-market-category="' + esc(c) + '" class="' + (state.category === c ? "on" : "") + '">' +
        marketCategoryIcon(c) + '<span>' + esc(c) + '</span><i>›</i></button>'; }).join("") + '</div></aside>';
  }
  function scrollCueHtml() {
    return '<button type="button" class="af-scroll-cue" data-market-scroll="products" title="Défiler vers les produits" aria-label="Défiler vers les produits">' +
      icon("down") + '<span class="af-scroll-cue-label">Défiler</span></button>';
  }

  /* Showcase is generated only from products already visible to the viewer.
     Discounts use real compare_at_price; gift suggestions are not giveaways. */
  function showcasePhoto(product, fallback) {
    if (!product) return '<span class="af-showcase-empty-art" aria-hidden="true">' + icon("leaf") + '</span>';
    return '<span class="af-showcase-picture" data-market-image="' + esc(product.id) + '" data-alt="' + esc(product.name) + '">' +
      (state.imgs[product.id] ? '<img class="af-photo" src="' + esc(state.imgs[product.id]) + '" alt="" loading="lazy">' :
       '<img class="af-showcase-placeholder" src="logo.png" alt="" aria-hidden="true">') + '</span>';
  }
  function openGiftSelection() {
    var eligible = state.products.filter(function (p) {
      return p && !isAnnouncement(p) && p.is_active !== false && inStock(p);
    });
    var giftPackages = eligible.filter(function (p) { return /coffret|cadeau|assortiment|box/i.test(p.name || ""); });
    var items = (giftPackages.length ? giftPackages : eligible).slice(0, 4);
    var actualPack = giftPackages.length > 0;
    var title = actualPack ? 'Cadeaux disponibles chez AfriFloW' : 'Composez votre cadeau AfriFloW';
    var intro = actualPack
      ? 'Découvrez les coffrets et cadeaux proposés dans notre catalogue. Consultez chaque fiche pour connaître sa composition exacte.'
      : 'Voici des produits actuellement proposés par AfriFloW qui peuvent composer un cadeau. Il ne s’agit pas de coffrets préassemblés ni de cadeaux offerts.';
    var cards = items.length ? items.map(function (p) {
      return '<article class="af-gift-content-product">' +
        '<div class="af-gift-content-photo" data-market-image="' + esc(p.id) + '" data-alt="' + esc(p.name) + '">' +
        (state.imgs[p.id] ? '<img class="af-photo" src="' + esc(state.imgs[p.id]) + '" alt="" loading="lazy">' :
          '<img class="af-showcase-placeholder" src="logo.png" alt="" aria-hidden="true">') + '</div>' +
        '<div class="af-gift-content-copy"><h4>' + esc(p.name) + '</h4><p>' + esc(formatPrice(p.price,p.currency)) +
        '</p><button type="button" class="af-market-secondary" data-gift-product="' + esc(p.id) + '">Voir le contenu et les détails</button></div></article>';
    }).join("") : '<p>Aucun cadeau n’est disponible actuellement. Revenez consulter nos nouveautés.</p>';
    var layer = modal('<button type="button" class="af-modal-x" aria-label="Fermer">×</button>' +
      '<div class="af-gift-dialog"><div class="af-gift-dialog-header"><span class="af-showcase-eyebrow">Cadeaux AfriFloW</span>' +
      '<h2>' + esc(title) + '</h2><p>' + esc(intro) + '</p></div>' +
      '<div class="af-gift-content-grid">' + cards + '</div></div>');
    layer.querySelector(".af-modal-x").onclick = closeModal;
    layer.querySelectorAll("[data-gift-product]").forEach(function (button) {
      button.onclick = function () {
        var product = productById(button.dataset.giftProduct);
        if (product) openDetail(product);
      };
    });
    items.forEach(function (p) {
      if (state.imgs[p.id]) return;
      resolveImage(p,0).then(function (url) { if (url && el("afModal")) applyImage(p.id,url); });
    });
  }
  function marketShowcaseHtml() {
    var offers = state.products.filter(function (item) { return !isAnnouncement(item) && item.is_active !== false; });
    var featured = offers.filter(inStock);
    var discounted = featured.filter(function (p) { return discountPercent(p) > 0; })
      .sort(function (a, b) { return discountPercent(b) - discountPercent(a); });
    var promo = discounted[0] || featured.find(function (p) { return !!p.promotion_label; }) || featured[0];
    var gift = featured.find(function (p) { return /coffret|cadeau|assortiment|box|découverte/i.test(p.name || "") && (!promo || p.id !== promo.id); }) ||
      featured.find(function (p) { return !promo || p.id !== promo.id; }) || promo;
    var second = discounted.find(function (p) { return !promo || p.id !== promo.id; }) ||
      featured.find(function (p) { return (!promo || p.id !== promo.id) && (!gift || p.id !== gift.id); }) || gift;
    var promoText = promo ? (discountPercent(promo) ? "−" + discountPercent(promo) + " % sur ce produit" : "Produit à découvrir") : "Les saveurs d’Afrique";
    var bigCard = '<article class="af-showcase-card af-showcase-main"><div class="af-showcase-copy">' +
      '<span class="af-showcase-eyebrow">' + icon("sparkle") + ' À la une AfriFloW</span>' +
      '<h3>' + (promo ? esc(promo.name) : "Découvrez nos produits d’Afrique") + '</h3>' +
      '<p>' + esc(promoText) + '</p>' +
      (promo ? '<button type="button" class="af-showcase-cta" data-market-detail="' + esc(promo.id) + '">Découvrir ' + icon("back") + '</button>' :
        '<button type="button" class="af-showcase-cta" data-market-scroll="products">Voir le catalogue ' + icon("back") + '</button>') +
      '</div><div class="af-showcase-art">' + showcasePhoto(promo) + '</div></article>';
    var promoLabel = second && discountPercent(second) ? "−" + discountPercent(second) + " %" : "Sélection";
    var offerCard = '<article class="af-showcase-card af-showcase-deal">' +
      '<span class="af-showcase-pill">' + esc(promoLabel) + '</span>' +
      '<h3>' + (second ? esc(second.name) : "Nos offres") + '</h3>' +
      showcasePhoto(second) +
      (second ? '<button type="button" data-market-detail="' + esc(second.id) + '" class="af-showcase-text-link">Voir le produit ' + icon("back") + '</button>' : '<span>À découvrir</span>') + '</article>';
    var giftCard = '<article class="af-showcase-card af-showcase-gifts">' +
      '<h3>' + icon("sparkle") + ' Cadeaux</h3>' +
      '<button type="button" class="af-gift-open" data-showcase-gifts aria-label="Découvrir le contenu des cadeaux">' +
        '<span class="af-gift-photo-wrap"><img class="af-gift-art af-gift-photo" src="https://images.pexels.com/photos/31496295/pexels-photo-31496295/free-photo-of-elegant-gift-box-with-green-and-gold-ribbons.jpeg?auto=compress&amp;dpr=1&amp;h=750&amp;w=1260" alt="Photographie d’un paquet cadeau vert aux rubans dorés" loading="lazy" decoding="async"><span class="af-gift-brand" aria-hidden="true"><img src="logo.png" alt=""></span></span>' +
        '<span class="af-gift-open-label">Voir ce que contient la sélection ' + icon("back") + '</span>' +
      '</button>' +
      '<p>Découvrez des produits d’Afrique pour composer un cadeau.</p>' +
      '<small class="af-gift-photo-credit">Photo : <a href="https://www.pexels.com/photo/elegant-gift-box-with-green-and-gold-ribbons-31496295/" target="_blank" rel="noopener noreferrer">Grzegorz Lewandowski / Pexels</a></small>' +
      '</article>';
    // Curated country-specific photos (Wikimedia Commons) and representative strengths.
    // A country is more than one industry: these are illustrative editorial themes.
    var photos = [
      { code:"CIV", country:"Côte d’Ivoire", strength:"Cacao", detail:"Culture du cacao et savoir-faire agricole", file:"Cacao fruit in Côte d'Ivoire (6).JPG", place:"Cacaoyère en Côte d’Ivoire" },
      { code:"TGO", country:"Togo", strength:"Commerce et artisanat", detail:"Marchés et échanges à Lomé", file:"Lomé grand market.jpg", place:"Grand Marché de Lomé, Togo" },
      { code:"GHA", country:"Ghana", strength:"Artisanat", detail:"Poterie et échanges dans les marchés", file:"A typical african market in Northern Ghana.jpg", place:"Marché dans le nord du Ghana" },
      { code:"BEN", country:"Bénin", strength:"Patrimoine culturel", detail:"Ouidah et les traditions vodun", file:"Voodoo Temple (Ouidah, Benin).jpg", place:"Ouidah, Bénin" },
      { code:"TZA", country:"Tanzanie", strength:"Paysages et tourisme", detail:"Le Kilimandjaro et les grands espaces", file:"View of Mt. Kilimanjaro at a distance.jpg", place:"Kilimandjaro, Tanzanie" },
      { code:"KEN", country:"Kenya", strength:"Thé", detail:"Paysages agricoles et plantations de thé", file:"Tea Plantations Kenya.jpg", place:"Plantations de thé, Kenya" },
      { code:"MAR", country:"Maroc", strength:"Artisanat et souks", detail:"Savoir-faire des marchés traditionnels", file:"MoroccoMarrakech souq.jpg", place:"Souk de Marrakech, Maroc" },
      { code:"SEN", country:"Sénégal", strength:"Patrimoine et tourisme", detail:"L’île historique de Gorée", file:"Island of Gorée, Senegal.jpg", place:"Île de Gorée, Sénégal" }
    ];
    var photoHtml = photos.map(function (p, index) {
      var href = 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(p.file).replace(/%20/g, '_');
      var src = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(p.file).replace(/%20/g, '_') + '?width=640';
      return '<figure class="af-africa-frame' + (index === 0 ? ' is-active' : '') + '" data-country="' + esc(p.code) + '">' +
        '<img src="' + esc(src) + '" loading="' + (index === 0 ? 'eager' : 'lazy') + '" decoding="async" alt="' + esc(p.place) + '">' +
        '<div class="af-country-map" data-country-map="' + esc(p.code) + '" aria-hidden="true"></div>' +
        '<figcaption><strong>' + esc(p.country) + ' · ' + esc(p.strength) + '</strong><span>' + esc(p.detail) + '</span>' +
        '<small>' + esc(p.place) + '</small></figcaption></figure>';
    }).join('');
    var credits = '<span>Photos documentaires localisées : </span>' + photos.map(function (p) {
      return '<a href="https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(p.file).replace(/%20/g, '_') +
        '" target="_blank" rel="noopener noreferrer" title="Photographie, auteur et licence sur Wikimedia Commons">' + esc(p.country) + '</a>';
    }).join(' · ');
    var africa = '<article class="af-showcase-card af-africa-gallery"><div class="af-africa-heading"><span class="af-showcase-eyebrow">' +
      icon("globe") + ' Regards d’Afrique</span><h3>Les richesses de nos pays</h3><p>Productions, artisanat, paysages et patrimoine</p></div>' +
      '<div class="af-africa-images" aria-label="Photographies géolocalisées par pays et leurs atouts">' + photoHtml + '</div>' +
      '<div class="af-africa-credits">' + credits + '</div></article>';
    return '<section class="af-market-showcase" aria-label="Sélections AfriFloW et Afrique en images">' +
      bigCard + offerCard + giftCard + africa + '</section>';
  }
  function catalogContent() {
    var products = filteredProducts();
    return '<section class="af-ali">' + catsHtml() + heroHtml() + sideHtml() + scrollCueHtml() + "</section>"
      // Le catalogue est la première section après l'en-tête de la vitrine.
      + '<div class="af-market-section-head" id="afProductsTop"><h2>' + (state.category ? esc(state.category) : "Nos produits") + "</h2><p>" + (products.length ? products.length + " produit" + (products.length > 1 ? "s" : "") : "Catalogue en préparation") + "</p></div>"
      + productsHtml(products)
      + marketShowcaseHtml()
      + announcementsHtml()
      + (isAdmin() ? adminPanel() : "");
  }
  function waitContent() {
    return '<section class="af-market-wait"><h1>Espace partenaire en préparation</h1><p>Votre demande de rôle partenaire est enregistrée. Cet espace sera ouvert prochainement. En attendant, vous pouvez revenir à la vitrine publique de la Marketplace.</p><button type="button" class="af-market-primary" id="afPartnerCatalog">Voir la Marketplace</button></section>';
  }
  function shareholderWaitContent() {
    return '<section class="af-market-wait"><h1>Validation actionnaire en attente</h1><p>Votre demande a bien été reçue. Un administrateur AfriFloW doit la valider avant l’ouverture de tout espace actionnaire. Vous pouvez consulter la Marketplace pendant ce temps.</p><button type="button" class="af-market-primary" id="afShareholderCatalog">Voir la Marketplace</button></section>';
  }
  function top() {
    var workspace = state.context.kind !== "public", partner = ["partner_waiting","partner_approved"].includes(roleMode(state.context.market));
    return '<header class="af-market-top"><div class="af-market-topline">'
      + '<a class="af-market-brand" href="#" id="afMarketHome"><img src="logo.png" alt=""><b>Afri<span>FloW</span> Marketplace</b></a>'
      + (partner ? '<div class="af-market-search af-partner-top-label">Portail commercial partenaire</div>' : '<form class="af-market-search" id="afMarketSearch"><input id="afMarketSearchInput" value="' + esc(state.term) + '" type="search" placeholder="Rechercher un produit, une catégorie…" aria-label="Rechercher dans la Marketplace"><button>' + icon("search") + '<span>Rechercher</span></button></form>')
      + (!partner ? '<label class="af-currency" title="Devise d’affichage"><span>Devise</span><select id="afCurrency" aria-label="Choisir la devise d’affichage"><option value="XOF"' + (currentCurrency() === "XOF" ? " selected" : "") + '>FCFA (XOF)</option><option value="XAF"' + (currentCurrency() === "XAF" ? " selected" : "") + '>FCFA (XAF)</option><option value="EUR"' + (currentCurrency() === "EUR" ? " selected" : "") + '>Euro (EUR)</option><option value="USD"' + (currentCurrency() === "USD" ? " selected" : "") + '>Dollar US (USD)</option><option value="GBP"' + (currentCurrency() === "GBP" ? " selected" : "") + '>Livre sterling (GBP)</option><option value="CHF"' + (currentCurrency() === "CHF" ? " selected" : "") + '>Franc suisse (CHF)</option><option value="CAD"' + (currentCurrency() === "CAD" ? " selected" : "") + '>Dollar canadien (CAD)</option><option value="CNY"' + (currentCurrency() === "CNY" ? " selected" : "") + '>Yuan chinois (CNY)</option><option value="JPY"' + (currentCurrency() === "JPY" ? " selected" : "") + '>Yen japonais (JPY)</option><option value="ZAR"' + (currentCurrency() === "ZAR" ? " selected" : "") + '>Rand sud-africain (ZAR)</option></select></label>' : '')
      + ((window.afriMarketSession && window.afriMarketSession.access_mode==="shareholder_approved" || window.USER_ROLE==="admin") ? '<button type="button" class="af-market-link" id="afMarketBack">' + icon("back") + '<span>Retour à mon espace</span></button>' : '')
      + (state.context.kind === "public" ? '<button type="button" class="af-market-link" id="afMarketSignIn">' + icon("user") + '<span>Se connecter</span></button>' : "")
      + (state.context.kind === "authenticated" ? '<button type="button" class="af-market-link" id="afMarketAccount">' + icon("user") + '<span>Mon compte</span></button>' : "")
      + (!partner ? '<button type="button" class="af-market-cart" id="afMarketCart" aria-label="Ouvrir le panier">' + icon("bag") + '<span>Panier</span><b>' + cartCount() + '</b></button>' : '')
      + (state.context.kind === "authenticated" ? '<button type="button" class="af-market-link" id="afMarketSignOut">' + icon("logout") + '<span>Déconnexion</span></button>' : "")
      + '</div>' + (!partner ? '<nav class="af-market-nav" aria-label="Navigation Marketplace">' +
        '<button type="button" data-market-category="">' + icon("grid") + 'Tout le marché</button>' +
        '<button type="button" data-market-jump="categories">' + icon("categories") + 'Catégories</button>' +
        '<button type="button" data-market-jump="products">' + icon("bag") + 'Nos produits</button>' +
        '<button type="button" data-market-jump="news">' + icon("globe") + 'Actualités</button>' +
        '<button type="button" data-market-favorites>' + icon("heart") + '<span>Favoris (' + state.favorites.length + ')</span></button>' +
        '<span class="af-market-nav-trust">' + icon("sparkle") + 'Produits contrôlés · Support AfriFloW</span></nav>' : '') + "</header>";
  }
  function adminPanel() {
    var choices = state.adminProducts.length ? state.adminProducts : state.products;
    var opts = choices.map(function (product) { return '<option value="' + esc(product.id) + '">' + esc(product.name) + "</option>"; }).join("");
    return '<section class="af-market-admin" id="afMarketAdmin"><h2>Administration de la Marketplace</h2><p>Les originaux et variantes sont envoyés depuis ici vers Dropbox. Seules les variantes approuvées entrent dans la rotation horaire.</p><div class="af-market-admin-quick"><button type="button" class="af-market-primary" id="afPublishAnnouncement">Publier une annonce ou une affiche</button><small>Réservé aux administrateurs : l’affiche apparaîtra dans « À la une chez AfriFloW », sans panier.</small></div>'
      + '<div class="af-market-admin-grid">'
      + '<form class="af-market-admin-card" id="afProductUpload"><h3>Ajouter une fiche</h3><div id="afDropboxStatus" class="af-market-status">Vérification de Dropbox…</div><button type="button" class="af-market-secondary" id="afDropboxReconnect">Reconnecter Dropbox</button><label>Type de fiche<select name="listingType"><option value="product">Produit commercial</option><option value="announcement">Annonce / actualité</option></select></label><label>Nom du produit ou titre de l’annonce<input required name="name" maxlength="160"></label><label>Catégorie<input required name="category" maxlength="80" value="Découvrir"></label><label>Prix (facultatif pour une annonce)<input name="price" type="number" min="0" step="0.01"></label><label>Ancien prix (promotion réelle)<input name="compareAtPrice" type="number" min="0" step="0.01"></label><label>Devise<select name="currency"><option>XOF</option><option>EUR</option><option>USD</option></select></label><label>Quantité minimale (facultatif)<input name="minimumOrderQuantity" type="number" min="1" step="1"></label><label>Pays / origine (facultatif)<input name="originCountry" maxlength="80" placeholder="Ex. Togo"></label><label>Délai ou livraison (facultatif)<input name="deliveryInfo" maxlength="160" placeholder="Ex. Expédition sous 3 à 5 jours"></label><label>Badge promotion (facultatif)<input name="promotionLabel" maxlength="40" placeholder="Ex. Offre de lancement"></label><label>Description<textarea name="description" maxlength="4000"></textarea></label><label>Photo originale<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><small>Les annonces sont séparées des produits et ne sont jamais ajoutées au panier.</small><button class="af-market-primary">Envoyer vers Dropbox</button></form>'
      + '<form class="af-market-admin-card" id="afVariantUpload"><h3>Ajouter une variante</h3><label>Produit<select required name="productId">' + opts + '</select></label><label>Image de variante<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Origine<select name="source"><option value="manual">Retouche manuelle</option><option value="ai">Création IA validée manuellement</option></select></label><label>Consigne / provenance<textarea name="prompt" maxlength="2000" placeholder="Ex. conserver fidèlement le produit, éclairage naturel…"></textarea></label><small>Une variante reste invisible tant qu’elle n’est pas approuvée.</small><button class="af-market-primary">Envoyer la variante</button></form>'
      + '<form class="af-market-admin-card" id="afAiRequest"><h3>Pipeline IA</h3><div id="afAiStatus" class="af-market-status">Vérification de la configuration…</div><label>Produit<select required name="productId">' + opts + '</select></label><label>Consigne de transformation<textarea required name="prompt" minlength="8" maxlength="2000" placeholder="Conserver exactement le produit ; modifier seulement l’ambiance…"></textarea></label><small>L’IA travaille uniquement côté serveur. Chaque variante créée reste en attente de votre approbation.</small><button class="af-market-secondary">Créer une variante IA</button></form>'
      + '</div><div id="afMarketAdminList" class="af-market-admin-list"><p>Chargement des brouillons et variantes…</p></div><div id="afMarketQuotes" class="af-market-admin-list"></div><div id="afAccessAdmin" class="af-partner-admin"><p>Chargement des utilisateurs et des accès…</p></div><div id="afPartnerAdmin" class="af-partner-admin"><p>Chargement des partenaires commerciaux…</p></div><div id="afDisputeAdmin" class="af-partner-admin"><p>Chargement des contestations…</p></div></section>';
  }
  // Translations in widely used official languages; independent of the user's locale.
  // Keep the accessible label stable while the decorative text is animated.
  var welcomeTranslations = [
    ["fr", "Bienvenue"], ["en", "Welcome"], ["pt", "Bem-vindo"],
    ["es", "Bienvenido"], ["ar", "أهلاً وسهلاً"], ["sw", "Karibu"],
    ["de", "Willkommen"], ["it", "Benvenuto"], ["nl", "Welkom"],
    ["zh", "欢迎"], ["hi", "स्वागत है"], ["ja", "ようこそ"],
    ["ko", "환영합니다"], ["ru", "Добро пожаловать"], ["tr", "Hoş geldiniz"],
    ["id", "Selamat datang"], ["el", "Καλώς ήρθατε"], ["he", "ברוכים הבאים"]
  ];
  var welcomeTimer = null;
  function clearWelcomeAnimation() {
    if (welcomeTimer !== null) clearTimeout(welcomeTimer);
    welcomeTimer = null;
  }
  function startWelcomeAnimation() {
    clearWelcomeAnimation();
    var title = document.querySelector("#market-view .af-welcome-animated");
    if (!title) return;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { title.textContent = "Bienvenue"; return; }
    var words = welcomeTranslations, index = 0;
    var segmenter = typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
    function characters(word) {
      return segmenter ? Array.from(segmenter.segment(word), function (part) { return part.segment; }) : Array.from(word);
    }
    function step() {
      if (!title.isConnected) { clearWelcomeAnimation(); return; }
      var entry = words[index], letters = characters(entry[1]), visible = 0, deleting = false;
      title.lang = entry[0];
      title.dir = entry[0] === "ar" || entry[0] === "he" ? "rtl" : "ltr";
      title.textContent = "";
      function tick() {
        if (!title.isConnected) { clearWelcomeAnimation(); return; }
        if (document.hidden) {
          welcomeTimer = setTimeout(tick, 1000);
          return;
        }
        if (!deleting) {
          visible = Math.min(visible + 1, letters.length);
          title.textContent = letters.slice(0, visible).join("");
          if (visible === letters.length) {
            deleting = true;
            welcomeTimer = setTimeout(tick, 1800);
          } else welcomeTimer = setTimeout(tick, 95);
        } else {
          visible = Math.max(visible - 1, 0);
          title.textContent = letters.slice(0, visible).join("");
          if (visible === 0) {
            index = (index + 1) % words.length;
            welcomeTimer = setTimeout(step, 380);
          } else welcomeTimer = setTimeout(tick, 60);
        }
      }
      tick();
    }
    step();
  }
  var africaGalleryTimer = null;
  function startAfricaGallery() {
    if (africaGalleryTimer) clearInterval(africaGalleryTimer);
    africaGalleryTimer = null;
    var gallery = document.querySelector("#market-view .af-africa-images");
    if (!gallery) return;
    var frames = Array.from(gallery.querySelectorAll(".af-africa-frame"));
    if (!frames.length) return;
    var current = 0;
    // GeoJSON outlines are genuine country borders, not decorative approximations.
    frames.forEach(function(frame){
      var code = frame.getAttribute("data-country");
      var target = frame.querySelector("[data-country-map]");
      if (!code || !target) return;
      fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries/" + code + ".geo.json")
        .then(function(response){ if(!response.ok) throw Error("Carte indisponible"); return response.json(); })
        .then(function(json){
          if (!target.isConnected || !json.geometry) return;
          var polygons = json.geometry.type === "Polygon" ? [json.geometry.coordinates] :
            json.geometry.type === "MultiPolygon" ? json.geometry.coordinates : [];
          var dots = [];
          polygons.forEach(function(poly){poly.forEach(function(ring){ring.forEach(function(pt){
            if(Array.isArray(pt)&&Number.isFinite(pt[0])&&Number.isFinite(pt[1])) dots.push(pt);
          });});});
          if(!dots.length)return;
          var minX=Math.min.apply(null,dots.map(function(p){return p[0];}));
          var maxX=Math.max.apply(null,dots.map(function(p){return p[0];}));
          var minY=Math.min.apply(null,dots.map(function(p){return p[1];}));
          var maxY=Math.max.apply(null,dots.map(function(p){return p[1];}));
          var scale=Math.min(85/Math.max(maxX-minX,.001),85/Math.max(maxY-minY,.001));
          var dx=(100-(maxX-minX)*scale)/2,dy=(100-(maxY-minY)*scale)/2;
          var path=polygons.map(function(poly){return poly.map(function(ring){
            return ring.map(function(pt,i){
              var x=(dx+(pt[0]-minX)*scale).toFixed(2);
              var y=(100-dy-(pt[1]-minY)*scale).toFixed(2);
              return (i?"L":"M")+x+" "+y;
            }).join(" ")+" Z";
          }).join(" ");}).join(" ");
          var svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
          svg.setAttribute("viewBox","0 0 100 100");svg.setAttribute("focusable","false");
          var shape=document.createElementNS("http://www.w3.org/2000/svg","path");
          shape.setAttribute("d",path);svg.appendChild(shape);target.appendChild(svg);
        }).catch(function(){/* Country label remains visible if maps cannot load. */});
    });
    africaGalleryTimer = setInterval(function(){
      if (document.hidden || !gallery.isConnected) return;
      frames[current].classList.remove("is-active");
      current = (current+1)%frames.length;
      frames[current].classList.add("is-active");
    }, 6500);
  }
  function render() {
    var root = el("market-view"); if (!root) return;
    clearHero();
    if (africaGalleryTimer) clearInterval(africaGalleryTimer);
    africaGalleryTimer = null;
    clearWelcomeAnimation();
    var mode = roleMode(state.context.market);
    root.innerHTML = top() + '<main class="af-market-main">' + (mode === "partner_approved"
      ? '<div class="af-partner-top-section">'+partnerLandingHeader()+'<button type="button" class="af-partner-scroll-cue" data-partner-scroll="afProductsTop" aria-label="Défiler vers les produits">'+icon("down")+'<span>Défiler</span></button></div>'
        + partnerLandingProducts()
        + partnerContent()
      : mode === "partner_waiting"
      ? '<section class="af-ali">' + catsHtml() + heroHtml() + sideHtml() + scrollCueHtml() + '</section>' + waitContent() + announcementsHtml()
      : mode === "shareholder_pending"
      ? '<section class="af-ali">' + catsHtml() + heroHtml() + sideHtml() + scrollCueHtml() + '</section>' + shareholderWaitContent() + announcementsHtml()
      : catalogContent()) + "</main>";
    bind();
    if (mode === "partner_approved" && window.AfriMarketCountryLogo) {
      var market = assignedPartnerMarket();
      window.AfriMarketCountryLogo.mount(el("afPartnerCountryLogo"),market.code,market.name);
    }
    startHero(); startWelcomeAnimation(); startAfricaGallery();
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
    state.heroTimer = setInterval(function () { if (!paused && !document.hidden) go(state.heroIdx + 1); }, 10000);
  }
  function bind() {
    function scrollMarketTo(id) {
      var target = el(id);
      if (!target && id === "afProductsTop") target = document.querySelector("#market-view .af-ali + *");
      if (!target) return;
      var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var top=target.getBoundingClientRect().top+window.scrollY-96;
      if (reduced) { window.scrollTo(0,Math.max(0,top)); return; }
      // Explicit eased animation for hosts where native scrollIntoView is abrupt.
      var from=window.scrollY,to=Math.max(0,top),start=null,duration=Math.min(950,Math.max(420,Math.abs(to-from)*0.65));
      function frame(now){
        if(start===null)start=now;
        var t=Math.min(1,(now-start)/duration);
        var ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
        window.scrollTo(0,from+(to-from)*ease);
        if(t<1)window.requestAnimationFrame(frame);
      }
      window.requestAnimationFrame(frame);
    }
    document.querySelectorAll("[data-market-jump]").forEach(function (button) {
      button.onclick = function () {
        var jump = button.dataset.marketJump;
        scrollMarketTo(jump === "categories" ? "afMarketCategories" : jump === "news" ? "afMarketNews" : "afProductsTop");
      };
    });
    document.querySelectorAll("[data-partner-scroll]").forEach(function(button){
      button.onclick=function(){scrollMarketTo(button.dataset.partnerScroll);};
    });
    bindDisputeEvidenceLinks(el("market-view"));
    document.querySelectorAll("[data-market-scroll]").forEach(function (button) {
      button.onclick = function () { scrollMarketTo("afProductsTop"); };
    });
    document.querySelectorAll("[data-showcase-gifts]").forEach(function (button) {
      button.onclick = openGiftSelection;
    });
    document.querySelectorAll(".af-showcase-picture[data-market-image]").forEach(function (box) {
      var url = state.imgs[box.dataset.marketImage];
      if (url) box.style.setProperty("--showcase-bg", 'url("' + String(url).replace(/"/g,"%22") + '")');
    });
    var home = el("afMarketHome"); if (home) home.onclick = function (event) { event.preventDefault(); state.category = ""; state.term = ""; render(); loadCatalog(); };
    var back = el("afMarketBack"); if (back) back.onclick = closeToWorkspace;
    var signIn = el("afMarketSignIn"); if (signIn) signIn.onclick = function () { openAuth("login"); };
    var sideIn = el("afSideSignIn"); if (sideIn) sideIn.onclick = function () { openAuth("login"); };
    var sideUp = el("afSideSignUp"); if (sideUp) sideUp.onclick = function () { openAuth("register"); };
    [el("afMarketProfile"), el("afMarketAccount")].forEach(function (button) { if (button) button.onclick = function () { if (window.AfriProfileOpen) window.AfriProfileOpen(); else notice("Votre profil est indisponible pour le moment."); }; });
    var signOut = el("afMarketSignOut"); if (signOut) signOut.onclick = function () { if (window.logout) window.logout(); };
    var cart = el("afMarketCart"); if (cart) cart.onclick = openCart;
    var currency = el("afCurrency"); if (currency) currency.onchange = function () { try { localStorage.setItem("afriflow_market_currency", currency.value); } catch (error) {} state.currency.code = currency.value; state.currency.rates = {}; render(); loadCurrencyRates(); };
    var partner = el("afPartnerCatalog"); if (partner) partner.onclick = function () { state.context.market = { access_mode: "client" }; render(); loadCatalog(); };
    var shareholder = el("afShareholderCatalog"); if (shareholder) shareholder.onclick = function () { state.context.market = { access_mode: "client" }; render(); loadCatalog(); };
    var refreshPartner = el("afPartnerRefresh"); if (refreshPartner) refreshPartner.onclick = loadPartnerPortal;
    var orderForm=el("afPartnerOrder");
    if(orderForm)orderForm.onsubmit=async function(event){
      event.preventDefault();
      var button=orderForm.querySelector('button[type="submit"]'),status=el("afPartnerOrderStatus"),form=new FormData(orderForm);
      if(!orderForm.reportValidity())return;
      button.disabled=true;
      if(status)status.textContent="Envoi de votre demande…";
      try{
        var result=await partnerCall("request_order",{productId:form.get("productId"),quantity:form.get("quantity"),note:form.get("note")});
        if(status)status.textContent=result.message||"Demande envoyée.";
        notice(result.message||"Demande envoyée.");
        await loadPartnerPortal();
      }catch(error){button.disabled=false;if(status)status.textContent=error.message||"Demande impossible";notice(error.message||"Demande impossible");}
    };
    var simulator=el("afPartnerSimulator");
    if(simulator){
      simulator.querySelector('[name="productId"]').onchange=runPartnerSaleSimulation;
      simulator.querySelector('[name="quantity"]').oninput=runPartnerSaleSimulation;
      simulator.onsubmit=function(event){event.preventDefault();runPartnerSaleSimulation()};
      runPartnerSaleSimulation();
    }
    var saleForm=el("afPartnerSale");
    if(saleForm){
      saleForm.querySelector('[name="quantity"]').oninput=updatePartnerCalculation;
      saleForm.querySelector('[name="orderId"]').onchange=updatePartnerCalculation;
      saleForm.onsubmit=async function(event){
        event.preventDefault();
        var button=saleForm.querySelector('button[type="submit"]'),status=el("afPartnerSaleStatus"),form=new FormData(saleForm);
        if(!saleForm.reportValidity())return;
        var order=(state.partner&&state.partner.orders||[]).find(function(o){return o.id===form.get("orderId")&&["approved","supplied"].includes(o.status)});
        if(!order||!Number.isFinite(Number(order.unit_price))){notice("Choisissez une allocation validée avec un prix unitaire défini.");return}
        button.disabled=true;
        if(status)status.textContent="Enregistrement de la vente…";
        try{
          var result=await partnerCall("report_sale",{orderId:form.get("orderId"),quantity:form.get("quantity"),note:form.get("note")});
          if(status)status.textContent=result.message||"Vente enregistrée.";
          notice(result.message+" Net partenaire : "+partnerFormatEarnings(result.calculation.partnerNet,result.calculation.currency));
          loadPartnerPortal();
        }catch(error){button.disabled=false;if(status)status.textContent=error.message||"Déclaration impossible";notice(error.message||"Déclaration impossible");}
      };
      updatePartnerCalculation();
    }
    var disputeForm=el("afPartnerDisputeForm");
    if(disputeForm)disputeForm.onsubmit=async function(ev){
      ev.preventDefault();
      var fields=new FormData(disputeForm),button=disputeForm.querySelector('button[type="submit"]'),status=el("afPartnerDisputeStatus");
      var orderId=String(fields.get("orderId")||""),description=String(fields.get("description")||"").trim();
      var files=Array.from(disputeForm.querySelector('[name="evidence"]').files||[]);
      var types=["image/jpeg","image/png","image/webp","video/mp4","video/webm"];
      var allowed=state.partner&&state.partner.orders&&state.partner.orders.some(function(o){return o.id===orderId});
      if(!allowed||description.length<15){notice("Sélectionnez votre allocation et décrivez le défaut (15 caractères minimum).");return}
      if(files.length>3||files.some(function(file){return file.size>26214400||file.size===0||types.indexOf(file.type)<0;})){
        if(status)status.textContent="Jusqu’à 3 photos ou vidéos JPEG, PNG, WebP, MP4 ou WebM, de 25 Mo maximum par fichier.";
        return;
      }
      var auth=await sb().auth.getUser(),userId=auth.data&&auth.data.user&&auth.data.user.id;
      if(!userId){notice("Connexion requise.");return}
      button.disabled=true;
      if(status)status.textContent="Enregistrement du signalement…";
      try{
        var result=await sb().from("afriflow_partner_disputes").insert({
          partner_user_id:userId,order_id:orderId,category:String(fields.get("category")),
          description:description,batch_reference:String(fields.get("batch")||"").trim()||null
        }).select("id").single();
        if(result.error)throw result.error;
        var failures=[],archived=false;
        try{await partnerDropboxCall({action:"archive",disputeId:result.data.id});archived=true;}
        catch(error){failures.push("Dossier AfriFloW : "+error.message);}
        if(archived)for(var i=0;i<files.length;i++){
          var file=files[i];
          try{
            if(status)status.textContent="Transfert AfriFloW : "+(i+1)+"/"+files.length+"…";
            await partnerDropboxUpload(result.data.id,file,function(sent,total){
              if(status)status.textContent="Transfert AfriFloW "+(i+1)+"/"+files.length+" : "+Math.round(sent/total*100)+" %";
            });
          }catch(error){failures.push(file.name+" : "+error.message);}
        }
        var summary=failures.length?"Signalement enregistré, mais certaines pièces ou informations n’ont pas pu être archivées : "+failures.join("; "):"Signalement enregistré auprès d’AfriFloW"+(files.length?" avec "+files.length+" pièce(s) jointe(s).":".");
        if(status)status.textContent=summary;
        notice(summary);
        await loadPartnerDisputes();
      }catch(error){
        if(status)status.textContent="Envoi impossible : "+error.message;
        notice("Envoi impossible : "+error.message);
        button.disabled=false;
      }
    };
    var search = el("afMarketSearch"); if (search) search.onsubmit = function (event) { event.preventDefault(); state.term = el("afMarketSearchInput").value; render(); loadCatalog(false); };
    document.querySelectorAll("[data-market-category]").forEach(function (button) { button.onclick = function () { state.category = button.dataset.marketCategory || ""; render(); loadCatalog(false); }; });
    document.querySelectorAll("[data-market-favorites]").forEach(function (button) { button.onclick = function () { var favorites = state.products.filter(function (product) { return state.favorites.indexOf(product.id) > -1; }); if (!favorites.length) return notice("Vous n’avez pas encore enregistré de favori."); state.term = ""; state.category = ""; var target = el("afProductsTop"); if (target) target.scrollIntoView({ behavior: "smooth" }); var grid = el("afMarketGrid"); if (grid) { grid.innerHTML = favorites.map(productCard).join(""); bind(); } }; });
    document.querySelectorAll("[data-market-detail]").forEach(function (button) {
      var open = function (event) { if (button.matches("article[role=button]") && event && event.target.closest("button")) return; var p = productById(button.dataset.marketDetail); if (p) openDetail(p); };
      button.onclick = open;
      if (button.matches("article[role=button]")) button.onkeydown = function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } };
    });
    document.querySelectorAll("[data-market-quote]").forEach(function (button) { button.onclick = function () { var p = productById(button.dataset.marketQuote); if (p) openQuote(p); }; });
    document.querySelectorAll("[data-add-cart]").forEach(function (button) { button.onclick = function (event) { event.stopPropagation(); addToCart(productById(button.dataset.addCart)); }; });
    document.querySelectorAll("[data-favorite]").forEach(function (button) { button.onclick = function (event) { event.stopPropagation(); toggleFavorite(productById(button.dataset.favorite)); }; });
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
      var fields = "id,name,description,category,listing_type,price,compare_at_price,currency,minimum_order_quantity,origin_country,delivery_info,promotion_label,is_in_stock,original_path,news_sources,news_relevance,created_at,is_active";
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
    var announcement = el("afPublishAnnouncement"); if (announcement) announcement.onclick = function () { var type = document.querySelector('#afProductUpload select[name="listingType"]'), form = el("afProductUpload"); if (type) type.value = "announcement"; if (form) { form.scrollIntoView({ behavior: "smooth", block: "start" }); var title = form.querySelector('[name="name"]'); if (title) title.focus(); } };
    var original = el("afProductUpload"); if (original) original.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(original), file = form.get("image"); if (!(file instanceof File) || !file.size) return notice("Choisissez une photo originale."); try { var data = await toBase64(file); var result = await adminCall("upload_original", { product: { listingType: form.get("listingType"), name: form.get("name"), category: form.get("category"), price: form.get("price"), compareAtPrice: form.get("compareAtPrice"), currency: form.get("currency"), minimumOrderQuantity: form.get("minimumOrderQuantity"), originCountry: form.get("originCountry"), deliveryInfo: form.get("deliveryInfo"), promotionLabel: form.get("promotionLabel"), description: form.get("description") }, data: data, mime: file.type }); notice(result.message); original.reset(); loadCatalog(); if (result.autoJob && result.autoJob.id) pollAiJob(result.autoJob.id); } catch (error) { notice(error.message || "Envoi impossible"); } };
    var variant = el("afVariantUpload"); if (variant) variant.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(variant), file = form.get("image"); if (!(file instanceof File) || !file.size) return notice("Choisissez une image de variante."); try { var result = await adminCall("upload_variant", { productId: form.get("productId"), data: await toBase64(file), mime: file.type, source: form.get("source"), prompt: form.get("prompt") }); notice(result.message); variant.reset(); loadAdminList(); } catch (error) { notice(error.message || "Envoi impossible"); } };
    var ai = el("afAiRequest"); if (ai) ai.onsubmit = async function (event) { event.preventDefault(); var form = new FormData(ai); try { var result = await adminCall("request_ai_variant", { productId: form.get("productId"), prompt: form.get("prompt") }); notice(result.message); loadAdminList(); if (result.job && result.job.id) pollAiJob(result.job.id); } catch (error) { notice(error.message || "Aucune génération n'a été lancée."); loadAdminList(); } };
    var reconnect = el("afDropboxReconnect"); if (reconnect) reconnect.onclick = async function () { try { var result = await adminCall("dropbox_authorize"); var nonce = crypto.randomUUID(); sessionStorage.setItem("afriflow_dropbox_oauth_state", nonce); window.location.assign(result.url + "&state=" + encodeURIComponent(nonce)); } catch (error) { notice(error.message || "Connexion Dropbox indisponible."); } };
    var query = new URLSearchParams(window.location.search), code = query.get("code"), oauthState = query.get("state"); if (code && oauthState && oauthState === sessionStorage.getItem("afriflow_dropbox_oauth_state")) { sessionStorage.removeItem("afriflow_dropbox_oauth_state"); history.replaceState({}, "", window.location.pathname + window.location.hash); adminCall("dropbox_complete", { code: code }).then(function (result) { notice(result.message); render(); }).catch(function (error) { notice(error.message || "Connexion Dropbox impossible."); }); }
    adminCall("status").then(function (result) { var status = el("afAiStatus"), imageAI = result.imageAI || {}; if (status) status.textContent = imageAI.message || (result.aiConfigured ? "IA d’images configurée côté serveur. Chaque résultat reste à votre approbation." : "L’IA d’images n’est pas configurée."); var dropbox = el("afDropboxStatus"); if (dropbox) dropbox.textContent = result.dropboxConnected ? "Dropbox est connecté." : "Dropbox doit être reconnecté avant tout envoi."; }).catch(function () { var status = el("afAiStatus"); if (status) status.textContent = "État du connecteur IA indisponible."; });
  }
  function jobLabel(job) { return job.status === "ready" ? "Variante prête à examiner" : job.status === "failed" ? "Génération refusée : " + (job.error_message || "erreur inconnue") : "Génération automatique en cours"; }
  function editorField(value) { return esc(value == null ? "" : value); }
  function openProductEditor(product) {
    if (!product) return;
    var currencies = ["XOF", "XAF", "EUR", "USD", "GBP", "CHF", "CAD", "CNY", "JPY", "ZAR"].map(function (currency) { return '<option' + ((product.currency || "XOF") === currency ? " selected" : "") + '>' + currency + "</option>"; }).join("");
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
    loadQuotes(); loadPartnerAdmin(); loadAccessAdmin();
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

  window.AfriMarket = { open: open, openPublic: openPublic, closeToWorkspace: closeToWorkspace, openAuth: openAuth, closeAuth: closeAuth, shouldUseMarket: shouldUseMarket, renderAccessAdmin: loadAccessAdmin, renderPartnerTermsAdmin: loadPartnerTermsAdmin, renderDisputesAdmin: loadAdminDisputes, renderPartnerManagement: loadPartnerManagement, renderMarketAssignmentsAdmin: loadPartnerAssignmentsAdmin, renderCertificatesAdmin: loadCertificateAdmin };
  window.afriMarketInitial = function () {
    if (window.afriMarketSession) {
      if (shouldUseMarket(window.afriMarketSession)) open({ kind: "authenticated", market: window.afriMarketSession });
      return;
    }
    openPublic();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", window.afriMarketInitial); else window.afriMarketInitial();
})();
