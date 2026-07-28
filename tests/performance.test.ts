import { describe, expect, it } from "vitest";
import { runLongSimulation } from "../src/simulation/longRunSimulation";

describe("simulation scale measurements", () => {
  it.each([20, 75, 150, 300])("measures %i stations without render work", (stationCount) => {
    const start = performance.now();
    const result = runLongSimulation({ days: 100, stationCount });
    const elapsedMs = performance.now() - start;
    console.info(`[performance] stations=${stationCount} demand-100-days=${elapsedMs.toFixed(2)}ms`);
    expect(result.demand).toHaveLength(stationCount);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
