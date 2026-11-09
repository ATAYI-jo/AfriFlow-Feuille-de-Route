// AfriFloW - chargeur du véritable modèle 3D (aucun modèle géométrique inventé).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let scene, camera, renderer, mixer, model, clock, observer, raf = 0;
const actions = new Map();
let active = null;
const key = s => String(s || "").toLowerCase().replace(/[ _-]/g, "");
const aliases = { idle: ["idle","breathing","rest"], greeting: ["greeting","hello","wave"], listening: ["listening","listen"], thinking: ["thinking","think"], talking: ["talking","talk","speaking"] };
export let isLoaded = false;
export function playAnimation(name, fade = .3) {
  if (!isLoaded) return false;
  const candidates = aliases[key(name)] || [name];
  const entry = [...actions].find(([k]) => candidates.some(n => key(k) === key(n)));
  if (!entry) return false;
  const next = entry[1];
  if (next === active) return true;
  next.reset().play();
  if (active) next.crossFadeFrom(active, fade, true);
  active = next;
  return true;
}
export function setViseme(meshName, morphTargetName, value) {
  if (!model) return false;
  let changed = false;
  model.traverse(node => {
    if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
    if (meshName && node.name !== meshName) return;
    const index = typeof morphTargetName === "number" ? morphTargetName : node.morphTargetDictionary[morphTargetName];
    if (Number.isInteger(index) && index >= 0 && index < node.morphTargetInfluences.length) {
      node.morphTargetInfluences[index] = Math.max(0, Math.min(1, Number(value) || 0));
      changed = true;
    }
  });
  return changed;
}
export async function initAvatar(viewport, url = "./models/afriflow-assistante.glb") {
  if (!viewport) throw new Error("Conteneur 3D introuvable.");
  if (isLoaded) return;
  // Le fichier GLB est requis ; sans lui on laisse le portrait original visible.
  const probe = await fetch(url, { method: "GET", cache: "no-store" });
  if (!probe.ok) throw new Error("Le modèle afriflow-assistante.glb n’est pas encore présent (HTTP " + probe.status + ").");
  const bytes = await probe.arrayBuffer();
  if (bytes.byteLength < 20 || new DataView(bytes).getUint32(0, true) !== 0x46546c67)
    throw new Error("Le fichier téléchargé n’est pas un GLB valide.");
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "default" });
  } catch (e) {
    throw new Error("WebGL indisponible sur cet appareil. Le portrait original reste disponible.");
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewport.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x82644b, 2.1));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(2, 4, 3); scene.add(light);
  camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
  let gltf;
  try {
    gltf = await new GLTFLoader().parseAsync(bytes, url.substring(0, url.lastIndexOf("/") + 1));
    model = gltf.scene; scene.add(model);
    // Centrer et cadrer le modèle, indépendamment de ses unités et de sa hauteur.
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) throw new Error("Le modèle ne contient aucun maillage visible.");
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const extent = Math.max(size.y, size.x, size.z, .01);
    camera.position.set(0, size.y > 0 ? extent * .08 : 0, extent * 2.2);
    camera.lookAt(0, 0, 0);
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    isLoaded = true;
    playAnimation("idle");
    const resize = () => {
      const w = Math.max(1, viewport.clientWidth), h = Math.max(1, viewport.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    observer = new ResizeObserver(resize); observer.observe(viewport); resize();
    clock = new THREE.Clock();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (mixer) mixer.update(Math.min(clock.getDelta(), .05));
      renderer.render(scene, camera);
    }; draw();
  } catch (err) {
    if (observer) observer.disconnect();
    if (raf) cancelAnimationFrame(raf);
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null; model = null; mixer = null; isLoaded = false;
    throw err;
  }
}
