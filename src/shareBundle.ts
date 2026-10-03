import type { ConstructionPlan } from "./domain/constructionTypes.ts";

type CityId = ConstructionPlan["cityId"];
export type DiagramShareStation = { id: string; name: string; routeIds: string[]; position: { x: number; y: number }; transfer: boolean; express: boolean };
export type DiagramShareRoute = { id: string; name: string; color: string; stationIds: string[] };
type ShareMetadata = { shareId: string; gameVersion: string; cityDataVersion: string; requiredExtensions: string[] };
export type MetroDiagramShareData = ShareMetadata & {
  kind: "metro-diagram"; cityId: CityId; generatedAt: number;
  network: { title: string; cityName: string; generatedAt: number; routeCount: number; stationCount: number };
  routes: DiagramShareRoute[]; stations: DiagramShareStation[];
};
export type RouteDesignShareData = ShareMetadata & { kind: "route-design"; cityId: CityId; generatedAt: number; plans: ConstructionPlan[] };
export type GameShareBundle = ShareMetadata & { kind: "draw-gyotong-share"; diagram: MetroDiagramShareData; routeDesign: RouteDesignShareData };
export const maxShareFileBytes = 20 * 1024 * 1024;

type Check = (value: unknown, path: string) => void;
const invalid = (path: string): never => { throw new Error(`공유 데이터가 올바르지 않습니다: ${path}`); };
const text = (max = 1000): Check => (value, path) => { if (typeof value !== "string" || value.length > max) invalid(path); };
const id: Check = (value, path) => { if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(value) || ["__proto__", "prototype", "constructor"].includes(value)) invalid(path); };
const number = (min = 0, max = 1e15): Check => (value, path) => { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) invalid(path); };
const boolean: Check = (value, path) => { if (typeof value !== "boolean") invalid(path); };
const choice = (...values: string[]): Check => (value, path) => { if (typeof value !== "string" || !values.includes(value)) invalid(path); };
const optional = (check: Check): Check => (value, path) => { if (value !== undefined) check(value, path); };
const array = (check: Check, max = 20000, min = 0): Check => (value, path) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) return invalid(path);
  value.forEach((item, index) => check(item, `${path}[${index}]`));
};
const object = (fields: Record<string, Check>): Check => (value, path) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!Object.hasOwn(fields, key)) invalid(`${path}.${key}`);
  for (const [key, check] of Object.entries(fields)) check(record[key], `${path}.${key}`);
};
const coordinate: Check = (value, path) => {
  if (!Array.isArray(value) || value.length !== 2) return invalid(path);
  number(-90, 90)(value[0], `${path}.lat`);
  number(-180, 180)(value[1], `${path}.lng`);
};
const geoPoint = object({ lat: number(-90, 90), lng: number(-180, 180) });
const screenPoint = object({ x: number(-1e6, 1e6), y: number(-1e6, 1e6) });
const color: Check = (value, path) => { if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) invalid(path); };
const ids: Check = (value, path) => {
  array(id)(value, path);
  if (new Set(value as string[]).size !== (value as string[]).length) invalid(`${path} (중복 참조)`);
};
const mode = choice("bridge", "tunnel");
const status = choice("draft", "approved", "scheduled", "under-construction", "completed", "cancelled", "failed");
const endpoint = optional(choice("start", "end"));
const tool = choice("extend", "connect", "branch");
const segment = object({
  id, fromNodeId: id, toNodeId: id, coordinates: array(coordinate, 100000, 2), lengthKm: number(),
  terrainImpact: object({ riverCrossings: number(), mountainSegments: number() }),
  constructionMode: mode, constructionCost: number(), enabled: boolean,
  riverCrossings: optional(array(object({ id, position: coordinate, mode, cost: number() }))),
  mountainLengthKm: optional(number()), constructionDays: optional(number()),
});
const route = object({
  id, name: text(), color, coordinates: array(coordinate, 100000, 2), segments: array(segment), completedSegmentIds: ids,
  expectedCost: number(), constructionDays: number(), expectedDemand: number(), expectedRevenue: number(), transferEffect: number(),
  actualExtension: optional(object({ routeId: id, atStart: boolean })), actualRouteId: optional(id),
  operationKind: optional(choice("new-line", "extension")), rootLineId: optional(id), targetLineId: optional(id),
  parentBlueprintId: optional(id), extensionAtStart: optional(boolean),
  branches: optional(array(object({ branchId: id, junctionNodeId: id, segmentIds: ids }))),
});
const entityType = choice("station", "line-endpoint", "blueprint-station", "blueprint-endpoint", "line", "depot-access");
const connection = object({
  id, operationType: choice("connection"), sourceEntityId: id, sourceEntityType: entityType,
  targetEntityId: id, targetEntityType: entityType,
  connectionType: choice("transfer", "physical-track", "line-merge", "depot-access", "crossing-only"),
  sourceLineId: optional(id), targetLineId: optional(id), sourceEndpoint: endpoint, targetEndpoint: endpoint,
  coordinates: optional(array(geoPoint, 100000)), status, estimatedCost: number(), estimatedDuration: number(), createdAt: number(),
  projectId: optional(id), appliedAt: optional(number()), actualEntityIds: optional(ids),
  sourceStationId: optional(id), targetStationId: optional(id), failureReason: optional(text()),
});
const snap = object({
  id, entityId: id, kind: choice("line-endpoint", "planned-endpoint", "station", "planned-station", "junction", "depot-connector", "line-segment", "empty-map"),
  lineId: optional(id), branchId: optional(id), endpoint, screenPoint, coordinate: geoPoint, label: text(),
});
const plan = object({
  id, name: text(), cityId: choice("seoul", "busan", "daejeon", "gwangju"), routes: array(route),
  stations: array(object({ id, name: text(), position: coordinate, plannedRouteIds: ids, actualRouteIds: ids, expectedDemand: number(), completed: boolean, actualStationId: optional(id) })),
  depots: array(object({ id, name: text(), polygon: array(coordinate, 100000, 3), connectedPlannedRouteIds: ids, connectedActualRouteIds: ids, expectedCost: number(), constructionDays: number(), capacity: number(), completed: boolean, actualDepotId: optional(id) })),
  transfers: array(object({ id, stationIds: ids, actualStationIds: optional(ids), expectedEffect: number(), completed: boolean })),
  connections: optional(array(connection)),
  junctions: optional(array(object({ id, targetLineId: id, sourceSegmentId: id, position: geoPoint, splitRatio: number(0, 1), createsStation: boolean, stationBlueprintId: optional(id), status, parentBranchBlueprintId: optional(id) }))),
  routePlanningDrafts: optional(array(object({
    id, tool, stage: choice("idle", "selecting-source", "drawing", "selecting-target", "reviewing", "committing", "completed", "cancelled"),
    sourceEntityId: optional(id), sourceLineId: optional(id), sourceBlueprintId: optional(id), targetEntityId: optional(id), targetLineId: optional(id),
    draftCoordinates: array(geoPoint, 100000), snappedSource: optional(snap), snappedTarget: optional(snap),
    validationErrors: array(object({ code: text(), message: text(), severity: choice("warning", "error") })),
    preview: optional(object({ operation: tool, lineId: optional(id), lengthKm: number(), stationCount: number(), estimatedCost: number(), estimatedDurationDays: number(), summary: text() })),
  }))),
  expectedTotalCost: number(), remainingCost: number(), expectedConstructionDays: number(), expectedDemand: number(), expectedRevenue: number(),
  terrainDifficulty: number(), transferEffect: number(), createdAt: number(), priority: choice("low", "normal", "high", "critical"), notes: text(10000),
  status: choice("draft", "review", "insufficient", "ready", "partial", "completed", "on-hold"),
});
const metadata = { shareId: id, gameVersion: text(50), cityDataVersion: text(100), requiredExtensions: array(text(100), 100) };
const schema = object({
  ...metadata, kind: choice("draw-gyotong-share"),
  diagram: object({
    ...metadata, kind: choice("metro-diagram"), cityId: choice("seoul", "busan", "daejeon", "gwangju"), generatedAt: number(),
    network: object({ title: text(), cityName: text(), generatedAt: number(), routeCount: number(), stationCount: number() }),
    routes: array(object({ id, name: text(), color, stationIds: ids })),
    stations: array(object({ id, name: text(), routeIds: ids, position: screenPoint, transfer: boolean, express: boolean })),
  }),
  routeDesign: object({ ...metadata, kind: choice("route-design"), cityId: choice("seoul", "busan", "daejeon", "gwangju"), generatedAt: number(), plans: array(plan, 1000) }),
});

export type ShareValidationContext = {
  gameVersion: string; cityDataVersion: string; cityId: CityId;
  actualRouteIds?: ReadonlySet<string>; actualStationIds?: ReadonlySet<string>; actualDepotIds?: ReadonlySet<string>;
  actualSegments?: ReadonlyMap<string, ReadonlySet<string>>;
  actualNodeIds?: ReadonlySet<string>; actualBranchIds?: ReadonlySet<string>;
};

function reference(id: string | undefined, candidates: ReadonlySet<string>, path: string) {
  if (id !== undefined && !candidates.has(id)) invalid(`${path} (존재하지 않는 참조: ${id})`);
}

function validateReferences(bundle: GameShareBundle, context: ShareValidationContext) {
  const unique = (items: { id: string }[], path: string) => {
    const result = new Set<string>();
    for (const item of items) { if (result.has(item.id)) invalid(`${path} (중복 ID: ${item.id})`); result.add(item.id); }
    return result;
  };
  const diagramRoutes = unique(bundle.diagram.routes, "diagram.routes");
  const diagramStations = unique(bundle.diagram.stations, "diagram.stations");
  for (const route of bundle.diagram.routes) for (const stationId of route.stationIds) reference(stationId, diagramStations, "diagram.route.stationIds");
  for (const station of bundle.diagram.stations) for (const routeId of station.routeIds) reference(routeId, diagramRoutes, "diagram.station.routeIds");
  if (bundle.diagram.network.routeCount !== diagramRoutes.size || bundle.diagram.network.stationCount !== diagramStations.size) invalid("diagram.network.count");
  unique(bundle.routeDesign.plans, "routeDesign.plans");
  const allIds = new Set<string>();
  for (const plan of bundle.routeDesign.plans) {
    if (plan.cityId !== context.cityId) invalid("plan.cityId");
    const routes = unique(plan.routes, "plan.routes");
    const stations = unique(plan.stations, "plan.stations");
    const depots = unique(plan.depots, "plan.depots");
    const junctions = unique(plan.junctions ?? [], "plan.junctions");
    const branchIds = new Set(plan.routes.flatMap((route) => (route.branches ?? []).map((branch) => branch.branchId)));
    const nodes = new Set(plan.routes.flatMap((route) => route.segments.flatMap((segment) => [segment.fromNodeId, segment.toNodeId])));
    const segmentIds = new Set(plan.routes.flatMap((route) => route.segments.map((segment) => segment.id)));
    const actualRouteRefs = new Set([...(context.actualRouteIds ?? []), ...plan.routes.flatMap((route) => route.actualRouteId ? [route.actualRouteId] : [])]);
    const actualStationRefs = new Set([...(context.actualStationIds ?? []), ...plan.stations.flatMap((station) => station.actualStationId ? [station.actualStationId] : [])]);
    const routeRefs = new Set([...routes, ...actualRouteRefs]);
    const stationRefs = new Set([...stations, ...actualStationRefs]);
    const depotRefs = new Set([...depots, ...(context.actualDepotIds ?? []), ...plan.depots.flatMap((depot) => depot.actualDepotId ? [depot.actualDepotId] : [])]);
    const entities = new Set([...routeRefs, ...stationRefs, ...depotRefs, ...junctions, ...nodes, ...segmentIds,
      ...(context.actualNodeIds ?? []), ...[...(context.actualSegments?.values() ?? [])].flatMap((segments) => [...segments])]);
    const assets = [plan, ...plan.routes, ...plan.stations, ...plan.depots, ...plan.transfers, ...(plan.connections ?? []), ...(plan.junctions ?? []), ...(plan.routePlanningDrafts ?? []),
      ...plan.routes.flatMap((route) => route.segments.flatMap((segment) => [segment, ...(segment.riverCrossings ?? [])])),
      ...plan.routes.flatMap((route) => (route.branches ?? []).map((branch) => ({ id: branch.branchId })))];
    for (const asset of assets) {
      if (allIds.has(asset.id) || nodes.has(asset.id)) invalid(`plan (중복 ID: ${asset.id})`);
      allIds.add(asset.id);
    }
    for (const routeId of routes) if (actualRouteRefs.has(routeId)) invalid("route.id (실제 노선과 계획 ID 충돌)");
    for (const stationId of stations) if (actualStationRefs.has(stationId)) invalid("station.id (실제 역과 계획 ID 충돌)");
    const nodePositions = new Map<string, [number, number]>();
    for (const route of plan.routes) {
      const segments = new Set(route.segments.map((segment) => segment.id));
      const routeNodes = new Set(route.segments.flatMap((segment) => [segment.fromNodeId, segment.toNodeId]));
      for (const completed of route.completedSegmentIds) reference(completed, segments, "route.completedSegmentIds");
      reference(route.parentBlueprintId, routes, "route.parentBlueprintId");
      reference(route.rootLineId, routeRefs, "route.rootLineId");
      reference(route.targetLineId, routeRefs, "route.targetLineId");
      reference(route.actualExtension?.routeId, actualRouteRefs, "route.actualExtension.routeId");
      for (const segment of route.segments) {
        const endpoints: Array<[string, [number, number]]> = [[segment.fromNodeId, segment.coordinates[0]], [segment.toNodeId, segment.coordinates.at(-1)!]];
        for (const [nodeId, position] of endpoints) {
          const previous = nodePositions.get(nodeId);
          if (previous && (Math.abs(previous[0] - position[0]) > 1e-7 || Math.abs(previous[1] - position[1]) > 1e-7)) invalid("segment.node (공유 노드 좌표 불일치)");
          nodePositions.set(nodeId, position);
        }
      }
      const ancestors = new Set([route.id]);
      let parent = route.parentBlueprintId;
      while (parent) {
        if (ancestors.has(parent)) invalid("route.parentBlueprintId (순환 참조)");
        ancestors.add(parent);
        parent = plan.routes.find((item) => item.id === parent)?.parentBlueprintId;
      }
      for (const branch of route.branches ?? []) {
        reference(branch.junctionNodeId, routeNodes, "branch.junctionNodeId");
        for (const segmentId of branch.segmentIds) reference(segmentId, segments, "branch.segmentIds");
      }
    }
    for (const station of plan.stations) {
      for (const routeId of station.plannedRouteIds) reference(routeId, routes, "station.plannedRouteIds");
      for (const routeId of station.actualRouteIds) reference(routeId, actualRouteRefs, "station.actualRouteIds");
    }
    for (const depot of plan.depots) {
      for (const routeId of depot.connectedPlannedRouteIds) reference(routeId, routes, "depot.connectedPlannedRouteIds");
      for (const routeId of depot.connectedActualRouteIds) reference(routeId, actualRouteRefs, "depot.connectedActualRouteIds");
    }
    for (const transfer of plan.transfers) {
      for (const stationId of transfer.stationIds) reference(stationId, stations, "transfer.stationIds");
      for (const stationId of transfer.actualStationIds ?? []) reference(stationId, actualStationRefs, "transfer.actualStationIds");
    }
    for (const connection of plan.connections ?? []) {
      for (const side of ["source", "target"] as const) {
        const type = connection[`${side}EntityType`];
        reference(connection[`${side}EntityId`], type === "blueprint-endpoint" ? routes : type === "blueprint-station" ? stations
          : type === "station" ? actualStationRefs : type === "depot-access" ? depotRefs : actualRouteRefs, `connection.${side}EntityId`);
        reference(connection[`${side}LineId`], routeRefs, `connection.${side}LineId`);
        reference(connection[`${side}StationId`], stationRefs, `connection.${side}StationId`);
        if ((type === "blueprint-endpoint" || type === "line-endpoint") && !connection[`${side}Endpoint`]) invalid(`connection.${side}Endpoint`);
      }
    }
    for (const junction of plan.junctions ?? []) {
      reference(junction.targetLineId, routeRefs, "junction.targetLineId");
      const target = plan.routes.find((route) => route.id === junction.targetLineId || route.actualRouteId === junction.targetLineId);
      reference(junction.sourceSegmentId, target ? new Set(target.segments.map((segment) => segment.id)) : context.actualSegments?.get(junction.targetLineId) ?? new Set(), "junction.sourceSegmentId");
      reference(junction.stationBlueprintId, stations, "junction.stationBlueprintId");
      reference(junction.parentBranchBlueprintId, new Set([...routes, ...branchIds]), "junction.parentBranchBlueprintId");
    }
    for (const draft of plan.routePlanningDrafts ?? []) {
      reference(draft.sourceBlueprintId, routes, "draft.sourceBlueprintId");
      for (const side of ["source", "target"] as const) {
        reference(draft[`${side}EntityId`], entities, `draft.${side}EntityId`);
        reference(draft[`${side}LineId`], routeRefs, `draft.${side}LineId`);
      }
      reference(draft.preview?.lineId, routeRefs, "draft.preview.lineId");
      for (const target of [draft.snappedSource, draft.snappedTarget]) {
        if (!target) continue;
        if (target.kind !== "empty-map") reference(target.entityId, entities, "draft.snap.entityId");
        reference(target.lineId, routeRefs, "draft.snap.lineId");
        reference(target.branchId, new Set([...branchIds, ...(context.actualBranchIds ?? [])]), "draft.snap.branchId");
      }
    }
  }
}

export function validateSharedGameBundle(value: unknown, context: ShareValidationContext): { ok: boolean; bundle?: GameShareBundle; error?: string } {
  try {
    // Bound total work as well as each collection before walking the schema.
    let entries = 0;
    const pending = [{ value, depth: 0 }];
    while (pending.length) {
      const item = pending.pop()!;
      if (++entries > 500000 || item.depth > 24) invalid("데이터 크기/깊이 제한");
      if (item.value && typeof item.value === "object") for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 });
    }
    schema(value, "share");
    const bundle = value as GameShareBundle;
    for (const data of [bundle, bundle.diagram, bundle.routeDesign]) {
      if (!/^\d+\.\d+\.\d+$/.test(data.gameVersion) || data.gameVersion.split(".")[0] !== context.gameVersion.split(".")[0]) throw new Error("게임 버전이 호환되지 않습니다.");
      if (data.cityDataVersion !== context.cityDataVersion) throw new Error("도시 데이터 버전이 호환되지 않습니다.");
      if (data.requiredExtensions.length) throw new Error("필요한 확장 콘텐츠가 없습니다.");
    }
    if (bundle.diagram.cityId !== context.cityId || bundle.routeDesign.cityId !== context.cityId) throw new Error("현재 도시와 다른 도시의 공유 데이터입니다.");
    validateReferences(bundle, context);
    return { ok: true, bundle };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "공유 JSON 형식이 올바르지 않습니다." };
  }
}
