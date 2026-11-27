(() => {
  const button = document.getElementById('afLogoMotionToggle');
  const sources = Array.from(document.querySelectorAll('#afHomeLogoPlayer source'));
  const media = sources.map(source => source.media);
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 640px), (pointer: coarse)');
  let playing = false;
  let originalUrl;
  let download;

  async function loadOriginal() {
    if (originalUrl || download) return;
    download = new AbortController();
    const currentDownload = download;
    try {
      const responses = await Promise.all([
        fetch('./afriflow-animation-originale-1.bin', { signal: currentDownload.signal }),
        fetch('./afriflow-animation-originale-2.bin', { signal: currentDownload.signal })
      ]);
      if (responses.some(response => !response.ok)) throw new Error('Animation unavailable');
      const parts = await Promise.all(responses.map(response => response.arrayBuffer()));
      if (currentDownload.signal.aborted) return;
      originalUrl = URL.createObjectURL(new Blob(parts, { type: 'image/webp' }));
      sources[0].srcset = originalUrl;
    } catch (error) {
      if (error.name !== 'AbortError') console.warn('Animation AfriFlow indisponible', error);
    } finally {
      if (download === currentDownload) download = null;
    }
  }

  function render() {
    const allowed = !preference.matches || playing;
    sources[0].media = playing ? '(max-width: 640px), (pointer: coarse)' : media[0];
    sources[1].media = playing ? 'all' : media[1];
    button.hidden = !preference.matches;
    button.textContent = playing ? 'Arrêter l’animation' : 'Animer le logo';
    if (mobile.matches && allowed) {
      loadOriginal();
    } else if (download) {
      download.abort();
      download = null;
    }
  }

  button.addEventListener('click', () => { playing = !playing; render(); });
  preference.addEventListener('change', () => { playing = false; render(); });
  mobile.addEventListener('change', render);
  render();
})();
