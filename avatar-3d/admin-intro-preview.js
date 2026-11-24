/* Private rollout: no Three.js module or 18 MB GLB is loaded for ordinary visitors. */
(() => {
  'use strict';
  let button = null;
  let closeActive = null;
  const isAdmin = () => window.USER_ROLE === 'admin' && !!window.loggedUserEmail;
  function teardown() {
    if (closeActive) closeActive();
    closeActive = null;
  }
  function refresh(role) {
    const allowed = role === 'admin' && isAdmin();
    if (!allowed) { teardown(); button?.remove(); button = null; return; }
    if (button) return;
    button = document.createElement('button');
    button.id = 'afIntroAdminPreviewBtn';
    button.type = 'button';
    button.textContent = 'Tester les animations 3D';
    button.title = 'Prévisualisation réservée à l’administrateur';
    Object.assign(button.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: '10002',
      padding: '11px 16px', borderRadius: '24px', background: '#176341',
      color: 'white', border: '1px solid #d0e3d5', boxShadow: '0 6px 22px #0002',
      fontWeight: '600', cursor: 'pointer'
    });
    button.addEventListener('click', preview);
    document.body.appendChild(button);
  }
  async function preview() {
    if (!isAdmin() || closeActive) return;
    const overlay = document.createElement('div');
    overlay.id = 'afAdminIntroPreview';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10010', background: 'white',
      overflow: 'hidden', display: 'block'
    });
    overlay.innerHTML = '<video playsinline webkit-playsinline preload="auto" aria-label="Prévisualisation de l’introduction AfriFlow" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;opacity:0;transition:opacity .3s" src="./afriflow-intro-white.mp4"></video><button type="button" aria-label="Fermer la prévisualisation" style="position:absolute;z-index:20;top:14px;right:14px;padding:10px 16px;border:0;border-radius:20px;background:#175c3d;color:white;cursor:pointer">Fermer ✕</button>';
    const css = document.createElement('style');
    css.textContent = '#afAdminIntroPreview .af-intro-avatar{position:absolute;right:2%;bottom:2%;width:min(30vw,380px);height:min(75vh,580px);pointer-events:none;opacity:0;transition:opacity .35s;z-index:5}#afAdminIntroPreview .af-intro-avatar.visible{opacity:1}#afAdminIntroPreview canvas{width:100%;height:100%;display:block;pointer-events:none}@media(max-width:650px){#afAdminIntroPreview .af-intro-avatar{right:0;bottom:3%;width:45vw;height:54vh}}';
    overlay.appendChild(css);
    document.body.appendChild(overlay);
    const video = overlay.querySelector('video');
    let controller, beginTimer, safeTimer, active = true, startedVideo = false;
    const beginVideo = () => {
      if (!active || startedVideo) return;
      startedVideo = true;
      video.style.opacity = '1';
      video.muted = false;
      const attempt = video.play();
      if (attempt?.catch) attempt.catch(() => { video.muted = true; return video.play().catch(() => {}); });
    };
    const handleReady = () => { if (active && isAdmin()) beginTimer = setTimeout(beginVideo, 1800); };
    const handleRole = () => { if (!isAdmin()) cleanup(); };
    const cleanup = () => {
      if (!active) return;
      active = false;
      clearTimeout(beginTimer); clearTimeout(safeTimer);
      video.pause(); video.removeAttribute('src'); video.load();
      controller?.stop();
      window.removeEventListener('afriflow:intro-avatar-ready', handleReady);
      window.removeEventListener('afriflow:verified-role', handleRole);
      overlay.remove();
      closeActive = null;
    };
    closeActive = cleanup;
    overlay.querySelector('button').addEventListener('click', cleanup);
    video.addEventListener('ended', cleanup, {once:true});
    video.addEventListener('click', () => { if (startedVideo) video.muted = !video.muted; });
    window.addEventListener('afriflow:intro-avatar-ready', handleReady);
    window.addEventListener('afriflow:verified-role', handleRole);
    safeTimer = setTimeout(beginVideo, 9500);
    try {
      const {installIntroAssistant} = await import('./intro-assistant.js?v=20261123-admin-only');
      if (!active || !isAdmin()) return cleanup();
      controller = installIntroAssistant(video, overlay);
      if (!controller) return beginVideo();
      controller.start();
    } catch (error) {
      console.warn('[AfriFlow] Prévisualisation 3D indisponible:', error);
      beginVideo();
    }
  }
  window.addEventListener('afriflow:verified-role', event => refresh(event.detail?.role));
})();
