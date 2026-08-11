import { describe, expect, it } from "vitest";
import {
  calculateServiceOperations,
  normalizeServiceStops,
  totalServiceCapacity,
} from "../src/simulation/expressService.ts";

const fleets = [
  { sets: 10, capacityPerSet: 960, speedKph: 34, trainType: "metro" },
];

describe("express service operations", () => {
  it("keeps terminals and route order when normalizing stops", () => {
    expect(normalizeServiceStops(["a", "b", "c", "d", "e"], ["d", "missing", "b"])).toEqual(["a", "b", "d", "e"]);
    expect(normalizeServiceStops(["a", "b", "c", "d"], [])).toEqual(["a", "d"]);
  });

  it("reserves legacy express share without double-counting local capacity", () => {
    const operations = calculateServiceOperations({
      routeLengthKm: 30,
      routeStationIds: ["a", "b", "c", "d", "e", "f"],
      expressStopStationIds: ["a", "c", "f"],
      fleets,
      expressEnabled: true,
      localEnabled: true,
    });
    expect(operations.local.trainSets + operations.express.trainSets).toBe(10);
    expect(operations.local.stopStationIds).toHaveLength(6);
    expect(operations.express.stopStationIds).toEqual(["a", "c", "f"]);
    expect(operations.express.roundTripMin).toBeLessThan(operations.local.roundTripMin);
  });

  it("uses express train sets explicitly when available", () => {
    const operations = calculateServiceOperations({
      routeLengthKm: 30,
      routeStationIds: ["a", "b", "c", "d"],
      expressStopStationIds: ["a", "d"],
      fleets: [
        { sets: 7, capacityPerSet: 960, speedKph: 34, trainType: "metro" },
        { sets: 3, capacityPerSet: 900, speedKph: 54, trainType: "express" },
      ],
      expressEnabled: true,
      localEnabled: true,
    });
    expect(operations.local.trainSets).toBe(7);
    expect(operations.express.trainSets).toBe(3);
    expect(operations.express.averageSpeedKph).toBe(54);
  });

  it("disables local service without stealing express capacity", () => {
    const operations = calculateServiceOperations({
      routeLengthKm: 20,
      routeStationIds: ["a", "b", "c"],
      expressStopStationIds: ["a", "c"],
      fleets,
      expressEnabled: true,
      localEnabled: false,
    });
    expect(operations.local.enabled).toBe(false);
    expect(operations.express.trainSets).toBe(10);
    expect(totalServiceCapacity([operations.local, operations.express])).toBeGreaterThan(0);
  });
});
