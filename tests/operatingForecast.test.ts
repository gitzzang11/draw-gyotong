import { describe, expect, it } from "vitest";
import { calculateOperatingForecast } from "../src/operatingForecast.ts";
import type { TransitJourney } from "../src/transitRouting.ts";

const journey: TransitJourney = {
  originStationId: "a",
  destinationStationId: "b",
  routeIds: ["r"],
  serviceIds: ["r:local"],
  stationIds: ["a", "b"],
  segmentIds: ["r:local:p:a>b"],
  transferStationIds: [],
  transferCount: 0,
  rideTimeMin: 8,
  waitTimeMin: 3,
  transferTimeMin: 0,
  totalTimeMin: 11,
  totalCost: 11,
  legs: [{
    serviceId: "r:local", routeId: "r", serviceKind: "local",
    fromStationId: "a", toStationId: "b",
    stationIds: ["a", "b"], segmentIds: ["r:local:p:a>b"],
    rideTimeMin: 8, waitTimeMin: 3, crowdingPenaltyMin: 0, distanceKm: 4,
  }],
};

describe("shared operating forecast", () => {
  it("is deterministic and does not mutate simulation inputs", () => {
    const input = {
      groups: [{ activeDemand: 1000, transferResistance: 0, journey }],
      capacities: [{ serviceId: "r:local", routeId: "r", serviceKind: "local" as const, hourlyCapacity: 80, headwayMin: 6 }],
      fare: 1450,
      maintenance: 20,
      loanInterest: 3,
      loanPayment: 2,
      timeBand: "08",
      hourlyDemandShare: 0.1,
      fallbackSatisfaction: 75,
    };
    const before = structuredClone(input);
    expect(calculateOperatingForecast(input)).toEqual(calculateOperatingForecast(input));
    expect(input).toEqual(before);
  });

  it("uses the same result shape for forecast and settlement and responds to capacity", () => {
    const baseInput = {
      groups: [{ activeDemand: 1000, transferResistance: 0, journey }],
      fare: 1450,
      maintenance: 20,
      loanInterest: 3,
      loanPayment: 2,
      timeBand: "08",
      hourlyDemandShare: 0.1,
    };
    const current = calculateOperatingForecast({
      ...baseInput,
      capacities: [{ serviceId: "r:local", routeId: "r", serviceKind: "local", hourlyCapacity: 80, headwayMin: 6 }],
    });
    const expanded = calculateOperatingForecast({
      ...baseInput,
      maintenance: 24,
      capacities: [{ serviceId: "r:local", routeId: "r", serviceKind: "local", hourlyCapacity: 160, headwayMin: 3 }],
    });
    expect(expanded.crowding).toBeLessThan(current.crowding);
    expect(expanded.waitMin).toBeLessThan(current.waitMin);
    expect(expanded.satisfaction).toBeGreaterThanOrEqual(current.satisfaction);
    expect(current.netProfit).toBe(current.revenue - current.expenses);
  });
});
