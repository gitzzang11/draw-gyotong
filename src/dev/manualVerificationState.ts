import { createRegionalDemandGrid, type DemandZone, type StationDemandState } from "../demandModel.ts";
import type { NewsEvent } from "../domain/eventTypes.ts";
import type { ConstructionPlan, ConstructionProject } from "../domain/constructionTypes.ts";
import type { EconomyState, Loan, StatisticsState } from "../domain/financeStateTypes.ts";
import type { Depot, RouteLine, RouteNode, RouteSegment, Station, TransferGroup } from "../domain/networkTypes.ts";
import type { PassengerGroup } from "../domain/simulationStateTypes.ts";
import { coordinateDistanceKm } from "../transitRouting.ts";

export const MANUAL_VERIFICATION_IDS = {
  slot: "manual-verification",
  mainLine: "manual-main-line",
  branchLine: "manual-branch-line",
  mainDepot: "manual-main-depot",
  mainWestStation: "manual-main-west",
  mainTransferStation: "manual-main-transfer",
  mainEastStation: "manual-main-east",
  branchEastStation: "manual-branch-east",
  branchTransferStation: "manual-branch-transfer",
  branchSouthStation: "manual-branch-south",
} as const;

type ManualGameMeta = {
  slotId: string;
  slotName: string;
  mode: "sandbox" | "career";
  difficulty: "easy" | "normal" | "hard";
  cityId: "seoul" | "busan" | "daejeon" | "gwangju";
  unlockedCityIds: Array<"seoul" | "busan" | "daejeon" | "gwangju">;
  createdAt: number;
  updatedAt: number;
  bankrupt: boolean;
  networkTitle: string;
  playTimeSeconds: number;
  tutorialStep: number;
  tutorialCompleted: boolean;
  tutorialProgress: {
    mapMoved: boolean;
    mapZoomed: boolean;
    colorSelected: boolean;
    timeStarted: boolean;
    startedDay: number;
  };
  lastSettledGameDay: number;
};

type ManualAnalysisState = {
  dayIndex: number;
  demandHistory: Array<{ day: number; totalDemand: number; satisfaction: number; stationDemand: Record<string, number> }>;
  suggestions: never[];
  decisions: Record<string, never>;
  lastFingerprint: string;
  lastNotifiedDay: number;
};

type ManualDiagramState = {
  autoPositions: Record<string, { x: number; y: number }>;
  manualPositions: Record<string, { x: number; y: number }>;
  background: "light";
  showStationNames: boolean;
  showCompanyInfo: boolean;
  selectedRouteId: "all";
  layoutVersion: number;
  networkSignature: string;
};

type ManualTrainFleet = {
  id: string;
  routeId: string;
  trainType: "heavy";
  cars: number;
  sets: number;
  capacity: number;
  purchaseCost: number;
  maintenanceCost: number;
};

type ManualExpressConfig = {
  routeId: string;
  unlocked: boolean;
  enabled: boolean;
  stopStationIds: string[];
  unlockCost: number;
  extraOperatingCost: number;
};

export type ManualVerificationState = {
  schemaVersion: 4;
  meta: ManualGameMeta;
  routes: RouteLine[];
  stations: Station[];
  transfers: TransferGroup[];
  depots: Depot[];
  plans: ConstructionPlan[];
  diagramState: ManualDiagramState;
  analysisState: ManualAnalysisState;
  statisticsState: StatisticsState;
  constructionProjects: ConstructionProject[];
  newsEvents: NewsEvent[];
  trainFleets: ManualTrainFleet[];
  expressConfigs: ManualExpressConfig[];
  passengerGroups: PassengerGroup[];
  loans: Loan[];
  economy: EconomyState;
  demandZones: DemandZone[];
  stationDemandStates: StationDemandState[];
};

export type ManualVerificationHook = {
  create: () => ManualVerificationState;
  seed: () => Promise<ManualVerificationState>;
  inspect: () => { state: unknown; updateTrace: unknown };
  /** 개발용: 게임 시간을 n일 건너뛴다(하루마다 실제 게임과 같은 정산·공사 진행). 완공·개통·대출·밸런스 검증용 */
  skipDays: (days: number) => Promise<{ fromDay: number; toDay: number; cash: number }>;
};

declare global {
  interface Window {
    __drawGyotongManualVerification?: ManualVerificationHook;
  }
}

export function createManualVerificationState(now = Date.now()): ManualVerificationState {
  const mainCoordinates: Array<[number, number]> = [
    [37.558, 126.965],
    [37.5665, 126.978],
    [37.575, 126.991],
  ];
  const branchCoordinates: Array<[number, number]> = [
    [37.5752, 126.9915],
    [37.5668, 126.9785],
    [37.56, 126.995],
  ];
  const routes = [
    createRoute(MANUAL_VERIFICATION_IDS.mainLine, "Manual Main", "#4ce0c3", mainCoordinates),
    createRoute(MANUAL_VERIFICATION_IDS.branchLine, "Manual Cross", "#f3ca52", branchCoordinates),
  ];
  const stations: Station[] = [
    createStation(MANUAL_VERIFICATION_IDS.mainWestStation, "Main West", mainCoordinates[0], MANUAL_VERIFICATION_IDS.mainLine, 7_800, 0),
    createStation(MANUAL_VERIFICATION_IDS.mainTransferStation, "Main Transfer", mainCoordinates[1], MANUAL_VERIFICATION_IDS.mainLine, 11_500, 1),
    createStation(MANUAL_VERIFICATION_IDS.mainEastStation, "Main East", mainCoordinates[2], MANUAL_VERIFICATION_IDS.mainLine, 8_900, 2),
    createStation(MANUAL_VERIFICATION_IDS.branchEastStation, "Cross East", branchCoordinates[0], MANUAL_VERIFICATION_IDS.branchLine, 7_200, 0),
    createStation(MANUAL_VERIFICATION_IDS.branchTransferStation, "Cross Transfer", branchCoordinates[1], MANUAL_VERIFICATION_IDS.branchLine, 10_800, 1),
    createStation(MANUAL_VERIFICATION_IDS.branchSouthStation, "Cross South", branchCoordinates[2], MANUAL_VERIFICATION_IDS.branchLine, 8_100, 2),
  ];
  const trainFleets: ManualTrainFleet[] = [
    createFleet("manual-main-fleet", MANUAL_VERIFICATION_IDS.mainLine),
    createFleet("manual-branch-fleet", MANUAL_VERIFICATION_IDS.branchLine),
  ];
  const allCityIds: ManualGameMeta["unlockedCityIds"] = ["seoul", "busan", "daejeon", "gwangju"];

  return {
    schemaVersion: 4,
    meta: {
      slotId: MANUAL_VERIFICATION_IDS.slot,
      slotName: "Manual Verification",
      mode: "career",
      difficulty: "easy",
      cityId: "seoul",
      unlockedCityIds: allCityIds,
      createdAt: now,
      updatedAt: now,
      bankrupt: false,
      networkTitle: "Manual Verification Network",
      playTimeSeconds: 0,
      tutorialStep: 10,
      tutorialCompleted: true,
      tutorialProgress: {
        mapMoved: true,
        mapZoomed: true,
        colorSelected: true,
        timeStarted: true,
        startedDay: 0,
      },
      lastSettledGameDay: 0,
    },
    routes,
    stations,
    transfers: [],
    depots: [createDepot()],
    plans: [],
    diagramState: {
      autoPositions: {},
      manualPositions: {},
      background: "light",
      showStationNames: true,
      showCompanyInfo: true,
      selectedRouteId: "all",
      layoutVersion: 3,
      networkSignature: "",
    },
    analysisState: {
      dayIndex: 0,
      demandHistory: [],
      suggestions: [],
      decisions: {},
      lastFingerprint: "",
      lastNotifiedDay: -1,
    },
    statisticsState: { totalPassengers: 0, totalLoanRepaid: 0, dailyRecords: [] },
    constructionProjects: [],
    newsEvents: [],
    trainFleets,
    expressConfigs: routes.map((route) => ({
      routeId: route.id,
      unlocked: false,
      enabled: false,
      stopStationIds: stations.filter((station) => station.connectedRouteIds.includes(route.id)).map((station) => station.id),
      unlockCost: 18_000,
      extraOperatingCost: 650,
    })),
    passengerGroups: [],
    loans: [],
    economy: {
      cash: 500_000,
      fare: 1_450,
      autoFare: true,
      revenue: 0,
      maintenance: 0,
      constructionSpent: 0,
      trainSpent: 0,
      loanBalance: 0,
      satisfaction: 85,
      demand: 0,
    },
    demandZones: createRegionalDemandGrid([37.5665, 126.978], "manual-verification", 1, 3, 700),
    stationDemandStates: [],
  };
}

export function installManualVerificationStateHook(actions: {
  apply: (state: ManualVerificationState) => void;
  save: () => Promise<void>;
  inspect: () => { state: unknown; updateTrace: unknown };
  skipDays: (days: number) => Promise<{ fromDay: number; toDay: number; cash: number }>;
}) {
  if (typeof window === "undefined") return;
  window.__drawGyotongManualVerification = {
    create: createManualVerificationState,
    seed: async () => {
      const state = createManualVerificationState();
      actions.apply(state);
      await actions.save();
      return state;
    },
    inspect: actions.inspect,
    skipDays: actions.skipDays,
  };
}

function createRoute(id: string, name: string, color: string, coordinates: Array<[number, number]>): RouteLine {
  const nodes: RouteNode[] = coordinates.map((position, index) => ({
    id: `${id}:node:${index}`,
    position,
    kind: index === 0 || index === coordinates.length - 1 ? "endpoint" : "control",
  }));
  const segments: RouteSegment[] = coordinates.slice(1).map((position, index) => ({
    id: `${id}:segment:${index}`,
    fromNodeId: nodes[index].id,
    toNodeId: nodes[index + 1].id,
    coordinates: [nodes[index].position, position],
    lengthKm: coordinateDistanceKm(nodes[index].position, position),
    terrainImpact: { riverCrossings: 0, mountainSegments: 0 },
    constructionMode: "bridge",
    constructionCost: Math.round(coordinateDistanceKm(nodes[index].position, position) * 1_200),
    enabled: true,
    constructionDays: Math.max(1, Math.round(coordinateDistanceKm(nodes[index].position, position) * 95)),
  }));
  const lengthKm = segments.reduce((sum, segment) => sum + segment.lengthKm, 0);
  return {
    id,
    name,
    color,
    coordinates,
    lengthKm: Math.round(lengthKm * 1_000) / 1_000,
    constructionCost: Math.round(lengthKm * 1_200),
    riverCrossings: 0,
    mountainSegments: 0,
    riverMode: "bridge",
    nodes,
    segments,
    branches: [],
    servicePatterns: [
      { id: `${id}:local`, name: "Local", kind: "local", branchIds: [], enabled: true, dispatchMode: "equal" },
      { id: `${id}:express`, name: "Express", kind: "express", branchIds: [], enabled: false, dispatchMode: "equal" },
    ],
    visibility: "public",
    localServiceEnabled: true,
    expressServiceEnabled: false,
    operationPaused: false,
  };
}

function createStation(id: string, name: string, position: [number, number], routeId: string, demand: number, nodeIndex: number): Station {
  return {
    id,
    name,
    position,
    demand,
    potentialDemand: demand * 2,
    realizedDemand: demand,
    transitCaptureRate: 0.46,
    connectedRouteIds: [routeId],
    routeNodeIds: [`${routeId}:node:${nodeIndex}`],
  };
}

function createDepot(): Depot {
  return {
    id: MANUAL_VERIFICATION_IDS.mainDepot,
    name: "Manual Main Depot",
    polygon: [
      [37.5572, 126.9642],
      [37.5572, 126.9658],
      [37.5588, 126.9658],
      [37.5588, 126.9642],
    ],
    areaHa: 1.2,
    capacity: 8,
    maintenanceCost: 90,
    connectedRouteIds: [MANUAL_VERIFICATION_IDS.mainLine],
    level: 1,
    constructionCost: 0,
    constructionDays: 1,
  };
}

function createFleet(id: string, routeId: string): ManualTrainFleet {
  return {
    id,
    routeId,
    trainType: "heavy",
    cars: 6,
    sets: 1,
    capacity: 960,
    purchaseCost: 168,
    maintenanceCost: 14,
  };
}
