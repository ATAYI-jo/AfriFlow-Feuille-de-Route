/* AfriFloW Market — catalogue public, assets served from Dropbox by Edge Functions. */
(function () {
  "use strict";
  var state = { products: [], adminProducts: [], category: "", term: "", context: { kind: "public" }, imageTimers: [], admin: null };
  function el(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]; }); }
  function sb() { return window.__sb; }
  function isAdmin() { return window.USER_ROLE === "admin"; }
  function notice(message) { if (window.toast) window.toast(message); else window.alert(message); }
  function formatPrice(value, currency) {
    if (value == null || value === "") return "Sur demande";
    try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "XOF", maximumFractionDigits: 2 }).format(Number(value)); }
    catch (error) { return Number(value).toLocaleString("fr-FR") + " " + (currency || "XOF"); }
  }
  function roleMode(profile) { return profile && profile.access_mode || "client"; }
  function shouldUseMarket(profile) { return ["client", "shareholder_pending", "partner_waiting"].indexOf(roleMode(profile)) > -1; }
  function hideWorkspace() {
    document.body.classList.add("af-market-mode");
    var auth = el("auth-screen"); if (auth) auth.classList.add("off");
  }
  function showWorkspace() {
    document.body.classList.remove("af-market-mode");
    var box = el("market-view"); if (box) box.innerHTML = "";
  }
  function clearTimers() { state.imageTimers.forEach(function (timer) { clearTimeout(timer); }); state.imageTimers = []; }
  function open(context) {
    state.context = context || { kind: "public" }; hideWorkspace(); render();
    if (roleMode(state.context.market) === "partner_waiting") return;
    loadCatalog();
  }
  function openPublic() { open({ kind: "public", market: { access_mode: "public" } }); }
  function closeToWorkspace() {
    clearTimers(); showWorkspace();
    var home = document.querySelector('#navList .nv[data-id="home"]');
    if (home) home.click();
  }
  function openAuth() {
    var auth = el("auth-screen"); if (!auth) return;
    auth.classList.remove("off");
    var email = el("authEmailInput"); if (email) setTimeout(function () { email.focus(); }, 50);
  }
  function closeAuth() { var auth = el("auth-screen"); if (auth) auth.classList.add("off"); }
  function categoryList() { var seen = {}; state.products.forEach(function (product) { if (product.category) seen[product.category] = true; }); return Object.keys(seen).sort(); }
  function filteredProducts() {
    var term = state.term.trim().toLocaleLowerCase("fr");
    return state.products.filter(function (product) {
      return (!state.category || product.category === state.category) && (!term || [product.name, product.description, product.category].join(" ").toLocaleLowerCase("fr").indexOf(term) > -1);
    });
  }
  function productCard(product) {
    return '<article class="af-product">'
      + '<div class="af-product-media" data-market-image="' + esc(product.id) + '"><span class="af-market-fallback">AfriFloW<br>Marketplace</span><span class="af-market-photo-note">Image Dropbox</span></div>'
      + '<div class="af-product-body"><div class="af-product-cat">' + esc(product.category) + '</div><h3>' + esc(product.name) + '</h3><p>' + esc(product.description || "Produit sélectionné par AfriFloW.") + '</p><div class="af-product-price">' + esc(formatPrice(product.price, product.currency)) + '</div>'
      + '<button type="button" class="af-market-primary" data-market-interest="' + esc(product.id) + '">Découvrir ce produit</button></div></article>';
  }
  function catalogContent() {
    var products = filteredProducts();
    return '<section class="af-market-hero"><div><h1>Le meilleur d’Afri<span>FloW</span>, à découvrir.</h1><p>Une Marketplace pensée comme une grande place de marché : découvrez les produits, comparez et prenez contact avec AfriFloW.</p></div></section>'
      + '<div class="af-market-section-head"><h2>' + (state.category ? esc(state.category) : "Nos produits") + '</h2><p>' + (products.length ? products.length + " produit" + (products.length > 1 ? "s" : "") : "Catalogue en préparation") + '</p></div>'
      + '<section id="afMarketGrid" class="af-market-grid">' + (products.length ? products.map(productCard).join("") : '<div class="af-market-empty">Aucun produit ne correspond à votre recherche pour le moment.</div>') + '</section>'
      + (isAdmin() ? adminPanel() : "");
  }
  function waitContent() {
    return '<section class="af-market-wait"><h1>Espace partenaire en préparation</h1><p>Votre demande de rôle partenaire est enregistrée. Cet espace sera ouvert prochainement. En attendant, vous pouvez revenir à la vitrine publique de la Marketplace.</p><button type="button" class="af-market-primary" id="afPartnerCatalog">Voir la Marketplace</button></section>';
  }
  function top() {
    var categories = categoryList();
    var workspace = state.context.kind === "workspace";
    return '<header class="af-market-top"><div class="af-market-topline">'
      + '<a class="af-market-brand" href="#" id="afMarketHome"><img src="logo.png" alt=""><b>Afri<span>FloW</span> Marketplace</b></a>'
      + '<form class="af-market-search" id="afMarketSearch"><input id="afMarketSearchInput" value="' + esc(state.term) + '" type="search" placeholder="Rechercher un produit, une catégorie…" aria-label="Rechercher dans la Marketplace"><button>Rechercher</button></form>'
      + (workspace ? '<button type="button" class="af-market-link" id="afMarketBack">Retour à mon espace</button>' : '')
      + (state.context.kind === "public" ? '<button type="button" class="af-market-link" id="afMarketSignIn">Se connecter</button>' : (state.context.kind === "authenticated" ? '<button type="button" class="af-market-link" id="afMarketSignOut">Déconnexion</button>' : ''))
      + '</div><nav class="af-market-nav" aria-label="Catégories Marketplace"><button type="button" data-market-category="" class="' + (!state.category ? "on" : "") + '">Toute la Marketplace</button>'
      + categories.map(function (category) { return '<button type="button" data-market-category="' + esc(category) + '" class="' + (state.category === category ? "on" : "") + '">' + esc(category) + '</button>'; }).join("")
      + '</nav></header>';
  }
  function adminPanel() {
    var choices = state.adminProducts.length ? state.adminProducts : state.products;
    return '<section class="af-market-admin" id="afMarketAdmin"><h2>Administration de la Marketplace</h2><p>Les originaux et variantes sont envoyés depuis ici vers Dropbox. Seules les variantes approuvées entrent dans la rotation horaire.</p>'
      + '<div class="af-market-admin-grid">'
      + '<form class="af-market-admin-card" id="afProductUpload"><h3>Ajouter un original</h3><div id="afDropboxStatus" class="af-market-status">Vérification de Dropbox…</div><button type="button" class="af-market-secondary" id="afDropboxReconnect">Reconnecter Dropbox</button><label>Nom du produit<input required name="name" maxlength="160"></label><label>Catégorie<input required name="category" maxlength="80" value="Découvrir"></label><label>Prix (facultatif)<input name="price" type="number" min="0" step="0.01"></label><label>Devise<select name="currency"><option>XOF</option><option>EUR</option><option>USD</option></select></label><label>Description<textarea name="description" maxlength="4000"></textarea></label><label>Photo originale<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><small>Le produit est ajouté comme brouillon : publiez-le seulement après contrôle.</small><button class="af-market-primary">Envoyer vers Dropbox</button></form>'
      + '<form class="af-market-admin-card" id="afVariantUpload"><h3>Ajouter une variante</h3><label>Produit<select required name="productId">' + choices.map(function (product) { return '<option value="' + esc(product.id) + '">' + esc(product.name) + '</option>'; }).join("") + '</select></label><label>Image de variante<input required name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Origine<select name="source"><option value="manual">Retouche manuelle</option><option value="ai">Création IA validée manuellement</option></select></label><label>Consigne / provenance<textarea name="prompt" maxlength="2000" placeholder="Ex. conserver fidèlement le produit, éclairage naturel…"></textarea></label><small>Une variante reste invisible tant qu’elle n’est pas approuvée.</small><button class="af-market-primary">Envoyer la variante</button></form>'
      + '<form class="af-market-admin-card" id="afAiRequest"><h3>Pipeline IA</h3><div id="afAiStatus" class="af-market-status">Vérification de la configuration…</div><label>Produit<select required name="productId">' + choices.map(function (product) { return '<option value="' + esc(product.id) + '">' + esc(product.name) + '</option>'; }).join("") + '</select></label><label>Consigne de transformation<textarea required name="prompt" minlength="8" maxlength="2000" placeholder="Conserver exactement le produit ; modifier seulement l’ambiance…"></textarea></label><small>L’IA travaille uniquement côté serveur. Chaque variante créée reste en attente de votre approbation.</small><button class="af-market-secondary">Créer une variante IA</button></form>'
      + '</div><div id="afMarketAdminList" class="af-market-admin-list"><p>Chargement des brouillons et variantes…</p></div></section>';
  }
  function render() {
    var root = el("market-view"); if (!root) return;
    root.innerHTML = top() + '<main class="af-market-main">' + (roleMode(state.context.market) === "partner_waiting" ? waitContent() : catalogContent()) + '</main>';
    bind();
  }
  function bind() {
    var home = el("afMarketHome"); if (home) home.onclick = function (event) { event.preventDefault(); state.category = ""; state.term = ""; render(); loadCatalog(); };
    var back = el("afMarketBack"); if (back) back.onclick = closeToWorkspace;
    var signIn = el("afMarketSignIn"); if (signIn) signIn.onclick = openAuth;
    var signOut = el("afMarketSignOut"); if (signOut) signOut.onclick = function () { if (window.logout) window.logout(); };
    var partner = el("afPartnerCatalog"); if (partner) partner.onclick = function () { state.context.market = { access_mode: "client" }; render(); loadCatalog(); };
    var search = el("afMarketSearch"); if (search) search.onsubmit = function (event) { event.preventDefault(); state.term = el("afMarketSearchInput").value; render(); loadCatalog(false); };
    document.querySelectorAll("[data-market-category]").forEach(function (button) { button.onclick = function () { state.category = button.dataset.marketCategory || ""; render(); loadCatalog(false); }; });
    document.querySelectorAll("[data-market-interest]").forEach(function (button) { button.onclick = function () { var product = state.products.filter(function (item) { return item.id === button.dataset.marketInterest; })[0]; if (state.context.kind === "public") openAuth(); else notice("Votre intérêt pour « " + (product && product.name || "ce produit") + " » a été enregistré localement. Contactez AfriFloW pour finaliser."); }; });
    if (isAdmin()) bindAdmin();
  }
  function scheduleImages() {
    clearTimers();
    document.querySelectorAll("[data-market-image]").forEach(function (box) { loadImage(box.dataset.marketImage, box); });
    var untilNextHour = 3_600_000 - (Date.now() % 3_600_000) + 250;
    state.imageTimers.push(setTimeout(function () { if (document.body.classList.contains("af-market-mode")) { scheduleImages(); } }, untilNextHour));
  }
  async function loadImage(productId, box) {
    if (!sb() || !box) return;
    try {
      var result = await sb().functions.invoke("afriflow-market-media", { body: { productId: productId } });
      if (result.error || !result.data || !result.data.url) return;
      var image = new Image(); image.alt = "Produit AfriFloW"; image.loading = "lazy"; image.src = result.data.url;
      image.onload = function () { if (box.isConnected) { box.querySelectorAll(".af-market-fallback").forEach(function (node) { node.remove(); }); box.insertBefore(image, box.firstChild); } };
    } catch (error) { /* keep the neutral fallback; no client-side generation */ }
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
      render(); scheduleImages(); if (isAdmin()) loadAdminList();
    } catch (error) { showCatalogError("Le catalogue est momentanément indisponible."); }
  }
  function showCatalogError(message) { var grid = el("afMarketGrid"); if (grid) grid.innerHTML = '<div class="af-market-error">' + esc(message) + '</div>'; }
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
    var reconnect = el("afDropboxReconnect"); if (reconnect) reconnect.onclick = async function () { try { var result = await adminCall("dropbox_authorize"); var state = crypto.randomUUID(); sessionStorage.setItem("afriflow_dropbox_oauth_state", state); window.location.assign(result.url + "&state=" + encodeURIComponent(state)); } catch (error) { notice(error.message || "Connexion Dropbox indisponible."); } };
    var query = new URLSearchParams(window.location.search), code = query.get("code"), oauthState = query.get("state"); if (code && oauthState && oauthState === sessionStorage.getItem("afriflow_dropbox_oauth_state")) { sessionStorage.removeItem("afriflow_dropbox_oauth_state"); history.replaceState({}, "", window.location.pathname + window.location.hash); adminCall("dropbox_complete", { code: code }).then(function (result) { notice(result.message); render(); }).catch(function (error) { notice(error.message || "Connexion Dropbox impossible."); }); }
    adminCall("status").then(function (result) { var status = el("afAiStatus"); if (status) status.textContent = result.aiConfigured ? "IA d’images prête côté serveur : chaque résultat reste à approuver avant publication." : "L’IA d’images n’est pas configurée."; var dropbox = el("afDropboxStatus"); if (dropbox) dropbox.textContent = result.dropboxConnected ? "Dropbox est connecté." : "Dropbox doit être reconnecté avant tout envoi."; }).catch(function () { var status = el("afAiStatus"); if (status) status.textContent = "État du connecteur IA indisponible."; });
  }
  function statusTag(status) { return '<span class="af-market-tag ' + esc(status) + '">' + esc(status === "approved" ? "Approuvée" : status === "rejected" ? "Refusée" : "En attente") + '</span>'; }
  async function loadAdminList() {
    var list = el("afMarketAdminList"); if (!list || !sb()) return;
    try {
      var both = await Promise.all([
        sb().from("afriflow_market_products").select("id,name,is_active,created_at").order("created_at", { ascending: false }).limit(100),
        sb().from("afriflow_market_variants").select("id,product_id,approval_status,source,created_at").order("created_at", { ascending: false }).limit(200)
      ]);
      if (both[0].error) throw both[0].error; if (both[1].error) throw both[1].error;
      var products = both[0].data || [], variants = both[1].data || [];
      list.innerHTML = products.length ? products.map(function (product) {
        var sub = variants.filter(function (variant) { return variant.product_id === product.id; });
        return '<div class="af-market-admin-row"><div><b>' + esc(product.name) + '</b><small>Produit ' + (product.is_active ? "visible" : "brouillon") + " · " + sub.length + " variante" + (sub.length > 1 ? "s" : "") + '</small>'
          + sub.map(function (variant) { return '<small>Variante ' + esc(variant.source) + " · " + statusTag(variant.approval_status) + ' <button type="button" class="af-market-secondary" data-variant="' + esc(variant.id) + '" data-status="approved">Approuver</button> <button type="button" class="af-market-secondary" data-variant="' + esc(variant.id) + '" data-status="rejected">Refuser</button></small>'; }).join("") + '</div>'
          + '<div class="af-market-admin-actions"><button type="button" class="af-market-secondary" data-product="' + esc(product.id) + '" data-active="' + (product.is_active ? "false" : "true") + '">' + (product.is_active ? "Retirer" : "Publier") + '</button></div></div>';
      }).join("") : '<div class="af-market-empty"><b>Aucun brouillon à publier.</b><br><small>Le bouton « Publier » apparaît ici dès qu’un original a été enregistré avec succès dans Dropbox.</small></div>';
      list.querySelectorAll("[data-product]").forEach(function (button) { button.onclick = async function () { var response = await sb().from("afriflow_market_products").update({ is_active: button.dataset.active === "true" }).eq("id", button.dataset.product); if (response.error) notice(response.error.message); else { notice("Visibilité mise à jour."); loadCatalog(); } }; });
      list.querySelectorAll("[data-variant]").forEach(function (button) { button.onclick = async function () { var update = { approval_status: button.dataset.status, approved_at: button.dataset.status === "approved" ? new Date().toISOString() : null }; var response = await sb().from("afriflow_market_variants").update(update).eq("id", button.dataset.variant); if (response.error) notice(response.error.message); else { notice(button.dataset.status === "approved" ? "Variante approuvée : elle participera à la rotation horaire." : "Variante refusée."); loadAdminList(); } }; });
    } catch (error) { list.innerHTML = '<p class="af-market-error">Gestion du catalogue indisponible : ' + esc(error.message || error) + '</p>'; }
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
