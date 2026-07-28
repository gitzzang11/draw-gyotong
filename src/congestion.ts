import type { TransitJourney, TransitServiceKind } from "./transitRouting.ts";

export type CongestionPassengerGroup = {
  activeDemand: number;
  journey?: TransitJourney;
};

export type ServiceCapacity = {
  serviceId: string;
  routeId: string;
  serviceKind: TransitServiceKind;
  hourlyCapacity: number;
  headwayMin?: number;
};

export type SegmentCongestion = {
  key: string;
  routeId: string;
  serviceId: string;
  serviceKind: TransitServiceKind;
  fromStationId: string;
  toStationId: string;
  direction: string;
  timeBand: string;
  passengerDemand: number;
  hourlyCapacity: number;
  crowding: number;
};

export type RouteCongestionSummary = {
  routeId: string;
  passengerDemand: number;
  hourlyCapacity: number;
  peakCrowding: number;
  topSegmentsAverage: number;
  weightedAverage: number;
  representativeCrowding: number;
  busiestSegment?: SegmentCongestion;
};

export function calculateSegmentCongestion(
  groups: CongestionPassengerGroup[],
  capacities: ServiceCapacity[],
  timeBand = "peak",
  peakHourShare = 0.105,
): SegmentCongestion[] {
  const capacityByService = new Map(capacities.map((capacity) => [capacity.serviceId, capacity]));
  const result = new Map<string, SegmentCongestion>();
  for (const group of groups) {
    if (!group.journey) continue;
    const hourlyPassengers = group.activeDemand * peakHourShare;
    for (const leg of group.journey.legs) {
      for (let index = 1; index < leg.stationIds.length; index += 1) {
        const fromStationId = leg.stationIds[index - 1];
        const toStationId = leg.stationIds[index];
        const capacity = capacityByService.get(leg.serviceId);
        const direction = `${fromStationId}>${toStationId}`;
        const key = `${leg.serviceId}:${direction}:${timeBand}`;
        const existing = result.get(key) ?? {
          key,
          routeId: leg.routeId,
          serviceId: leg.serviceId,
          serviceKind: leg.serviceKind,
          fromStationId,
          toStationId,
          direction,
          timeBand,
          passengerDemand: 0,
          hourlyCapacity: capacity?.hourlyCapacity ?? 0,
          crowding: 0,
        };
        existing.passengerDemand += hourlyPassengers;
        result.set(key, existing);
      }
    }
  }
  return [...result.values()].map((segment) => ({
    ...segment,
    passengerDemand: Math.round(segment.passengerDemand),
    crowding: segment.hourlyCapacity > 0 ? segment.passengerDemand / segment.hourlyCapacity : Number.POSITIVE_INFINITY,
  }));
}

export function summarizeRouteCongestion(segments: SegmentCongestion[]): RouteCongestionSummary[] {
  const byRoute = new Map<string, SegmentCongestion[]>();
  for (const segment of segments) {
    const list = byRoute.get(segment.routeId) ?? [];
    list.push(segment);
    byRoute.set(segment.routeId, list);
  }
  return [...byRoute].map(([routeId, routeSegments]) => {
    const sorted = [...routeSegments].sort((a, b) => b.crowding - a.crowding);
    const top = sorted.slice(0, Math.min(3, sorted.length));
    const passengerDemand = routeSegments.reduce((sum, segment) => sum + segment.passengerDemand, 0);
    const weightedAverage =
      passengerDemand > 0
        ? routeSegments.reduce((sum, segment) => sum + segment.crowding * segment.passengerDemand, 0) / passengerDemand
        : 0;
    const topSegmentsAverage = top.length > 0 ? top.reduce((sum, segment) => sum + segment.crowding, 0) / top.length : 0;
    return {
      routeId,
      passengerDemand,
      hourlyCapacity: Math.max(0, ...routeSegments.map((segment) => segment.hourlyCapacity)),
      peakCrowding: sorted[0]?.crowding ?? 0,
      topSegmentsAverage,
      weightedAverage,
      representativeCrowding: topSegmentsAverage * 0.65 + weightedAverage * 0.35,
      busiestSegment: sorted[0],
    };
  });
}
