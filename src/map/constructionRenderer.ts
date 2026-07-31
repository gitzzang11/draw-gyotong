import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";

export interface ConstructionRenderEntity {
  id: string;
  points: Array<[number, number]>;
  progress: number;
  ready: boolean;
  affected: boolean;
}

export interface ConstructionDraftRenderEntity {
  id: string;
  polygon?: Array<[number, number]>;
  lines: Array<{
    points: Array<[number, number]>;
    color: string;
    weight: number;
    opacity: number;
    dashArray?: string;
  }>;
  markers: Array<{ position: [number, number]; color: string }>;
  valid: boolean;
}

type RenderedConstruction = {
  track: L.Polyline;
  completed: L.Polyline;
  marker: L.Marker;
};

export class ConstructionRenderer {
  private readonly projects: EntityRenderer<ConstructionRenderEntity, RenderedConstruction>;
  private readonly drafts: EntityRenderer<ConstructionDraftRenderEntity, L.LayerGroup>;

  constructor(
    private readonly map: L.Map,
    private readonly projectLayer: L.LayerGroup,
    private readonly draftLayer: L.LayerGroup,
  ) {
    this.projects = new EntityRenderer({
      create: (entity) => {
        const track = L.polyline(entity.points, this.trackStyle()).addTo(this.projectLayer);
        const completed = L.polyline([], this.completedStyle(entity)).addTo(this.projectLayer);
        const marker = L.marker(entity.points[0] ?? [0, 0], {
          icon: this.progressIcon(entity.progress),
          interactive: false,
          keyboard: false,
        }).addTo(this.projectLayer);
        const rendered = { track, completed, marker };
        this.updateProject(rendered, entity);
        return rendered;
      },
      update: (rendered, entity) => this.updateProject(rendered, entity),
      remove: (rendered) => {
        this.projectLayer.removeLayer(rendered.track);
        this.projectLayer.removeLayer(rendered.completed);
        this.projectLayer.removeLayer(rendered.marker);
      },
    });
    this.drafts = new EntityRenderer({
      create: (entity) => this.createDraft(entity),
      update: (group, entity) => {
        group.clearLayers();
        this.populateDraft(group, entity);
      },
      remove: (group) => {
        group.clearLayers();
        this.draftLayer.removeLayer(group);
      },
    });
  }

  reconcileEntities(projects: readonly ConstructionRenderEntity[]) {
    this.projects.reconcileEntities(projects);
  }

  reconcileDrafts(drafts: readonly ConstructionDraftRenderEntity[]) {
    this.drafts.reconcileEntities(drafts);
  }

  clear() {
    this.projects.clear();
    this.drafts.clear();
  }

  get renderedIds() {
    return this.projects.renderedIds;
  }

  private updateProject(rendered: RenderedConstruction, entity: ConstructionRenderEntity) {
    const progress = Math.max(0, Math.min(1, entity.progress));
    const completed = sliceByProgress(this.map, entity.points, progress);
    rendered.track.setLatLngs(entity.points).setStyle(this.trackStyle());
    rendered.completed.setLatLngs(completed).setStyle(this.completedStyle(entity));
    rendered.marker
      .setLatLng(completed.at(-1) ?? entity.points[0] ?? [0, 0])
      .setIcon(this.progressIcon(progress));
  }

  private createDraft(entity: ConstructionDraftRenderEntity) {
    const group = L.layerGroup().addTo(this.draftLayer);
    this.populateDraft(group, entity);
    return group;
  }

  private populateDraft(group: L.LayerGroup, entity: ConstructionDraftRenderEntity) {
    if (entity.polygon) {
      L.polygon(entity.polygon, {
        color: entity.valid ? "#f3ca52" : "#ff5d5d",
        fillColor: "#f3ca52",
        fillOpacity: 0.2,
        weight: 3,
        dashArray: "10 7",
        interactive: false,
      }).addTo(group);
    }
    for (const line of entity.lines) {
      L.polyline(line.points, { ...line, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(group);
    }
    for (const marker of entity.markers) {
      L.circleMarker(marker.position, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: marker.color,
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    }
  }

  private trackStyle(): L.PolylineOptions {
    return {
      color: "#dbe5e8",
      weight: 9,
      opacity: 0.5,
      dashArray: "3 12",
      lineCap: "round",
      interactive: false,
    };
  }

  private completedStyle(entity: ConstructionRenderEntity): L.PolylineOptions {
    return {
      color: entity.ready ? "#f3ca52" : entity.affected ? "#ff5d5d" : "#ff9f43",
      weight: 6,
      opacity: 0.95,
      dashArray: entity.ready ? "8 7" : undefined,
      lineCap: "round",
      interactive: false,
    };
  }

  private progressIcon(progress: number) {
    return L.divIcon({
      className: "construction-progress-marker",
      html: `<span>${Math.round(progress * 100)}%</span>`,
      iconSize: [44, 24],
      iconAnchor: [22, 12],
    });
  }
}

function sliceByProgress(map: L.Map, coordinates: Array<[number, number]>, progress: number): L.LatLng[] {
  const points = coordinates.map(([lat, lng]) => L.latLng(lat, lng));
  if (points.length < 2 || progress <= 0) return points.slice(0, 1);
  if (progress >= 1) return points;
  const lengths = points.slice(1).map((point, index) => map.distance(points[index], point));
  const target = lengths.reduce((sum, length) => sum + length, 0) * progress;
  const result = [points[0]];
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (traversed + lengths[index] <= target) {
      result.push(points[index + 1]);
      traversed += lengths[index];
      continue;
    }
    const ratio = (target - traversed) / Math.max(1, lengths[index]);
    result.push(L.latLng(
      points[index].lat + (points[index + 1].lat - points[index].lat) * ratio,
      points[index].lng + (points[index + 1].lng - points[index].lng) * ratio,
    ));
    break;
  }
  return result;
}
