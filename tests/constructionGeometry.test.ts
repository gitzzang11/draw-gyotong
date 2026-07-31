import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createConnectionSegment,
  dedupeCoordinates,
  distanceMeters,
  findNearestConnectionStation,
  findPolylineInsertionIndex,
  mergeRouteGeometry,
  normalizeConnectionPolyline,
  polylineLengthMeters,
  replaceSegmentId,
  splitRouteSegment,
} from "../src/geometry/constructionGeometry.ts";

describe("construction geometry", () => {
  it("calculates stable meter distances without mutating input", () => {
    const points: Array<[number, number]> = [[37.5, 127], [37.501, 127]];
    const copy = structuredClone(points);
    expect(distanceMeters(points[0], points[0])).toBe(0);
    expect(distanceMeters(points[0], points[1])).toBeCloseTo(111.2, 0);
    expect(polylineLengthMeters(points)).toBeGreaterThan(100);
    expect(points).toEqual(copy);
  });

  it("selects the nearest valid station deterministically", () => {
    const stations = [
      { id: "b", name: "B", position: [37.5, 127] as [number, number], demand: 0, connectedRouteIds: ["r"] },
      { id: "a", name: "A", position: [37.5, 127] as [number, number], demand: 0, connectedRouteIds: ["r"] },
    ];
    expect(findNearestConnectionStation({ coordinate: [37.5, 127], stations, routeId: "r" })?.station.id).toBe("a");
    expect(findNearestConnectionStation({ coordinate: [0, 0], stations, routeId: "r", maximumDistanceMeters: 1 })).toBeUndefined();
    expect(findNearestConnectionStation({ coordinate: [37.5, 127], stations, routeId: "r", excludedStationIds: ["a"] })?.station.id).toBe("b");
  });

  it("normalizes connection endpoints and creates deterministic segments", () => {
    const drawn: Array<[number, number]> = [[0, 0], [0, .5], [0, .5], [0, 1]];
    const normalized = normalizeConnectionPolyline({ sourceEndpoints: [[0, 0]], targetEndpoints: [[0, 1]], drawnCoordinates: drawn });
    expect(normalized.coordinates).toEqual([[0, 0], [0, .5], [0, 1]]);
    const segment = createConnectionSegment({ id: "s", fromNodeId: "a", toNodeId: "b", coordinates: normalized.coordinates });
    expect(segment).toEqual(createConnectionSegment({ id: "s", fromNodeId: "a", toNodeId: "b", coordinates: normalized.coordinates }));
    expect(segment.lengthKm).toBeGreaterThan(100);
    expect(drawn).toHaveLength(4);
  });

  it.each([
    { first: [[0, 0], [0, 1]], second: [[0, 1], [0, 2]] },
    { first: [[0, 0], [0, 1]], second: [[0, 2], [0, 1]] },
    { first: [[0, 1], [0, 0]], second: [[0, 1], [0, 2]] },
    { first: [[0, 1], [0, 0]], second: [[0, 2], [0, 1]] },
  ])("merges route endpoint orientations", ({ first, second }) => {
    const result = mergeRouteGeometry({
      first: first as Array<[number, number]>,
      second: second as Array<[number, number]>,
      firstHint: [0, 1],
      secondHint: [0, 1],
      bridge: [[0, 1]],
    });
    expect(dedupeCoordinates(result.coordinates)).toEqual(result.coordinates);
    expect(result.coordinates.length).toBeGreaterThanOrEqual(3);
  });

  it("splits a multi-point segment and preserves the original", () => {
    const segment = {
      id: "s", fromNodeId: "a", toNodeId: "b",
      coordinates: [[0, 0], [0, 1], [0, 2]] as Array<[number, number]>,
      lengthKm: 222, terrainImpact: { riverCrossings: 0, mountainSegments: 0 },
      constructionMode: "bridge" as const, constructionCost: 0, enabled: true,
    };
    const original = structuredClone(segment);
    const result = splitRouteSegment({ segment, junctionPosition: [0, 1], splitRatio: .5, junctionNodeId: "j", beforeId: "a-j", afterId: "j-b" });
    expect(result.beforeSegment.coordinates.at(-1)).toEqual(result.afterSegment.coordinates[0]);
    expect(result.beforeSegment.lengthKm + result.afterSegment.lengthKm).toBeCloseTo(result.totalLengthMeters / 1000);
    expect(segment).toEqual(original);
    expect(() => splitRouteSegment({ segment, junctionPosition: [0, 1], splitRatio: 0, junctionNodeId: "j", beforeId: "x", afterId: "y" })).toThrow();
  });

  it("replaces exactly one segment ID without mutation", () => {
    const ids = ["a", "b", "c"];
    expect(replaceSegmentId(ids, "b", "b1", "b2")).toEqual({ segmentIds: ["a", "b1", "b2", "c"], originalIndex: 1 });
    expect(ids).toEqual(["a", "b", "c"]);
    expect(() => replaceSegmentId(ids, "x", "x1", "x2")).toThrow();
    expect(() => replaceSegmentId(["a", "a"], "a", "a1", "a2")).toThrow();
  });

  it("finds a deterministic insertion segment", () => {
    expect(findPolylineInsertionIndex([[0, 0], [0, 1], [1, 1]], [.8, 1])).toBe(2);
  });

  it("has no Leaflet dependency and handles 2-500 point polylines", () => {
    const source = readFileSync(new URL("../src/geometry/constructionGeometry.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']leaflet|L\.|map\./);
    const started = performance.now();
    for (const size of [2, 20, 100, 500]) {
      const points = Array.from({ length: size }, (_, index) => [37.5 + index * 1e-5, 127] as [number, number]);
      for (let run = 0; run < 100; run += 1) {
        expect(polylineLengthMeters(points)).toBeGreaterThan(0);
      }
    }
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
