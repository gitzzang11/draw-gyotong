import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";

export type LineLod = "overview" | "district" | "build";

export interface LineRenderEntity {
  id: string;
  paths: Array<Array<[number, number]>>;
  color: string;
  selected: boolean;
  underConstruction: boolean;
  planning: boolean;
  paused: boolean;
  lod: LineLod;
}

type RenderedPath = {
  halo?: L.Polyline;
  emphasis?: L.Polyline;
  outline: L.Polyline;
  line: L.Polyline;
};

type RenderedLine = { paths: RenderedPath[] };

export class LineRenderer {
  private readonly entities: EntityRenderer<LineRenderEntity, RenderedLine>;

  constructor(
    private readonly layer: L.LayerGroup,
    private readonly selectionLayer: L.LayerGroup = layer,
    private readonly selectionPane?: string,
  ) {
    this.entities = new EntityRenderer<LineRenderEntity, RenderedLine>({
      create: (entity) => {
        const rendered: RenderedLine = { paths: [] };
        this.updateRendered(rendered, entity);
        return rendered;
      },
      update: (rendered, entity) => this.updateRendered(rendered, entity),
      remove: (rendered) => {
        for (const path of rendered.paths) this.removePath(path);
      },
    });
  }

  reconcileEntities(entities: readonly LineRenderEntity[]) {
    this.entities.reconcileEntities(entities);
  }

  updateStyle(id: string) {
    this.entities.updateStyle(id);
  }

  updateSelection(id: string, selected: boolean) {
    this.entities.updateSelection(id, selected);
  }

  removeEntity(id: string) {
    return this.entities.removeEntity(id);
  }

  clear() {
    this.entities.clear();
  }

  get renderedIds() {
    return this.entities.renderedIds;
  }

  get size() {
    return this.entities.size;
  }

  private updateRendered(rendered: RenderedLine, entity: LineRenderEntity) {
    while (rendered.paths.length > entity.paths.length) {
      const removed = rendered.paths.pop();
      if (removed) this.removePath(removed);
    }
    entity.paths.forEach((coordinates, index) => {
      const latLngs = coordinates.map(([lat, lng]) => L.latLng(lat, lng));
      let path = rendered.paths[index];
      if (!path) {
        path = {
          outline: L.polyline(latLngs, { interactive: false }).addTo(this.layer),
          line: L.polyline(latLngs, { interactive: false }).addTo(this.layer),
        };
        rendered.paths.push(path);
      }
      path.outline.setLatLngs(latLngs);
      path.line.setLatLngs(latLngs);
      if (entity.selected && !path.halo) {
        path.halo = L.polyline(latLngs, {
          interactive: false,
          pane: this.selectionPane,
        }).addTo(this.selectionLayer);
        path.emphasis = L.polyline(latLngs, {
          interactive: false,
          pane: this.selectionPane,
        }).addTo(this.selectionLayer);
      } else if (!entity.selected && path.halo) {
        this.selectionLayer.removeLayer(path.halo);
        path.halo = undefined;
        if (path.emphasis) {
          this.selectionLayer.removeLayer(path.emphasis);
          path.emphasis = undefined;
        }
      }
      path.halo?.setLatLngs(latLngs);
      path.emphasis?.setLatLngs(latLngs);
      this.applyStyle(path, entity);
    });
  }

  private applyStyle(path: RenderedPath, entity: LineRenderEntity) {
    const low = entity.lod === "overview";
    const middle = entity.lod === "district";
    const outlineWeight = low ? 6 : middle ? 9 : 13;
    const routeWeight = low ? 4 : middle ? 5 : 6;
    const emphasisWeight = routeWeight + 3;
    const haloWeight = emphasisWeight + 6;
    path.halo?.setStyle({
      color: "rgba(255, 255, 255, 0.6)",
      weight: haloWeight,
      opacity: 0.6,
      lineCap: "round",
      lineJoin: "round",
    });
    path.emphasis?.setStyle({
      color: entity.color,
      weight: emphasisWeight,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    });
    path.outline.setStyle({ color: "rgba(4, 10, 14, 0.9)", weight: outlineWeight, opacity: 0.95 });
    path.line.setStyle({
      color: entity.color,
      weight: routeWeight,
      opacity: entity.underConstruction ? 0.42 : entity.planning ? 0.54 : entity.paused ? 0.62 : 0.72,
      dashArray: entity.underConstruction ? "5 10" : entity.planning ? "10 8" : undefined,
      lineCap: "round",
      lineJoin: "round",
    });
  }

  private removePath(path: RenderedPath) {
    if (path.halo) this.selectionLayer.removeLayer(path.halo);
    if (path.emphasis) this.selectionLayer.removeLayer(path.emphasis);
    this.layer.removeLayer(path.outline);
    this.layer.removeLayer(path.line);
  }
}
