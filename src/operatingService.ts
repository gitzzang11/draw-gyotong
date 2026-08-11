export type StopPreset = "all" | "transfer" | "terminal" | "custom";

export interface OperatingService {
  id: string;
  name: string;
  ownerRouteId: string;
  routeIds: string[];
  branchIds: string[];
  pathOptionId: string;
  pathCoordinates: Array<[number, number]>;
  stationIds: string[];
  stopStationIds: string[];
  preset: StopPreset;
  createdAt: number;
}

export interface OperatingServiceFleet {
  sets: number;
  capacityPerSet: number;
  speedKph: number;
}

export interface OperatingServiceOperation {
  serviceId: string;
  enabled: boolean;
  trainSets: number;
  stopStationIds: string[];
  averageTrainCapacity: number;
  averageSpeedKph: number;
  roundTripMin: number;
  headwayMin: number;
  hourlyCapacity: number;
}

export function applyStopPreset(
  preset: StopPreset,
  stationIds: readonly string[],
  transferStationIds: ReadonlySet<string> = new Set(),
) {
  const ordered = [...new Set(stationIds)];
  if (preset === "custom") return ordered;
  if (ordered.length <= 2 || preset === "all") return ordered;
  const terminals = new Set([ordered[0], ordered[ordered.length - 1]]);
  if (preset === "terminal") return ordered.filter((id) => terminals.has(id));
  return ordered.filter((id) => terminals.has(id) || transferStationIds.has(id));
}

export function normalizeOperatingService(service: OperatingService, validRouteIds: ReadonlySet<string>) {
  const stationIds = [...new Set(service.stationIds)];
  const stationSet = new Set(stationIds);
  const stopStationIds = stationIds.filter((id) => service.stopStationIds.includes(id));
  if (stationIds.length > 0 && !stopStationIds.includes(stationIds[0])) stopStationIds.unshift(stationIds[0]);
  if (stationIds.length > 1 && !stopStationIds.includes(stationIds[stationIds.length - 1])) stopStationIds.push(stationIds[stationIds.length - 1]);
  return {
    ...service,
    routeIds: [...new Set(service.routeIds.filter((id) => validRouteIds.has(id)))],
    branchIds: [...new Set(service.branchIds)],
    stationIds,
    stopStationIds: [...new Set(stopStationIds)].filter((id) => stationSet.has(id)),
    pathCoordinates: service.pathCoordinates.filter(
      (point): point is [number, number] => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]),
    ),
  };
}

export function calculateOperatingServiceOperation(input: {
  serviceId: string;
  routeLengthKm: number;
  stopStationIds: readonly string[];
  fleets: readonly OperatingServiceFleet[];
}): OperatingServiceOperation {
  const trainSets = input.fleets.reduce((sum, fleet) => sum + Math.max(0, Math.round(fleet.sets)), 0);
  const totalCapacity = input.fleets.reduce(
    (sum, fleet) => sum + Math.max(0, fleet.capacityPerSet) * Math.max(0, Math.round(fleet.sets)),
    0,
  );
  const averageTrainCapacity = trainSets > 0 ? totalCapacity / trainSets : 0;
  const averageSpeedKph = trainSets > 0
    ? input.fleets.reduce((sum, fleet) => sum + Math.max(1, fleet.speedKph) * Math.max(0, Math.round(fleet.sets)), 0) / trainSets
    : 0;
  const enabled = trainSets > 0 && input.stopStationIds.length >= 2 && input.routeLengthKm > 0;
  const roundTripMin = enabled
    ? Math.max(8, (input.routeLengthKm / Math.max(1, averageSpeedKph)) * 120 + input.stopStationIds.length * 0.9)
    : 0;
  const headwayMin = enabled ? Math.round((roundTripMin / trainSets) * 10) / 10 : 0;
  return {
    serviceId: input.serviceId,
    enabled,
    trainSets,
    stopStationIds: [...input.stopStationIds],
    averageTrainCapacity,
    averageSpeedKph,
    roundTripMin,
    headwayMin,
    hourlyCapacity: headwayMin > 0 ? Math.round((60 / headwayMin) * averageTrainCapacity) : 0,
  };
}
