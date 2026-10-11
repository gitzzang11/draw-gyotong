import {
  calculateSegmentCongestion,
  summarizeRouteCongestion,
  type RouteCongestionSummary,
  type SegmentCongestion,
  type ServiceCapacity,
} from "./congestion.ts";
import type { TransitJourney } from "./transitRouting.ts";

export type ForecastPassengerGroup = {
  activeDemand: number;
  transferResistance: number;
  journey?: TransitJourney;
};

export type OperatingForecastInput = {
  groups: ForecastPassengerGroup[];
  capacities: ServiceCapacity[];
  fare: number;
  maintenance: number;
  loanInterest: number;
  loanPayment: number;
  timeBand: string;
  hourlyDemandShare: number;
  fallbackSatisfaction?: number;
};

export type OperatingForecast = {
  crowding: number;
  waitMin: number;
  satisfaction: number;
  demand: number;
  revenue: number;
  expenses: number;
  netProfit: number;
  segmentCongestion: SegmentCongestion[];
  routeSummaries: RouteCongestionSummary[];
  groupMetrics: Array<{ crowding: number; waitMin: number; satisfaction: number }>;
};

export function calculatePassengerSatisfaction(
  waitMin: number,
  crowding: number,
  transferResistance: number,
  fare: number,
) {
  const farePenalty = Math.max(0, (fare - 1450) / 55);
  const score = 100 - waitMin * 1.8 - Math.max(0, crowding - 0.75) * 34 - transferResistance * 0.24 - farePenalty;
  return Math.max(5, Math.min(100, Math.round(score)));
}

function groupCrowding(group: ForecastPassengerGroup, segments: SegmentCongestion[]) {
  if (!group.journey) return 0;
  const values: number[] = [];
  for (const leg of group.journey.legs) {
    for (let index = 1; index < leg.stationIds.length; index += 1) {
      const from = leg.stationIds[index - 1];
      const to = leg.stationIds[index];
      const segment = segments.find(
        (candidate) =>
          candidate.serviceId === leg.serviceId &&
          candidate.fromStationId === from &&
          candidate.toStationId === to,
      );
      if (segment) values.push(segment.crowding);
    }
  }
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function groupWait(group: ForecastPassengerGroup, capacities: Map<string, ServiceCapacity>) {
  if (!group.journey) return 0;
  return group.journey.legs.reduce((sum, leg) => {
    const headway = capacities.get(leg.serviceId)?.headwayMin;
    return sum + Math.max(0.5, (headway ?? Math.max(1, leg.waitTimeMin * 2)) / 2);
  }, 0);
}

/**
 * Shared, side-effect-free calculation used by both live operating forecasts and day settlement.
 * Demand growth, cash and statistics are deliberately outside this function.
 */
export function calculateOperatingForecast(input: OperatingForecastInput): OperatingForecast {
  const segmentCongestion = calculateSegmentCongestion(
    input.groups,
    input.capacities,
    input.timeBand,
    input.hourlyDemandShare,
  );
  const routeSummaries = summarizeRouteCongestion(segmentCongestion);
  const capacityByService = new Map(input.capacities.map((capacity) => [capacity.serviceId, capacity]));
  const demand = input.groups.reduce((sum, group) => sum + group.activeDemand, 0);
  let weightedCrowding = 0;
  let weightedWait = 0;
  let weightedSatisfaction = 0;
  const groupMetrics: OperatingForecast["groupMetrics"] = [];
  for (const group of input.groups) {
    const crowding = groupCrowding(group, segmentCongestion);
    const waitMin = groupWait(group, capacityByService);
    const satisfaction = calculatePassengerSatisfaction(waitMin, crowding, group.transferResistance, input.fare);
    weightedCrowding += crowding * group.activeDemand;
    weightedWait += waitMin * group.activeDemand;
    weightedSatisfaction += satisfaction * group.activeDemand;
    groupMetrics.push({ crowding, waitMin, satisfaction });
  }
  const crowding = demand > 0 ? weightedCrowding / demand : 0;
  const waitMin = demand > 0 ? weightedWait / demand : 0;
  const satisfaction = demand > 0
    ? Math.round(weightedSatisfaction / demand)
    : Math.round(input.fallbackSatisfaction ?? 75);
  // 운임 수입(억)은 0.01억(100만 원) 단위. 1억 단위로 반올림하면 작은 노선망의 수입이 0 또는 1억으로 뭉개진다.
  const calculatedRevenue = Math.round((demand * input.fare) / 1000000) / 100;
  const revenue = demand > 0 ? Math.max(0.01, calculatedRevenue) : 0;
  const expenses = Math.round(input.maintenance + input.loanInterest + input.loanPayment);
  return {
    crowding,
    waitMin,
    satisfaction,
    demand,
    revenue,
    expenses,
    netProfit: revenue - expenses,
    segmentCongestion,
    routeSummaries,
    groupMetrics,
  };
}
