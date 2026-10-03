import type { ConnectionBlueprint } from "../routeBlueprints.ts";
import type { PlannedRoute } from "./constructionTypes.ts";
import { coordinatesEqual, distanceMeters, type GeoCoordinate } from "../geometry/constructionGeometry.ts";

export function filterValidPlanConnections(
  routes: readonly PlannedRoute[],
  connections: readonly ConnectionBlueprint[],
): ConnectionBlueprint[] {
  const byId = new Map(routes.map((route) => [route.id, route]));
  return connections.filter((connection) => {
    if (connection.status !== "draft" && connection.status !== "approved") return true;
    return (["source", "target"] as const).every((side) => {
      const entityType = side === "source" ? connection.sourceEntityType : connection.targetEntityType;
      if (entityType !== "blueprint-endpoint") return true;
      const entityId = side === "source" ? connection.sourceEntityId : connection.targetEntityId;
      const route = byId.get(entityId);
      if (!route) return false;
      const endpoint = side === "source" ? connection.sourceEndpoint : connection.targetEndpoint;
      const coordinate = endpoint === "start" ? route.coordinates[0] : endpoint === "end" ? route.coordinates.at(-1) : undefined;
      if (!coordinate || !coordinate.every(Number.isFinite)) return false;
      const hint = side === "source" ? connection.coordinates?.[0] : connection.coordinates?.at(-1);
      if (!hint) return true;
      const position: GeoCoordinate = [hint.lat, hint.lng];
      return position.every(Number.isFinite) && distanceMeters(coordinate, position) <= 70;
    });
  });
}

export function resolvePlanConnectionRouteId(
  routes: readonly PlannedRoute[],
  connection: ConnectionBlueprint,
  side: "source" | "target",
  actualRouteIds: readonly string[],
): string | undefined {
  const entityId = side === "source" ? connection.sourceEntityId : connection.targetEntityId;
  const declaredId = side === "source" ? connection.sourceLineId : connection.targetLineId;
  const plannedRoute = routes.find((route) => route.id === entityId);
  const candidates = [plannedRoute?.actualRouteId, declaredId, plannedRoute?.actualExtension?.routeId];
  const actualIds = new Set(actualRouteIds);
  const direct = candidates.find((id): id is string => Boolean(id && actualIds.has(id)));
  if (direct) return direct;

  // Saved connections can retain a removed endpoint blueprint while their
  // declared line still identifies the surviving root of an extension chain.
  const visited = new Set<string>();
  const pending = [declaredId, entityId];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    if (!id || visited.has(id)) continue;
    visited.add(id);
    if (actualIds.has(id)) return id;
    const route = routes.find((item) => item.id === id);
    if (!route) continue;
    const mapped = [route.actualRouteId, route.actualExtension?.routeId]
      .find((candidate): candidate is string => Boolean(candidate && actualIds.has(candidate)));
    if (mapped) return mapped;
    if (route.operationKind === "extension" || route.parentBlueprintId) {
      pending.push(route.rootLineId, route.targetLineId, route.parentBlueprintId);
    }
  }
  return undefined;
}

export function resolvePlanConnectionEndpoint(
  routes: readonly PlannedRoute[],
  connection: ConnectionBlueprint,
  side: "source" | "target",
  actualCoordinates: readonly GeoCoordinate[],
): GeoCoordinate | undefined {
  const entityType = side === "source" ? connection.sourceEntityType : connection.targetEntityType;
  if (entityType !== "blueprint-endpoint") return undefined;
  const entityId = side === "source" ? connection.sourceEntityId : connection.targetEntityId;
  const endpoint = side === "source" ? connection.sourceEndpoint : connection.targetEndpoint;
  const blueprint = routes.find((route) => route.id === entityId);
  if (blueprint) {
    const coordinate = endpoint === "start" ? blueprint.coordinates[0] : endpoint === "end" ? blueprint.coordinates.at(-1) : undefined;
    return coordinate ? actualCoordinates.find((point) => coordinatesEqual(point, coordinate)) : undefined;
  }

  return undefined;
}
