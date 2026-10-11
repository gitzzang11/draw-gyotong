import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { ConstructionPlan, PlannedRoute } from "../src/domain/constructionTypes";
import type { RouteSegment } from "../src/domain/networkTypes";
import { filterValidPlanConnections } from "../src/domain/planConversion";
import { copyConstructionPlan } from "../src/domain/planCopy";
import { maxShareFileBytes, validateSharedGameBundle } from "../src/shareBundle";
import { StateRecoveryCoordinator } from "../src/runtime/stateRecoveryCoordinator";

const sourceText = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("main.ts", sourceText, ts.ScriptTarget.Latest, true);
const declarations = new Map(sourceFile.statements.filter(ts.isFunctionDeclaration)
  .filter((node) => node.name).map((node) => [node.name!.text, node.getText(sourceFile)]));
const noop = () => {};

// Execute the real entry points without booting the game's DOM and map runtime.
function applicationContext(names: string[], globals: Record<string, unknown> = {}) {
  let sequence = 0;
  const context = createContext({
    // 국비 보조 없음(보조금은 tests/constructionSubsidy.test.ts에서 따로 검사)
    subsidizedCost: (cost: number) => cost, constructionSubsidyRate: () => 0, constructionSubsidy: () => 0,
    structuredClone, console, Date, Error,
    gameVersion: "0.4.0", cityDataVersion: "korea-cities-1",
    metaState: { current: { cityId: "seoul", mode: "sandbox", slotId: "slot-a" } },
    financeState: { economy: { cash: 1_000_000 } },
    networkState: { routes: [{ id: "external-line" }], stations: [{ id: "known" }], depots: [] },
    baseConstructionDaysPerKm: 95, filterValidPlanConnections,
    copyConstructionPlan, validateSharedGameBundle, maxShareFileBytes, shareImportInProgress: false,
    createId: (prefix: string) => `${prefix}-new-${++sequence}`,
    renderMetroDiagram: noop, renderPlanningDialog: noop, requestUpdate: noop,
    requestStateSave: noop, pushHistory: noop, showToast: noop,
    ...globals,
  });
  const functions = names.map((name) => {
    const declaration = declarations.get(name);
    if (!declaration) throw new Error(`Missing main.ts function: ${name}`);
    return declaration;
  }).join("\n");
  runInContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}

function segment(id: string, fromNodeId: string, toNodeId: string, from: [number, number], to: [number, number]): RouteSegment {
  return {
    id, fromNodeId, toNodeId, coordinates: [from, to], lengthKm: 1,
    terrainImpact: { riverCrossings: 0, mountainSegments: 0 },
    constructionMode: "bridge", constructionCost: 100, enabled: true,
  };
}

function route(id: string, coordinates: PlannedRoute["coordinates"], segments: RouteSegment[]): PlannedRoute {
  return {
    id, name: id, color: "#123456", coordinates, segments, completedSegmentIds: [],
    expectedCost: 100, constructionDays: 1, expectedDemand: 0, expectedRevenue: 0, transferEffect: 0,
  };
}

function plan(): ConstructionPlan {
  const start: [number, number] = [35, 127];
  const middle: [number, number] = [35.01, 127];
  const end: [number, number] = [35.02, 127];
  const childEnd: [number, number] = [35.03, 127];
  const parent = route("parent", [start, middle, end], [
    segment("parent-segment-1", "node-start", "node-middle", start, middle),
    segment("parent-segment-2", "node-middle", "node-end", middle, end),
  ]);
  parent.branches = [{ branchId: "branch", junctionNodeId: "node-middle", segmentIds: ["parent-segment-2"] }];
  const child = route("child", [end, childEnd], [segment("child-segment", "node-end", "node-child-end", end, childEnd)]);
  Object.assign(child, { operationKind: "extension", parentBlueprintId: "parent", rootLineId: "parent", targetLineId: "parent" });
  return {
    id: "original-plan", name: "Reference fixture", cityId: "seoul", routes: [parent, child],
    stations: [
      { id: "station-a", name: "A", position: middle, plannedRouteIds: ["parent"], actualRouteIds: [], expectedDemand: 0, completed: false },
      { id: "station-b", name: "B", position: childEnd, plannedRouteIds: ["child"], actualRouteIds: [], expectedDemand: 0, completed: false },
    ],
    depots: [{
      id: "depot", name: "Depot", polygon: [start, middle, [35, 127.01]],
      connectedPlannedRouteIds: ["parent"], connectedActualRouteIds: ["external-line"],
      expectedCost: 100, constructionDays: 1, capacity: 5, completed: false,
    }],
    transfers: [{ id: "transfer", stationIds: ["station-a", "station-b"], expectedEffect: 0, completed: false }],
    connections: [{
      id: "planned-connection", operationType: "connection", status: "draft", connectionType: "physical-track",
      sourceEntityType: "blueprint-endpoint", targetEntityType: "blueprint-endpoint",
      sourceEntityId: "parent", targetEntityId: "child", sourceLineId: "parent", targetLineId: "child",
      sourceEndpoint: "end", targetEndpoint: "end",
      coordinates: [{ lat: end[0], lng: end[1] }, { lat: childEnd[0], lng: childEnd[1] }],
      estimatedCost: 10, estimatedDuration: 1, createdAt: 0,
    }, {
      id: "external-connection", operationType: "connection", status: "draft", connectionType: "physical-track",
      sourceEntityType: "line-endpoint", targetEntityType: "blueprint-endpoint",
      sourceEntityId: "external-line", targetEntityId: "child", sourceLineId: "external-line", targetLineId: "child",
      sourceEndpoint: "end", targetEndpoint: "end", estimatedCost: 10, estimatedDuration: 1, createdAt: 0,
    }],
    junctions: [{
      id: "junction", targetLineId: "parent", sourceSegmentId: "parent-segment-1", position: { lat: middle[0], lng: middle[1] },
      splitRatio: 0.5, createsStation: true, stationBlueprintId: "station-a", status: "draft",
    }],
    routePlanningDrafts: [{
      id: "planning-draft", tool: "connect", stage: "reviewing",
      sourceEntityId: "parent", sourceLineId: "parent", sourceBlueprintId: "parent",
      targetEntityId: "station-b", targetLineId: "child", draftCoordinates: [{ lat: end[0], lng: end[1] }, { lat: childEnd[0], lng: childEnd[1] }],
      validationErrors: [],
      snappedSource: { id: "source-snap", entityId: "parent", lineId: "parent", kind: "planned-endpoint", endpoint: "end", coordinate: { lat: end[0], lng: end[1] }, screenPoint: { x: 1, y: 2 }, label: "Parent" },
      snappedTarget: { id: "target-snap", entityId: "station-b", lineId: "child", kind: "planned-station", coordinate: { lat: childEnd[0], lng: childEnd[1] }, screenPoint: { x: 3, y: 4 }, label: "B" },
      preview: { operation: "connect", lineId: "parent", lengthKm: 1, stationCount: 0, estimatedCost: 10, estimatedDurationDays: 1, summary: "Connect" },
    }],
    expectedTotalCost: 0, remainingCost: 0, expectedConstructionDays: 1, expectedDemand: 0,
    expectedRevenue: 0, terrainDifficulty: 0, transferEffect: 0, createdAt: 0, priority: "normal", notes: "", status: "draft",
  };
}

function bundle() {
  return {
    kind: "draw-gyotong-share", shareId: "share", gameVersion: "0.4.0", cityDataVersion: "korea-cities-1", requiredExtensions: [],
    diagram: {
      kind: "metro-diagram", shareId: "diagram", gameVersion: "0.4.0", cityDataVersion: "korea-cities-1", requiredExtensions: [], cityId: "seoul", generatedAt: 0,
      network: { title: "Fixture", cityName: "Seoul", generatedAt: 0, routeCount: 1, stationCount: 1 },
      routes: [{ id: "external-line", name: "External", color: "#123456", stationIds: ["known"] }],
      stations: [{ id: "known", name: "Known", routeIds: ["external-line"], position: { x: 900, y: 800 }, transfer: false, express: false }],
    },
    routeDesign: { kind: "route-design", shareId: "design", gameVersion: "0.4.0", cityDataVersion: "korea-cities-1", requiredExtensions: [], cityId: "seoul", generatedAt: 0, plans: [plan()] },
  };
}

type ShareFixture = ReturnType<typeof bundle>;

describe("shared bundle validation", () => {
  it.each<[string, (value: ShareFixture) => void]>([
    ["planned ID in an actual extension", (value) => { value.routeDesign.plans[0].routes[1].actualExtension = { routeId: "parent", atStart: false }; }],
    ["planned ID in an actual connection endpoint", (value) => { value.routeDesign.plans[0].connections![0].sourceEntityType = "line-endpoint"; }],
    ["inconsistent shared node coordinates", (value) => { value.routeDesign.plans[0].routes[0].segments[1].coordinates[0] = [36, 128]; }],
  ])("rejects ambiguous graph references: %s", (_description, corrupt) => {
    const value = bundle();
    corrupt(value);
    expect(applicationContext(["validateShareBundle"]).validateShareBundle(value).ok).toBe(false);
  });
  it("accepts the valid reference fixture", () => {
    expect(applicationContext(["validateShareBundle"]).validateShareBundle(bundle()).ok).toBe(true);
  });

  it.each<[string, (value: ShareFixture) => void]>([
    ["string routes", (value) => { value.routeDesign.plans[0].routes = "invalid" as unknown as PlannedRoute[]; }],
    ["duplicate plan IDs", (value) => { value.routeDesign.plans.push(structuredClone(value.routeDesign.plans[0])); }],
    ["duplicate route IDs", (value) => { value.routeDesign.plans[0].routes[1].id = "parent"; }],
    ["duplicate segment IDs", (value) => { value.routeDesign.plans[0].routes[0].segments[1].id = "parent-segment-1"; }],
    ["duplicate station IDs", (value) => { value.routeDesign.plans[0].stations[1].id = "station-a"; }],
    ["duplicate diagram station IDs", (value) => { value.diagram.stations.push(structuredClone(value.diagram.stations[0])); }],
    ["nonfinite route coordinates", (value) => { value.routeDesign.plans[0].routes[0].coordinates[0][0] = NaN; }],
    ["invalid latitude", (value) => { value.routeDesign.plans[0].stations[0].position[0] = 91; }],
    ["invalid longitude", (value) => { value.routeDesign.plans[0].routes[0].segments[0].coordinates[0][1] = 181; }],
    ["missing parent blueprint", (value) => { value.routeDesign.plans[0].routes[1].parentBlueprintId = "missing"; }],
    ["missing planned station route", (value) => { value.routeDesign.plans[0].stations[0].plannedRouteIds = ["missing"]; }],
    ["missing transfer station", (value) => { value.routeDesign.plans[0].transfers[0].stationIds[0] = "missing"; }],
    ["missing branch segment", (value) => { value.routeDesign.plans[0].routes[0].branches![0].segmentIds = ["missing"]; }],
    ["missing junction segment", (value) => { value.routeDesign.plans[0].junctions![0].sourceSegmentId = "missing"; }],
    ["missing connection endpoint", (value) => { value.routeDesign.plans[0].connections![0].targetEntityId = "missing"; }],
    ["missing draft source blueprint", (value) => { value.routeDesign.plans[0].routePlanningDrafts![0].sourceBlueprintId = "missing"; }],
    ["missing diagram route station", (value) => { value.diagram.routes[0].stationIds = ["missing"]; }],
    ["numeric game version", (value) => { Object.assign(value, { gameVersion: 4 }); }],
    ["array game version", (value) => { Object.assign(value.diagram, { gameVersion: ["0.4.0"] }); }],
    ["invalid semantic version", (value) => { value.routeDesign.gameVersion = "0"; }],
    ["numeric city data version", (value) => { Object.assign(value, { cityDataVersion: 1 }); }],
    ["string extension contents", (value) => { Object.assign(value, { requiredExtensions: "extension" }); }],
    ["numeric extension entry", (value) => { Object.assign(value.diagram, { requiredExtensions: [1] }); }],
    ["unavailable extension", (value) => { Object.assign(value.routeDesign, { requiredExtensions: ["not-installed"] }); }],
    ["unsafe route color", (value) => { value.routeDesign.plans[0].routes[0].color = '#123456" onmouseover="alert(1)'; }],
    ["unsafe diagram color", (value) => { value.diagram.routes[0].color = "red; background: url(untrusted)"; }],
    ["quoted route ID", (value) => { value.routeDesign.plans[0].routes[0].id = 'route"'; }],
    ["negative construction cost", (value) => { value.routeDesign.plans[0].routes[0].segments[0].constructionCost = -1; }],
    ["negative connection cost", (value) => { value.routeDesign.plans[0].connections![0].estimatedCost = -1; }],
    ["cyclic parent blueprints", (value) => { value.routeDesign.plans[0].routes[0].parentBlueprintId = "child"; }],
    ["missing external actual line", (value) => {
      value.routeDesign.plans[0].connections![1].sourceEntityId = "absent-actual-line";
      value.routeDesign.plans[0].connections![1].sourceLineId = "absent-actual-line";
    }],
  ])("rejects %s without throwing", (_description, corrupt) => {
    const value = bundle();
    corrupt(value);
    const context = applicationContext(["validateShareBundle"]);
    let result: { ok: boolean } | undefined;

    expect(() => { result = context.validateShareBundle(value); }).not.toThrow();
    expect(result?.ok).toBe(false);
  });
});

function clonedPlan(operation: "import" | "duplicate", original = plan()) {
  const constructionState = { plans: [original], replacePlans(values: ConstructionPlan[]) { this.plans = values; } };
  const context = applicationContext(["recalculatePlan", "cloneImportedPlan", "duplicateActivePlan"], {
    constructionState, getActivePlan: () => constructionState.plans[0], activePlanId: original.id, redoStack: [],
    playFeedback: () => {},
  });
  if (operation === "import") return { original, copy: context.cloneImportedPlan(original) as ConstructionPlan };
  context.duplicateActivePlan();
  return { original, copy: constructionState.plans[1] };
}

describe.each(["import", "duplicate"] as const)("plan %s reference remapping", (operation) => {
  it("remaps extension parent, root, and target to the new parent route", () => {
    const { original, copy } = clonedPlan(operation);
    const [parent, child] = copy.routes;
    expect(parent.id).not.toBe(original.routes[0].id);
    expect(child.parentBlueprintId).toBe(parent.id);
    expect(child.rootLineId).toBe(parent.id);
    expect(child.targetLineId).toBe(parent.id);
  });

  it("keeps shared segment nodes connected after assigning new IDs", () => {
    const { copy } = clonedPlan(operation);
    const [parent, child] = copy.routes;
    expect(parent.segments[0].toNodeId).toBe(parent.segments[1].fromNodeId);
    expect(parent.segments[1].toNodeId).toBe(child.segments[0].fromNodeId);
    expect(parent.segments[0].id).not.toBe("parent-segment-1");
    expect(parent.segments[0].toNodeId).not.toBe("node-middle");
  });

  it("remaps branch segment and junction node references consistently", () => {
    const { copy } = clonedPlan(operation);
    const parent = copy.routes[0];
    expect(parent.branches![0].branchId).not.toBe("branch");
    expect(parent.branches![0].segmentIds).toEqual([parent.segments[1].id]);
    expect(parent.branches![0].junctionNodeId).toBe(parent.segments[0].toNodeId);
  });

  it("remaps junction identity, target route, segment, and planned station", () => {
    const { copy } = clonedPlan(operation);
    const junction = copy.junctions![0];
    expect(junction.id).not.toBe("junction");
    expect(junction.targetLineId).toBe(copy.routes[0].id);
    expect(junction.sourceSegmentId).toBe(copy.routes[0].segments[0].id);
    expect(junction.stationBlueprintId).toBe(copy.stations[0].id);
  });

  it("retains connections using new planned IDs and preserves the external actual line ID", () => {
    const { original, copy } = clonedPlan(operation);
    expect(copy.connections).toHaveLength(original.connections!.length);
    const planned = copy.connections!.find((item) => item.sourceEntityType === "blueprint-endpoint")!;
    expect(planned.id).not.toBe("planned-connection");
    expect([planned.sourceEntityId, planned.sourceLineId]).toEqual([copy.routes[0].id, copy.routes[0].id]);
    expect([planned.targetEntityId, planned.targetLineId]).toEqual([copy.routes[1].id, copy.routes[1].id]);
    const external = copy.connections!.find((item) => item.sourceEntityType === "line-endpoint")!;
    expect([external.sourceEntityId, external.sourceLineId]).toEqual(["external-line", "external-line"]);
    expect([external.targetEntityId, external.targetLineId]).toEqual([copy.routes[1].id, copy.routes[1].id]);
  });

  it("remaps saved planning sessions and both snapped endpoint references", () => {
    const { copy } = clonedPlan(operation);
    const draft = copy.routePlanningDrafts![0];
    expect(draft.id).not.toBe("planning-draft");
    expect([draft.sourceEntityId, draft.sourceLineId, draft.sourceBlueprintId]).toEqual(Array(3).fill(copy.routes[0].id));
    expect([draft.targetEntityId, draft.targetLineId]).toEqual([copy.stations[1].id, copy.routes[1].id]);
    expect([draft.snappedSource!.entityId, draft.snappedSource!.lineId]).toEqual([copy.routes[0].id, copy.routes[0].id]);
    expect([draft.snappedTarget!.entityId, draft.snappedTarget!.lineId]).toEqual([copy.stations[1].id, copy.routes[1].id]);
    expect(draft.preview!.lineId).toBe(copy.routes[0].id);
  });

  it("leaves the original plan unchanged and does not share mutable coordinates", () => {
    const original = plan();
    const before = structuredClone(original);
    const { copy } = clonedPlan(operation, original);
    expect(original).toEqual(before);

    copy.routes[0].coordinates[0][0] = 0;
    copy.routes[0].segments[0].coordinates[0][0] = 1;
    copy.routePlanningDrafts![0].snappedSource!.coordinate.lat = 2;
    expect(original).toEqual(before);
  });

  it("turns references to completed sibling routes back into copied planned routes", () => {
    const original = plan();
    original.routes[0].actualRouteId = "built-parent";
    original.routes[1].actualRouteId = "built-child";
    original.routes[1].actualExtension = { routeId: "built-parent", atStart: true };
    original.stations[0].actualRouteIds = ["built-parent", "external-line"];
    original.depots[0].connectedActualRouteIds = ["built-parent", "external-line"];
    const before = structuredClone(original);

    const { copy } = clonedPlan(operation, original);

    expect(copy.routes[1].actualExtension).toBeUndefined();
    expect(copy.routes[1].parentBlueprintId).toBe(copy.routes[0].id);
    expect(copy.routes[1].extensionAtStart).toBe(true);
    expect(copy.routes.map((item) => item.actualRouteId)).toEqual([undefined, undefined]);
    expect(copy.stations[0].plannedRouteIds).toEqual([copy.routes[0].id]);
    expect(copy.stations[0].actualRouteIds).toEqual(["external-line"]);
    expect(copy.depots[0].connectedPlannedRouteIds).toEqual([copy.routes[0].id]);
    expect(copy.depots[0].connectedActualRouteIds).toEqual(["external-line"]);
    expect(original).toEqual(before);
  });

  it("clears completion and project metadata while retaining the copied design", () => {
    const original = plan();
    original.status = "completed";
    for (const item of original.routes) {
      item.actualRouteId = `built-${item.id}`;
      item.completedSegmentIds = item.segments.map((segment) => segment.id);
    }
    original.stations.forEach((item) => { item.completed = true; item.actualStationId = `built-${item.id}`; });
    original.depots[0].completed = true;
    original.depots[0].actualDepotId = "built-depot";
    original.transfers[0].completed = true;
    original.transfers[0].actualStationIds = ["built-station-a", "built-station-b"];
    const completedConnection = original.connections![0];
    Object.assign(completedConnection, {
      status: "completed", projectId: "completed-project", appliedAt: 123,
      actualEntityIds: ["built-parent", "built-child"], failureReason: "old failure",
      sourceEntityType: "line-endpoint", sourceEntityId: "built-parent", sourceLineId: "built-parent",
      targetEntityType: "line-endpoint", targetEntityId: "built-child", targetLineId: "built-child",
    });
    original.junctions![0].status = "completed";
    original.routePlanningDrafts![0].stage = "completed";

    const { copy } = clonedPlan(operation, original);

    expect(copy.status).not.toBe("completed");
    expect(copy.routes.every((item) => !item.actualRouteId && item.completedSegmentIds.length === 0)).toBe(true);
    expect(copy.stations.every((item) => !item.completed && !item.actualStationId)).toBe(true);
    expect(copy.depots[0].completed).toBe(false);
    expect(copy.depots[0].actualDepotId).toBeUndefined();
    expect(copy.transfers[0].completed).toBe(false);
    expect(copy.transfers[0].actualStationIds).toEqual([]);
    expect(copy.transfers[0].stationIds).toEqual(copy.stations.map((item) => item.id));
    const converted = copy.connections![0];
    expect(converted.status).toBe("draft");
    expect([converted.projectId, converted.appliedAt, converted.actualEntityIds, converted.failureReason]).toEqual(Array(4).fill(undefined));
    expect([converted.sourceEntityType, converted.targetEntityType]).toEqual(["blueprint-endpoint", "blueprint-endpoint"]);
    expect([converted.sourceEntityId, converted.targetEntityId]).toEqual(copy.routes.map((item) => item.id));
    expect(copy.junctions![0].status).toBe("draft");
    expect(copy.routePlanningDrafts![0].stage).toBe("reviewing");
  });
});

function importContext() {
  const original = plan();
  const constructionState = { plans: [original], replacePlans(values: ConstructionPlan[]) { this.plans = values; } };
  const diagramStateOwner = {
    current: { manualPositions: { known: { x: 1, y: 2 } }, autoPositions: {} },
    mergeManualPositions(positions: Record<string, { x: number; y: number }>) {
      this.current.manualPositions = { ...this.current.manualPositions, ...positions };
    },
    replace(state: typeof this.current) { this.current = structuredClone(state); },
  };
  const errors: string[] = [];
  const context = applicationContext(["validateShareBundle", "cloneImportedPlan", "recalculatePlan", "importShareBundle"], {
    constructionState, diagramStateOwner, activePlanId: original.id,
    undoStack: [{ marker: "undo-before" }], redoStack: [{ marker: "redo-before" }], maxHistory: 30,
    importShareJsonInput: { files: [{ text: async () => JSON.stringify(bundle()) }], value: "chosen-file" },
    flushStateSave: async () => { throw new Error("disk full"); },
    showError: (message: string) => errors.push(message),
  });
  context.cloneState = () => structuredClone({ plans: constructionState.plans, diagramState: diagramStateOwner.current });
  context.applyState = (snapshot: ReturnType<typeof context.cloneState>) => {
    constructionState.replacePlans(structuredClone(snapshot.plans));
    diagramStateOwner.replace(snapshot.diagramState);
  };
  context.stateRecoveryCoordinator = new StateRecoveryCoordinator({
    capture: context.cloneState, restore: context.applyState,
    requestUpdates: noop, fullReconcile: noop, rebuildRouter: noop, validate: noop,
  });
  const capture = () => structuredClone({
    diagram: diagramStateOwner.current, plans: constructionState.plans,
    activePlanId: context.activePlanId, undoStack: context.undoStack, redoStack: context.redoStack,
  });
  return { context, capture, errors, constructionState, diagramStateOwner };
}

describe("failed shared bundle import", () => {
  it.each(["diagram", "plans", "activePlanId", "undoStack", "redoStack"] as const)("restores %s when persistence fails", async (key) => {
    const { context, capture, errors } = importContext();
    const before = capture();

    await context.importShareBundle();

    expect(errors).toHaveLength(1);
    expect(capture()[key]).toEqual(before[key]);
  });

  it.each(["copyConstructionPlan", "renderMetroDiagram", "renderPlanningDialog"] as const)("does not leave partial changes after %s fails", async (method) => {
    const { context, capture, errors } = importContext();
    const before = capture();
    context.flushStateSave = async () => {};
    const original = context[method];
    let attempted = false;
    context[method] = (...args: unknown[]) => {
      if (!attempted) { attempted = true; throw new Error(`${method} failed`); }
      return original(...args);
    };

    await context.importShareBundle();

    expect(errors).toHaveLength(1);
    expect(capture()).toEqual(before);
  });
});

describe("shared bundle import limits and transactions", () => {
  it("rejects an oversized file before reading its contents", async () => {
    const { context, capture, errors } = importContext();
    const before = capture();
    context.importShareJsonInput.files = [{ size: maxShareFileBytes + 1, text: async () => { throw new Error("unexpected read"); } }];

    await context.importShareBundle();

    expect(errors[0]).toContain("20MB");
    expect(capture()).toEqual(before);
  });

  it("rejects oversized contents even when the reported file size is small", async () => {
    const { context, capture, errors } = importContext();
    const before = capture();
    context.importShareJsonInput.files = [{ size: 1, text: async () => " ".repeat(maxShareFileBytes + 1) }];

    await context.importShareBundle();

    expect(errors[0]).toContain("너무 큽니다");
    expect(capture()).toEqual(before);
  });

  it("rejects excessive nesting before schema traversal", () => {
    const value = bundle();
    let nested: unknown = 0;
    for (let index = 0; index < 30; index += 1) nested = { nested };
    Object.assign(value, { extra: nested });

    const result = applicationContext(["validateShareBundle"]).validateShareBundle(value);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("깊이 제한");
  });

  it("rejects collections containing more than 1000 plans", () => {
    const value = bundle();
    value.routeDesign.plans = Array.from({ length: 1001 }, (_, index) => ({ ...plan(), id: `plan-${index}` }));

    expect(applicationContext(["validateShareBundle"]).validateShareBundle(value).ok).toBe(false);
  });

  it("rejects a payload exceeding the total traversal entry limit", () => {
    const value = bundle();
    Object.assign(value, { extra: Array(500_001).fill(0) });

    const result = applicationContext(["validateShareBundle"]).validateShareBundle(value);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("크기/깊이 제한");
  });

  it("rejects an external actual reference that does not exist in the current game", () => {
    const context = applicationContext(["validateShareBundle"], { networkState: { routes: [], stations: [], depots: [] } });

    expect(context.validateShareBundle(bundle()).ok).toBe(false);
  });

  it("commits a valid import with one undo snapshot and clears redo only after saving", async () => {
    const { context, capture, errors } = importContext();
    const before = capture();
    let saved = false;
    context.flushStateSave = async () => {
      expect(context.undoStack).toEqual(before.undoStack);
      expect(context.redoStack).toEqual(before.redoStack);
      saved = true;
    };

    await context.importShareBundle();

    expect(saved).toBe(true);
    expect(errors).toEqual([]);
    const after = capture();
    expect(after.plans).toHaveLength(2);
    expect(after.activePlanId).toBe(after.plans[1].id);
    expect(after.diagram.manualPositions.known).toEqual({ x: 900, y: 800 });
    expect(after.undoStack).toHaveLength(before.undoStack.length + 1);
    expect(after.undoStack.at(-1)).toEqual({ plans: before.plans, diagramState: before.diagram });
    expect(after.redoStack).toEqual([]);
    expect(context.shareImportInProgress).toBe(false);
  });

  it("allocates fresh identities on repeated imports of the same design", async () => {
    const { context, constructionState, errors } = importContext();
    context.flushStateSave = async () => {};
    await context.importShareBundle();
    await context.importShareBundle();
    const [first, second] = constructionState.plans.slice(1);
    const identities = (value: ConstructionPlan) => new Set([
      value.id, ...value.routes.map((item) => item.id),
      ...value.routes.flatMap((item) => item.segments.flatMap((segment) => [segment.id, segment.fromNodeId, segment.toNodeId])),
      ...value.routes.flatMap((item) => (item.branches ?? []).map((branch) => branch.branchId)),
      ...value.stations.map((item) => item.id), ...value.depots.map((item) => item.id), ...value.transfers.map((item) => item.id),
      ...(value.connections ?? []).map((item) => item.id), ...(value.junctions ?? []).map((item) => item.id),
      ...(value.routePlanningDrafts ?? []).map((item) => item.id),
    ]);

    expect(errors).toEqual([]);
    expect(constructionState.plans).toHaveLength(3);
    const firstIds = identities(first);
    expect([...identities(second)].filter((id) => firstIds.has(id))).toEqual([]);
  });

  it.each(["slotId", "cityId"] as const)("does not apply a pending file after the current %s changes", async (key) => {
    const { context, capture, errors, constructionState, diagramStateOwner } = importContext();
    let finishReading!: (value: string) => void;
    const contents = new Promise<string>((resolve) => { finishReading = resolve; });
    context.importShareJsonInput.files = [{ size: 100, text: () => contents }];
    const pending = context.importShareBundle();
    context.metaState.current[key] = key === "slotId" ? "slot-b" : "busan";
    constructionState.replacePlans([{ ...plan(), id: "new-game-plan" }]);
    context.activePlanId = "new-game-plan";
    context.undoStack = [{ marker: "new-game-undo" }];
    context.redoStack = [{ marker: "new-game-redo" }];
    diagramStateOwner.current.manualPositions.known = { x: 3, y: 4 };
    const afterGameChange = capture();
    finishReading(JSON.stringify(bundle()));

    await pending;

    expect(errors[0]).toContain("현재 게임이 변경");
    expect(capture()).toEqual(afterGameChange);
    expect(context.shareImportInProgress).toBe(false);
  });
});
