import { describe, expect, it } from "vitest";
import { runLongSimulation } from "../src/simulation/longRunSimulation";

describe("renderless long-running simulation", () => {
  it.each([100, 500, 1_000])("remains bounded and finite for %i game days", (days) => {
    const result = runLongSimulation({ days, stationCount: 20 });
    expect(Number.isFinite(result.cash)).toBe(true);
    expect(result.demand.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(new Set(result.demand).size).toBeGreaterThan(5);
    expect(result.passengerGroupCount).toBeLessThanOrEqual(160);
    expect(result.routeCacheSize).toBeLessThanOrEqual(400);
    expect(result.newsCount).toBeLessThanOrEqual(80);
    expect(result.serializedBytes).toBeLessThan(100_000);
  });

  it("produces the same result regardless of ticks per game day", () => {
    expect(runLongSimulation({ days: 500, stepsPerDay: 1 })).toEqual(
      runLongSimulation({ days: 500, stepsPerDay: 20 }),
    );
  });
});
