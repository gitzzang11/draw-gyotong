import L, { type Coords, type GeoJSON, type LatLng, type LatLngExpression, type TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

type OverlayKey = "administrative" | "landuse" | "rail";
type LodMode = "overview" | "district" | "build";
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
  tutorialStep?: number;
  tutorialCompleted?: boolean;
};

type GameSettings = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  performanceMode: "balanced" | "battery";
  reducedMotion: boolean;
};

type SaveState = {
  meta?: GameMeta;
  routes: RouteLine[];
  stations: Station[];
  transfers: TransferGroup[];
  depots: Depot[];
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
  bankrupt: boolean;
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

const SEOUL: LatLngExpression = [37.5665, 126.978];
const overpassEndpoint = "https://overpass-api.de/api/interpreter";
const routeColors = ["#ff5d5d", "#4ce0c3", "#f3ca52", "#7aa7ff", "#c477ff", "#ff9f43", "#63d471"];
const baseCostPerKm = 1200;
const bridgeCostPerCrossing = 4200;
const tunnelCostPerCrossing = 6800;
const mountainCostPerSegment = 950;
const stationSnapPx = 24;
const transferAutoMeters = 95;
const maxHistory = 20;
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

type RouteMergeEndpoint = {
  routeId: string;
  atStart: boolean;
  endpoint: L.Point;
};

type PendingMerge = {
  first: RouteMergeEndpoint;
  second: RouteMergeEndpoint;
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
};
const fallbackSaveKey = "draw-gyotong-save-slots-v1";

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

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <main class="game-shell">
    <section id="loadingScreen" class="loading-screen" aria-live="polite">
      <div class="loading-mark" aria-hidden="true"></div>
      <strong>DRAW GYOTONG</strong>
      <span id="loadingStatus">관제 지도를 준비하고 있습니다</span>
      <div class="loading-track"><i id="loadingProgress"></i></div>
    </section>
    <section id="startScreen" class="start-screen" aria-label="game start">
      <div class="start-panel">
        <div class="start-head">
          <div class="brand-mark" aria-hidden="true"></div>
          <div>
            <h2>DRAW GYOTONG</h2>
            <p>새 게임을 만들거나 저장 슬롯을 불러오세요</p>
          </div>
        </div>
        <div class="setup-grid">
          <label><span>모드</span><select id="modeSelect"><option value="sandbox">샌드박스</option><option value="career">커리어</option></select></label>
          <label><span>난이도</span><select id="difficultySelect"><option value="easy">쉬움</option><option value="normal" selected>보통</option><option value="hard">어려움</option></select></label>
          <label><span>도시</span><select id="citySelect"></select></label>
          <label><span>슬롯 이름</span><input id="slotNameInput" value="서울 1호 계획" maxlength="20" /></label>
        </div>
        <div class="city-note" id="cityNote">서울: 높은 수요, 강 많음</div>
        <div class="start-actions">
          <button id="newGameButton" type="button">세이브 생성</button>
          <button id="continueButton" type="button">최근 슬롯</button>
        </div>
        <div class="slot-list" id="slotList"></div>
      </div>
    </section>

    <section id="map" class="map" aria-label="Korea city rail map"></section>
    <aside class="hud top-left">
      <div class="brand-row">
        <div class="brand-mark" aria-hidden="true"></div>
        <div>
          <h1>DRAW GYOTONG</h1>
          <p>SEOUL CONTROL</p>
        </div>
      </div>
      <div class="status-grid">
        <div><span>ZOOM</span><strong id="zoomReadout">12</strong></div>
        <div><span>LOD</span><strong id="lodReadout">중간</strong></div>
        <div><span>COST</span><strong id="costReadout">0억</strong></div>
      </div>
    </aside>

    <section class="hud build-panel" aria-label="construction tools">
      <button id="routeTool" class="primary-tool" type="button" aria-pressed="false"><span class="tool-icon">+</span><span>노선</span></button>
      <button id="extendTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="노선 연장"><span>연장</span></button>
      <button id="editTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="노선 경로 수정"><span>편집</span></button>
      <button id="eraserTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="노선 구간 삭제"><span>삭제</span></button>
      <button id="branchTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="분기 노선 건설"><span>분기</span></button>
      <button id="mergeTool" class="primary-tool compact" type="button" aria-pressed="false" aria-label="노선 병합"><span>병합</span></button>
      <button id="stationTool" class="primary-tool compact" type="button" aria-pressed="false"><span>역</span></button>
      <button id="transferTool" class="primary-tool compact" type="button" aria-pressed="false"><span>환승</span></button>
      <button id="depotTool" class="primary-tool compact" type="button" aria-pressed="false"><span>기지</span></button>
      <div class="color-strip" id="colorStrip" aria-label="route color"></div>
      <div class="history-row">
        <button id="undoButton" class="icon-button" type="button" aria-label="undo">↶</button>
        <button id="redoButton" class="icon-button" type="button" aria-label="redo">↷</button>
      </div>
    </section>

    <section class="hud operation-panel" aria-label="operation controls">
      <select id="operationRouteSelect" aria-label="운영 노선"></select>
      <select id="trainTypeSelect" aria-label="열차 종류">
        <option value="metro">도시철도</option>
        <option value="commuter">광역전철</option>
        <option value="express">급행형</option>
      </select>
      <label><span>량</span><input id="carCountInput" type="number" min="2" max="10" step="1" value="6" /></label>
      <label><span>편성</span><input id="setCountInput" type="number" min="1" max="30" step="1" value="4" /></label>
      <button id="buyTrainButton" class="ops-button" type="button">구매</button>
      <button id="expressButton" class="ops-button" type="button" aria-pressed="false">급행</button>
      <div class="time-row" aria-label="time speed">
        <button class="time-button active" data-speed="0" type="button">Ⅱ</button>
        <button class="time-button" data-speed="1" type="button">x1</button>
        <button class="time-button" data-speed="2" type="button">x2</button>
        <button class="time-button" data-speed="4" type="button">x4</button>
        <button class="time-button" data-speed="8" type="button">x8</button>
      </div>
    </section>

    <nav class="hud layer-panel" aria-label="map layers">
      <button class="layer-toggle" data-layer="administrative" aria-pressed="false"><span class="layer-dot admin"></span><span>행정</span></button>
      <button class="layer-toggle" data-layer="landuse" aria-pressed="false"><span class="layer-dot land"></span><span>토지</span></button>
      <button class="layer-toggle active" data-layer="rail" aria-pressed="true"><span class="layer-dot rail"></span><span>철도</span></button>
    </nav>

    <section class="hud bottom-right">
      <div class="mode-pill" id="modeLabel">지도 탐색</div>
      <div class="hint-row" id="hintRow"><span>한 손가락 이동</span><span>핀치 줌</span></div>
    </section>

    <section class="route-sheet" aria-live="polite">
      <div><span id="routeCount">0개 노선</span><strong id="selectedRouteName">건설 대기</strong></div>
      <div><span id="stationCount">0개 역</span><strong id="facilityReadout">시설 대기</strong></div>
      <div><span id="depotCount">0개 기지</span><strong id="totalCost">0억</strong></div>
    </section>

    <section id="selectedLinePanel" class="selected-line-panel" hidden aria-live="polite">
      <button id="selectedLineColor" class="selected-line-color" type="button" aria-label="선택 노선 관리"></button>
      <div><strong id="selectedLineTitle">노선 선택</strong><span id="selectedLineMeta">지도를 눌러 노선을 선택하세요</span></div>
      <button id="manageLineButton" type="button">관리</button>
      <button id="closeLineButton" type="button" aria-label="노선 선택 해제">×</button>
    </section>

    <section class="operation-sheet" aria-live="polite">
      <div><span>배차</span><strong id="headwayReadout">-</strong></div>
      <div><span>혼잡</span><strong id="crowdingReadout">-</strong></div>
      <div><span>대기</span><strong id="waitReadout">-</strong></div>
    </section>

    <section class="economy-panel" aria-live="polite">
      <div><span>현금</span><strong id="cashReadout">0억</strong></div>
      <div><span>만족</span><strong id="satisfactionReadout">75</strong></div>
      <div><span>수요</span><strong id="demandReadout">0</strong></div>
      <label><span>요금</span><input id="fareInput" type="number" min="900" max="4200" step="50" value="1450" /></label>
      <button id="autoFareButton" type="button" class="ops-button active" aria-pressed="true">자동</button>
      <button id="loanButton" type="button" class="ops-button">대출</button>
      <button id="repayButton" type="button" class="ops-button">상환</button>
    </section>

    <section class="save-panel">
      <button id="saveButton" type="button">저장</button>
      <button id="menuButton" type="button">메뉴</button>
      <button id="helpButton" type="button" aria-label="튜토리얼">?</button>
      <button id="settingsButton" type="button" aria-label="설정">⚙</button>
      <strong id="saveStatus">대기</strong>
    </section>

    <section id="tutorialPanel" class="tutorial-panel" hidden aria-live="polite">
      <div class="tutorial-step" id="tutorialStep">01 / 05</div>
      <div><strong id="tutorialTitle">첫 노선을 그리세요</strong><p id="tutorialText">노선 버튼을 누른 뒤 지도 위를 드래그하세요.</p></div>
      <div class="tutorial-actions"><button id="tutorialNextButton" type="button">다음</button><button id="tutorialSkipButton" type="button" aria-label="튜토리얼 건너뛰기">×</button></div>
    </section>

    <div id="settingsDialog" class="dialog-backdrop" hidden>
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-label="게임 설정">
        <div class="dialog-heading"><div><span>CONTROL SETTINGS</span><h2>게임 설정</h2></div><button id="closeSettingsButton" class="dialog-close" type="button" aria-label="설정 닫기">×</button></div>
        <label class="setting-row"><span><strong>효과음</strong><small>건설과 조작 피드백</small></span><input id="soundToggle" type="checkbox" checked /></label>
        <label class="setting-row"><span><strong>진동</strong><small>지원 기기에서 촉각 피드백</small></span><input id="hapticsToggle" type="checkbox" checked /></label>
        <label class="setting-row"><span><strong>성능</strong><small>열차 표시와 지도 자원 사용량</small></span><select id="performanceSelect"><option value="balanced">균형</option><option value="battery">절전</option></select></label>
        <label class="setting-row"><span><strong>모션 감소</strong><small>화면 전환과 애니메이션 축소</small></span><input id="reducedMotionToggle" type="checkbox" /></label>
        <div class="settings-footer"><span id="cacheReadout">지도 캐시 확인 중</span><button id="clearCacheButton" class="ops-button" type="button">캐시 정리</button></div>
      </section>
    </div>

    <div id="errorBanner" class="error-banner" hidden role="alert"><span id="errorMessage">일시적인 오류가 발생했습니다.</span><button id="errorRetryButton" type="button">재시도</button><button id="errorDismissButton" type="button" aria-label="닫기">×</button></div>
    <div id="toast" class="toast" hidden role="status"></div>

    <div id="riverDialog" class="dialog-backdrop" hidden>
      <section class="river-dialog" role="dialog" aria-modal="true" aria-label="river crossing method">
        <h2>강 통과 방식</h2>
        <p>이 노선은 강을 지납니다. 건설 방식을 선택하세요.</p>
        <div class="dialog-actions">
          <button id="bridgeButton" type="button">교량</button>
          <button id="tunnelButton" type="button">지하 통과</button>
        </div>
      </section>
    </div>

    <div id="routeChoiceDialog" class="dialog-backdrop" hidden>
      <section class="route-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="routeChoiceTitle">
        <div class="dialog-heading"><div><span>ROUTE SELECT</span><h2 id="routeChoiceTitle">어느 노선을 선택할까요?</h2></div><button id="closeRouteChoiceButton" class="dialog-close" type="button" aria-label="닫기">×</button></div>
        <div id="routeChoiceList" class="route-choice-list"></div>
      </section>
    </div>

    <div id="lineManagerDialog" class="dialog-backdrop" hidden>
      <section class="line-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="lineManagerTitle">
        <div class="dialog-heading"><div><span>LINE CONTROL</span><h2 id="lineManagerTitle">노선 관리</h2></div><button id="closeLineManagerButton" class="dialog-close" type="button" aria-label="닫기">×</button></div>
        <label class="manager-field"><span>노선 이름</span><input id="lineNameInput" maxlength="28" /></label>
        <label class="manager-field"><span>노선 색상</span><input id="lineColorInput" type="color" /></label>
        <label class="manager-field"><span>공개 상태</span><select id="lineVisibilitySelect"><option value="public">공개 노선</option><option value="planning">계획 노선</option></select></label>
        <div class="manager-toggles">
          <label><input id="localServiceToggle" type="checkbox" /><span>일반 운행</span></label>
          <label><input id="expressServiceToggle" type="checkbox" /><span>급행 운행</span></label>
          <label><input id="operationPausedToggle" type="checkbox" /><span>운행 일시중지</span></label>
        </div>
        <div class="manager-summary" id="lineManagerSummary"></div>
        <div class="dialog-actions"><button id="saveLineManagerButton" type="button">변경 저장</button><button id="cancelLineManagerButton" type="button">취소</button></div>
      </section>
    </div>

    <div id="decisionDialog" class="dialog-backdrop" hidden>
      <section class="decision-dialog" role="alertdialog" aria-modal="true" aria-labelledby="decisionTitle">
        <span class="decision-kicker">NETWORK CHANGE</span>
        <h2 id="decisionTitle">노선 변경 확인</h2>
        <p id="decisionMessage"></p>
        <div class="decision-warning" id="decisionWarning" hidden></div>
        <div class="dialog-actions"><button id="decisionConfirmButton" type="button">확정</button><button id="decisionCancelButton" type="button">취소</button></div>
      </section>
    </div>

    <div id="mergeDialog" class="dialog-backdrop" hidden>
      <section class="merge-dialog" role="dialog" aria-modal="true" aria-labelledby="mergeTitle">
        <div class="dialog-heading"><div><span>MERGE LINES</span><h2 id="mergeTitle">노선 병합</h2></div><button id="closeMergeButton" class="dialog-close" type="button" aria-label="닫기">×</button></div>
        <p id="mergeDescription"></p>
        <label class="manager-field"><span>병합 노선 이름</span><select id="mergeNameSelect"></select></label>
        <label class="manager-field"><span>병합 노선 색상</span><select id="mergeColorSelect"></select></label>
        <div class="dialog-actions"><button id="confirmMergeButton" type="button">병합 확정</button><button id="cancelMergeButton" type="button">취소</button></div>
      </section>
    </div>
  </main>
`;

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

const routeLayer = L.layerGroup().addTo(map);
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

const zoomReadout = byId("zoomReadout");
const lodReadout = byId("lodReadout");
const costReadout = byId("costReadout");
const modeLabel = byId("modeLabel");
const hintRow = byId("hintRow");
const routeCount = byId("routeCount");
const selectedRouteName = byId("selectedRouteName");
const stationCount = byId("stationCount");
const depotCount = byId("depotCount");
const facilityReadout = byId("facilityReadout");
const totalCost = byId("totalCost");
const headwayReadout = byId("headwayReadout");
const crowdingReadout = byId("crowdingReadout");
const waitReadout = byId("waitReadout");
const cashReadout = byId("cashReadout");
const satisfactionReadout = byId("satisfactionReadout");
const demandReadout = byId("demandReadout");
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
const saveStatus = byId("saveStatus");
const loadingScreen = byId("loadingScreen");
const loadingStatus = byId("loadingStatus");
const loadingProgress = byId("loadingProgress");
const tutorialPanel = byId("tutorialPanel");
const tutorialStep = byId("tutorialStep");
const tutorialTitle = byId("tutorialTitle");
const tutorialText = byId("tutorialText");
const tutorialNextButton = document.querySelector<HTMLButtonElement>("#tutorialNextButton");
const tutorialSkipButton = document.querySelector<HTMLButtonElement>("#tutorialSkipButton");
const helpButton = document.querySelector<HTMLButtonElement>("#helpButton");
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton");
const settingsDialog = byId("settingsDialog");
const closeSettingsButton = document.querySelector<HTMLButtonElement>("#closeSettingsButton");
const soundToggle = document.querySelector<HTMLInputElement>("#soundToggle");
const hapticsToggle = document.querySelector<HTMLInputElement>("#hapticsToggle");
const performanceSelect = document.querySelector<HTMLSelectElement>("#performanceSelect");
const reducedMotionToggle = document.querySelector<HTMLInputElement>("#reducedMotionToggle");
const clearCacheButton = document.querySelector<HTMLButtonElement>("#clearCacheButton");
const cacheReadout = byId("cacheReadout");
const errorBanner = byId("errorBanner");
const errorMessage = byId("errorMessage");
const errorRetryButton = document.querySelector<HTMLButtonElement>("#errorRetryButton");
const errorDismissButton = document.querySelector<HTMLButtonElement>("#errorDismissButton");
const toast = byId("toast");
const colorStrip = byId("colorStrip");
const operationRouteSelect = document.querySelector<HTMLSelectElement>("#operationRouteSelect");
const trainTypeSelect = document.querySelector<HTMLSelectElement>("#trainTypeSelect");
const carCountInput = document.querySelector<HTMLInputElement>("#carCountInput");
const setCountInput = document.querySelector<HTMLInputElement>("#setCountInput");
const buyTrainButton = document.querySelector<HTMLButtonElement>("#buyTrainButton");
const expressButton = document.querySelector<HTMLButtonElement>("#expressButton");
const timeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".time-button"));
const routeTool = document.querySelector<HTMLButtonElement>("#routeTool");
const extendTool = document.querySelector<HTMLButtonElement>("#extendTool");
const editTool = document.querySelector<HTMLButtonElement>("#editTool");
const eraserTool = document.querySelector<HTMLButtonElement>("#eraserTool");
const reconnectTool = document.querySelector<HTMLButtonElement>("#reconnectTool");
const branchTool = document.querySelector<HTMLButtonElement>("#branchTool");
const mergeTool = document.querySelector<HTMLButtonElement>("#mergeTool");
const stationTool = document.querySelector<HTMLButtonElement>("#stationTool");
const transferTool = document.querySelector<HTMLButtonElement>("#transferTool");
const depotTool = document.querySelector<HTMLButtonElement>("#depotTool");
const undoButton = document.querySelector<HTMLButtonElement>("#undoButton");
const redoButton = document.querySelector<HTMLButtonElement>("#redoButton");
const riverDialog = byId("riverDialog");
const bridgeButton = document.querySelector<HTMLButtonElement>("#bridgeButton");
const tunnelButton = document.querySelector<HTMLButtonElement>("#tunnelButton");
const layerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".layer-toggle"));
const toolButtons = [routeTool, extendTool, editTool, eraserTool, reconnectTool, branchTool, mergeTool, stationTool, transferTool, depotTool].filter(Boolean) as HTMLButtonElement[];
const selectedLinePanel = byId("selectedLinePanel");
const selectedLineColor = document.querySelector<HTMLButtonElement>("#selectedLineColor");
const selectedLineTitle = byId("selectedLineTitle");
const selectedLineMeta = byId("selectedLineMeta");
const manageLineButton = document.querySelector<HTMLButtonElement>("#manageLineButton");
const closeLineButton = document.querySelector<HTMLButtonElement>("#closeLineButton");
const routeChoiceDialog = byId("routeChoiceDialog");
const routeChoiceList = byId("routeChoiceList");
const closeRouteChoiceButton = document.querySelector<HTMLButtonElement>("#closeRouteChoiceButton");
const lineManagerDialog = byId("lineManagerDialog");
const closeLineManagerButton = document.querySelector<HTMLButtonElement>("#closeLineManagerButton");
const cancelLineManagerButton = document.querySelector<HTMLButtonElement>("#cancelLineManagerButton");
const saveLineManagerButton = document.querySelector<HTMLButtonElement>("#saveLineManagerButton");
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
let selectedColor = routeColors[0];
let activeTool: ToolMode = "pan";
let activePointerId: number | null = null;
let rawDrawPoints: L.Point[] = [];
let previewPolyline: L.Polyline | null = null;
let previewPolygon: L.Polygon | null = null;
let pendingRoutePoints: LatLng[] | null = null;
let activeExtension: RouteExtension | null = null;
let pendingExtension: RouteExtension | null = null;
let activeRepair: RouteRepair | null = null;
let pendingRepair: RouteRepair | null = null;
let activeBranch: RouteBranchDraft | null = null;
let pendingBranch: RouteBranchDraft | null = null;
let activeHandleMove: RouteHandleMove | null = null;
let handlePreviewCoordinates: Array<[number, number]> | null = null;
let deleteAnchor: RouteDeleteAnchor | null = null;
let mergeFirstEndpoint: RouteMergeEndpoint | null = null;
let pendingMerge: PendingMerge | null = null;
let selectedRouteId: string | null = null;
let pendingDecision: (() => void) | null = null;
let knownObstacles: Obstacle[] = [];
let selectedTransferStationIds: string[] = [];
let selectedDepotId: string | null = null;
let selectedOperationRouteId = "";
let simSpeed = 0;
let simMinutes = 360;
let simDayAccumulator = 0;
let lastFrameTime = performance.now();
let autoSaveTimer = 0;
let settings: GameSettings = loadSettings();
let audioContext: AudioContext | null = null;
let toastTimer = 0;
let lastTrainRender = 0;
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
  buildColorControls();
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

map.on("zoomend moveend", () => {
  updateLod();
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    renderAll();
    updateDynamicLayers();
  }, 220);
});

routeTool?.addEventListener("click", () => setTool(activeTool === "route" ? "pan" : "route"));
extendTool?.addEventListener("click", () => setTool(activeTool === "extend" ? "pan" : "extend"));
editTool?.addEventListener("click", () => setTool(activeTool === "edit" ? "pan" : "edit"));
eraserTool?.addEventListener("click", () => setTool(activeTool === "eraser" ? "pan" : "eraser"));
reconnectTool?.addEventListener("click", () => setTool(activeTool === "reconnect" ? "pan" : "reconnect"));
branchTool?.addEventListener("click", () => setTool(activeTool === "branch" ? "pan" : "branch"));
mergeTool?.addEventListener("click", () => setTool(activeTool === "merge" ? "pan" : "merge"));
stationTool?.addEventListener("click", () => setTool(activeTool === "station" ? "pan" : "station"));
transferTool?.addEventListener("click", () => setTool(activeTool === "transfer" ? "pan" : "transfer"));
depotTool?.addEventListener("click", () => setTool(activeTool === "depot" ? "pan" : "depot"));
undoButton?.addEventListener("click", undo);
redoButton?.addEventListener("click", redo);
bridgeButton?.addEventListener("click", () => commitPendingRoute("bridge"));
tunnelButton?.addEventListener("click", () => commitPendingRoute("tunnel"));
manageLineButton?.addEventListener("click", openLineManager);
selectedLineColor?.addEventListener("click", openLineManager);
closeLineButton?.addEventListener("click", () => selectRoute(null));
closeRouteChoiceButton?.addEventListener("click", closeRouteChoice);
routeChoiceDialog?.addEventListener("click", (event) => {
  if (event.target === routeChoiceDialog) closeRouteChoice();
});
closeLineManagerButton?.addEventListener("click", closeLineManager);
cancelLineManagerButton?.addEventListener("click", closeLineManager);
lineManagerDialog?.addEventListener("click", (event) => {
  if (event.target === lineManagerDialog) closeLineManager();
});
saveLineManagerButton?.addEventListener("click", saveLineManager);
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
buyTrainButton?.addEventListener("click", buyTrainsForSelectedRoute);
expressButton?.addEventListener("click", toggleExpressForSelectedRoute);
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
menuButton?.addEventListener("click", () => {
  if (startScreen) startScreen.hidden = false;
  renderStartScreen();
});
helpButton?.addEventListener("click", () => openTutorial(true));
settingsButton?.addEventListener("click", openSettings);
closeSettingsButton?.addEventListener("click", closeSettings);
settingsDialog?.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettings();
});
soundToggle?.addEventListener("change", () => updateSettings({ soundEnabled: Boolean(soundToggle.checked) }));
hapticsToggle?.addEventListener("change", () => updateSettings({ hapticsEnabled: Boolean(hapticsToggle.checked) }));
performanceSelect?.addEventListener("change", () => updateSettings({ performanceMode: performanceSelect.value === "battery" ? "battery" : "balanced" }));
reducedMotionToggle?.addEventListener("change", () => updateSettings({ reducedMotion: Boolean(reducedMotionToggle.checked) }));
clearCacheButton?.addEventListener("click", clearMapCache);
tutorialNextButton?.addEventListener("click", advanceTutorial);
tutorialSkipButton?.addEventListener("click", completeTutorial);
errorDismissButton?.addEventListener("click", clearError);
errorRetryButton?.addEventListener("click", () => {
  const action = retryAction;
  clearError();
  action?.();
});
timeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    simSpeed = Number(button.dataset.speed ?? "0");
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

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if ((event.target as HTMLElement).closest(".hud, .route-sheet, .selected-line-panel, .dialog-backdrop")) return;

  const point = containerPointFromEvent(event);
  if (activeTool === "pan") {
    const hits = findRoutesAtPoint(point, 26);
    if (hits.length === 0) selectRoute(null);
    else if (hits.length === 1) selectRoute(hits[0].id);
    else openRouteChoice(hits);
    return;
  }
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
    selectDeletePoint(point);
    return;
  }
  if (activeTool === "merge") {
    event.preventDefault();
    selectMergeEndpoint(point);
    return;
  }
  if (activeTool !== "route" && activeTool !== "extend" && activeTool !== "reconnect" && activeTool !== "branch" && activeTool !== "depot") return;
  if (activePointerId !== null) return;

  event.preventDefault();
  if (activeTool === "extend") {
    const extension = findNearestRouteEndpoint(point, 34, selectedRouteId);
    if (!extension) {
      setText(facilityReadout, "노선 끝점을 누른 뒤 드래그하세요");
      return;
    }
    activeExtension = extension;
    selectRoute(extension.routeId, false);
  }
  if (activeTool === "branch") {
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
    ? [activeExtension.endpoint, point]
    : activeRepair
      ? [activeRepair.start, point]
      : activeBranch
        ? [activeBranch.junction, point]
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
          : selectedColor;
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
    return;
  }
  if (activeTool !== "route" && activeTool !== "extend" && activeTool !== "reconnect" && activeTool !== "branch" && activeTool !== "depot") return;
  const lastPoint = rawDrawPoints[rawDrawPoints.length - 1];
  if (point.distanceTo(lastPoint) < 5) return;
  rawDrawPoints.push(point);

  if ((activeTool === "route" || activeTool === "extend" || activeTool === "reconnect" || activeTool === "branch") && previewPolyline) {
    const smoothed = smoothScreenPoints(rawDrawPoints);
    previewPolyline.setLatLngs(smoothed.map((screenPoint) => map.containerPointToLatLng(screenPoint)));
    updateDrawCostPreview(smoothed);
  }
  if (activeTool === "depot" && previewPolygon) {
    const polygonPoints = smoothScreenPoints(rawDrawPoints);
    previewPolygon.setLatLngs(polygonPoints.map((screenPoint) => map.containerPointToLatLng(screenPoint)));
    updateDepotPreviewConnection(polygonPoints);
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
    if (preview) commitHandleMove(handle, preview);
    return;
  }
  const finishedPoints = smoothScreenPoints(rawDrawPoints);
  const extension = activeExtension;
  const repair = activeRepair;
  const branch = activeBranch;
  activePointerId = null;
  activeExtension = null;
  activeRepair = null;
  activeBranch = null;
  rawDrawPoints = [];
  previewLayer.clearLayers();

  if (activeTool === "route" || activeTool === "extend") finishRouteDrawing(finishedPoints, extension);
  if (activeTool === "reconnect") finishRepairDrawing(finishedPoints, repair);
  if (activeTool === "branch") finishBranchDrawing(finishedPoints, branch);
  if (activeTool === "depot") finishDepotDrawing(finishedPoints);
}

function finishRouteDrawing(points: L.Point[], extension: RouteExtension | null = null) {
  const latLngs = points.map((point) => map.containerPointToLatLng(point));
  const actualMeters = calculateLengthKmPrecise(latLngs) * 1000;
  if (points.length < 2 || actualMeters < 50) {
    setText(selectedRouteName, "50m 이상 그려야 합니다");
    setText(facilityReadout, `현재 ${Math.round(actualMeters)}m · 건설 불가`);
    return;
  }
  pendingRoutePoints = latLngs;
  pendingExtension = extension;
  const analysis = analyzeRoute(latLngs);
  if (analysis.riverCrossings > 0) {
    showRiverDialog();
    return;
  }
  commitPendingRoute("bridge");
}

function finishBranchDrawing(points: L.Point[], branch: RouteBranchDraft | null) {
  if (!branch) return;
  const latLngs = points.map((point) => map.containerPointToLatLng(point));
  const actualMeters = calculateLengthKmPrecise(latLngs) * 1000;
  if (points.length < 2 || actualMeters < 50) {
    setText(facilityReadout, `분기는 50m 이상 필요 · 현재 ${Math.round(actualMeters)}m`);
    return;
  }
  pendingRoutePoints = latLngs;
  pendingBranch = branch;
  const analysis = analyzeRoute(latLngs);
  if (analysis.riverCrossings > 0) {
    showRiverDialog();
    return;
  }
  commitPendingRoute("bridge");
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
  pendingRoutePoints = latLngs;
  pendingRepair = repair;
  const analysis = analyzeRoute(latLngs);
  if (analysis.riverCrossings > 0) {
    showRiverDialog();
    return;
  }
  commitPendingRoute("bridge");
}

function finishDepotDrawing(points: L.Point[]) {
  if (points.length < 4 || polygonAreaPx(points) < 1200) {
    setText(facilityReadout, "기지 영역이 너무 작음");
    return;
  }
  const latLngs = closeLatLngRing(points.map((point) => map.containerPointToLatLng(point)));
  const connectedRouteIds = findRoutesNearPolygon(latLngs, 30);
  if (connectedRouteIds.length === 0) {
    setText(facilityReadout, "노선을 덮거나 30m 안에 닿게 그리세요");
    playFeedback("select");
    return;
  }

  pushHistory();
  const areaHa = calculatePolygonAreaHa(latLngs);
  const level = 1;
  const capacity = calculateDepotCapacity(areaHa, level);
  const depot: Depot = {
    id: createId("depot"),
    name: `Depot ${depots.length + 1}`,
    polygon: latLngs.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
    areaHa,
    capacity,
    maintenanceCost: calculateDepotMaintenance(areaHa, level),
    connectedRouteIds,
    level,
  };
  depots = [...depots, depot];
  playFeedback("build");
  redoStack = [];
  persistState();
  renderAll(depot.id);
}

function commitPendingRoute(riverMode: ConstructionMode) {
  if (!pendingRoutePoints) return;
  const points = pendingRoutePoints;
  const extension = pendingExtension;
  const repair = pendingRepair;
  const branch = pendingBranch;
  pendingRoutePoints = null;
  pendingExtension = null;
  pendingRepair = null;
  pendingBranch = null;
  hideRiverDialog();
  pushHistory();

  const analysis = analyzeRoute(points);
  const extensionCost = calculateConstructionCost(analysis.lengthKm, analysis.riverCrossings, analysis.mountainSegments, riverMode);
  if (branch) {
    const targetRoute = routes.find((route) => route.id === branch.routeId);
    if (!targetRoute) return;
    const junctionPosition: [number, number] = [roundCoord(branch.junctionLatLng.lat), roundCoord(branch.junctionLatLng.lng)];
    const insertionIndex = findRouteInsertionIndex(targetRoute.coordinates, branch.junctionLatLng);
    const existingCoordinateIndex = targetRoute.coordinates.findIndex((coordinate) => coordinatesEqual(coordinate, junctionPosition));
    const trunkCoordinates =
      existingCoordinateIndex >= 0
        ? targetRoute.coordinates
        : [...targetRoute.coordinates.slice(0, insertionIndex), junctionPosition, ...targetRoute.coordinates.slice(insertionIndex)];
    const migrated = rebuildRouteGraph({ ...targetRoute, coordinates: trunkCoordinates });
    const junctionNode = migrated.nodes?.find((node) => coordinatesEqual(node.position, junctionPosition));
    if (!junctionNode) return;
    junctionNode.kind = "branch";
    const terminalPoint = points[points.length - 1];
    const terminalNode: RouteNode = {
      id: createId("node"),
      position: [roundCoord(terminalPoint.lat), roundCoord(terminalPoint.lng)],
      kind: "endpoint",
    };
    const segment: RouteSegment = {
      id: createId("segment"),
      fromNodeId: junctionNode.id,
      toNodeId: terminalNode.id,
      coordinates: points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
      lengthKm: analysis.lengthKm,
      terrainImpact: { riverCrossings: analysis.riverCrossings, mountainSegments: analysis.mountainSegments },
      constructionMode: riverMode,
      constructionCost: extensionCost,
      enabled: true,
    };
    const nextBranch: Branch = {
      id: createId("branch"),
      name: `${targetRoute.name} 분기 ${(migrated.branches?.length ?? 0) + 1}`,
      junctionNodeId: junctionNode.id,
      terminalNodeId: terminalNode.id,
      segmentIds: [segment.id],
      dispatchWeight: 1,
    };
    const branchIds = [...(migrated.branches ?? []).map((item) => item.id), nextBranch.id];
    const updatedRoute: RouteLine = {
      ...migrated,
      nodes: dedupeById([...(migrated.nodes ?? []), junctionNode, terminalNode]),
      segments: [...(migrated.segments ?? []), segment],
      branches: [...(migrated.branches ?? []), nextBranch],
      servicePatterns: upsertEqualBranchPattern(migrated.servicePatterns ?? [], branchIds),
      lengthKm: Math.round((migrated.lengthKm + analysis.lengthKm) * 10) / 10,
      constructionCost: migrated.constructionCost + extensionCost,
      riverCrossings: migrated.riverCrossings + analysis.riverCrossings,
      mountainSegments: migrated.mountainSegments + analysis.mountainSegments,
    };
    routes = routes.map((route) => (route.id === targetRoute.id ? updatedRoute : route));
    economy = { ...economy, cash: economy.cash - extensionCost, constructionSpent: economy.constructionSpent + extensionCost };
    redoStack = [];
    persistState();
    selectRoute(updatedRoute.id, false);
    renderAll(updatedRoute.id);
    setText(facilityReadout, `${nextBranch.name} 완공 · 균등 배차`);
    playFeedback("build");
    return;
  }
  if (repair) {
    const targetRoute = routes.find((route) => route.id === repair.routeId);
    if (!targetRoute) return;
    const insertedPointCount = Math.max(0, points.length - 2);
    const removedSegmentLength = map.distance(
      L.latLng(targetRoute.coordinates[repair.gapIndex][0], targetRoute.coordinates[repair.gapIndex][1]),
      L.latLng(targetRoute.coordinates[repair.gapIndex + 1][0], targetRoute.coordinates[repair.gapIndex + 1][1]),
    ) / 1000;
    const nextCoordinates = [
      ...targetRoute.coordinates.slice(0, repair.gapIndex + 1),
      ...points.slice(1, -1).map((point) => [roundCoord(point.lat), roundCoord(point.lng)] as [number, number]),
      ...targetRoute.coordinates.slice(repair.gapIndex + 1),
    ];
    const disabledSegments = (targetRoute.disabledSegments ?? [])
      .filter((index) => index !== repair.gapIndex)
      .map((index) => (index > repair.gapIndex ? index + insertedPointCount : index));
    const updatedRoute: RouteLine = {
      ...targetRoute,
      coordinates: nextCoordinates,
      disabledSegments,
      lengthKm: Math.round(Math.max(0, targetRoute.lengthKm - removedSegmentLength + analysis.lengthKm) * 10) / 10,
      constructionCost: targetRoute.constructionCost + extensionCost,
      riverCrossings: targetRoute.riverCrossings + analysis.riverCrossings,
      mountainSegments: targetRoute.mountainSegments + analysis.mountainSegments,
    };
    routes = routes.map((route) => (route.id === targetRoute.id ? rebuildRouteGraph(updatedRoute) : route));
    economy = { ...economy, cash: economy.cash - extensionCost, constructionSpent: economy.constructionSpent + extensionCost };
    playFeedback("build");
    redoStack = [];
    persistState();
    renderAll(updatedRoute.id);
    setText(facilityReadout, `${updatedRoute.name} 수정 완료`);
    return;
  }
  if (extension) {
    const targetRoute = routes.find((route) => route.id === extension.routeId);
    if (!targetRoute) return;
    const existingPoints = targetRoute.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
    const extendedPoints = extension.atStart
      ? [...points.slice().reverse().slice(0, -1), ...existingPoints]
      : [...existingPoints, ...points.slice(1)];
    const updatedRoute: RouteLine = {
      ...targetRoute,
      coordinates: extendedPoints.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
      lengthKm: Math.round((targetRoute.lengthKm + analysis.lengthKm) * 10) / 10,
      constructionCost: targetRoute.constructionCost + extensionCost,
      riverCrossings: targetRoute.riverCrossings + analysis.riverCrossings,
      mountainSegments: targetRoute.mountainSegments + analysis.mountainSegments,
    };
    routes = routes.map((route) => (route.id === targetRoute.id ? rebuildRouteGraph(updatedRoute) : route));
    economy = { ...economy, cash: economy.cash - extensionCost, constructionSpent: economy.constructionSpent + extensionCost };
    playFeedback("build");
    redoStack = [];
    persistState();
    renderAll(updatedRoute.id);
    setText(facilityReadout, `${updatedRoute.name} 연장 완료`);
    return;
  }
  const route: RouteLine = {
    id: createId("route"),
    name: `Line ${routes.length + 1}`,
    color: selectedColor,
    coordinates: points.map((point) => [roundCoord(point.lat), roundCoord(point.lng)]),
    lengthKm: analysis.lengthKm,
    constructionCost: extensionCost,
    riverCrossings: analysis.riverCrossings,
    mountainSegments: analysis.mountainSegments,
    riverMode,
    visibility: "public",
    localServiceEnabled: true,
    expressServiceEnabled: false,
    operationPaused: false,
  };
  const graphRoute = rebuildRouteGraph(route);
  routes = [...routes, graphRoute];
  economy = { ...economy, cash: economy.cash - route.constructionCost, constructionSpent: economy.constructionSpent + route.constructionCost };
  playFeedback("build");
  redoStack = [];
  persistState();
  selectRoute(route.id, false);
  renderAll(route.id);
}

function createStationAt(point: L.Point) {
  const snap = findNearestRoutePoint(point);
  if (!snap || snap.distancePx > stationSnapPx) {
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
  createAutomaticTransfersForStation(station);
  playFeedback("build");
  redoStack = [];
  persistState();
  renderAll(station.id);
}

function selectTransferStation(point: L.Point) {
  const station = findNearestStation(point, 26);
  if (!station) {
    setText(facilityReadout, "환승할 역을 선택하세요");
    return;
  }
  selectedTransferStationIds = [...selectedTransferStationIds.filter((id) => id !== station.id), station.id].slice(-2);
  setText(facilityReadout, selectedTransferStationIds.length === 1 ? `${station.name} 선택` : "환승 연결 완료");
  if (selectedTransferStationIds.length < 2) {
    renderAll(station.id);
    return;
  }
  pushHistory();
  createTransferGroup(selectedTransferStationIds, false);
  selectedTransferStationIds = [];
  redoStack = [];
  persistState();
  renderAll(station.id);
}

function createAutomaticTransfersForStation(station: Station) {
  const stationPoint = L.latLng(station.position[0], station.position[1]);
  for (const other of stations) {
    if (other.id === station.id) continue;
    const otherPoint = L.latLng(other.position[0], other.position[1]);
    const distance = map.distance(stationPoint, otherPoint);
    const sharesRoute = station.connectedRouteIds.some((id) => other.connectedRouteIds.includes(id));
    if (!sharesRoute && distance <= transferAutoMeters) createTransferGroup([station.id, other.id], true);
  }
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

function showRiverDialog() {
  if (riverDialog) riverDialog.hidden = false;
}

function hideRiverDialog() {
  if (riverDialog) riverDialog.hidden = true;
}

function renderAll(selectedId?: string) {
  if (selectedRouteId && !routes.some((route) => route.id === selectedRouteId)) selectedRouteId = null;
  if (selectedId && routes.some((route) => route.id === selectedId)) selectedRouteId = selectedId;
  regeneratePassengerGroups();
  updateOperationRouteOptions();
  renderRoutes(selectedRouteId ?? selectedId);
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
  if (autoSaveTimer) window.clearInterval(autoSaveTimer);
  autoSaveTimer = window.setInterval(() => saveCurrentSlot("자동 저장"), 30000);
  void updateCacheReadout();
}

function renderStartScreen() {
  renderCityOptions();
  if (!slotList) return;
  if (slotSummaries.length === 0) {
    slotList.innerHTML = `<div class="empty-slot">저장 슬롯이 없습니다</div>`;
    if (continueButton) continueButton.disabled = true;
    return;
  }
  if (continueButton) continueButton.disabled = false;
  slotList.innerHTML = slotSummaries
    .map((slot) => {
      const city = cityConfigs[slot.cityId];
      const mode = slot.mode === "sandbox" ? "샌드박스" : "커리어";
      const bankrupt = slot.bankrupt ? " · 파산" : "";
      return `<button class="slot-card" data-slot-id="${slot.slotId}" type="button"><strong>${slot.slotName}</strong><span>${city.name} · ${mode} · ${difficultyConfigs[slot.difficulty].label}${bankrupt}</span><em>${formatSignedCost(slot.cash)}</em></button>`;
    })
    .join("");
  slotList.querySelectorAll<HTMLButtonElement>(".slot-card").forEach((button) => {
    button.addEventListener("click", () => loadSlot(button.dataset.slotId || ""));
  });
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
    tutorialStep: 0,
    tutorialCompleted: false,
  };
  economy = {
    ...defaultEconomy,
    cash: mode === "sandbox" ? 999999999 : difficultyConfigs[difficulty].startCash,
  };
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
  renderAll();
}

function resetWorld() {
  routes = [];
  stations = [];
  transfers = [];
  depots = [];
  trainFleets = [];
  expressConfigs = [];
  passengerGroups = [];
  loans = [];
  undoStack = [];
  redoStack = [];
  selectedOperationRouteId = "";
  selectedRouteId = null;
  selectedDepotId = null;
  selectedTransferStationIds = [];
  deleteAnchor = null;
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
  };
}

function openSaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("draw-gyotong-saves", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("slots")) db.createObjectStore("slots", { keyPath: "meta.slotId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeSaveSlot(state: SaveState) {
  writeFallbackSlot(state);
  try {
    const db = await openSaveDb();
    try {
      await idbRequest(db.transaction("slots", "readwrite").objectStore("slots").put(state));
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
      if (state) return state;
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
      indexedStates = (await idbRequest(db.transaction("slots", "readonly").objectStore("slots").getAll())) as SaveState[];
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
      bankrupt: state.meta!.bankrupt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function readFallbackSlots(): SaveState[] {
  try {
    const raw = localStorage.getItem(fallbackSaveKey);
    const slots = raw ? (JSON.parse(raw) as SaveState[]) : [];
    return Array.isArray(slots) ? slots.filter((state) => state?.meta?.slotId) : [];
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

function hasRouteGaps(route: RouteLine) {
  return (route.disabledSegments?.length ?? 0) > 0;
}

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
  for (const route of routes) {
    const selected = route.id === selectedId;
    for (const latLngs of getRoutePaths(route)) {
      if (selected) L.polyline(latLngs, routeStyle("rgba(255, 255, 255, 0.94)", 18, 0.95)).addTo(routeLayer);
      L.polyline(latLngs, routeStyle("rgba(4, 10, 14, 0.82)", selected ? 14 : 13, 0.92)).addTo(routeLayer);
      const opacity = route.visibility === "planning" ? 0.58 : route.operationPaused ? 0.68 : 0.98;
      const polyline = L.polyline(latLngs, routeStyle(route.color, selected ? 9 : 6, opacity)).addTo(routeLayer);
      if (route.visibility === "planning") polyline.setStyle({ dashArray: "10 8" });
    }
  }
}

function renderStations(selectedId?: string) {
  stationLayer.clearLayers();
  for (const transfer of transfers) {
    const transferStations = transfer.stationIds.map((id) => stations.find((station) => station.id === id)).filter(Boolean) as Station[];
    if (transferStations.length < 2) continue;
    L.polyline(
      transferStations.map((station) => L.latLng(station.position[0], station.position[1])),
      { color: "#ffffff", weight: 2, opacity: 0.7, dashArray: "3 6", interactive: false },
    ).addTo(stationLayer);
  }

  for (const station of stations) {
    const position = L.latLng(station.position[0], station.position[1]);
    const isSelected = station.id === selectedId || selectedTransferStationIds.includes(station.id);
    const expressConfig = expressConfigs.find((config) => config.routeId === selectedOperationRouteId);
    const isExpressStop = Boolean(expressConfig?.enabled && expressConfig.stopStationIds.includes(station.id));
    const color = isExpressStop ? "#ff5d5d" : station.transferGroupId ? "#ffffff" : getRouteColor(station.connectedRouteIds[0]);
    L.circleMarker(position, {
      radius: isExpressStop ? 8 : isSelected ? 8 : 6,
      color: "#081117",
      weight: 3,
      fillColor: color,
      fillOpacity: 1,
      interactive: false,
    }).addTo(stationLayer);
  }
}

function renderDepots(selectedId?: string) {
  depotLayer.clearLayers();
  for (const depot of depots) {
    const isSelected = depot.id === selectedId || depot.id === selectedDepotId;
    const polygon = L.polygon(
      depot.polygon.map(([lat, lng]) => L.latLng(lat, lng)),
      {
        color: isSelected ? "#ffffff" : "#f3ca52",
        fillColor: "#f3ca52",
        fillOpacity: 0.18,
        weight: isSelected ? 3 : 2,
        interactive: true,
      },
    ).addTo(depotLayer);
    polygon.on("click", () => {
      selectedDepotId = depot.id;
      expandDepot(depot.id);
    });
  }
}

function renderTrains() {
  const visibleKeys = new Set<string>();
  const maxVisiblePerRoute = settings.performanceMode === "battery" ? 8 : 18;
  for (const route of routes) {
    if (hasRouteGaps(route) || route.operationPaused || route.visibility === "planning") continue;
    const routeFleets = trainFleets.filter((fleet) => fleet.routeId === route.id);
    const totalSets = routeFleets.reduce((sum, fleet) => sum + fleet.sets, 0);
    if (totalSets === 0 || route.coordinates.length < 2) continue;

    const displaySets = Math.min(totalSets, maxVisiblePerRoute);
    const routePaths = getTrainServicePaths(route);
    const operation = calculateRouteOperation(route.id);
    const cycleMinutes = Math.max(operation.headwayMin * totalSets, 12);
    const progressBase = (simMinutes % cycleMinutes) / cycleMinutes;

    for (let index = 0; index < displaySets; index += 1) {
      const key = `${route.id}:${index}`;
      visibleKeys.add(key);
      const progress = (progressBase + index / displaySets) % 1;
      const routePoints = routePaths[index % routePaths.length];
      const position = interpolateAlongRoute(routePoints, progress <= 0.5 ? progress * 2 : (1 - progress) * 2);
      const existing = trainMarkers.get(key);
      if (existing) {
        existing.setLatLng(position);
        continue;
      }
      const marker = L.marker(position, {
        icon: L.divIcon({ className: "train-icon", html: `<span style="background:${route.color}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
        keyboard: false,
      }).addTo(trainLayer);
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
    setText(facilityReadout, "운영할 노선이 필요");
    return;
  }
  const connectedDepotCapacity = depots
    .filter((depot) => depot.connectedRouteIds.includes(route.id))
    .reduce((sum, depot) => sum + depot.capacity, 0);
  const currentSets = trainFleets.filter((fleet) => fleet.routeId === route.id).reduce((sum, fleet) => sum + fleet.sets, 0);
  const trainType = (trainTypeSelect?.value as TrainType) || "metro";
  const cars = clampInteger(Number(carCountInput?.value ?? 6), 2, 10);
  const sets = clampInteger(Number(setCountInput?.value ?? 1), 1, 30);
  if (connectedDepotCapacity === 0) {
    setText(facilityReadout, "연결 차량기지 필요");
    return;
  }
  if (currentSets + sets > connectedDepotCapacity) {
    setText(facilityReadout, "차량기지 수용량 부족");
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

function calculateRouteOperation(routeId: string): RouteOperation {
  const route = routes.find((item) => item.id === routeId);
  const routeStations = stations.filter((station) => station.connectedRouteIds.includes(routeId));
  const routeFleets = trainFleets.filter((fleet) => fleet.routeId === routeId);
  const sets = routeFleets.reduce((sum, fleet) => sum + fleet.sets, 0);
  const averageSpeed = routeFleets.length > 0 ? weightedAverageSpeed(routeFleets) : 32;
  const dailyDemand = routeStations.reduce((sum, station) => sum + station.demand, 0);
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
  const routeId = selectedOperationRouteId || routes[0]?.id;
  if (!routeId) {
    setText(headwayReadout, "-");
    setText(crowdingReadout, "-");
    setText(waitReadout, "-");
    return;
  }
  const operation = calculateRouteOperation(routeId);
  setText(headwayReadout, operation.headwayMin > 0 ? `${operation.headwayMin.toFixed(1)}분` : "열차 없음");
  setText(crowdingReadout, operation.hourlyCapacity > 0 ? `${Math.round(operation.crowding * 100)}%` : "-");
  setText(waitReadout, operation.waitMin > 0 ? `${operation.waitMin.toFixed(1)}분` : "-");
}

function regeneratePassengerGroups() {
  if (stations.length < 2) {
    passengerGroups = [];
    economy = { ...economy, demand: 0 };
    return;
  }
  const groups: PassengerGroup[] = [];
  const rankedStations = [...stations].sort((a, b) => b.demand - a.demand).slice(0, 18);
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
      const activeDemand = Math.round(basePeople * (0.45 + satisfaction / 140));
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
  const direct = origin.connectedRouteIds.find((routeId) => destination.connectedRouteIds.includes(routeId));
  if (direct) return [direct];
  for (const originRoute of origin.connectedRouteIds) {
    for (const destinationRoute of destination.connectedRouteIds) {
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

function settleSimulationDay() {
  regeneratePassengerGroups();
  if (economy.autoFare) economy.fare = calculateAutoFare();
  const fareRevenue = Math.round((economy.demand * economy.fare) / 100000000);
  const maintenance = calculateDailyMaintenance();
  const loanInterest = loans.reduce((sum, loan) => sum + loan.balance * (loan.interestRate / 365), 0);
  const loanPayment = loans.reduce((sum, loan) => sum + loan.monthlyPayment / 30, 0);
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
  return Math.round(fleetMaintenance + depotMaintenance + expressCost);
}

function calculateAutoFare() {
  const avgCrowding = routes.length > 0 ? routes.reduce((sum, route) => sum + calculateRouteOperation(route.id).crowding, 0) / routes.length : 0.8;
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

function updateEconomyHud() {
  if (fareInput && document.activeElement !== fareInput) fareInput.value = String(economy.fare);
  setText(cashReadout, formatSignedCost(economy.cash));
  setText(satisfactionReadout, `${economy.satisfaction}`);
  setText(demandReadout, economy.demand.toLocaleString("ko-KR"));
  updateAutoFareButton();
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

function tickSimulation(timestamp: number) {
  const deltaMinutes = ((timestamp - lastFrameTime) / 1000 / 60) * simSpeed * 60;
  lastFrameTime = timestamp;
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
  if (undoButton) undoButton.disabled = undoStack.length === 0;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
}

function setTool(tool: ToolMode) {
  activeTool = tool;
  cancelActiveDrawing();
  toolButtons.forEach((button) => {
    const isActive =
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
    extend: ["노선 연장", ["기존 노선의 끝점에서 시작", "끝점을 누른 뒤 드래그"]],
    edit: ["경로 편집", ["노선 선택 후 핸들 드래그", "비용·환급 자동 계산"]],
    eraser: ["구간 삭제", ["같은 노선에서 두 지점 선택", "분리 전 영향 확인"]],
    reconnect: ["노선 수정", ["붉은 수정 지점에서 시작", "반대쪽 지점까지 드래그"]],
    branch: ["분기 건설", ["기존 노선 위에서 시작", "완공 후 균등 배차"]],
    merge: ["노선 병합", ["첫 노선 끝점 선택", "다른 노선 끝점 선택"]],
    station: ["역 배치", ["완성 노선 위 터치", "가까운 노선 자동 연결"]],
    transfer: ["환승 연결", ["두 역 순서대로 선택", "근접 역은 자동 환승"]],
    depot: ["차량기지", ["노선과 겹치거나 30m 안", "밝게 표시된 노선에 닿게 그리기"]],
    expressStop: ["급행 정차역", ["정차역 터치 토글", "급행 운영비 추가"]],
  };
  setText(modeLabel, labels[tool][0]);
  setHint(labels[tool][1]);
  if (tool === "depot") renderDepotConnectionGuide();
  else depotGuideLayer.clearLayers();
  if (tool === "reconnect") renderRepairGuide();
  else repairGuideLayer.clearLayers();
  if (tool === "edit") renderEditHandles();
  else if (tool === "eraser") renderDeleteGuide();
  else if (tool === "merge") renderMergeGuide();
  else editGuideLayer.clearLayers();
  updateDynamicLayers();
  playFeedback("select");
}

function cancelActiveDrawing() {
  activePointerId = null;
  activeExtension = null;
  activeRepair = null;
  activeBranch = null;
  activeHandleMove = null;
  handlePreviewCoordinates = null;
  rawDrawPoints = [];
  previewLayer.clearLayers();
  map.dragging.enable();
}

function buildColorControls() {
  if (!colorStrip) return;
  colorStrip.innerHTML = "";
  for (const color of routeColors) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-swatch";
    button.style.background = color;
    button.setAttribute("aria-label", `노선 색상 ${color}`);
    button.setAttribute("aria-pressed", String(color === selectedColor));
    button.addEventListener("click", () => {
      selectedColor = color;
      colorStrip.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      recolorLatestRoute(color);
    });
    colorStrip.appendChild(button);
  }
}

function recolorLatestRoute(color: string) {
  if (routes.length === 0) return;
  pushHistory();
  const target = routes.find((route) => route.id === selectedRouteId) ?? routes.at(-1)!;
  routes = routes.map((route) => (route.id === target.id ? { ...route, color } : route));
  redoStack = [];
  persistState();
  renderAll(target.id);
}

function selectRoute(routeId: string | null, shouldRender = true) {
  selectedRouteId = routeId && routes.some((route) => route.id === routeId) ? routeId : null;
  if (selectedRouteId) {
    selectedOperationRouteId = selectedRouteId;
    const route = routes.find((item) => item.id === selectedRouteId);
    if (route) selectedColor = route.color;
  }
  deleteAnchor = null;
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
      closeRouteChoice();
    });
  });
  routeChoiceDialog.hidden = false;
}

function closeRouteChoice() {
  if (routeChoiceDialog) routeChoiceDialog.hidden = true;
}

function updateSelectedLinePanel() {
  if (!selectedLinePanel) return;
  const route = routes.find((item) => item.id === selectedRouteId);
  selectedLinePanel.hidden = !route;
  if (!route) return;
  setText(selectedLineTitle, route.name);
  const status = route.operationPaused ? "운행 중지" : route.visibility === "planning" ? "계획 공개" : "운행 중";
  const branchLabel = (route.branches?.length ?? 0) > 0 ? ` · 분기 ${route.branches!.length}` : "";
  setText(selectedLineMeta, `${route.lengthKm.toFixed(1)}km · ${status}${branchLabel}`);
  if (selectedLineColor) selectedLineColor.style.background = route.color;
}

function openLineManager() {
  const route = routes.find((item) => item.id === selectedRouteId);
  if (!route || !lineManagerDialog) {
    showToast("먼저 지도에서 노선을 선택하세요");
    return;
  }
  if (lineNameInput) lineNameInput.value = route.name;
  if (lineColorInput) lineColorInput.value = route.color;
  if (lineVisibilitySelect) lineVisibilitySelect.value = route.visibility ?? "public";
  if (localServiceToggle) localServiceToggle.checked = route.localServiceEnabled !== false;
  if (expressServiceToggle) expressServiceToggle.checked = route.expressServiceEnabled === true || getExpressConfig(route.id).enabled;
  if (operationPausedToggle) operationPausedToggle.checked = route.operationPaused === true;
  setText(
    lineManagerSummary,
    `${route.lengthKm.toFixed(1)}km · 역 ${stations.filter((station) => station.connectedRouteIds.includes(route.id)).length}개 · 분기 ${(route.branches?.length ?? 0)}개`,
  );
  lineManagerDialog.hidden = false;
}

function closeLineManager() {
  if (lineManagerDialog) lineManagerDialog.hidden = true;
}

function saveLineManager() {
  const route = routes.find((item) => item.id === selectedRouteId);
  if (!route) return;
  const nextName = lineNameInput?.value.trim() || route.name;
  pushHistory();
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

function commitHandleMove(handle: RouteHandleMove, coordinates: Array<[number, number]>) {
  const route = routes.find((item) => item.id === handle.routeId);
  if (!route) return;
  const newLength = Math.round(calculateLengthKmPrecise(coordinates.map(([lat, lng]) => L.latLng(lat, lng))) * 10) / 10;
  const deltaCost = calculateEditCostDelta(newLength - route.lengthKm);
  pushHistory();
  const updated = rebuildRouteGraph({
    ...route,
    coordinates,
    lengthKm: newLength,
    constructionCost: Math.max(0, route.constructionCost + deltaCost),
  });
  routes = routes.map((item) => (item.id === route.id ? updated : item));
  economy = {
    ...economy,
    cash: economy.cash - deltaCost,
    constructionSpent: Math.max(0, economy.constructionSpent + deltaCost),
  };
  redoStack = [];
  persistState();
  renderAll(route.id);
  setText(facilityReadout, deltaCost < 0 ? `${formatCost(Math.abs(deltaCost))} 환급 완료` : `${formatCost(deltaCost)} 추가 반영`);
  playFeedback("build");
}

function calculateEditCostDelta(deltaKm: number) {
  const raw = deltaKm * baseCostPerKm * cityConfigs[currentMeta.cityId].constructionMultiplier * difficultyConfigs[currentMeta.difficulty].costMultiplier;
  return Math.round(raw >= 0 ? raw : raw * 0.45);
}

function updateDrawCostPreview(points: L.Point[]) {
  const latLngs = points.map((point) => map.containerPointToLatLng(point));
  const analysis = analyzeRoute(latLngs);
  const cost = calculateConstructionCost(analysis.lengthKm, analysis.riverCrossings, analysis.mountainSegments, "bridge");
  setText(costReadout, formatCost(cost));
  setText(facilityReadout, `${analysis.lengthKm.toFixed(2)}km · 예상 ${formatCost(cost)}`);
}

function selectDeletePoint(point: L.Point) {
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
  const warningParts = [
    fleetCount > 0 ? `운행 열차 ${fleetCount}편성은 두 노선에 균등 배분됩니다.` : "",
    affectedStations.length > 0 ? `삭제 구간 주변 역 ${affectedStations.length}개를 다시 연결합니다.` : "",
    transferCount > 0 ? `환승 관계 ${transferCount}건을 재검증합니다.` : "",
  ].filter(Boolean);
  openDecisionDialog(
    `${route.name}의 ${removedLength.toFixed(2)}km 구간을 삭제하면 노선이 둘로 나뉩니다. 두 개의 독립 노선으로 분리할까요?`,
    warningParts.join(" "),
    "두 노선으로 분리",
    () => splitRouteAtRange(route.id, startIndex, endIndex, removedLength),
  );
  deleteAnchor = null;
  renderDeleteGuide();
}

function renderDeleteGuide() {
  editGuideLayer.clearLayers();
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
    setText(facilityReadout, "다른 노선의 연결 가능한 끝점을 선택하세요");
    return;
  }
  if (endpoint.routeId === mergeFirstEndpoint.routeId) {
    setText(facilityReadout, "서로 다른 노선을 선택하세요");
    return;
  }
  if (endpoint.endpoint.distanceTo(mergeFirstEndpoint.endpoint) > 58) {
    setText(facilityReadout, "끝점이 너무 멉니다 · 화면상 58px 안으로 연결하세요");
    return;
  }
  pendingMerge = { first: mergeFirstEndpoint, second: endpoint };
  mergeFirstEndpoint = null;
  openMergeDialog(pendingMerge);
}

function renderMergeGuide() {
  editGuideLayer.clearLayers();
  if (!mergeFirstEndpoint) return;
  const point = map.containerPointToLatLng(mergeFirstEndpoint.endpoint);
  L.circleMarker(point, { radius: 12, color: "#ffffff", weight: 3, fillColor: "#f3ca52", fillOpacity: 1, interactive: false }).addTo(editGuideLayer);
}

function openMergeDialog(merge: PendingMerge) {
  const first = routes.find((route) => route.id === merge.first.routeId);
  const second = routes.find((route) => route.id === merge.second.routeId);
  if (!first || !second || !mergeDialog) return;
  setText(mergeDescription, `${first.name}과 ${second.name}을 하나의 운행 노선으로 연결합니다. 역·차량·환승 데이터는 자동 정리됩니다.`);
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
  const firstCoordinates = pendingMerge.first.atStart ? [...first.coordinates].reverse() : first.coordinates;
  const secondCoordinates = pendingMerge.second.atStart ? second.coordinates : [...second.coordinates].reverse();
  const bridgeCoordinates = smoothCoordinateBridge(firstCoordinates.at(-1)!, secondCoordinates[0]);
  const mergedCoordinates = [...firstCoordinates, ...bridgeCoordinates.slice(1, -1), ...secondCoordinates];
  const selectedNameRoute = routes.find((route) => route.id === mergeNameSelect?.value) ?? first;
  const selectedColorRoute = routes.find((route) => route.id === mergeColorSelect?.value) ?? first;
  pushHistory();
  const merged = rebuildRouteGraph({
    ...first,
    name: selectedNameRoute.name,
    color: selectedColorRoute.color,
    coordinates: mergedCoordinates,
    lengthKm: Math.round(calculateLengthKmPrecise(mergedCoordinates.map(([lat, lng]) => L.latLng(lat, lng))) * 10) / 10,
    constructionCost: first.constructionCost + second.constructionCost,
    riverCrossings: first.riverCrossings + second.riverCrossings,
    mountainSegments: first.mountainSegments + second.mountainSegments,
    branches: [...(first.branches ?? []), ...(second.branches ?? [])],
    nodes: [...(first.nodes ?? []), ...(second.nodes ?? [])],
    segments: [...(first.segments ?? []), ...(second.segments ?? [])],
    servicePatterns: upsertEqualBranchPattern(
      [...(first.servicePatterns ?? []), ...(second.servicePatterns ?? [])],
      [...(first.branches ?? []), ...(second.branches ?? [])].map((branch) => branch.id),
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
  cleanupTransferData();
  redoStack = [];
  persistState();
  pendingMerge = null;
  if (mergeDialog) mergeDialog.hidden = true;
  selectRoute(first.id, false);
  renderAll(first.id);
  showToast(`${merged.name}으로 병합했습니다`);
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
  if (best || !preferredRouteId) return best;
  return findNearestRouteCoordinate(point, undefined, thresholdPx);
}

function rebuildRouteGraph(route: RouteLine): RouteLine {
  if (route.coordinates.length < 2) return route;
  const branchSegmentIds = new Set((route.branches ?? []).flatMap((branch) => branch.segmentIds));
  const branchSegments = (route.segments ?? []).filter((segment) => branchSegmentIds.has(segment.id));
  const branchNodeIds = new Set((route.branches ?? []).flatMap((branch) => [branch.junctionNodeId, branch.terminalNodeId]));
  const branchNodes = (route.nodes ?? []).filter((node) => branchNodeIds.has(node.id));
  const existingTrunkNodes = (route.nodes ?? []).filter((node) => !branchNodeIds.has(node.id));
  const trunkNodes = route.coordinates.map((coordinate, index) => ({
    id: existingTrunkNodes.find((node) => coordinatesEqual(node.position, coordinate))?.id ?? createId("node"),
    position: coordinate,
    kind: (index === 0 || index === route.coordinates.length - 1 ? "endpoint" : "control") as RouteNodeKind,
  }));
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
      id: existing?.id ?? createId("segment"),
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
  const patterns = upsertEqualBranchPattern(route.servicePatterns ?? [], branchIds);
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

function upsertEqualBranchPattern(patterns: ServicePattern[], branchIds: string[]) {
  const local = patterns.find((pattern) => pattern.kind === "local");
  const express = patterns.find((pattern) => pattern.kind === "express");
  return [
    {
      id: local?.id ?? createId("pattern"),
      name: local?.name ?? "일반 균등 운행",
      kind: "local" as const,
      branchIds,
      enabled: local?.enabled ?? true,
      dispatchMode: "equal" as const,
    },
    {
      id: express?.id ?? createId("pattern"),
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
  return [
    a,
    [roundCoord(a[0] * 0.67 + b[0] * 0.33), roundCoord(a[1] * 0.67 + b[1] * 0.33)] as [number, number],
    [roundCoord(a[0] * 0.33 + b[0] * 0.67), roundCoord(a[1] * 0.33 + b[1] * 0.67)] as [number, number],
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

function analyzeRoute(points: LatLng[]) {
  const lengthKm = calculateLengthKm(points);
  const screenPoints = points.map((point) => map.latLngToContainerPoint(point));
  const riverCrossings = countObstacleHits(screenPoints, "river", 18);
  const mountainSegments = countObstacleHits(screenPoints, "mountain", 24);
  return { lengthKm, riverCrossings, mountainSegments };
}

function countObstacleHits(routePoints: L.Point[], kind: Obstacle["kind"], threshold: number) {
  const obstacles = knownObstacles.filter((obstacle) => obstacle.kind === kind);
  let hits = 0;
  for (let i = 1; i < routePoints.length; i += 1) {
    const start = routePoints[i - 1];
    const end = routePoints[i];
    if (obstacles.some((obstacle) => obstacle.points.some((point) => pointLineDistance(point, start, end) <= threshold))) hits += 1;
  }
  return Math.min(hits, 12);
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

function calculateLengthKm(points: LatLng[]) {
  let meters = 0;
  for (let i = 1; i < points.length; i += 1) meters += map.distance(points[i - 1], points[i]);
  return Math.round((meters / 1000) * 10) / 10;
}

function calculateConstructionCost(lengthKm: number, riverCrossings: number, mountainSegments: number, riverMode: ConstructionMode) {
  const city = cityConfigs[currentMeta.cityId];
  const difficulty = difficultyConfigs[currentMeta.difficulty];
  const riverCost = riverCrossings * (riverMode === "bridge" ? bridgeCostPerCrossing : tunnelCostPerCrossing) * city.riverMultiplier;
  const mountainCost = mountainSegments * mountainCostPerSegment * city.mountainMultiplier;
  return Math.round((lengthKm * baseCostPerKm + riverCost + mountainCost) * city.constructionMultiplier * difficulty.costMultiplier);
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
  return JSON.parse(JSON.stringify({ meta: currentMeta, routes, stations, transfers, depots, trainFleets, expressConfigs, passengerGroups, loans, economy })) as SaveState;
}

function applyState(state: SaveState) {
  currentMeta = { ...createDefaultMeta(), ...(state.meta ?? currentMeta) };
  routes = (state.routes ?? []).map((route) => rebuildRouteGraph(route));
  stations = state.stations;
  transfers = state.transfers;
  depots = state.depots;
  trainFleets = state.trainFleets ?? [];
  expressConfigs = state.expressConfigs ?? [];
  passengerGroups = state.passengerGroups ?? [];
  loans = state.loans ?? [];
  economy = { ...defaultEconomy, ...(state.economy ?? {}) };
}

function persistState() {
  synchronizeGraphReferences();
  localStorage.setItem("draw-gyotong-state", JSON.stringify({ meta: currentMeta, routes, stations, transfers, depots, trainFleets, expressConfigs, passengerGroups, loans, economy }));
  localStorage.setItem("draw-gyotong-routes", JSON.stringify(routes));
}

function loadSavedState() {
  try {
    const savedState = localStorage.getItem("draw-gyotong-state");
    if (savedState) {
      const parsed = JSON.parse(savedState) as SaveState;
      currentMeta = { ...createDefaultMeta(), ...(parsed.meta ?? {}) };
      routes = Array.isArray(parsed.routes) ? parsed.routes.map((route) => rebuildRouteGraph(route)) : [];
      stations = Array.isArray(parsed.stations) ? parsed.stations : [];
      transfers = Array.isArray(parsed.transfers) ? parsed.transfers : [];
      depots = Array.isArray(parsed.depots) ? parsed.depots : [];
      trainFleets = Array.isArray(parsed.trainFleets) ? parsed.trainFleets : [];
      expressConfigs = Array.isArray(parsed.expressConfigs) ? parsed.expressConfigs : [];
      passengerGroups = Array.isArray(parsed.passengerGroups) ? parsed.passengerGroups : [];
      loans = Array.isArray(parsed.loans) ? parsed.loans : [];
      economy = { ...defaultEconomy, ...(parsed.economy ?? {}) };
      return;
    }
    const savedRoutes = localStorage.getItem("draw-gyotong-routes");
    routes = savedRoutes ? (JSON.parse(savedRoutes) as RouteLine[]).map((route) => rebuildRouteGraph(route)) : [];
  } catch {
    routes = [];
    stations = [];
    transfers = [];
    depots = [];
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
  const zoom = map.getZoom();
  const wantsAdmin = overlayState.administrative && zoom >= 10;
  const wantsLanduse = overlayState.landuse && zoom >= 11;
  applyLayerVisibility("rail");
  updateGeoLayer(adminLayer, wantsAdmin);
  updateGeoLayer(landuseLayer, wantsLanduse);
  loadViewportOsmData({ admin: wantsAdmin, landuse: wantsLanduse || activeTool === "route" });
}

function updateGeoLayer(layer: GeoJSON, visible: boolean) {
  if (!visible) {
    layer.clearLayers();
    if (map.hasLayer(layer)) layer.removeFrom(map);
  } else if (!map.hasLayer(layer)) {
    layer.addTo(map);
  }
}

async function loadViewportOsmData(options: { admin: boolean; landuse: boolean }) {
  const bounds = map.getBounds().pad(0.18);
  if (approximateAreaKm2(bounds) > 900) return;
  const bbox = [bounds.getSouth().toFixed(5), bounds.getWest().toFixed(5), bounds.getNorth().toFixed(5), bounds.getEast().toFixed(5)].join(",");
  const queryKey = `${bbox}:${options.admin}:${options.landuse}:${Math.floor(map.getZoom())}`;
  if (queryKey === lastOverpassKey) return;
  lastOverpassKey = queryKey;

  const filters = [
    options.admin ? `relation["boundary"="administrative"]["admin_level"~"6|7|8"](${bbox});` : "",
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
    if ((error as Error).name !== "AbortError") console.warn(error);
  }
}

async function fetchOverpass(query: string, signal: AbortSignal) {
  const response = await fetch(overpassEndpoint, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    signal,
  });
  if (!response.ok) throw new Error(`Overpass failed: ${response.status}`);
  return response.json();
}

function renderOverpass(elements: OverpassElement[], options: { admin: boolean; landuse: boolean }) {
  const adminFeatures: GeoJsonFeature[] = [];
  const landuseFeatures: GeoJsonFeature[] = [];
  const nextObstacles: Obstacle[] = [];

  for (const element of elements) {
    if (!element.tags) continue;
    if (options.admin && element.tags.boundary === "administrative") {
      const feature = relationToFeature(element);
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
}

function relationToFeature(element: OverpassElement): GeoJsonFeature | null {
  const rings = element.members
    ?.filter((member) => member.role === "outer" && member.geometry && member.geometry.length > 2)
    .map((member) => member.geometry!.map((point) => [point.lon, point.lat]));
  if (!rings || rings.length === 0) return null;
  return { type: "Feature", properties: element.tags ?? {}, geometry: { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) } };
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
  { title: "첫 노선을 그리세요", text: "노선 도구를 누른 뒤 지도 위를 드래그하세요." },
  { title: "역을 배치하세요", text: "역 도구를 선택하고 방금 만든 노선 위를 누르세요." },
  { title: "차량기지를 연결하세요", text: "노선 가까이에 영역을 그려 차량기지를 만드세요." },
  { title: "열차를 투입하세요", text: "노선을 선택하고 편성을 구매해 운행 준비를 마치세요." },
  { title: "관제를 시작하세요", text: "하단의 x1 이상을 눌러 도시의 하루를 운행하세요." },
];

function openTutorial(restart = false) {
  if (!tutorialPanel) return;
  if (restart) currentMeta = { ...currentMeta, tutorialStep: 0, tutorialCompleted: false };
  tutorialPanel.hidden = false;
  renderTutorial();
}

function renderTutorial() {
  const step = Math.max(0, Math.min(tutorialSteps.length - 1, currentMeta.tutorialStep ?? 0));
  const item = tutorialSteps[step];
  setText(tutorialStep, `${String(step + 1).padStart(2, "0")} / ${String(tutorialSteps.length).padStart(2, "0")}`);
  setText(tutorialTitle, item.title);
  setText(tutorialText, item.text);
  if (tutorialNextButton) tutorialNextButton.textContent = step === tutorialSteps.length - 1 ? "완료" : "다음";
}

function updateTutorialProgress() {
  if (currentMeta.tutorialCompleted || startScreen?.hidden === false) return;
  const targetStep = trainFleets.length > 0 ? 4 : depots.length > 0 ? 3 : stations.length > 0 ? 2 : routes.length > 0 ? 1 : 0;
  if ((currentMeta.tutorialStep ?? 0) < targetStep) currentMeta = { ...currentMeta, tutorialStep: targetStep };
  if (!tutorialPanel?.hidden) renderTutorial();
  if (tutorialPanel?.hidden && !currentMeta.tutorialCompleted) openTutorial();
}

function advanceTutorial() {
  const next = (currentMeta.tutorialStep ?? 0) + 1;
  if (next >= tutorialSteps.length) {
    completeTutorial();
    return;
  }
  currentMeta = { ...currentMeta, tutorialStep: next };
  persistState();
  renderTutorial();
  playFeedback("select");
}

function completeTutorial() {
  currentMeta = { ...currentMeta, tutorialStep: tutorialSteps.length - 1, tutorialCompleted: true };
  if (tutorialPanel) tutorialPanel.hidden = true;
  persistState();
  showToast("관제 교육을 완료했습니다");
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
  playFeedback("select");
}

function applySettingsToUi() {
  document.body.dataset.performance = settings.performanceMode;
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  if (soundToggle) soundToggle.checked = settings.soundEnabled;
  if (hapticsToggle) hapticsToggle.checked = settings.hapticsEnabled;
  if (performanceSelect) performanceSelect.value = settings.performanceMode;
  if (reducedMotionToggle) reducedMotionToggle.checked = settings.reducedMotion;
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
