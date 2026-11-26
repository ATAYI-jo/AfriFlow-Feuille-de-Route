/* AfriFlow: notify open website, Windows, Android and PWA sessions about updates.
   Reload only after the visitor explicitly chooses Actualiser. Background checks
   must never interrupt reading, navigation, authentication or document editing. */
(function () {
  'use strict';

  var WATCH = [
    './', './updates.js', './document-excel-editor.js',
    './document-permissions.js', './document-urgency.js',
    './afriflow-push.js', './afriflow-alerts.js',
    './afriflow-first-use.js'
  ];
  WATCH = Array.from(new Set(WATCH));
  var checking = false, pending = null, baseline = null, announced = null;
  var inProgress = false, lastFetch = 0, notice = null, message = null;
  var deferred = new Set();

  function editing() {
    var focused = document.activeElement;
    if (focused && (focused.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName))) return true;
    if (document.querySelector('[contenteditable="true"]:focus, [contenteditable=""]:focus')) return true;
    if (document.querySelector('#dwApp:not([hidden]), .dw-app:not([hidden]), .dw-modal.on, #xm.on, #ov.on, #afExcel:not([hidden]), #afPermOverlay, #af-first-use:not([hidden]), #auth-screen:not(.off)')) return true;
    return false;
  }
  function authenticating() {
    return /(?:^|[?#&])(?:code|access_token|refresh_token|token_hash|error_description)=/.test(location.search + '&' + location.hash);
  }
  function createNotice() {
    var style = document.createElement('style');
    style.textContent = '#afUpdateNotice{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:980;box-sizing:border-box;width:calc(100% - 32px);max-width:410px;padding:16px;border:1px solid var(--line,#d9e5dc);border-radius:18px;background:var(--card,#fff);background:color-mix(in srgb,var(--card,#fff) 94%,transparent);color:var(--ink,#1d2a22);box-shadow:0 12px 36px rgba(12,44,26,.18);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font:400 1rem/1.5 system-ui,sans-serif}#afUpdateNotice[hidden]{display:none!important}#afUpdateNotice p{margin:0 0 12px}#afUpdateNotice .af-update-actions{display:flex;gap:8px;flex-wrap:wrap}#afUpdateNotice button{min-height:44px;padding:9px 16px;border:1px solid var(--line,#d9e5dc);border-radius:12px;background:transparent;color:inherit;font:600 .9rem/1.3 system-ui,sans-serif;cursor:pointer}#afUpdateNotice button:first-child{background:#1f5d3a;border-color:#1f5d3a;color:#fff}#afUpdateNotice button:focus-visible{outline:3px solid var(--green,#1f5d3a);outline-offset:3px}#afUpdateNotice button:disabled{opacity:.6;cursor:default}';
    document.head.appendChild(style);
    notice = document.createElement('section');
    notice.id = 'afUpdateNotice';
    notice.hidden = true;
    notice.setAttribute('role', 'region');
    notice.setAttribute('aria-label', 'Mise à jour AfriFlow');
    message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    notice.appendChild(message);
    var actions = document.createElement('div');
    actions.className = 'af-update-actions';
    var refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = 'Actualiser';
    refresh.addEventListener('click', function () {
      if (inProgress || !pending || document.hidden) return;
      if (editing() || authenticating()) {
        message.textContent = 'Terminez et fermez votre document ou votre formulaire avant d’actualiser.';
        return;
      }
      if (!navigator.onLine) {
        message.textContent = 'La connexion est interrompue. Vous pourrez actualiser une fois reconnecté.';
        return;
      }
      inProgress = true;
      refresh.disabled = true;
      // This click is the sole reload path. Idle, focus and polling only notify.
      location.reload();
    });
    var later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Plus tard';
    later.addEventListener('click', function () {
      if (pending) deferred.add(pending);
      notice.hidden = true;
    });
    actions.appendChild(refresh);
    actions.appendChild(later);
    notice.appendChild(actions);
    document.body.appendChild(notice);
  }
  function showPendingNotice() {
    if (!pending || deferred.has(pending)) {
      if (notice) notice.hidden = true;
      return;
    }
    if (inProgress || document.hidden || editing() || authenticating() || !document.body) return;
    if (!notice) createNotice();
    notice.hidden = false;
    var text = 'Une mise à jour d’AfriFlow est disponible. Vous pouvez actualiser quand vous êtes prêt.';
    if (message.textContent !== text) message.textContent = text;
  }
  async function fingerprint(content) {
    var bytes = new TextEncoder().encode(content);
    var dig = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(dig)).map(function (b) {return b.toString(16).padStart(2,'0')}).join('');
  }
  async function fetchFingerprint() {
    // Only watch same-origin source files: the installed app always uses the live site.
    // If deployment temporarily returns 404/500, do NOT consider that an update.
    var values = await Promise.all(WATCH.map(async function (name) {
      var url = new URL(name, location.href);
      if (url.origin !== location.origin) throw new Error('cross-origin update source');
      var res = await fetch(url.href, {cache:'no-store', credentials:'same-origin'});
      if (!res.ok) throw new Error('update source unavailable: ' + res.status);
      return name + ':' + await fingerprint(await res.text());
    }));
    return fingerprint(values.join('|'));
  }
  async function check(force) {
    if (inProgress || checking || !navigator.onLine || document.hidden) return;
    if (!force && Date.now()-lastFetch < 30000) {showPendingNotice();return}
    checking = true;
    try {
      var current = await fetchFingerprint();
      lastFetch=Date.now();
      // The baseline belongs to this open page. Yesterday's localStorage value
      // cannot tell whether today's freshly loaded page is already up to date.
      if (baseline === null) baseline = current;
      pending = current === baseline ? null : current;
      if (pending && pending !== announced) {
        announced = pending;
        window.dispatchEvent(new CustomEvent('afriflow-update-ready'));
      }
      showPendingNotice();
    } catch (_) {
      // A partially deployed site or poor connectivity must not close a document.
    } finally {checking=false}
  }
  window.addEventListener('online', function () {check(true)});
  window.addEventListener('focus', function () {check(true);showPendingNotice()});
  window.addEventListener('afriflow:refresh', function () {check(true)});
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {check(true);showPendingNotice()}
  });
  setInterval(function () {check(false);showPendingNotice()}, 120000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {check(true)}, {once:true});
  } else check(true);
})();
