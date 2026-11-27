(() => {
  const source = document.getElementById('afMobileLogo');
  const player = document.getElementById('afHomeLogoPlayer');
  const mobile = matchMedia(source.media);
  const poster = source.srcset;
  let visible = false;
  let session;

  // The MP4 carries colour on the left and its transparency mask on the right.
  function createRenderer(gl) {
    if (!gl) throw new Error('WebGL unavailable');
    const program = gl.createProgram();
    function attach(type, code) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    attach(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){gl_Position=vec4(p,0.,1.);uv=vec2(.5+.5*p.x,.5-.5*p.y);}');
    attach(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 uv; uniform sampler2D frame; void main(){vec2 xy=vec2(uv.x*.5,uv.y);gl_FragColor=vec4(texture2D(frame,xy).rgb,texture2D(frame,xy+vec2(.5,0.)).r);}');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Video shader unavailable');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, wrap, gl.CLAMP_TO_EDGE);
    for (const filter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, filter, gl.LINEAR);
    return video => {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  }

  async function start(signal) {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 460;
    for (const el of [canvas, video]) el.setAttribute('aria-hidden', 'true');
    video.muted = video.defaultMuted = video.playsInline = video.loop = true;
    video.setAttribute('playsinline', '');
    let url;
    let gl;
    let released = false;
    function release() {
      if (released) return;
      released = true;
      player.classList.remove('is-playing');
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      canvas.remove();
      if (url) URL.revokeObjectURL(url);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    function fallback() {
      release();
      if (!signal.aborted) source.srcset = devicePixelRatio >= 1.5 ? 'afriflow-accueil-mobile-hd.webp?v=bords2' : 'afriflow-accueil-mobile.webp?v=bords2';
    }
    signal.addEventListener('abort', release, { once: true });
    try {
      if (!video.requestVideoFrameCallback || !video.canPlayType('video/mp4')) return fallback();
      gl = canvas.getContext('webgl', {
        alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false
      });
      const draw = createRenderer(gl);
      const response = await fetch('afriflow-accueil-mobile-24.mp4?v=bords2', { signal });
      if (!response.ok) throw new Error('Video unavailable');
      const blob = await response.blob();
      if (signal.aborted) return;
      url = URL.createObjectURL(blob);
      video.addEventListener('error', () => { if (!released) fallback(); });
      canvas.addEventListener('webglcontextlost', () => { if (!released) fallback(); });
      player.append(video, canvas);
      video.preload = 'auto';
      function onFrame() {
        if (released) return;
        try {
          draw(video);
          player.classList.add('is-playing');
          video.requestVideoFrameCallback(onFrame);
        } catch { fallback(); }
      }
      video.addEventListener('loadeddata', async () => {
        if (released) return;
        try {
          // Upload the first texture before advancing the playback clock.
          draw(video);
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (released) return;
          video.requestVideoFrameCallback(onFrame);
          await video.play();
        } catch { if (!released) fallback(); }
      }, { once: true });
      video.src = url;
    } catch { if (!released) fallback(); }
  }

  function update() {
    const ready = mobile.matches && visible && !document.hidden &&
      !document.documentElement.classList.contains('af-startup-pending');
    if (ready && !session) {
      session = new AbortController();
      start(session.signal);
    } else if (!ready && session) {
      session.abort();
      session = null;
      source.srcset = poster;
    }
  }
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(player);
  mobile.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('afriflow:startup-ready', update);
  window.addEventListener('pagehide', () => { visible = false; update(); });
  window.addEventListener('pageshow', () => {
    const rect = player.getBoundingClientRect();
    visible = rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    update();
  });
})();
