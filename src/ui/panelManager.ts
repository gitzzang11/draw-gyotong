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
    if (panel.content.innerHTML !== html) panel.content.innerHTML = html;
    return true;
  }

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
