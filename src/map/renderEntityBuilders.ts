import type { ConstructionRenderEntity } from "./constructionRenderer.ts";
import type { DepotRenderEntity } from "./depotRenderer.ts";

type DepotSource = {
  id: string;
  polygon: Array<[number, number]>;
  connectedRouteIds: string[];
};

type ConstructionProjectSource = {
  id: string;
  status: string;
  coordinates: Array<[number, number]>;
  elapsedDays: number;
  durationDays: number;
  delayDays: number;
  kind: string;
};

export function buildDepotRenderEntities(
  depots: readonly DepotSource[],
  options: {
    selectedId?: string;
    selectedDepotId?: string | null;
    isOperational(id: string): boolean;
  },
): DepotRenderEntity[] {
  return depots.map((depot) => ({
    id: depot.id,
    polygon: depot.polygon,
    selected: depot.id === options.selectedId || depot.id === options.selectedDepotId,
    operational: options.isOperational(depot.id),
    connected: depot.connectedRouteIds.length > 0,
  }));
}

export function buildConstructionRenderEntities(
  projects: readonly ConstructionProjectSource[],
): ConstructionRenderEntity[] {
  return projects
    .filter((project) => project.status !== "operating" && project.coordinates.length >= 2)
    .map((project) => ({
      id: project.id,
      points: project.coordinates,
      progress: project.status === "opening-ready"
        ? 1
        : clamp(project.elapsedDays / Math.max(1, project.durationDays + project.delayDays), 0, 1),
      ready: project.status === "opening-ready",
      affected: project.kind === "repair" || project.kind === "edit",
    }));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
