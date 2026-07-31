import { PanelManager } from "./panelManager";

export class OperationsPanel {
  readonly kind = "operations";
  constructor(private readonly manager: PanelManager, private readonly content: HTMLElement) {}

  open(viewId: string) {
    this.manager.open(this.kind, viewId);
  }

  render(html: string, onAction?: (event: Event) => void) {
    this.manager.updateContent(this.kind, html);
    if (onAction) this.manager.bind(this.kind, "actions", this.content, "click", onAction);
  }

  close() { this.manager.close(this.kind); }
}
