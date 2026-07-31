import { describe, expect, it } from "vitest";
import {
  assertExtensionDependency,
  completeConnectionBlueprint,
  completeJunctionBlueprint,
  transitionBlueprint,
} from "../src/blueprintLifecycle";
import { createConnectionBlueprint, createJunctionBlueprint } from "../src/routeBlueprints";

const source = { id: "end-a", type: "line-endpoint" as const, lineId: "line-a" };
const target = { id: "end-b", type: "line-endpoint" as const, lineId: "line-b" };
function runtime() {
  return { entityIds: new Set(["end-a", "end-b", "station-a", "station-b", "depot-a"]), routeIds: new Set(["line-a", "line-b"]), depotIds: new Set(["depot-a"]), transfers: [], physicalConnections: [], depotAccess: [], crossings: [], graphVersion: 0 };
}
function underConstruction(type: Parameters<typeof createConnectionBlueprint>[0]["connectionType"]) {
  const pair = type === "transfer"
    ? { source: { id: "station-a", type: "station" as const, lineId: "line-a" }, target: { id: "station-b", type: "station" as const, lineId: "line-b" } }
    : { source, target };
  const draft = createConnectionBlueprint({ id: `bp-${type}`, ...pair, connectionType: type });
  return transitionBlueprint(transitionBlueprint(transitionBlueprint(draft, "approved"), "scheduled"), "under-construction");
}

describe("blueprint lifecycle", () => {
  it("allows only the declared lifecycle transitions", () => {
    const draft = createConnectionBlueprint({ id: "bp", source, target, connectionType: "physical-track" });
    expect(transitionBlueprint(draft, "approved").status).toBe("approved");
    expect(() => transitionBlueprint(draft, "completed")).toThrow("Invalid");
    expect(() => transitionBlueprint({ ...draft, status: "completed" }, "cancelled")).toThrow("Invalid");
  });

  it("applies a transfer only when completed and rejects duplicates", () => {
    const bp = underConstruction("transfer");
    const state = completeConnectionBlueprint({ ...runtime(), entityIds: new Set(["end-a", "end-b", "station-a", "station-b"]) }, bp, { stationIds: ["station-a", "station-b"] });
    expect(state.transfers).toHaveLength(1);
    expect(state.graphVersion).toBe(1);
    expect(() => completeConnectionBlueprint(state, bp, { stationIds: ["station-a", "station-b"] })).toThrow("Duplicate");
  });

  it("keeps a crossing out of the graph and activates physical and depot links on completion", () => {
    const crossing = completeConnectionBlueprint(runtime(), underConstruction("crossing-only"));
    expect(crossing.graphVersion).toBe(0);
    expect(crossing.crossings).toHaveLength(1);
    const physical = completeConnectionBlueprint(runtime(), underConstruction("physical-track"));
    expect(physical.physicalConnections).toHaveLength(1);
    const depotBlueprint = transitionBlueprint(transitionBlueprint(transitionBlueprint(createConnectionBlueprint({ id: "depot", source: { id: "depot-a", type: "depot-access" }, target: { id: "end-a", type: "line-endpoint", lineId: "line-a" }, connectionType: "depot-access" }), "approved"), "scheduled"), "under-construction");
    expect(completeConnectionBlueprint(runtime(), depotBlueprint).depotAccess).toHaveLength(1);
  });

  it("splits the original segment only when the junction completes", () => {
    const draft = createJunctionBlueprint({ id: "j", targetLineId: "line-a", sourceSegmentId: "s", position: { lat: 1, lng: 1 }, splitRatio: .5, createsStation: false });
    const blueprint = transitionBlueprint(transitionBlueprint(transitionBlueprint(draft, "approved"), "scheduled"), "under-construction");
    const result = completeJunctionBlueprint({ lineId: "line-a", nodes: [], branches: [], segments: [{ id: "s", fromNodeId: "a", toNodeId: "b", coordinates: [[0, 0], [2, 2]], lengthKm: 2 }] }, blueprint, { junctionNodeId: "j-node", branchId: "branch-1" });
    expect(result.segments.map((segment) => segment.id)).toEqual(["s:a:j", "s:b:j"]);
    expect(result.branches[0].junctionNodeId).toBe("j-node");
  });

  it("blocks a child extension until its parent completes", () => {
    const parent = { id: "one", status: "under-construction" as const };
    const child = { id: "two", parentBlueprintId: "one", status: "under-construction" as const };
    expect(() => assertExtensionDependency(child, [parent, child])).toThrow("must be completed");
    expect(() => assertExtensionDependency(child, [{ ...parent, status: "completed" as const }, child])).not.toThrow();
  });
});
