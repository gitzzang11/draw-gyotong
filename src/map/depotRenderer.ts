import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";
import { mapPalette } from "./mapPalette";

export interface DepotRenderEntity {
  id: string;
  polygon: Array<[number, number]>;
  selected: boolean;
  operational: boolean;
  connected: boolean;
}

export class DepotRenderer {
  private readonly depots: EntityRenderer<DepotRenderEntity, L.Polygon>;

  constructor(private readonly layer: L.LayerGroup, private readonly pane = "facilityInteractionPane") {
    this.depots = new EntityRenderer({
      create: (entity) => {
        const polygon = L.polygon(entity.polygon, { interactive: false, pane: this.pane }).addTo(this.layer);
        this.updateDepot(polygon, entity);
        return polygon;
      },
      update: (polygon, entity, previous) => {
        if (JSON.stringify(entity.polygon) !== JSON.stringify(previous.polygon)) polygon.setLatLngs(entity.polygon);
        this.updateDepot(polygon, entity);
      },
      remove: (polygon) => this.layer.removeLayer(polygon),
    });
  }

  reconcileEntities(entities: readonly DepotRenderEntity[]) {
    this.depots.reconcileEntities(entities);
  }

  clear() {
    this.depots.clear();
  }

  get renderedIds() {
    return this.depots.renderedIds;
  }

  get size() {
    return this.depots.size;
  }

  private updateDepot(polygon: L.Polygon, entity: DepotRenderEntity) {
    // 차량기지 기호: 바탕색 면 + 먹 테두리. 노선과 연결되지 않은 기지는 흐린 테두리, 선택은 굵은 테두리.
    const palette = mapPalette();
    polygon.setStyle({
      color: entity.selected || entity.connected ? palette.ink : palette.inkFaint,
      fillColor: palette.surface,
      fillOpacity: entity.operational ? 0.55 : 0.3,
      weight: entity.selected ? 3.5 : 2,
      dashArray: entity.operational ? undefined : "6 7",
      className: "depot-map-shape",
    });
  }
}
