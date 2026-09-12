export type DiagramPoint = {
  x: number;
  y: number;
};

export type MetroDiagramState = {
  autoPositions: Record<string, DiagramPoint>;
  manualPositions: Record<string, DiagramPoint>;
  background: "dark" | "light" | "blueprint";
  showStationNames: boolean;
  showCompanyInfo: boolean;
  selectedRouteId: string;
  layoutVersion: number;
  networkSignature: string;
};

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

export function normalizeMetroDiagramState(state?: MetroDiagramState): MetroDiagramState {
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
