export type DiagramPoint = {
  x: number;
  y: number;
};

export type MetroDiagramState = {
  autoPositions: Record<string, DiagramPoint>;
  manualPositions: Record<string, DiagramPoint>;
  /** "theme"은 앱 지도 테마(종이/먹)를 따른다. 나머지는 플레이어가 고른 고정 배경. */
  background: "theme" | "dark" | "light" | "blueprint";
  showStationNames: boolean;
  showCompanyInfo: boolean;
  selectedRouteId: string;
  layoutVersion: number;
  networkSignature: string;
};

const defaultDiagramState: MetroDiagramState = {
  autoPositions: {},
  manualPositions: {},
  background: "theme",
  showStationNames: true,
  showCompanyInfo: true,
  selectedRouteId: "all",
  // 4: 새 노선도 배치(src/diagram). 손으로 옮긴 위치를 화면 좌표가 아니라 칸 단위로 저장한다.
  layoutVersion: 4,
  networkSignature: "",
};

export function normalizeMetroDiagramState(state?: MetroDiagramState): MetroDiagramState {
  const version = state?.layoutVersion ?? 0;
  // 3 미만: 공개 지도 배치 시절이라 배경도 기본값으로. 4 미만: 위치 좌표계가 달라 손으로 옮긴 위치·자동 위치를 버린다.
  const usingPublicMapLayout = version < 3;
  const usingOldPositions = version < defaultDiagramState.layoutVersion;
  const background: MetroDiagramState["background"] = usingPublicMapLayout
    ? defaultDiagramState.background
    : state?.background === "dark" || state?.background === "blueprint" || state?.background === "light"
      ? state.background
      : defaultDiagramState.background;
  return {
    ...defaultDiagramState,
    ...(state ?? {}),
    background,
    layoutVersion: defaultDiagramState.layoutVersion,
    autoPositions: usingOldPositions ? {} : state?.autoPositions ?? {},
    manualPositions: usingOldPositions ? {} : state?.manualPositions ?? {},
  };
}

export class MetroDiagramStateOwner {
  private currentValue: MetroDiagramState;

  constructor(initialState?: MetroDiagramState) {
    this.currentValue = normalizeMetroDiagramState(initialState);
  }

  get current() {
    return this.currentValue;
  }

  replace(state?: MetroDiagramState) {
    this.currentValue = normalizeMetroDiagramState(state);
    return this.currentValue;
  }

  reset() {
    return this.replace();
  }

  selectRoute(selectedRouteId: string) {
    return this.patch({ selectedRouteId });
  }

  setBackground(background: MetroDiagramState["background"]) {
    return this.patch({ background });
  }

  setStationNamesVisible(showStationNames: boolean) {
    return this.patch({ showStationNames });
  }

  setCompanyInfoVisible(showCompanyInfo: boolean) {
    return this.patch({ showCompanyInfo });
  }

  setManualPosition(stationId: string, position: DiagramPoint) {
    return this.patch({ manualPositions: { ...this.currentValue.manualPositions, [stationId]: position } });
  }

  mergeManualPositions(positions: Record<string, DiagramPoint>) {
    return this.patch({ manualPositions: { ...this.currentValue.manualPositions, ...positions } });
  }

  updateLayout(
    autoPositions: Record<string, DiagramPoint>,
    manualPositions: Record<string, DiagramPoint>,
    networkSignature: string,
  ) {
    return this.patch({ autoPositions, manualPositions, networkSignature });
  }

  removeNodes(nodeIds: ReadonlySet<string>) {
    return this.patch({
      autoPositions: Object.fromEntries(
        Object.entries(this.currentValue.autoPositions).filter(([id]) => !nodeIds.has(id)),
      ),
      manualPositions: Object.fromEntries(
        Object.entries(this.currentValue.manualPositions).filter(([id]) => !nodeIds.has(id)),
      ),
      networkSignature: "",
    });
  }

  invalidateNetwork() {
    return this.patch({ networkSignature: "" });
  }

  resetLayout() {
    return this.patch({ autoPositions: {}, manualPositions: {}, networkSignature: "" });
  }

  private patch(patch: Partial<MetroDiagramState>) {
    this.currentValue = { ...this.currentValue, ...patch };
    return this.currentValue;
  }
}
