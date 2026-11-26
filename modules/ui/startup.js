/* Show one stable startup screen until both the verified session and its page are ready. */
(function () {
  "use strict";
  var mode = "pending", mounted = false, released = false;
  var domReady = document.readyState === "complete", resolveDom;
  var message = "Chargement de votre espace…", retry = false;
  var dom = new Promise(function (resolve) { resolveDom = resolve; });

  function paint() {
    var label = document.getElementById("afStartupMessage");
    var button = document.getElementById("afStartupRetry");
    if (label) label.textContent = message;
    if (button) button.hidden = !retry;
  }
  function reveal() {
    if (released || !domReady || !mounted || mode === "pending" || mode === "error") return;
    released = true;
    clearTimeout(slowTimer);
    var shell = document.getElementById("afStartup");
    if (shell) shell.hidden = true;
    document.documentElement.classList.remove("af-startup-pending");
    window.dispatchEvent(new CustomEvent("afriflow:startup-ready", { detail: { mode: mode } }));
  }
  function ready() {
    domReady = true;
    var button = document.getElementById("afStartupRetry");
    if (button) button.addEventListener("click", function () { window.location.reload(); });
    paint();
    resolveDom();
    reveal();
  }
  var slowTimer = setTimeout(function () {
    if (released) return;
    message = "Le chargement prend plus de temps que prévu. Vérifiez votre connexion ou réessayez.";
    retry = true;
    paint();
  }, 20000);

  window.AfriStartup = {
    whenDomReady: function (fn) { return dom.then(fn); },
    state: function () { return mode; },
    resolveAuth: function (next) {
      mode = next;
      window.dispatchEvent(new CustomEvent("afriflow:auth-ready", { detail: { mode: mode } }));
      reveal();
    },
    routeReady: function () { mounted = true; reveal(); },
    fail: function (reason) {
      if (released) return;
      mode = "error";
      clearTimeout(slowTimer);
      message = reason || "Impossible de charger votre espace pour le moment. Veuillez réessayer.";
      retry = true;
      paint();
    }
  };
  if (domReady) ready();
  else document.addEventListener("DOMContentLoaded", ready, { once: true });
})();
