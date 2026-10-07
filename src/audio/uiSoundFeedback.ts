import type { SoundFeedback } from "./soundFeedback";

const clickable = 'button, [role="button"], [role="tab"], [role="radio"], a[href], summary, input[type="button"], input[type="submit"]';
const changeable = 'select, input[type="checkbox"], input[type="radio"], input[type="range"]';

export function bindUiSoundFeedback(document: Document, sound: SoundFeedback) {
  const unlock = () => { void sound.unlock(); };
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  document.addEventListener("keydown", unlock, { capture: true });
  // Capture before handlers replace dynamic rows or disable a submitting button.
  document.addEventListener("click", (event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const control = event.target.closest(clickable);
    if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert], [hidden]')) return;
    if (control.getAttribute("data-sound") === "result") return;
    sound.play("select");
  }, { capture: true });
  document.addEventListener("change", (event) => {
    if (!event.isTrusted || !(event.target instanceof Element) || !event.target.matches(changeable)) return;
    if (event.target.matches(':disabled, [aria-disabled="true"]') || event.target.closest('[inert], [hidden]')) return;
    sound.play("select");
  }, { capture: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) sound.stop(); });
  window.addEventListener("pagehide", () => sound.stop());
}
