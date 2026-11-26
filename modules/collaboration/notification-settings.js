/* Device settings are opened explicitly. Opening or checking never opts in. */
(function () {
  "use strict";
  var panel = null;
  function account() { return String(window.loggedUserEmail || "").trim().toLowerCase(); }
  function esc(value) { return String(value || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function device() { return window.AfriFlowAndroid ? "android" : window.AfriFlowNative ? "desktop" : "browser"; }
  function permission() { return window.Notification ? window.Notification.permission : "unsupported"; }
  function supported() { return !!(window.AfriFlowPush && window.AfriFlowPush.supported && window.AfriFlowPush.supported()); }
  function ios() { return /iPad|iPhone|iPod/.test(navigator.userAgent || "") || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1; }
  function guidance(kind) {
    if (kind === "android") return "Dans les paramètres Android, ouvrez Applications › AfriFlow › Notifications pour gérer l’autorisation. Cette page ne reçoit pas de confirmation d’inscription de l’application Android.";
    if (kind === "desktop") return "Les alertes Windows fonctionnent tant qu’AfriFlow reste ouvert ou réduit dans la zone de notification. Quitter complètement l’application interrompt ces alertes. Gérez leur affichage dans les paramètres de notifications Windows.";
    if (permission() === "denied") return "Les notifications sont bloquées. Ouvrez les autorisations de ce site dans votre navigateur, puis autorisez les notifications. Vérifiez aussi les réglages de notifications du système. Aucune nouvelle demande d’autorisation ne sera affichée ici tant que ce blocage reste actif.";
    if (!supported() && ios()) return "Sur iPhone ou iPad, ajoutez AfriFlow à l’écran d’accueil depuis le menu Partager de Safari. Ouvrez ensuite AfriFlow depuis cette icône et revenez activer les notifications. Vérifiez leur autorisation dans Réglages › Notifications ; une version compatible et à jour du système est nécessaire.";
    if (!supported()) return "Les notifications en arrière-plan ne sont pas disponibles dans ce navigateur ou ce contexte. Ouvrez AfriFlow en HTTPS dans un navigateur compatible, ou utilisez l’application Android. Les autorisations se gèrent dans le navigateur et le système.";
    return "Ce réglage concerne cet appareil et ce navigateur. Pour modifier ou bloquer les notifications plus tard, utilisez les autorisations du site et les paramètres de notifications du système. Vérifier consulte l’état sans envoyer de notification.";
  }
  function current(state) { return panel === state && state.node.isConnected && state.owner === account(); }
  function close() { if (panel) panel.close(); }
  function update(state) {
    if (!current(state)) return;
    var kind = device(), push = window.AfriFlowPush, alerts = window.AfriFlowAlerts;
    var enabled = !!(alerts && alerts.enabled && alerts.enabled());
    var labels = { granted: "Autorisées", denied: "Bloquées", default: "À autoriser", unsupported: "Indisponibles" };
    state.node.querySelector("#afNotifDevice").textContent = kind === "android" ? "Application Android" : kind === "desktop" ? "Application Windows" : ios() ? "Navigateur / application web sur iPhone ou iPad" : "Ce navigateur";
    state.node.querySelector("#afNotifStatus").innerHTML = '<div><dt>Alertes dans AfriFlow</dt><dd>' + (enabled ? "Activées" : "Non activées") + '</dd></div>'
      + (kind === "browser" ? '<div><dt>Autorisation du navigateur</dt><dd>' + esc(labels[permission()] || permission()) + '</dd></div><div><dt>Abonnement de ce navigateur</dt><dd>' + esc(state.subscription || "Non vérifié") + '</dd></div>'
        : '<div><dt>Autorisation du système</dt><dd>À vérifier dans les paramètres de l’appareil</dd></div>');
    state.node.querySelector("#afNotifGuide").textContent = guidance(kind);
    var activate = state.node.querySelector("#afNotifActivate"), verify = state.node.querySelector("#afNotifVerify");
    activate.disabled = state.busy || !alerts || typeof alerts.enable !== "function"
      || kind === "browser" && (!supported() || permission() === "denied")
      || kind === "android" && (!push || typeof push.registerAndroidNative !== "function");
    verify.hidden = kind !== "browser";
    verify.disabled = state.busy || !supported() || !push || typeof push.diagnostics !== "function";
    state.node.querySelector("#afNotifMessage").textContent = state.message || "";
    state.node.querySelector("section").setAttribute("aria-busy", state.busy ? "true" : "false");
  }
  async function activate(state) {
    if (!current(state) || state.busy) return;
    var kind = device(), alerts = window.AfriFlowAlerts, push = window.AfriFlowPush;
    if (!alerts || typeof alerts.enable !== "function") { state.message = "Les commandes se chargent. Fermez puis rouvrez ce panneau."; update(state); return; }
    if (kind === "browser" && (!supported() || permission() === "denied")) { state.message = guidance(kind); update(state); return; }
    if (kind === "android" && (!push || typeof push.registerAndroidNative !== "function")) { state.message = "La commande Android est indisponible. Vérifiez la version installée de l’application."; update(state); return; }
    state.busy = true; state.message = "Activation en cours…";
    try {
      alerts.enable();
      // Called before any await, directly inside the user's activation click.
      var requested = kind === "browser" && permission() === "default" ? window.Notification.requestPermission() : Promise.resolve(permission());
      update(state);
      if (kind === "desktop") {
        state.message = "Alertes activées dans AfriFlow Windows. L’application doit rester ouverte ou dans la zone de notification.";
      } else if (kind === "android") {
        await push.registerAndroidNative();
        if (!current(state)) return;
        state.message = "Alertes activées dans AfriFlow. L’inscription de cet appareil aux notifications Android n’est pas confirmée par ce panneau. Autorisez les notifications si le système le demande, puis vérifiez les paramètres Android.";
      } else {
        var result = await requested;
        if (!current(state)) return;
        if (result !== "granted") { state.message = result === "denied" ? "Autorisation refusée. Vous pouvez la modifier dans les paramètres du navigateur." : "Aucune autorisation accordée. Aucun abonnement n’a été créé."; return; }
        var subscription = await push.subscribe();
        if (!current(state)) return;
        if (!subscription || !subscription.ok) throw new Error(subscription && subscription.reason || "Abonnement non confirmé.");
        state.subscription = "Appareil inscrit pour ce compte";
        state.message = "Notifications activées pour ce compte sur ce navigateur. Leur affichage dépend aussi des réglages du système.";
      }
    } catch (error) {
      if (current(state)) state.message = "Activation non confirmée : " + (error.message || error) + ". Vous pouvez réessayer.";
    } finally { state.busy = false; if (current(state)) update(state); else if (panel === state) state.close(); }
  }
  async function verify(state) {
    if (!current(state) || state.busy || device() !== "browser" || !supported() || !window.AfriFlowPush.diagnostics) return;
    state.busy = true; state.message = "Vérification sans envoi de notification…"; update(state);
    try {
      var result = await window.AfriFlowPush.diagnostics();
      if (!current(state)) return;
      state.subscription = result.registered ? "Abonnement présent sur cet appareil" : "Aucun abonnement trouvé sur cet appareil";
      state.message = result.error ? "Vérification incomplète : " + result.error : result.server ? "Service de notifications joignable. Cette vérification n’envoie aucune notification et ne garantit pas sa réception." : "Service de notifications non joignable actuellement. Réessayez plus tard.";
    } catch (error) { if (current(state)) state.message = "Vérification impossible : " + (error.message || error); }
    finally { state.busy = false; if (current(state)) update(state); else if (panel === state) state.close(); }
  }
  function open() {
    var owner = account(); if (!owner) return false;
    close();
    var previous = document.activeElement, node = document.createElement("div");
    node.className = "af-att-overlay af-notif-overlay";
    node.innerHTML = '<section class="af-att-dialog af-notif-dialog" role="dialog" aria-modal="true" aria-labelledby="afNotifTitle"><header><h2 id="afNotifTitle" tabindex="-1">Notifications sur cet appareil</h2><button type="button" id="afNotifClose">Fermer</button></header>'
      + '<p class="af-notif-account">Compte : ' + esc(owner) + '<br><b id="afNotifDevice"></b></p><dl id="afNotifStatus"></dl><p id="afNotifGuide"></p><p id="afNotifMessage" role="status" aria-live="polite"></p>'
      + '<div class="af-att-actions"><button type="button" id="afNotifVerify">Vérifier</button><button type="button" class="p" id="afNotifActivate">Activer les notifications</button></div></section>';
    document.body.appendChild(node);
    var state = { node: node, owner: owner, busy: false, message: "", subscription: "", close: function () {
      document.removeEventListener("keydown", keys, true); node.remove(); if (panel === state) panel = null;
      if (previous && previous.isConnected && previous.focus) previous.focus({ preventScroll: true });
    } };
    function keys(event) {
      // An incoming meeting may temporarily make this underlying dialog inert.
      // Respect a call dialog that already handled Escape before restoring us.
      if (event.defaultPrevented || node.inert || !node.isConnected) return;
      if (event.key === "Escape") { event.preventDefault(); state.close(); return; }
      if (event.key !== "Tab") return;
      var controls = Array.from(node.querySelectorAll("button")).filter(function (button) { return !button.disabled && !button.hidden; });
      if (!controls.length) return;
      var first = controls[0], last = controls[controls.length - 1], focused = document.activeElement;
      if (!node.contains(focused) || event.shiftKey && (focused === first || controls.indexOf(focused) === -1) || !event.shiftKey && focused === last) { event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true }); }
    }
    panel = state;
    node.querySelector("#afNotifClose").onclick = state.close;
    node.querySelector("#afNotifActivate").onclick = function () { return activate(state); };
    node.querySelector("#afNotifVerify").onclick = function () { return verify(state); };
    node.addEventListener("click", function (event) { if (event.target === node && !state.busy) state.close(); });
    document.addEventListener("keydown", keys, true); update(state);
    node.querySelector("#afNotifTitle").focus({ preventScroll: true });
    return true;
  }
  document.addEventListener("click", function (event) {
    if (event.target.closest && event.target.closest("[data-notification-settings]")) open();
  });
  function sessionChanged() { if (panel && panel.owner !== account()) close(); }
  window.addEventListener("afriflow:auth-ready", sessionChanged);
  window.addEventListener("afriflow:verified-role", sessionChanged);
  window.addEventListener("afriflow:navigate", function (event) { if (!event.detail || event.detail.id !== "personal") close(); });
  window.AfriNotificationSettings = { open: open };
})();
