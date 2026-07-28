export type DestinationStation = {
  id: string;
  demand: number;
  position: [number, number];
  accessibility: number;
  areaFactor?: number;
};

export type DestinationChoice = {
  destinationId: string;
  distanceKm: number;
  band: "near" | "middle" | "far";
  weight: number;
  share: number;
};

export type DestinationSelectionOptions = {
  maxDestinations?: number;
  seed: string;
  distanceKm: (origin: DestinationStation, destination: DestinationStation) => number;
};

function hashUnit(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) + 1) / 4294967297;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

/**
 * Chooses a stable, weighted sample of destinations without creating individual passengers.
 * Exponential distance decay keeps nearby trips common, while the demand exponent preserves
 * a meaningful chance for a distant high-demand centre.
 */
export function selectPassengerDestinations(
  origin: DestinationStation,
  stations: DestinationStation[],
  options: DestinationSelectionOptions,
): DestinationChoice[] {
  const candidates = stations
    .filter((station) => station.id !== origin.id)
    .map((station) => ({ station, distanceKm: Math.max(0.05, options.distanceKm(origin, station)) }));
  if (candidates.length === 0) return [];

  const distances = candidates.map((candidate) => candidate.distanceKm);
  const nearLimit = Math.max(1, percentile(distances, 0.45));
  const middleLimit = Math.max(nearLimit + 0.5, percentile(distances, 0.82));
  const decayScale = Math.max(2.5, percentile(distances, 0.55) * 0.9);

  const rawWeighted = candidates.map(({ station, distanceKm }) => {
    const band: DestinationChoice["band"] = distanceKm <= nearLimit ? "near" : distanceKm <= middleLimit ? "middle" : "far";
    const distanceDecay = 0.14 + 0.86 * Math.exp(-distanceKm / decayScale);
    const centreReach = Math.pow(Math.max(1, station.demand), 0.72);
    const accessibility = Math.max(0.2, station.accessibility);
    const timeAreaFactor = Math.max(0.35, station.areaFactor ?? 1);
    const weight = centreReach * distanceDecay * accessibility * timeAreaFactor;
    return { destinationId: station.id, distanceKm, band, weight };
  });
  const bandTotals = rawWeighted.reduce(
    (totals, candidate) => ({ ...totals, [candidate.band]: totals[candidate.band] + candidate.weight }),
    { near: 0, middle: 0, far: 0 },
  );
  const bandPriors = { near: 0.5, middle: 0.34, far: 0.16 };
  const weighted = rawWeighted.map((candidate) => {
    const weight = candidate.weight * bandPriors[candidate.band] / Math.max(1e-9, bandTotals[candidate.band]);
    const randomRank = -Math.log(Math.max(1e-9, hashUnit(`${options.seed}:${origin.id}:${candidate.destinationId}`))) / Math.max(1e-9, weight);
    return { ...candidate, weight, randomRank };
  });

  const selected = weighted
    .sort((a, b) => a.randomRank - b.randomRank)
    .slice(0, Math.min(options.maxDestinations ?? 8, weighted.length));
  const weightTotal = selected.reduce((sum, candidate) => sum + candidate.weight, 0);
  return selected.map(({ destinationId, distanceKm, band, weight }) => ({
    destinationId,
    distanceKm,
    band,
    weight,
    share: weightTotal > 0 ? weight / weightTotal : 1 / selected.length,
  }));
}

export function summarizeDestinationBands(choices: DestinationChoice[]) {
  const result = { near: 0, middle: 0, far: 0 };
  for (const choice of choices) result[choice.band] += choice.share;
  return result;
}
