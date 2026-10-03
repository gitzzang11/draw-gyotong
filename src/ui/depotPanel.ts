import { PanelManager } from "./panelManager";
import {
  escapeHtml,
  metricRowsHtml,
  routeRowsHtml,
  sectionHtml,
  statusTagHtml,
  type InspectorRoute,
} from "./inspectorMarkup";

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
  routes: InspectorRoute[];
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
      <div class="dg-panel__body">
        <section class="dg-panel__section game-inspector__identity">
          <div class="game-inspector__tags">${view.operational ? statusTagHtml("operational", "운영 중") : statusTagHtml("building", "공사·설치 중")}<span class="game-inspector__muted">레벨 ${view.level} / ${view.maxLevel} · ${escapeHtml(view.area)}ha</span></div>
        </section>
        ${sectionHtml("운영", metricRowsHtml([
          { label: "수용 편성", value: `${view.capacity}편성` },
          { label: "연결 노선 열차", value: `${view.assignedSets}편성` },
          { label: "추가 수용 가능", value: `${view.availableSets}편성`, tone: view.availableSets === 0 ? "caution" : undefined },
          { label: "월 유지비", value: view.maintenance },
        ]))}
        ${sectionHtml("연결 노선", routeRowsHtml(view.routes, "연결된 노선이 없습니다."), `${view.routes.length}개`)}
        ${sectionHtml("확장", `<p id="depotExpansionStatus" class="game-inspector__note" role="status">${escapeHtml(view.expansionDescription)}</p>`)}
      </div>
      <div class="dg-panel__actions">
        <button class="dg-btn dg-btn--danger-quiet dg-btn--compact" type="button" data-depot-manager-action="delete">철거…</button>
        <button class="dg-btn dg-btn--primary dg-panel__actions-push" type="button" data-depot-manager-action="expand" aria-describedby="depotExpansionStatus" ${view.expansionDisabled ? "disabled" : ""}>확장 검토<span class="dg-btn__cost">${escapeHtml(view.expansionCost)}</span></button>
      </div>`, onAction);
  }

  close() { this.manager.close(this.kind); }
}
