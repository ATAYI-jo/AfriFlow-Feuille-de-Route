(() => {
  const button = document.getElementById('afLogoMotionToggle');
  const sources = Array.from(document.querySelectorAll('#afHomeLogoPlayer source'));
  const media = sources.map(source => source.media);
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = false;

  function render() {
    sources[0].media = playing ? '(max-width: 640px), (pointer: coarse)' : media[0];
    sources[1].media = playing ? 'all' : media[1];
    button.hidden = !preference.matches;
    button.textContent = playing ? 'Arrêter l’animation' : 'Animer le logo';
  }

  button.addEventListener('click', () => { playing = !playing; render(); });
  preference.addEventListener('change', () => { playing = false; render(); });
  render();
})();
