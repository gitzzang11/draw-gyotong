import { describe, expect, it } from "vitest";
import type { PlannedRoute } from "../src/domain/constructionTypes";
import { filterValidPlanConnections } from "../src/domain/planConversion";
import type { ConnectionBlueprint } from "../src/routeBlueprints";

function plannedRoute(id: string, coordinates: PlannedRoute["coordinates"]): PlannedRoute {
  return {
    id,
    name: id,
    color: "#123456",
    coordinates,
    segments: [],
    completedSegmentIds: [],
    expectedCost: 0,
    constructionDays: 1,
    expectedDemand: 0,
    expectedRevenue: 0,
    transferEffect: 0,
    actualRouteId: `${id}-actual`,
  };
}

function planRoutes(): PlannedRoute[] {
  return [
    plannedRoute("source-blueprint", [[37.5, 127], [37.51, 127]]),
    plannedRoute("target-blueprint", [[37.52, 127], [37.53, 127]]),
  ];
}

function connection(overrides: Partial<ConnectionBlueprint> = {}): ConnectionBlueprint {
  return {
    id: "connection",
    operationType: "connection",
    sourceEntityId: "source-blueprint",
    targetEntityId: "target-blueprint",
    sourceEntityType: "blueprint-endpoint",
    targetEntityType: "blueprint-endpoint",
    sourceLineId: "source-blueprint-actual",
    targetLineId: "target-blueprint-actual",
    sourceEndpoint: "end",
    targetEndpoint: "start",
    connectionType: "physical-track",
    coordinates: [{ lat: 37.51, lng: 127 }, { lat: 37.52, lng: 127 }],
    status: "draft",
    estimatedCost: 0,
    estimatedDuration: 1,
    createdAt: 0,
    ...overrides,
  };
}

describe.each([
  ["draft", "source"],
  ["draft", "target"],
  ["approved", "source"],
  ["approved", "target"],
] as const)("%s plan connection %s endpoint validity", (status, side) => {
  it("removes a missing blueprint even when its declared actual root line survives", () => {
    const blueprint = connection({ status });
    if (side === "source") blueprint.sourceEntityId = "deleted-source-blueprint";
    else blueprint.targetEntityId = "deleted-target-blueprint";

    expect(filterValidPlanConnections(planRoutes(), [blueprint])).toEqual([]);
  });

  it("removes a missing blueprint even without saved geometry hints", () => {
    const blueprint = connection({ status, coordinates: undefined });
    if (side === "source") blueprint.sourceEntityId = "deleted-source-blueprint";
    else blueprint.targetEntityId = "deleted-target-blueprint";

    expect(filterValidPlanConnections(planRoutes(), [blueprint])).toEqual([]);
  });

  it("removes a redrawn endpoint more than 70 meters from its saved first or last hint", () => {
    const routes = planRoutes();
    if (side === "source") routes[0].coordinates[1] = [37.511, 127];
    else routes[1].coordinates[0] = [37.521, 127];

    expect(filterValidPlanConnections(routes, [connection({ status })])).toEqual([]);
  });

  it("preserves a valid endpoint within 70 meters of its own saved side hint", () => {
    const routes = planRoutes();
    if (side === "source") routes[0].coordinates[1] = [37.5103, 127];
    else routes[1].coordinates[0] = [37.5203, 127];
    const blueprint = connection({ status });

    expect(filterValidPlanConnections(routes, [blueprint])).toEqual([blueprint]);
  });

  it("preserves an existing blueprint endpoint without saved geometry hints", () => {
    const blueprint = connection({ status, coordinates: undefined });

    expect(filterValidPlanConnections(planRoutes(), [blueprint])).toEqual([blueprint]);
  });
});

describe("plan connection validity filtering", () => {
  it.each(["scheduled", "under-construction", "completed"] as const)("preserves %s connections whose blueprint metadata has become stale", (status) => {
    const missing = connection({ id: "missing", status, sourceEntityId: "deleted-source", targetEntityId: "deleted-target" });
    const moved = connection({
      id: "moved", status,
      coordinates: [{ lat: 38, lng: 128 }, { lat: 39, lng: 129 }],
    });

    expect(filterValidPlanConnections(planRoutes(), [missing, moved])).toEqual([missing, moved]);
  });

  it.each(["line-endpoint", "line", "station", "blueprint-station", "depot-access"] as const)("preserves %s entities independently of planned route endpoint metadata", (entityType) => {
    const blueprints = (["draft", "approved"] as const).map((status) => connection({
      id: status, status,
      sourceEntityType: entityType,
      targetEntityType: entityType,
      sourceEntityId: "actual-source-entity",
      targetEntityId: "actual-target-entity",
      coordinates: [{ lat: 38, lng: 128 }, { lat: 39, lng: 129 }],
    }));

    expect(filterValidPlanConnections(planRoutes(), blueprints)).toEqual(blueprints);
  });

  it("does not mutate either input or its nested connection and route data", () => {
    const routes = planRoutes();
    const connections = [connection({ id: "invalid", sourceEntityId: "deleted" }), connection({ id: "valid" })];
    const originalRoutes = structuredClone(routes);
    const originalConnections = structuredClone(connections);

    filterValidPlanConnections(routes, connections);

    expect(routes).toEqual(originalRoutes);
    expect(connections).toEqual(originalConnections);
  });

  it("removes connections invalid on either side while retaining valid connections in order", () => {
    const firstValid = connection({ id: "first-valid" });
    const missingSource = connection({ id: "missing-source", sourceEntityId: "deleted-source" });
    const movedTarget = connection({
      id: "moved-target", status: "approved",
      coordinates: [{ lat: 37.51, lng: 127 }, { lat: 37.53, lng: 127 }],
    });
    const lastValid = connection({ id: "last-valid", status: "approved", coordinates: undefined });

    expect(filterValidPlanConnections(planRoutes(), [firstValid, missingSource, movedTarget, lastValid]))
      .toEqual([firstValid, lastValid]);
  });
});
