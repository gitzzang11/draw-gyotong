import {
  allocateCatchmentDemand,
  createLegacyDemandZones,
  createStationDemandState,
  type DemandZone,
} from "../demandModel";
import { legacyRouteTrainType, normalizeTrainType, roundCost, trainCatalog, DEFAULT_TRAIN_TYPE } from "../domain/trainTypes";

export const CURRENT_SAVE_SCHEMA_VERSION = 6;

type AnyRecord = Record<string, any>;

export interface SaveMigrationOptions {
  defaultMeta?: AnyRecord;
  defaultEconomy?: AnyRecord;
  completedTutorialStep?: number;
}

export function stableEntityId(prefix: string, seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function ensureStableId(value: unknown, prefix: string, seed: string) {
  return typeof value === "string" && value.trim() ? value : stableEntityId(prefix, seed);
}

export function migrateSaveStateRecord<T>(input: unknown, options: SaveMigrationOptions = {}): T {
  const source = upgradeVersionedSource(asRecord(input));
  const sourceMeta = asRecord(source.meta);
  const defaultMeta = {
    slotId: "legacy",
    slotName: "서울 계획",
    mode: "career",
    difficulty: "normal",
    cityId: "seoul",
    unlockedCityIds: ["seoul"],
    createdAt: 0,
    updatedAt: 0,
    bankrupt: false,
    playTimeSeconds: 0,
    tutorialStep: 0,
    tutorialCompleted: false,
    tutorialProgress: createTutorialProgress(),
    ...(options.defaultMeta ?? {}),
  };
  const slotSeed = `${finiteNumber(sourceMeta.createdAt, 0)}:${stringValue(sourceMeta.slotName, "legacy")}`;
  const slotId = ensureStableId(sourceMeta.slotId, "slot", slotSeed);
  const meta = {
    ...defaultMeta,
    ...sourceMeta,
    slotId,
    slotName: stringValue(sourceMeta.slotName, defaultMeta.slotName).trim() || defaultMeta.slotName,
    createdAt: finiteNumber(sourceMeta.createdAt, defaultMeta.createdAt),
    updatedAt: finiteNumber(sourceMeta.updatedAt, finiteNumber(sourceMeta.createdAt, defaultMeta.updatedAt)),
    unlockedCityIds: nonEmptyArray(sourceMeta.unlockedCityIds, ["seoul"]),
    playTimeSeconds: Math.max(0, finiteNumber(sourceMeta.playTimeSeconds, 0)),
    tutorialStep: Math.max(
      0,
      finiteNumber(
        sourceMeta.tutorialStep,
        sourceMeta.tutorialCompleted ? options.completedTutorialStep ?? 0 : 0,
      ),
    ),
    tutorialProgress: {
      ...createTutorialProgress(),
      ...asRecord(sourceMeta.tutorialProgress),
    },
  };

  const routes = arrayValue(source.routes).map((routeValue, index) => {
    const route = asRecord(routeValue);
    const routeId = ensureStableId(route.id, "route", `${slotId}:${index}`);
    return {
      ...route,
      id: routeId,
      coordinates: arrayValue(route.coordinates),
      disabledSegments: arrayValue(route.disabledSegments),
      nodes: arrayValue(route.nodes).map((nodeValue, nodeIndex) => {
        const node = asRecord(nodeValue);
        return { ...node, id: ensureStableId(node.id, "node", `${routeId}:${nodeIndex}:${coordinateSeed(node.position)}`) };
      }),
      segments: arrayValue(route.segments).map((segmentValue, segmentIndex) => {
        const segment = asRecord(segmentValue);
        return {
          ...segment,
          id: ensureStableId(segment.id, "segment", `${routeId}:${segmentIndex}:${nestedCoordinateSeed(segment.coordinates)}`),
          enabled: segment.enabled ?? true,
        };
      }),
      branches: arrayValue(route.branches).map((branchValue, branchIndex) => {
        const branch = asRecord(branchValue);
        return {
          ...branch,
          id: ensureStableId(branch.id, "branch", `${routeId}:${branchIndex}`),
          segmentIds: arrayValue(branch.segmentIds),
          dispatchWeight: finiteNumber(branch.dispatchWeight, 1),
        };
      }),
      servicePatterns: arrayValue(route.servicePatterns).map((patternValue, patternIndex) => {
        const pattern = asRecord(patternValue);
        return {
          ...pattern,
          id: ensureStableId(pattern.id, "pattern", `${routeId}:${String(pattern.kind ?? "")}:${patternIndex}`),
          branchIds: arrayValue(pattern.branchIds),
          dispatchMode: "equal",
        };
      }),
    };
  });

  const stations = arrayValue(source.stations).map((stationValue, index) => {
    const station = asRecord(stationValue);
    return {
      ...station,
      id: ensureStableId(station.id, "station", `${slotId}:${index}:${coordinateSeed(station.position)}`),
      demand: Math.max(0, Math.round(finiteNumber(station.demand, 0))),
      connectedRouteIds: arrayValue(station.connectedRouteIds),
      routeNodeIds: arrayValue(station.routeNodeIds),
    };
  });
  const analysisState = normalizeAnalysisState(source.analysisState);
  const demandZones = migrateDemandZones(source.demandZones, stations);
  const stationDemandStates = migrateStationDemandStates(source.stationDemandStates, stations, demandZones, analysisState.dayIndex);

  return {
    ...source,
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    meta,
    routes,
    stations,
    demandZones,
    stationDemandStates,
    transfers: arrayValue(source.transfers).map((value, index) => {
      const transfer = asRecord(value);
      return {
        ...transfer,
        id: ensureStableId(transfer.id, "transfer", `${slotId}:${index}`),
        stationIds: arrayValue(transfer.stationIds),
      };
    }),
    depots: arrayValue(source.depots).map((value, index) => {
      const depot = asRecord(value);
      return {
        ...depot,
        id: ensureStableId(depot.id, "depot", `${slotId}:${index}`),
        connectedRouteIds: arrayValue(depot.connectedRouteIds),
      };
    }),
    plans: migratePlansWithStableIds(source.plans, slotId),
    analysisState,
    statisticsState: normalizeStatisticsState(source.statisticsState),
    constructionProjects: arrayValue(source.constructionProjects).map((value, index) => {
      const project = asRecord(value);
      return {
        ...project,
        id: ensureStableId(project.id, "construction", `${slotId}:${index}:${String(project.name ?? "")}`),
        routeIds: arrayValue(project.routeIds),
        stationIds: arrayValue(project.stationIds),
        depotIds: arrayValue(project.depotIds),
        coordinates: arrayValue(project.coordinates),
        elapsedDays: Math.max(0, finiteNumber(project.elapsedDays, 0)),
        additionalCost: Math.max(0, finiteNumber(project.additionalCost, 0)),
        delayDays: Math.max(0, finiteNumber(project.delayDays, 0)),
        events: arrayValue(project.events).map((eventValue, eventIndex) => {
          const event = asRecord(eventValue);
          return {
            ...event,
            id: ensureStableId(event.id, "construction-event", `${slotId}:${index}:${eventIndex}`),
          };
        }),
      };
    }),
    newsEvents: arrayValue(source.newsEvents).map((value, index) => {
      const event = asRecord(value);
      return {
        ...event,
        id: ensureStableId(event.id, "news", `${slotId}:${index}:${String(event.title ?? "")}`),
        relatedStationIds: arrayValue(event.relatedStationIds),
        relatedRouteIds: arrayValue(event.relatedRouteIds),
        read: Boolean(event.read),
        responsePrepared: Boolean(event.responsePrepared),
      };
    }).slice(-80),
    trainFleets: withStableIds(source.trainFleets, "fleet", slotId),
    operatingServices: arrayValue(source.operatingServices).map((value, index) => {
      const service = asRecord(value);
      return {
        ...service,
        id: ensureStableId(service.id, "service", `${slotId}:${index}:${String(service.name ?? "")}`),
        routeIds: arrayValue(service.routeIds),
        branchIds: arrayValue(service.branchIds),
        pathCoordinates: arrayValue(service.pathCoordinates),
        stationIds: arrayValue(service.stationIds),
        stopStationIds: arrayValue(service.stopStationIds),
      };
    }),
    expressConfigs: arrayValue(source.expressConfigs),
    passengerGroups: arrayValue(source.passengerGroups),
    loans: withStableIds(source.loans, "loan", slotId),
    economy: {
      cash: 60000,
      fare: 1450,
      autoFare: true,
      revenue: 0,
      maintenance: 0,
      constructionSpent: 0,
      trainSpent: 0,
      loanBalance: 0,
      satisfaction: 75,
      demand: 0,
      ...(options.defaultEconomy ?? {}),
      ...asRecord(source.economy),
    },
  } as T;
}

function upgradeVersionedSource(input: AnyRecord): AnyRecord {
  const version = Math.max(1, Math.round(finiteNumber(input.schemaVersion, 1)));
  const version2 = version < 2 ? migrateVersion1To2(input) : { ...input };
  const version3 = version < 3 ? migrateVersion2To3(version2) : version2;
  const version4 = version < 4 ? migrateVersion3To4(version3) : version3;
  const version5 = version < 5 ? { ...version4, schemaVersion: 5 } : version4;
  return version < 6 ? migrateVersion5To6(version5) : version5;
}

/**
 * 열차 차종 개편: 노선마다 차종 하나를 정하고(일반 열차가 있으면 중전철, 급행형만 있으면 GTX),
 * 그 노선의 편성을 노선 차종으로 바꾼다. 편성 차량 수와 구입 기록은 그대로 두고 정원·운영비만 새 차종 값으로 다시 계산한다.
 */
function migrateVersion5To6(source: AnyRecord): AnyRecord {
  const fleets = arrayValue(source.trainFleets).map(asRecord);
  const routeTypes = new Map<string, ReturnType<typeof normalizeTrainType>>();
  const routes = arrayValue(source.routes).map((routeValue) => {
    const route = asRecord(routeValue);
    const trainType = legacyRouteTrainType(fleets.filter((fleet) => fleet.routeId === route.id).map((fleet) => fleet.trainType));
    routeTypes.set(String(route.id), trainType);
    return { ...route, trainType };
  });
  return {
    ...source,
    schemaVersion: 6,
    routes,
    trainFleets: fleets.map((fleet) => {
      const trainType = routeTypes.get(String(fleet.routeId)) ?? normalizeTrainType(fleet.trainType);
      const spec = trainCatalog[trainType];
      const cars = Math.max(1, Math.round(finiteNumber(fleet.cars, spec.minCars)));
      const sets = Math.max(0, Math.round(finiteNumber(fleet.sets, 0)));
      return { ...fleet, trainType, capacity: spec.capacityPerCar * cars * sets, maintenanceCost: roundCost(spec.maintenancePerCar * cars * sets) };
    }),
    plans: arrayValue(source.plans).map((planValue) => {
      const plan = asRecord(planValue);
      return { ...plan, routes: arrayValue(plan.routes).map((routeValue) => ({ trainType: DEFAULT_TRAIN_TYPE, ...asRecord(routeValue) })) };
    }),
  };
}

function migrateVersion1To2(source: AnyRecord): AnyRecord {
  return {
    ...source,
    schemaVersion: 2,
    transfers: arrayValue(source.transfers),
    depots: arrayValue(source.depots),
    plans: arrayValue(source.plans),
    constructionProjects: arrayValue(source.constructionProjects),
  };
}

function migrateVersion2To3(source: AnyRecord): AnyRecord {
  return {
    ...source,
    schemaVersion: 3,
    trainFleets: arrayValue(source.trainFleets),
    expressConfigs: arrayValue(source.expressConfigs),
    passengerGroups: arrayValue(source.passengerGroups),
    loans: arrayValue(source.loans),
    demandZones: arrayValue(source.demandZones),
    stationDemandStates: arrayValue(source.stationDemandStates),
  };
}

function migrateVersion3To4(source: AnyRecord): AnyRecord {
  return {
    ...source,
    schemaVersion: 4,
    plans: arrayValue(source.plans).map((planValue) => {
      const plan = asRecord(planValue);
      return {
        ...plan,
        connections: arrayValue(plan.connections),
        junctions: arrayValue(plan.junctions),
        routePlanningDrafts: arrayValue(plan.routePlanningDrafts),
      };
    }),
  };
}

function migratePlansWithStableIds(value: unknown, slotId: string) {
  return arrayValue(value).map((planValue, planIndex) => {
    const plan = asRecord(planValue);
    const planId = ensureStableId(plan.id, "plan", `${slotId}:${planIndex}:${String(plan.name ?? "")}`);
    return {
      ...plan,
      id: planId,
      routes: arrayValue(plan.routes).map((routeValue, routeIndex) => {
        const route = asRecord(routeValue);
        const routeId = ensureStableId(route.id, "planned-route", `${planId}:${routeIndex}`);
        return {
          ...route,
          id: routeId,
          segments: arrayValue(route.segments).map((segmentValue, segmentIndex) => {
            const segment = asRecord(segmentValue);
            return { ...segment, id: ensureStableId(segment.id, "planned-segment", `${routeId}:${segmentIndex}`) };
          }),
          completedSegmentIds: arrayValue(route.completedSegmentIds),
        };
      }),
      stations: migratePlanEntities(plan.stations, "planned-station", planId),
      depots: migratePlanEntities(plan.depots, "planned-depot", planId),
      transfers: arrayValue(plan.transfers).map((transferValue, transferIndex) => {
        const transfer = asRecord(transferValue);
        return {
          ...transfer,
          id: ensureStableId(transfer.id, "planned-transfer", `${planId}:${transferIndex}`),
          stationIds: arrayValue(transfer.stationIds),
          actualStationIds: arrayValue(transfer.actualStationIds),
        };
      }),
      connections: arrayValue(plan.connections).map((connectionValue, connectionIndex) => {
        const connection = asRecord(connectionValue);
        const status = normalizeBlueprintStatus(connection.status);
        const actualEntityIds = arrayValue(connection.actualEntityIds);
        const appliedAt = finiteNumber(connection.appliedAt, 0);
        const incompleteCompletedConnection = status === "completed" && (appliedAt <= 0 || actualEntityIds.length === 0);
        return {
          ...connection,
          id: ensureStableId(connection.id, "connection-blueprint", `${planId}:${connectionIndex}`),
          operationType: "connection",
          coordinates: arrayValue(connection.coordinates),
          status: incompleteCompletedConnection ? "failed" : status,
          appliedAt: appliedAt > 0 ? appliedAt : undefined,
          actualEntityIds,
          failureReason: incompleteCompletedConnection
            ? stringValue(connection.failureReason, "Completed connection had no applied runtime result during restore.")
            : connection.failureReason,
        };
      }),
      junctions: arrayValue(plan.junctions).map((junctionValue, junctionIndex) => {
        const junction = asRecord(junctionValue);
        return {
          ...junction,
          id: ensureStableId(junction.id, "junction-blueprint", `${planId}:${junctionIndex}`),
          status: normalizeBlueprintStatus(junction.status),
          createsStation: Boolean(junction.createsStation),
          splitRatio: finiteNumber(junction.splitRatio, 0.5),
        };
      }),
      routePlanningDrafts: arrayValue(plan.routePlanningDrafts),
    };
  });
}

function normalizeBlueprintStatus(value: unknown) {
  const status = stringValue(value, "draft");
  return ["draft", "approved", "scheduled", "under-construction", "completed", "cancelled", "failed"].includes(status)
    ? status
    : "draft";
}

function migratePlanEntities(value: unknown, prefix: string, parentId: string) {
  return arrayValue(value).map((entityValue, index) => {
    const entity = asRecord(entityValue);
    return { ...entity, id: ensureStableId(entity.id, prefix, `${parentId}:${index}`) };
  });
}

function migrateDemandZones(value: unknown, stations: AnyRecord[]): DemandZone[] {
  const saved = arrayValue(value) as DemandZone[];
  if (saved.length > 0) return saved.map((zone) => ({ ...zone }));
  try {
    return createLegacyDemandZones(stations.map(toDemandStation));
  } catch {
    return [];
  }
}

function migrateStationDemandStates(
  value: unknown,
  stations: AnyRecord[],
  demandZones: DemandZone[],
  dayIndex: number,
) {
  try {
    const allocation = allocateCatchmentDemand(demandZones, stations.map(toDemandStation), dayIndex, "daytime");
    const existingById = new Map(
      arrayValue(value)
        .map(asRecord)
        .filter((state) => typeof state.stationId === "string")
        .map((state) => [state.stationId, state]),
    );
    return stations.map((station) => {
      const created = createStationDemandState(toDemandStation(station), allocation, dayIndex);
      const existing = existingById.get(station.id);
      if (!existing) return created;
      const potentialDemand = Math.max(0, Math.round(allocation.stationPotential.get(station.id) ?? created.potentialDemand));
      const realizedDemand = Math.min(potentialDemand, Math.max(0, Math.round(finiteNumber(existing.realizedDemand, created.realizedDemand))));
      return {
        ...created,
        ...existing,
        potentialDemand,
        realizedDemand,
        previousRealizedDemand: Math.min(potentialDemand, Math.max(0, Math.round(finiteNumber(existing.previousRealizedDemand, realizedDemand)))),
        transitCaptureRate: potentialDemand > 0 ? realizedDemand / potentialDemand : 0,
        targetCaptureRate: Math.min(1, Math.max(0, finiteNumber(existing.targetCaptureRate, created.targetCaptureRate))),
        catchmentWeight: allocation.stationCatchmentWeight.get(station.id) ?? created.catchmentWeight,
        areaProfile: allocation.stationAreaProfile.get(station.id) ?? created.areaProfile,
      };
    });
  } catch {
    return arrayValue(value).map((state) => ({ ...asRecord(state) }));
  }
}

function toDemandStation(station: AnyRecord) {
  return {
    id: String(station.id),
    position: validPosition(station.position),
    operational: true,
    legacyDemand: finiteNumber(station.realizedDemand, finiteNumber(station.demand, 0)),
  };
}

function normalizeAnalysisState(value: unknown) {
  const state = asRecord(value);
  return {
    dayIndex: Math.max(0, Math.round(finiteNumber(state.dayIndex, 0))),
    demandHistory: arrayValue(state.demandHistory).slice(-30),
    suggestions: arrayValue(state.suggestions),
    decisions: asRecord(state.decisions),
    lastFingerprint: stringValue(state.lastFingerprint, ""),
    lastNotifiedDay: finiteNumber(state.lastNotifiedDay, -1),
  };
}

function normalizeStatisticsState(value: unknown) {
  const state = asRecord(value);
  return {
    totalPassengers: Math.max(0, Math.round(finiteNumber(state.totalPassengers, 0))),
    totalLoanRepaid: Math.max(0, Math.round(finiteNumber(state.totalLoanRepaid, 0))),
    dailyRecords: arrayValue(state.dailyRecords).slice(-90),
  };
}

function withStableIds(value: unknown, prefix: string, slotId: string) {
  return arrayValue(value).map((entityValue, index) => {
    const entity = asRecord(entityValue);
    return { ...entity, id: ensureStableId(entity.id, prefix, `${slotId}:${index}`) };
  });
}

function createTutorialProgress() {
  return { mapMoved: false, mapZoomed: false, colorSelected: false, timeStarted: false, startedDay: 0 };
}

function asRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function arrayValue(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function nonEmptyArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) && value.length > 0 ? [...value] as T[] : [...fallback];
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function validPosition(value: unknown): [number, number] {
  const position = Array.isArray(value) ? value : [];
  return [finiteNumber(position[0], 0), finiteNumber(position[1], 0)];
}

function coordinateSeed(value: unknown) {
  return validPosition(value).join(",");
}

function nestedCoordinateSeed(value: unknown) {
  return arrayValue(value).map(coordinateSeed).join(",");
}
