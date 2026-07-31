import type { PlanningCoordinate, PlanningValidationError, RoutePlanningTool } from "./routePlanning";

export type BlueprintStatus = "draft" | "approved" | "scheduled" | "under-construction" | "completed" | "cancelled" | "failed";
export type LineExtensionBlueprint = {
  id: string;
  rootLineId: string;
  targetLineId: string;
  parentBlueprintId?: string;
  attachEndpoint: "start" | "end";
  coordinates: PlanningCoordinate[];
  segmentIds: string[];
  stationBlueprintIds: string[];
  status: BlueprintStatus;
};
export type ConnectionType = "transfer" | "physical-track" | "line-merge" | "depot-access" | "crossing-only";
export type ConnectionEntityType = "station" | "line-endpoint" | "blueprint-station" | "blueprint-endpoint" | "line" | "depot-access";
export type ConnectionBlueprint = {
  id: string;
  operationType: "connection";
  sourceEntityId: string;
  sourceEntityType: ConnectionEntityType;
  targetEntityId: string;
  targetEntityType: ConnectionEntityType;
  connectionType: ConnectionType;
  sourceLineId?: string;
  targetLineId?: string;
  coordinates?: PlanningCoordinate[];
  status: BlueprintStatus;
  estimatedCost: number;
  estimatedDuration: number;
  createdAt: number;
  projectId?: string;
  appliedAt?: number;
  actualEntityIds?: string[];
  sourceStationId?: string;
  targetStationId?: string;
  failureReason?: string;
};
export type ConnectionTarget = {
  id: string;
  type: ConnectionEntityType;
  lineId?: string;
  endpoint?: "start" | "end";
  deleted?: boolean;
  closed?: boolean;
};
export type ExistingConnection = Pick<ConnectionBlueprint, "sourceEntityId" | "targetEntityId" | "connectionType">;
export type JunctionBlueprint = {
  id: string;
  targetLineId: string;
  sourceSegmentId: string;
  position: PlanningCoordinate;
  splitRatio: number;
  createsStation: boolean;
  stationBlueprintId?: string;
  status: BlueprintStatus;
  parentBranchBlueprintId?: string;
};
export type LineBranchBlueprint = {
  id: string;
  rootLineId: string;
  targetLineId: string;
  branchId: string;
  junctionNodeId: string;
  coordinates: PlanningCoordinate[];
  segmentIds: string[];
  stationBlueprintIds: string[];
  status: BlueprintStatus;
};

export function createExtensionBlueprint(input: {
  id: string;
  sourceLineId?: string;
  sourceBlueprint?: LineExtensionBlueprint;
  attachEndpoint: "start" | "end";
  coordinates: PlanningCoordinate[];
}): LineExtensionBlueprint {
  const rootLineId = input.sourceBlueprint?.rootLineId ?? input.sourceLineId;
  if (!rootLineId) throw new Error("Extension requires an original line.");
  return {
    id: input.id,
    rootLineId,
    targetLineId: rootLineId,
    parentBlueprintId: input.sourceBlueprint?.id,
    attachEndpoint: input.attachEndpoint,
    coordinates: input.coordinates,
    segmentIds: [],
    stationBlueprintIds: [],
    status: "draft",
  };
}

export function createBranchBlueprint(input: {
  id: string;
  branchId: string;
  lineId: string;
  junctionNodeId: string;
  coordinates: PlanningCoordinate[];
}): LineBranchBlueprint {
  return {
    id: input.id,
    rootLineId: input.lineId,
    targetLineId: input.lineId,
    branchId: input.branchId,
    junctionNodeId: input.junctionNodeId,
    coordinates: input.coordinates,
    segmentIds: [],
    stationBlueprintIds: [],
    status: "draft",
  };
}

export function getAvailableConnectionTypes(
  source: ConnectionTarget,
  target: ConnectionTarget,
  existing: ExistingConnection[] = [],
): ConnectionType[] {
  if (source.id === target.id || source.deleted || target.deleted || source.closed || target.closed) return [];
  const duplicate = (type: ConnectionType) => existing.some((item) =>
    item.connectionType === type &&
    ((item.sourceEntityId === source.id && item.targetEntityId === target.id) ||
      (item.sourceEntityId === target.id && item.targetEntityId === source.id)),
  );
  let candidates: ConnectionType[];
  const depotPair = source.type === "depot-access" || target.type === "depot-access";
  const stationPair = isStation(source.type) && isStation(target.type);
  const endpointPair = isEndpoint(source.type) && isEndpoint(target.type);
  if (depotPair) {
    candidates = source.type === "depot-access" && (target.type === "line" || isEndpoint(target.type)) ||
      target.type === "depot-access" && (source.type === "line" || isEndpoint(source.type))
      ? ["depot-access"]
      : [];
  } else if (stationPair) {
    candidates = source.lineId !== target.lineId ? ["transfer", "crossing-only"] : ["crossing-only"];
  } else if (endpointPair) {
    if (source.lineId === target.lineId) candidates = ["physical-track", "crossing-only"];
    else candidates = ["physical-track", "line-merge", "crossing-only"];
  } else {
    candidates = ["crossing-only"];
  }
  return candidates.filter((type) => !duplicate(type));
}

export function createConnectionBlueprint(input: {
  id: string;
  source: ConnectionTarget;
  target: ConnectionTarget;
  connectionType: ConnectionType;
  coordinates?: PlanningCoordinate[];
  estimatedCost?: number;
  estimatedDuration?: number;
  createdAt?: number;
  existing?: ExistingConnection[];
}): ConnectionBlueprint {
  const available = getAvailableConnectionTypes(input.source, input.target, input.existing);
  if (!available.includes(input.connectionType)) throw new Error("Selected connection type is not available for these targets.");
  return {
    id: input.id,
    operationType: "connection",
    sourceEntityId: input.source.id,
    sourceEntityType: input.source.type,
    targetEntityId: input.target.id,
    targetEntityType: input.target.type,
    connectionType: input.connectionType,
    sourceLineId: input.source.lineId,
    targetLineId: input.target.lineId,
    coordinates: input.coordinates,
    estimatedCost: input.estimatedCost ?? 0,
    estimatedDuration: input.estimatedDuration ?? 0,
    status: "draft",
    createdAt: input.createdAt ?? Date.now(),
  };
}

export function createJunctionBlueprint(input: Omit<JunctionBlueprint, "splitRatio" | "status"> & { splitRatio: number; status?: BlueprintStatus }): JunctionBlueprint {
  if (!(input.splitRatio > 0 && input.splitRatio < 1)) throw new Error("Junction split ratio must be between 0 and 1.");
  return { ...input, status: input.status ?? "draft" };
}

export function splitSegmentAtJunction<T extends {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  coordinates: Array<[number, number]>;
  lengthKm: number;
}>(segment: T, junction: JunctionBlueprint, junctionNodeId: string): [T, T] {
  if (junction.sourceSegmentId !== segment.id) throw new Error("Junction does not reference the selected segment.");
  if (segment.coordinates.length < 2) throw new Error("Segment geometry is invalid.");
  const result = splitRouteSegment({
    segment,
    junctionPosition: [junction.position.lat, junction.position.lng],
    splitRatio: junction.splitRatio,
    junctionNodeId,
    beforeId: `${segment.id}:a:${junction.id}`,
    afterId: `${segment.id}:b:${junction.id}`,
  });
  return [result.beforeSegment, result.afterSegment];
}

export function validateRouteBlueprint(input: {
  tool: RoutePlanningTool;
  blueprint: LineExtensionBlueprint | ConnectionBlueprint | LineBranchBlueprint;
  lineIds: Iterable<string>;
  entityIds?: Iterable<string>;
  junctionsByLine?: ReadonlyMap<string, ReadonlySet<string>>;
  extensionBlueprints?: LineExtensionBlueprint[];
  branchIds?: Iterable<string>;
}): PlanningValidationError[] {
  const errors: PlanningValidationError[] = [];
  const lines = new Set(input.lineIds);
  const entities = new Set(input.entityIds ?? []);
  if (input.tool === "extend") {
    const item = input.blueprint as LineExtensionBlueprint;
    if (!lines.has(item.rootLineId)) errors.push(error("missing-root-line", "원본 노선이 존재하지 않습니다."));
    if (!lines.has(item.targetLineId)) errors.push(error("missing-target-line", "대상 노선이 존재하지 않습니다."));
    if (item.rootLineId !== item.targetLineId) errors.push(error("extension-line-identity", "연장은 원본 노선 ID를 유지해야 합니다."));
    const parent = item.parentBlueprintId
      ? input.extensionBlueprints?.find((candidate) => candidate.id === item.parentBlueprintId)
      : undefined;
    if (item.parentBlueprintId && !parent) errors.push(error("missing-parent-blueprint", "이전 연장 설계가 존재하지 않습니다."));
    if (parent && parent.rootLineId !== item.rootLineId) errors.push(error("parent-root-mismatch", "연속 연장의 원본 노선이 일치하지 않습니다."));
  } else if (input.tool === "connect") {
    const item = input.blueprint as ConnectionBlueprint;
    if (item.operationType !== "connection") errors.push(error("invalid-operation-type", "연결 설계 유형이 올바르지 않습니다."));
    if (item.sourceEntityId === item.targetEntityId) errors.push(error("self-connection", "같은 대상을 다시 선택할 수 없습니다."));
    if (entities.size && !entities.has(item.sourceEntityId)) errors.push(error("missing-source", "연결 시작 대상이 존재하지 않습니다."));
    if (entities.size && !entities.has(item.targetEntityId)) errors.push(error("missing-target", "연결 대상이 존재하지 않습니다."));
  } else {
    const item = input.blueprint as LineBranchBlueprint;
    if (!lines.has(item.targetLineId)) errors.push(error("missing-target-line", "대상 노선이 존재하지 않습니다."));
    if (item.rootLineId !== item.targetLineId) errors.push(error("branch-line-identity", "지선은 원래 노선 ID를 유지해야 합니다."));
    if (!input.junctionsByLine?.get(item.targetLineId)?.has(item.junctionNodeId)) errors.push(error("invalid-junction", "분기점이 대상 노선에 속하지 않습니다."));
    if (new Set(input.branchIds ?? []).has(item.branchId)) errors.push(error("duplicate-branch-id", "이미 사용 중인 지선 ID입니다."));
  }
  return errors;
}

function isStation(type: ConnectionEntityType) {
  return type === "station" || type === "blueprint-station";
}

function isEndpoint(type: ConnectionEntityType) {
  return type === "line-endpoint" || type === "blueprint-endpoint";
}

export async function atomicRouteOperation<T>(snapshot: () => T, restore: (state: T) => void, operation: () => void | Promise<void>) {
  const before = snapshot();
  try {
    await operation();
  } catch (cause) {
    restore(before);
    throw cause;
  }
}

function error(code: string, message: string): PlanningValidationError {
  return { code, message, severity: "error" };
}
import { splitRouteSegment } from "./geometry/constructionGeometry.ts";
