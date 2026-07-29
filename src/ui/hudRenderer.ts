export interface HudView {
  text?: string;
  hidden?: boolean;
  active?: boolean;
}

export function renderHudView(element: HTMLElement | null, view: HudView) {
  if (!element) return;
  if (view.text !== undefined && element.textContent !== view.text) element.textContent = view.text;
  if (view.hidden !== undefined) element.hidden = view.hidden;
  if (view.active !== undefined) element.classList.toggle("active", view.active);
}
