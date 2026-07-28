import L, { type Coords, type GeoJSON, type LatLng, type LatLngExpression, type TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

// =============================================================================
// 도메인 모델
// 지도 위의 선·역·차량기지뿐 아니라 계획, 공사, 운행, 재정, 저장 데이터까지
// 이 파일에서 공유하는 게임 상태의 형태를 한곳에 정의한다.
// =============================================================================

type OverlayKey = "administrative" | "landuse" | "rail";
type LodMode = "overview" | "district" | "build";
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
type ConstructionMode = "bridge" | "tunnel";

type RouteNodeKind = "endpoint" | "control" | "branch" | "merge";

type RouteNode = {
  id: string;
  position: [number, number];
  kind: RouteNodeKind;
};

type RouteSegment = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  coordinates: Array<[number, number]>;
  lengthKm: number;
  terrainImpact: {
    riverCrossings: number;
    mountainSegments: number;
  };
  constructionMode: ConstructionMode;
  constructionCost: number;
  enabled: boolean;
  riverCrossings?: Array<{
    id: string;
    position: [number, number];
    mode: ConstructionMode;
    cost: number;
  }>;
  mountainLengthKm?: number;
  constructionDays?: number;
};

type Branch = {
  id: string;
  name: string;
  junctionNodeId: string;
  terminalNodeId: string;
  segmentIds: string[];
  dispatchWeight: number;
};

type ServicePattern = {
  id: string;
  name: string;
  kind: "local" | "express";
  branchIds: string[];
  enabled: boolean;
  dispatchMode: "equal";
};

type TransportLine = {
  id: string;
  name: string;
  color: string;
  coordinates: Array<[number, number]>;
  lengthKm: number;
  constructionCost: number;
  riverCrossings: number;
  mountainSegments: number;
  riverMode: ConstructionMode;
  disabledSegments?: number[];
  nodes?: RouteNode[];
  segments?: RouteSegment[];
  branches?: Branch[];
  servicePatterns?: ServicePattern[];
  visibility?: "public" | "planning";
  localServiceEnabled?: boolean;
  expressServiceEnabled?: boolean;
  operationPaused?: boolean;
};

type RouteLine = TransportLine;

type Station = {
  id: string;
  name: string;
  position: [number, number];
  demand: number;
  connectedRouteIds: string[];
  routeNodeIds?: string[];
  transferGroupId?: string;
};

type TransferGroup = {
  id: string;
  stationIds: string[];
  distanceM: number;
  transferTimeMin: number;
  congestion: number;
  resistance: number;
  automatic: boolean;
};

type Depot = {
  id: string;
  name: string;
  polygon: Array<[number, number]>;
  areaHa: number;
  capacity: number;
  maintenanceCost: number;
  connectedRouteIds: string[];
  level: number;
  constructionCost?: number;
  constructionDays?: number;
};

type PlanStatus = "draft" | "review" | "insufficient" | "ready" | "partial" | "completed" | "on-hold";
type PlanPriority = "low" | "normal" | "high" | "critical";

type PlannedRoute = {
  id: string;
  name: string;
  color: string;
  coordinates: Array<[number, number]>;
  segments: RouteSegment[];
  completedSegmentIds: string[];
  expectedCost: number;
  constructionDays: number;
  expectedDemand: number;
  expectedRevenue: number;
  transferEffect: number;
  actualExtension?: { routeId: string; atStart: boolean };
};

type PlannedStation = {
  id: string;
  name: string;
  position: [number, number];
  plannedRouteIds: string[];
  actualRouteIds: string[];
  expectedDemand: number;
  completed: boolean;
  actualStationId?: string;
};

type PlannedDepot = {
  id: string;
  name: string;
  polygon: Array<[number, number]>;
  connectedPlannedRouteIds: string[];
  connectedActualRouteIds: string[];
  expectedCost: number;
  constructionDays: number;
  capacity: number;
  completed: boolean;
  actualDepotId?: string;
};

type PlannedTransfer = {
  id: string;
  stationIds: string[];
  actualStationIds?: string[];
  expectedEffect: number;
  completed: boolean;
};

type ManualTransferEndpoint = {
  kind: "actual" | "planned";
  id: string;
};

type ConstructionPlan = {
  id: string;
  name: string;
  cityId: CityId;
  routes: PlannedRoute[];
  stations: PlannedStation[];
  depots: PlannedDepot[];
  transfers: PlannedTransfer[];
  expectedTotalCost: number;
  remainingCost: number;
  expectedConstructionDays: number;
  expectedDemand: number;
  expectedRevenue: number;
  terrainDifficulty: number;
  transferEffect: number;
  createdAt: number;
  priority: PlanPriority;
  notes: string;
  status: PlanStatus;
};

type DiagramPoint = {
  x: number;
  y: number;
};

type MetroDiagramState = {
  autoPositions: Record<string, DiagramPoint>;
  manualPositions: Record<string, DiagramPoint>;
  background: "dark" | "light" | "blueprint";
  showStationNames: boolean;
  showCompanyInfo: boolean;
  selectedRouteId: string;
  layoutVersion: number;
  networkSignature: string;
};

type DiagramShareStation = {
  id: string;
  name: string;
  routeIds: string[];
  position: DiagramPoint;
  transfer: boolean;
  express: boolean;
};

type DiagramShareRoute = {
  id: string;
  name: string;
  color: string;
  stationIds: string[];
};

type MetroDiagramShareData = {
  kind: "metro-diagram";
  shareId: string;
  gameVersion: string;
  cityDataVersion: string;
  requiredExtensions: string[];
  cityId: CityId;
  generatedAt: number;
  network: {
    title: string;
    cityName: string;
    generatedAt: number;
    routeCount: number;
    stationCount: number;
  };
  routes: DiagramShareRoute[];
  stations: DiagramShareStation[];
};

type RouteDesignShareData = {
  kind: "route-design";
  shareId: string;
  gameVersion: string;
  cityDataVersion: string;
  requiredExtensions: string[];
  cityId: CityId;
  generatedAt: number;
  plans: ConstructionPlan[];
};

type GameShareBundle = {
  kind: "draw-gyotong-share";
  shareId: string;
  gameVersion: string;
  cityDataVersion: string;
  requiredExtensions: string[];
  diagram: MetroDiagramShareData;
  routeDesign: RouteDesignShareData;
};

type TrainType = "metro" | "commuter" | "express";
type GameMode = "sandbox" | "career";
type Difficulty = "easy" | "normal" | "hard";
type CityId = "seoul" | "busan" | "daejeon" | "gwangju";

type TrainFleet = {
  id: string;
  routeId: string;
  trainType: TrainType;
  cars: number;
  sets: number;
  capacity: number;
  purchaseCost: number;
  maintenanceCost: number;
};

type ExpressConfig = {
  routeId: string;
  unlocked: boolean;
  enabled: boolean;
  stopStationIds: string[];
  unlockCost: number;
  extraOperatingCost: number;
};

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

type PassengerGroup = {
  id: string;
  originStationId: string;
  destinationStationId: string;
  people: number;
  routeIds: string[];
  distanceKm: number;
  transferResistance: number;
  waitMin: number;
  crowding: number;
  satisfaction: number;
  activeDemand: number;
};

type Loan = {
  id: string;
  principal: number;
  balance: number;
  interestRate: number;
  monthlyPayment: number;
};

type EconomyState = {
  cash: number;
  fare: number;
  autoFare: boolean;
  revenue: number;
  maintenance: number;
  constructionSpent: number;
  trainSpent: number;
  loanBalance: number;
  satisfaction: number;
  demand: number;
};

type DailyStatisticsRecord = {
  day: number;
  revenue: number;
  expenses: number;
  passengers: number;
  satisfaction: number;
  transitShare: number;
  assets: number;
  liabilities: number;
};

type StatisticsState = {
  totalPassengers: number;
  totalLoanRepaid: number;
  dailyRecords: DailyStatisticsRecord[];
};

type ConstructionProjectStatus = "planned" | "scheduled" | "building" | "opening-ready" | "operating";
type ConstructionProjectKind = "route" | "extension" | "branch" | "repair" | "edit" | "station" | "depot" | "plan";

type ConstructionProjectEvent = {
  id: string;
  kind: "delay" | "extra-cost";
  triggerDay: number;
  delayDays?: number;
  extraCost?: number;
  message: string;
  applied: boolean;
};

type ConstructionProject = {
  id: string;
  name: string;
  kind: ConstructionProjectKind;
  status: ConstructionProjectStatus;
  routeIds: string[];
  stationIds: string[];
  depotIds: string[];
  coordinates: Array<[number, number]>;
  startedDay: number;
  durationDays: number;
  elapsedDays: number;
  expectedCompletionDay: number;
  baseCost: number;
  additionalCost: number;
  delayDays: number;
  events: ConstructionProjectEvent[];
  sourcePlanId?: string;
  openedAtDay?: number;
};

type NewsEventKind =
  | "festival"
  | "concert"
  | "sports"
  | "tourism"
  | "new-town"
  | "university"
  | "commercial-growth"
  | "heavy-rain"
  | "heavy-snow"
  | "roadworks"
  | "demand-decline"
  | "operating-cost"
  | "construction-delay"
  | "recession";

type NewsEventAction = "add-service" | "review-area" | "review-fare" | "review-construction";

type NewsEvent = {
  id: string;
  kind: NewsEventKind;
  tone: "opportunity" | "change";
  title: string;
  summary: string;
  regionName: string;
  position: [number, number];
  startedDay: number;
  durationDays: number;
  demandMultiplier: number;
  operatingCostMultiplier: number;
  relatedStationIds: string[];
  relatedRouteIds: string[];
  action: NewsEventAction;
  actionLabel: string;
  read: boolean;
  responsePrepared: boolean;
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
};

type GameSettings = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  performanceMode: "balanced" | "battery";
  reducedMotion: boolean;
  sandboxConstructionTime: boolean;
  autoSaveEnabled: boolean;
  autoSaveIntervalSeconds: 30 | 60 | 180 | 300;
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
  expressConfigs?: ExpressConfig[];
  passengerGroups?: PassengerGroup[];
  loans?: Loan[];
  economy?: EconomyState;
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
  tags?: Record<string, string>;
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
const currentSaveSchemaVersion = 2;
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
  branch?: RouteBranchDraft | null;
  planningBranch?: PlanningBranchDraft | null;
  repair?: RouteRepair | null;
  editHandle?: RouteHandleMove | null;
  connectedRouteIds?: string[];
  connectedPlannedRouteIds?: string[];
  analysis: ConstructionAnalysis;
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
  autoSaveEnabled: true,
  autoSaveIntervalSeconds: 30,
};
const fallbackSaveKey = "draw-gyotong-save-slots-v1";
const gameVersion = "0.4.0";
const cityDataVersion = "korea-cities-1";
const diagramWidth = 1800;
const diagramHeight = 1000;
const diagramGrid = 72;
const defaultDiagramState: MetroDiagramState = {
  autoPositions: {},
  manualPositions: {},
  background: "light",
  showStationNames: true,
  showCompanyInfo: true,
  selectedRouteId: "all",
  layoutVersion: 3,
  networkSignature: "",
};
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

const cityConfigs: Record<CityId, { name: string; center: LatLngExpression; demandMultiplier: number; constructionMultiplier: number; mountainMultiplier: number; riverMultiplier: number; growthMultiplier: number; description: string }> = {
  seoul: {
    name: "서울",
    center: [37.5665, 126.978],
    demandMultiplier: 1.45,
    constructionMultiplier: 1,
    mountainMultiplier: 1,
    riverMultiplier: 1.35,
    growthMultiplier: 1,
    description: "높은 수요, 강 많음",
  },
  busan: {
    name: "부산",
    center: [35.1796, 129.0756],
    demandMultiplier: 1.05,
    constructionMultiplier: 1.25,
    mountainMultiplier: 1.55,
    riverMultiplier: 0.9,
    growthMultiplier: 0.95,
    description: "산 많음, 건설 비용 증가",
  },
  daejeon: {
    name: "대전",
    center: [36.3504, 127.3845],
    demandMultiplier: 0.9,
    constructionMultiplier: 0.95,
    mountainMultiplier: 0.9,
    riverMultiplier: 0.85,
    growthMultiplier: 1.04,
    description: "안정적인 성장",
  },
  gwangju: {
    name: "광주",
    center: [35.1595, 126.8526],
    demandMultiplier: 0.82,
    constructionMultiplier: 0.9,
    mountainMultiplier: 0.95,
    riverMultiplier: 0.85,
    growthMultiplier: 1.12,
    description: "성장형 도시",
  },
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
            <label><span>도시 선택</span><select id="citySelect"></select></label>
            <label><span>게임 모드</span><select id="modeSelect"><option value="sandbox">샌드박스 (자금 무제한)</option><option value="career">커리어 (경영 도전)</option></select></label>
            <label><span>난이도</span><select id="difficultySelect"><option value="easy">쉬움</option><option value="normal" selected>보통</option><option value="hard">어려움</option></select></label>
            <label><span>세이브 이름</span><input id="slotNameInput" value="서울 1호 계획" maxlength="20" placeholder="슬롯 이름을 입력하세요" /></label>
          </div>
          <div class="city-note" id="cityNote">✨ 서울: 높은 수요, 강 많음</div>
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
    
    <!-- LEVEL 1: TOP EXECUTIVE COMMAND HUD -->
    <header class="hud top-header-bar" aria-label="game status bar">
      <div class="hud-brand-pill">
        <span class="hud-live-dot"></span>
        <strong id="cityHudReadout">서울 관제 네트워크</strong>
      </div>

      <div class="top-status-pills" aria-label="game metrics">
        <div id="workspaceModeBar" class="status-pill workspace-mode-pill" aria-label="작업 모드">
          <div class="workspace-mode-tabs" role="tablist" aria-label="상위 작업 모드">
            <button class="workspace-mode-tab active" type="button" data-workspace-mode="management" role="tab" aria-selected="true"><span aria-hidden="true">⌖</span>관리</button>
            <button class="workspace-mode-tab" type="button" data-workspace-mode="planning" role="tab" aria-selected="false"><span aria-hidden="true">✦</span>기획</button>
            <button class="workspace-mode-tab" type="button" data-workspace-mode="construction" role="tab" aria-selected="false"><span aria-hidden="true">▣</span>공사</button>
          </div>
          <strong id="workspaceModeReadout" hidden>관리 모드</strong>
        </div>

        <div class="status-pill cash-pill" title="보유 자금 및 일일 순수익">
          <span class="pill-icon">💵</span>
          <strong id="cashReadout">999,999 억</strong>
          <strong id="dailyNetReadout" class="net-readout negative">-4,500 억</strong>
        </div>

        <div class="status-pill satisfaction-pill" title="시민 승객 만족도">
          <span id="satisfactionIcon" class="pill-icon satisfaction-icon">😊</span>
          <strong id="satisfactionReadout">94 - 매우좋음</strong>
        </div>

        <div class="status-pill history-pill" aria-label="작업 이력">
          <button id="undoButton" class="history-action icon-only" type="button" aria-label="실행 취소" title="실행 취소"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg></button>
          <button id="redoButton" class="history-action icon-only" type="button" aria-label="다시 실행" title="다시 실행"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg></button>
        </div>

        <div class="status-pill clock-pill" aria-label="게임 시간 및 배속">
          <div class="time-readout-wrap">
            <span id="gameDayReadout">4일차</span>
            <strong id="gameClockReadout">오후 06:00</strong>
          </div>
          <div class="time-row" aria-label="time speed">
            <button class="time-button active pause-button" data-speed="0" type="button" aria-label="일시정지">Ⅱ</button>
            <button class="time-button" data-speed="2" type="button">x2</button>
            <button class="time-button" data-speed="4" type="button">x4</button>
            <button class="time-button" data-speed="8" type="button">x8</button>
            <button class="time-button" data-speed="16" type="button">x16</button>
          </div>
        </div>
      </div>

      <div class="top-actions-row">
        <nav class="hud layer-panel" aria-label="map layers">
          <details class="layer-menu">
            <summary aria-label="지도 레이어" title="지도 레이어 설정">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            </summary>
            <div class="layer-options">
              <button class="layer-toggle active" data-layer="rail" aria-pressed="true"><span class="layer-dot rail"></span><span>기존 철도</span></button>
            </div>
          </details>
        </nav>


        <button id="helpButton" class="top-action-btn help-button" type="button" aria-label="도움말" title="도움말">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </button>
        <button id="newsButton" class="top-action-btn news-button" type="button" aria-label="도시 뉴스" title="도시 뉴스">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span id="newsBadge" hidden>0</span>
        </button>
        <button id="menuButton" class="top-action-btn" type="button" aria-label="메뉴" title="메뉴">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>
      </div>
    </header>

    <!-- LEVEL 4: BOTTOM PRIMARY THUMB DOCK -->
    <section class="hud build-panel" aria-label="현재 모드 도구">
      <!-- Construction Tools Group -->
      <div class="tool-group construction-tools">
        <button id="routeTool" class="primary-tool" type="button" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg><span>노선건설</span></button>
        <button id="stationTool" class="primary-tool" type="button" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg><span>역</span></button>
        <button id="transferTool" class="primary-tool" type="button" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg><span>환승</span></button>
        <button id="depotTool" class="primary-tool" type="button" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg><span>기지</span></button>
        <button id="modifyToolsButton" class="primary-tool" type="button" aria-pressed="false" aria-expanded="false" aria-label="수정 도구 열기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><span>수정</span></button>
        <button id="planningModeButton" class="primary-tool planning-mode-button" type="button" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>계획</span></button>
        <button id="editTool" class="primary-tool legacy-edit-tool" type="button" aria-pressed="false" aria-label="노선 경로 수정"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>경로 편집</span></button>
      </div>

      <div class="tool-divider"></div>

      <!-- Management & Shortcuts Group -->
      <div class="tool-group management-tools">
        <button id="selectTool" class="primary-tool workspace-management-tool" type="button" aria-pressed="true" aria-label="지도 탐색"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 3l7 18 3-7 7-3L3 3z"/></svg><span>탐색</span></button>
        <button id="manageLineTool" class="primary-tool workspace-management-tool" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg><span>노선 목록</span></button>
        <button id="manageOperationsTool" class="primary-tool workspace-management-tool" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span>운영 현황</span></button>
        <button id="analysisButton" class="primary-tool workspace-management-tool" type="button" aria-label="운영 분석 열기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-7"/></svg><span>운영 분석</span><em id="analysisBadge" hidden>0</em></button>
        <button id="planOverviewButton" class="primary-tool overview-shortcut" type="button" aria-label="계획 목록 열기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>계획 목록</span></button>
        <button id="constructionOverviewButton" class="primary-tool overview-shortcut" type="button" aria-label="공사 현황 열기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V9l6-4 6 4v12"/><path d="M9 21v-6h6v6"/></svg><span>공사 현황</span></button>
        <button id="manageMapTool" class="primary-tool workspace-management-tool" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg><span>노선도</span></button>
        <button id="diagramToolButton" class="primary-tool diagram-toolbar-button" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg><span>노선도</span></button>
      </div>

    </section>

    <label id="eraserSizeControl" class="hud eraser-size-control" hidden><span>지우개 크기</span><input id="eraserSizeRange" type="range" min="12" max="48" step="4" value="20" aria-label="지우개 크기" /><output id="eraserSizeValue">20</output></label>

    <section id="modifyToolsCard" class="hud modify-tools-card" hidden aria-label="수정 도구">
      <div class="modify-tools-card-heading"><span>MODIFY TOOLS</span><strong>수정 도구</strong></div>
      <div class="modify-tools-grid">
        <button id="eraserTool" class="primary-tool compact danger-tool" type="button" aria-pressed="false" aria-label="노선과 역 철거"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16l10-10 7 7-7 7"/><path d="M6.5 12.5l5 5"/></svg><span>철거</span></button>
        <button id="extendTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="노선 연장"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10"/><path d="M14 8l4 4-4 4"/></svg><span>연장</span></button>
        <button id="branchTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="분기 추가"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 12h4c4 0 4-7 6-7"/><path d="M11 12c4 0 4 7 6 7"/></svg><span>분기</span></button>
        <button id="mergeTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="노선 연결"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 5c5 0 5 7 10 7"/><path d="M7 19c5 0 5-7 10-7"/></svg><span>연결</span></button>
      </div>
    </section>



    <section id="routeSettingsCard" class="hud route-settings-card" hidden aria-label="노선 설정">
      <div class="route-settings-card-heading"><span>ROUTE SETTINGS</span><strong>노선 설정</strong></div>
      <label><span>이름</span><input id="draftRouteNameInput" type="text" maxlength="32" placeholder="자동 이름" autocomplete="off" /></label>
      <label class="route-settings-color-field"><span>색상</span><input id="draftRouteColorInput" type="color" value="#3277ff" aria-label="노선 색상" /></label>
      <button id="saveRouteSettingsButton" class="ops-button primary action-button action-button--setting" type="button"><span class="button-icon" aria-hidden="true">✓</span><span>설정 적용</span></button>
    </section>





    <section class="hud bottom-right">
      <div class="mode-pill" id="modeLabel">지도 탐색</div>
      <div class="hint-row" id="hintRow"><span>한 손가락 이동</span><span>핀치 줌</span></div>
    </section>





    <section id="leftRouteWindow" class="left-route-window" hidden aria-label="노선 목록 창">
      <div class="left-route-header">
        <div class="left-route-title-group">
          <span class="left-route-sub">ROUTE OVERVIEW</span>
          <h3 class="left-route-title">노선 목록</h3>
        </div>
        <button id="closeLeftRouteWindowButton" class="dialog-close compact-close" type="button" aria-label="닫기">×</button>
      </div>

      <div class="left-route-summary">
        <div class="summary-chip"><strong id="leftRouteTotalCount">0개</strong><span>운행 노선</span></div>
        <div class="summary-chip"><strong id="leftRouteTotalKm">0 km</strong><span>총 연장</span></div>
      </div>

      <div id="leftRouteList" class="left-route-list"></div>

      <div class="left-route-footer">
        <button id="leftRouteNewButton" class="left-route-action-btn" type="button">
          <span>＋ 새 노선 건설</span>
        </button>
      </div>
    </section>


    <section class="economy-panel" hidden aria-live="polite">
      <div><span>수요</span><strong id="demandReadout">0</strong></div>
      <label><span>요금</span><input id="fareInput" type="number" min="900" max="4200" step="50" value="1450" /></label>
      <button id="autoFareButton" type="button" class="ops-button active" aria-pressed="true">자동</button>
      <button id="loanButton" type="button" class="ops-button">대출</button>
      <button id="repayButton" type="button" class="ops-button">상환</button>
    </section>



    <section id="tutorialPanel" class="tutorial-panel" hidden aria-live="polite">
      <div class="tutorial-step" id="tutorialStep">01 / 10</div>
      <div class="tutorial-copy"><strong id="tutorialTitle">지도를 움직여 보세요</strong><p id="tutorialText">한 손가락으로 이동하고 두 손가락으로 확대하세요.</p><small id="tutorialFeedback">직접 조작하면 자동으로 다음 단계로 이동합니다.</small></div>
      <div class="tutorial-actions"><button id="tutorialNextButton" type="button">확인</button><button id="tutorialSkipButton" type="button" aria-label="튜토리얼 건너뛰기">×</button></div>
    </section>

    <div id="settingsDialog" class="dialog-backdrop" hidden>
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-label="게임 설정">
        <div class="dialog-heading"><div><span>CONTROL SETTINGS</span><h2>게임 설정</h2></div><button id="closeSettingsButton" class="dialog-close" type="button" aria-label="설정 닫기">×</button></div>
        <label class="setting-row"><span><strong>효과음</strong><small>건설과 조작 피드백</small></span><input id="soundToggle" type="checkbox" checked /></label>
        <label class="setting-row"><span><strong>진동</strong><small>지원 기기에서 촉각 피드백</small></span><input id="hapticsToggle" type="checkbox" checked /></label>
        <label class="setting-row"><span><strong>성능</strong><small>열차 표시와 지도 자원 사용량</small></span><select id="performanceSelect"><option value="balanced">균형</option><option value="battery">절전</option></select></label>
        <label class="setting-row"><span><strong>모션 감소</strong><small>화면 전환과 애니메이션 축소</small></span><input id="reducedMotionToggle" type="checkbox" /></label>
        <label class="setting-row"><span><strong>샌드박스 공사 기간</strong><small>샌드박스에서도 공사와 개통 절차 사용</small></span><input id="sandboxConstructionTimeToggle" type="checkbox" /></label>
        <label class="setting-row"><span><strong>자동 저장</strong><small>현재 슬롯을 설정한 주기로 저장</small></span><input id="autoSaveToggle" type="checkbox" checked /></label>
        <label class="setting-row"><span><strong>자동 저장 주기</strong><small>자동 저장이 켜졌을 때 적용</small></span><select id="autoSaveIntervalSelect"><option value="30">30초</option><option value="60">1분</option><option value="180">3분</option><option value="300">5분</option></select></label>
        <div class="settings-footer"><span id="cacheReadout">지도 캐시 확인 중</span><button id="clearCacheButton" class="ops-button" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>캐시 정리</span></button></div>
      </section>
    </div>

    <div id="financeDialog" class="dialog-backdrop" hidden>
      <section class="finance-dialog" role="dialog" aria-modal="true" aria-label="자금 및 재정 관리">
        <div class="dialog-heading">
          <div>
            <span>FINANCIAL MANAGEMENT</span>
            <h2>자금 및 재정 관리</h2>
          </div>
          <button id="closeFinanceButton" class="dialog-close" type="button" aria-label="재정 관리 닫기">×</button>
        </div>

        <div class="finance-stats-grid">
          <div class="finance-card">
            <span>보유 자금</span>
            <strong id="financeCashReadout" class="finance-val positive">0 억</strong>
          </div>
          <div class="finance-card">
            <span>오늘의 순수익</span>
            <strong id="financeDailyNetReadout" class="finance-val">0 억</strong>
          </div>
          <div class="finance-card">
            <span>대출 잔액</span>
            <strong id="financeLoanReadout" class="finance-val negative">0 억</strong>
          </div>
          <div class="finance-card">
            <span>일일 수송 수요</span>
            <strong id="financeDemandReadout" class="finance-val">0 명</strong>
          </div>
        </div>

        <div class="finance-section">
          <h3>대출 및 금융 관리</h3>
          <p class="finance-desc">사업 확장을 위해 금융 대출을 실행하거나 기존 대출금을 상환합니다.</p>
          <div class="finance-actions-row">
            <button id="dialogLoanButton" type="button" class="finance-btn loan-btn">💵 대출 받기 (+300억)</button>
            <button id="dialogRepayButton" type="button" class="finance-btn repay-btn">🏦 대출 상환 (-300억)</button>
          </div>
        </div>

        <div class="finance-section">
          <h3>도시 노선 운영 현황</h3>
          <p class="finance-desc">각 노선의 운행 상태, 승객 수송 통계, 운행 주기를 한눈에 확인합니다.</p>
          <button id="openStatisticsFromFinanceButton" type="button" class="finance-nav-btn">
            📊 노선별 운영 현황 보러가기
          </button>
        </div>
      </section>
    </div>

    <div id="errorBanner" class="error-banner" hidden role="alert"><span id="errorMessage">일시적인 오류가 발생했습니다.</span><button id="errorRetryButton" type="button">재시도</button><button id="errorDismissButton" type="button" aria-label="닫기">×</button></div>
    <div id="toast" class="toast" hidden role="status"></div>

    <section id="constructionPreviewPanel" class="construction-preview-panel" hidden aria-live="polite">
      <header>
        <div><span>CONSTRUCTION REVIEW</span><strong id="constructionPreviewTitle">건설 미리보기</strong></div>
        <button id="toggleConstructionPreviewButton" type="button" aria-expanded="true" aria-label="비용 정보 접기">⌃</button>
      </header>
      <div id="constructionPreviewDetails" class="construction-preview-details">
        <div class="construction-summary">
          <div><span>예상 총비용</span><strong id="previewTotalCost">0억</strong></div>
          <div><span>건설 후 잔액</span><strong id="previewBalance">0억</strong></div>
          <div><span>예상 공기</span><strong id="previewDuration">0일</strong></div>
        </div>
        <dl class="construction-breakdown">
          <div><dt>총 길이</dt><dd id="previewLength">0m</dd></div>
          <div><dt>기본 건설비</dt><dd id="previewBaseCost">0억</dd></div>
          <div><dt>산악 구간</dt><dd id="previewMountain">없음</dd></div>
          <div><dt>강 통과</dt><dd id="previewRiverCount">없음</dd></div>
          <div><dt>역 연결/설치</dt><dd id="previewStationCount">0개</dd></div>
          <div><dt>차량기지 연결</dt><dd id="previewDepotConnection">미연결</dd></div>
        </dl>
        <div id="riverChoiceList" class="river-choice-list" hidden></div>
        <div id="constructionWarnings" class="construction-warnings"></div>
      </div>
      <footer>
        <button id="cancelConstructionButton" type="button">취소</button>
        <button id="confirmConstructionButton" type="button" disabled>건설 확정</button>
      </footer>
    </section>

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
          <span>OPERATIONS INTELLIGENCE</span>
          <div><h2>운영 분석 보고서</h2><strong id="analysisUpdatedAt">게임 0일차</strong></div>
          <p>현재 운영 데이터에 근거한 추정 제안입니다. 실행 전 비용과 효과를 직접 확인할 수 있습니다.</p>
        </div>
        <div class="analysis-header-actions">
          <button id="refreshAnalysisButton" type="button">다시 분석</button>
          <button id="closeAnalysisButton" class="analysis-close" type="button" aria-label="운영 분석 닫기">×</button>
        </div>
      </header>
      <div class="analysis-body">
        <aside class="analysis-summary">
          <div class="analysis-score-card">
            <span>NETWORK HEALTH</span>
            <strong id="analysisHealthScore">100</strong>
            <em id="analysisHealthLabel">안정적</em>
          </div>
          <div class="analysis-summary-grid">
            <div><span>긴급</span><strong id="analysisCriticalCount">0</strong></div>
            <div><span>주의</span><strong id="analysisWarningCount">0</strong></div>
            <div><span>참고</span><strong id="analysisInfoCount">0</strong></div>
          </div>
          <label class="analysis-filter"><span>표시 항목</span><select id="analysisFilter">
            <option value="active">현재 제안</option>
            <option value="later">나중에 보기</option>
            <option value="all">전체</option>
          </select></label>
          <div class="analysis-principle"><strong>결정은 플레이어가 합니다</strong><span>이 보고서는 자동으로 자금을 사용하거나 노선을 변경하지 않습니다.</span></div>
        </aside>
        <div class="analysis-report">
          <section class="analysis-section urgent">
            <div class="analysis-section-title"><div><span>PRIORITY ACTIONS</span><h3>우선 확인</h3></div><strong id="analysisUrgentLabel"></strong></div>
            <div id="analysisUrgentList" class="analysis-list"></div>
          </section>
          <section class="analysis-section">
            <div class="analysis-section-title"><div><span>DAILY OPERATIONS REPORT</span><h3>정기 운영 보고서</h3></div><strong>긴급하지 않은 제안을 묶어 표시합니다</strong></div>
            <div id="analysisReportList" class="analysis-list"></div>
          </section>
          <div id="analysisEmptyState" class="analysis-empty" hidden><strong>현재 제안이 없습니다</strong><span>운영 지표가 기준 범위 안에 있습니다. 운행을 계속하면 변화 추세를 분석합니다.</span></div>
        </div>
      </div>
    </section>


    <div id="stationManagerDialog" class="dialog-backdrop" hidden>
      <section class="station-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="stationManagerTitle">
        <header class="station-manager-header">
          <div><span>STATION MANAGEMENT</span><h2 id="stationManagerTitle">역 관리</h2></div>
          <button id="closeStationManagerButton" class="dialog-close" type="button" aria-label="역 관리 닫기">×</button>
        </header>
        <div id="stationManagerContent" class="station-manager-content"></div>
      </section>
    </div>

    <div id="depotManagerDialog" class="dialog-backdrop" hidden>
      <section class="depot-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="depotManagerTitle">
        <header class="depot-manager-header">
          <div><span>DEPOT MANAGEMENT</span><h2 id="depotManagerTitle">차량기지 관리</h2></div>
          <button id="closeDepotManagerButton" class="dialog-close" type="button" aria-label="차량기지 관리 닫기">×</button>
        </header>
        <div id="depotManagerContent" class="depot-manager-content"></div>
      </section>
    </div>

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
        <div class="dialog-heading">
          <div><span>NETWORK PLANNING</span><h2 id="planningDialogTitle">계획 관리</h2></div>
          <button id="closePlanningButton" class="dialog-close" type="button" aria-label="계획 관리 닫기">×</button>
        </div>
        <div class="planning-toolbar">
          <select id="activePlanSelect" aria-label="활성 계획"></select>
          <button id="newPlanButton" type="button">새 계획</button>
          <button id="duplicatePlanButton" type="button">복제</button>
          <button id="deletePlanButton" type="button">삭제</button>
        </div>
        <div class="planning-layout">
          <section class="planning-editor">
            <label><span>계획 이름</span><input id="planNameInput" maxlength="32" /></label>
            <div class="planning-field-row">
              <label><span>상태</span><select id="planStatusSelect">
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
            <label><span>메모</span><textarea id="planNotesInput" rows="3" maxlength="500" placeholder="건설 목적, 단계별 추진 사항 등을 기록하세요"></textarea></label>
            <div id="planSummary" class="plan-summary"></div>
            <div id="planAssetList" class="plan-asset-list"></div>
            <div class="planning-actions">
              <button id="savePlanButton" type="button">계획 저장</button>
              <button id="convertPlanButton" type="button">실제 건설 전환</button>
            </div>
          </section>
          <section class="plan-comparison">
            <div class="section-title"><span>PLAN COMPARE</span><strong>계획 비교</strong></div>
            <div id="planComparisonList"></div>
          </section>
        </div>
      </section>
    </div>

    <div id="planConversionDialog" class="dialog-backdrop" hidden>
      <section class="plan-conversion-dialog" role="dialog" aria-modal="true" aria-labelledby="planConversionTitle">
        <div class="dialog-heading">
          <div><span>BUILD FROM PLAN</span><h2 id="planConversionTitle">실제 건설 전환</h2></div>
          <button id="closePlanConversionButton" class="dialog-close" type="button" aria-label="실제 건설 전환 닫기">×</button>
        </div>
        <p class="conversion-help">건설할 노선 구간과 시설을 선택하세요. 선택하지 않은 항목은 계획에 그대로 남습니다.</p>
        <div id="planConversionItems" class="plan-conversion-items"></div>
        <div id="planConversionSummary" class="plan-conversion-summary"></div>
        <div class="conversion-actions">
          <button id="fundPlanWithLoanButton" type="button" hidden>대출 30,000억 받기</button>
          <button id="cancelPlanConversionButton" type="button">취소</button>
          <button id="confirmPlanConversionButton" class="action-button action-button--build" type="button"><span class="button-icon" aria-hidden="true">▶</span><span>선택 항목 건설</span></button>
        </div>
      </section>
    </div>

    <div id="routeChoiceDialog" class="dialog-backdrop" hidden>
      <section class="route-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="routeChoiceTitle">
        <div class="dialog-heading"><div><span>ROUTE SELECT</span><h2 id="routeChoiceTitle">어느 노선을 선택할까요?</h2></div><button id="closeRouteChoiceButton" class="dialog-close" type="button" aria-label="닫기">×</button></div>
        <div id="routeChoiceList" class="route-choice-list"></div>
      </section>
    </div>

    <section id="rightLineControlCard" class="right-line-control-card" hidden aria-label="노선 관리 카드">
      <div class="right-line-header">
        <div class="right-line-title-group">
          <span class="right-line-sub">LINE CONTROL</span>
          <h3 id="lineManagerTitle" class="right-line-title">노선 관리</h3>
        </div>
        <button id="closeLineManagerButton" class="dialog-close compact-close" type="button" aria-label="닫기">×</button>
      </div>

      <div class="right-line-body">
        <!-- Floating Line Badge Card (선택 노선 정보 카드) -->
        <div id="selectedLineBadgeHeader" class="line-identity-card">
          <span id="selectedLineColor" class="selected-line-badge-dot"></span>
          <div class="line-identity-text">
            <strong id="selectedLineTitle">노선 선택</strong>
            <span id="selectedLineMeta">지도를 눌러 노선을 선택하세요</span>
          </div>
        </div>

        <div class="line-metrics-grid" aria-label="노선 운행 상태">
          <div class="metric-chip"><span>배차</span><strong id="headwayReadout">-</strong></div>
          <div class="metric-chip"><span>혼잡</span><strong id="crowdingReadout">-</strong></div>
          <div class="metric-chip"><span>대기</span><strong id="waitReadout">-</strong></div>
        </div>
        <label class="manager-field"><span>노선 이름</span><input id="lineNameInput" maxlength="28" /></label>
        <label class="manager-field"><span>노선 색상</span><input id="lineColorInput" type="color" /></label>
        <label class="manager-field"><span>공개 상태</span><select id="lineVisibilitySelect"><option value="public">공개 노선</option><option value="planning">계획 노선</option></select></label>
        <label class="manager-field"><span>기본 요금 설정</span>
          <div class="line-fare-wrap">
            <input id="lineFareInput" type="number" min="900" max="4200" step="50" value="1450" /> 원
            <button id="lineAutoFareButton" type="button" class="ops-button active">자동 요금</button>
          </div>
        </label>
        <div class="manager-toggles">
          <label><input id="localServiceToggle" type="checkbox" /><span>일반 운행</span></label>
          <label><input id="expressServiceToggle" type="checkbox" /><span>급행 운행</span></label>
          <label><input id="operationPausedToggle" type="checkbox" /><span>운행 일시중지</span></label>
        </div>
        <div class="manager-summary" id="lineManagerSummary"></div>

        <div class="right-line-action-box">
          <button id="openTrainManagerFromLineCardButton" type="button" class="open-train-manager-btn">
            🚆 열차 운행 및 편성 관리
          </button>
        </div>
      </div>

      <div class="right-line-footer">
        <button id="deleteLineManagerButton" class="right-line-delete-btn" type="button"><span class="button-icon" aria-hidden="true">⌫</span><span>노선·역 철거</span></button>
        <button id="saveLineManagerButton" class="right-line-save-btn" type="button"><span class="button-icon" aria-hidden="true">✓</span><span>변경 저장</span></button>
      </div>
    </section>

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

    <div id="decisionDialog" class="dialog-backdrop" hidden>
      <section class="decision-dialog" role="alertdialog" aria-modal="true" aria-labelledby="decisionTitle">
        <div class="decision-dialog-header">
          <div class="decision-icon-badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <span class="decision-kicker">WARNING ACTION</span>
            <h2 id="decisionTitle">작업 확인</h2>
          </div>
        </div>
        <p id="decisionMessage" class="decision-message-body"></p>
        <div class="decision-warning" id="decisionWarning" hidden></div>
        <div class="dialog-actions decision-actions">
          <button id="decisionCancelButton" class="decision-btn cancel-btn" type="button">취소</button>
          <button id="decisionConfirmButton" class="decision-btn confirm-btn" type="button">확인</button>
        </div>
      </section>
    </div>

    <div id="mergeDialog" class="dialog-backdrop" hidden>
      <section class="merge-dialog" role="dialog" aria-modal="true" aria-labelledby="mergeTitle">
        <div class="dialog-heading"><div><span>CONNECT LINES</span><h2 id="mergeTitle">노선 연결</h2></div><button id="closeMergeButton" class="dialog-close" type="button" aria-label="닫기">×</button></div>
        <p id="mergeDescription"></p>
        <label class="manager-field"><span>병합 노선 이름</span><select id="mergeNameSelect"></select></label>
        <label class="manager-field"><span>병합 노선 색상</span><select id="mergeColorSelect"></select></label>
        <div class="dialog-actions"><button id="confirmMergeButton" type="button">병합 확정</button><button id="cancelMergeButton" type="button">취소</button></div>
      </section>
    </div>

    <div id="inGameMenuDialog" class="dialog-backdrop" hidden>
      <section class="ingame-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="ingameMenuTitle">
        <div class="dialog-heading">
          <div><span>SYSTEM MENU</span><h2 id="ingameMenuTitle">시스템 메뉴</h2></div>
          <button id="closeInGameMenuButton" class="dialog-close" type="button" aria-label="닫기">×</button>
        </div>

        <div class="ingame-menu-body">
          <!-- Horizontal Save / Load Pill Box -->
          <div class="save-load-horizontal-box">
            <button id="menuSaveTabButton" class="save-load-tab-btn active" type="button"><span class="menu-action-icon" aria-hidden="true">💾</span>저장</button>
            <button id="menuLoadTabButton" class="save-load-tab-btn" type="button"><span class="menu-action-icon" aria-hidden="true">📂</span>불러오기</button>
          </div>

          <div id="menuSaveTabContent" class="save-tab-pane">
            <div class="menu-save-info">
              <span class="save-title">💾 진행 상황 저장</span>
              <span class="save-sub" id="menuSaveStatusReadout">현재 슬롯에 진행 상황을 저장합니다</span>
            </div>
            <button id="menuQuickSaveButton" class="menu-primary-save-btn" type="button"><span class="menu-action-icon" aria-hidden="true">💾</span>저장하기</button>
          </div>

          <div id="menuLoadTabContent" class="save-tab-pane" hidden>
            <div class="menu-save-info">
              <span class="save-title">📂 저장된 슬롯 목록</span>
              <span class="save-sub">불러올 저장 슬롯을 선택하세요</span>
            </div>
            <div id="menuSlotList" class="menu-slot-list"></div>
          </div>

          <div class="menu-secondary-actions">
            <button id="menuOpenSettingsButton" class="menu-settings-btn" type="button">
              <span class="menu-action-icon" aria-hidden="true">⚙</span><span>환경 설정</span>
            </button>
          </div>

          <div class="menu-footer-row">
            <button id="menuReturnTitleButton" class="menu-footer-btn title-btn" type="button"><span class="menu-action-icon" aria-hidden="true">⌂</span>메인 화면으로</button>
            <button id="menuResumeGameButton" class="menu-footer-btn resume-btn" type="button"><span class="menu-action-icon" aria-hidden="true">▶</span>게임 계속하기</button>
          </div>
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
  minZoom: 7,
  maxZoom: 18,
  preferCanvas: true,
  inertia: true,
  inertiaDeceleration: 2800,
  wheelPxPerZoomLevel: 72,
  zoomAnimation: true,
  markerZoomAnimation: false,
  touchZoom: "center",
});

const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  subdomains: ["a", "b", "c"],
  maxZoom: 19,
  crossOrigin: true,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 3,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const terrainLayer = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  subdomains: ["a", "b", "c"],
  maxZoom: 17,
  opacity: 0.38,
  crossOrigin: true,
  updateWhenIdle: true,
  keepBuffer: 2,
});

const railLayer = L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", {
  subdomains: ["a", "b", "c"],
  maxZoom: 19,
  opacity: 0.72,
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

const facilityInteractionPane = map.createPane("facilityInteractionPane");
facilityInteractionPane.style.zIndex = "690";

const routeLayer = L.layerGroup().addTo(map);
const constructionLayer = L.layerGroup().addTo(map);
const planLayer = L.layerGroup().addTo(map);
const stationLayer = L.layerGroup().addTo(map);
const depotLayer = L.layerGroup().addTo(map);
const trainLayer = L.layerGroup().addTo(map);
const previewLayer = L.layerGroup().addTo(map);
const depotGuideLayer = L.layerGroup().addTo(map);
const repairGuideLayer = L.layerGroup().addTo(map);
const editGuideLayer = L.layerGroup().addTo(map);
const layers: Record<OverlayKey, TileLayer | GeoJSON> = {
  administrative: adminLayer,
  landuse: landuseLayer,
  rail: railLayer,
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
const demandReadout = byId("demandReadout");
const cashPill = document.querySelector<HTMLElement>(".cash-pill");
const financeDialog = byId("financeDialog");
const closeFinanceButton = byId("closeFinanceButton");
const financeCashReadout = byId("financeCashReadout");
const financeDailyNetReadout = byId("financeDailyNetReadout");
const financeLoanReadout = byId("financeLoanReadout");
const financeDemandReadout = byId("financeDemandReadout");
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
const slotNameInput = document.querySelector<HTMLInputElement>("#slotNameInput");
const cityNote = byId("cityNote");
const newGameButton = document.querySelector<HTMLButtonElement>("#newGameButton");
const continueButton = document.querySelector<HTMLButtonElement>("#continueButton");
const slotList = byId("slotList");
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
const helpButton = document.querySelector<HTMLButtonElement>("#helpButton");
const settingsDialog = byId("settingsDialog");
const closeSettingsButton = document.querySelector<HTMLButtonElement>("#closeSettingsButton");
const soundToggle = document.querySelector<HTMLInputElement>("#soundToggle");
const hapticsToggle = document.querySelector<HTMLInputElement>("#hapticsToggle");
const performanceSelect = document.querySelector<HTMLSelectElement>("#performanceSelect");
const reducedMotionToggle = document.querySelector<HTMLInputElement>("#reducedMotionToggle");
const sandboxConstructionTimeToggle = document.querySelector<HTMLInputElement>("#sandboxConstructionTimeToggle");
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
const draftRouteNameInput = document.querySelector<HTMLInputElement>("#draftRouteNameInput");
const draftRouteColorInput = document.querySelector<HTMLInputElement>("#draftRouteColorInput");
const saveRouteSettingsButton = document.querySelector<HTMLButtonElement>("#saveRouteSettingsButton");
const operationRouteSelect = document.querySelector<HTMLSelectElement>("#operationRouteSelect");
const trainTypeSelect = document.querySelector<HTMLSelectElement>("#trainTypeSelect");
const carCountInput = document.querySelector<HTMLInputElement>("#carCountInput");
const setCountInput = document.querySelector<HTMLInputElement>("#setCountInput");
const buyTrainButton = document.querySelector<HTMLButtonElement>("#buyTrainButton");
const expressButton = document.querySelector<HTMLButtonElement>("#expressButton");
const analysisButton = document.querySelector<HTMLButtonElement>("#analysisButton");
const analysisBadge = byId("analysisBadge");
const statisticsButton = document.querySelector<HTMLButtonElement>("#statisticsButton");
const newsButton = document.querySelector<HTMLButtonElement>("#newsButton");
const newsBadge = byId("newsBadge");
const guideButton = document.querySelector<HTMLButtonElement>("#guideButton");
const timeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".time-button"));
const workspaceModeReadout = byId("workspaceModeReadout");
const workspaceModeTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".workspace-mode-tab"));
const selectTool = document.querySelector<HTMLButtonElement>("#selectTool");
const manageLineTool = document.querySelector<HTMLButtonElement>("#manageLineTool");
const manageOperationsTool = document.querySelector<HTMLButtonElement>("#manageOperationsTool");
const manageMapTool = document.querySelector<HTMLButtonElement>("#manageMapTool");
const routeTool = document.querySelector<HTMLButtonElement>("#routeTool");
const modifyToolsButton = document.querySelector<HTMLButtonElement>("#modifyToolsButton");
const modifyToolsCard = byId("modifyToolsCard");
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
const toggleConstructionPreviewButton = document.querySelector<HTMLButtonElement>("#toggleConstructionPreviewButton");
const constructionPreviewDetails = byId("constructionPreviewDetails");
const previewTotalCost = byId("previewTotalCost");
const previewBalance = byId("previewBalance");
const previewDuration = byId("previewDuration");
const previewLength = byId("previewLength");
const previewBaseCost = byId("previewBaseCost");
const previewMountain = byId("previewMountain");
const previewRiverCount = byId("previewRiverCount");
const previewStationCount = byId("previewStationCount");
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
const fundPlanWithLoanButton = document.querySelector<HTMLButtonElement>("#fundPlanWithLoanButton");
const confirmPlanConversionButton = document.querySelector<HTMLButtonElement>("#confirmPlanConversionButton");
const layerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".layer-toggle"));
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
const lineVisibilitySelect = document.querySelector<HTMLSelectElement>("#lineVisibilitySelect");
const localServiceToggle = document.querySelector<HTMLInputElement>("#localServiceToggle");
const expressServiceToggle = document.querySelector<HTMLInputElement>("#expressServiceToggle");
const operationPausedToggle = document.querySelector<HTMLInputElement>("#operationPausedToggle");
const lineManagerSummary = byId("lineManagerSummary");
const decisionDialog = byId("decisionDialog");
const decisionMessage = byId("decisionMessage");
const decisionWarning = byId("decisionWarning");
const decisionConfirmButton = document.querySelector<HTMLButtonElement>("#decisionConfirmButton");
const decisionCancelButton = document.querySelector<HTMLButtonElement>("#decisionCancelButton");
const mergeDialog = byId("mergeDialog");
const mergeDescription = byId("mergeDescription");
const mergeNameSelect = document.querySelector<HTMLSelectElement>("#mergeNameSelect");
const mergeColorSelect = document.querySelector<HTMLSelectElement>("#mergeColorSelect");
const confirmMergeButton = document.querySelector<HTMLButtonElement>("#confirmMergeButton");
const cancelMergeButton = document.querySelector<HTMLButtonElement>("#cancelMergeButton");
const closeMergeButton = document.querySelector<HTMLButtonElement>("#closeMergeButton");

let routes: RouteLine[] = [];
let stations: Station[] = [];
let transfers: TransferGroup[] = [];
let depots: Depot[] = [];
let plans: ConstructionPlan[] = [];
let diagramState: MetroDiagramState = { ...defaultDiagramState, autoPositions: {}, manualPositions: {} };
let analysisState: OperationAnalysisState = { ...defaultAnalysisState, demandHistory: [], suggestions: [], decisions: {} };
let statisticsState: StatisticsState = { ...defaultStatisticsState, dailyRecords: [] };
let constructionProjects: ConstructionProject[] = [];
let newsEvents: NewsEvent[] = [];
let trainFleets: TrainFleet[] = [];
let expressConfigs: ExpressConfig[] = [];
let passengerGroups: PassengerGroup[] = [];
let loans: Loan[] = [];
let economy: EconomyState = { ...defaultEconomy };
let currentMeta: GameMeta = createDefaultMeta();
let slotSummaries: SaveSlotSummary[] = [];
let undoStack: SaveState[] = [];
let redoStack: SaveState[] = [];
let overpassAbort: AbortController | null = null;
let lastOverpassKey = "";
let debounceTimer = 0;
let selectedTrainFleetId: string | null = null;
let selectedTrainSetNumber: number | null = null;
let selectedColor = routeColors[0];
let draftRouteName = "";
let hasDraftRouteSettings = false;
let eraserRadiusPx = 20;
let activeTool: ToolMode = "pan";
let workspaceMode: WorkspaceMode = "management";
document.body.dataset.workspaceMode = workspaceMode;
let activePointerId: number | null = null;
let rawDrawPoints: L.Point[] = [];
let previewPolyline: L.Polyline | null = null;
let previewPolygon: L.Polygon | null = null;
let activeExtension: RouteExtension | null = null;
let activeRepair: RouteRepair | null = null;
let activeBranch: RouteBranchDraft | null = null;
let activePlanningContinuation: PlanningRouteContinuation | null = null;
let activeHandleMove: RouteHandleMove | null = null;
let handlePreviewCoordinates: Array<[number, number]> | null = null;
let deleteAnchor: RouteDeleteAnchor | null = null;
let plannedDeleteAnchor: PlannedRouteDeleteAnchor | null = null;
let activePlanningBranch: PlanningBranchDraft | null = null;
let plannedMergeFirstEndpoint: PlannedRouteMergeEndpoint | null = null;
let mergeFirstEndpoint: RouteMergeEndpoint | null = null;
let pendingMerge: PendingMerge | null = null;
let selectedRouteId: string | null = null;
let planningMode = false;
let activePlanId: string | null = null;
let replacingPlannedRouteId: string | null = null;
let selectedPlannedStationIds: string[] = [];
let selectedManualTransferEndpoints: ManualTransferEndpoint[] = [];
let diagramDrag: { stationId: string; pointerId: number } | null = null;
let pendingDecision: (() => void) | null = null;
let constructionDraft: ConstructionDraft | null = null;
let constructionPreviewCollapsed = false;
let knownObstacles: Obstacle[] = [];
let selectedTransferStationIds: string[] = [];
let selectedDepotId: string | null = null;
let selectedDepotManagerId: string | null = null;

let selectedStationManagerId: string | null = null;
let selectedOperationRouteId = "";
let simSpeed = 0;
let simMinutes = 360;
let simDayAccumulator = 0;
let activeStatisticsTab: "overview" | "routes" | "stations" | "city" = "overview";
let selectedStatisticsRouteId = "";
let selectedStatisticsStationId = "";
let lastFrameTime = performance.now();
let autoSaveTimer = 0;
let settings: GameSettings = loadSettings();
let audioContext: AudioContext | null = null;
let toastTimer = 0;
let lastTrainRender = 0;
let lastHudClockUpdate = 0;
let lastMapRenderLod: LodMode = getLodMode(map.getZoom());
let loadingComplete = false;
let retryAction: (() => void) | null = null;
let tileErrorReported = false;
const trainMarkers = new Map<string, L.Marker>();

const mapContainer = map.getContainer();
mapContainer.addEventListener("pointerdown", onPointerDown, { passive: false });
mapContainer.addEventListener("pointermove", onPointerMove, { passive: false });
mapContainer.addEventListener("pointerup", onPointerUp, { passive: false });
mapContainer.addEventListener("pointercancel", cancelActiveDrawing, { passive: false });

map.whenReady(() => {
  railLayer.addTo(map);
  initializeGameShell();
  renderAll();
  updateLod();
  updateDynamicLayers();
  prefetchNearbyTiles(baseLayer);
  requestAnimationFrame(tickSimulation);
  updateLoadingProgress(52, "기본 지도를 불러오고 있습니다");
});

baseLayer.on("load", () => finishLoading());
baseLayer.on("tileerror", () => {
  if (tileErrorReported) return;
  tileErrorReported = true;
  showToast("일부 지도 타일을 불러오지 못했습니다. 캐시 지도를 사용합니다.");
  window.setTimeout(() => {
    tileErrorReported = false;
  }, 12000);
});
window.setTimeout(() => finishLoading(), 3500);

map.on("zoomend moveend", (event) => {
  updateLod();
  const nextLod = getLodMode(map.getZoom());
  if (event.type === "zoomend" && nextLod !== lastMapRenderLod) renderAll(selectedRouteId ?? undefined);
  else if (event.type === "zoomend") {
    renderRoutes(selectedRouteId ?? undefined);
    renderStations();
    renderTrains();
    if (activeTool === "edit") renderEditHandles();
  }
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    updateDynamicLayers();
  }, 220);
});
map.on("dragend", () => recordTutorialSignal("mapMoved"));
map.on("zoomend", () => recordTutorialSignal("mapZoomed"));

routeTool?.addEventListener("click", () => setTool(activeTool === "route" ? "pan" : "route"));
modifyToolsButton?.addEventListener("click", () => {
  if (!modifyToolsCard) return;
  modifyToolsCard.hidden = !modifyToolsCard.hidden;
  const expanded = !modifyToolsCard.hidden;
  modifyToolsButton.setAttribute("aria-expanded", String(expanded));
  modifyToolsButton.setAttribute("aria-pressed", String(expanded));
});
document.addEventListener("pointerdown", (event) => {
  if (!modifyToolsCard || modifyToolsCard.hidden) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (modifyToolsCard.contains(target) || modifyToolsButton?.contains(target)) return;
  modifyToolsCard.hidden = true;
  modifyToolsButton?.setAttribute("aria-expanded", "false");
  modifyToolsButton?.setAttribute("aria-pressed", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !modifyToolsCard || modifyToolsCard.hidden) return;
  modifyToolsCard.hidden = true;
  modifyToolsButton?.setAttribute("aria-expanded", "false");
  modifyToolsButton?.setAttribute("aria-pressed", "false");
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
constructionManagerDialog?.addEventListener("click", (event) => {
  if (event.target === constructionManagerDialog) closeConstructionManager();
});
constructionProjectList?.addEventListener("click", handleConstructionManagerClick);
closePlanningButton?.addEventListener("click", closePlanningDialog);
planningDialog?.addEventListener("click", (event) => {
  if (event.target === planningDialog) closePlanningDialog();
});
activePlanSelect?.addEventListener("change", () => {
  activePlanId = activePlanSelect.value || null;
  renderPlanningDialog();
  renderAll();
});
newPlanButton?.addEventListener("click", createNewPlan);
duplicatePlanButton?.addEventListener("click", duplicateActivePlan);
deletePlanButton?.addEventListener("click", deleteActivePlan);
savePlanButton?.addEventListener("click", saveActivePlanMetadata);
convertPlanButton?.addEventListener("click", openPlanConversionDialog);
closePlanConversionButton?.addEventListener("click", closePlanConversionDialog);
cancelPlanConversionButton?.addEventListener("click", closePlanConversionDialog);
planConversionDialog?.addEventListener("click", (event) => {
  if (event.target === planConversionDialog) closePlanConversionDialog();
});
planConversionItems?.addEventListener("change", handlePlanConversionSelectionChange);
fundPlanWithLoanButton?.addEventListener("click", fundPlanWithLoan);
confirmPlanConversionButton?.addEventListener("click", confirmPlanConversion);
undoButton?.addEventListener("click", undo);
redoButton?.addEventListener("click", redo);
toggleConstructionPreviewButton?.addEventListener("click", toggleConstructionPreview);
cancelConstructionButton?.addEventListener("click", cancelConstructionDraft);
confirmConstructionButton?.addEventListener("click", confirmConstructionDraft);
manageLineButton?.addEventListener("click", openLineManager);
selectedLineColor?.addEventListener("click", openLineManager);
lineAutoFareButton?.addEventListener("click", () => {
  economy = { ...economy, autoFare: !economy.autoFare };
  if (economy.autoFare) economy.fare = calculateAutoFare();
  if (lineFareInput) lineFareInput.value = String(economy.fare);
  if (lineAutoFareButton) {
    lineAutoFareButton.classList.toggle("active", economy.autoFare);
    lineAutoFareButton.textContent = economy.autoFare ? "자동 요금 적용 중" : "수동 요금";
  }
  persistState();
  updateEconomyHud();
});
closeLineButton?.addEventListener("click", () => selectRoute(null));
closeRouteChoiceButton?.addEventListener("click", closeRouteChoice);
routeChoiceDialog?.addEventListener("click", (event) => {
  if (event.target === routeChoiceDialog) closeRouteChoice();
});
closeLineManagerButton?.addEventListener("click", () => {
  closeLineManager();
  selectRoute(null);
});
cancelLineManagerButton?.addEventListener("click", () => {
  closeLineManager();
  selectRoute(null);
});
openTrainManagerFromLineCardButton?.addEventListener("click", openTrainManagerModal);
closeTrainManagerButton?.addEventListener("click", closeTrainManagerModal);
trainManagerDialog?.addEventListener("click", (event) => {
  if (event.target === trainManagerDialog) closeTrainManagerModal();
});
saveLineManagerButton?.addEventListener("click", saveLineManager);
deleteLineManagerButton?.addEventListener("click", requestWholeLineDemolition);
decisionCancelButton?.addEventListener("click", closeDecisionDialog);
decisionConfirmButton?.addEventListener("click", () => {
  const action = pendingDecision;
  closeDecisionDialog();
  action?.();
});
mergeDialog?.addEventListener("click", (event) => {
  if (event.target === mergeDialog) closeMergeDialog();
});
closeMergeButton?.addEventListener("click", closeMergeDialog);
cancelMergeButton?.addEventListener("click", closeMergeDialog);
confirmMergeButton?.addEventListener("click", confirmRouteMerge);
operationRouteSelect?.addEventListener("change", () => {
  selectedOperationRouteId = operationRouteSelect.value;
  updateExpressButton();
  renderAll(selectedOperationRouteId);
});
cashPill?.addEventListener("click", openFinanceDialog);
closeFinanceButton?.addEventListener("click", closeFinanceDialog);
financeDialog?.addEventListener("click", (event) => {
  if (event.target === financeDialog) closeFinanceDialog();
});
dialogLoanButton?.addEventListener("click", () => {
  takeLoan();
  updateEconomyHud();
});
dialogRepayButton?.addEventListener("click", () => {
  repayLoan();
  updateEconomyHud();
});
openStatisticsFromFinanceButton?.addEventListener("click", () => {
  closeFinanceDialog();
  openStatisticsScreen();
});
dialogAutoFareButton?.addEventListener("click", () => {
  economy = { ...economy, autoFare: !economy.autoFare };
  if (economy.autoFare) economy.fare = calculateAutoFare();
  persistState();
  updateEconomyHud();
});
menuButton?.addEventListener("click", openInGameMenu);
closeInGameMenuButton?.addEventListener("click", closeInGameMenu);
inGameMenuDialog?.addEventListener("click", (event) => {
  if (event.target === inGameMenuDialog) closeInGameMenu();
});
menuSaveTabButton?.addEventListener("click", () => switchInGameMenuTab("save"));
menuLoadTabButton?.addEventListener("click", () => switchInGameMenuTab("load"));
menuQuickSaveButton?.addEventListener("click", () => {
  saveCurrentSlot("수동 저장");
  if (menuSaveStatusReadout) {
    const timeStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    menuSaveStatusReadout.textContent = `저장 완료! (${timeStr})`;
  }
  showToast("게임을 저장했습니다!");
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
    economy = { ...economy, fare: clampInteger(val, 900, 4200), autoFare: false };
    persistState();
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
  persistState();
});
analysisFilter?.addEventListener("change", renderAnalysisScreen);
[analysisUrgentList, analysisReportList].forEach((list) => {
  list?.addEventListener("click", handleSuggestionClick);
});
statisticsButton?.addEventListener("click", openStatisticsScreen);
closeStatisticsButton?.addEventListener("click", closeStatisticsScreen);

closeStationManagerButton?.addEventListener("click", closeStationManager);
stationManagerDialog?.addEventListener("click", (event) => {
  if (event.target === stationManagerDialog) closeStationManager();
});
stationManagerContent?.addEventListener("click", handleStationManagerClick);
closeDepotManagerButton?.addEventListener("click", closeDepotManager);
depotManagerDialog?.addEventListener("click", (event) => {
  if (event.target === depotManagerDialog) closeDepotManager();
});
depotManagerContent?.addEventListener("click", handleDepotManagerClick);
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
statisticsContent?.addEventListener("click", handleStatisticsClick);
fareInput?.addEventListener("change", () => {
  economy = { ...economy, fare: clampInteger(Number(fareInput.value), 900, 4200), autoFare: false };
  updateAutoFareButton();
  persistState();
  renderAll(selectedOperationRouteId);
});
autoFareButton?.addEventListener("click", () => {
  economy = { ...economy, autoFare: !economy.autoFare };
  if (economy.autoFare) economy.fare = calculateAutoFare();
  updateAutoFareButton();
  persistState();
  renderAll(selectedOperationRouteId);
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
modeSelect?.addEventListener("change", renderCityOptions);
citySelect?.addEventListener("change", updateCityNote);
saveButton?.addEventListener("click", () => saveCurrentSlot("수동 저장"));
openDiagramButton?.addEventListener("click", openDiagramScreen);
diagramToolButton?.addEventListener("click", openDiagramScreen);
closeDiagramButton?.addEventListener("click", closeDiagramScreen);
diagramRouteFilter?.addEventListener("change", () => {
  diagramState = { ...diagramState, selectedRouteId: diagramRouteFilter.value || "all" };
  persistState();
  renderMetroDiagram();
});
diagramBackgroundSelect?.addEventListener("change", () => {
  const background = ["light", "blueprint"].includes(diagramBackgroundSelect.value) ? (diagramBackgroundSelect.value as "light" | "blueprint") : "dark";
  diagramState = { ...diagramState, background };
  persistState();
  renderMetroDiagram();
});
diagramLabelsToggle?.addEventListener("change", () => {
  diagramState = { ...diagramState, showStationNames: diagramLabelsToggle.checked };
  persistState();
  renderMetroDiagram();
});
diagramCompanyToggle?.addEventListener("change", () => {
  diagramState = { ...diagramState, showCompanyInfo: diagramCompanyToggle.checked };
  persistState();
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
helpButton?.addEventListener("click", () => openTutorial(true));
guideButton?.addEventListener("click", () => openTutorial(true));
closeSettingsButton?.addEventListener("click", closeSettings);
settingsDialog?.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettings();
});
saveRouteSettingsButton?.addEventListener("click", saveRouteSettings);
soundToggle?.addEventListener("change", () => updateSettings({ soundEnabled: Boolean(soundToggle.checked) }));
hapticsToggle?.addEventListener("change", () => updateSettings({ hapticsEnabled: Boolean(hapticsToggle.checked) }));
performanceSelect?.addEventListener("change", () => updateSettings({ performanceMode: performanceSelect.value === "battery" ? "battery" : "balanced" }));
reducedMotionToggle?.addEventListener("change", () => updateSettings({ reducedMotion: Boolean(reducedMotionToggle.checked) }));
sandboxConstructionTimeToggle?.addEventListener("change", () =>
  updateSettings({ sandboxConstructionTime: Boolean(sandboxConstructionTimeToggle.checked) }),
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
timeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    simSpeed = Number(button.dataset.speed ?? "0");
    if (simSpeed > 0) recordTutorialSignal("timeStarted", false);
    timeButtons.forEach((item) => item.classList.toggle("active", item === button));
    setText(modeLabel, simSpeed === 0 ? "일시정지" : `운영 x${simSpeed}`);
    updateTutorialProgress();
    playFeedback("select");
  });
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

window.addEventListener("error", (event) => {
  console.error(event.error ?? event.message);
  showError("예상치 못한 오류가 발생했습니다. 저장된 게임은 유지됩니다.", () => window.location.reload());
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  showError("데이터를 불러오는 중 문제가 발생했습니다. 네트워크를 확인해 주세요.", () => updateDynamicLayers());
});
document.addEventListener("visibilitychange", () => {
  lastFrameTime = performance.now();
  if (document.visibilityState === "hidden") void saveCurrentSlot("백그라운드 저장");
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
    for (const route of routes) {
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

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const pointerTarget = event.target as HTMLElement;
  if (activeTool === "pan" && pointerTarget.closest(".station-map-marker, .station-click-target, .depot-map-shape, .depot-click-target")) return;
  if (pointerTarget.closest(".hud, .route-sheet, .selected-line-panel, .right-line-control-card, .train-icon, .construction-preview-panel, .dialog-backdrop")) return;
  if (event.pointerType === "touch" && activePointerId !== null && event.pointerId !== activePointerId) {
    cancelActiveDrawing();
    setText(facilityReadout, "확대/축소 후 다시 그리세요");
    return;
  }
  const point = containerPointFromEvent(event);
  const planningContinuation = findPlanningRouteContinuation(point);
  if (constructionDraft && activePointerId === null && !planningContinuation) {
    map.dragging.enable();
    return;
  }

  if (activeTool === "pan") {
    const hits = findRoutesAtPoint(point, 26);
    if (hits.length === 0) {
      selectRoute(null);
    } else if (hits.length === 1) {
      selectRoute(hits[0].id);
      openLineManager();
    } else {
      openRouteChoice(hits);
    }
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
    mapContainer.setPointerCapture(event.pointerId);
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
    if (planningMode) {
      selectPlannedMergeEndpoint(point);
      return;
    }
    selectMergeEndpoint(point);
    return;
  }
  if (activeTool !== "route" && activeTool !== "extend" && activeTool !== "reconnect" && activeTool !== "branch" && activeTool !== "depot" && !(planningMode && activeTool === "eraser")) return;
  if (activePointerId !== null) return;

  if (constructionDraft && !planningContinuation) cancelConstructionDraft();
  activePlanningContinuation = planningContinuation;
  if (planningContinuation && !hasDraftRouteSettings) selectedColor = planningContinuation.color;
  replacingPlannedRouteId = planningContinuation?.plannedRouteId ?? null;

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
    } else {
    const snap = findNearestRoutePoint(point, selectedRouteId ?? undefined);
    if (!snap || snap.distancePx > 34) {
      setText(facilityReadout, "분기할 노선 위에서 드래그를 시작하세요");
      return;
    }
    selectRoute(snap.route.id, false);
    activeBranch = {
      routeId: snap.route.id,
      junction: map.latLngToContainerPoint(snap.latLng),
      junctionLatLng: snap.latLng,
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
  activePointerId = event.pointerId;
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
  mapContainer.setPointerCapture(event.pointerId);
  previewLayer.clearLayers();

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
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  const point = containerPointFromEvent(event);
  if (activeTool === "edit" && activeHandleMove) {
    const preview = moveRouteControlPoint(activeHandleMove.originalCoordinates, activeHandleMove.coordinateIndex, map.containerPointToLatLng(point));
    handlePreviewCoordinates = preview;
    previewLayer.clearLayers();
    L.polyline(
      preview.map(([lat, lng]) => L.latLng(lat, lng)),
      routeStyle(getRouteColor(activeHandleMove.routeId), 8, 0.95),
    ).addTo(previewLayer);
    updateEditCostPreview(activeHandleMove.routeId, preview);
    stageLiveEditDraft(activeHandleMove, preview);
    return;
  }
  const isEraserStroke = activeTool === "eraser";
  if (activeTool !== "route" && activeTool !== "extend" && activeTool !== "reconnect" && activeTool !== "branch" && activeTool !== "depot" && !isEraserStroke) return;
  const lastPoint = rawDrawPoints[rawDrawPoints.length - 1];
  if (point.distanceTo(lastPoint) < 5) return;
  rawDrawPoints.push(point);

  if ((activeTool === "route" || activeTool === "extend" || activeTool === "reconnect" || activeTool === "branch") && previewPolyline) {
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

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  if (activeTool === "edit" && activeHandleMove) {
    const handle = activeHandleMove;
    const preview = handlePreviewCoordinates;
    activePointerId = null;
    activeHandleMove = null;
    handlePreviewCoordinates = null;
    previewLayer.clearLayers();
    map.dragging.enable();
    if (preview) stageEditDraft(handle, preview);
    if (constructionDraft) map.dragging.enable();
    return;
  }
  const finishedPoints = smoothScreenPoints(rawDrawPoints);
  const extension = activeExtension;
  const repair = activeRepair;
  const branch = activeBranch;
  const planningBranch = activePlanningBranch;
  activePointerId = null;
  activeExtension = null;
  activeRepair = null;
  activeBranch = null;
  activePlanningBranch = null;
  rawDrawPoints = [];
  previewLayer.clearLayers();

  if (activeTool === "eraser") finishEraserStroke(finishedPoints);
  if (activeTool === "route" || activeTool === "extend") finishRouteDrawing(finishedPoints, extension);
  if (activeTool === "reconnect") finishRepairDrawing(finishedPoints, repair);
  if (activeTool === "branch") {
    if (planningMode) finishPlanningBranchDrawing(finishedPoints, planningBranch);
    else finishBranchDrawing(finishedPoints, branch);
  }
  if (activeTool === "depot") finishDepotDrawing(finishedPoints);
  activePlanningContinuation = null;
  if (constructionDraft) map.dragging.enable();
}

function beginEraserStroke(event: PointerEvent, point: L.Point) {
  activePointerId = event.pointerId;
  rawDrawPoints = [point];
  map.dragging.disable();
  mapContainer.setPointerCapture(event.pointerId);
  previewLayer.clearLayers();
  previewPolyline = L.polyline([map.containerPointToLatLng(point)], {
    color: "#ff6b6b",
    weight: eraserRadiusPx * 2,
    opacity: 0.52,
    dashArray: "2 8",
    lineCap: "round",
    interactive: false,
  }).addTo(previewLayer);
  setText(facilityReadout, planningMode ? "지울 계획 노선 구간을 따라 드래그하세요" : "철거할 실제 노선 구간을 따라 드래그하세요");
}

function finishEraserStroke(points: L.Point[]) {
  if (!planningMode) {
    finishConstructionEraserStroke(points);
    return;
  }
  const plan = getActivePlan(false);
  if (!plan || points.length < 2) {
    setText(facilityReadout, "지울 구간을 따라 조금 더 길게 드래그하세요");
    return;
  }
  const start = findNearestPlannedRoutePoint(points[0], plan);
  const end = findNearestPlannedRoutePoint(points[points.length - 1], plan);
  const hitRadius = eraserRadiusPx + 12;
  if (!start || !end || start.distancePx > hitRadius || end.distancePx > hitRadius) {
    setText(facilityReadout, "지우개를 계획 노선 위에서 시작하고 끝내세요");
    return;
  }
  if (start.route.id !== end.route.id) {
    setText(facilityReadout, "한 번에 같은 계획 노선의 구간만 지울 수 있습니다");
    return;
  }
  openPlannedRouteEraseRange(plan, start.route, start.coordinateIndex, end.coordinateIndex);
}

function finishConstructionEraserStroke(points: L.Point[]) {
  if (points.length < 2) {
    setText(facilityReadout, "지울 노선 구간을 따라 조금 더 길게 드래그하세요");
    return;
  }
  const hitRadius = eraserRadiusPx + 12;
  const start = findNearestRouteCoordinate(points[0], undefined, hitRadius);
  const end = findNearestRouteCoordinate(points[points.length - 1], undefined, hitRadius);
  if (!start || !end) {
    setText(facilityReadout, "지우개를 실제 노선 위에서 시작하고 끝내세요");
    return;
  }
  if (start.route.id !== end.route.id) {
    setText(facilityReadout, "한 번에 같은 노선의 구간만 철거할 수 있습니다");
    return;
  }
  deleteAnchor = { routeId: start.route.id, coordinateIndex: start.coordinateIndex, point: start.point };
  selectDeletePoint(end.point);
}

function findNearestStationAtPoint(point: L.Point, thresholdPx: number) {
  return stations
    .map((station) => ({ station, distancePx: point.distanceTo(map.latLngToContainerPoint(L.latLng(station.position[0], station.position[1]))) }))
    .filter((item) => item.distancePx <= thresholdPx)
    .sort((a, b) => a.distancePx - b.distancePx)[0]?.station;
}

function requestStationDemolition(station: Station) {
  const connectedRoutes = station.connectedRouteIds.map((id) => routes.find((route) => route.id === id)?.name).filter(Boolean);
  openDecisionDialog(
    `“${station.name}” 역을 철거할까요?`,
    `${connectedRoutes.length > 0 ? `${connectedRoutes.join(", ")} 운행과 환승 연결에서 이 역이 제거됩니다.` : "이 역의 환승 연결도 함께 정리됩니다."}`,
    "역 철거",
    () => demolishStations([station.id]),
  );
}

function demolishStations(stationIds: string[]) {
  const removedIds = new Set(stationIds);
  if (removedIds.size === 0) return;
  pushHistory();
  stations = stations.filter((station) => !removedIds.has(station.id));
  transfers = transfers.map((transfer) => ({ ...transfer, stationIds: transfer.stationIds.filter((id) => !removedIds.has(id)) }));
  expressConfigs = expressConfigs.map((config) => ({ ...config, stopStationIds: config.stopStationIds.filter((id) => !removedIds.has(id)) }));
  constructionProjects = constructionProjects
    .map((project) => ({ ...project, stationIds: project.stationIds.filter((id) => !removedIds.has(id)) }))
    .filter((project) => project.routeIds.length > 0 || project.stationIds.length > 0 || project.depotIds.length > 0);
  cleanupTransferData();
  redoStack = [];
  persistState();
  renderAll(selectedRouteId ?? undefined);
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
  stageRouteDraft(extension ? "extension" : "route", latLngs, { extension, plannedExtension });
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
    balanceAfter: economy.cash,
    warnings: analysis.warnings.filter((warning) => warning.code !== "insufficient-funds"),
  };
}

function stageRouteDraft(
  kind: Extract<ConstructionDraftKind, "route" | "extension" | "branch" | "repair">,
  points: LatLng[],
  context: { extension?: RouteExtension | null; plannedExtension?: { routeId: string; atStart: boolean }; branch?: RouteBranchDraft | null; planningBranch?: PlanningBranchDraft | null; repair?: RouteRepair | null },
) {
  const routeId = context.extension?.routeId ?? context.plannedExtension?.routeId ?? context.branch?.routeId ?? context.planningBranch?.routeId ?? context.repair?.routeId;
  const choices = constructionDraft?.kind === kind ? constructionDraft.analysis.riverCrossings : [];
  constructionDraft = {
    id: constructionDraft?.id ?? createId("draft"),
    kind,
    points,
    routeId,
    extension: context.extension,
    plannedExtension: context.plannedExtension,
    branch: context.branch,
    planningBranch: context.planningBranch,
    repair: context.repair,
    analysis: prepareDraftAnalysis(analyzeConstruction(kind, points, routeId, choices)),
  };
  renderConstructionDraft();
}

function stageDepotDraft(polygon: LatLng[], connectedRouteIds: string[], connectedPlannedRouteIds: string[] = []) {
  const areaHa = calculatePolygonAreaHa(polygon);
  const totalCost = Math.round(areaHa * 680 * cityConfigs[currentMeta.cityId].constructionMultiplier * difficultyConfigs[currentMeta.difficulty].costMultiplier);
  const warnings: ConstructionWarning[] = [];
  if (connectedRouteIds.length === 0) warnings.push({ code: "depot-unconnected", severity: "error", message: "차량기지는 노선과 30m 이내로 연결해야 합니다." });
  if (currentMeta.mode === "career" && totalCost > economy.cash)
    warnings.push({ code: "insufficient-funds", severity: "error", message: `자금이 ${formatCost(totalCost - economy.cash)} 부족합니다.` });
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
    balanceAfter: planningMode ? economy.cash : economy.cash - totalCost,
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
      planningMode ? "route" : "extension",
      planningMode ? combinePlanningContinuation(latLngs) : latLngs,
      planningMode && activePlanningContinuation?.actualRouteId
        ? { plannedExtension: { routeId: activePlanningContinuation.actualRouteId, atStart: activePlanningContinuation.atStart } }
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
  const route = routes.find((item) => item.id === handle.routeId);
  if (!route) return;
  const points = coordinates.map(([lat, lng]) => L.latLng(lat, lng));
  const newLength = calculateLengthKmPrecise(points);
  const deltaCost = calculateEditCostDelta(newLength - route.lengthKm);
  const existingChoices = constructionDraft?.kind === "edit" ? constructionDraft.analysis.riverCrossings : [];
  const analysis = analyzeConstruction("edit", points, route.id, existingChoices);
  analysis.baseCost = deltaCost;
  analysis.totalCost = deltaCost + analysis.mountainCost + analysis.riverCost;
  analysis.balanceAfter = economy.cash - analysis.totalCost;
  analysis.durationDays = Math.max(7, Math.round(Math.abs(newLength - route.lengthKm) * baseConstructionDaysPerKm));
  if (currentMeta.mode === "career" && deltaCost > economy.cash)
    analysis.warnings.push({ code: "insufficient-funds", severity: "error", message: `자금이 ${formatCost(deltaCost - economy.cash)} 부족합니다.` });
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

function toggleConstructionPreview() {
  constructionPreviewCollapsed = !constructionPreviewCollapsed;
  if (constructionPreviewDetails) constructionPreviewDetails.hidden = constructionPreviewCollapsed;
  toggleConstructionPreviewButton?.setAttribute("aria-expanded", String(!constructionPreviewCollapsed));
  toggleConstructionPreviewButton?.setAttribute("aria-label", constructionPreviewCollapsed ? "비용 정보 펼치기" : "비용 정보 접기");
  if (toggleConstructionPreviewButton) toggleConstructionPreviewButton.textContent = constructionPreviewCollapsed ? "⌄" : "⌃";
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
  const titles: Record<ConstructionDraftKind, string> = {
    route: "새 노선 검토",
    extension: "노선 연장 검토",
    branch: "분기 건설 검토",
    repair: "단절 구간 복구 검토",
    edit: "경로 수정 검토",
    depot: "차량기지 건설 검토",
  };
  setText(constructionPreviewTitle, planningMode ? `계획 · ${titles[constructionDraft.kind]}` : titles[constructionDraft.kind]);
  setText(previewTotalCost, analysis.totalCost < 0 ? `${formatCost(Math.abs(analysis.totalCost))} 환급` : formatCost(analysis.totalCost));
  setText(previewBalance, formatSignedCost(analysis.balanceAfter));
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
  setText(previewDepotConnection, analysis.depotConnected ? "연결됨" : "미연결");
  renderRiverChoices();
  if (constructionWarnings) {
    constructionWarnings.innerHTML =
      analysis.warnings.length === 0
        ? `<div class="construction-ready">✓ 건설 가능한 계획입니다</div>`
        : analysis.warnings
            .map((warning) => `<div class="${warning.severity}"><strong>${warning.severity === "error" ? "확인 필요" : warning.severity === "warning" ? "주의" : "안내"}</strong><span>${escapeHtml(warning.message)}</span></div>`)
            .join("");
  }
  const blocked = activePointerId !== null || analysis.warnings.some((warning) => warning.severity === "error");
  if (confirmConstructionButton) {
    confirmConstructionButton.disabled = blocked;
    confirmConstructionButton.textContent = planningMode ? "계획에 추가" : "건설 확정";
  }
}

function renderRiverChoices() {
  if (!constructionDraft || !riverChoiceList) return;
  const crossings = constructionDraft.analysis.riverCrossings;
  riverChoiceList.hidden = crossings.length === 0;
  riverChoiceList.innerHTML = crossings
    .map(
      (crossing, index) => `
        <div class="river-choice-card">
          <span>강 통과 ${index + 1}</span>
          <div>
            <button type="button" data-crossing-id="${crossing.id}" data-mode="bridge" class="${crossing.mode === "bridge" ? "active" : ""}">교량</button>
            <button type="button" data-crossing-id="${crossing.id}" data-mode="tunnel" class="${crossing.mode === "tunnel" ? "active" : ""}">지하</button>
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

function cancelConstructionDraft() {
  constructionDraft = null;
  document.body.classList.remove("construction-reviewing");
  previewLayer.clearLayers();
  if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
  if (activeTool !== "pan") map.dragging.disable();
  setText(facilityReadout, "건설 계획을 취소했습니다");
  renderAll(selectedRouteId ?? undefined);
}

async function confirmConstructionDraft() {
  const draft = constructionDraft;
  if (!draft || draft.analysis.warnings.some((warning) => warning.severity === "error")) return;
  if (planningMode) {
    await confirmPlanningDraft(draft);
    return;
  }
  const before = cloneState();
  try {
    const selectedId = applyConstructionDraft(draft);
    captureTutorialConstruction(draft.kind, selectedId);
    if (usesConstructionTimeline()) {
      constructionProjects = [...constructionProjects, createConstructionProjectFromDraft(draft, selectedId)];
      applyTutorialConstructionBoost(draft.kind, selectedId);
    }
    economy = {
      ...economy,
      cash: economy.cash - draft.analysis.totalCost,
      constructionSpent: Math.max(0, economy.constructionSpent + draft.analysis.totalCost),
    };
    synchronizeGraphReferences();
    currentMeta = { ...currentMeta, updatedAt: Date.now() };
    persistState();
    const saved = cloneState();
    saved.meta = currentMeta;
    await writeSaveSlot(saved);
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    constructionDraft = null;
    draftRouteName = "";
    hasDraftRouteSettings = false;
    document.body.classList.remove("construction-reviewing");
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    previewLayer.clearLayers();
    if (activeTool !== "pan") map.dragging.disable();
    selectRoute(selectedId, false);
    renderAll(selectedId);
    setText(facilityReadout, usesConstructionTimeline() ? "공사 예정으로 등록했습니다" : "건설을 확정하고 저장했습니다");
    playFeedback("confirm");
  } catch (error) {
    document.body.classList.remove("construction-reviewing");
    constructionDraft = null;
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    previewLayer.clearLayers();
    applyState(before);
    try {
      persistState();
      await writeSaveSlot(before);
    } catch {
      // The in-memory rollback is still authoritative for this session.
    }
    renderAll(selectedRouteId ?? undefined);
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
  const route = routes.find((item) => item.id === selectedId);
  const depot = depots.find((item) => item.id === selectedId);
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
    startedDay: analysisState.dayIndex,
    durationDays,
    elapsedDays: 0,
    expectedCompletionDay: analysisState.dayIndex + durationDays,
    baseCost: Math.max(0, draft.analysis.totalCost),
    additionalCost: 0,
    delayDays: 0,
    events: [],
  };
}

function usesConstructionTimeline() {
  return currentMeta.mode === "career" || (currentMeta.mode === "sandbox" && settings.sandboxConstructionTime) || isTutorialGuidedBuild();
}

function calculateCareerConstructionDuration(draft: ConstructionDraft) {
  const difficultyFactor = currentMeta.difficulty === "easy" ? 0.85 : currentMeta.difficulty === "hard" ? 1.2 : 1;
  const stationDays = draft.analysis.stationInstallCount * 55;
  const depotDays =
    draft.kind === "depot" && draft.polygon
      ? Math.max(60, calculatePolygonAreaHa(draft.polygon) * 32)
      : 0;
  return Math.max(1, Math.round(Math.max(draft.analysis.durationDays, depotDays) * difficultyFactor + stationDays));
}

function createStationConstructionProject(station: Station): ConstructionProject {
  const difficultyFactor = currentMeta.difficulty === "easy" ? 0.85 : currentMeta.difficulty === "hard" ? 1.2 : 1;
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
    startedDay: analysisState.dayIndex,
    durationDays,
    elapsedDays: 0,
    expectedCompletionDay: analysisState.dayIndex + durationDays,
    baseCost: 0,
    additionalCost: 0,
    delayDays: 0,
    events: [],
  };
}

function createPlanConstructionProjects(
  plan: ConstructionPlan,
  routeIds: string[],
  stationIds: string[],
  depotIds: string[],
) {
  const difficultyFactor = currentMeta.difficulty === "easy" ? 0.85 : currentMeta.difficulty === "hard" ? 1.2 : 1;
  const projects: ConstructionProject[] = [];
  for (const routeId of routeIds) {
    const route = routes.find((item) => item.id === routeId);
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
      startedDay: analysisState.dayIndex,
      durationDays,
      elapsedDays: 0,
      expectedCompletionDay: analysisState.dayIndex + durationDays,
      baseCost: route.constructionCost,
      additionalCost: 0,
      delayDays: 0,
      events: [],
      sourcePlanId: plan.id,
    });
  }
  for (const stationId of stationIds) {
    const station = stations.find((item) => item.id === stationId);
    if (station) projects.push({ ...createStationConstructionProject(station), sourcePlanId: plan.id });
  }
  for (const depotId of depotIds) {
    const depot = depots.find((item) => item.id === depotId);
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
      startedDay: analysisState.dayIndex,
      durationDays,
      elapsedDays: 0,
      expectedCompletionDay: analysisState.dayIndex + durationDays,
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
  }));
}

function isRouteOperational(routeId: string) {
  return !constructionProjects.some(
    (project) =>
      project.routeIds.includes(routeId) &&
      !["depot", "station"].includes(project.kind) &&
      project.status !== "operating",
  );
}

function isStationOperational(stationId: string) {
  return !constructionProjects.some((project) => project.stationIds.includes(stationId) && project.status !== "operating");
}

function isDepotOperational(depotId: string) {
  return !constructionProjects.some((project) => project.depotIds.includes(depotId) && project.status !== "operating");
}

function updateConstructionProjectsForDay() {
  let becameReady = 0;
  constructionProjects = constructionProjects.map((project) => {
    if (project.status === "operating" || project.status === "opening-ready" || project.status === "planned") return project;
    let next = { ...project, status: project.status === "scheduled" ? ("building" as const) : project.status, elapsedDays: project.elapsedDays + 1 };
    const appliedEvents = next.events.map((event) => {
      if (event.applied || event.triggerDay > analysisState.dayIndex) return event;
      if (event.kind === "delay") {
        const delay = Math.max(0, event.delayDays ?? 0);
        next = { ...next, delayDays: next.delayDays + delay, expectedCompletionDay: next.expectedCompletionDay + delay };
      } else {
        const extraCost = Math.max(0, event.extraCost ?? 0);
        next = { ...next, additionalCost: next.additionalCost + extraCost };
        economy = { ...economy, cash: economy.cash - extraCost, constructionSpent: economy.constructionSpent + extraCost };
      }
      return { ...event, applied: true };
    });
    next = { ...next, events: appliedEvents };
    if (next.elapsedDays < next.durationDays + next.delayDays) return next;
    if (["route", "extension", "branch", "repair", "edit", "plan"].includes(next.kind)) {
      becameReady += 1;
      return { ...next, status: "opening-ready", elapsedDays: next.durationDays + next.delayDays };
    }
    return { ...next, status: "operating", elapsedDays: next.durationDays + next.delayDays, openedAtDay: analysisState.dayIndex };
  });
  if (becameReady > 0) showToast(`${becameReady}개 공사가 완료되었습니다. 개통 조건을 확인하세요.`);
  updateConstructionBadge();
}

function getOpeningRequirements(project: ConstructionProject) {
  const projectRoutes = project.routeIds.map((id) => routes.find((route) => route.id === id)).filter(Boolean) as RouteLine[];
  const hasDepot =
    projectRoutes.length > 0 &&
    projectRoutes.every((route) =>
      depots.some((depot) => isDepotOperational(depot.id) && depot.connectedRouteIds.includes(route.id)),
    );
  const hasTrains =
    projectRoutes.length > 0 &&
    projectRoutes.every((route) => trainFleets.some((fleet) => fleet.routeId === route.id && fleet.sets > 0));
  const hasStations =
    projectRoutes.length > 0 &&
    projectRoutes.every((route) => stations.some((station) => isStationOperational(station.id) && station.connectedRouteIds.includes(route.id)));
  const validPath =
    projectRoutes.length > 0 &&
    projectRoutes.every((route) => route.coordinates.length >= 2 && !hasRouteGaps(route) && (route.segments ?? []).some((segment) => segment.enabled));
  return [
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
  if (constructionProjects.length === 0) {
    constructionProjectList.innerHTML = `<div class="construction-project-empty"><strong>진행 중인 공사가 없습니다</strong><span>${currentMeta.mode === "sandbox" && !settings.sandboxConstructionTime ? "샌드박스 모드에서는 건설이 즉시 완료됩니다." : "건설을 확정하면 공사 일정이 이곳에 표시됩니다."}</span></div>`;
    return;
  }
  const statusOrder: Record<ConstructionProjectStatus, number> = { "opening-ready": 0, building: 1, scheduled: 2, planned: 3, operating: 4 };
  constructionProjectList.innerHTML = [...constructionProjects]
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
  const project = constructionProjects.find((item) => item.id === card?.dataset.projectId);
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

function openConstructionProject(projectId: string) {
  const project = constructionProjects.find((item) => item.id === projectId);
  if (!project || project.status !== "opening-ready") return;
  const requirements = getOpeningRequirements(project);
  if (!requirements.every((item) => item.met)) {
    const missing = requirements.filter((item) => !item.met).map((item) => item.label);
    showToast(`아직 개통할 수 없습니다. ${missing.join(" · ")} 조건을 완료해 주세요.`);
    renderConstructionManager();
    return;
  }
  pushHistory();
  constructionProjects = constructionProjects.map((item) =>
    item.id === projectId ? { ...item, status: "operating", openedAtDay: analysisState.dayIndex } : item,
  );
  redoStack = [];
  persistState();
  void saveCurrentSlot("노선 개통");
  renderConstructionManager();
  renderAll(project.routeIds[0]);
  showToast(`${project.name} 운행을 시작했습니다.`);
  playFeedback("confirm");
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
  const activeCount = constructionProjects.filter((project) => project.status !== "operating").length;
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
    name: `Depot ${depots.length + 1}`,
    polygon: polygon.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
    areaHa,
    capacity: calculateDepotCapacity(areaHa, level),
    maintenanceCost: calculateDepotMaintenance(areaHa, level),
    connectedRouteIds: draft.connectedRouteIds ?? [],
    level,
    constructionCost: draft.analysis.totalCost,
    constructionDays: draft.analysis.durationDays,
  };
  depots = [...depots, depot];
  return depot.id;
}

function applyEditConstructionDraft(draft: ConstructionDraft) {
  const route = routes.find((item) => item.id === draft.routeId);
  if (!route) throw new Error("Edited route missing");
  const coordinates = draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)] as [number, number]);
  const updated = rebuildRouteGraph({
    ...route,
    coordinates,
    lengthKm: Math.round(calculateLengthKmPrecise(draft.points) * 10) / 10,
    constructionCost: Math.max(0, route.constructionCost + draft.analysis.totalCost),
  });
  routes = routes.map((item) => (item.id === route.id ? updated : item));
  return route.id;
}

function applyRouteConstructionDraft(draft: ConstructionDraft) {
  const cost = draft.analysis.totalCost;
  const riverCount = draft.analysis.riverCrossings.length;
  const mountainSegments = draft.analysis.segments.filter((segment) => segment.mountainLengthKm > 0).length;
  if (draft.kind === "branch") {
    const branch = draft.branch;
    const targetRoute = routes.find((route) => route.id === branch?.routeId);
    if (!branch || !targetRoute) throw new Error("Branch target missing");
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
    routes = routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
    return updatedRoute.id;
  }
  if (draft.kind === "repair") {
    const repair = draft.repair;
    const targetRoute = routes.find((route) => route.id === repair?.routeId);
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
    routes = routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
    return updatedRoute.id;
  }
  if (draft.kind === "extension") {
    const extension = draft.extension;
    const targetRoute = routes.find((route) => route.id === extension?.routeId);
    if (!extension || !targetRoute) throw new Error("Extension target missing");
    const existingPoints = targetRoute.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
    const extendedPoints = extension.atStart
      ? [...draft.points.slice().reverse().slice(0, -1), ...existingPoints]
      : [...existingPoints, ...draft.points.slice(1)];
    let updatedRoute = rebuildRouteGraph({
      ...targetRoute,
      coordinates: extendedPoints.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
      lengthKm: Math.round((targetRoute.lengthKm + draft.analysis.lengthKm) * 10) / 10,
      constructionCost: targetRoute.constructionCost + cost,
      riverCrossings: targetRoute.riverCrossings + riverCount,
      mountainSegments: targetRoute.mountainSegments + mountainSegments,
    });
    updatedRoute = applyDraftMetadataToRoute(updatedRoute, draft);
    routes = routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
    return updatedRoute.id;
  }
  let route: RouteLine = {
    id: createId("route"),
    name: draftRouteName || `Line ${routes.length + 1}`,
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
  routes = [...routes, route];
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
  const nearRoutes = findRoutesNearLatLng(snap.latLng, 55);
  const station: Station = {
    id: createId("station"),
    name: `Station ${stations.length + 1}`,
    position: [roundCoord(snap.latLng.lat), roundCoord(snap.latLng.lng)],
    demand: estimateStationDemand(snap.latLng, nearRoutes.length),
    connectedRouteIds: nearRoutes.length > 0 ? nearRoutes : [snap.route.id],
    routeNodeIds: (nearRoutes.length > 0 ? nearRoutes : [snap.route.id])
      .map((routeId) => findNearestGraphNodeId(routes.find((route) => route.id === routeId), snap.latLng))
      .filter((id): id is string => Boolean(id)),
  };
  stations = [...stations, station];
  if (usesConstructionTimeline()) {
    constructionProjects = [...constructionProjects, createStationConstructionProject(station)];
    applyTutorialConstructionBoost("station", station.id);
  }
  playFeedback("build");
  redoStack = [];
  persistState();
  renderAll(station.id);
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
    setText(facilityReadout, planningMode ? "기존역 또는 계획역을 선택하세요" : "환승할 기존역을 선택하세요");
    return;
  }
  selectedManualTransferEndpoints = [...selectedManualTransferEndpoints.filter((item) => item.kind !== endpoint.kind || item.id !== endpoint.id), endpoint].slice(-2);
  selectedTransferStationIds = selectedManualTransferEndpoints.filter((item) => item.kind === "actual").map((item) => item.id);
  selectedPlannedStationIds = selectedManualTransferEndpoints.filter((item) => item.kind === "planned").map((item) => item.id);
  const label = endpoint.kind === "actual" ? actual?.name ?? "기존역" : planned?.name ?? "계획역";
  if (selectedManualTransferEndpoints.length < 2) {
    setText(facilityReadout, `${label} 선택 · 연결할 두 번째 역을 선택하세요`);
    renderAll(endpoint.kind === "actual" ? endpoint.id : undefined);
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
      ...actualStationIds.map((id) => stations.find((station) => station.id === id)).filter(Boolean).map((station) => L.latLng((station as Station).position[0], (station as Station).position[1])),
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
  persistState();
  renderAll(actualStationIds[0]);
}

function createTransferGroup(stationIds: string[], automatic: boolean) {
  const uniqueStationIds = Array.from(new Set(stationIds));
  if (uniqueStationIds.length < 2) return;
  const duplicate = transfers.find((transfer) => uniqueStationIds.every((id) => transfer.stationIds.includes(id)));
  if (duplicate) return;

  const selectedStations = uniqueStationIds.map((id) => stations.find((station) => station.id === id)).filter(Boolean) as Station[];
  const distanceM = calculateTransferDistance(selectedStations);
  const congestion = Math.min(2.4, selectedStations.reduce((sum, station) => sum + station.demand, 0) / 22000);
  const transferTimeMin = Math.round((distanceM / 75 + 2 + congestion * 1.4) * 10) / 10;
  const resistance = Math.round((distanceM * 0.04 + transferTimeMin * 12 + congestion * 28) * 10) / 10;
  const groupId = createId("transfer");
  transfers = [...transfers, { id: groupId, stationIds: uniqueStationIds, distanceM, transferTimeMin, congestion, resistance, automatic }];
  stations = stations.map((station) => (uniqueStationIds.includes(station.id) ? { ...station, transferGroupId: groupId } : station));
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

function normalizeDiagramState(state?: MetroDiagramState): MetroDiagramState {
  const usingPublicMapLayout = (state?.layoutVersion ?? 0) < defaultDiagramState.layoutVersion;
  const background: MetroDiagramState["background"] = usingPublicMapLayout
    ? "light"
    : state?.background === "dark" || state?.background === "blueprint"
      ? state.background
      : "light";
  return {
    ...defaultDiagramState,
    ...(state ?? {}),
    background,
    layoutVersion: defaultDiagramState.layoutVersion,
    autoPositions: usingPublicMapLayout ? {} : state?.autoPositions ?? {},
    manualPositions: usingPublicMapLayout ? {} : state?.manualPositions ?? {},
  };
}

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
  const actualRoutes = routes.filter((route) => route.coordinates.length >= 2);
  if (diagramState.selectedRouteId !== "all" && !actualRoutes.some((route) => route.id === diagramState.selectedRouteId)) {
    diagramState = { ...diagramState, selectedRouteId: "all" };
  }
  if (diagramRouteFilter) {
    diagramRouteFilter.innerHTML =
      `<option value="all">전체 노선</option>` +
      actualRoutes.map((route) => `<option value="${route.id}">${escapeHtml(route.name)}</option>`).join("");
    diagramRouteFilter.value = diagramState.selectedRouteId;
  }
  if (diagramBackgroundSelect) diagramBackgroundSelect.value = diagramState.background;
  if (diagramLabelsToggle) diagramLabelsToggle.checked = diagramState.showStationNames;
  if (diagramCompanyToggle) diagramCompanyToggle.checked = diagramState.showCompanyInfo;
  setText(diagramCompanyName, getNetworkTitle());
  renderDiagramRouteLegend();
}

function renderDiagramRouteLegend() {
  if (!diagramRouteLegend) return;
  const visibleRoutes = routes
    .filter((route) => route.coordinates.length >= 2)
    .filter((route) => diagramState.selectedRouteId === "all" || route.id === diagramState.selectedRouteId);
  diagramRouteLegend.innerHTML = visibleRoutes
    .map((route) => `<span><i style="--diagram-route-color:${escapeHtml(route.color)}"></i>${escapeHtml(route.name)}</span>`)
    .join("");
}

function buildDiagramGraph(): DiagramGraphInternal {
  const visibleRoutes = routes
    .filter((route) => route.coordinates.length >= 2)
    .filter((route) => diagramState.selectedRouteId === "all" || route.id === diagramState.selectedRouteId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const visibleRouteIds = new Set(visibleRoutes.map((route) => route.id));
  const nodes = new Map<string, DiagramNodeInternal>();
  const paths: DiagramPathInternal[] = [];
  const adjacency = new Map<string, Set<string>>();
  const stationToDiagramNode = new Map<string, string>();
  const logicalGroups = new Map<string, Station[]>();
  const visibleStations = stations
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
    const express = expressConfigs.some(
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
    const routeStations = stations.filter(
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
    const saved = diagramState.manualPositions[node.id] ?? diagramState.autoPositions[node.id];
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
  diagramState = {
    ...diagramState,
    autoPositions: nextAuto,
    manualPositions: Object.fromEntries(Object.entries(diagramState.manualPositions).filter(([stationId]) => validStationIds.has(stationId))),
    networkSignature: buildDiagramNetworkSignature(graph),
  };

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
  if (diagramScreen) diagramScreen.dataset.background = diagramState.background;
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

  diagramLabelLayer.innerHTML = diagramState.showStationNames ? renderDiagramLabels(visibleStationNodes, positions) : "";
  renderDiagramCompany();
  const transferCount = visibleStationNodes.filter(
    (node) => node.sourceStationIds.length > 1 || node.routeIds.length > 1,
  ).length;
  setText(
    diagramStatus,
    `${graph.paths.length}개 경로 · ${visibleStationNodes.length}개 논리역 · 환승 ${transferCount}개 · 수동 조정 ${Object.keys(diagramState.manualPositions).length}개`,
  );
}

function renderDiagramBackground() {
  if (!diagramBackgroundLayer) return;
  const theme = diagramTheme();
  const gridLines: string[] = [];
  if (diagramState.background === "blueprint") {
    for (let x = 0; x <= diagramWidth; x += 40) gridLines.push(`<path d="M ${x} 0 V ${diagramHeight}" stroke="${theme.grid}" stroke-width="1"/>`);
    for (let y = 0; y <= diagramHeight; y += 40) gridLines.push(`<path d="M 0 ${y} H ${diagramWidth}" stroke="${theme.grid}" stroke-width="1"/>`);
  }
  const river = diagramState.background === "light"
    ? `<path d="M -60 690 C 230 590 405 755 690 677 S 1160 580 1425 655 S 1660 770 1870 650" fill="none" stroke="#d6edf8" stroke-width="34" stroke-linecap="round" opacity=".78"/>`
    : "";
  diagramBackgroundLayer.innerHTML = `<rect width="${diagramWidth}" height="${diagramHeight}" fill="${theme.background}"/>${river}${gridLines.join("")}`;
}

function diagramTheme() {
  if (diagramState.background === "light")
    return { background: "#ffffff", surface: "#ffffff", text: "#161616", muted: "#67727a", label: "rgba(255,255,255,.92)", grid: "rgba(28,51,65,.08)" };
  if (diagramState.background === "blueprint")
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
  if (!diagramState.showCompanyInfo) {
    diagramCompanyLayer.innerHTML = "";
    return;
  }
  const theme = diagramTheme();
  const title = getNetworkTitle();
  const cityName = cityConfigs[currentMeta.cityId].name;
  const generatedDate = formatDate(Date.now());
  diagramCompanyLayer.innerHTML = `<g transform="translate(80 70)" pointer-events="none">
    <rect width="470" height="104" rx="18" fill="${theme.label}" stroke="${theme.muted}" stroke-width="1"/>
    <text x="24" y="29" fill="${theme.muted}" font-size="12" font-weight="900" letter-spacing="2">NETWORK MAP · ${escapeHtml(cityName)}</text>
    <text x="24" y="59" fill="${theme.text}" font-size="22" font-weight="900">${escapeHtml(title)}</text>
    <text x="24" y="84" fill="${theme.muted}" font-size="13" font-weight="700">${escapeHtml(generatedDate)} · ${routes.length}개 노선 · ${stations.length}개 역</text>
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
  diagramState = {
    ...diagramState,
    manualPositions: {
      ...diagramState.manualPositions,
      [diagramDrag.stationId]: {
        x: Math.round(clampNumber(point.x, 80, diagramWidth - 80) / 8) * 8,
        y: Math.round(clampNumber(point.y, 70, diagramHeight - 70) / 8) * 8,
      },
    },
  };
  renderMetroDiagram();
}

function finishDiagramStationDrag(event: PointerEvent) {
  if (!diagramDrag || diagramDrag.pointerId !== event.pointerId) return;
  diagramDrag = null;
  document.body.classList.remove("diagram-dragging");
  persistState();
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
  if (diagramState.showCompanyInfo) points.push({ x: 80, y: 70 }, { x: 550, y: 174 });
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
  diagramState = { ...diagramState, autoPositions: {}, manualPositions: {}, networkSignature: "" };
  persistState();
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
    cityId: currentMeta.cityId,
    generatedAt: Date.now(),
    network: {
      title: getNetworkTitle(),
      cityName: cityConfigs[currentMeta.cityId].name,
      generatedAt: Date.now(),
      routeCount: routes.length,
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
    cityId: currentMeta.cityId,
    generatedAt: Date.now(),
    plans: JSON.parse(JSON.stringify(plans.filter((plan) => plan.cityId === currentMeta.cityId))) as ConstructionPlan[],
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

async function importShareBundle() {
  const file = importShareJsonInput?.files?.[0];
  if (!file) return;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const validation = validateShareBundle(parsed);
    if (!validation.ok || !validation.bundle) throw new Error(validation.error);
    const bundle = validation.bundle;
    const before = cloneState();
    const knownStationIds = new Set(stations.map((station) => station.id));
    const importedPositions = Object.fromEntries(bundle.diagram.stations.filter((station) => knownStationIds.has(station.id)).map((station) => [station.id, station.position]));
    diagramState = {
      ...diagramState,
      manualPositions: { ...diagramState.manualPositions, ...importedPositions },
    };
    const importedPlans = bundle.routeDesign.plans.map((plan) => cloneImportedPlan(plan));
    plans = [...plans, ...importedPlans];
    activePlanId = importedPlans[0]?.id ?? activePlanId;
    persistState();
    await writeSaveSlot(cloneState());
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    renderMetroDiagram();
    showToast(`공유 데이터를 가져왔습니다 · 계획 ${importedPlans.length}개`);
  } catch (error) {
    showError(error instanceof Error ? error.message : "공유 JSON을 읽을 수 없습니다.");
  } finally {
    if (importShareJsonInput) importShareJsonInput.value = "";
  }
}

function validateShareBundle(value: unknown): { ok: boolean; bundle?: GameShareBundle; error?: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "공유 JSON 형식이 올바르지 않습니다." };
  const candidate = value as Partial<GameShareBundle>;
  if (candidate.kind !== "draw-gyotong-share" || typeof candidate.shareId !== "string") return { ok: false, error: "지원하지 않는 공유 데이터입니다." };
  if (candidate.gameVersion?.split(".")[0] !== gameVersion.split(".")[0]) return { ok: false, error: `게임 버전이 호환되지 않습니다. 필요 버전: ${candidate.gameVersion}` };
  if (candidate.cityDataVersion !== cityDataVersion) return { ok: false, error: "도시 데이터 버전이 호환되지 않습니다." };
  if ((candidate.requiredExtensions ?? []).length > 0) return { ok: false, error: `필요한 확장 콘텐츠가 없습니다: ${candidate.requiredExtensions?.join(", ")}` };
  const diagram = candidate.diagram;
  const routeDesign = candidate.routeDesign;
  if (!diagram || diagram.kind !== "metro-diagram" || !Array.isArray(diagram.routes) || !Array.isArray(diagram.stations))
    return { ok: false, error: "노선도 공유 데이터가 손상되었습니다." };
  if (!diagram.network || typeof diagram.network.title !== "string" || typeof diagram.network.cityName !== "string")
    return { ok: false, error: "철도망 제목 정보가 없는 공유 데이터입니다." };
  if (!routeDesign || routeDesign.kind !== "route-design" || !Array.isArray(routeDesign.plans))
    return { ok: false, error: "노선 설계 공유 데이터가 손상되었습니다." };
  if (diagram.cityId !== currentMeta.cityId || routeDesign.cityId !== currentMeta.cityId) return { ok: false, error: "현재 도시와 다른 도시의 공유 데이터입니다." };
  const validPoints = diagram.stations.every(
    (station) =>
      station &&
      typeof station.id === "string" &&
      typeof station.name === "string" &&
      Array.isArray(station.routeIds) &&
      Number.isFinite(station.position?.x) &&
      Number.isFinite(station.position?.y),
  );
  if (!validPoints) return { ok: false, error: "노선도 역 위치 데이터가 올바르지 않습니다." };
  return { ok: true, bundle: candidate as GameShareBundle };
}

function cloneImportedPlan(source: ConstructionPlan) {
  const routeIdMap = new Map((source.routes ?? []).map((route) => [route.id, createId("planned-route")]));
  const stationIdMap = new Map((source.stations ?? []).map((station) => [station.id, createId("planned-station")]));
  return recalculatePlan({
    ...JSON.parse(JSON.stringify(source)),
    id: createId("plan"),
    name: `${source.name} · 가져옴`,
    createdAt: Date.now(),
    cityId: currentMeta.cityId,
    status: "draft",
    routes: (source.routes ?? []).map((route) => ({
      ...route,
      id: routeIdMap.get(route.id)!,
      segments: (route.segments ?? []).map((segment) => ({ ...segment, id: createId("plan-segment"), fromNodeId: createId("node"), toNodeId: createId("node") })),
      completedSegmentIds: [],
    })),
    stations: (source.stations ?? []).map((station) => ({
      ...station,
      id: stationIdMap.get(station.id)!,
      plannedRouteIds: station.plannedRouteIds.map((routeId) => routeIdMap.get(routeId) ?? routeId),
      completed: false,
      actualStationId: undefined,
    })),
    depots: (source.depots ?? []).map((depot) => ({
      ...depot,
      id: createId("planned-depot"),
      connectedPlannedRouteIds: depot.connectedPlannedRouteIds.map((routeId) => routeIdMap.get(routeId) ?? routeId),
      completed: false,
      actualDepotId: undefined,
    })),
    transfers: (source.transfers ?? []).map((transfer) => ({
      ...transfer,
      id: createId("planned-transfer"),
      stationIds: transfer.stationIds.map((stationId) => stationIdMap.get(stationId) ?? stationId),
      completed: false,
    })),
  });
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

function createPlanRecord(name = `계획 ${plans.length + 1}`): ConstructionPlan {
  return {
    id: createId("plan"),
    name,
    cityId: currentMeta.cityId,
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
      }),
    );
}

function getActivePlan(createIfMissing = true) {
  let plan = plans.find((item) => item.id === activePlanId && item.cityId === currentMeta.cityId);
  if (!plan) {
    plan = plans.find((item) => item.cityId === currentMeta.cityId);
    if (plan) activePlanId = plan.id;
  }
  if (!plan && createIfMissing) {
    plan = createPlanRecord();
    plans = [...plans, plan];
    activePlanId = plan.id;
  }
  return plan;
}

function updatePlan(planId: string, updater: (plan: ConstructionPlan) => ConstructionPlan) {
  plans = plans.map((plan) => (plan.id === planId ? recalculatePlan(updater(plan)) : plan));
}

/**
 * 계획에 포함된 자산을 기준으로 비용·기간·수요·수익을 다시 집계한다.
 * 계획 자산이 추가/삭제/완공될 때 파생 값을 직접 수정하지 말고 이 함수를 거쳐
 * 요약 수치가 실제 목록과 어긋나지 않게 한다.
 */
function recalculatePlan(plan: ConstructionPlan): ConstructionPlan {
  const remainingRouteCost = plan.routes.reduce(
    (sum, route) => sum + route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id)).reduce((segmentSum, segment) => segmentSum + segment.constructionCost, 0),
    0,
  );
  const totalRouteCost = plan.routes.reduce((sum, route) => sum + route.segments.reduce((segmentSum, segment) => segmentSum + segment.constructionCost, 0), 0);
  const pendingStations = plan.stations.filter((station) => !station.completed);
  const pendingDepots = plan.depots.filter((depot) => !depot.completed);
  const pendingTransfers = plan.transfers.filter((transfer) => !transfer.completed);
  const expectedTotalCost =
    totalRouteCost + plan.stations.length * 180 + plan.depots.reduce((sum, depot) => sum + depot.expectedCost, 0) + plan.transfers.length * 40;
  const remainingCost =
    remainingRouteCost + pendingStations.length * 180 + pendingDepots.reduce((sum, depot) => sum + depot.expectedCost, 0) + pendingTransfers.length * 40;
  const expectedConstructionDays = Math.max(
    0,
    ...plan.routes.flatMap((route) =>
      route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id)).map((segment) => segment.constructionDays ?? Math.round(segment.lengthKm * baseConstructionDaysPerKm)),
    ),
    ...pendingDepots.map((depot) => depot.constructionDays),
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
  const totalAssets = allRouteSegments.length + plan.stations.length + plan.depots.length + plan.transfers.length;
  const completedAssets =
    completedRouteSegments.length +
    plan.stations.filter((station) => station.completed).length +
    plan.depots.filter((depot) => depot.completed).length +
    plan.transfers.filter((transfer) => transfer.completed).length;
  let status = plan.status;
  if (totalAssets > 0 && completedAssets === totalAssets) status = "completed";
  else if (completedAssets > 0) status = "partial";
  else if (status !== "on-hold" && status !== "review") status = remainingCost > economy.cash && currentMeta.mode === "career" ? "insufficient" : totalAssets > 0 ? "ready" : "draft";
  return { ...plan, expectedTotalCost, remainingCost, expectedConstructionDays, expectedDemand, expectedRevenue, terrainDifficulty, transferEffect, status };
}

function estimatePlannedRouteDemand(points: LatLng[]) {
  if (points.length < 2) return 0;
  const nearbyDemand = stations
    .filter((station) => distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), points.map((point) => [point.lat, point.lng])) <= 700)
    .reduce((sum, station) => sum + station.demand * 0.36, 0);
  const center = L.latLng(cityConfigs[currentMeta.cityId].center as [number, number]);
  const midpoint = points[Math.floor(points.length / 2)];
  const centrality = Math.max(0.35, 1.3 - map.distance(center, midpoint) / 35000);
  const lengthKm = calculateLengthKmPrecise(points);
  return Math.round((nearbyDemand + lengthKm * 4800 * centrality) * cityConfigs[currentMeta.cityId].demandMultiplier);
}

function estimatePlannedTransferEffect(points: LatLng[]) {
  const intersectingRoutes = routes.filter((route) =>
    route.coordinates.some(([lat, lng]) => distanceToCoordinatesMeters(L.latLng(lat, lng), points.map((point) => [point.lat, point.lng])) <= 160),
  ).length;
  return Math.round(intersectingRoutes * 12 + Math.min(25, points.length * 0.8));
}

async function confirmPlanningDraft(draft: ConstructionDraft) {
  const before = cloneState();
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
                expectedRevenue: route.expectedRevenue + Math.round((branchDemand * economy.fare * 365 * 0.65) / 100000000),
                transferEffect: route.transferEffect + estimatePlannedTransferEffect(draft.points),
              }
            : route,
        ),
      }));
    } else {
      const firstNodeId = createId("node");
      const graph = createGraphForDraftPath(draft, firstNodeId);
      const expectedDemand = estimatePlannedRouteDemand(draft.points);
      const expectedRevenue = Math.round((expectedDemand * economy.fare * 365) / 100000000);
      const extensionTarget = draft.plannedExtension ? routes.find((item) => item.id === draft.plannedExtension?.routeId) : undefined;
      const route: PlannedRoute = {
        id: replacingPlannedRouteId ?? createId("planned-route"),
        name:
          draftRouteName ||
          plan.routes.find((item) => item.id === replacingPlannedRouteId)?.name ||
          extensionTarget?.name ||
          `계획 노선 ${plan.routes.length + 1}`,
        color: selectedColor,
        coordinates: draft.points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
        segments: graph.segments,
        completedSegmentIds: [],
        expectedCost: draft.analysis.totalCost,
        constructionDays: draft.analysis.durationDays,
        expectedDemand,
        expectedRevenue,
        transferEffect: estimatePlannedTransferEffect(draft.points),
        actualExtension: draft.plannedExtension,
      };
      updatePlan(plan.id, (item) => ({
        ...item,
        routes: replacingPlannedRouteId ? item.routes.map((existing) => (existing.id === replacingPlannedRouteId ? route : existing)) : [...item.routes, route],
      }));
      replacingPlannedRouteId = null;
    }
    currentMeta = { ...currentMeta, updatedAt: Date.now() };
    persistState();
    await writeSaveSlot(cloneState());
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    constructionDraft = null;
    draftRouteName = "";
    hasDraftRouteSettings = false;
    document.body.classList.remove("construction-reviewing");
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    previewLayer.clearLayers();
    renderAll();
    showToast("자금 차감 없이 계획에 저장했습니다.");
    playFeedback("confirm");
  } catch (error) {
    applyState(before);
    constructionDraft = null;
    document.body.classList.remove("construction-reviewing");
    if (constructionPreviewPanel) constructionPreviewPanel.hidden = true;
    previewLayer.clearLayers();
    renderAll();
    showError("계획 저장 중 문제가 발생해 변경을 되돌렸습니다.");
    console.error(error);
  }
}

function setWorkspaceMode(nextMode: WorkspaceMode) {
  const previousMode = workspaceMode;
  if (constructionDraft) cancelConstructionDraft();
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
  planningModeButton?.classList.toggle("active", shouldPlan);
  planningModeButton?.setAttribute("aria-pressed", String(shouldPlan));
  for (const button of [extendTool, editTool, eraserTool, reconnectTool, branchTool, mergeTool]) {
    if (button) button.disabled = false;
  }
  setTool("pan");
  const modeName: Record<WorkspaceMode, string> = {
    management: "관리 모드",
    planning: "기획 모드",
    construction: "공사 모드",
  };
  setText(workspaceModeReadout, modeName[nextMode]);
  const hints: Record<WorkspaceMode, string[]> = {
    management: ["지도를 이동하거나 시설을 선택", "운영·노선 정보를 확인"],
    planning: ["건설 전 설계안을 자유롭게 편집", "설계안은 비용이 차감되지 않음"],
    construction: ["철거 도구로 노선과 역의 범위를 선택", "확정 전까지 지도는 바뀌지 않음"],
  };
  setHint(hints[nextMode]);
  renderAll(selectedRouteId ?? undefined);
  if (previousMode !== nextMode) showToast(`${modeName[nextMode]}로 전환했습니다.`);
}

function togglePlanningMode() {
  setWorkspaceMode(workspaceMode === "planning" ? "management" : "planning");
  return;
  planningMode = !planningMode;
  replacingPlannedRouteId = null;
  setTool("pan");
  getActivePlan(planningMode);
  planningModeButton?.classList.toggle("active", planningMode);
  planningModeButton?.setAttribute("aria-pressed", String(planningMode));
  document.body.classList.toggle("planning-mode", planningMode);
  for (const button of [extendTool, editTool, eraserTool, reconnectTool, branchTool, mergeTool]) {
    if (button) (button as HTMLButtonElement).disabled = planningMode;
  }
  setText(modeLabel, planningMode ? "계획 모드" : "지도 탐색");
  setHint(planningMode ? ["자금 차감 없는 미래 설계", "목록에서 편집·전환"] : ["한 손가락 지도 이동", "핀치 줌"]);
  renderAll();
  showToast(planningMode ? "계획 모드: 노선·역·기지·환승을 설계할 수 있습니다." : "실제 건설 모드로 전환했습니다.");
}

function createNewPlan() {
  pushHistory();
  const plan = createPlanRecord();
  plans = [...plans, plan];
  activePlanId = plan.id;
  redoStack = [];
  persistState();
  renderPlanningDialog();
  renderAll();
}

function duplicateActivePlan() {
  const source = getActivePlan(false);
  if (!source) return;
  pushHistory();
  const routeIdMap = new Map(source.routes.map((route) => [route.id, createId("planned-route")]));
  const stationIdMap = new Map(source.stations.map((station) => [station.id, createId("planned-station")]));
  const copy: ConstructionPlan = recalculatePlan({
    ...JSON.parse(JSON.stringify(source)),
    id: createId("plan"),
    name: `${source.name} 복사본`,
    createdAt: Date.now(),
    status: "draft",
    routes: source.routes.map((route) => ({
      ...JSON.parse(JSON.stringify(route)),
      id: routeIdMap.get(route.id)!,
      segments: route.segments.map((segment) => ({ ...segment, id: createId("plan-segment"), fromNodeId: createId("node"), toNodeId: createId("node") })),
      completedSegmentIds: [],
    })),
    stations: source.stations.map((station) => ({
      ...station,
      id: stationIdMap.get(station.id)!,
      plannedRouteIds: station.plannedRouteIds.map((id) => routeIdMap.get(id) ?? id),
      completed: false,
      actualStationId: undefined,
    })),
    depots: source.depots.map((depot) => ({
      ...depot,
      id: createId("planned-depot"),
      connectedPlannedRouteIds: depot.connectedPlannedRouteIds.map((id) => routeIdMap.get(id) ?? id),
      completed: false,
      actualDepotId: undefined,
    })),
    transfers: source.transfers.map((transfer) => ({
      ...transfer,
      id: createId("planned-transfer"),
      stationIds: transfer.stationIds.map((id) => stationIdMap.get(id) ?? id),
      completed: false,
    })),
  });
  plans = [...plans, copy];
  activePlanId = copy.id;
  redoStack = [];
  persistState();
  renderPlanningDialog();
  renderAll();
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
      plans = plans.filter((item) => item.id !== plan.id);
      activePlanId = plans.find((item) => item.cityId === currentMeta.cityId)?.id ?? null;
      redoStack = [];
      persistState();
      renderPlanningDialog();
      renderAll();
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
  persistState();
  renderPlanningDialog();
  renderAll();
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
  const cityPlans = plans.filter((plan) => plan.cityId === currentMeta.cityId);
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
      <div><span>예상 총비용</span><strong>${formatCost(plan.expectedTotalCost)}</strong></div>
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
      return `<article class="plan-asset-card">
        <i style="--asset-color:${route.color}"></i>
        <div><strong>${escapeHtml(route.name)}</strong><span>${completed}/${route.segments.length}구간 완공 · ${formatCost(route.expectedCost)} · 수요 ${route.expectedDemand.toLocaleString("ko-KR")}</span></div>
        <div class="asset-actions">
          <button type="button" data-plan-action="redraw-route" data-asset-id="${route.id}">경로 수정</button>
          <button type="button" data-plan-action="duplicate-route" data-asset-id="${route.id}">복제</button>
          <button type="button" data-plan-action="delete-route" data-asset-id="${route.id}">삭제</button>
        </div>
      </article>`;
    })
    .join("");
  const facilities = [
    ...plan.stations.map((station) => `<article class="plan-asset-card facility"><div><strong>${escapeHtml(station.name)}</strong><span>예정 역 · 수요 ${station.expectedDemand.toLocaleString("ko-KR")}${station.completed ? " · 완공" : ""}</span></div><button type="button" data-plan-action="delete-station" data-asset-id="${station.id}">삭제</button></article>`),
    ...plan.depots.map((depot) => `<article class="plan-asset-card facility"><div><strong>${escapeHtml(depot.name)}</strong><span>예정 차량기지 · ${depot.capacity}편성 · ${formatCost(depot.expectedCost)}${depot.completed ? " · 완공" : ""}</span></div><button type="button" data-plan-action="delete-depot" data-asset-id="${depot.id}">삭제</button></article>`),
    ...plan.transfers.map((transfer) => `<article class="plan-asset-card facility"><div><strong>예정 환승 연결</strong><span>환승 효과 +${transfer.expectedEffect}${transfer.completed ? " · 완공" : ""}</span></div><button type="button" data-plan-action="delete-transfer" data-asset-id="${transfer.id}">삭제</button></article>`),
  ].join("");
  planAssetList.innerHTML = routeItems || facilities ? routeItems + facilities : `<div class="planning-empty">계획 모드에서 노선이나 시설을 추가하세요.</div>`;
  planAssetList.querySelectorAll<HTMLButtonElement>("[data-plan-action]").forEach((button) => {
    button.addEventListener("click", () => handlePlanAssetAction(button.dataset.planAction ?? "", button.dataset.assetId ?? ""));
  });
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
      stations: action === "delete-station" ? item.stations.filter((asset) => asset.id !== assetId) : item.stations,
      depots: action === "delete-depot" ? item.depots.filter((asset) => asset.id !== assetId) : item.depots,
      transfers:
        action === "delete-transfer"
          ? item.transfers.filter((asset) => asset.id !== assetId)
          : action === "delete-station"
            ? item.transfers.filter((asset) => !asset.stationIds.includes(assetId))
            : item.transfers,
    }));
  }
  redoStack = [];
  persistState();
  renderPlanningDialog();
  renderAll();
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
  planComparisonList.innerHTML = plans
    .filter((plan) => plan.cityId === currentMeta.cityId)
    .sort((a, b) => b.expectedDemand - a.expectedDemand)
    .map(
      (plan) => `<button type="button" class="comparison-card ${plan.id === activePlanId ? "active" : ""}" data-plan-id="${plan.id}">
        <span>${statusLabels[plan.status]} · ${formatPriority(plan.priority)}</span>
        <strong>${escapeHtml(plan.name)}</strong>
        <dl><div><dt>비용</dt><dd>${formatCost(plan.expectedTotalCost)}</dd></div><div><dt>수요</dt><dd>${plan.expectedDemand.toLocaleString("ko-KR")}</dd></div><div><dt>수익</dt><dd>${formatCost(plan.expectedRevenue)}/년</dd></div><div><dt>공기</dt><dd>${plan.expectedConstructionDays > 0 ? formatConstructionDuration(plan.expectedConstructionDays) : "미정"}</dd></div><div><dt>지형</dt><dd>${formatPlanDifficulty(plan.terrainDifficulty)}</dd></div><div><dt>환승</dt><dd>+${plan.transferEffect}</dd></div></dl>
      </button>`,
    )
    .join("");
  planComparisonList.querySelectorAll<HTMLButtonElement>("[data-plan-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activePlanId = button.dataset.planId ?? null;
      renderPlanningDialog();
      renderAll();
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
        ? { latLng: actualSnap.latLng, plannedRouteIds: [] as string[], actualRouteIds: findRoutesNearLatLng(actualSnap.latLng, 55), distancePx: actualSnap.distancePx }
        : null;
  if (!best || best.distancePx > stationSnapPx) {
    setText(facilityReadout, "계획 또는 실제 노선 위에 역을 배치하세요.");
    return;
  }
  pushHistory();
  const station: PlannedStation = {
    id: createId("planned-station"),
    name: `계획 역 ${plan.stations.length + 1}`,
    position: [roundCoord(best.latLng.lat), roundCoord(best.latLng.lng)],
    plannedRouteIds: best.plannedRouteIds,
    actualRouteIds: best.actualRouteIds,
    expectedDemand: estimateStationDemand(best.latLng, best.plannedRouteIds.length + best.actualRouteIds.length),
    completed: false,
  };
  updatePlan(plan.id, (item) => ({ ...item, stations: [...item.stations, station] }));
  redoStack = [];
  persistState();
  renderAll();
  showToast("예정 역을 계획에 추가했습니다.");
}

function renderPlans() {
  planLayer.clearLayers();
  for (const plan of plans.filter((item) => item.cityId === currentMeta.cityId)) {
    const isActive = plan.id === activePlanId;
    for (const route of plan.routes) {
      const remainingSegments = route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id));
      for (const group of groupContiguousPlanSegments(route, remainingSegments)) {
        const latLngs = group.flatMap((segment, index) => (index === 0 ? segment.coordinates : segment.coordinates.slice(1))).map(([lat, lng]) => L.latLng(lat, lng));
        if (latLngs.length < 2) continue;
        L.polyline(latLngs, routeStyle("rgba(4, 10, 14, 0.72)", isActive ? 10 : 8, isActive ? 0.7 : 0.5)).addTo(planLayer);
        L.polyline(latLngs, {
          ...routeStyle(route.color, isActive ? 6 : 5, isActive ? 0.8 : 0.56),
          dashArray: isActive ? "15 9" : "12 10",
        }).addTo(planLayer);
      }
      if (planningMode && (activeTool === "extend" || activeTool === "merge") && isActive && remainingSegments.length > 0) {
        renderExtensionEndpointHandle(L.latLng(...route.coordinates[0]), route.color);
        renderExtensionEndpointHandle(L.latLng(...route.coordinates[route.coordinates.length - 1]), route.color);
      }
    }
    for (const transfer of plan.transfers.filter((item) => !item.completed)) {
      const transferPoints = [
        ...transfer.stationIds.map((id) => plan.stations.find((station) => station.id === id)).filter(Boolean).map((station) => L.latLng(...(station as PlannedStation).position)),
        ...(transfer.actualStationIds ?? []).map((id) => stations.find((station) => station.id === id)).filter(Boolean).map((station) => L.latLng(...(station as Station).position)),
      ];
      if (transferPoints.length === 2)
        L.polyline(transferPoints, { color: "#c8d2d8", weight: 2, opacity: 0.5, dashArray: "2 6", interactive: false }).addTo(planLayer);
    }
    for (const station of plan.stations.filter((item) => !item.completed)) {
      const selected = selectedPlannedStationIds.includes(station.id);
      L.circleMarker(L.latLng(...station.position), { radius: selected ? 8 : 6, color: "#d9e1e5", weight: 2, fillColor: "#56636b", fillOpacity: 0.65, dashArray: "3 2", interactive: false }).addTo(planLayer);
    }
    for (const depot of plan.depots.filter((item) => !item.completed)) {
      L.polygon(depot.polygon.map(([lat, lng]) => L.latLng(lat, lng)), { color: "#aeb9bf", fillColor: "#77848b", fillOpacity: 0.12, weight: 2, opacity: 0.7, dashArray: "7 7", interactive: false }).addTo(planLayer);
    }
  }
  if (planningMode && activeTool === "extend") {
    for (const route of routes.filter((route) => route.coordinates.length >= 2)) {
      renderExtensionEndpointHandle(L.latLng(...route.coordinates[0]), route.color);
      renderExtensionEndpointHandle(L.latLng(...route.coordinates[route.coordinates.length - 1]), route.color);
    }
  }
}

function renderExtensionEndpointHandle(point: LatLng, color: string) {
  L.circleMarker(point, { radius: 10, color: "#ffffff", weight: 3, fillColor: "#071116", fillOpacity: 0.95, interactive: false }).addTo(planLayer);
  L.circleMarker(point, { radius: 5, color, weight: 2, fillColor: color, fillOpacity: 1, interactive: false }).addTo(planLayer);
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
  const items: string[] = [];
  for (const route of plan.routes) {
    const remainingSegments = route.segments.filter((segment) => !route.completedSegmentIds.includes(segment.id));
    if (remainingSegments.length === 0) continue;
    const routeLength = remainingSegments.reduce((sum, segment) => sum + segment.lengthKm, 0);
    const routeCost = remainingSegments.reduce((sum, segment) => sum + segment.constructionCost, 0);
    items.push(`<section class="plan-conversion-route" data-route-id="${route.id}"><label class="plan-conversion-route-toggle"><input type="checkbox" checked data-route-toggle="${route.id}" /><span><strong>${escapeHtml(route.name)}</strong><small>${remainingSegments.length}개 구간 · ${routeLength.toFixed(2)}km · ${formatCost(routeCost)}</small></span></label><details><summary>구간 직접 선택</summary><div class="plan-conversion-segments">`);
    route.segments.forEach((segment, index) => {
      if (route.completedSegmentIds.includes(segment.id)) return;
      items.push(`<label><input type="checkbox" checked data-convert-kind="segment" data-route-id="${route.id}" data-asset-id="${segment.id}" /><span><strong>${escapeHtml(route.name)} · ${index + 1}구간</strong><small>${segment.lengthKm.toFixed(2)}km · ${formatCost(segment.constructionCost)}</small></span></label>`);
    });
    items.push(`</div></details></section>`);
  }
  for (const station of plan.stations.filter((item) => !item.completed))
    items.push(`<label><input type="checkbox" checked data-convert-kind="station" data-asset-id="${station.id}" /><span><strong>${escapeHtml(station.name)}</strong><small>역 건설 · ${formatCost(180)}</small></span></label>`);
  for (const depot of plan.depots.filter((item) => !item.completed))
    items.push(`<label><input type="checkbox" checked data-convert-kind="depot" data-asset-id="${depot.id}" /><span><strong>${escapeHtml(depot.name)}</strong><small>${depot.capacity}편성 · ${formatCost(depot.expectedCost)}</small></span></label>`);
  for (const transfer of plan.transfers.filter((item) => !item.completed))
    items.push(`<label><input type="checkbox" checked data-convert-kind="transfer" data-asset-id="${transfer.id}" /><span><strong>환승 연결</strong><small>예상 효과 +${transfer.expectedEffect} · ${formatCost(40)}</small></span></label>`);
  planConversionItems.innerHTML = items.join("") || `<div class="planning-empty">건설할 미완료 항목이 없습니다.</div>`;
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
    return sum;
  }, 0);
}

function renderPlanConversionSummary() {
  const plan = getActivePlan(false);
  if (!plan || !planConversionSummary) return;
  const selection = getPlanConversionSelection();
  const cost = calculatePlanConversionCost(plan, selection);
  const shortfall = Math.max(0, cost - economy.cash);
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
        state.cost + segment.constructionCost <= economy.cash ? { count: state.count + 1, cost: state.cost + segment.constructionCost } : state,
      { count: 0, cost: 0 },
    );
  planConversionSummary.innerHTML = `
    <div><span>선택 비용</span><strong>${formatCost(cost)}</strong></div>
    <div><span>건설 후 잔액</span><strong class="${shortfall > 0 ? "negative" : ""}">${formatSignedCost(economy.cash - cost)}</strong></div>
    ${invalidFacilities > 0 ? `<p>${invalidFacilities}개 시설이 선택한 건설 구간 또는 기존 노선과 연결되지 않습니다. 연결 구간을 함께 선택하세요.</p>` : shortfall > 0 ? `<p>자금이 ${formatCost(shortfall)} 부족합니다. 현재 자금으로 저비용 구간 기준 최대 ${affordableSegments.count}개 구간을 건설할 수 있습니다.</p>` : `<p>선택 항목을 한 번의 작업으로 건설할 수 있습니다.</p>`}`;
  if (confirmPlanConversionButton)
    confirmPlanConversionButton.disabled = selection.length === 0 || invalidFacilities > 0 || (currentMeta.mode === "career" && shortfall > 0);
  if (fundPlanWithLoanButton) fundPlanWithLoanButton.hidden = currentMeta.mode !== "career" || shortfall <= 0;
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
  if (currentMeta.mode !== "career") return;
  takeLoan();
  renderPlanConversionSummary();
}

async function confirmPlanConversion() {
  const plan = getActivePlan(false);
  if (!plan) return;
  const selection = getPlanConversionSelection();
  const cost = calculatePlanConversionCost(plan, selection);
  if (selection.length === 0 || (currentMeta.mode === "career" && cost > economy.cash)) return;
  const before = cloneState();
  const createdRouteIds: string[] = [];
  const createdStationIds: string[] = [];
  const createdDepotIds: string[] = [];
  try {
    for (const plannedRoute of plan.routes) {
      const selectedIds = selection.filter((item) => item.kind === "segment" && item.routeId === plannedRoute.id).map((item) => item.assetId);
      if (selectedIds.length === 0) continue;
      if (plannedRoute.actualExtension) {
        if (selectedIds.length !== plannedRoute.segments.length) {
          throw new Error("An extension plan must be built as a complete route.");
        }
        const targetRoute = routes.find((route) => route.id === plannedRoute.actualExtension?.routeId);
        if (!targetRoute) throw new Error("Extension target route missing.");
        const addition = plannedRoute.coordinates.slice(1);
        const coordinates = plannedRoute.actualExtension.atStart
          ? [...addition.slice().reverse(), ...targetRoute.coordinates]
          : [...targetRoute.coordinates, ...addition];
        const extensionLength = plannedRoute.segments.reduce((sum, segment) => sum + segment.lengthKm, 0);
        const extensionCost = plannedRoute.segments.reduce((sum, segment) => sum + segment.constructionCost, 0);
        const extensionRiverCrossings = plannedRoute.segments.reduce((sum, segment) => sum + segment.terrainImpact.riverCrossings, 0);
        const extensionMountainSegments = plannedRoute.segments.reduce((sum, segment) => sum + segment.terrainImpact.mountainSegments, 0);
        const updatedRoute = rebuildRouteGraph({
          ...targetRoute,
          coordinates,
          lengthKm: Math.round((targetRoute.lengthKm + extensionLength) * 10) / 10,
          constructionCost: targetRoute.constructionCost + extensionCost,
          riverCrossings: targetRoute.riverCrossings + extensionRiverCrossings,
          mountainSegments: targetRoute.mountainSegments + extensionMountainSegments,
        });
        routes = routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
        createdRouteIds.push(updatedRoute.id);
        continue;
      }
      const selectedSegments = plannedRoute.segments.filter((segment) => selectedIds.includes(segment.id));
      const groups = groupContiguousPlanSegments(plannedRoute, selectedSegments);
      groups.forEach((group, index) => {
        const coordinates = group.flatMap((segment, segmentIndex) => segmentIndex === 0 ? segment.coordinates : segment.coordinates.slice(1));
        const routeId = createId("route");
        const actualRoute = rebuildRouteGraph({
          id: routeId,
          name: groups.length === 1 ? plannedRoute.name : `${plannedRoute.name} ${index + 1}단계`,
          color: plannedRoute.color,
          coordinates,
          lengthKm: Math.round(group.reduce((sum, segment) => sum + segment.lengthKm, 0) * 10) / 10,
          constructionCost: group.reduce((sum, segment) => sum + segment.constructionCost, 0),
          riverCrossings: group.reduce((sum, segment) => sum + segment.terrainImpact.riverCrossings, 0),
          mountainSegments: group.reduce((sum, segment) => sum + segment.terrainImpact.mountainSegments, 0),
          riverMode: group.some((segment) => segment.constructionMode === "tunnel") ? "tunnel" : "bridge",
          visibility: "public",
          localServiceEnabled: true,
          expressServiceEnabled: false,
          operationPaused: false,
        });
        routes = [...routes, actualRoute];
        createdRouteIds.push(actualRoute.id);
      });
    }
    updatePlan(plan.id, (item) => ({
      ...item,
      routes: item.routes.map((route) => ({
        ...route,
        completedSegmentIds: Array.from(new Set([...route.completedSegmentIds, ...selection.filter((entry) => entry.kind === "segment" && entry.routeId === route.id).map((entry) => entry.assetId)])),
      })),
    }));
    const currentPlan = plans.find((item) => item.id === plan.id)!;
    for (const entry of selection.filter((item) => item.kind === "station")) {
      const plannedStation = currentPlan.stations.find((station) => station.id === entry.assetId);
      if (!plannedStation || plannedStation.completed) continue;
      const point = L.latLng(...plannedStation.position);
      const connectedRouteIds = findRoutesNearLatLng(point, 70);
      const station: Station = {
        id: createId("station"),
        name: plannedStation.name.replace(/^계획 /, ""),
        position: plannedStation.position,
        demand: plannedStation.expectedDemand,
        connectedRouteIds,
        routeNodeIds: connectedRouteIds.map((routeId) => findNearestGraphNodeId(routes.find((route) => route.id === routeId), point)).filter((id): id is string => Boolean(id)),
      };
      stations = [...stations, station];
      createdStationIds.push(station.id);
      updatePlan(plan.id, (item) => ({ ...item, stations: item.stations.map((planned) => planned.id === plannedStation.id ? { ...planned, completed: true, actualStationId: station.id } : planned) }));
    }
    for (const entry of selection.filter((item) => item.kind === "depot")) {
      const plannedDepot = plans.find((item) => item.id === plan.id)?.depots.find((depot) => depot.id === entry.assetId);
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
      depots = [...depots, depot];
      createdDepotIds.push(depot.id);
      updatePlan(plan.id, (item) => ({ ...item, depots: item.depots.map((planned) => planned.id === plannedDepot.id ? { ...planned, completed: true, actualDepotId: depot.id } : planned) }));
    }
    for (const entry of selection.filter((item) => item.kind === "transfer")) {
      const current = plans.find((item) => item.id === plan.id);
      const plannedTransfer = current?.transfers.find((transfer) => transfer.id === entry.assetId);
      if (!plannedTransfer || plannedTransfer.completed) continue;
      const actualStationIds = [
        ...(plannedTransfer.actualStationIds ?? []),
        ...plannedTransfer.stationIds.map((id) => current?.stations.find((station) => station.id === id)?.actualStationId).filter((id): id is string => Boolean(id)),
      ];
      if (actualStationIds.length >= 2) createTransferGroup(actualStationIds, false);
      updatePlan(plan.id, (item) => ({ ...item, transfers: item.transfers.map((transfer) => transfer.id === entry.assetId ? { ...transfer, completed: actualStationIds.length >= 2 } : transfer) }));
    }
    economy = { ...economy, cash: economy.cash - cost, constructionSpent: economy.constructionSpent + cost };
    if (usesConstructionTimeline()) {
      constructionProjects = [
        ...constructionProjects,
        ...createPlanConstructionProjects(plan, createdRouteIds, createdStationIds, createdDepotIds),
      ];
    }
    plans = plans.map((item) => item.id === plan.id ? recalculatePlan(item) : item);
    const convertedPlan = plans.find((item) => item.id === plan.id);
    const planCompleted = convertedPlan ? isPlanFullyConverted(convertedPlan) : false;
    if (planCompleted) {
      plans = plans.filter((item) => item.id !== plan.id);
      if (activePlanId === plan.id) activePlanId = null;
    }
    synchronizeGraphReferences();
    currentMeta = { ...currentMeta, updatedAt: Date.now() };
    persistState();
    await writeSaveSlot(cloneState());
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    closePlanConversionDialog();
    renderPlanningDialog();
    renderAll();
    showToast(planCompleted ? "계획 전체를 실제 건설로 전환해 목록에서 정리했습니다." : "선택한 계획 항목을 실제 건설로 전환했습니다.");
    playFeedback("confirm");
  } catch (error) {
    applyState(before);
    persistState();
    try {
      await writeSaveSlot(before);
    } catch {
      // In-memory rollback remains authoritative.
    }
    renderAll();
    showError("계획 전환 중 문제가 발생해 전체 작업을 되돌렸습니다.");
    console.error(error);
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
    plan.transfers.every((transfer) => transfer.completed)
  );
}

/**
 * 현재 게임 상태를 지도와 HUD 전체에 반영하는 중앙 렌더 함수.
 * 상태를 변경한 호출자는 개별 화면을 빠뜨리지 않도록 가능하면 이 진입점을 사용한다.
 * selectedId가 있으면 다시 그린 뒤에도 해당 노선의 선택 강조를 유지한다.
 */
function renderAll(selectedId?: string) {
  lastMapRenderLod = getLodMode(map.getZoom());
  if (selectedRouteId && !routes.some((route) => route.id === selectedRouteId)) selectedRouteId = null;
  if (selectedId && routes.some((route) => route.id === selectedId)) selectedRouteId = selectedId;
  document.body.classList.toggle("has-network", routes.length > 0);
  document.body.classList.toggle("has-route-selection", Boolean(selectedRouteId));
  document.body.dataset.activeTool = activeTool;
  regeneratePassengerGroups();
  updateOperationRouteOptions();
  renderRoutes(selectedRouteId ?? selectedId);
  renderConstructionProjects();
  renderPlans();
  if (activeTool === "reconnect") renderRepairGuide();
  if (activeTool === "edit") renderEditHandles();
  else if (activeTool === "eraser") renderDeleteGuide();
  else if (activeTool === "merge") renderMergeGuide();
  else editGuideLayer.clearLayers();
  renderDepots(selectedId);
  renderStations(selectedId);
  renderTrains();
  updateHud(selectedRouteId ?? selectedId);
  updateSelectedLinePanel();
  updateOperationHud();
  updateEconomyHud();
  refreshOperationSuggestions();
  updateAnalysisBadge();
  updateConstructionBadge();
  updateNewsBadge();
  updateTutorialProgress();
}

async function initializeGameShell() {
  applySettingsToUi();
  renderCityOptions();
  try {
    slotSummaries = await listSaveSlots();
  } catch {
    slotSummaries = [];
  }
  if (slotSummaries.length === 0) loadSavedState();
  renderStartScreen();
  if (slotSummaries.length > 0 && startScreen) startScreen.hidden = false;
  if (slotSummaries.length === 0 && routes.length > 0) {
    currentMeta = createDefaultMeta();
    await saveCurrentSlot("기존 저장 이전");
  }
  startAutoSave();
  void updateCacheReadout();
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
          <button class="slot-delete-button" data-delete-slot-id="${slot.slotId}" data-slot-name="${escapeHtml(slot.slotName)}" type="button" aria-label="${escapeHtml(`${slot.slotName} 세이브 삭제`)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </article>
      `;
    })
    .join("");
  slotList.querySelectorAll<HTMLButtonElement>(".slot-card").forEach((button) => {
    button.addEventListener("click", () => loadSlot(button.dataset.slotId || ""));
  });
  slotList.querySelectorAll<HTMLButtonElement>(".slot-delete-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      requestSaveSlotDeletion(button.dataset.deleteSlotId || "", button.dataset.slotName || "이 세이브");
    });
  });
}

function requestSaveSlotDeletion(slotId: string, slotName: string) {
  if (!slotId) return;
  const isActiveSlot = slotId === currentMeta.slotId;
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
  const deletesActiveSlot = currentMeta.slotId === slotId;
  const fallbackRaw = localStorage.getItem(fallbackSaveKey);
  const legacyStateRaw = localStorage.getItem("draw-gyotong-state");
  const legacyRoutesRaw = localStorage.getItem("draw-gyotong-routes");
  const remainingFallbackSlots = readFallbackSlots().filter((state) => state.meta?.slotId !== slotId);
  try {
    if (remainingFallbackSlots.length === 0) localStorage.removeItem(fallbackSaveKey);
    else localStorage.setItem(fallbackSaveKey, JSON.stringify(remainingFallbackSlots));

    let db: IDBDatabase | null = null;
    try {
      db = await openSaveDb();
      const transaction = db.transaction("slots", "readwrite");
      const transactionComplete = idbTransactionDone(transaction);
      await idbRequest(transaction.objectStore("slots").delete(slotId));
      await transactionComplete;
    } catch (error) {
      // The local backup is the supported fallback only when IndexedDB itself is unavailable.
      // If an opened database cannot commit the delete, restore the backup rather than showing a slot
      // that would be resurrected from IndexedDB on the next launch.
      if (db) throw error;
    } finally {
      db?.close();
    }

    if (deletesActiveSlot) {
      localStorage.removeItem("draw-gyotong-state");
      localStorage.removeItem("draw-gyotong-routes");
      if (autoSaveTimer) window.clearInterval(autoSaveTimer);
      autoSaveTimer = 0;
      resetWorld();
      currentMeta = createDefaultMeta();
      if (startScreen) startScreen.hidden = false;
      renderAll();
    }

    slotSummaries = await listSaveSlots();
    renderStartScreen();
    showToast("세이브를 삭제했습니다.");
    playFeedback("confirm");
  } catch (error) {
    if (fallbackRaw === null) localStorage.removeItem(fallbackSaveKey);
    else localStorage.setItem(fallbackSaveKey, fallbackRaw);
    if (legacyStateRaw === null) localStorage.removeItem("draw-gyotong-state");
    else localStorage.setItem("draw-gyotong-state", legacyStateRaw);
    if (legacyRoutesRaw === null) localStorage.removeItem("draw-gyotong-routes");
    else localStorage.setItem("draw-gyotong-routes", legacyRoutesRaw);
    showError("세이브를 삭제하지 못했습니다. 저장 공간 상태를 확인한 뒤 다시 시도해 주세요.");
    console.error(error);
  }
}

function renderCityOptions() {
  if (!citySelect) return;
  const selectedMode = (modeSelect?.value as GameMode) || "sandbox";
  const unlocked = selectedMode === "sandbox" ? (Object.keys(cityConfigs) as CityId[]) : getUnlockedCityIds();
  const current = (citySelect.value as CityId) || "seoul";
  citySelect.innerHTML = (Object.keys(cityConfigs) as CityId[])
    .map((cityId) => {
      const locked = !unlocked.includes(cityId);
      return `<option value="${cityId}" ${locked ? "disabled" : ""}>${cityConfigs[cityId].name}${locked ? " 잠김" : ""}</option>`;
    })
    .join("");
  citySelect.value = unlocked.includes(current) ? current : "seoul";
  updateCityNote();
}

function updateCityNote() {
  const cityId = ((citySelect?.value as CityId) || "seoul");
  setText(cityNote, `${cityConfigs[cityId].name}: ${cityConfigs[cityId].description}`);
}

function getUnlockedCityIds() {
  const unlocked = new Set<CityId>(["seoul"]);
  for (const slot of slotSummaries) slot.unlockedCityIds.forEach((cityId) => unlocked.add(cityId));
  if (economy.cash >= 85000) unlocked.add("daejeon");
  if (economy.cash >= 130000) unlocked.add("gwangju");
  if (economy.cash >= 180000) unlocked.add("busan");
  return Array.from(unlocked);
}

async function createNewGame(mode: GameMode, difficulty: Difficulty, cityId: CityId, slotName: string) {
  resetWorld();
  const now = Date.now();
  currentMeta = {
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
  };
  economy = {
    ...defaultEconomy,
    cash: mode === "sandbox" ? 999999999 : difficultyConfigs[difficulty].startCash,
  };
  newsEvents = [createNewsEvent(0)];
  map.setView(cityConfigs[cityId].center, 12);
  persistState();
  if (newGameButton) newGameButton.disabled = true;
  const saved = await saveCurrentSlot("새 세이브");
  if (newGameButton) newGameButton.disabled = false;
  if (!saved) {
    showError("세이브를 만들지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
    return;
  }
  if (startScreen) startScreen.hidden = true;
  startAutoSave();
  renderAll();
}

function resetWorld() {
  routes = [];
  stations = [];
  transfers = [];
  depots = [];
  plans = [];
  diagramState = { ...defaultDiagramState, autoPositions: {}, manualPositions: {} };
  analysisState = { ...defaultAnalysisState, demandHistory: [], suggestions: [], decisions: {} };
  statisticsState = { ...defaultStatisticsState, dailyRecords: [] };
  constructionProjects = [];
  newsEvents = [];
  trainFleets = [];
  expressConfigs = [];
  passengerGroups = [];
  loans = [];
  undoStack = [];
  redoStack = [];
  selectedOperationRouteId = "";
  selectedRouteId = null;
  activePlanId = null;
  planningMode = false;
  selectedDepotId = null;
  selectedTransferStationIds = [];
  selectedPlannedStationIds = [];
  selectedManualTransferEndpoints = [];
  deleteAnchor = null;
  plannedDeleteAnchor = null;
  plannedMergeFirstEndpoint = null;
  mergeFirstEndpoint = null;
  pendingMerge = null;
  simSpeed = 0;
  simMinutes = 360;
  simDayAccumulator = 0;
}

async function loadSlot(slotId: string) {
  const state = await readSaveSlot(slotId);
  if (!state) return;
  applyState(state);
  currentMeta = { ...createDefaultMeta(), ...(state.meta ?? {}), slotId };
  map.setView(cityConfigs[currentMeta.cityId].center, 12);
  if (startScreen) startScreen.hidden = true;
  startAutoSave();
  persistState();
  renderAll();
  setText(saveStatus, "불러옴");
}

async function saveCurrentSlot(label: string): Promise<boolean> {
  currentMeta = {
    ...currentMeta,
    updatedAt: Date.now(),
    unlockedCityIds: currentMeta.mode === "sandbox" ? (Object.keys(cityConfigs) as CityId[]) : getUnlockedCityIds(),
  };
  const state = cloneState();
  state.meta = currentMeta;
  try {
    await writeSaveSlot(state);
    slotSummaries = await listSaveSlots();
    setText(saveStatus, label);
    return true;
  } catch {
    setText(saveStatus, "저장 실패");
    showError("저장 공간에 접근할 수 없습니다. 브라우저 저장 공간을 확인해 주세요.");
    return false;
  }
}

function startAutoSave() {
  if (autoSaveTimer) window.clearInterval(autoSaveTimer);
  autoSaveTimer = 0;
  if (!settings.autoSaveEnabled) return;
  autoSaveTimer = window.setInterval(() => void saveCurrentSlot("자동 저장"), settings.autoSaveIntervalSeconds * 1000);
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

/**
 * 과거 버전 또는 localStorage에서 읽은 값을 현재 SaveState 구조로 승격한다.
 * 외부 입력을 그대로 신뢰하지 않고 누락 필드에 기본값을 채우므로, 저장 스키마를
 * 변경할 때는 기존 세이브가 계속 열리도록 이 함수에도 변환 규칙을 추가해야 한다.
 */
function migrateSaveStateRecord(input: unknown): SaveState {
  const source = input && typeof input === "object" ? (input as Partial<SaveState>) : {};
  const defaultMeta = createDefaultMeta();
  const sourceMeta: Partial<GameMeta> = source.meta ?? {};
  const slotSeed = `${sourceMeta.createdAt ?? 0}:${sourceMeta.slotName ?? "legacy"}`;
  const slotId = ensureStableId(sourceMeta.slotId, "slot", slotSeed);
  const tutorialProgress = sourceMeta.tutorialProgress
    ? { ...createTutorialProgress(), ...sourceMeta.tutorialProgress }
    : createTutorialProgress();
  const meta: GameMeta = {
    ...defaultMeta,
    ...sourceMeta,
    slotId,
    slotName: sourceMeta.slotName?.trim() || defaultMeta.slotName,
    unlockedCityIds: Array.isArray(sourceMeta.unlockedCityIds) && sourceMeta.unlockedCityIds.length > 0 ? sourceMeta.unlockedCityIds : ["seoul"],
    playTimeSeconds: Math.max(0, sourceMeta.playTimeSeconds ?? 0),
    tutorialStep: sourceMeta.tutorialProgress ? Math.max(0, sourceMeta.tutorialStep ?? 0) : sourceMeta.tutorialCompleted ? tutorialSteps.length - 1 : 0,
    tutorialProgress,
  };
  const migratedRoutes = (Array.isArray(source.routes) ? source.routes : []).map((route, index) => {
    const routeId = ensureStableId(route?.id, "route", `${slotId}:${index}`);
    return {
      ...route,
      id: routeId,
      coordinates: Array.isArray(route?.coordinates) ? route.coordinates : [],
      disabledSegments: Array.isArray(route?.disabledSegments) ? route.disabledSegments : [],
      nodes: (route?.nodes ?? []).map((node, nodeIndex) => ({
        ...node,
        id: ensureStableId(node.id, "node", `${routeId}:${nodeIndex}:${node.position?.join(",")}`),
      })),
      segments: (route?.segments ?? []).map((segment, segmentIndex) => ({
        ...segment,
        id: ensureStableId(segment.id, "segment", `${routeId}:${segmentIndex}:${segment.coordinates?.flat().join(",")}`),
        enabled: segment.enabled ?? true,
      })),
      branches: (route?.branches ?? []).map((branch, branchIndex) => ({
        ...branch,
        id: ensureStableId(branch.id, "branch", `${routeId}:${branchIndex}`),
        segmentIds: branch.segmentIds ?? [],
        dispatchWeight: branch.dispatchWeight ?? 1,
      })),
      servicePatterns: (route?.servicePatterns ?? []).map((pattern, patternIndex) => ({
        ...pattern,
        id: ensureStableId(pattern.id, "pattern", `${routeId}:${pattern.kind}:${patternIndex}`),
        branchIds: pattern.branchIds ?? [],
        dispatchMode: "equal" as const,
      })),
    } as RouteLine;
  });
  const migratedStations = (Array.isArray(source.stations) ? source.stations : []).map((station, index) => ({
    ...station,
    id: ensureStableId(station?.id, "station", `${slotId}:${index}:${station?.position?.join(",")}`),
    connectedRouteIds: station?.connectedRouteIds ?? [],
    routeNodeIds: station?.routeNodeIds ?? [],
  })) as Station[];
  const migratedDepots = (Array.isArray(source.depots) ? source.depots : []).map((depot, index) => ({
    ...depot,
    id: ensureStableId(depot?.id, "depot", `${slotId}:${index}`),
    connectedRouteIds: depot?.connectedRouteIds ?? [],
  })) as Depot[];
  return {
    schemaVersion: currentSaveSchemaVersion,
    meta,
    routes: migratedRoutes,
    stations: migratedStations,
    transfers: (Array.isArray(source.transfers) ? source.transfers : []).map((transfer, index) => ({
      ...transfer,
      id: ensureStableId(transfer?.id, "transfer", `${slotId}:${index}`),
      stationIds: transfer?.stationIds ?? [],
    })) as TransferGroup[],
    depots: migratedDepots,
    plans: migratePlansWithStableIds(Array.isArray(source.plans) ? source.plans : [], slotId),
    diagramState: source.diagramState,
    analysisState: normalizeAnalysisState(source.analysisState),
    statisticsState: normalizeStatisticsState(source.statisticsState),
    constructionProjects: normalizeConstructionProjects(
      (Array.isArray(source.constructionProjects) ? source.constructionProjects : []).map((project, index) => ({
        ...project,
        id: ensureStableId(project?.id, "construction", `${slotId}:${index}:${project?.name ?? ""}`),
        events: (project?.events ?? []).map((event, eventIndex) => ({
          ...event,
          id: ensureStableId(event?.id, "construction-event", `${slotId}:${index}:${eventIndex}`),
        })),
      })),
    ),
    newsEvents: normalizeNewsEvents(
      (Array.isArray(source.newsEvents) ? source.newsEvents : []).map((event, index) => ({
        ...event,
        id: ensureStableId(event?.id, "news", `${slotId}:${index}:${event?.title ?? ""}`),
      })),
    ),
    trainFleets: Array.isArray(source.trainFleets) ? source.trainFleets.map((fleet, index) => ({
      ...fleet,
      id: ensureStableId(fleet?.id, "fleet", `${slotId}:${index}`),
    })) : [],
    expressConfigs: Array.isArray(source.expressConfigs) ? source.expressConfigs : [],
    passengerGroups: Array.isArray(source.passengerGroups) ? source.passengerGroups : [],
    loans: Array.isArray(source.loans) ? source.loans.map((loan, index) => ({
      ...loan,
      id: ensureStableId(loan?.id, "loan", `${slotId}:${index}`),
    })) : [],
    economy: { ...defaultEconomy, ...(source.economy ?? {}) },
  };
}

function ensureStableId(value: unknown, prefix: string, seed: string) {
  return typeof value === "string" && value.trim() ? value : stableEntityId(prefix, seed);
}

function stableEntityId(prefix: string, seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function migratePlansWithStableIds(sourcePlans: ConstructionPlan[], slotId: string): ConstructionPlan[] {
  return sourcePlans.map((plan, planIndex) => {
    const planId = ensureStableId(plan?.id, "plan", `${slotId}:${planIndex}:${plan?.name ?? ""}`);
    return {
      ...plan,
      id: planId,
      routes: (plan?.routes ?? []).map((route, routeIndex) => {
        const routeId = ensureStableId(route?.id, "planned-route", `${planId}:${routeIndex}`);
        return {
          ...route,
          id: routeId,
          segments: (route?.segments ?? []).map((segment, segmentIndex) => ({
            ...segment,
            id: ensureStableId(segment?.id, "planned-segment", `${routeId}:${segmentIndex}`),
          })),
          completedSegmentIds: route?.completedSegmentIds ?? [],
        };
      }),
      stations: (plan?.stations ?? []).map((station, stationIndex) => ({
        ...station,
        id: ensureStableId(station?.id, "planned-station", `${planId}:${stationIndex}`),
      })),
      depots: (plan?.depots ?? []).map((depot, depotIndex) => ({
        ...depot,
        id: ensureStableId(depot?.id, "planned-depot", `${planId}:${depotIndex}`),
      })),
      transfers: (plan?.transfers ?? []).map((transfer, transferIndex) => ({
        ...transfer,
        id: ensureStableId(transfer?.id, "planned-transfer", `${planId}:${transferIndex}`),
        stationIds: transfer?.stationIds ?? [],
        actualStationIds: transfer?.actualStationIds ?? [],
      })),
    };
  });
}

function openSaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("draw-gyotong-saves", saveDatabaseVersion);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const store = db.objectStoreNames.contains("slots")
        ? request.transaction!.objectStore("slots")
        : db.createObjectStore("slots", { keyPath: "meta.slotId" });
      if (event.oldVersion < 2) {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          cursor.update(migrateSaveStateRecord(cursor.value));
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeSaveSlot(state: SaveState) {
  const migratedState = migrateSaveStateRecord(state);
  writeFallbackSlot(migratedState);
  try {
    const db = await openSaveDb();
    try {
      await idbRequest(db.transaction("slots", "readwrite").objectStore("slots").put(migratedState));
    } finally {
      db.close();
    }
  } catch {
    // The local backup was already written; IndexedDB is an enhancement.
  }
}

async function readSaveSlot(slotId: string): Promise<SaveState | null> {
  try {
    const db = await openSaveDb();
    try {
      const state = (await idbRequest(db.transaction("slots", "readonly").objectStore("slots").get(slotId))) as SaveState | undefined;
      if (state) return migrateSaveStateRecord(state);
    } finally {
      db.close();
    }
  } catch {
    // Local backup keeps the game playable when IndexedDB is unavailable.
  }
  return readFallbackSlots().find((state) => state.meta?.slotId === slotId) ?? null;
}

async function listSaveSlots(): Promise<SaveSlotSummary[]> {
  let indexedStates: SaveState[] = [];
  try {
    const db = await openSaveDb();
    try {
      indexedStates = ((await idbRequest(db.transaction("slots", "readonly").objectStore("slots").getAll())) as SaveState[]).map(migrateSaveStateRecord);
    } finally {
      db.close();
    }
  } catch {
    indexedStates = [];
  }
  const statesById = new Map<string, SaveState>();
  for (const state of [...indexedStates, ...readFallbackSlots()]) {
    const slotId = state.meta?.slotId;
    if (!slotId) continue;
    const current = statesById.get(slotId);
    if (!current || (state.meta?.updatedAt ?? 0) >= (current.meta?.updatedAt ?? 0)) statesById.set(slotId, state);
  }
  return Array.from(statesById.values())
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

function readFallbackSlots(): SaveState[] {
  try {
    const raw = localStorage.getItem(fallbackSaveKey);
    const slots = raw ? (JSON.parse(raw) as SaveState[]) : [];
    return Array.isArray(slots) ? slots.filter((state) => state?.meta?.slotId).map(migrateSaveStateRecord) : [];
  } catch {
    return [];
  }
}

function writeFallbackSlot(state: SaveState) {
  const slotId = state.meta?.slotId;
  if (!slotId) throw new Error("Save slot metadata is missing");
  const slots = readFallbackSlots().filter((item) => item.meta?.slotId !== slotId);
  slots.unshift(state);
  localStorage.setItem(fallbackSaveKey, JSON.stringify(slots.slice(0, 12)));
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTransactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function hasRouteGaps(route: RouteLine) {
  return (route.disabledSegments?.length ?? 0) > 0;
}

/**
 * 철거 등으로 비활성화된 구간을 경계로 노선을 연속된 운행 구간(run)들로 나눈다.
 * 지도 렌더링과 열차 이동은 끊어진 선을 하나의 경로로 취급하면 안 되므로 이 결과를 쓴다.
 */
function getRouteRuns(route: RouteLine) {
  const points = route.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
  const gaps = new Set(route.disabledSegments ?? []);
  const runs: LatLng[][] = [];
  let currentRun: LatLng[] = points.length > 0 ? [points[0]] : [];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (gaps.has(index)) {
      if (currentRun.length > 1) runs.push(currentRun);
      currentRun = [points[index + 1]];
      continue;
    }
    currentRun.push(points[index + 1]);
  }
  if (currentRun.length > 1) runs.push(currentRun);
  return runs;
}

function getRoutePaths(route: RouteLine) {
  const branchSegmentIds = new Set((route.branches ?? []).flatMap((branch) => branch.segmentIds));
  const branchPaths = (route.segments ?? [])
    .filter((segment) => segment.enabled && branchSegmentIds.has(segment.id))
    .map((segment) => segment.coordinates.map(([lat, lng]) => L.latLng(lat, lng)));
  return [...getRouteRuns(route), ...branchPaths];
}

function renderRoutes(selectedId?: string) {
  routeLayer.clearLayers();
  const zoom = map.getZoom();
  const lowZoom = zoom < 13;
  const middleZoom = zoom < 15;
  for (const route of routes) {
    const selected = route.id === selectedId;
    const underConstruction = !isRouteOperational(route.id);
    const haloWeight = lowZoom ? 10 : middleZoom ? 13 : 18;
    const outlineWeight = lowZoom ? (selected ? 7 : 6) : middleZoom ? (selected ? 10 : 9) : selected ? 14 : 13;
    const routeWeight = lowZoom ? (selected ? 6 : 4) : middleZoom ? (selected ? 7 : 5) : selected ? 9 : 6;
    for (const latLngs of getRoutePaths(route)) {
      if (selected) L.polyline(latLngs, routeStyle("rgba(255, 255, 255, 0.94)", haloWeight, 0.95)).addTo(routeLayer);
      L.polyline(latLngs, routeStyle("rgba(4, 10, 14, 0.82)", outlineWeight, 0.92)).addTo(routeLayer);
      const opacity = underConstruction ? 0.46 : route.visibility === "planning" ? 0.58 : route.operationPaused ? 0.68 : 0.98;
      const polyline = L.polyline(latLngs, routeStyle(route.color, routeWeight, opacity)).addTo(routeLayer);
      if (route.visibility === "planning" || underConstruction) polyline.setStyle({ dashArray: underConstruction ? "5 10" : "10 8" });
    }
  }
}

function renderConstructionProjects() {
  constructionLayer.clearLayers();
  for (const project of constructionProjects.filter((item) => item.status !== "operating")) {
    if (project.coordinates.length < 2) continue;
    const points = project.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
    const progress =
      project.status === "opening-ready"
        ? 1
        : clampNumber(project.elapsedDays / Math.max(1, project.durationDays + project.delayDays), 0, 1);
    L.polyline(points, {
      color: "#dbe5e8",
      weight: 9,
      opacity: 0.5,
      dashArray: "3 12",
      lineCap: "round",
      interactive: false,
    }).addTo(constructionLayer);
    const completed = sliceLatLngsByProgress(points, progress);
    if (completed.length > 1) {
      L.polyline(completed, {
        color: project.status === "opening-ready" ? "#f3ca52" : "#ff9f43",
        weight: 6,
        opacity: 0.95,
        dashArray: project.status === "opening-ready" ? "8 7" : undefined,
        lineCap: "round",
        interactive: false,
      }).addTo(constructionLayer);
    }
    const markerPoint = completed.at(-1) ?? points[0];
    L.marker(markerPoint, {
      icon: L.divIcon({
        className: "construction-progress-marker",
        html: `<span>${Math.round(progress * 100)}%</span>`,
        iconSize: [44, 24],
        iconAnchor: [22, 12],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(constructionLayer);
  }
}

function sliceLatLngsByProgress(points: LatLng[], progress: number) {
  if (points.length < 2 || progress <= 0) return [points[0]];
  if (progress >= 1) return points;
  const lengths = points.slice(1).map((point, index) => map.distance(points[index], point));
  const target = lengths.reduce((sum, length) => sum + length, 0) * progress;
  const result = [points[0]];
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (traversed + lengths[index] <= target) {
      result.push(points[index + 1]);
      traversed += lengths[index];
      continue;
    }
    const ratio = (target - traversed) / Math.max(1, lengths[index]);
    result.push(
      L.latLng(
        points[index].lat + (points[index + 1].lat - points[index].lat) * ratio,
        points[index].lng + (points[index + 1].lng - points[index].lng) * ratio,
      ),
    );
    break;
  }
  return result;
}

function createTransferEmblem(position: LatLng, stationIds: string[]) {
  const stationLabel = stationIds
    .map((stationId) => stations.find((station) => station.id === stationId)?.name)
    .filter(Boolean)
    .join(" / ");

  const marker = L.marker(position, {
    icon: L.divIcon({
      className: "transfer-station-marker",
      html: '<img src="/ui/transfer-station.svg" alt="" aria-hidden="true" />',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
    alt: `${stationLabel || "환승역"} 환승역`,
    title: `${stationLabel || "환승역"} 환승역`,
    keyboard: activeTool === "pan",
    interactive: activeTool === "pan",
    zIndexOffset: 850,
  }).addTo(stationLayer);

  marker.on("click", () => {
    if (activeTool !== "pan") return;
    const firstStationId = stationIds[0];
    if (firstStationId) openStationManager(firstStationId);
  });
}

void createTransferEmblem;

function renderStations(selectedId?: string) {
  stationLayer.clearLayers();
  if (map.getZoom() < 13) return;

  for (const transfer of transfers) {
    const transferStations = transfer.stationIds.map((id) => stations.find((station) => station.id === id)).filter(Boolean) as Station[];
    if (transferStations.length < 2) continue;
    L.polyline(
      transferStations.map((station) => L.latLng(station.position[0], station.position[1])),
      {
        color: "#ffffff",
        weight: 2,
        opacity: 0.7,
        dashArray: "3 6",
        interactive: false,
        pane: "facilityInteractionPane",
      },
    ).addTo(stationLayer);
  }

  for (const station of stations) {
    const position = L.latLng(station.position[0], station.position[1]);
    const isSelected = station.id === selectedId || selectedTransferStationIds.includes(station.id);
    const expressConfig = expressConfigs.find((config) => config.routeId === selectedOperationRouteId);
    const isExpressStop = Boolean(expressConfig?.enabled && expressConfig.stopStationIds.includes(station.id));
    const isTransferStation = Boolean(station.transferGroupId) || station.connectedRouteIds.length > 1;
    const routeColor = routes.find((route) => route.id === station.connectedRouteIds[0])?.color ?? "#ffffff";
    const color = isTransferStation ? "#ffffff" : isExpressStop ? "#ff5d5d" : routeColor;
    L.circleMarker(position, {
      radius: isExpressStop ? 8 : isSelected ? 8 : 6,
      color: "#111111",
      weight: isSelected ? 3.5 : 2.5,
      fillColor: color,
      fillOpacity: isStationOperational(station.id) ? 1 : 0.25,
      dashArray: isStationOperational(station.id) ? undefined : "3 4",
      interactive: false,
      className: "station-map-marker",
      pane: "facilityInteractionPane",
    }).addTo(stationLayer);

    const clickTarget = L.marker(position, {
      icon: L.divIcon({
        className: "station-click-target",
        html: "<span aria-hidden=\"true\"></span>",
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      }),
      interactive: true,
      bubblingMouseEvents: false,
      keyboard: false,
      zIndexOffset: 1000,
      riseOnHover: true,
      pane: "facilityInteractionPane",
    }).addTo(stationLayer);
    clickTarget.on("click", () => {
      if (activeTool === "pan") openStationManager(station.id);
    });
  }
}

function renderDepots(selectedId?: string) {
  depotLayer.clearLayers();
  for (const depot of depots) {
    const isSelected = depot.id === selectedId || depot.id === selectedDepotId;
    const operational = isDepotOperational(depot.id);
    const polygon = L.polygon(
      depot.polygon.map(([lat, lng]) => L.latLng(lat, lng)),
      {
        color: isSelected ? "#ffffff" : "#f3ca52",
        fillColor: "#f3ca52",
        fillOpacity: operational ? 0.18 : 0.07,
        weight: isSelected ? 3 : 2,
        dashArray: operational ? undefined : "6 7",
        interactive: true,
        bubblingMouseEvents: false,
        className: "depot-map-shape",
        pane: "facilityInteractionPane",
      },
    ).addTo(depotLayer);
    polygon.on("click", () => {
      selectedDepotId = depot.id;
      openDepotManager(depot.id);
    });

    const clickTarget = L.marker(polygon.getBounds().getCenter(), {
      icon: L.divIcon({
        className: "depot-click-target",
        html: "<span aria-hidden=\"true\"></span>",
        iconSize: [52, 52],
        iconAnchor: [26, 26],
      }),
      interactive: true,
      bubblingMouseEvents: false,
      keyboard: false,
      zIndexOffset: 1000,
      riseOnHover: true,
      pane: "facilityInteractionPane",
    }).addTo(depotLayer);
    clickTarget.on("click", () => {
      selectedDepotId = depot.id;
      openDepotManager(depot.id);
    });
  }
}

function renderTrains() {
  if (map.getZoom() < 14) {
    trainLayer.clearLayers();
    trainMarkers.clear();
    return;
  }

  const visibleKeys = new Set<string>();
  const maxVisiblePerRoute = settings.performanceMode === "battery" ? 8 : 18;
  for (const route of routes) {
    if (!isRouteOperational(route.id) || hasRouteGaps(route) || route.operationPaused || route.visibility === "planning") continue;
    const routeFleets = trainFleets.filter((fleet) => fleet.routeId === route.id);
    const displayedFleetSets = routeFleets.flatMap((fleet) =>
      Array.from({ length: fleet.sets }, (_, setIndex) => ({ fleet, setNumber: setIndex + 1 })),
    );
    const totalSets = displayedFleetSets.length;
    if (totalSets === 0 || route.coordinates.length < 2) continue;

    const displaySets = Math.min(totalSets, maxVisiblePerRoute);
    const routePaths = getTrainServicePaths(route);
    const operation = calculateRouteOperation(route.id);
    const cycleMinutes = Math.max(operation.headwayMin * totalSets, 12);
    const progressBase = (simMinutes % cycleMinutes) / cycleMinutes;

    for (let index = 0; index < displaySets; index += 1) {
      const displayedTrain = displayedFleetSets[index];
      if (!displayedTrain) continue;
      const key = `${route.id}:${index}`;
      visibleKeys.add(key);
      const progress = (progressBase + index / displaySets) % 1;
      const routePoints = routePaths[index % routePaths.length];
      const position = interpolateAlongRoute(routePoints, progress <= 0.5 ? progress * 2 : (1 - progress) * 2);
      const existing = trainMarkers.get(key);
      if (existing) {
        existing.setLatLng(position);
        existing.setZIndexOffset(900);
        const element = existing.getElement();
        if (element) {
          element.style.pointerEvents = "auto";
          element.classList.add("leaflet-interactive");
        }
        continue;
      }
      const marker = L.marker(position, {
        icon: L.divIcon({
          className: "train-icon",
          html: `<span class="train-body" style="--train-color:${escapeHtml(route.color)}"><i></i><i></i></span>`,
          iconSize: [24, 30],
          iconAnchor: [12, 15],
        }),
        interactive: true,
        bubblingMouseEvents: false,
        keyboard: false,
        zIndexOffset: 900,
        riseOnHover: true,
      }).addTo(trainLayer);
      marker.on("click", () => {
        selectRoute(route.id);
        openTrainManagerForFleet(displayedTrain.fleet.id, displayedTrain.setNumber);
      });
      trainMarkers.set(key, marker);
    }
  }
  for (const [key, marker] of trainMarkers) {
    if (visibleKeys.has(key)) continue;
    trainLayer.removeLayer(marker);
    trainMarkers.delete(key);
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

function buyTrainsForSelectedRoute() {
  const routeId = selectedOperationRouteId || routes[0]?.id;
  const route = routes.find((item) => item.id === routeId);
  if (!route) {
    setText(facilityReadout, "열차를 배정할 노선이 없습니다. 먼저 노선을 건설해 주세요.");
    showToast("열차를 배정할 노선이 없습니다. 먼저 노선을 건설해 주세요.");
    return;
  }
  const connectedDepotCapacity = depots
    .filter((depot) => isDepotOperational(depot.id) && depot.connectedRouteIds.includes(route.id))
    .reduce((sum, depot) => sum + depot.capacity, 0);
  const currentSets = trainFleets.filter((fleet) => fleet.routeId === route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
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
  trainFleets = [
    ...trainFleets,
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
  const latestFleet = trainFleets[trainFleets.length - 1];
  economy = { ...economy, cash: economy.cash - latestFleet.purchaseCost, trainSpent: economy.trainSpent + latestFleet.purchaseCost };
  playFeedback("confirm");
  redoStack = [];
  persistState();
  renderAll(route.id);
}

function toggleExpressForSelectedRoute() {
  const routeId = selectedOperationRouteId || routes[0]?.id;
  if (!routeId) {
    setText(facilityReadout, "급행을 설정할 노선 필요");
    return;
  }

  const existing = getExpressConfig(routeId);
  pushHistory();
  if (!existing.unlocked) {
    expressConfigs = [
      ...expressConfigs.filter((config) => config.routeId !== routeId),
      { ...existing, unlocked: true, enabled: true },
    ];
    setTool("expressStop");
  } else {
    expressConfigs = expressConfigs.map((config) => (config.routeId === routeId ? { ...config, enabled: !config.enabled } : config));
    setTool(existing.enabled ? "pan" : "expressStop");
  }
  const enabled = expressConfigs.find((config) => config.routeId === routeId)?.enabled ?? !existing.enabled;
  routes = routes.map((route) =>
    route.id === routeId
      ? {
          ...route,
          expressServiceEnabled: enabled,
          servicePatterns: (route.servicePatterns ?? []).map((pattern) => (pattern.kind === "express" ? { ...pattern, enabled } : pattern)),
        }
      : route,
  );
  redoStack = [];
  persistState();
  updateExpressButton();
  renderAll(routeId);
}

function toggleExpressStopAt(point: L.Point) {
  const routeId = selectedOperationRouteId || routes[0]?.id;
  const config = expressConfigs.find((item) => item.routeId === routeId && item.enabled);
  if (!config) {
    setText(facilityReadout, "급행을 먼저 켜세요");
    return;
  }
  const station = findNearestStation(point, 26);
  if (!station || !station.connectedRouteIds.includes(routeId)) {
    setText(facilityReadout, "해당 노선 역을 선택");
    return;
  }
  pushHistory();
  const hasStop = config.stopStationIds.includes(station.id);
  expressConfigs = expressConfigs.map((item) =>
    item.routeId === routeId
      ? { ...item, stopStationIds: hasStop ? item.stopStationIds.filter((id) => id !== station.id) : [...item.stopStationIds, station.id] }
      : item,
  );
  redoStack = [];
  persistState();
  renderAll(station.id);
}

/**
 * 배정 차량, 역별 수요, 급행 설정으로부터 한 노선의 배차·혼잡·비용을 계산한다.
 * 반환값은 표시용 캐시가 아니라 현재 상태에서 언제든 다시 만들 수 있는 파생 데이터다.
 */
function calculateRouteOperation(routeId: string): RouteOperation {
  const route = routes.find((item) => item.id === routeId);
  const routeStations = stations.filter((station) => station.connectedRouteIds.includes(routeId));
  const routeFleets = trainFleets.filter((fleet) => fleet.routeId === routeId);
  const sets = routeFleets.reduce((sum, fleet) => sum + fleet.sets, 0);
  const averageSpeed = routeFleets.length > 0 ? weightedAverageSpeed(routeFleets) : 32;
  const dailyDemand = routeStations.reduce((sum, station) => sum + station.demand, 0);
  if (route && !isRouteOperational(route.id)) {
    const fleetMaintenance = routeFleets.reduce((sum, fleet) => sum + fleet.maintenanceCost, 0);
    return { routeId, headwayMin: 0, crowding: 0, waitMin: 0, dailyDemand: 0, hourlyCapacity: 0, operatingCost: fleetMaintenance };
  }
  if (route && (hasRouteGaps(route) || route.operationPaused || route.visibility === "planning" || route.localServiceEnabled === false)) {
    const fleetMaintenance = routeFleets.reduce((sum, fleet) => sum + fleet.maintenanceCost, 0);
    return { routeId, headwayMin: 0, crowding: 2.4, waitMin: 30, dailyDemand, hourlyCapacity: 0, operatingCost: fleetMaintenance };
  }
  const express = expressConfigs.find((config) => config.routeId === routeId && config.enabled);
  const stopCount = express ? Math.max(express.stopStationIds.length, 2) : routeStations.length;
  const dwellMin = Math.max(1, stopCount * 0.45);
  const roundTripMin = route ? Math.max(8, (route.lengthKm / averageSpeed) * 120 + dwellMin * 2) : 0;
  const branchDivisor = route ? Math.max(1, getTrainServicePaths(route).length) : 1;
  const headwayMin = sets > 0 ? Math.round(((roundTripMin / sets) * branchDivisor) * 10) / 10 : 0;
  const averageTrainCapacity = sets > 0 ? routeFleets.reduce((sum, fleet) => sum + fleet.capacity, 0) / sets : 0;
  const hourlyCapacity = headwayMin > 0 ? Math.round((60 / headwayMin) * averageTrainCapacity) : 0;
  const hourlyDemand = dailyDemand / 18;
  const crowding = hourlyCapacity > 0 ? Math.round((hourlyDemand / hourlyCapacity) * 100) / 100 : 0;
  const waitMin = headwayMin > 0 ? Math.round((headwayMin / 2) * Math.max(1, crowding * 0.75) * 10) / 10 : 0;
  const fleetMaintenance = routeFleets.reduce((sum, fleet) => sum + fleet.maintenanceCost, 0);
  const operatingCost = fleetMaintenance + (express ? express.extraOperatingCost : 0);
  return { routeId, headwayMin, crowding, waitMin, dailyDemand, hourlyCapacity, operatingCost };
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
    fare: economy.fare,
    satisfaction: economy.satisfaction,
    routes: routes.map((route) => [route.id, route.lengthKm, route.operationPaused, route.visibility]),
    stations: stations.map((station) => [station.id, station.demand, station.connectedRouteIds]),
    fleets: trainFleets.map((fleet) => [fleet.id, fleet.routeId, fleet.sets, fleet.cars, fleet.trainType]),
    depots: depots.map((depot) => [depot.id, depot.capacity, depot.connectedRouteIds]),
    transfers: transfers.map((transfer) => [transfer.id, transfer.resistance]),
    plans: plans.map((plan) => [plan.id, plan.status, plan.remainingCost, plan.expectedDemand]),
    day: analysisState.dayIndex,
  });
}

/**
 * 운영 지표를 점검해 수송력·재정·환승 관련 개선 제안을 갱신한다.
 * fingerprint가 같으면 중복 계산/알림을 피하고, force일 때만 같은 상태도 재평가한다.
 */
function refreshOperationSuggestions(force = false) {
  const fingerprint = buildAnalysisFingerprint();
  if (!force && fingerprint === analysisState.lastFingerprint) return;
  const day = analysisState.dayIndex;
  const existing = new Map(analysisState.suggestions.map((suggestion) => [suggestion.id, suggestion]));
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
    const decision = analysisState.decisions[id];
    let status: SuggestionStatus = previous?.status ?? "active";
    let remindAtDay = previous?.remindAtDay;
    if (decision?.status === "hidden") status = "hidden";
    if (decision?.status === "later") {
      if ((decision.untilDay ?? 0) > day) {
        status = "later";
        remindAtDay = decision.untilDay;
      } else {
        status = "active";
        delete analysisState.decisions[id];
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

  const totalRouteDemand = routes.reduce((sum, route) => sum + calculateRouteOperation(route.id).dailyDemand, 0);
  for (const route of routes.filter((item) => item.visibility !== "planning" && !item.operationPaused && isRouteOperational(item.id))) {
    const operation = calculateRouteOperation(route.id);
    const routeFleets = trainFleets.filter((fleet) => fleet.routeId === route.id);
    const sets = routeFleets.reduce((sum, fleet) => sum + fleet.sets, 0);
    const connectedCapacity = depots
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

    const estimatedRevenue = Math.round((operation.dailyDemand * economy.fare) / 100000000);
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

    const routeStationCount = stations.filter((station) => station.connectedRouteIds.includes(route.id)).length;
    const express = expressConfigs.find((config) => config.routeId === route.id && config.enabled);
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

  if (economy.fare >= (economy.autoFare ? 2300 : 1900)) {
    const farePenalty = Math.round((economy.fare - 1450) / 55);
    add(
      "high-fare",
      economy.fare >= 2500 ? "warning" : "info",
      "passenger",
      "network",
      "network",
      "전체 네트워크",
      `현재 요금이 ${economy.fare.toLocaleString("ko-KR")}원입니다`,
      `기준 요금 대비 만족도 계산에서 약 ${farePenalty}점의 부담이 반영됩니다.`,
      economy.autoFare ? `운영비와 혼잡 원인을 낮춘 뒤 자동 요금 추정치를 다시 확인하세요.` : `자동 요금 또는 단계적 인하 효과를 비교하세요.`,
      `요금을 1,450원으로 조정하면 만족도가 최대 ${farePenalty}점 개선될 수 있습니다.`,
      0,
      "review-fare",
      "요금 설정 열기",
    );
  }

  const oldSnapshot = [...analysisState.demandHistory].reverse().find((snapshot) => snapshot.day <= day - 7);
  if (oldSnapshot && oldSnapshot.satisfaction - economy.satisfaction >= 8) {
    add(
      "satisfaction-drop",
      oldSnapshot.satisfaction - economy.satisfaction >= 15 ? "critical" : "warning",
      "passenger",
      "network",
      "network",
      "전체 네트워크",
      `시민 만족도가 ${oldSnapshot.satisfaction - economy.satisfaction}점 하락했습니다`,
      `최근 기준 ${oldSnapshot.satisfaction}점에서 현재 ${economy.satisfaction}점으로 낮아졌습니다.`,
      `혼잡, 대기시간, 요금 관련 우선 제안을 먼저 확인하세요.`,
      `원인 지표를 개선하면 수요 회복 가능성이 있습니다.`,
      0,
      "review-fare",
      "운영 지표 보기",
    );
  }

  for (const transfer of transfers.filter((item) => item.resistance >= 72).sort((a, b) => b.resistance - a.resistance).slice(0, 4)) {
    const transferStations = transfer.stationIds.map((id) => stations.find((station) => station.id === id)).filter(Boolean) as Station[];
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

  const stationOperationMetrics = stations
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
    const growingStations = stations
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

  for (const plan of plans.filter((item) => item.status !== "completed" && item.status !== "on-hold")) {
    const canAfford = currentMeta.mode === "sandbox" || plan.remainingCost <= economy.cash;
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

  analysisState = { ...analysisState, suggestions: proposals, lastFingerprint: fingerprint };
  updateAnalysisBadge();
}

function recordDemandSnapshot() {
  const snapshot: DemandSnapshot = {
    day: analysisState.dayIndex,
    totalDemand: economy.demand,
    satisfaction: economy.satisfaction,
    stationDemand: Object.fromEntries(stations.map((station) => [station.id, station.demand])),
  };
  analysisState = {
    ...analysisState,
    demandHistory: [...analysisState.demandHistory.filter((item) => item.day !== snapshot.day), snapshot].slice(-30),
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
  const visible = analysisState.suggestions.filter((suggestion) => {
    if (filter === "all") return true;
    return suggestion.status === filter;
  });
  const active = analysisState.suggestions.filter((suggestion) => suggestion.status === "active");
  const critical = active.filter((suggestion) => suggestion.severity === "critical").length;
  const warning = active.filter((suggestion) => suggestion.severity === "warning").length;
  const info = active.filter((suggestion) => suggestion.severity === "info").length;
  const health = Math.max(0, 100 - critical * 18 - warning * 8 - info * 2);
  setText(analysisUpdatedAt, `게임 ${analysisState.dayIndex}일차 · ${analysisState.demandHistory.length}일 추세`);
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
  const statusLabel =
    suggestion.status === "later"
      ? `${Math.max(0, (suggestion.remindAtDay ?? analysisState.dayIndex) - analysisState.dayIndex)}일 후 다시 표시`
      : suggestion.status === "hidden"
        ? "숨김됨"
        : "현재 제안";
  return `<article class="analysis-card severity-${suggestion.severity} status-${suggestion.status}" data-suggestion-id="${escapeHtml(suggestion.id)}">
    <header><div><span class="analysis-severity">${severityLabel}</span><span class="analysis-target">${escapeHtml(suggestion.targetLabel)}</span></div><em>${statusLabel}</em></header>
    <h4>${escapeHtml(suggestion.title)}</h4>
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

function handleSuggestionClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-command]");
  const card = button?.closest<HTMLElement>("[data-suggestion-id]");
  const suggestion = analysisState.suggestions.find((item) => item.id === card?.dataset.suggestionId);
  if (!button || !suggestion) return;
  const command = button.dataset.command;
  if (command === "hide" || command === "later" || command === "restore") {
    pushHistory();
    redoStack = [];
  }
  if (command === "hide") {
    setSuggestionDecision(suggestion.id, "hidden");
  } else if (command === "later") {
    setSuggestionDecision(suggestion.id, "later", analysisState.dayIndex + (suggestion.severity === "critical" ? 3 : 7));
  } else if (command === "restore") {
    setSuggestionDecision(suggestion.id, "active");
  } else if (command === "execute") {
    executeSuggestion(suggestion);
    return;
  }
  renderAnalysisScreen();
  persistState();
}

function setSuggestionDecision(id: string, status: SuggestionStatus, untilDay?: number) {
  const decisions = { ...analysisState.decisions };
  if (status === "active") delete decisions[id];
  else decisions[id] = { status, untilDay };
  analysisState = {
    ...analysisState,
    decisions,
    suggestions: analysisState.suggestions.map((suggestion) =>
      suggestion.id === id ? { ...suggestion, status, remindAtDay: untilDay } : suggestion,
    ),
  };
  updateAnalysisBadge();
}

function executeSuggestion(suggestion: OperationSuggestion) {
  closeAnalysisScreen();
  if (suggestion.targetType === "route") {
    selectedOperationRouteId = suggestion.targetId;
    if (operationRouteSelect) operationRouteSelect.value = suggestion.targetId;
    selectRoute(suggestion.targetId, false);
    updateOperationRouteOptions();
    updateOperationHud();
  }
  if (suggestion.actionKind === "buy-trains") {
    if (setCountInput) setCountInput.value = String(Math.max(1, suggestion.actionValue ?? 1));
    buyTrainButton?.focus();
    showToast(`구매 수량을 ${suggestion.actionValue ?? 1}편성으로 설정했습니다. 구매 버튼을 눌러 확정하세요.`);
  } else if (suggestion.actionKind === "review-fare") {
    fareInput?.focus();
    fareInput?.select();
    showToast("현재 요금을 확인하세요. 변경 전에는 자금과 수요가 바뀌지 않습니다.");
  } else if (suggestion.actionKind === "review-transfer") {
    const transfer = transfers.find((item) => item.id === suggestion.targetId);
    const station = stations.find((item) => transfer?.stationIds.includes(item.id));
    if (station) map.flyTo(L.latLng(station.position[0], station.position[1]), Math.max(map.getZoom(), 15));
    setTool("transfer");
    showToast("환승 도구를 열었습니다. 두 역을 선택하면 실제 연결 정보를 검토할 수 있습니다.");
  } else if (suggestion.actionKind === "build-depot") {
    setTool("depot");
    showToast("차량기지 건설 도구를 열었습니다. 지도에 영역을 그리면 비용 미리보기가 표시됩니다.");
  } else if (suggestion.actionKind === "review-express") {
    updateExpressButton();
    expressButton?.focus();
    showToast("급행 설정을 확인하세요. 버튼을 누르기 전에는 비용이나 운행이 바뀌지 않습니다.");
  } else if (suggestion.actionKind === "open-plan") {
    if (suggestion.targetType === "plan") activePlanId = suggestion.targetId;
    openPlanningDialog();
  } else {
    renderAll(suggestion.targetId);
    showToast(`${suggestion.targetLabel} 운영 화면을 열었습니다.`);
  }
}

function updateAnalysisBadge() {
  const urgentCount = analysisState.suggestions.filter((suggestion) => suggestion.status === "active" && suggestion.severity === "critical").length;
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
  return analysisState.dayIndex >= event.startedDay && analysisState.dayIndex < event.startedDay + event.durationDays;
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

function updateNewsEventsForDay() {
  const day = analysisState.dayIndex;
  const latestStart = newsEvents.reduce((latest, event) => Math.max(latest, event.startedDay), -999);
  const activeCount = newsEvents.filter(isNewsEventActive).length;
  const shouldGenerate = activeCount < 3 && (newsEvents.length === 0 || day - latestStart >= 4);
  if (!shouldGenerate) {
    updateNewsBadge();
    return;
  }
  const event = createNewsEvent(day);
  newsEvents = [...newsEvents, event].slice(-80);
  if (event.kind === "construction-delay") attachConstructionDelayFromNews(event);
  showToast(`새 뉴스: ${event.title}`);
  updateNewsBadge();
}

function createNewsEvent(day: number): NewsEvent {
  const opportunityKinds: NewsEventKind[] = ["festival", "concert", "sports", "tourism", "new-town", "university", "commercial-growth"];
  const changeKinds: NewsEventKind[] = ["heavy-rain", "heavy-snow", "roadworks", "demand-decline", "operating-cost", "construction-delay", "recession"];
  const seed = hashNewsSeed(day, `${currentMeta.slotId}:${currentMeta.cityId}:${newsEvents.length}`);
  const pool = seed % 100 < 62 ? opportunityKinds : changeKinds;
  const kind = pool[seed % pool.length];
  const template = newsEventCatalog[kind];
  const stationPool = stations.filter((station) => isStationOperational(station.id));
  const station = stationPool.length > 0 ? stationPool[(seed >>> 5) % stationPool.length] : undefined;
  const relatedRouteIds = station?.connectedRouteIds.filter(isRouteOperational) ?? [];
  const position = station?.position ?? (cityConfigs[currentMeta.cityId].center as [number, number]);
  const durationRange = template.duration[1] - template.duration[0] + 1;
  return {
    id: createId("news"),
    kind,
    tone: template.tone,
    title: template.title,
    summary: template.summary,
    regionName: station ? `${station.name} 일대` : `${cityConfigs[currentMeta.cityId].name} 전역`,
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
  constructionProjects = constructionProjects.map((project) => {
    if (!["scheduled", "building"].includes(project.status)) return project;
    const relevant = event.relatedRouteIds.length === 0 || project.routeIds.some((routeId) => event.relatedRouteIds.includes(routeId));
    if (!relevant) return project;
    const delayDays = currentMeta.difficulty === "hard" ? 4 : currentMeta.difficulty === "easy" ? 2 : 3;
    return {
      ...project,
      events: [
        ...project.events,
        {
          id: createId("construction-event"),
          kind: "delay",
          triggerDay: analysisState.dayIndex,
          delayDays,
          message: `${event.title}: 안전 점검 ${delayDays}일 추가`,
          applied: false,
        },
      ],
    };
  });
}

function getActiveNewsEvents() {
  return newsEvents.filter(isNewsEventActive);
}

function getPassengerNewsMultiplier(origin: Station, destination: Station, routeIds: string[]) {
  return getActiveNewsEvents().reduce((multiplier, event) => {
    const applies =
      event.relatedStationIds.length === 0 ||
      event.relatedStationIds.includes(origin.id) ||
      event.relatedStationIds.includes(destination.id) ||
      event.relatedRouteIds.some((routeId) => routeIds.includes(routeId));
    return applies ? multiplier * event.demandMultiplier : multiplier;
  }, 1);
}

function getNewsOperatingCostMultiplier() {
  return getActiveNewsEvents().reduce((multiplier, event) => multiplier * event.operatingCostMultiplier, 1);
}

function openNewsScreen() {
  newsEvents = newsEvents.map((event) => (isNewsEventActive(event) ? { ...event, read: true } : event));
  renderNewsFeed();
  updateNewsBadge();
  persistState();
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
  const visible = (newsFilter?.value ?? "active") === "all" ? [...newsEvents] : active;
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
  const remaining = Math.max(0, event.startedDay + event.durationDays - analysisState.dayIndex);
  const demandPercent = Math.round((event.demandMultiplier - 1) * 100);
  const costPercent = Math.round((event.operatingCostMultiplier - 1) * 100);
  const routeNames = event.relatedRouteIds.map((id) => routes.find((route) => route.id === id)?.name).filter(Boolean);
  const stationNames = event.relatedStationIds.map((id) => stations.find((station) => station.id === id)?.name).filter(Boolean);
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
  const newsEvent = newsEvents.find((item) => item.id === card?.dataset.newsId);
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
  newsEvents = newsEvents.map((item) => (item.id === event.id ? { ...item, responsePrepared: true, read: true } : item));
  redoStack = [];
  persistState();
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
  renderAll(selectedOperationRouteId);
}

function updateNewsBadge() {
  const unread = newsEvents.filter((event) => isNewsEventActive(event) && !event.read).length;
  if (newsBadge) {
    newsBadge.hidden = unread === 0;
    newsBadge.textContent = String(unread);
  }
  newsButton?.classList.toggle("has-news", unread > 0);
}

function getNetworkTitle() {
  return currentMeta.networkTitle?.trim() || `${cityConfigs[currentMeta.cityId].name} 철도망`;
}

function openStatisticsScreen() {
  renderStatisticsScreen();
  if (statisticsScreen) statisticsScreen.hidden = false;
  document.body.classList.add("statistics-open");
}

function closeStatisticsScreen() {
  if (statisticsScreen) statisticsScreen.hidden = true;
  document.body.classList.remove("statistics-open");
}

function saveNetworkTitle() {
  const value = networkTitleInput?.value.trim() ?? "";
  pushHistory();
  currentMeta = { ...currentMeta, networkTitle: value || undefined };
  redoStack = [];
  persistState();
  void saveCurrentSlot("철도망 제목 저장");
  renderStatisticsScreen();
  if (!diagramScreen?.hidden) renderMetroDiagram();
  showToast(value ? "철도망 제목을 저장했습니다." : `${cityConfigs[currentMeta.cityId].name} 철도망을 기본 제목으로 사용합니다.`);
}

function calculateNetworkFinancials() {
  const assets =
    economy.cash +
    routes.reduce((sum, route) => sum + route.constructionCost, 0) +
    depots.reduce((sum, depot) => sum + (depot.constructionCost ?? depot.areaHa * 900), 0) +
    trainFleets.reduce((sum, fleet) => sum + Math.round(fleet.purchaseCost * 0.8), 0);
  const liabilities = loans.reduce((sum, loan) => sum + loan.balance, 0);
  const dailyRevenue = economy.revenue || Math.round((economy.demand * economy.fare) / 100000000);
  const loanInterest = loans.reduce((sum, loan) => sum + loan.balance * (loan.interestRate / 365), 0);
  const loanPayment = loans.reduce((sum, loan) => sum + loan.monthlyPayment / 30, 0);
  const dailyExpenses = Math.round(calculateDailyMaintenance() + loanInterest + loanPayment);
  const recent = statisticsState.dailyRecords.slice(-30);
  const monthlyRevenue = recent.length > 0 ? recent.reduce((sum, item) => sum + item.revenue, 0) : dailyRevenue * 30;
  const monthlyExpenses = recent.length > 0 ? recent.reduce((sum, item) => sum + item.expenses, 0) : dailyExpenses * 30;
  const totalStationDemand = stations.reduce((sum, station) => sum + station.demand, 0);
  const transitShare = totalStationDemand > 0 ? clampNumber(economy.demand / totalStationDemand, 0, 0.98) : 0;
  return { assets, liabilities, dailyRevenue, dailyExpenses, monthlyRevenue, monthlyExpenses, transitShare, loanPayment };
}

function calculateRouteStatistics(route: RouteLine) {
  const operation = calculateRouteOperation(route.id);
  const groups = passengerGroups.filter((group) => group.routeIds.includes(route.id));
  const passengers = Math.round(groups.reduce((sum, group) => sum + group.activeDemand / Math.max(1, group.routeIds.length), 0));
  const totalPassengers = passengerGroups.reduce((sum, group) => sum + group.activeDemand, 0);
  const fareRevenue = totalPassengers > 0 ? Math.round((passengers / totalPassengers) * calculateNetworkFinancials().dailyRevenue) : 0;
  const maintenance = operation.operatingCost;
  const averageTravelTime =
    groups.length > 0
      ? groups.reduce((sum, group) => {
          const speed = trainFleets.some((fleet) => fleet.routeId === route.id) ? weightedAverageSpeed(trainFleets.filter((fleet) => fleet.routeId === route.id)) : 32;
          return sum + (group.distanceKm / speed) * 60 + group.waitMin;
        }, 0) / groups.length
      : route.lengthKm > 0
        ? (route.lengthKm / 32) * 30 + operation.waitMin
        : 0;
  const satisfaction = groups.length > 0 ? groups.reduce((sum, group) => sum + group.satisfaction, 0) / groups.length : economy.satisfaction;
  const sets = trainFleets.filter((fleet) => fleet.routeId === route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  const depotCapacity = depots.filter((depot) => depot.connectedRouteIds.includes(route.id)).reduce((sum, depot) => sum + depot.capacity, 0);
  const express = expressConfigs.find((config) => config.routeId === route.id && config.enabled);
  const expressUsage =
    express && groups.length > 0
      ? clampNumber(groups.filter((group) => group.distanceKm >= route.lengthKm * 0.35).reduce((sum, group) => sum + group.activeDemand, 0) / Math.max(1, groups.reduce((sum, group) => sum + group.activeDemand, 0)), 0, 1)
      : 0;
  return {
    route,
    operation,
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
  const relatedGroups = passengerGroups.filter((group) => group.originStationId === station.id || group.destinationStationId === station.id);
  const boardings = relatedGroups.reduce((sum, group) => sum + group.activeDemand, 0);
  const transferPassengers = relatedGroups.filter((group) => group.routeIds.length > 1).reduce((sum, group) => sum + group.activeDemand, 0);
  const operations = station.connectedRouteIds.map((routeId) => calculateRouteOperation(routeId));
  const crowding = operations.length > 0 ? operations.reduce((sum, operation) => sum + operation.crowding, 0) / operations.length : 0;
  const waitMin = operations.length > 0 ? operations.reduce((sum, operation) => sum + (operation.waitMin || 0), 0) / operations.length : 0;
  const potentialDemand = Math.max(station.demand, estimateStationDemand(L.latLng(station.position[0], station.position[1]), station.connectedRouteIds.length));
  const oldSnapshot = [...analysisState.demandHistory].reverse().find((snapshot) => snapshot.day <= analysisState.dayIndex - 7);
  const oldDemand = oldSnapshot?.stationDemand[station.id] ?? station.demand;
  const growth = oldDemand > 0 ? station.demand / oldDemand - 1 : 0;
  const profileWeights = [0.025, 0.018, 0.015, 0.014, 0.018, 0.035, 0.07, 0.115, 0.095, 0.055, 0.04, 0.038, 0.042, 0.04, 0.043, 0.052, 0.075, 0.105, 0.075, 0.045, 0.032, 0.025, 0.018, 0.013];
  const hourly = profileWeights.map((weight, hour) => ({ hour, passengers: Math.round(boardings * weight) }));
  return { station, boardings, transferPassengers, crowding, waitMin, potentialDemand, growth, hourly };
}

function openStationManager(stationId: string) {
  const station = stations.find((item) => item.id === stationId);
  if (!station || !stationManagerDialog) return;
  selectedStationManagerId = station.id;
  renderStationManager();
  stationManagerDialog.hidden = false;
}

function closeStationManager() {
  if (stationManagerDialog) stationManagerDialog.hidden = true;
}

function getStationManagerMembers(station: Station) {
  if (!station.transferGroupId) return [station];
  const transfer = transfers.find((item) => item.id === station.transferGroupId);
  const members = transfer?.stationIds.map((id) => stations.find((item) => item.id === id)).filter(Boolean) as Station[] | undefined;
  return members && members.length > 0 ? members : [station];
}

function renderStationManager() {
  const station = stations.find((item) => item.id === selectedStationManagerId);
  if (!station || !stationManagerContent) {
    closeStationManager();
    return;
  }
  const members = getStationManagerMembers(station);
  const memberStatistics = members.map(calculateStationStatistics);
  const statistics = {
    boardings: memberStatistics.reduce((sum, item) => sum + item.boardings, 0),
    transferPassengers: memberStatistics.reduce((sum, item) => sum + item.transferPassengers, 0),
    crowding: memberStatistics.reduce((sum, item) => sum + item.crowding, 0) / members.length,
    waitMin: memberStatistics.reduce((sum, item) => sum + item.waitMin, 0) / members.length,
    growth: memberStatistics.reduce((sum, item) => sum + item.growth, 0) / members.length,
  };
  const transfer = transfers.find((item) => item.id === station.transferGroupId);
  const routeIds = Array.from(new Set(members.flatMap((item) => item.connectedRouteIds)));
  const routesForStation = routeIds.map((id) => routes.find((route) => route.id === id)).filter(Boolean) as RouteLine[];
  const operational = members.every((item) => isStationOperational(item.id));
  const stationName = Array.from(new Set(members.map((item) => item.name))).join(" · ");
  const combinedDemand = members.reduce((sum, item) => sum + item.demand, 0);
  const growth = statistics.growth >= 0.03 ? `+${Math.round(statistics.growth * 100)}%` : `${Math.round(statistics.growth * 100)}%`;
  setText(stationManagerTitle, stationName);
  stationManagerContent.innerHTML = `
    <section class="station-manager-identity">
      <label><span>역 이름</span><input id="stationManagerName" value="${escapeHtml(stationName)}" maxlength="32" /></label>
      <button type="button" data-station-manager-action="save-name">이름 저장</button>
      <span class="station-status ${operational ? "operational" : "building"}">${operational ? "운영 중" : "공사·설치 중"}</span>
    </section>
    <section class="station-manager-metrics" aria-label="승객 통계">
      <div><span>일일 승하차</span><strong>${statistics.boardings.toLocaleString("ko-KR")}명</strong></div>
      <div><span>기본 수요</span><strong>${combinedDemand.toLocaleString("ko-KR")}명</strong></div>
      <div><span>환승 승객</span><strong>${statistics.transferPassengers.toLocaleString("ko-KR")}명</strong></div>
      <div><span>혼잡도</span><strong>${statistics.crowding > 0 ? `${Math.round(statistics.crowding * 100)}%` : "-"}</strong></div>
      <div><span>평균 대기</span><strong>${statistics.waitMin > 0 ? `${statistics.waitMin.toFixed(1)}분` : "-"}</strong></div>
      <div><span>수요 변화</span><strong class="${statistics.growth < 0 ? "down" : "up"}">${growth}</strong></div>
    </section>
    <section class="station-manager-section">
      <div class="station-manager-section-heading"><span>연결 노선</span><strong>${routesForStation.length}개</strong></div>
      <div class="connected-route-chips">${routesForStation.length > 0 ? routesForStation.map((route) => `<span style="--entity-color:${escapeHtml(route.color)}">${escapeHtml(route.name)}</span>`).join("") : "<em>연결된 노선이 없습니다.</em>"}</div>
    </section>
    <section class="station-manager-section station-manager-transfer">
      <div class="station-manager-section-heading"><span>환승 정보</span><strong>${transfer ? "환승역" : "일반역"}</strong></div>
      <p>${transfer ? `환승 거리 ${Math.round(transfer.distanceM)}m · 예상 환승 ${transfer.transferTimeMin.toFixed(1)}분 · 혼잡 저항 ${transfer.resistance}` : "현재 연결된 환승 시설이 없습니다."}</p>
    </section>`;
}

function handleStationManagerClick(event: Event) {
  const target = event.target as HTMLElement;
  if (target.dataset.stationManagerAction !== "save-name" || !selectedStationManagerId) return;
  const input = document.querySelector<HTMLInputElement>("#stationManagerName");
  const name = input?.value.trim();
  if (!name) {
    showToast("역 이름을 입력해 주세요.");
    return;
  }
  const selectedStation = stations.find((station) => station.id === selectedStationManagerId);
  const memberIds = new Set(selectedStation ? getStationManagerMembers(selectedStation).map((station) => station.id) : []);
  stations = stations.map((station) => memberIds.has(station.id) ? { ...station, name } : station);
  persistState();
  renderStationManager();
  renderAll(selectedStationManagerId);
  showToast("역 이름을 저장했습니다.");
}

function openDepotManager(depotId: string) {
  const depot = depots.find((item) => item.id === depotId);
  if (!depot || !depotManagerDialog) return;
  selectedDepotManagerId = depot.id;
  renderDepotManager();
  depotManagerDialog.hidden = false;
}

function closeDepotManager() {
  if (depotManagerDialog) depotManagerDialog.hidden = true;
}

function renderDepotManager() {
  const depot = depots.find((item) => item.id === selectedDepotManagerId);
  if (!depot || !depotManagerContent) {
    closeDepotManager();
    return;
  }
  const connectedRoutes = depot.connectedRouteIds.map((id) => routes.find((route) => route.id === id)).filter(Boolean) as RouteLine[];
  const assignedSets = trainFleets
    .filter((fleet) => depot.connectedRouteIds.includes(fleet.routeId))
    .reduce((sum, fleet) => sum + fleet.sets, 0);
  const operational = isDepotOperational(depot.id);
  const availableSets = Math.max(0, depot.capacity - assignedSets);
  setText(depotManagerTitle, depot.name);
  depotManagerContent.innerHTML = `
    <section class="depot-manager-hero">
      <span class="depot-manager-symbol" aria-hidden="true">▥</span>
      <div><span>차량기지 상태</span><strong>${operational ? "운영 중" : "공사·설치 중"}</strong><em>레벨 ${depot.level} · ${depot.areaHa.toFixed(1)}ha</em></div>
    </section>
    <section class="depot-manager-metrics" aria-label="차량기지 운영 정보">
      <div><span>수용 편성</span><strong>${depot.capacity}편성</strong></div>
      <div><span>연결 노선 열차</span><strong>${assignedSets}편성</strong></div>
      <div><span>추가 수용 가능</span><strong>${availableSets}편성</strong></div>
      <div><span>월 유지비</span><strong>${formatCost(depot.maintenanceCost)}</strong></div>
    </section>
    <section class="depot-manager-section">
      <div class="depot-manager-section-heading"><span>연결 노선</span><strong>${connectedRoutes.length}개</strong></div>
      <div class="connected-route-chips">${connectedRoutes.length > 0 ? connectedRoutes.map((route) => `<span style="--entity-color:${escapeHtml(route.color)}">${escapeHtml(route.name)}</span>`).join("") : "<em>연결된 노선이 없습니다.</em>"}</div>
    </section>
    <button class="depot-manager-expand" type="button" data-depot-manager-action="expand" ${operational ? "" : "disabled"}>차량기지 확장</button>`;
}

function handleDepotManagerClick(event: Event) {
  const target = event.target as HTMLElement;
  if (target.dataset.depotManagerAction !== "expand" || !selectedDepotManagerId) return;
  expandDepot(selectedDepotManagerId);
  renderDepotManager();
  showToast("차량기지를 확장했습니다.");
}

function renderStatisticsScreen() {
  const city = cityConfigs[currentMeta.cityId];
  setText(statisticsNetworkTitle, getNetworkTitle());
  setText(statisticsCityLabel, city.name);
  setText(
    statisticsSaveMeta,
    `${currentMeta.slotName} · ${currentMeta.mode === "sandbox" ? "샌드박스" : "커리어"} · ${difficultyConfigs[currentMeta.difficulty].label} · 플레이 ${formatPlayTime(currentMeta.playTimeSeconds ?? 0)}`,
  );
  if (networkTitleInput && document.activeElement !== networkTitleInput) networkTitleInput.value = currentMeta.networkTitle ?? "";
  statisticsTabs.forEach((button) => {
    const active = button.dataset.statisticsTab === activeStatisticsTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!statisticsContent) return;
  if (activeStatisticsTab === "routes") statisticsContent.innerHTML = renderRouteStatistics();
  else if (activeStatisticsTab === "stations") statisticsContent.innerHTML = renderStationStatistics();
  else if (activeStatisticsTab === "city") statisticsContent.innerHTML = renderCityStatistics();
  else statisticsContent.innerHTML = renderOverviewStatistics();
}

function renderOverviewStatistics() {
  const finances = calculateNetworkFinancials();
  const totalSets = trainFleets.reduce((sum, fleet) => sum + fleet.sets, 0);
  const totalLength = routes.reduce((sum, route) => sum + route.lengthKm, 0);
  const transferStationIds = new Set(transfers.flatMap((transfer) => transfer.stationIds));
  const previous = statisticsState.dailyRecords.at(-2);
  const latest = statisticsState.dailyRecords.at(-1);
  const passengerChange = latest && previous && previous.passengers > 0 ? (latest.passengers / previous.passengers - 1) * 100 : null;
  const profitChange = latest && previous && Math.abs(previous.revenue - previous.expenses) > 0 ? ((latest.revenue - latest.expenses) / Math.abs(previous.revenue - previous.expenses) - 1) * 100 : null;
  const cards = [
    ["현재 자금", formatSignedCost(economy.cash), null],
    ["총자산", formatCost(finances.assets), null],
    ["총부채", formatCost(finances.liabilities), null],
    ["대출 상환액", `${formatCost(statisticsState.totalLoanRepaid)} 누적`, null],
    ["일간 수익", formatCost(finances.dailyRevenue), null],
    ["일간 지출", formatCost(finances.dailyExpenses), null],
    ["월간 수익", formatCost(finances.monthlyRevenue), null],
    ["월간 지출", formatCost(finances.monthlyExpenses), null],
    ["순이익", formatSignedCost(finances.dailyRevenue - finances.dailyExpenses), profitChange],
    ["누적 승객", `${statisticsState.totalPassengers.toLocaleString("ko-KR")}명`, passengerChange],
    ["시민 만족도", `${economy.satisfaction}점`, null],
    ["대중교통 이용률", `${Math.round(finances.transitShare * 100)}%`, null],
  ] as Array<[string, string, number | null]>;
  return `<div class="statistics-page">
    <section class="statistics-hero">
      <div><span>오늘의 순이익</span><strong class="${finances.dailyRevenue - finances.dailyExpenses >= 0 ? "positive" : "negative"}">${formatSignedCost(finances.dailyRevenue - finances.dailyExpenses)}</strong><em>수익 ${formatCost(finances.dailyRevenue)} · 지출 ${formatCost(finances.dailyExpenses)}</em></div>
      ${renderMiniTrend(statisticsState.dailyRecords.slice(-14).map((item) => item.revenue - item.expenses), "최근 순이익")}
    </section>
    <section><div class="statistics-section-heading"><div><span>FINANCE & RIDERSHIP</span><h3>운영 핵심 지표</h3></div><em>최근 변화가 있는 값만 증감률을 표시합니다</em></div>
      <div class="statistics-metric-grid">${cards.map(([label, value, change]) => renderMetricCard(label, value, change)).join("")}</div>
    </section>
    <details class="statistics-details"><summary>철도망 규모 자세히 보기</summary>
      <div class="statistics-metric-grid compact">
        ${renderMetricCard("보유 열차", `${totalSets}편성`, null)}
        ${renderMetricCard("총 노선 길이", `${totalLength.toFixed(1)}km`, null)}
        ${renderMetricCard("노선", `${routes.length}개`, null)}
        ${renderMetricCard("역", `${stations.length}개`, null)}
        ${renderMetricCard("환승역", `${transferStationIds.size}개`, null)}
        ${renderMetricCard("차량기지", `${depots.length}개`, null)}
      </div>
    </details>
    <section class="save-information">
      <div class="statistics-section-heading"><div><span>SAVE INFORMATION</span><h3>세이브 정보</h3></div></div>
      <dl>
        <div><dt>세이브 이름</dt><dd>${escapeHtml(currentMeta.slotName)}</dd></div>
        <div><dt>게임 설정</dt><dd>${currentMeta.mode === "sandbox" ? "샌드박스" : "커리어"} · ${difficultyConfigs[currentMeta.difficulty].label}</dd></div>
        <div><dt>현재 도시</dt><dd>${cityConfigs[currentMeta.cityId].name}</dd></div>
        <div><dt>생성 날짜</dt><dd>${formatDate(currentMeta.createdAt)}</dd></div>
        <div><dt>마지막 플레이</dt><dd>${formatDate(currentMeta.updatedAt, true)}</dd></div>
        <div><dt>플레이 시간</dt><dd>${formatPlayTime(currentMeta.playTimeSeconds ?? 0)}</dd></div>
      </dl>
    </section>
  </div>`;
}

function renderRouteStatistics() {
  if (routes.length === 0) return renderStatisticsEmpty("노선 통계가 없습니다", "노선을 건설하면 승객과 수익, 배차 통계가 표시됩니다.");
  if (!routes.some((route) => route.id === selectedStatisticsRouteId)) selectedStatisticsRouteId = routes[0].id;
  const routeStats = routes.map(calculateRouteStatistics);
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
  if (stations.length === 0) return renderStatisticsEmpty("역 통계가 없습니다", "역을 설치하면 승하차와 시간대별 이용량이 표시됩니다.");
  if (!stations.some((station) => station.id === selectedStatisticsStationId)) selectedStatisticsStationId = [...stations].sort((a, b) => b.demand - a.demand)[0].id;
  const ranked = [...stations].map(calculateStationStatistics).sort((a, b) => b.boardings - a.boardings);
  const selected = ranked.find((item) => item.station.id === selectedStatisticsStationId)!;
  const maxHourly = Math.max(1, ...selected.hourly.map((item) => item.passengers));
  const growthLabel = selected.growth >= 0.12 ? "빠른 성장" : selected.growth >= 0.03 ? "성장" : selected.growth <= -0.05 ? "감소" : "안정";
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
        ${renderMetricCard("주변 잠재 수요", `${selected.potentialDemand.toLocaleString("ko-KR")}명`, null, true)}
        ${renderMetricCard("연결 노선", `${selected.station.connectedRouteIds.length}개`, null)}
        ${renderMetricCard("평균 대기", selected.waitMin > 0 ? `${selected.waitMin.toFixed(1)}분` : "-", null)}
        ${renderMetricCard("역세권 성장", growthLabel, selected.growth * 100)}
      </div>
      <section class="hourly-chart"><div class="statistics-section-heading"><div><span>HOURLY USE</span><h3>시간대별 이용량</h3></div><em>현재 일 수요 기반 추정</em></div>
        <div>${selected.hourly.map((item) => `<i style="height:${Math.max(3, (item.passengers / maxHourly) * 100)}%" title="${item.hour}시 ${item.passengers.toLocaleString("ko-KR")}명"><span>${item.hour % 3 === 0 ? item.hour : ""}</span></i>`).join("")}</div>
      </section>
      <div class="connected-route-chips">${selected.station.connectedRouteIds.map((id) => {
        const route = routes.find((item) => item.id === id);
        return route ? `<button type="button" data-focus-route="${route.id}" style="--entity-color:${escapeHtml(route.color)}">${escapeHtml(route.name)}</button>` : "";
      }).join("")}</div>
    </article>
  </div>`;
}

function renderCityStatistics() {
  const finances = calculateNetworkFinancials();
  const city = cityConfigs[currentMeta.cityId];
  const center = L.latLng(city.center);
  const oldSnapshot = [...analysisState.demandHistory].reverse().find((snapshot) => snapshot.day <= analysisState.dayIndex - 7);
  const regions = [
    { key: "nw", label: "북서", current: 0, previous: 0 },
    { key: "ne", label: "북동", current: 0, previous: 0 },
    { key: "sw", label: "남서", current: 0, previous: 0 },
    { key: "se", label: "남동", current: 0, previous: 0 },
  ];
  for (const station of stations) {
    const north = station.position[0] >= center.lat;
    const east = station.position[1] >= center.lng;
    const region = regions.find((item) => item.key === `${north ? "n" : "s"}${east ? "e" : "w"}`)!;
    region.current += station.demand;
    region.previous += oldSnapshot?.stationDemand[station.id] ?? station.demand;
  }
  const growth = oldSnapshot && oldSnapshot.totalDemand > 0 ? economy.demand / oldSnapshot.totalDemand - 1 : (city.growthMultiplier - 1) * 0.1;
  const congested = stations
    .map(calculateStationStatistics)
    .filter((item) => item.crowding >= 0.9)
    .sort((a, b) => b.crowding - a.crowding)
    .slice(0, 4);
  const development = plans.flatMap((plan) => plan.stations.filter((station) => !station.completed).map((station) => ({ ...station, planName: plan.name }))).slice(0, 4);
  const unlocked = currentMeta.unlockedCityIds.length;
  return `<div class="statistics-page">
    <section class="city-stat-hero">
      <div><span>${escapeHtml(city.name)} 전체 수요</span><strong>${stations.reduce((sum, station) => sum + station.demand, 0).toLocaleString("ko-KR")}</strong><em>역 주변 잠재 수요 합계</em></div>
      <div class="statistics-metric-grid compact">
        ${renderMetricCard("대중교통 이용률", `${Math.round(finances.transitShare * 100)}%`, null)}
        ${renderMetricCard("시민 만족도", `${economy.satisfaction}점`, null)}
        ${renderMetricCard("도시 성장률", `${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(1)}%`, growth * 100, true)}
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
      <section><div class="statistics-section-heading"><div><span>DEVELOPMENT</span><h3>개발 예정 지역</h3></div></div>
        <div class="statistics-ranked-list">${development.length > 0 ? development.map((item) => `<button type="button" data-open-plan="${item.planName}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.planName)} · 수요 ${item.expectedDemand.toLocaleString("ko-KR")}</span></button>`).join("") : `<p>현재 계획된 개발 지역이 없습니다.</p>`}</div>
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
    const station = stations.find((item) => item.id === target.dataset.focusStation);
    if (!station) return;
    closeStatisticsScreen();
    map.flyTo(L.latLng(station.position[0], station.position[1]), Math.max(15, map.getZoom()));
    renderAll(station.id);
    showToast("선택한 역으로 이동했습니다.");
  } else if (target.dataset.openPlan) {
    activePlanId = plans.find((plan) => plan.name === target.dataset.openPlan)?.id ?? activePlanId;
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

function formatPlayTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

function formatDate(timestamp: number, includeTime = false) {
  return new Intl.DateTimeFormat("ko-KR", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(timestamp);
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
  const existing = expressConfigs.find((config) => config.routeId === routeId);
  if (existing) return existing;
  const stopStationIds = stations.filter((station) => station.connectedRouteIds.includes(routeId)).map((station) => station.id);
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
  const targetRoute = selectedRouteId ? routes.find((item) => item.id === selectedRouteId) : null;
  if (!targetRoute) {
    setText(headwayReadout, "-");
    setText(crowdingReadout, "-");
    setText(waitReadout, "-");
    return;
  }
  const operation = calculateRouteOperation(targetRoute.id);
  setText(headwayReadout, operation.headwayMin > 0 ? `${operation.headwayMin.toFixed(1)}분` : "열차 없음");
  setText(crowdingReadout, operation.hourlyCapacity > 0 ? `${Math.round(operation.crowding * 100)}%` : "-");
  setText(waitReadout, operation.waitMin > 0 ? `${operation.waitMin.toFixed(1)}분` : "-");
}

/**
 * 역 수요를 출발-도착 승객 그룹으로 재구성한다.
 * 개별 승객을 시뮬레이션하지 않고 집단 단위로 계산해 노선 탐색 비용을 제한한다.
 */
function regeneratePassengerGroups() {
  if (stations.length < 2) {
    passengerGroups = [];
    economy = { ...economy, demand: 0 };
    return;
  }
  const groups: PassengerGroup[] = [];
  const rankedStations = stations.filter((station) => isStationOperational(station.id)).sort((a, b) => b.demand - a.demand).slice(0, 18);
  for (const origin of rankedStations) {
    const candidates = rankedStations
      .filter((station) => station.id !== origin.id)
      .map((destination) => ({
        destination,
        distance: map.distance(L.latLng(origin.position[0], origin.position[1]), L.latLng(destination.position[0], destination.position[1])),
      }))
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 3);
    for (const candidate of candidates) {
      const routeIds = findRoutePath(origin, candidate.destination);
      if (routeIds.length === 0) continue;
      const distanceKm = Math.round((candidate.distance / 1000) * 10) / 10;
      const operationMix = mixOperation(routeIds);
      const transferResistance = calculateGroupTransferResistance(origin, candidate.destination, routeIds);
      const basePeople = Math.round(Math.min(origin.demand, candidate.destination.demand) * 0.18);
      const satisfaction = calculateGroupSatisfaction(operationMix.waitMin, operationMix.crowding, transferResistance, economy.fare);
      const eventMultiplier = getPassengerNewsMultiplier(origin, candidate.destination, routeIds);
      const activeDemand = Math.round(basePeople * (0.45 + satisfaction / 140) * eventMultiplier);
      groups.push({
        id: `${origin.id}:${candidate.destination.id}`,
        originStationId: origin.id,
        destinationStationId: candidate.destination.id,
        people: basePeople,
        routeIds,
        distanceKm,
        transferResistance,
        waitMin: operationMix.waitMin,
        crowding: operationMix.crowding,
        satisfaction,
        activeDemand,
      });
    }
  }
  passengerGroups = groups;
  const demand = groups.reduce((sum, group) => sum + group.activeDemand, 0);
  const satisfaction = groups.length > 0 ? Math.round(groups.reduce((sum, group) => sum + group.satisfaction, 0) / groups.length) : 75;
  economy = { ...economy, demand, satisfaction };
}

function findRoutePath(origin: Station, destination: Station) {
  const direct = origin.connectedRouteIds.find((routeId) => isRouteOperational(routeId) && destination.connectedRouteIds.includes(routeId));
  if (direct) return [direct];
  for (const originRoute of origin.connectedRouteIds.filter(isRouteOperational)) {
    for (const destinationRoute of destination.connectedRouteIds.filter(isRouteOperational)) {
      const hasTransfer = transfers.some((transfer) => {
        const transferStations = transfer.stationIds.map((id) => stations.find((station) => station.id === id)).filter(Boolean) as Station[];
        const hasOriginRoute = transferStations.some((station) => station.connectedRouteIds.includes(originRoute));
        const hasDestinationRoute = transferStations.some((station) => station.connectedRouteIds.includes(destinationRoute));
        return hasOriginRoute && hasDestinationRoute;
      });
      if (hasTransfer) return [originRoute, destinationRoute];
    }
  }
  return [];
}

function mixOperation(routeIds: string[]) {
  const operations = routeIds.map((routeId) => calculateRouteOperation(routeId));
  if (operations.length === 0) return { waitMin: 18, crowding: 1.8 };
  return {
    waitMin: operations.reduce((sum, operation) => sum + (operation.waitMin || 18), 0),
    crowding: operations.reduce((sum, operation) => sum + operation.crowding, 0) / operations.length,
  };
}

function calculateGroupTransferResistance(origin: Station, destination: Station, routeIds: string[]) {
  if (routeIds.length <= 1) return 0;
  const relevant = transfers.filter((transfer) => {
    const transferStations = transfer.stationIds.map((id) => stations.find((station) => station.id === id)).filter(Boolean) as Station[];
    return routeIds.every((routeId) => transferStations.some((station) => station.connectedRouteIds.includes(routeId)));
  });
  if (relevant.length > 0) return Math.min(...relevant.map((transfer) => transfer.resistance));
  const originPoint = L.latLng(origin.position[0], origin.position[1]);
  const destinationPoint = L.latLng(destination.position[0], destination.position[1]);
  return Math.round(Math.min(160, map.distance(originPoint, destinationPoint) * 0.018));
}

function calculateGroupSatisfaction(waitMin: number, crowding: number, transferResistance: number, fare: number) {
  const farePenalty = Math.max(0, (fare - 1450) / 55);
  const score = 100 - waitMin * 1.8 - Math.max(0, crowding - 0.75) * 34 - transferResistance * 0.24 - farePenalty;
  return Math.max(5, Math.min(100, Math.round(score)));
}

/**
 * 게임 날짜가 하루 넘어갈 때 실행하는 일일 결산.
 * 승객/수익/유지비/대출/공사/통계를 같은 시점에 확정해 서로 다른 날짜의 값이
 * 섞이지 않도록 한다.
 */
function settleSimulationDay() {
  regeneratePassengerGroups();
  if (economy.autoFare) economy.fare = calculateAutoFare();
  const calculatedFareRevenue = Math.round((economy.demand * economy.fare) / 100000000);
  const fareRevenue = economy.demand > 0 ? Math.max(1, calculatedFareRevenue) : 0;
  const maintenance = calculateDailyMaintenance();
  const loanInterest = loans.reduce((sum, loan) => sum + loan.balance * (loan.interestRate / 365), 0);
  const loanPayment = loans.reduce((sum, loan) => sum + loan.monthlyPayment / 30, 0);
  const principalRepaid = Math.max(0, Math.round(loanPayment - loanInterest));
  economy = {
    ...economy,
    revenue: fareRevenue,
    maintenance,
    loanBalance: Math.round(loans.reduce((sum, loan) => sum + loan.balance, 0)),
    cash: currentMeta.mode === "sandbox" ? 999999999 : Math.round(economy.cash + fareRevenue - maintenance - loanInterest - loanPayment),
  };
  loans = loans
    .map((loan) => {
      const interest = loan.balance * (loan.interestRate / 365);
      const principalPaid = Math.max(0, loan.monthlyPayment / 30 - interest);
      return { ...loan, balance: Math.max(0, Math.round(loan.balance - principalPaid)) };
    })
    .filter((loan) => loan.balance > 0);
  applyCityGrowth();
  updateCareerProgress();
  analysisState = { ...analysisState, dayIndex: analysisState.dayIndex + 1, lastFingerprint: "" };
  updateNewsEventsForDay();
  updateConstructionProjectsForDay();
  recordDemandSnapshot();
  refreshOperationSuggestions(true);
  const finances = calculateNetworkFinancials();
  const dailyRecord: DailyStatisticsRecord = {
    day: analysisState.dayIndex,
    revenue: fareRevenue,
    expenses: Math.round(maintenance + loanInterest + loanPayment),
    passengers: economy.demand,
    satisfaction: economy.satisfaction,
    transitShare: finances.transitShare,
    assets: finances.assets,
    liabilities: finances.liabilities,
  };
  statisticsState = {
    ...statisticsState,
    totalPassengers: statisticsState.totalPassengers + economy.demand,
    totalLoanRepaid: statisticsState.totalLoanRepaid + principalRepaid,
    dailyRecords: [...statisticsState.dailyRecords.filter((item) => item.day !== dailyRecord.day), dailyRecord].slice(-90),
  };
  const criticalCount = analysisState.suggestions.filter((suggestion) => suggestion.status === "active" && suggestion.severity === "critical").length;
  if (criticalCount > 0 && analysisState.lastNotifiedDay !== analysisState.dayIndex) {
    analysisState = { ...analysisState, lastNotifiedDay: analysisState.dayIndex };
    showToast(`운영 분석에 우선 확인 제안 ${criticalCount}건이 있습니다.`);
  }
  persistState();
  renderAll(selectedOperationRouteId);
}

function updateCareerProgress() {
  if (currentMeta.mode === "sandbox") {
    currentMeta = { ...currentMeta, unlockedCityIds: Object.keys(cityConfigs) as CityId[], bankrupt: false };
    return;
  }
  const unlocked = new Set(currentMeta.unlockedCityIds);
  if (economy.cash >= 85000) unlocked.add("daejeon");
  if (economy.cash >= 130000) unlocked.add("gwangju");
  if (economy.cash >= 180000) unlocked.add("busan");
  const bankrupt = economy.cash < difficultyConfigs[currentMeta.difficulty].bankruptcyLimit;
  if (bankrupt) {
    simSpeed = 0;
    timeButtons.forEach((button) => button.classList.toggle("active", button.dataset.speed === "0"));
    setText(modeLabel, "파산");
  }
  currentMeta = { ...currentMeta, unlockedCityIds: Array.from(unlocked), bankrupt };
}

function applyCityGrowth() {
  const cityGrowth = cityConfigs[currentMeta.cityId].growthMultiplier;
  if (economy.satisfaction < 58 || stations.length === 0) {
    stations = stations.map((station) => ({ ...station, demand: Math.max(800, Math.round(station.demand * 0.985)) }));
    return;
  }
  stations = stations.map((station) => {
    const operation = mixOperation(station.connectedRouteIds);
    const growth = operation.waitMin <= 8 && operation.crowding <= 1.15 ? 1 + 0.018 * cityGrowth : 1 + 0.006 * cityGrowth;
    return { ...station, demand: Math.min(85000, Math.round(station.demand * growth)) };
  });
}

function calculateDailyMaintenance() {
  const fleetMaintenance = trainFleets.reduce((sum, fleet) => sum + fleet.maintenanceCost, 0);
  const depotMaintenance = depots.reduce((sum, depot) => sum + depot.maintenanceCost, 0);
  const expressCost = expressConfigs.filter((config) => config.enabled).reduce((sum, config) => sum + config.extraOperatingCost, 0);
  return Math.round((fleetMaintenance + depotMaintenance + expressCost) * getNewsOperatingCostMultiplier());
}

function calculateAutoFare() {
  const operatingRoutes = routes.filter((route) => isRouteOperational(route.id));
  const avgCrowding =
    operatingRoutes.length > 0
      ? operatingRoutes.reduce((sum, route) => sum + calculateRouteOperation(route.id).crowding, 0) / operatingRoutes.length
      : 0.8;
  const target = 1350 + calculateDailyMaintenance() / 16 + Math.max(0, avgCrowding - 1) * 220;
  return clampInteger(Math.round(target / 50) * 50, 1100, 2800);
}

function takeLoan() {
  if (currentMeta.mode === "sandbox") {
    setText(facilityReadout, "샌드박스는 대출 불필요");
    return;
  }
  pushHistory();
  const principal = 30000;
  loans = [
    ...loans,
    {
      id: createId("loan"),
      principal,
      balance: principal,
      interestRate: 0.055 * difficultyConfigs[currentMeta.difficulty].loanInterestMultiplier,
      monthlyPayment: 720,
    },
  ];
  economy = { ...economy, cash: economy.cash + principal, loanBalance: economy.loanBalance + principal };
  redoStack = [];
  persistState();
  renderAll(selectedOperationRouteId);
}

function repayLoan() {
  if (currentMeta.mode === "sandbox") return;
  const firstLoan = loans.find((loan) => loan.balance > 0);
  if (!firstLoan || economy.cash <= 0) return;
  pushHistory();
  const payment = Math.min(firstLoan.balance, Math.max(1000, Math.floor(economy.cash * 0.25)));
  loans = loans
    .map((loan) => (loan.id === firstLoan.id ? { ...loan, balance: loan.balance - payment } : loan))
    .filter((loan) => loan.balance > 0);
  economy = { ...economy, cash: economy.cash - payment, loanBalance: Math.max(0, economy.loanBalance - payment) };
  redoStack = [];
  persistState();
  renderAll(selectedOperationRouteId);
}

function switchInGameMenuTab(tab: "save" | "load") {
  if (menuSaveTabButton) menuSaveTabButton.classList.toggle("active", tab === "save");
  if (menuLoadTabButton) menuLoadTabButton.classList.toggle("active", tab === "load");
  if (menuSaveTabContent) menuSaveTabContent.hidden = tab !== "save";
  if (menuLoadTabContent) menuLoadTabContent.hidden = tab !== "load";
  if (tab === "load") renderInGameSlotList();
}

function renderInGameSlotList() {
  if (!menuSlotList) return;
  menuSlotList.innerHTML = "";
  if (slotSummaries.length === 0) {
    menuSlotList.innerHTML = `<div class="menu-slot-empty">저장된 슬롯이 없습니다</div>`;
    return;
  }
  slotSummaries.forEach((slot) => {
    const isCurrent = slot.slotId === currentMeta.slotId;
    const item = document.createElement("div");
    item.className = `menu-slot-item ${isCurrent ? "active-slot" : ""}`;
    const dateStr = new Date(slot.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    item.innerHTML = `
      <div class="slot-item-info">
        <strong>${slot.slotName} ${isCurrent ? "(현재 슬롯)" : ""}</strong>
        <span>${dateStr} • 노선 ${slot.routeCount}개 • ${slot.stationCount}개 역</span>
      </div>
      <button class="slot-item-load-btn" type="button">불러오기</button>
    `;
    item.querySelector(".slot-item-load-btn")?.addEventListener("click", () => {
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
  const currentSlot = slotSummaries.find((s) => s.slotId === currentMeta.slotId);
  if (menuSaveStatusReadout) {
    const slotName = currentSlot ? currentSlot.slotName : currentMeta.slotId;
    menuSaveStatusReadout.textContent = `현재 슬롯: ${slotName}`;
  }
  playFeedback("select");
}

function closeInGameMenu() {
  if (inGameMenuDialog) inGameMenuDialog.hidden = true;
}

function openFinanceDialog() {
  if (!financeDialog) return;
  financeDialog.hidden = false;
  updateEconomyHud();
  playFeedback("select");
}

function closeFinanceDialog() {
  if (financeDialog) financeDialog.hidden = true;
}

function updateEconomyHud() {
  if (fareInput && document.activeElement !== fareInput) fareInput.value = String(economy.fare);
  setText(cashReadout, formatSignedCost(economy.cash));
  const satisfactionLabel = economy.satisfaction >= 85 ? "매우 좋음" : economy.satisfaction >= 70 ? "안정" : economy.satisfaction >= 50 ? "주의" : "불만";
  const satisfactionEmoji = economy.satisfaction >= 85 ? "😁" : economy.satisfaction >= 70 ? "😊" : economy.satisfaction >= 50 ? "😐" : "😡";
  const satisfactionColor = economy.satisfaction >= 85 ? "#2ecc71" : economy.satisfaction >= 70 ? "#52d683" : economy.satisfaction >= 50 ? "#f3ca52" : "#ff5d5d";
  setText(satisfactionReadout, `${economy.satisfaction} - ${satisfactionLabel}`);
  if (satisfactionIcon) {
    satisfactionIcon.textContent = satisfactionEmoji;
    satisfactionIcon.style.backgroundColor = satisfactionColor;
  }
  setText(demandReadout, economy.demand.toLocaleString("ko-KR"));
  const latestRecord = statisticsState.dailyRecords.at(-1);
  const dailyNet = latestRecord ? latestRecord.revenue - latestRecord.expenses : economy.revenue - economy.maintenance;
  setText(dailyNetReadout, formatSignedCost(dailyNet));
  dailyNetReadout?.classList.toggle("negative", dailyNet < 0);

  // Sync Finance Dialog Readouts & Inputs
  setText(financeCashReadout, formatSignedCost(economy.cash));
  setText(financeDailyNetReadout, formatSignedCost(dailyNet));
  financeDailyNetReadout?.classList.toggle("negative", dailyNet < 0);
  financeDailyNetReadout?.classList.toggle("positive", dailyNet >= 0);
  setText(financeLoanReadout, formatSignedCost(economy.loanBalance));
  setText(financeDemandReadout, `${economy.demand.toLocaleString("ko-KR")} 명`);
  if (dialogFareInput && document.activeElement !== dialogFareInput) dialogFareInput.value = String(economy.fare);
  dialogAutoFareButton?.classList.toggle("active", economy.autoFare);
  dialogAutoFareButton?.setAttribute("aria-pressed", String(economy.autoFare));
  if (dialogAutoFareButton) dialogAutoFareButton.textContent = economy.autoFare ? "자동 운임 적용 중" : "수동 운임 변경";

  setText(cityHudReadout, `${cityConfigs[currentMeta.cityId].name} 관제`);
  updateGameClockHud();
  updateAutoFareButton();
}

function updateGameClockHud() {
  const hours = Math.floor(simMinutes / 60) % 24;
  const minutes = Math.floor(simMinutes % 60);
  setText(gameDayReadout, `${analysisState.dayIndex + 1}일차`);
  setText(gameClockReadout, `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
}

function updateAutoFareButton() {
  if (!autoFareButton) return;
  autoFareButton.classList.toggle("active", economy.autoFare);
  autoFareButton.setAttribute("aria-pressed", String(economy.autoFare));
  autoFareButton.textContent = economy.autoFare ? "자동" : "수동";
}

function updateOperationRouteOptions() {
  if (!operationRouteSelect) return;
  const previous = selectedOperationRouteId || operationRouteSelect.value;
  operationRouteSelect.innerHTML = routes.map((route) => `<option value="${route.id}">${route.name}</option>`).join("");
  selectedOperationRouteId = routes.some((route) => route.id === previous) ? previous : routes[0]?.id ?? "";
  operationRouteSelect.value = selectedOperationRouteId;
  updateExpressButton();
}

function updateExpressButton() {
  if (!expressButton) return;
  const config = expressConfigs.find((item) => item.routeId === selectedOperationRouteId);
  expressButton.classList.toggle("active", Boolean(config?.enabled));
  expressButton.setAttribute("aria-pressed", String(Boolean(config?.enabled)));
  expressButton.textContent = config?.unlocked ? (config.enabled ? "급행중" : "급행") : "급행 해금";
}

/**
 * requestAnimationFrame에서 호출되는 게임 시계 루프.
 * 실제 프레임 간격에 선택한 배속을 곱해 게임 시간을 진행하고, 날짜 경계를 넘으면
 * settleSimulationDay에서 한 번만 결산한다.
 */
function tickSimulation(timestamp: number) {
  const realDeltaSeconds = Math.min(1, Math.max(0, (timestamp - lastFrameTime) / 1000));
  const deltaMinutes = (realDeltaSeconds / 60) * simSpeed * 60;
  lastFrameTime = timestamp;
  currentMeta = { ...currentMeta, playTimeSeconds: (currentMeta.playTimeSeconds ?? 0) + realDeltaSeconds };
  if (simSpeed > 0) {
    simMinutes = (simMinutes + deltaMinutes) % 1440;
    simDayAccumulator += deltaMinutes;
    if (simDayAccumulator >= 1440) {
      simDayAccumulator -= 1440;
      settleSimulationDay();
    }
    const frameBudget = settings.performanceMode === "battery" ? 66 : 16;
    if (timestamp - lastTrainRender >= frameBudget) {
      lastTrainRender = timestamp;
      renderTrains();
    }
  }
  if (timestamp - lastHudClockUpdate >= 250) {
    lastHudClockUpdate = timestamp;
    updateGameClockHud();
  }
  requestAnimationFrame(tickSimulation);
}

function expandDepot(id: string) {
  const depot = depots.find((item) => item.id === id);
  if (!depot) return;
  pushHistory();
  depots = depots.map((item) => {
    if (item.id !== id) return item;
    const level = item.level + 1;
    return {
      ...item,
      level,
      capacity: calculateDepotCapacity(item.areaHa, level),
      maintenanceCost: calculateDepotMaintenance(item.areaHa, level),
    };
  });
  redoStack = [];
  persistState();
  renderAll(id);
}

function updateHud(selectedId?: string) {
  const selectedRoute = routes.find((route) => route.id === selectedId) ?? routes.at(-1);
  const selectedStation = stations.find((station) => station.id === selectedId);
  const selectedDepot = depots.find((depot) => depot.id === selectedId || depot.id === selectedDepotId);
  const sumCost = routes.reduce((sum, route) => sum + route.constructionCost, 0);
  setText(routeCount, `${routes.length}개 노선`);
  setText(stationCount, `${stations.length}개 역`);
  setText(depotCount, `${depots.length}개 기지`);
  setText(selectedRouteName, selectedRoute ? `${selectedRoute.name} · ${selectedRoute.lengthKm.toFixed(1)} km` : "건설 대기");
  setText(totalCost, formatCost(sumCost));
  setText(costReadout, selectedRoute ? formatCost(selectedRoute.constructionCost) : "0억");
  if (selectedStation) {
    const transfer = transfers.find((item) => item.id === selectedStation.transferGroupId);
    setText(facilityReadout, transfer ? `환승저항 ${transfer.resistance}` : `수요 ${selectedStation.demand.toLocaleString("ko-KR")}`);
  } else if (selectedDepot) {
    setText(facilityReadout, `${selectedDepot.capacity}편성 · ${formatCost(selectedDepot.maintenanceCost)}/월`);
  } else {
    setText(facilityReadout, transfers.length > 0 ? `${transfers.length}개 환승` : "시설 대기");
  }
  if (planningMode) {
    const plan = getActivePlan(false);
    setText(routeCount, `${routes.length}개 노선 · 계획 ${plans.filter((item) => item.cityId === currentMeta.cityId).length}`);
    setText(selectedRouteName, plan ? `${plan.name} · ${plan.routes.length}개 예정 노선` : "새 계획 대기");
    setText(stationCount, `${stations.length}개 역 · 예정 ${plan?.stations.filter((item) => !item.completed).length ?? 0}`);
    setText(depotCount, `${depots.length}개 기지 · 예정 ${plan?.depots.filter((item) => !item.completed).length ?? 0}`);
    setText(totalCost, formatCost(plan?.remainingCost ?? 0));
    setText(costReadout, formatCost(plan?.remainingCost ?? 0));
    setText(facilityReadout, plan ? `예상 수요 ${plan.expectedDemand.toLocaleString("ko-KR")}` : "계획 시설 대기");
  }
  if (undoButton) undoButton.disabled = undoStack.length === 0;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
}

function setTool(tool: ToolMode) {
  const allowedTools: Record<WorkspaceMode, ToolMode[]> = {
    management: ["pan"],
    planning: ["pan", "route", "extend", "station", "transfer", "depot", "eraser", "branch", "merge"],
    construction: ["pan", "eraser"],
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
  if (constructionDraft) cancelConstructionDraft();
  activeTool = tool;
  document.body.dataset.activeTool = tool;
  const modifyToolActive = ["eraser", "extend", "branch", "merge"].includes(tool);
  if (modifyToolsButton) modifyToolsButton.classList.toggle("active", modifyToolActive);
  if (modifyToolsCard) modifyToolsCard.hidden = true;
  modifyToolsButton?.setAttribute("aria-expanded", "false");
  modifyToolsButton?.setAttribute("aria-pressed", String(modifyToolActive));
  updateRouteSettingsCard(tool);
  if (eraserSizeControl) eraserSizeControl.hidden = tool !== "eraser";
  cancelActiveDrawing();
  if (tool !== "merge") plannedMergeFirstEndpoint = null;
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
  if (tool === "pan") {
    map.dragging.enable();
    map.doubleClickZoom.enable();
    selectedTransferStationIds = [];
    selectedPlannedStationIds = [];
    selectedManualTransferEndpoints = [];
    depotGuideLayer.clearLayers();
    repairGuideLayer.clearLayers();
    editGuideLayer.clearLayers();
    deleteAnchor = null;
    mergeFirstEndpoint = null;
    updateLod();
    renderAll(selectedRouteId ?? undefined);
    return;
  }
  map.dragging.disable();
  map.doubleClickZoom.disable();
  const labels: Record<ToolMode, [string, string[]]> = {
    pan: ["지도 탐색", ["한 손가락 이동", "핀치 줌"]],
    route: ["노선 건설", ["드래그로 노선", "역 도구로 역 추가"]],
    extend: planningMode ? ["계획 노선 연장", ["계획 노선의 시작점 또는 끝점에서 시작", "드래그 후 기존 계획에 반영"]] : ["노선 연장", ["기존 노선의 끝점에서 시작", "끝점을 누른 뒤 드래그"]],
    edit: ["경로 편집", ["노선 선택 후 핸들 드래그", "비용·환급 자동 계산"]],
    eraser: planningMode
      ? ["계획 노선 지우개", ["지울 범위의 시작점과 끝점을 차례로 터치", "삭제 후 남은 구간은 별도 노선이 됩니다"]]
      : ["구간 삭제", ["같은 노선에서 두 지점 선택", "분리 전 영향 확인"]],
    reconnect: ["노선 수정", ["붉은 수정 지점에서 시작", "반대쪽 지점까지 드래그"]],
    branch: planningMode ? ["계획 분기", ["계획 노선 위에서 시작", "새 점선 분기를 그린 뒤 계획에 저장"]] : ["분기 건설", ["기존 노선 위에서 시작", "완공 후 균등 배차"]],
    merge: planningMode ? ["계획 노선 연결", ["첫 계획 노선 끝점 선택", "다른 계획 노선 끝점 선택", "자금 차감 없이 하나의 설계안으로 정리"]] : ["노선 연결", ["첫 노선 끝점 선택", "다른 노선 끝점 선택", "거리와 비용을 확인한 뒤 확정"]],
    station: ["역 배치", ["완성 노선 위 터치", "가까운 노선 자동 연결"]],
    transfer: ["수동 환승", ["첫 번째 기존역 또는 계획역 선택", "두 번째 역 선택", "자동 환승 없음"]],
    depot: ["차량기지", ["노선과 겹치거나 30m 안", "밝게 표시된 노선에 닿게 그리기"]],
    expressStop: ["급행 정차역", ["정차역 터치 토글", "급행 운영비 추가"]],
  };
  setText(modeLabel, labels[tool][0]);
  setHint(labels[tool][1]);
  if (planningMode) {
    setText(modeLabel, `계획 · ${labels[tool][0]}`);
    setHint(labels[tool][1]);
  }
  if (tool === "depot") renderDepotConnectionGuide();
  else depotGuideLayer.clearLayers();
  if (tool === "reconnect") renderRepairGuide();
  else repairGuideLayer.clearLayers();
  if (tool === "edit") renderEditHandles();
  else if (tool === "eraser") renderDeleteGuide();
  else if (tool === "merge") renderMergeGuide();
  else editGuideLayer.clearLayers();
  renderPlans();
  updateDynamicLayers();
  playFeedback("select");
}

function cancelActiveDrawing() {
  activePointerId = null;
  activeExtension = null;
  activeRepair = null;
  activeBranch = null;
  activePlanningContinuation = null;
  activeHandleMove = null;
  handlePreviewCoordinates = null;
  rawDrawPoints = [];
  previewLayer.clearLayers();
  map.dragging.enable();
}

function selectRoute(routeId: string | null, shouldRender = true) {
  selectedRouteId = routeId && routes.some((route) => route.id === routeId) ? routeId : null;
  if (selectedRouteId) {
    selectedOperationRouteId = selectedRouteId;
    const route = routes.find((item) => item.id === selectedRouteId);
    if (route) selectedColor = route.color;
  } else {
    // 노선 선택 해제 시 우측 카드 닫기 (closeLineManager 직접 호출하지 않고 hidden만 처리)
    if (rightLineControlCard) rightLineControlCard.hidden = true;
  }
    deleteAnchor = null;
    plannedDeleteAnchor = null;
  mergeFirstEndpoint = null;
  if (shouldRender) renderAll(selectedRouteId ?? undefined);
}

function findRoutesAtPoint(point: L.Point, thresholdPx: number) {
  return routes
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
        `<button type="button" data-route-id="${route.id}"><i style="background:${route.color}"></i><span><strong>${escapeHtml(route.name)}</strong><small>${route.lengthKm.toFixed(1)}km · ${(route.branches?.length ?? 0)}개 분기</small></span></button>`,
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

function openLeftRouteWindow() {
  if (!leftRouteWindow) return;
  renderLeftRouteWindow();
  leftRouteWindow.hidden = false;
  playFeedback("select");
}

function closeLeftRouteWindow() {
  if (leftRouteWindow) leftRouteWindow.hidden = true;
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
  const totalKm = routes.reduce((sum, r) => sum + r.lengthKm, 0);
  setText(leftRouteTotalCount, `${routes.length}개`);
  setText(leftRouteTotalKm, `${totalKm.toFixed(1)} km`);

  leftRouteList.innerHTML = "";
  if (routes.length === 0) {
    leftRouteList.innerHTML = `
      <div class="left-route-empty">
        <span>등록된 노선이 없습니다</span>
        <small>새 노선을 건설하여 지하철망을 구축해보세요</small>
      </div>
    `;
    return;
  }

  routes.forEach((route) => {
    const isSelected = route.id === selectedRouteId;
    const item = document.createElement("div");
    item.className = `left-route-item ${isSelected ? "selected-route-item" : ""}`;
    const status = route.operationPaused ? "운행 중지" : route.visibility === "planning" ? "계획" : "운행 중";
    const routeStationCount = stations.filter((s) => s.connectedRouteIds.includes(route.id)).length;

    item.innerHTML = `
      <div class="route-item-left">
        <span class="route-badge-dot" style="background: ${route.color}"></span>
        <div class="route-item-details">
          <strong class="route-item-name">${escapeHtml(route.name)}</strong>
          <span class="route-item-meta">${route.lengthKm.toFixed(1)}km · ${routeStationCount}개 역 · ${status}</span>
        </div>
      </div>
      <button class="route-item-manage-btn" type="button">${isSelected ? "선택됨" : "선택"}</button>
    `;

    item.querySelector(".route-item-manage-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedRouteId = route.id;
      renderAll(selectedRouteId);
      renderLeftRouteWindow();
      openLineManager();
      showToast(`${route.name} 노선 관리 패널을 열었습니다.`);
    });

    item.addEventListener("click", () => {
      selectedRouteId = route.id;
      renderAll(selectedRouteId);
      renderLeftRouteWindow();
      openLineManager();
      playFeedback("select");
      showToast(`${route.name} 노선이 선택되었습니다.`);
    });

    leftRouteList.appendChild(item);
  });
}

function closeRouteChoice() {
  if (routeChoiceDialog) routeChoiceDialog.hidden = true;
}

function updateSelectedLinePanel() {
  const route = routes.find((item) => item.id === selectedRouteId);
  if (!route) {
    setText(selectedLineTitle, "노선 선택");
    setText(selectedLineMeta, "지도를 눌러 노선을 선택하세요");
    if (selectedLineColor) selectedLineColor.style.background = "#94a3b8";
    return;
  }
  setText(selectedLineTitle, route.name);
  const status = route.operationPaused ? "운행 중지" : route.visibility === "planning" ? "계획 공개" : "운행 중";
  const branchLabel = (route.branches?.length ?? 0) > 0 ? ` · 분기 ${route.branches!.length}` : "";
  setText(selectedLineMeta, `${route.lengthKm.toFixed(1)}km · ${status}${branchLabel}`);
  if (selectedLineColor) selectedLineColor.style.background = route.color;
}

function openLineManager() {
  const route = routes.find((item) => item.id === selectedRouteId) || routes[0];
  if (!route || !rightLineControlCard) {
    showToast("먼저 노선을 선택하세요");
    return;
  }
  selectedRouteId = route.id;
  if (lineNameInput) lineNameInput.value = route.name;
  if (lineColorInput) lineColorInput.value = route.color;
  if (lineVisibilitySelect) lineVisibilitySelect.value = route.visibility ?? "public";
  if (localServiceToggle) localServiceToggle.checked = route.localServiceEnabled !== false;
  if (expressServiceToggle) expressServiceToggle.checked = route.expressServiceEnabled === true || getExpressConfig(route.id).enabled;
  if (operationPausedToggle) operationPausedToggle.checked = route.operationPaused === true;
  if (lineFareInput) lineFareInput.value = String(economy.fare);
  if (lineAutoFareButton) {
    lineAutoFareButton.classList.toggle("active", economy.autoFare);
    lineAutoFareButton.textContent = economy.autoFare ? "자동 요금 적용 중" : "수동 요금";
  }
  setText(
    lineManagerSummary,
    `${route.lengthKm.toFixed(1)}km · 역 ${stations.filter((station) => station.connectedRouteIds.includes(route.id)).length}개 · 분기 ${(route.branches?.length ?? 0)}개`,
  );
  rightLineControlCard.hidden = false;
  playFeedback("select");
}

function closeLineManager() {
  if (rightLineControlCard) rightLineControlCard.hidden = true;
}

function openTrainManagerModal() {
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
  if (!trainManagerDialog) return;
  renderTrainManager();
  trainManagerDialog.hidden = false;
  playFeedback("select");
}

function closeTrainManagerModal() {
  if (trainManagerDialog) trainManagerDialog.hidden = true;
}

function renderTrainManager() {
  if (!trainManagerContent) return;
  const route = routes.find((item) => item.id === selectedRouteId) || routes[0];
  if (!route) {
    trainManagerContent.innerHTML = `<div class="left-route-empty"><span>선택된 노선이 없습니다</span></div>`;
    return;
  }

  const routeFleets = trainFleets.filter((f) => f.routeId === route.id);
  const totalSets = routeFleets.reduce((sum, f) => sum + f.sets, 0);
  const connectedDepotCapacity = depots
    .filter((depot) => isDepotOperational(depot.id) && depot.connectedRouteIds.includes(route.id))
    .reduce((sum, depot) => sum + depot.capacity, 0);
  const operation = calculateRouteOperation(route.id);
  const selectedFleet = routeFleets.find((fleet) => fleet.id === selectedTrainFleetId);
  const selectedTrainSummary = selectedFleet
    ? `<div class="selected-train-summary" style="--selected-train-color:${escapeHtml(route.color)}">
        <span>선택한 열차</span>
        <strong>${escapeHtml(trainCatalog[selectedFleet.trainType].label)} · ${selectedFleet.cars}량 ${selectedTrainSetNumber ? `· ${selectedTrainSetNumber}편성` : ""}</strong>
      </div>`
    : "";

  trainManagerContent.innerHTML = `
    ${selectedTrainSummary}
    <div class="train-modal-header-chip" style="border-left: 4px solid ${route.color}">
      <div>
        <strong style="color: ${route.color}">${escapeHtml(route.name)}</strong>
        <span class="train-sub-info">배치 중: ${totalSets}편성 · 배차 간격: ${operation.headwayMin.toFixed(1)}분</span>
      </div>
      <div class="depot-capacity-chip">기지 수용력: ${totalSets} / ${connectedDepotCapacity}</div>
    </div>

    <div class="train-fleet-list">
      ${
        routeFleets.length === 0
          ? `<div class="left-route-empty"><span>배치된 열차가 없습니다</span><small>아래에서 신규 열차 편성을 도입하세요</small></div>`
          : routeFleets
              .map((fleet) => {
                const spec = trainCatalog[fleet.trainType];
                return `
            <div class="fleet-card-item">
              <div class="fleet-card-info">
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
              })
              .join("")
      }
    </div>

    <div class="train-add-section">
      <h3>신규 열차 편성 추가</h3>
      <div class="train-add-grid">
        <label class="manager-field">
          <span>차량 종류</span>
          <select id="modalTrainTypeSelect">
            <option value="metro">도시철도 (160명/량 · 34km/h)</option>
            <option value="commuter">광역전철 (190명/량 · 42km/h)</option>
            <option value="express">급행형 (150명/량 · 54km/h)</option>
          </select>
        </label>
        <label class="manager-field">
          <span>편성당 차량 수</span>
          <select id="modalCarCountSelect">
            <option value="4">4량 편성</option>
            <option value="6" selected>6량 편성</option>
            <option value="8">8량 편성</option>
            <option value="10">10량 편성</option>
          </select>
        </label>
      </div>
      <button id="modalAddFleetButton" type="button" class="modal-add-fleet-btn">
        ➕ 신규 편성 구입 및 배치 (+80억)
      </button>
    </div>
  `;

  trainManagerContent.querySelectorAll<HTMLButtonElement>(".fleet-qty-btn.increase").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fleetId = btn.dataset.fleetId;
      const fleet = trainFleets.find((f) => f.id === fleetId);
      if (fleet) {
        fleet.sets += 1;
        persistState();
        renderTrainManager();
        renderAll(route.id);
        showToast(`${route.name} 열차 1편성을 추가 배치했습니다.`);
      }
    });
  });

  trainManagerContent.querySelectorAll<HTMLButtonElement>(".fleet-qty-btn.decrease").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fleetId = btn.dataset.fleetId;
      const fleet = trainFleets.find((f) => f.id === fleetId);
      if (fleet) {
        if (fleet.sets > 1) {
          fleet.sets -= 1;
        } else {
          trainFleets = trainFleets.filter((f) => f.id !== fleetId);
        }
        persistState();
        renderTrainManager();
        renderAll(route.id);
        showToast(`${route.name} 열차 편성을 감축했습니다.`);
      }
    });
  });

  byId("modalAddFleetButton")?.addEventListener("click", () => {
    const trainTypeSelect = byId("modalTrainTypeSelect") as HTMLSelectElement;
    const carCountSelect = byId("modalCarCountSelect") as HTMLSelectElement;
    const trainType = (trainTypeSelect?.value as TrainType) || "metro";
    const cars = Number(carCountSelect?.value ?? 6);
    const spec = trainCatalog[trainType];

    pushHistory();
    trainFleets.push({
      id: createId("fleet"),
      routeId: route.id,
      trainType,
      cars,
      sets: 1,
      capacity: spec.capacityPerCar * cars,
      purchaseCost: Math.round(spec.pricePerCar * cars),
      maintenanceCost: Math.round(spec.maintenancePerCar * cars),
    });

    economy = { ...economy, cash: economy.cash - Math.round(spec.pricePerCar * cars) };
    persistState();
    renderTrainManager();
    renderAll(route.id);
    playFeedback("confirm");
    showToast(`${route.name}에 신규 ${cars}량 ${spec.label} 1편성을 도입했습니다.`);
  });
}

function saveLineManager() {
  const route = routes.find((item) => item.id === selectedRouteId);
  if (!route) return;
  const nextName = lineNameInput?.value.trim() || route.name;
  pushHistory();
  const fareVal = parseInt(lineFareInput?.value || "", 10);
  if (!isNaN(fareVal)) {
    economy = { ...economy, fare: clampInteger(fareVal, 900, 4200) };
  }
  routes = routes.map((item) =>
    item.id === route.id
      ? {
          ...item,
          name: nextName,
          color: lineColorInput?.value || item.color,
          visibility: lineVisibilitySelect?.value === "planning" ? "planning" : "public",
          localServiceEnabled: localServiceToggle?.checked ?? true,
          expressServiceEnabled: expressServiceToggle?.checked ?? false,
          operationPaused: operationPausedToggle?.checked ?? false,
          servicePatterns: (item.servicePatterns ?? []).map((pattern) =>
            pattern.kind === "local"
              ? { ...pattern, enabled: localServiceToggle?.checked ?? true }
              : { ...pattern, enabled: expressServiceToggle?.checked ?? false },
          ),
        }
      : item,
  );
  const expressEnabled = expressServiceToggle?.checked ?? false;
  expressConfigs = [
    ...expressConfigs.filter((config) => config.routeId !== route.id),
    { ...getExpressConfig(route.id), unlocked: expressEnabled || getExpressConfig(route.id).unlocked, enabled: expressEnabled },
  ];
  redoStack = [];
  persistState();
  closeLineManager();
  renderAll(route.id);
  showToast(`${nextName} 설정을 저장했습니다`);
  playFeedback("confirm");
}

function requestWholeLineDemolition() {
  const route = routes.find((item) => item.id === selectedRouteId);
  if (!route) return;
  const exclusiveStations = stations.filter((station) => station.connectedRouteIds.length === 1 && station.connectedRouteIds.includes(route.id));
  const sharedStations = stations.filter((station) => station.connectedRouteIds.length > 1 && station.connectedRouteIds.includes(route.id));
  const fleetCount = trainFleets.filter((fleet) => fleet.routeId === route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  openDecisionDialog(
    `“${route.name}” 노선 전체를 철거할까요?`,
    `노선과 전용 역 ${exclusiveStations.length}개를 함께 삭제합니다.${sharedStations.length > 0 ? ` 환승역 ${sharedStations.length}개는 다른 노선에 남기고 이 노선 연결만 해제합니다.` : ""}${fleetCount > 0 ? ` 배정 차량 ${fleetCount}편성도 운행에서 해제됩니다.` : ""}`,
    "노선·역 전체 철거",
    () => demolishWholeLine(route.id),
  );
}

function demolishWholeLine(routeId: string) {
  const route = routes.find((item) => item.id === routeId);
  if (!route) return;
  const removableStationIds = new Set(stations.filter((station) => station.connectedRouteIds.length === 1 && station.connectedRouteIds.includes(routeId)).map((station) => station.id));
  pushHistory();
  routes = routes.filter((item) => item.id !== routeId);
  stations = stations
    .filter((station) => !removableStationIds.has(station.id))
    .map((station) => (station.connectedRouteIds.includes(routeId) ? { ...station, connectedRouteIds: station.connectedRouteIds.filter((id) => id !== routeId) } : station));
  expressConfigs = expressConfigs.map((config) => ({ ...config, stopStationIds: config.stopStationIds.filter((id) => !removableStationIds.has(id)) }));
  constructionProjects = constructionProjects
    .map((project) => ({
      ...project,
      routeIds: project.routeIds.filter((id) => id !== routeId),
      stationIds: project.stationIds.filter((id) => !removableStationIds.has(id)),
    }))
    .filter((project) => project.routeIds.length > 0 || project.stationIds.length > 0 || project.depotIds.length > 0);
  cleanupTransferData();
  synchronizeGraphReferences();
  selectedRouteId = null;
  selectedOperationRouteId = routes[0]?.id ?? "";
  redoStack = [];
  persistState();
  closeLineManager();
  renderAll();
  showToast(`${route.name} 노선과 전용 역 ${removableStationIds.size}개를 철거했습니다.`);
  playFeedback("confirm");
}

function renderEditHandles() {
  editGuideLayer.clearLayers();
  const route = routes.find((item) => item.id === selectedRouteId);
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
  const route = routes.find((item) => item.id === selectedRouteId);
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
  const route = routes.find((item) => item.id === routeId);
  if (!route) return;
  const lengthKm = calculateLengthKmPrecise(coordinates.map(([lat, lng]) => L.latLng(lat, lng)));
  const deltaKm = lengthKm - route.lengthKm;
  const deltaCost = calculateEditCostDelta(deltaKm);
  setText(costReadout, formatSignedCost(deltaCost));
  setText(facilityReadout, `${deltaKm >= 0 ? "+" : ""}${deltaKm.toFixed(2)}km · ${deltaCost < 0 ? "환급" : "추가"} ${formatCost(Math.abs(deltaCost))}`);
}

function calculateEditCostDelta(deltaKm: number) {
  const raw = deltaKm * baseCostPerKm * cityConfigs[currentMeta.cityId].constructionMultiplier * difficultyConfigs[currentMeta.difficulty].costMultiplier;
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
  const affectedStations = stations.filter(
    (station) => station.connectedRouteIds.includes(route.id) && distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), removed) < 75,
  );
  const fleetCount = trainFleets.filter((fleet) => fleet.routeId === route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
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
    const plan = plans.find((item) => item.id === planId);
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
    currentMeta = { ...currentMeta, updatedAt: Date.now() };
    persistState();
    await writeSaveSlot(cloneState());
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    renderPlanningDialog();
    renderAll();
    showToast("선택한 계획 구간을 지웠습니다. 실행 취소로 복원할 수 있습니다.");
    playFeedback("confirm");
  } catch (error) {
    applyState(before);
    persistState();
    renderAll();
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
    expectedRevenue: Math.round((expectedDemand * economy.fare * 365) / 100000000),
    transferEffect: estimatePlannedTransferEffect(points),
  };
}

function renderDeleteGuide() {
  editGuideLayer.clearLayers();
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
  const route = routes.find((item) => item.id === deleteAnchor!.routeId);
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

function openDecisionDialog(message: string, warning: string, confirmLabel: string, action: () => void) {
  if (!decisionDialog) return;
  setText(decisionMessage, message);
  setText(decisionWarning, warning);
  if (decisionWarning) decisionWarning.hidden = !warning;
  if (decisionConfirmButton) decisionConfirmButton.textContent = confirmLabel;
  pendingDecision = action;
  decisionDialog.hidden = false;
}

function closeDecisionDialog() {
  pendingDecision = null;
  if (decisionDialog) decisionDialog.hidden = true;
}

function splitRouteAtRange(routeId: string, startIndex: number, endIndex: number, removedLength: number) {
  const route = routes.find((item) => item.id === routeId);
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
  routes = routes.flatMap((item) => (item.id === routeId ? [first, second] : [item]));
  stations = stations.map((station) => {
    if (!station.connectedRouteIds.includes(routeId)) return station;
    const point = L.latLng(station.position[0], station.position[1]);
    const firstDistance = distanceToCoordinatesMeters(point, first.coordinates);
    const secondDistance = distanceToCoordinatesMeters(point, second.coordinates);
    const replacement = firstDistance <= secondDistance ? routeId : secondId;
    return { ...station, connectedRouteIds: Array.from(new Set(station.connectedRouteIds.map((id) => (id === routeId ? replacement : id)))) };
  });
  splitFleetBetweenRoutes(routeId, secondId);
  depots = depots.map((depot) =>
    depot.connectedRouteIds.includes(routeId) && depotTouchesRoute(depot, second)
      ? { ...depot, connectedRouteIds: Array.from(new Set([...depot.connectedRouteIds, secondId])) }
      : depot,
  );
  expressConfigs = expressConfigs.flatMap((config) =>
    config.routeId === routeId ? [{ ...config, stopStationIds: config.stopStationIds.filter((id) => stations.find((station) => station.id === id)?.connectedRouteIds.includes(routeId)) }] : [config],
  );
  cleanupTransferData();
  const refund = Math.round(removedLength * baseCostPerKm * 0.35);
  economy = { ...economy, cash: economy.cash + refund, constructionSpent: Math.max(0, economy.constructionSpent - refund) };
  redoStack = [];
  persistState();
  selectRoute(routeId, false);
  renderAll(routeId);
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
  routes = remaining ? routes.map((item) => (item.id === route.id ? remaining : item)) : routes.filter((item) => item.id !== route.id);
  stations = stations
    .map((station) => {
      if (!station.connectedRouteIds.includes(route.id)) return station;
      const staysConnected = remaining && distanceToCoordinatesMeters(L.latLng(...station.position), remaining.coordinates) <= 75;
      return { ...station, connectedRouteIds: staysConnected ? station.connectedRouteIds : station.connectedRouteIds.filter((id) => id !== route.id) };
    })
    .filter((station) => station.connectedRouteIds.length > 0);
  if (!remaining) trainFleets = trainFleets.filter((fleet) => fleet.routeId !== route.id);
  depots = depots.map((depot) =>
    depot.connectedRouteIds.includes(route.id) && (!remaining || !depotTouchesRoute(depot, remaining))
      ? { ...depot, connectedRouteIds: depot.connectedRouteIds.filter((id) => id !== route.id) }
      : depot,
  );
  expressConfigs = expressConfigs
    .filter((config) => remaining || config.routeId !== route.id)
    .map((config) => config.routeId === route.id ? { ...config, stopStationIds: config.stopStationIds.filter((id) => stations.some((station) => station.id === id)) } : config);
  cleanupTransferData();
  const refund = Math.round(removedLength * baseCostPerKm * 0.35);
  economy = { ...economy, cash: economy.cash + refund, constructionSpent: Math.max(0, economy.constructionSpent - refund) };
  redoStack = [];
  persistState();
  selectRoute(remaining?.id ?? null, false);
  renderAll(remaining?.id);
  showToast(remaining ? route.name + "의 끝 구간을 철거했습니다 · " + formatCost(refund) + " 환급" : route.name + "을 철거했습니다 · " + formatCost(refund) + " 환급");
  playFeedback("confirm");
}

function splitFleetBetweenRoutes(firstId: string, secondId: string) {
  trainFleets = trainFleets.flatMap((fleet) => {
    if (fleet.routeId !== firstId || fleet.sets < 2) return [fleet];
    const secondSets = Math.floor(fleet.sets / 2);
    return [
      { ...fleet, sets: fleet.sets - secondSets, capacity: Math.round(fleet.capacity * ((fleet.sets - secondSets) / fleet.sets)) },
      { ...fleet, id: createId("fleet"), routeId: secondId, sets: secondSets, capacity: Math.round(fleet.capacity * (secondSets / fleet.sets)) },
    ];
  });
}

function selectMergeEndpoint(point: L.Point) {
  const endpoint = findNearestRouteEndpoint(point, 36, undefined, mergeFirstEndpoint?.routeId);
  if (!endpoint) {
    setText(facilityReadout, "병합할 노선 끝점을 선택하세요");
    return;
  }
  if (!mergeFirstEndpoint) {
    selectRoute(endpoint.routeId, false);
    mergeFirstEndpoint = endpoint;
    renderMergeGuide();
    setText(facilityReadout, "연결할 다른 노선의 끝점을 선택하세요");
    return;
  }
  if (endpoint.routeId === mergeFirstEndpoint.routeId) {
    setText(facilityReadout, "서로 다른 노선을 선택하세요");
    return;
  }
  const firstLatLng = map.containerPointToLatLng(mergeFirstEndpoint.endpoint);
  const secondLatLng = map.containerPointToLatLng(endpoint.endpoint);
  const bridgeLengthKm = calculateLengthKmPrecise(smoothCoordinateBridge([firstLatLng.lat, firstLatLng.lng], [secondLatLng.lat, secondLatLng.lng]).map(([lat, lng]) => L.latLng(lat, lng)));
  const bridgeCost = Math.round(bridgeLengthKm * baseCostPerKm * cityConfigs[currentMeta.cityId].constructionMultiplier * difficultyConfigs[currentMeta.difficulty].costMultiplier);
  pendingMerge = { first: mergeFirstEndpoint, second: endpoint, bridgeLengthKm, bridgeCost };
  mergeFirstEndpoint = null;
  openMergeDialog(pendingMerge);
}

function selectPlannedMergeEndpoint(point: L.Point) {
  const plan = getActivePlan(false);
  if (!plan) return;
  const endpoint = findNearestPlannedRouteEndpoint(point, 56, plannedMergeFirstEndpoint?.routeId);
  if (!endpoint) {
    setText(facilityReadout, "연결할 계획 노선의 끝점을 선택하세요");
    return;
  }
  if (!plannedMergeFirstEndpoint) {
    plannedMergeFirstEndpoint = endpoint;
    renderMergeGuide();
    setText(facilityReadout, "연결할 다른 계획 노선의 끝점을 선택하세요");
    return;
  }
  if (endpoint.routeId === plannedMergeFirstEndpoint.routeId) {
    setText(facilityReadout, "서로 다른 계획 노선을 선택하세요");
    return;
  }
  const first = plan.routes.find((route) => route.id === plannedMergeFirstEndpoint!.routeId);
  const second = plan.routes.find((route) => route.id === endpoint.routeId);
  if (!first || !second) return;
  const firstPoint = map.containerPointToLatLng(plannedMergeFirstEndpoint.endpoint);
  const secondPoint = map.containerPointToLatLng(endpoint.endpoint);
  const bridgeLength = calculateLengthKmPrecise(smoothCoordinateBridge([firstPoint.lat, firstPoint.lng], [secondPoint.lat, secondPoint.lng]).map(([lat, lng]) => L.latLng(lat, lng)));
  const initial = plannedMergeFirstEndpoint;
  plannedMergeFirstEndpoint = null;
  renderMergeGuide();
  openDecisionDialog(
    `${first.name}과 ${second.name}을(를) 계획에서 연결할까요?`,
    `약 ${bridgeLength.toFixed(2)}km 연결 구간을 포함해 하나의 계획 노선으로 정리합니다. 자금은 차감되지 않습니다.`,
    "계획 노선 연결",
    () => void mergePlannedRoutes(plan.id, initial, endpoint),
  );
}

async function mergePlannedRoutes(planId: string, firstEndpoint: PlannedRouteMergeEndpoint, secondEndpoint: PlannedRouteMergeEndpoint) {
  const before = cloneState();
  try {
    const plan = plans.find((item) => item.id === planId);
    const first = plan?.routes.find((route) => route.id === firstEndpoint.routeId);
    const second = plan?.routes.find((route) => route.id === secondEndpoint.routeId);
    if (!plan || !first || !second) return;
    if (first.completedSegmentIds.length > 0 || second.completedSegmentIds.length > 0) {
      showToast("일부가 실제 건설된 계획 노선은 연결할 수 없습니다.");
      return;
    }
    const firstCoordinates = firstEndpoint.atStart ? [...first.coordinates].reverse() : first.coordinates;
    const secondCoordinates = secondEndpoint.atStart ? second.coordinates : [...second.coordinates].reverse();
    const mergedCoordinates = [...firstCoordinates, ...smoothCoordinateBridge(firstCoordinates.at(-1)!, secondCoordinates[0]).slice(1, -1), ...secondCoordinates];
    const points = mergedCoordinates.map(([lat, lng]) => L.latLng(lat, lng));
    const analysis = analyzeConstruction("route", points);
    const nodeIds = points.map(() => createId("node"));
    const merged: PlannedRoute = {
      id: first.id,
      name: first.name,
      color: first.color,
      coordinates: mergedCoordinates,
      segments: analysis.segments.map((impact, index) => createSegmentFromImpact(impact, nodeIds[index], nodeIds[index + 1], analysis.riverCrossings)),
      completedSegmentIds: [],
      expectedCost: analysis.totalCost,
      constructionDays: analysis.durationDays,
      expectedDemand: estimatePlannedRouteDemand(points),
      expectedRevenue: 0,
      transferEffect: estimatePlannedTransferEffect(points),
    };
    merged.expectedRevenue = Math.round((merged.expectedDemand * economy.fare * 365) / 100000000);
    updatePlan(plan.id, (item) => ({
      ...item,
      routes: item.routes.filter((route) => route.id !== second.id).map((route) => (route.id === first.id ? merged : route)),
      stations: item.stations.map((station) => ({
        ...station,
        plannedRouteIds: Array.from(new Set(station.plannedRouteIds.map((routeId) => (routeId === second.id ? first.id : routeId)))),
      })),
      depots: item.depots.map((depot) => ({
        ...depot,
        connectedPlannedRouteIds: Array.from(new Set(depot.connectedPlannedRouteIds.map((routeId) => (routeId === second.id ? first.id : routeId)))),
      })),
    }));
    currentMeta = { ...currentMeta, updatedAt: Date.now() };
    persistState();
    await writeSaveSlot(cloneState());
    undoStack = [...undoStack, before].slice(-maxHistory);
    redoStack = [];
    renderPlanningDialog();
    renderAll();
    showToast("계획 노선을 연결했습니다. 실행 취소로 되돌릴 수 있습니다.");
    playFeedback("confirm");
  } catch (error) {
    applyState(before);
    persistState();
    renderAll();
    showError("계획 노선을 연결하는 중 문제가 발생해 변경을 되돌렸습니다.");
    console.error(error);
  }
}

function renderMergeGuide() {
  editGuideLayer.clearLayers();
  if (planningMode && plannedMergeFirstEndpoint) {
    const point = map.containerPointToLatLng(plannedMergeFirstEndpoint.endpoint);
    L.circleMarker(point, { radius: 12, color: "#ffffff", weight: 3, fillColor: "#d5dee3", fillOpacity: 1, dashArray: "3 2", interactive: false }).addTo(editGuideLayer);
    return;
  }
  if (!mergeFirstEndpoint) return;
  const point = map.containerPointToLatLng(mergeFirstEndpoint.endpoint);
  L.circleMarker(point, { radius: 12, color: "#ffffff", weight: 3, fillColor: "#f3ca52", fillOpacity: 1, interactive: false }).addTo(editGuideLayer);
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
  const first = routes.find((route) => route.id === merge.first.routeId);
  const second = routes.find((route) => route.id === merge.second.routeId);
  if (!first || !second || !mergeDialog) return;
  setText(
    mergeDescription,
    `${first.name}과 ${second.name} 사이에 ${merge.bridgeLengthKm.toFixed(2)}km 연결 구간을 건설합니다 · 예상 건설비 ${formatCost(merge.bridgeCost)}. 연결 후 하나의 운행 노선으로 관리되며 역·차량·환승 데이터는 자동 정리됩니다.`,
  );
  if (mergeNameSelect) mergeNameSelect.innerHTML = `<option value="${first.id}">${escapeHtml(first.name)}</option><option value="${second.id}">${escapeHtml(second.name)}</option>`;
  if (mergeColorSelect)
    mergeColorSelect.innerHTML = `<option value="${first.id}" style="color:${first.color}">${escapeHtml(first.name)} 색상</option><option value="${second.id}" style="color:${second.color}">${escapeHtml(second.name)} 색상</option>`;
  mergeDialog.hidden = false;
}

function closeMergeDialog() {
  pendingMerge = null;
  if (mergeDialog) mergeDialog.hidden = true;
  renderAll(selectedRouteId ?? undefined);
}

function confirmRouteMerge() {
  if (!pendingMerge) return;
  const first = routes.find((route) => route.id === pendingMerge!.first.routeId);
  const second = routes.find((route) => route.id === pendingMerge!.second.routeId);
  if (!first || !second) return;
  if (currentMeta.mode === "career" && pendingMerge.bridgeCost > economy.cash) {
    showError(`연결 구간 건설비가 ${formatCost(pendingMerge.bridgeCost - economy.cash)} 부족합니다.`);
    return;
  }
  const bridgeCost = pendingMerge.bridgeCost;
  const firstCoordinates = pendingMerge.first.atStart ? [...first.coordinates].reverse() : first.coordinates;
  const secondCoordinates = pendingMerge.second.atStart ? second.coordinates : [...second.coordinates].reverse();
  const bridgeCoordinates = smoothCoordinateBridge(firstCoordinates.at(-1)!, secondCoordinates[0]);
  const mergedCoordinates = [...firstCoordinates, ...bridgeCoordinates.slice(1, -1), ...secondCoordinates];
  const selectedNameRoute = routes.find((route) => route.id === mergeNameSelect?.value) ?? first;
  const selectedColorRoute = routes.find((route) => route.id === mergeColorSelect?.value) ?? first;
  pushHistory();
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
  routes = routes.filter((route) => route.id !== second.id).map((route) => (route.id === first.id ? merged : route));
  stations = mergeDuplicateStations(
    stations.map((station) => ({
      ...station,
      connectedRouteIds: Array.from(new Set(station.connectedRouteIds.map((id) => (id === second.id ? first.id : id)))),
    })),
  );
  trainFleets = trainFleets.map((fleet) => (fleet.routeId === second.id ? { ...fleet, routeId: first.id } : fleet));
  depots = depots.map((depot) => ({
    ...depot,
    connectedRouteIds: Array.from(new Set(depot.connectedRouteIds.map((id) => (id === second.id ? first.id : id)))),
  }));
  expressConfigs = mergeExpressConfigs(first.id, second.id);
  economy = { ...economy, cash: economy.cash - bridgeCost, constructionSpent: economy.constructionSpent + bridgeCost };
  cleanupTransferData();
  redoStack = [];
  persistState();
  pendingMerge = null;
  if (mergeDialog) mergeDialog.hidden = true;
  selectRoute(first.id, false);
  renderAll(first.id);
  showToast(`${merged.name}으로 연결했습니다 · ${formatCost(bridgeCost)} 반영`);
  playFeedback("confirm");
}

function findNearestRoutePoint(point: L.Point, preferredRouteId?: string) {
  let best: { route: RouteLine; latLng: LatLng; distancePx: number } | null = null;
  const orderedRoutes = preferredRouteId ? [...routes].sort((a, b) => Number(b.id === preferredRouteId) - Number(a.id === preferredRouteId)) : routes;
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

function findNearestRouteCoordinate(point: L.Point, preferredRouteId: string | undefined, thresholdPx: number) {
  let best: { route: RouteLine; coordinateIndex: number; point: L.Point; distance: number } | null = null;
  const candidates = preferredRouteId ? routes.filter((route) => route.id === preferredRouteId) : routes;
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
  const branchNodeIds = new Set((route.branches ?? []).flatMap((branch) => [branch.junctionNodeId, branch.terminalNodeId]));
  const branchNodes = (route.nodes ?? []).filter((node) => branchNodeIds.has(node.id));
  const existingTrunkNodes = (route.nodes ?? []).filter((node) => !branchNodeIds.has(node.id));
  const trunkNodes = route.coordinates.map((coordinate, index) => {
    const matchingNodes = existingTrunkNodes.filter((node) => coordinatesEqual(node.position, coordinate));
    const existing = matchingNodes.find((node) => node.kind === "merge") ?? matchingNodes[0];
    return {
      id: existing?.id ?? stableEntityId("node", `${route.id}:${index}:${coordinate.join(",")}`),
      position: coordinate,
      kind: existing?.kind ?? ((index === 0 || index === route.coordinates.length - 1 ? "endpoint" : "control") as RouteNodeKind),
    };
  });
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
  const trunkLength = rawSegmentLengths.reduce((sum, length) => sum + length, 0) || 1;
  const trunkSegments = rawSegmentLengths.map((lengthKm, index): RouteSegment => {
    const fromNode = trunkNodes[index];
    const toNode = trunkNodes[index + 1];
    const existing = existingTrunkSegments.find(
      (segment) =>
        coordinatesEqual(segment.coordinates[0], fromNode.position) &&
        coordinatesEqual(segment.coordinates[segment.coordinates.length - 1], toNode.position),
    );
    const ratio = lengthKm / trunkLength;
    return {
      id: existing?.id ?? stableEntityId("segment", `${route.id}:${fromNode.id}:${toNode.id}`),
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      coordinates: [fromNode.position, toNode.position],
      lengthKm: Math.round(lengthKm * 1000) / 1000,
      terrainImpact: {
        riverCrossings: index < trunkRiver ? 1 : 0,
        mountainSegments: index < trunkMountain ? 1 : 0,
      },
      constructionMode: existing?.constructionMode ?? route.riverMode,
      constructionCost: Math.round(trunkCost * ratio),
      enabled: !(route.disabledSegments ?? []).includes(index),
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
  const stationIds = new Set(stations.map((station) => station.id));
  transfers = transfers
    .map((transfer) => ({ ...transfer, stationIds: Array.from(new Set(transfer.stationIds.filter((id) => stationIds.has(id)))) }))
    .filter((transfer) => transfer.stationIds.length >= 2);
  const transferIds = new Set(transfers.map((transfer) => transfer.id));
  stations = stations.map((station) => (station.transferGroupId && !transferIds.has(station.transferGroupId) ? { ...station, transferGroupId: undefined } : station));
}

/**
 * 노선 그래프를 재생성한 뒤 역과 분기 등이 가리키는 node/segment ID를 동기화한다.
 * 편집 후 존재하지 않는 ID가 저장 데이터에 남는 것을 막는 참조 무결성 정리 단계다.
 */
function synchronizeGraphReferences() {
  const routeIds = new Set(routes.map((route) => route.id));
  stations = stations.map((station) => {
    const connectedRouteIds = station.connectedRouteIds.filter((id) => routeIds.has(id));
    const point = L.latLng(station.position[0], station.position[1]);
    return {
      ...station,
      connectedRouteIds,
      routeNodeIds: connectedRouteIds.map((routeId) => findNearestGraphNodeId(routes.find((route) => route.id === routeId), point)).filter((id): id is string => Boolean(id)),
    };
  });
  depots = depots.map((depot) => ({ ...depot, connectedRouteIds: depot.connectedRouteIds.filter((id) => routeIds.has(id)) }));
  trainFleets = trainFleets.filter((fleet) => routeIds.has(fleet.routeId));
  expressConfigs = expressConfigs.filter((config) => routeIds.has(config.routeId));
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
    transfers = transfers.map((transfer) => ({
      ...transfer,
      stationIds: Array.from(new Set(transfer.stationIds.map((id) => replacementIds.get(id) ?? id))),
    }));
    expressConfigs = expressConfigs.map((config) => ({
      ...config,
      stopStationIds: Array.from(new Set(config.stopStationIds.map((id) => replacementIds.get(id) ?? id))),
    }));
  }
  return result;
}

function mergeExpressConfigs(firstId: string, secondId: string) {
  const first = expressConfigs.find((config) => config.routeId === firstId) ?? getExpressConfig(firstId);
  const second = expressConfigs.find((config) => config.routeId === secondId) ?? getExpressConfig(secondId);
  return [
    ...expressConfigs.filter((config) => config.routeId !== firstId && config.routeId !== secondId),
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
  for (const route of routes) {
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
  repairGuideLayer.clearLayers();
  if (activeTool !== "reconnect") return;
  for (const route of routes) {
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
  return routes.filter((route) => distanceToRouteMeters(point, route) <= thresholdM).map((route) => route.id);
}

function findNearestRouteEndpoint(point: L.Point, thresholdPx: number, preferredRouteId?: string | null, excludedRouteId?: string): RouteExtension | null {
  let best: RouteExtension & { distancePx: number } | null = null;
  const orderedRoutes = preferredRouteId ? [...routes].sort((a, b) => Number(b.id === preferredRouteId) - Number(a.id === preferredRouteId)) : routes;
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
  return routes
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
  depotGuideLayer.clearLayers();
  if (activeTool !== "depot") return;
  if (routes.length === 0) {
    setText(facilityReadout, "먼저 노선을 건설하세요");
    return;
  }
  for (const route of routes) {
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
  previewPolygon.setStyle({ color: connected ? "#4ce0c3" : "#ff5d5d", fillColor: connected ? "#4ce0c3" : "#ff5d5d" });
  setText(facilityReadout, connected ? "노선 연결 가능" : "밝은 노선 구간에 닿게 그리세요");
}

function findNearestStation(point: L.Point, thresholdPx: number) {
  let best: { station: Station; distancePx: number } | null = null;
  for (const station of stations) {
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
  const center = L.latLng(cityConfigs[currentMeta.cityId].center);
  const centrality = Math.max(0.35, 1.5 - map.distance(position, center) / 18000);
  const city = cityConfigs[currentMeta.cityId];
  const difficulty = difficultyConfigs[currentMeta.difficulty];
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
  const city = cityConfigs[currentMeta.cityId];
  const difficulty = difficultyConfigs[currentMeta.difficulty];
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
    balanceAfter: economy.cash - totalCost,
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
  const city = cityConfigs[currentMeta.cityId];
  const difficulty = difficultyConfigs[currentMeta.difficulty];
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
  if (currentMeta.mode === "career" && input.totalCost > economy.cash)
    warnings.push({ code: "insufficient-funds", severity: "error", message: `자금이 ${formatCost(input.totalCost - economy.cash)} 부족합니다.` });
  if (input.crossings.some((crossing) => !crossing.mode))
    warnings.push({ code: "river-choice", severity: "error", message: "각 강 통과 지점의 교량 또는 지하 방식을 선택하세요." });
  if (!input.depotConnected && input.kind !== "repair" && input.kind !== "edit")
    warnings.push({ code: "depot-unconnected", severity: "warning", message: "차량기지와 연결되지 않았습니다. 열차 투입 전 기지를 연결하세요." });
  if (hasAbnormalSelfIntersection(input.points))
    warnings.push({ code: "self-intersection", severity: "warning", message: "노선이 비정상적으로 자기 교차합니다. 경로를 확인하세요." });
  if (input.points.some((point) => map.distance(point, L.latLng(cityConfigs[currentMeta.cityId].center)) > 65000))
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
  return stations.filter((station) => {
    if (routeId && station.connectedRouteIds.includes(routeId)) return true;
    return distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), points.map((point) => [point.lat, point.lng])) <= 55;
  }).length;
}

function isDraftDepotConnected(points: LatLng[], routeId?: string) {
  if (routeId && depots.some((depot) => depot.connectedRouteIds.includes(routeId))) return true;
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
  return depots.some((depot) => {
    const polygon = depot.polygon.map(([lat, lng]) => map.latLngToContainerPoint(L.latLng(lat, lng)));
    return routeTouchesDepotArea(draftRoute, polygon, 30 / metersPerPixel());
  });
}

function hasShortStationSpacing(points: LatLng[], routeId?: string) {
  const relevant = stations.filter((station) => {
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
  return stations.filter(
    (station) =>
      station.connectedRouteIds.length === 1 &&
      station.connectedRouteIds[0] === routeId &&
      distanceToCoordinatesMeters(L.latLng(station.position[0], station.position[1]), coordinates) > 75,
  ).length;
}

function calculateDepotCapacityShortage(routeId?: string) {
  if (!routeId) return 0;
  const fleetSets = trainFleets.filter((fleet) => fleet.routeId === routeId).reduce((sum, fleet) => sum + fleet.sets, 0);
  const capacity = depots.filter((depot) => depot.connectedRouteIds.includes(routeId)).reduce((sum, depot) => sum + depot.capacity, 0);
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
  if (!constructionDraft) return;
  previewLayer.clearLayers();
  if (constructionDraft.kind === "depot" && constructionDraft.polygon) {
    L.polygon(constructionDraft.polygon, {
      color: constructionDraft.analysis.warnings.some((warning) => warning.severity === "error") ? "#ff5d5d" : "#f3ca52",
      fillColor: "#f3ca52",
      fillOpacity: 0.2,
      weight: 3,
      dashArray: "10 7",
      interactive: false,
    }).addTo(previewLayer);
    return;
  }
  const color = constructionDraft.routeId ? getRouteColor(constructionDraft.routeId) : selectedColor;
  L.polyline(constructionDraft.points, {
    color: "#ffffff",
    weight: 12,
    opacity: 0.76,
    dashArray: "12 9",
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  }).addTo(previewLayer);
  L.polyline(constructionDraft.points, {
    color,
    weight: 7,
    opacity: 0.82,
    dashArray: "12 9",
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  }).addTo(previewLayer);
  for (const segment of constructionDraft.analysis.segments.filter((item) => item.mountainLengthKm > 0)) {
    L.polyline(
      segment.coordinates.map(([lat, lng]) => L.latLng(lat, lng)),
      { color: "#ff9f43", weight: 9, opacity: 0.9, dashArray: "5 5", interactive: false },
    ).addTo(previewLayer);
  }
  for (const crossing of constructionDraft.analysis.riverCrossings) {
    const colorForCrossing = crossing.mode === "bridge" ? "#f3ca52" : crossing.mode === "tunnel" ? "#7aa7ff" : "#ff5d5d";
    L.circleMarker(L.latLng(crossing.position[0], crossing.position[1]), {
      radius: 9,
      color: "#ffffff",
      weight: 3,
      fillColor: colorForCrossing,
      fillOpacity: 1,
      interactive: false,
    }).addTo(previewLayer);
  }
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
  applyState(undoStack[undoStack.length - 1]);
  undoStack = undoStack.slice(0, -1);
  persistState();
  renderAll();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack = [...undoStack, cloneState()].slice(-maxHistory);
  applyState(redoStack[redoStack.length - 1]);
  redoStack = redoStack.slice(0, -1);
  persistState();
  renderAll();
}

function cloneState(): SaveState {
  return JSON.parse(JSON.stringify({ schemaVersion: currentSaveSchemaVersion, meta: currentMeta, routes, stations, transfers, depots, plans, diagramState, analysisState, statisticsState, constructionProjects, newsEvents, trainFleets, expressConfigs, passengerGroups, loans, economy })) as SaveState;
}

function applyState(state: SaveState) {
  state = migrateSaveStateRecord(state);
  currentMeta = { ...createDefaultMeta(), ...(state.meta ?? currentMeta) };
  routes = (state.routes ?? []).map((route) => rebuildRouteGraph(route));
  stations = state.stations;
  transfers = state.transfers;
  depots = state.depots;
  plans = normalizePlans(state.plans ?? []);
  diagramState = normalizeDiagramState(state.diagramState);
  analysisState = normalizeAnalysisState(state.analysisState);
  statisticsState = normalizeStatisticsState(state.statisticsState);
  constructionProjects = normalizeConstructionProjects(state.constructionProjects);
  newsEvents = normalizeNewsEvents(state.newsEvents);
  trainFleets = state.trainFleets ?? [];
  expressConfigs = state.expressConfigs ?? [];
  passengerGroups = state.passengerGroups ?? [];
  loans = state.loans ?? [];
  economy = { ...defaultEconomy, ...(state.economy ?? {}) };
  if (!state.statisticsState && economy.demand > 0) statisticsState = { ...statisticsState, totalPassengers: economy.demand };
}

function persistState() {
  synchronizeGraphReferences();
  localStorage.setItem("draw-gyotong-state", JSON.stringify({ schemaVersion: currentSaveSchemaVersion, meta: currentMeta, routes, stations, transfers, depots, plans, diagramState, analysisState, statisticsState, constructionProjects, newsEvents, trainFleets, expressConfigs, passengerGroups, loans, economy }));
  localStorage.setItem("draw-gyotong-routes", JSON.stringify(routes));
}

/**
 * 빠른 복구용 localStorage 상태를 읽는다.
 * 정식 슬롯 저장소는 IndexedDB지만, 읽기 실패나 이전 버전 호환을 위해 이 경로를 남긴다.
 */
function loadSavedState() {
  try {
    const savedState = localStorage.getItem("draw-gyotong-state");
    if (savedState) {
      const parsed = migrateSaveStateRecord(JSON.parse(savedState));
      currentMeta = { ...createDefaultMeta(), ...(parsed.meta ?? {}) };
      routes = Array.isArray(parsed.routes) ? parsed.routes.map((route) => rebuildRouteGraph(route)) : [];
      stations = Array.isArray(parsed.stations) ? parsed.stations : [];
      transfers = Array.isArray(parsed.transfers) ? parsed.transfers : [];
      depots = Array.isArray(parsed.depots) ? parsed.depots : [];
      plans = normalizePlans(Array.isArray(parsed.plans) ? parsed.plans : []);
      diagramState = normalizeDiagramState(parsed.diagramState);
      analysisState = normalizeAnalysisState(parsed.analysisState);
      statisticsState = normalizeStatisticsState(parsed.statisticsState);
      constructionProjects = normalizeConstructionProjects(parsed.constructionProjects);
      newsEvents = normalizeNewsEvents(parsed.newsEvents);
      trainFleets = Array.isArray(parsed.trainFleets) ? parsed.trainFleets : [];
      expressConfigs = Array.isArray(parsed.expressConfigs) ? parsed.expressConfigs : [];
      passengerGroups = Array.isArray(parsed.passengerGroups) ? parsed.passengerGroups : [];
      loans = Array.isArray(parsed.loans) ? parsed.loans : [];
      economy = { ...defaultEconomy, ...(parsed.economy ?? {}) };
      if (!parsed.statisticsState && economy.demand > 0) statisticsState = { ...statisticsState, totalPassengers: economy.demand };
      return;
    }
    const savedRoutes = localStorage.getItem("draw-gyotong-routes");
    routes = savedRoutes ? (JSON.parse(savedRoutes) as RouteLine[]).map((route) => rebuildRouteGraph(route)) : [];
  } catch {
    routes = [];
    stations = [];
    transfers = [];
    depots = [];
    plans = [];
    diagramState = { ...defaultDiagramState, autoPositions: {}, manualPositions: {} };
    analysisState = { ...defaultAnalysisState, demandHistory: [], suggestions: [], decisions: {} };
    statisticsState = { ...defaultStatisticsState, dailyRecords: [] };
    constructionProjects = [];
    newsEvents = [];
    trainFleets = [];
    expressConfigs = [];
    passengerGroups = [];
    loans = [];
    economy = { ...defaultEconomy };
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

function getLodMode(zoom: number): LodMode {
  if (zoom < 11) return "overview";
  if (zoom < 15) return "district";
  return "build";
}

function updateDynamicLayers() {
  // Only the existing-railway toggle remains; its on/off state is user-controlled.
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

async function fetchOverpass(query: string, signal: AbortSignal) {
  let lastError: unknown;
  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!response.ok) throw new Error(`Overpass failed: ${response.status}`);
      return response.json();
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      lastError = error;
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
  { title: "차량기지 범위를 지정하세요", text: "기지 버튼을 누르고 노선 옆에 차량기지 경계를 그리세요.", target: "depot" },
  { title: "노선 연결을 확인하세요", text: "차량기지 경계가 첫 노선 가까이에 닿아 연결된 상태인지 확인하세요.", target: "depot" },
  { title: "열차를 구매하고 배정하세요", text: "첫 노선을 선택한 상태에서 편성 수와 차량 수를 확인하고 구매하세요.", target: "train" },
  { title: "첫 노선을 개통하세요", text: "공사 현황에서 네 가지 개통 조건을 확인하고 노선 개통을 누르세요.", target: "opening" },
  { title: "시간을 흐르게 하세요", text: "하단의 x1, x2, x4 또는 x8을 눌러 운행을 시작하세요.", target: "speed" },
  { title: "첫 수익을 확인하세요", text: "하루 운행이 끝날 때까지 기다리세요. 첫 운임 수익이 기록되면 완료됩니다.", target: "revenue" },
] as const;

function createTutorialProgress(): TutorialProgress {
  return {
    mapMoved: false,
    mapZoomed: false,
    colorSelected: false,
    timeStarted: false,
    startedDay: analysisState?.dayIndex ?? 0,
  };
}

function getTutorialProgress() {
  const progress = currentMeta.tutorialProgress ?? createTutorialProgress();
  if (!currentMeta.tutorialProgress) currentMeta = { ...currentMeta, tutorialStep: 0, tutorialProgress: progress };
  return progress;
}

function isTutorialGuidedBuild() {
  return !currentMeta.tutorialCompleted && (currentMeta.tutorialStep ?? 0) <= 7 && startScreen?.hidden !== false;
}

function recordTutorialSignal(signal: "mapMoved" | "mapZoomed" | "colorSelected" | "timeStarted", refresh = true) {
  if (currentMeta.tutorialCompleted || startScreen?.hidden === false) return;
  const progress = getTutorialProgress();
  if (progress[signal]) return;
  currentMeta = { ...currentMeta, tutorialProgress: { ...progress, [signal]: true } };
  persistState();
  if (refresh) updateTutorialProgress();
}

function captureTutorialConstruction(kind: ConstructionDraftKind, assetId: string) {
  if (currentMeta.tutorialCompleted) return;
  const progress = getTutorialProgress();
  if (kind === "route" && !progress.targetRouteId) {
    currentMeta = { ...currentMeta, tutorialProgress: { ...progress, targetRouteId: assetId } };
  } else if (kind === "depot" && !progress.targetDepotId) {
    currentMeta = { ...currentMeta, tutorialProgress: { ...progress, targetDepotId: assetId } };
  }
}

function applyTutorialConstructionBoost(kind: ConstructionDraftKind | "station", assetId: string) {
  if (currentMeta.tutorialCompleted) return;
  const progress = getTutorialProgress();
  constructionProjects = constructionProjects.map((project) => {
    const matches =
      (kind === "route" && project.routeIds.includes(assetId)) ||
      (kind === "depot" && project.depotIds.includes(assetId)) ||
      (kind === "station" && project.stationIds.includes(assetId));
    if (!matches) return project;
    if (kind === "route" && progress.targetRouteId === assetId) {
      return { ...project, status: "opening-ready", elapsedDays: project.durationDays, expectedCompletionDay: analysisState.dayIndex };
    }
    if (kind === "depot" || kind === "station") {
      return { ...project, status: "operating", elapsedDays: project.durationDays, expectedCompletionDay: analysisState.dayIndex, openedAtDay: analysisState.dayIndex };
    }
    return project;
  });
}

function openTutorial(restart = false) {
  if (!tutorialPanel) return;
  if (restart) {
    clearTutorialTargets();
    currentMeta = {
      ...currentMeta,
      tutorialStep: 0,
      tutorialCompleted: false,
      tutorialProgress: createTutorialProgress(),
    };
    persistState();
  }
  tutorialPanel.hidden = false;
  renderTutorial();
}

function renderTutorial(feedback?: string) {
  const step = Math.max(0, Math.min(tutorialSteps.length - 1, currentMeta.tutorialStep ?? 0));
  const item = tutorialSteps[step];
  setText(tutorialStep, `${String(step + 1).padStart(2, "0")} / ${String(tutorialSteps.length).padStart(2, "0")}`);
  setText(tutorialTitle, item.title);
  setText(tutorialText, item.text);
  setText(tutorialFeedback, feedback ?? getTutorialFeedback(step));
  if (tutorialNextButton) tutorialNextButton.textContent = "확인";
  applyTutorialTarget(item.target);
}

function updateTutorialProgress() {
  if (currentMeta.tutorialCompleted || startScreen?.hidden === false) {
    clearTutorialTargets();
    return;
  }
  if (tutorialPanel?.hidden) tutorialPanel.hidden = false;
  let step = Math.max(0, Math.min(tutorialSteps.length - 1, currentMeta.tutorialStep ?? 0));
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
    currentMeta = { ...currentMeta, tutorialStep: step };
    persistState();
    playFeedback("select");
  }
  renderTutorial();
}

function isTutorialStepComplete(step: number) {
  const progress = getTutorialProgress();
  const routeId = progress.targetRouteId;
  const depot = depots.find((item) => item.id === progress.targetDepotId);
  if (step === 0) return progress.mapMoved && progress.mapZoomed;
  if (step === 1) return progress.colorSelected;
  if (step === 2) return Boolean(routeId && routes.some((route) => route.id === routeId));
  if (step === 3) return Boolean(routeId && stations.filter((station) => station.connectedRouteIds.includes(routeId)).length >= 2);
  if (step === 4) return Boolean(depot);
  if (step === 5) return Boolean(routeId && depot?.connectedRouteIds.includes(routeId));
  if (step === 6) return Boolean(routeId && trainFleets.some((fleet) => fleet.routeId === routeId && fleet.sets > 0));
  if (step === 7) return Boolean(routeId && isRouteOperational(routeId));
  if (step === 8) return progress.timeStarted;
  return statisticsState.dailyRecords.some((record) => record.day > progress.startedDay && record.revenue > 0);
}

function getTutorialFeedback(step: number) {
  const progress = getTutorialProgress();
  const routeId = progress.targetRouteId;
  const routeStationCount = routeId ? stations.filter((station) => station.connectedRouteIds.includes(routeId)).length : 0;
  const depot = depots.find((item) => item.id === progress.targetDepotId);
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
  return economy.demand <= 0
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
                    ? document.querySelector<HTMLElement>(".time-row")
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
  const step = Math.max(0, Math.min(tutorialSteps.length - 1, currentMeta.tutorialStep ?? 0));
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
  currentMeta = { ...currentMeta, tutorialStep: tutorialSteps.length - 1, tutorialCompleted: true };
  if (tutorialPanel) tutorialPanel.hidden = true;
  clearTutorialTargets();
  persistState();
  void saveCurrentSlot(skipped ? "튜토리얼 건너뛰기" : "튜토리얼 완료");
  showToast(skipped ? "튜토리얼을 건너뛰었습니다. 도움말에서 언제든 다시 볼 수 있습니다." : "첫 노선 관제 교육을 완료했습니다.");
  playFeedback("confirm");
}

function loadSettings(): GameSettings {
  try {
    const saved = localStorage.getItem("draw-gyotong-settings");
    return { ...defaultSettings, ...(saved ? (JSON.parse(saved) as Partial<GameSettings>) : {}) };
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
  document.body.dataset.performance = settings.performanceMode;
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  if (soundToggle) soundToggle.checked = settings.soundEnabled;
  if (hapticsToggle) hapticsToggle.checked = settings.hapticsEnabled;
  if (performanceSelect) performanceSelect.value = settings.performanceMode;
  if (reducedMotionToggle) reducedMotionToggle.checked = settings.reducedMotion;
  if (sandboxConstructionTimeToggle) sandboxConstructionTimeToggle.checked = settings.sandboxConstructionTime;
  if (autoSaveToggle) autoSaveToggle.checked = settings.autoSaveEnabled;
  if (autoSaveIntervalSelect) {
    autoSaveIntervalSelect.value = String(settings.autoSaveIntervalSeconds);
    autoSaveIntervalSelect.disabled = !settings.autoSaveEnabled;
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
  const shouldShow = tool === "route" || tool === "extend" || tool === "branch";
  if (!routeSettingsCard) return;
  routeSettingsCard.hidden = !shouldShow;
  if (!shouldShow) return;
  if (draftRouteNameInput) draftRouteNameInput.value = draftRouteName;
  if (draftRouteColorInput) draftRouteColorInput.value = selectedColor;
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
  hasDraftRouteSettings = true;
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

function showToast(message: string) {
  if (!toast) return;
  setText(toast, message);
  toast.hidden = false;
  toast.classList.remove("is-visible");
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast?.classList.remove("is-visible");
    window.setTimeout(() => {
      if (toast) toast.hidden = true;
    }, 180);
  }, 2200);
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

function prefetchNearbyTiles(layer: TileLayer) {
  const center = map.getCenter();
  const zoom = Math.min(map.getZoom() + 1, 15);
  [center, L.latLng(center.lat + 0.015, center.lng), L.latLng(center.lat - 0.015, center.lng), L.latLng(center.lat, center.lng + 0.02), L.latLng(center.lat, center.lng - 0.02)].forEach((point) => {
    const tilePoint = map.project(point, zoom).divideBy(256).floor();
    const coords = L.point(tilePoint.x, tilePoint.y) as Coords;
    coords.z = zoom;
    fetch(layer.getTileUrl(coords), { mode: "no-cors" }).catch(() => undefined);
  });
}

function routeStyle(color: string, weight: number, opacity: number): L.PolylineOptions {
  return { color, weight, opacity, lineCap: "round", lineJoin: "round", interactive: false };
}

function containerPointFromEvent(event: PointerEvent) {
  const rect = mapContainer.getBoundingClientRect();
  return L.point(event.clientX - rect.left, event.clientY - rect.top);
}

function getRouteColor(routeId?: string) {
  return routes.find((route) => route.id === routeId)?.color ?? "#4ce0c3";
}

function formatCost(cost: number) {
  if (cost <= 0) return "0억";
  return `${Math.round(cost).toLocaleString("ko-KR")}억`;
}

function formatSignedCost(cost: number) {
  const rounded = Math.round(cost);
  if (rounded < 0) return `-${Math.abs(rounded).toLocaleString("ko-KR")}억`;
  return formatCost(rounded);
}

function createId(prefix: string) {
  return crypto.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function roundCoord(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function setHint(items: string[]) {
  if (hintRow) hintRow.innerHTML = items.map((item) => `<span>${item}</span>`).join("");
  if (items.length > 0) {
    const text = items.join(" · ");
    if (text !== "한 손가락 이동 · 핀치 줌") {
      showToast(text);
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
