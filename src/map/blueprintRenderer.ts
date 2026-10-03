import L from "leaflet";
import { EntityRenderer } from "./entityRenderer";
import { escapeTooltipText } from "./tooltipText";
import { mapPalette } from "./mapPalette";

export type BlueprintKind = "route" | "transfer" | "station" | "depot";

export interface BlueprintRenderEntity {
  id: string;
  kind: BlueprintKind;
  points: Array<[number, number]>;
  color: string;
  selected: boolean;
  canDelete: boolean;
  valid: boolean;
  name?: string;
}

type BlueprintLayer = L.Polyline<any> | L.CircleMarker | L.Polygon;

export class BlueprintRenderer {
  private readonly blueprints: EntityRenderer<BlueprintRenderEntity, BlueprintLayer>;

  constructor(private readonly layer: L.LayerGroup) {
    this.blueprints = new EntityRenderer({
      create: (entity) => {
        const rendered = this.createLayer(entity).addTo(this.layer);
        this.updateLayer(rendered, entity);
        return rendered;
      },
      update: (rendered, entity) => this.updateLayer(rendered, entity),
      remove: (rendered) => {
        rendered.unbindTooltip();
        this.layer.removeLayer(rendered);
      },
    });
  }

  reconcileEntities(entities: readonly BlueprintRenderEntity[]) {
    this.blueprints.reconcileEntities(entities);
  }

  clear() {
    this.blueprints.clear();
  }

  get renderedIds() {
    return this.blueprints.renderedIds;
  }

  get size() {
    return this.blueprints.size;
  }

  private createLayer(entity: BlueprintRenderEntity): BlueprintLayer {
    if (entity.kind === "station") return L.circleMarker(entity.points[0] ?? [0, 0], { interactive: false });
    if (entity.kind === "depot") return L.polygon(entity.points, { interactive: false });
    return L.polyline(entity.points, { interactive: false });
  }

  private updateLayer(layer: BlueprintLayer, entity: BlueprintRenderEntity) {
    if (layer instanceof L.CircleMarker) {
      layer.setLatLng(entity.points[0] ?? [0, 0]);
      // 기획안 (DESIGN_SYSTEM §10): 정보색 점선 + 속이 빈 역 기호. 삭제 대상·불가 위치는 위험색.
      const palette = mapPalette();
      layer.setStyle({
        radius: entity.canDelete ? 12 : entity.selected ? 8 : 6,
        color: entity.canDelete || !entity.valid ? palette.danger : palette.info,
        weight: entity.canDelete ? 3 : 2.5,
        fillColor: entity.canDelete || !entity.valid ? palette.danger : palette.surface,
        fillOpacity: entity.canDelete ? 0.82 : 1,
        dashArray: "3 2",
      });
    } else if (layer instanceof L.Polygon) {
      layer.setLatLngs(entity.points);
      const palette = mapPalette();
      layer.setStyle({
        color: entity.canDelete || !entity.valid ? palette.danger : palette.info,
        fillColor: entity.canDelete || !entity.valid ? palette.danger : palette.info,
        fillOpacity: entity.canDelete ? 0.22 : 0.12,
        weight: entity.canDelete ? 3 : 2,
        opacity: entity.canDelete ? 0.92 : 0.7,
        dashArray: "7 7",
      });
    } else {
      layer.setLatLngs(entity.points);
      layer.setStyle({
        color: entity.kind === "transfer" ? mapPalette().inkFaint : entity.valid ? entity.color : mapPalette().danger,
        weight: entity.kind === "transfer" ? 2 : entity.selected ? 6 : 5,
        opacity: entity.kind === "transfer" ? 0.5 : entity.selected ? 0.8 : 0.56,
        dashArray: entity.kind === "transfer" ? "2 6" : entity.selected ? "15 9" : "12 10",
        lineCap: "round",
        lineJoin: "round",
      });
    }
    if (entity.canDelete && entity.name) {
      layer.bindTooltip(escapeTooltipText(`${entity.name} · 계획에서 삭제`), { direction: "top", interactive: false });
    } else {
      layer.unbindTooltip();
    }
  }
}
