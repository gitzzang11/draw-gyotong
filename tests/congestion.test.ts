import { describe, expect, it } from "vitest";
import { calculateSegmentCongestion, summarizeRouteCongestion } from "../src/congestion.ts";
import type { TransitJourney } from "../src/transitRouting.ts";

function journey(stations: string[], serviceId = "r:local", routeId = "r"): TransitJourney {
  return {
    originStationId: stations[0],
    destinationStationId: stations.at(-1)!,
    routeIds: [routeId],
    serviceIds: [serviceId],
    stationIds: stations,
    segmentIds: stations.slice(1).map((station, index) => `${serviceId}:p:${stations[index]}>${station}`),
    transferStationIds: [],
    transferCount: 0,
    rideTimeMin: 10,
    waitTimeMin: 2,
    transferTimeMin: 0,
    totalTimeMin: 12,
    totalCost: 12,
    legs: [{
      serviceId, routeId, serviceKind: "local",
      fromStationId: stations[0], toStationId: stations.at(-1)!,
      stationIds: stations,
      segmentIds: stations.slice(1).map((station, index) => `${serviceId}:p:${stations[index]}>${station}`),
      rideTimeMin: 10, waitTimeMin: 2, crowdingPenaltyMin: 0, distanceKm: 5,
    }],
  };
}

describe("path based congestion", () => {
  it("assigns demand only to traversed segments and separates directions", () => {
    const segments = calculateSegmentCongestion(
      [
        { activeDemand: 1000, journey: journey(["a", "b", "c"]) },
        { activeDemand: 500, journey: journey(["c", "b"]) },
      ],
      [{ serviceId: "r:local", routeId: "r", serviceKind: "local", hourlyCapacity: 100 }],
      "08",
      0.1,
    );
    expect(segments.find((segment) => segment.direction === "a>b")?.passengerDemand).toBe(100);
    expect(segments.find((segment) => segment.direction === "b>c")?.passengerDemand).toBe(100);
    expect(segments.find((segment) => segment.direction === "c>b")?.passengerDemand).toBe(50);
    expect(segments.some((segment) => segment.direction === "a>c")).toBe(false);
  });

  it("does not duplicate transfer demand", () => {
    const first = journey(["a", "x"], "r1:local", "r1");
    const second = journey(["y", "d"], "r2:local", "r2");
    const transferred: TransitJourney = {
      ...first,
      destinationStationId: "d",
      routeIds: ["r1", "r2"],
      serviceIds: ["r1:local", "r2:local"],
      stationIds: ["a", "x", "y", "d"],
      segmentIds: [...first.segmentIds, ...second.segmentIds],
      transferStationIds: ["x"],
      transferCount: 1,
      legs: [...first.legs, ...second.legs],
    };
    const segments = calculateSegmentCongestion(
      [{ activeDemand: 1000, journey: transferred }],
      [
        { serviceId: "r1:local", routeId: "r1", serviceKind: "local", hourlyCapacity: 100 },
        { serviceId: "r2:local", routeId: "r2", serviceKind: "local", hourlyCapacity: 100 },
      ],
      "08",
      0.1,
    );
    expect(segments).toHaveLength(2);
    expect(segments.every((segment) => segment.passengerDemand === 100)).toBe(true);
  });

  it("reduces crowding when sets or cars increase capacity and reflects the peak segment in summary", () => {
    const groups = [
      { activeDemand: 1200, journey: journey(["a", "b"]) },
      { activeDemand: 400, journey: journey(["b", "c"]) },
    ];
    const base = calculateSegmentCongestion(groups, [{ serviceId: "r:local", routeId: "r", serviceKind: "local", hourlyCapacity: 80 }], "08", 0.1);
    const expanded = calculateSegmentCongestion(groups, [{ serviceId: "r:local", routeId: "r", serviceKind: "local", hourlyCapacity: 160 }], "08", 0.1);
    expect(expanded[0].crowding).toBeCloseTo(base[0].crowding / 2);
    const summary = summarizeRouteCongestion(base)[0];
    expect(summary.peakCrowding).toBe(Math.max(...base.map((segment) => segment.crowding)));
    expect(summary.busiestSegment?.direction).toBe("a>b");
  });

  it("reports no capacity for a traversed service that is not operating", () => {
    const segments = calculateSegmentCongestion(
      [{ activeDemand: 800, journey: journey(["a", "b"]) }],
      [],
      "08",
      0.1,
    );
    expect(segments[0]).toMatchObject({ hourlyCapacity: 0, passengerDemand: 80 });
    expect(segments[0].crowding).toBe(Number.POSITIVE_INFINITY);
  });
});
