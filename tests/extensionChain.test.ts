import { describe, expect, it } from "vitest";
import type { PlannedRoute } from "../src/domain/constructionTypes";
import type { RouteSegment } from "../src/domain/networkTypes";
import { compassDirection, extensionRootId, freeExtensionEndpoints, labelExtensionPieces, normalizeExtensionChains, toAdditionOnlyExtension } from "../src/domain/extensionChain";

function segment(id: string, coordinates: Array<[number, number]>, lengthKm: number, constructionCost: number, constructionDays?: number): RouteSegment {
  return {
    id, fromNodeId: `${id}:a`, toNodeId: `${id}:b`, coordinates, lengthKm, constructionCost, constructionDays,
    terrainImpact: { riverCrossings: 0, mountainSegments: 0 }, constructionMode: "bridge", enabled: true,
  } as RouteSegment;
}

function route(partial: Partial<PlannedRoute> & Pick<PlannedRoute, "id" | "coordinates" | "segments">): PlannedRoute {
  return {
    name: "Main", color: "#123456", completedSegmentIds: [], expectedCost: 0, constructionDays: 10,
    expectedDemand: 1000, expectedRevenue: 100, transferEffect: 0, ...partial,
  };
}

// 운영 노선 끝 (0,1)에서 나간 조각 P: (0,1)→(0,2), 그 끝에서 이어 연장한 예전 형태 조각 C: (0,1)→(0,2)→(0,3)
const parent = route({
  id: "p", operationKind: "extension", rootLineId: "actual", actualExtension: { routeId: "actual", atStart: false }, extensionAtStart: false,
  coordinates: [[0, 1], [0, 2]], segments: [segment("p1", [[0, 1], [0, 2]], 4, 400, 40)], expectedCost: 400,
});
const legacyChild = route({
  id: "c", operationKind: "extension", rootLineId: "actual", parentBlueprintId: "p", extensionAtStart: false,
  coordinates: [[0, 1], [0, 2], [0, 3]],
  segments: [segment("c1", [[0, 1], [0, 2]], 4, 400, 40), segment("c2", [[0, 2], [0, 3]], 3, 300, 30)],
  expectedCost: 700, constructionDays: 70, expectedDemand: 7000, expectedRevenue: 700, completedSegmentIds: ["c1", "c2"],
});

describe("legacy chained extensions", () => {
  it("keeps only the added part, with cost, days and demand of that part", () => {
    const result = toAdditionOnlyExtension(legacyChild, parent);
    expect(result.coordinates).toEqual([[0, 2], [0, 3]]);
    expect(result.segments.map((item) => item.id)).toEqual(["c2"]);
    expect(result.completedSegmentIds).toEqual(["c2"]);
    expect(result.expectedCost).toBe(300);
    expect(result.constructionDays).toBe(30);
    expect(result.expectedDemand).toBe(3000);
    expect(result.extensionGeometry).toBe("addition");
  });

  it("slices a start-side legacy child and returns attach-point-first coordinates", () => {
    const startParent = route({ id: "sp", coordinates: [[0, 0], [0, -1]], segments: [segment("s1", [[0, 0], [0, -1]], 2, 200)] });
    const startChild = route({
      id: "sc", parentBlueprintId: "sp", extensionAtStart: true,
      coordinates: [[0, -3], [0, -2], [0, 0], [0, -1]],
      segments: [segment("a1", [[0, -3], [0, -2]], 1, 100), segment("a2", [[0, -2], [0, 0]], 1, 100), segment("s1", [[0, 0], [0, -1]], 2, 200)],
    });
    const result = toAdditionOnlyExtension(startChild, startParent);
    expect(result.coordinates).toEqual([[0, 0], [0, -2], [0, -3]]);
    expect(result.segments.map((item) => item.id)).toEqual(["a1", "a2"]);
    expect(result.expectedCost).toBe(200);
  });

  it("normalizes grandchildren against their original parents and leaves new pieces alone", () => {
    const legacyGrandchild = route({
      id: "g", parentBlueprintId: "c", extensionAtStart: false,
      coordinates: [[0, 1], [0, 2], [0, 3], [0, 4]],
      segments: [segment("g1", [[0, 1], [0, 2]], 4, 400), segment("g2", [[0, 2], [0, 3]], 3, 300), segment("g3", [[0, 3], [0, 4]], 2, 200)],
    });
    const fresh = route({ id: "f", parentBlueprintId: "p", extensionGeometry: "addition", coordinates: [[0, 2], [0, 5]], segments: [segment("f1", [[0, 2], [0, 5]], 9, 900)] });
    const [p, c, g, f] = normalizeExtensionChains([parent, legacyChild, legacyGrandchild, fresh]);
    expect(p).toBe(parent);
    expect(c.coordinates).toEqual([[0, 2], [0, 3]]);
    expect(g.coordinates).toEqual([[0, 3], [0, 4]]);
    expect(g.segments.map((item) => item.id)).toEqual(["g3"]);
    expect(f).toBe(fresh);
  });
});

describe("one line made of extension pieces", () => {
  it("offers only the outer ends of the joined pieces", () => {
    const ends = freeExtensionEndpoints([
      { owner: { kind: "actual", id: "actual" }, coordinates: [[0, 0], [0, 1]] },
      { owner: { kind: "planned", id: "p" }, coordinates: [[0, 1], [0, 2]] },
      { owner: { kind: "planned", id: "c" }, coordinates: [[0, 2], [0, 3]] },
    ]);
    expect(ends).toEqual([
      { owner: { kind: "actual", id: "actual" }, atStart: true, position: [0, 0] },
      { owner: { kind: "planned", id: "c" }, atStart: false, position: [0, 3] },
    ]);
  });

  it("treats endpoints within the tolerance as joined", () => {
    const ends = freeExtensionEndpoints([
      { owner: { kind: "actual", id: "a" }, coordinates: [[37.5, 127], [37.5, 127.01]] },
      { owner: { kind: "planned", id: "p" }, coordinates: [[37.50001, 127.01], [37.5, 127.02]] },
    ]);
    expect(ends.map((end) => end.owner.id)).toEqual(["a", "p"]);
    expect(ends.map((end) => end.atStart)).toEqual([true, false]);
  });

  it("finds the root of an extension piece", () => {
    expect(extensionRootId(parent)).toBe("actual");
    expect(extensionRootId(route({ id: "n", operationKind: "new-line", rootLineId: "n", coordinates: [], segments: [] }))).toBeNull();
  });
});

describe("extension piece labels", () => {
  it("names pieces by compass direction and order from the root line", () => {
    const east1 = route({ id: "e1", operationKind: "extension", rootLineId: "a", actualExtension: { routeId: "a", atStart: false }, extensionAtStart: false, coordinates: [[37.5, 127], [37.5, 127.01]], segments: [] });
    const east2 = route({ id: "e2", operationKind: "extension", rootLineId: "a", parentBlueprintId: "e1", extensionAtStart: false, coordinates: [[37.5, 127.01], [37.501, 127.02]], segments: [] });
    const west1 = route({ id: "w1", operationKind: "extension", rootLineId: "a", actualExtension: { routeId: "a", atStart: true }, extensionAtStart: true, coordinates: [[37.5, 126.99], [37.5, 126.98]], segments: [] });
    const labels = labelExtensionPieces([east2, west1, east1]);
    expect(labels.get("e1")?.label).toBe("동쪽 1/2");
    expect(labels.get("e2")?.label).toBe("동쪽 2/2");
    expect(labels.get("w1")?.label).toBe("서쪽 1/1");
  });

  it("falls back to start/end when both sides point the same way", () => {
    const a = route({ id: "a1", extensionAtStart: true, coordinates: [[0, 0], [1, 0]], segments: [] });
    const b = route({ id: "b1", extensionAtStart: false, coordinates: [[2, 0], [3, 0]], segments: [] });
    const labels = labelExtensionPieces([a, b]);
    expect(labels.get("a1")?.label).toBe("시작 쪽 1/1");
    expect(labels.get("b1")?.label).toBe("끝 쪽 1/1");
  });

  it("gives eight compass directions", () => {
    expect(compassDirection([0, 0], [1, 0])).toBe("북");
    expect(compassDirection([0, 0], [0, 1])).toBe("동");
    expect(compassDirection([0, 0], [-1, -1])).toBe("남서");
  });
});
