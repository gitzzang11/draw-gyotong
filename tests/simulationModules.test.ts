import { describe, expect, it } from "vitest";
import { calculateServiceCapacity } from "../src/simulation/capacity";
import { calculateDailyFinance } from "../src/simulation/finance";
import { mergeOdPassengerGroups } from "../src/simulation/passengerAssignment";

describe("extracted simulation modules", () => {
  const base = { trainSets: 4, averageTrainCapacity: 800, routeLengthKm: 20, averageSpeedKph: 40, stopCount: 10 };

  it("raises capacity with more sets or larger trains and stops capacity when closed", () => {
    const original = calculateServiceCapacity(base);
    expect(calculateServiceCapacity({ ...base, trainSets: 8 }).hourlyCapacity).toBeGreaterThan(original.hourlyCapacity);
    expect(calculateServiceCapacity({ ...base, averageTrainCapacity: 1200 }).hourlyCapacity).toBeGreaterThan(original.hourlyCapacity);
    expect(calculateServiceCapacity({ ...base, operational: false }).hourlyCapacity).toBe(0);
  });

  it("merges repeated OD groups", () => {
    expect(mergeOdPassengerGroups([
      { originStationId: "a", destinationStationId: "b", people: 10, activeDemand: 8 },
      { originStationId: "a", destinationStationId: "b", people: 5, activeDemand: 4 },
    ])).toEqual([{ originStationId: "a", destinationStationId: "b", people: 15, activeDemand: 12 }]);
  });

  it("settles finance deterministically", () => {
    expect(calculateDailyFinance({ passengerDemand: 100, fare: 2, maintenance: 60, loanInterest: 10, loanPayment: 20 }))
      .toEqual({ revenue: 200, expenses: 90, netProfit: 110 });
  });
});
