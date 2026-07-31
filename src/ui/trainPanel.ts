import { PanelManager } from "./panelManager";

export interface TrainPanelView {
  entityId: string;
  selectedSummary: string;
  color: string;
  escapedRouteName: string;
  totalSets: number;
  headway: string;
  depotCapacity: number;
  forecastHtml: string;
  fleetsHtml: string;
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
    this.render(view.entityId, `
      ${view.selectedSummary}
      <div class="train-modal-header-chip" style="border-left: 4px solid ${view.color}">
        <div><strong style="color: ${view.color}">${view.escapedRouteName}</strong><span class="train-sub-info">배치 중: ${view.totalSets}편성 · 배차 간격: ${view.headway}분</span></div>
        <div class="depot-capacity-chip">기지 수용력: ${view.totalSets} / ${view.depotCapacity}</div>
      </div>
      ${view.forecastHtml}
      <div class="train-fleet-list">${view.fleetsHtml}</div>
      <div class="train-add-section">
        <h3>신규 열차 편성 추가</h3>
        <div class="train-add-grid">
          <label class="manager-field"><span>차량 종류</span><select id="modalTrainTypeSelect">
            <option value="metro">도시철도 (160명/량 · 34km/h)</option>
            <option value="commuter">광역전철 (190명/량 · 42km/h)</option>
            <option value="express">급행형 (150명/량 · 54km/h)</option>
          </select></label>
          <label class="manager-field"><span>편성당 차량 수</span><select id="modalCarCountSelect">
            <option value="4">4량 편성</option><option value="6" selected>6량 편성</option>
            <option value="8">8량 편성</option><option value="10">10량 편성</option>
          </select></label>
        </div>
        <button id="modalAddFleetButton" data-train-action="add" type="button" class="modal-add-fleet-btn">➕ 신규 편성 구입 및 배치 (+80억)</button>
      </div>`, onClick, onChange);
  }

  close() { this.manager.close(this.kind); }
}
