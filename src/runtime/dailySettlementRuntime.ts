import type { UpdateDomain } from "../updateScheduler.ts";

export interface DailySettlementRuntimeResult<TSettlement = unknown, TNews = unknown> {
  applied: boolean;
  gameDay: number;
  settlement?: TSettlement;
  updateDomains: UpdateDomain[];
  newsEvents: TNews[];
  requiresImmediateSave: boolean;
  error?: unknown;
}

export interface DailySettlementRuntimeContext<TSnapshot, TInput, TResult, TApplied, TNews> {
  getTargetDay(): number;
  wasSettled(day: number): boolean;
  capture(): TSnapshot;
  restore(snapshot: TSnapshot): void;
  finalizeDemand(day: number): void;
  buildInput(day: number): TInput;
  calculate(input: TInput): TResult;
  validate(result: TResult): void;
  apply(result: TResult): TApplied;
  wasApplied(result: TApplied): boolean;
  commit(day: number, result: TResult, applied: TApplied): TNews[];
}

export class DailySettlementRuntime<TSnapshot, TInput, TResult, TApplied, TNews = unknown> {
  private inProgress = false;

  settleDay(context: DailySettlementRuntimeContext<TSnapshot, TInput, TResult, TApplied, TNews>): DailySettlementRuntimeResult<TResult, TNews> {
    const gameDay = context.getTargetDay();
    if (this.inProgress || context.wasSettled(gameDay)) return this.empty(gameDay);
    this.inProgress = true;
    const snapshot = context.capture();
    try {
      context.finalizeDemand(gameDay);
      const settlement = context.calculate(context.buildInput(gameDay));
      context.validate(settlement);
      const applied = context.apply(settlement);
      if (!context.wasApplied(applied)) return this.empty(gameDay);
      const newsEvents = context.commit(gameDay, settlement, applied);
      return {
        applied: true,
        gameDay,
        settlement,
        updateDomains: ["hud-finance", "hud-status", "active-panel", "notifications", "storage"],
        newsEvents,
        requiresImmediateSave: true,
      };
    } catch (error) {
      context.restore(snapshot);
      return { ...this.empty(gameDay), error };
    } finally {
      this.inProgress = false;
    }
  }

  private empty(gameDay: number): DailySettlementRuntimeResult<TResult, TNews> {
    return { applied: false, gameDay, updateDomains: [], newsEvents: [], requiresImmediateSave: false };
  }
}

