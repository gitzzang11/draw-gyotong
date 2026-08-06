import { worldPopKorea2020, type PopulationCityId, type PopulationGrid } from "./data/worldPopKorea2020";

type PopulationZone = {
  position: [number, number];
  basePotentialDemand: number;
  populationDensityFactor?: number;
  populationDensitySource?: "worldpop-100m-2020";
};

export type PopulationCell = { latitude: number; longitude: number; population: number };
export type GeographicBounds = { north: number; south: number; west: number; east: number };

const cellSize = 1 / 1200;
const decodedGrids = new Map<PopulationCityId, Uint16Array>();

function gridValues(cityId: PopulationCityId) {
  const cached = decodedGrids.get(cityId);
  if (cached) return cached;
  const encoded = atob(worldPopKorea2020[cityId].values);
  const values = new Uint16Array(encoded.length / 2);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = encoded.charCodeAt(index * 2) | (encoded.charCodeAt(index * 2 + 1) << 8);
  }
  decodedGrids.set(cityId, values);
  return values;
}

function gridIndex(grid: PopulationGrid, latitude: number, longitude: number) {
  const column = Math.floor((longitude - grid.west) / cellSize);
  const row = Math.floor((grid.north - latitude) / cellSize);
  return row < 0 || row >= grid.rows || column < 0 || column >= grid.columns ? -1 : row * grid.columns + column;
}

/** Returns the WorldPop estimate for the 100 m cell nearest this location. */
export function getRealPopulationCount(cityId: PopulationCityId, position: [number, number]) {
  const grid = worldPopKorea2020[cityId];
  const index = gridIndex(grid, position[0], position[1]);
  return index < 0 ? 0 : gridValues(cityId)[index];
}

/** Returns populated 100 m cells intersecting a geographic viewport. */
export function getRealPopulationCells(cityId: PopulationCityId, bounds: GeographicBounds): PopulationCell[] {
  const grid = worldPopKorea2020[cityId];
  const values = gridValues(cityId);
  const firstColumn = Math.max(0, Math.floor((bounds.west - grid.west) / cellSize));
  const lastColumn = Math.min(grid.columns - 1, Math.floor((bounds.east - grid.west) / cellSize));
  const firstRow = Math.max(0, Math.floor((grid.north - bounds.north) / cellSize));
  const lastRow = Math.min(grid.rows - 1, Math.floor((grid.north - bounds.south) / cellSize));
  const cells: PopulationCell[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const population = values[row * grid.columns + column];
      if (population > 0) cells.push({
        latitude: grid.north - (row + 0.5) * cellSize,
        longitude: grid.west + (column + 0.5) * cellSize,
        population,
      });
    }
  }
  return cells;
}

function populationInDemandArea(cityId: PopulationCityId, position: [number, number]) {
  const latitudeRadius = 0.005;
  const longitudeRadius = latitudeRadius / Math.max(0.25, Math.cos(position[0] * Math.PI / 180));
  return getRealPopulationCells(cityId, {
    north: position[0] + latitudeRadius,
    south: position[0] - latitudeRadius,
    west: position[1] - longitudeRadius,
    east: position[1] + longitudeRadius,
  }).reduce((total, cell) => total + cell.population, 0);
}

/** Mixes 100 m real-population distribution into the simulation's baseline demand. */
export function applyRealPopulationDensity<T extends PopulationZone>(cityId: PopulationCityId, zones: readonly T[]): T[] {
  const unadjusted = zones.filter((zone) => zone.populationDensitySource !== "worldpop-100m-2020");
  if (unadjusted.length === 0) return [...zones];

  const counts = unadjusted.map((zone) => populationInDemandArea(cityId, zone.position));
  const average = counts.reduce((total, count) => total + count, 0) / Math.max(1, counts.length);
  if (average <= 0) return [...zones];

  let index = 0;
  return zones.map((zone) => {
    if (zone.populationDensitySource === "worldpop-100m-2020") return zone;
    const relativeDensity = counts[index++] / average;
    const factor = 0.4 + 0.6 * Math.min(3, Math.max(0.15, relativeDensity));
    const baselineDemand = zone.populationDensityFactor === undefined
      ? zone.basePotentialDemand
      : zone.basePotentialDemand / zone.populationDensityFactor;
    return {
      ...zone,
      populationDensityFactor: factor,
      populationDensitySource: "worldpop-100m-2020",
      basePotentialDemand: Math.round(baselineDemand * factor),
    };
  });
}
