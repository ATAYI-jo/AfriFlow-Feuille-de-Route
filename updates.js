/* AfriFloW: sync the deployed website with installed Windows, Android and PWA shells.
   These shells open the live HTTPS site. Detect changes in HTML AND external
   JavaScript files without intercepting Supabase, OAuth or Dropbox requests.
   Recheck when the app returns to the foreground; never interrupt editors. */
(function () {
  'use strict';

  var KEY = 'afriflow_site_fingerprint_v2';
  var WATCH = [
    './', './updates.js', './document-excel-editor.js',
    './document-permissions.js', './document-urgency.js',
    './afriflow-push.js', './afriflow-alerts.js',
    './afriflow-first-use.js', './document-excel-editor.js'
  ];
  WATCH = Array.from(new Set(WATCH));
  var lastInput = Date.now();
  var checking = false, pending = false, baseline = null;
  var inProgress = false, lastFetch = 0;

  ['pointerdown', 'keydown', 'input', 'touchstart'].forEach(function (name) {
    document.addEventListener(name, function () { lastInput = Date.now(); }, {passive:true});
  });
  window.addEventListener('beforeunload', function () { inProgress = true; });

  function editing() {
    var focused = document.activeElement;
    if (focused && (focused.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName))) return true;
    if (document.querySelector('[contenteditable="true"]:focus, [contenteditable=""]:focus')) return true;
    if (document.querySelector('.dw-app:not([hidden]), .dw-modal.on, #xm.on, #ov.on, #afExcel, #afPermOverlay, #af-first-use:not([hidden]), [role="dialog"][aria-modal="true"]:not([hidden])')) return true;
    return false;
  }
  function safeToReload() {
    return !inProgress && navigator.onLine && !document.hidden && !editing() &&
      Date.now() - lastInput > 45000 &&
      !/(?:^|[?#&])(?:code|access_token|error_description)=/.test(location.search + '&' + location.hash);
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
  function refreshIfSafe() {
    if (!pending || !safeToReload()) return;
    pending = false;
    // Avoid stale HTML after a deployment; no app installer is involved.
    location.reload();
  }
  async function check(force) {
    if (checking || !navigator.onLine || (document.hidden && !force)) return;
    if (!force && Date.now()-lastFetch < 30000) {refreshIfSafe();return}
    checking = true;
    try {
      var current = await fetchFingerprint();
      lastFetch=Date.now();
      if (baseline === null) {
        try {baseline=localStorage.getItem(KEY)} catch (_) {}
      }
      if (baseline && baseline !== current) pending = true;
      baseline = current;
      try {localStorage.setItem(KEY,current)}catch (_) {}
      refreshIfSafe();
    } catch (_) {
      // A partially deployed site or poor connectivity must not close a document.
    } finally {checking=false}
  }
  window.addEventListener('online', function () {check(true)});
  window.addEventListener('focus', function () {check(true);refreshIfSafe()});
  window.addEventListener('afriflow:refresh', function () {check(true)});
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {check(true);refreshIfSafe()}
  });
  setInterval(function () {check(false);refreshIfSafe()}, 120000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {check(true)}, {once:true});
  } else check(true);
})();
