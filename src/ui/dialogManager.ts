import { PanelManager } from "./panelManager";
import { createBackdropDismissHandlers } from "./backdropDismiss";

/** 연결 대상 행: 이름·색은 호출하는 쪽에서 이스케이프한 값이다. */
export function renderConnectionTargetCard(name: string, color: string, location: string, label: string) {
  return `<div class="dg-row game-connection-target">
    <span class="dg-row__label game-inspector__route"><span class="dg-tag">${label}</span><span class="game-color-swatch" style="--selected-route-color:${color}" aria-hidden="true"></span><strong>${name}</strong></span>
    <span class="dg-row__value game-inspector__muted">${location} 끝점</span>
  </div>`;
}

export function renderConnectionChoice(value: string, title: string, description: string, checked = false) {
  const icon = value === "merge" ? "⇄" : value === "transfer" ? "◎" : "×";
  return `<label class="game-choice">
    <input type="radio" name="connectionChoice" value="${value}" ${checked ? "checked" : ""} />
    <span class="game-choice__icon" aria-hidden="true">${icon}</span>
    <span class="game-route-item__text"><strong>${title}${checked ? " · 추천" : ""}</strong><small>${description}</small></span>
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

  bindBackdropDismiss(kind: string, backdrop: HTMLElement, closeModal: () => void) {
    const handlers = createBackdropDismissHandlers(closeModal);
    this.bind(kind, "backdrop:pointerdown", backdrop, "pointerdown", (event) => handlers.pointerDown(event as PointerEvent));
    this.bind(kind, "backdrop:pointerup", backdrop, "pointerup", (event) => handlers.pointerUp(event as PointerEvent));
    this.bind(kind, "backdrop:pointercancel", backdrop, "pointercancel", handlers.pointerCancel);
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
