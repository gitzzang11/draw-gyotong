export type AreaProfile =
  | "residential"
  | "business"
  | "commercial"
  | "education"
  | "tourism"
  | "mixed";

export type DemandPeriod = "morning-peak" | "daytime" | "evening-peak" | "night";
export type DemandTrend = "rising" | "stable" | "falling";

export interface DemandBalance {
  catchmentRadiusM: number;
  catchmentDecayM: number;
  minimumCatchmentWeight: number;
  initialCaptureRate: number;
  minimumCaptureRate: number;
  maximumCaptureRate: number;
  adaptationSpeed: number;
  weights: {
    accessibility: number;
    frequency: number;
    travelTime: number;
    transfer: number;
    crowding: number;
    fare: number;
    reliability: number;
    satisfaction: number;
  };
}

export const demandBalance: DemandBalance = {
  catchmentRadiusM: 1_200,
  catchmentDecayM: 430,
  minimumCatchmentWeight: 0.025,
  initialCaptureRate: 0.46,
  minimumCaptureRate: 0,
  maximumCaptureRate: 0.92,
  adaptationSpeed: 0.18,
  weights: {
    accessibility: 0.2,
    frequency: 0.15,
    travelTime: 0.12,
    transfer: 0.1,
    crowding: 0.14,
    fare: 0.09,
    reliability: 0.1,
    satisfaction: 0.1,
  },
};

export interface DemandZone {
  id: string;
  position: [number, number];
  basePotentialDemand: number;
  /** Real-population adjustment applied to the game's base demand. */
  populationDensityFactor?: number;
  populationDensitySource?: "worldpop-100m-2020";
  areaProfile: AreaProfile;
  permanentPotentialDelta: number;
  appliedPermanentEventIds: string[];
}

export interface StationDemandState {
  stationId: string;
  potentialDemand: number;
  realizedDemand: number;
  previousRealizedDemand: number;
  transitCaptureRate: number;
  targetCaptureRate: number;
  areaProfile: AreaProfile;
  catchmentWeight: number;
  hourlyProfile: Record<DemandPeriod, number>;
  trend: DemandTrend;
  lastUpdatedGameDay: number;
  positiveReasons: string[];
  negativeReasons: string[];
}

export interface DemandStationInput {
  id: string;
  position: [number, number];
  operational: boolean;
  legacyDemand?: number;
}

export interface DemandAttractiveness {
  accessibilityScore: number;
  frequencyScore: number;
  travelTimeScore: number;
  transferScore: number;
  crowdingScore: number;
  fareScore: number;
  reliabilityScore: number;
  satisfactionScore: number;
  totalScore: number;
}

export interface DemandServiceFactors {
  hasAccessibleStation: boolean;
  reachableDestinationShare: number;
  averageWaitMin: number;
  averageTravelTimeMin: number;
  averageTransfers: number;
  transferResistance: number;
  crowding: number;
  fare: number;
  reliability: number;
  satisfaction: number;
  expressTimeSaving?: number;
  serviceAvailable?: boolean;
}

export interface DemandEvent {
  id: string;
  kind: "temporary" | "permanent";
  zoneIds?: string[];
  position?: [number, number];
  radiusM?: number;
  periods?: DemandPeriod[];
  multiplier?: number;
  potentialDelta?: number;
  startsOnDay: number;
  endsOnDay?: number;
}

export interface CatchmentAllocation {
  stationPotential: Map<string, number>;
  stationCatchmentWeight: Map<string, number>;
  stationAreaProfile: Map<string, AreaProfile>;
  zoneShares: Map<string, Map<string, number>>;
  allocatedPotential: number;
}

const profiles: AreaProfile[] = ["residential", "business", "commercial", "education", "tourism", "mixed"];

const hourlyProfiles: Record<AreaProfile, Record<DemandPeriod, number>> = {
  residential: { "morning-peak": 1.42, daytime: 0.78, "evening-peak": 1.12, night: 0.34 },
  business: { "morning-peak": 1.35, daytime: 1.02, "evening-peak": 1.3, night: 0.28 },
  commercial: { "morning-peak": 0.82, daytime: 1.28, "evening-peak": 1.36, night: 0.48 },
  education: { "morning-peak": 1.44, daytime: 1.08, "evening-peak": 0.92, night: 0.24 },
  tourism: { "morning-peak": 0.78, daytime: 1.42, "evening-peak": 1.18, night: 0.46 },
  mixed: { "morning-peak": 1.12, daytime: 1.02, "evening-peak": 1.12, night: 0.38 },
};

export function getDemandPeriod(minutes: number): DemandPeriod {
  const hour = ((Math.floor(minutes / 60) % 24) + 24) % 24;
  if (hour >= 7 && hour < 10) return "morning-peak";
  if (hour >= 10 && hour < 17) return "daytime";
  if (hour >= 17 && hour < 20) return "evening-peak";
  return "night";
}

export function getAreaPeriodMultiplier(profile: AreaProfile, period: DemandPeriod) {
  return hourlyProfiles[profile][period];
}

export function getDestinationPeriodMultiplier(
  profile: AreaProfile,
  period: DemandPeriod,
) {
  if (period === "morning-peak") {
    if (profile === "business" || profile === "education") return 1.45;
    if (profile === "residential") return 0.72;
  }
  if (period === "evening-peak") {
    if (profile === "residential") return 1.42;
    if (profile === "business" || profile === "education") return 0.86;
  }
  return getAreaPeriodMultiplier(profile, period);
}

export function inferAreaProfile(seed: string, position?: [number, number]): AreaProfile {
  const coordinateSeed = position ? `${position[0].toFixed(3)}:${position[1].toFixed(3)}` : "";
  let hash = 2166136261;
  for (const char of `${seed}:${coordinateSeed}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return profiles[(hash >>> 0) % profiles.length];
}

export function distanceMeters(a: [number, number], b: [number, number]) {
  const radians = Math.PI / 180;
  const latitude1 = a[0] * radians;
  const latitude2 = b[0] * radians;
  const latitudeDelta = (b[0] - a[0]) * radians;
  const longitudeDelta = (b[1] - a[1]) * radians;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function finiteNonNegative(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function createLegacyDemandZones(
  stations: DemandStationInput[],
  existing: DemandZone[] = [],
  balance: DemandBalance = demandBalance,
) {
  const zones = existing.map(normalizeDemandZone);
  for (const station of stations) {
    if (zones.some((zone) => distanceMeters(zone.position, station.position) <= balance.catchmentDecayM * 0.72)) continue;
    const legacy = finiteNonNegative(station.legacyDemand ?? 0);
    zones.push({
      id: `demand-zone:${station.id}`,
      position: station.position,
      basePotentialDemand: Math.max(1_200, Math.round(legacy / balance.initialCaptureRate)),
      areaProfile: inferAreaProfile(station.id, station.position),
      permanentPotentialDelta: 0,
      appliedPermanentEventIds: [],
    });
  }
  return zones;
}

/**
 * Creates a fixed, deterministic regional demand surface for a new city.
 * It is independent of station construction and never grows during operation.
 */
export function createRegionalDemandGrid(
  center: [number, number],
  citySeed: string,
  demandMultiplier = 1,
  rings = 10,
  spacingM = 1_000,
) {
  const zones: DemandZone[] = [];
  const latitudeStep = spacingM / 111_320;
  const longitudeStep = spacingM / (111_320 * Math.max(0.25, Math.cos(center[0] * Math.PI / 180)));
  for (let row = -rings; row <= rings; row += 1) {
    for (let column = -rings; column <= rings; column += 1) {
      const position: [number, number] = [
        center[0] + row * latitudeStep,
        center[1] + column * longitudeStep,
      ];
      const id = `demand-zone:${citySeed}:${row}:${column}`;
      const radial = Math.sqrt(row ** 2 + column ** 2) / Math.max(1, rings);
      let hash = 2166136261;
      for (const char of id) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      const localVariation = 0.72 + ((hash >>> 0) % 570) / 1_000;
      const centrality = Math.max(0.42, 1.28 - radial * 0.58);
      zones.push({
        id,
        position,
        basePotentialDemand: Math.round(8_200 * Math.max(0.1, demandMultiplier) * centrality * localVariation),
        areaProfile: inferAreaProfile(id, position),
        permanentPotentialDelta: 0,
        appliedPermanentEventIds: [],
      });
    }
  }
  return zones;
}

export function normalizeDemandZone(zone: DemandZone): DemandZone {
  return {
    ...zone,
    basePotentialDemand: finiteNonNegative(zone.basePotentialDemand),
    populationDensityFactor: zone.populationDensityFactor === undefined
      ? undefined
      : finiteNonNegative(zone.populationDensityFactor),
    populationDensitySource: zone.populationDensitySource === "worldpop-100m-2020"
      ? zone.populationDensitySource
      : undefined,
    permanentPotentialDelta: finiteNonNegative(zone.permanentPotentialDelta),
    areaProfile: profiles.includes(zone.areaProfile) ? zone.areaProfile : "mixed",
    appliedPermanentEventIds: Array.isArray(zone.appliedPermanentEventIds)
      ? Array.from(new Set(zone.appliedPermanentEventIds))
      : [],
  };
}

function eventTargetsZone(event: DemandEvent, zone: DemandZone) {
  if (event.zoneIds?.includes(zone.id)) return true;
  if (event.position) return distanceMeters(event.position, zone.position) <= (event.radiusM ?? 1_200);
  return !event.zoneIds;
}

export function applyPermanentDemandEvents(zones: DemandZone[], events: DemandEvent[]) {
  return zones.map((source) => {
    let zone = normalizeDemandZone(source);
    for (const event of events) {
      if (event.kind !== "permanent" || zone.appliedPermanentEventIds.includes(event.id) || !eventTargetsZone(event, zone)) continue;
      const base = zone.basePotentialDemand + zone.permanentPotentialDelta;
      const delta = finiteNonNegative(event.potentialDelta ?? base * Math.max(0, (event.multiplier ?? 1) - 1));
      zone = {
        ...zone,
        permanentPotentialDelta: zone.permanentPotentialDelta + delta,
        appliedPermanentEventIds: [...zone.appliedPermanentEventIds, event.id],
      };
    }
    return zone;
  });
}

export function effectiveZonePotential(
  zone: DemandZone,
  day: number,
  period: DemandPeriod,
  events: DemandEvent[] = [],
) {
  let value = finiteNonNegative(zone.basePotentialDemand) + finiteNonNegative(zone.permanentPotentialDelta);
  for (const event of events) {
    if (
      event.kind !== "temporary" ||
      day < event.startsOnDay ||
      day > (event.endsOnDay ?? event.startsOnDay) ||
      (event.periods && !event.periods.includes(period)) ||
      !eventTargetsZone(event, zone)
    ) continue;
    value *= finiteNonNegative(event.multiplier ?? 1, 1);
    value += finiteNonNegative(event.potentialDelta ?? 0);
  }
  return Math.round(finiteNonNegative(value));
}

export function allocateCatchmentDemand(
  zones: DemandZone[],
  stations: DemandStationInput[],
  day: number,
  period: DemandPeriod,
  events: DemandEvent[] = [],
  balance: DemandBalance = demandBalance,
): CatchmentAllocation {
  const stationPotential = new Map(stations.map((station) => [station.id, 0]));
  const weightedCatchment = new Map(stations.map((station) => [station.id, 0]));
  const profileWeights = new Map<string, Map<AreaProfile, number>>();
  const zoneShares = new Map<string, Map<string, number>>();
  let allocatedPotential = 0;
  for (const zoneSource of zones) {
    const zone = normalizeDemandZone(zoneSource);
    const candidates = stations
      .filter((station) => station.operational)
      .map((station) => {
        const distance = distanceMeters(zone.position, station.position);
        const weight = distance > balance.catchmentRadiusM
          ? 0
          : Math.exp(-distance / Math.max(1, balance.catchmentDecayM));
        return { station, weight: weight < balance.minimumCatchmentWeight ? 0 : weight };
      })
      .filter((candidate) => candidate.weight > 0);
    const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (totalWeight <= 0) continue;
    // Station potential is a daily regional baseline. Period multipliers are
    // applied when OD groups are generated, not persisted into this value.
    const potential = effectiveZonePotential(zone, day, period, events);
    const shares = new Map<string, number>();
    for (const candidate of candidates) {
      const share = candidate.weight / totalWeight;
      const allocation = potential * share;
      shares.set(candidate.station.id, share);
      stationPotential.set(candidate.station.id, (stationPotential.get(candidate.station.id) ?? 0) + allocation);
      weightedCatchment.set(candidate.station.id, (weightedCatchment.get(candidate.station.id) ?? 0) + candidate.weight);
      const stationProfiles = profileWeights.get(candidate.station.id) ?? new Map<AreaProfile, number>();
      stationProfiles.set(zone.areaProfile, (stationProfiles.get(zone.areaProfile) ?? 0) + allocation);
      profileWeights.set(candidate.station.id, stationProfiles);
    }
    zoneShares.set(zone.id, shares);
    allocatedPotential += potential;
  }
  const stationAreaProfile = new Map<string, AreaProfile>();
  for (const station of stations) {
    const best = [...(profileWeights.get(station.id) ?? new Map()).entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? inferAreaProfile(station.id, station.position);
    stationAreaProfile.set(station.id, best);
    stationPotential.set(station.id, Math.round(finiteNonNegative(stationPotential.get(station.id) ?? 0)));
  }
  return {
    stationPotential,
    stationCatchmentWeight: weightedCatchment,
    stationAreaProfile,
    zoneShares,
    allocatedPotential: Math.round(allocatedPotential),
  };
}

export function calculateDemandAttractiveness(
  factors: DemandServiceFactors,
  balance: DemandBalance = demandBalance,
): DemandAttractiveness {
  const available = factors.serviceAvailable !== false && factors.hasAccessibleStation;
  const accessibilityScore = available ? clamp(factors.reachableDestinationShare) : 0;
  const frequencyScore = available ? clamp(1 - (finiteNonNegative(factors.averageWaitMin) - 2) / 20) : 0;
  const travelTimeScore = available
    ? clamp(1 - (finiteNonNegative(factors.averageTravelTimeMin) - 12) / 95 + finiteNonNegative(factors.expressTimeSaving ?? 0) * 0.18)
    : 0;
  const transferScore = available
    ? clamp(1 - finiteNonNegative(factors.averageTransfers) * 0.18 - finiteNonNegative(factors.transferResistance) / 220)
    : 0;
  const crowdingScore = available ? clamp(1 - Math.max(0, finiteNonNegative(factors.crowding) - 0.72) / 1.35) : 0;
  const fareScore = available ? clamp(1 - Math.max(0, finiteNonNegative(factors.fare) - 1_150) / 2_650) : 0;
  const reliabilityScore = available ? clamp(factors.reliability) : 0;
  const satisfactionScore = available ? clamp(finiteNonNegative(factors.satisfaction) / 100) : 0;
  const scores = {
    accessibilityScore,
    frequencyScore,
    travelTimeScore,
    transferScore,
    crowdingScore,
    fareScore,
    reliabilityScore,
    satisfactionScore,
  };
  const weights = balance.weights;
  const weightTotal = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const totalScore = weightTotal > 0
    ? (
      accessibilityScore * weights.accessibility +
      frequencyScore * weights.frequency +
      travelTimeScore * weights.travelTime +
      transferScore * weights.transfer +
      crowdingScore * weights.crowding +
      fareScore * weights.fare +
      reliabilityScore * weights.reliability +
      satisfactionScore * weights.satisfaction
    ) / weightTotal
    : 0;
  return { ...scores, totalScore: clamp(totalScore) };
}

export function calculateTransitCaptureRate(
  factors: DemandServiceFactors,
  balance: DemandBalance = demandBalance,
) {
  const attractiveness = calculateDemandAttractiveness(factors, balance);
  const rate = factors.serviceAvailable === false
    ? balance.minimumCaptureRate
    : 0.04 + attractiveness.totalScore * 0.88;
  return {
    captureRate: clamp(rate, balance.minimumCaptureRate, balance.maximumCaptureRate),
    attractiveness,
  };
}

export function explainDemandAttractiveness(attractiveness: DemandAttractiveness) {
  const labels: Array<[keyof Omit<DemandAttractiveness, "totalScore">, string, string]> = [
    ["accessibilityScore", "접근 가능한 목적지", "유효한 경로 부족"],
    ["frequencyScore", "짧은 배차간격", "긴 평균 대기시간"],
    ["travelTimeScore", "짧은 이동시간", "긴 이동시간"],
    ["transferScore", "편리한 환승", "높은 환승저항"],
    ["crowdingScore", "여유로운 혼잡도", "심각한 혼잡"],
    ["fareScore", "적절한 요금", "높은 요금"],
    ["reliabilityScore", "안정적인 운행", "운행 불안정"],
    ["satisfactionScore", "높은 시민 만족도", "낮은 시민 만족도"],
  ];
  const positiveReasons = labels
    .map(([key, positive]) => ({ reason: positive, score: attractiveness[key] }))
    .filter((item) => item.score >= 0.68)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.reason);
  const negativeReasons = labels
    .map(([key, , negative]) => ({ reason: negative, score: attractiveness[key] }))
    .filter((item) => item.score <= 0.48)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => item.reason);
  return { positiveReasons, negativeReasons };
}

export function createStationDemandState(
  station: DemandStationInput,
  allocation: CatchmentAllocation,
  day: number,
  legacyDemand = station.legacyDemand ?? 0,
  balance: DemandBalance = demandBalance,
): StationDemandState {
  const potentialDemand = finiteNonNegative(allocation.stationPotential.get(station.id) ?? 0);
  const realizedDemand = Math.min(
    potentialDemand,
    finiteNonNegative(legacyDemand, potentialDemand * balance.initialCaptureRate),
  );
  const transitCaptureRate = potentialDemand > 0 ? realizedDemand / potentialDemand : 0;
  const areaProfile = allocation.stationAreaProfile.get(station.id) ?? inferAreaProfile(station.id, station.position);
  return {
    stationId: station.id,
    potentialDemand: Math.round(potentialDemand),
    realizedDemand: Math.round(realizedDemand),
    previousRealizedDemand: Math.round(realizedDemand),
    transitCaptureRate: clamp(transitCaptureRate),
    targetCaptureRate: clamp(transitCaptureRate),
    areaProfile,
    catchmentWeight: finiteNonNegative(allocation.stationCatchmentWeight.get(station.id) ?? 0),
    hourlyProfile: { ...hourlyProfiles[areaProfile] },
    trend: "stable",
    lastUpdatedGameDay: day,
    positiveReasons: [],
    negativeReasons: [],
  };
}

export function advanceStationDemand(
  state: StationDemandState,
  potentialDemand: number,
  targetCaptureRate: number,
  gameDay: number,
  attractiveness?: DemandAttractiveness,
  balance: DemandBalance = demandBalance,
): StationDemandState {
  const potential = Math.round(finiteNonNegative(potentialDemand));
  const capture = clamp(targetCaptureRate, balance.minimumCaptureRate, balance.maximumCaptureRate);
  if (state.lastUpdatedGameDay >= gameDay) {
    return {
      ...state,
      potentialDemand: potential,
      targetCaptureRate: capture,
    };
  }
  const elapsedDays = Math.max(1, gameDay - state.lastUpdatedGameDay);
  const adaptation = 1 - (1 - clamp(balance.adaptationSpeed)) ** elapsedDays;
  const previous = Math.min(potential, finiteNonNegative(state.realizedDemand));
  const target = potential * capture;
  const realized = Math.round(clamp(previous + (target - previous) * adaptation, 0, potential));
  const difference = realized - previous;
  const threshold = Math.max(10, previous * 0.003);
  const reasons = attractiveness
    ? explainDemandAttractiveness(attractiveness)
    : { positiveReasons: state.positiveReasons, negativeReasons: state.negativeReasons };
  return {
    ...state,
    potentialDemand: potential,
    previousRealizedDemand: Math.round(previous),
    realizedDemand: realized,
    transitCaptureRate: potential > 0 ? realized / potential : 0,
    targetCaptureRate: capture,
    trend: difference > threshold ? "rising" : difference < -threshold ? "falling" : "stable",
    lastUpdatedGameDay: gameDay,
    ...reasons,
  };
}

export function previewStationDemand(
  state: StationDemandState,
  targetCaptureRate: number,
  balance: DemandBalance = demandBalance,
) {
  return advanceStationDemand(
    { ...state, lastUpdatedGameDay: 0 },
    state.potentialDemand,
    targetCaptureRate,
    1,
    undefined,
    balance,
  );
}
