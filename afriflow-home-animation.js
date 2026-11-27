(() => {
  const source = document.getElementById('afMobileLogo');
  const picture = source.parentElement;
  const poster = source.srcset;
  const mobile = matchMedia(source.media);
  const dense = matchMedia('(min-resolution: 1.5dppx)');
  let inView = false;
  let active = null;

  function reset() {
    if (!active) return;
    active.controller.abort();
    source.srcset = poster;
    if (active.url) URL.revokeObjectURL(active.url);
    active = null;
  }

  async function update() {
    if (!mobile.matches) {
      reset();
      return;
    }
    const file = dense.matches ? 'afriflow-accueil-mobile-hd.webp' : 'afriflow-accueil-mobile.webp';
    if (active && active.file !== file) reset();
    if (active || !inView || document.hidden ||
        document.documentElement.classList.contains('af-startup-pending')) return;

    const job = { file, controller: new AbortController() };
    active = job;
    try {
      const response = await fetch(file, { signal: job.controller.signal });
      if (!response.ok) throw new Error('Animation unavailable');
      const blob = await response.blob();
      if (active !== job) return;
      job.url = URL.createObjectURL(blob);
      const ready = new Image();
      ready.src = job.url;
      await ready.decode();
      if (active !== job) return;
      if (document.hidden || !inView) { reset(); return; }
      source.srcset = job.url;
    } catch {
      if (active === job) reset();
    }
  }

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    update();
  }).observe(picture);
  mobile.addEventListener('change', update);
  dense.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('afriflow:startup-ready', update);
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', update);
  window.addEventListener('online', update);
})();
