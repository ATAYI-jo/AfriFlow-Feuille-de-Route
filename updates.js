/* AfriFloW: automatic web updates, without app-store updates.
   No credential storage and no interception of Supabase/Dropbox requests.
   The running page refreshes only when a new site build is detected AND
   the user is idle, to avoid disrupting forms or document editing. */
(function () {
  'use strict';
  var KEY = 'afriflow_site_build_hash_v1';
  var lastInput = Date.now();
  var checking = false;
  var pending = false;
  var baseline = null;

  ['pointerdown', 'keydown', 'input', 'touchstart'].forEach(function (name) {
    document.addEventListener(name, function () { lastInput = Date.now(); }, { passive: true });
  });

  function editing() {
    var focused = document.activeElement;
    if (focused && (focused.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName))) return true;
    if (document.querySelector('[contenteditable="true"]:focus, [contenteditable=""]:focus')) return true;
    // Do not interrupt document editing or opened dialog windows.
    if (document.querySelector('.dw-app:not([hidden]), .dw-modal.on, #xm.on, #ov.on')) return true;
    return false;
  }
  function safeToReload() {
    return navigator.onLine && !document.hidden && !editing() &&
      Date.now() - lastInput > 45000 &&
      !/(?:^|[?#&])(?:code|access_token|error_description)=/.test(location.search + '&' + location.hash);
  }
  function hash(text) {
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', bytes).then(function (buffer) {
      return Array.from(new Uint8Array(buffer)).map(function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    });
  }
  function refreshIfSafe() {
    if (!pending || !safeToReload()) return;
    pending = false;
    // Loads the newest HTML while preserving Supabase/Dropbox account storage.
    location.reload();
  }
  function check() {
    if (checking || !navigator.onLine || document.hidden) return;
    checking = true;
    // Same-origin HTML re-fetch bypasses HTTP cache; no private API is queried.
    fetch(location.pathname, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) { if (!response.ok) throw new Error('site unavailable'); return response.text(); })
      .then(hash)
      .then(function (current) {
        if (!baseline) {
          try { baseline = localStorage.getItem(KEY); } catch (error) {}
        }
        if (baseline && baseline !== current) pending = true;
        baseline = current;
        try { localStorage.setItem(KEY, current); } catch (error) {}
        refreshIfSafe();
      })
      .catch(function () { /* A network failure must never interrupt the application. */ })
      .finally(function () { checking = false; });
  }
  window.addEventListener('online', function () { check(); });
  window.addEventListener('focus', function () { check(); refreshIfSafe(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { check(); refreshIfSafe(); }
  });
  setInterval(function () { check(); refreshIfSafe(); }, 300000);
  // Run the first build check shortly after the site starts.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check, { once: true });
  } else {
    check();
  }
})();
