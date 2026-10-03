import { PanelManager } from "./panelManager";

export interface DepotPanelView {
  entityId: string;
  title: string;
  operational: boolean;
  level: number;
  area: string;
  capacity: number;
  assignedSets: number;
  availableSets: number;
  maintenance: string;
  routeCount: number;
  routesHtml: string;
  maxLevel: number;
  expansionCost: string;
  expansionDisabled: boolean;
  expansionDescription: string;
}

export class DepotPanel {
  readonly kind = "depot";
  constructor(
    private readonly manager: PanelManager,
    private readonly title: HTMLElement | null,
    private readonly content: HTMLElement,
  ) {}

  render(entityId: string, title: string, html: string, onAction: (event: Event) => void) {
    if (this.title) this.title.textContent = title;
    this.manager.render(this.kind, entityId, html);
    this.manager.bind(this.kind, "actions", this.content, "click", onAction);
  }

  renderView(view: DepotPanelView, onAction: (event: Event) => void) {
    this.render(view.entityId, view.title, `
      <section class="depot-manager-hero">
        <span class="depot-manager-symbol" aria-hidden="true">▥</span>
        <div><span>차량기지 상태</span><strong>${view.operational ? "운영 중" : "공사·설치 중"}</strong><em>레벨 ${view.level} · 확장 상한 ${view.maxLevel} · ${view.area}ha</em></div>
      </section>
      <section class="depot-manager-metrics" aria-label="차량기지 운영 정보">
        <div><span>수용 편성</span><strong>${view.capacity}편성</strong></div>
        <div><span>연결 노선 열차</span><strong>${view.assignedSets}편성</strong></div>
        <div><span>추가 수용 가능</span><strong>${view.availableSets}편성</strong></div>
        <div><span>월 유지비</span><strong>${view.maintenance}</strong></div>
      </section>
      <section class="depot-manager-section">
        <div class="depot-manager-section-heading"><span>연결 노선</span><strong>${view.routeCount}개</strong></div>
        <div class="connected-route-chips">${view.routesHtml}</div>
      </section>
      <div class="depot-manager-actions">
        <button class="depot-manager-expand" type="button" data-depot-manager-action="expand" aria-describedby="depotExpansionStatus" ${view.expansionDisabled ? "disabled" : ""}>확장 검토 · ${view.expansionCost}</button>
        <button class="manager-delete-button" type="button" data-depot-manager-action="delete">차량기지 철거</button>
      </div>
      <p id="depotExpansionStatus" role="status">${view.expansionDescription}</p>`, onAction);
  }

  close() { this.manager.close(this.kind); }
}
