import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";
import { escapeTooltipText } from "./tooltipText";
import { mapPalette } from "./mapPalette";

export interface StationRenderEntity {
  id: string;
  name: string;
  position: [number, number];
  color: string;
  selected: boolean;
  express: boolean;
  transfer: boolean;
  operational: boolean;
  showLabel: boolean;
  /** 지정하면 기본 크기 대신 이 반지름(떨어진 환승역을 하나로 합친 기호) */
  radius?: number;
}

export interface TransferConnectionEntity {
  id: string;
  positions: Array<[number, number]>;
}

export class StationRenderer {
  private readonly stations: EntityRenderer<StationRenderEntity, L.CircleMarker>;
  private readonly transfers: EntityRenderer<TransferConnectionEntity, L.Polyline>;
  private readonly rings = new Map<L.CircleMarker, L.CircleMarker>();

  constructor(private readonly layer: L.LayerGroup, private readonly pane = "stationInteractionPane") {
    this.stations = new EntityRenderer({
      create: (entity) => {
        const marker = L.circleMarker(entity.position, { interactive: false, pane: this.pane }).addTo(this.layer);
        this.updateStation(marker, entity);
        this.updateRing(marker, entity);
        return marker;
      },
      update: (marker, entity, previous) => {
        if (entity.position[0] !== previous.position[0] || entity.position[1] !== previous.position[1]) marker.setLatLng(entity.position);
        this.updateStation(marker, entity);
        this.updateRing(marker, entity);
      },
      remove: (marker) => {
        marker.unbindTooltip();
        const ring = this.rings.get(marker);
        if (ring) this.layer.removeLayer(ring);
        this.rings.delete(marker);
        this.layer.removeLayer(marker);
      },
    });
    this.transfers = new EntityRenderer({
      create: (entity) => L.polyline(entity.positions, this.transferStyle()).addTo(this.layer),
      update: (line, entity) => line.setLatLngs(entity.positions).setStyle(this.transferStyle()),
      remove: (line) => this.layer.removeLayer(line),
    });
  }

  reconcileEntities(stations: readonly StationRenderEntity[], transfers: readonly TransferConnectionEntity[]) {
    this.transfers.reconcileEntities(transfers);
    this.stations.reconcileEntities(stations);
  }

  clear() {
    this.stations.clear();
    this.transfers.clear();
  }

  get renderedIds() {
    return this.stations.renderedIds;
  }

  get size() {
    return this.stations.size;
  }

  private updateStation(marker: L.CircleMarker, entity: StationRenderEntity) {
    // 역 기호 (DESIGN_SYSTEM §11): 일반역은 바탕색 원 + 노선 색 테두리, 환승역은 더 큰 원 + 먹 테두리,
    // 급행 정차역은 노선 색 테두리 안에 먹 점, 공사 중은 점선 테두리.
    const palette = mapPalette();
    marker.setStyle({
      radius: entity.radius ?? (entity.transfer ? 8 : entity.express ? 7 : 6),
      color: entity.transfer ? palette.ink : entity.color,
      weight: entity.express && !entity.transfer ? 3 : 2.5,
      fillColor: entity.express && !entity.transfer ? palette.ink : palette.surface,
      fillOpacity: 1,
      dashArray: entity.operational ? undefined : "3 4",
      className: "station-map-marker",
    });
    if (entity.showLabel) {
      marker.bindTooltip(escapeTooltipText(entity.name), {
        permanent: true,
        direction: "top",
        offset: [0, -(entity.radius ?? 8)],
        className: "station-map-label",
        interactive: false,
      }).openTooltip();
    } else {
      marker.unbindTooltip();
    }
  }

  private updateRing(marker: L.CircleMarker, entity: StationRenderEntity) {
    const baseRadius = entity.radius ?? (entity.express ? 8 : 6);
    const existing = this.rings.get(marker);
    if (!entity.selected) {
      if (existing) {
        this.layer.removeLayer(existing);
        this.rings.delete(marker);
      }
      return;
    }
    if (!existing) {
      const ring = L.circleMarker(entity.position, {
        interactive: false,
        pane: this.pane,
        className: "station-selection-ring",
      }).addTo(this.layer);
      this.rings.set(marker, ring);
    }
    const ring = this.rings.get(marker)!;
    ring.setLatLng(entity.position);
    ring.setRadius(baseRadius + 5);
    ring.setStyle({
      color: mapPalette().ink,
      weight: 2,
      opacity: 0.95,
      fillColor: "transparent",
      fillOpacity: 0,
    });
  }

  private transferStyle(): L.PolylineOptions {
    return {
      color: mapPalette().ink,
      weight: 2.5,
      opacity: 0.85,
      dashArray: "3 6",
      interactive: false,
      pane: this.pane,
    };
  }
}
