import { describe, expect, it } from "vitest";
import {
  atomicRouteOperation,
  createBranchBlueprint,
  createConnectionBlueprint,
  createExtensionBlueprint,
  createJunctionBlueprint,
  getAvailableConnectionTypes,
  splitSegmentAtJunction,
  validateRouteBlueprint,
} from "../src/routeBlueprints";

describe("route blueprints", () => {
  it("keeps the original line through repeated extensions", () => {
    const first = createExtensionBlueprint({ id: "ext-1", sourceLineId: "line-1", attachEndpoint: "end", coordinates: [] });
    const second = createExtensionBlueprint({ id: "ext-2", sourceBlueprint: first, attachEndpoint: "end", coordinates: [] });
    const third = createExtensionBlueprint({ id: "ext-3", sourceBlueprint: second, attachEndpoint: "end", coordinates: [] });
    expect([first, second, third].map((item) => [item.rootLineId, item.targetLineId])).toEqual([
      ["line-1", "line-1"], ["line-1", "line-1"], ["line-1", "line-1"],
    ]);
    expect(third.parentBlueprintId).toBe("ext-2");
  });

  it("stores a branch on the same line with a unique branch id", () => {
    const branch = createBranchBlueprint({ id: "bp", branchId: "branch-a", lineId: "line-1", junctionNodeId: "station-5", coordinates: [] });
    expect(branch.rootLineId).toBe("line-1");
    expect(branch.targetLineId).toBe("line-1");
    expect(validateRouteBlueprint({
      tool: "branch", blueprint: branch, lineIds: ["line-1"],
      junctionsByLine: new Map([["line-1", new Set(["station-5"])]]), branchIds: [],
    })).toEqual([]);
  });

  it("rejects invalid extension identity and duplicate branch ids", () => {
    const extension = { ...createExtensionBlueprint({ id: "ext", sourceLineId: "line-1", attachEndpoint: "end", coordinates: [] }), targetLineId: "line-2" };
    expect(validateRouteBlueprint({ tool: "extend", blueprint: extension, lineIds: ["line-1", "line-2"] }).map((item) => item.code)).toContain("extension-line-identity");
    const branch = createBranchBlueprint({ id: "bp", branchId: "branch-a", lineId: "line-1", junctionNodeId: "j", coordinates: [] });
    expect(validateRouteBlueprint({
      tool: "branch", blueprint: branch, lineIds: ["line-1"],
      junctionsByLine: new Map([["line-1", new Set(["j"])]]), branchIds: ["branch-a"],
    }).map((item) => item.code)).toContain("duplicate-branch-id");
  });

  it("rolls back the entire operation after a failure", async () => {
    let state = { routes: ["line-1"], edges: [] as string[] };
    await expect(atomicRouteOperation(
      () => structuredClone(state),
      (before) => { state = before; },
      () => { state.routes.push("bad"); state.edges.push("edge"); throw new Error("failed"); },
    )).rejects.toThrow("failed");
    expect(state).toEqual({ routes: ["line-1"], edges: [] });
  });

  it("selects only connection types supported by the target pair", () => {
    const a = { id: "a", type: "station" as const, lineId: "line-1" };
    const b = { id: "b", type: "station" as const, lineId: "line-2" };
    expect(getAvailableConnectionTypes(a, b)).toEqual(["transfer", "crossing-only"]);
    expect(getAvailableConnectionTypes(
      { id: "depot", type: "depot-access" },
      { id: "line-1", type: "line", lineId: "line-1" },
    )).toEqual(["depot-access"]);
    expect(getAvailableConnectionTypes(a, a)).toEqual([]);
  });

  it.each([
    ["transfer", "station", "station"],
    ["physical-track", "line-endpoint", "line-endpoint"],
    ["line-merge", "line-endpoint", "line-endpoint"],
    ["depot-access", "depot-access", "line"],
    ["crossing-only", "station", "station"],
  ] as const)("creates one common %s connection blueprint", (connectionType, sourceType, targetType) => {
    const blueprint = createConnectionBlueprint({
      id: `connection-${connectionType}`,
      source: { id: "source", type: sourceType, lineId: "line-1" },
      target: { id: "target", type: targetType, lineId: "line-2" },
      connectionType,
      createdAt: 10,
    });
    expect(blueprint).toMatchObject({ operationType: "connection", connectionType, status: "draft", createdAt: 10 });
  });

  it("blocks duplicate and deleted-target connections", () => {
    const source = { id: "a", type: "station" as const, lineId: "line-1" };
    const target = { id: "b", type: "station" as const, lineId: "line-2" };
    expect(getAvailableConnectionTypes(source, target, [{ sourceEntityId: "a", targetEntityId: "b", connectionType: "transfer" }])).toEqual(["crossing-only"]);
    expect(getAvailableConnectionTypes(source, { ...target, deleted: true })).toEqual([]);
  });

  it("persists the exact endpoint selected by the user", () => {
    const blueprint = createConnectionBlueprint({
      id: "endpoint-safe",
      source: { id: "a", type: "line-endpoint", lineId: "line-1", endpoint: "end" },
      target: { id: "b", type: "line-endpoint", lineId: "line-2", endpoint: "start" },
      connectionType: "physical-track",
    });
    expect(blueprint).toMatchObject({ sourceEndpoint: "end", targetEndpoint: "start" });
  });

  it("splits a segment atomically around an explicit junction", () => {
    const junction = createJunctionBlueprint({
      id: "junction-bp", targetLineId: "line-1", sourceSegmentId: "segment-1",
      position: { lat: 37.5, lng: 127.5 }, splitRatio: 0.4, createsStation: false,
    });
    const [left, right] = splitSegmentAtJunction({
      id: "segment-1", fromNodeId: "a", toNodeId: "b",
      coordinates: [[37, 127], [38, 128]] as Array<[number, number]>, lengthKm: 10,
    }, junction, "junction-1");
    expect(left).toMatchObject({ fromNodeId: "a", toNodeId: "junction-1", lengthKm: 4 });
    expect(right).toMatchObject({ fromNodeId: "junction-1", toNodeId: "b", lengthKm: 6 });
    expect(left.coordinates.at(-1)).toEqual(right.coordinates[0]);
  });
});
