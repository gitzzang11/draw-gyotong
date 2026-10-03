import L, { type GeoJSON, type LatLng, type LatLngExpression, type TileLayer } from "leaflet";
import "./legacy.css";
import "./design/tokens.css";
import "./design/components.css";
import "./design/hud.css";
import { lineMarkHtml } from "./ui/inspectorMarkup.ts";
import { applyMapTheme, MAP_THEME_LABELS, MAP_THEMES, normalizeMapTheme, type MapTheme } from "./design/theme.ts";
import { copyConstructionPlan } from "./domain/planCopy.ts";
import { maxShareFileBytes, validateSharedGameBundle, type DiagramShareRoute, type MetroDiagramShareData, type RouteDesignShareData, type GameShareBundle } from "./shareBundle.ts";
import { selectPassengerDestinations } from "./destinationSelection.ts";
import { normalizeAutomaticStationName, selectAutomaticStationName, type StationNameMatch } from "./stationNaming.ts";
import {
  buildNetworkSignature,
  TransitRouter,
  type RoutingNetwork,
  type TransitServiceKind,
} from "./transitRouting.ts";
import { type ServiceCapacity } from "./congestion.ts";
import {
  calculateOperatingForecast,
  calculatePassengerSatisfaction,
  type OperatingForecast,
} from "./operatingForecast.ts";
import {
  distanceToSegment,
  getTargetHitRadius,
  pointInPolygon as hitPointInPolygon,
  resolveMapTarget,
  type MapHitCandidate,
  type RankedMapTarget,
} from "./mapHitTest.ts";
import { MapSelectionApplicationController } from "./map/mapSelectionApplicationController.ts";
import { calculateEdgeHudProximity } from "./hudProximity.ts";
import {
  isValidConstructionStatusTransition,
  normalizeTransferLinks,
  synchronizeNetworkReferences,
  validateNetworkIntegrity,
} from "./storage/integrityCheck.ts";
import {
  advanceStationDemand,
  allocateCatchmentDemand,
  calculateTransitCaptureRate,
  createLegacyDemandZones,
  createRegionalDemandGrid,
  createStationDemandState,
  getDestinationPeriodMultiplier,
  getDemandPeriod,
  previewStationDemand,
  type DemandAttractiveness,
  type DemandEvent,
  type DemandZone,
  type StationDemandState,
} from "./demandModel.ts";
import { applyRealPopulationDensity, getRealPopulationCells } from "./populationDensity.ts";
import { DirtyUpdateScheduler, type UpdateDomain, type UpdateReason } from "./updateScheduler.ts";
import type { Branch, ConstructionMode, Depot, RouteLine, RouteNode, RouteNodeKind, RouteSegment, ServicePattern, Station, TransferGroup } from "./domain/networkTypes.ts";
import { NetworkState } from "./domain/networkState.ts";
import { ConstructionState } from "./domain/constructionState.ts";
import { OperationsState, type ExpressConfig, type TrainFleet } from "./domain/operationsState.ts";
import { removeOperatingService, replaceExpressConfigForRoute, replaceOperatingService } from "./domain/operationsMutations.ts";
import { updateConstructionPlan } from "./domain/constructionMutations.ts";
import { filterValidPlanConnections, resolvePlanConnectionEndpoint, resolvePlanConnectionRouteId } from "./domain/planConversion.ts";
import { buildTransferGroupMutation } from "./domain/transferMutations.ts";
import { calculateNetworkFinancials as calculateNetworkFinancialsModel } from "./analysis/networkFinancials.ts";
import type { ConstructionPlan, ConstructionProject, ConstructionProjectKind, ConstructionProjectStatus, ManualTransferEndpoint, PlanPriority, PlanStatus, PlannedDepot, PlannedRoute, PlannedStation } from "./domain/constructionTypes.ts";
import { addStagedPlanSegments } from "./domain/stagedPlanRoute.ts";
import { getDepotExpansionQuote, maxDepotLevel } from "./domain/depotExpansion.ts";
import type { EconomyState, Loan, StatisticsState } from "./domain/financeStateTypes.ts";
import { FinanceState } from "./domain/financeState.ts";
import { ApplicationMetaState } from "./domain/applicationMetaState.ts";
import { DemandState } from "./domain/demandState.ts";
import { AnalysisStateOwner } from "./domain/analysisStateOwner.ts";
import { SimulationRuntimeState } from "./runtime/simulationRuntimeState.ts";
import { TransitRouterCache } from "./runtime/transitRouterCache.ts";
import { DemandRuntimeCache } from "./runtime/demandRuntimeCache.ts";
import { CongestionRuntimeState } from "./runtime/congestionRuntimeState.ts";
import { SimulationRuntimeEffects } from "./runtime/simulationRuntimeEffects.ts";
import { SimulationApplicationOrchestrator } from "./runtime/simulationApplicationOrchestrator.ts";
import { initializeGameShell } from "./runtime/gameShellInitializer.ts";
import { registerMapLifecycle } from "./map/mapLifecycleBindings.ts";
import type { NewsEvent, NewsEventAction, NewsEventKind } from "./domain/eventTypes.ts";
import type { PassengerGroup } from "./domain/simulationStateTypes.ts";
import { captureGameState } from "./storage/serialization.ts";
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  migrateSaveStateRecord,
  stableEntityId,
} from "./storage/migrations.ts";
import {
  calculateServiceOperations,
  normalizeServiceStops,
} from "./simulation/expressService.ts";
import {
  applyStopPreset,
  calculateOperatingServiceOperation,
  normalizeOperatingService,
  toggleOperatingServiceStop,
  type OperatingService,
  type StopPreset,
} from "./operatingService.ts";
import { mergeOdPassengerGroup } from "./simulation/passengerAssignment.ts";
import { measureTask } from "./dev/performanceMonitor.ts";
import {
  installManualVerificationStateHook,
  type ManualVerificationState,
} from "./dev/manualVerificationState.ts";
import { ListenerRegistry } from "./ui/listenerRegistry.ts";
import { bindBackdropDismiss } from "./ui/backdropDismiss.ts";
import { HudRenderer } from "./ui/hudRenderer.ts";
import { PanelManager } from "./ui/panelManager.ts";
import { StationPanel } from "./ui/stationPanel.ts";
import { LinePanel } from "./ui/linePanel.ts";
import { TrainPanel } from "./ui/trainPanel.ts";
import { DepotPanel } from "./ui/depotPanel.ts";
import { OperationsPanel } from "./ui/operationsPanel.ts";
import { hexToHsl, hslToHex } from "./ui/colorPickerModel.ts";
import { formatCost, formatDate, formatPlayTime, formatSignedCost } from "./ui/displayFormatters.ts";
import { saveEditedSlot as persistEditedSlot } from "./ui/saveSlotEditorController.ts";
import {
  MetroDiagramStateOwner,
  type DiagramPoint,
  type MetroDiagramState,
} from "./ui/metroDiagramStateOwner.ts";
import {
  DialogManager,
  renderConnectionChoice,
  renderConnectionTargetCard,
} from "./ui/dialogManager.ts";
import {
  createSaveSlotService,
  LocalRecoveryStore,
  type SaveSlotService,
} from "./storage/saveSlotService.ts";
import { SaveFacade } from "./storage/saveFacade.ts";
import {
  calculateDailySettlement,
  DailySettlementService,
} from "./simulation/finance/dailySettlement.ts";
import { LoanStateOwner } from "./simulation/finance/loanStateOwner.ts";
import { LayerManager } from "./map/layerManager.ts";
import { LineRenderer, type LineRenderEntity } from "./map/lineRenderer.ts";
import {
  StationRenderer,
  type StationRenderEntity,
  type TransferConnectionEntity,
} from "./map/stationRenderer.ts";
import { TrainRenderer, type TrainRenderEntity } from "./map/trainRenderer.ts";
import { DepotRenderer } from "./map/depotRenderer.ts";
import {
  buildConstructionRenderEntities,
  buildDepotRenderEntities,
} from "./map/renderEntityBuilders.ts";
import { getRoutePathCoordinates } from "./map/routePathBuilder.ts";
import { getLodMode } from "./map/lod.ts";
import { MapSelectionGestureController } from "./map/mapSelectionGestureController.ts";
import { BlueprintRenderer, type BlueprintRenderEntity } from "./map/blueprintRenderer.ts";
import {
  ConstructionRenderer,
  type ConstructionDraftRenderEntity,
} from "./map/constructionRenderer.ts";
import { getStationTransferInfo } from "./stationTransferInfo.ts";
import { mergeLineExtension, resolveReferencedLineColor, type LineExtensionPayload } from "./lineExtension.ts";
import { type RoutePlanningTool } from "./routePlanning.ts";
import { RoutePlanningController } from "./tools/routePlanningController.ts";
import { RoutePlanningToolChangeController } from "./tools/routePlanningToolChangeController.ts";
import {
  createJunctionBlueprint,
  createConnectionBlueprint,
  splitSegmentAtJunction,
  type ConnectionBlueprint,
  type JunctionBlueprint,
} from "./routeBlueprints.ts";
import {
  completeConnectionBlueprint,
  completeJunctionBlueprint,
  transitionBlueprint,
} from "./blueprintLifecycle.ts";
import {
  ConnectionSubmissionGuard,
  getConnectionChoices,
  type ConnectionChoiceId,
} from "./connectionDialogModel.ts";
import { GameLoopController } from "./runtime/gameLoopController.ts";
import { SimulationCoordinator } from "./runtime/simulationCoordinator.ts";
import { StateRecoveryCoordinator } from "./runtime/stateRecoveryCoordinator.ts";
import { BootstrapController } from "./runtime/bootstrap.ts";
import { ConstructionCoordinator } from "./construction/constructionCoordinator.ts";
import { EventCoordinator } from "./events/eventCoordinator.ts";
import { NewsEventStateOwner } from "./events/newsEventStateOwner.ts";
import { EventRuntimeAdapter } from "./events/eventRuntimeAdapter.ts";
import { RuntimeResultDispatcher } from "./runtime/runtimeResultDispatcher.ts";
import { DailySettlementRuntime, type DailySettlementRuntimeContext } from "./runtime/dailySettlementRuntime.ts";
import { NetworkInvalidation } from "./routing/networkInvalidation.ts";
import {
  createConnectionSegment,
  findNearestConnectionStation,
  findPolylineInsertionIndex,
  mergeRouteGeometry,
  normalizeConnectionPolyline,
  polylineLengthMeters,
} from "./geometry/constructionGeometry.ts";

let saveSlotServiceInstance: SaveSlotService<SaveState> | null = null;
const updateScheduler = new DirtyUpdateScheduler();
const dailySettlementService = new DailySettlementService();
const dailySettlementRuntime = new DailySettlementRuntime<OperationAnalysisState, GameMeta, NewsEvent>();

// =============================================================================
// 도메인 모델
// 지도 위의 선·역·차량기지뿐 아니라 계획, 공사, 운행, 재정, 저장 데이터까지
// 이 파일에서 공유하는 게임 상태의 형태를 한곳에 정의한다.
// =============================================================================

type OverlayKey = "administrative" | "landuse" | "rail" | "population";
type WorkspaceMode = "management" | "planning" | "construction";
type ToolMode =
  | "pan"
  | "route"
  | "extend"
  | "edit"
  | "eraser"
  | "reconnect"
  | "branch"
  | "merge"
  | "station"
  | "transfer"
  | "depot"
  | "expressStop";
type TrainType = "metro" | "commuter" | "express";
type GameMode = "sandbox" | "career";
type Difficulty = "easy" | "normal" | "hard";
type CityId = "seoul" | "busan" | "daejeon" | "gwangju";

type RouteOperation = {
  routeId: string;
  headwayMin: number;
  crowding: number;
  waitMin: number;
  dailyDemand: number;
  hourlyCapacity: number;
  operatingCost: number;
};

type AnalysisSeverity = "critical" | "warning" | "info";
type SuggestionStatus = "active" | "later" | "hidden";
type SuggestionActionKind = "buy-trains" | "review-fare" | "review-transfer" | "build-depot" | "review-express" | "open-plan" | "focus-route";

type OperationSuggestion = {
  id: string;
  code: string;
  severity: AnalysisSeverity;
  category: "capacity" | "service" | "finance" | "passenger" | "network" | "planning";
  targetType: "route" | "station" | "transfer" | "depot" | "plan" | "network";
  targetId: string;
  targetLabel: string;
  title: string;
  cause: string;
  recommendation: string;
  expectedEffect: string;
  estimatedCost: number;
  actionKind: SuggestionActionKind;
  actionLabel: string;
  actionValue?: number;
  generatedDay: number;
  lastSeenDay: number;
  status: SuggestionStatus;
  remindAtDay?: number;
  estimated: true;
};

type DemandSnapshot = {
  day: number;
  totalDemand: number;
  satisfaction: number;
  stationDemand: Record<string, number>;
};

type AnalysisDecision = {
  status: SuggestionStatus;
  untilDay?: number;
};

type OperationAnalysisState = {
  dayIndex: number;
  demandHistory: DemandSnapshot[];
  suggestions: OperationSuggestion[];
  decisions: Record<string, AnalysisDecision>;
  lastFingerprint: string;
  lastNotifiedDay: number;
};

type TutorialProgress = {
  mapMoved: boolean;
  mapZoomed: boolean;
  colorSelected: boolean;
  timeStarted: boolean;
  targetRouteId?: string;
  targetDepotId?: string;
  startedDay: number;
};

type GameMeta = {
  slotId: string;
  slotName: string;
  mode: GameMode;
  difficulty: Difficulty;
  cityId: CityId;
  unlockedCityIds: CityId[];
  createdAt: number;
  updatedAt: number;
  bankrupt: boolean;
  networkTitle?: string;
  playTimeSeconds?: number;
  tutorialStep?: number;
  tutorialCompleted?: boolean;
  tutorialProgress?: TutorialProgress;
  lastSettledGameDay?: number;
};

type GameSettings = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  performanceMode: "balanced" | "battery";
  reducedMotion: boolean;
  sandboxConstructionTime: boolean;
  autoStationNaming: boolean;
  autoSaveEnabled: boolean;
  autoSaveIntervalSeconds: 30 | 60 | 180 | 300;
  mapTheme: MapTheme;
};

type SaveState = {
  schemaVersion?: number;
  meta?: GameMeta;
  routes: RouteLine[];
  stations: Station[];
  transfers: TransferGroup[];
  depots: Depot[];
  plans?: ConstructionPlan[];
  diagramState?: MetroDiagramState;
  analysisState?: OperationAnalysisState;
  statisticsState?: StatisticsState;
  constructionProjects?: ConstructionProject[];
  newsEvents?: NewsEvent[];
  trainFleets?: TrainFleet[];
  operatingServices?: OperatingService[];
  expressConfigs?: ExpressConfig[];
  passengerGroups?: PassengerGroup[];
  loans?: Loan[];
  economy?: EconomyState;
  demandZones?: DemandZone[];
  stationDemandStates?: StationDemandState[];
};

type SaveSlotSummary = {
  slotId: string;
  slotName: string;
  mode: GameMode;
  difficulty: Difficulty;
  cityId: CityId;
  cash: number;
  unlockedCityIds: CityId[];
  updatedAt: number;
  createdAt: number;
  networkTitle?: string;
  playTimeSeconds: number;
  bankrupt: boolean;
  routeCount: number;
  stationCount: number;
};

type Obstacle = {
  kind: "river" | "mountain";
  points: L.Point[];
};

type OverpassElement = {
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ role: string; geometry?: Array<{ lat: number; lon: number }> }>;
};

type GeoJsonFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean | null>;
  geometry: {
    type: "LineString" | "Polygon" | "MultiPolygon";
    coordinates: number[][] | number[][][] | number[][][][];
  };
};

// =============================================================================
// 게임 밸런스와 기본값
// 거리 단위는 km, 금액은 게임 내부 화폐, 기간은 게임 일(day)을 사용한다.
// 아래 값을 조정하면 건설비·공사 기간·스냅 감도 등 전반적인 난이도가 바뀐다.
// =============================================================================

const SEOUL: LatLngExpression = [37.5665, 126.978];
// 한 서버가 응답하지 않을 때 다음 서버로 넘어가기 위한 Overpass API 후보 목록.
const overpassEndpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const routeColors = ["#ff5d5d", "#4ce0c3", "#f3ca52", "#7aa7ff", "#c477ff", "#ff9f43", "#63d471"];
const baseCostPerKm = 1200;
const bridgeCostPerCrossing = 4200;
const tunnelCostPerCrossing = 6800;
const mountainCostPerKm = 950;
const baseConstructionDaysPerKm = 95;
const bridgeConstructionDays = 120;
const tunnelConstructionDays = 240;
const stationSnapPx = 24;
const maxHistory = 20;
const currentSaveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
const saveDatabaseVersion = 2;
const trainCatalog: Record<TrainType, { label: string; capacityPerCar: number; pricePerCar: number; maintenancePerCar: number; speedKmh: number }> = {
  metro: { label: "도시철도", capacityPerCar: 160, pricePerCar: 28, maintenancePerCar: 2.2, speedKmh: 34 },
  commuter: { label: "광역전철", capacityPerCar: 190, pricePerCar: 34, maintenancePerCar: 2.8, speedKmh: 42 },
  express: { label: "급행형", capacityPerCar: 150, pricePerCar: 42, maintenancePerCar: 3.4, speedKmh: 54 },
};
const defaultEconomy: EconomyState = {
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
};

// 사용자가 지도에서 작업 중일 때만 존재하는 임시 상태들.
// 확정 전 미리보기이므로 저장 데이터(SaveState)에는 직접 포함하지 않는다.
type RouteExtension = {
  routeId: string;
  atStart: boolean;
  endpoint: L.Point;
};

type RouteBranchDraft = {
  routeId: string;
  junction: L.Point;
  junctionLatLng: LatLng;
  junctionBlueprint?: JunctionBlueprint;
};

type PlanningRouteContinuation = {
  atStart: boolean;
  anchor: L.Point;
  basePoints: LatLng[];
  plannedRouteId?: string;
  actualRouteId?: string;
  color: string;
};

type RouteHandleMove = {
  routeId: string;
  coordinateIndex: number;
  originalCoordinates: Array<[number, number]>;
};

type RouteDeleteAnchor = {
  routeId: string;
  coordinateIndex: number;
  point: L.Point;
};

type PlannedRouteDeleteAnchor = {
  routeId: string;
  coordinateIndex: number;
};

type PlanningBranchDraft = {
  routeId: string;
  junction: L.Point;
  junctionLatLng: LatLng;
  color: string;
};

type PlannedRouteMergeEndpoint = {
  routeId: string;
  atStart: boolean;
  endpoint: L.Point;
};

type RouteMergeEndpoint = {
  routeId: string;
  atStart: boolean;
  endpoint: L.Point;
};

type PendingMerge = {
  first: RouteMergeEndpoint;
  second: RouteMergeEndpoint;
  bridgeLengthKm: number;
  bridgeCost: number;
};

type ConstructionDraftKind = "route" | "extension" | "branch" | "repair" | "edit" | "depot";
type ConstructionWarningSeverity = "info" | "warning" | "error";

type RiverCrossingChoice = {
  id: string;
  segmentIndex: number;
  position: [number, number];
  mode: ConstructionMode | null;
};

type ConstructionSegmentImpact = {
  index: number;
  coordinates: [[number, number], [number, number]];
  lengthKm: number;
  mountainLengthKm: number;
  riverCrossingIds: string[];
  baseCost: number;
  mountainCost: number;
};

type ConstructionWarning = {
  code: string;
  severity: ConstructionWarningSeverity;
  message: string;
};

type ConstructionAnalysis = {
  segments: ConstructionSegmentImpact[];
  lengthKm: number;
  baseCost: number;
  mountainLengthKm: number;
  mountainCost: number;
  riverCrossings: RiverCrossingChoice[];
  riverCost: number;
  stationInstallCount: number;
  depotConnected: boolean;
  totalCost: number;
  balanceAfter: number;
  durationDays: number;
  warnings: ConstructionWarning[];
};

type ConstructionDraft = {
  id: string;
  kind: ConstructionDraftKind;
  points: LatLng[];
  polygon?: LatLng[];
  routeId?: string;
  plannedRouteId?: string;
  extension?: RouteExtension | null;
  plannedExtension?: { routeId: string; atStart: boolean };
  plannedRouteExtension?: { routeId: string; atStart: boolean };
  branch?: RouteBranchDraft | null;
  planningBranch?: PlanningBranchDraft | null;
  repair?: RouteRepair | null;
  editHandle?: RouteHandleMove | null;
  connectedRouteIds?: string[];
  connectedPlannedRouteIds?: string[];
  analysis: ConstructionAnalysis;
};

type DemolitionReview = {
  planning: boolean;
  routeCount: number;
  segmentCount: number;
  stationCount: number;
  depotCount: number;
  lengthKm: number;
  refund: number;
  description: string;
  confirmLabel: string;
  confirm: () => void;
};

type RouteRepair = {
  routeId: string;
  gapIndex: number;
  start: L.Point;
  end: L.Point;
};
const defaultSettings: GameSettings = {
  soundEnabled: true,
  hapticsEnabled: true,
  performanceMode: "balanced",
  reducedMotion: false,
  sandboxConstructionTime: false,
  autoStationNaming: true,
  autoSaveEnabled: true,
  autoSaveIntervalSeconds: 30,
  mapTheme: "paper",
};
const fallbackSaveKey = "draw-gyotong-save-slots-v1";
const localRecoveryStateKey = "draw-gyotong-state";
const legacyRoutesKey = "draw-gyotong-routes";
const localRecoveryStore = new LocalRecoveryStore<SaveState>(
  localStorage,
  localRecoveryStateKey,
  legacyRoutesKey,
  migrateGameSave,
);
const gameVersion = "0.4.0";
const cityDataVersion = "korea-cities-1";
const diagramWidth = 1800;
const diagramHeight = 1000;
const diagramGrid = 72;
const defaultAnalysisState: OperationAnalysisState = {
  dayIndex: 0,
  demandHistory: [],
  suggestions: [],
  decisions: {},
  lastFingerprint: "",
  lastNotifiedDay: -1,
};
const defaultStatisticsState: StatisticsState = {
  totalPassengers: 0,
  totalLoanRepaid: 0,
  dailyRecords: [],
};

const newsEventCatalog: Record<
  NewsEventKind,
  {
    tone: NewsEvent["tone"];
    title: string;
    summary: string;
    demandMultiplier: number;
    operatingCostMultiplier: number;
    duration: [number, number];
    action: NewsEventAction;
    actionLabel: string;
  }
> = {
  festival: { tone: "opportunity", title: "도심 축제 개최", summary: "행사장 주변의 단기 이동 수요가 증가합니다.", demandMultiplier: 1.22, operatingCostMultiplier: 1, duration: [2, 4], action: "add-service", actionLabel: "임시 증편 준비" },
  concert: { tone: "opportunity", title: "대형 콘서트 일정 발표", summary: "공연 전후 관련 역에 승객이 집중될 전망입니다.", demandMultiplier: 1.3, operatingCostMultiplier: 1.01, duration: [1, 2], action: "add-service", actionLabel: "임시 증편 준비" },
  sports: { tone: "opportunity", title: "스포츠 경기 관람객 증가", summary: "경기장 권역의 저녁 시간대 수요가 늘어납니다.", demandMultiplier: 1.24, operatingCostMultiplier: 1.01, duration: [1, 3], action: "add-service", actionLabel: "임시 증편 준비" },
  tourism: { tone: "opportunity", title: "관광객 유입 증가", summary: "관광 거점과 환승역을 중심으로 이용객이 증가합니다.", demandMultiplier: 1.16, operatingCostMultiplier: 1, duration: [4, 7], action: "review-area", actionLabel: "수요 지역 검토" },
  "new-town": { tone: "opportunity", title: "신도시 개발 계획 확정", summary: "새로운 주거 수요가 형성되어 노선 연장 기회가 생겼습니다.", demandMultiplier: 1.18, operatingCostMultiplier: 1, duration: [6, 10], action: "review-area", actionLabel: "연장 후보 검토" },
  university: { tone: "opportunity", title: "대학교 대형 행사", summary: "대학가 주변 역의 단기 승하차 수요가 증가합니다.", demandMultiplier: 1.2, operatingCostMultiplier: 1, duration: [2, 4], action: "add-service", actionLabel: "임시 증편 준비" },
  "commercial-growth": { tone: "opportunity", title: "상업지구 성장세", summary: "상업 활동 증가로 출퇴근과 여가 수요가 함께 늘어납니다.", demandMultiplier: 1.14, operatingCostMultiplier: 1, duration: [7, 12], action: "review-area", actionLabel: "역세권 검토" },
  "heavy-rain": { tone: "change", title: "집중호우 예보", summary: "대중교통 수요는 늘지만 안전 운행 비용도 소폭 증가합니다.", demandMultiplier: 1.08, operatingCostMultiplier: 1.09, duration: [2, 4], action: "add-service", actionLabel: "운영 여력 확인" },
  "heavy-snow": { tone: "change", title: "대설 특보 가능성", summary: "승객 집중과 설비 점검으로 운영 부담이 증가합니다.", demandMultiplier: 1.06, operatingCostMultiplier: 1.13, duration: [2, 4], action: "add-service", actionLabel: "운영 여력 확인" },
  roadworks: { tone: "change", title: "대규모 도로 공사 시작", summary: "버스와 승용차 이용자가 철도로 이동할 기회가 생깁니다.", demandMultiplier: 1.12, operatingCostMultiplier: 1.03, duration: [5, 9], action: "add-service", actionLabel: "대체 수요 대응" },
  "demand-decline": { tone: "change", title: "지역 이동 수요 감소", summary: "해당 권역 이용 수요가 일시적으로 낮아질 전망입니다.", demandMultiplier: 0.88, operatingCostMultiplier: 1, duration: [5, 8], action: "review-fare", actionLabel: "운임·배차 검토" },
  "operating-cost": { tone: "change", title: "운영 물가 상승", summary: "에너지와 정비 비용이 한시적으로 상승합니다.", demandMultiplier: 1, operatingCostMultiplier: 1.12, duration: [5, 8], action: "review-fare", actionLabel: "수지 검토" },
  "construction-delay": { tone: "change", title: "공사 일정 조정 필요", summary: "진행 중인 공사에 안전 점검 기간이 추가됩니다.", demandMultiplier: 1, operatingCostMultiplier: 1, duration: [3, 5], action: "review-construction", actionLabel: "공사 일정 확인" },
  recession: { tone: "change", title: "지역 경기 둔화", summary: "통행 수요가 줄지만 합리적인 운임으로 이용을 유도할 수 있습니다.", demandMultiplier: 0.92, operatingCostMultiplier: 1.04, duration: [7, 12], action: "review-fare", actionLabel: "운임 전략 검토" },
};

type CityConfig = {
  name: string;
  center: LatLngExpression;
  mapBounds: L.LatLngBoundsExpression;
  minZoom: number;
  demandMultiplier: number;
  constructionMultiplier: number;
  mountainMultiplier: number;
  riverMultiplier: number;
  description: string;
};

const cityConfigs: Record<CityId, CityConfig> = {
  seoul: {
    name: "서울",
    center: [37.5665, 126.978],
    mapBounds: [[37.38, 126.65], [37.76, 127.3]],
    minZoom: 10,
    demandMultiplier: 1.45,
    constructionMultiplier: 1,
    mountainMultiplier: 1,
    riverMultiplier: 1.35,
    description: "높은 수요, 강 많음",
  },
  busan: {
    name: "부산",
    center: [35.1796, 129.0756],
    mapBounds: [[34.98, 128.72], [35.42, 129.35]],
    minZoom: 10,
    demandMultiplier: 1.05,
    constructionMultiplier: 1.25,
    mountainMultiplier: 1.55,
    riverMultiplier: 0.9,
    description: "산 많음, 건설 비용 증가",
  },
  daejeon: {
    name: "대전",
    center: [36.3504, 127.3845],
    mapBounds: [[36.17, 127.2], [36.55, 127.62]],
    minZoom: 11,
    demandMultiplier: 0.9,
    constructionMultiplier: 0.95,
    mountainMultiplier: 0.9,
    riverMultiplier: 0.85,
    description: "균형적인 지역 수요",
  },
  gwangju: {
    name: "광주",
    center: [35.1595, 126.8526],
    mapBounds: [[35.02, 126.62], [35.32, 127.1]],
    minZoom: 11,
    demandMultiplier: 0.82,
    constructionMultiplier: 0.9,
    mountainMultiplier: 0.95,
    riverMultiplier: 0.85,
    description: "분산된 지역 수요",
  },
};

type StationNamePlace = { name: string; position: [number, number] };
const stationNamePlaces: Record<CityId, StationNamePlace[]> = {
  seoul: [
    { name: "시청", position: [37.5663, 126.9779] },
    { name: "광화문", position: [37.5716, 126.9769] },
    { name: "종로", position: [37.5704, 126.9922] },
    { name: "동대문", position: [37.5714, 127.0097] },
    { name: "왕십리", position: [37.5615, 127.0377] },
    { name: "성수", position: [37.5446, 127.0559] },
    { name: "잠실", position: [37.5133, 127.1002] },
    { name: "강남", position: [37.4979, 127.0276] },
    { name: "용산", position: [37.5299, 126.9648] },
    { name: "여의도", position: [37.5217, 126.9243] },
    { name: "노량진", position: [37.5141, 126.9425] },
    { name: "홍대입구", position: [37.5572, 126.9254] },
    { name: "신촌", position: [37.5552, 126.9369] },
    { name: "마곡", position: [37.5602, 126.8255] },
    { name: "구로", position: [37.5032, 126.8820] },
    { name: "수유", position: [37.6381, 127.0257] },
  ],
  busan: [
    { name: "부산", position: [35.1151, 129.0414] },
    { name: "남포", position: [35.0978, 129.0348] },
    { name: "서면", position: [35.1578, 129.0590] },
    { name: "연산", position: [35.1861, 129.0815] },
    { name: "동래", position: [35.2056, 129.0785] },
    { name: "사상", position: [35.1624, 128.9846] },
    { name: "하단", position: [35.1062, 128.9667] },
    { name: "광안", position: [35.1579, 129.1131] },
    { name: "센텀시티", position: [35.1690, 129.1302] },
    { name: "해운대", position: [35.1632, 129.1588] },
  ],
  daejeon: [
    { name: "대전", position: [36.3323, 127.4342] },
    { name: "중앙로", position: [36.3287, 127.4255] },
    { name: "서대전", position: [36.3226, 127.4032] },
    { name: "둔산", position: [36.3518, 127.3787] },
    { name: "정부청사", position: [36.3580, 127.3818] },
    { name: "유성온천", position: [36.3537, 127.3413] },
    { name: "노은", position: [36.3741, 127.3178] },
    { name: "도안", position: [36.3217, 127.3427] },
    { name: "관저", position: [36.2982, 127.3372] },
  ],
  gwangju: [
    { name: "광주송정", position: [35.1378, 126.7915] },
    { name: "상무", position: [35.1466, 126.8486] },
    { name: "김대중컨벤션센터", position: [35.1432, 126.8415] },
    { name: "양동시장", position: [35.1542, 126.9014] },
    { name: "금남로", position: [35.1531, 126.9147] },
    { name: "문화전당", position: [35.1466, 126.9199] },
    { name: "조선대", position: [35.1443, 126.9300] },
    { name: "수완", position: [35.1903, 126.8245] },
    { name: "첨단", position: [35.2190, 126.8420] },
  ],
};

const difficultyConfigs: Record<Difficulty, { label: string; startCash: number; costMultiplier: number; demandMultiplier: number; bankruptcyLimit: number; loanInterestMultiplier: number }> = {
  easy: { label: "쉬움", startCash: 90000, costMultiplier: 0.85, demandMultiplier: 1.12, bankruptcyLimit: -35000, loanInterestMultiplier: 0.8 },
  normal: { label: "보통", startCash: 60000, costMultiplier: 1, demandMultiplier: 1, bankruptcyLimit: -18000, loanInterestMultiplier: 1 },
  hard: { label: "어려움", startCash: 42000, costMultiplier: 1.22, demandMultiplier: 0.9, bankruptcyLimit: -8000, loanInterestMultiplier: 1.35 },
};

const overlayState: Record<OverlayKey, boolean> = {
  administrative: false,
  landuse: false,
  rail: true,
  population: false,
};

// =============================================================================
// 애플리케이션 화면 골격
// 별도 UI 프레임워크 없이 정적 HTML을 한 번 주입하고, 아래에서 DOM 참조와
// 이벤트를 연결한다. 실제 지도 객체는 이 마크업이 만들어진 뒤 초기화해야 한다.
// =============================================================================

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <main class="game-shell">
    <section id="loadingScreen" class="loading-screen" aria-live="polite">
      <img class="loading-art" src="/branding/metro-maker-app-icon.png" alt="Metro Maker" />
      <span id="loadingStatus">관제 지도를 준비하고 있습니다</span>
      <div class="loading-track"><i id="loadingProgress"></i></div>
    </section>
    <section id="startScreen" class="start-screen" aria-label="game start">
      <div class="start-panel">
        <!-- Level 1: Hero Header & Title -->
        <header class="start-head">
          <div class="brand-title-group">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00F2FE" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3 12h18"/></svg>
            <h1 class="hero-title">SEOUL METRO SIMULATOR</h1>
          </div>
          <p class="hero-subtitle">수도권 도시 철도망 통합 관제 시스템</p>
        </header>

        <!-- Level 2: Primary Quick Action Hero Buttons -->
        <div class="start-primary-actions">
          <button id="continueButton" class="hero-action-btn continue-btn" type="button">
            <div class="hero-btn-content">
              <span class="hero-btn-icon">⚡</span>
              <div class="hero-btn-text">
                <strong>최근 슬롯 이어하기</strong>
                <small>마지막 관제 지도로 즉시 접속합니다</small>
              </div>
            </div>
          </button>
          <button id="newGameButton" class="hero-action-btn newgame-btn" type="button">
            <div class="hero-btn-content">
              <span class="hero-btn-icon">✨</span>
              <div class="hero-btn-text">
                <strong>새 관제 세이브 생성</strong>
                <small>아래 설정을 바탕으로 새로 구축합니다</small>
              </div>
            </div>
          </button>
        </div>

        <!-- Level 3: New Game Configuration Panel -->
        <section class="start-section-card setup-card">
          <div class="section-card-header">
            <span>CONFIG</span>
            <h2>⚙️ 새 세이브 옵션 설정</h2>
          </div>
          <div class="setup-grid">
            <section class="setup-city-field" aria-labelledby="cityPickerLabel">
              <div class="setup-field-label"><span id="cityPickerLabel">도시 선택</span><small>운영할 도시를 선택하세요</small></div>
              <select id="citySelect" class="city-native-select" aria-hidden="true" tabindex="-1"></select>
              <div id="cityPicker" class="city-picker" role="radiogroup" aria-labelledby="cityPickerLabel"></div>
            </section>
            <section class="setup-choice-field" data-choice-input="modeSelect" aria-labelledby="modePickerLabel">
              <div class="setup-field-label"><span id="modePickerLabel">게임 모드</span><small>운영 방식</small></div>
              <select id="modeSelect" class="setup-native-select" aria-hidden="true" tabindex="-1"><option value="sandbox">샌드박스 (자금 무제한)</option><option value="career">커리어 (경영 도전)</option></select>
              <div class="setup-choice-grid mode-choice-grid" role="radiogroup" aria-labelledby="modePickerLabel">
                <button class="setup-choice-card" type="button" data-choice-value="sandbox" role="radio"><i aria-hidden="true">∞</i><span><strong>샌드박스</strong><small>자유 건설 · 자금 제한 없음</small></span></button>
                <button class="setup-choice-card" type="button" data-choice-value="career" role="radio"><i aria-hidden="true">◆</i><span><strong>커리어</strong><small>자금 관리 · 도시 해금</small></span></button>
              </div>
            </section>
            <section class="setup-choice-field" data-choice-input="difficultySelect" aria-labelledby="difficultyPickerLabel">
              <div class="setup-field-label"><span id="difficultyPickerLabel">난이도</span><small>비용과 목표</small></div>
              <select id="difficultySelect" class="setup-native-select" aria-hidden="true" tabindex="-1"><option value="easy">쉬움</option><option value="normal" selected>보통</option><option value="hard">어려움</option></select>
              <div class="setup-choice-grid difficulty-choice-grid" role="radiogroup" aria-labelledby="difficultyPickerLabel">
                <button class="setup-choice-card" type="button" data-choice-value="easy" role="radio"><span><strong>쉬움</strong><small>여유롭게 시작</small></span></button>
                <button class="setup-choice-card" type="button" data-choice-value="normal" role="radio"><span><strong>보통</strong><small>표준 경영</small></span></button>
                <button class="setup-choice-card" type="button" data-choice-value="hard" role="radio"><span><strong>어려움</strong><small>도전적인 운영</small></span></button>
              </div>
            </section>
          </div>
          <div class="setup-footer">
            <label><span>세이브 이름</span><input id="slotNameInput" value="서울 1호 계획" maxlength="20" placeholder="슬롯 이름을 입력하세요" /></label>
            <div class="city-note" id="cityNote">✨ 서울: 높은 수요, 강 많음</div>
          </div>
        </section>

        <!-- Level 4: Save Slots Archive Panel -->
        <section class="start-section-card slots-card">
          <div class="section-card-header">
            <span>SAVED FILES</span>
            <h2>📑 세이브 슬롯 아카이브</h2>
          </div>
          <div class="slot-list" id="slotList"></div>
        </section>
      </div>
    </section>

    <section id="map" class="map" aria-label="Korea city rail map"></section>
    
    <!-- 재정 정보판: 왼쪽 위 (docs/design/MOBILE_UX.md §3) -->
    <div id="financePlate" class="dg-hud dg-plate game-plate game-plate--finance" role="group" aria-label="재정과 만족도">
      <button id="financeStatusButton" class="dg-plate__cell" type="button" aria-haspopup="dialog">
        <span class="dg-plate__key game-optional">자금</span>
        <strong id="cashReadout" class="dg-plate__metric">0 억</strong>
        <span class="dg-sr-only">일일 순수익</span>
        <span id="dailyNetReadout" class="game-status-net">0 억</span>
      </button>
      <button id="satisfactionPill" class="dg-plate__cell" type="button" aria-haspopup="dialog">
        <span id="satisfactionIcon" class="game-satisfaction-mark" aria-hidden="true">●</span>
        <span class="dg-sr-only">승객 만족도</span>
        <strong id="satisfactionReadout" class="dg-plate__metric">-</strong>
        <span id="satisfactionLevelReadout" class="dg-plate__key game-optional"></span>
      </button>
    </div>

    <!-- 시간 정보판: 오른쪽 위 -->
    <div id="timePlate" class="dg-hud dg-plate game-plate game-plate--time" role="group" aria-label="시간과 시스템">
      <div class="dg-plate__cell dg-plate__cell--stack">
        <span id="gameDayReadout" class="dg-plate__sub">1일차</span>
        <strong id="gameClockReadout" class="dg-plate__metric">00:00</strong>
      </div>
      <button id="pauseToggleButton" class="dg-plate__cell dg-plate__cell--icon game-pause-cell" type="button" data-paused="true" aria-label="재생">
        <svg class="game-icon-pause" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12"/><rect x="11.5" y="4" width="3.5" height="12"/></svg>
        <svg class="game-icon-play" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6 4 L16 10 L6 16 Z"/></svg>
      </button>
      <button id="speedCycleButton" class="dg-plate__cell game-speed-cell" type="button">×2</button>
      <button id="newsButton" class="dg-plate__cell dg-plate__cell--icon" type="button" aria-label="도시 뉴스">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M4 15 H16 L14.5 12.5 V8.5 A4.5 4.5 0 0 0 5.5 8.5 V12.5 Z M8.5 17.5 H11.5"/></svg>
        <span id="newsBadge" class="dg-count-badge" hidden>0</span>
      </button>
      <button id="menuButton" class="dg-plate__cell dg-plate__cell--icon" type="button" aria-label="메뉴">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 5 H17 M3 10 H17 M3 15 H17"/></svg>
      </button>
    </div>

    <!-- 모드·도구 레일: 왼쪽 가장자리 (docs/design/MOBILE_UX.md §3–§4) -->
    <nav id="workspaceModeBar" class="dg-hud dg-rail game-mode-rail" aria-label="작업 모드와 도구">
      <div class="dg-rail__modes" role="tablist" aria-label="상위 작업 모드">
        <button class="dg-rail__mode" type="button" data-workspace-mode="management" role="tab" aria-selected="true">관리</button>
        <button class="dg-rail__mode" type="button" data-workspace-mode="planning" role="tab" aria-selected="false">기획</button>
        <button class="dg-rail__mode" type="button" data-workspace-mode="construction" role="tab" aria-selected="false">공사</button>
      </div>
      <button id="railModeNowButton" class="dg-rail__mode-now" type="button" aria-expanded="false" aria-label="작업 모드 바꾸기"><span id="railModeMark" class="dg-mode-mark dg-mode-mark--manage" aria-hidden="true"></span><span id="railModeNowLabel">관리</span></button>
      <strong id="workspaceModeReadout" hidden>관리 모드</strong>
      <div id="railTools" class="game-rail-tools" role="group" aria-label="도구">
        <button id="selectTool" class="dg-tool" data-rail-tool type="button" aria-pressed="true" aria-label="지도 탐색"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="miter" aria-hidden="true"><path d="M5 3 L5 15 L8 12 L11 17 L13 16 L10 11 L14 11 Z"/></svg><span>탐색</span></button>
        <button id="routeTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 15 L9 9 H17"/><circle cx="3" cy="15" r="1.5"/><circle cx="17" cy="9" r="1.5"/></svg><span>노선 건설</span></button>
        <button id="stationTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg><span>역</span></button>
        <button id="transferTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="2" y="6" width="16" height="8" rx="4"/></svg><span>환승</span></button>
        <button id="depotTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="miter" aria-hidden="true"><path d="M3 17 V8 L10 3 L17 8 V17 Z M7 17 V11 H13 V17"/></svg><span>기지</span></button>
        <button id="extendTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false" aria-label="노선 연장"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 10 H10"/><path d="M13 10 H17" stroke-dasharray="2 2"/><circle cx="11" cy="10" r="2"/></svg><span>연장</span></button>
        <button id="branchTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false" aria-label="분기 추가"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 15 H17 M9 15 L15 5"/></svg><span>분기</span></button>
        <button id="mergeTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false" aria-label="노선 연결"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 6 H8 L12 14 H17 M3 14 H8"/></svg><span>연결</span></button>
        <button id="eraserTool" class="dg-tool dg-tool--destructive" data-rail-tool type="button" aria-pressed="false" aria-label="시설 범위 철거"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M4 6 H16 M8 6 V3 H12 V6 M6 6 L7 17 H13 L14 6"/></svg><span>철거</span></button>
        <button id="manageLineTool" class="dg-tool" data-rail-tool type="button"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M7 5 H17 M7 10 H17 M7 15 H17 M3 5 H4 M3 10 H4 M3 15 H4"/></svg><span>노선 목록</span></button>
        <button id="manageOperationsTool" class="dg-tool" data-rail-tool type="button"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 17 H17 M6 14 V9 M10 14 V5 M14 14 V11"/></svg><span>운영 현황</span></button>
        <button id="analysisButton" class="dg-tool" data-rail-tool type="button" aria-label="운영 분석 열기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 3 V17 H17 M6 13 L9 9 L12 11 L16 5"/></svg><span>운영 분석</span><em id="analysisBadge" class="dg-count-badge" hidden>0</em></button>
        <button id="manageMapTool" class="dg-tool" data-rail-tool type="button"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="miter" aria-hidden="true"><path d="M2 5 L7 3 L13 5 L18 3 V15 L13 17 L7 15 L2 17 Z M7 3 V15 M13 5 V17"/></svg><span>노선도</span></button>
        <button id="planOverviewButton" class="dg-tool" data-rail-tool type="button" aria-label="계획 목록 열기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 3 H17 V17 H3 Z M6 7 L8 9 L11 6 M6 13 H14"/></svg><span>계획 목록</span></button>
        <button id="constructionOverviewButton" class="dg-tool" data-rail-tool type="button" aria-label="공사 현황 열기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 17 H17 M5 17 V9 L10 5 L15 9 V17 M8 17 V12 H12 V17"/></svg><span>공사 현황</span></button>
        <!-- 현재 어떤 모드에서도 노출하지 않는 도구. 기능 연결을 유지하려고 남겨 둔다. -->
        <button id="expressButton" class="dg-tool" data-rail-tool type="button" aria-pressed="false" aria-label="급행 운행 설정" hidden><span id="expressButtonLabel">급행 해금</span></button>
        <button id="planningModeButton" class="dg-tool" data-rail-tool type="button" aria-pressed="false" hidden><span>계획</span></button>
        <button id="editTool" class="dg-tool" data-rail-tool type="button" aria-pressed="false" aria-label="노선 경로 수정" hidden><span>경로 편집</span></button>
        <button id="diagramToolButton" class="dg-tool" data-rail-tool type="button" hidden><span>노선도</span></button>
      </div>
      <button id="modifyToolsButton" class="dg-tool game-rail-more" type="button" aria-expanded="false" aria-controls="modifyToolsCard" hidden><svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><rect x="3" y="9" width="3" height="3"/><rect x="8.5" y="9" width="3" height="3"/><rect x="14" y="9" width="3" height="3"/></svg><span id="railMoreLabel">더보기</span></button>
    </nav>

    <section id="modifyToolsCard" class="dg-hud dg-panel game-rail-overflow" hidden aria-label="추가 도구">
      <p class="dg-panel__section-label">더보기</p>
      <div id="railOverflowTools" class="game-rail-overflow-tools" role="group" aria-label="추가 도구"></div>
    </section>

    <!-- 모드 배너: 현재 모드 · 도구 -->
    <div id="modeBanner" class="dg-hud dg-mode-banner game-mode-banner" role="status"><span id="modeBannerMark" class="dg-mode-mark dg-mode-mark--manage" aria-hidden="true"></span><span id="modeBannerText">관리 · 탐색</span></div>

    <!-- Map controls -->
    <div class="dg-hud dg-map-controls game-map-controls" aria-label="지도 컨트롤">
      <details class="game-layer-menu">
        <summary class="dg-icon-btn" aria-label="지도 레이어" title="지도 레이어">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="miter" aria-hidden="true"><path d="M10 3 L18 7 L10 11 L2 7 Z M2 11 L10 15 L18 11"/></svg>
        </summary>
        <div class="dg-panel game-layer-panel">
          <p class="dg-panel__section-label">지도 레이어</p>
          <button class="dg-tool game-layer-toggle" data-layer="rail" type="button" aria-pressed="true"><span class="game-layer-sample game-layer-sample--rail" aria-hidden="true"></span><span>기존 철도</span></button>
          <button class="dg-tool game-layer-toggle" data-layer="population" type="button" aria-pressed="false"><span class="game-layer-sample game-layer-sample--population" aria-hidden="true"></span><span>인구 밀도</span></button>
          <div class="game-density-legend" aria-label="인구 밀도 범례: 낮음에서 높음"><span>낮음</span><i aria-hidden="true"></i><span>높음</span></div>
        </div>
      </details>
    </div>

    <!-- History: 엄지 영역 -->
    <div class="dg-hud dg-map-controls game-history-controls" role="group" aria-label="작업 이력">
      <button id="undoButton" class="dg-icon-btn" type="button" aria-label="실행 취소" title="실행 취소">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M7 5 L3 9 L7 13 M3 9 H12 A4 4 0 0 1 12 17 H9"/></svg>
      </button>
      <button id="redoButton" class="dg-icon-btn" type="button" aria-label="다시 실행" title="다시 실행">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M13 5 L17 9 L13 13 M17 9 H8 A4 4 0 0 0 8 17 H11"/></svg>
      </button>
    </div>

    <label id="eraserSizeControl" class="dg-hud dg-plate game-bottom-bar" hidden><span class="dg-plate__cell dg-plate__key">철거 범위</span><span class="dg-plate__cell game-bottom-bar__range"><input id="eraserSizeRange" type="range" min="12" max="48" step="4" value="20" aria-label="철거 범위" /><output id="eraserSizeValue" class="dg-plate__metric">20</output></span></label>




    <!-- 노선 설정: 그리는 동안 레일 오른쪽에 두는 보조 패널 -->
    <section id="routeSettingsCard" class="dg-hud dg-panel game-side-panel" hidden aria-labelledby="routeSettingsTitle">
      <header class="dg-panel__header">
        <span id="routeSettingsHeaderSwatch" class="game-color-swatch" aria-hidden="true"></span>
        <h2 id="routeSettingsTitle" class="dg-panel__title"><span id="routeSettingsHeaderName">노선 설정</span></h2>
        <div class="dg-panel__header-end"><button id="routeSettingsExpandButton" class="dg-icon-btn game-side-panel__expand" type="button" aria-expanded="false" aria-controls="routeSettingsCard" aria-label="노선 설정 펼치기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 8 L10 13 L15 8"/></svg></button><button id="closeRouteSettingsButton" class="dg-icon-btn" type="button" aria-label="노선 설정 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
      </header>
      <div class="dg-panel__body">
        <section id="routeSettingsTarget" class="dg-panel__section" hidden>
          <p id="routeSettingsTargetKicker" class="dg-panel__section-label">수정 대상</p>
          <div class="game-inspector__route"><span id="routeSettingsTargetSwatch" class="game-color-swatch game-color-swatch--target" aria-hidden="true"></span><strong id="routeSettingsTargetName">노선을 선택하세요</strong></div>
          <p id="routeSettingsTargetMeta" class="game-inspector__note">지도에서 대상 노선을 선택하면 여기에 표시됩니다.</p>
        </section>
        <section id="routeSettingsEditFields" class="dg-panel__section game-side-panel__fields">
          <label class="dg-field"><span class="dg-field__label">이름</span><input id="draftRouteNameInput" class="dg-input" type="text" maxlength="32" placeholder="비우면 자동 이름" autocomplete="off" /></label>
          <div class="dg-field game-color-field" data-color-input="draftRouteColorInput">
            <span class="dg-field__label">노선 색</span>
            <input id="draftRouteColorInput" type="color" value="#3277ff" tabindex="-1" aria-hidden="true" hidden />
            <button type="button" class="dg-btn dg-btn--secondary dg-btn--compact game-color-trigger" data-open-color-picker="draftRouteColorInput"><span class="game-color-swatch" aria-hidden="true"></span><span data-color-value>#3277FF</span><span class="game-color-trigger__action" aria-hidden="true">›</span><span class="dg-sr-only">색 바꾸기</span></button>
          </div>
          <button id="saveRouteSettingsButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">설정 적용</button>
        </section>
      </div>
    </section>

    <div id="colorPickerDialog" class="dialog-backdrop color-picker-backdrop" hidden>
      <section class="color-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="colorPickerTitle">
        <header class="color-picker-header"><div><span>LINE APPEARANCE</span><h2 id="colorPickerTitle">노선 색상</h2></div><button id="closeColorPickerButton" class="dialog-close" type="button" aria-label="색상 조절 닫기">×</button></header>
        <div id="colorPreview" class="color-preview"><i aria-hidden="true"></i><div><strong id="colorHexReadout">#4CE0C3</strong><small>노선에 적용될 미리보기</small></div></div>
        <div class="color-controls">
          <label><span>색조</span><output id="colorHueValue">180°</output><input id="colorHueRange" type="range" min="0" max="360" value="180" aria-label="색조" /></label>
          <label><span>채도</span><output id="colorSaturationValue">70%</output><input id="colorSaturationRange" type="range" min="0" max="100" value="70" aria-label="채도" /></label>
          <label><span>밝기</span><output id="colorLightnessValue">55%</output><input id="colorLightnessRange" type="range" min="0" max="100" value="55" aria-label="밝기" /></label>
        </div>
        <label class="color-hex-field"><span>HEX</span><input id="colorHexInput" type="text" maxlength="7" inputmode="text" autocomplete="off" spellcheck="false" aria-label="HEX 색상 코드" /></label>
        <footer class="color-picker-actions"><button id="cancelColorPickerButton" type="button">취소</button><button id="applyColorPickerButton" class="primary" type="button">색상 적용</button></footer>
      </section>
    </div>

    <section id="operatingServiceMapEditBar" class="dg-hud dg-plate game-bottom-bar" aria-label="지도 정차역 편집" hidden>
      <div class="dg-plate__cell dg-plate__cell--stack game-bottom-bar__summary">
        <strong id="operatingServiceMapEditCount" class="dg-plate__metric">정차 0 · 통과 0</strong>
        <span class="dg-plate__sub">역을 탭해 정차·통과 전환 · 기점·종점은 필수</span>
      </div>
      <button id="cancelOperatingServiceMapEditButton" class="dg-plate__cell" type="button">취소</button>
      <button id="applyOperatingServiceMapEditButton" class="dg-plate__cell dg-plate__cell--on" type="button">적용</button>
    </section>

    <!-- 노선 목록: 레일 오른쪽 보조 패널 -->
    <section id="leftRouteWindow" class="dg-hud dg-panel game-side-panel" hidden aria-labelledby="leftRouteTitle">
      <header class="dg-panel__header">
        <svg class="dg-panel__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M7 5 H17 M7 10 H17 M7 15 H17 M3 5 H4 M3 10 H4 M3 15 H4"/></svg>
        <h2 id="leftRouteTitle" class="dg-panel__title">노선 목록</h2>
        <div class="dg-panel__header-end"><button id="closeLeftRouteWindowButton" class="dg-icon-btn" type="button" aria-label="노선 목록 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
      </header>
      <div class="dg-panel__body">
        <section class="dg-panel__section">
          <div class="dg-row"><span class="dg-row__label">운행 노선</span><strong id="leftRouteTotalCount" class="dg-row__value">0개</strong></div>
          <div class="dg-row"><span class="dg-row__label">총 연장</span><strong id="leftRouteTotalKm" class="dg-row__value">0 km</strong></div>
        </section>
        <div id="leftRouteList" class="game-route-list"></div>
      </div>
      <div class="dg-panel__actions"><button id="leftRouteNewButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">＋ 새 노선 건설</button></div>
    </section>


    <section class="economy-panel" hidden aria-live="polite">
      <div><span>수요</span><strong id="demandReadout">0</strong></div>
      <label><span>요금</span><input id="fareInput" type="number" min="900" max="4200" step="50" value="1450" /></label>
      <button id="autoFareButton" type="button" class="ops-button active" aria-pressed="true">자동</button>
      <button id="loanButton" type="button" class="ops-button">대출</button>
      <button id="repayButton" type="button" class="ops-button">상환</button>
    </section>




    <div id="settingsDialog" class="dg-hud dg-scrim game-settings" hidden>
      <section class="dg-panel dg-dialog" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <header class="dg-panel__header">
          <h2 id="settingsTitle" class="dg-panel__title">게임 설정</h2>
          <div class="dg-panel__header-end"><button id="closeSettingsButton" class="dg-icon-btn" type="button" aria-label="설정 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
        </header>
        <div class="dg-panel__body">
          <section class="dg-panel__section">
            <h3 class="dg-panel__section-label">화면</h3>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="mapThemeSelect"><strong>지도 테마</strong><small>종이: 밝은 지도(기본) · 먹: 어두운 지도</small></label>
              <select class="dg-input game-setting-row__select" id="mapThemeSelect">${MAP_THEMES.map((theme) => `<option value="${theme}">${MAP_THEME_LABELS[theme]}</option>`).join("")}</select>
            </div>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="reducedMotionToggle"><strong>모션 감소</strong><small>화면 전환과 애니메이션 축소</small></label>
              <input class="game-setting-row__check" id="reducedMotionToggle" type="checkbox" />
            </div>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="performanceSelect"><strong>성능</strong><small>열차 표시와 지도 자원 사용량</small></label>
              <select class="dg-input game-setting-row__select" id="performanceSelect"><option value="balanced">균형</option><option value="battery">절전</option></select>
            </div>
          </section>
          <section class="dg-panel__section">
            <h3 class="dg-panel__section-label">피드백</h3>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="soundToggle"><strong>효과음</strong><small>건설과 조작 피드백</small></label>
              <input class="game-setting-row__check" id="soundToggle" type="checkbox" checked />
            </div>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="hapticsToggle"><strong>진동</strong><small>지원 기기에서 촉각 피드백</small></label>
              <input class="game-setting-row__check" id="hapticsToggle" type="checkbox" checked />
            </div>
          </section>
          <section class="dg-panel__section">
            <h3 class="dg-panel__section-label">게임</h3>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="sandboxConstructionTimeToggle"><strong>샌드박스 공사 기간</strong><small>샌드박스에서도 공사와 개통 절차 사용</small></label>
              <input class="game-setting-row__check" id="sandboxConstructionTimeToggle" type="checkbox" />
            </div>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="autoStationNamingToggle"><strong>역 이름 자동 생성</strong><small>1km 안 가장 가까운 실제 역 → 동네명 → 주변 시설</small></label>
              <input class="game-setting-row__check" id="autoStationNamingToggle" type="checkbox" checked />
            </div>
          </section>
          <section class="dg-panel__section">
            <h3 class="dg-panel__section-label">저장</h3>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="autoSaveToggle"><strong>자동 저장</strong><small>현재 슬롯을 설정한 주기로 저장</small></label>
              <input class="game-setting-row__check" id="autoSaveToggle" type="checkbox" checked />
            </div>
            <div class="game-setting-row">
              <label class="game-setting-row__text" for="autoSaveIntervalSelect"><strong>자동 저장 주기</strong><small>자동 저장이 켜졌을 때 적용</small></label>
              <select class="dg-input game-setting-row__select" id="autoSaveIntervalSelect"><option value="30">30초</option><option value="60">1분</option><option value="180">3분</option><option value="300">5분</option></select>
            </div>
            <div class="game-setting-row"><span id="cacheReadout" class="game-setting-row__text"><small>지도 캐시 확인 중</small></span><button id="clearCacheButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button"><span>캐시 정리</span></button></div>
          </section>
        </div>
      </section>
    </div>

    <div id="financeDialog" class="dg-hud dg-scrim game-finance" hidden>
      <section class="dg-panel dg-dialog" role="dialog" aria-modal="true" aria-labelledby="financeTitle">
        <header class="dg-panel__header">
          <h2 id="financeTitle" class="dg-panel__title">자금과 재정</h2>
          <div class="dg-panel__header-end"><button id="closeFinanceButton" class="dg-icon-btn" type="button" aria-label="재정 관리 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
        </header>
        <div class="dg-panel__body">
          <section class="dg-panel__section">
            <h3 class="dg-panel__section-label">현황</h3>
            <div class="dg-row"><span class="dg-row__label">보유 자금</span><strong id="financeCashReadout" class="dg-row__value dg-row__value--metric">0 억</strong></div>
            <div class="dg-row"><span class="dg-row__label">오늘 순수익</span><strong id="financeDailyNetReadout" class="dg-row__value game-status-net">0 억</strong></div>
            <div class="dg-row"><span class="dg-row__label">대출 잔액</span><strong id="financeLoanReadout" class="dg-row__value">0 억</strong></div>
            <div class="dg-row"><span class="dg-row__label">일일 수송 수요</span><strong id="financeDemandReadout" class="dg-row__value">0 명</strong></div>
          </section>
          <div id="financeForecastContent"></div>
          <section class="dg-panel__section">
            <h3 class="dg-panel__section-label">대출</h3>
            <p id="financeLoanNote" class="game-inspector__note">사업 확장을 위해 대출을 받거나 기존 대출을 상환합니다. 실행 전에 금액과 실행 후 잔액을 확인합니다.</p>
            <div class="game-finance__actions">
              <button id="dialogLoanButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">대출 받기…</button>
              <button id="dialogRepayButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">상환하기…</button>
            </div>
          </section>
          <section class="dg-panel__section game-menu__links">
            <button id="openStatisticsFromFinanceButton" class="dg-tool" type="button"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 17 H17 M6 14 V9 M10 14 V5 M14 14 V11"/></svg><span>노선별 운영 현황 보기</span></button>
          </section>
        </div>
      </section>
    </div>

    <div id="satisfactionDialog" class="dg-hud dg-scrim game-report" hidden>
      <section class="dg-panel dg-dialog" role="dialog" aria-modal="true" aria-labelledby="satisfactionDialogTitle">
        <header class="dg-panel__header">
          <h2 id="satisfactionDialogTitle" class="dg-panel__title">승객 만족도</h2>
          <div class="dg-panel__header-end"><button id="closeSatisfactionButton" class="dg-icon-btn" type="button" aria-label="승객 만족도 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
        </header>
        <div id="satisfactionDialogContent" class="dg-panel__body"></div>
      </section>
    </div>

    <!-- 알림 묶음: 위쪽 가운데. 오류 배너 → 튜토리얼 → 토스트 순으로 쌓는다 -->
    <div class="dg-hud game-notice-stack">
      <div id="errorBanner" class="dg-hud dg-banner dg-banner--danger game-error-banner" hidden role="alert"><span class="dg-banner__icon" aria-hidden="true">✕</span><span id="errorMessage">일시적인 오류가 발생했습니다.</span><span class="dg-banner__actions"><button id="errorRetryButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">재시도</button><button id="errorDismissButton" class="dg-icon-btn" type="button" aria-label="오류 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></span></div>
      <section id="tutorialPanel" class="dg-hud dg-panel game-tutorial" hidden aria-live="polite" aria-labelledby="tutorialTitle">
        <div class="dg-panel__section game-tutorial__body">
          <span class="dg-tag" id="tutorialStep">01 / 10</span>
          <div class="game-tutorial__copy"><strong id="tutorialTitle" class="dg-text-sign">지도를 움직여 보세요</strong><p id="tutorialText">한 손가락으로 이동하고 두 손가락으로 확대하세요.</p><small id="tutorialFeedback">직접 조작하면 다음 단계가 열립니다.</small></div>
        </div>
        <div class="dg-panel__actions"><button id="tutorialSkipButton" class="dg-btn dg-btn--quiet dg-btn--compact" type="button" aria-label="튜토리얼 건너뛰기">건너뛰기</button><button id="tutorialNextButton" class="dg-btn dg-btn--primary dg-btn--compact dg-panel__actions-push" type="button">확인</button></div>
      </section>
      <div id="toast" class="dg-hud dg-toast game-toast" hidden role="status"></div>
    </div>

    <!-- 건설·철거 검토: 오른쪽 아래 inspector 자리. 확정은 오른쪽 아래 엄지 위치 (MOBILE_UX §7.2) -->
    <aside id="constructionPreviewPanel" class="dg-hud dg-panel game-inspector game-review" hidden aria-live="polite" aria-labelledby="constructionPreviewTitle">
      <header class="dg-panel__header">
        <svg class="dg-panel__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><path d="M3 15 L9 9 H17"/><circle cx="3" cy="15" r="1.5"/><circle cx="17" cy="9" r="1.5"/></svg>
        <h2 id="constructionPreviewTitle" class="dg-panel__title">건설 검토</h2>
        <span id="constructionPreviewKicker" class="dg-tag game-review__tag">공사</span>
        <div class="dg-panel__header-end"><button id="closeConstructionPreviewButton" class="dg-icon-btn" type="button" aria-label="검토 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
      </header>
      <div class="game-inspector__content">
        <div id="constructionPreviewDetails" class="dg-panel__body">
          <section class="dg-panel__section">
            <p id="constructionPreviewSubtitle" class="game-inspector__note">범위와 비용을 확인한 뒤 확정하세요.</p>
          <div class="dg-row"><span id="previewTotalCostLabel" class="dg-row__label">예상 총비용</span><span id="previewTotalCost" class="dg-row__value dg-row__value--metric">0억</span></div>
          <div class="dg-row"><span id="previewBalanceLabel" class="dg-row__label">건설 후 잔액</span><span id="previewBalance" class="dg-row__value">0억</span></div>
          <div class="dg-row"><span id="previewDurationLabel" class="dg-row__label">예상 공기</span><span id="previewDuration" class="dg-row__value">0일</span></div>
          </section>
          <section class="dg-panel__section">
            <h3 class="dg-panel__section-label">세부</h3>
          <div class="dg-row"><span id="previewLengthLabel" class="dg-row__label">총 길이</span><span id="previewLength" class="dg-row__value">0m</span></div>
          <div class="dg-row"><span id="previewBaseCostLabel" class="dg-row__label">기본 건설비</span><span id="previewBaseCost" class="dg-row__value">0억</span></div>
          <div class="dg-row"><span id="previewMountainLabel" class="dg-row__label">산악 구간</span><span id="previewMountain" class="dg-row__value">없음</span></div>
          <div class="dg-row"><span id="previewRiverCountLabel" class="dg-row__label">강 통과</span><span id="previewRiverCount" class="dg-row__value">없음</span></div>
          <div class="dg-row"><span id="previewStationCountLabel" class="dg-row__label">역 연결/설치</span><span id="previewStationCount" class="dg-row__value">0개</span></div>
          <div class="dg-row"><span id="previewDepotConnectionLabel" class="dg-row__label">차량기지 연결</span><span id="previewDepotConnection" class="dg-row__value">미연결</span></div>
          </section>
          <section id="riverChoiceList" class="dg-panel__section" hidden></section>
          <section id="constructionWarnings" class="dg-panel__section game-review__warnings"></section>
        </div>
        <div class="dg-panel__actions">
          <button id="cancelConstructionButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">취소</button>
          <strong id="headerPreviewCost" class="game-review__cost dg-panel__actions-push">0억</strong>
          <button id="confirmConstructionButton" class="dg-btn dg-btn--primary" type="button" disabled>건설 확정</button>
        </div>
      </div>
      <!-- 이전 최소화 머리글용 확정 버튼. 동작 연결을 유지하려고 숨겨 둔다. -->
      <button id="headerConfirmConstructionButton" class="dg-hook" type="button" hidden>건설 확정</button>
    </aside>

    <section id="diagramScreen" class="diagram-screen" hidden aria-label="자동 노선도">
      <header class="diagram-header">
        <div class="diagram-brand">
          <div><span>NETWORK MAP</span><strong id="diagramCompanyName">서울 철도망</strong></div>
        </div>
        <div class="diagram-controls">
          <label><span>표시 노선</span><select id="diagramRouteFilter" aria-label="노선도 표시 노선"></select></label>
          <label><span>배경</span><select id="diagramBackgroundSelect" aria-label="노선도 배경색">
            <option value="dark">다크</option><option value="light">라이트</option><option value="blueprint">청사진</option>
          </select></label>
          <label class="diagram-check"><input id="diagramLabelsToggle" type="checkbox" checked /><span>역 이름</span></label>
          <label class="diagram-check"><input id="diagramCompanyToggle" type="checkbox" checked /><span>철도망 정보</span></label>
          <button id="resetDiagramLayoutButton" type="button">자동 재배치</button>
          <button id="saveDiagramSvgButton" type="button">SVG 저장</button>
          <button id="exportShareJsonButton" type="button">공유 JSON</button>
          <button id="importShareJsonButton" type="button">JSON 가져오기</button>
          <input id="importShareJsonInput" type="file" accept="application/json,.json" hidden />
          <button id="closeDiagramButton" class="diagram-close" type="button" aria-label="노선도 닫기">×</button>
        </div>
      </header>
      <div class="diagram-workspace">
        <div class="diagram-help"><strong>자동 노선도</strong><span>역을 드래그해 위치를 조정할 수 있습니다. 조정값은 세이브에 저장됩니다.</span></div>
        <svg id="metroDiagramSvg" viewBox="0 0 1800 1000" role="img" aria-labelledby="diagramSvgTitle diagramSvgDescription">
          <title id="diagramSvgTitle">자동 생성 지하철 노선도</title>
          <desc id="diagramSvgDescription">실제 노선, 분기, 급행 정차역과 환승 그룹을 현재 운행 구조에 맞춰 단순화한 노선도</desc>
          <g id="diagramBackgroundLayer"></g>
          <g id="diagramRouteLayer"></g>
          <g id="diagramStationLayer"></g>
          <g id="diagramLabelLayer"></g>
          <g id="diagramCompanyLayer"></g>
        </svg>
        <div id="diagramEmptyState" class="diagram-empty" hidden><strong>표시할 노선이 없습니다</strong><span>실제 노선과 역을 건설하면 자동 노선도가 생성됩니다.</span></div>
      </div>
      <footer class="diagram-legend">
        <span><i class="legend-station"></i> 일반역</span>
        <span><i class="legend-express"></i> 급행 정차역</span>
        <span><i class="legend-transfer"></i> 환승역</span>
        <span><i class="legend-terminal"></i> 노선 끝점</span>
        <div id="diagramRouteLegend" class="diagram-route-legend" aria-label="노선 색상 범례"></div>
        <strong id="diagramStatus">자동 배치</strong>
      </footer>
    </section>

    <section id="analysisScreen" class="analysis-screen" hidden aria-label="운영 분석 보고서">
      <header class="analysis-header">
        <div class="analysis-heading">
          <span><i aria-hidden="true"></i> OPERATIONS INTELLIGENCE</span>
          <div><h2>운영 분석 센터</h2><strong id="analysisUpdatedAt">게임 0일차</strong></div>
          <p>수요·혼잡·수익·시설 용량을 종합해 지금 확인할 운영 과제를 정리합니다.</p>
        </div>
        <div class="analysis-header-actions">
          <button id="refreshAnalysisButton" type="button"><span aria-hidden="true">↻</span> 데이터 새로고침</button>
          <button id="closeAnalysisButton" class="analysis-close" type="button" aria-label="운영 분석 닫기">×</button>
        </div>
      </header>
      <div class="analysis-body">
        <aside class="analysis-summary">
          <div class="analysis-score-card">
            <div class="analysis-score-title"><span>NETWORK HEALTH</span><small>종합 운영 건전성</small></div>
            <div class="analysis-score-ring"><strong id="analysisHealthScore">100</strong><small>/ 100</small></div>
            <em id="analysisHealthLabel">안정적</em>
          </div>
          <div class="analysis-summary-grid">
            <div class="critical"><i aria-hidden="true">!</i><span>긴급</span><strong id="analysisCriticalCount">0</strong></div>
            <div class="warning"><i aria-hidden="true">△</i><span>주의</span><strong id="analysisWarningCount">0</strong></div>
            <div class="info"><i aria-hidden="true">i</i><span>참고</span><strong id="analysisInfoCount">0</strong></div>
          </div>
          <label class="analysis-filter"><span>보고서 필터</span><select id="analysisFilter">
            <option value="active">현재 제안</option>
            <option value="later">나중에 보기</option>
            <option value="all">전체</option>
          </select></label>
          <div class="analysis-principle"><i aria-hidden="true">◇</i><div><strong>분석은 조언만 제공합니다</strong><span>자금 사용과 노선 변경은 플레이어가 실행할 때만 반영됩니다.</span></div></div>
        </aside>
        <div class="analysis-report">
          <section class="analysis-section urgent">
            <div class="analysis-section-title"><div><span>PRIORITY ACTIONS</span><h3><i aria-hidden="true">!</i> 우선 대응</h3></div><strong id="analysisUrgentLabel"></strong></div>
            <div id="analysisUrgentList" class="analysis-list"></div>
          </section>
          <section class="analysis-section">
            <div class="analysis-section-title"><div><span>DAILY OPERATIONS REPORT</span><h3><i aria-hidden="true">≡</i> 운영 제안</h3></div><strong>운영 지표를 기준으로 자동 정렬</strong></div>
            <div id="analysisReportList" class="analysis-list"></div>
          </section>
          <div id="analysisEmptyState" class="analysis-empty" hidden><i aria-hidden="true">✓</i><strong>현재 운영 상태가 안정적입니다</strong><span>새로운 추세가 발견되면 이곳에 운영 제안을 표시합니다.</span></div>
        </div>
      </div>
    </section>


    <!-- 선택 객체 inspector: 오른쪽 아래, 지도와 함께 쓰는 비모달 표면 (MOBILE_UX §7.1, §8) -->
    <aside id="stationManagerDialog" class="dg-hud dg-panel game-inspector" hidden aria-labelledby="stationManagerTitle">
      <header class="dg-panel__header">
        <svg class="dg-panel__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg>
        <h2 id="stationManagerTitle" class="dg-panel__title">역</h2>
        <div class="dg-panel__header-end"><button id="closeStationManagerButton" class="dg-icon-btn" type="button" aria-label="역 정보 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
      </header>
      <div id="stationManagerContent" class="game-inspector__content"></div>
    </aside>

    <aside id="depotManagerDialog" class="dg-hud dg-panel game-inspector" hidden aria-labelledby="depotManagerTitle">
      <header class="dg-panel__header">
        <svg class="dg-panel__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="miter" aria-hidden="true"><path d="M3 17 V8 L10 3 L17 8 V17 Z M7 17 V11 H13 V17"/></svg>
        <h2 id="depotManagerTitle" class="dg-panel__title">차량기지</h2>
        <div class="dg-panel__header-end"><button id="closeDepotManagerButton" class="dg-icon-btn" type="button" aria-label="차량기지 정보 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
      </header>
      <div id="depotManagerContent" class="game-inspector__content"></div>
    </aside>

    <section id="statisticsScreen" class="statistics-screen" hidden aria-label="운영 현황 및 통계">
      <header class="statistics-header">
        <div class="statistics-title">
          <span>NETWORK STATUS</span>
          <div><h2 id="statisticsNetworkTitle">서울 철도망</h2><strong id="statisticsCityLabel">서울</strong></div>
          <p id="statisticsSaveMeta">샌드박스 · 보통 · 플레이 0분</p>
        </div>
        <div class="statistics-title-editor">
          <label><span>철도망 제목</span><input id="networkTitleInput" maxlength="40" placeholder="입력하지 않으면 도시 이름 사용" /></label>
          <button id="saveNetworkTitleButton" type="button">제목 저장</button>
          <button id="closeStatisticsButton" class="statistics-close" type="button" aria-label="운영 현황 닫기">×</button>
        </div>
      </header>
      <nav class="statistics-tabs" aria-label="통계 범위">
        <button class="active" type="button" data-statistics-tab="overview" aria-pressed="true">전체 현황</button>
        <button type="button" data-statistics-tab="routes" aria-pressed="false">노선</button>
        <button type="button" data-statistics-tab="stations" aria-pressed="false">역</button>
        <button type="button" data-statistics-tab="city" aria-pressed="false">도시</button>
      </nav>
      <div id="statisticsContent" class="statistics-content"></div>
    </section>

    <section id="newsScreen" class="news-screen" hidden aria-label="도시 뉴스 및 이벤트">
      <header class="news-header">
        <div>
          <span>CITY NEWSWIRE</span>
          <h2>도시 뉴스 및 이벤트</h2>
          <p>도시 변화가 수요와 비용에 미치는 영향을 확인하고 대응을 준비하세요.</p>
        </div>
        <div class="news-header-actions">
          <label><span>보기</span><select id="newsFilter" aria-label="뉴스 필터"><option value="active">진행 중</option><option value="all">전체 기록</option></select></label>
          <button id="closeNewsButton" class="news-close" type="button" aria-label="뉴스 닫기">×</button>
        </div>
      </header>
      <div class="news-summary">
        <div><span>진행 중</span><strong id="activeNewsCount">0</strong></div>
        <div><span>수요 기회</span><strong id="opportunityNewsCount">0</strong></div>
        <div><span>비용·운영 변화</span><strong id="changeNewsCount">0</strong></div>
        <p>대응 버튼은 준비 화면으로 이동할 뿐, 자금이나 시설을 자동으로 변경하지 않습니다.</p>
      </div>
      <div id="newsFeed" class="news-feed"></div>
    </section>

    <div id="constructionManagerDialog" class="dialog-backdrop" hidden>
      <section class="construction-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="constructionManagerTitle">
        <div class="dialog-heading">
          <div><span>CONSTRUCTION STATUS</span><h2 id="constructionManagerTitle">공사 및 개통 현황</h2></div>
          <button id="closeConstructionManagerButton" class="dialog-close" type="button" aria-label="공사 현황 닫기">×</button>
        </div>
        <p class="construction-manager-help">커리어 모드에서는 공사가 끝난 뒤 개통 조건을 확인합니다. 샌드박스 건설은 즉시 운영됩니다.</p>
        <div id="constructionProjectList" class="construction-project-list"></div>
      </section>
    </div>

    <div id="planningDialog" class="dialog-backdrop" hidden>
      <section class="planning-dialog" role="dialog" aria-modal="true" aria-labelledby="planningDialogTitle">
        <div class="dialog-heading planning-dialog-heading">
          <div class="planning-heading-copy">
            <span>PLANNING PORTFOLIO</span>
            <h2 id="planningDialogTitle">기획 목록</h2>
            <p>기획안을 비교하고 포함된 노선과 시설을 관리합니다.</p>
          </div>
          <button id="closePlanningButton" class="dialog-close" type="button" aria-label="계획 관리 닫기">×</button>
        </div>
        <div class="planning-toolbar" aria-label="기획안 관리">
          <label class="planning-selector"><span>현재 기획안</span><select id="activePlanSelect" aria-label="활성 계획"></select></label>
          <div class="planning-toolbar-actions">
            <button id="newPlanButton" type="button"><span aria-hidden="true">＋</span> 새 기획안</button>
            <button id="duplicatePlanButton" type="button"><span aria-hidden="true">▣</span> 복제</button>
            <button id="deletePlanButton" class="planning-delete-button" type="button"><span aria-hidden="true">⌫</span> 삭제</button>
          </div>
        </div>
        <div class="planning-layout">
          <section class="planning-editor">
            <div class="planning-section-heading"><span aria-hidden="true">01</span><div><strong>기본 정보</strong><small>기획안의 목적과 검토 상태를 정합니다.</small></div></div>
            <div class="planning-form-card">
              <label><span>기획안 이름</span><input id="planNameInput" maxlength="32" /></label>
              <div class="planning-field-row">
              <label><span>검토 상태</span><select id="planStatusSelect">
                <option value="draft">초안</option><option value="review">검토 중</option>
                <option value="insufficient">자금 부족</option><option value="ready">건설 가능</option>
                <option value="partial">일부 건설</option><option value="completed">완공</option>
                <option value="on-hold">보류</option>
              </select></label>
              <label><span>우선순위</span><select id="planPrioritySelect">
                <option value="low">낮음</option><option value="normal">보통</option>
                <option value="high">높음</option><option value="critical">최우선</option>
              </select></label>
              </div>
              <label><span>추진 메모</span><textarea id="planNotesInput" rows="3" maxlength="500" placeholder="건설 목적과 단계별 추진 사항을 기록하세요"></textarea></label>
            </div>
            <div class="planning-section-heading"><span aria-hidden="true">02</span><div><strong>예상 효과</strong><small>현재 설계에 반영된 비용과 운영 효과입니다.</small></div></div>
            <div id="planSummary" class="plan-summary"></div>
            <div class="planning-section-heading"><span aria-hidden="true">03</span><div><strong>포함 항목</strong><small>지도 도구로 추가한 노선과 시설을 관리합니다.</small></div></div>
            <div id="planAssetList" class="plan-asset-list"></div>
            <div class="planning-actions">
              <button id="savePlanButton" class="planning-save-button" type="button">변경 저장</button>
              <button id="convertPlanButton" type="button"><span aria-hidden="true">▶</span> 건설 검토</button>
            </div>
          </section>
          <section class="plan-comparison">
            <div class="section-title"><span>COMPARE</span><div><strong>기획안 비교</strong><small>수요와 비용을 한눈에 비교하세요.</small></div></div>
            <div id="planComparisonList"></div>
          </section>
        </div>
      </section>
    </div>

    <div id="planConversionDialog" class="dialog-backdrop" hidden>
      <section class="plan-conversion-dialog" role="dialog" aria-modal="true" aria-labelledby="planConversionTitle">
        <div class="dialog-heading plan-conversion-heading">
          <div class="plan-conversion-heading-icon" aria-hidden="true">▣</div>
          <div><span>BUILD FROM PLAN</span><h2 id="planConversionTitle">실제 건설 전환</h2><p id="planConversionPlanName">현재 기획안</p></div>
          <button id="closePlanConversionButton" class="dialog-close" type="button" aria-label="실제 건설 전환 닫기">×</button>
        </div>
        <div class="plan-conversion-intro">
          <div><strong>기획안을 실제 공사로 전환합니다</strong><span>선택하지 않은 항목은 기획안에 남아 나중에 이어서 건설할 수 있습니다.</span></div>
          <div class="plan-conversion-balance"><span>현재 자금</span><strong id="planConversionCurrentCash">0억</strong></div>
        </div>
        <div class="plan-conversion-layout">
          <section class="plan-conversion-selection">
            <div class="plan-conversion-toolbar">
              <div><span>BUILD SCOPE</span><strong>건설 범위 선택</strong></div>
              <div>
                <button id="selectAllPlanConversionButton" type="button">전체 선택</button>
                <button id="clearPlanConversionButton" type="button">선택 해제</button>
              </div>
            </div>
            <div id="planConversionItems" class="plan-conversion-items"></div>
          </section>
          <aside id="planConversionSummary" class="plan-conversion-summary"></aside>
        </div>
        <div class="conversion-actions">
          <button id="fundPlanWithLoanButton" type="button" hidden>대출 30,000억 받기</button>
          <button id="cancelPlanConversionButton" type="button">취소</button>
          <button id="confirmPlanConversionButton" class="action-button action-button--build" type="button"><span class="button-icon" aria-hidden="true">▶</span><span>선택 항목 건설</span></button>
        </div>
      </section>
    </div>

    <div id="routeChoiceDialog" class="dg-hud dg-scrim game-chooser" hidden>
      <section class="dg-panel dg-dialog" role="dialog" aria-modal="true" aria-labelledby="routeChoiceTitle">
        <header class="dg-panel__header"><h2 id="routeChoiceTitle" class="dg-panel__title">여기서 무엇을 선택할까요?</h2><div class="dg-panel__header-end"><button id="closeRouteChoiceButton" class="dg-icon-btn" type="button" aria-label="선택 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div></header>
        <div id="routeChoiceList" class="dg-panel__body game-chooser__list"></div>
      </section>
    </div>

    <!-- 노선 inspector: 오른쪽 아래 (MOBILE_UX §7.1, §7.4) -->
    <aside id="rightLineControlCard" class="dg-hud dg-panel game-inspector game-inspector--tall game-line-inspector" hidden aria-labelledby="selectedLineTitle">
      <header class="dg-panel__header">
        <span id="selectedLineColor" class="game-color-swatch game-line-inspector__swatch" aria-hidden="true"></span>
        <h2 id="selectedLineTitle" class="dg-panel__title">노선 선택</h2>
        <div class="dg-panel__header-end"><button id="closeLineManagerButton" class="dg-icon-btn" type="button" aria-label="노선 정보 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
      </header>
      <div class="game-inspector__content">
        <div class="dg-panel__body">
          <section id="selectedLineBadgeHeader" class="dg-panel__section">
            <p id="lineManagerTitle" class="dg-panel__section-label">노선 관리</p>
            <p id="selectedLineMeta" class="game-inspector__note">지도를 눌러 노선을 선택하세요</p>
            <div class="dg-row"><span class="dg-row__label">배차 간격</span><span id="headwayReadout" class="dg-row__value">-</span></div>
            <div class="dg-row"><span class="dg-row__label">혼잡</span><span id="crowdingReadout" class="dg-row__value">-</span></div>
            <div class="dg-row"><span class="dg-row__label">평균 대기</span><span id="waitReadout" class="dg-row__value">-</span></div>
            <p id="lineManagerSummary" class="game-inspector__note"></p>
          </section>

          <details id="operatingServiceSection" class="dg-panel__section game-fold" open>
            <summary class="game-fold__summary"><span class="dg-panel__section-label">운행 계통</span><span id="operatingServiceCount" class="game-inspector__section-meta">0개</span></summary>
            <div id="operatingServiceList" class="game-service-list"></div>
            <button id="addOperatingServiceButton" class="dg-btn dg-btn--secondary dg-btn--compact game-fold__action" type="button">＋ 운행 계통 추가</button>
            <form id="operatingServiceEditor" class="game-service-editor" hidden>
              <div class="game-service-editor__head"><strong id="operatingServiceEditorTitle">새 운행 계통</strong><button id="cancelOperatingServiceButton" class="dg-icon-btn" type="button" aria-label="계통 편집 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
              <label class="dg-field"><span class="dg-field__label">계통 이름</span><input id="operatingServiceNameInput" class="dg-input" maxlength="28" required /></label>
              <label class="dg-field"><span class="dg-field__label">운행 경로 · 분기 방향</span><select id="operatingServicePathSelect" class="dg-input"></select></label>
              <div class="dg-field"><span class="dg-field__label">정차 방식</span>
                <div class="dg-seg game-service-presets" role="group" aria-label="정차 프리셋">
                  <button class="dg-seg__item" type="button" data-service-preset="all" aria-pressed="false">일반 · 전 역</button>
                  <button class="dg-seg__item" type="button" data-service-preset="transfer" aria-pressed="false">급행 · 환승역</button>
                  <button class="dg-seg__item" type="button" data-service-preset="terminal" aria-pressed="false">직행 · 양 끝역</button>
                </div>
              </div>
              <button id="editOperatingServiceStopsOnMapButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button" aria-pressed="false">⌖ 지도에서 정차역 설정</button>
              <div class="dg-field"><span class="dg-field__label">정차역</span><div id="operatingServiceStopList" class="game-stop-list"></div></div>
              <div class="game-service-editor__actions"><button id="deleteOperatingServiceButton" class="dg-btn dg-btn--danger-quiet dg-btn--compact" type="button" hidden>계통 삭제</button><button class="dg-btn dg-btn--primary dg-btn--compact" type="submit">계통 저장</button></div>
            </form>
            <div id="operatingServiceTrainAction" class="game-fold__action" hidden>
              <button id="openTrainManagerFromLineCardButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">열차 운행·편성 관리</button>
            </div>
          </details>

          <details class="dg-panel__section game-fold">
            <summary class="game-fold__summary"><span class="dg-panel__section-label">노선 설정</span></summary>
            <div class="game-fold__fields">
              <label class="dg-field"><span class="dg-field__label">노선 이름</span><input id="lineNameInput" class="dg-input" maxlength="28" /></label>
              <div class="dg-field game-color-field" data-color-input="lineColorInput">
                <span class="dg-field__label">노선 색</span>
                <input id="lineColorInput" type="color" tabindex="-1" aria-hidden="true" hidden />
                <button type="button" class="dg-btn dg-btn--secondary dg-btn--compact game-color-trigger" data-open-color-picker="lineColorInput"><span class="game-color-swatch" aria-hidden="true"></span><span data-color-value>#000000</span><span class="game-color-trigger__action" aria-hidden="true">›</span><span class="dg-sr-only">색 바꾸기</span></button>
              </div>
              <label class="dg-field"><span class="dg-field__label">공개 상태</span><select id="lineVisibilitySelect" class="dg-input"><option value="public">공개 노선</option><option value="planning">계획 노선</option></select></label>
              <div class="dg-field"><label class="dg-field__label" for="lineFareInput">기본 요금 (원)</label>
                <span class="game-inspector__inline"><input id="lineFareInput" class="dg-input" type="number" min="900" max="4200" step="50" value="1450" /><button id="lineAutoFareButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">자동 요금</button></span>
              </div>
              <label class="game-check"><input id="operationPausedToggle" type="checkbox" /><span>운행 일시중지</span></label>
              <span class="dg-hook" hidden><input id="localServiceToggle" type="checkbox" /><input id="expressServiceToggle" type="checkbox" /></span>
            </div>
          </details>
        </div>
        <div class="dg-panel__actions">
          <button id="deleteLineManagerButton" class="dg-btn dg-btn--danger-quiet dg-btn--compact" type="button">노선·역 철거…</button>
          <button id="saveLineManagerButton" class="dg-btn dg-btn--primary dg-panel__actions-push" type="button">변경 저장</button>
        </div>
      </div>
    </aside>

    <div id="trainManagerDialog" class="dialog-backdrop" hidden>
      <section class="train-manager-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="trainManagerTitle">
        <div class="dialog-heading">
          <div>
            <span>TRAIN FLEET MANAGEMENT</span>
            <h2 id="trainManagerTitle">열차 운행 및 편성 관리</h2>
          </div>
          <button id="closeTrainManagerButton" class="dialog-close" type="button" aria-label="열차 관리 닫기">×</button>
        </div>
        <div id="trainManagerContent" class="train-manager-content"></div>
      </section>
    </div>

    <!-- 확인 대화상자: 대상·영향을 보이고 결과를 버튼에 쓴다 (DESIGN_SYSTEM §12 Dialogs) -->
    <div id="decisionDialog" class="dg-hud dg-scrim game-decision" hidden>
      <section class="dg-panel dg-dialog" role="alertdialog" aria-modal="true" aria-labelledby="decisionTitle" aria-describedby="decisionMessage decisionWarning">
        <header class="dg-panel__header">
          <h2 id="decisionTitle" class="dg-panel__title"><span id="decisionKicker">작업 확인</span></h2>
          <div class="dg-panel__header-end"><button id="closeDecisionButton" class="dg-icon-btn" type="button" aria-label="확인 창 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
        </header>
        <div class="dg-panel__body">
          <div class="dg-panel__section game-decision__body">
            <p id="decisionMessage" class="game-decision__message"></p>
            <div id="decisionWarning" class="dg-notice game-decision__warning" hidden></div>
          </div>
        </div>
        <div class="dg-panel__actions">
          <button id="decisionCancelButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">취소</button>
          <button id="decisionSaveDraftButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button" hidden>임시 저장 후 변경</button>
          <button id="decisionConfirmButton" class="dg-btn dg-btn--primary dg-panel__actions-push game-decision__confirm" type="button">확인</button>
        </div>
      </section>
    </div>

    <div id="saveEditorDialog" class="dialog-backdrop" hidden>
      <section class="save-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="saveEditorTitle">
        <header class="save-editor-header">
          <div><span>SAVE FILE SETTINGS</span><h2 id="saveEditorTitle">세이브 수정</h2></div>
          <button id="closeSaveEditorButton" class="dialog-close" type="button" aria-label="세이브 수정창 닫기">×</button>
        </header>
        <form id="saveEditorForm" class="save-editor-form">
          <label class="save-editor-name-field"><span>세이브 이름</span><input id="saveEditorNameInput" maxlength="20" required autocomplete="off" /></label>
          <div class="save-editor-setting-grid">
            <label><span>게임 모드</span><select id="saveEditorModeSelect"><option value="sandbox">샌드박스</option><option value="career">커리어</option></select></label>
            <label><span>난이도</span><select id="saveEditorDifficultySelect"><option value="easy">쉬움</option><option value="normal">보통</option><option value="hard">어려움</option></select></label>
          </div>
          <label><span>철도망 제목</span><input id="saveEditorNetworkTitleInput" maxlength="40" placeholder="비워두면 도시 이름을 사용합니다" autocomplete="off" /></label>
          <div class="save-editor-city-lock"><span>운영 도시</span><strong id="saveEditorCityReadout">서울</strong><small>기존 노선 좌표와 수요 데이터를 보호하기 위해 도시는 변경할 수 없습니다.</small></div>
          <p id="saveEditorError" class="save-editor-error" hidden></p>
          <footer class="save-editor-actions">
            <button id="cancelSaveEditorButton" type="button">취소</button>
            <button id="submitSaveEditorButton" class="primary" type="submit">변경사항 저장</button>
          </footer>
        </form>
      </section>
    </div>

    <div id="mergeDialog" class="dialog-backdrop" hidden>
      <section class="merge-dialog" role="dialog" aria-modal="true" aria-labelledby="mergeTitle">
        <header class="connection-dialog-header">
          <div class="connection-title-block">
            <span class="connection-eyebrow"><i aria-hidden="true"></i> NETWORK LINK</span>
            <h2 id="mergeTitle">노선 연결 설정</h2>
            <p id="mergeDescription"></p>
          </div>
          <button id="closeMergeButton" class="dialog-close" type="button" aria-label="닫기">×</button>
        </header>
        <div class="connection-dialog-body">
          <section class="connection-section" aria-labelledby="connectionTargetsTitle">
            <div class="connection-section-heading">
              <span>01</span>
              <div><strong id="connectionTargetsTitle">연결 대상</strong><small>선택한 두 끝점과 공사 영향을 확인하세요.</small></div>
            </div>
            <div id="mergeConnectionSummary" class="connection-target-summary"></div>
          </section>
          <section class="connection-section" aria-labelledby="connectionMethodTitle">
            <div class="connection-section-heading">
              <span>02</span>
              <div><strong id="connectionMethodTitle">처리 방식</strong><small>실제 가능한 방식만 표시됩니다.</small></div>
            </div>
            <fieldset id="mergeChoiceList" class="connection-choice-list"><legend>연결 방식 선택</legend></fieldset>
          </section>
          <section id="mergeLegacyFields" class="connection-section connection-result-settings">
            <div class="connection-section-heading">
              <span>03</span>
              <div><strong>병합 결과</strong><small>병합 뒤 유지할 노선 정보를 선택하세요.</small></div>
            </div>
            <div class="connection-result-grid">
              <label class="manager-field"><span>노선 이름</span><select id="mergeNameSelect"></select></label>
              <label class="manager-field"><span>대표 색상</span><select id="mergeColorSelect"></select></label>
            </div>
          </section>
        </div>
        <footer class="connection-dialog-footer">
          <div class="connection-safety-note"><i aria-hidden="true">✓</i><span>확정하기 전에는 노선과 비용이 변경되지 않습니다.</span></div>
          <div class="dialog-actions connection-actions">
            <button id="cancelMergeButton" class="connection-cancel" type="button">취소</button>
            <button id="redesignMergeButton" class="connection-redesign" type="button">지점 다시 선택</button>
            <button id="confirmMergeButton" class="primary connection-confirm" type="button">연결 확정</button>
          </div>
        </footer>
      </section>
    </div>

    <div id="inGameMenuDialog" class="dg-hud dg-scrim game-menu" hidden>
      <section class="dg-panel dg-dialog" role="dialog" aria-modal="true" aria-labelledby="ingameMenuTitle">
        <header class="dg-panel__header">
          <h2 id="ingameMenuTitle" class="dg-panel__title">메뉴</h2>
          <div class="dg-panel__header-end"><button id="closeInGameMenuButton" class="dg-icon-btn" type="button" aria-label="메뉴 닫기"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15"/></svg></button></div>
        </header>
        <div class="dg-panel__body">
          <section class="dg-panel__section game-menu__save">
            <div class="dg-seg game-menu__tabs" role="group" aria-label="저장과 불러오기">
              <button id="menuSaveTabButton" class="dg-seg__item" type="button" aria-pressed="true">저장</button>
              <button id="menuLoadTabButton" class="dg-seg__item" type="button" aria-pressed="false">불러오기</button>
            </div>
            <div id="menuSaveTabContent" class="game-menu__pane">
              <p id="menuSaveStatusReadout" class="game-inspector__note">현재 슬롯에 진행 상황을 저장합니다</p>
              <button id="menuQuickSaveButton" class="dg-btn dg-btn--primary" type="button">지금 저장</button>
            </div>
            <div id="menuLoadTabContent" class="game-menu__pane" hidden>
              <p class="game-inspector__note">불러올 슬롯을 고르세요. 이름과 마지막 저장 시각을 확인하세요.</p>
              <div id="menuSlotList" class="game-route-list"></div>
            </div>
          </section>
          <section class="dg-panel__section game-menu__links">
            <button id="menuOpenHelpButton" class="dg-tool" type="button"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><rect x="2.5" y="2.5" width="15" height="15"/><path d="M7.5 7.5 A2.5 2.5 0 1 1 10 10 V11.5 M10 14 V14.5"/></svg><span>도움말 · 튜토리얼</span></button>
            <button id="menuOpenSettingsButton" class="dg-tool" type="button" aria-haspopup="dialog"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.03a1.7 1.7 0 0 0-1.87.34l-.06.06h-3.4l-.03-.08a1.7 1.7 0 0 0-1.29-1.1 1.7 1.7 0 0 0-.58 0 1.7 1.7 0 0 0-1.3 1.1l-.02.08H6.07l-.06-.06a1.7 1.7 0 0 0-1.88-.34l-.07.03-1.7-2.94.06-.06A1.7 1.7 0 0 0 2.76 15l-.03-.08v-3.4l.08-.03a1.7 1.7 0 0 0 1.1-1.29 1.7 1.7 0 0 0 0-.58 1.7 1.7 0 0 0-1.1-1.3l-.08-.02V4.9l.06-.06a1.7 1.7 0 0 0 .34-1.88l-.03-.07 2.94-1.7.06.06a1.7 1.7 0 0 0 1.88.34l.08-.03h3.4l.03.08a1.7 1.7 0 0 0 1.29 1.1 1.7 1.7 0 0 0 .58 0 1.7 1.7 0 0 0 1.3-1.1l.02-.08h3.4l.06.06a1.7 1.7 0 0 0 1.88.34l.07-.03 1.7 2.94-.06.06A1.7 1.7 0 0 0 21.24 7l.03.08v3.4l-.08.03a1.7 1.7 0 0 0-1.1 1.29 1.7 1.7 0 0 0 0 .58 1.7 1.7 0 0 0 1.1 1.3l.08.02v1.3Z"/></svg><span>환경 설정</span></button>
          </section>
        </div>
        <div class="dg-panel__actions">
          <button id="menuReturnTitleButton" class="dg-btn dg-btn--secondary dg-btn--compact" type="button">메인 화면으로</button>
          <button id="menuResumeGameButton" class="dg-btn dg-btn--primary dg-panel__actions-push" type="button">게임 계속하기</button>
        </div>
      </section>
    </div>
  </main>
`;

// =============================================================================
// Leaflet 지도와 렌더링 레이어
// 레이어를 목적별로 분리해 노선/공사/계획 등을 독립적으로 다시 그릴 수 있게 한다.
// =============================================================================

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  center: SEOUL,
  zoom: 12,
  minZoom: cityConfigs.seoul.minZoom,
  maxZoom: 18,
  maxBounds: cityConfigs.seoul.mapBounds,
  maxBoundsViscosity: 1,
  preferCanvas: true,
  inertia: true,
  inertiaDeceleration: 2800,
  wheelPxPerZoomLevel: 72,
  zoomAnimation: true,
  markerZoomAnimation: false,
  touchZoom: "center",
});

function applyCityMapConstraints(cityId: CityId) {
  const city = cityConfigs[cityId];
  map.setMinZoom(city.minZoom);
  map.setMaxBounds(city.mapBounds);
  map.setView(city.center, Math.max(12, city.minZoom));
  updateDynamicLayers();
}

const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  subdomains: ["a", "b", "c"],
  maxZoom: 19,
  noWrap: true,
  crossOrigin: true,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 3,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const terrainLayer = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  subdomains: ["a", "b", "c"],
  maxZoom: 17,
  noWrap: true,
  opacity: 0.38,
  crossOrigin: true,
  updateWhenIdle: true,
  keepBuffer: 2,
});

const railLayer = L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", {
  subdomains: ["a", "b", "c"],
  maxZoom: 19,
  noWrap: true,
  opacity: 0.5,
  crossOrigin: true,
  updateWhenIdle: true,
  keepBuffer: 2,
});

const adminLayer = L.geoJSON(undefined, {
  interactive: false,
  style: { color: "#4ce0c3", weight: 1.6, opacity: 0.85, fillOpacity: 0, dashArray: "5 6" },
});

const landuseLayer = L.geoJSON(undefined, {
  interactive: false,
  style: (feature) => {
    const landuse = String(feature?.properties?.landuse ?? feature?.properties?.natural ?? feature?.properties?.waterway ?? "");
    const isWater = landuse === "water" || landuse === "river" || Boolean(feature?.properties?.waterway);
    const isMountain = landuse === "forest" || landuse === "wood";
    return {
      color: isWater ? "#4aaedb" : isMountain ? "#4f9b5c" : "#c9a64a",
      weight: isWater ? 1.5 : 0.8,
      opacity: isWater ? 0.72 : 0.45,
      fillOpacity: isWater ? 0.16 : 0.2,
    };
  },
});

const populationDensityLayer = L.layerGroup();

const facilityInteractionPane = map.createPane("facilityInteractionPane");
facilityInteractionPane.style.zIndex = "690";
facilityInteractionPane.style.pointerEvents = "none";
const trainInteractionPane = map.createPane("trainInteractionPane");
trainInteractionPane.style.zIndex = "790";
trainInteractionPane.style.pointerEvents = "none";
const stationInteractionPane = map.createPane("stationInteractionPane");
stationInteractionPane.style.zIndex = "780";
stationInteractionPane.style.pointerEvents = "none";
const routeSelectionPane = map.createPane("routeSelectionPane");
routeSelectionPane.style.zIndex = "460";
routeSelectionPane.style.pointerEvents = "none";
const populationDensityPane = map.createPane("populationDensityPane");
populationDensityPane.style.zIndex = "350";
populationDensityPane.style.pointerEvents = "none";

const mapLayers = new LayerManager(map);
const previewLayer = mapLayers.get("construction-preview");
const depotGuideLayer = mapLayers.get("depot-guide");
const repairGuideLayer = mapLayers.get("repair-guide");
const editGuideLayer = mapLayers.get("edit-guide");
const lineRenderer = new LineRenderer(
  mapLayers.get("completed-lines"),
  mapLayers.get("route-selection"),
  "routeSelectionPane",
);
const stationRenderer = new StationRenderer(mapLayers.get("stations"));
const trainRenderer = new TrainRenderer(mapLayers.get("trains"));
const depotRenderer = new DepotRenderer(mapLayers.get("depots"));
const blueprintRenderer = new BlueprintRenderer(mapLayers.get("blueprints"));
const constructionRenderer = new ConstructionRenderer(
  map,
  mapLayers.get("construction"),
  mapLayers.get("draft-renderer"),
);
const layers: Record<OverlayKey, L.Layer> = {
  administrative: adminLayer,
  landuse: landuseLayer,
  rail: railLayer,
  population: populationDensityLayer,
};

// =============================================================================
// DOM 참조
// 화면 요소는 시작할 때 한 번만 조회한다. 선택 요소는 실제 마크업 유무에 따라
// null일 수 있으므로 이벤트 연결과 갱신 시 optional chaining을 사용한다.
// =============================================================================

const zoomReadout = byId("zoomReadout");
const lodReadout = byId("lodReadout");
const costReadout = byId("costReadout");
const cityHudReadout = byId("cityHudReadout");
const dailyNetReadout = byId("dailyNetReadout");
const gameDayReadout = byId("gameDayReadout");
const gameClockReadout = byId("gameClockReadout");
const modeLabel = byId("modeLabel");
const hintRow = byId("hintRow");
const routeCount = byId("routeCount");
const selectedRouteName = byId("selectedRouteName");
const stationCount = byId("stationCount");
const depotCount = byId("depotCount");
const facilityReadout = byId("facilityReadout");
const totalCost = byId("totalCost");
const headwayReadout = byId("headwayReadout");
const leftRouteWindow = byId("leftRouteWindow");
const closeLeftRouteWindowButton = byId("closeLeftRouteWindowButton");
const leftRouteList = byId("leftRouteList");
const leftRouteTotalCount = byId("leftRouteTotalCount");
const leftRouteTotalKm = byId("leftRouteTotalKm");
const leftRouteNewButton = byId("leftRouteNewButton");
const crowdingReadout = byId("crowdingReadout");
const waitReadout = byId("waitReadout");
const cashReadout = byId("cashReadout");
const satisfactionReadout = byId("satisfactionReadout");
const satisfactionIcon = byId("satisfactionIcon");
const satisfactionPill = document.querySelector<HTMLButtonElement>("#satisfactionPill");
const satisfactionDialog = byId("satisfactionDialog");
const closeSatisfactionButton = byId("closeSatisfactionButton");
const satisfactionDialogContent = byId("satisfactionDialogContent");
const demandReadout = byId("demandReadout");
const cashPill = document.querySelector<HTMLButtonElement>("#financeStatusButton");
const financeDialog = byId("financeDialog");
const closeFinanceButton = byId("closeFinanceButton");
const financeCashReadout = byId("financeCashReadout");
const financeDailyNetReadout = byId("financeDailyNetReadout");
const financeLoanReadout = byId("financeLoanReadout");
const financeDemandReadout = byId("financeDemandReadout");
const financeForecastContent = byId("financeForecastContent");
const dialogFareInput = document.querySelector<HTMLInputElement>("#dialogFareInput");
const dialogAutoFareButton = document.querySelector<HTMLButtonElement>("#dialogAutoFareButton");
const dialogLoanButton = document.querySelector<HTMLButtonElement>("#dialogLoanButton");
const dialogRepayButton = document.querySelector<HTMLButtonElement>("#dialogRepayButton");
const openStatisticsFromFinanceButton = byId("openStatisticsFromFinanceButton");
const lineFareInput = document.querySelector<HTMLInputElement>("#lineFareInput");
const lineAutoFareButton = document.querySelector<HTMLButtonElement>("#lineAutoFareButton");
const inGameMenuDialog = byId("inGameMenuDialog");
const closeInGameMenuButton = byId("closeInGameMenuButton");
const menuSaveStatusReadout = byId("menuSaveStatusReadout");
const menuQuickSaveButton = byId("menuQuickSaveButton");
const menuSaveTabButton = byId("menuSaveTabButton");
const menuLoadTabButton = byId("menuLoadTabButton");
const menuSaveTabContent = byId("menuSaveTabContent");
const menuLoadTabContent = byId("menuLoadTabContent");
const menuSlotList = byId("menuSlotList");
const menuOpenSettingsButton = byId("menuOpenSettingsButton");
const menuReturnTitleButton = byId("menuReturnTitleButton");
const menuResumeGameButton = byId("menuResumeGameButton");
const fareInput = document.querySelector<HTMLInputElement>("#fareInput");
const autoFareButton = document.querySelector<HTMLButtonElement>("#autoFareButton");
const loanButton = document.querySelector<HTMLButtonElement>("#loanButton");
const repayButton = document.querySelector<HTMLButtonElement>("#repayButton");
const startScreen = byId("startScreen");
const modeSelect = document.querySelector<HTMLSelectElement>("#modeSelect");
const difficultySelect = document.querySelector<HTMLSelectElement>("#difficultySelect");
const citySelect = document.querySelector<HTMLSelectElement>("#citySelect");
const cityPicker = byId("cityPicker");
const slotNameInput = document.querySelector<HTMLInputElement>("#slotNameInput");
const cityNote = byId("cityNote");
const newGameButton = document.querySelector<HTMLButtonElement>("#newGameButton");
const continueButton = document.querySelector<HTMLButtonElement>("#continueButton");
const slotList = byId("slotList");
const saveEditorDialog = byId("saveEditorDialog");
const saveEditorForm = document.querySelector<HTMLFormElement>("#saveEditorForm");
const closeSaveEditorButton = document.querySelector<HTMLButtonElement>("#closeSaveEditorButton");
const cancelSaveEditorButton = document.querySelector<HTMLButtonElement>("#cancelSaveEditorButton");
const submitSaveEditorButton = document.querySelector<HTMLButtonElement>("#submitSaveEditorButton");
const saveEditorNameInput = document.querySelector<HTMLInputElement>("#saveEditorNameInput");
const saveEditorModeSelect = document.querySelector<HTMLSelectElement>("#saveEditorModeSelect");
const saveEditorDifficultySelect = document.querySelector<HTMLSelectElement>("#saveEditorDifficultySelect");
const saveEditorNetworkTitleInput = document.querySelector<HTMLInputElement>("#saveEditorNetworkTitleInput");
const saveEditorCityReadout = byId("saveEditorCityReadout");
const saveEditorError = byId("saveEditorError");
const saveButton = document.querySelector<HTMLButtonElement>("#saveButton");
const menuButton = document.querySelector<HTMLButtonElement>("#menuButton");
const openDiagramButton = document.querySelector<HTMLButtonElement>("#openDiagramButton");
const saveStatus = byId("saveStatus");
const loadingScreen = byId("loadingScreen");
const loadingStatus = byId("loadingStatus");
const loadingProgress = byId("loadingProgress");
const tutorialPanel = byId("tutorialPanel");
const tutorialStep = byId("tutorialStep");
const tutorialTitle = byId("tutorialTitle");
const tutorialText = byId("tutorialText");
const tutorialFeedback = byId("tutorialFeedback");
const tutorialNextButton = document.querySelector<HTMLButtonElement>("#tutorialNextButton");
const tutorialSkipButton = document.querySelector<HTMLButtonElement>("#tutorialSkipButton");
const helpButton = document.querySelector<HTMLButtonElement>("#menuOpenHelpButton");
const settingsDialog = byId("settingsDialog");
const closeSettingsButton = document.querySelector<HTMLButtonElement>("#closeSettingsButton");
const soundToggle = document.querySelector<HTMLInputElement>("#soundToggle");
const hapticsToggle = document.querySelector<HTMLInputElement>("#hapticsToggle");
const performanceSelect = document.querySelector<HTMLSelectElement>("#performanceSelect");
const mapThemeSelect = document.querySelector<HTMLSelectElement>("#mapThemeSelect");
const reducedMotionToggle = document.querySelector<HTMLInputElement>("#reducedMotionToggle");
const sandboxConstructionTimeToggle = document.querySelector<HTMLInputElement>("#sandboxConstructionTimeToggle");
const autoStationNamingToggle = document.querySelector<HTMLInputElement>("#autoStationNamingToggle");
const autoSaveToggle = document.querySelector<HTMLInputElement>("#autoSaveToggle");
const autoSaveIntervalSelect = document.querySelector<HTMLSelectElement>("#autoSaveIntervalSelect");
const clearCacheButton = document.querySelector<HTMLButtonElement>("#clearCacheButton");
const cacheReadout = byId("cacheReadout");
const errorBanner = byId("errorBanner");
const errorMessage = byId("errorMessage");
const errorRetryButton = document.querySelector<HTMLButtonElement>("#errorRetryButton");
const errorDismissButton = document.querySelector<HTMLButtonElement>("#errorDismissButton");
const toast = byId("toast");
const routeSettingsCard = byId("routeSettingsCard");
const closeRouteSettingsButton = document.querySelector<HTMLButtonElement>("#closeRouteSettingsButton");
const routeSettingsHeaderSwatch = byId("routeSettingsHeaderSwatch");
const routeSettingsHeaderName = byId("routeSettingsHeaderName");
const headerPreviewCost = byId("headerPreviewCost");
const headerConfirmConstructionButton = document.querySelector<HTMLButtonElement>("#headerConfirmConstructionButton");
const routeSettingsTarget = byId("routeSettingsTarget");
const routeSettingsTargetKicker = byId("routeSettingsTargetKicker");
const routeSettingsTargetSwatch = byId("routeSettingsTargetSwatch");
const routeSettingsTargetName = byId("routeSettingsTargetName");
const routeSettingsTargetMeta = byId("routeSettingsTargetMeta");
const routeSettingsEditFields = byId("routeSettingsEditFields");
const draftRouteNameInput = document.querySelector<HTMLInputElement>("#draftRouteNameInput");
const draftRouteColorInput = document.querySelector<HTMLInputElement>("#draftRouteColorInput");
const saveRouteSettingsButton = document.querySelector<HTMLButtonElement>("#saveRouteSettingsButton");
const operationRouteSelect = document.querySelector<HTMLSelectElement>("#operationRouteSelect");
const trainTypeSelect = document.querySelector<HTMLSelectElement>("#trainTypeSelect");
const carCountInput = document.querySelector<HTMLInputElement>("#carCountInput");
const setCountInput = document.querySelector<HTMLInputElement>("#setCountInput");
const buyTrainButton = document.querySelector<HTMLButtonElement>("#buyTrainButton");
const expressButton = document.querySelector<HTMLButtonElement>("#expressButton");
const expressButtonLabel = document.querySelector<HTMLElement>("#expressButtonLabel");
const analysisButton = document.querySelector<HTMLButtonElement>("#analysisButton");
const analysisBadge = byId("analysisBadge");
const statisticsButton = document.querySelector<HTMLButtonElement>("#statisticsButton");
const newsButton = document.querySelector<HTMLButtonElement>("#newsButton");
const newsBadge = byId("newsBadge");
const guideButton = document.querySelector<HTMLButtonElement>("#guideButton");
const pauseToggleButton = document.querySelector<HTMLButtonElement>("#pauseToggleButton");
const speedCycleButton = document.querySelector<HTMLButtonElement>("#speedCycleButton");
const satisfactionLevelReadout = byId("satisfactionLevelReadout");
const workspaceModeReadout = byId("workspaceModeReadout");
const workspaceModeTabs = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-workspace-mode]"));
const selectTool = document.querySelector<HTMLButtonElement>("#selectTool");
const manageLineTool = document.querySelector<HTMLButtonElement>("#manageLineTool");
const manageOperationsTool = document.querySelector<HTMLButtonElement>("#manageOperationsTool");
const manageMapTool = document.querySelector<HTMLButtonElement>("#manageMapTool");
const routeTool = document.querySelector<HTMLButtonElement>("#routeTool");
const modifyToolsButton = document.querySelector<HTMLButtonElement>("#modifyToolsButton");
const modifyToolsCard = byId("modifyToolsCard");
const workspaceModeBar = byId("workspaceModeBar");
const railTools = byId("railTools");
const railOverflowTools = byId("railOverflowTools");
const railMoreLabel = byId("railMoreLabel");
const railModeNowButton = document.querySelector<HTMLButtonElement>("#railModeNowButton");
const railModeNowLabel = byId("railModeNowLabel");
const railModeMark = byId("railModeMark");
const modeBanner = byId("modeBanner");
const modeBannerText = byId("modeBannerText");
const modeBannerMark = byId("modeBannerMark");
const compactRailQuery = window.matchMedia("(max-width: 719px)");
/** 모드별 레일 도구. 앞에 둘수록 우선순위가 높고, 자리가 부족하면 뒤에서부터 더보기로 옮긴다. */
const railToolIds: Record<WorkspaceMode, string[]> = {
  management: ["selectTool", "manageLineTool", "manageOperationsTool", "analysisButton", "manageMapTool"],
  planning: ["selectTool", "routeTool", "stationTool", "transferTool", "depotTool", "extendTool", "branchTool", "mergeTool", "eraserTool", "planOverviewButton"],
  construction: ["selectTool", "transferTool", "eraserTool", "branchTool", "mergeTool", "constructionOverviewButton"],
};
const workspaceModeShortNames: Record<WorkspaceMode, string> = { management: "관리", planning: "기획", construction: "공사" };
const workspaceModeMarks: Record<WorkspaceMode, string> = { management: "manage", planning: "plan", construction: "build" };

const extendTool = document.querySelector<HTMLButtonElement>("#extendTool");
const editTool = document.querySelector<HTMLButtonElement>("#editTool");
const eraserTool = document.querySelector<HTMLButtonElement>("#eraserTool");
const eraserSizeControl = byId("eraserSizeControl");
const eraserSizeRange = document.querySelector<HTMLInputElement>("#eraserSizeRange");
const eraserSizeValue = byId("eraserSizeValue");
const planOverviewButton = document.querySelector<HTMLButtonElement>("#planOverviewButton");
const constructionOverviewButton = document.querySelector<HTMLButtonElement>("#constructionOverviewButton");
const reconnectTool = document.querySelector<HTMLButtonElement>("#reconnectTool");
const branchTool = document.querySelector<HTMLButtonElement>("#branchTool");
const mergeTool = document.querySelector<HTMLButtonElement>("#mergeTool");
const stationTool = document.querySelector<HTMLButtonElement>("#stationTool");
const transferTool = document.querySelector<HTMLButtonElement>("#transferTool");
const depotTool = document.querySelector<HTMLButtonElement>("#depotTool");
const planningModeButton = document.querySelector<HTMLButtonElement>("#planningModeButton");
const planManagerButton = document.querySelector<HTMLButtonElement>("#planManagerButton");
const constructionManagerButton = document.querySelector<HTMLButtonElement>("#constructionManagerButton");
const constructionProjectBadge = byId("constructionProjectBadge");
const diagramToolButton = document.querySelector<HTMLButtonElement>("#diagramToolButton");
const undoButton = document.querySelector<HTMLButtonElement>("#undoButton");
const redoButton = document.querySelector<HTMLButtonElement>("#redoButton");
const constructionPreviewPanel = byId("constructionPreviewPanel");
const constructionPreviewTitle = byId("constructionPreviewTitle");
const constructionPreviewKicker = byId("constructionPreviewKicker");
const constructionPreviewSubtitle = byId("constructionPreviewSubtitle");
const closeConstructionPreviewButton = document.querySelector<HTMLButtonElement>("#closeConstructionPreviewButton");
const constructionPreviewDetails = byId("constructionPreviewDetails");
const previewTotalCostLabel = byId("previewTotalCostLabel");
const previewBalanceLabel = byId("previewBalanceLabel");
const previewDurationLabel = byId("previewDurationLabel");
const previewTotalCost = byId("previewTotalCost");
const previewBalance = byId("previewBalance");
const previewDuration = byId("previewDuration");
const previewLengthLabel = byId("previewLengthLabel");
const previewLength = byId("previewLength");
const previewBaseCostLabel = byId("previewBaseCostLabel");
const previewBaseCost = byId("previewBaseCost");
const previewMountainLabel = byId("previewMountainLabel");
const previewMountain = byId("previewMountain");
const previewRiverCountLabel = byId("previewRiverCountLabel");
const previewRiverCount = byId("previewRiverCount");
const previewStationCountLabel = byId("previewStationCountLabel");
const previewStationCount = byId("previewStationCount");
const previewDepotConnectionLabel = byId("previewDepotConnectionLabel");
const previewDepotConnection = byId("previewDepotConnection");
const riverChoiceList = byId("riverChoiceList");
const constructionWarnings = byId("constructionWarnings");
const cancelConstructionButton = document.querySelector<HTMLButtonElement>("#cancelConstructionButton");
const confirmConstructionButton = document.querySelector<HTMLButtonElement>("#confirmConstructionButton");
const diagramScreen = byId("diagramScreen");
const closeDiagramButton = document.querySelector<HTMLButtonElement>("#closeDiagramButton");
const diagramCompanyName = byId("diagramCompanyName");
const diagramRouteFilter = document.querySelector<HTMLSelectElement>("#diagramRouteFilter");
const diagramBackgroundSelect = document.querySelector<HTMLSelectElement>("#diagramBackgroundSelect");
const diagramLabelsToggle = document.querySelector<HTMLInputElement>("#diagramLabelsToggle");
const diagramCompanyToggle = document.querySelector<HTMLInputElement>("#diagramCompanyToggle");
const resetDiagramLayoutButton = document.querySelector<HTMLButtonElement>("#resetDiagramLayoutButton");
const saveDiagramSvgButton = document.querySelector<HTMLButtonElement>("#saveDiagramSvgButton");
const exportShareJsonButton = document.querySelector<HTMLButtonElement>("#exportShareJsonButton");
const importShareJsonButton = document.querySelector<HTMLButtonElement>("#importShareJsonButton");
const importShareJsonInput = document.querySelector<HTMLInputElement>("#importShareJsonInput");
const metroDiagramSvg = document.querySelector<SVGSVGElement>("#metroDiagramSvg");
const diagramBackgroundLayer = document.querySelector<SVGGElement>("#diagramBackgroundLayer");
const diagramRouteLayer = document.querySelector<SVGGElement>("#diagramRouteLayer");
const diagramStationLayer = document.querySelector<SVGGElement>("#diagramStationLayer");
const diagramLabelLayer = document.querySelector<SVGGElement>("#diagramLabelLayer");
const diagramCompanyLayer = document.querySelector<SVGGElement>("#diagramCompanyLayer");
const diagramEmptyState = byId("diagramEmptyState");
const diagramStatus = byId("diagramStatus");
const diagramRouteLegend = byId("diagramRouteLegend");
const analysisScreen = byId("analysisScreen");
const closeAnalysisButton = document.querySelector<HTMLButtonElement>("#closeAnalysisButton");
const refreshAnalysisButton = document.querySelector<HTMLButtonElement>("#refreshAnalysisButton");
const analysisUpdatedAt = byId("analysisUpdatedAt");
const analysisHealthScore = byId("analysisHealthScore");
const analysisHealthLabel = byId("analysisHealthLabel");
const analysisCriticalCount = byId("analysisCriticalCount");
const analysisWarningCount = byId("analysisWarningCount");
const analysisInfoCount = byId("analysisInfoCount");
const analysisFilter = document.querySelector<HTMLSelectElement>("#analysisFilter");
const analysisUrgentLabel = byId("analysisUrgentLabel");
const analysisUrgentList = byId("analysisUrgentList");
const analysisReportList = byId("analysisReportList");
const analysisEmptyState = byId("analysisEmptyState");

const stationManagerDialog = byId("stationManagerDialog");
const closeStationManagerButton = document.querySelector<HTMLButtonElement>("#closeStationManagerButton");
const stationManagerTitle = byId("stationManagerTitle");
const stationManagerContent = byId("stationManagerContent");
const depotManagerDialog = byId("depotManagerDialog");
const closeDepotManagerButton = document.querySelector<HTMLButtonElement>("#closeDepotManagerButton");
const depotManagerTitle = byId("depotManagerTitle");
const depotManagerContent = byId("depotManagerContent");
const statisticsScreen = byId("statisticsScreen");
const closeStatisticsButton = document.querySelector<HTMLButtonElement>("#closeStatisticsButton");
const statisticsNetworkTitle = byId("statisticsNetworkTitle");
const statisticsCityLabel = byId("statisticsCityLabel");
const statisticsSaveMeta = byId("statisticsSaveMeta");
const networkTitleInput = document.querySelector<HTMLInputElement>("#networkTitleInput");
const saveNetworkTitleButton = document.querySelector<HTMLButtonElement>("#saveNetworkTitleButton");
const statisticsTabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-statistics-tab]"));
const statisticsContent = byId("statisticsContent");
const newsScreen = byId("newsScreen");
const closeNewsButton = document.querySelector<HTMLButtonElement>("#closeNewsButton");
const newsFilter = document.querySelector<HTMLSelectElement>("#newsFilter");
const activeNewsCount = byId("activeNewsCount");
const opportunityNewsCount = byId("opportunityNewsCount");
const changeNewsCount = byId("changeNewsCount");
const newsFeed = byId("newsFeed");
const constructionManagerDialog = byId("constructionManagerDialog");
const closeConstructionManagerButton = document.querySelector<HTMLButtonElement>("#closeConstructionManagerButton");
const constructionProjectList = byId("constructionProjectList");
const planningDialog = byId("planningDialog");
const closePlanningButton = document.querySelector<HTMLButtonElement>("#closePlanningButton");
const activePlanSelect = document.querySelector<HTMLSelectElement>("#activePlanSelect");
const newPlanButton = document.querySelector<HTMLButtonElement>("#newPlanButton");
const duplicatePlanButton = document.querySelector<HTMLButtonElement>("#duplicatePlanButton");
const deletePlanButton = document.querySelector<HTMLButtonElement>("#deletePlanButton");
const planNameInput = document.querySelector<HTMLInputElement>("#planNameInput");
const planStatusSelect = document.querySelector<HTMLSelectElement>("#planStatusSelect");
const planPrioritySelect = document.querySelector<HTMLSelectElement>("#planPrioritySelect");
const planNotesInput = document.querySelector<HTMLTextAreaElement>("#planNotesInput");
const planSummary = byId("planSummary");
const planAssetList = byId("planAssetList");
const savePlanButton = document.querySelector<HTMLButtonElement>("#savePlanButton");
const convertPlanButton = document.querySelector<HTMLButtonElement>("#convertPlanButton");
const planComparisonList = byId("planComparisonList");
const planConversionDialog = byId("planConversionDialog");
const closePlanConversionButton = document.querySelector<HTMLButtonElement>("#closePlanConversionButton");
const cancelPlanConversionButton = document.querySelector<HTMLButtonElement>("#cancelPlanConversionButton");
const planConversionItems = byId("planConversionItems");
const planConversionSummary = byId("planConversionSummary");
const planConversionPlanName = byId("planConversionPlanName");
const planConversionCurrentCash = byId("planConversionCurrentCash");
const selectAllPlanConversionButton = document.querySelector<HTMLButtonElement>("#selectAllPlanConversionButton");
const clearPlanConversionButton = document.querySelector<HTMLButtonElement>("#clearPlanConversionButton");
const fundPlanWithLoanButton = document.querySelector<HTMLButtonElement>("#fundPlanWithLoanButton");
const confirmPlanConversionButton = document.querySelector<HTMLButtonElement>("#confirmPlanConversionButton");
const layerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-layer]"));
const toolButtons = [selectTool, routeTool, extendTool, editTool, eraserTool, reconnectTool, branchTool, mergeTool, stationTool, transferTool, depotTool].filter(Boolean) as HTMLButtonElement[];
const selectedLineColor = document.querySelector<HTMLButtonElement>("#selectedLineColor");
const selectedLineTitle = byId("selectedLineTitle");
const selectedLineMeta = byId("selectedLineMeta");
const manageLineButton = document.querySelector<HTMLButtonElement>("#manageLineButton");
const closeLineButton = document.querySelector<HTMLButtonElement>("#closeLineButton");
const routeChoiceDialog = byId("routeChoiceDialog");
const routeChoiceList = byId("routeChoiceList");
const closeRouteChoiceButton = document.querySelector<HTMLButtonElement>("#closeRouteChoiceButton");
const rightLineControlCard = byId("rightLineControlCard");
const openTrainManagerFromLineCardButton = byId("openTrainManagerFromLineCardButton");
const trainManagerDialog = byId("trainManagerDialog");
const closeTrainManagerButton = document.querySelector<HTMLButtonElement>("#closeTrainManagerButton");
const trainManagerContent = byId("trainManagerContent");
const closeLineManagerButton = document.querySelector<HTMLButtonElement>("#closeLineManagerButton");
const cancelLineManagerButton = document.querySelector<HTMLButtonElement>("#cancelLineManagerButton");
const saveLineManagerButton = document.querySelector<HTMLButtonElement>("#saveLineManagerButton");
const deleteLineManagerButton = document.querySelector<HTMLButtonElement>("#deleteLineManagerButton");
const lineNameInput = document.querySelector<HTMLInputElement>("#lineNameInput");
const lineColorInput = document.querySelector<HTMLInputElement>("#lineColorInput");
const colorPickerDialog = byId("colorPickerDialog");
const closeColorPickerButton = document.querySelector<HTMLButtonElement>("#closeColorPickerButton");
const cancelColorPickerButton = document.querySelector<HTMLButtonElement>("#cancelColorPickerButton");
const applyColorPickerButton = document.querySelector<HTMLButtonElement>("#applyColorPickerButton");
const colorPreview = byId("colorPreview");
const colorHexReadout = byId("colorHexReadout");
const colorHueRange = document.querySelector<HTMLInputElement>("#colorHueRange");
const colorSaturationRange = document.querySelector<HTMLInputElement>("#colorSaturationRange");
const colorLightnessRange = document.querySelector<HTMLInputElement>("#colorLightnessRange");
const colorHueValue = byId("colorHueValue");
const colorSaturationValue = byId("colorSaturationValue");
const colorLightnessValue = byId("colorLightnessValue");
const colorHexInput = document.querySelector<HTMLInputElement>("#colorHexInput");
let colorPickerTarget: HTMLInputElement | null = null;
let colorPickerHsl = { hue: 180, saturation: 70, lightness: 55 };


function syncColorPicker(input: HTMLInputElement | null) {
  if (!input) return;
  const normalizedColor = input.value.toLowerCase();
  document.querySelectorAll<HTMLElement>(`[data-color-input="${input.id}"]`).forEach((picker) => {
    picker.style.setProperty("--selected-route-color", normalizedColor);
    const valueLabel = picker.querySelector<HTMLElement>("[data-color-value]");
    if (valueLabel) valueLabel.textContent = normalizedColor.toUpperCase();
  });
}

function setColorPickerValue(input: HTMLInputElement | null, color: string) {
  if (!input) return;
  input.value = color;
  syncColorPicker(input);
}

function renderColorPicker() {
  const hex = hslToHex(colorPickerHsl);
  colorPreview?.style.setProperty("--picker-color", hex);
  setText(colorHexReadout, hex);
  if (colorHueRange) colorHueRange.value = String(colorPickerHsl.hue);
  if (colorSaturationRange) colorSaturationRange.value = String(colorPickerHsl.saturation);
  if (colorLightnessRange) colorLightnessRange.value = String(colorPickerHsl.lightness);
  if (colorHexInput) colorHexInput.value = hex;
  setText(colorHueValue, `${colorPickerHsl.hue}°`);
  setText(colorSaturationValue, `${colorPickerHsl.saturation}%`);
  setText(colorLightnessValue, `${colorPickerHsl.lightness}%`);
}

function openColorPicker(input: HTMLInputElement) {
  colorPickerTarget = input;
  colorPickerHsl = hexToHsl(input.value);
  renderColorPicker();
  if (colorPickerDialog) colorPickerDialog.hidden = false;
}

function closeColorPicker() {
  if (colorPickerDialog) colorPickerDialog.hidden = true;
  colorPickerTarget = null;
}

document.querySelectorAll<HTMLButtonElement>("[data-open-color-picker]").forEach((button) => {
  button.addEventListener("click", () => {
    const inputId = button.dataset.openColorPicker;
    const input = inputId ? document.getElementById(inputId) as HTMLInputElement | null : null;
    if (input) openColorPicker(input);
  });
});

const updateColorPickerChannel = () => {
  colorPickerHsl = {
    hue: Number(colorHueRange?.value ?? colorPickerHsl.hue),
    saturation: Number(colorSaturationRange?.value ?? colorPickerHsl.saturation),
    lightness: Number(colorLightnessRange?.value ?? colorPickerHsl.lightness),
  };
  renderColorPicker();
};
colorHueRange?.addEventListener("input", updateColorPickerChannel);
colorSaturationRange?.addEventListener("input", updateColorPickerChannel);
colorLightnessRange?.addEventListener("input", updateColorPickerChannel);
colorHexInput?.addEventListener("change", () => {
  const value = colorHexInput.value.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) colorPickerHsl = hexToHsl(value);
  renderColorPicker();
});
applyColorPickerButton?.addEventListener("click", () => {
  if (!colorPickerTarget) return closeColorPicker();
  setColorPickerValue(colorPickerTarget, hslToHex(colorPickerHsl));
  colorPickerTarget.dispatchEvent(new Event("input", { bubbles: true }));
  closeColorPicker();
});
closeColorPickerButton?.addEventListener("click", closeColorPicker);
cancelColorPickerButton?.addEventListener("click", closeColorPicker);
if (colorPickerDialog) bindBackdropDismiss(colorPickerDialog, closeColorPicker);

[draftRouteColorInput, lineColorInput].forEach((input) => {
  input?.addEventListener("input", () => syncColorPicker(input));
  syncColorPicker(input);
});
const lineVisibilitySelect = document.querySelector<HTMLSelectElement>("#lineVisibilitySelect");
const localServiceToggle = document.querySelector<HTMLInputElement>("#localServiceToggle");
const expressServiceToggle = document.querySelector<HTMLInputElement>("#expressServiceToggle");
const operationPausedToggle = document.querySelector<HTMLInputElement>("#operationPausedToggle");
const lineManagerSummary = byId("lineManagerSummary");
const lineManagerTitle = byId("lineManagerTitle");
const operatingServiceSection = document.querySelector<HTMLDetailsElement>("#operatingServiceSection");
const operatingServiceCount = byId("operatingServiceCount");
const operatingServiceList = byId("operatingServiceList");
const addOperatingServiceButton = document.querySelector<HTMLButtonElement>("#addOperatingServiceButton");
const operatingServiceEditor = document.querySelector<HTMLFormElement>("#operatingServiceEditor");
const operatingServiceEditorTitle = byId("operatingServiceEditorTitle");
const operatingServiceNameInput = document.querySelector<HTMLInputElement>("#operatingServiceNameInput");
const operatingServicePathSelect = document.querySelector<HTMLSelectElement>("#operatingServicePathSelect");
const operatingServiceStopList = byId("operatingServiceStopList");
const editOperatingServiceStopsOnMapButton = document.querySelector<HTMLButtonElement>("#editOperatingServiceStopsOnMapButton");
const operatingServiceMapEditBar = byId("operatingServiceMapEditBar");
const operatingServiceMapEditCount = byId("operatingServiceMapEditCount");
const cancelOperatingServiceMapEditButton = document.querySelector<HTMLButtonElement>("#cancelOperatingServiceMapEditButton");
const applyOperatingServiceMapEditButton = document.querySelector<HTMLButtonElement>("#applyOperatingServiceMapEditButton");
const cancelOperatingServiceButton = document.querySelector<HTMLButtonElement>("#cancelOperatingServiceButton");
const deleteOperatingServiceButton = document.querySelector<HTMLButtonElement>("#deleteOperatingServiceButton");
const operatingServiceTrainAction = byId("operatingServiceTrainAction");
const decisionDialog = byId("decisionDialog");
const decisionMessage = byId("decisionMessage");
const decisionWarning = byId("decisionWarning");
const closeDecisionButton = document.querySelector<HTMLButtonElement>("#closeDecisionButton");
const decisionConfirmButton = document.querySelector<HTMLButtonElement>("#decisionConfirmButton");
const decisionCancelButton = document.querySelector<HTMLButtonElement>("#decisionCancelButton");
const decisionSaveDraftButton = document.querySelector<HTMLButtonElement>("#decisionSaveDraftButton");
const mergeDialog = byId("mergeDialog");
const mergeDescription = byId("mergeDescription");
const mergeConnectionSummary = byId("mergeConnectionSummary");
const mergeChoiceList = document.querySelector<HTMLFieldSetElement>("#mergeChoiceList");
const mergeLegacyFields = byId("mergeLegacyFields");
const mergeNameSelect = document.querySelector<HTMLSelectElement>("#mergeNameSelect");
const mergeColorSelect = document.querySelector<HTMLSelectElement>("#mergeColorSelect");
const confirmMergeButton = document.querySelector<HTMLButtonElement>("#confirmMergeButton");
const cancelMergeButton = document.querySelector<HTMLButtonElement>("#cancelMergeButton");
const redesignMergeButton = document.querySelector<HTMLButtonElement>("#redesignMergeButton");
const closeMergeButton = document.querySelector<HTMLButtonElement>("#closeMergeButton");

const uiListeners = new ListenerRegistry();
const panelManager = new PanelManager(uiListeners);
if (stationManagerDialog) panelManager.register({ id: "station", element: stationManagerDialog, content: stationManagerContent });
if (depotManagerDialog) panelManager.register({ id: "depot", element: depotManagerDialog, content: depotManagerContent });
if (rightLineControlCard) panelManager.register({ id: "line", element: rightLineControlCard });
if (leftRouteWindow) panelManager.register({ id: "route-list", element: leftRouteWindow, content: leftRouteList });
if (trainManagerDialog) panelManager.register({ id: "train", element: trainManagerDialog, content: trainManagerContent });
if (statisticsScreen) panelManager.register({ id: "operations", element: statisticsScreen, content: statisticsContent });
const stationPanel = stationManagerContent ? new StationPanel(panelManager, stationManagerTitle, stationManagerContent) : null;
const depotPanel = depotManagerContent ? new DepotPanel(panelManager, depotManagerTitle, depotManagerContent) : null;
const linePanel = new LinePanel(panelManager, {
  title: selectedLineTitle,
  meta: selectedLineMeta,
  color: selectedLineColor,
  nameInput: lineNameInput,
  colorInput: lineColorInput,
  visibilitySelect: lineVisibilitySelect,
  localToggle: localServiceToggle,
  expressToggle: expressServiceToggle,
  pausedToggle: operationPausedToggle,
  fareInput: lineFareInput,
  autoFareButton: lineAutoFareButton,
  summary: lineManagerSummary,
  routeList: leftRouteList,
});
const trainPanel = trainManagerContent ? new TrainPanel(panelManager, trainManagerContent) : null;
const operationsPanel = statisticsContent ? new OperationsPanel(panelManager, statisticsContent) : null;
const dialogPanelManager = new PanelManager(uiListeners);
if (decisionDialog) dialogPanelManager.register({ id: "dialog:decision", element: decisionDialog });
if (mergeDialog) dialogPanelManager.register({ id: "dialog:connection", element: mergeDialog });
if (financeDialog) dialogPanelManager.register({ id: "dialog:finance", element: financeDialog });
const dialogManager = new DialogManager(dialogPanelManager);
const hudRenderer = new HudRenderer({
  city: cityHudReadout,
  cash: cashReadout,
  dailyNet: dailyNetReadout,
  satisfaction: satisfactionReadout,
  satisfactionIcon,
  demand: demandReadout,
  day: gameDayReadout,
  clock: gameClockReadout,
  mode: workspaceModeReadout,
  tool: modeLabel,
  routeCount,
  stationCount,
  depotCount,
  selectedRoute: selectedRouteName,
  totalCost,
  cost: costReadout,
  facility: facilityReadout,
  headway: headwayReadout,
  crowding: crowdingReadout,
  wait: waitReadout,
});
const networkState = new NetworkState();
const constructionState = new ConstructionState();
const operationsState = new OperationsState();
const diagramStateOwner = new MetroDiagramStateOwner();
const analysisStateOwner = new AnalysisStateOwner<OperationAnalysisState>({ ...defaultAnalysisState, demandHistory: [], suggestions: [], decisions: {} });

const newsEventState = new NewsEventStateOwner(80);
const demandState = new DemandState();
const congestionRuntimeState = new CongestionRuntimeState();
const transitRouterCache = new TransitRouterCache();
const demandRuntimeCache = new DemandRuntimeCache();
const loanState = new LoanStateOwner();
const financeState = new FinanceState({ ...defaultEconomy }, { ...defaultStatisticsState, dailyRecords: [] });
const metaState = new ApplicationMetaState<GameMeta>(createDefaultMeta());
let slotSummaries: SaveSlotSummary[] = [];
let editingSaveSlotId: string | null = null;
let hasActiveGameSession = false;
let slotLoadRequestId = 0;
let undoStack: SaveState[] = [];
let redoStack: SaveState[] = [];
let overpassAbort: AbortController | null = null;
let lastOverpassKey = "";
let debounceTimer = 0;
let selectedTrainFleetId: string | null = null;
let selectedTrainSetNumber: number | null = null;
let selectedOperatingServiceId: string | null = null;
let editingOperatingServiceId: string | null = null;
let operatingServiceDraftPreset: StopPreset = "all";
let operatingServiceMapEditActive = false;
let operatingServiceMapEditInitialStops: string[] = [];
let selectedColor = routeColors[0];
let draftRouteName = "";
let eraserRadiusPx = 20;
let activeTool: ToolMode = "pan";
const routeStrokeHudTools = new Set<ToolMode>(["route", "extend", "reconnect", "branch", "merge"]);
let workspaceMode: WorkspaceMode = "management";
document.body.dataset.workspaceMode = workspaceMode;
let activePointerId: number | null = null;
let rawDrawPoints: L.Point[] = [];
let previewPolyline: L.Polyline | null = null;
let previewPolygon: L.Polygon | null = null;
let activeExtension: RouteExtension | null = null;
let activeRepair: RouteRepair | null = null;
let activeBranch: RouteBranchDraft | null = null;
let pendingBranchJunction: JunctionBlueprint | null = null;
let activePlanningContinuation: PlanningRouteContinuation | null = null;
let activeHandleMove: RouteHandleMove | null = null;
let handlePreviewCoordinates: Array<[number, number]> | null = null;
let deleteAnchor: RouteDeleteAnchor | null = null;
let plannedDeleteAnchor: PlannedRouteDeleteAnchor | null = null;
let activePlanningBranch: PlanningBranchDraft | null = null;
let pendingMerge: PendingMerge | null = null;
let activeConnectionSource: PlannedRouteMergeEndpoint | RouteMergeEndpoint | null = null;
const routePlanningController = new RoutePlanningController<ToolMode>();
const routePlanningToolChangeController = new RoutePlanningToolChangeController(routePlanningController, {
  saveDraft: (session) => {
    const plan = getActivePlan(true);
    if (plan) {
      updatePlan(plan.id, (item) => ({
        ...item,
        routePlanningDrafts: [...(item.routePlanningDrafts ?? []).filter((draft) => draft.id !== session.id), structuredClone(session)],
      }));
      requestStateSave();
    }
  },
  closeDialog: closeDecisionDialog,
  changeTool: setTool,
  notifyDraftSaved: () => showToast("진행 중인 설계를 임시 저장했습니다."),
});
let selectedRouteId: string | null = null;
let planningMode = false;
let activePlanId: string | null = null;
const planConversionsInFlight = new Set<string>();
const depotExpansionsInFlight = new Set<string>();
let replacingPlannedRouteId: string | null = null;
let selectedPlannedStationIds: string[] = [];
let selectedManualTransferEndpoints: ManualTransferEndpoint[] = [];
let diagramDrag: { stationId: string; pointerId: number } | null = null;
let pendingDecision: (() => void) | null = null;
let connectionDialogMode: "merge" | null = null;
let selectedConnectionChoice: ConnectionChoiceId = "merge";
const connectionSubmissionGuard = new ConnectionSubmissionGuard();
let constructionDraft: ConstructionDraft | null = null;
let demolitionReview: DemolitionReview | null = null;
let knownObstacles: Obstacle[] = [];
let selectedTransferStationIds: string[] = [];
let selectedDepotId: string | null = null;
let selectedDepotManagerId: string | null = null;
let selectedPlannedStationManager: { planId: string; stationId: string } | null = null;

let selectedStationManagerId: string | null = null;
let selectedOperationRouteId = "";
let simSpeed = 0;
let activeStatisticsTab: "overview" | "routes" | "stations" | "city" = "overview";
let selectedStatisticsRouteId = "";
let selectedStatisticsStationId = "";
let autoSaveTimer = 0;
let settings: GameSettings = loadSettings();
applyMapTheme(document.documentElement, settings.mapTheme);
let audioContext: AudioContext | null = null;
let toastTimer = 0;
let trainInteractionLockedUntil = 0;
let loadingComplete = false;
let retryAction: (() => void) | null = null;
let tileErrorReported = false;
const simulationRuntimeState = new SimulationRuntimeState(360);
type TrainHitTarget = {
  key: string;
  routeId: string;
  fleetId: string;
  setNumber: number;
  label: string;
  position: [number, number];
};
type MapSelectionData =
  | { kind: "train"; target: TrainHitTarget }
  | { kind: "station"; stationId: string }
  | { kind: "depot"; depotId: string }
  | { kind: "route"; routeId: string }
  | { kind: "construction"; projectId: string }
  | { kind: "blueprint"; planId: string; assetId: string; assetKind: "route" | "station" | "depot" };
const trainHitTargets = new Map<string, TrainHitTarget>();
const mapSelectionGestureController = new MapSelectionGestureController();

const simulationCoordinator = new SimulationCoordinator({
  getTime: () => simulationRuntimeState.minutes,
  setTime: (value) => {
    const elapsedMinutes = Math.max(0, value - simulationRuntimeState.minutes);
    simulationRuntimeState.setMinutes(value);
    metaState.patch({
      playTimeSeconds: (metaState.current.playTimeSeconds ?? 0) + elapsedMinutes / Math.max(1, simSpeed),
    });
  },
  advanceTrains: () => operationsState.fleets.map((fleet) => fleet.id),
  getDay: (value) => Math.floor(value / 1440),
});

const simulationApplication = new SimulationApplicationOrchestrator({
  settleDay: () => settleSimulationDay(),
  requestRenderDomains: (domains) => requestUpdateDomains(domains),
  pauseSimulation: () => gameLoopController.pause(),
  reportRuntimeError: (error) => console.error("Game loop failed", error),
  showRuntimeError: () => showError("게임 시간 진행 중 오류가 발생해 시뮬레이션을 일시정지했습니다."),
  dispatchSettlement: (result) => void runtimeResultDispatcher.dispatch([result]),
  reportSettlementFailure: (error) => {
    console.error("Daily settlement failed", error);
    showError("일일 결산을 적용하지 못해 이전 경제 상태로 복구했습니다.");
  },
});

const gameLoopController = new GameLoopController({
  advanceSimulationTick: (deltaMinutes) => simulationCoordinator.advance(deltaMinutes),
  onGameDayChanged: (result) => simulationApplication.handleGameDayChanged(result),
  requestRenderDomains: (request) => simulationApplication.handleRenderRequest(request),
  onRuntimeError: (error) => simulationApplication.handleRuntimeError(error),
  renderIntervalMs: settings.performanceMode === "battery" ? 66 : 16,
});

const constructionCoordinator = new ConstructionCoordinator<ConstructionProject>();
const eventRuntimeAdapter = new EventRuntimeAdapter<NewsEvent, NewsEvent[], NewsEvent>();
const networkInvalidation = new NetworkInvalidation();
const simulationRuntimeEffects = new SimulationRuntimeEffects(
  () => networkInvalidation.evaluate(["segment-add"]),
  transitRouterCache,
);
const runtimeResultDispatcher = new RuntimeResultDispatcher<NewsEvent>({
  requestUpdates: (domains) => requestUpdateDomains(domains),
  requestSave: (mode) => requestStateSave(mode === "immediate" ? "immediate" : "normal"),
  appendNews: (events) => newsEventState.appendMany(events),
  invalidateNetwork: () => simulationRuntimeEffects.invalidateStructuralNetwork(),
  reportError: (error) => console.error("Runtime result dispatch failed", error),
});
const eventCoordinator = new EventCoordinator<NewsEvent>({
  create: (day) => createNewsEvent(day),
  affectsDemand: (event) => event.demandMultiplier !== 1,
  affectsFinance: (event) => event.operatingCostMultiplier !== 1,
  minimumGapDays: 4,
  maximumActive: 3,
  maximumHistory: 80,
});
const saveFacade = new SaveFacade<SaveState>({
  capture: () => measureTask("save-serialization", cloneState),
  currentSlotId: () => metaState.current.slotId,
  service: getSaveSlotService,
  prepareForScheduledSave: synchronizeGraphReferences,
  delayMs: 240,
  onError: (error) => console.warn("[save] 상태 저장 실패", error),
});
const bootstrapController = new BootstrapController({
  createShell: () => initializeGameShell({
    applySettingsToUi,
    renderCityOptions,
    listSaveSlots,
    setSlotSummaries: (slots) => { slotSummaries = slots; },
    loadSavedState,
    getCityId: () => metaState.current.cityId,
    applyCityMapConstraints,
    updateEconomyHud,
    renderStartScreen,
    showStartScreen: (visible) => {
      if (visible && startScreen) startScreen.hidden = false;
    },
    hasNetworkRoutes: () => networkState.routes.length > 0,
    activateSession: () => { hasActiveGameSession = true; },
    resetMeta: () => metaState.reset(createDefaultMeta()),
    saveCurrentSlot,
    startAutoSave,
    updateCacheReadout,
  }),
  initializeStorage: () => { getSaveSlotService(); },
  loadSettings: () => undefined,
  loadState: () => undefined,
  initializeMap: () => {
    railLayer.addTo(map);
  },
  initializeUi: () => undefined,
  initializeScheduler: () => undefined,
  initializeLoop: () => {
    gameLoopController.setSpeed(simSpeed);
  },
  initialReconcile: () => {
    renderAll();
    updateLod();
    updateDynamicLayers();
  },
  connectAutosave: () => undefined,
  startLoop: () => {
    gameLoopController.start();
  },
});

const mapContainer = map.getContainer();
const mapInputListeners = new ListenerRegistry();
mapInputListeners.add("map:pointerdown", mapContainer, "pointerdown", onPointerDown, { passive: false });
mapInputListeners.add("map:pointermove", mapContainer, "pointermove", onPointerMove, { passive: false });
mapInputListeners.add("map:pointerup", mapContainer, "pointerup", onPointerUp, { passive: false });
mapInputListeners.add("map:pointercancel", mapContainer, "pointercancel", onPointerCancel, { passive: false });
mapInputListeners.add("window:pointermove-fallback", window, "pointermove", onWindowPointerMove, { passive: false, capture: true });
mapInputListeners.add("window:pointerup-fallback", window, "pointerup", onWindowPointerUp, { passive: false, capture: true });
mapInputListeners.add("window:pointercancel-fallback", window, "pointercancel", onWindowPointerCancel, { passive: false, capture: true });

registerMapLifecycle(map, baseLayer, {
  onReady: () => bootstrapController.initialize().then(() => {
    updateLoadingProgress(52, "기본 지도를 불러오고 있습니다");
  }).catch((error) => {
    console.error("Bootstrap failed", error);
    showError("게임을 초기화하지 못했습니다.");
  }),
  onBaseLayerLoad: () => finishLoading(),
  onBaseLayerError: () => {
    if (tileErrorReported) return;
    tileErrorReported = true;
    showToast("일부 지도 타일을 불러오지 못했습니다. 캐시 지도를 사용합니다.");
    window.setTimeout(() => {
      tileErrorReported = false;
    }, 12000);
  },
  onViewportChange: (event) => {
    if (event.type === "zoomend") requestUpdate("viewport", selectedRouteId ?? undefined);
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      updateDynamicLayers();
    }, 220);
  },
  onDragEnd: () => recordTutorialSignal("mapMoved"),
  onZoomEnd: () => recordTutorialSignal("mapZoomed"),
  onLoadingTimeout: () => finishLoading(),
});

routeTool?.addEventListener("click", () => setTool(activeTool === "route" ? "pan" : "route"));
modifyToolsButton?.addEventListener("click", () => {
  if (!modifyToolsCard) return;
  modifyToolsCard.hidden = !modifyToolsCard.hidden;
  modifyToolsButton.setAttribute("aria-expanded", String(!modifyToolsCard.hidden));
});
railModeNowButton?.addEventListener("click", () => {
  const open = railModeNowButton.getAttribute("aria-expanded") !== "true";
  railModeNowButton.setAttribute("aria-expanded", String(open));
  workspaceModeBar?.classList.toggle("game-mode-rail--modes-open", open);
  layoutRailTools();
});
compactRailQuery.addEventListener("change", () => syncRail());
// compact 화면에서 검토 중에는 노선 설정을 머리글만 남기고, 필요할 때 펼친다.
const routeSettingsExpandButton = document.querySelector<HTMLButtonElement>("#routeSettingsExpandButton");
routeSettingsExpandButton?.addEventListener("click", () => {
  const expanded = routeSettingsCard?.classList.toggle("is-expanded") ?? false;
  routeSettingsExpandButton.setAttribute("aria-expanded", String(expanded));
});
window.addEventListener("resize", () => layoutRailTools());
document.addEventListener("pointerdown", (event) => {
  if (!modifyToolsCard || modifyToolsCard.hidden) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (modifyToolsCard.contains(target) || modifyToolsButton?.contains(target)) return;
  modifyToolsCard.hidden = true;
  modifyToolsButton?.setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !modifyToolsCard || modifyToolsCard.hidden) return;
  modifyToolsCard.hidden = true;
  modifyToolsButton?.setAttribute("aria-expanded", "false");
  modifyToolsButton?.focus();
});
workspaceModeTabs.forEach((tab) => tab.addEventListener("click", () => setWorkspaceMode(tab.dataset.workspaceMode as WorkspaceMode)));
selectTool?.addEventListener("click", () => setTool("pan"));
manageLineTool?.addEventListener("click", () => {
  toggleLeftRouteWindow();
});
closeLeftRouteWindowButton?.addEventListener("click", closeLeftRouteWindow);
leftRouteNewButton?.addEventListener("click", () => {
  closeLeftRouteWindow();
  setWorkspaceMode("planning");
  setTool("route");
  showToast("새 노선 건설 도구가 선택되었습니다. 지도를 터치하여 역을 연결하세요.");
});
manageOperationsTool?.addEventListener("click", () => {
  openStatisticsScreen();
});
manageMapTool?.addEventListener("click", openDiagramScreen);
extendTool?.addEventListener("click", () => setTool(activeTool === "extend" ? "pan" : "extend"));
editTool?.addEventListener("click", () => setTool(activeTool === "edit" ? "pan" : "edit"));
eraserTool?.addEventListener("click", () => setTool(activeTool === "eraser" ? "pan" : "eraser"));
eraserSizeRange?.addEventListener("input", () => {
  eraserRadiusPx = Math.max(12, Math.min(48, Number(eraserSizeRange.value) || 20));
  setText(eraserSizeValue, String(eraserRadiusPx));
});
reconnectTool?.addEventListener("click", () => setTool(activeTool === "reconnect" ? "pan" : "reconnect"));
branchTool?.addEventListener("click", () => setTool(activeTool === "branch" ? "pan" : "branch"));
mergeTool?.addEventListener("click", () => setTool(activeTool === "merge" ? "pan" : "merge"));
stationTool?.addEventListener("click", () => setTool(activeTool === "station" ? "pan" : "station"));
transferTool?.addEventListener("click", () => setTool(activeTool === "transfer" ? "pan" : "transfer"));
depotTool?.addEventListener("click", () => setTool(activeTool === "depot" ? "pan" : "depot"));
planningModeButton?.addEventListener("click", openPlanningDialog);
planManagerButton?.addEventListener("click", openPlanningDialog);
planOverviewButton?.addEventListener("click", openPlanningDialog);
constructionManagerButton?.addEventListener("click", openConstructionManager);
constructionOverviewButton?.addEventListener("click", openConstructionManager);
closeConstructionManagerButton?.addEventListener("click", closeConstructionManager);
if (constructionManagerDialog) bindBackdropDismiss(constructionManagerDialog, closeConstructionManager);
constructionProjectList?.addEventListener("click", handleConstructionManagerClick);
closePlanningButton?.addEventListener("click", closePlanningDialog);
if (planningDialog) bindBackdropDismiss(planningDialog, closePlanningDialog);
activePlanSelect?.addEventListener("change", () => {
  activePlanId = activePlanSelect.value || null;
  renderPlanningDialog();
  requestUpdate("blueprint-preview");
});
newPlanButton?.addEventListener("click", createNewPlan);
duplicatePlanButton?.addEventListener("click", duplicateActivePlan);
deletePlanButton?.addEventListener("click", deleteActivePlan);
savePlanButton?.addEventListener("click", saveActivePlanMetadata);
convertPlanButton?.addEventListener("click", openPlanConversionDialog);
closePlanConversionButton?.addEventListener("click", closePlanConversionDialog);
cancelPlanConversionButton?.addEventListener("click", closePlanConversionDialog);
if (planConversionDialog) bindBackdropDismiss(planConversionDialog, closePlanConversionDialog);
planConversionItems?.addEventListener("change", handlePlanConversionSelectionChange);
selectAllPlanConversionButton?.addEventListener("click", () => setAllPlanConversionSelection(true));
clearPlanConversionButton?.addEventListener("click", () => setAllPlanConversionSelection(false));
fundPlanWithLoanButton?.addEventListener("click", fundPlanWithLoan);
confirmPlanConversionButton?.addEventListener("click", confirmPlanConversion);
undoButton?.addEventListener("click", undo);
redoButton?.addEventListener("click", redo);
closeConstructionPreviewButton?.addEventListener("click", cancelActiveReview);
cancelConstructionButton?.addEventListener("click", cancelActiveReview);
confirmConstructionButton?.addEventListener("click", () => void confirmActiveReview());
headerConfirmConstructionButton?.addEventListener("click", () => void confirmActiveReview());
manageLineButton?.addEventListener("click", openLineManager);
selectedLineColor?.addEventListener("click", openLineManager);
lineAutoFareButton?.addEventListener("click", () => {
  financeState.economy = { ...financeState.economy, autoFare: !financeState.economy.autoFare };
  if (financeState.economy.autoFare) financeState.economy.fare = calculateAutoFare();
  if (lineFareInput) lineFareInput.value = String(financeState.economy.fare);
  if (lineAutoFareButton) {
    lineAutoFareButton.classList.toggle("active", financeState.economy.autoFare);
    lineAutoFareButton.textContent = financeState.economy.autoFare ? "자동 요금 적용 중" : "수동 요금";
  }
  requestStateSave();
  updateEconomyHud();
});
closeLineButton?.addEventListener("click", () => selectRoute(null));
closeRouteChoiceButton?.addEventListener("click", closeRouteChoice);
if (routeChoiceDialog) bindBackdropDismiss(routeChoiceDialog, closeRouteChoice);
closeLineManagerButton?.addEventListener("click", () => {
  closeLineManager();
  selectRoute(null);
});
cancelLineManagerButton?.addEventListener("click", () => {
  closeLineManager();
  selectRoute(null);
});
openTrainManagerFromLineCardButton?.addEventListener("click", openTrainManagerModal);
addOperatingServiceButton?.addEventListener("click", () => openOperatingServiceEditor());
cancelOperatingServiceButton?.addEventListener("click", closeOperatingServiceEditor);
operatingServicePathSelect?.addEventListener("change", () => renderOperatingServiceStopChoices());
editOperatingServiceStopsOnMapButton?.addEventListener("click", beginOperatingServiceMapEdit);
cancelOperatingServiceMapEditButton?.addEventListener("click", cancelOperatingServiceMapEdit);
applyOperatingServiceMapEditButton?.addEventListener("click", applyOperatingServiceMapEdit);
operatingServiceStopList?.addEventListener("change", () => {
  operatingServiceDraftPreset = "custom";
  operatingServiceEditor?.querySelectorAll<HTMLElement>("[data-service-preset]").forEach((button) => button.classList.remove("active"));
  renderOperatingServiceStopChoices(
    Array.from(operatingServiceStopList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .filter((input) => input.checked)
      .map((input) => input.value),
  );
});
operatingServiceEditor?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveOperatingServiceEditor();
});
operatingServiceList?.addEventListener("click", handleOperatingServiceListClick);
operatingServiceEditor?.querySelectorAll<HTMLButtonElement>("[data-service-preset]").forEach((button) => {
  button.addEventListener("click", () => applyOperatingServicePreset(button.dataset.servicePreset as StopPreset));
});
deleteOperatingServiceButton?.addEventListener("click", deleteSelectedOperatingService);
closeTrainManagerButton?.addEventListener("click", closeTrainManagerModal);
if (trainManagerDialog) bindBackdropDismiss(trainManagerDialog, closeTrainManagerModal);
saveLineManagerButton?.addEventListener("click", saveLineManager);
deleteLineManagerButton?.addEventListener("click", requestWholeLineDemolition);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && operatingServiceMapEditActive) {
    event.preventDefault();
    cancelOperatingServiceMapEdit();
    return;
  }
  if (event.key === "Escape" && mergeDialog && !mergeDialog.hidden) closeMergeDialog();
  if (event.key === "Escape" && decisionDialog && !decisionDialog.hidden) closeDecisionDialog();
});
operationRouteSelect?.addEventListener("change", () => {
  selectedOperationRouteId = operationRouteSelect.value;
  updateExpressButton();
  requestUpdate("selection", selectedOperationRouteId);
});
cashPill?.addEventListener("click", openFinanceDialog);
closeFinanceButton?.addEventListener("click", closeFinanceDialog);
if (financeDialog) bindBackdropDismiss(financeDialog, closeFinanceDialog);
satisfactionPill?.addEventListener("click", openSatisfactionDialog);
closeSatisfactionButton?.addEventListener("click", closeSatisfactionDialog);
if (satisfactionDialog) bindBackdropDismiss(satisfactionDialog, closeSatisfactionDialog);
openStatisticsFromFinanceButton?.addEventListener("click", () => {
  closeFinanceDialog();
  openStatisticsScreen();
});
dialogAutoFareButton?.addEventListener("click", () => {
  financeState.economy = { ...financeState.economy, autoFare: !financeState.economy.autoFare };
  if (financeState.economy.autoFare) financeState.economy.fare = calculateAutoFare();
  requestStateSave();
  updateEconomyHud();
});
menuButton?.addEventListener("click", openInGameMenu);
closeInGameMenuButton?.addEventListener("click", closeInGameMenu);
if (inGameMenuDialog) bindBackdropDismiss(inGameMenuDialog, closeInGameMenu);
menuSaveTabButton?.addEventListener("click", () => switchInGameMenuTab("save"));
menuLoadTabButton?.addEventListener("click", () => switchInGameMenuTab("load"));
menuQuickSaveButton?.addEventListener("click", async () => {
  const button = menuQuickSaveButton as HTMLButtonElement;
  if (button.disabled) return;
  button.disabled = true;
  if (menuSaveStatusReadout) menuSaveStatusReadout.textContent = "저장 중…";
  try {
    const saved = await saveCurrentSlot("수동 저장");
    if (!saved) {
      if (menuSaveStatusReadout) menuSaveStatusReadout.textContent = "저장 실패 · 다시 시도해 주세요";
      return;
    }
    if (menuSaveStatusReadout) {
      const timeStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      menuSaveStatusReadout.textContent = `저장 완료! (${timeStr})`;
    }
    showToast("게임을 저장했습니다!");
  } catch {
    if (menuSaveStatusReadout) menuSaveStatusReadout.textContent = "저장 실패 · 다시 시도해 주세요";
    showError("게임을 저장하지 못했습니다. 다시 시도해 주세요.");
  } finally {
    button.disabled = false;
  }
});
menuOpenSettingsButton?.addEventListener("click", () => {
  closeInGameMenu();
  openSettings();
});
menuReturnTitleButton?.addEventListener("click", () => {
  closeInGameMenu();
  if (startScreen) startScreen.hidden = false;
  renderStartScreen();
});
menuResumeGameButton?.addEventListener("click", closeInGameMenu);

dialogFareInput?.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  const val = parseInt(target.value, 10);
  if (!isNaN(val)) {
    financeState.economy = { ...financeState.economy, fare: clampInteger(val, 900, 4200), autoFare: false };
    requestStateSave();
    updateEconomyHud();
  }
});

buyTrainButton?.addEventListener("click", buyTrainsForSelectedRoute);
expressButton?.addEventListener("click", toggleExpressForSelectedRoute);
analysisButton?.addEventListener("click", openAnalysisScreen);
closeAnalysisButton?.addEventListener("click", closeAnalysisScreen);
refreshAnalysisButton?.addEventListener("click", () => {
  refreshOperationSuggestions(true);
  renderAnalysisScreen();
});
analysisFilter?.addEventListener("change", renderAnalysisScreen);
[analysisUrgentList, analysisReportList].forEach((list) => {
  list?.addEventListener("click", handleSuggestionClick);
});
statisticsButton?.addEventListener("click", openStatisticsScreen);
closeStatisticsButton?.addEventListener("click", closeStatisticsScreen);

closeStationManagerButton?.addEventListener("click", closeStationManager);
closeDepotManagerButton?.addEventListener("click", closeDepotManager);
newsButton?.addEventListener("click", openNewsScreen);
closeNewsButton?.addEventListener("click", closeNewsScreen);
newsFilter?.addEventListener("change", renderNewsFeed);
newsFeed?.addEventListener("click", handleNewsFeedClick);
saveNetworkTitleButton?.addEventListener("click", saveNetworkTitle);
statisticsTabs.forEach((button) => {
  button.addEventListener("click", () => {
    activeStatisticsTab = (button.dataset.statisticsTab as typeof activeStatisticsTab) || "overview";
    renderStatisticsScreen();
  });
});
fareInput?.addEventListener("change", () => {
  financeState.economy = { ...financeState.economy, fare: clampInteger(Number(fareInput.value), 900, 4200), autoFare: false };
  updateAutoFareButton();
  requestStateSave();
  requestUpdate("fare", selectedOperationRouteId);
});
autoFareButton?.addEventListener("click", () => {
  financeState.economy = { ...financeState.economy, autoFare: !financeState.economy.autoFare };
  if (financeState.economy.autoFare) financeState.economy.fare = calculateAutoFare();
  updateAutoFareButton();
  requestStateSave();
  requestUpdate("fare", selectedOperationRouteId);
});
loanButton?.addEventListener("click", takeLoan);
repayButton?.addEventListener("click", repayLoan);
newGameButton?.addEventListener("click", () => {
  const mode = (modeSelect?.value as GameMode) || "sandbox";
  const difficulty = (difficultySelect?.value as Difficulty) || "normal";
  const cityId = (citySelect?.value as CityId) || "seoul";
  void createNewGame(mode, difficulty, cityId, slotNameInput?.value || `${cityConfigs[cityId].name} 계획`);
});
continueButton?.addEventListener("click", () => {
  const latest = slotSummaries[0];
  if (latest) loadSlot(latest.slotId);
});
closeSaveEditorButton?.addEventListener("click", closeSaveEditor);
cancelSaveEditorButton?.addEventListener("click", closeSaveEditor);
saveEditorForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveEditedSlot();
});
if (saveEditorDialog) bindBackdropDismiss(saveEditorDialog, closeSaveEditor);
function syncSetupChoice(input: HTMLSelectElement | null) {
  if (!input) return;
  document.querySelectorAll<HTMLElement>(`[data-choice-input="${input.id}"]`).forEach((field) => {
    field.querySelectorAll<HTMLButtonElement>("[data-choice-value]").forEach((button) => {
      const selected = button.dataset.choiceValue === input.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
  });
}

document.querySelectorAll<HTMLElement>("[data-choice-input]").forEach((field) => {
  field.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-choice-value]");
    const inputId = field.dataset.choiceInput;
    const input = inputId ? document.getElementById(inputId) as HTMLSelectElement | null : null;
    const value = button?.dataset.choiceValue;
    if (!button || !input || !value || input.value === value) return;
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

modeSelect?.addEventListener("change", () => {
  syncSetupChoice(modeSelect);
  renderCityOptions();
});
difficultySelect?.addEventListener("change", () => syncSetupChoice(difficultySelect));
citySelect?.addEventListener("change", updateCityNote);
cityPicker?.addEventListener("click", (event) => {
  const card = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-city-id]");
  const cityId = card?.dataset.cityId as CityId | undefined;
  if (!cityId || card?.disabled || !citySelect) return;
  citySelect.value = cityId;
  updateCityNote();
});
syncSetupChoice(modeSelect);
syncSetupChoice(difficultySelect);
saveButton?.addEventListener("click", () => saveCurrentSlot("수동 저장"));
openDiagramButton?.addEventListener("click", openDiagramScreen);
diagramToolButton?.addEventListener("click", openDiagramScreen);
closeDiagramButton?.addEventListener("click", closeDiagramScreen);
diagramRouteFilter?.addEventListener("change", () => {
  diagramStateOwner.selectRoute(diagramRouteFilter.value || "all");
  renderMetroDiagram();
});
diagramBackgroundSelect?.addEventListener("change", () => {
  const background = ["light", "blueprint"].includes(diagramBackgroundSelect.value) ? (diagramBackgroundSelect.value as "light" | "blueprint") : "dark";
  diagramStateOwner.setBackground(background);
  renderMetroDiagram();
});
diagramLabelsToggle?.addEventListener("change", () => {
  diagramStateOwner.setStationNamesVisible(diagramLabelsToggle.checked);
  renderMetroDiagram();
});
diagramCompanyToggle?.addEventListener("change", () => {
  diagramStateOwner.setCompanyInfoVisible(diagramCompanyToggle.checked);
  renderMetroDiagram();
});
resetDiagramLayoutButton?.addEventListener("click", resetDiagramLayout);
saveDiagramSvgButton?.addEventListener("click", saveDiagramSvg);
exportShareJsonButton?.addEventListener("click", exportShareBundle);
importShareJsonButton?.addEventListener("click", () => importShareJsonInput?.click());
importShareJsonInput?.addEventListener("change", importShareBundle);
metroDiagramSvg?.addEventListener("pointerdown", startDiagramStationDrag);
metroDiagramSvg?.addEventListener("pointermove", moveDiagramStationDrag);
metroDiagramSvg?.addEventListener("pointerup", finishDiagramStationDrag);
metroDiagramSvg?.addEventListener("pointercancel", finishDiagramStationDrag);
helpButton?.addEventListener("click", () => {
  closeInGameMenu();
  openTutorial(true);
});
guideButton?.addEventListener("click", () => openTutorial(true));
closeSettingsButton?.addEventListener("click", closeSettings);
if (settingsDialog) bindBackdropDismiss(settingsDialog, closeSettings);
closeRouteSettingsButton?.addEventListener("click", () => setTool("pan"));
saveRouteSettingsButton?.addEventListener("click", saveRouteSettings);
soundToggle?.addEventListener("change", () => updateSettings({ soundEnabled: Boolean(soundToggle.checked) }));
hapticsToggle?.addEventListener("change", () => updateSettings({ hapticsEnabled: Boolean(hapticsToggle.checked) }));
performanceSelect?.addEventListener("change", () => updateSettings({ performanceMode: performanceSelect.value === "battery" ? "battery" : "balanced" }));
mapThemeSelect?.addEventListener("change", () => updateSettings({ mapTheme: normalizeMapTheme(mapThemeSelect.value) }));
reducedMotionToggle?.addEventListener("change", () => updateSettings({ reducedMotion: Boolean(reducedMotionToggle.checked) }));
sandboxConstructionTimeToggle?.addEventListener("change", () =>
  updateSettings({ sandboxConstructionTime: Boolean(sandboxConstructionTimeToggle.checked) }),
);
autoStationNamingToggle?.addEventListener("change", () =>
  updateSettings({ autoStationNaming: Boolean(autoStationNamingToggle.checked) }),
);
autoSaveToggle?.addEventListener("change", () => updateSettings({ autoSaveEnabled: Boolean(autoSaveToggle.checked) }));
autoSaveIntervalSelect?.addEventListener("change", () => {
  const value = Number(autoSaveIntervalSelect.value);
  const interval = ([30, 60, 180, 300].includes(value) ? value : 30) as GameSettings["autoSaveIntervalSeconds"];
  updateSettings({ autoSaveIntervalSeconds: interval });
});
clearCacheButton?.addEventListener("click", clearMapCache);
tutorialNextButton?.addEventListener("click", advanceTutorial);
tutorialSkipButton?.addEventListener("click", () => completeTutorial(true));
errorDismissButton?.addEventListener("click", clearError);
errorRetryButton?.addEventListener("click", () => {
  const action = retryAction;
  clearError();
  action?.();
});
/** 배속 순서. 배속 칸을 누를 때마다 다음 값으로 넘어간다(docs/design/DESIGN_SYSTEM.md §9). */
const speedSteps = [2, 5, 10, 100] as const;
let lastRunningSpeed: number = speedSteps[0];

function nextSpeedStep(speed: number) {
  const index = speedSteps.indexOf(speed as (typeof speedSteps)[number]);
  return speedSteps[(index + 1) % speedSteps.length];
}

function setSimulationSpeed(nextSpeed: number) {
  simSpeed = nextSpeed;
  if (simSpeed > 0) lastRunningSpeed = simSpeed;
  gameLoopController.setSpeed(simSpeed);
  if (simSpeed === 0) gameLoopController.pause();
  else gameLoopController.resume();
  if (simSpeed > 0) recordTutorialSignal("timeStarted", false);
  syncSpeedControls();
  setText(modeLabel, simSpeed === 0 ? "일시정지" : `운영 x${simSpeed}`);
  updateTutorialProgress();
  playFeedback("select");
}

pauseToggleButton?.addEventListener("click", () => setSimulationSpeed(simSpeed === 0 ? lastRunningSpeed : 0));
// 정지 중에 누르면 다음 배속으로 재개한다.
speedCycleButton?.addEventListener("click", () => setSimulationSpeed(nextSpeedStep(simSpeed === 0 ? lastRunningSpeed : simSpeed)));
syncSpeedControls();

// 정보판이 큰 글자로 줄바꿈되어도 레일·지도 컨트롤이 그 아래에 오도록 실제 아래쪽 위치를 반영한다.
const topPlates = [byId("financePlate"), byId("timePlate")].filter((plate): plate is HTMLElement => Boolean(plate));
if (topPlates.length && "ResizeObserver" in window) {
  const observer = new ResizeObserver(() => {
    const bottom = Math.max(...topPlates.map((plate) => plate.getBoundingClientRect().bottom));
    document.documentElement.style.setProperty("--hud-top", `${Math.ceil(bottom)}px`);
    placeModeBanner();
    layoutRailTools();
  });
  topPlates.forEach((plate) => observer.observe(plate));
}
document.addEventListener("pointerdown", (event) => {
  const layerMenu = document.querySelector<HTMLDetailsElement>(".game-layer-menu");
  if (layerMenu?.open && !(event.target as Element).closest(".game-layer-menu")) layerMenu.open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const layerMenu = document.querySelector<HTMLDetailsElement>(".game-layer-menu");
  if (layerMenu?.open) layerMenu.open = false;
});

layerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.layer as OverlayKey;
    overlayState[key] = !overlayState[key];
    button.classList.toggle("active", overlayState[key]);
    button.setAttribute("aria-pressed", String(overlayState[key]));
    applyLayerVisibility(key);
    updateDynamicLayers();
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}

async function requestLandscapeOrientation() {
  // Android's native activity is locked in the manifest. This only supplements
  // installed PWAs and browsers that expose the Screen Orientation API.
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: "landscape") => Promise<void> };
    if (orientation.lock) await orientation.lock("landscape");
  } catch {
    // Browsers such as iOS Safari require a user gesture or do not permit locks.
  }
}

void requestLandscapeOrientation();

window.addEventListener("error", (event) => {
  console.error(event.error ?? event.message);
  showError("예상치 못한 오류가 발생했습니다. 저장된 게임은 유지됩니다.", () => window.location.reload());
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  showError("데이터를 불러오는 중 문제가 발생했습니다. 네트워크를 확인해 주세요.", () => updateDynamicLayers());
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void requestLandscapeOrientation();
    if (simSpeed > 0) gameLoopController.resume();
  }
  if (document.visibilityState === "hidden" && hasActiveGameSession) void saveCurrentSlot("백그라운드 저장");
});

function findPlanningRouteContinuation(point: L.Point, thresholdPx = 56): PlanningRouteContinuation | null {
  if (!planningMode || activeTool !== "extend") return null;
  const candidates: PlanningRouteContinuation[] = [];
  const plan = getActivePlan(false);
  for (const route of plan?.routes ?? []) {
    if (route.coordinates.length < 2) continue;
    const basePoints = route.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
    candidates.push({ atStart: true, anchor: map.latLngToContainerPoint(basePoints[0]), basePoints, plannedRouteId: route.id, color: route.color });
    candidates.push({ atStart: false, anchor: map.latLngToContainerPoint(basePoints[basePoints.length - 1]), basePoints, plannedRouteId: route.id, color: route.color });
  }
  if (activeTool === "extend") {
    for (const route of networkState.routes) {
      if (route.coordinates.length < 2) continue;
      const start = L.latLng(route.coordinates[0][0], route.coordinates[0][1]);
      const endCoordinate = route.coordinates[route.coordinates.length - 1];
      const end = L.latLng(endCoordinate[0], endCoordinate[1]);
      candidates.push({ atStart: true, anchor: map.latLngToContainerPoint(start), basePoints: [start], actualRouteId: route.id, color: route.color });
      candidates.push({ atStart: false, anchor: map.latLngToContainerPoint(end), basePoints: [end], actualRouteId: route.id, color: route.color });
    }
  }
  return candidates
    .map((candidate) => ({ candidate, distance: point.distanceTo(candidate.anchor) }))
    .filter((item) => item.distance <= thresholdPx)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate ?? null;
}

function combinePlanningContinuation(points: LatLng[]) {
  const continuation = activePlanningContinuation;
  if (!continuation) return points;
  const addition = points.slice(1);
  if (continuation.actualRouteId) return [...continuation.basePoints, ...addition];
  return continuation.atStart ? [...addition.reverse(), ...continuation.basePoints] : [...continuation.basePoints, ...addition];
}

function nearestScreenPathDistance(point: L.Point, coordinates: Array<[number, number]>) {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = map.latLngToContainerPoint(L.latLng(...coordinates[index - 1]));
    const end = map.latLngToContainerPoint(L.latLng(...coordinates[index]));
    best = Math.min(best, distanceToSegment(point, start, end));
  }
  return best;
}

function collectMapHitCandidates(point: L.Point, pointerType: string): MapHitCandidate[] {
  const touch = pointerType === "touch";
  const candidates: MapHitCandidate[] = [];
  if (workspaceMode === "management" && map.getZoom() >= 14) {
    for (const target of trainHitTargets.values()) {
      const targetPoint = map.latLngToContainerPoint(L.latLng(...target.position));
      const dx = Math.abs(point.x - targetPoint.x);
      const dy = Math.abs(point.y - targetPoint.y);
      const halfWidth = getTargetHitRadius("train", pointerType);
      const halfHeight = touch ? 16 : 10;
      candidates.push({
        id: target.key,
        kind: "train",
        label: target.label,
        distancePx: Math.hypot(dx, dy),
        hit: dx <= halfWidth && dy <= halfHeight,
        data: { kind: "train", target } satisfies MapSelectionData,
      });
    }
  }
  if (map.getZoom() >= 13) {
    const stationRadius = getTargetHitRadius("station", pointerType);
    for (const station of networkState.stations) {
      const distancePx = point.distanceTo(map.latLngToContainerPoint(L.latLng(...station.position)));
      candidates.push({
        id: station.id,
        kind: "station",
        label: station.name,
        distancePx,
        hit: distancePx <= stationRadius,
        data: { kind: "station", stationId: station.id } satisfies MapSelectionData,
      });
    }
    for (const transfer of networkState.transfers) {
      const transferStations = transfer.stationIds.map((id) => networkState.stations.find((station) => station.id === id)).filter(Boolean) as Station[];
      if (transferStations.length < 2) continue;
      const centre = L.latLng(
        transferStations.reduce((sum, station) => sum + station.position[0], 0) / transferStations.length,
        transferStations.reduce((sum, station) => sum + station.position[1], 0) / transferStations.length,
      );
      const distancePx = point.distanceTo(map.latLngToContainerPoint(centre));
      candidates.push({
        id: transfer.id,
        kind: "transfer",
        label: transferStations.map((station) => station.name).join(" / "),
        distancePx,
        hit: distancePx <= getTargetHitRadius("transfer", pointerType),
        data: { kind: "station", stationId: transferStations[0].id } satisfies MapSelectionData,
      });
    }
  }
  for (const depot of networkState.depots) {
    const polygon = depot.polygon.map((coordinate) => map.latLngToContainerPoint(L.latLng(...coordinate)));
    const inside = hitPointInPolygon(point, polygon);
    candidates.push({
      id: depot.id,
      kind: "depot",
      label: depot.name,
      distancePx: inside ? 0 : Number.POSITIVE_INFINITY,
      hit: inside,
      data: { kind: "depot", depotId: depot.id } satisfies MapSelectionData,
    });
  }
  if (workspaceMode === "construction") {
    for (const project of constructionState.projects.filter((item) => item.status !== "operating" && item.coordinates.length >= 2)) {
      const distancePx = nearestScreenPathDistance(point, project.coordinates);
      candidates.push({
        id: project.id,
        kind: "construction",
        label: project.name,
        distancePx,
        hit: distancePx <= getTargetHitRadius("construction", pointerType),
        data: { kind: "construction", projectId: project.id } satisfies MapSelectionData,
      });
    }
  }
  if (workspaceMode === "planning" || planningMode) {
    for (const plan of constructionState.plans.filter((item) => item.cityId === metaState.current.cityId)) {
      for (const route of plan.routes) {
        const distancePx = nearestScreenPathDistance(point, route.coordinates);
        candidates.push({
          id: route.id,
          kind: "blueprint",
          label: route.name,
          distancePx,
          hit: distancePx <= getTargetHitRadius("blueprint", pointerType),
          data: { kind: "blueprint", planId: plan.id, assetId: route.id, assetKind: "route" } satisfies MapSelectionData,
        });
      }
      for (const station of plan.stations.filter((item) => !item.completed)) {
        const distancePx = point.distanceTo(map.latLngToContainerPoint(L.latLng(station.position[0], station.position[1])));
        candidates.push({
          id: `planned-station:${plan.id}:${station.id}`,
          kind: "blueprint",
          label: station.name,
          distancePx,
          hit: distancePx <= getTargetHitRadius("station", pointerType),
          data: { kind: "blueprint", planId: plan.id, assetId: station.id, assetKind: "station" } satisfies MapSelectionData,
        });
      }
    }
  }
  const routeRadius = getTargetHitRadius("route", pointerType);
  for (const route of networkState.routes) {
    const distancePx = Math.min(...getRoutePaths(route).map((path) =>
      nearestScreenPathDistance(point, path.map((latLng) => [latLng.lat, latLng.lng] as [number, number]))
    ));
    candidates.push({
      id: route.id,
      kind: "route",
      label: route.name,
      distancePx,
      hit: distancePx <= routeRadius,
      data: { kind: "route", routeId: route.id } satisfies MapSelectionData,
    });
  }
  return candidates;
}

function activateMapSelection(data: MapSelectionData) {
  if (data.kind === "train") {
    selectRoute(data.target.routeId);
    openTrainManagerForFleet(data.target.fleetId, data.target.setNumber);
  } else if (data.kind === "station") {
    openStationManager(data.stationId);
  } else if (data.kind === "depot") {
    selectedDepotId = data.depotId;
    openDepotManager(data.depotId);
  } else if (data.kind === "route") {
    selectRoute(data.routeId);
    openLineManager();
  } else if (data.kind === "construction") {
    openConstructionManager();
  } else {
    if (data.assetKind === "station") {
      openPlannedStationManager(data.planId, data.assetId);
    } else {
      activePlanId = data.planId;
      openPlanningDialog();
    }
  }
}

const mapTargetKindLabels: Record<MapHitCandidate["kind"], string> = {
  train: "열차",
  station: "역",
  transfer: "환승",
  depot: "차량기지",
  route: "노선",
  construction: "공사",
  blueprint: "계획",
};

function openMapTargetChoice(candidates: Array<MapHitCandidate & { score: number }>) {
  if (!routeChoiceDialog || !routeChoiceList) return;
  routeChoiceList.innerHTML = candidates.map((candidate, index) =>
    `<button class="game-route-item" type="button" data-map-target-index="${index}"><span class="dg-tag">${mapTargetKindLabels[candidate.kind]}</span><span class="game-route-item__text"><strong>${escapeHtml(candidate.label)}</strong></span></button>`
  ).join("");
  routeChoiceList.querySelectorAll<HTMLButtonElement>("[data-map-target-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const candidate = candidates[Number(button.dataset.mapTargetIndex)];
      if (candidate?.data) activateMapSelection(candidate.data as MapSelectionData);
      closeRouteChoice();
    });
  });
  routeChoiceDialog.hidden = false;
}

const mapSelectionApplicationController = new MapSelectionApplicationController<RankedMapTarget>({
  // 빈 지도 탭은 선택을 해제하고 열린 inspector를 닫는다(MOBILE_UX §5, §7.1).
  clearSelection: () => {
    selectRoute(null);
    closeStationManager();
    closeDepotManager();
  },
  openAlternatives: (candidates) => openMapTargetChoice(candidates),
  activateSelection: (selection) => {
    if (selection.data) activateMapSelection(selection.data as MapSelectionData);
  },
});

function handleUnifiedMapSelection(point: L.Point, pointerType: string) {
  const result = resolveMapTarget(collectMapHitCandidates(point, pointerType), pointerType, 7, workspaceMode);
  mapSelectionApplicationController.apply(result);
}

function resetRouteDrawingHudProximity() {
  document.body.classList.remove("route-drawing-hud-proximity");
  document.body.style.removeProperty("--route-drawing-top-opacity");
  document.body.style.removeProperty("--route-drawing-top-shift");
  document.body.style.removeProperty("--route-drawing-bottom-opacity");
  document.body.style.removeProperty("--route-drawing-bottom-shift");
}

function updateRouteDrawingHudProximity(clientY: number) {
  if (activePointerId === null || !routeStrokeHudTools.has(activeTool)) {
    resetRouteDrawingHudProximity();
    return;
  }

  const proximity = calculateEdgeHudProximity(clientY, window.innerHeight);

  document.body.classList.add("route-drawing-hud-proximity");
  document.body.style.setProperty("--route-drawing-top-opacity", proximity.topOpacity.toFixed(3));
  document.body.style.setProperty("--route-drawing-top-shift", `${proximity.topShiftPx}px`);
  document.body.style.setProperty("--route-drawing-bottom-opacity", proximity.bottomOpacity.toFixed(3));
  document.body.style.setProperty("--route-drawing-bottom-shift", `${proximity.bottomShiftPx}px`);
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const pointerTarget = event.target as HTMLElement;
  if (operatingServiceMapEditActive && pointerTarget.closest(".operating-service-station-target")) return;
  if (pointerTarget.closest(".hud, .dg-hud, .route-sheet, .selected-line-panel, .right-line-control-card, .construction-preview-panel, .dialog-backdrop")) return;
  if (demolitionReview) return;
  if (event.pointerType === "touch" && activePointerId !== null && event.pointerId !== activePointerId) {
    cancelActiveDrawing();
    setText(facilityReadout, "확대/축소 후 다시 그리세요");
    return;
  }
  const point = containerPointFromEvent(event);
  if (activeTool === "pan") {
    mapSelectionGestureController.begin(event.pointerId, event.pointerType, point);
    return;
  }
  const planningContinuation = findPlanningRouteContinuation(point);
  if (constructionDraft && activePointerId === null && !planningContinuation) {
    map.dragging.enable();
    return;
  }

  if (activePointerId === null) map.dragging.disable();
  if (activeTool === "edit") {
    event.preventDefault();
    const handle = findNearestEditHandle(point, 32);
    if (!handle) {
      const hits = findRoutesAtPoint(point, 26);
      if (hits.length === 1) selectRoute(hits[0].id);
      else setText(facilityReadout, "밝은 편집 핸들을 드래그하세요");
      return;
    }
    selectRoute(handle.routeId, false);
    activeHandleMove = handle;
    activePointerId = event.pointerId;
    handlePreviewCoordinates = handle.originalCoordinates.map((coordinate) => [...coordinate] as [number, number]);
    map.dragging.disable();
    captureDrawingPointer(event.pointerId);
    return;
  }
  if (activeTool === "station") {
    event.preventDefault();
    createStationAt(point);
    return;
  }
  if (activeTool === "transfer") {
    event.preventDefault();
    selectTransferStation(point);
    return;
  }
  if (activeTool === "expressStop") {
    event.preventDefault();
    toggleExpressStopAt(point);
    return;
  }
  if (activeTool === "eraser") {
    event.preventDefault();
    if (!planningMode) {
      const station = findNearestStationAtPoint(point, Math.max(22, eraserRadiusPx + 4));
      if (station) {
        requestStationDemolition(station);
        return;
      }
    }
    beginEraserStroke(event, point);
    return;
  }
  if (activeTool === "merge") {
    event.preventDefault();
    beginConnectionDrawing(event, point);
    updateRouteDrawingHudProximity(event.clientY);
    return;
  }
  if (activeTool !== "route" && activeTool !== "extend" && activeTool !== "reconnect" && activeTool !== "branch" && activeTool !== "depot" && !(planningMode && activeTool === "eraser")) return;
  if (activePointerId !== null) return;

  if (constructionDraft && !planningContinuation) cancelConstructionDraft();
  activePlanningContinuation = planningContinuation;
  if (planningContinuation) selectedColor = planningContinuation.color;
  replacingPlannedRouteId = planningContinuation?.plannedRouteId ?? null;
  if (planningContinuation) {
    const targetRoute = planningContinuation.plannedRouteId
      ? getActivePlan(false)?.routes.find((route) => route.id === planningContinuation.plannedRouteId)
      : networkState.routes.find((route) => route.id === planningContinuation.actualRouteId);
    if (targetRoute) showRouteSettingsTarget(targetRoute, planningContinuation.plannedRouteId ? "planned" : "actual");
  }

  event.preventDefault();
  if (activeTool === "extend") {
    if (planningMode) {
      if (!planningContinuation) {
        setText(facilityReadout, "계획 노선의 시작점 또는 끝점에서 드래그하세요");
        return;
      }
    } else {
    const extension = findNearestRouteEndpoint(point, 56, selectedRouteId);
    if (!extension) {
      setText(facilityReadout, "노선 끝점을 누른 뒤 드래그하세요");
      return;
    }
    activeExtension = extension;
    selectRoute(extension.routeId, false);
    const targetRoute = networkState.routes.find((route) => route.id === extension.routeId);
    if (targetRoute) showRouteSettingsTarget(targetRoute, "actual");
    }
  }
  if (activeTool === "branch") {
    if (planningMode) {
      const snap = findNearestPlannedRoutePoint(point);
      if (!snap || snap.distancePx > 56) {
        setText(facilityReadout, "계획 노선 위에서 분기를 시작하세요");
        return;
      }
      activePlanningBranch = { routeId: snap.route.id, junction: map.latLngToContainerPoint(snap.latLng), junctionLatLng: snap.latLng, color: snap.route.color };
      selectedColor = snap.route.color;
      showRouteSettingsTarget(snap.route, "planned");
    } else {
    const snap = findNearestRoutePoint(point, selectedRouteId ?? undefined);
    if (!snap || snap.distancePx > 34) {
      setText(facilityReadout, "분기할 노선 위에서 드래그를 시작하세요");
      return;
    }
    const station = findNearestStation(point, 30);
    const stationOnRoute = station?.connectedRouteIds.includes(snap.route.id) ? station : null;
    const existingJunction = (snap.route.nodes ?? [])
      .filter((node) => node.kind === "branch")
      .map((node) => ({ node, distance: point.distanceTo(map.latLngToContainerPoint(L.latLng(...node.position))) }))
      .filter((item) => item.distance <= 30)
      .sort((a, b) => a.distance - b.distance)[0]?.node;
    const preparedJunction =
      pendingBranchJunction?.targetLineId === snap.route.id &&
      point.distanceTo(map.latLngToContainerPoint(L.latLng(pendingBranchJunction.position.lat, pendingBranchJunction.position.lng))) <= 36
        ? pendingBranchJunction
        : null;
    if (!stationOnRoute && !existingJunction && !preparedJunction) {
      const segmentMatch = findRouteSegmentAtPoint(snap.route, point);
      if (!segmentMatch) {
        setText(facilityReadout, "분기점을 만들 선로 구간을 찾을 수 없습니다.");
        return;
      }
      const junction = createJunctionBlueprint({
        id: createId("junction-blueprint"),
        targetLineId: snap.route.id,
        sourceSegmentId: segmentMatch.segment.id,
        position: { lat: segmentMatch.latLng.lat, lng: segmentMatch.latLng.lng },
        splitRatio: segmentMatch.splitRatio,
        createsStation: false,
      });
      openDecisionDialog(
        "이 선로 위치에 분기점을 만들까요?",
        "명시적 junction을 먼저 만든 뒤 같은 위치에서 지선 경로를 드래그합니다. 역은 자동으로 생성되지 않습니다.",
        "분기점 만들기",
        () => {
          pendingBranchJunction = junction;
          mapLayers.clear("edit-guide");
          L.circleMarker(L.latLng(junction.position.lat, junction.position.lng), {
            radius: 12, color: "#ffffff", weight: 3, fillColor: snap.route.color,
            fillOpacity: 0.75, dashArray: "4 3", interactive: false,
          }).addTo(editGuideLayer);
          setText(facilityReadout, "생성할 분기점에서 지선 종점까지 드래그하세요");
        },
      );
      return;
    }
    const junctionLatLng = preparedJunction
      ? L.latLng(preparedJunction.position.lat, preparedJunction.position.lng)
      : existingJunction
        ? L.latLng(...existingJunction.position)
        : L.latLng(...stationOnRoute!.position);
    pendingBranchJunction = null;
    selectRoute(snap.route.id, false);
    showRouteSettingsTarget(snap.route, "actual");
    activeBranch = {
      routeId: snap.route.id,
      junction: map.latLngToContainerPoint(junctionLatLng),
      junctionLatLng,
      junctionBlueprint: preparedJunction ?? undefined,
    };
    }
  }
  if (activeTool === "reconnect") {
    const repair = findNearestRepairEndpoint(point, 36);
    if (!repair) {
      setText(facilityReadout, "붉은 수정 지점에서 시작하세요");
      return;
    }
    activeRepair = repair;
  }
  const sourceLineId =
    activeExtension?.routeId ??
    activePlanningContinuation?.actualRouteId ??
    activePlanningContinuation?.plannedRouteId ??
    activeBranch?.routeId ??
    activePlanningBranch?.routeId;
  routePlanningController.beginDrawing({
    sourceEntityId: sourceLineId,
    sourceLineId: activePlanningContinuation?.actualRouteId ?? activeExtension?.routeId ?? activeBranch?.routeId,
    sourceBlueprintId: activePlanningContinuation?.plannedRouteId ?? activePlanningBranch?.routeId,
  });
  activePointerId = event.pointerId;
  updateRouteDrawingHudProximity(event.clientY);
  rawDrawPoints = activeExtension
    ? [activeExtension.endpoint]
    : activeRepair
      ? [activeRepair.start, point]
      : activeBranch
        ? [activeBranch.junction]
        : activePlanningBranch
          ? [activePlanningBranch.junction]
        : activePlanningContinuation
          ? [activePlanningContinuation.anchor]
          : [point];
  captureDrawingPointer(event.pointerId);
  mapLayers.clear("construction-preview");

  if (activeTool === "route" || activeTool === "extend" || activeTool === "reconnect" || activeTool === "branch") {
    const color = activeExtension
      ? getRouteColor(activeExtension.routeId)
      : activeRepair
        ? getRouteColor(activeRepair.routeId)
        : activeBranch
          ? getRouteColor(activeBranch.routeId)
          : activePlanningBranch
            ? activePlanningBranch.color
          : activePlanningContinuation?.color ?? selectedColor;
    previewPolyline = L.polyline(rawDrawPoints.map((screenPoint) => map.containerPointToLatLng(screenPoint)), routeStyle(color, 7, 0.92)).addTo(previewLayer);
  } else {
    previewPolygon = L.polygon([map.containerPointToLatLng(point)], {
      color: "#f3ca52",
      fillColor: "#f3ca52",
      fillOpacity: 0.2,
      weight: 2,
      interactive: false,
    }).addTo(previewLayer);
  }
}

function onPointerMove(event: PointerEvent) {
  if (activeTool === "pan") {
    mapSelectionGestureController.move(event.pointerId, event.pointerType, containerPointFromEvent(event));
    return;
  }
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  const point = containerPointFromEvent(event);
  if (activeTool === "edit" && activeHandleMove) {
    const preview = moveRouteControlPoint(activeHandleMove.originalCoordinates, activeHandleMove.coordinateIndex, map.containerPointToLatLng(point));
    handlePreviewCoordinates = preview;
    mapLayers.clear("construction-preview");
    L.polyline(
      preview.map(([lat, lng]) => L.latLng(lat, lng)),
      routeStyle(getRouteColor(activeHandleMove.routeId), 8, 0.95),
    ).addTo(previewLayer);
    updateEditCostPreview(activeHandleMove.routeId, preview);
    stageLiveEditDraft(activeHandleMove, preview);
    return;
  }
  const isEraserStroke = activeTool === "eraser";
  if (activeTool !== "route" && activeTool !== "extend" && activeTool !== "reconnect" && activeTool !== "branch" && activeTool !== "merge" && activeTool !== "depot" && !isEraserStroke) return;
  const lastPoint = rawDrawPoints[rawDrawPoints.length - 1];
  if (point.distanceTo(lastPoint) < 5) return;
  rawDrawPoints.push(point);
  routePlanningController.updateDraftCoordinates(() => rawDrawPoints.map((screenPoint) => {
    const coordinate = map.containerPointToLatLng(screenPoint);
    return { lat: coordinate.lat, lng: coordinate.lng };
  }));

  if ((activeTool === "route" || activeTool === "extend" || activeTool === "reconnect" || activeTool === "branch" || activeTool === "merge") && previewPolyline) {
    const smoothed = smoothScreenPoints(rawDrawPoints);
    previewPolyline.setLatLngs(smoothed.map((screenPoint) => map.containerPointToLatLng(screenPoint)));
    updateLiveConstructionDraft(smoothed);
  }
  if (isEraserStroke && previewPolyline) {
    previewPolyline.setLatLngs(rawDrawPoints.map((screenPoint) => map.containerPointToLatLng(screenPoint)));
  }
  if (activeTool === "depot" && previewPolygon) {
    const polygonPoints = smoothScreenPoints(rawDrawPoints);
    previewPolygon.setLatLngs(polygonPoints.map((screenPoint) => map.containerPointToLatLng(screenPoint)));
    updateDepotPreviewConnection(polygonPoints);
    updateLiveDepotDraft(polygonPoints);
  }
}

function pointerTargetsMap(event: PointerEvent) {
  return event.target instanceof Node && mapContainer.contains(event.target);
}

function captureDrawingPointer(pointerId: number) {
  try {
    mapContainer.setPointerCapture(pointerId);
  } catch {
    // Some Android WebViews can reject capture while their gesture recognizer
    // is changing state. Window-level fallbacks keep the stroke continuous.
  }
}

function releaseDrawingPointer(pointerId: number | null) {
  if (pointerId === null) return;
  try {
    if (mapContainer.hasPointerCapture(pointerId)) mapContainer.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already have been released by the browser.
  }
}

function onWindowPointerMove(event: PointerEvent) {
  if (activePointerId === null || event.pointerId !== activePointerId || pointerTargetsMap(event)) return;
  onPointerMove(event);
}

function onWindowPointerUp(event: PointerEvent) {
  if (activePointerId === null || event.pointerId !== activePointerId || pointerTargetsMap(event)) return;
  onPointerUp(event);
}

function onWindowPointerCancel(event: PointerEvent) {
  if (activePointerId === null || event.pointerId !== activePointerId || pointerTargetsMap(event)) return;
  onPointerCancel(event);
}

function onPointerCancel(event: PointerEvent) {
  if (activeTool === "pan") {
    mapSelectionGestureController.cancel(event.pointerId);
    return;
  }
  if (event.pointerId !== activePointerId) return;
  updateRouteDrawingHudProximity(event.clientY);
  event.preventDefault();
  cancelActiveDrawing();
}

function onPointerUp(event: PointerEvent) {
  if (activeTool === "pan") {
    const result = mapSelectionGestureController.end(event.pointerId);
    if (result?.shouldSelect) {
      handleUnifiedMapSelection(containerPointFromEvent(event), result.pointerType);
    }
    return;
  }
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  resetRouteDrawingHudProximity();
  if (activeTool === "edit" && activeHandleMove) {
    const handle = activeHandleMove;
    const preview = handlePreviewCoordinates;
    releaseDrawingPointer(activePointerId);
    activePointerId = null;
    activeHandleMove = null;
    handlePreviewCoordinates = null;
    mapLayers.clear("construction-preview");
    map.dragging.enable();
    if (preview) stageEditDraft(handle, preview);
    if (constructionDraft) map.dragging.enable();
    return;
  }
  // pointermove can lag behind pointerup on touch devices. Always preserve the
  // actual release coordinate so endpoint snapping uses where the user lifted
  // their finger, not the previous sampled move position.
  const releasePoint = containerPointFromEvent(event);
  if (rawDrawPoints.length === 0 || releasePoint.distanceTo(rawDrawPoints.at(-1)!) >= 1) {
    rawDrawPoints.push(releasePoint);
  }
  const finishedPoints = smoothScreenPoints(rawDrawPoints);
  const extension = activeExtension;
  const repair = activeRepair;
  const branch = activeBranch;
  const planningBranch = activePlanningBranch;
  const connectionSource = activeConnectionSource;
  releaseDrawingPointer(activePointerId);
  activePointerId = null;
  activeExtension = null;
  activeRepair = null;
  activeBranch = null;
  activePlanningBranch = null;
  activeConnectionSource = null;
  rawDrawPoints = [];
  mapLayers.clear("construction-preview");
  if (activeTool !== "merge") {
    routePlanningController.finishDrawing(() => finishedPoints.map((screenPoint) => {
      const coordinate = map.containerPointToLatLng(screenPoint);
      return { lat: coordinate.lat, lng: coordinate.lng };
    }));
  }

  if (activeTool === "eraser") finishEraserStroke(finishedPoints);
  if (activeTool === "route" || activeTool === "extend") finishRouteDrawing(finishedPoints, extension);
  if (activeTool === "reconnect") finishRepairDrawing(finishedPoints, repair);
  if (activeTool === "branch") {
    if (planningMode) finishPlanningBranchDrawing(finishedPoints, planningBranch);
    else finishBranchDrawing(finishedPoints, branch);
  }
  if (activeTool === "merge") finishConnectionDrawing(finishedPoints, connectionSource);
  if (activeTool === "depot") finishDepotDrawing(finishedPoints);
  activePlanningContinuation = null;
  if (constructionDraft) map.dragging.enable();
}

function beginEraserStroke(event: PointerEvent, point: L.Point) {
  activePointerId = event.pointerId;
  rawDrawPoints = [point];
  map.dragging.disable();
  captureDrawingPointer(event.pointerId);
  mapLayers.clear("construction-preview");
  previewPolyline = L.polyline([map.containerPointToLatLng(point)], {
    color: "#ff6b6b",
    weight: eraserRadiusPx * 2,
    opacity: 0.52,
    dashArray: "2 8",
    lineCap: "round",
    interactive: false,
  }).addTo(previewLayer);
  setText(facilityReadout, planningMode ? "지울 계획 시설을 가로질러 드래그하세요" : "철거할 건설 시설을 가로질러 드래그하세요");
}

function finishEraserStroke(points: L.Point[]) {
  if (points.length < 2) {
    if (points[0]) selectDeletePoint(points[0]);
    return;
  }
  if (planningMode) requestPlannedAssetsErase(points);
  else requestBuiltAssetsErase(points);
}

function strokeTouchesSegment(stroke: L.Point[], start: L.Point, end: L.Point, radiusPx: number) {
  if (stroke.length === 1) return pointLineDistance(stroke[0], start, end) <= radiusPx;
  for (let index = 1; index < stroke.length; index += 1) {
    const brushStart = stroke[index - 1];
    const brushEnd = stroke[index];
    if (segmentsIntersect(brushStart, brushEnd, start, end)) return true;
    if (
      pointLineDistance(start, brushStart, brushEnd) <= radiusPx ||
      pointLineDistance(end, brushStart, brushEnd) <= radiusPx ||
      pointLineDistance(brushStart, start, end) <= radiusPx ||
      pointLineDistance(brushEnd, start, end) <= radiusPx
    ) return true;
  }
  return false;
}

function strokeTouchesPoint(stroke: L.Point[], point: L.Point, radiusPx: number) {
  if (stroke.some((item) => item.distanceTo(point) <= radiusPx)) return true;
  for (let index = 1; index < stroke.length; index += 1) {
    if (pointLineDistance(point, stroke[index - 1], stroke[index]) <= radiusPx) return true;
  }
  return false;
}

function strokeTouchesPolygon(stroke: L.Point[], polygon: L.Point[], radiusPx: number) {
  if (polygon.length < 3) return false;
  if (stroke.some((point) => pointInPolygon(point, polygon))) return true;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (strokeTouchesSegment(stroke, start, end, radiusPx)) return true;
  }
  return false;
}

function findHitCoordinateSegments(coordinates: Array<[number, number]>, stroke: L.Point[], radiusPx: number) {
  const hits = new Set<number>();
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = map.latLngToContainerPoint(L.latLng(...coordinates[index - 1]));
    const end = map.latLngToContainerPoint(L.latLng(...coordinates[index]));
    if (strokeTouchesSegment(stroke, start, end, radiusPx)) hits.add(index - 1);
  }
  return hits;
}

function groupKeptSegmentIndices(segmentCount: number, removed: Set<number>) {
  const groups: number[][] = [];
  let current: number[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    if (removed.has(index)) {
      if (current.length > 0) groups.push(current);
      current = [];
    } else {
      current.push(index);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function getPlannedEraseSelection(plan: ConstructionPlan, stroke: L.Point[]) {
  const radius = eraserRadiusPx + 8;
  const routeHits = new Map<string, Set<number>>();
  for (const route of plan.routes) {
    const rawHits = findHitCoordinateSegments(route.coordinates, stroke, radius);
    const removableHits = new Set(Array.from(rawHits).filter((index) => {
      const segment = route.segments[index];
      return segment && !route.completedSegmentIds.includes(segment.id);
    }));
    if (removableHits.size > 0) routeHits.set(route.id, removableHits);
  }
  const stationIds = new Set(
    plan.stations
      .filter((station) => !station.completed && strokeTouchesPoint(stroke, map.latLngToContainerPoint(L.latLng(...station.position)), radius + 4))
      .map((station) => station.id),
  );
  const depotIds = new Set(
    plan.depots
      .filter((depot) => !depot.completed && strokeTouchesPolygon(stroke, depot.polygon.map((point) => map.latLngToContainerPoint(L.latLng(...point))), radius))
      .map((depot) => depot.id),
  );
  return { routeHits, stationIds, depotIds };
}

function requestPlannedAssetsErase(points: L.Point[]) {
  const plan = getActivePlan(false);
  if (!plan) {
    setText(facilityReadout, "삭제할 기획안이 없습니다");
    return;
  }
  const selection = getPlannedEraseSelection(plan, points);
  const segmentCount = Array.from(selection.routeHits.values()).reduce((sum, hits) => sum + hits.size, 0);
  if (segmentCount + selection.stationIds.size + selection.depotIds.size === 0) {
    setText(facilityReadout, "드래그 범위에 삭제할 계획 시설이 없습니다");
    return;
  }
  const lengthKm = Array.from(selection.routeHits).reduce((sum, [routeId, hits]) => {
    const route = plan.routes.find((item) => item.id === routeId);
    if (!route) return sum;
    return sum + Array.from(hits).reduce((routeSum, index) => routeSum + (route.segments[index]?.lengthKm ?? 0), 0);
  }, 0);
  openDemolitionReview({
    planning: true,
    routeCount: selection.routeHits.size,
    segmentCount,
    stationCount: selection.stationIds.size,
    depotCount: selection.depotIds.size,
    lengthKm,
    refund: 0,
    description: "드래그 범위의 계획 시설만 삭제합니다. 이미 건설된 계획 항목은 그대로 유지됩니다.",
    confirmLabel: "계획 삭제 확정",
    confirm: () => erasePlannedAssets(plan.id, selection),
  });
}

function erasePlannedAssets(
  planId: string,
  selection: { routeHits: Map<string, Set<number>>; stationIds: Set<string>; depotIds: Set<string> },
) {
  const plan = constructionState.plans.find((item) => item.id === planId);
  if (!plan) return;
  pushHistory();
  const replacements = new Map<string, PlannedRoute[]>();
  const nextRoutes = plan.routes.flatMap((route) => {
    const hits = selection.routeHits.get(route.id);
    if (!hits?.size) return [route];
    const sections = groupKeptSegmentIndices(route.segments.length, hits).map((group, groupIndex) => {
      const first = group[0];
      const last = group[group.length - 1];
      const segments = route.segments.slice(first, last + 1);
      const coordinates = segments.flatMap((segment, index) => index === 0 ? segment.coordinates : segment.coordinates.slice(1));
      return createPlannedRouteSection(
        route,
        groupIndex === 0 ? route.id : createId("planned-route"),
        groupIndex === 0 ? route.name : `${route.name} 분리 ${groupIndex + 1}`,
        coordinates,
        segments,
      );
    });
    replacements.set(route.id, sections);
    return sections;
  });
  const nextStations = plan.stations
    .filter((station) => !selection.stationIds.has(station.id))
    .map((station) => {
      let plannedRouteIds = [...station.plannedRouteIds];
      for (const [oldRouteId, sections] of replacements) {
        if (!plannedRouteIds.includes(oldRouteId)) continue;
        plannedRouteIds = plannedRouteIds.filter((id) => id !== oldRouteId);
        const nearSections = sections
          .map((section) => ({ id: section.id, distance: distanceToCoordinatesMeters(L.latLng(...station.position), section.coordinates) }))
          .filter((item) => item.distance <= 75)
          .sort((a, b) => a.distance - b.distance);
        if (nearSections[0]) plannedRouteIds.push(nearSections[0].id);
      }
      return { ...station, plannedRouteIds: Array.from(new Set(plannedRouteIds)) };
    })
    .filter((station) => station.completed || station.plannedRouteIds.length > 0 || station.actualRouteIds.length > 0);
  const remainingStationIds = new Set(nextStations.map((station) => station.id));
  const nextDepots = plan.depots
    .filter((depot) => !selection.depotIds.has(depot.id))
    .map((depot) => {
      let routeIds = [...depot.connectedPlannedRouteIds];
      for (const [oldRouteId, sections] of replacements) {
        if (!routeIds.includes(oldRouteId)) continue;
        routeIds = routeIds.filter((id) => id !== oldRouteId);
        const polygon = depot.polygon.map(([lat, lng]) => L.latLng(lat, lng));
        routeIds.push(...sections.filter((section) => section.coordinates.some(([lat, lng]) => polygon.some((point) => map.distance(point, L.latLng(lat, lng)) <= 45))).map((section) => section.id));
      }
      return { ...depot, connectedPlannedRouteIds: Array.from(new Set(routeIds)) };
    });
  updatePlan(planId, (item) => ({
    ...item,
    routes: nextRoutes,
    stations: nextStations,
    depots: nextDepots,
    transfers: item.transfers.filter((transfer) => {
      const plannedCount = transfer.stationIds.filter((id) => remainingStationIds.has(id)).length;
      return transfer.completed || plannedCount + (transfer.actualStationIds?.length ?? 0) >= 2;
    }),
  }));
  selectedPlannedStationIds = selectedPlannedStationIds.filter((id) => remainingStationIds.has(id));
  redoStack = [];
  requestStateSave("immediate");
  renderPlanningDialog();
  requestUpdate("blueprint-preview");
  showToast("드래그 범위의 계획 시설을 삭제했습니다.");
  playFeedback("confirm");
}

function getBuiltEraseSelection(stroke: L.Point[]) {
  const radius = eraserRadiusPx + 8;
  const routeHits = new Map<string, Set<number>>();
  for (const route of networkState.routes) {
    const hits = findHitCoordinateSegments(route.coordinates, stroke, radius);
    if (hits.size > 0) routeHits.set(route.id, hits);
  }
  const stationIds = new Set(
    networkState.stations
      .filter((station) => strokeTouchesPoint(stroke, map.latLngToContainerPoint(L.latLng(...station.position)), radius + 4))
      .flatMap((station) => getStationManagerMembers(station).map((member) => member.id)),
  );
  const depotIds = new Set(
    networkState.depots
      .filter((depot) => strokeTouchesPolygon(stroke, depot.polygon.map((point) => map.latLngToContainerPoint(L.latLng(...point))), radius))
      .map((depot) => depot.id),
  );
  return { routeHits, stationIds, depotIds };
}

function requestBuiltAssetsErase(points: L.Point[]) {
  const selection = getBuiltEraseSelection(points);
  const segmentCount = Array.from(selection.routeHits.values()).reduce((sum, hits) => sum + hits.size, 0);
  if (segmentCount + selection.stationIds.size + selection.depotIds.size === 0) {
    setText(facilityReadout, "드래그 범위에 철거할 건설 시설이 없습니다");
    return;
  }
  const lengthKm = Array.from(selection.routeHits).reduce((sum, [routeId, hits]) => {
    const route = networkState.routes.find((item) => item.id === routeId);
    if (!route) return sum;
    return sum + Array.from(hits).reduce((routeSum, index) => {
      const pair = route.coordinates.slice(index, index + 2).map(([lat, lng]) => L.latLng(lat, lng));
      return routeSum + calculateLengthKmPrecise(pair);
    }, 0);
  }, 0);
  openDemolitionReview({
    planning: false,
    routeCount: selection.routeHits.size,
    segmentCount,
    stationCount: selection.stationIds.size,
    depotCount: selection.depotIds.size,
    lengthKm,
    refund: Math.round(lengthKm * baseCostPerKm * 0.35),
    description: "드래그 범위의 실제 건설 시설을 철거합니다. 환승역은 관리상 하나의 역으로 함께 처리됩니다.",
    confirmLabel: "철거 확정",
    confirm: () => demolishBuiltAssets(selection),
  });
}

function demolishBuiltAssets(selection: { routeHits: Map<string, Set<number>>; stationIds: Set<string>; depotIds: Set<string> }) {
  pushHistory();
  const oldRoutes = new Map(networkState.routes.map((route) => [route.id, route]));
  const replacements = new Map<string, RouteLine[]>();
  let removedLength = 0;
  networkState.routes = networkState.routes.flatMap((route) => {
    const hits = selection.routeHits.get(route.id);
    if (!hits?.size) return [route];
    removedLength += Array.from(hits).reduce((sum, index) => {
      const coordinates = route.coordinates.slice(index, index + 2).map(([lat, lng]) => L.latLng(lat, lng));
      return sum + calculateLengthKmPrecise(coordinates);
    }, 0);
    const groups = groupKeptSegmentIndices(route.coordinates.length - 1, hits);
    const sections = groups.map((group, groupIndex) => {
      const coordinates = route.coordinates.slice(group[0], group[group.length - 1] + 2);
      const lengthKm = Math.round(calculateLengthKmPrecise(coordinates.map(([lat, lng]) => L.latLng(lat, lng))) * 10) / 10;
      return rebuildRouteGraph({
        ...route,
        id: groupIndex === 0 ? route.id : createId("route"),
        name: groupIndex === 0 ? route.name : `${route.name} 분리 ${groupIndex + 1}`,
        coordinates,
        lengthKm,
        constructionCost: Math.round(route.constructionCost * (lengthKm / Math.max(route.lengthKm, 0.1))),
        disabledSegments: [],
        branches: [],
      });
    });
    replacements.set(route.id, sections);
    return sections;
  });
  networkState.stations = networkState.stations
    .filter((station) => !selection.stationIds.has(station.id))
    .map((station) => {
      let connectedRouteIds = [...station.connectedRouteIds];
      for (const [oldRouteId, sections] of replacements) {
        if (!connectedRouteIds.includes(oldRouteId)) continue;
        connectedRouteIds = connectedRouteIds.filter((id) => id !== oldRouteId);
        const nearSections = sections
          .map((section) => ({ id: section.id, distance: distanceToCoordinatesMeters(L.latLng(...station.position), section.coordinates) }))
          .filter((item) => item.distance <= 75)
          .sort((a, b) => a.distance - b.distance);
        if (nearSections[0]) connectedRouteIds.push(nearSections[0].id);
      }
      return { ...station, connectedRouteIds: Array.from(new Set(connectedRouteIds)) };
    })
    .filter((station) => station.connectedRouteIds.length > 0);
  const stationIds = new Set(networkState.stations.map((station) => station.id));
  networkState.depots = networkState.depots
    .filter((depot) => !selection.depotIds.has(depot.id))
    .map((depot) => {
      let routeIds = [...depot.connectedRouteIds];
      for (const [oldRouteId, sections] of replacements) {
        if (!routeIds.includes(oldRouteId)) continue;
        routeIds = routeIds.filter((id) => id !== oldRouteId);
        routeIds.push(...sections.filter((section) => depotTouchesRoute(depot, section)).map((section) => section.id));
      }
      return { ...depot, connectedRouteIds: Array.from(new Set(routeIds)) };
    });
  const depotIds = new Set(networkState.depots.map((depot) => depot.id));
  operationsState.fleets = operationsState.fleets.flatMap((fleet) => {
    const sections = replacements.get(fleet.routeId);
    if (!sections) return [fleet];
    return sections[0] ? [{ ...fleet, routeId: sections[0].id }] : [];
  });
  operationsState.expressConfigs = operationsState.expressConfigs.flatMap((config) => {
    const sections = replacements.get(config.routeId);
    if (!sections) return [{ ...config, stopStationIds: config.stopStationIds.filter((id) => stationIds.has(id)) }];
    return sections[0] ? [{ ...config, routeId: sections[0].id, stopStationIds: config.stopStationIds.filter((id) => networkState.stations.find((station) => station.id === id)?.connectedRouteIds.includes(sections[0].id)) }] : [];
  });
  constructionState.replaceProjects(constructionState.projects
    .map((project) => ({
      ...project,
      routeIds: project.routeIds.flatMap((id) => replacements.has(id) ? replacements.get(id)!.map((route) => route.id) : oldRoutes.has(id) ? [id] : []),
      stationIds: project.stationIds.filter((id) => stationIds.has(id)),
      depotIds: project.depotIds.filter((id) => depotIds.has(id)),
    }))
    .filter((project) => project.routeIds.length > 0 || project.stationIds.length > 0 || project.depotIds.length > 0));
  cleanupTransferData();
  synchronizeGraphReferences();
  const refund = Math.round(removedLength * baseCostPerKm * 0.35);
  financeState.economy = { ...financeState.economy, cash: financeState.economy.cash + refund, constructionSpent: Math.max(0, financeState.economy.constructionSpent - refund) };
  if (selectedStationManagerId && !stationIds.has(selectedStationManagerId)) closeStationManager();
  if (selectedDepotManagerId && !depotIds.has(selectedDepotManagerId)) closeDepotManager();
  if (selectedRouteId && !networkState.routes.some((route) => route.id === selectedRouteId)) selectedRouteId = networkState.routes[0]?.id ?? null;
  redoStack = [];
  requestStateSave("immediate");
  requestUpdate("network-structure", selectedRouteId ?? undefined);
  showToast(`범위 안의 건설 시설을 철거했습니다${refund > 0 ? ` · ${formatCost(refund)} 환급` : ""}.`);
  playFeedback("confirm");
}

function findNearestStationAtPoint(point: L.Point, thresholdPx: number) {
  return networkState.stations
    .map((station) => ({ station, distancePx: point.distanceTo(map.latLngToContainerPoint(L.latLng(station.position[0], station.position[1]))) }))
    .filter((item) => item.distancePx <= thresholdPx)
    .sort((a, b) => a.distancePx - b.distancePx)[0]?.station;
}

function requestStationDemolition(station: Station) {
  const connectedRoutes = station.connectedRouteIds.map((id) => networkState.routes.find((route) => route.id === id)?.name).filter(Boolean);
  const memberIds = getStationManagerMembers(station).map((member) => member.id);
  openDemolitionReview({
    planning: false,
    routeCount: connectedRoutes.length,
    segmentCount: 0,
    stationCount: memberIds.length,
    depotCount: 0,
    lengthKm: 0,
    refund: 0,
    description: connectedRoutes.length > 0 ? `${connectedRoutes.join(", ")} 운행과 환승 연결에서 이 역을 제거합니다.` : "이 역의 환승 연결을 함께 정리합니다.",
    confirmLabel: memberIds.length > 1 ? "환승역 철거 확정" : "역 철거 확정",
    confirm: () => demolishStations(memberIds),
  });
}

function demolishStations(stationIds: string[]) {
  const removedIds = new Set(stationIds);
  if (removedIds.size === 0) return;
  pushHistory();
  networkState.stations = networkState.stations.filter((station) => !removedIds.has(station.id));
  networkState.transfers = networkState.transfers.map((transfer) => ({ ...transfer, stationIds: transfer.stationIds.filter((id) => !removedIds.has(id)) }));
  operationsState.expressConfigs = operationsState.expressConfigs.map((config) => ({ ...config, stopStationIds: config.stopStationIds.filter((id) => !removedIds.has(id)) }));
  constructionState.replaceProjects(constructionState.projects
    .map((project) => ({ ...project, stationIds: project.stationIds.filter((id) => !removedIds.has(id)) }))
    .filter((project) => project.routeIds.length > 0 || project.stationIds.length > 0 || project.depotIds.length > 0));
  cleanupTransferData();
  redoStack = [];
  requestStateSave("immediate");
  requestUpdate("network-structure", selectedRouteId ?? undefined);
  showToast(`${removedIds.size}개 역을 철거했습니다.`);
  playFeedback("confirm");
}

function finishRouteDrawing(points: L.Point[], extension: RouteExtension | null = null) {
  const latLngs = combinePlanningContinuation(points.map((point) => map.containerPointToLatLng(point)));
  if (points.length < 2) {
    setText(selectedRouteName, "노선을 더 길게 그려주세요");
    return;
  }
  const plannedExtension = activePlanningContinuation?.actualRouteId
    ? { routeId: activePlanningContinuation.actualRouteId, atStart: activePlanningContinuation.atStart }
    : undefined;
  const plannedRouteExtension = activePlanningContinuation?.plannedRouteId
    ? { routeId: activePlanningContinuation.plannedRouteId, atStart: activePlanningContinuation.atStart }
    : undefined;
  stageRouteDraft(extension || activeTool === "extend" ? "extension" : "route", latLngs, {
    extension,
    plannedExtension,
    plannedRouteExtension,
  });
}

function finishBranchDrawing(points: L.Point[], branch: RouteBranchDraft | null) {
  if (!branch) return;
  const latLngs = points.map((point) => map.containerPointToLatLng(point));
  if (points.length < 2) {
    setText(facilityReadout, "분기를 더 길게 그려주세요");
    return;
  }
  stageRouteDraft("branch", latLngs, { branch });
}

function finishPlanningBranchDrawing(points: L.Point[], branch: PlanningBranchDraft | null) {
  if (!branch || points.length < 2) {
    setText(facilityReadout, "분기 계획을 더 길게 그려주세요");
    return;
  }
  const latLngs = points.map((point) => map.containerPointToLatLng(point));
  stageRouteDraft("branch", latLngs, { planningBranch: branch });
}

function finishRepairDrawing(points: L.Point[], repair: RouteRepair | null) {
  if (!repair) return;
  const lastPoint = points[points.length - 1];
  if (!lastPoint || lastPoint.distanceTo(repair.end) > 42) {
    setText(facilityReadout, "반대쪽 붉은 수정 지점까지 연결하세요");
    return;
  }
  const snappedPoints = [...points.slice(0, -1), repair.end];
  if (snappedPoints.length < 2 || polylinePixelLength(snappedPoints) < 24) {
    setText(facilityReadout, "수정 구간이 너무 짧음");
    return;
  }
  const latLngs = snappedPoints.map((point) => map.containerPointToLatLng(point));
  stageRouteDraft("repair", latLngs, { repair });
}

function finishDepotDrawing(points: L.Point[]) {
  if (points.length < 4 || polygonAreaPx(points) < 1200) {
    setText(facilityReadout, "기지 영역이 너무 작음");
    return;
  }
  const latLngs = closeLatLngRing(points.map((point) => map.containerPointToLatLng(point)));
  const connectedRouteIds = findRoutesNearPolygon(latLngs, 30);
  const connectedPlannedRouteIds = planningMode ? findPlannedRoutesNearPolygon(latLngs, 30) : [];
  stageDepotDraft(latLngs, connectedRouteIds, connectedPlannedRouteIds);
}

function prepareDraftAnalysis(analysis: ConstructionAnalysis) {
  if (!planningMode) return analysis;
  return {
    ...analysis,
    balanceAfter: financeState.economy.cash,
    warnings: analysis.warnings.filter((warning) => warning.code !== "insufficient-funds"),
  };
}

function stageRouteDraft(
  kind: Extract<ConstructionDraftKind, "route" | "extension" | "branch" | "repair">,
  points: LatLng[],
  context: {
    extension?: RouteExtension | null;
    plannedExtension?: { routeId: string; atStart: boolean };
    plannedRouteExtension?: { routeId: string; atStart: boolean };
    branch?: RouteBranchDraft | null;
    planningBranch?: PlanningBranchDraft | null;
    repair?: RouteRepair | null;
  },
) {
  const routeId =
    context.extension?.routeId ??
    context.plannedExtension?.routeId ??
    context.plannedRouteExtension?.routeId ??
    context.branch?.routeId ??
    context.planningBranch?.routeId ??
    context.repair?.routeId;
  const choices = constructionDraft?.kind === kind ? constructionDraft.analysis.riverCrossings : [];
  constructionDraft = {
    id: constructionDraft?.id ?? createId("draft"),
    kind,
    points,
    routeId,
    extension: context.extension,
    plannedExtension: context.plannedExtension,
    plannedRouteExtension: context.plannedRouteExtension,
    branch: context.branch,
    planningBranch: context.planningBranch,
    repair: context.repair,
    analysis: prepareDraftAnalysis(analyzeConstruction(kind, points, routeId, choices)),
  };
  renderConstructionDraft();
}

function stageDepotDraft(polygon: LatLng[], connectedRouteIds: string[], connectedPlannedRouteIds: string[] = []) {
  const areaHa = calculatePolygonAreaHa(polygon);
  const totalCost = Math.round(areaHa * 680 * cityConfigs[metaState.current.cityId].constructionMultiplier * difficultyConfigs[metaState.current.difficulty].costMultiplier);
  const warnings: ConstructionWarning[] = [];
  if (metaState.current.mode === "career" && totalCost > financeState.economy.cash)
    warnings.push({ code: "insufficient-funds", severity: "error", message: `자금이 ${formatCost(totalCost - financeState.economy.cash)} 부족합니다.` });
  const analysis: ConstructionAnalysis = {
    segments: [],
    lengthKm: 0,
    baseCost: totalCost,
    mountainLengthKm: 0,
    mountainCost: 0,
    riverCrossings: [],
    riverCost: 0,
    stationInstallCount: 0,
    depotConnected: connectedRouteIds.length > 0 || connectedPlannedRouteIds.length > 0,
    totalCost,
    balanceAfter: planningMode ? financeState.economy.cash : financeState.economy.cash - totalCost,
    durationDays: Math.max(45, Math.round(areaHa * 32)),
    warnings: planningMode
      ? warnings.filter((warning) => warning.code !== "insufficient-funds" && !(warning.code === "depot-unconnected" && connectedPlannedRouteIds.length > 0))
      : warnings,
  };
  constructionDraft = {
    id: constructionDraft?.kind === "depot" ? constructionDraft.id : createId("draft"),
    kind: "depot",
    points: polygon,
    polygon,
    connectedRouteIds,
    connectedPlannedRouteIds,
    analysis,
  };
  renderConstructionDraft();
}

function updateLiveConstructionDraft(points: L.Point[]) {
  const latLngs = points.map((point) => map.containerPointToLatLng(point));
  if (activeTool === "route") stageRouteDraft("route", combinePlanningContinuation(latLngs), {});
  if (activeTool === "extend")
    stageRouteDraft(
      "extension",
      planningMode ? combinePlanningContinuation(latLngs) : latLngs,
      planningMode && activePlanningContinuation?.actualRouteId
        ? { plannedExtension: { routeId: activePlanningContinuation.actualRouteId, atStart: activePlanningContinuation.atStart } }
        : planningMode && activePlanningContinuation?.plannedRouteId
          ? { plannedRouteExtension: { routeId: activePlanningContinuation.plannedRouteId, atStart: activePlanningContinuation.atStart } }
        : planningMode
          ? {}
          : { extension: activeExtension },
    );
  if (activeTool === "branch")
    stageRouteDraft("branch", latLngs, planningMode ? { planningBranch: activePlanningBranch } : { branch: activeBranch });
  if (activeTool === "reconnect") stageRouteDraft("repair", latLngs, { repair: activeRepair });
}

function updateLiveDepotDraft(points: L.Point[]) {
  if (points.length < 3) return;
  const polygon = closeLatLngRing(points.map((point) => map.containerPointToLatLng(point)));
  stageDepotDraft(polygon, findRoutesNearPolygon(polygon, 30), planningMode ? findPlannedRoutesNearPolygon(polygon, 30) : []);
}

function stageLiveEditDraft(handle: RouteHandleMove, coordinates: Array<[number, number]>) {
  const route = networkState.routes.find((item) => item.id === handle.routeId);
  if (!route) return;
  const points = coordinates.map(([lat, lng]) => L.latLng(lat, lng));
  const newLength = calculateLengthKmPrecise(points);
  const deltaCost = calculateEditCostDelta(newLength - route.lengthKm);
  const existingChoices = constructionDraft?.kind === "edit" ? constructionDraft.analysis.riverCrossings : [];
  const analysis = analyzeConstruction("edit", points, route.id, existingChoices);
  analysis.baseCost = deltaCost;
  analysis.totalCost = deltaCost + analysis.mountainCost + analysis.riverCost;
  analysis.balanceAfter = financeState.economy.cash - analysis.totalCost;
  analysis.durationDays = Math.max(7, Math.round(Math.abs(newLength - route.lengthKm) * baseConstructionDaysPerKm));
  if (metaState.current.mode === "career" && deltaCost > financeState.economy.cash)
    analysis.warnings.push({ code: "insufficient-funds", severity: "error", message: `자금이 ${formatCost(deltaCost - financeState.economy.cash)} 부족합니다.` });
  constructionDraft = {
    id: constructionDraft?.kind === "edit" ? constructionDraft.id : createId("draft"),
    kind: "edit",
    points,
    routeId: route.id,
    editHandle: handle,
    analysis,
  };
  renderConstructionPanel();
}

function stageEditDraft(handle: RouteHandleMove, coordinates: Array<[number, number]>) {
  stageLiveEditDraft(handle, coordinates);
  renderConstructionDraft();
}



function renderConstructionDraft() {
  renderConstructionPanel();
  renderConstructionDraftMap();
}

function renderConstructionPanel() {
  if (!constructionDraft || !constructionPreviewPanel) return;
  document.body.classList.add("construction-reviewing");
  const analysis = constructionDraft.analysis;
  constructionPreviewPanel.hidden = false;
  const reviewCopy: Record<ConstructionDraftKind, { title: string; planningDescription: string; constructionDescription: string }> = {
    route: { title: "노선 건설 검토", planningDescription: "새 노선 설계를 현재 기획안에 추가합니다.", constructionDescription: "새 노선의 비용과 공사 조건을 확인하세요." },
    extension: { title: "연장 검토", planningDescription: "선택한 노선의 연장 설계를 기획안에 추가합니다.", constructionDescription: "선택한 노선의 실제 연장 공사를 검토합니다." },
    branch: { title: "분기 검토", planningDescription: "새 분기 설계를 현재 기획안에 추가합니다.", constructionDescription: "새 분기의 연결과 공사 조건을 확인하세요." },
    repair: { title: "복구 검토", planningDescription: "단절 구간 복구 설계를 기획안에 반영합니다.", constructionDescription: "단절된 구간을 실제로 복구합니다." },
    edit: { title: "노선 수정 검토", planningDescription: "변경한 선형을 현재 기획안에 반영합니다.", constructionDescription: "경로 수정에 따른 비용과 영향을 확인하세요." },
    depot: { title: "차량기지 검토", planningDescription: "차량기지 부지와 연결 계획을 기획안에 추가합니다.", constructionDescription: "차량기지의 부지·연결·공사비를 확인하세요." },
  };
  const copy = reviewCopy[constructionDraft.kind];
  constructionPreviewPanel.dataset.reviewMode = planningMode ? "planning" : "construction";
  constructionPreviewPanel.dataset.reviewTool = constructionDraft.kind;
  setText(constructionPreviewKicker, planningMode ? "기획" : "공사");
  setText(constructionPreviewSubtitle, planningMode ? `${copy.planningDescription} 자금은 아직 차감되지 않습니다.` : copy.constructionDescription);
  setText(previewTotalCostLabel, planningMode ? "계획 예상비" : "예상 총비용");
  setText(previewBalanceLabel, planningMode ? "현재 단계" : "건설 후 잔액");
  setText(previewDurationLabel, planningMode ? "예상 공기" : "예상 공기");
  setText(previewLengthLabel, "총 길이");
  setText(previewBaseCostLabel, "기본 건설비");
  setText(previewMountainLabel, "산악 구간");
  setText(previewRiverCountLabel, "강 통과");
  setText(previewStationCountLabel, "역 연결/설치");
  setText(previewDepotConnectionLabel, "차량기지 연결");
  const costStr = analysis.totalCost < 0 ? `${formatCost(Math.abs(analysis.totalCost))} 환급` : formatCost(analysis.totalCost);
  setText(previewTotalCost, costStr);
  setText(headerPreviewCost, costStr);
  setText(previewBalance, planningMode ? "기획안 저장" : formatSignedCost(analysis.balanceAfter));
  setText(previewDuration, formatConstructionDuration(analysis.durationDays));
  setText(previewLength, analysis.lengthKm < 1 ? `${Math.round(analysis.lengthKm * 1000)}m` : `${analysis.lengthKm.toFixed(2)}km`);
  setText(previewBaseCost, analysis.baseCost < 0 ? `${formatCost(Math.abs(analysis.baseCost))} 환급` : formatCost(analysis.baseCost));
  setText(
    previewMountain,
    analysis.mountainLengthKm > 0 ? `${analysis.mountainLengthKm.toFixed(2)}km · +${formatCost(analysis.mountainCost)}` : "없음",
  );
  setText(
    previewRiverCount,
    analysis.riverCrossings.length > 0 ? `${analysis.riverCrossings.length}회 · ${formatCost(analysis.riverCost)}` : "없음",
  );
  setText(previewStationCount, `${analysis.stationInstallCount}개`);
  setText(previewDepotConnection, analysis.depotConnected ? "연결됨" : constructionDraft.kind === "depot" ? "단독 건설" : "미연결");
  renderRiverChoices();
  if (constructionWarnings) {
    constructionWarnings.innerHTML =
      analysis.warnings.length === 0
        ? `<div class="dg-notice dg-notice--ok"><span class="dg-notice__lead">✓</span><span>건설 가능한 계획입니다</span></div>`
        : analysis.warnings
            .map((warning) => {
              const lead = warning.severity === "error" ? "✕ 확인 필요" : warning.severity === "warning" ? "△ 주의" : "i 안내";
              const variant = warning.severity === "error" ? " dg-notice--danger" : warning.severity === "warning" ? "" : " dg-notice--info";
              return `<div class="dg-notice${variant}"><span class="dg-notice__lead">${lead}</span><span>${escapeHtml(warning.message)}</span></div>`;
            })
            .join("");
  }
  const blocked = analysis.warnings.some((warning) => warning.severity === "error");
  if (confirmConstructionButton) {
    confirmConstructionButton.disabled = blocked;
    confirmConstructionButton.textContent = planningMode ? "기획안에 추가" : constructionDraft.kind === "edit" ? "수정 확정" : constructionDraft.kind === "repair" ? "복구 확정" : "건설 확정";
  }
  if (headerConfirmConstructionButton) {
    headerConfirmConstructionButton.disabled = blocked;
    headerConfirmConstructionButton.textContent = planningMode ? "기획 추가" : constructionDraft.kind === "edit" ? "수정 확정" : constructionDraft.kind === "repair" ? "복구 확정" : "건설 확정";
  }
}

function renderRiverChoices() {
  if (!constructionDraft || !riverChoiceList) return;
  const crossings = constructionDraft.analysis.riverCrossings;
  riverChoiceList.hidden = crossings.length === 0;
  riverChoiceList.innerHTML = crossings
    .map(
      (crossing, index) => `
        <div class="dg-row">
          <span class="dg-row__label">강 통과 ${index + 1}</span>
          <div class="dg-seg" role="group" aria-label="강 통과 ${index + 1} 방식">
            <button class="dg-seg__item" type="button" data-crossing-id="${crossing.id}" data-mode="bridge" aria-pressed="${crossing.mode === "bridge"}">교량</button>
            <button class="dg-seg__item" type="button" data-crossing-id="${crossing.id}" data-mode="tunnel" aria-pressed="${crossing.mode === "tunnel"}">지하</button>
          </div>
        </div>`,
    )
    .join("");
  riverChoiceList.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.addEventListener("click", () => chooseRiverCrossingMode(button.dataset.crossingId ?? "", button.dataset.mode === "tunnel" ? "tunnel" : "bridge"));
  });
}

function chooseRiverCrossingMode(crossingId: string, mode: ConstructionMode) {
  if (!constructionDraft) return;
  const nextChoices = constructionDraft.analysis.riverCrossings.map((crossing) => (crossing.id === crossingId ? { ...crossing, mode } : crossing));
  if (constructionDraft.kind === "edit" && constructionDraft.editHandle) {
    const coordinates = constructionDraft.points.map((point) => [point.lat, point.lng] as [number, number]);
    constructionDraft.analysis.riverCrossings = nextChoices;
    stageLiveEditDraft(constructionDraft.editHandle, coordinates);
  } else {
    constructionDraft.analysis = prepareDraftAnalysis(analyzeConstruction(
      constructionDraft.kind,
      constructionDraft.points,
      constructionDraft.routeId,
      nextChoices,
    ));
  }
  renderConstructionDraft();
  playFeedback("select");
}

function openDemolitionReview(review: DemolitionReview) {
  if (!constructionPreviewPanel) return;
  if (constructionDraft) cancelConstructionDraft();
  demolitionReview = review;
  document.body.classList.add("construction-reviewing");
  constructionPreviewPanel.hidden = false;
  constructionPreviewPanel.dataset.reviewMode = review.planning ? "planning" : "construction";
  constructionPreviewPanel.dataset.reviewTool = "eraser";
  if (constructionPreviewDetails) constructionPreviewDetails.hidden = false;
  setText(constructionPreviewKicker, review.planning ? "기획 철거" : "철거");
  setText(constructionPreviewTitle, "철거 검토");
  setText(constructionPreviewSubtitle, review.description);
  setText(previewTotalCostLabel, review.planning ? "계획 비용" : "예상 환급");
  setText(previewBalanceLabel, "처리 대상");
  setText(previewDurationLabel, "처리 시점");
  const demoCostStr = review.planning ? "차감 없음" : review.refund > 0 ? formatCost(review.refund) : "환급 없음";
  setText(previewTotalCost, demoCostStr);
  setText(headerPreviewCost, demoCostStr);
  setText(previewBalance, `${review.routeCount + review.stationCount + review.depotCount}개 시설`);
  setText(previewDuration, "확정 즉시");
  setText(previewLengthLabel, "삭제 노선 길이");
  setText(previewBaseCostLabel, "대상 노선");
  setText(previewMountainLabel, "대상 구간");
  setText(previewRiverCountLabel, "대상 역");
  setText(previewStationCountLabel, "대상 차량기지");
  setText(previewDepotConnectionLabel, "보호 항목");
  setText(previewLength, review.lengthKm < 1 ? `${Math.round(review.lengthKm * 1000)}m` : `${review.lengthKm.toFixed(2)}km`);
  setText(previewBaseCost, `${review.routeCount}개`);
  setText(previewMountain, `${review.segmentCount}구간`);
  setText(previewRiverCount, `${review.stationCount}개`);
  setText(previewStationCount, `${review.depotCount}개`);
  setText(previewDepotConnection, review.planning ? "건설 완료 시설" : "범위 밖 시설");
  if (riverChoiceList) {
    riverChoiceList.hidden = true;
    riverChoiceList.innerHTML = "";
  }
  if (constructionWarnings) {
    constructionWarnings.innerHTML = `<div class="dg-notice dg-notice--danger"><span class="dg-notice__lead">△ 삭제 주의</span><span>${escapeHtml(review.description)}</span></div>`;
  }
  if (confirmConstructionButton) {
    confirmConstructionButton.disabled = false;
    confirmConstructionButton.textContent = review.confirmLabel;
  }
  if (headerConfirmConstructionButton) {
    headerConfirmConstructionButton.disabled = false;
    headerConfirmConstructionButton.textContent = review.confirmLabel;
  }
}

function cancelDemolitionReview() {
  demolitionReview = null;
  document.body.classList.remove("construction-reviewing");
  if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
  setText(facilityReadout, "철거 검토를 취소했습니다");
}

function cancelActiveReview() {
  if (demolitionReview) {
    cancelDemolitionReview();
    return;
  }
  cancelConstructionDraft();
}

async function confirmActiveReview() {
  if (demolitionReview) {
    const confirm = demolitionReview.confirm;
    demolitionReview = null;
    document.body.classList.remove("construction-reviewing");
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    confirm();
    return;
  }
  await confirmConstructionDraft();
}

function cancelConstructionDraft() {
  constructionDraft = null;
  document.body.classList.remove("construction-reviewing");
  mapLayers.clear("construction-preview");
  if (routePlanningController.session && routePlanningController.session.stage !== "completed") {
    routePlanningController.cancel();
  }
  if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
  if (activeTool !== "pan") map.dragging.disable();
  setText(facilityReadout, "건설 계획을 취소했습니다");
  requestUpdateDomains(
    ["map-blueprints", "map-construction", "map-selection", "hud-status", "active-panel"],
    selectedRouteId ?? undefined,
  );
}

async function confirmConstructionDraft() {
  const draft = constructionDraft;
  if (!draft || draft.analysis.warnings.some((warning) => warning.severity === "error")) return;
  if (routePlanningController.session?.stage === "reviewing") {
    routePlanningController.transition("committing");
  }
  if (planningMode) {
    await confirmPlanningDraft(draft);
    if (routePlanningController.session?.stage === "committing") {
      routePlanningController.transition("completed");
    }
    return;
  }
  const before = cloneState();
  try {
    const deferExtension = usesConstructionTimeline() && draft.kind === "extension" && Boolean(draft.extension);
    const deferJunctionBranch = usesConstructionTimeline() && draft.kind === "branch" && Boolean(draft.branch?.junctionBlueprint);
    const selectedId = deferExtension
      ? draft.extension!.routeId
      : deferJunctionBranch
        ? draft.branch!.routeId
        : applyConstructionDraft(draft);
    captureTutorialConstruction(draft.kind, selectedId);
    if (usesConstructionTimeline()) {
      constructionState.replaceProjects([...constructionState.projects, createConstructionProjectFromDraft(draft, selectedId)]);
      applyTutorialConstructionBoost(draft.kind, selectedId);
    }
    financeState.economy = {
      ...financeState.economy,
      cash: financeState.economy.cash - draft.analysis.totalCost,
      constructionSpent: Math.max(0, financeState.economy.constructionSpent + draft.analysis.totalCost),
    };
    synchronizeGraphReferences();
    metaState.patch({ updatedAt: Date.now() });
    await flushStateSave();
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    constructionDraft = null;
    draftRouteName = "";
    document.body.classList.remove("construction-reviewing");
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    mapLayers.clear("construction-preview");
    if (activeTool !== "pan") map.dragging.disable();
    selectRoute(selectedId, false);
    requestUpdate("network-structure", selectedId);
    setText(facilityReadout, usesConstructionTimeline() ? "공사 예정으로 등록했습니다" : "건설을 확정하고 저장했습니다");
    if (routePlanningController.session?.stage === "committing") {
      routePlanningController.transition("completed");
    }
    playFeedback("confirm");
  } catch (error) {
    document.body.classList.remove("construction-reviewing");
    constructionDraft = null;
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    mapLayers.clear("construction-preview");
    stateRecoveryCoordinator.recover(before, {
      scope: "partial",
      domains: ["network", "routes", "demand", "capacity", "congestion", "map-lines", "map-stations", "map-trains", "map-construction", "hud-finance", "hud-status", "active-panel"],
      rebuildRouter: true,
    });
    try {
      await flushStateSave();
    } catch {
      // The in-memory rollback is still authoritative for this session.
    }
    showError("건설 처리 중 문제가 발생해 모든 변경을 되돌렸습니다.");
    console.error(error);
  }
}

function applyConstructionDraft(draft: ConstructionDraft) {
  if (draft.kind === "depot") return applyDepotConstructionDraft(draft);
  if (draft.kind === "edit") return applyEditConstructionDraft(draft);
  return applyRouteConstructionDraft(draft);
}

function createConstructionProjectFromDraft(draft: ConstructionDraft, selectedId: string): ConstructionProject {
  const kind: ConstructionProjectKind =
    draft.kind === "route"
      ? "route"
      : draft.kind === "extension"
        ? "extension"
        : draft.kind === "branch"
          ? "branch"
          : draft.kind === "repair"
            ? "repair"
            : draft.kind === "edit"
              ? "edit"
              : "depot";
  const route = networkState.routes.find((item) => item.id === selectedId);
  const depot = networkState.depots.find((item) => item.id === selectedId);
  const durationDays = calculateCareerConstructionDuration(draft);
  return {
    id: createId("construction"),
    name: depot?.name ?? route?.name ?? "건설 프로젝트",
    kind,
    status: "scheduled",
    routeIds: route ? [route.id] : draft.connectedRouteIds ?? [],
    stationIds: [],
    depotIds: depot ? [depot.id] : [],
    coordinates: draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
    startedDay: analysisStateOwner.current.dayIndex,
    durationDays,
    elapsedDays: 0,
    expectedCompletionDay: analysisStateOwner.current.dayIndex + durationDays,
    baseCost: Math.max(0, draft.analysis.totalCost),
    additionalCost: 0,
    delayDays: 0,
    events: [],
    pendingExtension: draft.kind === "extension" && draft.extension
      ? createLineExtensionPayload(
          draft.extension.routeId,
          draft.extension.atStart,
          draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
          draft.analysis.lengthKm,
          draft.analysis.totalCost,
          draft.analysis.riverCrossings.length,
          draft.analysis.segments.filter((segment) => segment.mountainLengthKm > 0).length,
        )
      : undefined,
    junctionBlueprint: draft.kind === "branch" && draft.branch?.junctionBlueprint
      ? transitionBlueprint(transitionBlueprint(draft.branch.junctionBlueprint, "approved"), "scheduled")
      : undefined,
  };
}

function usesConstructionTimeline() {
  return metaState.current.mode === "career" || (metaState.current.mode === "sandbox" && settings.sandboxConstructionTime) || isTutorialGuidedBuild();
}

function calculateCareerConstructionDuration(draft: ConstructionDraft) {
  const difficultyFactor = metaState.current.difficulty === "easy" ? 0.85 : metaState.current.difficulty === "hard" ? 1.2 : 1;
  const stationDays = draft.analysis.stationInstallCount * 55;
  const depotDays =
    draft.kind === "depot" && draft.polygon
      ? Math.max(60, calculatePolygonAreaHa(draft.polygon) * 32)
      : 0;
  return Math.max(1, Math.round(Math.max(draft.analysis.durationDays, depotDays) * difficultyFactor + stationDays));
}

function createStationConstructionProject(station: Station): ConstructionProject {
  const difficultyFactor = metaState.current.difficulty === "easy" ? 0.85 : metaState.current.difficulty === "hard" ? 1.2 : 1;
  const durationDays = Math.round(90 * difficultyFactor);
  return {
    id: createId("construction"),
    name: station.name,
    kind: "station",
    status: "scheduled",
    routeIds: station.connectedRouteIds,
    stationIds: [station.id],
    depotIds: [],
    coordinates: [station.position],
    startedDay: analysisStateOwner.current.dayIndex,
    durationDays,
    elapsedDays: 0,
    expectedCompletionDay: analysisStateOwner.current.dayIndex + durationDays,
    baseCost: 0,
    additionalCost: 0,
    delayDays: 0,
    events: [],
  };
}

function createStagedPlanConstructionProject(
  plan: ConstructionPlan,
  plannedRoute: PlannedRoute,
  actualRoute: RouteLine,
  group: RouteSegment[],
  isAddition: boolean,
): ConstructionProject {
  const difficultyFactor = metaState.current.difficulty === "easy" ? 0.85 : metaState.current.difficulty === "hard" ? 1.2 : 1;
  const durationDays = Math.max(7, Math.round(group.reduce((sum, segment) => sum +
    segment.lengthKm * baseConstructionDaysPerKm + segment.terrainImpact.mountainSegments * 80 +
    segment.terrainImpact.riverCrossings * (segment.constructionMode === "tunnel" ? tunnelConstructionDays : bridgeConstructionDays), 0) * difficultyFactor));
  return {
    id: createId("construction"), name: plannedRoute.name, kind: isAddition ? "extension" : "plan", status: "scheduled",
    routeIds: [actualRoute.id], stationIds: [], depotIds: [],
    coordinates: group.flatMap((segment, index) => index === 0 ? segment.coordinates : segment.coordinates.slice(1)),
    startedDay: analysisStateOwner.current.dayIndex, durationDays, elapsedDays: 0,
    expectedCompletionDay: analysisStateOwner.current.dayIndex + durationDays,
    baseCost: group.reduce((sum, segment) => sum + segment.constructionCost, 0), additionalCost: 0, delayDays: 0, events: [],
    sourcePlanId: plan.id,
    pendingPlanAddition: isAddition ? { route: structuredClone(plannedRoute), segmentIds: group.map((segment) => segment.id) } : undefined,
  };
}

function createPlanConstructionProjects(
  plan: ConstructionPlan,
  routeIds: string[],
  stationIds: string[],
  depotIds: string[],
) {
  const difficultyFactor = metaState.current.difficulty === "easy" ? 0.85 : metaState.current.difficulty === "hard" ? 1.2 : 1;
  const projects: ConstructionProject[] = [];
  for (const routeId of routeIds) {
    const route = networkState.routes.find((item) => item.id === routeId);
    if (!route) continue;
    const durationDays = Math.max(
      7,
      Math.round(
        (route.lengthKm * baseConstructionDaysPerKm +
          route.mountainSegments * 80 +
          route.riverCrossings * (route.riverMode === "tunnel" ? tunnelConstructionDays : bridgeConstructionDays)) *
          difficultyFactor,
      ),
    );
    projects.push({
      id: createId("construction"),
      name: route.name,
      kind: "plan",
      status: "scheduled",
      routeIds: [route.id],
      stationIds: [],
      depotIds: [],
      coordinates: route.coordinates,
      startedDay: analysisStateOwner.current.dayIndex,
      durationDays,
      elapsedDays: 0,
      expectedCompletionDay: analysisStateOwner.current.dayIndex + durationDays,
      baseCost: route.constructionCost,
      additionalCost: 0,
      delayDays: 0,
      events: [],
      sourcePlanId: plan.id,
    });
  }
  for (const stationId of stationIds) {
    const station = networkState.stations.find((item) => item.id === stationId);
    if (station) projects.push({ ...createStationConstructionProject(station), sourcePlanId: plan.id });
  }
  for (const depotId of depotIds) {
    const depot = networkState.depots.find((item) => item.id === depotId);
    if (!depot) continue;
    const durationDays = Math.max(60, Math.round((depot.constructionDays ?? depot.areaHa * 32) * difficultyFactor));
    projects.push({
      id: createId("construction"),
      name: depot.name,
      kind: "depot",
      status: "scheduled",
      routeIds: depot.connectedRouteIds,
      stationIds: [],
      depotIds: [depot.id],
      coordinates: depot.polygon,
      startedDay: analysisStateOwner.current.dayIndex,
      durationDays,
      elapsedDays: 0,
      expectedCompletionDay: analysisStateOwner.current.dayIndex + durationDays,
      baseCost: depot.constructionCost ?? 0,
      additionalCost: 0,
      delayDays: 0,
      events: [],
      sourcePlanId: plan.id,
    });
  }
  return projects;
}

function normalizeConstructionProjects(source?: ConstructionProject[]) {
  if (!Array.isArray(source)) return [];
  return source.map((project) => ({
    ...project,
    routeIds: project.routeIds ?? [],
    stationIds: project.stationIds ?? [],
    depotIds: project.depotIds ?? [],
    coordinates: project.coordinates ?? [],
    events: project.events ?? [],
    elapsedDays: Math.max(0, project.elapsedDays ?? 0),
    additionalCost: Math.max(0, project.additionalCost ?? 0),
    delayDays: Math.max(0, project.delayDays ?? 0),
    pendingExtension: project.pendingExtension
      ? {
          ...project.pendingExtension,
          coordinates: project.pendingExtension.coordinates ?? [],
        }
      : undefined,
  }));
}

function isRouteOperational(routeId: string) {
  return !constructionState.projects.some(
    (project) =>
      project.routeIds.includes(routeId) &&
      !["depot", "station"].includes(project.kind) &&
      project.kind !== "extension" &&
      project.status !== "operating",
  );
}

function isStationOperational(stationId: string) {
  return !constructionState.projects.some((project) => project.stationIds.includes(stationId) && project.status !== "operating");
}

function isDepotOperational(depotId: string) {
  return !constructionState.projects.some((project) => project.depotIds.includes(depotId) && project.status !== "operating");
}

function updateConstructionProjectsForDay() {
  const startedBlueprints: Array<{ planId: string; blueprintId: string }> = [];
  const result = constructionCoordinator.advanceDay(constructionState.projects, {
    onStarted: (project) => {
      if (project.kind === "plan" && project.sourcePlanId && project.blueprintId) {
        startedBlueprints.push({ planId: project.sourcePlanId, blueprintId: project.blueprintId });
      }
    },
    prepare: (project) => {
      let next = project.status === "scheduled" && project.junctionBlueprint?.status === "scheduled"
        ? { ...project, junctionBlueprint: transitionBlueprint(project.junctionBlueprint, "under-construction") }
        : project;
      const appliedEvents = next.events.map((event) => {
      if (event.applied || event.triggerDay > analysisStateOwner.current.dayIndex) return event;
      if (event.kind === "delay") {
        const delay = Math.max(0, event.delayDays ?? 0);
        next = { ...next, delayDays: next.delayDays + delay, expectedCompletionDay: next.expectedCompletionDay + delay };
      } else {
        const extraCost = Math.max(0, event.extraCost ?? 0);
        next = { ...next, additionalCost: next.additionalCost + extraCost };
        financeState.economy = { ...financeState.economy, constructionSpent: financeState.economy.constructionSpent + extraCost };
      }
      return { ...event, applied: true };
      });
      return { ...next, events: appliedEvents };
    },
    requiresOpening: (project) => ["route", "extension", "branch", "repair", "edit", "plan"].includes(project.kind),
    networkChanged: (project) => ["route", "extension", "branch", "plan"].includes(project.kind),
  });
  constructionState.replaceProjects(result.projects.map((project) =>
    project.status === "operating" && project.openedAtDay === undefined
      ? { ...project, openedAtDay: analysisStateOwner.current.dayIndex }
      : project,
  ));
  for (const started of startedBlueprints) {
    updatePlan(started.planId, (plan) => ({
      ...plan,
      connections: (plan.connections ?? []).map((connection) =>
        connection.id === started.blueprintId && connection.status === "scheduled"
          ? transitionBlueprint(connection, "under-construction")
          : connection,
      ),
    }));
  }
  const becameReady = result.completed.filter((completion) =>
    constructionState.projects.some((project) => project.id === completion.projectId && project.status === "opening-ready"),
  ).length;
  if (becameReady > 0) showToast(`${becameReady}개 공사가 완료되었습니다. 개통 조건을 확인하세요.`);
  if (result.changedProjectIds.length > 0) requestUpdateDomains(result.updateDomains);
  updateConstructionBadge();
}

function getOpeningRequirements(project: ConstructionProject) {
  if (project.kind === "plan" && project.sourcePlanId && project.blueprintId) {
    const connection = constructionState.plans.find((plan) => plan.id === project.sourcePlanId)?.connections?.find((item) => item.id === project.blueprintId);
    if (!connection) return [{ code: "blueprint", label: "연결 설계", met: false, action: "route" }];
    const dependency = project.dependsOnProjectId
      ? [{
          code: "parent-extension",
          label: "선행 연장 개통",
          met: constructionState.projects.some((item) => item.id === project.dependsOnProjectId && item.status === "operating"),
          action: "route",
        }]
      : [];
    if (connection.connectionType !== "physical-track") return dependency;
    const [sourceRouteId, targetRouteId] = project.routeIds;
    const sourceStation = sourceRouteId ? findConnectionStation(sourceRouteId, connection.coordinates?.[0]) : undefined;
    const targetStation = targetRouteId ? findConnectionStation(targetRouteId, connection.coordinates?.at(-1)) : undefined;
    return [
      ...dependency,
      { code: "connection-stations", label: "양 끝점 역", met: Boolean(sourceStation && targetStation), action: "station" },
    ];
  }
  const projectRoutes = project.routeIds.map((id) => networkState.routes.find((route) => route.id === id)).filter(Boolean) as RouteLine[];
  let openingRoutes = projectRoutes;
  let additionValid = true;
  if (project.pendingPlanAddition) {
    try {
      openingRoutes = projectRoutes.map((route) => addStagedPlanSegments(route, project.pendingPlanAddition!.route, project.pendingPlanAddition!.segmentIds));
    } catch {
      additionValid = false;
    }
  }
  const hasDepot =
    projectRoutes.length > 0 &&
    projectRoutes.every((route) =>
      networkState.depots.some((depot) => isDepotOperational(depot.id) && depot.connectedRouteIds.includes(route.id)),
    );
  const hasTrains =
    projectRoutes.length > 0 &&
    projectRoutes.every((route) => operationsState.fleets.some((fleet) => fleet.routeId === route.id && fleet.sets > 0));
  const hasStations =
    projectRoutes.length > 0 &&
    projectRoutes.every((route) => networkState.stations.some((station) => isStationOperational(station.id) && station.connectedRouteIds.includes(route.id)));
  const validPath =
    additionValid &&
    projectRoutes.length > 0 &&
    openingRoutes.every((route) => route.coordinates.length >= 2 && !hasRouteGaps(route) && (route.segments ?? []).some((segment) => segment.enabled));
  return [
    ...(project.dependsOnProjectId
      ? [{
          code: "parent-extension",
          label: "선행 연장 개통",
          met: constructionState.projects.some((item) => item.id === project.dependsOnProjectId && item.status === "operating"),
          action: "route",
        }]
      : []),
    { code: "depot", label: "차량기지 연결", met: hasDepot, action: "depot" },
    { code: "trains", label: "열차 구매 및 배정", met: hasTrains, action: "trains" },
    { code: "stations", label: "최소 1개 역", met: hasStations, action: "station" },
    { code: "path", label: "유효한 운행 경로", met: validPath, action: "route" },
  ];
}

function openConstructionManager() {
  renderConstructionManager();
  if (constructionManagerDialog) constructionManagerDialog.hidden = false;
}

function closeConstructionManager() {
  if (constructionManagerDialog) constructionManagerDialog.hidden = true;
}

function renderConstructionManager() {
  if (!constructionProjectList) return;
  updateConstructionBadge();
  if (constructionState.projects.length === 0) {
    constructionProjectList.innerHTML = `<div class="construction-project-empty"><strong>진행 중인 공사가 없습니다</strong><span>${metaState.current.mode === "sandbox" && !settings.sandboxConstructionTime ? "샌드박스 모드에서는 건설이 즉시 완료됩니다." : "건설을 확정하면 공사 일정이 이곳에 표시됩니다."}</span></div>`;
    return;
  }
  const statusOrder: Record<ConstructionProjectStatus, number> = { "opening-ready": 0, building: 1, scheduled: 2, planned: 3, operating: 4 };
  constructionProjectList.innerHTML = [...constructionState.projects]
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.startedDay - a.startedDay)
    .map(renderConstructionProjectCard)
    .join("");
}

function renderConstructionProjectCard(project: ConstructionProject) {
  const labels: Record<ConstructionProjectStatus, string> = {
    planned: "계획",
    scheduled: "공사 예정",
    building: "공사 중",
    "opening-ready": "개통 준비",
    operating: "운영 중",
  };
  const progress = project.status === "operating" || project.status === "opening-ready" ? 1 : clampNumber(project.elapsedDays / Math.max(1, project.durationDays + project.delayDays), 0, 1);
  const requirements = project.status === "opening-ready" ? getOpeningRequirements(project) : [];
  const ready = requirements.length > 0 && requirements.every((item) => item.met);
  const eventMarkup =
    project.events.length > 0
      ? `<div class="construction-events">${project.events.map((event) => `<span class="${event.applied ? "applied" : ""}">${escapeHtml(event.message)}</span>`).join("")}</div>`
      : "";
  return `<article class="construction-project-card status-${project.status}" data-project-id="${project.id}">
    <header><div><span>${labels[project.status]}</span><strong>${escapeHtml(project.name)}</strong></div><em>${Math.round(progress * 100)}%</em></header>
    <div class="construction-progress"><i style="width:${Math.round(progress * 100)}%"></i></div>
    <dl>
      <div><dt>공사 기간</dt><dd>${formatConstructionDuration(project.durationDays + project.delayDays)}</dd></div>
      <div><dt>완공 예정</dt><dd>게임 ${project.expectedCompletionDay}일차</dd></div>
      <div><dt>사업비</dt><dd>${formatCost(project.baseCost + project.additionalCost)}</dd></div>
    </dl>
    ${requirements.length > 0 ? `<div class="opening-requirements">${requirements.map((item) => `<button type="button" data-project-action="${item.action}" class="${item.met ? "met" : ""}"><i>${item.met ? "✓" : "!"}</i><span>${item.label}</span></button>`).join("")}</div>` : ""}
    ${eventMarkup}
    <footer>
      <button type="button" data-focus-project>지도에서 보기</button>
      ${project.status === "opening-ready" ? `<button type="button" data-open-project class="primary" ${ready ? "" : "disabled"}>노선 개통</button>` : ""}
    </footer>
  </article>`;
}

function handleConstructionManagerClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  const card = button?.closest<HTMLElement>("[data-project-id]");
  const project = constructionState.projects.find((item) => item.id === card?.dataset.projectId);
  if (!button || !project) return;
  if (button.hasAttribute("data-open-project")) {
    openConstructionProject(project.id);
    return;
  }
  const action = button.dataset.projectAction;
  if (action === "depot") {
    closeConstructionManager();
    selectedOperationRouteId = project.routeIds[0] ?? selectedOperationRouteId;
    setTool("depot");
    showToast("차량기지 건설 도구를 열었습니다.");
  } else if (action === "trains") {
    closeConstructionManager();
    selectedOperationRouteId = project.routeIds[0] ?? selectedOperationRouteId;
    updateOperationRouteOptions();
    buyTrainButton?.focus();
    showToast("열차 종류와 편성 수를 선택한 뒤 구매하세요.");
  } else if (action === "station") {
    closeConstructionManager();
    setTool("station");
    showToast("공사가 끝난 노선 위에 역을 설치하세요.");
  } else if (action === "route") {
    closeConstructionManager();
    selectRoute(project.routeIds[0] ?? null);
  } else if (button.hasAttribute("data-focus-project")) {
    closeConstructionManager();
    focusConstructionProject(project);
  }
}

async function openConstructionProject(projectId: string) {
  const project = constructionState.projects.find((item) => item.id === projectId);
  if (!project || project.status !== "opening-ready") return;
  if (project.dependsOnProjectId) {
    const parent = constructionState.projects.find((item) => item.id === project.dependsOnProjectId);
    if (!parent || parent.status !== "operating") {
      showToast(`선행 공사 ${parent?.name ?? project.dependsOnProjectId}의 개통을 먼저 완료해야 합니다.`);
      return;
    }
  }
  const requirements = getOpeningRequirements(project);
  if (!requirements.every((item) => item.met)) {
    const missing = requirements.filter((item) => !item.met).map((item) => item.label);
    showToast(`아직 개통할 수 없습니다. ${missing.join(" · ")} 조건을 완료해 주세요.`);
    renderConstructionManager();
    return;
  }
  const before = cloneState();
  try {
    if (project.pendingExtension) applyPendingLineExtension(project.pendingExtension);
    if (project.pendingPlanAddition) {
      const target = networkState.routes.find((route) => route.id === project.routeIds[0]);
      if (!target) throw new Error("분할 건설의 대상 노선이 없습니다.");
      const updated = rebuildRouteGraph(addStagedPlanSegments(target, project.pendingPlanAddition.route, project.pendingPlanAddition.segmentIds));
      networkState.routes = networkState.routes.map((route) => route.id === target.id ? updated : route);
    }
    if (project.kind === "plan" && project.sourcePlanId && project.blueprintId) applyCompletedConnectionProject(project);
    if (project.junctionBlueprint) applyCompletedJunctionProject(project);
    constructionState.replaceProjects(constructionState.projects.map((item) =>
      item.id === projectId && isValidConstructionStatusTransition(item.status, "operating")
        ? { ...item, status: "operating", openedAtDay: analysisStateOwner.current.dayIndex, pendingExtension: undefined, pendingPlanAddition: undefined }
        : item,
    ));
    synchronizeGraphReferences();
    metaState.patch({ updatedAt: Date.now() });
    await flushStateSave();
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    renderConstructionManager();
    requestUpdate("network-structure", project.routeIds[0]);
    showToast(`${project.name} 운행을 시작했습니다.`);
    playFeedback("confirm");
  } catch (error) {
    if (routePlanningController.session?.stage === "committing") {
      routePlanningController.transition("reviewing", {
        validationErrors: [{ code: "atomic-commit-failed", message: "확정에 실패해 이전 상태로 복구했습니다.", severity: "error" }],
      });
    }
    stateRecoveryCoordinator.recover(before, {
      scope: "partial",
      domains: ["map-blueprints", "map-construction", "map-selection", "hud-finance", "hud-status", "active-panel"],
      rebuildRouter: false,
    });
    renderConstructionManager();
    requestUpdate("construction-progress", project.routeIds[0]);
    showError("개통 처리 중 문제가 발생해 전체 변경을 되돌렸습니다.");
    console.error(error);
  }
}

function getConnectionBlueprintRuntime() {
  const completedConnections = constructionState.plans.flatMap((plan) => plan.connections ?? []).filter((connection) => connection.status === "completed" && Boolean(connection.appliedAt));
  return {
    entityIds: new Set([...networkState.routes.map((route) => route.id), ...networkState.stations.map((station) => station.id), ...networkState.depots.map((depot) => depot.id)]),
    routeIds: new Set(networkState.routes.map((route) => route.id)),
    depotIds: new Set(networkState.depots.map((depot) => depot.id)),
    transfers: networkState.transfers
      .filter((transfer) => transfer.stationIds.length >= 2)
      .map((transfer) => ({ id: transfer.id, stationIds: [transfer.stationIds[0], transfer.stationIds[1]] as [string, string], walkMin: transfer.transferTimeMin, resistance: transfer.resistance, connectionBlueprintId: transfer.id })),
    physicalConnections: completedConnections
      .filter((connection) => connection.connectionType === "physical-track" && connection.sourceLineId && connection.targetLineId)
      .map((connection) => ({ id: connection.id, sourceLineId: connection.sourceLineId!, targetLineId: connection.targetLineId!, coordinates: connection.coordinates ?? [], connectionBlueprintId: connection.id })),
    depotAccess: completedConnections
      .filter((connection) => connection.connectionType === "depot-access")
      .map((connection) => ({ id: connection.id, depotId: connection.sourceEntityType === "depot-access" ? connection.sourceEntityId : connection.targetEntityId, lineId: connection.sourceLineId ?? connection.targetLineId ?? "", connectionBlueprintId: connection.id }))
      .filter((connection) => Boolean(connection.lineId)),
    crossings: completedConnections
      .filter((connection) => connection.connectionType === "crossing-only")
      .map((connection) => ({ id: connection.id, sourceEntityId: connection.sourceEntityId, targetEntityId: connection.targetEntityId, connectionBlueprintId: connection.id })),
    graphVersion: completedConnections.filter((connection) => connection.connectionType !== "crossing-only").length,
  };
}

function advanceConnectionToConstruction(connection: ConnectionBlueprint) {
  let next = connection;
  if (next.status === "draft") next = transitionBlueprint(next, "approved");
  if (next.status === "approved") next = transitionBlueprint(next, "scheduled");
  if (next.status === "scheduled") next = transitionBlueprint(next, "under-construction");
  if (next.status !== "under-construction") throw new Error(`Connection blueprint '${connection.id}' cannot enter construction.`);
  return next;
}

function resolveConnectionRouteId(plan: ConstructionPlan, connection: ConnectionBlueprint, side: "source" | "target") {
  return resolvePlanConnectionRouteId(plan.routes, connection, side, networkState.routes.map((route) => route.id));
}

function findConnectionStation(routeId: string, coordinate?: { lat: number; lng: number }) {
  const route = networkState.routes.find((item) => item.id === routeId);
  const fallback = route?.coordinates[0];
  const point: [number, number] | null = coordinate ? [coordinate.lat, coordinate.lng] : fallback ?? null;
  if (!point) return undefined;
  return findNearestConnectionStation({ coordinate: point, stations: [...networkState.stations], routeId })?.station;
}

function getPhysicalConnectionCoordinates(connection: ConnectionBlueprint, sourceRoute: RouteLine, targetRoute: RouteLine) {
  const declared = (connection.coordinates ?? []).map((coordinate) => [roundCoord(coordinate.lat), roundCoord(coordinate.lng)] as [number, number]);
  const plannedRoutes = constructionState.plans.find((plan) => plan.connections?.some((item) => item.id === connection.id))?.routes ?? [];
  const sourceAnchor = resolvePlanConnectionEndpoint(plannedRoutes, connection, "source", sourceRoute.nodes?.map((node) => node.position) ?? sourceRoute.coordinates);
  const targetAnchor = resolvePlanConnectionEndpoint(plannedRoutes, connection, "target", targetRoute.nodes?.map((node) => node.position) ?? targetRoute.coordinates);
  if ((connection.sourceEntityType === "blueprint-endpoint" && !sourceAnchor) ||
      (connection.targetEntityType === "blueprint-endpoint" && !targetAnchor)) {
    throw new Error("Planned connection endpoint no longer matches the built line.");
  }
  return normalizeConnectionPolyline({
    sourceEndpoints: sourceAnchor ? [sourceAnchor] : [...sourceRoute.coordinates.slice(0, 1), ...sourceRoute.coordinates.slice(-1)],
    targetEndpoints: targetAnchor ? [targetAnchor] : [...targetRoute.coordinates.slice(0, 1), ...targetRoute.coordinates.slice(-1)],
    drawnCoordinates: declared,
    sourceEndpoint: connection.sourceEndpoint,
    targetEndpoint: connection.targetEndpoint,
  }).coordinates;
}

function appendPhysicalConnectionSegment(connection: ConnectionBlueprint, sourceRoute: RouteLine, targetRoute: RouteLine) {
  const segmentId = stableEntityId("connection-segment", connection.id);
  if ((sourceRoute.segments ?? []).some((segment) => segment.id === segmentId)) return [segmentId];
  const coordinates = getPhysicalConnectionCoordinates(connection, sourceRoute, targetRoute);
  const sourceCoordinate = coordinates[0];
  const sourceNode = (sourceRoute.nodes ?? [])
    .filter((node) => coordinatesEqual(node.position, sourceCoordinate))
    .find((node) => node.kind === "endpoint") ?? (sourceRoute.nodes ?? []).find((node) => coordinatesEqual(node.position, sourceCoordinate));
  if (!sourceNode) throw new Error("Physical connection source endpoint is missing.");
  const existingTargetNode = sourceRoute.id === targetRoute.id
    ? (sourceRoute.nodes ?? []).find((node) => coordinatesEqual(node.position, coordinates.at(-1)!))
    : undefined;
  const terminalNodeId = existingTargetNode?.id ?? stableEntityId("connection-node", connection.id);
  const branchId = stableEntityId("connection-branch", connection.id);
  const segment = createConnectionSegment({
    id: segmentId,
    fromNodeId: sourceNode.id,
    toNodeId: terminalNodeId,
    coordinates,
    constructionCost: 0,
  });
  const lengthKm = segment.lengthKm;
  const branch: Branch = {
    id: branchId,
    name: `${targetRoute.name} connection`,
    junctionNodeId: sourceNode.id,
    terminalNodeId,
    segmentIds: [segmentId],
    dispatchWeight: 0,
  };
  const updated: RouteLine = {
    ...sourceRoute,
    nodes: dedupeById([...(sourceRoute.nodes ?? []), { id: terminalNodeId, position: coordinates.at(-1)!, kind: "endpoint" }]),
    segments: [...(sourceRoute.segments ?? []), segment],
    branches: [...(sourceRoute.branches ?? []), branch],
    servicePatterns: upsertEqualBranchPattern(sourceRoute.servicePatterns ?? [], [...(sourceRoute.branches ?? []).map((item) => item.id), branchId], sourceRoute.id),
    lengthKm: Math.round((sourceRoute.lengthKm + lengthKm) * 1000) / 1000,
  };
  networkState.routes = networkState.routes.map((route) => route.id === sourceRoute.id ? updated : route);
  return [segmentId, terminalNodeId, branchId];
}

function appendDepotAccessSegment(connection: ConnectionBlueprint, depot: Depot, route: RouteLine) {
  const segmentId = stableEntityId("depot-access-segment", connection.id);
  if ((route.segments ?? []).some((segment) => segment.id === segmentId)) return [segmentId];
  const depotPoint: [number, number] = depot.polygon.reduce(
    (sum, point) => [sum[0] + point[0] / depot.polygon.length, sum[1] + point[1] / depot.polygon.length] as [number, number],
    [0, 0],
  );
  const declared = (connection.coordinates ?? []).map((point) => [roundCoord(point.lat), roundCoord(point.lng)] as [number, number]);
  const normalized = normalizeConnectionPolyline({
    sourceEndpoints: [...route.coordinates.slice(0, 1), ...route.coordinates.slice(-1)],
    targetEndpoints: [depotPoint],
    drawnCoordinates: declared,
  });
  const coordinates = normalized.coordinates;
  const source = coordinates[0];
  const sourceNode = (route.nodes ?? []).find((node) => coordinatesEqual(node.position, source));
  if (!sourceNode) throw new Error("Depot access source endpoint is missing.");
  const terminalNodeId = stableEntityId("depot-access-node", connection.id);
  const branchId = stableEntityId("depot-access-branch", connection.id);
  const segment = createConnectionSegment({
    id: segmentId,
    fromNodeId: sourceNode.id,
    toNodeId: terminalNodeId,
    coordinates,
    constructionCost: 0,
  });
  const lengthKm = segment.lengthKm;
  const branch: Branch = {
    id: branchId,
    name: `${depot.name} depot access`,
    junctionNodeId: sourceNode.id,
    terminalNodeId,
    segmentIds: [segmentId],
    dispatchWeight: 0,
  };
  networkState.routes = networkState.routes.map((item) => item.id === route.id ? {
    ...item,
    nodes: dedupeById([...(item.nodes ?? []), { id: terminalNodeId, position: coordinates.at(-1)!, kind: "endpoint" }]),
    segments: [...(item.segments ?? []), segment],
    branches: [...(item.branches ?? []), branch],
    servicePatterns: upsertEqualBranchPattern(item.servicePatterns ?? [], [...(item.branches ?? []).map((branch) => branch.id), branchId], item.id),
    lengthKm: Math.round((item.lengthKm + lengthKm) * 1000) / 1000,
  } : item);
  return [segmentId, terminalNodeId, branchId];
}

// 여러 도메인 참조를 함께 바꾸는 원자적 트랜잭션이다. 부분 이전은 이중 적용·복구 오류를 만들 수 있어 중앙 GameState 도입 전까지 이 경계를 유지한다.
function applyCompletedConnectionProject(project: ConstructionProject) {
  const plan = constructionState.plans.find((item) => item.id === project.sourcePlanId);
  const connection = plan?.connections?.find((item) => item.id === project.blueprintId);
  if (!plan || !connection) throw new Error("Connection blueprint is missing from its construction project.");
  if (connection.status === "completed") {
    if (!connection.appliedAt || !(connection.actualEntityIds?.length)) throw new Error(`Completed connection '${connection.id}' has no applied runtime result.`);
    return connection.actualEntityIds;
  }
  const sourceRouteId = resolveConnectionRouteId(plan, connection, "source");
  const targetRouteId = resolveConnectionRouteId(plan, connection, "target");
  const sourceRoute = sourceRouteId ? networkState.routes.find((route) => route.id === sourceRouteId) : undefined;
  const targetRoute = targetRouteId ? networkState.routes.find((route) => route.id === targetRouteId) : undefined;
  const sourceStation = connection.sourceStationId ? networkState.stations.find((station) => station.id === connection.sourceStationId) : sourceRouteId ? findConnectionStation(sourceRouteId, connection.coordinates?.[0]) : undefined;
  const targetStation = connection.targetStationId ? networkState.stations.find((station) => station.id === connection.targetStationId) : targetRouteId ? findConnectionStation(targetRouteId, connection.coordinates?.at(-1)) : undefined;
  const sourceDepot = connection.sourceEntityType === "depot-access" ? networkState.depots.find((depot) => depot.id === connection.sourceEntityId) : undefined;
  const targetDepot = connection.targetEntityType === "depot-access" ? networkState.depots.find((depot) => depot.id === connection.targetEntityId) : undefined;
  const staged = advanceConnectionToConstruction(connection);
  const runtimeConnection: ConnectionBlueprint = {
    ...staged,
    sourceEntityId: sourceStation?.id ?? sourceDepot?.id ?? sourceRouteId ?? staged.sourceEntityId,
    targetEntityId: targetStation?.id ?? targetDepot?.id ?? targetRouteId ?? staged.targetEntityId,
    sourceLineId: sourceRouteId ?? staged.sourceLineId,
    targetLineId: targetRouteId ?? staged.targetLineId,
  };
  const runtime = getConnectionBlueprintRuntime();
  let actualEntityIds: string[] = [];
  if (connection.connectionType === "transfer") {
    if (!sourceStation || !targetStation) throw new Error("Transfer stations are missing.");
    completeConnectionBlueprint(runtime, runtimeConnection, { stationIds: [sourceStation.id, targetStation.id] });
    createTransferGroup([sourceStation.id, targetStation.id], false);
    const transferId = networkState.transfers.find((transfer) => transfer.stationIds.includes(sourceStation.id) && transfer.stationIds.includes(targetStation.id))?.id;
    actualEntityIds = [sourceStation.id, targetStation.id, ...(transferId ? [transferId] : [])];
  } else if (connection.connectionType === "physical-track") {
    if (!sourceRoute || !targetRoute || !sourceStation || !targetStation) throw new Error("Physical connection endpoints are incomplete.");
    completeConnectionBlueprint(runtime, runtimeConnection);
    actualEntityIds = [sourceRoute.id, targetRoute.id, sourceStation.id, targetStation.id, ...appendPhysicalConnectionSegment(connection, sourceRoute, targetRoute)];
  } else if (connection.connectionType === "depot-access") {
    const depot = sourceDepot ?? targetDepot;
    const lineId = sourceRouteId ?? targetRouteId;
    if (!depot || !lineId) throw new Error("Depot access target is missing.");
    completeConnectionBlueprint(runtime, runtimeConnection, { depotId: depot.id });
    networkState.depots = networkState.depots.map((item) => item.id === depot.id ? { ...item, connectedRouteIds: Array.from(new Set([...item.connectedRouteIds, lineId])) } : item);
    const route = networkState.routes.find((item) => item.id === lineId);
    if (!route) throw new Error("Depot access route is missing.");
    actualEntityIds = [depot.id, lineId, ...appendDepotAccessSegment(connection, depot, route)];
  } else if (connection.connectionType === "crossing-only") {
    completeConnectionBlueprint(runtime, runtimeConnection);
    actualEntityIds = [runtimeConnection.sourceEntityId, runtimeConnection.targetEntityId];
  } else {
    if (!sourceRoute || !targetRoute || sourceRoute.id === targetRoute.id) throw new Error("Line merge targets are invalid.");
    completeConnectionBlueprint(runtime, runtimeConnection, {
      keepLineId: sourceRoute.id,
      merge: () => mergeCompletedConnectionRoutes(sourceRoute, targetRoute, connection),
    });
    actualEntityIds = [sourceRoute.id];
  }
  updatePlan(plan.id, (item) => ({
    ...item,
    connections: (item.connections ?? []).map((candidate) => candidate.id === connection.id
      ? { ...runtimeConnection, status: "completed", projectId: project.id, sourceStationId: sourceStation?.id, targetStationId: targetStation?.id, appliedAt: Date.now(), actualEntityIds }
      : candidate),
  }));
  if (connection.connectionType !== "crossing-only") {
    transitRouterCache.invalidate();
  }
  return actualEntityIds;
}

function mergeCompletedConnectionRoutes(first: RouteLine, second: RouteLine, connection: ConnectionBlueprint) {
  const bridge = getPhysicalConnectionCoordinates(connection, first, second);
  const sourceHint = bridge[0];
  const targetHint = bridge.at(-1)!;
  const mergedGeometry = mergeRouteGeometry({
    first: first.coordinates,
    second: second.coordinates,
    firstHint: sourceHint,
    secondHint: targetHint,
    bridge,
  });
  const merged = rebuildRouteGraph({
    ...first,
    coordinates: mergedGeometry.coordinates,
    lengthKm: Math.round((first.lengthKm + second.lengthKm + polylineLengthMeters(bridge) / 1000) * 1000) / 1000,
    constructionCost: first.constructionCost + second.constructionCost,
    riverCrossings: first.riverCrossings + second.riverCrossings,
    mountainSegments: first.mountainSegments + second.mountainSegments,
    branches: [...(first.branches ?? []), ...(second.branches ?? [])],
    nodes: [...(first.nodes ?? []), ...(second.nodes ?? [])],
    segments: [...(first.segments ?? []), ...(second.segments ?? [])],
  });
  networkState.routes = networkState.routes.filter((route) => route.id !== second.id).map((route) => route.id === first.id ? merged : route);
  networkState.stations = mergeDuplicateStations(networkState.stations.map((station) => ({ ...station, connectedRouteIds: Array.from(new Set(station.connectedRouteIds.map((id) => id === second.id ? first.id : id))) })));
  operationsState.fleets = operationsState.fleets.map((fleet) => fleet.routeId === second.id ? { ...fleet, routeId: first.id } : fleet);
  networkState.depots = networkState.depots.map((depot) => ({ ...depot, connectedRouteIds: Array.from(new Set(depot.connectedRouteIds.map((id) => id === second.id ? first.id : id))) }));
  operationsState.expressConfigs = mergeExpressConfigs(first.id, second.id);
  constructionState.replaceProjects(constructionState.projects.map((project) => ({
    ...project,
    routeIds: Array.from(new Set(project.routeIds.map((id) => id === second.id ? first.id : id))),
    pendingExtension: project.pendingExtension?.targetLineId === second.id
      ? { ...project.pendingExtension, targetLineId: first.id }
      : project.pendingExtension,
  })));
  constructionState.replacePlans(constructionState.plans.map((plan) => ({
    ...plan,
    routes: plan.routes.map((route) => ({
      ...route,
      actualRouteId: route.actualRouteId === second.id ? first.id : route.actualRouteId,
      rootLineId: route.rootLineId === second.id ? first.id : route.rootLineId,
      targetLineId: route.targetLineId === second.id ? first.id : route.targetLineId,
      actualExtension: route.actualExtension?.routeId === second.id ? { ...route.actualExtension, routeId: first.id } : route.actualExtension,
    })),
    connections: (plan.connections ?? []).map((item) => ({
      ...item,
      sourceLineId: item.sourceLineId === second.id ? first.id : item.sourceLineId,
      targetLineId: item.targetLineId === second.id ? first.id : item.targetLineId,
      sourceEntityId: item.sourceEntityId === second.id ? first.id : item.sourceEntityId,
      targetEntityId: item.targetEntityId === second.id ? first.id : item.targetEntityId,
    })),
  })));
  cleanupTransferData();
}

function advanceJunctionToConstruction(junction: JunctionBlueprint) {
  let next = junction;
  if (next.status === "draft") next = transitionBlueprint(next, "approved");
  if (next.status === "approved") next = transitionBlueprint(next, "scheduled");
  if (next.status === "scheduled") next = transitionBlueprint(next, "under-construction");
  if (next.status !== "under-construction") throw new Error(`Junction blueprint '${junction.id}' cannot enter construction.`);
  return next;
}

// 노선·segment·branch·blueprint를 함께 바꾸는 원자적 트랜잭션이다. 중앙 GameState 없이 부분 이전하지 않는다.
function applyCompletedJunctionProject(project: ConstructionProject) {
  const junction = project.junctionBlueprint;
  const targetRoute = junction ? networkState.routes.find((route) => route.id === junction.targetLineId) : undefined;
  if (!junction || !targetRoute) throw new Error("Junction construction target is missing.");
  if (junction.status === "completed") return targetRoute.id;
  const staged = advanceJunctionToConstruction(junction);
  const sourceSegment = (targetRoute.segments ?? []).find((segment) => segment.id === staged.sourceSegmentId);
  if (!sourceSegment) throw new Error("Junction source segment is missing.");
  const junctionNodeId = stableEntityId("junction-node", staged.id);
  const branchId = stableEntityId("branch", staged.id);
  completeJunctionBlueprint(
    {
      lineId: targetRoute.id,
      segments: targetRoute.segments ?? [],
      nodes: (targetRoute.nodes ?? []).map((node) => ({
        ...node,
        kind: node.kind === "endpoint" ? "endpoint" as const : "control" as const,
      })),
      branches: (targetRoute.branches ?? []).map((branch) => ({ id: branch.id, junctionNodeId: branch.junctionNodeId })),
    },
    staged,
    { junctionNodeId, branchId },
  );
  const [left, right] = splitSegmentAtJunction(sourceSegment, staged, junctionNodeId);
  const branchCoordinates = [...project.coordinates];
  const junctionPosition: [number, number] = [roundCoord(staged.position.lat), roundCoord(staged.position.lng)];
  if (!branchCoordinates[0] || !coordinatesEqual(branchCoordinates[0], junctionPosition)) branchCoordinates.unshift(junctionPosition);
  if (branchCoordinates.length < 2) throw new Error("Junction branch geometry is invalid.");
  const terminalNodeId = stableEntityId("branch-terminal", staged.id);
  const branchSegmentId = stableEntityId("branch-segment", staged.id);
  const branchLength = polylineLengthMeters(branchCoordinates) / 1000;
  const branchSegment: RouteSegment = {
    id: branchSegmentId,
    fromNodeId: junctionNodeId,
    toNodeId: terminalNodeId,
    coordinates: branchCoordinates,
    lengthKm: branchLength,
    terrainImpact: { riverCrossings: 0, mountainSegments: 0 },
    constructionMode: "bridge",
    constructionCost: project.baseCost,
    enabled: true,
  };
  const insertionIndex = findPolylineInsertionIndex(targetRoute.coordinates, junctionPosition);
  const coordinates = targetRoute.coordinates.some((coordinate) => coordinatesEqual(coordinate, junctionPosition))
    ? targetRoute.coordinates
    : [...targetRoute.coordinates.slice(0, insertionIndex), junctionPosition, ...targetRoute.coordinates.slice(insertionIndex)];
  const branch: Branch = {
    id: branchId,
    name: `${targetRoute.name} branch ${(targetRoute.branches?.length ?? 0) + 1}`,
    junctionNodeId,
    terminalNodeId,
    segmentIds: [branchSegmentId],
    dispatchWeight: 1,
  };
  const updated: RouteLine = {
    ...targetRoute,
    coordinates,
    nodes: dedupeById([...(targetRoute.nodes ?? []), { id: junctionNodeId, position: junctionPosition, kind: "branch" }, { id: terminalNodeId, position: branchCoordinates.at(-1)!, kind: "endpoint" }]),
    segments: (targetRoute.segments ?? []).flatMap((segment) => segment.id === sourceSegment.id ? [left, right, branchSegment] : [segment]),
    branches: [...(targetRoute.branches ?? []), branch],
    servicePatterns: upsertEqualBranchPattern(targetRoute.servicePatterns ?? [], [...(targetRoute.branches ?? []).map((item) => item.id), branchId], targetRoute.id),
    lengthKm: Math.round((targetRoute.lengthKm + branchLength) * 1000) / 1000,
    constructionCost: targetRoute.constructionCost + project.baseCost,
  };
  networkState.routes = networkState.routes.map((route) => route.id === targetRoute.id ? updated : route);
  constructionState.replaceProjects(constructionState.projects.map((item) => item.id === project.id ? { ...item, junctionBlueprint: { ...staged, status: "completed" } } : item));
  transitRouterCache.invalidate();
  return updated.id;
}

function applyPendingLineExtension(extension: LineExtensionPayload) {
  const targetRoute = networkState.routes.find((route) => route.id === extension.targetLineId);
  if (!targetRoute) throw new Error("Extension target route missing.");
  const updated = rebuildRouteGraph(mergeLineExtension(targetRoute, extension));
  networkState.routes = networkState.routes.map((route) => route.id === targetRoute.id ? updated : route);
}

function createLineExtensionPayload(
  targetLineId: string,
  atStart: boolean,
  coordinates: Array<[number, number]>,
  lengthKm: number,
  constructionCost: number,
  riverCrossings: number,
  mountainSegments: number,
): LineExtensionPayload {
  return {
    targetLineId,
    atStart,
    coordinates,
    lengthKm,
    constructionCost,
    riverCrossings,
    mountainSegments,
  };
}

function getPlannedExtensionSegments(route: PlannedRoute, parent: PlannedRoute) {
  const parentSegmentCount = parent.segments.length;
  return route.extensionAtStart
    ? route.segments.slice(0, Math.max(0, route.segments.length - parentSegmentCount))
    : route.segments.slice(Math.min(parentSegmentCount, route.segments.length));
}

function getPlannedExtensionCoordinates(route: PlannedRoute, parent: PlannedRoute): Array<[number, number]> {
  const parentCoordinateCount = parent.coordinates.length;
  if (route.extensionAtStart) {
    const addedCoordinateCount = Math.max(0, route.coordinates.length - parentCoordinateCount);
    return route.coordinates.slice(0, addedCoordinateCount + 1).reverse();
  }
  return route.coordinates.slice(Math.max(0, parentCoordinateCount - 1));
}

function createPendingExtensionProject(
  targetRoute: RouteLine,
  pendingExtension: LineExtensionPayload,
  durationDays: number,
  sourcePlanId?: string,
  dependsOnProjectId?: string,
  blueprintId?: string,
): ConstructionProject {
  const normalizedDuration = Math.max(1, durationDays);
  return {
    id: createId("construction"),
    name: `${targetRoute.name} 연장`,
    kind: "extension",
    status: "scheduled",
    routeIds: [targetRoute.id],
    stationIds: [],
    depotIds: [],
    coordinates: pendingExtension.coordinates,
    startedDay: analysisStateOwner.current.dayIndex,
    durationDays: normalizedDuration,
    elapsedDays: 0,
    expectedCompletionDay: analysisStateOwner.current.dayIndex + normalizedDuration,
    baseCost: pendingExtension.constructionCost,
    additionalCost: 0,
    delayDays: 0,
    events: [],
    sourcePlanId,
    dependsOnProjectId,
    blueprintId,
    pendingExtension,
  };
}

function focusConstructionProject(project: ConstructionProject) {
  if (project.coordinates.length > 1) {
    map.fitBounds(L.latLngBounds(project.coordinates.map(([lat, lng]) => L.latLng(lat, lng))), { padding: [50, 50], maxZoom: 15 });
  } else if (project.coordinates.length === 1) {
    map.flyTo(L.latLng(project.coordinates[0][0], project.coordinates[0][1]), 16);
  } else if (project.routeIds[0]) {
    selectRoute(project.routeIds[0]);
  }
}

function updateConstructionBadge() {
  const activeCount = constructionState.projects.filter((project) => project.status !== "operating").length;
  if (constructionProjectBadge) {
    constructionProjectBadge.hidden = activeCount === 0;
    constructionProjectBadge.textContent = String(activeCount);
  }
  constructionManagerButton?.classList.toggle("active-projects", activeCount > 0);
}

function applyDepotConstructionDraft(draft: ConstructionDraft) {
  const polygon = draft.polygon;
  if (!polygon) throw new Error("Depot polygon missing");
  const areaHa = calculatePolygonAreaHa(polygon);
  const level = 1;
  const depot: Depot = {
    id: createId("depot"),
    name: `Depot ${networkState.depots.length + 1}`,
    polygon: polygon.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
    areaHa,
    capacity: calculateDepotCapacity(areaHa, level),
    maintenanceCost: calculateDepotMaintenance(areaHa, level),
    connectedRouteIds: draft.connectedRouteIds ?? [],
    level,
    constructionCost: draft.analysis.totalCost,
    constructionDays: draft.analysis.durationDays,
  };
  networkState.depots = [...networkState.depots, depot];
  return depot.id;
}

function applyEditConstructionDraft(draft: ConstructionDraft) {
  const route = networkState.routes.find((item) => item.id === draft.routeId);
  if (!route) throw new Error("Edited route missing");
  const coordinates = draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)] as [number, number]);
  const updated = rebuildRouteGraph({
    ...route,
    coordinates,
    lengthKm: Math.round(calculateLengthKmPrecise(draft.points) * 10) / 10,
    constructionCost: Math.max(0, route.constructionCost + draft.analysis.totalCost),
  });
  networkState.routes = networkState.routes.map((item) => (item.id === route.id ? updated : item));
  return route.id;
}

function applyRouteConstructionDraft(draft: ConstructionDraft) {
  const cost = draft.analysis.totalCost;
  const riverCount = draft.analysis.riverCrossings.length;
  const mountainSegments = draft.analysis.segments.filter((segment) => segment.mountainLengthKm > 0).length;
  if (draft.kind === "branch") {
    const branch = draft.branch;
    const targetRoute = networkState.routes.find((route) => route.id === branch?.routeId);
    if (!branch || !targetRoute) throw new Error("Branch target missing");
    if (branch.junctionBlueprint) {
      return applyCompletedJunctionProject({
        id: createId("construction"),
        name: `${targetRoute.name} branch`,
        kind: "branch",
        status: "opening-ready",
        routeIds: [targetRoute.id],
        stationIds: [],
        depotIds: [],
        coordinates: draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
        startedDay: analysisStateOwner.current.dayIndex,
        durationDays: 1,
        elapsedDays: 1,
        expectedCompletionDay: analysisStateOwner.current.dayIndex,
        baseCost: cost,
        additionalCost: 0,
        delayDays: 0,
        events: [],
        junctionBlueprint: branch.junctionBlueprint,
      });
    }
    const junctionPosition: [number, number] = [roundCoord(branch.junctionLatLng.lat), roundCoord(branch.junctionLatLng.lng)];
    const insertionIndex = findRouteInsertionIndex(targetRoute.coordinates, branch.junctionLatLng);
    const existingCoordinateIndex = targetRoute.coordinates.findIndex((coordinate) => coordinatesEqual(coordinate, junctionPosition));
    const trunkCoordinates =
      existingCoordinateIndex >= 0
        ? targetRoute.coordinates
        : [...targetRoute.coordinates.slice(0, insertionIndex), junctionPosition, ...targetRoute.coordinates.slice(insertionIndex)];
    const migrated = rebuildRouteGraph({ ...targetRoute, coordinates: trunkCoordinates });
    const junctionNode = migrated.nodes?.find((node) => coordinatesEqual(node.position, junctionPosition));
    if (!junctionNode) throw new Error("Branch junction missing");
    junctionNode.kind = "branch";
    const branchGraph = createGraphForDraftPath(draft, junctionNode.id);
    const terminalNode = branchGraph.nodes[branchGraph.nodes.length - 1];
    const nextBranch: Branch = {
      id: createId("branch"),
      name: `${targetRoute.name} 분기 ${(migrated.branches?.length ?? 0) + 1}`,
      junctionNodeId: junctionNode.id,
      terminalNodeId: terminalNode.id,
      segmentIds: branchGraph.segments.map((segment) => segment.id),
      dispatchWeight: 1,
    };
    const branchIds = [...(migrated.branches ?? []).map((item) => item.id), nextBranch.id];
    const updatedRoute: RouteLine = {
      ...migrated,
      nodes: dedupeById([...(migrated.nodes ?? []), ...branchGraph.nodes]),
      segments: [...(migrated.segments ?? []), ...branchGraph.segments],
      branches: [...(migrated.branches ?? []), nextBranch],
      servicePatterns: upsertEqualBranchPattern(migrated.servicePatterns ?? [], branchIds, migrated.id),
      lengthKm: Math.round((migrated.lengthKm + draft.analysis.lengthKm) * 10) / 10,
      constructionCost: migrated.constructionCost + cost,
      riverCrossings: migrated.riverCrossings + riverCount,
      mountainSegments: migrated.mountainSegments + mountainSegments,
    };
    networkState.routes = networkState.routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
    return updatedRoute.id;
  }
  if (draft.kind === "repair") {
    const repair = draft.repair;
    const targetRoute = networkState.routes.find((route) => route.id === repair?.routeId);
    if (!repair || !targetRoute) throw new Error("Repair target missing");
    const insertedPointCount = Math.max(0, draft.points.length - 2);
    const removedSegmentLength =
      map.distance(
        L.latLng(targetRoute.coordinates[repair.gapIndex][0], targetRoute.coordinates[repair.gapIndex][1]),
        L.latLng(targetRoute.coordinates[repair.gapIndex + 1][0], targetRoute.coordinates[repair.gapIndex + 1][1]),
      ) / 1000;
    const nextCoordinates = [
      ...targetRoute.coordinates.slice(0, repair.gapIndex + 1),
      ...draft.points.slice(1, -1).map((point) => [roundCoord(point.lat), roundCoord(point.lng)] as [number, number]),
      ...targetRoute.coordinates.slice(repair.gapIndex + 1),
    ];
    const disabledSegments = (targetRoute.disabledSegments ?? [])
      .filter((index) => index !== repair.gapIndex)
      .map((index) => (index > repair.gapIndex ? index + insertedPointCount : index));
    let updatedRoute = rebuildRouteGraph({
      ...targetRoute,
      coordinates: nextCoordinates,
      disabledSegments,
      lengthKm: Math.round(Math.max(0, targetRoute.lengthKm - removedSegmentLength + draft.analysis.lengthKm) * 10) / 10,
      constructionCost: targetRoute.constructionCost + cost,
      riverCrossings: targetRoute.riverCrossings + riverCount,
      mountainSegments: targetRoute.mountainSegments + mountainSegments,
    });
    updatedRoute = applyDraftMetadataToRoute(updatedRoute, draft);
    networkState.routes = networkState.routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
    return updatedRoute.id;
  }
  if (draft.kind === "extension") {
    const extension = draft.extension;
    const targetRoute = networkState.routes.find((route) => route.id === extension?.routeId);
    if (!extension || !targetRoute) throw new Error("Extension target missing");
    const payload = createLineExtensionPayload(
      targetRoute.id,
      extension.atStart,
      draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
      draft.analysis.lengthKm,
      cost,
      riverCount,
      mountainSegments,
    );
    let updatedRoute = rebuildRouteGraph(mergeLineExtension(targetRoute, payload));
    updatedRoute = applyDraftMetadataToRoute(updatedRoute, draft);
    networkState.routes = networkState.routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
    return updatedRoute.id;
  }
  let route: RouteLine = {
    id: createId("route"),
    name: draftRouteName || `Line ${networkState.routes.length + 1}`,
    color: selectedColor,
    coordinates: draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
    lengthKm: Math.round(draft.analysis.lengthKm * 10) / 10,
    constructionCost: cost,
    riverCrossings: riverCount,
    mountainSegments,
    riverMode: draft.analysis.riverCrossings.some((crossing) => crossing.mode === "tunnel") ? "tunnel" : "bridge",
    visibility: "public",
    localServiceEnabled: true,
    expressServiceEnabled: false,
    operationPaused: false,
  };
  route = applyDraftMetadataToRoute(rebuildRouteGraph(route), draft);
  networkState.routes = [...networkState.routes, route];
  return route.id;
}

function createGraphForDraftPath(draft: ConstructionDraft, firstNodeId: string) {
  const coordinates = draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)] as [number, number]);
  const nodes = coordinates.map((position, index): RouteNode => ({
    id: index === 0 ? firstNodeId : createId("node"),
    position,
    kind: index === coordinates.length - 1 ? "endpoint" : index === 0 ? "branch" : "control",
  }));
  const segments = draft.analysis.segments.map((impact, index) => createSegmentFromImpact(impact, nodes[index].id, nodes[index + 1].id, draft.analysis.riverCrossings));
  return { nodes, segments };
}

function applyDraftMetadataToRoute(route: RouteLine, draft: ConstructionDraft) {
  const impacts = draft.analysis.segments;
  return {
    ...route,
    segments: (route.segments ?? []).map((segment) => {
      const impact = impacts.find((item) => segmentMatchesImpact(segment, item));
      return impact ? createSegmentFromImpact(impact, segment.fromNodeId, segment.toNodeId, draft.analysis.riverCrossings, segment.id) : segment;
    }),
  };
}

function segmentMatchesImpact(segment: RouteSegment, impact: ConstructionSegmentImpact) {
  const first = segment.coordinates[0];
  const last = segment.coordinates[segment.coordinates.length - 1];
  const [impactFirst, impactLast] = impact.coordinates;
  return (coordinatesEqual(first, impactFirst) && coordinatesEqual(last, impactLast)) || (coordinatesEqual(first, impactLast) && coordinatesEqual(last, impactFirst));
}

function createSegmentFromImpact(
  impact: ConstructionSegmentImpact,
  fromNodeId: string,
  toNodeId: string,
  choices: RiverCrossingChoice[],
  id: string = createId("segment"),
): RouteSegment {
  const crossings = choices
    .filter((choice) => impact.riverCrossingIds.includes(choice.id) && choice.mode)
    .map((choice) => ({
      id: choice.id,
      position: choice.position,
      mode: choice.mode!,
      cost: getRiverCrossingCost(choice.mode!),
    }));
  const riverCost = crossings.reduce((sum, crossing) => sum + crossing.cost, 0);
  const constructionMode = crossings.some((crossing) => crossing.mode === "tunnel") ? "tunnel" : "bridge";
  return {
    id,
    fromNodeId,
    toNodeId,
    coordinates: impact.coordinates,
    lengthKm: impact.lengthKm,
    terrainImpact: { riverCrossings: crossings.length, mountainSegments: impact.mountainLengthKm > 0 ? 1 : 0 },
    constructionMode,
    constructionCost: impact.baseCost + impact.mountainCost + riverCost,
    enabled: true,
    riverCrossings: crossings,
    mountainLengthKm: impact.mountainLengthKm,
    constructionDays: Math.round(
      impact.lengthKm * baseConstructionDaysPerKm +
        impact.mountainLengthKm * 80 +
        crossings.reduce((sum, crossing) => sum + (crossing.mode === "bridge" ? bridgeConstructionDays : tunnelConstructionDays), 0),
    ),
  };
}

const stationNameLookupCache = new Map<string, Promise<StationNameMatch | null>>();
const pendingStationNameTargets = new Map<string, { actualStationId?: string }>();

function createAutomaticStationName(position: LatLng, fallbackName: string, excludingId?: string) {
  if (!settings.autoStationNaming) return fallbackName;
  const nearest = stationNamePlaces[metaState.current.cityId]
    .map((place) => ({ ...place, distance: map.distance(position, L.latLng(place.position[0], place.position[1])) }))
    .filter((place) => place.distance <= 1500)
    .sort((a, b) => a.distance - b.distance)[0];
  return makeUniqueStationName(nearest?.name ?? cityConfigs[metaState.current.cityId].name, position, excludingId);
}

function makeUniqueStationName(baseName: string, position: LatLng, excludingId?: string) {
  const normalized = normalizeAutomaticStationName(baseName) || "새 역";
  const otherStations = [
    ...networkState.stations.map((station) => ({ id: station.id, name: station.name, position: station.position })),
    ...constructionState.plans.flatMap((plan) => plan.stations.map((station) => ({ id: station.id, name: station.name, position: station.position }))),
  ].filter((station) => station.id !== excludingId);
  const namedStations = otherStations.filter((station) => station.name === normalized);
  if (namedStations.length === 0) return normalized;
  const sameArea = namedStations.some(
    (station) => map.distance(position, L.latLng(station.position[0], station.position[1])) <= 650,
  );
  if (sameArea) return normalized;
  const usedNames = new Set(otherStations.map((station) => station.name));
  let suffix = 2;
  while (usedNames.has(`${normalized} ${suffix}`)) suffix += 1;
  return `${normalized} ${suffix}`;
}

async function findNearbyOsmStationName(position: [number, number]) {
  const cacheKey = `${metaState.current.cityId}:${position[0]}:${position[1]}`;
  const cached = stationNameLookupCache.get(cacheKey);
  if (cached) return cached;
  const lookup = (async () => {
    const [lat, lng] = position;
    const fallbackCategories = [
      [850, '["place"~"^(suburb|quarter|neighbourhood|village)$"]'],
      [600, '["amenity"~"^(university|hospital|townhall|marketplace|library|school)$"]'],
      [450, '["leisure"="park"]'],
      [600, '["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]'],
      [600, '["historic"]'],
      [300, '["highway"]'],
    ] as const;
    const railwayQuery = `[out:json][timeout:8];nwr(around:1000,${lat},${lng})["railway"~"^(station|halt|tram_stop)$"];out center tags;`;
    const fallbackQuery = `[out:json][timeout:8];(${fallbackCategories.flatMap(([radius, filter]) =>
      ["name", "name:ko"].map((nameTag) => `nwr(around:${radius},${lat},${lng})["${nameTag}"]${filter};`),
    ).join("\n")});out center tags;`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const railwayData = await fetchOverpass(railwayQuery, controller.signal, 10000);
      const railwayName = selectAutomaticStationName(position, railwayData?.elements ?? []);
      if (railwayName?.source === "railway") return railwayName;
      const fallbackData = await fetchOverpass(fallbackQuery, controller.signal, 10000);
      return selectAutomaticStationName(position, fallbackData?.elements ?? []);
    } catch {
      stationNameLookupCache.delete(cacheKey);
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  stationNameLookupCache.set(cacheKey, lookup);
  return lookup;
}

async function refineAutomaticStationName(
  target: { kind: "actual"; id: string; initialName: string } | { kind: "planned"; id: string; planId: string; initialName: string },
) {
  if (!settings.autoStationNaming) return;
  const current =
    target.kind === "actual"
      ? networkState.stations.find((station) => station.id === target.id)
      : constructionState.plans.find((plan) => plan.id === target.planId)?.stations.find((station) => station.id === target.id);
  if (!current || current.name !== target.initialName) return;
  const slotId = metaState.current.slotId;
  const cityId = metaState.current.cityId;
  const position: [number, number] = [...current.position];
  const pendingKey = target.kind === "planned" ? JSON.stringify([slotId, cityId, target.planId, target.id]) : undefined;
  const pendingTarget: { actualStationId?: string } = {};
  if (pendingKey) pendingStationNameTargets.set(pendingKey, pendingTarget);
  let nearbyName: StationNameMatch | null;
  try { nearbyName = await findNearbyOsmStationName(position); }
  catch { return; }
  finally { if (pendingKey && pendingStationNameTargets.get(pendingKey) === pendingTarget) pendingStationNameTargets.delete(pendingKey); }
  if (!nearbyName || !settings.autoStationNaming || metaState.current.slotId !== slotId || metaState.current.cityId !== cityId) return;
  const planned = target.kind === "planned" ? constructionState.plans.find((plan) => plan.id === target.planId)?.stations.find((station) => station.id === target.id) : undefined;
  const actualId = target.kind === "actual" ? target.id : planned?.actualStationId ?? pendingTarget.actualStationId;
  const actual = actualId ? networkState.stations.find((station) => station.id === actualId) : undefined;
  const latest =
    target.kind === "actual"
      ? actual
      : planned && !planned.completed ? planned : actual;
  const updatingActual = latest === actual;
  const expectedName = updatingActual && target.kind === "planned" ? target.initialName.replace(/^계획 /, "") : target.initialName;
  if (!latest || latest.name !== expectedName || latest.position[0] !== position[0] || latest.position[1] !== position[1]) return;
  const nextName = nearbyName.source === "railway" ? nearbyName.name : makeUniqueStationName(
    nearbyName.name,
    L.latLng(latest.position[0], latest.position[1]),
    latest.id,
  );
  if (nextName === latest.name) return;
  if (updatingActual) {
    networkState.stations = networkState.stations.map((station) => station.id === latest.id ? { ...station, name: nextName } : station);
    if (target.kind === "planned" && planned?.name === target.initialName) {
      updatePlan(target.planId, (plan) => ({ ...plan, stations: plan.stations.map((station) => station.id === target.id ? { ...station, name: nextName } : station) }));
    }
  } else if (target.kind === "planned") {
    updatePlan(target.planId, (plan) => ({
      ...plan,
      stations: plan.stations.map((station) => station.id === target.id ? { ...station, name: nextName } : station),
    }));
  }
  requestStateSave();
  if (updatingActual) {
    reconcileMapStations(latest.id);
    updateHud();
    if (planned) renderPlanningDialog();
  } else {
    reconcileBlueprints();
    renderPlanningDialog();
  }
  setText(facilityReadout, `${nextName} · 주변 역·지역명 자동 적용`);
}

function createStationAt(point: L.Point) {
  if (planningMode) {
    createPlannedStationAt(point);
    return;
  }
  const snap = findNearestRoutePoint(point);
  if (!snap || snap.distancePx > stationSnapPx) {
    showToast("역이 노선에서 너무 멉니다. 확대한 뒤 노선 위를 직접 눌러 주세요.");
    setText(facilityReadout, "노선 위를 터치하세요");
    return;
  }

  pushHistory();
  const connectedRouteIds = [snap.route.id];
  const stationId = createId("station");
  const stationName = createAutomaticStationName(snap.latLng, `Station ${networkState.stations.length + 1}`, stationId);
  const station: Station = {
    id: stationId,
    name: stationName,
    position: [roundCoord(snap.latLng.lat), roundCoord(snap.latLng.lng)],
    demand: estimateStationDemand(snap.latLng, connectedRouteIds.length),
    connectedRouteIds,
    routeNodeIds: connectedRouteIds
      .map((routeId) => findNearestGraphNodeId(networkState.routes.find((route) => route.id === routeId), snap.latLng))
      .filter((id): id is string => Boolean(id)),
  };
  networkState.stations = [...networkState.stations, station];
  if (usesConstructionTimeline()) {
    constructionState.replaceProjects([...constructionState.projects, createStationConstructionProject(station)]);
    applyTutorialConstructionBoost("station", station.id);
  }
  playFeedback("build");
  redoStack = [];
  requestStateSave();
  requestUpdate("network-structure", station.id);
  if (settings.autoStationNaming) {
    setText(facilityReadout, `${station.name} · 주변 지역명으로 자동 지정`);
    void refineAutomaticStationName({ kind: "actual", id: station.id, initialName: station.name });
  }
}

function selectTransferStation(point: L.Point) {
  const plan = planningMode ? getActivePlan(false) : null;
  const actual = findNearestStation(point, 28);
  const planned = plan ? findNearestPlannedStation(point, plan, 28) : null;
  const actualDistance = actual ? point.distanceTo(map.latLngToContainerPoint(L.latLng(actual.position[0], actual.position[1]))) : Number.POSITIVE_INFINITY;
  const plannedDistance = planned ? point.distanceTo(map.latLngToContainerPoint(L.latLng(planned.position[0], planned.position[1]))) : Number.POSITIVE_INFINITY;
  const endpoint: ManualTransferEndpoint | null =
    plannedDistance < actualDistance && planned ? { kind: "planned", id: planned.id } : actual ? { kind: "actual", id: actual.id } : planned ? { kind: "planned", id: planned.id } : null;
  if (!endpoint) {
    setText(facilityReadout, planningMode ? "기존역 또는 계획역을 선택하세요" : "해제할 환승역을 선택하세요");
    return;
  }
  if (!planningMode) {
    if (endpoint.kind === "actual" && actual?.transferGroupId) {
      removeTransferGroup(actual.transferGroupId, actual.id);
    } else if (endpoint.kind === "actual" && actual && actual.connectedRouteIds.length > 1) {
      removeStandaloneMultiRouteStation(actual);
    } else {
      selectedManualTransferEndpoints = [];
      selectedTransferStationIds = [];
      selectedPlannedStationIds = [];
      setText(facilityReadout, "일반역입니다 · 해제할 기존 환승역을 선택하세요");
      showToast("공사 모드에서는 기존 환승 연결 해제만 지원합니다.");
      requestUpdate("network-structure", actual?.id);
    }
    return;
  }
  selectedManualTransferEndpoints = [...selectedManualTransferEndpoints.filter((item) => item.kind !== endpoint.kind || item.id !== endpoint.id), endpoint].slice(-2);
  selectedTransferStationIds = selectedManualTransferEndpoints.filter((item) => item.kind === "actual").map((item) => item.id);
  selectedPlannedStationIds = selectedManualTransferEndpoints.filter((item) => item.kind === "planned").map((item) => item.id);
  const label = endpoint.kind === "actual" ? actual?.name ?? "기존역" : planned?.name ?? "계획역";
  if (selectedManualTransferEndpoints.length < 2) {
    setText(facilityReadout, `${label} 선택 · 연결할 두 번째 역을 선택하세요`);
    requestUpdate("selection", endpoint.kind === "actual" ? endpoint.id : undefined);
    return;
  }

  const actualStationIds = selectedManualTransferEndpoints.filter((item) => item.kind === "actual").map((item) => item.id);
  const plannedStationIds = selectedManualTransferEndpoints.filter((item) => item.kind === "planned").map((item) => item.id);
  pushHistory();
  if (plannedStationIds.length === 0) {
    createTransferGroup(actualStationIds, false);
    showToast("기존역 환승 그룹을 만들었습니다.");
  } else if (plan) {
    const selectedPoints = [
      ...actualStationIds.map((id) => networkState.stations.find((station) => station.id === id)).filter(Boolean).map((station) => L.latLng((station as Station).position[0], (station as Station).position[1])),
      ...plannedStationIds.map((id) => plan.stations.find((station) => station.id === id)).filter(Boolean).map((station) => L.latLng((station as PlannedStation).position[0], (station as PlannedStation).position[1])),
    ];
    const distance = selectedPoints.length === 2 ? map.distance(selectedPoints[0], selectedPoints[1]) : 0;
    const duplicate = plan.transfers.some(
      (transfer) =>
        transfer.stationIds.length === plannedStationIds.length &&
        transfer.actualStationIds?.length === actualStationIds.length &&
        plannedStationIds.every((id) => transfer.stationIds.includes(id)) &&
        actualStationIds.every((id) => transfer.actualStationIds?.includes(id)),
    );
    if (!duplicate)
      updatePlan(plan.id, (item) => ({
        ...item,
        transfers: [...item.transfers, { id: createId("planned-transfer"), stationIds: plannedStationIds, actualStationIds, expectedEffect: Math.round(Math.max(4, 22 - distance / 80)), completed: false }],
      }));
    showToast(duplicate ? "이미 같은 환승 계획이 있습니다." : "환승 계획을 추가했습니다.");
  }
  selectedManualTransferEndpoints = [];
  selectedTransferStationIds = [];
  selectedPlannedStationIds = [];
  redoStack = [];
  requestStateSave();
  requestUpdate("network-structure", actualStationIds[0]);
}

function removeTransferGroup(transferGroupId: string, focusedStationId?: string) {
  const transfer = networkState.transfers.find((item) => item.id === transferGroupId);
  if (!transfer) {
    const staleMemberIds = new Set(
      networkState.stations.filter((station) => station.transferGroupId === transferGroupId).map((station) => station.id),
    );
    if (staleMemberIds.size > 0) {
      pushHistory();
      separateTransferStations(staleMemberIds);
      diagramStateOwner.removeNodes(new Set([`transfer:${transferGroupId}`]));
      redoStack = [];
    }
    cleanupTransferData();
    requestStateSave();
    requestUpdate("network-structure", focusedStationId);
    renderStationManagerIfOpen();
    if (diagramScreen && !diagramScreen.hidden) renderMetroDiagram();
    setText(facilityReadout, "남아 있던 환승 정보를 정리하고 각 노선의 일반역으로 분리했습니다");
    showToast("손상된 환승 연결을 복구하고 일반역으로 분리했습니다.");
    playFeedback("confirm");
    return;
  }

  const memberIds = new Set([
    ...transfer.stationIds,
    ...networkState.stations.filter((station) => station.transferGroupId === transferGroupId).map((station) => station.id),
  ]);
  const members = networkState.stations.filter((station) => memberIds.has(station.id));
  const memberNames = members.map((station) => station.name);
  pushHistory();
  const removedTransferIds = new Set(
    networkState.transfers
      .filter((item) => item.id === transferGroupId || item.stationIds.some((stationId) => memberIds.has(stationId)))
      .map((item) => item.id),
  );
  networkState.transfers = networkState.transfers.filter((item) => !removedTransferIds.has(item.id));
  separateTransferStations(memberIds);
  cleanupTransferData();
  const removedDiagramNodeIds = new Set(Array.from(removedTransferIds, (id) => `transfer:${id}`));
  diagramStateOwner.removeNodes(removedDiagramNodeIds);
  selectedManualTransferEndpoints = [];
  selectedTransferStationIds = [];
  selectedPlannedStationIds = [];
  redoStack = [];
  requestStateSave();
  requestUpdate("network-structure", focusedStationId);
  renderStationManagerIfOpen();
  if (diagramScreen && !diagramScreen.hidden) renderMetroDiagram();
  setText(facilityReadout, "환승 해제 완료 · 각 노선의 역을 개별 일반역으로 전환했습니다");
  showToast(`${memberNames.join(" · ") || "환승역"} 환승을 해제하고 각 노선의 일반역으로 분리했습니다.`);
  playFeedback("confirm");
}

function removeStandaloneMultiRouteStation(station: Station) {
  pushHistory();
  separateTransferStations(new Set([station.id]));
  diagramStateOwner.invalidateNetwork();
  selectedManualTransferEndpoints = [];
  selectedTransferStationIds = [];
  selectedPlannedStationIds = [];
  redoStack = [];
  requestStateSave();
  requestUpdate("network-structure", station.id);
  renderStationManagerIfOpen();
  if (diagramScreen && !diagramScreen.hidden) renderMetroDiagram();
  setText(facilityReadout, "잔존 환승역을 각 노선의 개별 일반역으로 분리했습니다");
  showToast(`${station.name}역의 남아 있던 환승 취급을 해제했습니다.`);
  playFeedback("confirm");
}

function separateTransferStations(memberIds: Set<string>) {
  const members = networkState.stations.filter((station) => memberIds.has(station.id));
  if (members.length === 0) return;

  const routeIds = Array.from(new Set(members.flatMap((station) => station.connectedRouteIds)))
    .filter((routeId) => networkState.routes.some((route) => route.id === routeId));
  const assignedRoutes = new Map<string, string[]>();
  const unusedRouteIds = new Set(routeIds);
  const stationCandidates = members
    .map((station) => ({
      station,
      candidates: station.connectedRouteIds
        .filter((routeId) => unusedRouteIds.has(routeId))
        .map((routeId) => ({
          routeId,
          distance: distanceToCoordinatesMeters(
            L.latLng(station.position[0], station.position[1]),
            networkState.routes.find((route) => route.id === routeId)?.coordinates ?? [],
          ),
        }))
        .sort((a, b) => a.distance - b.distance),
    }))
    .sort((a, b) => a.candidates.length - b.candidates.length);

  for (const { station, candidates } of stationCandidates) {
    const routeId = candidates.find((candidate) => unusedRouteIds.has(candidate.routeId))?.routeId;
    if (!routeId) continue;
    assignedRoutes.set(station.id, [routeId]);
    unusedRouteIds.delete(routeId);
  }
  for (const routeId of unusedRouteIds) {
    const closest = members
      .filter((station) => station.connectedRouteIds.includes(routeId))
      .map((station) => ({
        station,
        distance: distanceToCoordinatesMeters(
          L.latLng(station.position[0], station.position[1]),
          networkState.routes.find((route) => route.id === routeId)?.coordinates ?? [],
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.station;
    if (closest) assignedRoutes.set(closest.id, [...(assignedRoutes.get(closest.id) ?? []), routeId]);
  }

  const splitIds = new Map<string, Array<{ id: string; routeId: string }>>();
  const separatedStations: Station[] = [];
  for (const station of networkState.stations) {
    if (!memberIds.has(station.id)) {
      separatedStations.push(station);
      continue;
    }
    const stationRouteIds = assignedRoutes.get(station.id) ?? station.connectedRouteIds.slice(0, 1);
    const count = Math.max(1, stationRouteIds.length);
    const demandParts = stationRouteIds.map((_, index) =>
      Math.floor(station.demand / count) + (index < station.demand % count ? 1 : 0),
    );
    const replacements = stationRouteIds.map((routeId, index) => {
      const id = index === 0 ? station.id : createId("station");
      const position = count > 1 ? offsetSeparatedStationPosition(station.position, index, count) : station.position;
      const route = networkState.routes.find((item) => item.id === routeId);
      const separated: Station = {
        ...station,
        id,
        position,
        demand: demandParts[index],
        connectedRouteIds: [routeId],
        routeNodeIds: route ? [findNearestGraphNodeId(route, L.latLng(position[0], position[1]))].filter((nodeId): nodeId is string => Boolean(nodeId)) : [],
        transferGroupId: undefined,
      };
      separatedStations.push(separated);
      return { id, routeId };
    });
    splitIds.set(station.id, replacements);
  }
  networkState.stations = separatedStations;

  operationsState.expressConfigs = operationsState.expressConfigs.map((config) => {
    const nextStopIds = config.stopStationIds.flatMap((stationId) => {
      const replacements = splitIds.get(stationId);
      if (!replacements) return [stationId];
      return replacements.filter((item) => item.routeId === config.routeId).map((item) => item.id);
    });
    return { ...config, stopStationIds: Array.from(new Set(nextStopIds)) };
  });
  analysisStateOwner.current = {
    ...analysisStateOwner.current,
    demandHistory: analysisStateOwner.current.demandHistory.map((snapshot) => {
      const stationDemand = { ...snapshot.stationDemand };
      for (const [sourceId, replacements] of splitIds) {
        const sourceDemand = stationDemand[sourceId];
        if (sourceDemand === undefined || replacements.length <= 1) continue;
        delete stationDemand[sourceId];
        replacements.forEach((replacement, index) => {
          stationDemand[replacement.id] =
            Math.floor(sourceDemand / replacements.length) + (index < sourceDemand % replacements.length ? 1 : 0);
        });
      }
      return { ...snapshot, stationDemand };
    }),
  };
}

function offsetSeparatedStationPosition(position: [number, number], index: number, count: number): [number, number] {
  const angle = (Math.PI * 2 * index) / count;
  const distanceM = 10;
  const latitudeOffset = (Math.sin(angle) * distanceM) / 111_320;
  const longitudeScale = Math.max(0.2, Math.cos((position[0] * Math.PI) / 180));
  const longitudeOffset = (Math.cos(angle) * distanceM) / (111_320 * longitudeScale);
  return [roundCoord(position[0] + latitudeOffset), roundCoord(position[1] + longitudeOffset)];
}

function createTransferGroup(stationIds: string[], automatic: boolean) {
  const mutation = buildTransferGroupMutation({
    stationIds,
    automatic,
    stations: networkState.stations,
    transfers: networkState.transfers,
    createId: () => createId("transfer"),
    calculateMetrics: calculateTransferMetrics,
  });
  if (!mutation) return;
  networkState.replace({
    routes: networkState.routes,
    stations: mutation.stations,
    transfers: mutation.transfers,
    depots: networkState.depots,
  });
  renderStationManagerIfOpen();
}

function calculateTransferMetrics(selectedStations: Station[]) {
  const distanceM = calculateTransferDistance(selectedStations);
  const congestion = Math.min(2.4, selectedStations.reduce((sum, station) => sum + station.demand, 0) / 22000);
  const effectiveDistanceM = Math.max(0, distanceM - 10);
  const congestionExposure = Math.min(1, effectiveDistanceM / 140);
  const walkTimeMin = effectiveDistanceM / 80;
  const congestionDelayMin = congestion * 1.1 * congestionExposure;
  const transferTimeMin = Math.round((0.15 + walkTimeMin + congestionDelayMin) * 10) / 10;
  const resistance = Math.round(
    (effectiveDistanceM * 0.025 + transferTimeMin * 8 + congestion * 12 * congestionExposure) * 10,
  ) / 10;
  return { distanceM, congestion, transferTimeMin, resistance };
}

function refreshTransferMetrics() {
  networkState.transfers = networkState.transfers.map((transfer) => {
    const transferStations = transfer.stationIds
      .map((id) => networkState.stations.find((station) => station.id === id))
      .filter(Boolean) as Station[];
    return transferStations.length >= 2 ? { ...transfer, ...calculateTransferMetrics(transferStations) } : transfer;
  });
}

type DiagramNodeInternal = {
  id: string;
  station?: Station;
  sourceStationIds: string[];
  geo: LatLng;
  routeIds: string[];
  terminal: boolean;
  branch: boolean;
  express: boolean;
};

type DiagramPathInternal = {
  id: string;
  route: RouteLine;
  pathIndex: number;
  nodeIds: string[];
  stationIds: string[];
  branch: boolean;
};

type DiagramGraphInternal = {
  nodes: Map<string, DiagramNodeInternal>;
  paths: DiagramPathInternal[];
  adjacency: Map<string, Set<string>>;
};

function openDiagramScreen() {
  if (!diagramScreen) return;
  setTool("pan");
  if (startScreen) startScreen.hidden = true;
  diagramScreen.hidden = false;
  document.body.classList.add("diagram-open");
  renderDiagramControls();
  renderMetroDiagram();
}

function closeDiagramScreen() {
  if (diagramScreen) diagramScreen.hidden = true;
  document.body.classList.remove("diagram-open");
  diagramDrag = null;
}

function renderDiagramControls() {
  const actualRoutes = networkState.routes.filter((route) => route.coordinates.length >= 2);
  if (diagramStateOwner.current.selectedRouteId !== "all" && !actualRoutes.some((route) => route.id === diagramStateOwner.current.selectedRouteId)) {
    diagramStateOwner.selectRoute("all");
  }
  if (diagramRouteFilter) {
    diagramRouteFilter.innerHTML =
      `<option value="all">전체 노선</option>` +
      actualRoutes.map((route) => `<option value="${route.id}">${escapeHtml(route.name)}</option>`).join("");
    diagramRouteFilter.value = diagramStateOwner.current.selectedRouteId;
  }
  if (diagramBackgroundSelect) diagramBackgroundSelect.value = diagramStateOwner.current.background;
  if (diagramLabelsToggle) diagramLabelsToggle.checked = diagramStateOwner.current.showStationNames;
  if (diagramCompanyToggle) diagramCompanyToggle.checked = diagramStateOwner.current.showCompanyInfo;
  setText(diagramCompanyName, getNetworkTitle());
  renderDiagramRouteLegend();
}

function renderDiagramRouteLegend() {
  if (!diagramRouteLegend) return;
  const visibleRoutes = networkState.routes
    .filter((route) => route.coordinates.length >= 2)
    .filter((route) => diagramStateOwner.current.selectedRouteId === "all" || route.id === diagramStateOwner.current.selectedRouteId);
  diagramRouteLegend.innerHTML = visibleRoutes
    .map((route) => `<span><i style="--diagram-route-color:${escapeHtml(route.color)}"></i>${escapeHtml(route.name)}</span>`)
    .join("");
}

function buildDiagramGraph(): DiagramGraphInternal {
  const visibleRoutes = networkState.routes
    .filter((route) => route.coordinates.length >= 2)
    .filter((route) => diagramStateOwner.current.selectedRouteId === "all" || route.id === diagramStateOwner.current.selectedRouteId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const visibleRouteIds = new Set(visibleRoutes.map((route) => route.id));
  const nodes = new Map<string, DiagramNodeInternal>();
  const paths: DiagramPathInternal[] = [];
  const adjacency = new Map<string, Set<string>>();
  const stationToDiagramNode = new Map<string, string>();
  const logicalGroups = new Map<string, Station[]>();
  const visibleStations = networkState.stations
    .filter((station) => station.connectedRouteIds.some((routeId) => visibleRouteIds.has(routeId)))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const station of visibleStations) {
    const key = station.transferGroupId ? `transfer:${station.transferGroupId}` : station.id;
    logicalGroups.set(key, [...(logicalGroups.get(key) ?? []), station]);
    stationToDiagramNode.set(station.id, key);
  }

  for (const [logicalId, members] of logicalGroups) {
    const routeIds = Array.from(new Set(members.flatMap((station) => station.connectedRouteIds)))
      .filter((routeId) => visibleRouteIds.has(routeId))
      .sort();
    const latitude = members.reduce((sum, station) => sum + station.position[0], 0) / members.length;
    const longitude = members.reduce((sum, station) => sum + station.position[1], 0) / members.length;
    const names = Array.from(new Set(members.map((station) => station.name)));
    const representative: Station = {
      ...members[0],
      id: logicalId,
      name: names.join(" · "),
      position: [latitude, longitude],
      demand: members.reduce((sum, station) => sum + station.demand, 0),
      connectedRouteIds: routeIds,
      routeNodeIds: Array.from(new Set(members.flatMap((station) => station.routeNodeIds ?? []))),
      transferGroupId: members.find((station) => station.transferGroupId)?.transferGroupId,
    };
    const express = operationsState.expressConfigs.some(
      (config) => config.enabled && routeIds.includes(config.routeId) && members.some((station) => config.stopStationIds.includes(station.id)),
    );
    const branch = visibleRoutes.some((route) => {
      const junctions = new Set((route.branches ?? []).map((item) => item.junctionNodeId));
      return members.some(
        (station) =>
          station.connectedRouteIds.includes(route.id) &&
          (station.routeNodeIds ?? []).some((nodeId) => junctions.has(nodeId)),
      );
    });
    nodes.set(logicalId, {
      id: logicalId,
      station: representative,
      sourceStationIds: members.map((station) => station.id),
      geo: L.latLng(latitude, longitude),
      routeIds,
      terminal: false,
      branch,
      express,
    });
    adjacency.set(logicalId, new Set());
  }

  for (const route of visibleRoutes) {
    const routePaths = getRoutePaths(route).filter((path) => path.length >= 2);
    const assignments = new Map<number, Array<{ stationId: string; progress: number }>>();
    const routeStations = networkState.stations.filter(
      (station) => station.connectedRouteIds.includes(route.id) && stationToDiagramNode.has(station.id),
    );
    for (const station of routeStations) {
      const stationPoint = L.latLng(...station.position);
      let best: { pathIndex: number; distance: number; progress: number } | null = null;
      for (let pathIndex = 0; pathIndex < routePaths.length; pathIndex += 1) {
        const path = routePaths[pathIndex];
        const result = projectLatLngToDiagramPath(stationPoint, path);
        if (!best || result.distance < best.distance) best = { pathIndex, ...result };
      }
      if (best && best.distance <= 650) {
        const list = assignments.get(best.pathIndex) ?? [];
        list.push({ stationId: stationToDiagramNode.get(station.id)!, progress: best.progress });
        assignments.set(best.pathIndex, list);
      }
    }

    routePaths.forEach((path, pathIndex) => {
      const seenStationIds = new Set<string>();
      const stationIds = (assignments.get(pathIndex) ?? [])
        .sort((a, b) => a.progress - b.progress || a.stationId.localeCompare(b.stationId))
        .filter((item) => {
          if (seenStationIds.has(item.stationId)) return false;
          seenStationIds.add(item.stationId);
          return true;
        })
        .map((item) => item.stationId);
      const startId = `terminal:${route.id}:${pathIndex}:start`;
      const endId = `terminal:${route.id}:${pathIndex}:end`;
      nodes.set(startId, { id: startId, sourceStationIds: [], geo: path[0], routeIds: [route.id], terminal: true, branch: pathIndex > 0, express: false });
      nodes.set(endId, { id: endId, sourceStationIds: [], geo: path[path.length - 1], routeIds: [route.id], terminal: true, branch: pathIndex > 0, express: false });
      adjacency.set(startId, new Set());
      adjacency.set(endId, new Set());
      const nodeIds = [startId, ...stationIds, endId];
      for (let index = 1; index < nodeIds.length; index += 1) {
        adjacency.get(nodeIds[index - 1])?.add(nodeIds[index]);
        adjacency.get(nodeIds[index])?.add(nodeIds[index - 1]);
      }
      paths.push({ id: `${route.id}:${pathIndex}`, route, pathIndex, nodeIds, stationIds, branch: pathIndex > 0 });
    });
  }
  return { nodes, paths, adjacency };
}

function projectLatLngToDiagramPath(point: LatLng, path: LatLng[]) {
  const projectedPoint = map.project(point, 12);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  let traversed = 0;
  let total = 0;
  const lengths: number[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const length = map.project(path[index - 1], 12).distanceTo(map.project(path[index], 12));
    lengths.push(length);
    total += length;
  }
  for (let index = 1; index < path.length; index += 1) {
    const start = map.project(path[index - 1], 12);
    const end = map.project(path[index], 12);
    const projected = projectPointOnSegment(projectedPoint, start, end);
    const distance = projectedPoint.distanceTo(projected.point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = total > 0 ? (traversed + lengths[index - 1] * projected.t) / total : 0;
    }
    traversed += lengths[index - 1];
  }
  return { distance: bestDistance * 30, progress: bestProgress };
}

function buildDiagramPositions(graph: DiagramGraphInternal) {
  const stationNodes = Array.from(graph.nodes.values()).filter((node) => !node.terminal);
  const validStationIds = new Set(stationNodes.map((node) => node.id));
  const positions = new Map<string, DiagramPoint>();
  const occupied: DiagramPoint[] = [];
  for (const node of stationNodes) {
    const saved = diagramStateOwner.current.manualPositions[node.id] ?? diagramStateOwner.current.autoPositions[node.id];
    if (!saved) continue;
    const point = { x: clampNumber(saved.x, 120, diagramWidth - 120), y: clampNumber(saved.y, 100, diagramHeight - 100) };
    positions.set(node.id, point);
    occupied.push(point);
  }

  const sorted = [...stationNodes].sort(
    (a, b) => (graph.adjacency.get(b.id)?.size ?? 0) - (graph.adjacency.get(a.id)?.size ?? 0) || a.id.localeCompare(b.id),
  );
  let componentIndex = 0;
  while (positions.size < stationNodes.length) {
    let placedAny = false;
    for (const node of sorted) {
      if (positions.has(node.id)) continue;
      const placedNeighbor = Array.from(graph.adjacency.get(node.id) ?? [])
        .map((id) => graph.nodes.get(id))
        .find((neighbor) => neighbor && !neighbor.terminal && positions.has(neighbor.id));
      if (!placedNeighbor) continue;
      const origin = positions.get(placedNeighbor.id)!;
      const direction = quantizeDiagramDirection(placedNeighbor.geo, node.geo);
      const proposed = { x: origin.x + direction.x * diagramGrid, y: origin.y + direction.y * diagramGrid };
      const point = resolveDiagramCollision(proposed, occupied, node.id);
      positions.set(node.id, point);
      occupied.push(point);
      placedAny = true;
    }
    if (placedAny) continue;
    const next = sorted.find((node) => !positions.has(node.id));
    if (!next) break;
    const col = componentIndex % 4;
    const row = Math.floor(componentIndex / 4);
    const seed = resolveDiagramCollision({ x: 620 + col * 310, y: 340 + row * 250 }, occupied, next.id);
    positions.set(next.id, seed);
    occupied.push(seed);
    componentIndex += 1;
  }

  const nextAuto: Record<string, DiagramPoint> = {};
  for (const [stationId, point] of positions) if (validStationIds.has(stationId)) nextAuto[stationId] = point;
  diagramStateOwner.updateLayout(
    nextAuto,
    Object.fromEntries(Object.entries(diagramStateOwner.current.manualPositions).filter(([stationId]) => validStationIds.has(stationId))),
    buildDiagramNetworkSignature(graph),
  );

  const allPositions = new Map(positions);
  for (const path of graph.paths) {
    const stationPoints = path.stationIds.map((id) => positions.get(id)).filter(Boolean) as DiagramPoint[];
    if (stationPoints.length > 0) {
      const firstStation = graph.nodes.get(path.stationIds[0])!;
      const lastStation = graph.nodes.get(path.stationIds[path.stationIds.length - 1])!;
      const firstDirection = quantizeDiagramDirection(firstStation.geo, graph.nodes.get(path.nodeIds[0])!.geo);
      const lastDirection = quantizeDiagramDirection(lastStation.geo, graph.nodes.get(path.nodeIds[path.nodeIds.length - 1])!.geo);
      allPositions.set(path.nodeIds[0], resolveDiagramCollision({ x: stationPoints[0].x + firstDirection.x * diagramGrid * 0.82, y: stationPoints[0].y + firstDirection.y * diagramGrid * 0.82 }, Array.from(allPositions.values()), path.nodeIds[0], 36));
      allPositions.set(
        path.nodeIds[path.nodeIds.length - 1],
        resolveDiagramCollision(
          { x: stationPoints[stationPoints.length - 1].x + lastDirection.x * diagramGrid * 0.82, y: stationPoints[stationPoints.length - 1].y + lastDirection.y * diagramGrid * 0.82 },
          Array.from(allPositions.values()),
          path.nodeIds[path.nodeIds.length - 1],
          36,
        ),
      );
    } else {
      const hash = stableHash(path.id);
      const y = 170 + (hash % 7) * 92;
      const x = 240 + ((hash >> 3) % 4) * 120;
      allPositions.set(path.nodeIds[0], { x, y });
      allPositions.set(path.nodeIds[path.nodeIds.length - 1], { x: x + 540, y });
    }
  }
  return allPositions;
}

function quantizeDiagramDirection(from: LatLng, to: LatLng) {
  const dx = (to.lng - from.lng) * Math.cos(((to.lat + from.lat) / 2) * (Math.PI / 180));
  const dy = from.lat - to.lat;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x: 1, y: 0 };
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const directions = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
  ];
  return directions[(sector + 8) % 8];
}

function resolveDiagramCollision(proposed: DiagramPoint, occupied: DiagramPoint[], seed: string, minimum = 58) {
  const directions = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
  ];
  const offset = stableHash(seed) % directions.length;
  for (let ring = 0; ring < 8; ring += 1) {
    for (let index = 0; index < directions.length; index += 1) {
      const direction = directions[(index + offset) % directions.length];
      const point = {
        x: clampNumber(proposed.x + direction.x * ring * diagramGrid, 100, diagramWidth - 100),
        y: clampNumber(proposed.y + direction.y * ring * diagramGrid, 90, diagramHeight - 90),
      };
      if (occupied.every((item) => Math.hypot(item.x - point.x, item.y - point.y) >= minimum)) return point;
    }
  }
  return { x: clampNumber(proposed.x, 100, diagramWidth - 100), y: clampNumber(proposed.y, 90, diagramHeight - 90) };
}

function buildDiagramNetworkSignature(graph: DiagramGraphInternal) {
  return graph.paths
    .map((path) => `${path.id}:${path.nodeIds.join(",")}`)
    .sort()
    .join("|");
}

function renderMetroDiagram() {
  if (!metroDiagramSvg || !diagramBackgroundLayer || !diagramRouteLayer || !diagramStationLayer || !diagramLabelLayer || !diagramCompanyLayer) return;
  const graph = buildDiagramGraph();
  const positions = buildDiagramPositions(graph);
  const hasRoutes = graph.paths.length > 0;
  if (diagramEmptyState) diagramEmptyState.hidden = hasRoutes;
  metroDiagramSvg.toggleAttribute("hidden", !hasRoutes);
  if (diagramScreen) diagramScreen.dataset.background = diagramStateOwner.current.background;
  renderDiagramRouteLegend();
  renderDiagramBackground();
  if (!hasRoutes) {
    metroDiagramSvg.setAttribute("viewBox", `0 0 ${diagramWidth} ${diagramHeight}`);
    diagramRouteLayer.innerHTML = "";
    diagramStationLayer.innerHTML = "";
    diagramLabelLayer.innerHTML = "";
    diagramCompanyLayer.innerHTML = "";
    setText(diagramStatus, "실제 노선 대기");
    return;
  }
  const viewBox = calculateDiagramViewBox(positions);
  metroDiagramSvg.setAttribute("viewBox", `${roundSvg(viewBox.x)} ${roundSvg(viewBox.y)} ${roundSvg(viewBox.width)} ${roundSvg(viewBox.height)}`);

  diagramRouteLayer.innerHTML = graph.paths
    .map((path) => {
      const points = path.nodeIds.map((id) => positions.get(id)).filter(Boolean) as DiagramPoint[];
      const pathData = points.slice(1).map((point, index) => octilinearDiagramPath(points[index], point, `${path.id}:${index}`)).join(" ");
      const start = points[0];
      return `<g class="diagram-route" data-route-id="${path.route.id}">
        <path d="M ${roundSvg(start.x)} ${roundSvg(start.y)} ${pathData}" fill="none" stroke="#ffffff" stroke-width="${path.branch ? 18 : 21}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M ${roundSvg(start.x)} ${roundSvg(start.y)} ${pathData}" fill="none" stroke="${escapeHtml(path.route.color)}" stroke-width="${path.branch ? 10 : 12}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`;
    })
    .join("");

  const visibleStationNodes = Array.from(graph.nodes.values()).filter((node) => !node.terminal);
  const terminals = Array.from(graph.nodes.values()).filter((node) => node.terminal);
  diagramStationLayer.innerHTML =
    terminals
      .map((node) => {
        const point = positions.get(node.id)!;
        const color = getRouteColor(node.routeIds[0]);
        return `<rect class="diagram-terminal" x="${roundSvg(point.x - 8)}" y="${roundSvg(point.y - 8)}" width="16" height="16" rx="2" fill="#ffffff" stroke="${color}" stroke-width="5"/>`;
      })
      .join("") +
    visibleStationNodes.map((node) => renderDiagramStation(node, positions.get(node.id)!)).join("");

  diagramLabelLayer.innerHTML = diagramStateOwner.current.showStationNames ? renderDiagramLabels(visibleStationNodes, positions) : "";
  renderDiagramCompany();
  const transferCount = visibleStationNodes.filter(
    (node) => node.sourceStationIds.length > 1 || node.routeIds.length > 1,
  ).length;
  setText(
    diagramStatus,
    `${graph.paths.length}개 경로 · ${visibleStationNodes.length}개 논리역 · 환승 ${transferCount}개 · 수동 조정 ${Object.keys(diagramStateOwner.current.manualPositions).length}개`,
  );
}

function renderDiagramBackground() {
  if (!diagramBackgroundLayer) return;
  const theme = diagramTheme();
  const gridLines: string[] = [];
  if (diagramStateOwner.current.background === "blueprint") {
    for (let x = 0; x <= diagramWidth; x += 40) gridLines.push(`<path d="M ${x} 0 V ${diagramHeight}" stroke="${theme.grid}" stroke-width="1"/>`);
    for (let y = 0; y <= diagramHeight; y += 40) gridLines.push(`<path d="M 0 ${y} H ${diagramWidth}" stroke="${theme.grid}" stroke-width="1"/>`);
  }
  const river = diagramStateOwner.current.background === "light"
    ? `<path d="M -60 690 C 230 590 405 755 690 677 S 1160 580 1425 655 S 1660 770 1870 650" fill="none" stroke="#d6edf8" stroke-width="34" stroke-linecap="round" opacity=".78"/>`
    : "";
  diagramBackgroundLayer.innerHTML = `<rect width="${diagramWidth}" height="${diagramHeight}" fill="${theme.background}"/>${river}${gridLines.join("")}`;
}

function diagramTheme() {
  if (diagramStateOwner.current.background === "light")
    return { background: "#ffffff", surface: "#ffffff", text: "#161616", muted: "#67727a", label: "rgba(255,255,255,.92)", grid: "rgba(28,51,65,.08)" };
  if (diagramStateOwner.current.background === "blueprint")
    return { background: "#092d48", surface: "#e6f4ff", text: "#eef8ff", muted: "#9fc6dd", label: "rgba(9,45,72,.9)", grid: "rgba(158,208,235,.09)" };
  return { background: "#071116", surface: "#f7fbfc", text: "#edf5f7", muted: "#8fa4ad", label: "rgba(7,17,22,.9)", grid: "rgba(255,255,255,.05)" };
}

function renderDiagramStation(node: DiagramNodeInternal, point: DiagramPoint) {
  const theme = diagramTheme();
  const colors = node.routeIds.map((routeId) => getRouteColor(routeId));
  const transfer = colors.length > 1 || Boolean(node.station?.transferGroupId);
  const signalColors = Array.from(new Set(colors)).slice(0, 4);
  const signalHeight = Math.max(30, 10 + signalColors.length * 11);
  const signalTop = point.y - signalHeight / 2;
  const ringMarkup = transfer
    ? `<rect class="diagram-transfer-signal" x="${roundSvg(point.x - 11)}" y="${roundSvg(signalTop)}" width="22" height="${roundSvg(signalHeight)}" rx="11" fill="#ffffff" stroke="#1b252b" stroke-width="2.5"/>${signalColors.map((color, index) => `<circle cx="${roundSvg(point.x)}" cy="${roundSvg(signalTop + 10 + index * 11)}" r="4.2" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>`).join("")}`
    : `<circle cx="${roundSvg(point.x)}" cy="${roundSvg(point.y)}" r="9" fill="${theme.surface}" stroke="#1b252b" stroke-width="2.5"/>`;
  const expressMarkup = node.express
    ? `<path d="M ${roundSvg(point.x)} ${roundSvg(point.y - 6)} L ${roundSvg(point.x + 6)} ${roundSvg(point.y)} L ${roundSvg(point.x)} ${roundSvg(point.y + 6)} L ${roundSvg(point.x - 6)} ${roundSvg(point.y)} Z" fill="#1b252b"/>`
    : "";
  const branchMarkup = node.branch
    ? `<rect x="${roundSvg(point.x - 25)}" y="${roundSvg(point.y - 25)}" width="50" height="50" rx="10" fill="none" stroke="${theme.muted}" stroke-width="2" stroke-dasharray="5 5"/>`
    : "";
  return `<g class="diagram-station" data-station-id="${node.id}" role="button" tabindex="0" aria-label="${escapeHtml(node.station?.name ?? "역")} 위치 조정">
    ${branchMarkup}${ringMarkup}${expressMarkup}
  </g>`;
}

function renderDiagramLabels(nodes: DiagramNodeInternal[], positions: Map<string, DiagramPoint>) {
  const theme = diagramTheme();
  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  const sorted = [...nodes].sort((a, b) => b.routeIds.length - a.routeIds.length || (a.station?.name ?? "").localeCompare(b.station?.name ?? "") || a.id.localeCompare(b.id));
  return sorted
    .map((node) => {
      const point = positions.get(node.id)!;
      const name = node.station?.name ?? "";
      const width = Math.max(42, Array.from(name).length * 15 + 8);
      const height = 22;
      const candidates = [
        { x: point.x + 24, y: point.y - 15 },
        { x: point.x - width - 24, y: point.y - 15 },
        { x: point.x - width / 2, y: point.y - 48 },
        { x: point.x - width / 2, y: point.y + 22 },
        { x: point.x + 22, y: point.y + 19 },
        { x: point.x - width - 22, y: point.y + 19 },
      ];
      const ranked = candidates
        .map((candidate, index) => ({
          ...candidate,
          index,
          score: placed.reduce((sum, box) => sum + diagramOverlapArea({ ...candidate, width, height }, box), 0),
        }))
        .sort((a, b) => a.score - b.score || a.index - b.index);
      const selected = ranked[0];
      placed.push({ x: selected.x, y: selected.y, width, height });
      return `<g class="diagram-label" pointer-events="none">
        <text x="${roundSvg(selected.x + 4)}" y="${roundSvg(selected.y + 16)}" fill="${theme.text}" font-size="15" font-weight="800" paint-order="stroke" stroke="${theme.label}" stroke-width="5" stroke-linejoin="round">${escapeHtml(name)}</text>
      </g>`;
    })
    .join("");
}

function diagramOverlapArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function renderDiagramCompany() {
  if (!diagramCompanyLayer) return;
  if (!diagramStateOwner.current.showCompanyInfo) {
    diagramCompanyLayer.innerHTML = "";
    return;
  }
  const theme = diagramTheme();
  const title = getNetworkTitle();
  const cityName = cityConfigs[metaState.current.cityId].name;
  const generatedDate = formatDate(Date.now());
  diagramCompanyLayer.innerHTML = `<g transform="translate(80 70)" pointer-events="none">
    <rect width="470" height="104" rx="18" fill="${theme.label}" stroke="${theme.muted}" stroke-width="1"/>
    <text x="24" y="29" fill="${theme.muted}" font-size="12" font-weight="900" letter-spacing="2">NETWORK MAP · ${escapeHtml(cityName)}</text>
    <text x="24" y="59" fill="${theme.text}" font-size="22" font-weight="900">${escapeHtml(title)}</text>
    <text x="24" y="84" fill="${theme.muted}" font-size="13" font-weight="700">${escapeHtml(generatedDate)} · ${networkState.routes.length}개 노선 · ${networkState.stations.length}개 역</text>
  </g>`;
}

function octilinearDiagramPath(from: DiagramPoint, to: DiagramPoint, seed: string) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < 1 || absY < 1 || Math.abs(absX - absY) < 1) return `L ${roundSvg(to.x)} ${roundSvg(to.y)}`;
  const diagonal = Math.min(absX, absY);
  const signX = Math.sign(dx);
  const signY = Math.sign(dy);
  if (stableHash(seed) % 2 === 0) {
    const bend = { x: from.x + signX * (absX - diagonal), y: from.y };
    const diagonalEnd = { x: bend.x + signX * diagonal, y: bend.y + signY * diagonal };
    return `L ${roundSvg(bend.x)} ${roundSvg(bend.y)} L ${roundSvg(diagonalEnd.x)} ${roundSvg(diagonalEnd.y)}`;
  }
  const bend = { x: from.x, y: from.y + signY * (absY - diagonal) };
  const diagonalEnd = { x: bend.x + signX * diagonal, y: bend.y + signY * diagonal };
  return `L ${roundSvg(bend.x)} ${roundSvg(bend.y)} L ${roundSvg(diagonalEnd.x)} ${roundSvg(diagonalEnd.y)}`;
}

function startDiagramStationDrag(event: PointerEvent) {
  const target = (event.target as Element).closest<SVGGElement>(".diagram-station[data-station-id]");
  const stationId = target?.dataset.stationId;
  if (!stationId || !metroDiagramSvg) return;
  event.preventDefault();
  diagramDrag = { stationId, pointerId: event.pointerId };
  metroDiagramSvg.setPointerCapture(event.pointerId);
  document.body.classList.add("diagram-dragging");
}

function moveDiagramStationDrag(event: PointerEvent) {
  if (!diagramDrag || diagramDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const point = diagramClientPoint(event.clientX, event.clientY);
  diagramStateOwner.setManualPosition(diagramDrag.stationId, {
    x: Math.round(clampNumber(point.x, 80, diagramWidth - 80) / 8) * 8,
    y: Math.round(clampNumber(point.y, 70, diagramHeight - 70) / 8) * 8,
  });
  renderMetroDiagram();
}

function finishDiagramStationDrag(event: PointerEvent) {
  if (!diagramDrag || diagramDrag.pointerId !== event.pointerId) return;
  diagramDrag = null;
  document.body.classList.remove("diagram-dragging");
  requestStateSave();
  void saveCurrentSlot("노선도 배치 저장");
}

function diagramClientPoint(clientX: number, clientY: number) {
  if (!metroDiagramSvg) return { x: 0, y: 0 };
  const rect = metroDiagramSvg.getBoundingClientRect();
  const viewBox = metroDiagramSvg.viewBox.baseVal;
  return {
    x: viewBox.x + ((clientX - rect.left) / Math.max(1, rect.width)) * viewBox.width,
    y: viewBox.y + ((clientY - rect.top) / Math.max(1, rect.height)) * viewBox.height,
  };
}

function calculateDiagramViewBox(positions: Map<string, DiagramPoint>) {
  const points = Array.from(positions.values());
  if (diagramStateOwner.current.showCompanyInfo) points.push({ x: 80, y: 70 }, { x: 550, y: 174 });
  const minX = Math.min(...points.map((point) => point.x)) - 110;
  const maxX = Math.max(...points.map((point) => point.x)) + 110;
  const minY = Math.min(...points.map((point) => point.y)) - 90;
  const maxY = Math.max(...points.map((point) => point.y)) + 90;
  let width = Math.max(900, maxX - minX);
  let height = Math.max(506, maxY - minY);
  const aspect = 16 / 9;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  width = Math.min(diagramWidth, width);
  height = Math.min(diagramHeight, height);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: clampNumber(centerX - width / 2, 0, diagramWidth - width),
    y: clampNumber(centerY - height / 2, 0, diagramHeight - height),
    width,
    height,
  };
}

function resetDiagramLayout() {
  diagramStateOwner.resetLayout();
  requestStateSave();
  renderMetroDiagram();
  void saveCurrentSlot("노선도 자동 배치");
  showToast("수동 조정을 지우고 노선도를 다시 배치했습니다.");
}

function saveDiagramSvg() {
  if (!metroDiagramSvg || metroDiagramSvg.hasAttribute("hidden")) return;
  const clone = metroDiagramSvg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(diagramWidth));
  clone.setAttribute("height", String(diagramHeight));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  downloadTextFile(`${safeFilename(getNetworkTitle())}-노선도.svg`, xml, "image/svg+xml");
}

function buildMetroDiagramShareData(): MetroDiagramShareData {
  const graph = buildDiagramGraph();
  const positions = buildDiagramPositions(graph);
  const logicalStationCount = Array.from(graph.nodes.values()).filter((node) => node.station).length;
  const routeMap = new Map<string, DiagramShareRoute>();
  for (const path of graph.paths) {
    const current = routeMap.get(path.route.id);
    const stationIds = Array.from(new Set([...(current?.stationIds ?? []), ...path.stationIds]));
    routeMap.set(path.route.id, { id: path.route.id, name: path.route.name, color: path.route.color, stationIds });
  }
  return {
    kind: "metro-diagram",
    shareId: createId("share-diagram"),
    gameVersion,
    cityDataVersion,
    requiredExtensions: [],
    cityId: metaState.current.cityId,
    generatedAt: Date.now(),
    network: {
      title: getNetworkTitle(),
      cityName: cityConfigs[metaState.current.cityId].name,
      generatedAt: Date.now(),
      routeCount: routeMap.size,
      stationCount: logicalStationCount,
    },
    routes: Array.from(routeMap.values()),
    stations: Array.from(graph.nodes.values())
      .filter((node) => node.station)
      .map((node) => ({
        id: node.id,
        name: node.station!.name,
        routeIds: node.routeIds,
        position: positions.get(node.id)!,
        transfer: node.routeIds.length > 1 || Boolean(node.station!.transferGroupId),
        express: node.express,
      })),
  };
}

function buildRouteDesignShareData(): RouteDesignShareData {
  return {
    kind: "route-design",
    shareId: createId("share-design"),
    gameVersion,
    cityDataVersion,
    requiredExtensions: [],
    cityId: metaState.current.cityId,
    generatedAt: Date.now(),
    plans: JSON.parse(JSON.stringify(constructionState.plans.filter((plan) => plan.cityId === metaState.current.cityId))) as ConstructionPlan[],
  };
}

function buildShareBundle(): GameShareBundle {
  return {
    kind: "draw-gyotong-share",
    shareId: createId("share"),
    gameVersion,
    cityDataVersion,
    requiredExtensions: [],
    diagram: buildMetroDiagramShareData(),
    routeDesign: buildRouteDesignShareData(),
  };
}

function exportShareBundle() {
  const bundle = buildShareBundle();
  downloadTextFile(`${safeFilename(getNetworkTitle())}-공유.json`, JSON.stringify(bundle, null, 2), "application/json");
}

let shareImportInProgress = false;

async function importShareBundle() {
  const file = importShareJsonInput?.files?.[0];
  if (!file || shareImportInProgress) return;
  shareImportInProgress = true;
  const slotId = metaState.current.slotId;
  const cityId = metaState.current.cityId;
  let before: SaveState | undefined;
  let previousActivePlanId = activePlanId;
  let previousUndoStack = undoStack;
  let previousRedoStack = redoStack;
  try {
    if (file.size > maxShareFileBytes) throw new Error("공유 JSON은 20MB 이하만 가져올 수 있습니다.");
    const contents = await file.text();
    if (metaState.current.slotId !== slotId || metaState.current.cityId !== cityId) throw new Error("공유 파일을 읽는 동안 현재 게임이 변경되었습니다. 다시 가져오세요.");
    if (contents.length > maxShareFileBytes) throw new Error("공유 JSON이 너무 큽니다.");
    const parsed: unknown = JSON.parse(contents);
    const validation = validateShareBundle(parsed);
    if (!validation.ok || !validation.bundle) throw new Error(validation.error);
    const bundle = validation.bundle;
    const importedPlans = bundle.routeDesign.plans.map((plan) => cloneImportedPlan(plan));
    const knownStationIds = new Set([...networkState.stations.map((station) => station.id), ...(networkState.transfers ?? []).map((transfer) => `transfer:${transfer.id}`)]);
    const importedPositions = Object.fromEntries(bundle.diagram.stations.filter((station) => knownStationIds.has(station.id)).map((station) => [station.id, station.position]));
    before = cloneState();
    previousActivePlanId = activePlanId;
    previousUndoStack = undoStack;
    previousRedoStack = redoStack;
    diagramStateOwner.mergeManualPositions(importedPositions);
    constructionState.replacePlans([...constructionState.plans, ...importedPlans]);
    activePlanId = importedPlans[0]?.id ?? activePlanId;
    renderMetroDiagram();
    renderPlanningDialog();
    requestUpdate("blueprint-preview");
    await flushStateSave();
    if (metaState.current.slotId !== slotId || metaState.current.cityId !== cityId) return;
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    showToast(`공유 데이터를 가져왔습니다 · 계획 ${importedPlans.length}개`);
  } catch (error) {
    let message = error instanceof Error ? error.message : "공유 JSON을 읽을 수 없습니다.";
    if (before && metaState.current.slotId === slotId && metaState.current.cityId === cityId) {
      // Restore only import-owned domains so elapsed simulation is not rewound.
      constructionState.replacePlans(before.plans ?? []);
      diagramStateOwner.replace(before.diagramState);
      activePlanId = previousActivePlanId;
      undoStack = previousUndoStack;
      redoStack = previousRedoStack;
      requestUpdate("blueprint-preview");
      try { renderMetroDiagram(); renderPlanningDialog(); }
      catch (renderError) { console.error("[share] 화면 복구 실패", renderError); }
      try { await flushStateSave(); }
      catch { message += " 현재 게임은 복구했지만 저장 장치 오류로 복구 상태를 저장하지 못했습니다."; }
    }
    showError(message);
  } finally {
    shareImportInProgress = false;
    if (importShareJsonInput) importShareJsonInput.value = "";
  }
}

function validateShareBundle(value: unknown): { ok: boolean; bundle?: GameShareBundle; error?: string } {
  return validateSharedGameBundle(value, {
    gameVersion, cityDataVersion, cityId: metaState.current.cityId,
    actualRouteIds: new Set(networkState.routes.map((route) => route.id)),
    actualStationIds: new Set(networkState.stations.map((station) => station.id)),
    actualDepotIds: new Set(networkState.depots.map((depot) => depot.id)),
    actualSegments: new Map(networkState.routes.map((route) => [route.id, new Set((route.segments ?? []).map((segment) => segment.id))])),
    actualNodeIds: new Set(networkState.routes.flatMap((route) => (route.nodes ?? []).map((node) => node.id))),
    actualBranchIds: new Set(networkState.routes.flatMap((route) => (route.branches ?? []).map((branch) => branch.id))),
  });
}

function cloneImportedPlan(source: ConstructionPlan) {
  return recalculatePlan(copyConstructionPlan(source, {
    createId, name: `${source.name} · 가져옴`, cityId: metaState.current.cityId, now: Date.now(),
  }));
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(value: string) {
  return (value || "draw-gyotong").replace(/[\\/:*?"<>|]+/g, "-").trim();
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundSvg(value: number) {
  return Math.round(value * 10) / 10;
}

function createPlanRecord(name = `계획 ${constructionState.plans.length + 1}`): ConstructionPlan {
  return {
    id: createId("plan"),
    name,
    cityId: metaState.current.cityId,
    routes: [],
    stations: [],
    depots: [],
    transfers: [],
    expectedTotalCost: 0,
    remainingCost: 0,
    expectedConstructionDays: 0,
    expectedDemand: 0,
    expectedRevenue: 0,
    terrainDifficulty: 0,
    transferEffect: 0,
    createdAt: Date.now(),
    priority: "normal",
    notes: "",
    status: "draft",
  };
}

function normalizePlans(source: ConstructionPlan[]) {
  return source
    .filter((plan) => plan && plan.id && plan.cityId)
    .map((plan) =>
      recalculatePlan({
        ...createPlanRecord(plan.name || "계획"),
        ...plan,
        routes: (plan.routes ?? []).map((route) => ({
          ...route,
          segments: route.segments ?? [],
          completedSegmentIds: route.completedSegmentIds ?? [],
        })),
        stations: plan.stations ?? [],
        depots: plan.depots ?? [],
        transfers: plan.transfers ?? [],
        connections: plan.connections ?? [],
        junctions: plan.junctions ?? [],
        routePlanningDrafts: plan.routePlanningDrafts ?? [],
      }),
    );
}

function getActivePlan(createIfMissing = true) {
  let plan = constructionState.plans.find((item) => item.id === activePlanId && item.cityId === metaState.current.cityId);
  if (!plan) {
    plan = constructionState.plans.find((item) => item.cityId === metaState.current.cityId);
    if (plan) activePlanId = plan.id;
  }
  if (!plan && createIfMissing) {
    plan = createPlanRecord();
    constructionState.replacePlans([...constructionState.plans, plan]);
    activePlanId = plan.id;
  }
  return plan;
}

function updatePlan(planId: string, updater: (plan: ConstructionPlan) => ConstructionPlan) {
  constructionState.replacePlans(updateConstructionPlan(constructionState.plans, planId, updater, recalculatePlan));
}

function getRouteServiceOperations(routeId: string, fleetSource = operationsState.fleets) {
  const route = networkState.routes.find((item) => item.id === routeId);
  const routeStations = networkState.stations.filter((station) => station.connectedRouteIds.includes(routeId) && isStationOperational(station.id));
  const serviceIds = new Set(operationsState.services.filter((service) => service.routeIds.includes(routeId)).map((service) => service.id));
  const routeFleets = fleetSource.filter((fleet) => fleet.serviceId ? serviceIds.has(fleet.serviceId) : fleet.routeId === routeId);
  const express = operationsState.expressConfigs.find((config) => config.routeId === routeId && config.enabled);
  const expressEnabled = Boolean(
    route?.expressServiceEnabled !== false &&
    express &&
    express.stopStationIds.filter((id) => routeStations.some((station) => station.id === id)).length >= 2,
  );
  return calculateServiceOperations({
    routeLengthKm: route?.lengthKm ?? 0,
    routeStationIds: routeStations.map((station) => station.id),
    expressStopStationIds: express?.stopStationIds,
    fleets: routeFleets.map((fleet) => ({
      sets: fleet.sets,
      capacityPerSet: getFleetCapacityPerSet(fleet),
      speedKph: trainCatalog[fleet.trainType].speedKmh,
      trainType: fleet.trainType,
    })),
    servicePathCount: route ? Math.max(1, getTrainServicePaths(route).length) : 1,
    expressEnabled,
    localEnabled: route?.localServiceEnabled !== false,
  });
}

function getCustomServiceOperations(routeId: string, fleetSource = operationsState.fleets) {
  return operationsState.services
    .filter((service) => service.routeIds.includes(routeId))
    .map((service) => ({ service, operation: getOperatingServiceOperation(service, fleetSource) }));
}

function getFleetsServingRoute(routeId: string, fleetSource = operationsState.fleets) {
  const serviceIds = new Set(operationsState.services.filter((service) => service.routeIds.includes(routeId)).map((service) => service.id));
  return fleetSource.filter((fleet) => fleet.serviceId ? serviceIds.has(fleet.serviceId) : fleet.routeId === routeId);
}

/**
 * 계획에 포함된 자산을 기준으로 비용·기간·수요·수익을 다시 집계한다.
 * 계획 자산이 추가/삭제/완공될 때 파생 값을 직접 수정하지 말고 이 함수를 거쳐
 * 요약 수치가 실제 목록과 어긋나지 않게 한다.
 */
function recalculatePlan(plan: ConstructionPlan): ConstructionPlan {
  if (plan.connections) plan = { ...plan, connections: filterValidPlanConnections(plan.routes, plan.connections) };
  const remainingRouteCost = plan.routes.reduce(
    (sum, route) => sum + route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id)).reduce((segmentSum, segment) => segmentSum + segment.constructionCost, 0),
    0,
  );
  const totalRouteCost = plan.routes.reduce((sum, route) => sum + route.segments.reduce((segmentSum, segment) => segmentSum + segment.constructionCost, 0), 0);
  const pendingStations = plan.stations.filter((station) => !station.completed);
  const pendingDepots = plan.depots.filter((depot) => !depot.completed);
  const pendingTransfers = plan.transfers.filter((transfer) => !transfer.completed);
  const pendingConnections = (plan.connections ?? []).filter((connection) => connection.status === "draft" || connection.status === "approved");
  const expectedTotalCost =
    totalRouteCost + plan.stations.length * 180 + plan.depots.reduce((sum, depot) => sum + depot.expectedCost, 0) + plan.transfers.length * 40 + (plan.connections ?? []).reduce((sum, connection) => sum + connection.estimatedCost, 0);
  const remainingCost =
    remainingRouteCost + pendingStations.length * 180 + pendingDepots.reduce((sum, depot) => sum + depot.expectedCost, 0) + pendingTransfers.length * 40 + pendingConnections.reduce((sum, connection) => sum + connection.estimatedCost, 0);
  const expectedConstructionDays = Math.max(
    0,
    ...plan.routes.flatMap((route) =>
      route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id)).map((segment) => segment.constructionDays ?? Math.round(segment.lengthKm * baseConstructionDaysPerKm)),
    ),
    ...pendingDepots.map((depot) => depot.constructionDays),
    ...pendingConnections.map((connection) => connection.estimatedDuration),
  );
  const expectedDemand =
    plan.routes.reduce((sum, route) => sum + route.expectedDemand, 0) +
    pendingStations.reduce((sum, station) => sum + station.expectedDemand, 0);
  const expectedRevenue = plan.routes.reduce((sum, route) => sum + route.expectedRevenue, 0);
  const terrainDifficulty = Math.round(
    plan.routes.reduce(
      (sum, route) =>
        sum +
        route.segments.reduce(
          (segmentSum, segment) =>
            segmentSum + segment.terrainImpact.riverCrossings * 3 + segment.terrainImpact.mountainSegments * 1.5,
          0,
        ),
      0,
    ) * 10,
  ) / 10;
  const transferEffect = Math.round(
    (plan.routes.reduce((sum, route) => sum + route.transferEffect, 0) + pendingTransfers.reduce((sum, transfer) => sum + transfer.expectedEffect, 0)) * 10,
  ) / 10;
  const allRouteSegments = plan.routes.flatMap((route) => route.segments);
  const completedRouteSegments = plan.routes.flatMap((route) => route.completedSegmentIds);
  const totalAssets = allRouteSegments.length + plan.stations.length + plan.depots.length + plan.transfers.length + (plan.connections ?? []).length;
  const completedAssets =
    completedRouteSegments.length +
    plan.stations.filter((station) => station.completed).length +
    plan.depots.filter((depot) => depot.completed).length +
    plan.transfers.filter((transfer) => transfer.completed).length +
    (plan.connections ?? []).filter((connection) => connection.status === "completed").length;
  let status = plan.status;
  if (totalAssets > 0 && completedAssets === totalAssets) status = "completed";
  else if (completedAssets > 0) status = "partial";
  else if (status !== "on-hold" && status !== "review") status = remainingCost > financeState.economy.cash && metaState.current.mode === "career" ? "insufficient" : totalAssets > 0 ? "ready" : "draft";
  return { ...plan, expectedTotalCost, remainingCost, expectedConstructionDays, expectedDemand, expectedRevenue, terrainDifficulty, transferEffect, status };
}

function estimatePlannedRouteDemand(points: LatLng[]) {
  if (points.length < 2) return 0;
  const nearbyDemand = networkState.stations
    .filter((station) => distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), points.map((point) => [point.lat, point.lng])) <= 700)
    .reduce((sum, station) => sum + station.demand * 0.36, 0);
  const center = L.latLng(cityConfigs[metaState.current.cityId].center as [number, number]);
  const midpoint = points[Math.floor(points.length / 2)];
  const centrality = Math.max(0.35, 1.3 - map.distance(center, midpoint) / 35000);
  const lengthKm = calculateLengthKmPrecise(points);
  return Math.round((nearbyDemand + lengthKm * 4800 * centrality) * cityConfigs[metaState.current.cityId].demandMultiplier);
}

function estimatePlannedTransferEffect(points: LatLng[]) {
  const intersectingRoutes = networkState.routes.filter((route) =>
    route.coordinates.some(([lat, lng]) => distanceToCoordinatesMeters(L.latLng(lat, lng), points.map((point) => [point.lat, point.lng])) <= 160),
  ).length;
  return Math.round(intersectingRoutes * 12 + Math.min(25, points.length * 0.8));
}

async function confirmPlanningDraft(draft: ConstructionDraft) {
  const before = cloneState();
  const continuingTool = activeTool;
  try {
    const plan = getActivePlan(true);
    if (!plan) throw new Error("Active plan missing");
    if (draft.kind === "depot") {
      const polygon = draft.polygon;
      if (!polygon) throw new Error("Planned depot polygon missing");
      const areaHa = calculatePolygonAreaHa(polygon);
      const depot: PlannedDepot = {
        id: createId("planned-depot"),
        name: `계획 차량기지 ${plan.depots.length + 1}`,
        polygon: polygon.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
        connectedPlannedRouteIds: draft.connectedPlannedRouteIds ?? [],
        connectedActualRouteIds: draft.connectedRouteIds ?? [],
        expectedCost: draft.analysis.totalCost,
        constructionDays: draft.analysis.durationDays,
        capacity: calculateDepotCapacity(areaHa, 1),
        completed: false,
      };
      updatePlan(plan.id, (item) => ({ ...item, depots: [...item.depots, depot] }));
    } else if (draft.kind === "branch" && draft.planningBranch) {
      const targetRoute = plan.routes.find((route) => route.id === draft.planningBranch?.routeId);
      if (!targetRoute) throw new Error("Planned branch target missing");
      if (targetRoute.completedSegmentIds.length > 0) throw new Error("A partially built planned route cannot be branched");
      const graph = createGraphForDraftPath(draft, createId("node"));
      const branchId = createId("branch");
      const junctionNodeId =
        targetRoute.segments
          .flatMap((segment) => [segment.fromNodeId, segment.toNodeId])
          .find((nodeId) => nodeId) ?? createId("junction");
      const branchDemand = estimatePlannedRouteDemand(draft.points);
      updatePlan(plan.id, (item) => ({
        ...item,
        routes: item.routes.map((route) =>
          route.id === targetRoute.id
            ? {
                ...route,
                segments: [...route.segments, ...graph.segments],
                expectedCost: route.expectedCost + draft.analysis.totalCost,
                constructionDays: Math.max(route.constructionDays, draft.analysis.durationDays),
                expectedDemand: route.expectedDemand + Math.round(branchDemand * 0.65),
                expectedRevenue: route.expectedRevenue + Math.round((branchDemand * financeState.economy.fare * 365 * 0.65) / 100000000),
                transferEffect: route.transferEffect + estimatePlannedTransferEffect(draft.points),
                branches: [
                  ...(route.branches ?? []),
                  { branchId, junctionNodeId, segmentIds: graph.segments.map((segment) => segment.id) },
                ],
              }
            : route,
        ),
      }));
    } else {
      const firstNodeId = createId("node");
      const graph = createGraphForDraftPath(draft, firstNodeId);
      const expectedDemand = estimatePlannedRouteDemand(draft.points);
      const expectedRevenue = Math.round((expectedDemand * financeState.economy.fare * 365) / 100000000);
      const extensionTarget = draft.plannedExtension ? networkState.routes.find((item) => item.id === draft.plannedExtension?.routeId) : undefined;
      const plannedReplacementId = draft.kind === "extension"
        ? null
        : replacingPlannedRouteId ?? draft.plannedRouteExtension?.routeId ?? null;
      const parentBlueprintId = draft.kind === "extension" ? draft.plannedRouteExtension?.routeId : undefined;
      const existingPlannedRoute = plan.routes.find((item) => item.id === (plannedReplacementId ?? parentBlueprintId));
      const plannedRouteId = plannedReplacementId ?? createId("planned-route");
      const rootLineId =
        existingPlannedRoute?.rootLineId ??
        existingPlannedRoute?.targetLineId ??
        draft.plannedExtension?.routeId ??
        plannedRouteId;
      const route: PlannedRoute = {
        id: plannedRouteId,
        name:
          draftRouteName ||
          plan.routes.find((item) => item.id === plannedReplacementId)?.name ||
          extensionTarget?.name ||
          `계획 노선 ${plan.routes.length + 1}`,
        color: extensionTarget?.color ?? existingPlannedRoute?.color ?? selectedColor,
        coordinates: draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
        segments: graph.segments,
        completedSegmentIds: [],
        expectedCost: draft.analysis.totalCost,
        constructionDays: draft.analysis.durationDays,
        expectedDemand,
        expectedRevenue,
        transferEffect: estimatePlannedTransferEffect(draft.points),
        actualExtension: draft.plannedExtension,
        operationKind: draft.kind === "extension" ? "extension" : "new-line",
        rootLineId,
        targetLineId: rootLineId,
        parentBlueprintId,
        extensionAtStart: draft.plannedExtension?.atStart ?? draft.plannedRouteExtension?.atStart,
        branches: existingPlannedRoute?.branches ?? [],
      };
      updatePlan(plan.id, (item) => ({
        ...item,
        routes: plannedReplacementId
          ? item.routes.map((existing) => (existing.id === plannedReplacementId ? route : existing))
          : [...item.routes, route],
      }));
      replacingPlannedRouteId = null;
    }
    metaState.patch({ updatedAt: Date.now() });
    await flushStateSave();
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    constructionDraft = null;
    draftRouteName = "";
    document.body.classList.remove("construction-reviewing");
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    mapLayers.clear("construction-preview");
    requestUpdate("blueprint-preview");
    resumePlanningTool(continuingTool);
    showToast("계획에 저장했습니다. 같은 도구로 계속 작업할 수 있습니다.");
    playFeedback("confirm");
  } catch (error) {
    stateRecoveryCoordinator.recover(before, {
      scope: "partial",
      domains: ["map-blueprints", "map-construction", "map-selection", "hud-finance", "hud-status", "active-panel"],
      rebuildRouter: false,
    });
    constructionDraft = null;
    document.body.classList.remove("construction-reviewing");
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    mapLayers.clear("construction-preview");
    resumePlanningTool(continuingTool);
    showError("계획 저장 중 문제가 발생해 변경을 되돌렸습니다.");
    console.error(error);
  }
}

function resumePlanningTool(tool: ToolMode) {
  if (workspaceMode !== "planning" || tool === "pan") return;
  activeExtension = null;
  activePlanningContinuation = null;
  activePlanningBranch = null;
  activeBranch = null;
  replacingPlannedRouteId = null;
  rawDrawPoints = [];
  mapLayers.clear("construction-preview");
  setTool(tool);
}

function setWorkspaceMode(nextMode: WorkspaceMode) {
  if (constructionDraft) cancelConstructionDraft();
  if (demolitionReview) cancelDemolitionReview();
  workspaceMode = nextMode;
  const shouldPlan = nextMode === "planning";
  planningMode = shouldPlan;
  replacingPlannedRouteId = null;
  if (shouldPlan) getActivePlan(true);
  document.body.dataset.workspaceMode = nextMode;
  document.body.classList.toggle("planning-mode", shouldPlan);
  workspaceModeTabs.forEach((tab) => {
    const active = tab.dataset.workspaceMode === nextMode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  railModeNowButton?.setAttribute("aria-expanded", "false");
  workspaceModeBar?.classList.remove("game-mode-rail--modes-open");
  planningModeButton?.classList.toggle("active", shouldPlan);
  planningModeButton?.setAttribute("aria-pressed", String(shouldPlan));
  const transferToolLabel = transferTool?.querySelector("span");
  if (transferToolLabel) transferToolLabel.textContent = nextMode === "construction" ? "환승 해제" : "환승";
  transferTool?.setAttribute("aria-label", nextMode === "construction" ? "기존 환승역 해제" : "환승 연결");
  eraserTool?.setAttribute("aria-label", shouldPlan ? "계획 시설 범위 삭제" : "건설 시설 범위 철거");
  for (const button of [extendTool, editTool, eraserTool, reconnectTool, branchTool, mergeTool]) {
    if (button) button.disabled = false;
  }
  setTool("pan");
  const modeName: Record<WorkspaceMode, string> = {
    management: "관리 모드",
    planning: "기획 모드",
    construction: "공사 모드",
  };
  hudRenderer.update("mode", modeName[nextMode]);
  hudRenderer.update("tool", modeName[nextMode]);
  const hints: Record<WorkspaceMode, string[]> = {
    management: ["지도를 이동하거나 시설을 선택", "운영·노선 정보를 확인"],
    planning: ["건설 전 설계안을 자유롭게 편집", "설계안은 비용이 차감되지 않음"],
    construction: ["기존 노선 분기·연결 또는 시설 철거", "실제 노선을 선택해 공사 범위와 비용을 검토"],
  };
  setHint(hints[nextMode]);
  requestUpdate("route-style", selectedRouteId ?? undefined);
}

function togglePlanningMode() {
  setWorkspaceMode(workspaceMode === "planning" ? "management" : "planning");
}

function createNewPlan() {
  if (activeTool === "merge") {
    pendingMerge = null;
    closeMergeDialog();
    setTool("pan");
  }
  pushHistory();
  const plan = createPlanRecord();
  constructionState.replacePlans([...constructionState.plans, plan]);
  activePlanId = plan.id;
  redoStack = [];
  requestStateSave();
  renderPlanningDialog();
  requestUpdate("blueprint-preview");
}

function duplicateActivePlan() {
  const source = getActivePlan(false);
  if (!source) return;
  const copy = recalculatePlan(copyConstructionPlan(source, {
    createId, name: `${source.name} 복사본`, cityId: source.cityId, now: Date.now(),
  }));
  pushHistory();
  constructionState.replacePlans([...constructionState.plans, copy]);
  activePlanId = copy.id;
  redoStack = [];
  requestStateSave();
  renderPlanningDialog();
  requestUpdate("blueprint-preview");
}

function deleteActivePlan() {
  const plan = getActivePlan(false);
  if (!plan) return;
  openDecisionDialog(
    `"${plan.name}" 계획과 포함된 예정 노선·시설을 삭제합니다.`,
    "계획 기록은 삭제 후 Undo로 복구할 수 있습니다.",
    "계획 삭제",
    () => {
      pushHistory();
      constructionState.replacePlans(constructionState.plans.filter((item) => item.id !== plan.id));
      activePlanId = constructionState.plans.find((item) => item.cityId === metaState.current.cityId)?.id ?? null;
      redoStack = [];
      requestStateSave();
      renderPlanningDialog();
      requestUpdate("blueprint-preview");
    },
  );
}

function saveActivePlanMetadata() {
  const plan = getActivePlan(false);
  if (!plan) return;
  pushHistory();
  updatePlan(plan.id, (item) => ({
    ...item,
    name: planNameInput?.value.trim() || item.name,
    status: (planStatusSelect?.value as PlanStatus) || item.status,
    priority: (planPrioritySelect?.value as PlanPriority) || item.priority,
    notes: planNotesInput?.value.trim() ?? item.notes,
  }));
  redoStack = [];
  requestStateSave();
  renderPlanningDialog();
  requestUpdate("blueprint-preview");
  showToast("계획 정보를 저장했습니다.");
}

function openPlanningDialog() {
  if (!planningDialog) return;
  getActivePlan(true);
  renderPlanningDialog();
  planningDialog.hidden = false;
}

function closePlanningDialog() {
  if (planningDialog) planningDialog.hidden = true;
}

function renderPlanningDialog() {
  const cityPlans = constructionState.plans.filter((plan) => plan.cityId === metaState.current.cityId);
  if (!activePlanId || !cityPlans.some((plan) => plan.id === activePlanId)) activePlanId = cityPlans[0]?.id ?? null;
  if (activePlanSelect) {
    activePlanSelect.innerHTML = cityPlans.map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`).join("");
    activePlanSelect.value = activePlanId ?? "";
  }
  const plan = getActivePlan(false);
  for (const control of [duplicatePlanButton, deletePlanButton, savePlanButton, convertPlanButton]) if (control) control.disabled = !plan;
  if (!plan) {
    if (planSummary) planSummary.innerHTML = `<div class="planning-empty">새 계획을 만들어 미래 노선을 설계하세요.</div>`;
    if (planAssetList) planAssetList.innerHTML = "";
    renderPlanComparison();
    return;
  }
  if (planNameInput) planNameInput.value = plan.name;
  if (planStatusSelect) planStatusSelect.value = plan.status;
  if (planPrioritySelect) planPrioritySelect.value = plan.priority;
  if (planNotesInput) planNotesInput.value = plan.notes;
  if (planSummary)
    planSummary.innerHTML = `
      <div class="plan-summary-primary"><span>예상 총비용</span><strong>${formatCost(plan.expectedTotalCost)}</strong></div>
      <div><span>남은 건설비</span><strong>${formatCost(plan.remainingCost)}</strong></div>
      <div><span>예상 수요</span><strong>${plan.expectedDemand.toLocaleString("ko-KR")}명</strong></div>
      <div><span>예상 수익</span><strong>${formatCost(plan.expectedRevenue)}/년</strong></div>
      <div><span>공사 기간</span><strong>${plan.expectedConstructionDays > 0 ? formatConstructionDuration(plan.expectedConstructionDays) : "미정"}</strong></div>
      <div><span>지형 난이도</span><strong>${formatPlanDifficulty(plan.terrainDifficulty)}</strong></div>
      <div><span>환승 효과</span><strong>+${plan.transferEffect}</strong></div>`;
  renderPlanAssets(plan);
  renderPlanComparison();
}

function renderPlanAssets(plan: ConstructionPlan) {
  if (!planAssetList) return;
  const routeItems = plan.routes
    .map((route) => {
      const completed = route.completedSegmentIds.length;
      return `<article class="plan-asset-card" data-asset-kind="route">
        <i style="--asset-color:${route.color}"></i>
        <div class="plan-asset-copy"><small>노선</small><strong>${escapeHtml(route.name)}</strong><span>${completed}/${route.segments.length}구간 완공 · ${formatCost(route.expectedCost)} · 수요 ${route.expectedDemand.toLocaleString("ko-KR")}</span></div>
        <div class="asset-actions">
          <button type="button" data-plan-action="redraw-route" data-asset-id="${route.id}">경로 수정</button>
          <button type="button" data-plan-action="duplicate-route" data-asset-id="${route.id}">복제</button>
          <button type="button" data-plan-action="delete-route" data-asset-id="${route.id}">삭제</button>
        </div>
      </article>`;
    })
    .join("");
  const facilities = [
    ...plan.stations.map((station) => `<article class="plan-asset-card facility" data-asset-kind="station"><div class="plan-asset-copy"><small>역</small><strong>${escapeHtml(station.name)}</strong><span>예상 수요 ${station.expectedDemand.toLocaleString("ko-KR")}${station.completed ? " · 완공" : ""}</span></div><button type="button" data-plan-action="delete-station" data-asset-id="${station.id}">삭제</button></article>`),
    ...plan.depots.map((depot) => `<article class="plan-asset-card facility" data-asset-kind="depot"><div class="plan-asset-copy"><small>기지</small><strong>${escapeHtml(depot.name)}</strong><span>${depot.capacity}편성 · ${formatCost(depot.expectedCost)}${depot.completed ? " · 완공" : ""}</span></div><button type="button" data-plan-action="delete-depot" data-asset-id="${depot.id}">삭제</button></article>`),
    ...plan.transfers.map((transfer) => `<article class="plan-asset-card facility" data-asset-kind="transfer"><div class="plan-asset-copy"><small>환승</small><strong>예정 환승 연결</strong><span>환승 효과 +${transfer.expectedEffect}${transfer.completed ? " · 완공" : ""}</span></div><button type="button" data-plan-action="delete-transfer" data-asset-id="${transfer.id}">삭제</button></article>`),
  ].join("");
  planAssetList.innerHTML = routeItems || facilities ? routeItems + facilities : `<div class="planning-empty">계획 모드에서 노선이나 시설을 추가하세요.</div>`;
  planAssetList.querySelectorAll<HTMLButtonElement>("[data-plan-action]").forEach((button) => {
    button.addEventListener("click", () => handlePlanAssetAction(button.dataset.planAction ?? "", button.dataset.assetId ?? ""));
  });
}

function deletePlannedStation(planId: string, stationId: string) {
  const plan = constructionState.plans.find((item) => item.id === planId);
  const station = plan?.stations.find((item) => item.id === stationId && !item.completed);
  if (!plan || !station) return;
  pushHistory();
  updatePlan(plan.id, (item) => ({
    ...item,
    stations: item.stations.filter((asset) => asset.id !== stationId),
    transfers: item.transfers.filter((transfer) => !transfer.stationIds.includes(stationId)),
  }));
  selectedPlannedStationIds = selectedPlannedStationIds.filter((id) => id !== stationId);
  selectedManualTransferEndpoints = selectedManualTransferEndpoints.filter((endpoint) => endpoint.kind !== "planned" || endpoint.id !== stationId);
  redoStack = [];
  requestStateSave();
  renderPlanningDialog();
  requestUpdate("blueprint-preview");
  showToast("계획역을 삭제했습니다.");
}

function handlePlanAssetAction(action: string, assetId: string) {
  const plan = getActivePlan(false);
  if (!plan) return;
  if (action === "redraw-route") {
    replacingPlannedRouteId = assetId;
    closePlanningDialog();
    if (!planningMode) togglePlanningMode();
    setTool("route");
    showToast("지도에서 새 경로를 그리면 기존 계획 노선을 교체합니다.");
    return;
  }
  if (action === "delete-station") {
    deletePlannedStation(plan.id, assetId);
    return;
  }
  pushHistory();
  if (action === "duplicate-route") {
    const route = plan.routes.find((item) => item.id === assetId);
    if (route) {
      const duplicate: PlannedRoute = {
        ...JSON.parse(JSON.stringify(route)),
        id: createId("planned-route"),
        name: `${route.name} 복사본`,
        segments: route.segments.map((segment) => ({ ...segment, id: createId("plan-segment"), fromNodeId: createId("node"), toNodeId: createId("node") })),
        completedSegmentIds: [],
      };
      updatePlan(plan.id, (item) => ({ ...item, routes: [...item.routes, duplicate] }));
    }
  } else if (action.startsWith("delete-")) {
    updatePlan(plan.id, (item) => ({
      ...item,
      routes: action === "delete-route" ? item.routes.filter((asset) => asset.id !== assetId) : item.routes,
      depots: action === "delete-depot" ? item.depots.filter((asset) => asset.id !== assetId) : item.depots,
      transfers: action === "delete-transfer" ? item.transfers.filter((asset) => asset.id !== assetId) : item.transfers,
    }));
  }
  redoStack = [];
  requestStateSave();
  renderPlanningDialog();
  requestUpdate("blueprint-preview");
}

function renderPlanComparison() {
  if (!planComparisonList) return;
  const statusLabels: Record<PlanStatus, string> = {
    draft: "초안",
    review: "검토 중",
    insufficient: "자금 부족",
    ready: "건설 가능",
    partial: "일부 건설",
    completed: "완공",
    "on-hold": "보류",
  };
  planComparisonList.innerHTML = constructionState.plans
    .filter((plan) => plan.cityId === metaState.current.cityId)
    .sort((a, b) => b.expectedDemand - a.expectedDemand)
    .map(
      (plan) => `<button type="button" class="comparison-card status-${plan.status} ${plan.id === activePlanId ? "active" : ""}" data-plan-id="${plan.id}">
        <span class="comparison-card-top"><em>${statusLabels[plan.status]}</em><b>${formatPriority(plan.priority)}</b></span>
        <strong>${escapeHtml(plan.name)}</strong>
        <small>노선 ${plan.routes.length} · 역 ${plan.stations.length} · 기지 ${plan.depots.length} · 환승 ${plan.transfers.length}</small>
        <dl><div><dt>비용</dt><dd>${formatCost(plan.expectedTotalCost)}</dd></div><div><dt>수요</dt><dd>${plan.expectedDemand.toLocaleString("ko-KR")}</dd></div><div><dt>수익</dt><dd>${formatCost(plan.expectedRevenue)}/년</dd></div><div><dt>공기</dt><dd>${plan.expectedConstructionDays > 0 ? formatConstructionDuration(plan.expectedConstructionDays) : "미정"}</dd></div><div><dt>지형</dt><dd>${formatPlanDifficulty(plan.terrainDifficulty)}</dd></div><div><dt>환승</dt><dd>+${plan.transferEffect}</dd></div></dl>
      </button>`,
    )
    .join("");
  planComparisonList.querySelectorAll<HTMLButtonElement>("[data-plan-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activePlanId = button.dataset.planId ?? null;
      renderPlanningDialog();
      requestUpdate("blueprint-preview");
    });
  });
}

function formatPlanDifficulty(value: number) {
  if (value >= 12) return "매우 높음";
  if (value >= 6) return "높음";
  if (value >= 2) return "보통";
  return "낮음";
}

function formatPriority(priority: PlanPriority) {
  return { low: "낮음", normal: "보통", high: "높음", critical: "최우선" }[priority];
}

function createPlannedStationAt(point: L.Point) {
  const plan = getActivePlan(true);
  if (!plan) return;
  const plannedSnap = findNearestPlannedRoutePoint(point, plan);
  const actualSnap = findNearestRoutePoint(point);
  const best =
    plannedSnap && (!actualSnap || plannedSnap.distancePx <= actualSnap.distancePx)
      ? { latLng: plannedSnap.latLng, plannedRouteIds: [plannedSnap.route.id], actualRouteIds: [] as string[], distancePx: plannedSnap.distancePx }
      : actualSnap
        ? { latLng: actualSnap.latLng, plannedRouteIds: [] as string[], actualRouteIds: [actualSnap.route.id], distancePx: actualSnap.distancePx }
        : null;
  if (!best || best.distancePx > stationSnapPx) {
    setText(facilityReadout, "계획 또는 실제 노선 위에 역을 배치하세요.");
    return;
  }
  pushHistory();
  const stationId = createId("planned-station");
  const stationName = createAutomaticStationName(best.latLng, `계획 역 ${plan.stations.length + 1}`, stationId);
  const station: PlannedStation = {
    id: stationId,
    name: stationName,
    position: [roundCoord(best.latLng.lat), roundCoord(best.latLng.lng)],
    plannedRouteIds: best.plannedRouteIds,
    actualRouteIds: best.actualRouteIds,
    expectedDemand: estimateStationDemand(best.latLng, best.plannedRouteIds.length + best.actualRouteIds.length),
    completed: false,
  };
  updatePlan(plan.id, (item) => ({ ...item, stations: [...item.stations, station] }));
  redoStack = [];
  requestStateSave();
  requestUpdate("blueprint-preview");
  showToast(settings.autoStationNaming ? `${station.name} 예정 역을 계획에 추가했습니다.` : "예정 역을 계획에 추가했습니다.");
  if (settings.autoStationNaming) {
    void refineAutomaticStationName({ kind: "planned", id: station.id, planId: plan.id, initialName: station.name });
  }
}

function reconcileBlueprints() {
  const entities: BlueprintRenderEntity[] = [];
  mapLayers.clear("selection");
  for (const plan of constructionState.plans.filter((item) => item.cityId === metaState.current.cityId)) {
    const isActive = plan.id === activePlanId;
    for (const route of plan.routes) {
      const remainingSegments = route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id));
      for (const group of groupContiguousPlanSegments(route, remainingSegments)) {
        const points = group.flatMap((segment, index) => index === 0 ? segment.coordinates : segment.coordinates.slice(1));
        if (points.length < 2) continue;
        entities.push({
          id: `blueprint:route:${plan.id}:${route.id}:${group[0]?.id ?? "empty"}`,
          kind: "route",
          points,
          color: route.color,
          selected: isActive,
          canDelete: planningMode && activeTool === "eraser",
          valid: true,
          name: route.name,
        });
      }
      if (planningMode && (activeTool === "extend" || activeTool === "merge") && isActive && remainingSegments.length > 0) {
        renderExtensionEndpointHandle(L.latLng(...route.coordinates[0]), route.color);
        renderExtensionEndpointHandle(L.latLng(...route.coordinates[route.coordinates.length - 1]), route.color);
      }
    }
    for (const transfer of plan.transfers.filter((item) => !item.completed)) {
      const transferPoints = [
        ...transfer.stationIds.map((id) => plan.stations.find((station) => station.id === id)).filter(Boolean).map((station) => (station as PlannedStation).position),
        ...(transfer.actualStationIds ?? []).map((id) => networkState.stations.find((station) => station.id === id)).filter(Boolean).map((station) => (station as Station).position),
      ];
      if (transferPoints.length === 2) {
        entities.push({
          id: `blueprint:transfer:${plan.id}:${transfer.id}`,
          kind: "transfer",
          points: transferPoints,
          color: "#c8d2d8",
          selected: isActive,
          canDelete: false,
          valid: true,
        });
      }
    }
    for (const station of plan.stations.filter((item) => !item.completed)) {
      const selected = selectedPlannedStationIds.includes(station.id);
      const canDelete = planningMode && activeTool === "eraser";
      entities.push({
        id: `blueprint:station:${plan.id}:${station.id}`,
        kind: "station",
        points: [station.position],
        color: "#56636b",
        selected,
        canDelete,
        valid: station.plannedRouteIds.length + station.actualRouteIds.length > 0,
        name: station.name,
      });
    }
    for (const depot of plan.depots.filter((item) => !item.completed)) {
      const canDelete = planningMode && activeTool === "eraser";
      entities.push({
        id: `blueprint:depot:${plan.id}:${depot.id}`,
        kind: "depot",
        points: depot.polygon,
        color: "#77848b",
        selected: isActive,
        canDelete,
        valid: true,
        name: depot.name,
      });
    }
  }
  blueprintRenderer.reconcileEntities(entities);
  if (planningMode && activeTool === "extend") {
    for (const route of networkState.routes.filter((route) => route.coordinates.length >= 2)) {
      renderExtensionEndpointHandle(L.latLng(...route.coordinates[0]), route.color);
      renderExtensionEndpointHandle(L.latLng(...route.coordinates[route.coordinates.length - 1]), route.color);
    }
  }
}

function renderExtensionEndpointHandle(point: LatLng, color: string) {
  const selectionLayer = mapLayers.get("selection");
  L.circleMarker(point, { radius: 10, color: "#ffffff", weight: 3, fillColor: "#071116", fillOpacity: 0.95, interactive: false }).addTo(selectionLayer);
  L.circleMarker(point, { radius: 5, color, weight: 2, fillColor: color, fillOpacity: 1, interactive: false }).addTo(selectionLayer);
}

function findNearestPlannedRoutePoint(point: L.Point, plan = getActivePlan(false)) {
  if (!plan) return null;
  let best: { route: PlannedRoute; latLng: LatLng; distancePx: number; coordinateIndex: number } | null = null;
  for (const route of plan.routes) {
    for (let index = 1; index < route.coordinates.length; index += 1) {
      const start = map.latLngToContainerPoint(L.latLng(...route.coordinates[index - 1]));
      const end = map.latLngToContainerPoint(L.latLng(...route.coordinates[index]));
      const projected = projectPointOnSegment(point, start, end);
      const distancePx = point.distanceTo(projected.point);
      const coordinateIndex = projected.point.distanceTo(start) <= projected.point.distanceTo(end) ? index - 1 : index;
      if (!best || distancePx < best.distancePx) best = { route, latLng: map.containerPointToLatLng(projected.point), distancePx, coordinateIndex };
    }
  }
  return best;
}

function findNearestPlannedStation(point: L.Point, plan: ConstructionPlan, maxDistancePx: number) {
  let best: { station: PlannedStation; distance: number } | null = null;
  for (const station of plan.stations.filter((item) => !item.completed)) {
    const distance = map.latLngToContainerPoint(L.latLng(...station.position)).distanceTo(point);
    if (distance <= maxDistancePx && (!best || distance < best.distance)) best = { station, distance };
  }
  return best?.station ?? null;
}

function findPlannedRoutesNearPolygon(polygon: LatLng[], maxDistanceM: number) {
  const plan = getActivePlan(false);
  if (!plan) return [];
  return plan.routes
    .filter((route) =>
      route.coordinates.some(([lat, lng]) => polygon.some((point) => map.distance(point, L.latLng(lat, lng)) <= maxDistanceM)),
    )
    .map((route) => route.id);
}

function openPlanConversionDialog() {
  const plan = getActivePlan(false);
  if (!plan || !planConversionDialog || !planConversionItems) return;
  const routeItems: string[] = [];
  const facilityItems: string[] = [];
  for (const route of plan.routes) {
    const remainingSegments = route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id));
    if (remainingSegments.length === 0) continue;
    const routeLength = remainingSegments.reduce((sum, segment) => sum + segment.lengthKm, 0);
    const routeCost = remainingSegments.reduce((sum, segment) => sum + segment.constructionCost, 0);
    routeItems.push(`
      <section class="plan-conversion-route" data-route-id="${route.id}" style="--conversion-route-color:${escapeHtml(route.color)}">
        <label class="plan-conversion-route-toggle">
          <input type="checkbox" checked data-route-toggle="${route.id}" />
          <i aria-hidden="true"></i>
          <span><strong>${escapeHtml(route.name)}</strong><small>${remainingSegments.length}개 구간 · ${routeLength.toFixed(2)}km</small></span>
          <em>${formatCost(routeCost)}</em>
        </label>
        <details>
          <summary><span>구간별 선택</span><small>필요한 구간만 건설</small></summary>
          <div class="plan-conversion-segments">`);
    route.segments.forEach((segment, index) => {
      if (route.completedSegmentIds.includes(segment.id)) return;
      routeItems.push(`<label><input type="checkbox" checked data-convert-kind="segment" data-route-id="${route.id}" data-asset-id="${segment.id}" /><span><strong>${index + 1}구간</strong><small>${segment.lengthKm.toFixed(2)}km</small></span><em>${formatCost(segment.constructionCost)}</em></label>`);
    });
    routeItems.push(`</div></details></section>`);
  }
  for (const station of plan.stations.filter((item) => !item.completed))
    facilityItems.push(`<label class="plan-conversion-facility"><input type="checkbox" checked data-convert-kind="station" data-asset-id="${station.id}" /><i aria-hidden="true">●</i><span><strong>${escapeHtml(station.name)}</strong><small>역 건설 · 연결 노선 ${station.plannedRouteIds.length + station.actualRouteIds.length}개</small></span><em>${formatCost(180)}</em></label>`);
  for (const depot of plan.depots.filter((item) => !item.completed))
    facilityItems.push(`<label class="plan-conversion-facility"><input type="checkbox" checked data-convert-kind="depot" data-asset-id="${depot.id}" /><i aria-hidden="true">▥</i><span><strong>${escapeHtml(depot.name)}</strong><small>차량기지 · ${depot.capacity}편성 수용</small></span><em>${formatCost(depot.expectedCost)}</em></label>`);
  for (const transfer of plan.transfers.filter((item) => !item.completed))
    facilityItems.push(`<label class="plan-conversion-facility"><input type="checkbox" checked data-convert-kind="transfer" data-asset-id="${transfer.id}" /><i aria-hidden="true">⇄</i><span><strong>환승 연결</strong><small>예상 환승 효과 +${transfer.expectedEffect}</small></span><em>${formatCost(40)}</em></label>`);
  for (const connection of (plan.connections ?? []).filter((item) => item.status === "draft" || item.status === "approved"))
    facilityItems.push(`<label class="plan-conversion-facility"><input type="checkbox" checked data-convert-kind="connection" data-asset-id="${connection.id}" /><i aria-hidden="true">↔</i><span><strong>${escapeHtml(connection.connectionType)}</strong><small>연결 설계 · ${formatConstructionDuration(connection.estimatedDuration)}</small></span><em>${formatCost(connection.estimatedCost)}</em></label>`);
  const sections = [
    routeItems.length > 0 ? `<section class="plan-conversion-group"><header><span>01</span><div><strong>노선과 구간</strong><small>전체 노선 또는 세부 구간을 선택합니다.</small></div></header>${routeItems.join("")}</section>` : "",
    facilityItems.length > 0 ? `<section class="plan-conversion-group"><header><span>02</span><div><strong>역·차량기지·환승</strong><small>선택한 노선 구간과 연결되는 시설만 건설할 수 있습니다.</small></div></header><div class="plan-conversion-facilities">${facilityItems.join("")}</div></section>` : "",
  ].filter(Boolean);
  planConversionItems.innerHTML = sections.join("") || `<div class="planning-empty">건설할 미완료 항목이 없습니다.</div>`;
  setText(planConversionPlanName, `${plan.name} · 남은 계획비 ${formatCost(plan.remainingCost)}`);
  setText(planConversionCurrentCash, formatCost(financeState.economy.cash));
  if (selectAllPlanConversionButton) selectAllPlanConversionButton.disabled = sections.length === 0;
  if (clearPlanConversionButton) clearPlanConversionButton.disabled = sections.length === 0;
  planConversionDialog.hidden = false;
  renderPlanConversionSummary();
}

function handlePlanConversionSelectionChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const routeContainer = input.closest<HTMLElement>(".plan-conversion-route");
  if (routeContainer) {
    const routeToggle = routeContainer.querySelector<HTMLInputElement>("input[data-route-toggle]");
    const segmentInputs = Array.from(routeContainer.querySelectorAll<HTMLInputElement>('input[data-convert-kind="segment"]'));
    if (input.dataset.routeToggle) {
      segmentInputs.forEach((segment) => (segment.checked = input.checked));
    } else if (routeToggle) {
      const selectedCount = segmentInputs.filter((segment) => segment.checked).length;
      routeToggle.checked = selectedCount === segmentInputs.length;
      routeToggle.indeterminate = selectedCount > 0 && selectedCount < segmentInputs.length;
    }
  }
  renderPlanConversionSummary();
}

function setAllPlanConversionSelection(checked: boolean) {
  const inputs = Array.from(planConversionItems?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []);
  inputs.forEach((input) => {
    input.checked = checked;
    input.indeterminate = false;
  });
  renderPlanConversionSummary();
  playFeedback("select");
}

function closePlanConversionDialog() {
  if (planConversionDialog) planConversionDialog.hidden = true;
}

function getPlanConversionSelection() {
  return Array.from(planConversionItems?.querySelectorAll<HTMLInputElement>("input[data-convert-kind]:checked") ?? []).map((input) => ({
    kind: input.dataset.convertKind ?? "",
    assetId: input.dataset.assetId ?? "",
    routeId: input.dataset.routeId ?? "",
  }));
}

function calculatePlanConversionCost(plan: ConstructionPlan, selection = getPlanConversionSelection()) {
  return selection.reduce((sum, item) => {
    if (item.kind === "segment") return sum + (plan.routes.find((route) => route.id === item.routeId)?.segments.find((segment) => segment.id === item.assetId)?.constructionCost ?? 0);
    if (item.kind === "station") return sum + 180;
    if (item.kind === "depot") return sum + (plan.depots.find((depot) => depot.id === item.assetId)?.expectedCost ?? 0);
    if (item.kind === "transfer") return sum + 40;
    if (item.kind === "connection") {
      const connection = (plan.connections ?? []).find((candidate) => candidate.id === item.assetId);
      return connection?.status === "draft" || connection?.status === "approved" ? connection.estimatedCost : 0;
    }
    return sum;
  }, 0);
}

function renderPlanConversionSummary() {
  const plan = getActivePlan(false);
  if (!plan || !planConversionSummary) return;
  const selection = getPlanConversionSelection();
  const availableCount = planConversionItems?.querySelectorAll<HTMLInputElement>("input[data-convert-kind]").length ?? 0;
  const segmentCount = selection.filter((item) => item.kind === "segment").length;
  const stationCount = selection.filter((item) => item.kind === "station").length;
  const depotCount = selection.filter((item) => item.kind === "depot").length;
  const transferCount = selection.filter((item) => item.kind === "transfer").length;
  const connectionCount = selection.filter((item) => item.kind === "connection").length;
  const routeCount = new Set(selection.filter((item) => item.kind === "segment").map((item) => item.routeId)).size;
  const cost = calculatePlanConversionCost(plan, selection);
  const shortfall = Math.max(0, cost - financeState.economy.cash);
  const invalidFacilities = selection.filter((entry) => {
    if (entry.kind === "station") {
      const station = plan.stations.find((item) => item.id === entry.assetId);
      return Boolean(station && !isPlannedStationBuildable(plan, station, selection));
    }
    if (entry.kind === "depot") {
      const depot = plan.depots.find((item) => item.id === entry.assetId);
      return Boolean(depot && !isPlannedDepotBuildable(plan, depot, selection));
    }
    if (entry.kind === "transfer") {
      const transfer = plan.transfers.find((item) => item.id === entry.assetId);
      return Boolean(
        transfer &&
          transfer.stationIds.some((stationId) => {
            const station = plan.stations.find((item) => item.id === stationId);
            return station && !station.actualStationId && !selection.some((selected) => selected.kind === "station" && selected.assetId === stationId);
          }),
      );
    }
    return false;
  }).length;
  const affordableSegments = plan.routes
    .flatMap((route) => route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id)))
    .sort((a, b) => a.constructionCost - b.constructionCost)
    .reduce(
      (state, segment) =>
        state.cost + segment.constructionCost <= financeState.economy.cash ? { count: state.count + 1, cost: state.cost + segment.constructionCost } : state,
      { count: 0, cost: 0 },
    );
  const state = selection.length === 0 ? "empty" : invalidFacilities > 0 ? "invalid" : metaState.current.mode === "career" && shortfall > 0 ? "shortfall" : "ready";
  planConversionSummary.dataset.state = state;
  const statusCopy =
    state === "empty"
      ? { kicker: "선택 필요", title: "건설 항목을 선택하세요", message: "왼쪽 목록에서 실제 공사로 전환할 항목을 선택하세요." }
      : state === "invalid"
        ? { kicker: "연결 확인", title: `${invalidFacilities}개 시설을 건설할 수 없음`, message: "해당 시설과 연결되는 노선 구간을 함께 선택하세요." }
        : state === "shortfall"
          ? { kicker: "자금 부족", title: `${formatCost(shortfall)} 부족`, message: `현재 자금으로 저비용 구간 기준 최대 ${affordableSegments.count}개 구간을 건설할 수 있습니다.` }
          : { kicker: "건설 가능", title: "선택 범위를 전환할 수 있습니다", message: "확정하면 선택 항목이 실제 건설 프로젝트로 등록됩니다." };
  planConversionSummary.innerHTML = `
    <header class="conversion-summary-status"><span>${statusCopy.kicker}</span><strong>${statusCopy.title}</strong><p>${statusCopy.message}</p></header>
    <div class="conversion-summary-cost">
      <span>선택 공사비</span>
      <strong>${formatCost(cost)}</strong>
      <small>건설 후 ${formatSignedCost(financeState.economy.cash - cost)}</small>
    </div>
    <div class="conversion-summary-progress">
      <div><span>선택 항목</span><strong>${selection.length}<small> / ${availableCount}</small></strong></div>
      <progress max="${Math.max(1, availableCount)}" value="${selection.length}"></progress>
    </div>
    <dl class="conversion-summary-breakdown">
      <div><dt>대상 노선</dt><dd>${routeCount}개</dd></div>
      <div><dt>노선 구간</dt><dd>${segmentCount}개</dd></div>
      <div><dt>역</dt><dd>${stationCount}개</dd></div>
      <div><dt>차량기지</dt><dd>${depotCount}개</dd></div>
      <div><dt>환승 연결</dt><dd>${transferCount}개</dd></div>
      <div><dt>Connection projects</dt><dd>${connectionCount}</dd></div>
    </dl>`;
  if (confirmPlanConversionButton)
    confirmPlanConversionButton.disabled = selection.length === 0 || invalidFacilities > 0 || (metaState.current.mode === "career" && shortfall > 0);
  const confirmLabel = confirmPlanConversionButton?.querySelector("span:last-child");
  if (confirmLabel) confirmLabel.textContent = selection.length > 0 ? `${selection.length}개 항목 건설 전환` : "건설 항목 선택 필요";
  if (fundPlanWithLoanButton) fundPlanWithLoanButton.hidden = metaState.current.mode !== "career" || shortfall <= 0;
}

function isPlannedStationBuildable(plan: ConstructionPlan, station: PlannedStation, selection: Array<{ kind: string; assetId: string; routeId: string }>) {
  const point = L.latLng(...station.position);
  if (findRoutesNearLatLng(point, 70).length > 0) return true;
  return selection.some((entry) => {
    if (entry.kind !== "segment") return false;
    const segment = plan.routes.find((route) => route.id === entry.routeId)?.segments.find((item) => item.id === entry.assetId);
    return Boolean(segment && distanceToCoordinatesMeters(point, segment.coordinates) <= 70);
  });
}

function isPlannedDepotBuildable(plan: ConstructionPlan, depot: PlannedDepot, selection: Array<{ kind: string; assetId: string; routeId: string }>) {
  const polygon = depot.polygon.map(([lat, lng]) => L.latLng(lat, lng));
  if (findRoutesNearPolygon(polygon, 30).length > 0) return true;
  return selection.some((entry) => {
    if (entry.kind !== "segment") return false;
    const segment = plan.routes.find((route) => route.id === entry.routeId)?.segments.find((item) => item.id === entry.assetId);
    return Boolean(segment && segment.coordinates.some(([lat, lng]) => polygon.some((point) => map.distance(point, L.latLng(lat, lng)) <= 30)));
  });
}

function fundPlanWithLoan() {
  if (metaState.current.mode !== "career") return;
  takeLoan();
  renderPlanConversionSummary();
}

async function confirmPlanConversion() {
  const plan = getActivePlan(false);
  if (!plan || planConversionsInFlight.has(plan.id)) return;
  const selection = getPlanConversionSelection().filter((entry) => {
    if (entry.kind === "segment") {
      const route = plan.routes.find((item) => item.id === entry.routeId);
      return Boolean(route?.segments.some((segment) => segment.id === entry.assetId) && !route.completedSegmentIds.includes(entry.assetId));
    }
    if (entry.kind === "station") return plan.stations.some((item) => item.id === entry.assetId && !item.completed);
    if (entry.kind === "depot") return plan.depots.some((item) => item.id === entry.assetId && !item.completed);
    if (entry.kind === "transfer") return plan.transfers.some((item) => item.id === entry.assetId && !item.completed);
    if (entry.kind === "connection") return (plan.connections ?? []).some((item) => item.id === entry.assetId && (item.status === "draft" || item.status === "approved"));
    return false;
  });
  const cost = calculatePlanConversionCost(plan, selection);
  if (selection.length === 0 || (metaState.current.mode === "career" && cost > financeState.economy.cash)) return;
  const before = cloneState();
  planConversionsInFlight.add(plan.id);
  const createdRouteIds: string[] = [];
  const createdStationIds: string[] = [];
  const createdDepotIds: string[] = [];
  const actualRouteByBlueprint = new Map(plan.routes.flatMap((route) => route.actualRouteId ? [[route.id, route.actualRouteId] as const] : []));
  const constructionProjectByBlueprint = new Map(
    constructionState.projects
      .filter((project) => project.sourcePlanId === plan.id && Boolean(project.blueprintId))
      .map((project) => [project.blueprintId!, project.id]),
  );
  try {
    for (const plannedRoute of plan.routes) {
      const selectedIds = selection.filter((item) => item.kind === "segment" && item.routeId === plannedRoute.id).map((item) => item.assetId);
      if (selectedIds.length === 0) continue;
      if (plannedRoute.parentBlueprintId) {
        if (selectedIds.length !== plannedRoute.segments.length) throw new Error("A chained extension must be built as a complete route.");
        const parent = plan.routes.find((route) => route.id === plannedRoute.parentBlueprintId);
        const parentActualRouteId = actualRouteByBlueprint.get(plannedRoute.parentBlueprintId);
        const targetRoute = parentActualRouteId ? networkState.routes.find((route) => route.id === parentActualRouteId) : undefined;
        if (!parent || !targetRoute) throw new Error(`Parent extension '${plannedRoute.parentBlueprintId}' must be converted first.`);
        const extensionSegments = getPlannedExtensionSegments(plannedRoute, parent);
        const extensionPayload = createLineExtensionPayload(
          targetRoute.id,
          Boolean(plannedRoute.extensionAtStart),
          getPlannedExtensionCoordinates(plannedRoute, parent),
          extensionSegments.reduce((sum, segment) => sum + segment.lengthKm, 0),
          extensionSegments.reduce((sum, segment) => sum + segment.constructionCost, 0),
          extensionSegments.reduce((sum, segment) => sum + segment.terrainImpact.riverCrossings, 0),
          extensionSegments.reduce((sum, segment) => sum + segment.terrainImpact.mountainSegments, 0),
        );
        if (usesConstructionTimeline()) {
          const project = createPendingExtensionProject(
            targetRoute,
            extensionPayload,
            plannedRoute.constructionDays,
            plan.id,
            constructionProjectByBlueprint.get(parent.id),
            plannedRoute.id,
          );
          constructionState.replaceProjects([...constructionState.projects, project]);
          constructionProjectByBlueprint.set(plannedRoute.id, project.id);
        } else {
          applyPendingLineExtension(extensionPayload);
        }
        actualRouteByBlueprint.set(plannedRoute.id, targetRoute.id);
        continue;
      }
      if (plannedRoute.actualExtension) {
        if (selectedIds.length !== plannedRoute.segments.length) {
          throw new Error("An extension plan must be built as a complete route.");
        }
        const targetRoute = networkState.routes.find((route) => route.id === plannedRoute.actualExtension?.routeId);
        if (!targetRoute) throw new Error("Extension target route missing.");
        const extensionLength = plannedRoute.segments.reduce((sum, segment) => sum + segment.lengthKm, 0);
        const extensionCost = plannedRoute.segments.reduce((sum, segment) => sum + segment.constructionCost, 0);
        const extensionRiverCrossings = plannedRoute.segments.reduce((sum, segment) => sum + segment.terrainImpact.riverCrossings, 0);
        const extensionMountainSegments = plannedRoute.segments.reduce((sum, segment) => sum + segment.terrainImpact.mountainSegments, 0);
        const extensionPayload = createLineExtensionPayload(
          targetRoute.id,
          plannedRoute.actualExtension.atStart,
          plannedRoute.coordinates,
          extensionLength,
          extensionCost,
          extensionRiverCrossings,
          extensionMountainSegments,
        );
        if (usesConstructionTimeline()) {
          const project = createPendingExtensionProject(targetRoute, extensionPayload, plannedRoute.constructionDays, plan.id, undefined, plannedRoute.id);
          constructionState.replaceProjects([...constructionState.projects, project]);
          constructionProjectByBlueprint.set(plannedRoute.id, project.id);
        } else {
          applyPendingLineExtension(extensionPayload);
        }
        actualRouteByBlueprint.set(plannedRoute.id, targetRoute.id);
        continue;
      }
      const selectedSegments = plannedRoute.segments.filter((segment) => selectedIds.includes(segment.id) && !plannedRoute.completedSegmentIds.includes(segment.id));
      if (!selectedSegments.length) continue;
      const groups = groupContiguousPlanSegments(plannedRoute, selectedSegments);
      const previous = plannedRoute.actualRouteId ? networkState.routes.find((route) => route.id === plannedRoute.actualRouteId) : undefined;
      if (plannedRoute.actualRouteId && !previous) throw new Error("분할 건설의 기존 노선을 찾을 수 없습니다.");
      const base: RouteLine = previous ?? {
        id: createId("route"), name: plannedRoute.name, color: plannedRoute.color,
        coordinates: [], lengthKm: 0, constructionCost: 0, riverCrossings: 0, mountainSegments: 0,
        riverMode: selectedSegments.some((segment) => segment.constructionMode === "tunnel") ? "tunnel" : "bridge",
        visibility: "public", localServiceEnabled: true, expressServiceEnabled: false, operationPaused: false,
      };
      const actualRoute = previous && usesConstructionTimeline()
        ? previous
        : rebuildRouteGraph(addStagedPlanSegments(base, plannedRoute, selectedSegments.map((segment) => segment.id)));
      networkState.routes = previous
        ? networkState.routes.map((route) => route.id === previous.id ? actualRoute : route)
        : [...networkState.routes, actualRoute];
      if (!previous) createdRouteIds.push(actualRoute.id);
      actualRouteByBlueprint.set(plannedRoute.id, actualRoute.id);
      if (usesConstructionTimeline()) {
        constructionState.replaceProjects([
          ...constructionState.projects,
          ...groups.map((group) => createStagedPlanConstructionProject(plan, plannedRoute, actualRoute, group, Boolean(previous))),
        ]);
      }
    }
    updatePlan(plan.id, (item) => ({
      ...item,
      routes: item.routes.map((route) => ({
        ...route,
        actualRouteId: actualRouteByBlueprint.get(route.id) ?? route.actualRouteId,
        completedSegmentIds: Array.from(new Set([...route.completedSegmentIds, ...selection.filter((entry) => entry.kind === "segment" && entry.routeId === route.id).map((entry) => entry.assetId)])),
      })),
    }));
    const currentPlan = constructionState.plans.find((item) => item.id === plan.id)!;
    for (const entry of selection.filter((item) => item.kind === "station")) {
      const plannedStation = currentPlan.stations.find((station) => station.id === entry.assetId);
      if (!plannedStation || plannedStation.completed) continue;
      const point = L.latLng(...plannedStation.position);
      const plannedTargetRouteIds = currentPlan.routes
        .filter((route) => plannedStation.plannedRouteIds.includes(route.id))
        .map((route) => actualRouteByBlueprint.get(route.id) ?? route.actualRouteId ?? route.actualExtension?.routeId)
        .filter((routeId): routeId is string => Boolean(routeId));
      const intendedRouteIds = Array.from(new Set([
        ...(plannedStation.actualRouteIds ?? []),
        ...plannedTargetRouteIds,
      ])).filter((routeId) => networkState.routes.some((route) => route.id === routeId));
      // Legacy/partial plans may not carry a blueprint-to-route reference.
      // Fall back to one nearest route, never every nearby route, so proximity
      // alone cannot silently create an interchange.
      const connectedRouteIds = intendedRouteIds.length > 0
        ? intendedRouteIds
        : findRoutesNearLatLng(point, 70).slice(0, 1);
      const station: Station = {
        id: createId("station"),
        name: plannedStation.name.replace(/^계획 /, ""),
        position: plannedStation.position,
        demand: plannedStation.expectedDemand,
        connectedRouteIds,
        routeNodeIds: connectedRouteIds.map((routeId) => findNearestGraphNodeId(networkState.routes.find((route) => route.id === routeId), point)).filter((id): id is string => Boolean(id)),
      };
      networkState.stations = [...networkState.stations, station];
      createdStationIds.push(station.id);
      const pendingName = pendingStationNameTargets.get(JSON.stringify([metaState.current.slotId, metaState.current.cityId, plan.id, plannedStation.id]));
      if (pendingName) pendingName.actualStationId = station.id;
      updatePlan(plan.id, (item) => ({ ...item, stations: item.stations.map((planned) => planned.id === plannedStation.id ? { ...planned, completed: true, actualStationId: station.id } : planned) }));
    }
    for (const entry of selection.filter((item) => item.kind === "depot")) {
      const plannedDepot = constructionState.plans.find((item) => item.id === plan.id)?.depots.find((depot) => depot.id === entry.assetId);
      if (!plannedDepot || plannedDepot.completed) continue;
      const polygon = plannedDepot.polygon.map(([lat, lng]) => L.latLng(lat, lng));
      const areaHa = calculatePolygonAreaHa(polygon);
      const depot: Depot = {
        id: createId("depot"),
        name: plannedDepot.name.replace(/^계획 /, ""),
        polygon: plannedDepot.polygon,
        areaHa,
        capacity: plannedDepot.capacity,
        maintenanceCost: calculateDepotMaintenance(areaHa, 1),
        connectedRouteIds: findRoutesNearPolygon(polygon, 30),
        level: 1,
        constructionCost: plannedDepot.expectedCost,
        constructionDays: plannedDepot.constructionDays,
      };
      networkState.depots = [...networkState.depots, depot];
      createdDepotIds.push(depot.id);
      updatePlan(plan.id, (item) => ({ ...item, depots: item.depots.map((planned) => planned.id === plannedDepot.id ? { ...planned, completed: true, actualDepotId: depot.id } : planned) }));
    }
    for (const entry of selection.filter((item) => item.kind === "transfer")) {
      const current = constructionState.plans.find((item) => item.id === plan.id);
      const plannedTransfer = current?.transfers.find((transfer) => transfer.id === entry.assetId);
      if (!plannedTransfer || plannedTransfer.completed) continue;
      const actualStationIds = [
        ...(plannedTransfer.actualStationIds ?? []),
        ...plannedTransfer.stationIds.map((id) => current?.stations.find((station) => station.id === id)?.actualStationId).filter((id): id is string => Boolean(id)),
      ];
      if (actualStationIds.length >= 2) createTransferGroup(actualStationIds, false);
      updatePlan(plan.id, (item) => ({ ...item, transfers: item.transfers.map((transfer) => transfer.id === entry.assetId ? { ...transfer, completed: actualStationIds.length >= 2 } : transfer) }));
    }
    for (const entry of selection.filter((item) => item.kind === "connection")) {
      const current = constructionState.plans.find((item) => item.id === plan.id);
      const connection = current?.connections?.find((item) => item.id === entry.assetId);
      if (!current || !connection || connection.status === "completed") continue;
      if (constructionProjectByBlueprint.has(connection.id)) continue;
      const sourceRouteId = resolveConnectionRouteId(current, connection, "source");
      const targetRouteId = resolveConnectionRouteId(current, connection, "target");
      if (connection.connectionType === "physical-track" && (!sourceRouteId || !targetRouteId)) {
        throw new Error("Physical connection routes must be converted before its construction project is created.");
      }
      const projectId = createId("construction");
      const durationDays = Math.max(1, connection.estimatedDuration);
      const project: ConstructionProject = {
        id: projectId,
        name: `${connection.connectionType} connection`,
        kind: "plan",
        status: usesConstructionTimeline() ? "scheduled" : "opening-ready",
        routeIds: [sourceRouteId, targetRouteId].filter((id): id is string => Boolean(id)),
        stationIds: [],
        depotIds: [],
        coordinates: (connection.coordinates ?? []).map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
        startedDay: analysisStateOwner.current.dayIndex,
        durationDays,
        elapsedDays: usesConstructionTimeline() ? 0 : durationDays,
        expectedCompletionDay: analysisStateOwner.current.dayIndex + durationDays,
        baseCost: connection.estimatedCost,
        additionalCost: 0,
        delayDays: 0,
        events: [],
        sourcePlanId: current.id,
        blueprintId: connection.id,
      };
      let scheduled = connection;
      if (scheduled.status === "draft") scheduled = transitionBlueprint(scheduled, "approved");
      if (scheduled.status === "approved") scheduled = transitionBlueprint(scheduled, "scheduled");
      updatePlan(current.id, (item) => ({
        ...item,
        connections: (item.connections ?? []).map((candidate) => candidate.id === connection.id ? { ...scheduled, projectId } : candidate),
      }));
      constructionState.replaceProjects([...constructionState.projects, project]);
      constructionProjectByBlueprint.set(connection.id, projectId);
      if (!usesConstructionTimeline()) {
        updatePlan(current.id, (item) => ({
          ...item,
          connections: (item.connections ?? []).map((candidate) => candidate.id === connection.id ? advanceConnectionToConstruction(candidate) : candidate),
        }));
        applyCompletedConnectionProject(project);
        constructionState.replaceProjects(constructionState.projects.map((item) => item.id === projectId ? { ...item, status: "operating", openedAtDay: analysisStateOwner.current.dayIndex } : item));
      }
    }
    financeState.economy = { ...financeState.economy, cash: financeState.economy.cash - cost, constructionSpent: financeState.economy.constructionSpent + cost };
    if (usesConstructionTimeline()) {
      constructionState.replaceProjects([
        ...constructionState.projects,
        ...createPlanConstructionProjects(plan, [], createdStationIds, createdDepotIds),
      ]);
      applyTutorialPlanConversionBoost(createdRouteIds, createdStationIds, createdDepotIds);
    }
    constructionState.replacePlans(constructionState.plans.map((item) => item.id === plan.id ? recalculatePlan(item) : item));
    const convertedPlan = constructionState.plans.find((item) => item.id === plan.id);
    const planCompleted = convertedPlan ? isPlanFullyConverted(convertedPlan) : false;
    if (planCompleted) {
      constructionState.replacePlans(constructionState.plans.filter((item) => item.id !== plan.id));
      if (activePlanId === plan.id) activePlanId = null;
    }
    synchronizeGraphReferences();
    metaState.patch({ updatedAt: Date.now() });
    await flushStateSave();
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    closePlanConversionDialog();
    renderPlanningDialog();
    // Converting a plan changes both the real network and the blueprint layer.
    // Refresh them atomically so completed plan dashes cannot remain over the built line.
    requestUpdate("plan-conversion");
    showToast(planCompleted ? "계획 전체를 실제 건설로 전환해 목록에서 정리했습니다." : "선택한 계획 항목을 실제 건설로 전환했습니다.");
    playFeedback("confirm");
  } catch (error) {
    stateRecoveryCoordinator.recover(before, {
      scope: "partial",
      domains: ["network", "routes", "demand", "capacity", "congestion", "map-lines", "map-stations", "map-trains", "map-depots", "map-blueprints", "map-construction", "hud-finance", "hud-status", "active-panel"],
      rebuildRouter: true,
    });
    try {
      await flushStateSave();
    } catch {
      // In-memory rollback remains authoritative.
    }
    showError("계획 전환 중 문제가 발생해 전체 작업을 되돌렸습니다.");
    console.error(error);
  } finally {
    planConversionsInFlight.delete(plan.id);
  }
}

function groupContiguousPlanSegments(route: PlannedRoute, selected: RouteSegment[]) {
  const selectedIds = new Set(selected.map((segment) => segment.id));
  const groups: RouteSegment[][] = [];
  let current: RouteSegment[] = [];
  for (const segment of route.segments) {
    const previous = current.at(-1);
    const previousEnd = previous?.coordinates.at(-1);
    const nextStart = segment.coordinates[0];
    const connectedToCurrent = !previousEnd || !nextStart || coordinatesEqual(previousEnd, nextStart);
    if (selectedIds.has(segment.id) && connectedToCurrent) current.push(segment);
    else if (selectedIds.has(segment.id)) {
      if (current.length > 0) groups.push(current);
      current = [segment];
    }
    else if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function isPlanFullyConverted(plan: ConstructionPlan) {
  return (
    plan.routes.every((route) => route.segments.every((segment) => route.completedSegmentIds.includes(segment.id))) &&
    plan.stations.every((station) => station.completed) &&
    plan.depots.every((depot) => depot.completed) &&
    plan.transfers.every((transfer) => transfer.completed) &&
    (plan.connections ?? []).every((connection) => connection.status === "completed")
  );
}

/**
 * 현재 게임 상태를 지도와 HUD 전체에 반영하는 중앙 렌더 함수.
 * 상태를 변경한 호출자는 개별 화면을 빠뜨리지 않도록 가능하면 이 진입점을 사용한다.
 * selectedId가 있으면 다시 그린 뒤에도 해당 노선의 선택 강조를 유지한다.
 */
function requestUpdate(reason: UpdateReason, selectedId?: string) {
  requestUpdates([reason], selectedId);
}

let updateFrame = 0;
let pendingUpdateSelectedId: string | undefined;

function scheduleUpdateFlush(selectedId?: string) {
  pendingUpdateSelectedId = selectedId ?? pendingUpdateSelectedId;
  if (updateFrame) return;
  updateFrame = requestAnimationFrame(() => {
    updateFrame = 0;
    const target = pendingUpdateSelectedId;
    pendingUpdateSelectedId = undefined;
    flushUpdates(target);
  });
}

function requestUpdates(reasons: readonly UpdateReason[], selectedId?: string) {
  for (const reason of reasons) updateScheduler.mark(reason);
  scheduleUpdateFlush(selectedId);
}

function requestUpdateDomains(domains: readonly UpdateDomain[], selectedId?: string) {
  updateScheduler.markDomains(domains, "clock");
  scheduleUpdateFlush(selectedId);
}

function flushUpdates(selectedId?: string) {
  const domains = new Set<UpdateDomain>(updateScheduler.consume());
  if (domains.size === 0) return;
  try {
    if (selectedRouteId && !networkState.routes.some((route) => route.id === selectedRouteId)) selectedRouteId = null;
    if (selectedId && networkState.routes.some((route) => route.id === selectedId)) selectedRouteId = selectedId;
    document.body.classList.toggle("has-network", networkState.routes.length > 0);
    document.body.classList.toggle("has-route-selection", Boolean(selectedRouteId));
    document.body.dataset.activeTool = activeTool;
    if (domains.has("network")) refreshTransferMetrics();
    if (domains.has("demand") || domains.has("congestion")) measureTask("demand", ensureDemandSimulation);
    if (domains.has("network") || domains.has("routes") || domains.has("capacity")) updateOperationRouteOptions();
    if (domains.has("routes") || domains.has("map-lines") || domains.has("map-selection")) {
      measureTask("map-entities", () => reconcileMapLines(selectedRouteId ?? selectedId));
    }
    if (domains.has("map-construction")) reconcileConstructionProjects();
    if (domains.has("map-blueprints")) {
      reconcileBlueprints();
      renderConstructionDraftMap();
    }
    if (domains.has("map-depots")) reconcileMapDepots(selectedId);
    if (domains.has("map-stations")) reconcileMapStations(selectedId);
    if (domains.has("map-trains")) measureTask("trains", reconcileMapTrains);
    if (domains.has("map-lod")) {
      updateLod();
    }
    if (domains.has("hud-clock")) updateGameClockHud();
    if (domains.has("hud-finance")) updateEconomyHud();
    if (domains.has("hud-status")) {
      measureTask("hud", () => updateHud(selectedRouteId ?? selectedId));
      updateOperationHud();
    }
    if (domains.has("notifications")) {
      updateAnalysisBadge();
      updateConstructionBadge();
      updateNewsBadge();
    }
    if (domains.has("workflow")) updateTutorialProgress();
    if (domains.has("active-panel")) {
      updateSelectedLinePanel();
      renderStationManagerIfOpen();
      if (selectedDepotManagerId && depotManagerDialog && !depotManagerDialog.hidden) renderDepotManager();
      if (trainManagerDialog && !trainManagerDialog.hidden) renderTrainManager();
      if (statisticsScreen && !statisticsScreen.hidden) renderStatisticsScreen();
      refreshOperationSuggestions();
    }
  } finally {
    updateScheduler.finishFlush();
    if (updateScheduler.hasPending && !updateFrame) requestUpdates([]);
  }
}

function renderAll(selectedId?: string) {
  updateScheduler.mark("full");
  flushUpdates(selectedId);
}

function renderStartScreen() {
  renderCityOptions();
  if (!slotList) return;
  if (slotSummaries.length === 0) {
    slotList.innerHTML = `<div class="empty-slot"><span>📭 저장된 세이브 슬롯이 없습니다</span><small>위 옵션에서 새 세이브를 생성하여 관제를 시작하세요.</small></div>`;
    if (continueButton) continueButton.disabled = true;
    return;
  }
  if (continueButton) continueButton.disabled = false;
  slotList.innerHTML = slotSummaries
    .map((slot) => {
      const city = cityConfigs[slot.cityId] || { name: "도시" };
      const mode = slot.mode === "sandbox" ? "샌드박스" : "커리어";
      const diffLabel = difficultyConfigs[slot.difficulty]?.label || "보통";
      return `
        <article class="slot-entry">
          <button class="slot-card" data-slot-id="${slot.slotId}" type="button">
            <div class="slot-card-main">
              <div class="slot-title-row">
                <strong class="slot-name">${escapeHtml(slot.slotName)}</strong>
                <div class="slot-badges">
                  <span class="slot-tag city-tag">${city.name}</span>
                  <span class="slot-tag mode-tag">${mode}</span>
                  <span class="slot-tag diff-tag">${diffLabel}</span>
                  ${slot.bankrupt ? `<span class="slot-tag bankrupt-tag">파산</span>` : ""}
                </div>
              </div>
              <div class="slot-meta-row">
                <span>노선 ${slot.routeCount}개</span>
                <span>역 ${slot.stationCount}개</span>
                <span>⏱ ${formatPlayTime(slot.playTimeSeconds)}</span>
              </div>
            </div>
            <div class="slot-card-finance">
              <em class="slot-cash">${formatSignedCost(slot.cash)}</em>
              <small class="slot-date">${formatDate(slot.updatedAt)} 저장</small>
            </div>
          </button>
          <div class="slot-entry-actions">
            <button class="slot-edit-button" data-edit-slot-id="${slot.slotId}" type="button" aria-label="${escapeHtml(`${slot.slotName} 세이브 수정`)}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button class="slot-delete-button" data-delete-slot-id="${slot.slotId}" data-slot-name="${escapeHtml(slot.slotName)}" type="button" aria-label="${escapeHtml(`${slot.slotName} 세이브 삭제`)}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </article>
      `;
    })
    .join("");
  slotList.querySelectorAll<HTMLButtonElement>(".slot-card").forEach((button) => {
    button.addEventListener("click", () => loadSlot(button.dataset.slotId || ""));
  });
  slotList.querySelectorAll<HTMLButtonElement>(".slot-edit-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void openSaveEditor(button.dataset.editSlotId || "");
    });
  });
  slotList.querySelectorAll<HTMLButtonElement>(".slot-delete-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      requestSaveSlotDeletion(button.dataset.deleteSlotId || "", button.dataset.slotName || "이 세이브");
    });
  });
}

async function openSaveEditor(slotId: string) {
  if (!slotId || !saveEditorDialog) return;
  try {
    if (isActiveSaveSlot(slotId)) await flushStateSave();
    const state = await readSaveSlot(slotId);
    if (!state?.meta) throw new Error("Save metadata is missing");
    editingSaveSlotId = slotId;
    if (saveEditorNameInput) saveEditorNameInput.value = state.meta.slotName;
    if (saveEditorModeSelect) saveEditorModeSelect.value = state.meta.mode;
    if (saveEditorDifficultySelect) saveEditorDifficultySelect.value = state.meta.difficulty;
    if (saveEditorNetworkTitleInput) saveEditorNetworkTitleInput.value = state.meta.networkTitle ?? "";
    setText(saveEditorCityReadout, cityConfigs[state.meta.cityId]?.name ?? "알 수 없는 도시");
    if (saveEditorError) saveEditorError.hidden = true;
    saveEditorDialog.hidden = false;
    requestAnimationFrame(() => {
      saveEditorNameInput?.focus();
      saveEditorNameInput?.select();
    });
  } catch (error) {
    console.error(error);
    showError("세이브 정보를 불러오지 못했습니다. 저장 공간 상태를 확인한 뒤 다시 시도해 주세요.");
  }
}

function closeSaveEditor() {
  if (saveEditorDialog) saveEditorDialog.hidden = true;
  editingSaveSlotId = null;
  if (saveEditorError) saveEditorError.hidden = true;
}

async function saveEditedSlot() {
  const slotId = editingSaveSlotId;
  const slotName = saveEditorNameInput?.value.trim() ?? "";
  if (!slotId || !saveEditorForm) return;
  if (!slotName) {
    if (saveEditorError) {
      setText(saveEditorError, "세이브 이름을 입력해 주세요.");
      saveEditorError.hidden = false;
    }
    saveEditorNameInput?.focus();
    return;
  }

  const mode: GameMode = saveEditorModeSelect?.value === "career" ? "career" : "sandbox";
  const difficultyValue = saveEditorDifficultySelect?.value;
  const difficulty: Difficulty = difficultyValue === "easy" || difficultyValue === "hard" ? difficultyValue : "normal";
  const networkTitle = saveEditorNetworkTitleInput?.value.trim() ?? "";
  if (submitSaveEditorButton) submitSaveEditorButton.disabled = true;
  try {
    await persistEditedSlot({ slotId, slotName, mode, difficulty, networkTitle }, {
      isActiveSlot: isActiveSaveSlot,
      flushActiveSlot: flushStateSave,
      readSlot: async (requestedSlotId) => {
        const state = await readSaveSlot(requestedSlotId);
        return state?.meta ? { state, meta: state.meta } : null;
      },
      buildMeta: (meta, input, updatedAt): GameMeta => ({
        ...meta,
        slotName: input.slotName,
        mode: input.mode,
        difficulty: input.difficulty,
        networkTitle: input.networkTitle || undefined,
        unlockedCityIds: input.mode === "sandbox" ? (Object.keys(cityConfigs) as CityId[]) : meta.unlockedCityIds,
        updatedAt,
      }),
      updateSlot: async (state, meta) => { await saveFacade.update({ ...state, meta }); },
      applyActiveMeta: (nextMeta) => {
        metaState.replace({ ...metaState.current, ...nextMeta });
        renderAll();
      },
      refreshSlots: async () => { slotSummaries = await listSaveSlots(); },
      refreshViews: () => {
        renderStartScreen();
        renderInGameSlotList();
      },
      setStatus: (status) => setText(saveStatus, status),
      closeEditor: closeSaveEditor,
      notifySuccess: () => {
        showToast("세이브 이름과 설정을 변경했습니다.");
        playFeedback("confirm");
      },
    });
  } catch (error) {
    console.error(error);
    if (saveEditorError) {
      setText(saveEditorError, "변경사항을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      saveEditorError.hidden = false;
    }
  } finally {
    if (submitSaveEditorButton) submitSaveEditorButton.disabled = false;
  }
}

function requestSaveSlotDeletion(slotId: string, slotName: string) {
  if (!slotId) return;
  const isActiveSlot = isActiveSaveSlot(slotId);
  openDecisionDialog(
    `“${slotName}” 세이브를 삭제할까요?`,
    isActiveSlot
      ? "현재 플레이 중인 세이브입니다. 노선, 계획, 시설, 운영 기록을 삭제하고 시작 화면으로 돌아갑니다. 삭제 후 복구할 수 없습니다."
      : "노선, 계획, 시설, 운영 기록을 포함한 이 세이브는 삭제 후 복구할 수 없습니다.",
    "세이브 삭제",
    () => void deleteSaveSlot(slotId),
  );
}

async function deleteSaveSlot(slotId: string) {
  const deletesActiveSlot = isActiveSaveSlot(slotId);
  if (deletesActiveSlot) {
    hasActiveGameSession = false;
    if (autoSaveTimer) window.clearInterval(autoSaveTimer);
    autoSaveTimer = 0;
    saveFacade.cancel();
  }
  try {
    await saveFacade.remove(slotId);

    if (deletesActiveSlot && metaState.current.slotId === slotId) {
      localRecoveryStore.clear();
      if (autoSaveTimer) window.clearInterval(autoSaveTimer);
      autoSaveTimer = 0;
      hasActiveGameSession = false;
      resetWorld();
      metaState.reset(createDefaultMeta());
      if (startScreen) startScreen.hidden = false;
      renderAll();
    }

    slotSummaries = await listSaveSlots();
    renderStartScreen();
    showToast("세이브를 삭제했습니다.");
    playFeedback("confirm");
  } catch (error) {
    if (deletesActiveSlot && metaState.current.slotId === slotId) {
      hasActiveGameSession = true;
      startAutoSave();
    }
    showError("세이브를 삭제하지 못했습니다. 저장 공간 상태를 확인한 뒤 다시 시도해 주세요.");
    console.error(error);
  }
}

function renderCityOptions() {
  if (!citySelect) return;
  const selectedMode = (modeSelect?.value as GameMode) || "sandbox";
  const unlocked = selectedMode === "sandbox" ? (Object.keys(cityConfigs) as CityId[]) : getUnlockedCityIds();
  const current = (citySelect.value as CityId) || "seoul";
  const cityIds = Object.keys(cityConfigs) as CityId[];
  citySelect.innerHTML = cityIds
    .map((cityId) => {
      const locked = !unlocked.includes(cityId);
      return `<option value="${cityId}" ${locked ? "disabled" : ""}>${cityConfigs[cityId].name}${locked ? " 잠김" : ""}</option>`;
    })
    .join("");
  citySelect.value = unlocked.includes(current) ? current : "seoul";
  const cityPresentation: Record<CityId, { code: string; accent: string; landmark: string }> = {
    seoul: { code: "SEO", accent: "#4ce0c3", landmark: "수도권" },
    busan: { code: "BSN", accent: "#4f9bff", landmark: "해안 도시" },
    daejeon: { code: "DJN", accent: "#f3ca52", landmark: "중부 거점" },
    gwangju: { code: "GWJ", accent: "#c477ff", landmark: "남부 도시" },
  };
  if (cityPicker) {
    cityPicker.innerHTML = cityIds.map((cityId) => {
      const city = cityConfigs[cityId];
      const presentation = cityPresentation[cityId];
      const locked = !unlocked.includes(cityId);
      const selected = cityId === citySelect.value;
      const demand = city.demandMultiplier >= 1.2 ? "수요 높음" : city.demandMultiplier <= 0.85 ? "수요 낮음" : "수요 보통";
      const cost = city.constructionMultiplier > 1 ? "공사비 높음" : city.constructionMultiplier < 1 ? "공사비 절감" : "공사비 보통";
      return `<button type="button" class="city-option-card${selected ? " selected" : ""}${locked ? " locked" : ""}" data-city-id="${cityId}" role="radio" aria-checked="${selected}" ${locked ? "disabled" : ""} style="--city-card-accent:${presentation.accent}">
        <span class="city-option-mark">${presentation.code}</span>
        <span class="city-option-main"><strong>${city.name}</strong><small>${presentation.landmark}</small></span>
        <span class="city-option-stats"><em>${demand}</em><em>${cost}</em></span>
        ${locked ? "<i class=\"city-option-lock\" aria-label=\"잠김\">🔒</i>" : "<i class=\"city-option-check\" aria-hidden=\"true\">✓</i>"}
      </button>`;
    }).join("");
  }
  updateCityNote();
}

function updateCityNote() {
  const cityId = ((citySelect?.value as CityId) || "seoul");
  setText(cityNote, `${cityConfigs[cityId].name}: ${cityConfigs[cityId].description}`);
  cityPicker?.querySelectorAll<HTMLButtonElement>("[data-city-id]").forEach((card) => {
    const selected = card.dataset.cityId === cityId;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-checked", String(selected));
  });
}

function getUnlockedCityIds() {
  const unlocked = new Set<CityId>(["seoul"]);
  for (const slot of slotSummaries) slot.unlockedCityIds.forEach((cityId) => unlocked.add(cityId));
  if (financeState.economy.cash >= 85000) unlocked.add("daejeon");
  if (financeState.economy.cash >= 130000) unlocked.add("gwangju");
  if (financeState.economy.cash >= 180000) unlocked.add("busan");
  return Array.from(unlocked);
}

async function createNewGame(mode: GameMode, difficulty: Difficulty, cityId: CityId, slotName: string) {
  resetWorld();
  hasActiveGameSession = true;
  const now = Date.now();
  metaState.replace({
    slotId: createId("slot"),
    slotName: slotName.trim() || `${cityConfigs[cityId].name} 계획`,
    mode,
    difficulty,
    cityId,
    unlockedCityIds: mode === "sandbox" ? (Object.keys(cityConfigs) as CityId[]) : ["seoul"],
    createdAt: now,
    updatedAt: now,
    bankrupt: false,
    playTimeSeconds: 0,
    tutorialStep: 0,
    tutorialCompleted: false,
    tutorialProgress: createTutorialProgress(),
  });
  financeState.economy = {
    ...defaultEconomy,
    cash: mode === "sandbox" ? 999999999 : difficultyConfigs[difficulty].startCash,
  };
  updateEconomyHud();
  newsEventState.replace([createNewsEvent(0)]);
  applyCityMapConstraints(cityId);
  if (newGameButton) newGameButton.disabled = true;
  const saved = await saveCurrentSlot("새 세이브", false, true);
  if (newGameButton) newGameButton.disabled = false;
  if (startScreen) startScreen.hidden = true;
  startAutoSave();
  requestUpdate("blueprint-preview");
  if (!saved) {
    setText(saveStatus, "저장 비활성");
    showToast("게임은 시작했지만 현재 브라우저에 저장할 수 없습니다. 저장 권한과 여유 공간을 확인해 주세요.");
  }
}

function resetWorld() {
  cancelActiveDrawing();
  constructionDraft = null;
  demolitionReview = null;
  routePlanningController.reset();
  pendingBranchJunction = null;
  activeConnectionSource = null;
  pendingMerge = null;
  pendingDecision = null;
  replacingPlannedRouteId = null;
  selectedConnectionChoice = "merge";
  selectedColor = routeColors[0];
  draftRouteName = "";
  operatingServiceDraftPreset = "all";
  networkState.reset();
  demandState.reset();
  demandRuntimeCache.invalidate();
  transitRouterCache.invalidate();
  congestionRuntimeState.reset();
  constructionState.reset();
  diagramStateOwner.reset();
  analysisStateOwner.current = { ...defaultAnalysisState, demandHistory: [], suggestions: [], decisions: {} };
  financeState.reset({ ...defaultEconomy }, { ...defaultStatisticsState, dailyRecords: [] });
  newsEventState.reset();
  operationsState.reset();
  loanState.reset();
  undoStack = [];
  redoStack = [];
  selectedOperationRouteId = "";
  selectedRouteId = null;
  activePlanId = null;
  planningMode = false;
  selectedDepotId = null;
  selectedDepotManagerId = null;
  selectedStationManagerId = null;
  selectedOperatingServiceId = null;
  editingOperatingServiceId = null;
  selectedTrainFleetId = null;
  selectedTrainSetNumber = null;
  selectedTransferStationIds = [];
  selectedPlannedStationIds = [];
  selectedManualTransferEndpoints = [];
  deleteAnchor = null;
  plannedDeleteAnchor = null;
  simSpeed = 0;
  gameLoopController.setSpeed(0);
  gameLoopController.pause();
  syncSpeedControls();
  simulationRuntimeState.reset(360);
}

function closeSlotScopedSurfaces() {
  closeInGameMenu();
  closePlanningDialog();
  closePlanConversionDialog();
  closeConstructionManager();
  closeDecisionDialog();
  closeMergeDialog();
  closeLineManager();
  closeTrainManagerModal();
  closeStationManager();
  closeDepotManager();
  if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
  if (routeSettingsCard) routeSettingsCard.hidden = true;
  document.body.classList.remove("construction-reviewing");
  mapLayers.clear("construction-preview");
  mapLayers.clear("edit-guide");
}

async function loadSlot(slotId: string) {
  if (!slotId) return;
  const requestId = ++slotLoadRequestId;
  const previousState = hasActiveGameSession ? cloneState() : null;
  const previousWorkspaceMode = workspaceMode;
  let replacedCurrentSession = false;
  try {
    if (hasActiveGameSession) await flushStateSave();
    if (requestId !== slotLoadRequestId) return;
    const state = await readSaveSlot(slotId);
    if (requestId !== slotLoadRequestId || !state) return;

    saveFacade.cancel();
    closeSlotScopedSurfaces();
    resetWorld();
    replacedCurrentSession = true;
    applyState(state);
    hasActiveGameSession = true;
    metaState.replace({ ...createDefaultMeta(), ...(state.meta ?? {}), slotId });
    setWorkspaceMode("management");
    updateEconomyHud();
    applyCityMapConstraints(metaState.current.cityId);
    if (startScreen) startScreen.hidden = true;
    if (tutorialPanel) tutorialPanel.hidden = Boolean(metaState.current.tutorialCompleted);
    if (!metaState.current.tutorialCompleted) updateTutorialProgress();
    startAutoSave();
    renderAll();
    requestStateSave();
    setText(saveStatus, "불러옴");
  } catch (error) {
    if (replacedCurrentSession && previousState) {
      try {
        resetWorld();
        applyState(previousState);
        hasActiveGameSession = true;
        setWorkspaceMode(previousWorkspaceMode);
        applyCityMapConstraints(metaState.current.cityId);
        startAutoSave();
        renderAll();
      } catch (recoveryError) {
        console.error("[save] 이전 슬롯 복구 실패", recoveryError);
      }
    }
    console.error("[save] 슬롯 불러오기 실패", error);
    showError("세이브를 불러오지 못했습니다. 현재 게임은 변경되지 않았습니다.");
  }
}

async function saveCurrentSlot(label: string, reportError = true, createOnly = false): Promise<boolean> {
  if (!hasActiveGameSession) return false;
  const slotId = metaState.current.slotId;
  metaState.replace({
    ...metaState.current,
    updatedAt: Date.now(),
    unlockedCityIds: metaState.current.mode === "sandbox" ? (Object.keys(cityConfigs) as CityId[]) : getUnlockedCityIds(),
  });
  try {
    if (createOnly) {
      const state = cloneState();
      await saveFacade.create(state);
    } else {
      await saveFacade.flush();
    }
    slotSummaries = await listSaveSlots();
    if (!hasActiveGameSession || metaState.current.slotId !== slotId) return false;
    setText(saveStatus, label);
    return true;
  } catch (error) {
    console.error("[save] 슬롯 저장 실패", error);
    setText(saveStatus, "저장 실패");
    const storageErrors = error instanceof AggregateError ? error.errors : [error];
    const storageNames = storageErrors.map((cause) =>
      cause instanceof DOMException
        ? cause.name
        : cause instanceof Error
          ? cause.name
          : "UnknownError",
    );
    const storageReason =
      storageErrors.some((cause) => cause instanceof DOMException && cause.name === "QuotaExceededError")
        ? `브라우저 저장 공간이 가득 찼습니다. 오래된 세이브를 삭제해 주세요. (${storageNames.join(" / ")})`
        : `IndexedDB와 로컬 백업에 모두 저장하지 못했습니다. 시크릿 모드·사이트 저장 권한을 확인해 주세요. (${storageNames.join(" / ")})`;
    if (reportError) showError(storageReason);
    return false;
  }
}

function startAutoSave() {
  if (autoSaveTimer) window.clearInterval(autoSaveTimer);
  autoSaveTimer = 0;
  if (!hasActiveGameSession || !settings.autoSaveEnabled) return;
  autoSaveTimer = window.setInterval(() => void saveCurrentSlot("자동 저장"), settings.autoSaveIntervalSeconds * 1000);
}

function isActiveSaveSlot(slotId: string) {
  return hasActiveGameSession && slotId === metaState.current.slotId;
}

function createDefaultMeta(): GameMeta {
  const now = Date.now();
  return {
    slotId: "legacy",
    slotName: "서울 계획",
    mode: "career",
    difficulty: "normal",
    cityId: "seoul",
    unlockedCityIds: ["seoul"],
    createdAt: now,
    updatedAt: now,
    bankrupt: false,
    playTimeSeconds: 0,
    tutorialStep: 0,
    tutorialCompleted: false,
    tutorialProgress: createTutorialProgress(),
  };
}

function migrateGameSave(input: unknown): SaveState {
  return migrateSaveStateRecord<SaveState>(input, {
    defaultEconomy,
    completedTutorialStep: tutorialSteps.length - 1,
  });
}

function getSaveSlotService() {
  saveSlotServiceInstance ??= createSaveSlotService<SaveState>({
    databaseName: "draw-gyotong-saves",
    version: saveDatabaseVersion,
    storeName: "slots",
    keyPath: "meta.slotId",
    migrate: migrateGameSave,
  }, {
    storage: localStorage,
    key: fallbackSaveKey,
    migrate: migrateGameSave,
    maxEntries: 2,
  });
  return saveSlotServiceInstance;
}

async function readSaveSlot(slotId: string): Promise<SaveState | null> {
  return saveFacade.load(slotId);
}

async function listSaveSlots(): Promise<SaveSlotSummary[]> {
  return (await saveFacade.list())
    .filter((state) => state.meta)
    .map((state) => ({
      slotId: state.meta!.slotId,
      slotName: state.meta!.slotName,
      mode: state.meta!.mode,
      difficulty: state.meta!.difficulty,
      cityId: state.meta!.cityId,
      cash: state.economy?.cash ?? 0,
      unlockedCityIds: state.meta!.unlockedCityIds,
      updatedAt: state.meta!.updatedAt,
      createdAt: state.meta!.createdAt,
      networkTitle: state.meta!.networkTitle,
      playTimeSeconds: state.meta!.playTimeSeconds ?? 0,
      bankrupt: state.meta!.bankrupt,
      routeCount: state.routes?.length ?? 0,
      stationCount: state.stations?.length ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function hasRouteGaps(route: RouteLine) {
  return (route.disabledSegments?.length ?? 0) > 0;
}

function getRoutePaths(route: RouteLine) {
  return getRoutePathCoordinates(route).map((path) => path.map(([lat, lng]) => L.latLng(lat, lng)));
}

function reconcileMapLines(selectedId?: string) {
  const lod = getLodMode(map.getZoom());
  const entities: LineRenderEntity[] = networkState.routes.map((route) => ({
    id: route.id,
    paths: getRoutePathCoordinates(route),
    color: route.color,
    selected: route.id === selectedId,
    underConstruction: !isRouteOperational(route.id),
    planning: route.visibility === "planning",
    paused: Boolean(route.operationPaused),
    lod,
  }));
  lineRenderer.reconcileEntities(entities);
}

function reconcileConstructionProjects() {
  constructionRenderer.reconcileEntities(buildConstructionRenderEntities(constructionState.projects));
}

function reconcileMapStations(selectedId?: string) {
  mapLayers.setVisible("stations", map.getZoom() >= 13);
  const connectionEntities: TransferConnectionEntity[] = networkState.transfers.flatMap((transfer) => {
    const transferStations = transfer.stationIds
      .map((id) => networkState.stations.find((station) => station.id === id))
      .filter(Boolean) as Station[];
    const transferInfo = transferStations[0] ? selectStationTransferInfo(transferStations[0].id) : null;
    return transferStations.length < 2 || !transferInfo?.isTransfer
      ? []
      : [{ id: `transfer:${transfer.id}`, positions: transferStations.map((station) => station.position) }];
  });
  const stationEntities: StationRenderEntity[] = networkState.stations.map((station) => {
    const isSelected = station.id === selectedId || selectedTransferStationIds.includes(station.id);
    const expressConfig = operationsState.expressConfigs.find((config) => config.routeId === selectedOperationRouteId);
    const isExpressStop = Boolean(expressConfig?.enabled && expressConfig.stopStationIds.includes(station.id));
    const transferInfo = selectStationTransferInfo(station.id);
    const isTransferStation = Boolean(transferInfo?.isTransfer);
    const routeColor = transferInfo?.connectedLines[0]?.color
      ?? networkState.routes.find((route) => route.id === station.connectedRouteIds[0])?.color
      ?? "#ffffff";
    return {
      id: station.id,
      name: station.name,
      position: station.position,
      color: routeColor,
      selected: isSelected,
      express: isExpressStop,
      transfer: isTransferStation,
      operational: isStationOperational(station.id),
      showLabel: isSelected || map.getZoom() >= 15,
    };
  });
  stationRenderer.reconcileEntities(stationEntities, connectionEntities);
}

function reconcileMapDepots(selectedId?: string) {
  depotRenderer.reconcileEntities(buildDepotRenderEntities(networkState.depots, {
    selectedId,
    selectedDepotId,
    isOperational: isDepotOperational,
  }));
}

function reconcileMapTrains() {
  mapLayers.setVisible("trains", map.getZoom() >= 14);
  if (performance.now() < trainInteractionLockedUntil) return;

  const trainEntities: TrainRenderEntity[] = [];
  const maxVisiblePerService = settings.performanceMode === "battery" ? 8 : 18;
  for (const service of operationsState.services) {
    const ownerRoute = networkState.routes.find((route) => route.id === service.ownerRouteId);
    const serviceRoutes = service.routeIds
      .map((id) => networkState.routes.find((route) => route.id === id))
      .filter((route): route is RouteLine => Boolean(route));
    if (!ownerRoute || serviceRoutes.length !== service.routeIds.length) continue;
    if (serviceRoutes.some((route) => !isRouteOperational(route.id) || hasRouteGaps(route) || route.operationPaused || route.visibility === "planning")) continue;

    const operation = getOperatingServiceOperation(service);
    const displayedFleetSets = operationsState.fleets
      .filter((fleet) => fleet.serviceId === service.id)
      .flatMap((fleet) => Array.from({ length: fleet.sets }, (_, setIndex) => ({ fleet, setNumber: setIndex + 1 })));
    const totalSets = displayedFleetSets.length;
    if (!operation.enabled || totalSets === 0 || service.pathCoordinates.length < 2) continue;

    const displaySets = Math.min(totalSets, maxVisiblePerService);
    const routePoints = service.pathCoordinates.map(([lat, lng]) => L.latLng(lat, lng));
    const stopPositions = operation.stopStationIds
      .map((stationId) => networkState.stations.find((station) => station.id === stationId))
      .filter((station): station is Station => Boolean(station))
      .map((station) => L.latLng(station.position[0], station.position[1]));
    for (let index = 0; index < displaySets; index += 1) {
      const displayedTrain = displayedFleetSets[index];
      if (!displayedTrain) continue;
      const progressBase = (simulationRuntimeState.clockMinutes % Math.max(operation.roundTripMin, 12)) / Math.max(operation.roundTripMin, 12);
      const progress = (progressBase + index / displaySets) % 1;
      const travelProgress = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
      const position = interpolateAlongRoute(routePoints, travelProgress);
      const nearStation = stopPositions.some((stationPosition) => map.distance(position, stationPosition) <= 35);
      const key = `${service.id}:${displayedTrain.fleet.id}:${displayedTrain.setNumber}`;
      trainHitTargets.set(key, {
        key,
        routeId: ownerRoute.id,
        fleetId: displayedTrain.fleet.id,
        setNumber: displayedTrain.setNumber,
        label: `${service.name} ${displayedTrain.setNumber}편성`,
        position: [position.lat, position.lng],
      });
      trainEntities.push({
        id: key,
        position: [position.lat, position.lng],
        color: ownerRoute.color,
        serviceKind: "local",
        label: `${service.name} ${displayedTrain.setNumber}편성 열차`,
        title: `${service.name} · ${displayedTrain.fleet.cars}량 ${displayedTrain.setNumber}편성`,
        state: progress < 0.02 || Math.abs(progress - 0.5) < 0.02 ? "turning" : nearStation ? "stopped" : "running",
      });
    }
  }
  const visibleKeys = new Set(trainEntities.map((entity) => entity.id));
  trainRenderer.reconcileEntities(trainEntities);
  for (const key of trainHitTargets.keys()) {
    if (!visibleKeys.has(key)) trainHitTargets.delete(key);
  }
}

function reconcileLegacyMapTrains() {
  void reconcileLegacyMapTrains;
  mapLayers.setVisible("trains", map.getZoom() >= 14);
  if (performance.now() < trainInteractionLockedUntil) return;

  const trainEntities: TrainRenderEntity[] = [];
  const maxVisiblePerRoute = settings.performanceMode === "battery" ? 8 : 18;
  for (const route of networkState.routes) {
    if (!isRouteOperational(route.id) || hasRouteGaps(route) || route.operationPaused || route.visibility === "planning") continue;
    const routeFleets = operationsState.fleets.filter((fleet) => fleet.routeId === route.id);
    const serviceOperations = getRouteServiceOperations(route.id);
    const hasExpressFleet = routeFleets.some((fleet) => fleet.trainType === "express");
    let genericSetOrdinal = 0;
    const displayedFleetSets = routeFleets.flatMap((fleet) =>
      Array.from({ length: fleet.sets }, (_, setIndex) => {
        const explicitExpress = fleet.trainType === "express";
        const fallbackExpress = !hasExpressFleet &&
          serviceOperations.express.enabled &&
          genericSetOrdinal < serviceOperations.express.trainSets;
        if (!explicitExpress) genericSetOrdinal += 1;
        return {
          fleet,
          setNumber: setIndex + 1,
          serviceKind: (explicitExpress || fallbackExpress ? "express" : "local") as TransitServiceKind,
        };
      }),
    );
    const totalSets = displayedFleetSets.length;
    if (totalSets === 0 || route.coordinates.length < 2) continue;

    const displaySets = Math.min(totalSets, maxVisiblePerRoute);
    const routePaths = getTrainServicePaths(route);
    for (let index = 0; index < displaySets; index += 1) {
      const displayedTrain = displayedFleetSets[index];
      if (!displayedTrain) continue;
      const serviceKind = displayedTrain.serviceKind;
      const operation = serviceKind === "express" ? serviceOperations.express : serviceOperations.local;
      if (!operation.enabled) continue;
      const cycleMinutes = Math.max(operation.headwayMin * Math.max(1, operation.trainSets), 12);
      const progressBase = (simulationRuntimeState.clockMinutes % cycleMinutes) / cycleMinutes;
      const key = `${route.id}:${displayedTrain.fleet.id}:${displayedTrain.setNumber}`;
      const progress = (progressBase + index / displaySets) % 1;
      const routePoints = routePaths[index % routePaths.length];
      const travelProgress = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
      const position = interpolateAlongRoute(routePoints, travelProgress);
      const stopPositions = operation.stopStationIds
        .map((stationId) => networkState.stations.find((station) => station.id === stationId))
        .filter((station): station is Station => Boolean(station))
        .map((station) => L.latLng(station.position[0], station.position[1]));
      const nearStation = stopPositions.some((stationPosition) => map.distance(position, stationPosition) <= 35);
      trainHitTargets.set(key, {
        key,
        routeId: route.id,
        fleetId: displayedTrain.fleet.id,
        setNumber: displayedTrain.setNumber,
        label: `${route.name} ${displayedTrain.setNumber}편성`,
        position: [position.lat, position.lng],
      });
      trainEntities.push({
        id: key,
        position: [position.lat, position.lng],
        color: route.color,
        serviceKind,
        label: `${route.name} ${displayedTrain.setNumber}편성 열차`,
        title: `${route.name} · ${displayedTrain.fleet.cars}량 ${displayedTrain.setNumber}편성`,
        state: progress < 0.02 || Math.abs(progress - 0.5) < 0.02 ? "turning" : nearStation ? "stopped" : "running",
      });
    }
  }
  const visibleKeys = new Set(trainEntities.map((entity) => entity.id));
  trainRenderer.reconcileEntities(trainEntities);
  for (const key of trainHitTargets.keys()) {
    if (!visibleKeys.has(key)) trainHitTargets.delete(key);
  }
}



function getTrainServicePaths(route: RouteLine) {
  const trunk = route.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
  const paths: LatLng[][] = [trunk];
  for (const branch of route.branches ?? []) {
    const junction = route.nodes?.find((node) => node.id === branch.junctionNodeId);
    const segment = route.segments?.find((item) => branch.segmentIds.includes(item.id) && item.enabled);
    if (!junction || !segment) continue;
    const junctionLatLng = L.latLng(junction.position[0], junction.position[1]);
    const nearestIndex = findNearestCoordinateIndex(route.coordinates, junctionLatLng);
    const prefix = trunk.slice(0, nearestIndex + 1);
    const branchPoints = segment.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
    paths.push([...prefix, junctionLatLng, ...branchPoints.slice(1)]);
  }
  return paths.filter((path) => path.length > 1);
}

type OperatingServicePathOption = {
  id: string;
  label: string;
  routeIds: string[];
  branchIds: string[];
  points: LatLng[];
  stationIds: string[];
};

function serviceStationsAlongPath(points: LatLng[], routeIds: string[]) {
  return networkState.stations
    .filter((station) => station.connectedRouteIds.some((routeId) => routeIds.includes(routeId)))
    .map((station) => ({ station, projection: projectLatLngToDiagramPath(L.latLng(...station.position), points) }))
    .filter((entry) => entry.projection.distance <= 650)
    .sort((a, b) => a.projection.progress - b.projection.progress)
    .map((entry) => entry.station.id)
    .filter((id, index, source) => source.indexOf(id) === index);
}

function orientPathToStation(points: LatLng[], station: Station, stationAtEnd: boolean) {
  const stationPoint = L.latLng(...station.position);
  const firstDistance = map.distance(points[0], stationPoint);
  const lastDistance = map.distance(points[points.length - 1], stationPoint);
  const currentlyAtEnd = lastDistance <= firstDistance;
  return currentlyAtEnd === stationAtEnd ? [...points] : [...points].reverse();
}

function trimPathToConnectionStation(points: LatLng[], station: Station, stationAtEnd: boolean) {
  const stationPoint = L.latLng(...station.position);
  const nearestIndex = points.reduce(
    (best, point, index) => map.distance(point, stationPoint) < best.distance ? { index, distance: map.distance(point, stationPoint) } : best,
    { index: 0, distance: Number.POSITIVE_INFINITY },
  ).index;
  const left = [...points.slice(0, nearestIndex), stationPoint];
  const right = [stationPoint, ...points.slice(nearestIndex + 1)];
  const selected = polylineLengthMeters(left.map((point) => [point.lat, point.lng] as [number, number])) >=
    polylineLengthMeters(right.map((point) => [point.lat, point.lng] as [number, number]))
    ? left
    : right;
  return orientPathToStation(selected, station, stationAtEnd);
}

function getOperatingServicePathOptions(ownerRouteId: string): OperatingServicePathOption[] {
  const route = networkState.routes.find((item) => item.id === ownerRouteId);
  if (!route) return [];
  const options: OperatingServicePathOption[] = getTrainServicePaths(route).map((points, index) => {
    const branch = index > 0 ? route.branches?.[index - 1] : undefined;
    return {
      id: `${route.id}:${branch?.id ?? "trunk"}`,
      label: branch ? `${branch.name || `분기 ${index}`} 방향` : "본선 전체",
      routeIds: [route.id],
      branchIds: branch ? [branch.id] : [],
      points,
      stationIds: serviceStationsAlongPath(points, [route.id]),
    };
  });

  const physicalConnections = constructionState.plans
    .flatMap((plan) => plan.connections ?? [])
    .filter((connection) =>
      connection.status === "completed" && connection.appliedAt && connection.connectionType === "physical-track" &&
      (connection.sourceLineId === ownerRouteId || connection.targetLineId === ownerRouteId),
    );
  for (const connection of physicalConnections) {
    const ownerIsSource = connection.sourceLineId === ownerRouteId;
    const otherRouteId = ownerIsSource ? connection.targetLineId : connection.sourceLineId;
    const ownerStationId = ownerIsSource ? connection.sourceStationId : connection.targetStationId;
    const otherStationId = ownerIsSource ? connection.targetStationId : connection.sourceStationId;
    const otherRoute = networkState.routes.find((item) => item.id === otherRouteId);
    const ownerStation = networkState.stations.find((item) => item.id === ownerStationId);
    const otherStation = networkState.stations.find((item) => item.id === otherStationId);
    if (!otherRoute || !ownerStation || !otherStation) continue;
    const ownerBasePath = getTrainServicePaths(route)[0];
    const otherBasePath = getTrainServicePaths(otherRoute)[0];
    if (!ownerBasePath || !otherBasePath) continue;
    const ownerPath = trimPathToConnectionStation(ownerBasePath, ownerStation, true);
    const otherPath = trimPathToConnectionStation(otherBasePath, otherStation, false);
    let bridge = (connection.coordinates ?? []).map((point) => L.latLng(point.lat, point.lng));
    if (bridge.length < 2) bridge = [L.latLng(...ownerStation.position), L.latLng(...otherStation.position)];
    bridge = orientPathToStation(bridge, ownerStation, false);
    const points = [...ownerPath, ...bridge.slice(1), ...otherPath.slice(1)];
    const routeIds = [route.id, otherRoute.id];
    options.push({
      id: `${route.id}:direct:${connection.id}`,
      label: `${route.name} → ${otherRoute.name} 직통`,
      routeIds,
      branchIds: [],
      points,
      stationIds: serviceStationsAlongPath(points, routeIds),
    });
  }
  return options.filter((option) => option.stationIds.length >= 2);
}

function servicePathLengthKm(service: OperatingService) {
  return polylineLengthMeters(service.pathCoordinates) / 1000;
}

function getOperatingServiceOperation(service: OperatingService, fleetSource = operationsState.fleets) {
  return calculateOperatingServiceOperation({
    serviceId: service.id,
    routeLengthKm: servicePathLengthKm(service),
    stopStationIds: service.stopStationIds,
    fleets: fleetSource.filter((fleet) => fleet.serviceId === service.id).map((fleet) => ({
      sets: fleet.sets,
      capacityPerSet: getFleetCapacityPerSet(fleet),
      speedKph: trainCatalog[fleet.trainType].speedKmh,
    })),
  });
}

function getFleetCapacityPerSet(fleet: TrainFleet) {
  return trainCatalog[fleet.trainType].capacityPerCar * fleet.cars;
}

function getFleetMaintenanceCost(fleet: TrainFleet) {
  return Math.round(trainCatalog[fleet.trainType].maintenancePerCar * fleet.cars * fleet.sets);
}

function updateFleetSetCount(fleet: TrainFleet, sets: number): TrainFleet {
  const normalizedSets = Math.max(0, Math.round(sets));
  const spec = trainCatalog[fleet.trainType];
  return {
    ...fleet,
    sets: normalizedSets,
    capacity: spec.capacityPerCar * fleet.cars * normalizedSets,
    purchaseCost: spec.pricePerCar * fleet.cars * normalizedSets,
    maintenanceCost: spec.maintenancePerCar * fleet.cars * normalizedSets,
  };
}

function buyTrainsForSelectedRoute() {
  const routeId = selectedOperationRouteId || networkState.routes[0]?.id;
  const route = networkState.routes.find((item) => item.id === routeId);
  if (!route) {
    setText(facilityReadout, "열차를 배정할 노선이 없습니다. 먼저 노선을 건설해 주세요.");
    showToast("열차를 배정할 노선이 없습니다. 먼저 노선을 건설해 주세요.");
    return;
  }
  const connectedDepotCapacity = networkState.depots
    .filter((depot) => isDepotOperational(depot.id) && depot.connectedRouteIds.includes(route.id))
    .reduce((sum, depot) => sum + depot.capacity, 0);
  const currentSets = operationsState.fleets.filter((fleet) => fleet.routeId === route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  const trainType = (trainTypeSelect?.value as TrainType) || "metro";
  const cars = clampInteger(Number(carCountInput?.value ?? 6), 2, 10);
  const sets = clampInteger(Number(setCountInput?.value ?? 1), 1, 30);
  if (connectedDepotCapacity === 0) {
    setText(facilityReadout, "차량기지가 노선과 연결되지 않았습니다. 기지 경계를 노선 가까이에 지정해 주세요.");
    showToast("차량기지가 노선과 연결되지 않았습니다. 기지 경계를 노선 가까이에 지정해 주세요.");
    return;
  }
  if (currentSets + sets > connectedDepotCapacity) {
    const available = Math.max(0, connectedDepotCapacity - currentSets);
    setText(facilityReadout, `차량기지 수용량이 부족합니다. 현재 추가 가능한 편성은 ${available}개입니다.`);
    showToast(`차량기지 수용량이 부족합니다. 구매 수량을 ${available}편성 이하로 줄이거나 기지를 확장해 주세요.`);
    return;
  }

  const spec = trainCatalog[trainType];
  pushHistory();
  operationsState.fleets = [
    ...operationsState.fleets,
    {
      id: createId("fleet"),
      routeId: route.id,
      trainType,
      cars,
      sets,
      capacity: spec.capacityPerCar * cars * sets,
      purchaseCost: Math.round(spec.pricePerCar * cars * sets),
      maintenanceCost: Math.round(spec.maintenancePerCar * cars * sets),
    },
  ];
  const latestFleet = operationsState.fleets[operationsState.fleets.length - 1];
  financeState.economy = { ...financeState.economy, cash: financeState.economy.cash - latestFleet.purchaseCost, trainSpent: financeState.economy.trainSpent + latestFleet.purchaseCost };
  playFeedback("confirm");
  redoStack = [];
  requestStateSave();
  requestUpdate("fleet-service", route.id);
}

function toggleExpressForSelectedRoute() {
  const routeId = selectedOperationRouteId || networkState.routes[0]?.id;
  if (!routeId) {
    setText(facilityReadout, "급행을 설정할 노선 필요");
    return;
  }

  const existing = getExpressConfig(routeId);
  const routeStationIds = networkState.stations
    .filter((station) => station.connectedRouteIds.includes(routeId))
    .map((station) => station.id);
  if (!existing.unlocked) {
    pushHistory();
    operationsState.expressConfigs = replaceExpressConfigForRoute(operationsState.expressConfigs, routeId, {
      ...existing,
      unlocked: true,
      enabled: true,
      stopStationIds: normalizeServiceStops(routeStationIds, []),
    });
    setTool("expressStop");
  } else if (existing.enabled && activeTool !== "expressStop") {
    // Keep the service running while opening the stop editor.
    setTool("expressStop");
    return;
  } else if (existing.enabled) {
    pushHistory();
    operationsState.expressConfigs = operationsState.expressConfigs.map((config) => (config.routeId === routeId ? { ...config, enabled: false } : config));
    setTool("pan");
  } else {
    pushHistory();
    operationsState.expressConfigs = operationsState.expressConfigs.map((config) => (config.routeId === routeId ? { ...config, enabled: true } : config));
    setTool("expressStop");
  }
  const enabled = operationsState.expressConfigs.find((config) => config.routeId === routeId)?.enabled ?? !existing.enabled;
  networkState.routes = networkState.routes.map((route) =>
    route.id === routeId
      ? {
          ...route,
          expressServiceEnabled: enabled,
          servicePatterns: (route.servicePatterns ?? []).map((pattern) => (pattern.kind === "express" ? { ...pattern, enabled } : pattern)),
        }
      : route,
  );
  redoStack = [];
  requestStateSave();
  updateExpressButton();
  requestUpdate("express-stops", routeId);
}

function toggleExpressStopAt(point: L.Point) {
  const routeId = selectedOperationRouteId || networkState.routes[0]?.id;
  const config = operationsState.expressConfigs.find((item) => item.routeId === routeId && item.enabled);
  if (!config) {
    setText(facilityReadout, "급행을 먼저 켜세요");
    return;
  }
  const station = findNearestStation(point, 26);
  if (!station || !station.connectedRouteIds.includes(routeId)) {
    setText(facilityReadout, "해당 노선 역을 선택");
    return;
  }
  const routeStationIds = networkState.stations
    .filter((item) => item.connectedRouteIds.includes(routeId))
    .map((item) => item.id);
  const routeStationIndex = routeStationIds.indexOf(station.id);
  if (config.stopStationIds.includes(station.id) && (routeStationIndex === 0 || routeStationIndex === routeStationIds.length - 1)) {
    setText(facilityReadout, "급행은 양 끝 종착역에 정차해야 합니다.");
    showToast("급행은 양 끝 종착역에 정차해야 합니다.");
    return;
  }
  pushHistory();
  const hasStop = config.stopStationIds.includes(station.id);
  operationsState.expressConfigs = operationsState.expressConfigs.map((item) =>
    item.routeId === routeId
      ? { ...item, stopStationIds: hasStop ? item.stopStationIds.filter((id) => id !== station.id) : [...item.stopStationIds, station.id] }
      : item,
  );
  redoStack = [];
  requestStateSave();
  requestUpdate("express-stops", station.id);
}

/**
 * 배정 차량, 역별 수요, 급행 설정으로부터 한 노선의 배차·혼잡·비용을 계산한다.
 * 반환값은 표시용 캐시가 아니라 현재 상태에서 언제든 다시 만들 수 있는 파생 데이터다.
 */
function calculateLegacyRouteOperation(routeId: string, fleetSource = operationsState.fleets): RouteOperation {
  const route = networkState.routes.find((item) => item.id === routeId);
  const routeStations = networkState.stations.filter((station) => station.connectedRouteIds.includes(routeId));
  const routeFleets = getFleetsServingRoute(routeId, fleetSource);
  const dailyDemand = routeStations.reduce((sum, station) => sum + station.demand, 0);
  if (route && !isRouteOperational(route.id)) {
    const fleetMaintenance = routeFleets.reduce((sum, fleet) => sum + getFleetMaintenanceCost(fleet), 0);
    return { routeId, headwayMin: 0, crowding: 0, waitMin: 0, dailyDemand: 0, hourlyCapacity: 0, operatingCost: fleetMaintenance };
  }
  if (route && (hasRouteGaps(route) || route.operationPaused || route.visibility === "planning")) {
    const fleetMaintenance = routeFleets.reduce((sum, fleet) => sum + getFleetMaintenanceCost(fleet), 0);
    return { routeId, headwayMin: 0, crowding: 2.4, waitMin: 30, dailyDemand, hourlyCapacity: 0, operatingCost: fleetMaintenance };
  }
  const customOperations = getCustomServiceOperations(routeId, fleetSource).map(({ operation }) => operation);
  const hourlyCapacity = customOperations.reduce((sum, operation) => sum + operation.hourlyCapacity, 0);
  const frequencyPerHour = customOperations.reduce((sum, operation) => sum + (operation.enabled && operation.headwayMin > 0 ? 60 / operation.headwayMin : 0), 0);
  const headwayMin = frequencyPerHour > 0 ? Math.round((60 / frequencyPerHour) * 10) / 10 : 0;
  // 분기마다 모든 열차가 완전히 분리된다고 보던 기존 방식은 혼잡을 지나치게 키웠다.
  // 본선 공용 운행을 고려해 추가 분기 하나당 배차 손실을 55%만 반영한다.
  // 일 수요의 10.5%가 첨두 한 시간에 발생하고 그중 58%가 혼잡 방향에 몰린다고 본다.
  const hourlyDemand = dailyDemand * 0.105 * 0.58;
  const crowding = hourlyCapacity > 0 ? Math.round((hourlyDemand / hourlyCapacity) * 100) / 100 : 0;
  const waitMin = headwayMin > 0 ? Math.round((headwayMin / 2) * Math.max(1, crowding * 0.75) * 10) / 10 : 0;
  const fleetMaintenance = routeFleets.reduce((sum, fleet) => sum + getFleetMaintenanceCost(fleet), 0);
  const operatingCost = fleetMaintenance;
  return { routeId, headwayMin, crowding, waitMin, dailyDemand, hourlyCapacity, operatingCost };
}

function getRoutingServiceCapacities(routeId?: string, fleetSource = operationsState.fleets): ServiceCapacity[] {
  return operationsState.services.flatMap((service) => {
    if (routeId && !service.routeIds.includes(routeId)) return [];
    const ownerRoute = networkState.routes.find((route) => route.id === service.ownerRouteId);
    if (!ownerRoute || service.routeIds.some((id) => {
      const route = networkState.routes.find((item) => item.id === id);
      return !route || !isRouteOperational(id) || route.operationPaused || route.visibility === "planning";
    })) return [];
    const operation = getOperatingServiceOperation(service, fleetSource);
    return operation.enabled && operation.hourlyCapacity > 0 ? [{
      serviceId: service.id,
      routeId: service.ownerRouteId,
      serviceKind: "local" as const,
      hourlyCapacity: operation.hourlyCapacity,
      headwayMin: operation.headwayMin,
    }] : [];
  });
}

function calculateRouteOperation(routeId: string): RouteOperation {
  const base = calculateLegacyRouteOperation(routeId);
  const route = networkState.routes.find((item) => item.id === routeId);
  if (!route || !isRouteOperational(routeId)) return { ...base, dailyDemand: 0, crowding: 0 };
  const dailyDemand = demandState.passengerGroups
    .filter((group) => group.journey?.routeIds.includes(routeId) ?? group.routeIds.includes(routeId))
    .reduce((sum, group) => sum + group.activeDemand, 0);
  const summary = congestionRuntimeState.routeCongestionSummaries.find((item) => item.routeId === routeId);
  const hourlyCapacity = getRoutingServiceCapacities(routeId).reduce((sum, capacity) => sum + capacity.hourlyCapacity, 0);
  const crowding = summary?.representativeCrowding ?? 0;
  const waitMin = base.headwayMin > 0
    ? Math.round((base.headwayMin / 2) * Math.max(1, crowding * 0.75) * 10) / 10
    : 0;
  return { ...base, dailyDemand, hourlyCapacity, crowding, waitMin };
}

function normalizeAnalysisState(state?: OperationAnalysisState): OperationAnalysisState {
  return {
    ...defaultAnalysisState,
    ...(state ?? {}),
    dayIndex: Math.max(0, Math.round(state?.dayIndex ?? 0)),
    demandHistory: Array.isArray(state?.demandHistory) ? state.demandHistory.slice(-30) : [],
    suggestions: Array.isArray(state?.suggestions) ? state.suggestions : [],
    decisions: state?.decisions && typeof state.decisions === "object" ? state.decisions : {},
  };
}

function buildAnalysisFingerprint() {
  return JSON.stringify({
    fare: financeState.economy.fare,
    satisfaction: financeState.economy.satisfaction,
    routes: networkState.routes.map((route) => [route.id, route.lengthKm, route.operationPaused, route.visibility]),
    stations: networkState.stations.map((station) => [station.id, station.demand, station.connectedRouteIds]),
    services: operationsState.services.map((service) => [service.id, service.ownerRouteId, service.routeIds, service.pathOptionId, service.stopStationIds]),
    fleets: operationsState.fleets.map((fleet) => [fleet.id, fleet.routeId, fleet.serviceId, fleet.sets, fleet.cars, fleet.trainType]),
    depots: networkState.depots.map((depot) => [depot.id, depot.capacity, depot.connectedRouteIds]),
    transfers: networkState.transfers.map((transfer) => [transfer.id, transfer.resistance]),
    plans: constructionState.plans.map((plan) => [plan.id, plan.status, plan.remainingCost, plan.expectedDemand]),
    day: analysisStateOwner.current.dayIndex,
  });
}

/**
 * 운영 지표를 점검해 수송력·재정·환승 관련 개선 제안을 갱신한다.
 * fingerprint가 같으면 중복 계산/알림을 피하고, force일 때만 같은 상태도 재평가한다.
 */
function refreshOperationSuggestions(force = false) {
  const fingerprint = buildAnalysisFingerprint();
  if (!force && fingerprint === analysisStateOwner.current.lastFingerprint) return;
  const day = analysisStateOwner.current.dayIndex;
  const existing = new Map(analysisStateOwner.current.suggestions.map((suggestion) => [suggestion.id, suggestion]));
  const proposals: OperationSuggestion[] = [];
  const add = (
    code: string,
    severity: AnalysisSeverity,
    category: OperationSuggestion["category"],
    targetType: OperationSuggestion["targetType"],
    targetId: string,
    targetLabel: string,
    title: string,
    cause: string,
    recommendation: string,
    expectedEffect: string,
    estimatedCost: number,
    actionKind: SuggestionActionKind,
    actionLabel: string,
    actionValue?: number,
  ) => {
    const id = `ops:${code}:${targetType}:${targetId}`;
    const previous = existing.get(id);
    const decision = analysisStateOwner.current.decisions[id];
    let status: SuggestionStatus = previous?.status ?? "active";
    let remindAtDay = previous?.remindAtDay;
    if (decision?.status === "hidden") status = "hidden";
    if (decision?.status === "later") {
      if ((decision.untilDay ?? 0) > day) {
        status = "later";
        remindAtDay = decision.untilDay;
      } else {
        status = "active";
        delete analysisStateOwner.current.decisions[id];
      }
    }
    proposals.push({
      id,
      code,
      severity,
      category,
      targetType,
      targetId,
      targetLabel,
      title,
      cause,
      recommendation,
      expectedEffect,
      estimatedCost: Math.max(0, Math.round(estimatedCost)),
      actionKind,
      actionLabel,
      actionValue,
      generatedDay: previous?.generatedDay ?? day,
      lastSeenDay: day,
      status,
      remindAtDay,
      estimated: true,
    });
  };

  const totalRouteDemand = networkState.routes.reduce((sum, route) => sum + calculateRouteOperation(route.id).dailyDemand, 0);
  for (const route of networkState.routes.filter((item) => item.visibility !== "planning" && !item.operationPaused && isRouteOperational(item.id))) {
    const operation = calculateRouteOperation(route.id);
    const routeFleets = getFleetsServingRoute(route.id);
    const sets = routeFleets.reduce((sum, fleet) => sum + fleet.sets, 0);
    const connectedCapacity = networkState.depots
      .filter((depot) => depot.connectedRouteIds.includes(route.id))
      .reduce((sum, depot) => sum + depot.capacity, 0);
    const commonFleet = routeFleets[0];
    const trainType = commonFleet?.trainType ?? "metro";
    const cars = commonFleet?.cars ?? 6;
    const costPerSet = trainCatalog[trainType].pricePerCar * cars;

    if (operation.dailyDemand > 0 && sets === 0) {
      const recommendedSets = Math.max(2, Math.ceil(Math.max(2, route.lengthKm / 4)));
      add(
        "train-shortage",
        "critical",
        "capacity",
        "route",
        route.id,
        route.name,
        `${route.name}에 운행 열차가 없습니다`,
        `일 수요 ${operation.dailyDemand.toLocaleString("ko-KR")}명을 처리할 편성이 배정되지 않았습니다.`,
        `${recommendedSets}편성을 구매해 기본 운행을 시작하세요.`,
        `운행 개시 후 배차와 혼잡도가 계산됩니다.`,
        costPerSet * recommendedSets,
        connectedCapacity > 0 ? "buy-trains" : "build-depot",
        connectedCapacity > 0 ? "구매 화면 열기" : "차량기지 건설",
        recommendedSets,
      );
    } else if (sets > 0 && operation.crowding >= 1.12) {
      const additionalSets = Math.max(1, Math.ceil(sets * (operation.crowding / 0.82 - 1)));
      const projectedCrowding = Math.max(0.2, operation.crowding * (sets / (sets + additionalSets)));
      add(
        "high-crowding",
        operation.crowding >= 1.35 ? "critical" : "warning",
        "capacity",
        "route",
        route.id,
        route.name,
        `${route.name} 혼잡도 ${Math.round(operation.crowding * 100)}%`,
        `현재 ${sets}편성으로 시간당 ${operation.hourlyCapacity.toLocaleString("ko-KR")}명을 수송하고 있습니다.`,
        `열차 ${additionalSets}편성을 추가하는 방안을 검토하세요.`,
        `혼잡도 약 ${Math.round(projectedCrowding * 100)}%로 감소할 것으로 추정됩니다.`,
        costPerSet * additionalSets,
        connectedCapacity >= sets + additionalSets ? "buy-trains" : "build-depot",
        connectedCapacity >= sets + additionalSets ? "구매 화면 열기" : "기지 용량 확인",
        additionalSets,
      );
    } else if (sets > 0 && operation.waitMin >= 8) {
      const additionalSets = Math.max(1, Math.ceil(sets * (operation.waitMin / 6 - 1)));
      add(
        "long-wait",
        operation.waitMin >= 12 ? "critical" : "warning",
        "service",
        "route",
        route.id,
        route.name,
        `${route.name} 평균 대기시간 ${operation.waitMin.toFixed(1)}분`,
        `노선 길이와 현재 ${sets}편성의 운행 주기로 배차간격이 ${operation.headwayMin.toFixed(1)}분입니다.`,
        `열차 ${additionalSets}편성을 추가해 배차간격을 줄이세요.`,
        `평균 대기시간이 약 ${Math.max(2, operation.waitMin * (sets / (sets + additionalSets))).toFixed(1)}분으로 줄어들 것으로 추정됩니다.`,
        costPerSet * additionalSets,
        connectedCapacity >= sets + additionalSets ? "buy-trains" : "build-depot",
        connectedCapacity >= sets + additionalSets ? "구매 화면 열기" : "기지 용량 확인",
        additionalSets,
      );
    } else if (sets >= 3 && operation.crowding <= 0.28 && operation.headwayMin > 0 && operation.headwayMin < 5) {
      add(
        "over-service",
        "info",
        "finance",
        "route",
        route.id,
        route.name,
        `${route.name} 배차가 수요보다 많습니다`,
        `혼잡도 ${Math.round(operation.crowding * 100)}%, 평균 대기 ${operation.waitMin.toFixed(1)}분으로 공급 여유가 큽니다.`,
        `편성 재배치 또는 운행 계획 조정을 검토하세요.`,
        `유지비를 줄이면서도 목표 대기시간을 유지할 가능성이 있습니다.`,
        0,
        "focus-route",
        "노선 운영 보기",
      );
    } else if (sets > 0 && operation.dailyDemand < Math.max(3500, route.lengthKm * 420) && operation.crowding < 0.22) {
      add(
        "low-utilization",
        "info",
        "passenger",
        "route",
        route.id,
        route.name,
        `${route.name} 이용률이 낮습니다`,
        `일 수요 ${operation.dailyDemand.toLocaleString("ko-KR")}명, 혼잡도 ${Math.round(operation.crowding * 100)}%입니다.`,
        `역 접근성과 요금, 인접 노선 환승을 함께 점검하세요.`,
        `수요가 늘지 않으면 배차 조정으로 적자를 줄일 수 있습니다.`,
        0,
        "focus-route",
        "노선 운영 보기",
      );
    }

    if (connectedCapacity < sets || (sets > 0 && connectedCapacity - sets <= 1 && operation.crowding >= 0.95)) {
      const shortage = Math.max(1, sets + 2 - connectedCapacity);
      add(
        "depot-capacity",
        connectedCapacity < sets ? "critical" : "warning",
        "capacity",
        "route",
        route.id,
        route.name,
        `${route.name} 차량기지 용량이 부족합니다`,
        `연결 기지는 ${connectedCapacity}편성을 수용하며 현재 ${sets}편성이 배정되어 있습니다.`,
        `최소 ${shortage}편성 규모의 기지 용량을 추가하세요.`,
        `증편 여유와 운영 안정성이 높아질 것으로 추정됩니다.`,
        shortage * 900,
        "build-depot",
        "차량기지 건설",
        shortage,
      );
    }

    const estimatedRevenue = Math.round((operation.dailyDemand * financeState.economy.fare) / 100000000);
    if (sets > 0 && operation.operatingCost > estimatedRevenue * 1.12) {
      add(
        "route-deficit",
        operation.operatingCost > estimatedRevenue * 1.6 ? "warning" : "info",
        "finance",
        "route",
        route.id,
        route.name,
        `${route.name}의 추정 운영수지가 적자입니다`,
        `추정 일 수입 ${formatCost(estimatedRevenue)} 대비 운영비가 ${formatCost(operation.operatingCost)}입니다.`,
        `배차, 요금, 이용률을 함께 검토하세요.`,
        `현재 조건에서는 일 ${formatCost(operation.operatingCost - estimatedRevenue)} 절감이 손익분기점입니다.`,
        0,
        "focus-route",
        "노선 운영 보기",
      );
    }

    const routeStationCount = networkState.stations.filter((station) => station.connectedRouteIds.includes(route.id)).length;
    const express = operationsState.expressConfigs.find((config) => config.routeId === route.id && config.enabled);
    if (!express && routeStationCount >= 8 && route.lengthKm >= 10 && operation.dailyDemand >= Math.max(18000, totalRouteDemand * 0.2)) {
      add(
        "express-opportunity",
        "info",
        "service",
        "route",
        route.id,
        route.name,
        `${route.name}에 급행 도입 여지가 있습니다`,
        `${routeStationCount}개 역, ${route.lengthKm.toFixed(1)}km 구간에 일 수요 ${operation.dailyDemand.toLocaleString("ko-KR")}명이 있습니다.`,
        `주요 수요역 중심의 급행 정차 패턴을 검토하세요.`,
        `장거리 승객의 통행시간 감소가 예상되지만 운영비는 증가합니다.`,
        getExpressConfig(route.id).unlocked ? 0 : getExpressConfig(route.id).unlockCost,
        "review-express",
        "급행 설정 열기",
      );
    }
  }

  if (financeState.economy.fare >= (financeState.economy.autoFare ? 2300 : 1900)) {
    const farePenalty = Math.round((financeState.economy.fare - 1450) / 55);
    add(
      "high-fare",
      financeState.economy.fare >= 2500 ? "warning" : "info",
      "passenger",
      "network",
      "network",
      "전체 네트워크",
      `현재 요금이 ${financeState.economy.fare.toLocaleString("ko-KR")}원입니다`,
      `기준 요금 대비 만족도 계산에서 약 ${farePenalty}점의 부담이 반영됩니다.`,
      financeState.economy.autoFare ? `운영비와 혼잡 원인을 낮춘 뒤 자동 요금 추정치를 다시 확인하세요.` : `자동 요금 또는 단계적 인하 효과를 비교하세요.`,
      `요금을 1,450원으로 조정하면 만족도가 최대 ${farePenalty}점 개선될 수 있습니다.`,
      0,
      "review-fare",
      "요금 설정 열기",
    );
  }

  const oldSnapshot = [...analysisStateOwner.current.demandHistory].reverse().find((snapshot) => snapshot.day <= day - 7);
  if (oldSnapshot && oldSnapshot.satisfaction - financeState.economy.satisfaction >= 8) {
    add(
      "satisfaction-drop",
      oldSnapshot.satisfaction - financeState.economy.satisfaction >= 15 ? "critical" : "warning",
      "passenger",
      "network",
      "network",
      "전체 네트워크",
      `시민 만족도가 ${oldSnapshot.satisfaction - financeState.economy.satisfaction}점 하락했습니다`,
      `최근 기준 ${oldSnapshot.satisfaction}점에서 현재 ${financeState.economy.satisfaction}점으로 낮아졌습니다.`,
      `혼잡, 대기시간, 요금 관련 우선 제안을 먼저 확인하세요.`,
      `원인 지표를 개선하면 수요 회복 가능성이 있습니다.`,
      0,
      "review-fare",
      "운영 지표 보기",
    );
  }

  for (const transfer of networkState.transfers.filter((item) => item.resistance >= 72).sort((a, b) => b.resistance - a.resistance).slice(0, 4)) {
    const transferStations = transfer.stationIds.map((id) => networkState.stations.find((station) => station.id === id)).filter(Boolean) as Station[];
    const label = transferStations.map((station) => station.name).join("–") || "환승 연결";
    add(
      "transfer-resistance",
      transfer.resistance >= 110 ? "warning" : "info",
      "network",
      "transfer",
      transfer.id,
      label,
      `${label} 환승 저항이 높습니다`,
      `환승거리 ${Math.round(transfer.distanceM)}m, 예상 소요 ${transfer.transferTimeMin.toFixed(1)}분, 저항 지수 ${transfer.resistance}입니다.`,
      `환승 연결 위치와 동선을 다시 지정하세요.`,
      `환승 저항 감소 시 해당 경로의 활성 수요가 증가할 수 있습니다.`,
      1200,
      "review-transfer",
      "환승 도구 열기",
    );
  }

  const stationOperationMetrics = networkState.stations
    .map((station) => {
      const operations = station.connectedRouteIds.map((routeId) => calculateRouteOperation(routeId)).filter((operation) => operation.hourlyCapacity > 0);
      return {
        station,
        crowding: operations.length > 0 ? operations.reduce((sum, operation) => sum + operation.crowding, 0) / operations.length : 0,
        waitMin: operations.length > 0 ? operations.reduce((sum, operation) => sum + operation.waitMin, 0) / operations.length : 0,
      };
    });
  for (const metric of stationOperationMetrics.filter((item) => item.crowding >= 1.25 && item.station.demand >= 9000).sort((a, b) => b.station.demand - a.station.demand).slice(0, 2)) {
    add(
      "station-crowding",
      metric.crowding >= 1.5 ? "critical" : "warning",
      "capacity",
      "station",
      metric.station.id,
      metric.station.name,
      `${metric.station.name} 이용객이 혼잡 영향을 크게 받고 있습니다`,
      `연결 노선 평균 혼잡도 ${Math.round(metric.crowding * 100)}%, 평균 대기 ${metric.waitMin.toFixed(1)}분, 역 수요 ${metric.station.demand.toLocaleString("ko-KR")}명입니다.`,
      `연결 노선의 증편과 환승 동선을 함께 검토하세요.`,
      `혼잡 완화 시 이 역을 이용하는 승객 만족도가 개선될 수 있습니다.`,
      0,
      "focus-route",
      "역 운영 보기",
    );
  }
  const lowUseStations = stationOperationMetrics
    .filter((item) => item.station.demand < 2400 && item.station.connectedRouteIds.length > 0)
    .sort((a, b) => a.station.demand - b.station.demand)
    .slice(0, 2);
  for (const metric of lowUseStations) {
    add(
      "station-low-use",
      "info",
      "passenger",
      "station",
      metric.station.id,
      metric.station.name,
      `${metric.station.name} 이용률이 낮습니다`,
      `현재 역 수요는 ${metric.station.demand.toLocaleString("ko-KR")}명으로 네트워크 내 낮은 수준입니다.`,
      `역 접근성, 인접 토지 수요와 역 간격을 확인하세요.`,
      `접근성 개선이 어렵다면 운영 비용 대비 역 역할을 재검토할 수 있습니다.`,
      0,
      "focus-route",
      "역 운영 보기",
    );
  }

  if (oldSnapshot) {
    const growingStations = networkState.stations
      .map((station) => {
        const oldDemand = oldSnapshot.stationDemand[station.id] ?? station.demand;
        return { station, growth: oldDemand > 0 ? station.demand / oldDemand - 1 : 0 };
      })
      .filter((item) => item.growth >= 0.15 && item.station.demand >= 5000)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 3);
    for (const { station, growth } of growingStations) {
      add(
        "demand-growth",
        growth >= 0.28 ? "warning" : "info",
        "planning",
        "station",
        station.id,
        station.name,
        `${station.name} 주변 수요가 ${Math.round(growth * 100)}% 증가했습니다`,
        `최근 7일 이상 누적된 실제 역 수요 추세를 기준으로 감지했습니다.`,
        `인접 역 신설 또는 노선 연장을 계획 모드에서 검토하세요.`,
        `증가 추세가 유지되면 신규 시설의 초기 수요 확보 가능성이 있습니다.`,
        0,
        "open-plan",
        "계획 모드 열기",
      );
    }
  }

  for (const plan of constructionState.plans.filter((item) => item.status !== "completed" && item.status !== "on-hold")) {
    const canAfford = metaState.current.mode === "sandbox" || plan.remainingCost <= financeState.economy.cash;
    if (plan.remainingCost > 0 && canAfford && plan.expectedDemand >= 12000) {
      add(
        "plan-ready",
        plan.priority === "critical" ? "warning" : "info",
        "planning",
        "plan",
        plan.id,
        plan.name,
        `${plan.name}을 건설할 조건이 갖춰졌습니다`,
        `예상 수요 ${plan.expectedDemand.toLocaleString("ko-KR")}명, 남은 비용 ${formatCost(plan.remainingCost)}이며 현재 자금으로 건설 가능합니다.`,
        `계획 항목과 예상 영향을 확인한 뒤 건설 전환을 검토하세요.`,
        `완공 시 연 ${formatCost(plan.expectedRevenue)}의 예상 수익이 반영됩니다.`,
        plan.remainingCost,
        "open-plan",
        "계획 검토하기",
      );
    }
  }

  analysisStateOwner.current = { ...analysisStateOwner.current, suggestions: proposals, lastFingerprint: fingerprint };
  updateAnalysisBadge();
}

function recordDemandSnapshot() {
  const snapshot: DemandSnapshot = {
    day: analysisStateOwner.current.dayIndex,
    totalDemand: financeState.economy.demand,
    satisfaction: financeState.economy.satisfaction,
    stationDemand: Object.fromEntries(networkState.stations.map((station) => [station.id, station.demand])),
  };
  analysisStateOwner.current = {
    ...analysisStateOwner.current,
    demandHistory: [...analysisStateOwner.current.demandHistory.filter((item) => item.day !== snapshot.day), snapshot].slice(-30),
    lastFingerprint: "",
  };
}

function openAnalysisScreen() {
  refreshOperationSuggestions();
  renderAnalysisScreen();
  if (analysisScreen) analysisScreen.hidden = false;
  document.body.classList.add("analysis-open");
}

function closeAnalysisScreen() {
  if (analysisScreen) analysisScreen.hidden = true;
  document.body.classList.remove("analysis-open");
}

function renderAnalysisScreen() {
  refreshOperationSuggestions();
  const filter = analysisFilter?.value || "active";
  const visible = analysisStateOwner.current.suggestions.filter((suggestion) => {
    if (filter === "all") return true;
    return suggestion.status === filter;
  });
  const active = analysisStateOwner.current.suggestions.filter((suggestion) => suggestion.status === "active");
  const critical = active.filter((suggestion) => suggestion.severity === "critical").length;
  const warning = active.filter((suggestion) => suggestion.severity === "warning").length;
  const info = active.filter((suggestion) => suggestion.severity === "info").length;
  const health = Math.max(0, 100 - critical * 18 - warning * 8 - info * 2);
  if (analysisScreen) {
    analysisScreen.style.setProperty("--analysis-health", String(health));
    analysisScreen.dataset.health = health >= 86 ? "stable" : health >= 65 ? "warning" : "critical";
  }
  setText(analysisUpdatedAt, `게임 ${analysisStateOwner.current.dayIndex}일차 · ${analysisStateOwner.current.demandHistory.length}일 추세`);
  setText(analysisHealthScore, String(health));
  setText(analysisHealthLabel, health >= 86 ? "안정적" : health >= 65 ? "점검 필요" : "집중 개선");
  setText(analysisCriticalCount, String(critical));
  setText(analysisWarningCount, String(warning));
  setText(analysisInfoCount, String(info));
  setText(analysisUrgentLabel, critical > 0 ? `${critical}건 우선 확인` : "긴급 제안 없음");

  const urgent = visible.filter((suggestion) => suggestion.severity === "critical");
  const reports = visible.filter((suggestion) => suggestion.severity !== "critical");
  if (analysisUrgentList) analysisUrgentList.innerHTML = urgent.map(renderSuggestionCard).join("");
  if (analysisReportList) analysisReportList.innerHTML = reports.map(renderSuggestionCard).join("");
  if (analysisEmptyState) analysisEmptyState.hidden = visible.length > 0;
  document.querySelector(".analysis-section.urgent")?.toggleAttribute("hidden", urgent.length === 0);
}

function renderSuggestionCard(suggestion: OperationSuggestion) {
  const severityLabel = suggestion.severity === "critical" ? "긴급" : suggestion.severity === "warning" ? "주의" : "참고";
  const severityIcon = suggestion.severity === "critical" ? "!" : suggestion.severity === "warning" ? "△" : "i";
  const statusLabel =
    suggestion.status === "later"
      ? `${Math.max(0, (suggestion.remindAtDay ?? analysisStateOwner.current.dayIndex) - analysisStateOwner.current.dayIndex)}일 후 다시 표시`
      : suggestion.status === "hidden"
        ? "숨김됨"
        : "현재 제안";
  return `<article class="analysis-card severity-${suggestion.severity} status-${suggestion.status}" data-suggestion-id="${escapeHtml(suggestion.id)}">
    <header><div><span class="analysis-severity"><i aria-hidden="true">${severityIcon}</i>${severityLabel}</span><span class="analysis-target">${escapeHtml(suggestion.targetLabel)}</span></div><em>${statusLabel}</em></header>
    <div class="analysis-card-title"><h4>${escapeHtml(suggestion.title)}</h4><span aria-hidden="true">→</span></div>
    <dl>
      <div><dt>원인</dt><dd>${escapeHtml(suggestion.cause)}</dd></div>
      <div><dt>추천 행동</dt><dd>${escapeHtml(suggestion.recommendation)}</dd></div>
      <div><dt>예상 효과</dt><dd>${escapeHtml(suggestion.expectedEffect)}</dd></div>
    </dl>
    <footer>
      <span><small>예상 비용</small><strong>${suggestion.estimatedCost > 0 ? formatCost(suggestion.estimatedCost) : "추가 비용 없음"}</strong><em>추정치</em></span>
      <div>
        ${
          suggestion.status === "hidden"
            ? `<button type="button" data-command="restore">다시 표시</button>`
            : `<button type="button" data-command="hide">숨기기</button><button type="button" data-command="later">나중에 보기</button><button class="primary" type="button" data-command="execute">${escapeHtml(suggestion.actionLabel)}</button>`
        }
      </div>
    </footer>
  </article>`;
}

function focusRouteOnMap(routeId: string, openManager = false) {
  const route = networkState.routes.find((item) => item.id === routeId);
  if (!route) return false;
  selectRoute(route.id, false);
  selectedOperationRouteId = route.id;
  if (operationRouteSelect) operationRouteSelect.value = route.id;
  updateOperationRouteOptions();
  updateOperationHud();
  if (route.coordinates.length > 1) {
    map.fitBounds(
      L.latLngBounds(route.coordinates.map(([lat, lng]) => L.latLng(lat, lng))),
      { padding: [56, 56], maxZoom: 15, animate: true },
    );
  } else if (route.coordinates.length === 1) {
    map.flyTo(L.latLng(route.coordinates[0][0], route.coordinates[0][1]), Math.max(map.getZoom(), 15));
  }
  if (openManager) openLineManager();
  return true;
}

function focusStationOnMap(stationId: string, openManager = false) {
  const station = networkState.stations.find((item) => item.id === stationId);
  if (!station) return false;
  const connectedRoute = networkState.routes.find((route) => station.connectedRouteIds.includes(route.id));
  if (connectedRoute) {
    selectedRouteId = connectedRoute.id;
    selectedOperationRouteId = connectedRoute.id;
    if (operationRouteSelect) operationRouteSelect.value = connectedRoute.id;
    updateOperationRouteOptions();
    updateOperationHud();
  }
  map.flyTo(L.latLng(station.position[0], station.position[1]), Math.max(map.getZoom(), 15), { animate: true });
  if (openManager) openStationManager(station.id);
  return true;
}

function focusDepotOnMap(depotId: string, openManager = false) {
  const depot = networkState.depots.find((item) => item.id === depotId);
  if (!depot) return false;
  if (depot.polygon.length > 2) {
    map.fitBounds(
      L.latLngBounds(depot.polygon.map(([lat, lng]) => L.latLng(lat, lng))),
      { padding: [56, 56], maxZoom: 16, animate: true },
    );
  }
  if (openManager) openDepotManager(depot.id);
  return true;
}

function focusTransferOnMap(transferId: string, openManager = false) {
  const transfer = networkState.transfers.find((item) => item.id === transferId);
  const stationId = transfer?.stationIds.find((id) => networkState.stations.some((station) => station.id === id));
  return stationId ? focusStationOnMap(stationId, openManager) : false;
}

function handleSuggestionClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-command]");
  const card = button?.closest<HTMLElement>("[data-suggestion-id]");
  const suggestion = analysisStateOwner.current.suggestions.find((item) => item.id === card?.dataset.suggestionId);
  if (!button || !suggestion) return;
  const command = button.dataset.command;
  if (command === "hide" || command === "later" || command === "restore") {
    pushHistory();
    redoStack = [];
  }
  if (command === "hide") {
    setSuggestionDecision(suggestion.id, "hidden");
  } else if (command === "later") {
    setSuggestionDecision(suggestion.id, "later", analysisStateOwner.current.dayIndex + (suggestion.severity === "critical" ? 3 : 7));
  } else if (command === "restore") {
    setSuggestionDecision(suggestion.id, "active");
  } else if (command === "execute") {
    executeSuggestion(suggestion);
    return;
  }
  renderAnalysisScreen();
  requestStateSave();
}

function setSuggestionDecision(id: string, status: SuggestionStatus, untilDay?: number) {
  const decisions = { ...analysisStateOwner.current.decisions };
  if (status === "active") delete decisions[id];
  else decisions[id] = { status, untilDay };
  analysisStateOwner.current = {
    ...analysisStateOwner.current,
    decisions,
    suggestions: analysisStateOwner.current.suggestions.map((suggestion) =>
      suggestion.id === id ? { ...suggestion, status, remindAtDay: untilDay } : suggestion,
    ),
  };
  updateAnalysisBadge();
}

function executeSuggestion(suggestion: OperationSuggestion) {
  closeAnalysisScreen();
  if (suggestion.targetType === "route") {
    focusRouteOnMap(suggestion.targetId);
  }
  if (suggestion.actionKind === "buy-trains") {
    openLineManager();
    openTrainManagerModal();
    showToast(`열차 관리 화면을 열었습니다. ${suggestion.actionValue ?? 1}편성을 확인해 주세요.`);
  } else if (suggestion.actionKind === "review-fare") {
    if (networkState.routes.length > 0) {
      focusRouteOnMap(selectedRouteId ?? networkState.routes[0].id, true);
      lineFareInput?.focus();
      lineFareInput?.select();
      showToast("노선 설정의 운임 입력 위치로 이동했습니다. 현재 운임을 확인해 주세요.");
    } else {
      openFinanceDialog();
      showToast("재정 관리 화면을 열었습니다. 현재 수요와 자금을 확인해 주세요.");
    }
  } else if (suggestion.actionKind === "review-transfer") {
    focusTransferOnMap(suggestion.targetId);
    if (workspaceMode === "management") setWorkspaceMode("planning");
    setTool("transfer");
    showToast("환승 도구를 열었습니다. 두 역을 선택하면 실제 연결 정보를 검토할 수 있습니다.");
  } else if (suggestion.actionKind === "build-depot") {
    if (workspaceMode === "management") setWorkspaceMode("planning");
    setTool("depot");
    showToast("차량기지 건설 도구를 열었습니다. 지도에 영역을 그리면 비용 미리보기가 표시됩니다.");
  } else if (suggestion.actionKind === "review-express") {
    openLineManager();
    expressServiceToggle?.focus();
    expressServiceToggle?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showToast("급행 설정 위치로 이동했습니다. 설정을 확인하세요.");
  } else if (suggestion.actionKind === "open-plan") {
    if (suggestion.targetType === "plan") activePlanId = suggestion.targetId;
    openPlanningDialog();
  } else if (suggestion.actionKind === "focus-route") {
    if (suggestion.targetType === "route") focusRouteOnMap(suggestion.targetId, true);
    else if (suggestion.targetType === "station") focusStationOnMap(suggestion.targetId, true);
    else if (suggestion.targetType === "depot") focusDepotOnMap(suggestion.targetId, true);
    else if (suggestion.targetType === "transfer") focusTransferOnMap(suggestion.targetId, true);
    else openFinanceDialog();
    showToast(`${suggestion.targetLabel} 운영 화면으로 이동했습니다.`);
  } else {
    requestUpdate("selection", suggestion.targetId);
    showToast(`${suggestion.targetLabel} 운영 화면으로 이동했습니다.`);
  }
}

function updateAnalysisBadge() {
  const urgentCount = analysisStateOwner.current.suggestions.filter((suggestion) => suggestion.status === "active" && suggestion.severity === "critical").length;
  if (analysisBadge) {
    analysisBadge.hidden = urgentCount === 0;
    analysisBadge.textContent = String(urgentCount);
  }
  analysisButton?.classList.toggle("has-alert", urgentCount > 0);
}

function normalizeStatisticsState(state?: StatisticsState): StatisticsState {
  return {
    totalPassengers: Math.max(0, Math.round(state?.totalPassengers ?? 0)),
    totalLoanRepaid: Math.max(0, Math.round(state?.totalLoanRepaid ?? 0)),
    dailyRecords: Array.isArray(state?.dailyRecords) ? state.dailyRecords.slice(-90) : [],
  };
}

function isNewsEventActive(event: NewsEvent) {
  return analysisStateOwner.current.dayIndex >= event.startedDay && analysisStateOwner.current.dayIndex < event.startedDay + event.durationDays;
}

function normalizeNewsEvents(source?: NewsEvent[]) {
  if (!Array.isArray(source)) return [];
  return source
    .filter((event) => event && typeof event.id === "string" && newsEventCatalog[event.kind])
    .map((event) => ({
      ...event,
      relatedStationIds: Array.isArray(event.relatedStationIds) ? event.relatedStationIds : [],
      relatedRouteIds: Array.isArray(event.relatedRouteIds) ? event.relatedRouteIds : [],
      read: Boolean(event.read),
      responsePrepared: Boolean(event.responsePrepared),
    }))
    .slice(-80);
}

function hashNewsSeed(day: number, salt: string) {
  let hash = day * 2654435761;
  for (let index = 0; index < salt.length; index += 1) hash = Math.imul(hash ^ salt.charCodeAt(index), 16777619);
  return Math.abs(hash >>> 0);
}

function updateNewsEventsForDay(dispatch = true) {
  const day = analysisStateOwner.current.dayIndex;
  const result = eventCoordinator.advanceDay(newsEventState.current, day, hashNewsSeed(day, metaState.current.slotId));
  newsEventState.replace(result.events);
  const runtimeResult = eventRuntimeAdapter.process({
    started: result.started,
    expiredIds: result.expiredIds,
    domains: result.updateDomains,
    capture: () => newsEventState.capture(),
    restore: (snapshot) => { newsEventState.restore(snapshot); },
    applyStarted: (event) => {
      if (event.kind === "construction-delay") attachConstructionDelayFromNews(event);
      showToast(`새 뉴스: ${event.title}`);
    },
    removeExpired: () => undefined,
    toNews: (event) => event,
  });
  if (dispatch) void runtimeResultDispatcher.dispatch([runtimeResult]);
  updateNewsBadge();
  return runtimeResult;
}

function createNewsEvent(day: number): NewsEvent {
  // City development is not generated from railway performance. Legacy
  // new-town/commercial events still load safely, but new automatic events are
  // limited to temporary trip-generating occasions.
  const opportunityKinds: NewsEventKind[] = ["festival", "concert", "sports", "tourism", "university"];
  const changeKinds: NewsEventKind[] = ["heavy-rain", "heavy-snow", "roadworks", "demand-decline", "operating-cost", "construction-delay", "recession"];
  const seed = hashNewsSeed(day, `${metaState.current.slotId}:${metaState.current.cityId}:${newsEventState.length}`);
  const pool = seed % 100 < 62 ? opportunityKinds : changeKinds;
  const kind = pool[seed % pool.length];
  const template = newsEventCatalog[kind];
  const stationPool = networkState.stations.filter((station) => isStationOperational(station.id));
  const station = stationPool.length > 0 ? stationPool[(seed >>> 5) % stationPool.length] : undefined;
  const relatedRouteIds = station?.connectedRouteIds.filter(isRouteOperational) ?? [];
  const position = station?.position ?? (cityConfigs[metaState.current.cityId].center as [number, number]);
  const durationRange = template.duration[1] - template.duration[0] + 1;
  return {
    id: createId("news"),
    kind,
    tone: template.tone,
    title: template.title,
    summary: template.summary,
    regionName: station ? `${station.name} 일대` : `${cityConfigs[metaState.current.cityId].name} 전역`,
    position: [position[0], position[1]],
    startedDay: day,
    durationDays: template.duration[0] + ((seed >>> 9) % durationRange),
    demandMultiplier: template.demandMultiplier,
    operatingCostMultiplier: template.operatingCostMultiplier,
    relatedStationIds: station ? [station.id] : [],
    relatedRouteIds,
    action: template.action,
    actionLabel: template.actionLabel,
    read: false,
    responsePrepared: false,
  };
}

function attachConstructionDelayFromNews(event: NewsEvent) {
  constructionState.replaceProjects(constructionState.projects.map((project) => {
    if (!["scheduled", "building"].includes(project.status)) return project;
    const relevant = event.relatedRouteIds.length === 0 || project.routeIds.some((routeId) => event.relatedRouteIds.includes(routeId));
    if (!relevant) return project;
    const delayDays = metaState.current.difficulty === "hard" ? 4 : metaState.current.difficulty === "easy" ? 2 : 3;
    return {
      ...project,
      events: [
        ...project.events,
        {
          id: createId("construction-event"),
          kind: "delay",
          triggerDay: analysisStateOwner.current.dayIndex,
          delayDays,
          message: `${event.title}: 안전 점검 ${delayDays}일 추가`,
          applied: false,
        },
      ],
    };
  }));
}

function getActiveNewsEvents() {
  return newsEventState.current.filter(isNewsEventActive);
}

function getNewsOperatingCostMultiplier() {
  return getActiveNewsEvents().reduce((multiplier, event) => multiplier * event.operatingCostMultiplier, 1);
}

function openNewsScreen() {
  newsEventState.markReadWhere(isNewsEventActive);
  renderNewsFeed();
  updateNewsBadge();
  requestStateSave();
  if (newsScreen) newsScreen.hidden = false;
  document.body.classList.add("news-open");
}

function closeNewsScreen() {
  if (newsScreen) newsScreen.hidden = true;
  document.body.classList.remove("news-open");
}

function renderNewsFeed() {
  if (!newsFeed) return;
  const active = getActiveNewsEvents();
  setText(activeNewsCount, String(active.length));
  setText(opportunityNewsCount, String(active.filter((event) => event.tone === "opportunity").length));
  setText(changeNewsCount, String(active.filter((event) => event.tone === "change").length));
  const visible = (newsFilter?.value ?? "active") === "all" ? [...newsEventState.current] : active;
  if (visible.length === 0) {
    newsFeed.innerHTML = `<div class="news-empty"><strong>현재 전해진 도시 뉴스가 없습니다</strong><span>게임 시간이 흐르면 지역 행사와 도시 변화가 이곳에 정리됩니다.</span></div>`;
    return;
  }
  newsFeed.innerHTML = visible
    .sort((a, b) => b.startedDay - a.startedDay)
    .map(renderNewsCard)
    .join("");
}

function renderNewsCard(event: NewsEvent) {
  const active = isNewsEventActive(event);
  const remaining = Math.max(0, event.startedDay + event.durationDays - analysisStateOwner.current.dayIndex);
  const demandPercent = Math.round((event.demandMultiplier - 1) * 100);
  const costPercent = Math.round((event.operatingCostMultiplier - 1) * 100);
  const routeNames = event.relatedRouteIds.map((id) => networkState.routes.find((route) => route.id === id)?.name).filter(Boolean);
  const stationNames = event.relatedStationIds.map((id) => networkState.stations.find((station) => station.id === id)?.name).filter(Boolean);
  const impact = [
    demandPercent === 0 ? "" : `수요 ${demandPercent > 0 ? "+" : ""}${demandPercent}%`,
    costPercent === 0 ? "" : `운영비 +${costPercent}%`,
  ].filter(Boolean);
  return `<article class="news-card ${event.tone} ${active ? "active" : "expired"}" data-news-id="${event.id}">
    <header><div><span>${event.tone === "opportunity" ? "기회" : "도시 변화"}</span><strong>${escapeHtml(event.title)}</strong></div><em>${active ? `${remaining}일 남음` : "종료"}</em></header>
    <p>${escapeHtml(event.summary)}</p>
    <dl>
      <div><dt>발생 지역</dt><dd>${escapeHtml(event.regionName)}</dd></div>
      <div><dt>기간</dt><dd>게임 ${event.startedDay}일차부터 ${event.durationDays}일</dd></div>
      <div><dt>영향</dt><dd>${impact.length > 0 ? impact.join(" · ") : "직접 비용 변화 없음"}</dd></div>
      <div><dt>관련 교통망</dt><dd>${escapeHtml([...stationNames, ...routeNames].join(" · ") || "도시 전체")}</dd></div>
    </dl>
    <footer>
      <button type="button" data-news-command="focus">지도에서 보기</button>
      ${active ? `<button type="button" class="primary" data-news-command="respond">${event.responsePrepared ? "대응 준비됨" : escapeHtml(event.actionLabel)}</button>` : ""}
    </footer>
  </article>`;
}

function handleNewsFeedClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-news-command]");
  const card = button?.closest<HTMLElement>("[data-news-id]");
  const newsEvent = newsEventState.findById(card?.dataset.newsId);
  if (!button || !newsEvent) return;
  if (button.dataset.newsCommand === "focus") {
    focusNewsEvent(newsEvent);
    return;
  }
  prepareNewsResponse(newsEvent);
}

function focusNewsEvent(event: NewsEvent) {
  closeNewsScreen();
  if (event.relatedRouteIds[0]) {
    selectedOperationRouteId = event.relatedRouteIds[0];
    selectRoute(event.relatedRouteIds[0], false);
  }
  map.flyTo(L.latLng(event.position[0], event.position[1]), Math.max(14, map.getZoom()));
  showToast(`${event.regionName} 위치로 이동했습니다.`);
}

function prepareNewsResponse(event: NewsEvent) {
  pushHistory();
  newsEventState.prepareResponse(event.id);
  redoStack = [];
  requestStateSave();
  closeNewsScreen();
  if (event.relatedRouteIds[0]) {
    selectedOperationRouteId = event.relatedRouteIds[0];
    if (operationRouteSelect) operationRouteSelect.value = selectedOperationRouteId;
    selectRoute(selectedOperationRouteId, false);
  }
  if (event.action === "add-service") {
    if (setCountInput) setCountInput.value = "1";
    buyTrainButton?.focus();
    showToast("관련 노선을 선택하고 구매 수량을 1편성으로 설정했습니다. 구매 전 비용을 확인하세요.");
  } else if (event.action === "review-area") {
    focusNewsEvent(event);
    showToast("수요 지역으로 이동했습니다. 새 역이나 노선 연장을 직접 검토하세요.");
  } else if (event.action === "review-fare") {
    fareInput?.focus();
    showToast("현재 운임과 운영 현황을 확인하세요. 자동으로 변경하지 않았습니다.");
  } else {
    openConstructionManager();
    showToast("공사 일정과 지연 영향을 확인하세요.");
  }
  requestUpdate("notifications", selectedOperationRouteId);
}

function updateNewsBadge() {
  const unread = newsEventState.current.filter((event) => isNewsEventActive(event) && !event.read).length;
  if (newsBadge) {
    newsBadge.hidden = unread === 0;
    newsBadge.textContent = String(unread);
  }
  newsButton?.classList.toggle("has-news", unread > 0);
}

function getNetworkTitle() {
  return metaState.current.networkTitle?.trim() || `${cityConfigs[metaState.current.cityId].name} 철도망`;
}

function openStatisticsScreen() {
  operationsPanel?.open(activeStatisticsTab);
  renderStatisticsScreen();
  document.body.classList.add("statistics-open");
}

function closeStatisticsScreen() {
  operationsPanel?.close();
  document.body.classList.remove("statistics-open");
}

function saveNetworkTitle() {
  const value = networkTitleInput?.value.trim() ?? "";
  pushHistory();
  metaState.patch({ networkTitle: value || undefined });
  redoStack = [];
  requestStateSave();
  void saveCurrentSlot("철도망 제목 저장");
  renderStatisticsScreen();
  if (!diagramScreen?.hidden) renderMetroDiagram();
  showToast(value ? "철도망 제목을 저장했습니다." : `${cityConfigs[metaState.current.cityId].name} 철도망을 기본 제목으로 사용합니다.`);
}

function calculateNetworkFinancials() {
  return calculateNetworkFinancialsModel({
    economy: financeState.economy,
    routes: networkState.routes,
    depots: networkState.depots,
    fleets: operationsState.fleets,
    loans: loanState.current,
    statistics: financeState.statistics,
    stationPotentialDemand: demandState.stationDemandStates.map((state) => state.potentialDemand),
    dailyMaintenance: calculateDailyMaintenance(),
  });
}

function calculateRouteStatistics(route: RouteLine) {
  const operation = calculateRouteOperation(route.id);
  const congestionSegments = congestionRuntimeState.segmentCongestion.filter((segment) => segment.routeId === route.id);
  const groups = demandState.passengerGroups.filter((group) => group.routeIds.includes(route.id));
  const passengers = Math.round(groups.reduce((sum, group) => sum + group.activeDemand / Math.max(1, group.routeIds.length), 0));
  const totalPassengers = demandState.passengerGroups.reduce((sum, group) => sum + group.activeDemand, 0);
  const fareRevenue = totalPassengers > 0 ? Math.round((passengers / totalPassengers) * calculateNetworkFinancials().dailyRevenue) : 0;
  const maintenance = operation.operatingCost;
  const averageTravelTime =
    groups.length > 0
      ? groups.reduce((sum, group) => {
          const speed = operationsState.fleets.some((fleet) => fleet.routeId === route.id) ? weightedAverageSpeed(operationsState.fleets.filter((fleet) => fleet.routeId === route.id)) : 32;
          return sum + (group.distanceKm / speed) * 60 + group.waitMin;
        }, 0) / groups.length
      : route.lengthKm > 0
        ? (route.lengthKm / 32) * 30 + operation.waitMin
        : 0;
  const satisfaction = groups.length > 0 ? groups.reduce((sum, group) => sum + group.satisfaction, 0) / groups.length : financeState.economy.satisfaction;
  const sets = operationsState.fleets.filter((fleet) => fleet.routeId === route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  const depotCapacity = networkState.depots.filter((depot) => depot.connectedRouteIds.includes(route.id)).reduce((sum, depot) => sum + depot.capacity, 0);
  const express = operationsState.expressConfigs.find((config) => config.routeId === route.id && config.enabled);
  const expressUsage =
    express && groups.length > 0
      ? clampNumber(groups.filter((group) => group.distanceKm >= route.lengthKm * 0.35).reduce((sum, group) => sum + group.activeDemand, 0) / Math.max(1, groups.reduce((sum, group) => sum + group.activeDemand, 0)), 0, 1)
      : 0;
  return {
    route,
    operation,
    congestionSegments,
    passengers,
    fareRevenue,
    maintenance,
    netProfit: fareRevenue - maintenance,
    averageTravelTime,
    satisfaction,
    sets,
    expressUsage,
    depotCapacity,
    depotUsage: depotCapacity > 0 ? sets / depotCapacity : sets > 0 ? 1 : 0,
  };
}

function calculateStationStatistics(station: Station) {
  const stationDemandState = demandState.stationDemandStates.find((state) => state.stationId === station.id);
  const relatedGroups = demandState.passengerGroups.filter((group) => group.originStationId === station.id || group.destinationStationId === station.id);
  const boardings = relatedGroups.reduce((sum, group) => sum + group.activeDemand, 0);
  const transferPassengers = relatedGroups.filter((group) => group.routeIds.length > 1).reduce((sum, group) => sum + group.activeDemand, 0);
  const operations = station.connectedRouteIds.map((routeId) => calculateRouteOperation(routeId));
  const crowding = operations.length > 0 ? operations.reduce((sum, operation) => sum + operation.crowding, 0) / operations.length : 0;
  const waitMin = operations.length > 0 ? operations.reduce((sum, operation) => sum + (operation.waitMin || 0), 0) / operations.length : 0;
  const potentialDemand = stationDemandState?.potentialDemand ?? station.potentialDemand ?? station.demand;
  const realizedDemand = stationDemandState?.realizedDemand ?? station.realizedDemand ?? station.demand;
  const previousDemand = stationDemandState?.previousRealizedDemand ?? realizedDemand;
  const growth = previousDemand > 0 ? realizedDemand / previousDemand - 1 : 0;
  const profileWeights = [0.025, 0.018, 0.015, 0.014, 0.018, 0.035, 0.07, 0.115, 0.095, 0.055, 0.04, 0.038, 0.042, 0.04, 0.043, 0.052, 0.075, 0.105, 0.075, 0.045, 0.032, 0.025, 0.018, 0.013];
  const hourly = profileWeights.map((weight, hour) => ({ hour, passengers: Math.round(boardings * weight) }));
  return {
    station,
    boardings,
    transferPassengers,
    crowding,
    waitMin,
    potentialDemand,
    realizedDemand,
    captureRate: stationDemandState?.transitCaptureRate ?? (potentialDemand > 0 ? realizedDemand / potentialDemand : 0),
    growth,
    trend: stationDemandState?.trend ?? "stable",
    positiveReasons: stationDemandState?.positiveReasons ?? [],
    negativeReasons: stationDemandState?.negativeReasons ?? [],
    hourly,
  };
}

function openStationManager(stationId: string) {
  const station = networkState.stations.find((item) => item.id === stationId);
  if (!station || !stationPanel) return;
  selectedPlannedStationManager = null;
  selectedStationManagerId = station.id;
  renderStationManager();
}

function openPlannedStationManager(planId: string, stationId: string) {
  const plan = constructionState.plans.find((item) => item.id === planId && item.cityId === metaState.current.cityId);
  const station = plan?.stations.find((item) => item.id === stationId && !item.completed);
  if (!plan || !station || !stationPanel) return;
  activePlanId = plan.id;
  selectedStationManagerId = null;
  selectedPlannedStationManager = { planId: plan.id, stationId: station.id };
  renderPlannedStationManager();
}

function closeStationManager() {
  stationPanel?.close();
  selectedStationManagerId = null;
  selectedPlannedStationManager = null;
}

function renderStationManagerIfOpen() {
  if (!stationManagerDialog || stationManagerDialog.hidden) return;
  if (selectedPlannedStationManager) renderPlannedStationManager();
  else if (selectedStationManagerId) renderStationManager();
}

function getStationManagerMembers(station: Station) {
  return selectStationTransferInfo(station.id)?.members as Station[] ?? [station];
}

function renderStationManager() {
  const station = networkState.stations.find((item) => item.id === selectedStationManagerId);
  if (!station || !stationPanel) {
    closeStationManager();
    return;
  }
  const transferInfo = selectStationTransferInfo(station.id);
  const members = transferInfo?.members as Station[] ?? [station];
  const memberStatistics = members.map(calculateStationStatistics);
  const statistics = {
    boardings: memberStatistics.reduce((sum, item) => sum + item.boardings, 0),
    transferPassengers: transferInfo?.transferPassengers ?? 0,
    crowding: memberStatistics.reduce((sum, item) => sum + item.crowding, 0) / members.length,
    waitMin: memberStatistics.reduce((sum, item) => sum + item.waitMin, 0) / members.length,
    growth: memberStatistics.reduce((sum, item) => sum + item.growth, 0) / members.length,
    potentialDemand: memberStatistics.reduce((sum, item) => sum + item.potentialDemand, 0),
    realizedDemand: memberStatistics.reduce((sum, item) => sum + item.realizedDemand, 0),
  };
  const transfer = transferInfo?.transferLinks[0];
  const routesForStation = transferInfo?.connectedLines ?? [];
  const operational = members.every((item) => isStationOperational(item.id));
  const stationName = Array.from(new Set(members.map((item) => item.name))).join(" · ");
  const combinedDemand = statistics.realizedDemand;
  const captureRate = statistics.potentialDemand > 0 ? combinedDemand / statistics.potentialDemand : 0;
  const reasonEntries = [
    ...memberStatistics.flatMap((item) => item.positiveReasons.map((reason) => ({ reason, positive: true }))),
    ...memberStatistics.flatMap((item) => item.negativeReasons.map((reason) => ({ reason, positive: false }))),
  ].filter((entry, index, source) => source.findIndex((candidate) => candidate.reason === entry.reason) === index).slice(0, 3);
  const trend = statistics.growth > 0.003 ? "상승" : statistics.growth < -0.003 ? "하락" : "유지";
  const growth = statistics.growth >= 0.03 ? `+${Math.round(statistics.growth * 100)}%` : `${Math.round(statistics.growth * 100)}%`;
  stationPanel.renderView({
    entityId: station.id,
    title: stationName,
    name: stationName,
    status: operational ? "operational" : "building",
    statusLabel: operational ? "운영 중" : "공사·설치 중",
    metrics: [
      { label: "일일 승하차", value: `${statistics.boardings.toLocaleString("ko-KR")}명` },
      { label: "지역 잠재 수요", value: `${statistics.potentialDemand.toLocaleString("ko-KR")}명` },
      { label: "실제 일간 이용객", value: `${combinedDemand.toLocaleString("ko-KR")}명` },
      { label: "철도 이용 전환율", value: `${Math.round(captureRate * 100)}%` },
      { label: "환승 승객", value: `${statistics.transferPassengers.toLocaleString("ko-KR")}명` },
      { label: "혼잡도", value: statistics.crowding > 0 ? `${Math.round(statistics.crowding * 100)}%` : "-" },
      { label: "평균 대기", value: statistics.waitMin > 0 ? `${statistics.waitMin.toFixed(1)}분` : "-" },
      { label: "전일 대비", value: growth, tone: statistics.growth < 0 ? "down" : "up" },
      { label: "현재 추세", value: trend, tone: statistics.growth < 0 ? "down" : "up" },
    ],
    reasons: reasonEntries.map((entry) => ({ text: entry.reason, positive: entry.positive })),
    reasonsNote: "서비스 조건이 안정적입니다.",
    routes: routesForStation.map((route) => ({ name: route.name, color: route.color, status: formatTransferRouteStatus(route) })),
    transferKind: transferInfo?.isTransfer ? "환승역" : "일반역",
    transfer: transferInfo?.isTransfer ? {
      metrics: [
        { label: "평균 환승시간", value: `${transferInfo.transferTimeMin.toFixed(1)}분` },
        { label: "환승저항", value: formatTransferResistance(transferInfo.transferResistance) },
        { label: "일간 환승객", value: `${Math.round(transferInfo.transferPassengers).toLocaleString("ko-KR")}명` },
        { label: "환승 혼잡도", value: `${Math.round(transferInfo.transferCrowding * 100)}%` },
      ],
      notes: [`${transferInfo.automatic === true ? "자동 생성 환승" : transferInfo.automatic === false ? "사용자 지정 환승" : "동일 역 노선 환승"} · ${formatTransferOperationalStatus(transferInfo.operationalStatus)}`],
      pairs: transferInfo.transferPairs.map(([firstId, secondId]) => {
        const first = transferInfo.connectedLines.find((route) => route.id === firstId);
        const second = transferInfo.connectedLines.find((route) => route.id === secondId);
        return `${first?.name ?? firstId} ↔ ${second?.name ?? secondId}`;
      }),
      warning: transferInfo.integrityIssues.length > 0 ? `연결 데이터 점검 필요 · ${transferInfo.integrityIssues.length}건` : undefined,
    } : undefined,
    transferNote: "현재 연결된 환승 시설이 없습니다.",
    dangerTitle: transfer ? "환승역 전체 철거" : "역 철거",
    dangerDescription: transfer ? `${members.length}개 노선 역을 하나의 환승역으로 함께 철거합니다.` : "이 역과 관련된 운행·환승 참조를 정리합니다.",
    dangerAction: transfer ? "환승역 철거" : "역 철거",
  }, handleStationManagerClick);
}

function renderPlannedStationManager() {
  const selection = selectedPlannedStationManager;
  const plan = selection ? constructionState.plans.find((item) => item.id === selection.planId && item.cityId === metaState.current.cityId) : undefined;
  const station = plan?.stations.find((item) => item.id === selection?.stationId && !item.completed);
  if (!plan || !station || !stationPanel) {
    closeStationManager();
    return;
  }
  const plannedRoutes = station.plannedRouteIds
    .map((routeId) => plan.routes.find((route) => route.id === routeId))
    .filter(Boolean) as PlannedRoute[];
  const actualRoutes = station.actualRouteIds
    .map((routeId) => networkState.routes.find((route) => route.id === routeId))
    .filter(Boolean) as RouteLine[];
  const transferCount = plan.transfers.filter((transfer) => !transfer.completed && transfer.stationIds.includes(station.id)).length;
  stationPanel.renderView({
    entityId: `planned-station:${plan.id}:${station.id}`,
    title: station.name,
    name: station.name,
    editableName: false,
    status: "planned",
    statusLabel: "계획 중",
    metrics: [
      { label: "예상 수요", value: `${station.expectedDemand.toLocaleString("ko-KR")}명` },
      { label: "계획 노선", value: `${plannedRoutes.length}개` },
      { label: "기존 연결 노선", value: `${actualRoutes.length}개` },
    ],
    reasons: [],
    reasonsNote: `계획안 · ${plan.name}. 운영 통계는 건설 후 생성됩니다.`,
    routes: [
      ...plannedRoutes.map((route) => ({ name: route.name, color: route.color, status: "계획 노선" })),
      ...actualRoutes.map((route) => ({ name: route.name, color: route.color, status: "기존 노선" })),
    ],
    transferKind: transferCount > 0 ? "예정 환승" : "없음",
    transferNote: transferCount > 0 ? `이 역을 포함한 환승 계획 ${transferCount}건` : "현재 연결된 환승 계획이 없습니다.",
    dangerTitle: "계획역 삭제",
    dangerDescription: "이 계획역만 삭제하며 연결된 계획 노선과 다른 시설은 유지합니다.",
    dangerAction: "계획역 삭제",
    dangerActionId: "delete-planned",
  }, handleStationManagerClick);
}

function selectStationTransferInfo(stationId: string) {
  return getStationTransferInfo({
    stationId,
    stations: [...networkState.stations],
    routes: networkState.routes.map((route) => ({
      id: route.id,
      name: route.name,
      color: route.color,
      operational: isRouteOperational(route.id),
      paused: Boolean(route.operationPaused),
      underConstruction: !isRouteOperational(route.id) || route.visibility === "planning",
    })),
    transfers: [...networkState.transfers],
    passengerGroups: [...demandState.passengerGroups],
  });
}

function formatTransferRouteStatus(route: { operational: boolean; paused: boolean; underConstruction: boolean }) {
  if (route.underConstruction) return "공사 중";
  if (route.paused) return "운행 중지";
  return route.operational ? "운행 중" : "폐쇄";
}

function formatTransferResistance(value: number) {
  const label = value < 25 ? "낮음" : value < 55 ? "보통" : "높음";
  return `${label} · ${value.toFixed(1)}`;
}

function formatTransferOperationalStatus(status: "operational" | "partial" | "closed" | "invalid") {
  return {
    operational: "모든 환승 경로 운영 중",
    partial: "일부 노선 공사·운행 중지",
    closed: "환승 경로 이용 불가",
    invalid: "연결 데이터 불일치",
  }[status];
}

function handleStationManagerClick(event: Event) {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-station-manager-action]");
  const action = target?.dataset.stationManagerAction;
  if (!action) return;
  if (selectedPlannedStationManager) {
    if (action !== "delete-planned") return;
    const { planId, stationId } = selectedPlannedStationManager;
    const plan = constructionState.plans.find((item) => item.id === planId && item.cityId === metaState.current.cityId);
    const station = plan?.stations.find((item) => item.id === stationId && !item.completed);
    if (!plan || !station) return;
    openDecisionDialog(
      `“${station.name}” 계획역을 삭제할까요?`,
      "이 계획역만 삭제하며 연결된 계획 노선과 다른 시설은 유지합니다. 계획 환승 연결이 있으면 함께 정리됩니다.",
      "계획역 삭제",
      () => {
        closeStationManager();
        deletePlannedStation(plan.id, station.id);
      },
    );
    return;
  }
  if (!selectedStationManagerId) return;
  const selectedStation = networkState.stations.find((station) => station.id === selectedStationManagerId);
  if (!selectedStation) return;
  if (action === "delete") {
    const members = getStationManagerMembers(selectedStation);
    const routeNames = Array.from(new Set(members.flatMap((station) => station.connectedRouteIds)))
      .map((id) => networkState.routes.find((route) => route.id === id)?.name)
      .filter(Boolean);
    openDecisionDialog(
      `“${selectedStation.name}” ${members.length > 1 ? "환승역" : "역"}을 철거할까요?`,
      `${members.length > 1 ? `관리상 하나로 묶인 역 ${members.length}개를 함께 철거합니다.` : "역을 철거하고 관련 참조를 정리합니다."}${routeNames.length > 0 ? ` 영향 노선: ${routeNames.join(", ")}.` : ""}`,
      members.length > 1 ? "환승역 철거" : "역 철거",
      () => {
        closeStationManager();
        demolishStations(members.map((station) => station.id));
      },
    );
    return;
  }
  if (action !== "save-name") return;
  const input = document.querySelector<HTMLInputElement>("#stationManagerName");
  const name = input?.value.trim();
  if (!name) {
    showToast("역 이름을 입력해 주세요.");
    return;
  }
  const memberIds = new Set(selectedStation ? getStationManagerMembers(selectedStation).map((station) => station.id) : []);
  networkState.stations = networkState.stations.map((station) => memberIds.has(station.id) ? { ...station, name } : station);
  requestStateSave();
  renderStationManager();
  requestUpdate("station-label", selectedStationManagerId);
  showToast("역 이름을 저장했습니다.");
}

function openDepotManager(depotId: string) {
  const depot = networkState.depots.find((item) => item.id === depotId);
  if (!depot || !depotPanel) return;
  selectedDepotManagerId = depot.id;
  renderDepotManager();
}

function closeDepotManager() {
  depotPanel?.close();
}

function renderDepotManager() {
  const depot = networkState.depots.find((item) => item.id === selectedDepotManagerId);
  if (!depot || !depotPanel) {
    closeDepotManager();
    return;
  }
  const connectedRoutes = depot.connectedRouteIds.map((id) => networkState.routes.find((route) => route.id === id)).filter(Boolean) as RouteLine[];
  const assignedSets = operationsState.fleets
    .filter((fleet) => depot.connectedRouteIds.includes(fleet.routeId))
    .reduce((sum, fleet) => sum + fleet.sets, 0);
  const operational = isDepotOperational(depot.id);
  const expansion = getCurrentDepotExpansionQuote(depot);
  const availableSets = Math.max(0, depot.capacity - assignedSets);
  depotPanel.renderView({
    entityId: depot.id,
    title: depot.name,
    operational,
    level: depot.level,
    area: depot.areaHa.toFixed(1),
    capacity: depot.capacity,
    assignedSets,
    availableSets,
    maintenance: formatCost(depot.maintenanceCost),
    routes: connectedRoutes.map((route) => ({ name: route.name, color: route.color })),
    maxLevel: maxDepotLevel,
    expansionCost: formatCost(expansion.cost),
    expansionDisabled: Boolean(expansion.reason),
    expansionDescription: expansion.reason ?? `레벨 ${depot.level} → ${expansion.nextLevel} · ${depot.capacity} → ${calculateDepotCapacity(depot.areaHa, expansion.nextLevel)}편성 · 즉시 반영`,
  }, handleDepotManagerClick);
}

function handleDepotManagerClick(event: Event) {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-depot-manager-action]");
  const action = target?.dataset.depotManagerAction;
  if (!action || !selectedDepotManagerId) return;
  const depot = networkState.depots.find((item) => item.id === selectedDepotManagerId);
  if (!depot) return;
  if (action === "delete") {
    openDecisionDialog(
      `“${depot.name}” 차량기지를 철거할까요?`,
      `${depot.connectedRouteIds.length > 0 ? `연결 노선 ${depot.connectedRouteIds.length}개의 차량기지 참조가 해제됩니다.` : "차량기지와 관련 공사 참조를 정리합니다."}`,
      "차량기지 철거",
      () => {
        closeDepotManager();
        demolishDepots([depot.id]);
      },
    );
    return;
  }
  if (action !== "expand") return;
  requestDepotExpansion(depot.id);
}

function demolishDepots(depotIdsToRemove: string[]) {
  const removedIds = new Set(depotIdsToRemove);
  if (removedIds.size === 0) return;
  pushHistory();
  networkState.depots = networkState.depots.filter((depot) => !removedIds.has(depot.id));
  constructionState.replaceProjects(constructionState.projects
    .map((project) => ({ ...project, depotIds: project.depotIds.filter((id) => !removedIds.has(id)) }))
    .filter((project) => project.routeIds.length > 0 || project.stationIds.length > 0 || project.depotIds.length > 0));
  redoStack = [];
  requestStateSave("immediate");
  requestUpdate("blueprint-preview", selectedRouteId ?? undefined);
  showToast(`${removedIds.size}개 차량기지를 철거했습니다.`);
  playFeedback("confirm");
}

function renderStatisticsScreen() {
  const city = cityConfigs[metaState.current.cityId];
  setText(statisticsNetworkTitle, getNetworkTitle());
  setText(statisticsCityLabel, city.name);
  setText(
    statisticsSaveMeta,
    `${metaState.current.slotName} · ${metaState.current.mode === "sandbox" ? "샌드박스" : "커리어"} · ${difficultyConfigs[metaState.current.difficulty].label} · 플레이 ${formatPlayTime(metaState.current.playTimeSeconds ?? 0)}`,
  );
  if (networkTitleInput && document.activeElement !== networkTitleInput) networkTitleInput.value = metaState.current.networkTitle ?? "";
  statisticsTabs.forEach((button) => {
    const active = button.dataset.statisticsTab === activeStatisticsTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!operationsPanel) return;
  const html =
    activeStatisticsTab === "routes"
      ? renderRouteStatistics()
      : activeStatisticsTab === "stations"
        ? renderStationStatistics()
        : activeStatisticsTab === "city"
          ? renderCityStatistics()
          : renderOverviewStatistics();
  operationsPanel.render(html, handleStatisticsClick);
}

function renderOverviewStatistics() {
  const finances = calculateNetworkFinancials();
  const totalSets = operationsState.fleets.reduce((sum, fleet) => sum + fleet.sets, 0);
  const totalLength = networkState.routes.reduce((sum, route) => sum + route.lengthKm, 0);
  const transferStationIds = new Set(networkState.transfers.flatMap((transfer) => transfer.stationIds));
  const previous = financeState.statistics.dailyRecords.at(-2);
  const latest = financeState.statistics.dailyRecords.at(-1);
  const passengerChange = latest && previous && previous.passengers > 0 ? (latest.passengers / previous.passengers - 1) * 100 : null;
  const profitChange = latest && previous && Math.abs(previous.revenue - previous.expenses) > 0 ? ((latest.revenue - latest.expenses) / Math.abs(previous.revenue - previous.expenses) - 1) * 100 : null;
  const cards = [
    ["현재 자금", formatSignedCost(financeState.economy.cash), null],
    ["총자산", formatCost(finances.assets), null],
    ["총부채", formatCost(finances.liabilities), null],
    ["대출 상환액", `${formatCost(financeState.statistics.totalLoanRepaid)} 누적`, null],
    ["일간 수익", formatCost(finances.dailyRevenue), null],
    ["일간 지출", formatCost(finances.dailyExpenses), null],
    ["월간 수익", formatCost(finances.monthlyRevenue), null],
    ["월간 지출", formatCost(finances.monthlyExpenses), null],
    ["순이익", formatSignedCost(finances.dailyRevenue - finances.dailyExpenses), profitChange],
    ["누적 승객", `${financeState.statistics.totalPassengers.toLocaleString("ko-KR")}명`, passengerChange],
    ["시민 만족도", `${financeState.economy.satisfaction}점`, null],
    ["대중교통 이용률", `${Math.round(finances.transitShare * 100)}%`, null],
  ] as Array<[string, string, number | null]>;
  return `<div class="statistics-page">
    <section class="statistics-hero">
      <div><span>오늘의 순이익</span><strong class="${finances.dailyRevenue - finances.dailyExpenses >= 0 ? "positive" : "negative"}">${formatSignedCost(finances.dailyRevenue - finances.dailyExpenses)}</strong><em>수익 ${formatCost(finances.dailyRevenue)} · 지출 ${formatCost(finances.dailyExpenses)}</em></div>
      ${renderMiniTrend(financeState.statistics.dailyRecords.slice(-14).map((item) => item.revenue - item.expenses), "최근 순이익")}
    </section>
    <section><div class="statistics-section-heading"><div><span>FINANCE & RIDERSHIP</span><h3>운영 핵심 지표</h3></div><em>최근 변화가 있는 값만 증감률을 표시합니다</em></div>
      <div class="statistics-metric-grid">${cards.map(([label, value, change]) => renderMetricCard(label, value, change)).join("")}</div>
    </section>
    <details class="statistics-details"><summary>철도망 규모 자세히 보기</summary>
      <div class="statistics-metric-grid compact">
        ${renderMetricCard("보유 열차", `${totalSets}편성`, null)}
        ${renderMetricCard("총 노선 길이", `${totalLength.toFixed(1)}km`, null)}
        ${renderMetricCard("노선", `${networkState.routes.length}개`, null)}
        ${renderMetricCard("역", `${networkState.stations.length}개`, null)}
        ${renderMetricCard("환승역", `${transferStationIds.size}개`, null)}
        ${renderMetricCard("차량기지", `${networkState.depots.length}개`, null)}
      </div>
    </details>
    <section class="save-information">
      <div class="statistics-section-heading"><div><span>SAVE INFORMATION</span><h3>세이브 정보</h3></div></div>
      <dl>
        <div><dt>세이브 이름</dt><dd>${escapeHtml(metaState.current.slotName)}</dd></div>
        <div><dt>게임 설정</dt><dd>${metaState.current.mode === "sandbox" ? "샌드박스" : "커리어"} · ${difficultyConfigs[metaState.current.difficulty].label}</dd></div>
        <div><dt>현재 도시</dt><dd>${cityConfigs[metaState.current.cityId].name}</dd></div>
        <div><dt>생성 날짜</dt><dd>${formatDate(metaState.current.createdAt)}</dd></div>
        <div><dt>마지막 플레이</dt><dd>${formatDate(metaState.current.updatedAt, true)}</dd></div>
        <div><dt>플레이 시간</dt><dd>${formatPlayTime(metaState.current.playTimeSeconds ?? 0)}</dd></div>
      </dl>
    </section>
  </div>`;
}

function renderRouteStatistics() {
  if (networkState.routes.length === 0) return renderStatisticsEmpty("노선 통계가 없습니다", "노선을 건설하면 승객과 수익, 배차 통계가 표시됩니다.");
  if (!networkState.routes.some((route) => route.id === selectedStatisticsRouteId)) selectedStatisticsRouteId = networkState.routes[0].id;
  const routeStats = networkState.routes.map(calculateRouteStatistics);
  const selected = routeStats.find((item) => item.route.id === selectedStatisticsRouteId)!;
  return `<div class="statistics-split">
    <aside class="statistics-entity-list">
      ${routeStats.map((item) => `<button type="button" data-stat-route="${item.route.id}" class="${item.route.id === selected.route.id ? "active" : ""}">
        <i style="--entity-color:${escapeHtml(item.route.color)}"></i><span><strong>${escapeHtml(item.route.name)}</strong><em>${item.passengers.toLocaleString("ko-KR")}명 · ${formatSignedCost(item.netProfit)}</em></span>
      </button>`).join("")}
    </aside>
    <article class="statistics-detail">
      <header><div><span>ROUTE DETAIL</span><h3>${escapeHtml(selected.route.name)}</h3></div><button type="button" data-focus-route="${selected.route.id}">지도에서 보기</button></header>
      <div class="statistics-metric-grid compact">
        ${renderMetricCard("승객 수", `${selected.passengers.toLocaleString("ko-KR")}명`, null)}
        ${renderMetricCard("운임 수익", formatCost(selected.fareRevenue), null)}
        ${renderMetricCard("유지비", formatCost(selected.maintenance), null)}
        ${renderMetricCard("순이익", formatSignedCost(selected.netProfit), null)}
        ${renderMetricCard("혼잡도", `${Math.round(selected.operation.crowding * 100)}%`, null)}
        ${renderMetricCard("평균 대기", selected.operation.waitMin > 0 ? `${selected.operation.waitMin.toFixed(1)}분` : "-", null)}
        ${renderMetricCard("평균 이동", `${selected.averageTravelTime.toFixed(1)}분`, null)}
        ${renderMetricCard("시민 만족도", `${Math.round(selected.satisfaction)}점`, null)}
        ${renderMetricCard("열차 편성", `${selected.sets}편성`, null)}
        ${renderMetricCard("배차 간격", selected.operation.headwayMin > 0 ? `${selected.operation.headwayMin.toFixed(1)}분` : "-", null)}
        ${renderMetricCard("급행 이용률", `${Math.round(selected.expressUsage * 100)}%`, null, true)}
        ${renderMetricCard("기지 사용률", selected.depotCapacity > 0 ? `${Math.round(selected.depotUsage * 100)}%` : "미연결", null)}
      </div>
      ${renderProgressComparison([
        ["혼잡도", selected.operation.crowding, 1.4],
        ["기지 사용률", selected.depotUsage, 1],
        ["급행 이용률", selected.expressUsage, 1],
      ])}
    </article>
  </div>`;
}

function renderStationStatistics() {
  if (networkState.stations.length === 0) return renderStatisticsEmpty("역 통계가 없습니다", "역을 설치하면 승하차와 시간대별 이용량이 표시됩니다.");
  if (!networkState.stations.some((station) => station.id === selectedStatisticsStationId)) selectedStatisticsStationId = [...networkState.stations].sort((a, b) => b.demand - a.demand)[0].id;
  const ranked = [...networkState.stations].map(calculateStationStatistics).sort((a, b) => b.boardings - a.boardings);
  const selected = ranked.find((item) => item.station.id === selectedStatisticsStationId)!;
  const maxHourly = Math.max(1, ...selected.hourly.map((item) => item.passengers));
  const trendLabel = selected.trend === "rising" ? "상승" : selected.trend === "falling" ? "하락" : "유지";
  return `<div class="statistics-split">
    <aside class="statistics-entity-list">
      ${ranked.map((item) => `<button type="button" data-stat-station="${item.station.id}" class="${item.station.id === selected.station.id ? "active" : ""}">
        <span><strong>${escapeHtml(item.station.name)}</strong><em>${item.boardings.toLocaleString("ko-KR")}명 · ${item.station.connectedRouteIds.length}개 노선</em></span>
      </button>`).join("")}
    </aside>
    <article class="statistics-detail">
      <header><div><span>STATION DETAIL</span><h3>${escapeHtml(selected.station.name)}</h3></div><button type="button" data-focus-station="${selected.station.id}">지도에서 보기</button></header>
      <div class="statistics-metric-grid compact">
        ${renderMetricCard("승하차 인원", `${selected.boardings.toLocaleString("ko-KR")}명`, null)}
        ${renderMetricCard("환승 인원", `${selected.transferPassengers.toLocaleString("ko-KR")}명`, null)}
        ${renderMetricCard("혼잡도", `${Math.round(selected.crowding * 100)}%`, null)}
        ${renderMetricCard("지역 잠재 수요", `${selected.potentialDemand.toLocaleString("ko-KR")}명`, null, true)}
        ${renderMetricCard("실제 일간 이용객", `${selected.realizedDemand.toLocaleString("ko-KR")}명`, null)}
        ${renderMetricCard("철도 이용 전환율", `${Math.round(selected.captureRate * 100)}%`, null)}
        ${renderMetricCard("연결 노선", `${selected.station.connectedRouteIds.length}개`, null)}
        ${renderMetricCard("평균 대기", selected.waitMin > 0 ? `${selected.waitMin.toFixed(1)}분` : "-", null)}
        ${renderMetricCard("전일 대비", `${selected.growth >= 0 ? "+" : ""}${(selected.growth * 100).toFixed(1)}%`, selected.growth * 100)}
        ${renderMetricCard("현재 추세", trendLabel, selected.growth * 100)}
      </div>
      <section class="hourly-chart"><div class="statistics-section-heading"><div><span>HOURLY USE</span><h3>시간대별 이용량</h3></div><em>현재 일 수요 기반 추정</em></div>
        <div>${selected.hourly.map((item) => `<i style="height:${Math.max(3, (item.passengers / maxHourly) * 100)}%" title="${item.hour}시 ${item.passengers.toLocaleString("ko-KR")}명"><span>${item.hour % 3 === 0 ? item.hour : ""}</span></i>`).join("")}</div>
      </section>
      <div class="connected-route-chips">${selected.station.connectedRouteIds.map((id) => {
        const route = networkState.routes.find((item) => item.id === id);
        return route ? `<button type="button" data-focus-route="${route.id}" style="--entity-color:${escapeHtml(route.color)}">${escapeHtml(route.name)}</button>` : "";
      }).join("")}</div>
    </article>
  </div>`;
}

function renderCityStatistics() {
  const finances = calculateNetworkFinancials();
  const city = cityConfigs[metaState.current.cityId];
  const center = L.latLng(city.center);
  const oldSnapshot = [...analysisStateOwner.current.demandHistory].reverse().find((snapshot) => snapshot.day <= analysisStateOwner.current.dayIndex - 7);
  const regions = [
    { key: "nw", label: "북서", current: 0, previous: 0 },
    { key: "ne", label: "북동", current: 0, previous: 0 },
    { key: "sw", label: "남서", current: 0, previous: 0 },
    { key: "se", label: "남동", current: 0, previous: 0 },
  ];
  for (const station of networkState.stations) {
    const north = station.position[0] >= center.lat;
    const east = station.position[1] >= center.lng;
    const region = regions.find((item) => item.key === `${north ? "n" : "s"}${east ? "e" : "w"}`)!;
    region.current += station.demand;
    region.previous += oldSnapshot?.stationDemand[station.id] ?? station.demand;
  }
  const networkPotential = demandState.stationDemandStates.reduce((sum, state) => sum + state.potentialDemand, 0);
  const networkRealized = demandState.stationDemandStates.reduce((sum, state) => sum + state.realizedDemand, 0);
  const captureRate = networkPotential > 0 ? networkRealized / networkPotential : 0;
  const congested = networkState.stations
    .map(calculateStationStatistics)
    .filter((item) => item.crowding >= 0.9)
    .sort((a, b) => b.crowding - a.crowding)
    .slice(0, 4);
  const plannedCoverage = constructionState.plans.flatMap((plan) => plan.stations.filter((station) => !station.completed).map((station) => ({ ...station, planName: plan.name }))).slice(0, 4);
  const unlocked = metaState.current.unlockedCityIds.length;
  return `<div class="statistics-page">
    <section class="city-stat-hero">
      <div><span>${escapeHtml(city.name)} 실제 철도 이용객</span><strong>${networkRealized.toLocaleString("ko-KR")}</strong><em>고정 지역 잠재 수요 ${networkPotential.toLocaleString("ko-KR")}명</em></div>
      <div class="statistics-metric-grid compact">
        ${renderMetricCard("대중교통 이용률", `${Math.round(finances.transitShare * 100)}%`, null)}
        ${renderMetricCard("시민 만족도", `${financeState.economy.satisfaction}점`, null)}
        ${renderMetricCard("철도 이용 전환율", `${Math.round(captureRate * 100)}%`, null, true)}
        ${renderMetricCard("해금 진행도", `${unlocked}/${Object.keys(cityConfigs).length}`, null)}
      </div>
    </section>
    <section><div class="statistics-section-heading"><div><span>REGIONAL DEMAND</span><h3>지역별 수요 변화</h3></div><em>최근 7일 기준</em></div>
      <div class="region-grid">${regions.map((region) => {
        const change = region.previous > 0 ? (region.current / region.previous - 1) * 100 : 0;
        return `<article><span>${region.label}</span><strong>${region.current.toLocaleString("ko-KR")}</strong><em class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</em></article>`;
      }).join("")}</div>
    </section>
    <div class="city-detail-grid">
      <section><div class="statistics-section-heading"><div><span>CONGESTION</span><h3>혼잡 지역</h3></div></div>
        <div class="statistics-ranked-list">${congested.length > 0 ? congested.map((item) => `<button type="button" data-focus-station="${item.station.id}"><strong>${escapeHtml(item.station.name)}</strong><span>혼잡 ${Math.round(item.crowding * 100)}%</span></button>`).join("") : `<p>현재 뚜렷한 혼잡 지역이 없습니다.</p>`}</div>
      </section>
      <section><div class="statistics-section-heading"><div><span>PLANNED COVERAGE</span><h3>계획 노선 서비스 후보</h3></div></div>
        <div class="statistics-ranked-list">${plannedCoverage.length > 0 ? plannedCoverage.map((item) => `<button type="button" data-open-plan="${item.planName}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.planName)} · 예상 이용 수요 ${item.expectedDemand.toLocaleString("ko-KR")}</span></button>`).join("") : `<p>현재 계획된 서비스 후보가 없습니다.</p>`}</div>
      </section>
    </div>
  </div>`;
}

function handleStatisticsClick(event: Event) {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;
  if (target.dataset.statRoute) {
    selectedStatisticsRouteId = target.dataset.statRoute;
    renderStatisticsScreen();
  } else if (target.dataset.statStation) {
    selectedStatisticsStationId = target.dataset.statStation;
    renderStatisticsScreen();
  } else if (target.dataset.focusRoute) {
    closeStatisticsScreen();
    selectRoute(target.dataset.focusRoute);
    showToast("선택한 노선을 지도에서 표시했습니다.");
  } else if (target.dataset.focusStation) {
    const station = networkState.stations.find((item) => item.id === target.dataset.focusStation);
    if (!station) return;
    closeStatisticsScreen();
    map.flyTo(L.latLng(station.position[0], station.position[1]), Math.max(15, map.getZoom()));
    requestUpdate("selection", station.id);
    showToast("선택한 역으로 이동했습니다.");
  } else if (target.dataset.openPlan) {
    activePlanId = constructionState.plans.find((plan) => plan.name === target.dataset.openPlan)?.id ?? activePlanId;
    closeStatisticsScreen();
    openPlanningDialog();
  }
}

function renderMetricCard(label: string, value: string, change: number | null, estimated = false) {
  const changeMarkup =
    change === null || !Number.isFinite(change)
      ? ""
      : Math.abs(change) < 0.05
        ? `<em>변화 없음</em>`
      : `<em class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%</em>`;
  return `<article class="statistics-metric"><span>${escapeHtml(label)}${estimated ? `<small>추정</small>` : ""}</span><strong>${escapeHtml(value)}</strong>${changeMarkup}</article>`;
}

function renderMiniTrend(values: number[], label: string) {
  if (values.length < 2) return `<div class="mini-trend empty"><span>${escapeHtml(label)}</span><strong>추세 수집 중</strong></div>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return `<div class="mini-trend"><span>${escapeHtml(label)}</span><div>${values.map((value) => `<i style="height:${12 + ((value - min) / range) * 88}%"></i>`).join("")}</div></div>`;
}

function renderProgressComparison(items: Array<[string, number, number]>) {
  return `<section class="statistics-progress">${items.map(([label, value, max]) => `<div><span>${escapeHtml(label)}</span><i><b style="width:${Math.min(100, Math.max(0, (value / max) * 100))}%"></b></i><strong>${Math.round(value * 100)}%</strong></div>`).join("")}</section>`;
}

function renderStatisticsEmpty(title: string, message: string) {
  return `<div class="statistics-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
}

function interpolateAlongRoute(points: LatLng[], progress: number) {
  if (points.length === 0) return L.latLng(SEOUL);
  if (points.length === 1) return points[0];
  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const length = map.distance(points[i - 1], points[i]);
    segmentLengths.push(length);
    total += length;
  }
  let target = total * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < segmentLengths.length; i += 1) {
    if (target <= segmentLengths[i]) {
      const ratio = segmentLengths[i] === 0 ? 0 : target / segmentLengths[i];
      return L.latLng(points[i].lat + (points[i + 1].lat - points[i].lat) * ratio, points[i].lng + (points[i + 1].lng - points[i].lng) * ratio);
    }
    target -= segmentLengths[i];
  }
  return points[points.length - 1];
}

function weightedAverageSpeed(fleets: TrainFleet[]) {
  const totalSets = fleets.reduce((sum, fleet) => sum + fleet.sets, 0);
  if (totalSets === 0) return 32;
  return fleets.reduce((sum, fleet) => sum + trainCatalog[fleet.trainType].speedKmh * fleet.sets, 0) / totalSets;
}

function getExpressConfig(routeId: string): ExpressConfig {
  const existing = operationsState.expressConfigs.find((config) => config.routeId === routeId);
  if (existing) return existing;
  const routeStationIds = networkState.stations
    .filter((station) => station.connectedRouteIds.includes(routeId))
    .map((station) => station.id);
  const stopStationIds = normalizeServiceStops(routeStationIds, []);
  return {
    routeId,
    unlocked: false,
    enabled: false,
    stopStationIds,
    unlockCost: 18000,
    extraOperatingCost: 650,
  };
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function updateOperationHud() {
  const targetRoute = selectedRouteId ? networkState.routes.find((item) => item.id === selectedRouteId) : null;
  if (!targetRoute) {
    hudRenderer.updateMany({ headway: "-", crowding: "-", wait: "-" });
    return;
  }
  const operation = calculateRouteOperation(targetRoute.id);
  hudRenderer.updateMany({
    headway: operation.headwayMin > 0 ? `${operation.headwayMin.toFixed(1)}분` : "열차 없음",
    crowding: operation.hourlyCapacity > 0 ? `${Math.round(operation.crowding * 100)}%` : "-",
    wait: operation.waitMin > 0 ? `${operation.waitMin.toFixed(1)}분` : "-",
  });
}

/**
 * 역 수요를 출발-도착 승객 그룹으로 재구성한다.
 * 개별 승객을 시뮬레이션하지 않고 집단 단위로 계산해 노선 탐색 비용을 제한한다.
 */
function buildPassengerRoutingNetwork(): RoutingNetwork {
  const operationalStations = networkState.stations.filter((station) => isStationOperational(station.id));
  const services: RoutingNetwork["services"] = operationsState.services.flatMap((service) => {
    const ownerRoute = networkState.routes.find((route) => route.id === service.ownerRouteId);
    if (!ownerRoute || service.pathCoordinates.length < 2) return [];
    if (service.routeIds.some((id) => {
      const route = networkState.routes.find((item) => item.id === id);
      return !route || !isRouteOperational(id) || hasRouteGaps(route) || route.operationPaused || route.visibility === "planning";
    })) return [];
    const operation = getOperatingServiceOperation(service);
    const stopStationIds = service.stopStationIds.filter((id) => operationalStations.some((station) => station.id === id));
    if (!operation.enabled || operation.hourlyCapacity <= 0 || stopStationIds.length < 2) return [];
    return [{
      id: service.id,
      routeId: service.ownerRouteId,
      kind: "local" as const,
      paths: [{ id: service.pathOptionId || `${service.id}:path`, coordinates: service.pathCoordinates }],
      stopStationIds,
      speedKph: operation.averageSpeedKph,
      headwayMin: operation.headwayMin,
      crowding: congestionRuntimeState.routeCongestionSummaries.find((summary) => summary.routeId === service.ownerRouteId)?.representativeCrowding ?? 0,
    }];
  });
  return {
    stations: operationalStations.map((station) => ({
      id: station.id,
      position: station.position,
      routeIds: station.connectedRouteIds,
    })),
    services,
    transfers: networkState.transfers
      .map((transfer) => ({
        id: transfer.id,
        stationIds: transfer.stationIds.filter((id) => operationalStations.some((station) => station.id === id)),
        walkMin: transfer.transferTimeMin,
        resistance: transfer.resistance,
      }))
      .filter((transfer) => transfer.stationIds.length >= 2),
    physicalLinks: getCompletedPhysicalRoutingLinks(),
  };
}

function getCompletedPhysicalRoutingLinks() {
  return constructionState.plans
    .flatMap((plan) => plan.connections ?? [])
    .filter((connection) =>
      connection.status === "completed" &&
      Boolean(connection.appliedAt) &&
      connection.connectionType === "physical-track" &&
      Boolean(connection.sourceStationId && connection.targetStationId && connection.sourceLineId && connection.targetLineId),
    )
    .map((connection) => {
      const coordinates = connection.coordinates ?? [];
      const distanceKm = coordinates.length >= 2
        ? calculateLengthKmPrecise(coordinates.map((point) => L.latLng(point.lat, point.lng)))
        : 0.2;
      return {
        id: connection.id,
        sourceStationId: connection.sourceStationId!,
        targetStationId: connection.targetStationId!,
        sourceRouteId: connection.sourceLineId!,
        targetRouteId: connection.targetLineId!,
        travelMin: Math.max(0.5, (distanceKm / 35) * 60),
      };
    });
}

function buildLegacyPassengerRoutingNetwork(): RoutingNetwork {
  void buildLegacyPassengerRoutingNetwork;
  const operationalStations = networkState.stations.filter((station) => isStationOperational(station.id));
  const services = networkState.routes.flatMap((route) => {
    if (!isRouteOperational(route.id) || hasRouteGaps(route) || route.operationPaused || route.visibility === "planning") return [];
    const serviceOperations = getRouteServiceOperations(route.id);
    const routeStationIds = operationalStations.filter((station) => station.connectedRouteIds.includes(route.id)).map((station) => station.id);
    const paths = getRoutePaths(route).map((path, index) => ({
      id: `${route.id}:path:${index}`,
      coordinates: path.map((point) => [point.lat, point.lng] as [number, number]),
    }));
    const result: RoutingNetwork["services"] = [];
    for (const kind of ["local", "express"] as TransitServiceKind[]) {
      const serviceId = `${route.id}:${kind}`;
      const operation = kind === "local" ? serviceOperations.local : serviceOperations.express;
      if (!operation.enabled || operation.hourlyCapacity <= 0) continue;
      const stopStationIds = normalizeServiceStops(routeStationIds, operation.stopStationIds);
      if (stopStationIds.length < 2) continue;
      result.push({
        id: serviceId,
        routeId: route.id,
        kind,
        paths,
        stopStationIds,
        speedKph: operation.averageSpeedKph,
        headwayMin: operation.headwayMin,
        crowding: congestionRuntimeState.routeCongestionSummaries.find((summary) => summary.routeId === route.id)?.representativeCrowding ?? 0,
      });
    }
    return result;
  });
  return {
    stations: operationalStations.map((station) => ({
      id: station.id,
      position: station.position,
      routeIds: station.connectedRouteIds,
    })),
    services,
    transfers: networkState.transfers
      .map((transfer) => ({
        id: transfer.id,
        stationIds: transfer.stationIds.filter((id) => operationalStations.some((station) => station.id === id)),
        walkMin: transfer.transferTimeMin,
        resistance: transfer.resistance,
      }))
      .filter((transfer) => transfer.stationIds.length >= 2),
    physicalLinks: constructionState.plans
      .flatMap((plan) => plan.connections ?? [])
      .filter((connection) =>
        connection.status === "completed" &&
        Boolean(connection.appliedAt) &&
        connection.connectionType === "physical-track" &&
        Boolean(connection.sourceStationId && connection.targetStationId && connection.sourceLineId && connection.targetLineId),
      )
      .map((connection) => {
        const coordinates = connection.coordinates ?? [];
        const distanceKm = coordinates.length >= 2
          ? calculateLengthKmPrecise(coordinates.map((point) => L.latLng(point.lat, point.lng)))
          : 0.2;
        return {
          id: connection.id,
          sourceStationId: connection.sourceStationId!,
          targetStationId: connection.targetStationId!,
          sourceRouteId: connection.sourceLineId!,
          targetRouteId: connection.targetLineId!,
          travelMin: Math.max(0.5, (distanceKm / 35) * 60),
        };
      }),
  };
}

// Kept only to read pre-v5 saves while the new service model is active.
const legacyServiceCompatibility = { reconcileLegacyMapTrains, buildLegacyPassengerRoutingNetwork };
void legacyServiceCompatibility;

function getPassengerRouter() {
  const network = buildPassengerRoutingNetwork();
  const signature = buildNetworkSignature(network);
  if (!transitRouterCache.current || signature !== transitRouterCache.signature) {
    const router = new TransitRouter(network);
    transitRouterCache.set(router, signature);
  } else {
    transitRouterCache.current.updateOperatingState(network.services);
  }
  return transitRouterCache.current!;
}

function getDemandStationInputs() {
  return networkState.stations.map((station) => ({
    id: station.id,
    position: station.position,
    operational: isStationOperational(station.id),
    legacyDemand: station.realizedDemand ?? station.demand,
  }));
}

function getDemandEvents(): DemandEvent[] {
  return newsEventState.current
    .filter((event) => event.demandMultiplier !== 1)
    .map((event) => {
      const periods =
        event.kind === "concert" || event.kind === "sports" || event.kind === "festival"
          ? ["evening-peak" as const]
          : event.kind === "university"
            ? ["morning-peak" as const, "daytime" as const]
            : event.kind === "tourism" || event.kind === "commercial-growth" || event.kind === "new-town"
              ? ["daytime" as const, "evening-peak" as const]
              : undefined;
      return {
        id: event.id,
        kind: "temporary" as const,
        position: event.position,
        radiusM: 1_600,
        periods,
        multiplier: event.demandMultiplier,
        startsOnDay: event.startedDay,
        endsOnDay: event.startedDay + event.durationDays - 1,
      };
    });
}

function getPassengerDemandEventMultiplier(origin: Station, destination: Station, routeIds: string[]) {
  const period = getDemandPeriod(simulationRuntimeState.clockMinutes);
  const demandEventsById = new Map(getDemandEvents().map((event) => [event.id, event]));
  return getActiveNewsEvents().reduce((multiplier, event) => {
    const demandEvent = demandEventsById.get(event.id);
    if (demandEvent?.periods && !demandEvent.periods.includes(period)) return multiplier;
    const applies =
      event.relatedStationIds.length === 0 ||
      event.relatedStationIds.includes(origin.id) ||
      event.relatedStationIds.includes(destination.id) ||
      event.relatedRouteIds.some((routeId) => routeIds.includes(routeId));
    return applies ? multiplier * event.demandMultiplier : multiplier;
  }, 1);
}

function synchronizeStationDemandMirrors() {
  const stateByStation = new Map(demandState.stationDemandStates.map((state) => [state.stationId, state]));
  networkState.stations = networkState.stations.map((station) => {
    const state = stateByStation.get(station.id);
    if (!state) return station;
    return {
      ...station,
      demand: state.realizedDemand,
      potentialDemand: state.potentialDemand,
      realizedDemand: state.realizedDemand,
      transitCaptureRate: state.transitCaptureRate,
    };
  });
}

function refreshDemandCatchments() {
  const inputs = getDemandStationInputs();
  if (demandState.demandZones.length === 0) {
    demandState.demandZones = createRegionalDemandGrid(
      cityConfigs[metaState.current.cityId].center as [number, number],
      metaState.current.cityId,
      cityConfigs[metaState.current.cityId].demandMultiplier,
    );
  } else if (!demandState.demandZones.some((zone) => zone.id.startsWith(`demand-zone:${metaState.current.cityId}:`))) {
    // Legacy saves retain their inferred regional zones. Adjacent new stations
    // compete for these zones instead of creating another copy of demand.
    demandState.demandZones = createLegacyDemandZones(inputs, [...demandState.demandZones]);
  }
  demandState.demandZones = applyRealPopulationDensity(metaState.current.cityId, demandState.demandZones);
  const allocation = allocateCatchmentDemand(
    [...demandState.demandZones],
    inputs,
    analysisStateOwner.current.dayIndex,
    getDemandPeriod(simulationRuntimeState.clockMinutes),
  );
  const existingByStation = new Map(demandState.stationDemandStates.map((state) => [state.stationId, state]));
  demandState.stationDemandStates = inputs.map((input) => {
    const existing = existingByStation.get(input.id);
    if (!existing) {
      const initial = createStationDemandState(
        { ...input, legacyDemand: Math.round((allocation.stationPotential.get(input.id) ?? 0) * 0.18) },
        allocation,
        analysisStateOwner.current.dayIndex,
      );
      return initial;
    }
    const potentialDemand = Math.max(0, Math.round(allocation.stationPotential.get(input.id) ?? 0));
    const realizedDemand = Math.min(potentialDemand, Math.max(0, existing.realizedDemand));
    return {
      ...existing,
      potentialDemand,
      realizedDemand,
      previousRealizedDemand: Math.min(potentialDemand, Math.max(0, existing.previousRealizedDemand)),
      transitCaptureRate: potentialDemand > 0 ? realizedDemand / potentialDemand : 0,
      catchmentWeight: allocation.stationCatchmentWeight.get(input.id) ?? 0,
      areaProfile: allocation.stationAreaProfile.get(input.id) ?? existing.areaProfile,
    };
  });
  synchronizeStationDemandMirrors();
  if (overlayState.population) updateDynamicLayers();
}

function buildDemandStructureFingerprint() {
  return JSON.stringify({
    stations: networkState.stations.map((station) => [
      station.id,
      station.position,
      station.connectedRouteIds,
      isStationOperational(station.id),
    ]),
    routes: networkState.routes.map((route) => [
      route.id,
      route.coordinates,
      route.disabledSegments,
      route.operationPaused,
      route.visibility,
      route.localServiceEnabled,
      route.expressServiceEnabled,
    ]),
    transfers: networkState.transfers.map((transfer) => [transfer.id, transfer.stationIds, transfer.resistance]),
    operatingServices: operationsState.services.map((service) => [service.id, service.ownerRouteId, service.routeIds, service.pathCoordinates, service.stopStationIds]),
  });
}

function buildDemandServiceFingerprint() {
  return JSON.stringify({
    fleets: operationsState.fleets.map((fleet) => [fleet.id, fleet.routeId, fleet.serviceId, fleet.sets, fleet.cars, fleet.trainType]),
    fare: financeState.economy.fare,
    events: getActiveNewsEvents().map((event) => [event.id, event.demandMultiplier]),
    period: getDemandPeriod(simulationRuntimeState.clockMinutes),
  });
}

function ensureDemandSimulation() {
  const structure = buildDemandStructureFingerprint();
  const service = buildDemandServiceFingerprint();
  const context = JSON.stringify({
    day: analysisStateOwner.current.dayIndex,
    period: getDemandPeriod(simulationRuntimeState.clockMinutes),
    events: getActiveNewsEvents().map((event) => [event.id, event.demandMultiplier]),
  });
  const structureChanged = structure !== demandRuntimeCache.structureSignature;
  const serviceChanged = service !== demandRuntimeCache.serviceSignature;
  const contextChanged = context !== demandRuntimeCache.contextSignature;
  if (!structureChanged && !serviceChanged && !contextChanged) return;
  if (structureChanged || contextChanged || demandState.stationDemandStates.length !== networkState.stations.length) refreshDemandCatchments();
  regeneratePassengerGroups();
  demandRuntimeCache.setStructureSignature(structure);
  demandRuntimeCache.setServiceSignature(service);
  demandRuntimeCache.setContextSignature(context);
}

function regeneratePassengerGroups() {
  const operationalStations = networkState.stations.filter((station) => isStationOperational(station.id));
  if (operationalStations.length < 2) {
    demandState.passengerGroups = [];
    congestionRuntimeState.reset();
    financeState.economy = { ...financeState.economy, demand: 0 };
    return;
  }
  const router = getPassengerRouter();
  const hour = Math.floor(simulationRuntimeState.clockMinutes / 60) % 24;
  const period = getDemandPeriod(simulationRuntimeState.clockMinutes);
  const stateByStation = new Map(demandState.stationDemandStates.map((state) => [state.stationId, state]));
  const origins = [...operationalStations].sort((a, b) => b.demand - a.demand);
  const destinationStations = operationalStations.map((station) => ({
    id: station.id,
    demand: stateByStation.get(station.id)?.potentialDemand ?? station.demand,
    position: station.position,
    accessibility: 0.72 + Math.min(1.4, station.connectedRouteIds.filter(isRouteOperational).length * 0.28),
    areaFactor: getDestinationPeriodMultiplier(stateByStation.get(station.id)?.areaProfile ?? "mixed", period),
  }));
  const stationById = new Map(operationalStations.map((station) => [station.id, station]));
  const groupsByOd = new Map<string, PassengerGroup>();
  for (const origin of origins) {
    const originDestination = destinationStations.find((station) => station.id === origin.id)!;
    const choices = selectPassengerDestinations(originDestination, destinationStations, {
      seed: `${metaState.current.slotId}:${analysisStateOwner.current.dayIndex}:${hour}`,
      maxDestinations: operationalStations.length > 150 ? 6 : 8,
      distanceKm: (from, to) => map.distance(L.latLng(...from.position), L.latLng(...to.position)) / 1000,
    });
    for (const choice of choices) {
      const destination = stationById.get(choice.destinationId);
      if (!destination) continue;
      const journey = router.findJourney(origin.id, destination.id);
      if (!journey) continue;
      const transferResistance = journey.transferStationIds.reduce((sum, stationId) => {
        const transfer = networkState.transfers.find((item) => item.stationIds.includes(stationId));
        return sum + (transfer?.resistance ?? 8);
      }, 0);
      const operationCrowding = journey.legs.length > 0
        ? journey.legs.reduce((sum, leg) => sum + (congestionRuntimeState.routeCongestionSummaries.find((item) => item.routeId === leg.routeId)?.representativeCrowding ?? 0), 0) / journey.legs.length
        : 0;
      const basePeople = Math.max(1, Math.round((stateByStation.get(origin.id)?.realizedDemand ?? origin.demand) * choice.share));
      const satisfaction = calculatePassengerSatisfaction(journey.waitTimeMin, operationCrowding, transferResistance, financeState.economy.fare);
      const activeDemand = Math.max(
        0,
        Math.round(basePeople * getPassengerDemandEventMultiplier(origin, destination, journey.routeIds)),
      );
      mergeOdPassengerGroup(groupsByOd, {
          id: `${origin.id}:${destination.id}`,
          originStationId: origin.id,
          destinationStationId: destination.id,
          people: basePeople,
          routeIds: journey.routeIds,
          distanceKm: Math.round(choice.distanceKm * 10) / 10,
          transferResistance,
          waitMin: journey.waitTimeMin,
          crowding: operationCrowding,
          satisfaction,
          activeDemand,
          journey,
        });
    }
  }
  demandState.passengerGroups = [...groupsByOd.values()];
  const forecast = calculateCurrentOperatingForecast();
  congestionRuntimeState.replace({ segmentCongestion: forecast.segmentCongestion, routeCongestionSummaries: forecast.routeSummaries });
  demandState.passengerGroups = demandState.passengerGroups.map((group, index) => ({
    ...group,
    crowding: forecast.groupMetrics[index]?.crowding ?? group.crowding,
    waitMin: forecast.groupMetrics[index]?.waitMin ?? group.waitMin,
    satisfaction: forecast.groupMetrics[index]?.satisfaction ?? group.satisfaction,
  }));
  financeState.economy = { ...financeState.economy, demand: forecast.demand, satisfaction: forecast.satisfaction };
}

function calculateCurrentOperatingForecast(
  fleetSource = operationsState.fleets,
  fare = financeState.economy.fare,
): OperatingForecast {
  return calculateOperatingForecastForGroups([...demandState.passengerGroups], fleetSource, fare);
}

function calculateOperatingForecastForGroups(
  groups: PassengerGroup[],
  fleetSource = operationsState.fleets,
  fare = financeState.economy.fare,
): OperatingForecast {
  const hour = Math.floor(simulationRuntimeState.clockMinutes / 60) % 24;
  const hourlyDemandShare = hour >= 7 && hour <= 9 ? 0.105 : hour >= 17 && hour <= 19 ? 0.095 : 0.045;
  const forecast = calculateOperatingForecast({
    groups,
    capacities: getRoutingServiceCapacities(undefined, fleetSource),
    fare,
    maintenance: calculateDailyMaintenance(fleetSource),
    loanInterest: 0,
    loanPayment: 0,
    timeBand: `${String(hour).padStart(2, "0")}:00`,
    hourlyDemandShare,
    fallbackSatisfaction: financeState.economy.satisfaction,
  });
  const maintenance = calculateDailyMaintenanceBreakdown(fleetSource);
  const preview = calculateDailySettlement({
    gameDay: analysisStateOwner.current.dayIndex + 1,
    gameMode: metaState.current.mode,
    currentMoney: financeState.economy.cash,
    fareRevenue: forecast.revenue,
    otherRevenue: 0,
    lineMaintenanceCost: 0,
    stationMaintenanceCost: 0,
    trainMaintenanceCost: maintenance.trains,
    depotMaintenanceCost: maintenance.depots,
    expressOperatingCost: maintenance.express,
    constructionCostDue: 0,
    demolitionCostDue: 0,
    reconstructionCostDue: 0,
    loans: loanState.current,
    eventEffects: [],
    bankruptcyRules: { limit: difficultyConfigs[metaState.current.difficulty].bankruptcyLimit },
  }, { preview: true });
  return { ...forecast, expenses: preview.expenses.total, netProfit: preview.netProfit };
}

function calculateStationServiceDemand(
  station: Station,
  fare = financeState.economy.fare,
  groupsSource = demandState.passengerGroups,
  fleetSource = operationsState.fleets,
): { captureRate: number; attractiveness: DemandAttractiveness } {
  const originGroups = groupsSource.filter((group) => group.originStationId === station.id && group.journey);
  const totalWeight = originGroups.reduce((sum, group) => sum + Math.max(1, group.activeDemand), 0);
  const weighted = (select: (group: PassengerGroup) => number, fallback: number) =>
    totalWeight > 0
      ? originGroups.reduce((sum, group) => sum + select(group) * Math.max(1, group.activeDemand), 0) / totalWeight
      : fallback;
  const routeOperations = station.connectedRouteIds.map((routeId) => calculateLegacyRouteOperation(routeId, fleetSource));
  const serviceAvailable =
    isStationOperational(station.id) &&
    routeOperations.some((operation) => operation.hourlyCapacity > 0 && isRouteOperational(operation.routeId));
  const operationalShare = station.connectedRouteIds.length > 0
    ? station.connectedRouteIds.filter(isRouteOperational).length / station.connectedRouteIds.length
    : 0;
  const expressUsed = originGroups.some((group) => group.journey?.legs.some((leg) => leg.serviceKind === "express"));
  return calculateTransitCaptureRate({
    hasAccessibleStation: isStationOperational(station.id),
    reachableDestinationShare: originGroups.length > 0 ? Math.min(1, 0.62 + originGroups.length * 0.045) : 0,
    averageWaitMin: weighted((group) => group.waitMin, serviceAvailable ? 12 : 30),
    averageTravelTimeMin: weighted((group) => group.journey?.totalTimeMin ?? 90, 90),
    averageTransfers: weighted((group) => group.journey?.transferCount ?? 3, 3),
    transferResistance: weighted((group) => group.transferResistance, 80),
    crowding: weighted((group) => group.crowding, serviceAvailable ? 1.2 : 2.4),
    fare,
    reliability: serviceAvailable ? Math.min(1, operationalShare * 0.9 + 0.1) : 0,
    satisfaction: weighted((group) => group.satisfaction, serviceAvailable ? financeState.economy.satisfaction : 10),
    expressTimeSaving: expressUsed ? 0.12 : 0,
    serviceAvailable,
  });
}

type DemandResponsiveForecast = OperatingForecast & {
  captureRate: number;
};

function calculateDemandResponsiveForecast(
  fleetSource = operationsState.fleets,
  fare = financeState.economy.fare,
): DemandResponsiveForecast {
  const capacityForecast = calculateOperatingForecastForGroups([...demandState.passengerGroups], fleetSource, fare);
  const measuredGroups = demandState.passengerGroups.map((group, index) => ({
    ...group,
    crowding: capacityForecast.groupMetrics[index]?.crowding ?? group.crowding,
    waitMin: capacityForecast.groupMetrics[index]?.waitMin ?? group.waitMin,
    satisfaction: capacityForecast.groupMetrics[index]?.satisfaction ?? group.satisfaction,
  }));
  const projectedByStation = new Map<string, StationDemandState>();
  for (const station of networkState.stations) {
    const state = demandState.stationDemandStates.find((candidate) => candidate.stationId === station.id);
    if (!state) continue;
    const service = calculateStationServiceDemand(station, fare, measuredGroups, fleetSource);
    projectedByStation.set(station.id, previewStationDemand(state, service.captureRate));
  }
  const projectedGroups = demandState.passengerGroups.map((group) => {
    const current = demandState.stationDemandStates.find((state) => state.stationId === group.originStationId);
    const projected = projectedByStation.get(group.originStationId);
    const ratio = current && projected && current.realizedDemand > 0
      ? projected.realizedDemand / current.realizedDemand
      : 1;
    return { ...group, activeDemand: Math.max(0, Math.round(group.activeDemand * ratio)) };
  });
  const forecast = calculateOperatingForecastForGroups(projectedGroups, fleetSource, fare);
  const totalPotential = [...projectedByStation.values()].reduce((sum, state) => sum + state.potentialDemand, 0);
  const totalRealized = [...projectedByStation.values()].reduce((sum, state) => sum + state.realizedDemand, 0);
  return {
    ...forecast,
    captureRate: totalPotential > 0 ? totalRealized / totalPotential : 0,
  };
}

function advanceDemandForGameDay(gameDay: number, fare = financeState.economy.fare) {
  refreshDemandCatchments();
  const stateByStation = new Map(demandState.stationDemandStates.map((state) => [state.stationId, state]));
  demandState.stationDemandStates = networkState.stations.map((station) => {
    const existing = stateByStation.get(station.id);
    if (!existing) {
      const allocation = allocateCatchmentDemand(
        [...demandState.demandZones],
        getDemandStationInputs(),
        analysisStateOwner.current.dayIndex,
        getDemandPeriod(simulationRuntimeState.clockMinutes),
      );
      return createStationDemandState(
        {
          id: station.id,
          position: station.position,
          operational: isStationOperational(station.id),
          legacyDemand: 0,
        },
        allocation,
        analysisStateOwner.current.dayIndex,
        0,
      );
    }
    const result = calculateStationServiceDemand(station, fare);
    return advanceStationDemand(
      existing,
      existing.potentialDemand,
      result.captureRate,
      gameDay,
      result.attractiveness,
    );
  });
  synchronizeStationDemandMirrors();
}

/**
 * 게임 날짜가 하루 넘어갈 때 실행하는 일일 결산.
 * 승객/수익/유지비/대출/공사/통계를 같은 시점에 확정해 서로 다른 날짜의 값이
 * 섞이지 않도록 한다.
 */
const dailySettlementContext: DailySettlementRuntimeContext<OperationAnalysisState, GameMeta, NewsEvent> = {
  service: dailySettlementService,
  getGameDay: () => analysisStateOwner.current.dayIndex + 1,
  getLastSettledGameDay: () => metaState.current.lastSettledGameDay ?? -1,
  hasDailyRecord: (day) => financeState.statistics.dailyRecords.some((record) => record.day === day),
  getGameMode: () => metaState.current.mode,
  getBankruptcyLimit: () => difficultyConfigs[metaState.current.difficulty].bankruptcyLimit,
  getEconomy: () => financeState.economy,
  getLoans: () => [...loanState.current],
  getStatistics: () => financeState.statistics,
  getPassengerGroups: () => [...demandState.passengerGroups],
  captureAuxiliary: () => ({
    analysis: { ...analysisStateOwner.current },
    meta: { ...metaState.current },
    constructionProjects: constructionState.projects.map((project) => ({ ...project, events: project.events.map((event) => ({ ...event })) })),
    stationDemandStates: demandState.stationDemandStates.map((state) => ({ ...state })),
  }),
  restoreState: (snapshot) => {
    financeState.economy = snapshot.economy;
    loanState.restore(snapshot.loans);
    financeState.statistics = snapshot.statistics;
    demandState.passengerGroups = snapshot.passengerGroups;
    analysisStateOwner.current = snapshot.auxiliary.analysis;
    metaState.replace(snapshot.auxiliary.meta);
    constructionState.replaceProjects(snapshot.auxiliary.constructionProjects);
    demandState.stationDemandStates = snapshot.auxiliary.stationDemandStates;
  },
  prepareDay: (gameDay) => {
    ensureDemandSimulation();
    if (financeState.economy.autoFare) financeState.economy.fare = calculateAutoFare();
    regeneratePassengerGroups();
    advanceDemandForGameDay(gameDay, financeState.economy.fare);
    regeneratePassengerGroups();
    const forecast = calculateCurrentOperatingForecast(operationsState.fleets, financeState.economy.fare);
    const maintenance = calculateDailyMaintenanceBreakdown();
    const constructionCostDue = constructionState.projects.flatMap((project) => project.events)
      .filter((event) => !event.applied && event.kind === "extra-cost" && event.triggerDay <= gameDay)
      .reduce((sum, event) => sum + Math.max(0, event.extraCost ?? 0), 0);
    const financesBefore = calculateNetworkFinancials();
    return {
      forecast,
      maintenance,
      constructionCostDue,
      financesBefore,
      totalPotential: demandState.stationDemandStates.reduce((sum, state) => sum + state.potentialDemand, 0),
      totalRealized: demandState.stationDemandStates.reduce((sum, state) => sum + state.realizedDemand, 0),
    };
  },
  applyCommittedState: (state) => {
    financeState.economy = state.economy;
    loanState.replace(state.loans);
    financeState.statistics = state.statistics;
  },
  commitDay: (gameDay, bankrupt) => {
    analysisStateOwner.current = { ...analysisStateOwner.current, dayIndex: gameDay, lastFingerprint: "" };
    metaState.patch({ lastSettledGameDay: gameDay });
    updateCareerProgress(bankrupt);
    const eventResult = updateNewsEventsForDay(false);
    updateConstructionProjectsForDay();
    recordDemandSnapshot();
    refreshOperationSuggestions(true);
    const criticalCount = analysisStateOwner.current.suggestions.filter((suggestion) => suggestion.status === "active" && suggestion.severity === "critical").length;
    if (criticalCount > 0 && analysisStateOwner.current.lastNotifiedDay !== gameDay) {
      analysisStateOwner.current = { ...analysisStateOwner.current, lastNotifiedDay: gameDay };
      showToast(`운영 분석에 우선 확인 제안 ${criticalCount}건이 있습니다.`);
    }
    return { newsEvents: eventResult.newsEvents, updateDomains: eventResult.updateDomains };
  },
};

function settleSimulationDay() {
  const result = dailySettlementRuntime.settleDay(dailySettlementContext);
  simulationApplication.handleSettlementResult(result);
}
function updateCareerProgress(bankrupt: boolean) {
  if (metaState.current.mode === "sandbox") {
    metaState.patch({ unlockedCityIds: Object.keys(cityConfigs) as CityId[], bankrupt: false });
    return;
  }
  const unlocked = new Set(metaState.current.unlockedCityIds);
  if (financeState.economy.cash >= 85000) unlocked.add("daejeon");
  if (financeState.economy.cash >= 130000) unlocked.add("gwangju");
  if (financeState.economy.cash >= 180000) unlocked.add("busan");
  if (bankrupt) {
    simSpeed = 0;
    gameLoopController.setSpeed(0);
    gameLoopController.pause();
    syncSpeedControls();
    setText(modeLabel, "파산");
  }
  metaState.patch({ unlockedCityIds: Array.from(unlocked), bankrupt });
}

function calculateDailyMaintenance(fleetSource = operationsState.fleets) {
  const breakdown = calculateDailyMaintenanceBreakdown(fleetSource);
  return breakdown.trains + breakdown.depots + breakdown.express;
}

function calculateDailyMaintenanceBreakdown(fleetSource = operationsState.fleets) {
  const multiplier = getNewsOperatingCostMultiplier();
  return {
    trains: Math.round(fleetSource.reduce((sum, fleet) => sum + getFleetMaintenanceCost(fleet), 0) * multiplier),
    depots: Math.round(networkState.depots.reduce((sum, depot) => sum + depot.maintenanceCost, 0) * multiplier),
    express: Math.round(operationsState.expressConfigs.filter((config) => config.enabled).reduce((sum, config) => sum + config.extraOperatingCost, 0) * multiplier),
  };
}

function calculateAutoFare() {
  const operatingRoutes = networkState.routes.filter((route) => isRouteOperational(route.id));
  const avgCrowding =
    operatingRoutes.length > 0
      ? operatingRoutes.reduce((sum, route) => sum + calculateRouteOperation(route.id).crowding, 0) / operatingRoutes.length
      : 0.8;
  const target = 1350 + calculateDailyMaintenance() / 16 + Math.max(0, avgCrowding - 1) * 220;
  return clampInteger(Math.round(target / 50) * 50, 1100, 2800);
}

/** 대출 한 건의 원금(억)과 월 상환액(억). 재정 화면의 확인 문구도 같은 값을 쓴다. */
const loanPrincipal = 30000;
const loanMonthlyPayment = 720;

function currentLoanInterestRate() {
  return 0.055 * difficultyConfigs[metaState.current.difficulty].loanInterestMultiplier;
}

/** 다음 상환 한 번에 갚을 금액. 갚을 수 없으면 0. */
function nextRepaymentAmount() {
  const firstLoan = loanState.firstOutstanding();
  if (metaState.current.mode === "sandbox" || !firstLoan || financeState.economy.cash <= 0) return 0;
  return Math.min(firstLoan.balance, Math.max(1000, Math.floor(financeState.economy.cash * 0.25)));
}

function takeLoan() {
  if (metaState.current.mode === "sandbox") {
    setText(facilityReadout, "샌드박스는 대출 불필요");
    return;
  }
  pushHistory();
  const principal = loanPrincipal;
  loanState.add({
    id: createId("loan"),
    principal,
    balance: principal,
    interestRate: currentLoanInterestRate(),
    monthlyPayment: loanMonthlyPayment,
  });
  financeState.economy = { ...financeState.economy, cash: financeState.economy.cash + principal, loanBalance: financeState.economy.loanBalance + principal };
  redoStack = [];
  requestStateSave("immediate");
  requestUpdate("finance-only", selectedOperationRouteId);
}

function repayLoan() {
  if (metaState.current.mode === "sandbox") return;
  const firstLoan = loanState.firstOutstanding();
  if (!firstLoan || financeState.economy.cash <= 0) return;
  pushHistory();
  const payment = nextRepaymentAmount();
  loanState.replace(
    loanState.current
      .map((loan) => (loan.id === firstLoan.id ? { ...loan, balance: loan.balance - payment } : loan))
      .filter((loan) => loan.balance > 0),
  );
  financeState.economy = { ...financeState.economy, cash: financeState.economy.cash - payment, loanBalance: Math.max(0, financeState.economy.loanBalance - payment) };
  redoStack = [];
  requestStateSave("immediate");
  requestUpdate("finance-only", selectedOperationRouteId);
}

function switchInGameMenuTab(tab: "save" | "load") {
  menuSaveTabButton?.setAttribute("aria-pressed", String(tab === "save"));
  menuLoadTabButton?.setAttribute("aria-pressed", String(tab === "load"));
  if (menuSaveTabContent) menuSaveTabContent.hidden = tab !== "save";
  if (menuLoadTabContent) menuLoadTabContent.hidden = tab !== "load";
  if (tab === "load") renderInGameSlotList();
}

function renderInGameSlotList() {
  if (!menuSlotList) return;
  menuSlotList.innerHTML = "";
  if (slotSummaries.length === 0) {
    menuSlotList.innerHTML = `<p class="game-inspector__note">저장된 슬롯이 없습니다.</p>`;
    return;
  }
  slotSummaries.forEach((slot) => {
    const isCurrent = isActiveSaveSlot(slot.slotId);
    const item = document.createElement("div");
    item.className = "game-slot-item";
    const dateStr = new Date(slot.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    item.innerHTML = `
      <span class="game-route-item__text"><strong>${escapeHtml(slot.slotName)}${isCurrent ? " · 현재 슬롯" : ""}</strong><small>마지막 저장 ${dateStr} · 노선 ${slot.routeCount}개 · 역 ${slot.stationCount}개</small></span>
      <button class="dg-btn dg-btn--secondary dg-btn--compact" type="button" data-slot-load>불러오기</button>
    `;
    item.querySelector("[data-slot-load]")?.addEventListener("click", () => {
      closeInGameMenu();
      loadSlot(slot.slotId);
      showToast(`${slot.slotName} 슬롯을 불러왔습니다!`);
    });
    menuSlotList.appendChild(item);
  });
}

function openInGameMenu() {
  if (!inGameMenuDialog) return;
  inGameMenuDialog.hidden = false;
  switchInGameMenuTab("save");
  const currentSlot = slotSummaries.find((slot) => isActiveSaveSlot(slot.slotId));
  if (menuSaveStatusReadout) {
    const slotName = currentSlot ? currentSlot.slotName : metaState.current.slotId;
    menuSaveStatusReadout.textContent = `현재 슬롯: ${slotName}`;
  }
  playFeedback("select");
}

function closeInGameMenu() {
  if (inGameMenuDialog) inGameMenuDialog.hidden = true;
}

function openFinanceDialog() {
  if (!financeDialog) return;
  dialogManager.open("finance");
  if (dialogLoanButton) dialogManager.bind("finance", "loan", dialogLoanButton, "click", () => {
    const { cash, loanBalance } = financeState.economy;
    openDecisionDialog(
      `${formatCost(loanPrincipal)}을 대출할까요?`,
      `자금 ${formatSignedCost(cash)} → ${formatSignedCost(cash + loanPrincipal)} · 대출 잔액 ${formatCost(loanBalance)} → ${formatCost(loanBalance + loanPrincipal)} · 연 이자 ${(currentLoanInterestRate() * 100).toFixed(1)}% · 월 상환 ${formatCost(loanMonthlyPayment)}`,
      `${formatCost(loanPrincipal)} 대출`,
      () => {
        takeLoan();
        updateEconomyHud();
        openFinanceDialog();
      },
      "build",
    );
  });
  if (dialogRepayButton) dialogManager.bind("finance", "repay", dialogRepayButton, "click", () => {
    const payment = nextRepaymentAmount();
    if (payment <= 0) return;
    const { cash, loanBalance } = financeState.economy;
    openDecisionDialog(
      `대출 ${formatCost(payment)}을 상환할까요?`,
      `자금 ${formatSignedCost(cash)} → ${formatSignedCost(cash - payment)} · 대출 잔액 ${formatCost(loanBalance)} → ${formatCost(Math.max(0, loanBalance - payment))}`,
      `${formatCost(payment)} 상환`,
      () => {
        repayLoan();
        updateEconomyHud();
        openFinanceDialog();
      },
      "build",
    );
  });
  updateEconomyHud();
  if (financeForecastContent) {
    financeForecastContent.innerHTML = renderOperatingForecastComparison(calculateDemandResponsiveForecast());
  }
  playFeedback("select");
}

function closeFinanceDialog() {
  dialogManager.close("finance");
}

function openSatisfactionDialog() {
  if (!satisfactionDialog) return;
  renderSatisfactionDialog();
  satisfactionDialog.hidden = false;
  playFeedback("select");
}

function closeSatisfactionDialog() {
  if (satisfactionDialog) satisfactionDialog.hidden = true;
}

function renderSatisfactionDialog() {
  if (!satisfactionDialogContent || !satisfactionDialog) return;
  const score = financeState.economy.satisfaction;
  const level = score >= 85 ? "excellent" : score >= 70 ? "stable" : score >= 50 ? "warning" : "critical";
  const label = score >= 85 ? "매우 좋음" : score >= 70 ? "안정" : score >= 50 ? "개선 필요" : "불만 집중";
  const groups = demandState.passengerGroups;
  const average = (values: number[]) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const averageWait = average(groups.map((group) => group.waitMin));
  const averageCrowding = average(groups.map((group) => group.crowding));
  const transferGroups = groups.filter((group) => group.routeIds.length > 1);
  const averageTransferResistance = average(transferGroups.map((group) => group.transferResistance));
  const waitPenalty = averageWait * 1.8;
  const crowdingPenalty = Math.max(0, averageCrowding - 0.75) * 34;
  const transferPenalty = averageTransferResistance * 0.24;
  const farePenalty = Math.max(0, (financeState.economy.fare - 1450) / 55);
  const factors = [
    {
      key: "wait",
      icon: "◷",
      title: "평균 대기",
      value: groups.length > 0 ? `${averageWait.toFixed(1)}분` : "-",
      note: averageWait <= 5 ? "원활" : averageWait <= 9 ? "보통" : "배차 개선 필요",
      penalty: waitPenalty,
    },
    {
      key: "crowding",
      icon: "◉",
      title: "차내 혼잡",
      value: groups.length > 0 ? `${Math.round(averageCrowding * 100)}%` : "-",
      note: averageCrowding <= 0.75 ? "쾌적" : averageCrowding <= 1 ? "혼잡 주의" : "과밀",
      penalty: crowdingPenalty,
    },
    {
      key: "transfer",
      icon: "⇄",
      title: "환승 부담",
      value: transferGroups.length > 0 ? averageTransferResistance.toFixed(1) : "-",
      note: transferGroups.length === 0 ? "환승 이동 없음" : averageTransferResistance <= 12 ? "낮음" : averageTransferResistance <= 30 ? "보통" : "개선 필요",
      penalty: transferPenalty,
    },
    {
      key: "fare",
      icon: "₩",
      title: "요금 체감",
      value: `${financeState.economy.fare.toLocaleString("ko-KR")}원`,
      note: farePenalty === 0 ? "기준 요금 이하" : farePenalty <= 8 ? "수용 가능" : "부담 증가",
      penalty: farePenalty,
    },
  ];
  const previousRecord = [...financeState.statistics.dailyRecords].reverse().find((record) => record.day < analysisStateOwner.current.dayIndex);
  const change = previousRecord ? score - previousRecord.satisfaction : null;
  const trendValues = financeState.statistics.dailyRecords
    .slice(-6)
    .map((record) => ({ day: record.day + 1, value: record.satisfaction }));
  if (trendValues.at(-1)?.day !== analysisStateOwner.current.dayIndex + 1) trendValues.push({ day: analysisStateOwner.current.dayIndex + 1, value: score });
  const worstGroups = [...groups].sort((a, b) => a.satisfaction - b.satisfaction || b.activeDemand - a.activeDemand).slice(0, 3);
  const dominantFactor = [...factors].sort((a, b) => b.penalty - a.penalty)[0];
  const recommendations: Array<{ icon: string; title: string; text: string }> = [];
  if (groups.length === 0) {
    recommendations.push({ icon: "＋", title: "운행 데이터가 필요합니다", text: "역과 운행 열차를 연결하면 승객 이동이 생성되고 만족도 원인을 분석할 수 있습니다." });
  } else {
    if (averageWait > 7) recommendations.push({ icon: "◷", title: "배차 간격 단축", text: "차량을 추가하거나 운행 중지 노선을 재개해 평균 대기시간을 줄여보세요." });
    if (averageCrowding > 0.85) recommendations.push({ icon: "▦", title: "수송력 증대", text: "혼잡 노선의 편성 수 또는 차량 수를 늘리면 차내 혼잡을 빠르게 낮출 수 있습니다." });
    if (averageTransferResistance > 20) recommendations.push({ icon: "⇄", title: "환승 동선 점검", text: "환승 거리가 긴 역을 재검토하면 환승 승객의 체감 부담이 줄어듭니다." });
    if (farePenalty > 6) recommendations.push({ icon: "₩", title: "요금 부담 확인", text: "현재 요금이 만족도를 낮추고 있습니다. 수익과 승객 체감의 균형을 검토하세요." });
    if (recommendations.length === 0) recommendations.push({ icon: "✓", title: "현재 서비스 유지", text: "뚜렷한 위험 요인이 없습니다. 승객 증가에 맞춰 혼잡과 대기 추세를 계속 확인하세요." });
  }
  satisfactionDialog.dataset.level = level;
  const scoreMark = score >= 70 ? "●" : score >= 50 ? "△" : "✕";
  const scoreTone = score >= 70 ? "ok" : score >= 50 ? "caution" : "danger";
  satisfactionDialogContent.innerHTML = `
    <section class="dg-panel__section game-report__summary">
      <div class="game-report__score"><span class="game-report__mark game-report__mark--${scoreTone}" aria-hidden="true">${scoreMark}</span><strong>${score}</strong><span class="game-inspector__muted">/ 100 · ${label}</span></div>
      <p class="game-inspector__note">${groups.length > 0 ? `${groups.length.toLocaleString("ko-KR")}개 이동 그룹의 현재 체감입니다.` : "운행 초기 기준 만족도입니다."} ${dominantFactor.penalty > 0.5 ? `가장 큰 감점 요인은 ‘${dominantFactor.title}’입니다.` : "뚜렷한 감점 요인이 없습니다."}</p>
      <div class="dg-row"><span class="dg-row__label">직전 기록 대비</span><span class="dg-row__value${change === null ? "" : change >= 0 ? " dg-row__value--ok" : " dg-row__value--danger"}">${change === null ? "기록 대기" : `${change >= 0 ? "▲ +" : "▼ "}${change}점`}</span></div>
    </section>
    <section class="dg-panel__section">
      <h3 class="dg-panel__section-label">구성 요인<span class="game-inspector__section-meta">막대가 길수록 감점이 큽니다</span></h3>
      ${factors.map((factor) => `
        <div class="game-report__factor">
          <div class="dg-row dg-row--meter"><span class="dg-row__label">${factor.title}</span><span class="dg-meter" aria-hidden="true"><span class="dg-meter__fill${factor.penalty >= 12 ? " dg-meter__fill--over" : ""}" style="width:${Math.min(100, Math.round((factor.penalty / 25) * 100))}%"></span></span><span class="dg-row__value">${factor.value}</span></div>
          <small class="game-report__factor-note">${factor.note} · ${factor.penalty > 0 ? `-${factor.penalty.toFixed(1)}점` : "감점 없음"}</small>
        </div>`).join("")}
    </section>
    <section class="dg-panel__section">
      <h3 class="dg-panel__section-label">최근 추세</h3>
      ${trendValues.length < 2 ? "<p class=\"game-inspector__note\">하루가 지나면 변화 추세가 표시됩니다.</p>" : trendValues.map((item) => `<div class="dg-row dg-row--meter"><span class="dg-row__label">${item.day}일차</span><span class="dg-meter" aria-hidden="true"><span class="dg-meter__fill" style="width:${Math.max(0, Math.min(100, item.value))}%"></span></span><span class="dg-row__value">${item.value}점</span></div>`).join("")}
    </section>
    <section class="dg-panel__section">
      <h3 class="dg-panel__section-label">개선 우선 이동</h3>
      ${worstGroups.length > 0 ? worstGroups.map((group) => {
        const origin = networkState.stations.find((station) => station.id === group.originStationId)?.name ?? "출발역";
        const destination = networkState.stations.find((station) => station.id === group.destinationStationId)?.name ?? "도착역";
        return `<div class="dg-row"><span class="dg-row__label game-route-item__text"><strong>${escapeHtml(origin)} → ${escapeHtml(destination)}</strong><small>${group.routeIds.length > 1 ? `${group.routeIds.length - 1}회 환승 · ` : ""}${group.activeDemand.toLocaleString("ko-KR")}명</small></span><span class="dg-row__value">${group.satisfaction}점</span></div>`;
      }).join("") : "<p class=\"game-inspector__note\">분석할 승객 이동이 아직 없습니다.</p>"}
    </section>
    <section class="dg-panel__section">
      <h3 class="dg-panel__section-label">추천 개선 방향</h3>
      <ul class="game-inspector__list">${recommendations.slice(0, 3).map((item) => `<li><span class="game-report__icon" aria-hidden="true">${item.icon}</span><span><strong>${item.title}</strong> · ${item.text}</span></li>`).join("")}</ul>
    </section>
  `;
}

function updateEconomyHud() {
  if (fareInput && document.activeElement !== fareInput) fareInput.value = String(financeState.economy.fare);
  const satisfactionLabel = financeState.economy.satisfaction >= 85 ? "매우 좋음" : financeState.economy.satisfaction >= 70 ? "안정" : financeState.economy.satisfaction >= 50 ? "주의" : "불만";
  // 상태는 색과 함께 표식 모양(● △ ✕)과 문구로 구분한다.
  const satisfactionLevel = financeState.economy.satisfaction >= 70 ? "ok" : financeState.economy.satisfaction >= 50 ? "caution" : "danger";
  const satisfactionMark = satisfactionLevel === "ok" ? "●" : satisfactionLevel === "caution" ? "△" : "✕";
  hudRenderer.update("satisfaction", String(financeState.economy.satisfaction));
  setText(satisfactionLevelReadout, satisfactionLabel);
  if (satisfactionIcon) {
    hudRenderer.update("satisfactionIcon", satisfactionMark);
    satisfactionIcon.dataset.level = satisfactionLevel;
  }
  hudRenderer.update("demand", financeState.economy.demand.toLocaleString("ko-KR"));
  const latestRecord = financeState.statistics.dailyRecords.at(-1);
  const dailyNet = latestRecord ? latestRecord.revenue - latestRecord.expenses : financeState.economy.revenue - financeState.economy.maintenance;
  hudRenderer.updateFinance(formatSignedCost(financeState.economy.cash), formatSignedCost(dailyNet), dailyNet < 0);

  // Sync Finance Dialog Readouts & Inputs
  setText(financeCashReadout, formatSignedCost(financeState.economy.cash));
  setText(financeDailyNetReadout, formatSignedCost(dailyNet));
  financeDailyNetReadout?.classList.toggle("negative", dailyNet < 0);
  financeDailyNetReadout?.classList.toggle("positive", dailyNet >= 0);
  setText(financeLoanReadout, formatSignedCost(financeState.economy.loanBalance));
  setText(financeDemandReadout, `${financeState.economy.demand.toLocaleString("ko-KR")} 명`);
  const sandbox = metaState.current.mode === "sandbox";
  const repayment = nextRepaymentAmount();
  if (dialogLoanButton) dialogLoanButton.disabled = sandbox;
  if (dialogRepayButton) dialogRepayButton.disabled = repayment <= 0;
  setText(byId("financeLoanNote"), sandbox
    ? "샌드박스에서는 대출이 필요하지 않습니다."
    : `대출 1건 ${formatCost(loanPrincipal)} · 연 이자 ${(currentLoanInterestRate() * 100).toFixed(1)}%. ${repayment > 0 ? `다음 상환 ${formatCost(repayment)}.` : "상환할 대출이 없습니다."} 실행 전에 금액과 실행 후 잔액을 확인합니다.`);
  if (dialogFareInput && document.activeElement !== dialogFareInput) dialogFareInput.value = String(financeState.economy.fare);
  dialogAutoFareButton?.classList.toggle("active", financeState.economy.autoFare);
  dialogAutoFareButton?.setAttribute("aria-pressed", String(financeState.economy.autoFare));
  if (dialogAutoFareButton) dialogAutoFareButton.textContent = financeState.economy.autoFare ? "자동 운임 적용 중" : "수동 운임 변경";

  hudRenderer.update("city", `${cityConfigs[metaState.current.cityId].name} 관제`);
  updateGameClockHud();
  updateAutoFareButton();
  if (satisfactionDialog && !satisfactionDialog.hidden) renderSatisfactionDialog();
}

function updateGameClockHud() {
  const hours = Math.floor(simulationRuntimeState.clockMinutes / 60) % 24;
  const minutes = Math.floor(simulationRuntimeState.clockMinutes % 60);
  hudRenderer.updateClock(
    `${analysisStateOwner.current.dayIndex + 1}일차`,
    `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  );
}

function updateAutoFareButton() {
  if (!autoFareButton) return;
  autoFareButton.classList.toggle("active", financeState.economy.autoFare);
  autoFareButton.setAttribute("aria-pressed", String(financeState.economy.autoFare));
  autoFareButton.textContent = financeState.economy.autoFare ? "자동" : "수동";
}

function updateOperationRouteOptions() {
  if (!operationRouteSelect) return;
  const previous = selectedOperationRouteId || operationRouteSelect.value;
  operationRouteSelect.innerHTML = networkState.routes.map((route) => `<option value="${route.id}">${route.name}</option>`).join("");
  selectedOperationRouteId = networkState.routes.some((route) => route.id === previous) ? previous : networkState.routes[0]?.id ?? "";
  operationRouteSelect.value = selectedOperationRouteId;
  updateExpressButton();
}

function updateExpressButton() {
  if (!expressButton) return;
  const routeId = selectedOperationRouteId || selectedRouteId || networkState.routes[0]?.id || "";
  const config = operationsState.expressConfigs.find((item) => item.routeId === routeId);
  expressButton.classList.toggle("active", Boolean(config?.enabled));
  expressButton.setAttribute("aria-pressed", String(Boolean(config?.enabled)));
  expressButton.disabled = !routeId;
  const label = config?.unlocked ? (config.enabled ? "급행중" : "급행") : "급행 해금";
  if (expressButtonLabel) expressButtonLabel.textContent = label;
  else expressButton.textContent = label;
}

function getCurrentDepotExpansionQuote(depot: Depot) {
  return getDepotExpansionQuote(depot, {
    mode: metaState.current.mode,
    cash: financeState.economy.cash,
    costMultiplier: cityConfigs[metaState.current.cityId].constructionMultiplier * difficultyConfigs[metaState.current.difficulty].costMultiplier,
    operational: isDepotOperational(depot.id),
    busy: depotExpansionsInFlight.size > 0,
  });
}

function requestDepotExpansion(id: string) {
  const depot = networkState.depots.find((item) => item.id === id);
  if (!depot) return;
  const quote = getCurrentDepotExpansionQuote(depot);
  if (quote.reason) { showToast(quote.reason); renderDepotManager(); return; }
  const expected = { level: depot.level, cost: quote.cost, slotId: metaState.current.slotId };
  closeDepotManager();
  openDecisionDialog(
    `“${depot.name}” 차량기지를 레벨 ${depot.level} → ${quote.nextLevel}로 확장할까요?`,
    `비용 ${formatCost(quote.cost)} · 확장 후 잔액 ${formatCost(financeState.economy.cash - quote.cost)}. ` +
      `수용량 ${depot.capacity} → ${calculateDepotCapacity(depot.areaHa, quote.nextLevel)}편성 · 월 유지비 ${formatCost(depot.maintenanceCost)} → ${formatCost(calculateDepotMaintenance(depot.areaHa, quote.nextLevel))}. ` +
      "기존 부지의 설비 개량으로 즉시 반영하며 운행을 유지합니다. 저장 완료 후 실행 취소할 수 있습니다.",
    `${formatCost(quote.cost)} · 확장 확정`,
    () => { void expandDepot(id, expected); },
    "build",
  );
}

async function expandDepot(id: string, expected?: { level: number; cost: number; slotId: string }): Promise<boolean> {
  const depot = networkState.depots.find((item) => item.id === id);
  if (!depot || !hasActiveGameSession || depotExpansionsInFlight.size > 0) return false;
  const quote = getCurrentDepotExpansionQuote(depot);
  if (expected && (expected.slotId !== metaState.current.slotId || expected.level !== depot.level || expected.cost !== quote.cost)) {
    showToast("기지 또는 비용이 변경됐습니다. 확장 내용을 다시 검토해 주세요.");
    renderDepotManager();
    return false;
  }
  if (quote.reason) { showToast(quote.reason); renderDepotManager(); return false; }
  const before = cloneState();
  const slotId = metaState.current.slotId;
  const cityId = metaState.current.cityId;
  depotExpansionsInFlight.add(id);
  try {
    networkState.depots = networkState.depots.map((item) => item.id !== id ? item : {
      ...item, level: quote.nextLevel,
      capacity: calculateDepotCapacity(item.areaHa, quote.nextLevel),
      maintenanceCost: calculateDepotMaintenance(item.areaHa, quote.nextLevel),
      constructionCost: (item.constructionCost ?? 0) + quote.cost,
    });
    financeState.economy = { ...financeState.economy, cash: financeState.economy.cash - quote.cost, constructionSpent: financeState.economy.constructionSpent + quote.cost };
    requestUpdateDomains(["capacity", "finance", "hud-finance", "hud-status", "active-panel"]);
    await flushStateSave();
    if (!hasActiveGameSession || metaState.current.slotId !== slotId || metaState.current.cityId !== cityId) return false;
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    showToast("차량기지를 확장했습니다.");
    return true;
  } catch (error) {
    if (!hasActiveGameSession || metaState.current.slotId !== slotId || metaState.current.cityId !== cityId) return false;
    networkState.depots = networkState.depots.map((item) => item.id !== id ? item : {
      ...item, level: depot.level, capacity: depot.capacity, maintenanceCost: depot.maintenanceCost, constructionCost: depot.constructionCost,
    });
    financeState.economy = { ...financeState.economy, cash: financeState.economy.cash + quote.cost, constructionSpent: financeState.economy.constructionSpent - quote.cost };
    let message = "확장을 저장하지 못해 기지와 비용을 복구했습니다.";
    try { await flushStateSave(); }
    catch { message += " 복구 상태 저장도 실패했습니다. 저장 장치를 확인해 주세요."; }
    showError(message);
    console.error("[depot] 확장 저장 실패", error);
    return false;
  } finally {
    depotExpansionsInFlight.delete(id);
    if (hasActiveGameSession && metaState.current.slotId === slotId && metaState.current.cityId === cityId) {
      requestUpdateDomains(["capacity", "finance", "hud-finance", "hud-status", "active-panel"]);
      renderDepotManager();
    }
  }
}

function updateHud(selectedId?: string) {
  const selectedRoute = networkState.routes.find((route) => route.id === selectedId) ?? networkState.routes.at(-1);
  const selectedStation = networkState.stations.find((station) => station.id === selectedId);
  const selectedDepot = networkState.depots.find((depot) => depot.id === selectedId || depot.id === selectedDepotId);
  const sumCost = networkState.routes.reduce((sum, route) => sum + route.constructionCost, 0);
  hudRenderer.updateMany({
    routeCount: `${networkState.routes.length}개 노선`,
    stationCount: `${networkState.stations.length}개 역`,
    depotCount: `${networkState.depots.length}개 기지`,
    selectedRoute: selectedRoute ? `${selectedRoute.name} · ${selectedRoute.lengthKm.toFixed(1)} km` : "건설 대기",
    totalCost: formatCost(sumCost),
    cost: selectedRoute ? formatCost(selectedRoute.constructionCost) : "0억",
  });
  if (selectedStation) {
    const transfer = networkState.transfers.find((item) => item.id === selectedStation.transferGroupId);
    hudRenderer.update("facility", transfer ? `환승저항 ${transfer.resistance}` : `수요 ${selectedStation.demand.toLocaleString("ko-KR")}`);
  } else if (selectedDepot) {
    hudRenderer.update("facility", `${selectedDepot.capacity}편성 · ${formatCost(selectedDepot.maintenanceCost)}/월`);
  } else {
    hudRenderer.update("facility", networkState.transfers.length > 0 ? `${networkState.transfers.length}개 환승` : "시설 대기");
  }
  if (planningMode) {
    const plan = getActivePlan(false);
    hudRenderer.updateMany({
      routeCount: `${networkState.routes.length}개 노선 · 계획 ${constructionState.plans.filter((item) => item.cityId === metaState.current.cityId).length}`,
      selectedRoute: plan ? `${plan.name} · ${plan.routes.length}개 예정 노선` : "새 계획 대기",
      stationCount: `${networkState.stations.length}개 역 · 예정 ${plan?.stations.filter((item) => !item.completed).length ?? 0}`,
      depotCount: `${networkState.depots.length}개 기지 · 예정 ${plan?.depots.filter((item) => !item.completed).length ?? 0}`,
      totalCost: formatCost(plan?.remainingCost ?? 0),
      cost: formatCost(plan?.remainingCost ?? 0),
      facility: plan ? `예상 수요 ${plan.expectedDemand.toLocaleString("ko-KR")}` : "계획 시설 대기",
    });
  }
  if (undoButton) undoButton.disabled = undoStack.length === 0;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
}

function setTool(tool: ToolMode) {
  const allowedTools: Record<WorkspaceMode, ToolMode[]> = {
    management: ["pan", "expressStop"],
    planning: ["pan", "route", "extend", "station", "transfer", "depot", "eraser", "branch", "merge"],
    construction: ["pan", "transfer", "eraser", "branch", "merge"],
  };
  if (!allowedTools[workspaceMode].includes(tool)) {
    const targetMode = ["route", "extend", "station", "transfer", "depot", "branch", "merge"].includes(tool)
      ? "기획"
      : tool === "pan"
        ? "관리"
        : "공사";
    showToast(`${targetMode} 모드에서 사용할 수 있는 도구입니다.`);
    return;
  }
  if (planningMode && ["edit", "reconnect", "expressStop"].includes(tool)) {
    showToast("이 도구는 실제 건설 모드에서 사용할 수 있습니다.");
    return;
  }
  const planningTool: RoutePlanningTool | null =
    tool === "extend" ? "extend" : tool === "merge" ? "connect" : tool === "branch" ? "branch" : null;
  if (routePlanningController.shouldConfirmToolChange(planningTool)) {
    openPlanningToolChangeDialog(tool);
    return;
  }
  if (constructionDraft) cancelConstructionDraft();
  if (demolitionReview) cancelDemolitionReview();
  activeTool = tool;
  if (planningTool) routePlanningController.start(planningTool, createId("route-planning"));
  else routePlanningController.replace(null);
  document.body.dataset.activeTool = tool;
  if (modifyToolsCard) modifyToolsCard.hidden = true;
  modifyToolsButton?.setAttribute("aria-expanded", "false");
  updateRouteSettingsCard(tool);
  if (eraserSizeControl) eraserSizeControl.hidden = tool !== "eraser";
  cancelActiveDrawing();
  if (tool !== "branch") pendingBranchJunction = null;
  if (tool !== "eraser") {
    deleteAnchor = null;
    plannedDeleteAnchor = null;
  }
  toolButtons.forEach((button) => {
    const isActive =
      (button === selectTool && tool === "pan") ||
      (button === routeTool && tool === "route") ||
      (button === extendTool && tool === "extend") ||
      (button === editTool && tool === "edit") ||
      (button === eraserTool && tool === "eraser") ||
      (button === reconnectTool && tool === "reconnect") ||
      (button === branchTool && tool === "branch") ||
      (button === mergeTool && tool === "merge") ||
      (button === stationTool && tool === "station") ||
      (button === transferTool && tool === "transfer") ||
      (button === depotTool && tool === "depot");
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.body.dataset.tool = tool;
  syncRail();
  updateExpressButton();
  if (tool === "pan") {
    map.dragging.enable();
    map.doubleClickZoom.enable();
    selectedTransferStationIds = [];
    selectedPlannedStationIds = [];
    selectedManualTransferEndpoints = [];
    mapLayers.clear("depot-guide");
    mapLayers.clear("repair-guide");
    mapLayers.clear("edit-guide");
    deleteAnchor = null;
    updateLod();
    requestUpdate("route-style", selectedRouteId ?? undefined);
    return;
  }
  map.dragging.disable();
  map.doubleClickZoom.disable();
  const labels: Record<ToolMode, [string, string[]]> = {
    pan: ["지도 탐색", ["한 손가락 이동", "핀치 줌"]],
    route: ["노선 건설", ["드래그로 노선", "확정 후 같은 도구로 계속 건설"]],
    extend: planningMode ? ["계획 노선 연장", ["계획 노선의 시작점 또는 끝점에서 시작", "확정 후 다른 끝점에서 계속 연장"]] : ["노선 연장", ["기존 노선의 끝점에서 시작", "끝점을 누른 뒤 드래그"]],
    edit: ["경로 편집", ["노선 선택 후 핸들 드래그", "비용·환급 자동 계산"]],
    eraser: planningMode
      ? ["계획 시설 지우개", ["지울 계획 시설을 가로질러 드래그", "확정 후 계속 다른 범위를 삭제"]]
      : ["시설 철거", ["철거할 실제 시설을 가로질러 드래그", "범위와 영향을 검토 후 확정"]],
    reconnect: ["노선 수정", ["붉은 수정 지점에서 시작", "반대쪽 지점까지 드래그"]],
    branch: planningMode ? ["계획 분기", ["계획 노선 위에서 시작", "확정 후 계속 다른 분기 추가"]] : ["분기 건설", ["기존 노선 위에서 시작", "완공 후 균등 배차"]],
    merge: planningMode ? ["계획 노선 연결", ["첫 계획 노선 끝점 선택", "다른 계획 노선 끝점 선택", "자금 차감 없이 하나의 설계안으로 정리"]] : ["노선 연결", ["첫 노선 끝점 선택", "다른 노선 끝점 선택", "거리와 비용을 확인한 뒤 확정"]],
    station: ["역 배치", ["완성 노선 위 터치", "가까운 노선 자동 연결"]],
    transfer: planningMode
      ? ["수동 환승 계획", ["첫 번째 기존역 또는 계획역 선택", "두 번째 역 선택", "계획에 환승 연결 저장"]]
      : ["환승 해제", ["해제할 기존 환승역을 선택", "그룹의 모든 역이 개별 일반역으로 전환", "실행 취소로 복원 가능"]],
    depot: ["차량기지", ["부지 영역을 드래그", "노선 연결 없이도 단독 건설 가능"]],
    expressStop: ["급행 정차역", ["정차역 터치 토글", "급행 운영비 추가"]],
  };
  hudRenderer.update("tool", labels[tool][0]);
  setHint(labels[tool][1]);
  if (planningMode) {
    hudRenderer.update("tool", `계획 · ${labels[tool][0]}`);
    setHint(labels[tool][1]);
  }
  if (tool === "depot") renderDepotConnectionGuide();
  else mapLayers.clear("depot-guide");
  if (tool === "reconnect") renderRepairGuide();
  else mapLayers.clear("repair-guide");
  if (tool === "edit") renderEditHandles();
  else if (tool === "eraser") renderDeleteGuide();
  else if (tool === "merge") renderMergeGuide();
  else mapLayers.clear("edit-guide");
  reconcileBlueprints();
  updateDynamicLayers();
  playFeedback("select");
}

function cancelActiveDrawing() {
  resetRouteDrawingHudProximity();
  mapSelectionGestureController.reset();
  releaseDrawingPointer(activePointerId);
  activePointerId = null;
  activeExtension = null;
  activeRepair = null;
  activeBranch = null;
  activePlanningContinuation = null;
  activeHandleMove = null;
  handlePreviewCoordinates = null;
  rawDrawPoints = [];
  mapLayers.clear("construction-preview");
  map.dragging.enable();
}

function selectRoute(routeId: string | null, shouldRender = true) {
  selectedRouteId = routeId && networkState.routes.some((route) => route.id === routeId) ? routeId : null;
  if (selectedRouteId) {
    selectedOperationRouteId = selectedRouteId;
    const route = networkState.routes.find((item) => item.id === selectedRouteId);
    if (route) selectedColor = route.color;
  } else {
    linePanel.close();
  }
  updateExpressButton();
  deleteAnchor = null;
  plannedDeleteAnchor = null;
  if (shouldRender) requestUpdate("route-style", selectedRouteId ?? undefined);
}

function findRoutesAtPoint(point: L.Point, thresholdPx: number) {
  return networkState.routes
    .map((route) => ({
      route,
      distance: Math.min(
        ...getRoutePaths(route).flatMap((path) =>
          path.slice(1).map((end, index) => {
            const startPoint = map.latLngToContainerPoint(path[index]);
            const endPoint = map.latLngToContainerPoint(end);
            return pointLineDistance(point, startPoint, endPoint);
          }),
        ),
      ),
    }))
    .filter((item) => item.distance <= thresholdPx)
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.route);
}

function openRouteChoice(hitRoutes: RouteLine[]) {
  if (!routeChoiceDialog || !routeChoiceList) return;
  routeChoiceList.innerHTML = hitRoutes
    .map(
      (route) =>
        `<button class="game-route-item" type="button" data-route-id="${route.id}">${lineMarkHtml(route)}<span class="game-route-item__text"><strong>${escapeHtml(route.name)}</strong><small>${route.lengthKm.toFixed(1)}km · ${(route.branches?.length ?? 0)}개 분기</small></span></button>`,
    )
    .join("");
  routeChoiceList.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.addEventListener("click", () => {
      selectRoute(button.dataset.routeId ?? null);
      openLineManager();
      closeRouteChoice();
    });
  });
  routeChoiceDialog.hidden = false;
}

void openRouteChoice;

function openLeftRouteWindow() {
  if (!leftRouteWindow) return;
  renderLeftRouteWindow();
  playFeedback("select");
}

function closeLeftRouteWindow() {
  panelManager.close("route-list");
}

function toggleLeftRouteWindow() {
  if (leftRouteWindow?.hidden) {
    openLeftRouteWindow();
  } else {
    closeLeftRouteWindow();
  }
}

function renderLeftRouteWindow() {
  if (!leftRouteList) return;
  const totalKm = networkState.routes.reduce((sum, r) => sum + r.lengthKm, 0);
  setText(leftRouteTotalCount, `${networkState.routes.length}개`);
  setText(leftRouteTotalKm, `${totalKm.toFixed(1)} km`);
  linePanel.renderRouteList(networkState.routes.map((route) => ({
    id: route.id,
    name: route.name,
    color: route.color,
    meta: `${route.lengthKm.toFixed(1)}km · 역 ${networkState.stations.filter((station) => station.connectedRouteIds.includes(route.id)).length}개 · 운행 계통 ${operationsState.services.filter((service) => service.ownerRouteId === route.id).length}개`,
    selected: route.id === selectedRouteId,
  })), (routeId) => {
    selectedRouteId = routeId;
    requestUpdate("route-style", routeId);
    renderLeftRouteWindow();
    openLineManager();
    playFeedback("select");
  });
}

function closeRouteChoice() {
  if (routeChoiceDialog) routeChoiceDialog.hidden = true;
}

function updateSelectedLinePanel() {
  const route = networkState.routes.find((item) => item.id === selectedRouteId);
  if (!route) {
    if (selectedLineTitle) selectedLineTitle.textContent = "노선 선택";
    if (selectedLineMeta) selectedLineMeta.textContent = "지도를 눌러 노선을 선택하세요";
    if (selectedLineColor) selectedLineColor.style.background = "#94a3b8";
    return;
  }
  const status = route.operationPaused ? "운행 중지" : route.visibility === "planning" ? "계획 공개" : "운행 중";
  const branchLabel = (route.branches?.length ?? 0) > 0 ? ` · 분기 ${route.branches!.length}` : "";
  if (selectedLineTitle) selectedLineTitle.textContent = route.name;
  if (selectedLineMeta) selectedLineMeta.textContent = `${route.lengthKm.toFixed(1)}km · ${status}${branchLabel}`;
  if (selectedLineColor) selectedLineColor.style.background = route.color;
}

function renderOperatingServiceMapOverlay(service?: OperatingService, changedStationId?: string) {
  mapLayers.clear("operating-service");
  if (!service || service.pathCoordinates.length < 2) return;
  const layer = mapLayers.get("operating-service");
  const routeColor = networkState.routes.find((route) => route.id === service.ownerRouteId)?.color ?? "#4ce0c3";
  const stopIds = new Set(service.stopStationIds);
  const terminalIds = new Set([service.stationIds[0], service.stationIds[service.stationIds.length - 1]]);
  L.polyline(service.pathCoordinates, {
    color: "#07131d",
    weight: 13,
    opacity: 0.9,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  }).addTo(layer);
  L.polyline(service.pathCoordinates, {
    color: routeColor,
    weight: 7,
    opacity: 0.94,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  }).addTo(layer);
  for (const stationId of service.stationIds) {
    const station = networkState.stations.find((item) => item.id === stationId);
    if (!station) continue;
    const stop = stopIds.has(stationId);
    const terminal = terminalIds.has(stationId);
    const glyph = document.createElement("span");
    glyph.className = `operating-service-stop-glyph${stop ? " stop" : " pass"}${terminal ? " terminal" : ""}${stationId === changedStationId ? " changed" : ""}`;
    glyph.style.setProperty("--service-color", routeColor);
    const marker = L.marker(station.position, {
      interactive: operatingServiceMapEditActive,
      keyboard: operatingServiceMapEditActive,
      bubblingMouseEvents: false,
      title: terminal
        ? `${station.name}, 시·종착역. 필수 정차역`
        : `${station.name}, ${stop ? "정차역" : "통과역"}. 선택하여 ${stop ? "통과역" : "정차역"}으로 변경`,
      icon: L.divIcon({
        className: `operating-service-station-target${operatingServiceMapEditActive ? " editable" : ""}`,
        html: glyph,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
    }).addTo(layer);
    if (operatingServiceMapEditActive) {
      marker.on("click", () => toggleOperatingServiceMapStation(stationId));
    }
    if (!stop) continue;
    const stationIndex = service.stationIds.indexOf(stationId);
    const direction = stationIndex % 2 === 0 ? "top" : "bottom";
    marker.bindTooltip(
      `<span class="operating-service-stop-label-kind">${terminal ? "시·종착" : "정차"}</span><strong>${escapeHtml(station.name)}</strong>`,
      {
        permanent: true,
        direction,
        offset: direction === "top" ? [0, -12] : [0, 12],
        className: `operating-service-stop-label${terminal ? " terminal" : ""}`,
        interactive: false,
        opacity: 1,
      },
    ).openTooltip();
  }
}

function renderOperatingServiceList(routeId: string) {
  const services = operationsState.services.filter((service) => service.ownerRouteId === routeId);
  setText(operatingServiceCount, `${services.length}개`);
  if (!operatingServiceList) return;
  operatingServiceList.innerHTML = services.length === 0
    ? `<p class="game-inspector__note">등록된 운행 계통이 없습니다. 경로와 정차역을 선택해 첫 계통을 추가하세요.</p>`
    : services.map((service) => {
      const operation = getOperatingServiceOperation(service);
      const routeNames = service.routeIds.map((id) => networkState.routes.find((route) => route.id === id)?.name).filter(Boolean).join(" → ");
      return `<button type="button" class="game-service-item" data-operating-service-id="${service.id}" aria-pressed="${service.id === selectedOperatingServiceId}">
        <span class="game-service-item__main"><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(routeNames)}</small></span>
        <span class="game-service-item__meta"><b>${operation.trainSets}편성</b><small>${service.stopStationIds.length}개 정차 · ${operation.enabled ? `${operation.headwayMin.toFixed(1)}분` : "열차 없음"}</small></span>
      </button>`;
    }).join("");
  if (operatingServiceTrainAction) operatingServiceTrainAction.hidden = !selectedOperatingServiceId;
}

function getOperatingServiceDraftStopIds() {
  return Array.from(operatingServiceStopList?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function updateOperatingServiceMapEditChrome(stopIds = getOperatingServiceDraftStopIds()) {
  const option = currentOperatingServicePathOption();
  const stopCount = option ? option.stationIds.filter((id) => stopIds.includes(id)).length : 0;
  setText(operatingServiceMapEditCount, `정차 ${stopCount} · 통과 ${Math.max(0, (option?.stationIds.length ?? 0) - stopCount)}`);
  if (editOperatingServiceStopsOnMapButton) {
    editOperatingServiceStopsOnMapButton.setAttribute("aria-pressed", String(operatingServiceMapEditActive));
    editOperatingServiceStopsOnMapButton.textContent = operatingServiceMapEditActive ? "⌖ 지도 편집 중" : "⌖ 지도에서 정차역 설정";
  }
}

function finishOperatingServiceMapEdit() {
  operatingServiceMapEditActive = false;
  operatingServiceMapEditInitialStops = [];
  document.body.classList.remove("operating-service-map-editing");
  if (operatingServiceMapEditBar) operatingServiceMapEditBar.hidden = true;
  if (operatingServicePathSelect) operatingServicePathSelect.disabled = false;
  updateOperatingServiceMapEditChrome();
  hudRenderer.update("tool", "지도 탐색");
  setHint(["한 손가락 이동", "핀치 줌"]);
  map.dragging.enable();
  map.doubleClickZoom.enable();
}

function beginOperatingServiceMapEdit() {
  if (operatingServiceMapEditActive) {
    applyOperatingServiceMapEdit();
    return;
  }
  const option = currentOperatingServicePathOption();
  if (!option || option.stationIds.length < 2) {
    showToast("지도에서 편집할 수 있는 운행 경로가 없습니다.");
    return;
  }
  setTool("pan");
  operatingServiceMapEditActive = true;
  operatingServiceMapEditInitialStops = getOperatingServiceDraftStopIds();
  document.body.classList.add("operating-service-map-editing");
  if (operatingServiceMapEditBar) operatingServiceMapEditBar.hidden = false;
  if (operatingServicePathSelect) operatingServicePathSelect.disabled = true;
  updateOperatingServiceMapEditChrome(operatingServiceMapEditInitialStops);
  hudRenderer.update("tool", `${operatingServiceNameInput?.value.trim() || "운행 계통"} · 정차역 편집`);
  setHint(["역을 터치해 정차·통과 전환", "빈 지도를 드래그해 이동"]);
  renderOperatingServiceStopChoices(operatingServiceMapEditInitialStops);
  playFeedback("select");
}

function cancelOperatingServiceMapEdit() {
  if (!operatingServiceMapEditActive) return;
  const initialStops = [...operatingServiceMapEditInitialStops];
  finishOperatingServiceMapEdit();
  renderOperatingServiceStopChoices(initialStops);
  showToast("지도 정차역 변경을 취소했습니다.");
}

function applyOperatingServiceMapEdit() {
  if (!operatingServiceMapEditActive) return;
  const stops = getOperatingServiceDraftStopIds();
  finishOperatingServiceMapEdit();
  renderOperatingServiceStopChoices(stops);
  showToast(`정차 ${stops.length}개를 계통 초안에 적용했습니다.`);
  playFeedback("confirm");
}

function toggleOperatingServiceMapStation(stationId: string) {
  if (!operatingServiceMapEditActive) return;
  const option = currentOperatingServicePathOption();
  if (!option) return;
  const station = networkState.stations.find((item) => item.id === stationId);
  const result = toggleOperatingServiceStop(option.stationIds, getOperatingServiceDraftStopIds(), stationId);
  if (result.locked) {
    showToast(`${station?.name ?? "기점·종점"}은 필수 정차역입니다.`);
    playFeedback("select");
    return;
  }
  if (!result.changed) return;
  operatingServiceDraftPreset = "custom";
  operatingServiceEditor?.querySelectorAll<HTMLElement>("[data-service-preset]").forEach((button) => button.classList.remove("active"));
  renderOperatingServiceStopChoices(result.stopStationIds, stationId);
  const isStop = result.stopStationIds.includes(stationId);
  showToast(`${station?.name ?? stationId} · ${isStop ? "정차" : "통과"}`);
  playFeedback("select");
}

function closeOperatingServiceEditor() {
  if (operatingServiceMapEditActive) finishOperatingServiceMapEdit();
  editingOperatingServiceId = null;
  if (operatingServiceEditor) operatingServiceEditor.hidden = true;
  renderOperatingServiceMapOverlay();
  rightLineControlCard?.classList.remove("service-mode");
  setText(lineManagerTitle, "노선 관리");
  updateSelectedLinePanel();
}

function openOperatingServiceEditor(serviceId?: string) {
  const route = networkState.routes.find((item) => item.id === selectedRouteId);
  if (!route || !operatingServiceEditor || !operatingServicePathSelect) return;
  if (operatingServiceMapEditActive) finishOperatingServiceMapEdit();
  operatingServiceSection?.setAttribute("open", "");
  editingOperatingServiceId = serviceId ?? null;
  const service = serviceId ? operationsState.services.find((item) => item.id === serviceId) : undefined;
  const options = getOperatingServicePathOptions(route.id);
  operatingServicePathSelect.innerHTML = options.map((option) =>
    `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)} · ${option.stationIds.length}개 역</option>`
  ).join("");
  const selectedOptionId = service?.pathOptionId && options.some((option) => option.id === service.pathOptionId)
    ? service.pathOptionId
    : options[0]?.id ?? "";
  operatingServicePathSelect.value = selectedOptionId;
  if (operatingServiceNameInput) operatingServiceNameInput.value = service?.name ?? `${route.name} 계통 ${operationsState.services.filter((item) => item.ownerRouteId === route.id).length + 1}`;
  operatingServiceDraftPreset = service?.preset ?? "all";
  rightLineControlCard?.classList.add("service-mode");
  setText(lineManagerTitle, service ? "운행 계통 관리" : "운행 계통 추가");
  if (selectedLineTitle) selectedLineTitle.textContent = service?.name ?? "새 운행 계통";
  if (selectedLineMeta) selectedLineMeta.textContent = service ? `${service.stopStationIds.length}개 역 정차 · ${service.routeIds.length}개 노선 경유` : "경로와 정차역을 설정하세요";
  operatingServiceEditor.querySelectorAll<HTMLElement>("[data-service-preset]").forEach((button) => button.classList.toggle("active", button.dataset.servicePreset === operatingServiceDraftPreset));
  setText(operatingServiceEditorTitle, service ? `${service.name} 관리` : "새 운행 계통");
  if (deleteOperatingServiceButton) deleteOperatingServiceButton.hidden = !service;
  operatingServiceEditor.hidden = false;
  renderOperatingServiceStopChoices(service?.stopStationIds);
}

function currentOperatingServicePathOption() {
  const routeId = selectedRouteId;
  if (!routeId) return undefined;
  return getOperatingServicePathOptions(routeId).find((option) => option.id === operatingServicePathSelect?.value);
}

function renderOperatingServiceStopChoices(selectedStopIds?: string[], changedStationId?: string) {
  const option = currentOperatingServicePathOption();
  if (!operatingServiceStopList || !option) {
    if (operatingServiceStopList) operatingServiceStopList.innerHTML = `<p class="game-inspector__note">선택 가능한 경로가 없습니다.</p>`;
    return;
  }
  const transferIds = new Set(networkState.transfers.flatMap((transfer) => transfer.stationIds));
  const selectedStops = selectedStopIds ?? applyStopPreset(operatingServiceDraftPreset, option.stationIds, transferIds);
  const stops = option.stationIds.filter((id, index) => selectedStops.includes(id) || index === 0 || index === option.stationIds.length - 1);
  operatingServiceStopList.innerHTML = option.stationIds.map((stationId, index) => {
    const station = networkState.stations.find((item) => item.id === stationId);
    const terminal = index === 0 || index === option.stationIds.length - 1;
    return `<label class="game-check game-stop-item"><input type="checkbox" value="${stationId}" ${stops.includes(stationId) || terminal ? "checked" : ""} ${terminal ? "disabled" : ""}/><span>${escapeHtml(station?.name ?? stationId)}</span><small>${terminal ? "기점·종점 (필수)" : transferIds.has(stationId) ? "환승역" : "통과 가능"}</small></label>`;
  }).join("");
  updateOperatingServiceMapEditChrome(stops);
  const preview: OperatingService = {
    id: editingOperatingServiceId ?? "preview",
    name: operatingServiceNameInput?.value ?? "preview",
    ownerRouteId: selectedRouteId ?? "",
    routeIds: option.routeIds,
    branchIds: option.branchIds,
    pathOptionId: option.id,
    pathCoordinates: option.points.map((point) => [point.lat, point.lng]),
    stationIds: option.stationIds,
    stopStationIds: stops,
    preset: operatingServiceDraftPreset,
    createdAt: Date.now(),
  };
  renderOperatingServiceMapOverlay(preview, changedStationId);
}

function applyOperatingServicePreset(preset: StopPreset) {
  operatingServiceDraftPreset = preset;
  operatingServiceEditor?.querySelectorAll<HTMLElement>("[data-service-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.servicePreset === preset);
    button.setAttribute("aria-pressed", String(button.dataset.servicePreset === preset));
  });
  renderOperatingServiceStopChoices();
}

function saveOperatingServiceEditor() {
  const route = networkState.routes.find((item) => item.id === selectedRouteId);
  const option = currentOperatingServicePathOption();
  if (!route || !option || option.stationIds.length < 2) {
    showToast("운행 가능한 역이 두 개 이상인 경로를 선택하세요.");
    return;
  }
  const checkedStops = Array.from(operatingServiceStopList?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])
    .filter((input) => input.checked)
    .map((input) => input.value);
  const stopStationIds = option.stationIds.filter((id, index) => checkedStops.includes(id) || index === 0 || index === option.stationIds.length - 1);
  const existing = editingOperatingServiceId ? operationsState.services.find((item) => item.id === editingOperatingServiceId) : undefined;
  const service: OperatingService = {
    id: existing?.id ?? createId("service"),
    name: operatingServiceNameInput?.value.trim() || `${route.name} 운행계통`,
    ownerRouteId: route.id,
    routeIds: option.routeIds,
    branchIds: option.branchIds,
    pathOptionId: option.id,
    pathCoordinates: option.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
    stationIds: option.stationIds,
    stopStationIds,
    preset: operatingServiceDraftPreset,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  pushHistory();
  operationsState.services = replaceOperatingService(operationsState.services, service);
  selectedOperatingServiceId = service.id;
  editingOperatingServiceId = service.id;
  redoStack = [];
  requestStateSave("immediate");
  renderOperatingServiceList(route.id);
  openOperatingServiceEditor(service.id);
  renderOperatingServiceMapOverlay(service);
  requestUpdate("fleet-service", route.id);
  showToast(`${service.name} 운행계통을 저장했습니다.`);
}

function handleOperatingServiceListClick(event: Event) {
  const card = (event.target as HTMLElement).closest<HTMLElement>("[data-operating-service-id]");
  const serviceId = card?.dataset.operatingServiceId;
  if (!serviceId) return;
  selectedOperatingServiceId = serviceId;
  const service = operationsState.services.find((item) => item.id === serviceId);
  renderOperatingServiceList(service?.ownerRouteId ?? selectedRouteId ?? "");
  openOperatingServiceEditor(serviceId);
  renderOperatingServiceMapOverlay(service);
  if (operatingServiceTrainAction) operatingServiceTrainAction.hidden = false;
  playFeedback("select");
}

function deleteSelectedOperatingService() {
  const serviceId = editingOperatingServiceId;
  const service = operationsState.services.find((item) => item.id === serviceId);
  if (!service) return;
  pushHistory();
  const remaining = removeOperatingService(operationsState.services, operationsState.fleets, service.id);
  operationsState.services = remaining.services;
  operationsState.fleets = remaining.fleets;
  selectedOperatingServiceId = null;
  closeOperatingServiceEditor();
  renderOperatingServiceMapOverlay();
  renderOperatingServiceList(service.ownerRouteId);
  requestStateSave("immediate");
  requestUpdate("fleet-service", service.ownerRouteId);
  showToast(`${service.name} 운행계통을 삭제했습니다.`);
}

function openLineManager() {
  const route = networkState.routes.find((item) => item.id === selectedRouteId) || networkState.routes[0];
  if (!route) {
    showToast("먼저 노선을 선택하세요");
    return;
  }
  selectedRouteId = route.id;
  selectedOperationRouteId = route.id;
  if (!operationsState.services.some((service) => service.id === selectedOperatingServiceId && service.ownerRouteId === route.id)) {
    selectedOperatingServiceId = null;
    closeOperatingServiceEditor();
    renderOperatingServiceMapOverlay();
  }
  updateExpressButton();
  const status = route.operationPaused ? "운행 중지" : route.visibility === "planning" ? "계획 공개" : "운행 중";
  const branchLabel = (route.branches?.length ?? 0) > 0 ? ` · 분기 ${route.branches!.length}` : "";
  linePanel.render({
    id: route.id,
    name: route.name,
    color: route.color,
    meta: `${route.lengthKm.toFixed(1)}km · ${status}${branchLabel}`,
    summary: `${route.lengthKm.toFixed(1)}km · 역 ${networkState.stations.filter((station) => station.connectedRouteIds.includes(route.id)).length}개 · 분기 ${(route.branches?.length ?? 0)}개`,
    visibility: route.visibility ?? "public",
    localService: route.localServiceEnabled !== false,
    expressService: route.expressServiceEnabled === true || getExpressConfig(route.id).enabled,
    paused: route.operationPaused === true,
    fare: String(financeState.economy.fare),
    autoFare: financeState.economy.autoFare,
  });
  syncColorPicker(lineColorInput);
  renderOperatingServiceList(route.id);
  playFeedback("select");
}

function closeLineManager() {
  closeOperatingServiceEditor();
  renderOperatingServiceMapOverlay();
  linePanel.close();
}

function openTrainManagerModal() {
  if (!selectedOperatingServiceId || !operationsState.services.some((service) => service.id === selectedOperatingServiceId)) {
    showToast("먼저 관리할 운행 계통을 선택하세요.");
    return;
  }
  selectedTrainFleetId = null;
  selectedTrainSetNumber = null;
  showTrainManagerModal();
}

function openTrainManagerForFleet(fleetId: string, setNumber: number) {
  selectedTrainFleetId = fleetId;
  selectedTrainSetNumber = setNumber;
  showTrainManagerModal();
}

function showTrainManagerModal() {
  if (!trainPanel) return;
  renderTrainManager();
  playFeedback("select");
}

function closeTrainManagerModal() {
  trainPanel?.close();
}

type OperatingComparisonMetric = "demand" | "captureRate" | "crowding" | "waitMin" | "satisfaction" | "revenue" | "netProfit";

function operatingMetricText(metric: OperatingComparisonMetric, value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  if (metric === "demand") return `${Math.round(value).toLocaleString("ko-KR")}명`;
  if (metric === "captureRate") return `${Math.round(value * 100)}%`;
  if (metric === "crowding") return `${Math.round(value * 100)}%`;
  if (metric === "waitMin") return `${value.toFixed(1)}분`;
  if (metric === "satisfaction") return `${Math.round(value)}점`;
  if (metric === "revenue") return formatCost(value);
  return formatSignedCost(value);
}

function renderOperatingForecastComparison(forecast: DemandResponsiveForecast) {
  const confirmed = financeState.statistics.dailyRecords.at(-1);
  const confirmedValues = {
    demand: confirmed?.passengers,
    captureRate: confirmed?.captureRate,
    crowding: confirmed?.crowding,
    waitMin: confirmed?.waitMin,
    satisfaction: confirmed?.satisfaction,
    revenue: confirmed?.revenue,
    netProfit: confirmed ? confirmed.revenue - confirmed.expenses : undefined,
  };
  const forecastValues = {
    demand: forecast.demand,
    captureRate: forecast.captureRate,
    crowding: forecast.crowding,
    waitMin: forecast.waitMin,
    satisfaction: forecast.satisfaction,
    revenue: forecast.revenue,
    netProfit: forecast.netProfit,
  };
  const labels: Record<OperatingComparisonMetric, string> = {
    demand: "실제 이용객",
    captureRate: "철도 이용 전환율",
    crowding: "혼잡도",
    waitMin: "대기시간",
    satisfaction: "만족도",
    revenue: "운임 수익",
    netProfit: "순이익",
  };
  return `<section class="dg-panel__section" aria-label="운영 설정 예상 효과">
    <h3 class="dg-panel__section-label">운영 예상 효과</h3>
    <p class="game-inspector__note">경로는 유지하고 수송력만 다시 계산합니다.</p>
    <table class="dg-table">
      <thead><tr><th scope="col">지표</th><th scope="col" class="dg-num">전일 확정</th><th scope="col" class="dg-num">현재 예상</th></tr></thead>
      <tbody>${(Object.keys(labels) as Array<keyof typeof labels>).map((metric) => `
        <tr><th scope="row">${labels[metric]}</th><td class="dg-num">${operatingMetricText(metric, confirmedValues[metric])}</td><td class="dg-num" data-operating-forecast="${metric}">${operatingMetricText(metric, forecastValues[metric])}</td></tr>`).join("")}
      </tbody>
    </table>
  </section>`;
}

function updateOperatingForecastComparison(forecast: DemandResponsiveForecast) {
  for (const metric of ["demand", "captureRate", "crowding", "waitMin", "satisfaction", "revenue", "netProfit"] as const) {
    const element = trainManagerContent?.querySelector<HTMLElement>(`[data-operating-forecast="${metric}"]`);
    setText(element ?? null, operatingMetricText(metric, forecast[metric]));
  }
}

function renderServiceOperationSummary(service: OperatingService) {
  const operation = getOperatingServiceOperation(service);
  return `<section class="service-operation-summary" aria-label="운행계통 현황">
    <header><span>OPERATING SERVICE</span><strong>${escapeHtml(service.name)}</strong></header>
    <div class="service-operation-row">
      <span>${operation.enabled ? "운행 중" : "열차 미배정"}</span>
      <strong>${operation.trainSets}편성 · ${operation.headwayMin > 0 ? `${operation.headwayMin.toFixed(1)}분` : "-"}</strong>
      <small>시간당 ${operation.hourlyCapacity.toLocaleString("ko-KR")}명 · ${service.stopStationIds.length}개 정차</small>
    </div>
  </section>`;
}

function renderTrainManager() {
  if (!trainPanel) return;
  const service = operationsState.services.find((item) => item.id === selectedOperatingServiceId);
  const route = networkState.routes.find((item) => item.id === service?.ownerRouteId);
  if (!route || !service) {
    trainPanel.render("none", `<div class="left-route-empty"><span>선택된 운행 계통이 없습니다</span></div>`, handleTrainPanelClick, handleTrainPanelChange);
    return;
  }

  const routeFleets = operationsState.fleets.filter((fleet) => fleet.serviceId === service.id);
  const totalSets = routeFleets.reduce((sum, f) => sum + f.sets, 0);
  const connectedDepotCapacity = networkState.depots
    .filter((depot) => isDepotOperational(depot.id) && depot.connectedRouteIds.some((routeId) => service.routeIds.includes(routeId)))
    .reduce((sum, depot) => sum + depot.capacity, 0);
  const operation = getOperatingServiceOperation(service);
  const selectedFleet = routeFleets.find((fleet) => fleet.id === selectedTrainFleetId);
  const operatingForecast = calculateDemandResponsiveForecast();
  const selectedTrainSummary = selectedFleet
    ? `<div class="selected-train-summary" style="--selected-train-color:${escapeHtml(route.color)}">
        <span>선택한 열차</span>
        <strong>${escapeHtml(trainCatalog[selectedFleet.trainType].label)} · ${selectedFleet.cars}량 ${selectedTrainSetNumber ? `· ${selectedTrainSetNumber}편성` : ""}</strong>
      </div>`
    : "";

  const fleetsHtml = routeFleets.length === 0
    ? `<div class="left-route-empty"><span>배치된 열차가 없습니다</span><small>아래에서 신규 열차 편성을 도입하세요</small></div>`
    : routeFleets.map((fleet) => {
      const spec = trainCatalog[fleet.trainType];
      return `
            <div class="fleet-card-item fleet-service-fleet" data-service-kind="fleet">
              <div class="fleet-card-info">
                <span class="fleet-service-badge">FLEET</span>
                <strong>${escapeHtml(spec.label)} (${fleet.cars}량)</strong>
                <span>수송력: ${(spec.capacityPerCar * fleet.cars).toLocaleString()}명 · 최고속도: ${spec.speedKmh}km/h</span>
              </div>
              <div class="fleet-card-controls">
                <span class="fleet-count-readout">${fleet.sets}편성</span>
                <button class="fleet-qty-btn decrease" data-fleet-id="${fleet.id}">-1편성</button>
                <button class="fleet-qty-btn increase" data-fleet-id="${fleet.id}">+1편성</button>
              </div>
            </div>
          `;
    }).join("");
  trainPanel.renderView({
    entityId: service.id,
    selectedSummary: selectedTrainSummary,
    color: route.color,
    escapedRouteName: escapeHtml(service.name),
    totalSets,
    headway: operation.headwayMin.toFixed(1),
    depotCapacity: connectedDepotCapacity,
    forecastHtml: renderServiceOperationSummary(service) + renderOperatingForecastComparison(operatingForecast),
    fleetsHtml,
  }, handleTrainPanelClick, handleTrainPanelChange);
}

function handleTrainPanelChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  if (target.id !== "modalTrainTypeSelect" && target.id !== "modalCarCountSelect") return;
  const service = operationsState.services.find((item) => item.id === selectedOperatingServiceId);
  const route = networkState.routes.find((item) => item.id === service?.ownerRouteId);
  if (!route || !service) return;
  const trainType = (document.querySelector<HTMLSelectElement>("#modalTrainTypeSelect")?.value as TrainType) || "metro";
  const cars = Number(document.querySelector<HTMLSelectElement>("#modalCarCountSelect")?.value ?? 6);
  const spec = trainCatalog[trainType];
  const previewFleet: TrainFleet = {
    id: "forecast-preview",
    routeId: route.id,
    serviceId: service.id,
    trainType,
    cars,
    sets: 1,
    capacity: spec.capacityPerCar * cars,
    purchaseCost: spec.pricePerCar * cars,
    maintenanceCost: spec.maintenancePerCar * cars,
  };
  updateOperatingForecastComparison(calculateDemandResponsiveForecast([...operationsState.fleets, previewFleet]));
}

function handleTrainPanelClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button) return;
  const service = operationsState.services.find((item) => item.id === selectedOperatingServiceId);
  const route = networkState.routes.find((item) => item.id === service?.ownerRouteId);
  if (!route || !service) return;
  const connectedDepotCapacity = networkState.depots
    .filter((depot) => isDepotOperational(depot.id) && depot.connectedRouteIds.some((routeId) => service.routeIds.includes(routeId)))
    .reduce((sum, depot) => sum + depot.capacity, 0);
  if (button.classList.contains("increase")) {
    const fleet = operationsState.fleets.find((item) => item.id === button.dataset.fleetId);
    if (!fleet) return;
    const currentRouteSets = operationsState.fleets.filter((item) => item.serviceId === service.id).reduce((sum, item) => sum + item.sets, 0);
    if (currentRouteSets >= connectedDepotCapacity) {
      showToast("차량기지 수용량이 부족합니다. 기지를 확장하거나 연결 상태를 확인하세요.");
      return;
    }
    const purchaseCost = Math.round(trainCatalog[fleet.trainType].pricePerCar * fleet.cars);
    if (metaState.current.mode === "career" && purchaseCost > financeState.economy.cash) {
      showToast(`편성 구입 자금이 ${formatCost(purchaseCost - financeState.economy.cash)} 부족합니다.`);
      return;
    }
    pushHistory();
    operationsState.fleets = operationsState.fleets.map((item) => item.id === fleet.id ? updateFleetSetCount(item, item.sets + 1) : item);
    financeState.economy = { ...financeState.economy, cash: financeState.economy.cash - purchaseCost, trainSpent: financeState.economy.trainSpent + purchaseCost };
    redoStack = [];
    requestStateSave();
    renderTrainManager();
    requestUpdate("fleet-service", route.id);
    showToast(`${service.name}에 열차 1편성을 추가했습니다.`);
    return;
  }
  if (button.classList.contains("decrease")) {
    const fleet = operationsState.fleets.find((item) => item.id === button.dataset.fleetId);
    if (!fleet) return;
    pushHistory();
    operationsState.fleets = fleet.sets > 1
      ? operationsState.fleets.map((item) => item.id === fleet.id ? updateFleetSetCount(item, item.sets - 1) : item)
      : operationsState.fleets.filter((item) => item.id !== fleet.id);
    redoStack = [];
    requestStateSave();
    renderTrainManager();
    requestUpdate("fleet-service", route.id);
    showToast(`${service.name}의 열차 편성을 감축했습니다.`);
    return;
  }
  if (button.dataset.trainAction !== "add") return;
  const trainType = (document.querySelector<HTMLSelectElement>("#modalTrainTypeSelect")?.value as TrainType) || "metro";
  const cars = Number(document.querySelector<HTMLSelectElement>("#modalCarCountSelect")?.value ?? 6);
  const spec = trainCatalog[trainType];
  const currentRouteSets = operationsState.fleets.filter((fleet) => fleet.serviceId === service.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  if (currentRouteSets >= connectedDepotCapacity) {
    showToast("차량기지 수용량이 부족합니다. 기지를 확장하거나 연결 상태를 확인하세요.");
    return;
  }
  const purchaseCost = Math.round(spec.pricePerCar * cars);
    if (metaState.current.mode === "career" && purchaseCost > financeState.economy.cash) {
    showToast(`편성 구입 자금이 ${formatCost(purchaseCost - financeState.economy.cash)} 부족합니다.`);
    return;
  }
  pushHistory();
  operationsState.replaceFleets([...operationsState.fleets, {
    id: createId("fleet"),
    routeId: route.id,
    serviceId: service.id,
    trainType,
    cars,
    sets: 1,
    capacity: spec.capacityPerCar * cars,
    purchaseCost,
    maintenanceCost: Math.round(spec.maintenancePerCar * cars),
  }]);
  financeState.economy = { ...financeState.economy, cash: financeState.economy.cash - purchaseCost, trainSpent: financeState.economy.trainSpent + purchaseCost };
  redoStack = [];
  requestStateSave();
  renderTrainManager();
  requestUpdate("fleet-service", route.id);
  playFeedback("confirm");
  showToast(`${service.name}에 신규 ${cars}량 ${spec.label} 1편성을 배정했습니다.`);
}

function saveLineManager() {
  const route = networkState.routes.find((item) => item.id === selectedRouteId);
  if (!route) return;
  const nextName = lineNameInput?.value.trim() || route.name;
  const nextColor = lineColorInput?.value || route.color;
  const nextFare = Number.isNaN(parseInt(lineFareInput?.value || "", 10))
    ? financeState.economy.fare
    : clampInteger(parseInt(lineFareInput?.value || "", 10), 900, 4200);
  const serviceChanged =
    route.visibility !== (lineVisibilitySelect?.value === "planning" ? "planning" : "public") ||
    route.operationPaused !== (operationPausedToggle?.checked ?? false);
  const styleChanged = route.name !== nextName || route.color !== nextColor;
  const fareChanged = financeState.economy.fare !== nextFare;
  pushHistory();
  const fareVal = parseInt(lineFareInput?.value || "", 10);
  if (!isNaN(fareVal)) {
    financeState.economy = { ...financeState.economy, fare: clampInteger(fareVal, 900, 4200) };
  }
  networkState.routes = networkState.routes.map((item) =>
    item.id === route.id
      ? {
          ...item,
          name: nextName,
          color: nextColor,
          visibility: lineVisibilitySelect?.value === "planning" ? "planning" : "public",
          operationPaused: operationPausedToggle?.checked ?? false,
        }
      : item,
  );
  redoStack = [];
  requestStateSave("immediate");
  closeLineManager();
  requestUpdates([
    serviceChanged ? "network-structure" : styleChanged ? "route-style" : "fleet-service",
    ...(fareChanged && !serviceChanged ? ["fare" as const] : []),
  ], route.id);
  showToast(`${nextName} 설정을 저장했습니다`);
  playFeedback("confirm");
}

function requestWholeLineDemolition() {
  const route = networkState.routes.find((item) => item.id === selectedRouteId);
  if (!route) return;
  const exclusiveStations = networkState.stations.filter((station) => station.connectedRouteIds.length === 1 && station.connectedRouteIds.includes(route.id));
  const sharedStations = networkState.stations.filter((station) => station.connectedRouteIds.length > 1 && station.connectedRouteIds.includes(route.id));
  const fleetCount = getFleetsServingRoute(route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  openDecisionDialog(
    `“${route.name}” 노선 전체를 철거할까요?`,
    `노선과 전용 역 ${exclusiveStations.length}개를 함께 삭제합니다.${sharedStations.length > 0 ? ` 환승역 ${sharedStations.length}개는 다른 노선에 남기고 이 노선 연결만 해제합니다.` : ""}${fleetCount > 0 ? ` 배정 차량 ${fleetCount}편성도 운행에서 해제됩니다.` : ""}`,
    "노선·역 전체 철거",
    () => demolishWholeLine(route.id),
  );
}

function demolishWholeLine(routeId: string) {
  const route = networkState.routes.find((item) => item.id === routeId);
  if (!route) return;
  const removableStationIds = new Set(networkState.stations.filter((station) => station.connectedRouteIds.length === 1 && station.connectedRouteIds.includes(routeId)).map((station) => station.id));
  pushHistory();
  networkState.routes = networkState.routes.filter((item) => item.id !== routeId);
  networkState.stations = networkState.stations
    .filter((station) => !removableStationIds.has(station.id))
    .map((station) => (station.connectedRouteIds.includes(routeId) ? { ...station, connectedRouteIds: station.connectedRouteIds.filter((id) => id !== routeId) } : station));
  operationsState.expressConfigs = operationsState.expressConfigs.map((config) => ({ ...config, stopStationIds: config.stopStationIds.filter((id) => !removableStationIds.has(id)) }));
  constructionState.replaceProjects(constructionState.projects
    .map((project) => ({
      ...project,
      routeIds: project.routeIds.filter((id) => id !== routeId),
      stationIds: project.stationIds.filter((id) => !removableStationIds.has(id)),
    }))
    .filter((project) => project.routeIds.length > 0 || project.stationIds.length > 0 || project.depotIds.length > 0));
  cleanupTransferData();
  synchronizeGraphReferences();
  selectedRouteId = null;
  selectedOperationRouteId = networkState.routes[0]?.id ?? "";
  redoStack = [];
  requestStateSave();
  closeLineManager();
  requestUpdate("network-structure");
  showToast(`${route.name} 노선과 전용 역 ${removableStationIds.size}개를 철거했습니다.`);
  playFeedback("confirm");
}

function renderEditHandles() {
  mapLayers.clear("edit-guide");
  const route = networkState.routes.find((item) => item.id === selectedRouteId);
  if (!route) {
    setText(facilityReadout, "먼저 편집할 노선을 선택하세요");
    return;
  }
  const indices = getVisibleHandleIndices(route.coordinates.length, map.getZoom());
  for (const index of indices) {
    const coordinate = route.coordinates[index];
    const endpoint = index === 0 || index === route.coordinates.length - 1;
    L.circleMarker(L.latLng(coordinate[0], coordinate[1]), {
      radius: endpoint ? 10 : 7,
      color: "#071116",
      weight: 3,
      fillColor: endpoint ? "#ffffff" : "#4ce0c3",
      fillOpacity: 1,
      interactive: false,
    }).addTo(editGuideLayer);
  }
}

function getVisibleHandleIndices(coordinateCount: number, zoom: number) {
  if (coordinateCount <= 2) return Array.from({ length: coordinateCount }, (_, index) => index);
  const maxHandles = zoom >= 16 ? 22 : zoom >= 14 ? 12 : 6;
  const step = Math.max(1, Math.ceil((coordinateCount - 1) / (maxHandles - 1)));
  const result = [0];
  for (let index = step; index < coordinateCount - 1; index += step) result.push(index);
  result.push(coordinateCount - 1);
  return result;
}

function findNearestEditHandle(point: L.Point, thresholdPx: number): RouteHandleMove | null {
  const route = networkState.routes.find((item) => item.id === selectedRouteId);
  if (!route) return null;
  let best: { index: number; distance: number } | null = null;
  for (const index of getVisibleHandleIndices(route.coordinates.length, map.getZoom())) {
    const coordinate = route.coordinates[index];
    const distance = point.distanceTo(map.latLngToContainerPoint(L.latLng(coordinate[0], coordinate[1])));
    if (distance <= thresholdPx && (!best || distance < best.distance)) best = { index, distance };
  }
  return best ? { routeId: route.id, coordinateIndex: best.index, originalCoordinates: route.coordinates.map((coordinate) => [...coordinate] as [number, number]) } : null;
}

function moveRouteControlPoint(coordinates: Array<[number, number]>, index: number, position: LatLng) {
  const moved = coordinates.map((coordinate) => [...coordinate] as [number, number]);
  moved[index] = [roundCoord(position.lat), roundCoord(position.lng)];
  if (index > 0 && index < moved.length - 1) {
    for (const offset of [-2, -1, 1, 2]) {
      const neighborIndex = index + offset;
      if (neighborIndex <= 0 || neighborIndex >= moved.length - 1) continue;
      const influence = Math.abs(offset) === 1 ? 0.22 : 0.08;
      moved[neighborIndex] = [
        roundCoord(coordinates[neighborIndex][0] * (1 - influence) + position.lat * influence),
        roundCoord(coordinates[neighborIndex][1] * (1 - influence) + position.lng * influence),
      ];
    }
  }
  return moved;
}

function updateEditCostPreview(routeId: string, coordinates: Array<[number, number]>) {
  const route = networkState.routes.find((item) => item.id === routeId);
  if (!route) return;
  const lengthKm = calculateLengthKmPrecise(coordinates.map(([lat, lng]) => L.latLng(lat, lng)));
  const deltaKm = lengthKm - route.lengthKm;
  const deltaCost = calculateEditCostDelta(deltaKm);
  setText(costReadout, formatSignedCost(deltaCost));
  setText(facilityReadout, `${deltaKm >= 0 ? "+" : ""}${deltaKm.toFixed(2)}km · ${deltaCost < 0 ? "환급" : "추가"} ${formatCost(Math.abs(deltaCost))}`);
}

function calculateEditCostDelta(deltaKm: number) {
  const raw = deltaKm * baseCostPerKm * cityConfigs[metaState.current.cityId].constructionMultiplier * difficultyConfigs[metaState.current.difficulty].costMultiplier;
  return Math.round(raw >= 0 ? raw : raw * 0.45);
}

function selectDeletePoint(point: L.Point) {
  if (planningMode) {
    selectPlannedRouteForErase(point);
    return;
  }
  const snap = findNearestRouteCoordinate(point, selectedRouteId ?? undefined, 30);
  if (!snap) {
    setText(facilityReadout, "삭제할 노선의 첫 지점을 선택하세요");
    return;
  }
  if (!deleteAnchor) {
    selectRoute(snap.route.id, false);
    deleteAnchor = { routeId: snap.route.id, coordinateIndex: snap.coordinateIndex, point: snap.point };
    renderDeleteGuide();
    setText(facilityReadout, "삭제 구간의 반대쪽 지점을 선택하세요");
    return;
  }
  if (snap.route.id !== deleteAnchor.routeId) {
    setText(facilityReadout, "같은 노선에서 두 번째 지점을 선택하세요");
    return;
  }
  const startIndex = Math.min(deleteAnchor.coordinateIndex, snap.coordinateIndex);
  const endIndex = Math.max(deleteAnchor.coordinateIndex, snap.coordinateIndex);
  if (endIndex - startIndex < 1) {
    setText(facilityReadout, "더 떨어진 두 지점을 선택하세요");
    return;
  }
  const route = snap.route;
  const removed = route.coordinates.slice(startIndex, endIndex + 1);
  const removedLength = calculateLengthKmPrecise(removed.map(([lat, lng]) => L.latLng(lat, lng)));
  const affectedStations = networkState.stations.filter(
    (station) => station.connectedRouteIds.includes(route.id) && distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), removed) < 75,
  );
  const fleetCount = getFleetsServingRoute(route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  const transferCount = new Set(affectedStations.map((station) => station.transferGroupId).filter(Boolean)).size;
  const keepsFirstSide = startIndex > 0;
  const keepsSecondSide = endIndex < route.coordinates.length - 1;
  const outcome =
    keepsFirstSide && keepsSecondSide
      ? "남는 양쪽 구간은 두 개의 독립 노선이 됩니다."
      : keepsFirstSide || keepsSecondSide
        ? "남는 한쪽 구간은 같은 노선으로 유지됩니다."
        : "남는 구간이 없어 노선 전체가 철거됩니다.";
  const warningParts = [
    fleetCount > 0 && keepsFirstSide && keepsSecondSide ? `운행 열차 ${fleetCount}편성은 두 노선에 균등 배분됩니다.` : "",
    fleetCount > 0 && !keepsFirstSide && !keepsSecondSide ? `운행 열차 ${fleetCount}편성도 함께 운행에서 제외됩니다.` : "",
    affectedStations.length > 0 ? `삭제 구간 주변 역 ${affectedStations.length}개를 다시 연결합니다.` : "",
    transferCount > 0 ? `환승 관계 ${transferCount}건을 재검증합니다.` : "",
  ].filter(Boolean);
  openDecisionDialog(
    `${route.name}의 ${removedLength.toFixed(2)}km 구간을 철거할까요? ${outcome}`,
    warningParts.join(" "),
    "선택 구간 철거",
    () => splitRouteAtRange(route.id, startIndex, endIndex, removedLength),
  );
  deleteAnchor = null;
  renderDeleteGuide();
}

function selectPlannedRouteForErase(point: L.Point) {
  const plan = getActivePlan(false);
  if (!plan) {
    showToast("지울 계획 노선이 없습니다.");
    return;
  }
  const snap = findNearestPlannedRoutePoint(point, plan);
  if (!snap || snap.distancePx > 28) {
    setText(facilityReadout, "지울 범위의 시작점 또는 끝점을 점선 계획 노선에서 터치하세요");
    return;
  }
  if (!plannedDeleteAnchor) {
    plannedDeleteAnchor = { routeId: snap.route.id, coordinateIndex: snap.coordinateIndex };
    renderDeleteGuide();
    setText(facilityReadout, "같은 계획 노선에서 지울 범위의 반대쪽 지점을 터치하세요");
    return;
  }
  if (snap.route.id !== plannedDeleteAnchor.routeId) {
    setText(facilityReadout, "같은 계획 노선에서 두 번째 지점을 터치하세요");
    return;
  }
  const startIndex = Math.min(plannedDeleteAnchor.coordinateIndex, snap.coordinateIndex);
  const endIndex = Math.max(plannedDeleteAnchor.coordinateIndex, snap.coordinateIndex);
  if (endIndex - startIndex < 1) {
    setText(facilityReadout, "조금 더 떨어진 두 지점을 선택하세요");
    return;
  }
  openPlannedRouteEraseRange(plan, snap.route, startIndex, endIndex);
  plannedDeleteAnchor = null;
  renderDeleteGuide();
}

function openPlannedRouteEraseRange(plan: ConstructionPlan, route: PlannedRoute, startIndex: number, endIndex: number) {
  const removedCoordinates = route.coordinates.slice(startIndex, endIndex + 1);
  const removedLength = calculateLengthKmPrecise(removedCoordinates.map(([lat, lng]) => L.latLng(lat, lng)));
  const affectedStationCount = plan.stations.filter(
    (station) => station.plannedRouteIds.includes(route.id) && distanceToCoordinatesMeters(L.latLng(...station.position), removedCoordinates) < 75,
  ).length;
  openDecisionDialog(
    `${route.name}의 ${removedLength.toFixed(2)}km 계획 구간을 지울까요?`,
    `삭제 후 남는 구간은 별도의 계획 노선으로 유지됩니다.${affectedStationCount > 0 ? ` 범위 안의 계획 역 ${affectedStationCount}개는 연결을 다시 확인합니다.` : ""}`,
    "선택 구간 지우기",
    () => void erasePlannedRouteRange(plan.id, route.id, startIndex, endIndex),
  );
}

async function erasePlannedRouteRange(planId: string, routeId: string, startIndex: number, endIndex: number) {
  const before = cloneState();
  try {
    const plan = constructionState.plans.find((item) => item.id === planId);
    const route = plan?.routes.find((item) => item.id === routeId);
    if (!plan || !route || startIndex < 0 || endIndex >= route.coordinates.length || endIndex - startIndex < 1) return;
    const removedSegmentIds = new Set(route.segments.slice(startIndex, endIndex).map((segment) => segment.id));
    if (route.completedSegmentIds.some((id) => removedSegmentIds.has(id))) {
      showToast("실제 건설로 전환된 계획 구간은 지울 수 없습니다.");
      return;
    }
    const firstCoordinates = route.coordinates.slice(0, startIndex + 1);
    const secondCoordinates = route.coordinates.slice(endIndex);
    const firstSegments = route.segments.slice(0, startIndex);
    const secondSegments = route.segments.slice(endIndex);
    if (firstCoordinates.length < 2 && secondCoordinates.length < 2) {
      showToast("노선 전체 삭제는 계획 목록의 삭제 기능을 사용하세요.");
      return;
    }
    const firstRoute = firstCoordinates.length >= 2 ? createPlannedRouteSection(route, route.id, route.name, firstCoordinates, firstSegments) : null;
    const secondRoute =
      secondCoordinates.length >= 2
        ? createPlannedRouteSection(route, createId("planned-route"), `${route.name} 분리`, secondCoordinates, secondSegments)
        : null;
    const remainingRoutes = [firstRoute, secondRoute].filter(Boolean) as PlannedRoute[];
    const orphanStationIds = new Set(
      plan.stations
        .filter(
          (station) =>
            !station.completed &&
            station.plannedRouteIds.includes(routeId) &&
            station.plannedRouteIds.filter((id) => id !== routeId).length === 0 &&
            station.actualRouteIds.length === 0 &&
            remainingRoutes.every((candidate) => distanceToCoordinatesMeters(L.latLng(...station.position), candidate.coordinates) > 75),
        )
        .map((station) => station.id),
    );
    updatePlan(planId, (item) => ({
      ...item,
      routes: item.routes.flatMap((candidate) => (candidate.id === routeId ? remainingRoutes : [candidate])),
      stations: item.stations
        .filter((station) => !orphanStationIds.has(station.id))
        .map((station) => {
          if (!station.plannedRouteIds.includes(routeId)) return station;
          const replacement = remainingRoutes
            .map((candidate) => ({ id: candidate.id, distance: distanceToCoordinatesMeters(L.latLng(...station.position), candidate.coordinates) }))
            .filter((candidate) => candidate.distance <= 75)
            .sort((a, b) => a.distance - b.distance)[0];
          return {
            ...station,
            plannedRouteIds: Array.from(new Set([...station.plannedRouteIds.filter((id) => id !== routeId), ...(replacement ? [replacement.id] : [])])),
          };
        }),
      depots: item.depots.map((depot) => ({
        ...depot,
        connectedPlannedRouteIds: depot.connectedPlannedRouteIds.filter((id) => id !== routeId),
      })),
      transfers: item.transfers.filter((transfer) => !transfer.stationIds.some((stationId) => orphanStationIds.has(stationId))),
    }));
    metaState.patch({ updatedAt: Date.now() });
    await flushStateSave();
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    renderPlanningDialog();
    requestUpdate("blueprint-preview");
    showToast("선택한 계획 구간을 지웠습니다. 실행 취소로 복원할 수 있습니다.");
    playFeedback("confirm");
  } catch (error) {
    stateRecoveryCoordinator.recover(before, {
      scope: "partial",
      domains: ["map-blueprints", "map-construction", "map-selection", "hud-status", "active-panel"],
      rebuildRouter: false,
    });
    requestStateSave();
    showError("계획 구간을 지우는 중 문제가 발생해 변경을 되돌렸습니다.");
    console.error(error);
  }
}

function createPlannedRouteSection(
  source: PlannedRoute,
  id: string,
  name: string,
  coordinates: Array<[number, number]>,
  segments: RouteSegment[],
): PlannedRoute {
  const points = coordinates.map(([lat, lng]) => L.latLng(lat, lng));
  const expectedDemand = estimatePlannedRouteDemand(points);
  return {
    ...source,
    id,
    name,
    coordinates,
    segments,
    completedSegmentIds: source.completedSegmentIds.filter((segmentId) => segments.some((segment) => segment.id === segmentId)),
    expectedCost: segments.reduce((sum, segment) => sum + segment.constructionCost, 0),
    constructionDays: Math.max(0, ...segments.map((segment) => segment.constructionDays ?? Math.round(segment.lengthKm * baseConstructionDaysPerKm))),
    expectedDemand,
    expectedRevenue: Math.round((expectedDemand * financeState.economy.fare * 365) / 100000000),
    transferEffect: estimatePlannedTransferEffect(points),
  };
}

function renderDeleteGuide() {
  mapLayers.clear("edit-guide");
  if (planningMode && plannedDeleteAnchor) {
    const route = getActivePlan(false)?.routes.find((item) => item.id === plannedDeleteAnchor!.routeId);
    const coordinate = route?.coordinates[plannedDeleteAnchor.coordinateIndex];
    if (!coordinate) return;
    L.circleMarker(L.latLng(coordinate[0], coordinate[1]), {
      radius: 11,
      color: "#ffffff",
      weight: 3,
      fillColor: "#d5dee3",
      fillOpacity: 1,
      dashArray: "3 2",
      interactive: false,
    }).addTo(editGuideLayer);
    return;
  }
  if (!deleteAnchor) return;
  const route = networkState.routes.find((item) => item.id === deleteAnchor!.routeId);
  if (!route) return;
  const coordinate = route.coordinates[deleteAnchor.coordinateIndex];
  L.circleMarker(L.latLng(coordinate[0], coordinate[1]), {
    radius: 11,
    color: "#ffffff",
    weight: 3,
    fillColor: "#ff5d5d",
    fillOpacity: 1,
    interactive: false,
  }).addTo(editGuideLayer);
}

function openDecisionDialog(message: string, warning: string, confirmLabel: string, action: () => void, intent: "danger" | "build" = "danger") {
  if (!decisionDialog) return;
  decisionDialog.dataset.decisionIntent = intent;
  setText(byId("decisionKicker"), intent === "build" ? "시설 확장 검토" : "작업 확인");
  setText(decisionMessage, message);
  setText(decisionWarning, warning);
  if (decisionWarning) decisionWarning.hidden = !warning;
  if (decisionConfirmButton) decisionConfirmButton.textContent = confirmLabel;
  if (decisionSaveDraftButton) decisionSaveDraftButton.hidden = true;
  pendingDecision = action;
  dialogManager.open("decision");
  bindDecisionDialogListeners();
}

function closeDecisionDialog() {
  pendingDecision = null;
  if (decisionDialog) delete decisionDialog.dataset.decisionIntent;
  routePlanningController.clearPendingToolChange();
  if (decisionSaveDraftButton) decisionSaveDraftButton.hidden = true;
  dialogManager.close("decision");
}

function bindDecisionDialogListeners() {
  if (decisionCancelButton) dialogManager.bind("decision", "cancel", decisionCancelButton, "click", closeDecisionDialog);
  if (closeDecisionButton) dialogManager.bind("decision", "close", closeDecisionButton, "click", closeDecisionDialog);
  if (decisionSaveDraftButton) dialogManager.bind("decision", "save-draft", decisionSaveDraftButton, "click", saveRoutePlanningDraftAndChangeTool);
  if (decisionDialog) {
    dialogManager.bindBackdropDismiss("decision", decisionDialog, closeDecisionDialog);
  }
  if (decisionConfirmButton) {
    dialogManager.bindConfirmation("decision", decisionConfirmButton, () => {
      const action = pendingDecision;
      closeDecisionDialog();
      action?.();
    });
  }
}

function openPlanningToolChangeDialog(tool: ToolMode) {
  if (!decisionDialog || !routePlanningController.session) return;
  routePlanningController.requestToolChange(tool);
  setText(decisionMessage, "진행 중인 설계가 있습니다.");
  setText(decisionWarning, "임시 저장하거나 현재 작업을 취소한 뒤 도구를 변경할 수 있습니다. 창을 닫으면 계속 편집합니다.");
  if (decisionWarning) decisionWarning.hidden = false;
  if (decisionSaveDraftButton) decisionSaveDraftButton.hidden = false;
  if (decisionConfirmButton) decisionConfirmButton.textContent = "현재 작업 취소 후 변경";
  pendingDecision = () => {
    routePlanningToolChangeController.cancelAndChange();
  };
  dialogManager.open("decision");
  bindDecisionDialogListeners();
}

function saveRoutePlanningDraftAndChangeTool() {
  routePlanningToolChangeController.saveDraftAndChange();
}

function splitRouteAtRange(routeId: string, startIndex: number, endIndex: number, removedLength: number) {
  const route = networkState.routes.find((item) => item.id === routeId);
  if (!route) return;
  const firstCoordinates = route.coordinates.slice(0, startIndex + 1);
  const secondCoordinates = route.coordinates.slice(endIndex);
  if (firstCoordinates.length < 2 || secondCoordinates.length < 2) {
    eraseRouteEndRange(route, firstCoordinates.length >= 2 ? firstCoordinates : secondCoordinates, removedLength);
    return;
  }
  if (firstCoordinates.length < 2 || secondCoordinates.length < 2) {
    showToast("끝 구간 삭제는 편집 핸들 이동 또는 연장을 이용하세요");
    return;
  }
  pushHistory();
  const first = rebuildRouteGraph({
    ...route,
    coordinates: firstCoordinates,
    lengthKm: Math.round(calculateLengthKmPrecise(firstCoordinates.map(([lat, lng]) => L.latLng(lat, lng))) * 10) / 10,
    constructionCost: Math.max(0, route.constructionCost - Math.round(removedLength * baseCostPerKm * 0.35)),
    disabledSegments: [],
    branches: [],
  });
  const secondId = createId("route");
  const second = rebuildRouteGraph({
    ...route,
    id: secondId,
    name: `${route.name} 분리선`,
    coordinates: secondCoordinates,
    lengthKm: Math.round(calculateLengthKmPrecise(secondCoordinates.map(([lat, lng]) => L.latLng(lat, lng))) * 10) / 10,
    constructionCost: Math.round(route.constructionCost * (secondCoordinates.length / route.coordinates.length)),
    disabledSegments: [],
    branches: [],
  });
  networkState.routes = networkState.routes.flatMap((item) => (item.id === routeId ? [first, second] : [item]));
  networkState.stations = networkState.stations.map((station) => {
    if (!station.connectedRouteIds.includes(routeId)) return station;
    const point = L.latLng(station.position[0], station.position[1]);
    const firstDistance = distanceToCoordinatesMeters(point, first.coordinates);
    const secondDistance = distanceToCoordinatesMeters(point, second.coordinates);
    const replacement = firstDistance <= secondDistance ? routeId : secondId;
    return { ...station, connectedRouteIds: Array.from(new Set(station.connectedRouteIds.map((id) => (id === routeId ? replacement : id)))) };
  });
  splitFleetBetweenRoutes(routeId, secondId);
  networkState.depots = networkState.depots.map((depot) =>
    depot.connectedRouteIds.includes(routeId) && depotTouchesRoute(depot, second)
      ? { ...depot, connectedRouteIds: Array.from(new Set([...depot.connectedRouteIds, secondId])) }
      : depot,
  );
  operationsState.expressConfigs = operationsState.expressConfigs.flatMap((config) =>
    config.routeId === routeId ? [{ ...config, stopStationIds: config.stopStationIds.filter((id) => networkState.stations.find((station) => station.id === id)?.connectedRouteIds.includes(routeId)) }] : [config],
  );
  cleanupTransferData();
  const refund = Math.round(removedLength * baseCostPerKm * 0.35);
  financeState.economy = { ...financeState.economy, cash: financeState.economy.cash + refund, constructionSpent: Math.max(0, financeState.economy.constructionSpent - refund) };
  redoStack = [];
  requestStateSave();
  selectRoute(routeId, false);
  requestUpdate("network-structure", routeId);
  showToast(`${route.name}을 두 노선으로 분리했습니다 · ${formatCost(refund)} 환급`);
  playFeedback("confirm");
}

function eraseRouteEndRange(route: RouteLine, remainingCoordinates: Array<[number, number]>, removedLength: number) {
  pushHistory();
  const remaining = remainingCoordinates.length >= 2
    ? rebuildRouteGraph({
        ...route,
        coordinates: remainingCoordinates,
        lengthKm: Math.round(calculateLengthKmPrecise(remainingCoordinates.map(([lat, lng]) => L.latLng(lat, lng))) * 10) / 10,
        constructionCost: Math.round(route.constructionCost * (calculateLengthKmPrecise(remainingCoordinates.map(([lat, lng]) => L.latLng(lat, lng))) / Math.max(0.001, route.lengthKm))),
        disabledSegments: [],
        branches: [],
      })
    : null;
  networkState.routes = remaining ? networkState.routes.map((item) => (item.id === route.id ? remaining : item)) : networkState.routes.filter((item) => item.id !== route.id);
  networkState.stations = networkState.stations
    .map((station) => {
      if (!station.connectedRouteIds.includes(route.id)) return station;
      const staysConnected = remaining && distanceToCoordinatesMeters(L.latLng(...station.position), remaining.coordinates) <= 75;
      return { ...station, connectedRouteIds: staysConnected ? station.connectedRouteIds : station.connectedRouteIds.filter((id) => id !== route.id) };
    })
    .filter((station) => station.connectedRouteIds.length > 0);
  if (!remaining) operationsState.fleets = operationsState.fleets.filter((fleet) => fleet.routeId !== route.id);
  networkState.depots = networkState.depots.map((depot) =>
    depot.connectedRouteIds.includes(route.id) && (!remaining || !depotTouchesRoute(depot, remaining))
      ? { ...depot, connectedRouteIds: depot.connectedRouteIds.filter((id) => id !== route.id) }
      : depot,
  );
  operationsState.expressConfigs = operationsState.expressConfigs
    .filter((config) => remaining || config.routeId !== route.id)
    .map((config) => config.routeId === route.id ? { ...config, stopStationIds: config.stopStationIds.filter((id) => networkState.stations.some((station) => station.id === id)) } : config);
  cleanupTransferData();
  const refund = Math.round(removedLength * baseCostPerKm * 0.35);
  financeState.economy = { ...financeState.economy, cash: financeState.economy.cash + refund, constructionSpent: Math.max(0, financeState.economy.constructionSpent - refund) };
  redoStack = [];
  requestStateSave();
  selectRoute(remaining?.id ?? null, false);
  requestUpdate("network-structure", remaining?.id);
  showToast(remaining ? route.name + "의 끝 구간을 철거했습니다 · " + formatCost(refund) + " 환급" : route.name + "을 철거했습니다 · " + formatCost(refund) + " 환급");
  playFeedback("confirm");
}

function splitFleetBetweenRoutes(firstId: string, secondId: string) {
  operationsState.fleets = operationsState.fleets.flatMap((fleet) => {
    if (fleet.routeId !== firstId || fleet.sets < 2) return [fleet];
    const secondSets = Math.floor(fleet.sets / 2);
    return [
      updateFleetSetCount(fleet, fleet.sets - secondSets),
      { ...updateFleetSetCount(fleet, secondSets), id: createId("fleet"), routeId: secondId },
    ];
  });
}

function beginConnectionDrawing(event: PointerEvent, point: L.Point) {
  if (activePointerId !== null) return;
  const source = planningMode
    ? findNearestPlannedRouteEndpoint(point, event.pointerType === "touch" ? 56 : 36)
    : findNearestRouteEndpoint(point, event.pointerType === "touch" ? 56 : 36);
  if (!source) {
    setText(facilityReadout, "연결할 노선 끝점에서 대상까지 드래그하세요");
    return;
  }
  activeConnectionSource = source;
  activePointerId = event.pointerId;
  rawDrawPoints = [source.endpoint];
  captureDrawingPointer(event.pointerId);
  map.dragging.disable();
  mapLayers.clear("construction-preview");
  const route = planningMode
    ? getActivePlan(false)?.routes.find((item) => item.id === source.routeId)
    : networkState.routes.find((item) => item.id === source.routeId);
  if (route) showRouteSettingsTarget(route, planningMode ? "planned" : "actual");
  routePlanningController.beginDrawing({
    sourceEntityId: source.routeId,
    sourceLineId: planningMode ? undefined : source.routeId,
    sourceBlueprintId: planningMode ? source.routeId : undefined,
  });
  previewPolyline = L.polyline(
    [map.containerPointToLatLng(source.endpoint)],
    { ...routeStyle(route?.color ?? selectedColor, 7, 0.72), dashArray: "8 10", interactive: false },
  ).addTo(previewLayer);
  setText(facilityReadout, "연결할 다른 노선 끝점까지 드래그하세요");
}

function finishConnectionDrawing(
  points: L.Point[],
  source: PlannedRouteMergeEndpoint | RouteMergeEndpoint | null,
) {
  if (!source) return;
  const releasePoint = points.at(-1) ?? source.endpoint;
  const target = planningMode
    ? findNearestPlannedRouteEndpoint(releasePoint, 56, source.routeId)
    : findNearestRouteEndpoint(releasePoint, 56, undefined, source.routeId);
  if (!target || target.routeId === source.routeId) {
    routePlanningController.connectionTargetMissed();
    setText(facilityReadout, "다른 노선의 연결 가능한 끝점에 놓으세요");
    return;
  }
  const firstPoint = map.containerPointToLatLng(source.endpoint);
  const secondPoint = map.containerPointToLatLng(target.endpoint);
  const snappedConnectionCoordinates = [
    { lat: firstPoint.lat, lng: firstPoint.lng },
    ...points.slice(1, -1).map((screenPoint) => {
      const coordinate = map.containerPointToLatLng(screenPoint);
      return { lat: coordinate.lat, lng: coordinate.lng };
    }),
    { lat: secondPoint.lat, lng: secondPoint.lng },
  ];
  routePlanningController.reviewConnection({
    targetEntityId: target.routeId,
    targetLineId: planningMode ? undefined : target.routeId,
    draftCoordinates: snappedConnectionCoordinates,
  });
  if (planningMode) {
    const plan = getActivePlan(false);
    const first = plan?.routes.find((route) => route.id === source.routeId);
    const second = plan?.routes.find((route) => route.id === target.routeId);
    if (!plan || !first || !second) return;
    const bridgeLength = calculateLengthKmPrecise(
      smoothCoordinateBridge([firstPoint.lat, firstPoint.lng], [secondPoint.lat, secondPoint.lng])
        .map(([lat, lng]) => L.latLng(lat, lng)),
    );
    const connection = createConnectionBlueprint({
      id: createId("connection-blueprint"),
      source: { id: source.routeId, type: "blueprint-endpoint", lineId: first.rootLineId ?? first.id, endpoint: source.atStart ? "start" : "end" },
      target: { id: target.routeId, type: "blueprint-endpoint", lineId: second.rootLineId ?? second.id, endpoint: target.atStart ? "start" : "end" },
      connectionType: "physical-track",
      coordinates: snappedConnectionCoordinates,
      estimatedCost: Math.round(bridgeLength * baseCostPerKm),
      estimatedDuration: Math.max(1, Math.round(bridgeLength * baseConstructionDaysPerKm)),
      existing: plan.connections ?? [],
    });
    openDecisionDialog(
      `${first.name} ↔ ${second.name} 연결 설계`,
      `물리적 선로 ${bridgeLength.toFixed(2)}km · 예상 ${formatCost(connection.estimatedCost)}. 확정 전에는 실제 네트워크가 변경되지 않습니다.`,
      "연결 설계 확정",
      () => {
        updatePlan(plan.id, (item) => ({ ...item, connections: [...(item.connections ?? []), connection] }));
        requestStateSave();
        renderPlanningDialog();
        requestUpdate("blueprint-preview");
        showToast("물리적 선로 연결 설계를 저장했습니다. 실제 네트워크는 공사 완료 전까지 변경되지 않습니다.");
      },
    );
    return;
  }
  const bridgeLengthKm = calculateLengthKmPrecise(
    smoothCoordinateBridge([firstPoint.lat, firstPoint.lng], [secondPoint.lat, secondPoint.lng])
      .map(([lat, lng]) => L.latLng(lat, lng)),
  );
  const bridgeCost = Math.round(
    bridgeLengthKm * baseCostPerKm * cityConfigs[metaState.current.cityId].constructionMultiplier *
    difficultyConfigs[metaState.current.difficulty].costMultiplier,
  );
  pendingMerge = { first: source, second: target, bridgeLengthKm, bridgeCost };
  openMergeDialog(pendingMerge);
}

function renderMergeGuide() {
  mapLayers.clear("edit-guide");
  if (pendingMerge) {
    const first = networkState.routes.find((route) => route.id === pendingMerge!.first.routeId);
    const second = networkState.routes.find((route) => route.id === pendingMerge!.second.routeId);
    const firstPoint = map.containerPointToLatLng(pendingMerge.first.endpoint);
    const secondPoint = map.containerPointToLatLng(pendingMerge.second.endpoint);
    L.polyline([firstPoint, secondPoint], {
      color: "#ffffff",
      weight: 8,
      opacity: 0.34,
      dashArray: "8 7",
      interactive: false,
    }).addTo(editGuideLayer);
    L.circleMarker(firstPoint, {
      radius: 11, color: "#ffffff", weight: 3, fillColor: first?.color ?? "#4ce0c3", fillOpacity: 1, interactive: false,
    }).addTo(editGuideLayer);
    L.circleMarker(secondPoint, {
      radius: 11, color: "#ffffff", weight: 3, fillColor: second?.color ?? "#f3ca52", fillOpacity: 1, interactive: false,
    }).addTo(editGuideLayer);
    return;
  }
  if (!activeConnectionSource) return;
  const point = map.containerPointToLatLng(activeConnectionSource.endpoint);
  L.circleMarker(point, {
    radius: 12,
    color: "#ffffff",
    weight: 3,
    fillColor: planningMode ? "#d5dee3" : "#f3ca52",
    fillOpacity: 1,
    dashArray: planningMode ? "3 2" : undefined,
    interactive: false,
  }).addTo(editGuideLayer);
}

function findNearestPlannedRouteEndpoint(point: L.Point, thresholdPx: number, excludedRouteId?: string): PlannedRouteMergeEndpoint | null {
  const plan = getActivePlan(false);
  let best: { endpoint: PlannedRouteMergeEndpoint; distance: number } | null = null;
  for (const route of plan?.routes ?? []) {
    if (route.id === excludedRouteId || route.coordinates.length < 2) continue;
    for (const [atStart, coordinate] of [
      [true, route.coordinates[0]],
      [false, route.coordinates[route.coordinates.length - 1]],
    ] as const) {
      const endpoint = map.latLngToContainerPoint(L.latLng(...coordinate));
      const distance = point.distanceTo(endpoint);
      if (distance <= thresholdPx && (!best || distance < best.distance)) best = { endpoint: { routeId: route.id, atStart, endpoint }, distance };
    }
  }
  return best?.endpoint ?? null;
}

function openMergeDialog(merge: PendingMerge) {
  const first = networkState.routes.find((route) => route.id === merge.first.routeId);
  const second = networkState.routes.find((route) => route.id === merge.second.routeId);
  if (!first || !second || !mergeDialog) return;
  connectionDialogMode = "merge";
  const transferStationIds = getMergeTransferStationIds(merge);
  const choiceModel = getConnectionChoices({
    canMerge: true,
    canTransfer: Boolean(transferStationIds),
  });
  selectedConnectionChoice = choiceModel.defaultChoice;
  setText(
    mergeDescription,
    `${first.name}과 ${second.name}의 끝점이 만났습니다. 연결 결과를 선택하세요.`,
  );
  if (mergeConnectionSummary) {
    mergeConnectionSummary.innerHTML = `
      <div class="connection-route-pair">
        ${renderConnectionTargetCard(escapeHtml(first.name), escapeHtml(first.color), merge.first.atStart ? "시점" : "종점", "A")}
        <div class="connection-bridge" aria-hidden="true"><i></i><span>연결</span><i></i></div>
        ${renderConnectionTargetCard(escapeHtml(second.name), escapeHtml(second.color), merge.second.atStart ? "시점" : "종점", "B")}
      </div>
      <dl class="connection-impact-grid">
        <div><dt>연결 거리</dt><dd>${merge.bridgeLengthKm.toFixed(2)}km</dd></div>
        <div><dt>예상 비용</dt><dd>${formatCost(merge.bridgeCost)}</dd></div>
        <div><dt>예상 공기</dt><dd>${formatConstructionDuration(Math.max(1, Math.round(merge.bridgeLengthKm * baseConstructionDaysPerKm)))}</dd></div>
        <div class="${transferStationIds ? "available" : ""}"><dt>환승 연결</dt><dd>${transferStationIds ? "사용 가능" : "대상 역 없음"}</dd></div>
      </dl>`;
  }
  if (mergeChoiceList) {
    mergeChoiceList.innerHTML = `
      <legend>연결 방식</legend>
      ${choiceModel.choices.map((choice) =>
        renderConnectionChoice(choice.id, escapeHtml(choice.title), escapeHtml(choice.description), choice.id === choiceModel.defaultChoice)
      ).join("")}`;
  }
  if (mergeLegacyFields) mergeLegacyFields.hidden = false;
  if (mergeNameSelect) mergeNameSelect.innerHTML = `<option value="${first.id}">${escapeHtml(first.name)}</option><option value="${second.id}">${escapeHtml(second.name)}</option>`;
  if (mergeColorSelect)
    mergeColorSelect.innerHTML = `<option value="${first.id}" style="color:${first.color}">${escapeHtml(first.name)} 색상</option><option value="${second.id}" style="color:${second.color}">${escapeHtml(second.name)} 색상</option>`;
  if (confirmMergeButton) {
    confirmMergeButton.disabled = false;
    confirmMergeButton.textContent = "노선 병합 확정";
  }
  dialogManager.open("connection");
  bindConnectionDialogListeners();
  renderMergeGuide();
}

function closeMergeDialog() {
  pendingMerge = null;
  connectionDialogMode = null;
  dialogManager.close("connection");
  if (confirmMergeButton) confirmMergeButton.disabled = false;
  requestUpdate("selection", selectedRouteId ?? undefined);
}

function bindConnectionDialogListeners() {
  if (closeMergeButton) dialogManager.bind("connection", "close", closeMergeButton, "click", closeMergeDialog);
  if (cancelMergeButton) dialogManager.bind("connection", "cancel", cancelMergeButton, "click", closeMergeDialog);
  if (redesignMergeButton) dialogManager.bind("connection", "redesign", redesignMergeButton, "click", redesignConnection);
  if (confirmMergeButton) dialogManager.bindConfirmation("connection", confirmMergeButton, () => confirmConnectionDialog());
  if (mergeDialog) {
    dialogManager.bindBackdropDismiss("connection", mergeDialog, closeMergeDialog);
  }
  if (mergeChoiceList) {
    dialogManager.bind("connection", "choice", mergeChoiceList, "change", (event) => {
      const input = (event.target as HTMLElement).closest<HTMLInputElement>("input[name='connectionChoice']");
      if (!input) return;
      selectedConnectionChoice = input.value as typeof selectedConnectionChoice;
      if (mergeLegacyFields) mergeLegacyFields.hidden = selectedConnectionChoice !== "merge";
      if (confirmMergeButton) {
        confirmMergeButton.textContent =
          selectedConnectionChoice === "merge"
            ? "노선 병합 확정"
            : selectedConnectionChoice === "transfer"
              ? "환승 연결 확정"
              : "연결 없이 종료";
      }
    });
  }
}

async function confirmConnectionDialog() {
  if (!connectionDialogMode) return;
  await connectionSubmissionGuard.run(async () => {
    if (confirmMergeButton) confirmMergeButton.disabled = true;
    try {
      if (!pendingMerge) return;
      if (selectedConnectionChoice === "cross") {
        closeMergeDialog();
        showToast("노선을 연결하지 않고 별도 노선으로 유지했습니다.");
        return;
      }
      if (selectedConnectionChoice === "transfer") {
        await confirmMergeAsTransfer();
        return;
      }
      await confirmRouteMerge();
    } finally {
      if (confirmMergeButton && mergeDialog && !mergeDialog.hidden) confirmMergeButton.disabled = false;
    }
  });
}

function redesignConnection() {
  closeMergeDialog();
  setTool("merge");
  showToast("연결할 두 노선의 끝점을 다시 선택하세요.");
}

function getMergeTransferStationIds(merge: PendingMerge): [string, string] | null {
  const first = findNearestStation(merge.first.endpoint, 56);
  const second = findNearestStation(merge.second.endpoint, 56);
  return first && second && first.id !== second.id ? [first.id, second.id] : null;
}

async function confirmMergeAsTransfer() {
  const merge = pendingMerge;
  const stationIds = merge ? getMergeTransferStationIds(merge) : null;
  if (!merge || !stationIds) {
    showError("환승으로 연결할 두 역을 찾을 수 없습니다.");
    return;
  }
  const before = cloneState();
  try {
    createTransferGroup(stationIds, false);
    synchronizeGraphReferences();
    metaState.patch({ updatedAt: Date.now() });
    await flushStateSave();
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    closeMergeDialog();
    renderStationManagerIfOpen();
    showToast("두 노선은 유지하고 끝점 역을 환승으로 연결했습니다.");
    playFeedback("confirm");
  } catch (error) {
    stateRecoveryCoordinator.recover(before, {
      scope: "partial",
      domains: ["network", "routes", "demand", "capacity", "congestion", "map-lines", "map-stations", "map-trains", "map-depots", "map-construction", "hud-finance", "hud-status", "active-panel"],
      rebuildRouter: true,
    });
    requestUpdate("network-structure");
    showError("환승 연결 중 문제가 발생해 전체 변경을 되돌렸습니다.");
    console.error(error);
  }
}

async function confirmRouteMerge() {
  const merge = pendingMerge;
  if (!merge) return;
  const first = networkState.routes.find((route) => route.id === merge.first.routeId);
  const second = networkState.routes.find((route) => route.id === merge.second.routeId);
  if (!first || !second) return;
  if (metaState.current.mode === "career" && merge.bridgeCost > financeState.economy.cash) {
    showError(`연결 구간 건설비가 ${formatCost(merge.bridgeCost - financeState.economy.cash)} 부족합니다.`);
    return;
  }
  const before = cloneState();
  try {
    const bridgeCost = merge.bridgeCost;
    const firstCoordinates = merge.first.atStart ? [...first.coordinates].reverse() : first.coordinates;
    const secondCoordinates = merge.second.atStart ? second.coordinates : [...second.coordinates].reverse();
    const bridgeCoordinates = smoothCoordinateBridge(firstCoordinates.at(-1)!, secondCoordinates[0]);
    const mergedCoordinates = [...firstCoordinates, ...bridgeCoordinates.slice(1, -1), ...secondCoordinates];
    const selectedNameRoute = networkState.routes.find((route) => route.id === mergeNameSelect?.value) ?? first;
    const selectedColorRoute = networkState.routes.find((route) => route.id === mergeColorSelect?.value) ?? first;
    const mergeNodes: RouteNode[] = [
      { id: createId("node"), position: firstCoordinates.at(-1)!, kind: "merge" },
      { id: createId("node"), position: secondCoordinates[0], kind: "merge" },
    ];
    const merged = rebuildRouteGraph({
      ...first,
      name: selectedNameRoute.name,
      color: selectedColorRoute.color,
      coordinates: mergedCoordinates,
      lengthKm: Math.round(calculateLengthKmPrecise(mergedCoordinates.map(([lat, lng]) => L.latLng(lat, lng))) * 10) / 10,
      constructionCost: first.constructionCost + second.constructionCost + bridgeCost,
      riverCrossings: first.riverCrossings + second.riverCrossings,
      mountainSegments: first.mountainSegments + second.mountainSegments,
      branches: [...(first.branches ?? []), ...(second.branches ?? [])],
      nodes: [...mergeNodes, ...(first.nodes ?? []), ...(second.nodes ?? [])],
      segments: [...(first.segments ?? []), ...(second.segments ?? [])],
      servicePatterns: upsertEqualBranchPattern(
        [...(first.servicePatterns ?? []), ...(second.servicePatterns ?? [])],
        [...(first.branches ?? []), ...(second.branches ?? [])].map((branch) => branch.id),
        first.id,
      ),
    });
    networkState.routes = networkState.routes.filter((route) => route.id !== second.id).map((route) => (route.id === first.id ? merged : route));
    networkState.stations = mergeDuplicateStations(
      networkState.stations.map((station) => ({
        ...station,
        connectedRouteIds: Array.from(new Set(station.connectedRouteIds.map((id) => (id === second.id ? first.id : id)))),
      })),
    );
    operationsState.fleets = operationsState.fleets.map((fleet) => (fleet.routeId === second.id ? { ...fleet, routeId: first.id } : fleet));
    networkState.depots = networkState.depots.map((depot) => ({
      ...depot,
      connectedRouteIds: Array.from(new Set(depot.connectedRouteIds.map((id) => (id === second.id ? first.id : id)))),
    }));
    operationsState.expressConfigs = mergeExpressConfigs(first.id, second.id);
    financeState.economy = { ...financeState.economy, cash: financeState.economy.cash - bridgeCost, constructionSpent: financeState.economy.constructionSpent + bridgeCost };
    cleanupTransferData();
    synchronizeGraphReferences();
    metaState.patch({ updatedAt: Date.now() });
    await flushStateSave();
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    pendingMerge = null;
    connectionDialogMode = null;
    if (mergeDialog) mergeDialog.hidden = true;
    selectRoute(first.id, false);
    requestUpdate("network-structure", first.id);
    showToast(`${merged.name}으로 연결했습니다 · ${formatCost(bridgeCost)} 반영`);
    playFeedback("confirm");
  } catch (error) {
    stateRecoveryCoordinator.recover(before, {
      scope: "partial",
      domains: ["network", "routes", "demand", "capacity", "congestion", "map-lines", "map-stations", "map-trains", "map-depots", "hud-finance", "hud-status", "active-panel"],
      rebuildRouter: true,
    });
    showError("노선 연결 중 문제가 발생해 전체 변경을 되돌렸습니다.");
    console.error(error);
  }
}

function findNearestRoutePoint(point: L.Point, preferredRouteId?: string) {
  let best: { route: RouteLine; latLng: LatLng; distancePx: number } | null = null;
  const orderedRoutes = preferredRouteId ? [...networkState.routes].sort((a, b) => Number(b.id === preferredRouteId) - Number(a.id === preferredRouteId)) : networkState.routes;
  for (const route of orderedRoutes) {
    for (const latLngs of getRoutePaths(route)) {
      for (let i = 1; i < latLngs.length; i += 1) {
        const start = map.latLngToContainerPoint(latLngs[i - 1]);
        const end = map.latLngToContainerPoint(latLngs[i]);
        const projected = projectPointOnSegment(point, start, end);
        const distancePx = point.distanceTo(projected.point);
        const preferredBias = route.id === preferredRouteId ? -4 : 0;
        if (!best || distancePx + preferredBias < best.distancePx) best = { route, latLng: map.containerPointToLatLng(projected.point), distancePx };
      }
    }
  }
  return best;
}

function findRouteSegmentAtPoint(route: RouteLine, point: L.Point) {
  let best: { segment: RouteSegment; latLng: LatLng; splitRatio: number; distance: number } | null = null;
  for (const segment of route.segments ?? []) {
    const startCoordinate = segment.coordinates[0];
    const endCoordinate = segment.coordinates.at(-1);
    if (!startCoordinate || !endCoordinate) continue;
    const start = map.latLngToContainerPoint(L.latLng(...startCoordinate));
    const end = map.latLngToContainerPoint(L.latLng(...endCoordinate));
    const projection = projectPointOnSegment(point, start, end);
    const distance = point.distanceTo(projection.point);
    if (!best || distance < best.distance) {
      best = {
        segment,
        latLng: map.containerPointToLatLng(projection.point),
        splitRatio: Math.max(0.001, Math.min(0.999, projection.t)),
        distance,
      };
    }
  }
  return best && best.distance <= 36 ? best : null;
}

function findNearestRouteCoordinate(point: L.Point, preferredRouteId: string | undefined, thresholdPx: number) {
  let best: { route: RouteLine; coordinateIndex: number; point: L.Point; distance: number } | null = null;
  const candidates = preferredRouteId ? networkState.routes.filter((route) => route.id === preferredRouteId) : networkState.routes;
  for (const route of candidates) {
    for (let index = 0; index < route.coordinates.length; index += 1) {
      const coordinate = route.coordinates[index];
      const screenPoint = map.latLngToContainerPoint(L.latLng(coordinate[0], coordinate[1]));
      const distance = point.distanceTo(screenPoint);
      if (distance <= thresholdPx && (!best || distance < best.distance)) best = { route, coordinateIndex: index, point: screenPoint, distance };
    }
  }
  if (best || !preferredRouteId) {
    if (best) return best;
    const lineSnap = findNearestRoutePoint(point, preferredRouteId);
    if (lineSnap && lineSnap.distancePx <= thresholdPx) {
      const coordinateIndex = lineSnap.route.coordinates
        .map((coordinate, index) => ({ index, distance: map.latLngToContainerPoint(L.latLng(...coordinate)).distanceTo(point) }))
        .sort((a, b) => a.distance - b.distance)[0]?.index;
      if (coordinateIndex !== undefined) {
        const coordinate = lineSnap.route.coordinates[coordinateIndex];
        return { route: lineSnap.route, coordinateIndex, point: map.latLngToContainerPoint(L.latLng(...coordinate)), distance: lineSnap.distancePx };
      }
    }
    return null;
  }
  return findNearestRouteCoordinate(point, undefined, thresholdPx);
}

/**
 * 좌표 기반 노선을 노드/세그먼트 그래프로 다시 정규화한다.
 * 편집·분기·병합 후 생길 수 있는 중복 노드를 정리하고 기존 세그먼트의 공사 속성은
 * 가능한 한 보존한다. 이후 역·분기·운행 패턴은 이 그래프 ID를 참조한다.
 */
function rebuildRouteGraph(route: RouteLine): RouteLine {
  if (route.coordinates.length < 2) return route;
  const branchSegmentIds = new Set((route.branches ?? []).flatMap((branch) => branch.segmentIds));
  const branchSegments = (route.segments ?? []).filter((segment) => branchSegmentIds.has(segment.id));
  const branchNodeIds = new Set([...(route.branches ?? []).flatMap((branch) => [branch.junctionNodeId, branch.terminalNodeId]), ...branchSegments.flatMap((segment) => [segment.fromNodeId, segment.toNodeId])]);
  const trunkNodes = route.coordinates.map((coordinate, index) => {
    const matchingNodes = (route.nodes ?? []).filter((node) => coordinatesEqual(node.position, coordinate));
    const existing = matchingNodes.find((node) => node.kind === "merge") ?? matchingNodes.find((node) => branchNodeIds.has(node.id)) ?? matchingNodes[0];
    return {
      id: existing?.id ?? stableEntityId("node", `${route.id}:${index}:${coordinate.join(",")}`),
      position: coordinate,
      kind: existing?.kind ?? ((index === 0 || index === route.coordinates.length - 1 ? "endpoint" : "control") as RouteNodeKind),
    };
  });
  const trunkNodeIds = new Set(trunkNodes.map((node) => node.id));
  const branchNodes = (route.nodes ?? []).filter((node) => branchNodeIds.has(node.id) && !trunkNodeIds.has(node.id));
  const existingTrunkSegments = (route.segments ?? []).filter((segment) => !branchSegmentIds.has(segment.id));
  const branchCost = branchSegments.reduce((sum, segment) => sum + segment.constructionCost, 0);
  const branchRiver = branchSegments.reduce((sum, segment) => sum + segment.terrainImpact.riverCrossings, 0);
  const branchMountain = branchSegments.reduce((sum, segment) => sum + segment.terrainImpact.mountainSegments, 0);
  const trunkCost = Math.max(0, route.constructionCost - branchCost);
  const trunkRiver = Math.max(0, route.riverCrossings - branchRiver);
  const trunkMountain = Math.max(0, route.mountainSegments - branchMountain);
  const rawSegmentLengths = route.coordinates.slice(1).map((coordinate, index) =>
    calculateLengthKmPrecise([
      L.latLng(route.coordinates[index][0], route.coordinates[index][1]),
      L.latLng(coordinate[0], coordinate[1]),
    ]),
  );
  const trunkLength = rawSegmentLengths.reduce((sum, length, index) => sum + ((route.disabledSegments ?? []).includes(index) ? 0 : length), 0) || 1;
  const trunkSegments = rawSegmentLengths.map((lengthKm, index): RouteSegment => {
    const fromNode = trunkNodes[index];
    const toNode = trunkNodes[index + 1];
    const existing = existingTrunkSegments.find(
      (segment) =>
        coordinatesEqual(segment.coordinates[0], fromNode.position) &&
        coordinatesEqual(segment.coordinates[segment.coordinates.length - 1], toNode.position),
    );
    const enabled = !(route.disabledSegments ?? []).includes(index);
    const ratio = enabled ? lengthKm / trunkLength : 0;
    return {
      id: existing?.id ?? stableEntityId("segment", `${route.id}:${fromNode.id}:${toNode.id}`),
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      coordinates: [fromNode.position, toNode.position],
      lengthKm: Math.round(lengthKm * 1000) / 1000,
      terrainImpact: {
        riverCrossings: enabled && index < trunkRiver ? 1 : 0,
        mountainSegments: enabled && index < trunkMountain ? 1 : 0,
      },
      constructionMode: existing?.constructionMode ?? route.riverMode,
      constructionCost: Math.round(trunkCost * ratio),
      enabled,
    };
  });
  const branchIds = (route.branches ?? []).map((branch) => branch.id);
  const patterns = upsertEqualBranchPattern(route.servicePatterns ?? [], branchIds, route.id);
  return {
    ...route,
    nodes: dedupeById([...trunkNodes, ...branchNodes]),
    segments: dedupeById([...trunkSegments, ...branchSegments]),
    branches: route.branches ?? [],
    servicePatterns: patterns,
    visibility: route.visibility ?? "public",
    localServiceEnabled: route.localServiceEnabled ?? true,
    expressServiceEnabled: route.expressServiceEnabled ?? false,
    operationPaused: route.operationPaused ?? false,
  };
}

function upsertEqualBranchPattern(patterns: ServicePattern[], branchIds: string[], scopeId = branchIds.join(":") || "route") {
  const local = patterns.find((pattern) => pattern.kind === "local");
  const express = patterns.find((pattern) => pattern.kind === "express");
  return [
    {
      id: local?.id ?? stableEntityId("pattern", `${scopeId}:local`),
      name: local?.name ?? "일반 균등 운행",
      kind: "local" as const,
      branchIds,
      enabled: local?.enabled ?? true,
      dispatchMode: "equal" as const,
    },
    {
      id: express?.id ?? stableEntityId("pattern", `${scopeId}:express`),
      name: express?.name ?? "급행 균등 운행",
      kind: "express" as const,
      branchIds,
      enabled: express?.enabled ?? false,
      dispatchMode: "equal" as const,
    },
  ];
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function coordinatesEqual(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) < 0.000001 && Math.abs(a[1] - b[1]) < 0.000001;
}

function calculateLengthKmPrecise(points: LatLng[]) {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) meters += map.distance(points[index - 1], points[index]);
  return meters / 1000;
}

function distanceToCoordinatesMeters(point: LatLng, coordinates: Array<[number, number]>) {
  if (coordinates.length < 2) return Number.POSITIVE_INFINITY;
  const screenPoint = map.latLngToContainerPoint(point);
  let bestPx = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = map.latLngToContainerPoint(L.latLng(coordinates[index - 1][0], coordinates[index - 1][1]));
    const end = map.latLngToContainerPoint(L.latLng(coordinates[index][0], coordinates[index][1]));
    bestPx = Math.min(bestPx, pointLineDistance(screenPoint, start, end));
  }
  return bestPx * metersPerPixel();
}

function findNearestCoordinateIndex(coordinates: Array<[number, number]>, point: LatLng) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((coordinate, index) => {
    const distance = map.distance(point, L.latLng(coordinate[0], coordinate[1]));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function findRouteInsertionIndex(coordinates: Array<[number, number]>, point: LatLng) {
  const screenPoint = map.latLngToContainerPoint(point);
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = map.latLngToContainerPoint(L.latLng(coordinates[index - 1][0], coordinates[index - 1][1]));
    const end = map.latLngToContainerPoint(L.latLng(coordinates[index][0], coordinates[index][1]));
    const distance = pointLineDistance(screenPoint, start, end);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function findNearestGraphNodeId(route: RouteLine | undefined, point: LatLng) {
  if (!route?.nodes?.length) return undefined;
  return route.nodes.reduce(
    (best, node) => {
      const distance = map.distance(point, L.latLng(node.position[0], node.position[1]));
      return distance < best.distance ? { id: node.id, distance } : best;
    },
    { id: route.nodes[0].id, distance: Number.POSITIVE_INFINITY },
  ).id;
}

function depotTouchesRoute(depot: Depot, route: RouteLine) {
  const polygon = depot.polygon.map(([lat, lng]) => map.latLngToContainerPoint(L.latLng(lat, lng)));
  return routeTouchesDepotArea(route, polygon, 30 / metersPerPixel());
}

function cleanupTransferData() {
  const normalized = normalizeTransferLinks([...networkState.stations], [...networkState.transfers]);
  networkState.replace({
    routes: networkState.routes,
    stations: normalized.stations,
    transfers: normalized.transfers,
    depots: networkState.depots,
  });
}

/**
 * 노선 그래프를 재생성한 뒤 역과 분기 등이 가리키는 node/segment ID를 동기화한다.
 * 편집 후 존재하지 않는 ID가 저장 데이터에 남는 것을 막는 참조 무결성 정리 단계다.
 */
function synchronizeGraphReferences() {
  const synchronized = synchronizeNetworkReferences({
    routeIds: networkState.routes.map((route) => route.id),
    stations: [...networkState.stations],
    transfers: [...networkState.transfers],
    depots: [...networkState.depots],
    fleets: [...operationsState.fleets],
    expressConfigs: [...operationsState.expressConfigs],
    passengerGroups: [...demandState.passengerGroups],
    projects: [...constructionState.projects],
  });
  operationsState.fleets = synchronized.fleets;
  operationsState.expressConfigs = synchronized.expressConfigs;
  demandState.passengerGroups = synchronized.passengerGroups;
  constructionState.replaceProjects(synchronized.projects);
  const synchronizedStations = synchronized.stations.map((station) => {
    const connectedRouteIds = station.connectedRouteIds;
    const point = L.latLng(station.position[0], station.position[1]);
    return {
      ...station,
      connectedRouteIds,
      routeNodeIds: connectedRouteIds.map((routeId) => findNearestGraphNodeId(networkState.routes.find((route) => route.id === routeId), point)).filter((id): id is string => Boolean(id)),
    };
  });
  networkState.replace({
    routes: networkState.routes,
    stations: synchronizedStations,
    transfers: synchronized.transfers,
    depots: synchronized.depots,
  });
  const validRouteIds = new Set(networkState.routes.map((route) => route.id));
  const validStationIds = new Set(networkState.stations.map((station) => station.id));
  operationsState.services = operationsState.services
    .filter((service) => validRouteIds.has(service.ownerRouteId) && service.routeIds.length > 0 && service.routeIds.every((id) => validRouteIds.has(id)))
    .map((service) => normalizeOperatingService({
      ...service,
      stationIds: service.stationIds.filter((id) => validStationIds.has(id)),
      stopStationIds: service.stopStationIds.filter((id) => validStationIds.has(id)),
    }, validRouteIds))
    .filter((service) => service.stationIds.length >= 2 && service.pathCoordinates.length >= 2);
  const validServiceIds = new Set(operationsState.services.map((service) => service.id));
  operationsState.fleets = operationsState.fleets.filter((fleet) => !fleet.serviceId || validServiceIds.has(fleet.serviceId));
  reportIntegrityIssues();
}

function reportIntegrityIssues() {
  const issues = validateNetworkIntegrity({
    routeIds: networkState.routes.map((route) => route.id),
    stations: [...networkState.stations],
    transfers: [...networkState.transfers],
    depots: [...networkState.depots],
    fleets: [...operationsState.fleets],
    expressConfigs: [...operationsState.expressConfigs],
    passengerGroups: [...demandState.passengerGroups],
    projects: [...constructionState.projects],
    blueprintIds: constructionState.plans.flatMap((plan) => [
      plan.id,
      ...plan.routes.flatMap((route) => [route.id, ...route.segments.map((segment) => segment.id)]),
      ...plan.stations.map((station) => station.id),
      ...plan.depots.map((depot) => depot.id),
      ...(plan.connections ?? []).map((connection) => connection.id),
      ...(plan.junctions ?? []).map((junction) => junction.id),
    ]),
    numericState: { economy: financeState.economy, stationDemandStates: demandState.stationDemandStates, analysisState: analysisStateOwner.current, statisticsState: financeState.statistics },
  });
  if (issues.length > 0 && import.meta.env.DEV) {
    console.warn(`[integrity] ${issues.length} recoverable issue(s) detected`, issues);
  }
}

function mergeDuplicateStations(source: Station[]) {
  const result: Station[] = [];
  const replacementIds = new Map<string, string>();
  for (const station of source) {
    const duplicate = result.find((item) => map.distance(L.latLng(item.position[0], item.position[1]), L.latLng(station.position[0], station.position[1])) <= 18);
    if (!duplicate) {
      result.push(station);
      continue;
    }
    replacementIds.set(station.id, duplicate.id);
    duplicate.connectedRouteIds = Array.from(new Set([...duplicate.connectedRouteIds, ...station.connectedRouteIds]));
    duplicate.demand = Math.max(duplicate.demand, station.demand);
  }
  if (replacementIds.size > 0) {
    networkState.transfers = networkState.transfers.map((transfer) => ({
      ...transfer,
      stationIds: Array.from(new Set(transfer.stationIds.map((id) => replacementIds.get(id) ?? id))),
    }));
    operationsState.expressConfigs = operationsState.expressConfigs.map((config) => ({
      ...config,
      stopStationIds: Array.from(new Set(config.stopStationIds.map((id) => replacementIds.get(id) ?? id))),
    }));
  }
  return result;
}

function mergeExpressConfigs(firstId: string, secondId: string) {
  const first = operationsState.expressConfigs.find((config) => config.routeId === firstId) ?? getExpressConfig(firstId);
  const second = operationsState.expressConfigs.find((config) => config.routeId === secondId) ?? getExpressConfig(secondId);
  return [
    ...operationsState.expressConfigs.filter((config) => config.routeId !== firstId && config.routeId !== secondId),
    {
      ...first,
      routeId: firstId,
      unlocked: first.unlocked || second.unlocked,
      enabled: first.enabled || second.enabled,
      stopStationIds: Array.from(new Set([...first.stopStationIds, ...second.stopStationIds])),
    },
  ];
}

function smoothCoordinateBridge(a: [number, number], b: [number, number]) {
  const deltaLat = b[0] - a[0];
  const deltaLng = b[1] - a[1];
  const bendLat = -deltaLng * 0.09;
  const bendLng = deltaLat * 0.09;
  return [
    a,
    [roundCoord(a[0] + deltaLat * 0.33 + bendLat), roundCoord(a[1] + deltaLng * 0.33 + bendLng)] as [number, number],
    [roundCoord(a[0] + deltaLat * 0.67 + bendLat), roundCoord(a[1] + deltaLng * 0.67 + bendLng)] as [number, number],
    b,
  ];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function findNearestRepairEndpoint(point: L.Point, thresholdPx: number): RouteRepair | null {
  let best: RouteRepair & { distancePx: number } | null = null;
  for (const route of networkState.routes) {
    for (const gapIndex of route.disabledSegments ?? []) {
      const before = map.latLngToContainerPoint(L.latLng(route.coordinates[gapIndex][0], route.coordinates[gapIndex][1]));
      const after = map.latLngToContainerPoint(L.latLng(route.coordinates[gapIndex + 1][0], route.coordinates[gapIndex + 1][1]));
      for (const candidate of [
        { start: before, end: after },
        { start: after, end: before },
      ]) {
        const distancePx = point.distanceTo(candidate.start);
        if (distancePx <= thresholdPx && (!best || distancePx < best.distancePx)) best = { routeId: route.id, gapIndex, ...candidate, distancePx };
      }
    }
  }
  return best ? { routeId: best.routeId, gapIndex: best.gapIndex, start: best.start, end: best.end } : null;
}

function renderRepairGuide() {
  mapLayers.clear("repair-guide");
  if (activeTool !== "reconnect") return;
  for (const route of networkState.routes) {
    for (const gapIndex of route.disabledSegments ?? []) {
      const start = L.latLng(route.coordinates[gapIndex][0], route.coordinates[gapIndex][1]);
      const end = L.latLng(route.coordinates[gapIndex + 1][0], route.coordinates[gapIndex + 1][1]);
      L.polyline([start, end], { color: "#ff5d5d", weight: 2, opacity: 0.9, dashArray: "4 5", interactive: false }).addTo(repairGuideLayer);
      for (const endpoint of [start, end]) {
        L.circleMarker(endpoint, { radius: 9, color: "#ffffff", weight: 2, fillColor: "#ff5d5d", fillOpacity: 1, interactive: false }).addTo(repairGuideLayer);
      }
    }
  }
}

function findRoutesNearLatLng(point: LatLng, thresholdM: number) {
  return networkState.routes.filter((route) => distanceToRouteMeters(point, route) <= thresholdM).map((route) => route.id);
}

function findNearestRouteEndpoint(point: L.Point, thresholdPx: number, preferredRouteId?: string | null, excludedRouteId?: string): RouteExtension | null {
  let best: RouteExtension & { distancePx: number } | null = null;
  const orderedRoutes = preferredRouteId ? [...networkState.routes].sort((a, b) => Number(b.id === preferredRouteId) - Number(a.id === preferredRouteId)) : networkState.routes;
  for (const route of orderedRoutes) {
    if (route.id === excludedRouteId) continue;
    if (route.coordinates.length < 2) continue;
    const endpointCandidates = [
      { atStart: true, coordinate: route.coordinates[0] },
      { atStart: false, coordinate: route.coordinates[route.coordinates.length - 1] },
    ];
    for (const candidate of endpointCandidates) {
      const endpoint = map.latLngToContainerPoint(L.latLng(candidate.coordinate[0], candidate.coordinate[1]));
      const distancePx = point.distanceTo(endpoint);
      const adjustedDistance = distancePx + (route.id === preferredRouteId ? -5 : 0);
      if (distancePx > thresholdPx || (best && adjustedDistance >= best.distancePx)) continue;
      best = { routeId: route.id, atStart: candidate.atStart, endpoint, distancePx: adjustedDistance };
    }
  }
  return best ? { routeId: best.routeId, atStart: best.atStart, endpoint: best.endpoint } : null;
}

function findRoutesNearPolygon(points: LatLng[], thresholdM: number) {
  const polygonPoints = points.map((point) => map.latLngToContainerPoint(point));
  const thresholdPx = thresholdM / metersPerPixel();
  return networkState.routes
    .filter((route) => routeTouchesDepotArea(route, polygonPoints, thresholdPx))
    .map((route) => route.id);
}

function routeTouchesDepotArea(route: RouteLine, polygon: L.Point[], thresholdPx: number) {
  const routePoints = route.coordinates.map(([lat, lng]) => map.latLngToContainerPoint(L.latLng(lat, lng)));
  for (let routeIndex = 1; routeIndex < routePoints.length; routeIndex += 1) {
    const start = routePoints[routeIndex - 1];
    const end = routePoints[routeIndex];
    if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) return true;
    for (let polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
      const sideStart = polygon[polygonIndex];
      const sideEnd = polygon[(polygonIndex + 1) % polygon.length];
      if (segmentsIntersect(start, end, sideStart, sideEnd)) return true;
      if (pointLineDistance(start, sideStart, sideEnd) <= thresholdPx || pointLineDistance(end, sideStart, sideEnd) <= thresholdPx) return true;
      if (pointLineDistance(sideStart, start, end) <= thresholdPx || pointLineDistance(sideEnd, start, end) <= thresholdPx) return true;
    }
  }
  return false;
}

function pointInPolygon(point: L.Point, polygon: L.Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const intersects = current.y > point.y !== prior.y > point.y && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: L.Point, b: L.Point, c: L.Point, d: L.Point) {
  const orientation = (first: L.Point, second: L.Point, third: L.Point) => (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return (abC === 0 && pointLineDistance(c, a, b) < 0.01) || (abD === 0 && pointLineDistance(d, a, b) < 0.01) || (cdA === 0 && pointLineDistance(a, c, d) < 0.01) || (cdB === 0 && pointLineDistance(b, c, d) < 0.01) || (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function metersPerPixel() {
  return map.distance(map.containerPointToLatLng([0, 0]), map.containerPointToLatLng([1, 0]));
}

function renderDepotConnectionGuide() {
  mapLayers.clear("depot-guide");
  if (activeTool !== "depot") return;
  if (networkState.routes.length === 0) {
    setText(facilityReadout, "노선 없이도 차량기지를 단독 건설할 수 있습니다");
    return;
  }
  for (const route of networkState.routes) {
    L.polyline(route.coordinates.map(([lat, lng]) => L.latLng(lat, lng)), {
      color: "#4ce0c3",
      weight: 18,
      opacity: 0.22,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(depotGuideLayer);
  }
}

function updateDepotPreviewConnection(points: L.Point[]) {
  if (!previewPolygon) return;
  const polygon = closeLatLngRing(points.map((point) => map.containerPointToLatLng(point)));
  const connected = findRoutesNearPolygon(polygon, 30).length > 0;
  previewPolygon.setStyle({ color: connected ? "#4ce0c3" : "#25d0d6", fillColor: connected ? "#4ce0c3" : "#25d0d6" });
  setText(facilityReadout, connected ? "노선 연결 가능" : "단독 차량기지로 건설 가능");
}

function findNearestStation(point: L.Point, thresholdPx: number) {
  let best: { station: Station; distancePx: number } | null = null;
  for (const station of networkState.stations) {
    const stationPoint = map.latLngToContainerPoint(L.latLng(station.position[0], station.position[1]));
    const distancePx = stationPoint.distanceTo(point);
    if (distancePx <= thresholdPx && (!best || distancePx < best.distancePx)) best = { station, distancePx };
  }
  return best?.station ?? null;
}

function distanceToRouteMeters(point: LatLng, route: RouteLine) {
  const screenPoint = map.latLngToContainerPoint(point);
  let bestPx = Number.POSITIVE_INFINITY;
  for (const path of getRoutePaths(route)) {
    for (let i = 1; i < path.length; i += 1) {
      const start = map.latLngToContainerPoint(path[i - 1]);
      const end = map.latLngToContainerPoint(path[i]);
      bestPx = Math.min(bestPx, pointLineDistance(screenPoint, start, end));
    }
  }
  const meterPerPx = map.distance(map.containerPointToLatLng([0, 0]), map.containerPointToLatLng([1, 0]));
  return bestPx * meterPerPx;
}

function estimateStationDemand(position: LatLng, routeCountAtStation: number) {
  const center = L.latLng(cityConfigs[metaState.current.cityId].center);
  const centrality = Math.max(0.35, 1.5 - map.distance(position, center) / 18000);
  const city = cityConfigs[metaState.current.cityId];
  const difficulty = difficultyConfigs[metaState.current.difficulty];
  return Math.round((5200 + routeCountAtStation * 2100) * centrality * city.demandMultiplier * difficulty.demandMultiplier);
}

function calculateTransferDistance(selectedStations: Station[]) {
  let distance = 0;
  for (let i = 1; i < selectedStations.length; i += 1) {
    const a = L.latLng(selectedStations[i - 1].position[0], selectedStations[i - 1].position[1]);
    const b = L.latLng(selectedStations[i].position[0], selectedStations[i].position[1]);
    distance += map.distance(a, b);
  }
  return Math.round(distance);
}

/**
 * 사용자가 그린 공사안을 구간별로 분석해 비용·기간·지형 영향·경고를 만든다.
 * 하천 교차는 사용자가 교량/터널을 선택해야 최종 비용이 정해지며, previousChoices로
 * 다시 그리는 동안 이미 선택한 방식을 유지한다.
 */
function analyzeConstruction(
  kind: ConstructionDraftKind,
  points: LatLng[],
  routeId?: string,
  previousChoices: RiverCrossingChoice[] = [],
): ConstructionAnalysis {
  const city = cityConfigs[metaState.current.cityId];
  const difficulty = difficultyConfigs[metaState.current.difficulty];
  const screenPoints = points.map((point) => map.latLngToContainerPoint(point));
  const crossings = detectRiverCrossings(screenPoints, previousChoices);
  const crossingIdsBySegment = new Map<number, string[]>();
  crossings.forEach((crossing) => {
    crossingIdsBySegment.set(crossing.segmentIndex, [...(crossingIdsBySegment.get(crossing.segmentIndex) ?? []), crossing.id]);
  });
  const mountainObstacles = knownObstacles.filter((obstacle) => obstacle.kind === "mountain");
  const segments: ConstructionSegmentImpact[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const lengthKm = map.distance(points[index], points[index + 1]) / 1000;
    const mountainHit = mountainObstacles.some((obstacle) =>
      obstacle.points.some((obstaclePoint) => pointLineDistance(obstaclePoint, screenPoints[index], screenPoints[index + 1]) <= 24),
    );
    const mountainLengthKm = mountainHit ? lengthKm : 0;
    segments.push({
      index,
      coordinates: [
        [roundCoord(points[index].lat), roundCoord(points[index].lng)],
        [roundCoord(points[index + 1].lat), roundCoord(points[index + 1].lng)],
      ],
      lengthKm: Math.round(lengthKm * 1000) / 1000,
      mountainLengthKm: Math.round(mountainLengthKm * 1000) / 1000,
      riverCrossingIds: crossingIdsBySegment.get(index) ?? [],
      baseCost: Math.round(lengthKm * baseCostPerKm * city.constructionMultiplier * difficulty.costMultiplier),
      mountainCost: Math.round(mountainLengthKm * mountainCostPerKm * city.mountainMultiplier * difficulty.costMultiplier),
    });
  }
  const lengthKm = segments.reduce((sum, segment) => sum + segment.lengthKm, 0);
  const baseCost = segments.reduce((sum, segment) => sum + segment.baseCost, 0);
  const mountainLengthKm = segments.reduce((sum, segment) => sum + segment.mountainLengthKm, 0);
  const mountainCost = segments.reduce((sum, segment) => sum + segment.mountainCost, 0);
  const riverCost = crossings.reduce((sum, crossing) => sum + (crossing.mode ? getRiverCrossingCost(crossing.mode) : 0), 0);
  const totalCost = baseCost + mountainCost + riverCost;
  const stationInstallCount = countStationsNearDraft(points, routeId);
  const depotConnected = isDraftDepotConnected(points, routeId);
  const durationDays = Math.max(
    kind === "depot" ? 0 : 7,
    Math.round(
      lengthKm * baseConstructionDaysPerKm +
        mountainLengthKm * 80 +
        crossings.reduce((sum, crossing) => sum + (crossing.mode === "bridge" ? bridgeConstructionDays : crossing.mode === "tunnel" ? tunnelConstructionDays : 0), 0),
    ),
  );
  const warnings = collectConstructionWarnings({
    kind,
    points,
    routeId,
    lengthKm,
    totalCost,
    crossings,
    depotConnected,
    stationInstallCount,
  });
  return {
    segments,
    lengthKm,
    baseCost,
    mountainLengthKm,
    mountainCost,
    riverCrossings: crossings,
    riverCost,
    stationInstallCount,
    depotConnected,
    totalCost,
    balanceAfter: financeState.economy.cash - totalCost,
    durationDays,
    warnings,
  };
}

function detectRiverCrossings(routePoints: L.Point[], previousChoices: RiverCrossingChoice[]) {
  const riverObstacles = knownObstacles.filter((obstacle) => obstacle.kind === "river");
  const crossings: RiverCrossingChoice[] = [];
  riverObstacles.forEach((obstacle, obstacleIndex) => {
    let best: { segmentIndex: number; distance: number; position: L.Point } | null = null;
    for (let segmentIndex = 0; segmentIndex < routePoints.length - 1; segmentIndex += 1) {
      for (const obstaclePoint of obstacle.points) {
        const projected = projectPointOnSegment(obstaclePoint, routePoints[segmentIndex], routePoints[segmentIndex + 1]).point;
        const distance = obstaclePoint.distanceTo(projected);
        if (distance <= 18 && (!best || distance < best.distance)) best = { segmentIndex, distance, position: projected };
      }
    }
    if (!best) return;
    const latLng = map.containerPointToLatLng(best.position);
    const id = `river-${obstacleIndex}-${best.segmentIndex}`;
    const previous = previousChoices.find((choice) => choice.id === id);
    crossings.push({
      id,
      segmentIndex: best.segmentIndex,
      position: [roundCoord(latLng.lat), roundCoord(latLng.lng)],
      mode: previous?.mode ?? null,
    });
  });
  return crossings.slice(0, 12);
}

function getRiverCrossingCost(mode: ConstructionMode) {
  const city = cityConfigs[metaState.current.cityId];
  const difficulty = difficultyConfigs[metaState.current.difficulty];
  return Math.round(
    (mode === "bridge" ? bridgeCostPerCrossing : tunnelCostPerCrossing) *
      city.riverMultiplier *
      city.constructionMultiplier *
      difficulty.costMultiplier,
  );
}

function collectConstructionWarnings(input: {
  kind: ConstructionDraftKind;
  points: LatLng[];
  routeId?: string;
  lengthKm: number;
  totalCost: number;
  crossings: RiverCrossingChoice[];
  depotConnected: boolean;
  stationInstallCount: number;
}) {
  const warnings: ConstructionWarning[] = [];
  if (input.kind !== "depot" && input.lengthKm * 1000 < 50)
    warnings.push({ code: "too-short", severity: "error", message: `구간 길이가 ${Math.round(input.lengthKm * 1000)}m입니다. 50m 이상이어야 합니다.` });
  else if (input.kind !== "depot" && input.lengthKm * 1000 < 180)
    warnings.push({ code: "short-section", severity: "warning", message: "매우 짧은 구간입니다. 향후 선형 수정이 어려울 수 있습니다." });
  if (metaState.current.mode === "career" && input.totalCost > financeState.economy.cash)
    warnings.push({ code: "insufficient-funds", severity: "error", message: `자금이 ${formatCost(input.totalCost - financeState.economy.cash)} 부족합니다.` });
  if (input.crossings.some((crossing) => !crossing.mode))
    warnings.push({ code: "river-choice", severity: "error", message: "각 강 통과 지점의 교량 또는 지하 방식을 선택하세요." });
  if (!input.depotConnected && input.kind !== "repair" && input.kind !== "edit")
    warnings.push({ code: "depot-unconnected", severity: "warning", message: "차량기지와 연결되지 않았습니다. 열차 투입 전 기지를 연결하세요." });
  if (hasAbnormalSelfIntersection(input.points))
    warnings.push({ code: "self-intersection", severity: "warning", message: "노선이 비정상적으로 자기 교차합니다. 경로를 확인하세요." });
  if (input.points.some((point) => map.distance(point, L.latLng(cityConfigs[metaState.current.cityId].center)) > 65000))
    warnings.push({ code: "unsupported-area", severity: "error", message: "현재 도시의 지원 지도 영역 밖으로 나간 구간이 있습니다." });
  if (hasShortStationSpacing(input.points, input.routeId))
    warnings.push({ code: "station-spacing", severity: "warning", message: "일부 역 간격이 250m 미만입니다. 운행 효율이 낮아질 수 있습니다." });
  if ((input.kind === "edit" || input.kind === "repair") && countOrphanedStations(input.points, input.routeId) > 0)
    warnings.push({
      code: "orphaned-station",
      severity: "warning",
      message: `수정 후 ${countOrphanedStations(input.points, input.routeId)}개 역이 노선에서 고립될 수 있습니다.`,
    });
  const capacityShortage = calculateDepotCapacityShortage(input.routeId);
  if (capacityShortage > 0)
    warnings.push({ code: "depot-capacity", severity: "warning", message: `차량기지 수용량이 ${capacityShortage}편성 부족합니다.` });
  if (input.stationInstallCount === 0 && input.kind === "route")
    warnings.push({ code: "no-stations", severity: "info", message: "현재 계획에 연결되는 역이 없습니다. 완공 후 역을 설치할 수 있습니다." });
  return warnings;
}

function countStationsNearDraft(points: LatLng[], routeId?: string) {
  return networkState.stations.filter((station) => {
    if (routeId && station.connectedRouteIds.includes(routeId)) return true;
    return distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), points.map((point) => [point.lat, point.lng])) <= 55;
  }).length;
}

function isDraftDepotConnected(points: LatLng[], routeId?: string) {
  if (routeId && networkState.depots.some((depot) => depot.connectedRouteIds.includes(routeId))) return true;
  const draftRoute = {
    id: "draft",
    name: "draft",
    color: "#fff",
    coordinates: points.map((point) => [point.lat, point.lng] as [number, number]),
    lengthKm: 0,
    constructionCost: 0,
    riverCrossings: 0,
    mountainSegments: 0,
    riverMode: "bridge" as const,
  };
  return networkState.depots.some((depot) => {
    const polygon = depot.polygon.map(([lat, lng]) => map.latLngToContainerPoint(L.latLng(lat, lng)));
    return routeTouchesDepotArea(draftRoute, polygon, 30 / metersPerPixel());
  });
}

function hasShortStationSpacing(points: LatLng[], routeId?: string) {
  const relevant = networkState.stations.filter((station) => {
    if (routeId && station.connectedRouteIds.includes(routeId)) return true;
    return distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), points.map((point) => [point.lat, point.lng])) <= 55;
  });
  for (let first = 0; first < relevant.length; first += 1) {
    for (let second = first + 1; second < relevant.length; second += 1) {
      if (
        map.distance(
          L.latLng(relevant[first].position[0], relevant[first].position[1]),
          L.latLng(relevant[second].position[0], relevant[second].position[1]),
        ) < 250
      )
        return true;
    }
  }
  return false;
}

function countOrphanedStations(points: LatLng[], routeId?: string) {
  if (!routeId) return 0;
  const coordinates = points.map((point) => [point.lat, point.lng] as [number, number]);
  return networkState.stations.filter(
    (station) =>
      station.connectedRouteIds.length === 1 &&
      station.connectedRouteIds[0] === routeId &&
      distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), coordinates) > 75,
  ).length;
}

function calculateDepotCapacityShortage(routeId?: string) {
  if (!routeId) return 0;
  const fleetSets = getFleetsServingRoute(routeId).reduce((sum, fleet) => sum + fleet.sets, 0);
  const capacity = networkState.depots.filter((depot) => depot.connectedRouteIds.includes(routeId)).reduce((sum, depot) => sum + depot.capacity, 0);
  return Math.max(0, fleetSets - capacity);
}

function hasAbnormalSelfIntersection(points: LatLng[]) {
  const screen = points.map((point) => map.latLngToContainerPoint(point));
  for (let first = 0; first < screen.length - 1; first += 1) {
    for (let second = first + 2; second < screen.length - 1; second += 1) {
      if (first === 0 && second === screen.length - 2) continue;
      if (segmentsIntersect(screen[first], screen[first + 1], screen[second], screen[second + 1])) return true;
    }
  }
  return false;
}

function renderConstructionDraftMap() {
  if (!constructionDraft) {
    constructionRenderer.reconcileDrafts([]);
    return;
  }
  const hasError = constructionDraft.analysis.warnings.some((warning) => warning.severity === "error");
  const entity: ConstructionDraftRenderEntity = {
    id: `draft:${constructionDraft.id}`,
    lines: [],
    markers: [],
    valid: !hasError,
  };
  if (constructionDraft.kind === "depot" && constructionDraft.polygon) {
    entity.polygon = constructionDraft.polygon.map((point) => [point.lat, point.lng]);
    constructionRenderer.reconcileDrafts([entity]);
    return;
  }
  const color = resolveReferencedLineColor(
    constructionDraft.routeId,
    networkState.routes,
    getActivePlan(false)?.routes ?? [],
    selectedColor,
  );
  const points = constructionDraft.points.map((point) => [point.lat, point.lng] as [number, number]);
  entity.lines.push(
    { points, color: "#ffffff", weight: 12, opacity: 0.76, dashArray: "12 9" },
    { points, color, weight: 7, opacity: 0.82, dashArray: "12 9" },
  );
  for (const segment of constructionDraft.analysis.segments.filter((item) => item.mountainLengthKm > 0)) {
    entity.lines.push({ points: segment.coordinates, color: "#ff9f43", weight: 9, opacity: 0.9, dashArray: "5 5" });
  }
  for (const crossing of constructionDraft.analysis.riverCrossings) {
    const colorForCrossing = crossing.mode === "bridge" ? "#f3ca52" : crossing.mode === "tunnel" ? "#7aa7ff" : "#ff5d5d";
    entity.markers.push({ position: crossing.position, color: colorForCrossing });
  }
  constructionRenderer.reconcileDrafts([entity]);
}

function formatConstructionDuration(days: number) {
  if (days < 60) return `${Math.max(1, Math.round(days))}일`;
  return `약 ${(days / 30).toFixed(days >= 300 ? 0 : 1)}개월`;
}

function smoothScreenPoints(points: L.Point[]) {
  const simplified = simplifyPoints(points, 8);
  const resampled = resamplePoints(simplified, 24);
  return chaikin(resampled, 2);
}

function simplifyPoints(points: L.Point[], tolerance: number) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifySection(points, 0, points.length - 1, tolerance, keep);
  return points.filter((_, index) => keep[index] === 1);
}

function simplifySection(points: L.Point[], first: number, last: number, tolerance: number, keep: Uint8Array) {
  let maxDistance = 0;
  let index = first;
  for (let i = first + 1; i < last; i += 1) {
    const distance = pointLineDistance(points[i], points[first], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return;
  keep[index] = 1;
  simplifySection(points, first, index, tolerance, keep);
  simplifySection(points, index, last, tolerance, keep);
}

function resamplePoints(points: L.Point[], spacing: number) {
  if (points.length <= 2) return points;
  const result = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const segmentLength = start.distanceTo(end);
    if (segmentLength === 0) continue;
    let distance = spacing - carry;
    while (distance < segmentLength) {
      const ratio = distance / segmentLength;
      result.push(L.point(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio));
      distance += spacing;
    }
    carry = segmentLength - (distance - spacing);
  }
  result.push(points[points.length - 1]);
  return result;
}

function chaikin(points: L.Point[], iterations: number) {
  let current = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (current.length <= 2) return current;
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i += 1) {
      const a = current[i];
      const b = current[i + 1];
      next.push(L.point(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      next.push(L.point(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function pointLineDistance(point: L.Point, start: L.Point, end: L.Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return point.distanceTo(start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return point.distanceTo(L.point(start.x + t * dx, start.y + t * dy));
}

function projectPointOnSegment(point: L.Point, start: L.Point, end: L.Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator));
  return { point: L.point(start.x + t * dx, start.y + t * dy), t };
}

function calculatePolygonAreaHa(points: LatLng[]) {
  const origin = points[0];
  const projected = points.map((point) => {
    const x = map.distance(origin, L.latLng(origin.lat, point.lng)) * (point.lng < origin.lng ? -1 : 1);
    const y = map.distance(origin, L.latLng(point.lat, origin.lng)) * (point.lat < origin.lat ? -1 : 1);
    return { x, y };
  });
  let area = 0;
  for (let i = 0; i < projected.length; i += 1) {
    const next = projected[(i + 1) % projected.length];
    area += projected[i].x * next.y - next.x * projected[i].y;
  }
  return Math.round((Math.abs(area) / 2 / 10000) * 10) / 10;
}

function calculateDepotCapacity(areaHa: number, level: number) {
  return Math.max(4, Math.floor(areaHa * 3.2) + level * 4);
}

function calculateDepotMaintenance(areaHa: number, level: number) {
  return Math.round(areaHa * 95 + level * 420);
}

function polylinePixelLength(points: L.Point[]) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) length += points[i - 1].distanceTo(points[i]);
  return length;
}

function polygonAreaPx(points: L.Point[]) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function closeLatLngRing(points: LatLng[]) {
  const first = points[0];
  const last = points[points.length - 1];
  if (first.distanceTo(last) < 1) return points;
  return [...points, first];
}

// 변경 직전의 전체 상태 스냅샷을 보관한다. 편집 작업은 mutate 전에 호출해야 한다.
function pushHistory() {
  undoStack = [...undoStack, cloneState()].slice(-maxHistory);
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack = [...redoStack, cloneState()].slice(-maxHistory);
  stateRecoveryCoordinator.recover(undoStack[undoStack.length - 1], {
    scope: "full",
    domains: [],
    rebuildRouter: true,
  });
  undoStack = undoStack.slice(0, -1);
  requestStateSave();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack = [...undoStack, cloneState()].slice(-maxHistory);
  stateRecoveryCoordinator.recover(redoStack[redoStack.length - 1], {
    scope: "full",
    domains: [],
    rebuildRouter: true,
  });
  redoStack = redoStack.slice(0, -1);
  requestStateSave();
}

function cloneState(): SaveState {
  const network = networkState.snapshot();
  return captureGameState<SaveState>(
    currentSaveSchemaVersion,
    metaState.snapshot(),
    network.routes,
    network.stations,
    network.transfers,
    network.depots,
    constructionState.plans,
    diagramStateOwner.current,
    analysisStateOwner.current,
    financeState.statistics,
    constructionState.projects,
    newsEventState.current,
    operationsState.fleets,
    operationsState.services,
    operationsState.expressConfigs,
    [...demandState.passengerGroups],
    loanState.current,
    financeState.economy,
    [...demandState.demandZones],
    [...demandState.stationDemandStates],
  );
}

function migrateLegacyFleetsToOperatingServices() {
  for (const route of networkState.routes) {
    const legacyFleets = operationsState.fleets.filter((fleet) => fleet.routeId === route.id && !fleet.serviceId);
    if (legacyFleets.length === 0) continue;
    let service = operationsState.services.find((item) => item.ownerRouteId === route.id);
    if (!service) {
      const option = getOperatingServicePathOptions(route.id)[0];
      const routeStationIds = option?.stationIds ?? networkState.stations.filter((station) => station.connectedRouteIds.includes(route.id)).map((station) => station.id);
      service = {
        id: stableEntityId("service", `${route.id}:legacy-default`),
        name: `${route.name} 기본 계통`,
        ownerRouteId: route.id,
        routeIds: [route.id],
        branchIds: option?.branchIds ?? [],
        pathOptionId: option?.id ?? `${route.id}:trunk`,
        pathCoordinates: option?.points.map((point) => [point.lat, point.lng]) ?? route.coordinates,
        stationIds: routeStationIds,
        stopStationIds: routeStationIds,
        preset: "all",
        createdAt: metaState.current.createdAt,
      };
      operationsState.replaceServices([...operationsState.services, service]);
    }
    operationsState.fleets = operationsState.fleets.map((fleet) =>
      fleet.routeId === route.id && !fleet.serviceId ? { ...fleet, serviceId: service!.id } : fleet
    );
  }
}

function applyState(state: SaveState) {
  state = migrateGameSave(state);
  metaState.replace({ ...createDefaultMeta(), ...(state.meta ?? metaState.current) });
  networkState.replace({
    routes: (state.routes ?? []).map((route) => rebuildRouteGraph(route)),
    stations: state.stations,
    transfers: state.transfers,
    depots: state.depots,
  });
  demandState.demandZones = state.demandZones ?? [];
  demandState.stationDemandStates = state.stationDemandStates ?? [];
  demandRuntimeCache.invalidate();
  constructionState.replacePlans(normalizePlans(state.plans ?? []));
  const failedRestoredConnections = constructionState.plans.flatMap((plan) => plan.connections ?? []).filter((connection) => connection.status === "failed" && Boolean(connection.failureReason));
  if (failedRestoredConnections.length > 0) {
    console.error("[integrity] connection blueprints were preserved but not replayed because their completed runtime result was missing.", failedRestoredConnections);
  }
  diagramStateOwner.replace(state.diagramState);
  analysisStateOwner.current = normalizeAnalysisState(state.analysisState);
  financeState.statistics = normalizeStatisticsState(state.statisticsState);
  constructionState.replaceProjects(normalizeConstructionProjects(state.constructionProjects));
  newsEventState.replace(normalizeNewsEvents(state.newsEvents));
  operationsState.fleets = (state.trainFleets ?? []).map((fleet) => updateFleetSetCount(fleet, fleet.sets));
  operationsState.services = (state.operatingServices ?? []).map((service) =>
    normalizeOperatingService(service, new Set(networkState.routes.map((route) => route.id)))
  );
  migrateLegacyFleetsToOperatingServices();
  operationsState.expressConfigs = state.expressConfigs ?? [];
  demandState.passengerGroups = state.passengerGroups ?? [];
  loanState.replace(state.loans ?? []);
  financeState.economy = { ...defaultEconomy, ...(state.economy ?? {}) };
  transitRouterCache.invalidate();
  congestionRuntimeState.reset();
  synchronizeGraphReferences();
  if (!state.statisticsState && financeState.economy.demand > 0) financeState.statistics = { ...financeState.statistics, totalPassengers: financeState.economy.demand };
}

function requestStateSave(kind: "normal" | "immediate" = "normal") {
  if (!hasActiveGameSession) return;
  if (kind === "immediate") saveFacade.requestImmediate();
  else saveFacade.request();
}

const stateRecoveryCoordinator = new StateRecoveryCoordinator<SaveState>({
  capture: cloneState,
  restore: applyState,
  requestUpdates: (domains) => requestUpdateDomains(domains),
  fullReconcile: () => renderAll(),
  rebuildRouter: () => {
    transitRouterCache.invalidate();
  },
  validate: synchronizeGraphReferences,
});

if (import.meta.env.DEV) {
  installManualVerificationStateHook({
    apply: (state: ManualVerificationState) => {
      resetWorld();
      applyState(state);
      hasActiveGameSession = true;
      metaState.replace({ ...createDefaultMeta(), ...(state.meta ?? {}) });
      setWorkspaceMode("management");
      setTool("pan");
      if (tutorialPanel) tutorialPanel.hidden = true;
    },
    save: async () => {
      metaState.patch({ updatedAt: Date.now() });
      const state = cloneState();
      if (await saveFacade.load(metaState.current.slotId)) await saveFacade.update(state);
      else await saveFacade.create(state);
      slotSummaries = await listSaveSlots();
      if (startScreen) startScreen.hidden = true;
      applyCityMapConstraints(metaState.current.cityId);
      startAutoSave();
      renderAll();
      requestUpdates(["network-structure", "blueprint-preview"]);
    },
    inspect: () => ({ state: cloneState(), updateTrace: updateScheduler.snapshot() }),
  });
}

async function flushStateSave() {
  if (!hasActiveGameSession) return;
  synchronizeGraphReferences();
  await saveFacade.flush();
}

/**
 * 빠른 복구용 localStorage 상태를 읽는다.
 * 정식 슬롯 저장소는 IndexedDB지만, 읽기 실패나 이전 버전 호환을 위해 이 경로를 남긴다.
 */
function loadSavedState() {
  try {
    const savedState = localRecoveryStore.read();
    if (savedState) {
      applyState(savedState);
      return;
    }
    networkState.routes = localRecoveryStore.readLegacyRoutes<RouteLine>().map((route) => rebuildRouteGraph(route));
  } catch {
    networkState.reset();
    demandState.reset();
    demandRuntimeCache.invalidate();
    transitRouterCache.invalidate();
    congestionRuntimeState.reset();
    constructionState.reset();
    diagramStateOwner.reset();
    analysisStateOwner.current = { ...defaultAnalysisState, demandHistory: [], suggestions: [], decisions: {} };
    financeState.reset({ ...defaultEconomy }, { ...defaultStatisticsState, dailyRecords: [] });
    newsEventState.reset();
    operationsState.reset();
    loanState.reset();
  }
}

function updateLod() {
  const zoom = map.getZoom();
  const mode = getLodMode(zoom);
  setText(zoomReadout, String(zoom));
  setText(lodReadout, mode === "overview" ? "축소" : mode === "district" ? "중간" : "건설");
  if (activeTool === "pan") {
    setText(modeLabel, mode === "build" ? "상세 건설 화면" : "지도 탐색");
    setHint(mode === "build" ? ["시설 관리 가능", "핀치 줌"] : ["한 손가락 이동", "핀치 줌"]);
  }
  if (planningMode && activeTool === "pan") {
    setText(modeLabel, "계획 모드");
    setHint(["자금 차감 없는 미래 설계", "목록에서 편집·전환"]);
  }
  setTileOpacity(baseLayer, mode === "overview" ? 0.92 : 1);
  if (mode === "overview" && !map.hasLayer(terrainLayer)) terrainLayer.addTo(map);
  if (mode !== "overview" && map.hasLayer(terrainLayer)) terrainLayer.removeFrom(map);
  document.body.dataset.lod = mode;
}

function updateDynamicLayers() {
  if (!overlayState.population) {
    populationDensityLayer.clearLayers();
    return;
  }

  populationDensityLayer.clearLayers();
  if (demandState.demandZones.length === 0) return;
  renderPopulationDensityCells();
}

function renderPopulationDensityCells() {
  const bounds = map.getBounds();
  const resolution = populationResolutionForZoom(map.getZoom());
  const cells = getRealPopulationCells(metaState.current.cityId, {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  }, resolution);
  const values = cells.map((cell) => cell.population).sort((left, right) => left - right);
  const upperBound = values[Math.floor((values.length - 1) * 0.9)] ?? 1;
  for (const cell of cells) {
    const density = Math.min(1, cell.population / Math.max(1, upperBound));
    L.circle([cell.latitude, cell.longitude], {
      pane: "populationDensityPane",
      radius: resolution * 1.05,
      color: populationDensityColor(density),
      weight: 0,
      opacity: 0,
      fillColor: populationDensityColor(density),
      fillOpacity: resolution === 100
        ? 0.012 + Math.sqrt(density) * 0.1
        : 0.035 + Math.sqrt(density) * 0.17,
      interactive: false,
    }).addTo(populationDensityLayer);
  }
}

function populationResolutionForZoom(zoom: number) {
  if (zoom >= 16) return 100;
  if (zoom >= 14) return 250;
  if (zoom >= 12) return 500;
  return 1000;
}

function populationDensityColor(density: number) {
  const stops: ReadonlyArray<readonly [number, number, number]> = [
    [29, 78, 216], [6, 182, 212], [34, 197, 94], [250, 204, 21], [251, 146, 60], [244, 63, 94],
  ];
  const clamped = Math.min(1, Math.max(0, density));
  const scaled = clamped * (stops.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(stops.length - 1, lowerIndex + 1);
  const progress = scaled - lowerIndex;
  const lower = stops[lowerIndex];
  const upper = stops[upperIndex];
  const channel = (index: number) => Math.round(lower[index] + (upper[index] - lower[index]) * progress);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

// Administrative and land-use overlays are retired from the game UI.
void updateGeoLayer;
void loadViewportOsmData;

function updateGeoLayer(layer: GeoJSON, visible: boolean) {
  if (!visible) {
    layer.clearLayers();
    if (map.hasLayer(layer)) layer.removeFrom(map);
  } else if (!map.hasLayer(layer)) {
    layer.addTo(map);
  }
}

/**
 * 현재 화면 범위에 필요한 OSM 행정/토지이용 데이터만 Overpass에서 불러온다.
 * 이전 요청은 취소하고 여러 endpoint를 순서대로 시도해 지도 이동이 잦거나
 * 특정 서버가 불안정한 상황에서도 최신 viewport 결과만 적용한다.
 */
async function loadViewportOsmData(options: { admin: boolean; landuse: boolean }) {
  const bounds = map.getBounds().pad(0.18);
  renderFallbackOverlays(options);
  if (approximateAreaKm2(bounds) > 900) {
    if (options.admin || options.landuse) showToast("레이어를 보려면 지도를 조금 더 확대해 주세요.");
    return;
  }
  const bbox = [bounds.getSouth().toFixed(5), bounds.getWest().toFixed(5), bounds.getNorth().toFixed(5), bounds.getEast().toFixed(5)].join(",");
  const queryKey = `${bbox}:${options.admin}:${options.landuse}:${Math.floor(map.getZoom())}`;
  if (queryKey === lastOverpassKey) return;
  lastOverpassKey = queryKey;

  const filters = [
    options.admin
      ? `relation["boundary"="administrative"]["admin_level"~"6|7|8"](${bbox});way["boundary"="administrative"]["admin_level"~"6|7|8"](${bbox});`
      : "",
    options.landuse
      ? `way["landuse"~"residential|commercial|industrial|retail|forest|grass|recreation_ground"](${bbox});way["natural"~"wood|water"](${bbox});way["waterway"~"river|stream|canal"](${bbox});`
      : "",
  ].join("");
  if (!filters.trim()) return;

  overpassAbort?.abort();
  overpassAbort = new AbortController();
  const query = `[out:json][timeout:10];(${filters});out tags geom 180;`;
  const cached = sessionStorage.getItem(`osm:${queryKey}`);

  try {
    const data = cached ? JSON.parse(cached) : await fetchOverpass(query, overpassAbort.signal);
    if (!cached) sessionStorage.setItem(`osm:${queryKey}`, JSON.stringify(data));
    renderOverpass(data.elements ?? [], options);
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      console.warn(error);
      showToast("기본 지도 레이어를 표시하고 있습니다.");
    }
  }
}

async function fetchOverpass(query: string, signal: AbortSignal, endpointTimeoutMs?: number) {
  let lastError: unknown;
  for (const endpoint of overpassEndpoints) {
    const requestController = endpointTimeoutMs ? new AbortController() : null;
    const abortRequest = () => requestController?.abort();
    if (requestController) signal.addEventListener("abort", abortRequest, { once: true });
    if (signal.aborted) abortRequest();
    const timeout = requestController ? window.setTimeout(abortRequest, endpointTimeoutMs) : null;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: requestController?.signal ?? signal,
      });
      if (!response.ok) throw new Error(`Overpass failed: ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Overpass returned malformed JSON.");
      const result = data as { remark?: unknown; elements?: unknown };
      if (result.remark !== undefined && result.remark !== "") throw new Error("Overpass returned an error or incomplete result.");
      if (!Array.isArray(result.elements) || result.elements.some((element) => !element || typeof element !== "object" || Array.isArray(element))) throw new Error("Overpass elements are invalid.");
      return data as { elements: OverpassElement[] };
    } catch (error) {
      if (signal.aborted || ((error as Error).name === "AbortError" && !endpointTimeoutMs)) throw error;
      lastError = error;
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
      if (requestController) signal.removeEventListener("abort", abortRequest);
    }
  }
  throw lastError ?? new Error("No Overpass endpoint available");
}

function renderOverpass(elements: OverpassElement[], options: { admin: boolean; landuse: boolean }) {
  const adminFeatures: GeoJsonFeature[] = [];
  const landuseFeatures: GeoJsonFeature[] = [];
  const nextObstacles: Obstacle[] = [];

  for (const element of elements) {
    if (!element.tags) continue;
    if (options.admin && element.tags.boundary === "administrative") {
      const feature = administrativeToFeature(element);
      if (feature) adminFeatures.push(feature);
    }
    if (options.landuse && (element.tags.landuse || element.tags.natural || element.tags.waterway) && element.geometry) {
      const isRiver = element.tags.natural === "water" || Boolean(element.tags.waterway);
      const isMountain = element.tags.natural === "wood" || element.tags.landuse === "forest";
      const coordinates = element.geometry.map((point) => [point.lon, point.lat]);
      landuseFeatures.push({
        type: "Feature",
        properties: element.tags,
        geometry: { type: element.tags.waterway ? "LineString" : "Polygon", coordinates: element.tags.waterway ? coordinates : [coordinates] },
      });
      if (isRiver || isMountain) {
        nextObstacles.push({
          kind: isRiver ? "river" : "mountain",
          points: element.geometry.map((point) => map.latLngToContainerPoint(L.latLng(point.lat, point.lon))),
        });
      }
    }
  }

  knownObstacles = nextObstacles;
  adminLayer.clearLayers();
  landuseLayer.clearLayers();
  if (adminFeatures.length > 0) adminLayer.addData(toFeatureCollection(adminFeatures));
  if (landuseFeatures.length > 0) landuseLayer.addData(toFeatureCollection(landuseFeatures));
  if (adminFeatures.length === 0 || landuseFeatures.length === 0) renderFallbackOverlays(options, true);
}

function renderFallbackOverlays(options: { admin: boolean; landuse: boolean }, fillMissingOnly = false) {
  const bounds = map.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const latStep = (north - south) / 3;
  const lngStep = (east - west) / 3;

  if (options.admin && (!fillMissingOnly || adminLayer.getLayers().length === 0)) {
    const boundaries: GeoJsonFeature[] = [];
    for (let index = 1; index < 3; index += 1) {
      boundaries.push({ type: "Feature", properties: { boundary: "administrative" }, geometry: { type: "LineString", coordinates: [[west, south + latStep * index], [east, south + latStep * index]] } });
      boundaries.push({ type: "Feature", properties: { boundary: "administrative" }, geometry: { type: "LineString", coordinates: [[west + lngStep * index, south], [west + lngStep * index, north]] } });
    }
    adminLayer.clearLayers();
    adminLayer.addData(toFeatureCollection(boundaries));
  }

  if (options.landuse && (!fillMissingOnly || landuseLayer.getLayers().length === 0)) {
    const rectangle = (column: number, row: number, properties: Record<string, string>): GeoJsonFeature => {
      const insetLat = latStep * 0.08;
      const insetLng = lngStep * 0.08;
      const left = west + lngStep * column + insetLng;
      const right = west + lngStep * (column + 1) - insetLng;
      const bottom = south + latStep * row + insetLat;
      const top = south + latStep * (row + 1) - insetLat;
      return { type: "Feature", properties, geometry: { type: "Polygon", coordinates: [[[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]]] } };
    };
    const landuses = [
      rectangle(0, 0, { landuse: "residential" }),
      rectangle(1, 0, { landuse: "commercial" }),
      rectangle(2, 0, { natural: "water" }),
      rectangle(0, 1, { landuse: "forest" }),
      rectangle(1, 1, { landuse: "residential" }),
      rectangle(2, 1, { landuse: "industrial" }),
      rectangle(0, 2, { landuse: "grass" }),
      rectangle(1, 2, { landuse: "retail" }),
      rectangle(2, 2, { landuse: "residential" }),
    ];
    landuseLayer.clearLayers();
    landuseLayer.addData(toFeatureCollection(landuses));
  }
}

function administrativeToFeature(element: OverpassElement): GeoJsonFeature | null {
  const rings = element.members
    ?.filter((member) => member.role === "outer" && member.geometry && member.geometry.length > 2)
    .map((member) => member.geometry!.map((point) => [point.lon, point.lat]));
  if (rings && rings.length > 0) {
    return { type: "Feature", properties: element.tags ?? {}, geometry: { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) } };
  }
  if (!element.geometry || element.geometry.length < 2) return null;
  const coordinates = element.geometry.map((point) => [point.lon, point.lat]);
  const isClosed = coordinates.length > 3 && coordinates[0][0] === coordinates.at(-1)?.[0] && coordinates[0][1] === coordinates.at(-1)?.[1];
  return {
    type: "Feature",
    properties: element.tags ?? {},
    geometry: isClosed ? { type: "Polygon", coordinates: [coordinates] } : { type: "LineString", coordinates },
  };
}

function applyLayerVisibility(key: OverlayKey) {
  const layer = layers[key];
  if (overlayState[key]) {
    if (!map.hasLayer(layer)) layer.addTo(map);
  } else if (map.hasLayer(layer)) {
    map.removeLayer(layer);
  }
}

function approximateAreaKm2(bounds: L.LatLngBounds) {
  return Math.abs(bounds.getNorth() - bounds.getSouth()) * 111 * Math.abs(bounds.getEast() - bounds.getWest()) * 88.8;
}

function setTileOpacity(layer: TileLayer, opacity: number) {
  if (layer.options.opacity !== opacity) layer.setOpacity(opacity);
}

const tutorialSteps = [
  { title: "지도를 움직이고 확대하세요", text: "한 손가락으로 지도를 이동한 뒤 두 손가락으로 확대하세요.", target: "map" },
  { title: "노선 색상을 고르세요", text: "상단 색상표에서 첫 노선에 사용할 색을 하나 선택하세요.", target: "color" },
  { title: "짧은 노선을 그리세요", text: "노선 버튼을 누르고 지도 위를 50m 이상 드래그한 뒤 건설을 확정하세요.", target: "route" },
  { title: "역을 두 개 배치하세요", text: "역 버튼을 누르고 방금 만든 노선 위의 서로 다른 지점을 두 번 누르세요.", target: "station" },
  { title: "차량기지 범위를 지정하세요", text: "기지 버튼을 누르고 차량기지 경계를 그리세요. 노선 옆에 두면 연결되고, 떨어진 곳에도 단독 건설할 수 있습니다.", target: "depot" },
  { title: "노선 연결 여부를 확인하세요", text: "노선 가까이는 연결된 상태로, 떨어진 곳은 단독 건설로 표시됩니다. 두 경우 모두 건설할 수 있습니다.", target: "depot" },
  { title: "열차를 구매하고 배정하세요", text: "첫 노선을 선택한 상태에서 편성 수와 차량 수를 확인하고 구매하세요.", target: "train" },
  { title: "첫 노선을 개통하세요", text: "공사 현황에서 네 가지 개통 조건을 확인하고 노선 개통을 누르세요.", target: "opening" },
  { title: "시간을 흐르게 하세요", text: "하단의 x2, x5, x10 또는 x100을 눌러 운행을 시작하세요.", target: "speed" },
  { title: "첫 수익을 확인하세요", text: "하루 운행이 끝날 때까지 기다리세요. 첫 운임 수익이 기록되면 완료됩니다.", target: "revenue" },
] as const;

function createTutorialProgress(): TutorialProgress {
  return {
    mapMoved: false,
    mapZoomed: false,
    colorSelected: false,
    timeStarted: false,
    startedDay: analysisStateOwner.current.dayIndex ?? 0,
  };
}

function getTutorialProgress() {
  const progress = metaState.current.tutorialProgress ?? createTutorialProgress();
  if (!metaState.current.tutorialProgress) metaState.patch({ tutorialStep: 0, tutorialProgress: progress });
  return progress;
}

function isTutorialGuidedBuild() {
  return !metaState.current.tutorialCompleted && (metaState.current.tutorialStep ?? 0) <= 7 && startScreen?.hidden !== false;
}

function recordTutorialSignal(signal: "mapMoved" | "mapZoomed" | "colorSelected" | "timeStarted", refresh = true) {
  if (metaState.current.tutorialCompleted || startScreen?.hidden === false) return;
  const progress = getTutorialProgress();
  if (progress[signal]) return;
  metaState.patch({ tutorialProgress: { ...progress, [signal]: true } });
  if (refresh) updateTutorialProgress();
}

function captureTutorialConstruction(kind: ConstructionDraftKind, assetId: string) {
  if (metaState.current.tutorialCompleted) return;
  const progress = getTutorialProgress();
  if (kind === "route" && !progress.targetRouteId) {
    metaState.patch({ tutorialProgress: { ...progress, targetRouteId: assetId } });
  } else if (kind === "depot" && !progress.targetDepotId) {
    metaState.patch({ tutorialProgress: { ...progress, targetDepotId: assetId } });
  }
}

function applyTutorialConstructionBoost(kind: ConstructionDraftKind | "station", assetId: string) {
  if (metaState.current.tutorialCompleted) return;
  const progress = getTutorialProgress();
  constructionState.replaceProjects(constructionState.projects.map((project) => {
    const matches =
      (kind === "route" && project.routeIds.includes(assetId)) ||
      (kind === "depot" && project.depotIds.includes(assetId)) ||
      (kind === "station" && project.stationIds.includes(assetId));
    if (!matches) return project;
    if (kind === "route" && progress.targetRouteId === assetId) {
      return { ...project, status: "opening-ready", elapsedDays: project.durationDays, expectedCompletionDay: analysisStateOwner.current.dayIndex };
    }
    if (kind === "depot" || kind === "station") {
      return { ...project, status: "operating", elapsedDays: project.durationDays, expectedCompletionDay: analysisStateOwner.current.dayIndex, openedAtDay: analysisStateOwner.current.dayIndex };
    }
    return project;
  }));
}

function applyTutorialPlanConversionBoost(routeIds: string[], stationIds: string[], depotIds: string[]) {
  if (!isTutorialGuidedBuild()) return;

  // The regular construction flow captures and fast-forwards tutorial assets as
  // each one is built. Plan conversion creates them in a batch, so it must mirror
  // that flow after the corresponding construction projects have been registered.
  const tutorialRouteId = routeIds[0];
  if (tutorialRouteId) {
    captureTutorialConstruction("route", tutorialRouteId);
    applyTutorialConstructionBoost("route", tutorialRouteId);
  }
  stationIds.forEach((stationId) => applyTutorialConstructionBoost("station", stationId));
  depotIds.forEach((depotId) => {
    captureTutorialConstruction("depot", depotId);
    applyTutorialConstructionBoost("depot", depotId);
  });
}

function openTutorial(restart = false) {
  if (!tutorialPanel) return;
  if (restart) {
    clearTutorialTargets();
    metaState.patch({
      tutorialStep: 0,
      tutorialCompleted: false,
      tutorialProgress: createTutorialProgress(),
    });
    requestStateSave();
  }
  tutorialPanel.hidden = false;
  renderTutorial();
}

function renderTutorial(feedback?: string) {
  const step = Math.max(0, Math.min(tutorialSteps.length - 1, metaState.current.tutorialStep ?? 0));
  const item = tutorialSteps[step];
  setText(tutorialStep, `${String(step + 1).padStart(2, "0")} / ${String(tutorialSteps.length).padStart(2, "0")}`);
  setText(tutorialTitle, item.title);
  setText(tutorialText, item.text);
  setText(tutorialFeedback, feedback ?? getTutorialFeedback(step));
  if (tutorialNextButton) tutorialNextButton.textContent = "확인";
  applyTutorialTarget(item.target);
}

function updateTutorialProgress() {
  if (metaState.current.tutorialCompleted || startScreen?.hidden === false) {
    clearTutorialTargets();
    return;
  }
  if (tutorialPanel?.hidden) tutorialPanel.hidden = false;
  let step = Math.max(0, Math.min(tutorialSteps.length - 1, metaState.current.tutorialStep ?? 0));
  let changed = false;
  while (isTutorialStepComplete(step)) {
    if (step === tutorialSteps.length - 1) {
      completeTutorial(false);
      return;
    }
    step += 1;
    changed = true;
  }
  if (changed) {
    metaState.patch({ tutorialStep: step });
    requestStateSave();
    playFeedback("select");
  }
  renderTutorial();
}

function isTutorialStepComplete(step: number) {
  const progress = getTutorialProgress();
  const routeId = progress.targetRouteId;
  const depot = networkState.depots.find((item) => item.id === progress.targetDepotId);
  if (step === 0) return progress.mapMoved && progress.mapZoomed;
  if (step === 1) return progress.colorSelected;
  if (step === 2) return Boolean(routeId && networkState.routes.some((route) => route.id === routeId));
  if (step === 3) return Boolean(routeId && networkState.stations.filter((station) => station.connectedRouteIds.includes(routeId)).length >= 2);
  if (step === 4) return Boolean(depot);
  if (step === 5) return Boolean(routeId && depot?.connectedRouteIds.includes(routeId));
  if (step === 6) return Boolean(routeId && operationsState.fleets.some((fleet) => fleet.routeId === routeId && fleet.sets > 0));
  if (step === 7) return Boolean(routeId && isRouteOperational(routeId));
  if (step === 8) return progress.timeStarted;
  return financeState.statistics.dailyRecords.some((record) => record.day > progress.startedDay && record.revenue > 0);
}

function getTutorialFeedback(step: number) {
  const progress = getTutorialProgress();
  const routeId = progress.targetRouteId;
  const routeStationCount = routeId ? networkState.stations.filter((station) => station.connectedRouteIds.includes(routeId)).length : 0;
  const depot = networkState.depots.find((item) => item.id === progress.targetDepotId);
  if (step === 0) {
    if (!progress.mapMoved && !progress.mapZoomed) return "지도를 드래그하고 확대하면 자동으로 넘어갑니다.";
    return progress.mapMoved ? "이동했습니다. 이제 지도를 확대해 보세요." : "확대했습니다. 이제 지도를 옆으로 움직여 보세요.";
  }
  if (step === 1) return "색상 원을 직접 누르면 선택됩니다.";
  if (step === 2) return "50m 미만 구간은 건설할 수 없습니다. 더 길게 드래그하세요.";
  if (step === 3) return `첫 노선 위에 역이 2개 필요합니다. 현재 ${routeStationCount}개가 연결되어 있습니다.`;
  if (step === 4) return "기지 경계는 노선 가까이에 충분한 면적으로 그려 주세요.";
  if (step === 5) return depot ? "차량기지가 첫 노선과 연결되지 않았습니다. 경계를 노선 가까이에 다시 지정해 주세요." : "먼저 차량기지 범위를 지정하세요.";
  if (step === 6) return "연결된 차량기지가 준비되었습니다. 하단 구매 버튼으로 열차를 배정하세요.";
  if (step === 7) return "공사 현황을 열고 차량기지·열차·역·운행 경로가 모두 충족됐는지 확인하세요.";
  if (step === 8) return "하단 시간 배속에서 x1 이상을 선택하세요.";
  return financeState.economy.demand <= 0
    ? "승객 수요가 없습니다. 노선 개통과 역 연결 상태를 확인하세요."
    : "열차가 운행 중입니다. 게임 하루가 끝나면 운임 수익이 기록됩니다.";
}

function applyTutorialTarget(target: (typeof tutorialSteps)[number]["target"]) {
  clearTutorialTargets();
  const targetElement =
    target === "map"
      ? mapContainer
      : target === "color"
        ? routeTool
        : target === "route"
          ? routeTool
          : target === "station"
            ? stationTool
            : target === "depot"
              ? depotTool
              : target === "train"
                ? buyTrainButton
                : target === "opening"
                  ? constructionManagerButton
                  : target === "speed"
                    ? document.querySelector<HTMLElement>("#timePlate")
                    : statisticsButton;
  targetElement?.classList.add("tutorial-target");
  document.body.dataset.tutorialTarget = target;
  if (targetElement && target !== "map") targetElement.scrollIntoView({ behavior: settings.reducedMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
}

function clearTutorialTargets() {
  document.querySelectorAll(".tutorial-target").forEach((element) => element.classList.remove("tutorial-target"));
  delete document.body.dataset.tutorialTarget;
}

function advanceTutorial() {
  const step = Math.max(0, Math.min(tutorialSteps.length - 1, metaState.current.tutorialStep ?? 0));
  if (isTutorialStepComplete(step)) {
    updateTutorialProgress();
    return;
  }
  const message = getTutorialFeedback(step);
  renderTutorial(message);
  showToast(message);
  playFeedback("select");
}

function completeTutorial(skipped = true) {
  metaState.patch({ tutorialStep: tutorialSteps.length - 1, tutorialCompleted: true });
  if (tutorialPanel) tutorialPanel.hidden = true;
  clearTutorialTargets();
  requestStateSave();
  void saveCurrentSlot(skipped ? "튜토리얼 건너뛰기" : "튜토리얼 완료");
  showToast(skipped ? "튜토리얼을 건너뛰었습니다. 도움말에서 언제든 다시 볼 수 있습니다." : "첫 노선 관제 교육을 완료했습니다.");
  playFeedback("confirm");
}

function loadSettings(): GameSettings {
  try {
    const saved = localStorage.getItem("draw-gyotong-settings");
    const loaded: GameSettings = { ...defaultSettings, ...(saved ? (JSON.parse(saved) as Partial<GameSettings>) : {}) };
    return { ...loaded, mapTheme: normalizeMapTheme(loaded.mapTheme) };
  } catch {
    return { ...defaultSettings };
  }
}

function updateSettings(patch: Partial<GameSettings>) {
  settings = { ...settings, ...patch };
  localStorage.setItem("draw-gyotong-settings", JSON.stringify(settings));
  applySettingsToUi();
  if ("autoSaveEnabled" in patch || "autoSaveIntervalSeconds" in patch) startAutoSave();
  playFeedback("select");
}

function applySettingsToUi() {
  applyMapTheme(document.documentElement, settings.mapTheme);
  document.body.dataset.performance = settings.performanceMode;
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  if (soundToggle) soundToggle.checked = settings.soundEnabled;
  if (hapticsToggle) hapticsToggle.checked = settings.hapticsEnabled;
  if (performanceSelect) performanceSelect.value = settings.performanceMode;
  if (mapThemeSelect) mapThemeSelect.value = settings.mapTheme;
  if (reducedMotionToggle) reducedMotionToggle.checked = settings.reducedMotion;
  if (sandboxConstructionTimeToggle) sandboxConstructionTimeToggle.checked = settings.sandboxConstructionTime;
  if (autoStationNamingToggle) autoStationNamingToggle.checked = settings.autoStationNaming;
  if (autoSaveToggle) autoSaveToggle.checked = settings.autoSaveEnabled;
  if (autoSaveIntervalSelect) {
    autoSaveIntervalSelect.value = String(settings.autoSaveIntervalSeconds);
    autoSaveIntervalSelect.disabled = !settings.autoSaveEnabled;
  }
}

/** 레일 밀도, 도구 배치, 더보기 상태, 모드 배너를 현재 모드·도구에 맞춘다. */
function syncRail() {
  const compact = compactRailQuery.matches || activeTool !== "pan";
  workspaceModeBar?.classList.toggle("dg-rail--compact", compact);
  workspaceModeBar?.classList.toggle("dg-rail--planning", workspaceMode === "planning");
  document.body.classList.toggle("game-rail-compact", compact);
  const mark = `dg-mode-mark dg-mode-mark--${workspaceModeMarks[workspaceMode]}`;
  if (railModeMark) railModeMark.className = mark;
  if (modeBannerMark) modeBannerMark.className = mark;
  setText(railModeNowLabel, workspaceModeShortNames[workspaceMode]);
  layoutRailTools();
  const activeButton = toolButtons.find((button) => button.getAttribute("aria-pressed") === "true");
  const toolName = activeTool === "pan" ? "탐색" : activeButton?.querySelector("span")?.textContent ?? "";
  setText(modeBannerText, toolName ? `${workspaceModeShortNames[workspaceMode]} · ${toolName}` : workspaceModeShortNames[workspaceMode]);
  placeModeBanner();
}

function layoutRailTools() {
  if (!workspaceModeBar || !railTools || !railOverflowTools || !modifyToolsButton) return;
  const modeButtons = railToolIds[workspaceMode]
    .map((id) => document.getElementById(id))
    .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);
  document.querySelectorAll<HTMLButtonElement>("[data-rail-tool]").forEach((button) => {
    button.hidden = !modeButtons.includes(button);
  });
  modeButtons.forEach((button) => railTools.append(button));
  modifyToolsButton.hidden = true;
  const overflows = () => workspaceModeBar.scrollHeight > workspaceModeBar.clientHeight + 1;
  if (overflows()) {
    modifyToolsButton.hidden = false;
    for (let index = modeButtons.length - 1; index > 0 && overflows(); index -= 1) railOverflowTools.prepend(modeButtons[index]);
  }
  const overflowActive = railOverflowTools.querySelector<HTMLButtonElement>("[aria-pressed=\"true\"]");
  modifyToolsButton.setAttribute("aria-pressed", String(Boolean(overflowActive)));
  setText(railMoreLabel, overflowActive?.querySelector("span")?.textContent ?? "더보기");
  if (modifyToolsButton.hidden && modifyToolsCard) modifyToolsCard.hidden = true;
}

/** 모드 배너는 두 정보판 사이에 들어가면 위쪽 가운데, 아니면 정보판 아래에 둔다. */
function placeModeBanner() {
  const financePlate = byId("financePlate");
  const timePlate = byId("timePlate");
  if (!modeBanner || !financePlate || !timePlate) return;
  const gap = timePlate.getBoundingClientRect().left - financePlate.getBoundingClientRect().right;
  modeBanner.dataset.placement = gap >= modeBanner.offsetWidth + 24 ? "top" : "low";
  document.body.dataset.modeBanner = modeBanner.dataset.placement;
}

/** 일시정지 칸과 배속 칸의 표시를 현재 simSpeed에 맞춘다. */
function syncSpeedControls() {
  const paused = simSpeed === 0;
  const shownSpeed = paused ? lastRunningSpeed : simSpeed;
  if (pauseToggleButton) {
    pauseToggleButton.dataset.paused = String(paused);
    pauseToggleButton.classList.toggle("dg-plate__cell--on", paused);
    pauseToggleButton.setAttribute("aria-label", paused ? `재생, ×${shownSpeed}로 재개` : "일시정지");
  }
  if (speedCycleButton) {
    speedCycleButton.textContent = `×${shownSpeed}`;
    speedCycleButton.setAttribute("aria-label", `배속 ×${shownSpeed}${paused ? ", 정지 중" : ""}. 누르면 ×${nextSpeedStep(shownSpeed)}`);
  }
}

function openSettings() {
  if (!settingsDialog) return;
  applySettingsToUi();
  settingsDialog.hidden = false;
  void updateCacheReadout();
  playFeedback("select");
}

function closeSettings() {
  if (settingsDialog) settingsDialog.hidden = true;
}

function updateRouteSettingsCard(tool: ToolMode) {
  const shouldShow = tool === "route" || tool === "extend" || tool === "branch" || tool === "merge";
  if (!routeSettingsCard) return;
  routeSettingsCard.hidden = !shouldShow;
  if (!shouldShow) return;
  routeSettingsCard.dataset.context = tool;
  const hasTargetContext = tool === "extend" || tool === "branch" || tool === "merge";
  if (routeSettingsTarget) routeSettingsTarget.hidden = !hasTargetContext;
  if (routeSettingsEditFields) routeSettingsEditFields.hidden = tool === "branch" || tool === "merge";
  if (hasTargetContext) {
    setText(routeSettingsTargetKicker, tool === "extend" ? "연장 대상" : tool === "branch" ? "분기 대상" : "연결 대상");
    setText(routeSettingsTargetName, "노선을 선택하세요");
    setText(routeSettingsTargetMeta, tool === "merge" ? "첫 번째 노선의 끝점을 선택하세요." : "지도에서 수정할 노선을 선택하세요.");
    routeSettingsTarget?.style.setProperty("--target-route-color", "#64748b");
    routeSettingsTargetSwatch?.style.setProperty("--target-route-color", "#64748b");
  }
  if (draftRouteNameInput) draftRouteNameInput.value = draftRouteName;
  setColorPickerValue(draftRouteColorInput, selectedColor);
  setText(routeSettingsHeaderName, draftRouteName || "노선 설정");
  routeSettingsHeaderSwatch?.style.setProperty("background-color", selectedColor);
}

function showRouteSettingsTarget(
  route: Pick<RouteLine | PlannedRoute, "id" | "name" | "color">,
  kind: "actual" | "planned",
  secondary?: Pick<RouteLine | PlannedRoute, "name" | "color">,
) {
  if (!routeSettingsCard || !routeSettingsTarget || routeSettingsCard.hidden) return;
  routeSettingsTarget.hidden = false;
  const context = activeTool === "extend" ? "연장 대상" : activeTool === "branch" ? "분기 대상" : "연결 대상";
  setText(routeSettingsTargetKicker, context);
  const targetTitle = secondary ? `${route.name} ↔ ${secondary.name}` : route.name;
  setText(routeSettingsTargetName, targetTitle);
  setText(routeSettingsHeaderName, targetTitle);
  routeSettingsHeaderSwatch?.style.setProperty("background-color", route.color);
  setText(
    routeSettingsTargetMeta,
    secondary
      ? `${kind === "planned" ? "계획 노선" : "운영 노선"} 두 개를 연결합니다.`
      : `${kind === "planned" ? "계획 노선" : "운영 노선"} · ${activeTool === "merge" ? "다른 노선 끝점을 선택하세요." : "현재 수정 대상으로 선택됨"}`,
  );
  routeSettingsTarget.style.setProperty("--target-route-color", route.color);
  routeSettingsTargetSwatch?.style.setProperty("--target-route-color", route.color);
  if (activeTool === "extend" || activeTool === "route") {
    draftRouteName = route.name;
    selectedColor = route.color;
    if (draftRouteNameInput) draftRouteNameInput.value = route.name;
    setColorPickerValue(draftRouteColorInput, route.color);
  }
}

function saveRouteSettings() {
  const nextName = draftRouteNameInput?.value.trim() ?? "";
  const nextColor = draftRouteColorInput?.value;
  if (!nextColor || !/^#[0-9a-f]{6}$/i.test(nextColor)) {
    showError("노선 색상을 선택해 주세요.");
    return;
  }
  draftRouteName = nextName;
  selectedColor = nextColor;
  recordTutorialSignal("colorSelected");
  showToast(nextName ? `“${nextName}” 노선 설정을 적용했습니다.` : "노선 색상을 적용했습니다.");
  playFeedback("confirm");
}

async function updateCacheReadout() {
  if (!("caches" in window) || !cacheReadout) return;
  try {
    const keys = await caches.keys();
    const entries = await Promise.all(keys.filter((key) => key.startsWith("draw-gyotong")).map(async (key) => (await caches.open(key)).keys()));
    const count = entries.reduce((sum, list) => sum + list.length, 0);
    setText(cacheReadout, `오프라인 지도 ${count}개 저장됨`);
  } catch {
    setText(cacheReadout, "지도 캐시를 확인할 수 없습니다");
  }
}

async function clearMapCache() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("draw-gyotong")).map((key) => caches.delete(key)));
    await updateCacheReadout();
    showToast("오프라인 지도 캐시를 정리했습니다");
    playFeedback("confirm");
  } catch (error) {
    console.error(error);
    showError("지도 캐시를 정리하지 못했습니다.");
  }
}

function playFeedback(kind: "select" | "build" | "confirm") {
  if (settings.hapticsEnabled) navigator.vibrate?.(kind === "build" ? [12, 24, 18] : kind === "confirm" ? [18, 20, 28] : 10);
  if (!settings.soundEnabled) return;
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const frequency = kind === "build" ? 520 : kind === "confirm" ? 720 : 380;
    oscillator.type = kind === "build" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === "confirm" ? 1.35 : 1.08), now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  } catch {
    // Audio is optional and can be blocked until the first user gesture.
  }
}

function updateLoadingProgress(progress: number, status: string) {
  if (loadingProgress) loadingProgress.style.width = `${progress}%`;
  setText(loadingStatus, status);
}

function finishLoading() {
  if (loadingComplete) return;
  loadingComplete = true;
  updateLoadingProgress(100, "관제 시스템 준비 완료");
  window.setTimeout(() => {
    if (loadingScreen) loadingScreen.hidden = true;
  }, 420);
}

let hintTimer: number | undefined;

function dismissHintAndToast() {
  if (hintTimer) {
    window.clearTimeout(hintTimer);
    hintTimer = undefined;
  }
  if (hintRow && hintRow.innerHTML !== "") {
    hintRow.innerHTML = "";
  }
  if (toast && !toast.hidden) {
    toast.classList.remove("is-visible");
    toast.hidden = true;
  }
}

document.addEventListener("pointerdown", () => {
  if ((hintRow && hintRow.innerHTML !== "") || (toast && !toast.hidden && toast.classList.contains("is-visible"))) {
    dismissHintAndToast();
  }
}, { passive: true });

function showToast(message: string) {
  if (!toast) return;
  setText(toast, message);
  toast.hidden = false;
  toast.classList.remove("is-visible");
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.clearTimeout(toastTimer);
  if (hintTimer) window.clearTimeout(hintTimer);

  toastTimer = window.setTimeout(() => {
    toast?.classList.remove("is-visible");
    window.setTimeout(() => {
      if (toast) toast.hidden = true;
    }, 180);
  }, 3000);

  hintTimer = window.setTimeout(dismissHintAndToast, 3000);
}

function showError(message: string, retry?: () => void) {
  retryAction = retry ?? null;
  setText(errorMessage, message);
  if (errorRetryButton) errorRetryButton.hidden = !retry;
  if (errorBanner) errorBanner.hidden = false;
}

function clearError() {
  retryAction = null;
  if (errorBanner) errorBanner.hidden = true;
}

function routeStyle(color: string, weight: number, opacity: number): L.PolylineOptions {
  return { color, weight, opacity, lineCap: "round", lineJoin: "round", interactive: false };
}

function containerPointFromEvent(event: PointerEvent) {
  const rect = mapContainer.getBoundingClientRect();
  return L.point(event.clientX - rect.left, event.clientY - rect.top);
}

function getRouteColor(routeId?: string) {
  return networkState.routes.find((route) => route.id === routeId)?.color ?? "#4ce0c3";
}

function createId(prefix: string) {
  return crypto.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function roundCoord(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function setHint(items: string[]) {
  if (hintRow) hintRow.innerHTML = items.map((item) => `<span>${item}</span>`).join("");
  if (hintTimer) window.clearTimeout(hintTimer);
  
  if (items.length > 0) {
    const text = items.join(" · ");
    if (text !== "한 손가락 이동 · 핀치 줌") {
      showToast(text);
    } else {
      hintTimer = window.setTimeout(dismissHintAndToast, 3000);
    }
  }
}

function toFeatureCollection(features: GeoJsonFeature[]) {
  return { type: "FeatureCollection" as const, features } as Parameters<GeoJSON["addData"]>[0];
}

function byId(id: string) {
  return document.querySelector<HTMLElement>(`#${id}`);
}

function setText(element: HTMLElement | null, value: string) {
  if (element) element.textContent = value;
}
