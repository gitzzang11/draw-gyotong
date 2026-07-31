import { PanelManager } from "./panelManager";

export function renderConnectionTargetCard(name: string, color: string, location: string, label: string) {
  return `<article class="connection-target-card" style="--connection-color:${color}">
    <span class="connection-route-label">${label}</span>
    <i class="connection-line-swatch" aria-hidden="true"></i>
    <span class="connection-route-copy"><strong>${name}</strong><small>${location} 끝점</small></span>
  </article>`;
}

export function renderConnectionChoice(value: string, title: string, description: string, checked = false) {
  const icon = value === "merge" ? "⇄" : value === "transfer" ? "◎" : "×";
  return `<label class="connection-choice">
    <span class="connection-choice-icon" aria-hidden="true">${icon}</span>
    <span class="connection-choice-copy"><strong>${title}</strong><small>${description}</small></span>
    ${checked ? "<em>추천</em>" : ""}
    <input type="radio" name="connectionChoice" value="${value}" ${checked ? "checked" : ""} />
  </label>`;
}

export class DialogManager {
  private confirming = false;
  constructor(private readonly manager: PanelManager) {}

  open(kind: string, entityId: string | null = null) {
    this.confirming = false;
    return this.manager.open(`dialog:${kind}`, entityId);
  }

  close(kind: string) {
    this.confirming = false;
    this.manager.close(`dialog:${kind}`);
  }

  bind(kind: string, key: string, target: EventTarget, type: keyof GlobalEventHandlersEventMap, handler: (event: Event) => void) {
    return this.manager.bind(`dialog:${kind}`, key, target, type, handler);
  }

  bindConfirmation(kind: string, target: EventTarget, action: (event: Event) => void | Promise<void>) {
    return this.bind(kind, "confirm", target, "click", (event) => {
      if (this.confirming) return;
      this.confirming = true;
      void Promise.resolve(action(event)).finally(() => {
        this.confirming = false;
      });
    });
  }
}
