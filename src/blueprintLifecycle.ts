import {
  atomicRouteOperation,
  splitSegmentAtJunction,
  type BlueprintStatus,
  type ConnectionBlueprint,
  type JunctionBlueprint,
} from "./routeBlueprints";

export const blueprintTransitions: Record<BlueprintStatus, readonly BlueprintStatus[]> = {
  draft: ["approved", "cancelled", "failed"],
  approved: ["scheduled", "cancelled", "failed"],
  scheduled: ["under-construction", "cancelled", "failed"],
  "under-construction": ["completed", "failed"],
  completed: [],
  cancelled: [],
  failed: [],
};

export function transitionBlueprint<T extends { status: BlueprintStatus }>(blueprint: T, status: BlueprintStatus): T {
  if (!blueprintTransitions[blueprint.status].includes(status)) {
    throw new Error(`Invalid blueprint transition: ${blueprint.status} -> ${status}`);
  }
  return { ...blueprint, status };
}

export type CompletedTransfer = {
  id: string;
  stationIds: [string, string];
  walkMin: number;
  resistance: number;
  connectionBlueprintId: string;
};
export type PhysicalConnection = {
  id: string;
  sourceLineId: string;
  targetLineId: string;
  coordinates: Array<{ lat: number; lng: number }>;
  connectionBlueprintId: string;
};
export type DepotAccessConnection = {
  id: string;
  depotId: string;
  lineId: string;
  connectionBlueprintId: string;
};
export type CrossingOnly = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  connectionBlueprintId: string;
};
export type ConnectionRuntime = {
  entityIds: Set<string>;
  routeIds: Set<string>;
  depotIds: Set<string>;
  transfers: CompletedTransfer[];
  physicalConnections: PhysicalConnection[];
  depotAccess: DepotAccessConnection[];
  crossings: CrossingOnly[];
  graphVersion: number;
};

export function completeConnectionBlueprint(
  state: ConnectionRuntime,
  blueprint: ConnectionBlueprint,
  options: { stationIds?: [string, string]; depotId?: string; keepLineId?: string; merge?: () => void } = {},
): ConnectionRuntime {
  if (blueprint.status !== "under-construction") throw new Error("Only a construction-stage connection can complete.");
  if (!state.entityIds.has(blueprint.sourceEntityId) || !state.entityIds.has(blueprint.targetEntityId)) {
    throw new Error("Connection endpoint no longer exists.");
  }
  const next: ConnectionRuntime = structuredClone(state);
  const bumpGraph = () => { next.graphVersion += 1; };
  if (blueprint.connectionType === "transfer") {
    const pair = options.stationIds;
    if (!pair || pair[0] === pair[1] || !state.entityIds.has(pair[0]) || !state.entityIds.has(pair[1])) throw new Error("Transfer stations are invalid.");
    const duplicate = next.transfers.some((transfer) =>
      transfer.stationIds.includes(pair[0]) && transfer.stationIds.includes(pair[1]),
    );
    if (duplicate) throw new Error("Duplicate transfer connection.");
    next.transfers.push({ id: blueprint.id, stationIds: pair, walkMin: 4, resistance: 12, connectionBlueprintId: blueprint.id });
    bumpGraph();
  } else if (blueprint.connectionType === "physical-track") {
    if (!blueprint.sourceLineId || !blueprint.targetLineId || !state.routeIds.has(blueprint.sourceLineId) || !state.routeIds.has(blueprint.targetLineId)) throw new Error("Physical connection routes are invalid.");
    if (next.physicalConnections.some((item) => item.connectionBlueprintId === blueprint.id)) throw new Error("Duplicate physical connection.");
    next.physicalConnections.push({ id: blueprint.id, sourceLineId: blueprint.sourceLineId, targetLineId: blueprint.targetLineId, coordinates: blueprint.coordinates ?? [], connectionBlueprintId: blueprint.id });
    bumpGraph();
  } else if (blueprint.connectionType === "depot-access") {
    const depotId = options.depotId ?? (state.depotIds.has(blueprint.sourceEntityId) ? blueprint.sourceEntityId : blueprint.targetEntityId);
    const lineId = blueprint.sourceLineId ?? blueprint.targetLineId;
    if (!lineId || !state.depotIds.has(depotId) || !state.routeIds.has(lineId)) throw new Error("Depot access target is invalid.");
    if (next.depotAccess.some((item) => item.depotId === depotId && item.lineId === lineId)) throw new Error("Duplicate depot access connection.");
    next.depotAccess.push({ id: blueprint.id, depotId, lineId, connectionBlueprintId: blueprint.id });
  } else if (blueprint.connectionType === "crossing-only") {
    next.crossings.push({ id: blueprint.id, sourceEntityId: blueprint.sourceEntityId, targetEntityId: blueprint.targetEntityId, connectionBlueprintId: blueprint.id });
  } else {
    if (!options.merge || !options.keepLineId) throw new Error("Line merge requires an atomic merge operation.");
    options.merge();
    bumpGraph();
  }
  return next;
}

export type JunctionRuntimeSegment = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  coordinates: Array<[number, number]>;
  lengthKm: number;
};
export type JunctionRuntime = {
  lineId: string;
  segments: JunctionRuntimeSegment[];
  nodes: Array<{ id: string; position: [number, number]; kind: "junction" | "endpoint" | "control" }>;
  branches: Array<{ id: string; junctionNodeId: string }>;
};

export function completeJunctionBlueprint(
  state: JunctionRuntime,
  blueprint: JunctionBlueprint,
  input: { junctionNodeId: string; branchId: string },
): JunctionRuntime {
  if (blueprint.status !== "under-construction") throw new Error("Only a construction-stage junction can complete.");
  if (state.lineId !== blueprint.targetLineId) throw new Error("Junction line does not match.");
  if (state.branches.some((branch) => branch.id === input.branchId)) throw new Error("Duplicate branch id.");
  const source = state.segments.find((segment) => segment.id === blueprint.sourceSegmentId);
  if (!source) throw new Error("Junction source segment is missing.");
  const [left, right] = splitSegmentAtJunction(source, blueprint, input.junctionNodeId);
  return {
    ...structuredClone(state),
    nodes: [...state.nodes, { id: input.junctionNodeId, position: [blueprint.position.lat, blueprint.position.lng], kind: "junction" }],
    segments: state.segments.flatMap((segment) => segment.id === source.id ? [left, right] : [segment]),
    branches: [...state.branches, { id: input.branchId, junctionNodeId: input.junctionNodeId }],
  };
}

export function assertExtensionDependency<T extends { id: string; parentBlueprintId?: string; status: BlueprintStatus }>(blueprint: T, all: T[]) {
  if (!blueprint.parentBlueprintId) return;
  const parent = all.find((candidate) => candidate.id === blueprint.parentBlueprintId);
  if (!parent) throw new Error(`Missing parent extension '${blueprint.parentBlueprintId}'.`);
  if (parent.status !== "completed") throw new Error(`Parent extension '${parent.id}' must be completed first.`);
}

export async function completeAtomically<T>(snapshot: () => T, restore: (state: T) => void, apply: () => void | Promise<void>) {
  return atomicRouteOperation(snapshot, restore, apply);
}
