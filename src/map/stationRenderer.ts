import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";

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
}

export interface TransferConnectionEntity {
  id: string;
  positions: Array<[number, number]>;
}

export class StationRenderer {
  private readonly stations: EntityRenderer<StationRenderEntity, L.CircleMarker>;
  private readonly transfers: EntityRenderer<TransferConnectionEntity, L.Polyline>;

  constructor(private readonly layer: L.LayerGroup, private readonly pane = "stationInteractionPane") {
    this.stations = new EntityRenderer({
      create: (entity) => {
        const marker = L.circleMarker(entity.position, { interactive: false, pane: this.pane }).addTo(this.layer);
        this.updateStation(marker, entity);
        return marker;
      },
      update: (marker, entity, previous) => {
        if (entity.position[0] !== previous.position[0] || entity.position[1] !== previous.position[1]) marker.setLatLng(entity.position);
        this.updateStation(marker, entity);
      },
      remove: (marker) => {
        marker.unbindTooltip();
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
    marker.setStyle({
      radius: entity.express || entity.selected ? 8 : 6,
      color: "#111111",
      weight: entity.selected ? 3.5 : 2.5,
      fillColor: entity.transfer ? "#ffffff" : entity.express ? "#ff5d5d" : entity.color,
      fillOpacity: entity.operational ? 1 : 0.25,
      dashArray: entity.operational ? undefined : "3 4",
      className: "station-map-marker",
    });
    if (entity.showLabel) {
      marker.bindTooltip(entity.name, {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "station-map-label",
        interactive: false,
      }).openTooltip();
    } else {
      marker.unbindTooltip();
    }
  }

  private transferStyle(): L.PolylineOptions {
    return {
      color: "#ffffff",
      weight: 2,
      opacity: 0.7,
      dashArray: "3 6",
      interactive: false,
      pane: this.pane,
    };
  }
}
