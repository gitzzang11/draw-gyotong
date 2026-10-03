import { PanelManager } from "./panelManager";

export interface LinePanelView {
  id: string;
  name: string;
  color: string;
  meta: string;
  summary: string;
  visibility: "public" | "planning";
  localService: boolean;
  expressService: boolean;
  paused: boolean;
  fare: string;
  autoFare: boolean;
}

export interface LinePanelElements {
  title: HTMLElement | null;
  meta: HTMLElement | null;
  color: HTMLElement | null;
  nameInput: HTMLInputElement | null;
  colorInput: HTMLInputElement | null;
  visibilitySelect: HTMLSelectElement | null;
  localToggle: HTMLInputElement | null;
  expressToggle: HTMLInputElement | null;
  pausedToggle: HTMLInputElement | null;
  fareInput: HTMLInputElement | null;
  autoFareButton: HTMLElement | null;
  summary: HTMLElement | null;
  routeList: HTMLElement | null;
}

export interface RouteListItemView {
  id: string;
  name: string;
  color: string;
  meta: string;
  selected: boolean;
}

export class LinePanel {
  readonly kind = "line";
  constructor(private readonly manager: PanelManager, private readonly elements: LinePanelElements) {}

  render(view: LinePanelView) {
    const element = this.elements;
    if (element.title) element.title.textContent = view.name;
    if (element.meta) element.meta.textContent = view.meta;
    if (element.color) element.color.style.background = view.color;
    // inspector 상단 띠를 노선 색으로 바꾼다(DESIGN_SYSTEM §12 Panels).
    element.color?.closest<HTMLElement>(".dg-panel")?.style.setProperty("--panel-band", view.color);
    if (element.nameInput) element.nameInput.value = view.name;
    if (element.colorInput) element.colorInput.value = view.color;
    if (element.visibilitySelect) element.visibilitySelect.value = view.visibility;
    if (element.localToggle) element.localToggle.checked = view.localService;
    if (element.expressToggle) element.expressToggle.checked = view.expressService;
    if (element.pausedToggle) element.pausedToggle.checked = view.paused;
    if (element.fareInput) element.fareInput.value = view.fare;
    if (element.autoFareButton) {
      element.autoFareButton.classList.toggle("active", view.autoFare);
      element.autoFareButton.textContent = view.autoFare ? "자동 요금 적용 중" : "수동 요금";
    }
    if (element.summary) element.summary.textContent = view.summary;
    this.manager.open(this.kind, view.id);
  }

  renderRouteList(items: RouteListItemView[], onSelect: (routeId: string) => void) {
    const html = items.length === 0
      ? `<div class="left-route-empty"><span>등록된 노선이 없습니다</span><small>새 노선을 건설하여 지하철망을 구축해보세요</small></div>`
      : items.map((item) => `
        <div class="left-route-item ${item.selected ? "selected-route-item" : ""}" data-route-id="${item.id}">
          <div class="route-item-left">
            <span class="route-badge-dot" style="background: ${item.color}"></span>
            <div class="route-item-details"><strong class="route-item-name">${item.name}</strong><span class="route-item-meta">${item.meta}</span></div>
          </div>
          <button class="route-item-manage-btn" type="button">${item.selected ? "선택됨" : "선택"}</button>
        </div>`).join("");
    this.manager.render("route-list", null, html);
    const content = this.elements.routeList;
    if (content) {
      this.manager.bind("route-list", "select", content, "click", (event) => {
        const item = (event.target as HTMLElement).closest<HTMLElement>("[data-route-id]");
        if (item?.dataset.routeId) onSelect(item.dataset.routeId);
      });
    }
  }

  close() { this.manager.close(this.kind); }
}
