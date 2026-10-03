import { describe, expect, it } from "vitest";
import type { PlannedRoute } from "../src/domain/constructionTypes";
import { resolvePlanConnectionEndpoint, resolvePlanConnectionRouteId } from "../src/domain/planConversion";
import type { GeoCoordinate } from "../src/geometry/constructionGeometry";
import type { ConnectionBlueprint } from "../src/routeBlueprints";

function plannedRoute(id: string, overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id,
    name: id,
    color: "#123456",
    coordinates: [[37.5, 127], [37.51, 127.01]],
    segments: [],
    completedSegmentIds: [],
    expectedCost: 0,
    constructionDays: 1,
    expectedDemand: 0,
    expectedRevenue: 0,
    transferEffect: 0,
    ...overrides,
  };
}

function connection(side: "source" | "target", entityId: string, lineId?: string): ConnectionBlueprint {
  return {
    id: "connection",
    operationType: "connection",
    sourceEntityId: side === "source" ? entityId : "other-endpoint",
    targetEntityId: side === "target" ? entityId : "other-endpoint",
    sourceEntityType: "blueprint-endpoint",
    targetEntityType: "blueprint-endpoint",
    sourceLineId: side === "source" ? lineId : "other-line",
    targetLineId: side === "target" ? lineId : "other-line",
    connectionType: "physical-track",
    coordinates: [{ lat: 37.5, lng: 127 }, { lat: 37.51, lng: 127.01 }],
    status: "under-construction",
    estimatedCost: 0,
    estimatedDuration: 1,
    createdAt: 0,
  };
}

describe.each(["source", "target"] as const)("plan connection %s route conversion", (side) => {
  it("resolves a declared root blueprint after the legacy endpoint blueprint is gone", () => {
    const routes = [plannedRoute("root-blueprint", { actualRouteId: "actual-line" })];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "removed-endpoint-blueprint", "root-blueprint"), side, ["actual-line", "other-line"],
    )).toBe("actual-line");
  });

  it("keeps the endpoint blueprint's actual route ahead of the declared line mapping", () => {
    const routes = [
      plannedRoute("endpoint-blueprint", { actualRouteId: "endpoint-line" }),
      plannedRoute("declared-blueprint", { actualRouteId: "declared-line" }),
    ];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "endpoint-blueprint", "declared-blueprint"), side, ["endpoint-line", "declared-line"],
    )).toBe("endpoint-line");
  });

  it("preserves an existing declared actual line ID", () => {
    expect(resolvePlanConnectionRouteId(
      [], connection(side, "removed-endpoint", "actual-line"), side, ["actual-line", "other-line"],
    )).toBe("actual-line");
  });

  it("keeps a declared actual line ahead of the endpoint's extension fallback", () => {
    const routes = [plannedRoute("endpoint-blueprint", { actualExtension: { routeId: "extension-line", atStart: false } })];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "endpoint-blueprint", "actual-line"), side, ["actual-line", "extension-line"],
    )).toBe("actual-line");
  });

  it("resolves an extension blueprint to its explicit actual extension route", () => {
    const routes = [plannedRoute("extension-blueprint", { actualExtension: { routeId: "actual-line", atStart: false } })];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "extension-blueprint"), side, ["actual-line"],
    )).toBe("actual-line");
  });

  it("resolves a declared extension chain through its planned root", () => {
    const routes = [
      plannedRoute("root-blueprint", { actualRouteId: "actual-line" }),
      plannedRoute("first-extension", { operationKind: "extension", rootLineId: "root-blueprint", targetLineId: "root-blueprint" }),
      plannedRoute("second-extension", {
        operationKind: "extension", rootLineId: "root-blueprint", targetLineId: "root-blueprint", parentBlueprintId: "first-extension",
      }),
    ];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "removed-endpoint", "second-extension"), side, ["actual-line"],
    )).toBe("actual-line");
  });

  it("resolves an endpoint extension through an explicit parent blueprint", () => {
    const routes = [
      plannedRoute("parent-extension", { actualRouteId: "actual-line" }),
      plannedRoute("endpoint-extension", { operationKind: "extension", parentBlueprintId: "parent-extension" }),
    ];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "endpoint-extension"), side, ["actual-line"],
    )).toBe("actual-line");
  });

  it("does not return an unconverted planned line ID", () => {
    const routes = [plannedRoute("root-blueprint")];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "removed-endpoint", "root-blueprint"), side, ["other-line"],
    )).toBeUndefined();
  });

  it("ignores stale actual mappings and uses a surviving declared actual line", () => {
    const routes = [plannedRoute("endpoint-blueprint", { actualRouteId: "deleted-line" })];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "endpoint-blueprint", "actual-line"), side, ["actual-line"],
    )).toBe("actual-line");
  });

  it("stops safely when extension links form a cycle", () => {
    const routes = [
      plannedRoute("extension-a", { operationKind: "extension", rootLineId: "extension-b", parentBlueprintId: "extension-b" }),
      plannedRoute("extension-b", { operationKind: "extension", rootLineId: "extension-a", parentBlueprintId: "extension-a" }),
    ];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "extension-a", "extension-b"), side, ["other-line"],
    )).toBeUndefined();
  });

  it("does not infer an unrelated converted line from matching geometry", () => {
    const routes = [
      plannedRoute("unconverted-blueprint"),
      plannedRoute("nearby-blueprint", { actualRouteId: "nearby-line" }),
    ];

    expect(resolvePlanConnectionRouteId(
      routes, connection(side, "missing-endpoint", "unconverted-blueprint"), side, ["nearby-line", "other-line"],
    )).toBeUndefined();
  });
});

describe.each(["source", "target"] as const)("plan connection %s endpoint conversion", (side) => {
  function endpointConnection(entityId: string, endpoint?: "start" | "end", hint?: GeoCoordinate): ConnectionBlueprint {
    const blueprint = connection(side, entityId, "actual-line");
    if (side === "source") blueprint.sourceEndpoint = endpoint;
    else blueprint.targetEndpoint = endpoint;
    blueprint.coordinates = hint
      ? (side === "source" ? [hint, [38, 128]] : [[38, 128], hint]).map(([lat, lng]) => ({ lat, lng }))
      : undefined;
    return blueprint;
  }

  it.each(["start", "end"] as const)("retains the selected blueprint %s after both runtime ends extend", (endpoint) => {
    const originalCoordinates: GeoCoordinate[] = [[37.5, 127], [37.51, 127.01]];
    const actualCoordinates: GeoCoordinate[] = [[37.49, 126.99], ...originalCoordinates, [37.52, 127.02]];
    const routes = [plannedRoute("endpoint-blueprint", { coordinates: originalCoordinates, actualRouteId: "actual-line" })];
    const selected = endpoint === "start" ? originalCoordinates[0] : originalCoordinates[1];
    const blueprint = endpointConnection("endpoint-blueprint", endpoint, actualCoordinates[0]);

    expect(resolvePlanConnectionEndpoint(routes, blueprint, side, actualCoordinates)).toEqual(selected);
    expect(side === "source" ? blueprint.sourceEndpoint : blueprint.targetEndpoint).toBe(endpoint);
  });

  it("does not reconnect a deleted blueprint endpoint to another nearby runtime node", () => {
    const closest: GeoCoordinate = [37.5, 127];
    const actualCoordinates: GeoCoordinate[] = [[37.49, 127], closest, [37.5006, 127], [37.52, 127]];
    const blueprint = endpointConnection("removed-endpoint-blueprint", "end", [37.5002, 127]);

    expect(resolvePlanConnectionEndpoint([], blueprint, side, actualCoordinates)).toBeUndefined();
  });

  it("rejects a saved missing-blueprint hint more than 70 meters from every runtime node", () => {
    const blueprint = endpointConnection("removed-endpoint-blueprint", "end", [37.5008, 127]);

    expect(resolvePlanConnectionEndpoint([], blueprint, side, [[37.5, 127], [37.51, 127]])).toBeUndefined();
  });

  it("does not approximate a selected surviving blueprint endpoint that was removed from the actual route", () => {
    const routes = [plannedRoute("endpoint-blueprint", { coordinates: [[37.5, 127], [37.51, 127]] })];
    const nearby: GeoCoordinate = [37.5001, 127];
    const blueprint = endpointConnection("endpoint-blueprint", "start", nearby);

    expect(resolvePlanConnectionEndpoint(routes, blueprint, side, [nearby, [37.52, 127]])).toBeUndefined();
  });

  it("leaves ordinary actual line endpoints to the existing start/end selection", () => {
    const blueprint = endpointConnection("actual-line", "start", [37.5, 127]);
    if (side === "source") blueprint.sourceEntityType = "line-endpoint";
    else blueprint.targetEntityType = "line-endpoint";

    expect(resolvePlanConnectionEndpoint([], blueprint, side, [[37.5, 127], [37.51, 127]])).toBeUndefined();
  });

  it("does not recover a missing blueprint without a saved draw hint", () => {
    const blueprint = endpointConnection("removed-endpoint-blueprint", "end");

    expect(resolvePlanConnectionEndpoint([], blueprint, side, [[37.5, 127], [37.51, 127]])).toBeUndefined();
  });

  it("does not infer a surviving blueprint's selected endpoint when its metadata is missing", () => {
    const coordinates: GeoCoordinate[] = [[37.5, 127], [37.51, 127]];
    const routes = [plannedRoute("endpoint-blueprint", { coordinates })];
    const blueprint = endpointConnection("endpoint-blueprint", undefined, coordinates[0]);

    expect(resolvePlanConnectionEndpoint(routes, blueprint, side, coordinates)).toBeUndefined();
  });
});
