export type ExpressServiceKind = "local" | "express";

export type ServiceFleet = {
  sets: number;
  capacityPerSet: number;
  speedKph: number;
  serviceKind?: ExpressServiceKind;
  trainType?: string;
};

export type ServicePatternInput = {
  kind: ExpressServiceKind;
  enabled: boolean;
  routeLengthKm: number;
  routeStationIds: string[];
  stopStationIds?: string[];
  fleets: ServiceFleet[];
  servicePathCount?: number;
  dispatchShare?: number;
  interferenceFactor?: number;
};

export type ServiceOperation = {
  kind: ExpressServiceKind;
  enabled: boolean;
  stopStationIds: string[];
  trainSets: number;
  averageTrainCapacity: number;
  averageSpeedKph: number;
  roundTripMin: number;
  headwayMin: number;
  hourlyCapacity: number;
  interferencePenaltyMin: number;
};

const DEFAULT_EXPRESS_SHARE = 0.3;
const MIN_STOPS = 2;
const DWELL_MIN = 0.45;

function finite(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? value! : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Keeps configured express stops in route order and always includes both
 * terminals. This makes old saves safe when stations were deleted or moved.
 */
export function normalizeServiceStops(routeStationIds: readonly string[], configuredStopIds: readonly string[] = []) {
  const routeIds = [...new Set(routeStationIds)];
  if (routeIds.length <= MIN_STOPS) return routeIds;
  const configured = new Set(configuredStopIds.filter((id) => routeIds.includes(id)));
  configured.add(routeIds[0]);
  configured.add(routeIds[routeIds.length - 1]);
  return routeIds.filter((id) => configured.has(id));
}

export function serviceKindForFleet(fleet: ServiceFleet): ExpressServiceKind {
  return fleet.serviceKind ?? (fleet.trainType === "express" ? "express" : "local");
}

function splitFleetSets(fleets: ServiceFleet[], reservedSets: number) {
  let remaining = Math.max(0, Math.round(reservedSets));
  return fleets.flatMap((fleet) => {
    if (remaining <= 0) return [];
    const sets = Math.min(Math.max(0, Math.round(fleet.sets)), remaining);
    remaining -= sets;
    return sets > 0 ? [{ ...fleet, sets }] : [];
  });
}

function partitionFleets(input: Omit<ServicePatternInput, "kind" | "enabled"> & {
  expressEnabled?: boolean;
  localEnabled?: boolean;
}) {
  const expressFleets = input.fleets.filter((fleet) => serviceKindForFleet(fleet) === "express");
  const localFleets = input.fleets.filter((fleet) => serviceKindForFleet(fleet) === "local");
  if (expressFleets.length > 0 || input.expressEnabled !== true) {
    return { local: localFleets, express: expressFleets };
  }

  // Backward-compatible behavior for old saves: if no express-specific set
  // exists, reserve a share of the common fleet for express service. The
  // remainder stays local, so capacity is never counted twice.
  const share = input.localEnabled === false ? 1 : clamp(finite(input.dispatchShare, DEFAULT_EXPRESS_SHARE), 0, 1);
  const totalSets = localFleets.reduce((sum, fleet) => sum + Math.max(0, Math.round(fleet.sets)), 0);
  const reservedSets = Math.min(totalSets, Math.max(0, Math.round(totalSets * share)));
  return {
    express: splitFleetSets(localFleets, reservedSets),
    local: splitFleetSets(localFleets, Math.max(0, totalSets - reservedSets)),
  };
}

function calculateOperation(input: ServicePatternInput, fleets: ServiceFleet[], stopStationIds: string[]): ServiceOperation {
  const trainSets = fleets.reduce((sum, fleet) => sum + Math.max(0, Math.round(fleet.sets)), 0);
  const totalCapacity = fleets.reduce((sum, fleet) => sum + Math.max(0, fleet.capacityPerSet) * Math.max(0, fleet.sets), 0);
  const averageTrainCapacity = trainSets > 0 ? totalCapacity / trainSets : 0;
  const averageSpeedKph = trainSets > 0
    ? fleets.reduce((sum, fleet) => sum + Math.max(1, fleet.speedKph) * Math.max(0, fleet.sets), 0) / trainSets
    : 0;
  const enabled = input.enabled && trainSets > 0 && stopStationIds.length >= MIN_STOPS;
  if (!enabled) {
    return {
      kind: input.kind,
      enabled: false,
      stopStationIds,
      trainSets,
      averageTrainCapacity,
      averageSpeedKph,
      roundTripMin: 0,
      headwayMin: 0,
      hourlyCapacity: 0,
      interferencePenaltyMin: 0,
    };
  }

  const stopCount = Math.max(MIN_STOPS, stopStationIds.length);
  const baseRoundTripMin = Math.max(
    8,
    (Math.max(0, input.routeLengthKm) / Math.max(1, averageSpeedKph)) * 120 + stopCount * DWELL_MIN * 2,
  );
  const branchPenalty = 1 + Math.max(0, (input.servicePathCount ?? 1) - 1) * 0.55;
  const interferencePenaltyMin = input.kind === "express"
    ? Math.max(0, finite(input.interferenceFactor, 0)) * baseRoundTripMin
    : 0;
  const roundTripMin = baseRoundTripMin * branchPenalty + interferencePenaltyMin;
  const headwayMin = Math.round((roundTripMin / Math.max(1, trainSets)) * 10) / 10;
  const hourlyCapacity = headwayMin > 0 ? Math.round((60 / headwayMin) * averageTrainCapacity) : 0;
  return {
    kind: input.kind,
    enabled: true,
    stopStationIds,
    trainSets,
    averageTrainCapacity,
    averageSpeedKph,
    roundTripMin,
    headwayMin,
    hourlyCapacity,
    interferencePenaltyMin,
  };
}

/**
 * Calculates each service independently. Express no longer changes the
 * local service's stop count or speed, and adding express sets consumes fleet
 * capacity instead of creating capacity from a fixed percentage alone.
 */
export function calculateServiceOperations(input: Omit<ServicePatternInput, "kind" | "enabled"> & {
  expressEnabled?: boolean;
  localEnabled?: boolean;
  expressStopStationIds?: string[];
}) {
  const routeStops = normalizeServiceStops(input.routeStationIds, input.routeStationIds);
  const expressStops = normalizeServiceStops(input.routeStationIds, input.expressStopStationIds ?? []);
  const fleets = partitionFleets(input);
  const local = calculateOperation(
    { ...input, kind: "local", enabled: input.localEnabled !== false },
    fleets.local,
    routeStops,
  );
  const express = calculateOperation(
    {
      ...input,
      kind: "express",
      enabled: input.expressEnabled === true,
    },
    fleets.express,
    expressStops,
  );
  return { local, express };
}

export function totalServiceCapacity(operations: readonly ServiceOperation[]) {
  return operations.reduce((sum, operation) => sum + operation.hourlyCapacity, 0);
}
