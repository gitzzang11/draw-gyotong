import { describe, expect, it } from "vitest";
import {
  getTargetHitRadius,
  pointInPolygon,
  resolveMapTarget,
  type MapHitCandidate,
} from "../src/mapHitTest.ts";

describe("unified map hit testing", () => {
  const hit = (kind: MapHitCandidate["kind"], distancePx = 0): MapHitCandidate => ({
    id: kind,
    kind,
    label: kind,
    distancePx,
    hit: true,
  });

  it("prioritizes an exact train over a station and route", () => {
    expect(resolveMapTarget([hit("route"), hit("station"), hit("train", 4)], "mouse", 7, "management").selected?.kind).toBe("train");
  });

  it("selects stations at centre/nearby, depots inside, and routes when alone", () => {
    expect(resolveMapTarget([hit("station", 10)], "mouse", 7, "management").selected?.kind).toBe("station");
    expect(pointInPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(true);
    expect(resolveMapTarget([hit("depot")], "mouse", 7, "management").selected?.kind).toBe("depot");
    expect(resolveMapTarget([hit("route", 3)], "mouse", 7, "management").selected?.kind).toBe("route");
  });

  it("returns alternatives for ambiguous same-priority targets", () => {
    const result = resolveMapTarget([
      { ...hit("route", 2), id: "r1" },
      { ...hit("route", 5), id: "r2" },
    ], "touch", 7, "management");
    expect(result.alternatives).toHaveLength(1);
  });

  it("uses wider touch radii than mouse", () => {
    expect(getTargetHitRadius("station", "touch")).toBeGreaterThan(getTargetHitRadius("station", "mouse"));
    expect(getTargetHitRadius("route", "touch")).toBeGreaterThan(getTargetHitRadius("route", "mouse"));
  });

  it("filters candidates by workspace mode", () => {
    expect(resolveMapTarget([hit("train")], "mouse", 7, "planning").selected).toBeNull();
    expect(resolveMapTarget([hit("blueprint")], "mouse", 7, "planning").selected?.kind).toBe("blueprint");
    expect(resolveMapTarget([hit("blueprint")], "mouse", 7, "construction").selected).toBeNull();
    expect(resolveMapTarget([hit("construction")], "mouse", 7, "construction").selected?.kind).toBe("construction");
  });
});
