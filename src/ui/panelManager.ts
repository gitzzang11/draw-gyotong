import { ListenerRegistry } from "./listenerRegistry";

export class PanelManager {
  readonly listeners = new ListenerRegistry();
  private activePanel: string | null = null;

  open(panelId: string, element: HTMLElement) {
    if (this.activePanel && this.activePanel !== panelId) this.close(this.activePanel);
    this.activePanel = panelId;
    element.hidden = false;
  }

  close(panelId: string, element?: HTMLElement) {
    this.listeners.clearScope(`panel:${panelId}`);
    if (element) element.hidden = true;
    if (this.activePanel === panelId) this.activePanel = null;
  }
}
