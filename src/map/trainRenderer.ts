import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";

export interface TrainRenderEntity {
  id: string;
  position: [number, number];
  color: string;
  label: string;
  title: string;
  state: "running" | "stopped" | "turning";
  serviceKind?: "local" | "express";
}

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
        if (entity.color !== previous.color || entity.label !== previous.label || entity.title !== previous.title || entity.state !== previous.state || entity.serviceKind !== previous.serviceKind) {
          marker.setIcon(this.icon(entity));
          marker.options.alt = entity.label;
          marker.options.title = entity.title;
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
    return L.divIcon({
      className: `train-icon train-state-${entity.state} train-service-${entity.serviceKind ?? "local"}`,
      html: `<span class="train-body" style="--train-color:${escapeAttribute(entity.color)}"><i></i><i></i></span>`,
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
