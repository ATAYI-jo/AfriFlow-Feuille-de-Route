import { playAnimation, setViseme } from "./model-viewer.js";
// Interface proposée pour le chatbot. Les clips doivent réellement exister dans le GLB.
const valid = new Set(["idle","greeting","listening","thinking","talking"]);
export function handleConversationState(state) {
  const s = String(state || "idle").toLowerCase();
  return playAnimation(valid.has(s) ? s : "idle");
}
export { setViseme };
