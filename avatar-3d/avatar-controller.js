// Assistante AfriFloW : 3D réelle seulement. Aucune image 2D de secours.
import {initAvatar, isLoaded, playAnimation} from "./model-viewer.js";
import {handleConversationState} from "./conversation-states.js";

const $ = id => document.getElementById(id);
const viewport = $("avatarViewport");
const feedback = $("feedback");
const status = $("sceneStatus");
const synth = window.speechSynthesis;
let utterance = null, state = "idle", ready = false;

function note(s) { if (feedback) feedback.textContent = String(s); }
function setState(next) {
  state = String(next || "idle").toLowerCase();
  if (ready) handleConversationState(state);
  return state;
}
async function start() {
  status.textContent = "Chargement du fichier 3D…";
  note("Chargement de afriflow-assistante.glb…");
  try {
    await initAvatar(viewport, "./models/afriflow-assistante.glb");
    ready = isLoaded;
    if (!ready) throw new Error("Le modèle 3D n'a pas été chargé.");
    status.textContent = "Assistante 3D disponible";
    note("Modèle 3D chargé. Les gestes et expressions dépendent de ses animations.");
    setState("idle");
  } catch (err) {
    ready = false;
    status.textContent = "Modèle 3D indisponible";
    note("Aucun avatar 2D de remplacement. " + (err?.message || "Modèle GLB introuvable."));
    console.warn("AfriFloW 3D :", err);
  }
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
  if (!synth || !window.SpeechSynthesisUtterance) {
    note("Synthèse vocale indisponible dans ce navigateur."); return false;
  }
  synth.cancel();
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = "fr-FR"; speech.rate = .94; speech.pitch = 1.04;
  speech.onstart = () => { setState("talking"); note("Lecture en cours…"); };
  speech.onend = () => { utterance = null; setState("idle"); note("Lecture terminée."); };
  speech.onerror = () => { utterance = null; setState("idle"); note("Lecture vocale indisponible."); };
  utterance = speech; synth.speak(speech); return true;
}
$("play").addEventListener("click", () => speak($("message").value));
$("stop").addEventListener("click", stop);
$("idle").addEventListener("change", () => {
  if ($("idle").checked) setState(state); else playAnimation("idle");
});
window.AfriFlowAvatar = {
  speak, stop, setState, play: setState,
  get isSpeaking() { return !!utterance; },
  get modelReady() { return ready; }
};
window.addEventListener("message", event => {
  if (event.origin !== location.origin || !event.data) return;
  if (event.data.type === "AFRIFLOW_SPEAK") speak(event.data.text);
  if (event.data.type === "AFRIFLOW_STATE") setState(event.data.state);
});
window.addEventListener("beforeunload", () => synth?.cancel());
start();
