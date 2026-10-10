import { PanelManager } from "./panelManager";
import {
  escapeHtml,
  lineMarkHtml,
  metricRowsHtml,
  routeRowsHtml,
  sectionHtml,
  statusTagHtml,
  type InspectorMetric,
  type InspectorRoute,
  type InspectorStatus,
} from "./inspectorMarkup";

export interface StationPanelTransfer {
  metrics: InspectorMetric[];
  notes: string[];
  pairs: string[];
  warning?: string;
}

/** 자동 이름 기준에 맞는 주변 이름 후보(누르면 그 이름으로 바꾼다) */
export interface StationNameCandidatesView {
  state: "idle" | "loading" | "error" | "ready";
  items: Array<{ name: string; detail: string }>;
}

export interface StationPanelView {
  entityId: string;
  title: string;
  name: string;
  editableName?: boolean;
  nameCandidates?: StationNameCandidatesView;
  status: InspectorStatus;
  statusLabel: string;
  metrics: InspectorMetric[];
  reasons: Array<{ text: string; positive: boolean }>;
  reasonsNote?: string;
  routes: InspectorRoute[];
  transferKind: string;
  transfer?: StationPanelTransfer;
  transferNote?: string;
  dangerTitle: string;
  dangerDescription: string;
  dangerAction: string;
  dangerActionId?: "delete" | "delete-planned";
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
    const editableName = view.editableName !== false;
    const reasons = view.reasons.length > 0
      ? `<ul class="game-inspector__list">${view.reasons.map((reason) => `<li><span class="${reason.positive ? "game-inspector__plus" : "game-inspector__minus"}" aria-hidden="true">${reason.positive ? "＋" : "－"}</span><span class="dg-sr-only">${reason.positive ? "증가 요인" : "감소 요인"}</span>${escapeHtml(reason.text)}</li>`).join("")}</ul>`
      : "";
    const transfer = view.transfer
      ? `${metricRowsHtml(view.transfer.metrics)}
        ${view.transfer.notes.map((note) => `<p class="game-inspector__note">${escapeHtml(note)}</p>`).join("")}
        ${view.transfer.pairs.length > 0 ? `<ul class="game-inspector__list">${view.transfer.pairs.map((pair) => `<li>${escapeHtml(pair)}</li>`).join("")}</ul>` : ""}
        ${view.transfer.warning ? `<div class="dg-notice"><span class="dg-notice__lead">△</span><span>${escapeHtml(view.transfer.warning)}</span></div>` : ""}`
      : `<p class="game-inspector__note">${escapeHtml(view.transferNote ?? "")}</p>`;
    this.render(view.entityId, view.title, `
      <div class="dg-panel__body">
        <section class="dg-panel__section game-inspector__identity">
          <div class="game-inspector__tags">${statusTagHtml(view.status, view.statusLabel)}${view.routes.map((route) => lineMarkHtml(route)).join("")}</div>
          <label class="dg-field">
            <span class="dg-field__label">역 이름</span>
            <span class="game-inspector__inline">
              <input id="stationManagerName" class="dg-input" value="${escapeHtml(view.name)}" maxlength="32" ${editableName ? "" : "readonly aria-readonly=\"true\""} />
              ${editableName ? `<button class="dg-btn dg-btn--secondary dg-btn--compact" type="button" data-station-manager-action="save-name">저장</button>` : ""}
            </span>
          </label>
          ${editableName && view.nameCandidates ? nameCandidatesHtml(view.nameCandidates, view.name) : ""}
        </section>
        ${sectionHtml("승객", metricRowsHtml(view.metrics))}
        ${sectionHtml("수요 변화 원인", reasons || `<p class="game-inspector__note">${escapeHtml(view.reasonsNote ?? "")}</p>`)}
        ${sectionHtml("연결 노선", routeRowsHtml(view.routes, "연결된 노선이 없습니다."), `${view.routes.length}개`)}
        ${sectionHtml("환승", transfer, view.transferKind)}
        ${sectionHtml(view.dangerTitle, `
          <p class="game-inspector__note">${escapeHtml(view.dangerDescription)}</p>
          <div class="game-inspector__danger-action"><button class="dg-btn dg-btn--danger-quiet dg-btn--compact" type="button" data-station-manager-action="${view.dangerActionId ?? "delete"}">${escapeHtml(view.dangerAction)}…</button></div>`)}
      </div>`, onAction);
  }

  close() { this.manager.close(this.kind); }
}

function nameCandidatesHtml(candidates: StationNameCandidatesView, currentName: string) {
  if (candidates.state === "idle") {
    return `<div class="game-inspector__name-candidates"><button class="dg-btn dg-btn--secondary dg-btn--compact" type="button" data-station-manager-action="load-name-candidates">주변 이름 후보 보기</button></div>`;
  }
  if (candidates.state === "loading") return `<p class="game-inspector__note" role="status">주변 이름을 찾는 중…</p>`;
  if (candidates.state === "error") {
    return `<div class="game-inspector__name-candidates"><p class="game-inspector__note">주변 이름을 불러오지 못했습니다.</p><button class="dg-btn dg-btn--secondary dg-btn--compact" type="button" data-station-manager-action="load-name-candidates">다시 시도</button></div>`;
  }
  if (candidates.items.length === 0) return `<p class="game-inspector__note">기준 반경 안에 쓸 수 있는 이름이 없습니다.</p>`;
  return `<div class="game-inspector__name-candidates" role="group" aria-label="이름 후보">
    <span class="dg-field__label">이름 후보 · 누르면 바로 바뀜</span>
    ${candidates.items.map((item) => `<button class="game-route-item" type="button" data-station-manager-action="pick-name" data-name="${escapeHtml(item.name)}" aria-pressed="${item.name === currentName}"><span class="game-route-item__text"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail)}</small></span></button>`).join("")}
  </div>`;
}
