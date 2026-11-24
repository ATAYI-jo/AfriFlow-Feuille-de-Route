import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/GLTFLoader.js';

// Dedicated, optional introduction overlay. Does not change the site's conversation avatar.
export function installIntroAssistant(video, container) {
  if (!video || !container || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const panel = document.createElement('div');
  panel.className = 'af-intro-avatar';
  panel.setAttribute('aria-hidden', 'true');
  container.appendChild(panel);
  let renderer, mixer, model, observer, raf = 0, timer = 0, disposed = false;
  let current, prior = '', started = false, lastFrame = 0, lastTime = 0;
  let baseX = 0, walking = false, walkSince = 0;
  let camera, scene, clock;
  const actions = new Map();
  const cleanupEvents = [];
  const add = (target, name, fn) => { target.addEventListener(name, fn); cleanupEvents.push(() => target.removeEventListener(name, fn)); };
  const mobile = () => matchMedia('(max-width: 650px)').matches;
  function stop() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cleanupEvents.forEach(fn => fn());
    if (observer) observer.disconnect();
    if (mixer) mixer.stopAllAction();
    panel.classList.remove('visible');
    if (model) model.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.geometry) obj.geometry.dispose();
      for (const material of [obj.material].flat()) {
        if (!material) continue;
        for (const value of Object.values(material)) if (value && value.isTexture) value.dispose();
        material.dispose();
      }
    });
    setTimeout(() => {
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
      panel.remove();
    }, 250);
  }
  function playGesture() {
    if (disposed || video.ended || !actions.size) return;
    const eligible = [...actions.keys()].filter(name => name !== prior);
    if (!eligible.length) return;
    // Make the first welcome unmistakable, then rotate through varied gestures.
    const key = prior ? eligible[Math.floor(Math.random() * eligible.length)] : 'salut';
    prior = key;
    window.dispatchEvent(new CustomEvent('afriflow:intro-avatar-gesture', { detail: { name: key } }));
    const next = actions.get(key);
    walking = key === 'marcher';
    if (walking) walkSince = performance.now();
    next.reset();
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    if (current) current.fadeOut(.35);
    next.fadeIn(.35).play();
    current = next;
    timer = setTimeout(playGesture, (next.getClip().duration + .22 + Math.random() * .4) * 1000);
  }
  function render(t) {
    if (disposed || video.ended) return;
    raf = requestAnimationFrame(render);
    if (document.hidden) { lastTime = t; return; }
    const delta = Math.max(0, Math.min((t - (lastTime || t)) / 1000, .05));
    lastTime = t;
    if (mixer) mixer.update(delta);
    if (model) {
      model.rotation.y = Math.sin(t * .00072) * .045;
      const travel = walking ? Math.sin(Math.min(Math.max((t - walkSince) / 2300, 0), 1) * Math.PI) * .42 : 0;
      model.position.x = baseX - travel;
    }
    if (t - lastFrame < (mobile() ? 1000 / 24 : 1000 / 30)) return;
    lastFrame = t;
    renderer.render(scene, camera);
  }
  function makeClip(name, bones, duration, poses) {
    const tracks = [];
    for (const [boneName, keys] of Object.entries(poses)) {
      const bone = bones.get(boneName);
      if (!bone) continue;
      const times = [], values = [];
      for (const [fraction, xyz] of keys) {
        const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(...xyz));
        const q = bone.quaternion.clone().multiply(offset);
        times.push(fraction * duration);
        values.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(bone.uuid + '.quaternion', times, values));
    }
    if (tracks.length) actions.set(name, mixer.clipAction(new THREE.AnimationClip(name, duration, tracks)));
  }
  async function start() {
    if (started || disposed || video.ended) return;
    started = true;
    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile(), powerPreference: 'low-power' });
      renderer.setClearColor(0, 0);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile() ? 1.25 : 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.32;
      panel.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd2dbd5, 2.5));
      const key = new THREE.DirectionalLight(0xffffff, 3.0);
      key.position.set(-2, 3.8, 4.5);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xf2f7ff, 1.65);
      fill.position.set(3, 2, 2.6);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, .75);
      rim.position.set(0, 3, -3);
      scene.add(rim);
      const gltf = await new GLTFLoader().loadAsync('/avatar-3d/models/afriflow-assistante.glb');
      if (disposed || video.ended) return stop();
      model = gltf.scene;
      // The original atlas is preserved; remove problematic metallic, roughness and normal maps.
      model.traverse(node => {
        if (!node.isMesh) return;
        for (const mat of [node.material].flat()) {
          if (!mat || !mat.isMeshStandardMaterial) continue;
          mat.metalnessMap = null;
          mat.roughnessMap = null;
          mat.normalMap = null;
          mat.metalness = 0;
          mat.roughness = .82;
          mat.needsUpdate = true;
        }
      });
      scene.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 2.8 / Math.max(size.y, .001);
      model.scale.multiplyScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      baseX = model.position.x;
      camera.position.set(0, 1.42, 7.2);
      camera.lookAt(0, 1.35, 0);
      mixer = new THREE.AnimationMixer(model);
      const nativeWalk = gltf.animations.find(clip => /walk/i.test(clip.name));
      if (nativeWalk) actions.set('marcher', mixer.clipAction(nativeWalk));
      const bones = new Map();
      model.traverse(object => { if (object.isBone) bones.set(object.name, object); });
      const Z = [0,0,0], A = [0,0,.95], B = [0,0,-.95], C = [0,0,1.5], D = [0,0,-1.5];
      const pose = (bone, move, end=Z) => ({[bone]:[[0,Z],[.22,move],[.73,move],[1,end]]});
      makeClip('salut', bones, 2.8, {
        ...pose('RightArm',D),
        RightForeArm:[[0,Z],[.2,[0,-.15,-1.15]],[.4,[0,.2,-1.3]],[.6,[0,-.2,-1.15]],[.8,[0,.2,-1.3]],[1,Z]],
        Head:[[0,Z],[.4,[0,.12,.1]],[1,Z]]
      });
      makeClip('joie', bones, 2.1, {
        LeftArm:[[0,Z],[.22,A],[.5,C],[.75,A],[1,Z]],
        RightArm:[[0,Z],[.22,B],[.5,D],[.75,B],[1,Z]],
        LeftUpLeg:[[0,Z],[.5,[.22,0,0]],[1,Z]],
        RightUpLeg:[[0,Z],[.5,[-.22,0,0]],[1,Z]]
      });
      makeClip('presentation', bones, 3.3, {
        ...pose('LeftArm',A), ...pose('RightArm',B),
        Head:[[0,Z],[.4,[0,-.13,0]],[1,Z]]
      });
      makeClip('danse', bones, 3.2, {
        LeftArm:[[0,Z],[.2,A],[.5,[0,0,.25]],[.8,A],[1,Z]],
        RightArm:[[0,Z],[.2,[0,0,-.3]],[.5,B],[.8,[0,0,-.3]],[1,Z]],
        Head:[[0,Z],[.2,[0,0,.1]],[.5,[0,0,-.1]],[.8,[0,0,.1]],[1,Z]]
      });
      makeClip('curiosite', bones, 2.8, {
        Head:[[0,Z],[.23,[0,.32,0]],[.55,[0,-.3,0]],[.8,[.08,0,0]],[1,Z]]
      });
      makeClip('reverence', bones, 2.5, {
        Spine:[[0,Z],[.38,[.19,0,0]],[.66,[.19,0,0]],[1,Z]],
        Head:[[0,Z],[.38,[.12,0,0]],[.66,[.12,0,0]],[1,Z]]
      });
      makeClip('victoire', bones, 2.8, {
        ...pose('RightArm',D), ...pose('RightForeArm',[0,0,-.4]),
        RightHandIndex1:[[0,Z],[.3,[.3,0,0]],[.7,[.3,0,0]],[1,Z]]
      });
      makeClip('applaudir', bones, 2.8, {
        LeftArm:[[0,Z],[.2,[0,-.7,.6]],[.4,[0,-.55,.6]],[.6,[0,-.7,.6]],[.8,[0,-.55,.6]],[1,Z]],
        RightArm:[[0,Z],[.2,[0,.7,-.6]],[.4,[0,.55,-.6]],[.6,[0,.7,-.6]],[.8,[0,.55,-.6]],[1,Z]],
        LeftForeArm:[[0,Z],[.2,[0,0,.65]],[.8,[0,0,.65]],[1,Z]],
        RightForeArm:[[0,Z],[.2,[0,0,-.65]],[.8,[0,0,-.65]],[1,Z]]
      });
      // Complex hand-heart, kiss and facial movements require authored/baked clips and are deliberately not faked.
      const resize = () => {
        const w = Math.max(panel.clientWidth, 1), h = Math.max(panel.clientHeight, 1);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(panel);
      resize();
      panel.classList.add('visible');
      lastTime = performance.now();
      raf = requestAnimationFrame(render);
      playGesture();
      window.dispatchEvent(new CustomEvent('afriflow:intro-avatar-ready', { detail: { gestures: [...actions.keys()] } }));
    } catch (error) {
      console.warn('[AfriFlow] Intro 3D unavailable:', error);
      stop();
    }
  }
  add(video, 'playing', () => { if (!started) start(); });
  add(video, 'ended', stop);
  add(video, 'error', stop);
  add(window, 'pagehide', stop);
  add(window, 'afriflow:intro-finish', stop);
  add(document, 'visibilitychange', () => { if (!document.hidden) lastTime = performance.now(); });
  if (!video.paused && !video.ended) start();
  return { stop, start };
}
