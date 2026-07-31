export type RoutePlanningTool = "extend" | "connect" | "branch";
export type RoutePlanningStage =
  | "idle"
  | "selecting-source"
  | "drawing"
  | "selecting-target"
  | "reviewing"
  | "committing"
  | "completed"
  | "cancelled";

export type PlanningCoordinate = { lat: number; lng: number };
export type SnapTargetKind =
  | "line-endpoint"
  | "planned-endpoint"
  | "station"
  | "planned-station"
  | "junction"
  | "depot-connector"
  | "line-segment"
  | "empty-map";

export type SnapTarget = {
  id: string;
  entityId: string;
  kind: SnapTargetKind;
  lineId?: string;
  branchId?: string;
  endpoint?: "start" | "end";
  screenPoint: { x: number; y: number };
  coordinate: PlanningCoordinate;
  label: string;
};

export type PlanningValidationError = {
  code: string;
  message: string;
  severity: "warning" | "error";
};

export type RouteOperationPreview = {
  operation: RoutePlanningTool;
  lineId?: string;
  lengthKm: number;
  stationCount: number;
  estimatedCost: number;
  estimatedDurationDays: number;
  summary: string;
};

export type RoutePlanningSession = {
  id: string;
  tool: RoutePlanningTool;
  stage: RoutePlanningStage;
  sourceEntityId?: string;
  sourceLineId?: string;
  sourceBlueprintId?: string;
  targetEntityId?: string;
  targetLineId?: string;
  draftCoordinates: PlanningCoordinate[];
  snappedSource?: SnapTarget;
  snappedTarget?: SnapTarget;
  validationErrors: PlanningValidationError[];
  preview?: RouteOperationPreview;
};

const transitions: Record<RoutePlanningStage, RoutePlanningStage[]> = {
  idle: ["selecting-source", "cancelled"],
  "selecting-source": ["drawing", "cancelled"],
  drawing: ["selecting-target", "reviewing", "cancelled"],
  "selecting-target": ["reviewing", "drawing", "cancelled"],
  reviewing: ["drawing", "committing", "cancelled"],
  committing: ["completed", "reviewing", "cancelled"],
  completed: ["idle"],
  cancelled: ["idle"],
};

export function createRoutePlanningSession(tool: RoutePlanningTool, id = `route-planning-${Date.now()}`): RoutePlanningSession {
  return { id, tool, stage: "selecting-source", draftCoordinates: [], validationErrors: [] };
}

export function transitionRoutePlanning(
  session: RoutePlanningSession,
  stage: RoutePlanningStage,
  patch: Partial<Omit<RoutePlanningSession, "id" | "tool" | "stage">> = {},
): RoutePlanningSession {
  if (!transitions[session.stage].includes(stage)) {
    throw new Error(`Invalid route planning transition: ${session.stage} -> ${stage}`);
  }
  return { ...session, ...patch, stage };
}

export function cancelRoutePlanning(session: RoutePlanningSession): RoutePlanningSession {
  if (session.stage === "cancelled") return session;
  return {
    ...transitionRoutePlanning(session, "cancelled"),
    draftCoordinates: [],
    snappedSource: undefined,
    snappedTarget: undefined,
    preview: undefined,
    validationErrors: [],
  };
}

export function restartRoutePlanning(session: RoutePlanningSession): RoutePlanningSession {
  const cancelled = session.stage === "cancelled" ? session : cancelRoutePlanning(session);
  return transitionRoutePlanning(cancelled, "idle");
}

export function findSnapTargets(
  tool: RoutePlanningTool,
  phase: "source" | "target",
  pointer: { x: number; y: number },
  candidates: SnapTarget[],
  options: { pointerType?: "mouse" | "touch" | "pen"; source?: SnapTarget; radiusPx?: number } = {},
): SnapTarget[] {
  const radius = options.radiusPx ?? (options.pointerType === "touch" ? 56 : 36);
  const allowed = candidates.filter((candidate) => {
    if (phase === "source") {
      if (tool === "extend") return candidate.kind === "line-endpoint" || candidate.kind === "planned-endpoint";
      if (tool === "branch") return candidate.kind === "station" || candidate.kind === "planned-station" || candidate.kind === "junction";
      return candidate.kind !== "empty-map" && candidate.kind !== "line-segment";
    }
    if (options.source?.id === candidate.id) return false;
    if (tool === "extend") return candidate.kind === "empty-map";
    if (tool === "branch") return candidate.kind === "empty-map";
    return candidate.kind !== "empty-map" && candidate.kind !== "line-segment";
  });
  const unique = new Map<string, SnapTarget>();
  for (const candidate of allowed) unique.set(candidate.id, candidate);
  return [...unique.values()]
    .map((candidate) => ({
      candidate,
      distance: Math.hypot(pointer.x - candidate.screenPoint.x, pointer.y - candidate.screenPoint.y),
    }))
    .filter(({ distance }) => distance <= radius)
    .sort((a, b) => a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id))
    .map(({ candidate }) => candidate);
}

export class RoutePlanningHistory {
  private past: RoutePlanningSession[] = [];
  private future: RoutePlanningSession[] = [];
  constructor(private currentValue: RoutePlanningSession) {}
  get current() { return this.currentValue; }
  replace(next: RoutePlanningSession, record = true) {
    if (record) this.past.push(structuredClone(this.currentValue));
    this.currentValue = structuredClone(next);
    if (record) this.future = [];
    return this.currentValue;
  }
  undo() {
    const previous = this.past.pop();
    if (!previous) return this.currentValue;
    this.future.push(structuredClone(this.currentValue));
    this.currentValue = previous;
    return this.currentValue;
  }
  redo() {
    const next = this.future.pop();
    if (!next) return this.currentValue;
    this.past.push(structuredClone(this.currentValue));
    this.currentValue = next;
    return this.currentValue;
  }
}
