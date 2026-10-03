import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";
import { prefersDarkText } from "../ui/inspectorMarkup";

export interface TrainRenderEntity {
  id: string;
  position: [number, number];
  color: string;
  label: string;
  title: string;
  state: "running" | "stopped" | "turning";
  serviceKind?: "local" | "express";
  /** 지도 위 열차 모양 (설정): 캡슐 · 편성 · 노선 배지. 시안 docs/design/prototype/trains.html */
  style?: TrainSymbolStyle;
  /** 화면 기준 진행 방향(도, 0 = 오른쪽, 시계 방향) */
  headingDeg?: number;
  cars?: number;
  crowded?: boolean;
  /** 노선 배지에 쓰는 짧은 노선 표기 */
  lineLabel?: string;
}

export const TRAIN_SYMBOL_STYLES = ["capsule", "consist", "badge"] as const;
export type TrainSymbolStyle = (typeof TRAIN_SYMBOL_STYLES)[number];
export const TRAIN_SYMBOL_LABELS: Record<TrainSymbolStyle, string> = { capsule: "캡슐", consist: "편성", badge: "노선 배지" };

export class TrainRenderer {
  private readonly trains: EntityRenderer<TrainRenderEntity, L.Marker>;

  constructor(private readonly layer: L.LayerGroup, private readonly pane = "trainInteractionPane") {
    this.trains = new EntityRenderer({
      create: (entity) => {
        const marker = L.marker(entity.position, this.options(entity)).addTo(this.layer);
        const element = marker.getElement();
        if (element) element.style.pointerEvents = "none";
        return marker;
      },
      update: (marker, entity, previous) => {
        if (entity.position[0] !== previous.position[0] || entity.position[1] !== previous.position[1]) marker.setLatLng(entity.position);
        marker.setZIndexOffset(1200);
        if (
          entity.color !== previous.color || entity.label !== previous.label || entity.title !== previous.title || entity.state !== previous.state ||
          entity.serviceKind !== previous.serviceKind || entity.style !== previous.style || entity.cars !== previous.cars ||
          entity.crowded !== previous.crowded || entity.lineLabel !== previous.lineLabel
        ) {
          marker.setIcon(this.icon(entity));
          marker.options.alt = entity.label;
          marker.options.title = entity.title;
        } else if (entity.headingDeg !== previous.headingDeg) {
          // 방향만 바뀌면 아이콘을 다시 만들지 않고 회전값만 바꾼다.
          marker.getElement()?.querySelector<HTMLElement>(".train-symbol")?.style.setProperty("--heading", `${Math.round(entity.headingDeg ?? 0)}deg`);
        }
      },
      remove: (marker) => this.layer.removeLayer(marker),
    });
  }

  reconcileEntities(entities: readonly TrainRenderEntity[]) {
    this.trains.reconcileEntities(entities);
  }

  clear() {
    this.trains.clear();
  }

  get renderedIds() {
    return this.trains.renderedIds;
  }

  get size() {
    return this.trains.size;
  }

  private options(entity: TrainRenderEntity): L.MarkerOptions {
    return {
      icon: this.icon(entity),
      interactive: false,
      bubblingMouseEvents: false,
      keyboard: false,
      alt: entity.label,
      title: entity.title,
      pane: this.pane,
      zIndexOffset: 1200,
    };
  }

  private icon(entity: TrainRenderEntity) {
    const style = entity.style ?? "capsule";
    const express = entity.serviceKind === "express";
    const color = escapeAttribute(entity.color);
    const crowd = entity.crowded ? `<span class="train-crowd" aria-hidden="true">!</span>` : "";
    let body = "";
    if (style === "badge") {
      // 회전하지 않는 노선 배지 + 진행 방향 화살표
      body = `<span class="train-badge${prefersDarkText(entity.color) ? " train-badge--dark-text" : ""}"><b>${escapeAttribute(express ? "급" : entity.lineLabel ?? "")}</b></span><span class="train-badge__dir" aria-hidden="true"></span>`;
    } else if (style === "consist") {
      // 객차 칸 수는 편성 2량당 1칸 (최대 5칸)
      const segments = Math.min(5, Math.max(1, Math.ceil((entity.cars ?? 2) / 2)));
      body = `<span class="train-consist">${"<i></i>".repeat(segments)}</span>`;
    } else {
      body = `<span class="train-capsule"><i></i></span>`;
    }
    return L.divIcon({
      className: `train-icon train-style-${style} train-state-${entity.state} train-service-${entity.serviceKind ?? "local"}${entity.crowded ? " train-crowded" : ""}`,
      html: `<span class="train-symbol" style="--train-color:${color};--heading:${Math.round(entity.headingDeg ?? 0)}deg">${body}</span>${crowd}`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
