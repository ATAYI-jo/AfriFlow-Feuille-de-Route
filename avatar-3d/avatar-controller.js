// Contrôleur d'affichage et de voix : le portrait reste utilisable sans GLB ni WebGL.
import { initAvatar, isLoaded, playAnimation } from "./model-viewer.js";
import { handleConversationState } from "./conversation-states.js";
const $ = id => document.getElementById(id);
const photo = $("photoMode"), viewport = $("avatarViewport"), feedback = $("feedback"), status = $("sceneStatus");
const synth = window.speechSynthesis;
let utterance = null, state = "idle", show3d = false;
function note(s) { if (feedback) feedback.textContent = s; }
function switchMode(photoMode) {
  show3d = !photoMode && isLoaded;
  photo.classList.toggle("hidden", show3d);
  $("modePhoto").classList.toggle("active", !show3d);
  $("mode3d").classList.toggle("active", show3d);
  status.textContent = show3d ? "Modèle GLB chargé" : "Portrait original AfriFloW";
  document.querySelector(".hint").textContent = show3d ? "Modèle 3D chargé et articulé" : "Image originale, sans déformation des traits";
}
async function open3D() {
  $("mode3d").disabled = true;
  note("Recherche du modèle GLB...");
  try {
    await initAvatar(viewport);
    switchMode(false);
    note("Modèle GLB chargé. Les animations disponibles dépendent du fichier.");
  } catch (e) {
    switchMode(true);
    note(e.message || "Impossible de charger le modèle 3D.");
  } finally { $("mode3d").disabled = false; }
}
function setState(next) {
  state = String(next || "idle").toLowerCase();
  if (show3d && $("idle").checked) handleConversationState(state);
  return state;
}
function stop() {
  synth?.cancel();
  utterance = null;
  setState("idle");
  note("Lecture arrêtée.");
}
function speak(value) {
  const text = String(value ?? "").trim().slice(0, 2500);
  if (!text) return false;
  if (!synth || !window.SpeechSynthesisUtterance) { note("Synthèse vocale non disponible."); return false; }
  synth.cancel();
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = "fr-FR"; speech.rate = .94; speech.pitch = 1.04;
  speech.onstart = () => { setState("talking"); note("Lecture en cours…"); };
  speech.onend = () => { utterance = null; setState("idle"); note("Lecture terminée."); };
  speech.onerror = () => { utterance = null; setState("idle"); note("Lecture vocale indisponible."); };
  utterance = speech; synth.speak(speech); return true;
}
$("modePhoto").addEventListener("click", () => switchMode(true));
$("mode3d").addEventListener("click", open3D);
$("play").addEventListener("click", () => speak($("message").value));
$("stop").addEventListener("click", stop);
$("idle").addEventListener("change", () => { if ($("idle").checked) setState(state); else playAnimation("idle"); });
window.AfriFlowAvatar = { speak, stop, setState, play: setState, get isSpeaking() { return !!utterance; } };
window.addEventListener("message", event => {
  if (event.origin !== location.origin || !event.data) return;
  if (event.data.type === "AFRIFLOW_SPEAK") speak(event.data.text);
  if (event.data.type === "AFRIFLOW_STATE") setState(event.data.state);
});
window.addEventListener("beforeunload", () => synth?.cancel());
switchMode(true);
// Sans un vrai GLB, aucun avatar 3D approximatif n'est affiché.
