import type { RuntimeUpdateRequest, SimulationTickResult } from "./runtimeTypes.ts";
import type { UpdateDomain } from "../updateScheduler.ts";

export interface SimulationApplicationContext {
  settleDay(result: SimulationTickResult): void;
  requestRenderDomains(domains: readonly UpdateDomain[]): void;
  pauseSimulation(): void;
  reportRuntimeError(error: unknown): void;
  showRuntimeError(): void;
  dispatchSettlement(result: SimulationSettlementResult): void;
  reportSettlementFailure(error: unknown): void;
}

export interface SimulationSettlementResult {
  status: "applied" | "already-settled" | "failed";
  applied: boolean;
  error?: unknown;
}

/** Coordinates simulation results with existing application side effects. */
export class SimulationApplicationOrchestrator<TSettlementResult extends SimulationSettlementResult = SimulationSettlementResult> {
  constructor(private readonly context: SimulationApplicationContext) {}

  handleGameDayChanged(result: SimulationTickResult): void {
    this.context.settleDay(result);
  }

  handleRenderRequest(request: RuntimeUpdateRequest): void {
    this.context.requestRenderDomains(request.domains);
  }

  handleRuntimeError(error: unknown): void {
    this.context.reportRuntimeError(error);
    this.context.pauseSimulation();
    this.context.showRuntimeError();
  }

  handleSettlementResult(result: TSettlementResult): void {
    if (result.status === "failed") {
      this.context.reportSettlementFailure(result.error);
      return;
    }
    if (result.applied) this.context.dispatchSettlement(result);
  }
}
