import { ListenerRegistry } from "./listenerRegistry";

export interface PanelRegistration {
  id: string;
  element: HTMLElement;
  content?: HTMLElement | null;
}

export interface ActivePanel {
  kind: string;
  entityId: string | null;
}

export class PanelManager {
  readonly listeners: ListenerRegistry;
  private readonly panels = new Map<string, PanelRegistration>();
  private active: ActivePanel | null = null;

  constructor(listeners = new ListenerRegistry()) {
    this.listeners = listeners;
  }

  register(panel: PanelRegistration) {
    this.panels.set(panel.id, panel);
    return this;
  }

  open(kind: string, entityId: string | null = null) {
    const panel = this.panels.get(kind);
    if (!panel) return false;
    if (this.active && (this.active.kind !== kind || this.active.entityId !== entityId)) {
      this.close(this.active.kind);
    }
    this.active = { kind, entityId };
    panel.element.hidden = false;
    return true;
  }

  close(kind = this.active?.kind) {
    if (!kind) return;
    this.listeners.clearScope(this.scope(kind));
    const panel = this.panels.get(kind);
    if (panel) panel.element.hidden = true;
    if (this.active?.kind === kind) this.active = null;
  }

  render(kind: string, entityId: string | null, html: string) {
    const panel = this.panels.get(kind);
    if (!panel?.content) return false;
    if (this.active?.kind !== kind || this.active.entityId !== entityId) this.open(kind, entityId);
    return this.updateContent(kind, html);
  }

  updateContent(kind: string, html: string) {
    const panel = this.panels.get(kind);
    if (!panel?.content) return false;
    const content = panel.content;
    // 패널 안 입력칸에 입력 중이면 다시 그리지 않는다. innerHTML을 바꾸면 입력칸이 새로 만들어져
    // 모바일 한글 조합(모아쓰기)이 끊기고 커서가 사라진다. 입력칸을 벗어날 때 마지막 내용으로 한 번 반영한다.
    if (isEditingTextIn(content)) {
      this.pendingContent.set(kind, html);
      if (!this.pendingListeners.has(kind)) {
        this.pendingListeners.add(kind);
        content.addEventListener("focusout", () => {
          this.pendingListeners.delete(kind);
          // 포커스가 같은 패널의 다른 입력칸으로 옮겨 간 경우를 기다린 뒤 반영한다.
          window.setTimeout(() => {
            const pending = this.pendingContent.get(kind);
            if (pending === undefined) return;
            if (isEditingTextIn(content)) return void this.updateContent(kind, pending);
            this.pendingContent.delete(kind);
            if (content.innerHTML !== pending) content.innerHTML = pending;
          }, 0);
        }, { once: true });
      }
      return true;
    }
    this.pendingContent.delete(kind);
    if (content.innerHTML !== html) content.innerHTML = html;
    return true;
  }

  private readonly pendingContent = new Map<string, string>();
  private readonly pendingListeners = new Set<string>();

  bind(
    kind: string,
    key: string,
    target: EventTarget,
    type: keyof GlobalEventHandlersEventMap,
    handler: (event: Event) => void,
  ) {
    return this.listeners.add(`${this.scope(kind)}:${key}`, target, type, handler, undefined, this.scope(kind));
  }

  closeMissing(kind: string, exists: (entityId: string) => boolean) {
    if (this.active?.kind !== kind || !this.active.entityId) return false;
    if (exists(this.active.entityId)) return false;
    this.close(kind);
    return true;
  }

  get current(): ActivePanel | null {
    return this.active ? { ...this.active } : null;
  }

  private scope(kind: string) {
    return `panel:${kind}`;
  }
}

/** 글자 입력칸(텍스트·숫자·여러 줄)에 포커스가 있으면 입력 중으로 본다. */
function isEditingTextIn(container: HTMLElement) {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active || !container.contains(active)) return false;
  if (active instanceof HTMLTextAreaElement) return !active.readOnly;
  if (!(active instanceof HTMLInputElement) || active.readOnly) return false;
  return ["text", "search", "number", "tel", "url", "email", ""].includes(active.type);
}
