import { describe, expect, it } from "vitest";
import { applyStopPreset, calculateOperatingServiceOperation } from "../src/operatingService";

describe("custom operating services", () => {
  const stations = ["a", "b", "c", "d"];

  it("applies convenience presets without storing a service grade", () => {
    expect(applyStopPreset("all", stations)).toEqual(stations);
    expect(applyStopPreset("transfer", stations, new Set(["c"]))).toEqual(["a", "c", "d"]);
    expect(applyStopPreset("terminal", stations)).toEqual(["a", "d"]);
  });

  it("calculates capacity from trains assigned to the service", () => {
    const operation = calculateOperatingServiceOperation({
      serviceId: "service-a",
      routeLengthKm: 24,
      stopStationIds: stations,
      fleets: [{ sets: 6, capacityPerSet: 900, speedKph: 45 }],
    });
    expect(operation.enabled).toBe(true);
    expect(operation.trainSets).toBe(6);
    expect(operation.headwayMin).toBeGreaterThan(0);
    expect(operation.hourlyCapacity).toBeGreaterThan(0);
  });

  it("does not operate without an assigned train", () => {
    expect(calculateOperatingServiceOperation({
      serviceId: "empty",
      routeLengthKm: 10,
      stopStationIds: ["a", "b"],
      fleets: [],
    }).enabled).toBe(false);
  });
});
