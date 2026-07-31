import { PanelManager } from "./panelManager";

export interface StationPanelView {
  entityId: string;
  title: string;
  escapedName: string;
  operational: boolean;
  metricsHtml: string;
  reasonsHtml: string;
  routeCount: number;
  routesHtml: string;
  transferKind: string;
  transferHtml: string;
  dangerTitle: string;
  dangerDescription: string;
  dangerAction: string;
}

export class StationPanel {
  readonly kind = "station";
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

  renderView(view: StationPanelView, onAction: (event: Event) => void) {
    this.render(view.entityId, view.title, `
      <section class="station-manager-identity">
        <label><span>역 이름</span><input id="stationManagerName" value="${view.escapedName}" maxlength="32" /></label>
        <button type="button" data-station-manager-action="save-name">이름 저장</button>
        <span class="station-status ${view.operational ? "operational" : "building"}">${view.operational ? "운영 중" : "공사·설치 중"}</span>
      </section>
      <section class="station-manager-metrics" aria-label="승객 통계">${view.metricsHtml}</section>
      <section class="station-manager-section">
        <div class="station-manager-section-heading"><span>수요 변화 주요 원인</span></div>
        <div class="connected-route-chips">${view.reasonsHtml}</div>
      </section>
      <section class="station-manager-section">
        <div class="station-manager-section-heading"><span>연결 노선</span><strong>${view.routeCount}개</strong></div>
        <div class="connected-route-chips">${view.routesHtml}</div>
      </section>
      <section class="station-manager-section station-manager-transfer">
        <div class="station-manager-section-heading"><span>환승 정보</span><strong>${view.transferKind}</strong></div>
        ${view.transferHtml}
      </section>
      <section class="manager-danger-zone">
        <div><strong>${view.dangerTitle}</strong><span>${view.dangerDescription}</span></div>
        <button type="button" data-station-manager-action="delete">${view.dangerAction}</button>
      </section>`, onAction);
  }

  close() { this.manager.close(this.kind); }
}
