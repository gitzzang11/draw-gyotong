export interface CapacityInput {
  trainSets: number;
  averageTrainCapacity: number;
  routeLengthKm: number;
  averageSpeedKph: number;
  stopCount: number;
  servicePathCount?: number;
  operational?: boolean;
}

export function calculateServiceCapacity(input: CapacityInput) {
  if (input.operational === false || input.trainSets <= 0 || input.averageTrainCapacity <= 0) {
    return { roundTripMin: 0, headwayMin: 0, hourlyCapacity: 0 };
  }
  const dwellMin = Math.max(1, Math.max(2, input.stopCount) * 0.45);
  const roundTripMin = Math.max(8, (Math.max(0, input.routeLengthKm) / Math.max(1, input.averageSpeedKph)) * 120 + dwellMin * 2);
  const branchPenalty = 1 + Math.max(0, (input.servicePathCount ?? 1) - 1) * 0.55;
  const headwayMin = Math.round(((roundTripMin / input.trainSets) * branchPenalty) * 10) / 10;
  const hourlyCapacity = headwayMin > 0 ? Math.round((60 / headwayMin) * input.averageTrainCapacity) : 0;
  return { roundTripMin, headwayMin, hourlyCapacity };
}
