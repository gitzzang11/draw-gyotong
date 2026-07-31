import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";

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
    polygon.setStyle({
      color: entity.selected ? "#ffffff" : entity.connected ? "#f3ca52" : "#ff8b8b",
      fillColor: entity.connected ? "#f3ca52" : "#ff5d5d",
      fillOpacity: entity.operational ? 0.18 : 0.07,
      weight: entity.selected ? 3 : 2,
      dashArray: entity.operational ? undefined : "6 7",
      className: "depot-map-shape",
    });
  }
}
