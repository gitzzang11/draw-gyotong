import {
  cancelRoutePlanning,
  createRoutePlanningSession,
  transitionRoutePlanning,
  type RoutePlanningSession,
  type RoutePlanningStage,
  type RoutePlanningTool,
} from "../routePlanning";

type RoutePlanningPatch = Partial<Omit<RoutePlanningSession, "id" | "tool" | "stage">>;
type RoutePlanningCoordinates = RoutePlanningSession["draftCoordinates"];
type RoutePlanningCoordinatesInput = RoutePlanningCoordinates | (() => RoutePlanningCoordinates);

const inactiveStages: RoutePlanningStage[] = ["idle", "selecting-source", "completed", "cancelled"];

export class RoutePlanningController<TToolChange> {
  private currentSession: RoutePlanningSession | null = null;
  private requestedToolChange: TToolChange | null = null;
  private bypassToolChangeGuard = false;

  get session() {
    return this.currentSession;
  }

  get pendingToolChange() {
    return this.requestedToolChange;
  }

  start(tool: RoutePlanningTool, id: string) {
    this.currentSession = createRoutePlanningSession(tool, id);
    return this.currentSession;
  }

  replace(session: RoutePlanningSession | null) {
    this.currentSession = session;
    return this.currentSession;
  }

  transition(stage: RoutePlanningStage, patch: RoutePlanningPatch = {}) {
    if (!this.currentSession) return null;
    this.currentSession = transitionRoutePlanning(this.currentSession, stage, patch);
    return this.currentSession;
  }

  beginDrawing(patch: RoutePlanningPatch = {}) {
    if (this.currentSession?.stage !== "selecting-source") return this.currentSession;
    return this.transition("drawing", patch);
  }

  updateDraftCoordinates(input: RoutePlanningCoordinatesInput) {
    if (this.currentSession?.stage !== "drawing") return this.currentSession;
    const draftCoordinates = typeof input === "function" ? input() : input;
    return this.replace({ ...this.currentSession, draftCoordinates });
  }

  finishDrawing(input: RoutePlanningCoordinatesInput) {
    if (this.currentSession?.stage !== "drawing") return this.currentSession;
    const draftCoordinates = typeof input === "function" ? input() : input;
    return this.transition("reviewing", { draftCoordinates });
  }

  connectionTargetMissed() {
    if (this.currentSession?.tool !== "connect" || this.currentSession.stage !== "drawing") {
      return this.currentSession;
    }
    return this.transition("selecting-target");
  }

  reviewConnection(patch: RoutePlanningPatch) {
    if (this.currentSession?.tool !== "connect") return this.currentSession;
    if (this.currentSession.stage === "drawing") this.transition("selecting-target");
    if (this.currentSession?.stage !== "selecting-target") return this.currentSession;
    return this.transition("reviewing", patch);
  }

  cancel() {
    if (!this.currentSession) return null;
    this.currentSession = cancelRoutePlanning(this.currentSession);
    return this.currentSession;
  }

  shouldConfirmToolChange(nextTool: RoutePlanningTool | null) {
    const session = this.currentSession;
    return Boolean(
      !this.bypassToolChangeGuard &&
      session &&
      session.tool !== nextTool &&
      !inactiveStages.includes(session.stage),
    );
  }

  requestToolChange(tool: TToolChange) {
    this.requestedToolChange = tool;
  }

  clearPendingToolChange() {
    this.requestedToolChange = null;
  }

  runBypassingToolChangeGuard(callback: () => void) {
    this.bypassToolChangeGuard = true;
    try {
      callback();
    } finally {
      this.bypassToolChangeGuard = false;
    }
  }

  reset() {
    this.currentSession = null;
    this.requestedToolChange = null;
    this.bypassToolChangeGuard = false;
  }
}
