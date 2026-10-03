import { PanelManager } from "./panelManager";
import { escapeHtml } from "./inspectorMarkup";

export interface TrainPanelFleet {
  id: string;
  label: string;
  cars: number;
  capacity: number;
  speedKmh: number;
  sets: number;
  addCost: string;
}

export interface TrainPanelView {
  entityId: string;
  serviceName: string;
  color: string;
  selectedTrain?: string;
  operating: boolean;
  totalSets: number;
  headway: string;
  hourlyCapacity: number;
  stopCount: number;
  depotCapacity: number;
  forecastHtml: string;
  fleets: TrainPanelFleet[];
  addCost: string;
  /** 노선 차종 (노선을 만들 때 정해져 바꿀 수 없다) */
  trainTypeLabel: string;
  trainTypeSummary: string;
  carOptions: number[];
  defaultCars: number;
}

export class TrainPanel {
  readonly kind = "train";
  constructor(private readonly manager: PanelManager, private readonly content: HTMLElement) {}

  render(entityId: string, html: string, onClick: (event: Event) => void, onChange: (event: Event) => void) {
    this.manager.render(this.kind, entityId, html);
    this.manager.bind(this.kind, "actions", this.content, "click", onClick);
    this.manager.bind(this.kind, "fields", this.content, "change", onChange);
  }

  renderView(view: TrainPanelView, onClick: (event: Event) => void, onChange: (event: Event) => void) {
    const full = view.totalSets >= view.depotCapacity;
    const fleets = view.fleets.length === 0
      ? `<p class="game-inspector__note">배치된 열차가 없습니다. 아래에서 새 편성을 들이세요.</p>`
      : view.fleets.map((fleet) => `
        <div class="game-fleet-row">
          <span class="game-route-item__text"><strong>${escapeHtml(fleet.label)} · ${fleet.cars}량</strong><small>편성당 ${fleet.capacity.toLocaleString("ko-KR")}명 · 최고 ${fleet.speedKmh}km/h</small></span>
          <span class="dg-seg game-fleet-row__stepper" role="group" aria-label="${escapeHtml(fleet.label)} 편성 수">
            <button class="dg-seg__item" type="button" data-fleet-id="${escapeHtml(fleet.id)}" data-fleet-step="-1" aria-label="1편성 줄이기">−</button>
            <span class="game-fleet-row__count">${fleet.sets}편성</span>
            <button class="dg-seg__item" type="button" data-fleet-id="${escapeHtml(fleet.id)}" data-fleet-step="1" aria-label="1편성 추가, ${escapeHtml(fleet.addCost)}" ${full ? "disabled" : ""}>＋</button>
          </span>
          <small class="game-fleet-row__cost">추가 1편성 ${escapeHtml(fleet.addCost)}</small>
        </div>`).join("");
    this.render(view.entityId, `
      <div class="dg-panel__body">
        <section class="dg-panel__section">
          <div class="game-inspector__route"><span class="game-color-swatch" style="--selected-route-color:${escapeHtml(view.color)}" aria-hidden="true"></span><strong class="dg-text-sign">${escapeHtml(view.serviceName)}</strong></div>
          ${view.selectedTrain ? `<p class="game-inspector__note">선택한 열차 · ${escapeHtml(view.selectedTrain)}</p>` : ""}
          <div class="dg-row"><span class="dg-row__label">운행</span><span class="dg-row__value${view.operating ? " dg-row__value--ok" : ""}">${view.operating ? "● 운행 중" : "열차 미배정"}</span></div>
          <div class="dg-row"><span class="dg-row__label">배치 · 배차</span><span class="dg-row__value">${view.totalSets}편성 · ${escapeHtml(view.headway)}</span></div>
          <div class="dg-row"><span class="dg-row__label">시간당 수송</span><span class="dg-row__value">${view.hourlyCapacity.toLocaleString("ko-KR")}명 · ${view.stopCount}개 정차</span></div>
          <div class="dg-row"><span class="dg-row__label">기지 수용</span><span class="dg-row__value${full ? " dg-row__value--caution" : ""}">${full ? "△ " : ""}${view.totalSets} / ${view.depotCapacity}편성</span></div>
        </section>
        ${view.forecastHtml}
        <section class="dg-panel__section">
          <h3 class="dg-panel__section-label">배치된 편성</h3>
          ${fleets}
        </section>
        <section class="dg-panel__section game-save-editor__pair">
          <div class="dg-field"><span class="dg-field__label">노선 차종</span><span class="dg-input game-train__type"><strong>${escapeHtml(view.trainTypeLabel)}</strong><small>${escapeHtml(view.trainTypeSummary)}</small></span></div>
          <label class="dg-field"><span class="dg-field__label">편성당 차량 수</span><select id="modalCarCountSelect" class="dg-input">
            ${view.carOptions.map((cars) => `<option value="${cars}" ${cars === view.defaultCars ? "selected" : ""}>${cars}량</option>`).join("")}
          </select></label>
        </section>
        ${full ? `<p class="game-inspector__note game-train__full">△ 차량기지 수용량이 가득 찼습니다. 기지를 확장하거나 연결을 확인하세요.</p>` : ""}
      </div>
      <div class="dg-panel__actions">
        <button id="modalAddFleetButton" class="dg-btn dg-btn--primary dg-panel__actions-push" data-train-action="add" type="button" ${full ? "disabled" : ""}>새 편성 구입·배치<span class="dg-btn__cost" data-add-cost>${escapeHtml(view.addCost)}</span></button>
      </div>`, onClick, onChange);
  }

  close() { this.manager.close(this.kind); }
}
