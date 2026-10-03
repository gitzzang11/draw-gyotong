import type { ConstructionPlan } from "./constructionTypes.ts";
import type { SnapTarget } from "../routePlanning.ts";

export function copyConstructionPlan(
  source: ConstructionPlan,
  options: { createId(prefix: string): string; name: string; cityId: ConstructionPlan["cityId"]; now: number },
): ConstructionPlan {
  const copy = structuredClone(source);
  const ids = new Map<string, string>();
  const allocate = (id: string, prefix: string) => {
    if (!ids.has(id)) ids.set(id, options.createId(prefix));
    return ids.get(id)!;
  };
  allocate(source.id, "plan");
  for (const route of source.routes) {
    allocate(route.id, "planned-route");
    for (const segment of route.segments) {
      allocate(segment.id, "plan-segment");
      allocate(segment.fromNodeId, "node");
      allocate(segment.toNodeId, "node");
      for (const crossing of segment.riverCrossings ?? []) allocate(crossing.id, "river-crossing");
    }
    for (const branch of route.branches ?? []) allocate(branch.branchId, "branch");
  }
  for (const station of source.stations) allocate(station.id, "planned-station");
  for (const depot of source.depots) allocate(depot.id, "planned-depot");
  for (const transfer of source.transfers) allocate(transfer.id, "planned-transfer");
  for (const connection of source.connections ?? []) allocate(connection.id, "connection-blueprint");
  for (const junction of source.junctions ?? []) allocate(junction.id, "junction-blueprint");
  for (const draft of source.routePlanningDrafts ?? []) {
    allocate(draft.id, "route-planning");
    for (const target of [draft.snappedSource, draft.snappedTarget]) if (target) allocate(target.id, "snap-target");
  }
  // A completed design may refer to its own built results. A copy starts as a blueprint.
  const ownRoutes = new Map<string, string>();
  for (const route of source.routes) {
    if (route.actualRouteId && (!ownRoutes.has(route.actualRouteId) || (!route.parentBlueprintId && !route.actualExtension))) {
      ownRoutes.set(route.actualRouteId, ids.get(route.id)!);
    }
  }
  const ownStations = new Map(source.stations.filter((station) => station.actualStationId).map((station) => [station.actualStationId!, ids.get(station.id)!]));
  const ownDepots = new Map(source.depots.filter((depot) => depot.actualDepotId).map((depot) => [depot.actualDepotId!, ids.get(depot.id)!]));
  const remap = (id: string) => ids.get(id) ?? ownRoutes.get(id) ?? ownStations.get(id) ?? ownDepots.get(id) ?? id;
  const optional = (id: string | undefined) => id === undefined ? undefined : remap(id);
  const snap = (target: SnapTarget | undefined): SnapTarget | undefined => {
    if (!target) return undefined;
    const entityId = remap(target.entityId);
    const lineId = optional(target.lineId);
    return {
      ...target, entityId, lineId, branchId: optional(target.branchId),
      id: remap(target.id),
      kind: ownRoutes.has(target.entityId) && target.kind === "line-endpoint" ? "planned-endpoint"
        : ownStations.has(target.entityId) && target.kind === "station" ? "planned-station" : target.kind,
    };
  };
  copy.id = remap(source.id);
  copy.name = options.name.slice(0, 1000);
  copy.cityId = options.cityId;
  copy.createdAt = options.now;
  copy.status = "draft";
  for (const route of copy.routes) {
    route.id = remap(route.id);
    route.parentBlueprintId = optional(route.parentBlueprintId);
    route.rootLineId = optional(route.rootLineId);
    route.targetLineId = optional(route.targetLineId);
    // References to a built sibling become references to the copied sibling.
    if (route.actualExtension && ownRoutes.has(route.actualExtension.routeId)) {
      route.parentBlueprintId = remap(route.actualExtension.routeId);
      route.extensionAtStart = route.actualExtension.atStart;
      route.operationKind = "extension";
      delete route.actualExtension;
    } else if (route.actualExtension) {
      route.actualExtension.routeId = remap(route.actualExtension.routeId);
    }
    delete route.actualRouteId;
    route.completedSegmentIds = [];
    for (const segment of route.segments) {
      segment.id = remap(segment.id);
      segment.fromNodeId = remap(segment.fromNodeId);
      segment.toNodeId = remap(segment.toNodeId);
      for (const crossing of segment.riverCrossings ?? []) crossing.id = remap(crossing.id);
    }
    for (const branch of route.branches ?? []) {
      branch.branchId = remap(branch.branchId);
      branch.junctionNodeId = remap(branch.junctionNodeId);
      branch.segmentIds = branch.segmentIds.map(remap);
    }
  }
  for (const station of copy.stations) {
    station.id = remap(station.id);
    station.plannedRouteIds = [...new Set([...station.plannedRouteIds.map(remap), ...station.actualRouteIds.filter((id) => ownRoutes.has(id)).map(remap)])];
    station.actualRouteIds = station.actualRouteIds.filter((id) => !ownRoutes.has(id));
    station.completed = false;
    delete station.actualStationId;
  }
  for (const depot of copy.depots) {
    depot.id = remap(depot.id);
    depot.connectedPlannedRouteIds = [...new Set([...depot.connectedPlannedRouteIds.map(remap), ...depot.connectedActualRouteIds.filter((id) => ownRoutes.has(id)).map(remap)])];
    depot.connectedActualRouteIds = depot.connectedActualRouteIds.filter((id) => !ownRoutes.has(id));
    depot.completed = false;
    delete depot.actualDepotId;
  }
  for (const transfer of copy.transfers) {
    transfer.id = remap(transfer.id);
    transfer.stationIds = [...new Set([...transfer.stationIds.map(remap), ...(transfer.actualStationIds ?? []).filter((id) => ownStations.has(id)).map(remap)])];
    transfer.actualStationIds = transfer.actualStationIds?.filter((id) => !ownStations.has(id));
    transfer.completed = false;
  }
  for (const connection of copy.connections ?? []) {
    connection.id = remap(connection.id);
    for (const side of ["source", "target"] as const) {
      const entityId = connection[`${side}EntityId`];
      if (ownRoutes.has(entityId) && connection[`${side}EntityType`] === "line-endpoint") connection[`${side}EntityType`] = "blueprint-endpoint";
      if (ownStations.has(entityId) && connection[`${side}EntityType`] === "station") connection[`${side}EntityType`] = "blueprint-station";
      connection[`${side}EntityId`] = remap(entityId);
      connection[`${side}LineId`] = optional(connection[`${side}LineId`]);
      connection[`${side}StationId`] = optional(connection[`${side}StationId`]);
    }
    connection.status = "draft";
    connection.createdAt = options.now;
    delete connection.projectId;
    delete connection.appliedAt;
    delete connection.actualEntityIds;
    delete connection.failureReason;
  }
  for (const junction of copy.junctions ?? []) {
    junction.id = remap(junction.id);
    junction.targetLineId = remap(junction.targetLineId);
    junction.sourceSegmentId = remap(junction.sourceSegmentId);
    junction.stationBlueprintId = optional(junction.stationBlueprintId);
    junction.parentBranchBlueprintId = optional(junction.parentBranchBlueprintId);
    junction.status = "draft";
  }
  for (const draft of copy.routePlanningDrafts ?? []) {
    draft.id = remap(draft.id);
    draft.sourceEntityId = optional(draft.sourceEntityId);
    draft.sourceLineId = optional(draft.sourceLineId);
    draft.sourceBlueprintId = optional(draft.sourceBlueprintId);
    draft.targetEntityId = optional(draft.targetEntityId);
    draft.targetLineId = optional(draft.targetLineId);
    draft.snappedSource = snap(draft.snappedSource);
    draft.snappedTarget = snap(draft.snappedTarget);
    if (draft.preview) draft.preview.lineId = optional(draft.preview.lineId);
    if (draft.stage === "committing" || draft.stage === "completed") draft.stage = "reviewing";
  }
  return copy;
}
