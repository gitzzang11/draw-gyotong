import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { ConstructionPlan, ConstructionProject, PlannedRoute } from "../src/domain/constructionTypes";
import type { Depot, RouteLine, RouteSegment, Station } from "../src/domain/networkTypes";
import { filterValidPlanConnections } from "../src/domain/planConversion";
import { coordinatesEqual } from "../src/geometry/constructionGeometry";
import { stableEntityId } from "../src/storage/migrations";
import { addStagedPlanSegments } from "../src/domain/stagedPlanRoute";
import { isValidConstructionStatusTransition } from "../src/storage/integrityCheck";
import { mergeLineExtension } from "../src/lineExtension";
import { normalizeTrainType } from "../src/domain/trainTypes";

const sourceText = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("main.ts", sourceText, ts.ScriptTarget.Latest, true);
const declarations = new Map(sourceFile.statements.filter(ts.isFunctionDeclaration)
  .filter((node) => node.name).map((node) => [node.name!.text, node.getText(sourceFile)]));
const noop = () => {};
const positions: [number, number][] = [[35, 127], [35.01, 127], [35.02, 127], [35.03, 127], [35.04, 127]];

function fixture(segmentCount = 2): ConstructionPlan {
  const segments: RouteSegment[] = positions.slice(1, segmentCount + 1).map((to, index) => ({
    id: `segment-${index + 1}`, fromNodeId: `planned-node-${index}`, toNodeId: `planned-node-${index + 1}`,
    coordinates: [positions[index], to], lengthKm: 1, constructionCost: (index + 1) * 100,
    constructionMode: "bridge", enabled: true, terrainImpact: { riverCrossings: 0, mountainSegments: 0 },
  }));
  const route: PlannedRoute = {
    id: "blueprint", name: "1호선", color: "#123456", coordinates: positions.slice(0, segmentCount + 1),
    segments, completedSegmentIds: [], expectedCost: segments.reduce((sum, segment) => sum + segment.constructionCost, 0),
    constructionDays: 100, expectedDemand: 0, expectedRevenue: 0, transferEffect: 0,
  };
  return {
    id: "plan", name: "단계별 건설", cityId: "seoul", routes: [route],
    stations: [{ id: "planned-station", name: "중간역", position: positions[1], plannedRouteIds: [route.id], actualRouteIds: [], expectedDemand: 10, completed: false }],
    depots: [], transfers: [], connections: [], junctions: [], expectedTotalCost: route.expectedCost + 180,
    remainingCost: route.expectedCost + 180, expectedConstructionDays: 100, expectedDemand: 10, expectedRevenue: 0,
    terrainDifficulty: 0, transferEffect: 0, createdAt: 0, priority: "normal", notes: "", status: "draft",
  };
}

function application(plan = fixture(), timeline = false, flushStateSave = async () => {}) {
  let sequence = 0;
  let selection: Array<{ kind: string; assetId: string; routeId: string }> = [];
  const errors: unknown[] = [];
  const constructionState = {
    plans: [plan], projects: [] as ConstructionProject[],
    replacePlans(values: ConstructionPlan[]) { this.plans = values; },
    replaceProjects(values: ConstructionProject[]) { this.projects = values; },
  };
  const networkState = { routes: [] as RouteLine[], stations: [] as Station[], depots: [] as Depot[] };
  const operationsState = { fleets: [] as Array<{ routeId: string; sets: number }> };
  const financeState = { economy: { cash: 10_000, constructionSpent: 0 } };
  const latLng = (lat: number, lng: number) => ({ lat, lng });
  const context = createContext({
    // 국비 보조 없음(보조금은 tests/constructionSubsidy.test.ts에서 따로 검사)
    subsidizedCost: (cost: number) => cost, constructionSubsidyRate: () => 0, constructionSubsidy: () => 0,
    structuredClone, Date, Error, console: { error: (error: unknown) => errors.push(error) },
    constructionState, networkState, financeState, operationsState,
    metaState: { current: { mode: "sandbox", cityId: "seoul", difficulty: "normal" }, patch: noop },
    analysisStateOwner: { current: { dayIndex: 0 } },
    baseConstructionDaysPerKm: 95, bridgeConstructionDays: 60, tunnelConstructionDays: 90,
    filterValidPlanConnections, coordinatesEqual, stableEntityId, addStagedPlanSegments, isValidConstructionStatusTransition, mergeLineExtension, normalizeTrainType,
    pendingStationNameTargets: new Map(), planConversionsInFlight: new Set(),
    dedupeById: <T extends { id: string }>(values: T[]) => Array.from(new Map(values.map((value) => [value.id, value])).values()),
    L: { latLng }, map: { distance: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 100_000 },
    getActivePlan: () => constructionState.plans[0], getPlanConversionSelection: () => selection,
    createId: (prefix: string) => `${prefix}-${++sequence}`, usesConstructionTimeline: () => timeline,
    cloneState: () => structuredClone({ constructionState: { plans: constructionState.plans, projects: constructionState.projects }, networkState, financeState }),
    updatePlan: (id: string, update: (value: ConstructionPlan) => ConstructionPlan) => {
      constructionState.plans = constructionState.plans.map((value) => value.id === id ? update(value) : value);
    },
    createStationConstructionProject: (station: Station) => ({
      id: `station-project-${station.id}`, name: station.name, kind: "station", status: "scheduled", routeIds: station.connectedRouteIds,
      stationIds: [station.id], depotIds: [], coordinates: [station.position], startedDay: 0, durationDays: 30,
      elapsedDays: 0, expectedCompletionDay: 30, baseCost: 180, additionalCost: 0, delayDays: 0, events: [],
    }),
    synchronizeGraphReferences: noop, flushStateSave, applyTutorialPlanConversionBoost: noop,
    undoStack: [], redoStack: [], maxHistory: 30, activePlanId: plan.id,
    closePlanConversionDialog: noop, renderPlanningDialog: noop, requestUpdate: noop, showToast: noop, playFeedback: noop,
    renderConstructionManager: noop,
    routePlanningController: { session: null },
    showError: (message: string) => errors.push(message),
    stateRecoveryCoordinator: { recover: noop },
  });
  const names = ["confirmPlanConversion", "calculatePlanConversionCost", "groupContiguousPlanSegments", "isPlanFullyConverted", "planHasActiveConstruction", "pruneFinishedPlans", "recalculatePlan", "rebuildRouteGraph", "upsertEqualBranchPattern", "calculateLengthKmPrecise", "findNearestGraphNodeId", "createPlanConstructionProjects", "createStagedPlanConstructionProject", "openConstructionProject", "getOpeningRequirements", "hasRouteGaps", "isRouteOperational", "isStationOperational", "isDepotOperational", "getPlannedExtensionSegments", "getPlannedExtensionCoordinates", "createLineExtensionPayload", "applyPendingLineExtension", "createPendingExtensionProject"];
  runInContext(ts.transpileModule(names.map((name) => declarations.get(name)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return {
    constructionState, networkState, financeState, operationsState, errors,
    async convert(segments: string[], station = false, blueprintId = "blueprint") {
      selection = segments.map((assetId) => ({ kind: "segment", assetId, routeId: blueprintId }));
      if (station) selection.push({ kind: "station", assetId: "planned-station", routeId: "" });
      await context.confirmPlanConversion();
      expect(errors).toEqual([]);
    },
    isOperational(routeId: string): boolean { return context.isRouteOperational(routeId); },
    async open(projectId: string) {
      await context.openConstructionProject(projectId);
      expect(errors).toEqual([]);
    },
  };
}

describe("staged plan construction through the application entry point", () => {
  it("adds the next segment to the same route, preserves existing station nodes, and charges each segment once", async () => {
    const app = application();
    await app.convert(["segment-1"], true);
    const firstRoute = app.networkState.routes[0];
    const stationNode = app.networkState.stations[0].routeNodeIds![0];
    expect(app.constructionState.plans[0].routes[0].completedSegmentIds).toEqual(["segment-1"]);
    expect(app.constructionState.plans[0].remainingCost).toBe(200);
    await app.convert(["segment-2"]);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(firstRoute.id);
    expect(app.networkState.routes[0].coordinates).toEqual(positions.slice(0, 3));
    expect(app.networkState.routes[0].constructionCost).toBe(300);
    expect(app.networkState.routes[0].nodes!.some((node) => node.id === stationNode)).toBe(true);
    expect(app.networkState.stations[0].connectedRouteIds).toEqual([firstRoute.id]);
    expect(app.financeState.economy).toEqual({ cash: 9_520, constructionSpent: 480 });
    expect(app.constructionState.plans).toEqual([]);
  });

  it("prepends an earlier segment without replacing the built route or station node identity", async () => {
    const app = application();
    await app.convert(["segment-2"], true);
    const routeId = app.networkState.routes[0].id;
    const stationNode = app.networkState.stations[0].routeNodeIds![0];
    await app.convert(["segment-1"]);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(routeId);
    expect(app.networkState.routes[0].coordinates).toEqual(positions.slice(0, 3));
    expect(app.networkState.routes[0].nodes!.find((node) => coordinatesEqual(node.position, positions[1]))!.id).toBe(stationNode);
  });

  it("does not charge or construct already completed selections when a confirmation is repeated", async () => {
    const app = application();
    await app.convert(["segment-1"], true);
    const spending = app.financeState.economy.constructionSpent;
    const routeId = app.networkState.routes[0].id;
    await app.convert(["segment-1"], true);
    expect(app.financeState.economy.constructionSpent).toBe(spending);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(routeId);
    expect(app.networkState.stations).toHaveLength(1);
  });

  it("ignores a second confirmation while the first conversion is awaiting durable save", async () => {
    let release!: () => void;
    let entered!: () => void;
    const saveGate = new Promise<void>((resolve) => { release = resolve; });
    const saveStarted = new Promise<void>((resolve) => { entered = resolve; });
    const app = application(fixture(), false, async () => { entered(); await saveGate; });
    const first = app.convert(["segment-1"], true);
    await saveStarted;
    const routeId = app.networkState.routes[0].id;
    await app.convert(["segment-2"]);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.financeState.economy.constructionSpent).toBe(280);
    expect(app.constructionState.plans[0].routes[0].completedSegmentIds).toEqual(["segment-1"]);
    release();
    await first;
    await app.convert(["segment-2"]);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(routeId);
    expect(app.financeState.economy.constructionSpent).toBe(480);
  });

  it("keeps disconnected selected sections in one route without building a line across the unselected gap", async () => {
    const app = application(fixture(3));
    await app.convert(["segment-1", "segment-3"]);
    expect(app.networkState.routes).toHaveLength(1);
    const route = app.networkState.routes[0];
    expect(app.constructionState.plans[0].routes[0].actualRouteId).toBe(route.id);
    expect(route.constructionCost).toBe(400);
    expect(route.segments!.some((segment) => segment.enabled && coordinatesEqual(segment.coordinates[0], positions[1]) && coordinatesEqual(segment.coordinates.at(-1)!, positions[2]))).toBe(false);
    await app.convert(["segment-2"], true);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(route.id);
    expect(app.networkState.routes[0].coordinates).toEqual(positions.slice(0, 4));
    expect(app.networkState.routes[0].constructionCost).toBe(600);
  });

  it("creates a second construction project for the remaining section while keeping one actual route", async () => {
    const app = application(fixture(), true);
    await app.convert(["segment-1"]);
    const routeId = app.networkState.routes[0].id;
    app.constructionState.projects = app.constructionState.projects.map((project) => ({ ...project, status: "operating", elapsedDays: project.durationDays }));
    await app.convert(["segment-2"]);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(routeId);
    expect(app.constructionState.projects).toHaveLength(2);
    expect(app.constructionState.projects.every((project) => project.routeIds.includes(routeId))).toBe(true);
    expect(app.constructionState.projects.map((project) => project.baseCost)).toEqual([100, 200]);
    expect(app.constructionState.projects[1].status).toBe("scheduled");
    expect(app.constructionState.projects[1].coordinates).toEqual([positions[1], positions[2]]);
    expect(app.networkState.routes[0].coordinates).toEqual([positions[0], positions[1]]);
    expect(app.isOperational(routeId)).toBe(true);

    // Pending additions must survive a serialized save, without relying on the live plan object.
    const persisted = JSON.parse(JSON.stringify({ routes: app.networkState.routes, projects: app.constructionState.projects }));
    app.networkState.routes = persisted.routes;
    app.constructionState.projects = persisted.projects.map((project: ConstructionProject, index: number) => index === 1 ? { ...project, status: "opening-ready" } : project);
    app.networkState.stations = [{ id: "actual-station", name: "역", position: positions[1], connectedRouteIds: [routeId], demand: 10 }];
    app.networkState.depots = [{ id: "actual-depot", name: "기지", polygon: positions.slice(0, 3), areaHa: 1, capacity: 10, maintenanceCost: 1, connectedRouteIds: [routeId], level: 1 }];
    app.operationsState.fleets = [{ routeId, sets: 1 }];
    await app.open(app.constructionState.projects[1].id);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(routeId);
    expect(app.networkState.routes[0].coordinates).toEqual(positions.slice(0, 3));
    expect(app.networkState.routes[0].constructionCost).toBe(300);
    expect(app.constructionState.projects.every((project) => project.status === "operating")).toBe(true);
    await app.open(app.constructionState.projects[1].id);
    expect(app.networkState.routes[0].constructionCost).toBe(300);
  });

  it("adds a planned branch to the built route without replacing the trunk or its station junction", async () => {
    const plan = fixture(3);
    const design = plan.routes[0];
    const branchEnd: [number, number] = [35.01, 127.01];
    design.coordinates = positions.slice(0, 3);
    design.segments[2] = { ...design.segments[2], coordinates: [positions[1], branchEnd], fromNodeId: "planned-node-1", toNodeId: "planned-branch-end" };
    design.branches = [{ branchId: "planned-branch", junctionNodeId: "planned-node-1", segmentIds: ["segment-3"] }];
    const app = application(plan);
    await app.convert(["segment-1", "segment-2"], true);
    const routeId = app.networkState.routes[0].id;
    const stationNodeId = app.networkState.stations[0].routeNodeIds![0];
    await app.convert(["segment-3"]);
    expect(app.networkState.routes).toHaveLength(1);
    const route = app.networkState.routes[0];
    expect(route.id).toBe(routeId);
    expect(route.coordinates).toEqual(positions.slice(0, 3));
    expect(route.branches).toHaveLength(1);
    expect(route.branches![0].junctionNodeId).toBe(stationNodeId);
    expect(route.nodes!.find((node) => node.id === stationNodeId)!.kind).toBe("branch");
    expect(route.nodes!.some((node) => coordinatesEqual(node.position, branchEnd))).toBe(true);
    expect(route.branches![0].segmentIds.every((id) => route.segments!.some((segment) => segment.id === id && segment.enabled))).toBe(true);
    expect(route.constructionCost).toBe(600);
  });

  it("resolves a chained extension to the original route after its parent is built in two stages", async () => {
    const plan = fixture(3);
    const parent = plan.routes[0];
    const child = structuredClone(parent);
    child.id = "child-blueprint";
    child.parentBlueprintId = parent.id;
    child.rootLineId = parent.id;
    child.targetLineId = parent.id;
    child.operationKind = "extension";
    child.segments = child.segments.map((segment) => ({ ...segment, id: `child-${segment.id}` }));
    parent.coordinates = positions.slice(0, 3);
    parent.segments = parent.segments.slice(0, 2);
    plan.routes.push(child);
    const app = application(plan);
    await app.convert(["segment-1"], true);
    const rootId = app.networkState.routes[0].id;
    await app.convert(["segment-2"]);
    expect(app.constructionState.plans[0].routes[0].actualRouteId).toBe(rootId);
    await app.convert(child.segments.map((segment) => segment.id), false, child.id);
    expect(app.networkState.routes).toHaveLength(1);
    expect(app.networkState.routes[0].id).toBe(rootId);
    expect(app.networkState.routes[0].coordinates).toEqual(positions.slice(0, 4));
    expect(app.networkState.stations[0].connectedRouteIds).toEqual([rootId]);
  });
});
