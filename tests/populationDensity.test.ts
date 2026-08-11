import { describe, expect, it } from "vitest";
import { worldPopKorea2020 } from "../src/data/worldPopKorea2020";
import { applyRealPopulationDensity, getRealPopulationCells, getRealPopulationCount } from "../src/populationDensity";

const boundsFor = (city: keyof typeof worldPopKorea2020) => {
  const grid = worldPopKorea2020[city];
  return {
    north: grid.north,
    south: grid.north - grid.rows / 1200,
    west: grid.west,
    east: grid.west + grid.columns / 1200,
  };
};

describe("real population-density demand adjustment", () => {
  it("covers each city's full playable map", () => {
    const playableBounds = {
      seoul: { north: 37.76, south: 37.38, west: 126.65, east: 127.3 },
      busan: { north: 35.42, south: 34.98, west: 128.72, east: 129.35 },
      daejeon: { north: 36.55, south: 36.17, west: 127.2, east: 127.62 },
      gwangju: { north: 35.32, south: 35.02, west: 126.62, east: 127.1 },
    } as const;

    for (const city of Object.keys(playableBounds) as Array<keyof typeof playableBounds>) {
      const gridBounds = boundsFor(city);
      const mapBounds = playableBounds[city];
      const cellRoundingTolerance = 1e-9;
      expect(gridBounds.north + cellRoundingTolerance).toBeGreaterThanOrEqual(mapBounds.north);
      expect(gridBounds.south - cellRoundingTolerance).toBeLessThanOrEqual(mapBounds.south);
      expect(gridBounds.west - cellRoundingTolerance).toBeLessThanOrEqual(mapBounds.west);
      expect(gridBounds.east + cellRoundingTolerance).toBeGreaterThanOrEqual(mapBounds.east);
    }
  });

  it("uses bundled WorldPop grid counts for a city location", () => {
    const sample = getRealPopulationCells("seoul", boundsFor("seoul"))[0];
    expect(getRealPopulationCount("seoul", [sample.latitude, sample.longitude])).toBe(sample.population);
  });

  it("raises baseline demand in relatively denser real-population cells", () => {
    const samples = getRealPopulationCells("seoul", boundsFor("seoul")).sort((left, right) => left.population - right.population);
    const sparse = samples[0];
    const dense = samples.at(-1)!;
    const zones = [
      { position: [sparse.latitude, sparse.longitude] as [number, number], basePotentialDemand: 1_000 },
      { position: [dense.latitude, dense.longitude] as [number, number], basePotentialDemand: 1_000 },
    ];

    const adjusted = applyRealPopulationDensity("seoul", zones);
    expect(adjusted[0].populationDensityFactor).toBeDefined();
    expect(adjusted[1].basePotentialDemand).toBeGreaterThan(adjusted[0].basePotentialDemand);
  });

  it("aggregates the same 100 m source into coarser zoom levels", () => {
    const cells = getRealPopulationCells("daejeon", boundsFor("daejeon"));
    const kilometerCells = getRealPopulationCells("daejeon", boundsFor("daejeon"), 1000);
    expect(kilometerCells.length).toBeLessThan(cells.length);
    expect(kilometerCells.reduce((total, cell) => total + cell.population, 0))
      .toBe(cells.reduce((total, cell) => total + cell.population, 0));
  });

  it("does not apply the population adjustment twice to saved demand zones", () => {
    const sample = getRealPopulationCells("busan", boundsFor("busan"))[0];
    const zone = {
      position: [sample.latitude, sample.longitude] as [number, number],
      basePotentialDemand: 1_250,
      populationDensityFactor: 1.25,
      populationDensitySource: "worldpop-100m-2020" as const,
    };
    expect(applyRealPopulationDensity("busan", [zone])[0]).toEqual(zone);
  });
});
