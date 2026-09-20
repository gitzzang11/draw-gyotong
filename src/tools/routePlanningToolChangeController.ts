import { RoutePlanningController } from "./routePlanningController";
import type { RoutePlanningSession } from "../routePlanning";

export type RoutePlanningToolChangeCallbacks<TTool> = {
  saveDraft: (session: RoutePlanningSession) => void;
  closeDialog: () => void;
  changeTool: (tool: TTool) => void;
  notifyDraftSaved: () => void;
};

/** Coordinates the two explicit choices for a pending route-planning tool change. */
export class RoutePlanningToolChangeController<TTool> {
  constructor(
    private readonly planning: RoutePlanningController<TTool>,
    private readonly callbacks: RoutePlanningToolChangeCallbacks<TTool>,
  ) {}

  cancelAndChange() {
    const nextTool = this.planning.pendingToolChange;
    if (!nextTool) return false;
    this.planning.cancel();
    this.planning.runBypassingToolChangeGuard(() => this.callbacks.changeTool(nextTool));
    return true;
  }

  saveDraftAndChange() {
    const session = this.planning.session;
    const nextTool = this.planning.pendingToolChange;
    if (!session || !nextTool) return false;

    this.callbacks.saveDraft(session);
    this.callbacks.closeDialog();
    this.planning.runBypassingToolChangeGuard(() => this.callbacks.changeTool(nextTool));
    this.callbacks.notifyDraftSaved();
    return true;
  }
}
