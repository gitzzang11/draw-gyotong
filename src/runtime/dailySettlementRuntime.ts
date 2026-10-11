import type { ConstructionProject } from "../domain/constructionTypes.ts";
import type { DailyStatisticsRecord, EconomyState, Loan, StatisticsState } from "../domain/financeStateTypes.ts";
import type { PassengerGroup } from "../domain/simulationStateTypes.ts";
import type { StationDemandState } from "../demandModel.ts";
import type { DailySettlementResult } from "../simulation/finance/financeTypes.ts";
import type { DailySettlementService } from "../simulation/finance/dailySettlement.ts";
import type { UpdateDomain } from "../updateScheduler.ts";

export interface SettlementForecast {
  revenue: number;
  demand: number;
  satisfaction: number;
  crowding: number;
  waitMin: number;
}

export interface SettlementPreparation {
  forecast: SettlementForecast;
  /** 운임 외 수입(역 상가·광고 등) */
  otherRevenue?: number;
  maintenance: { trains: number; depots: number; express: number };
  constructionCostDue: number;
  financesBefore: { transitShare: number; assets: number };
  totalPotential: number;
  totalRealized: number;
}

export interface SettlementAuxiliarySnapshot<TAnalysis, TMeta> {
  analysis: TAnalysis;
  meta: TMeta;
  constructionProjects: ConstructionProject[];
  stationDemandStates: StationDemandState[];
}

export interface DailySettlementRuntimeContext<TAnalysis, TMeta, TNews = unknown> {
  service: DailySettlementService;
  getGameDay(): number;
  getLastSettledGameDay(): number;
  hasDailyRecord(day: number): boolean;
  getGameMode(): "career" | "sandbox";
  getBankruptcyLimit(): number;
  getEconomy(): EconomyState;
  getLoans(): Loan[];
  getStatistics(): StatisticsState;
  getPassengerGroups(): PassengerGroup[];
  captureAuxiliary(): SettlementAuxiliarySnapshot<TAnalysis, TMeta>;
  restoreState(state: {
    economy: EconomyState;
    loans: Loan[];
    statistics: StatisticsState;
    passengerGroups: PassengerGroup[];
    auxiliary: SettlementAuxiliarySnapshot<TAnalysis, TMeta>;
  }): void;
  prepareDay(day: number): SettlementPreparation;
  applyCommittedState(state: {
    economy: EconomyState;
    loans: Loan[];
    statistics: StatisticsState;
  }): void;
  commitDay(day: number, bankrupt: boolean): { newsEvents: TNews[]; updateDomains?: UpdateDomain[] };
}

export type DailySettlementStatus = "applied" | "already-settled" | "failed";

export interface DailySettlementRuntimeResult<TNews = unknown> {
  status: DailySettlementStatus;
  applied: boolean;
  gameDay: number;
  settlement?: DailySettlementResult<Loan>;
  updateDomains: UpdateDomain[];
  newsEvents: TNews[];
  requiresImmediateSave: boolean;
  error?: Error;
}

export class DailySettlementRuntime<TAnalysis, TMeta, TNews = unknown> {
  private inProgress = false;

  settleDay(context: DailySettlementRuntimeContext<TAnalysis, TMeta, TNews>): DailySettlementRuntimeResult<TNews> {
    const gameDay = context.getGameDay();
    if (this.inProgress || context.getLastSettledGameDay() >= gameDay || context.hasDailyRecord(gameDay)) {
      return this.empty("already-settled", gameDay);
    }
    this.inProgress = true;
    const snapshot = {
      economy: { ...context.getEconomy() },
      loans: context.getLoans().map((loan) => ({ ...loan })),
      statistics: { ...context.getStatistics(), dailyRecords: context.getStatistics().dailyRecords.map((record) => ({ ...record })) },
      passengerGroups: context.getPassengerGroups().map((group) => ({ ...group })),
      auxiliary: context.captureAuxiliary(),
    };
    try {
      const prepared = context.prepareDay(gameDay);
      const economy = context.getEconomy();
      const statistics = context.getStatistics();
      const result = context.service.calculate({
        gameDay,
        gameMode: context.getGameMode(),
        currentMoney: economy.cash,
        fareRevenue: prepared.forecast.revenue,
        otherRevenue: prepared.otherRevenue ?? 0,
        lineMaintenanceCost: 0,
        stationMaintenanceCost: 0,
        trainMaintenanceCost: prepared.maintenance.trains,
        depotMaintenanceCost: prepared.maintenance.depots,
        expressOperatingCost: prepared.maintenance.express,
        constructionCostDue: prepared.constructionCostDue,
        demolitionCostDue: 0,
        reconstructionCostDue: 0,
        loans: context.getLoans(),
        eventEffects: [],
        bankruptcyRules: { limit: context.getBankruptcyLimit() },
      });
      context.service.validate(result);
      const record: DailyStatisticsRecord = {
        day: gameDay,
        revenue: result.revenue.total,
        expenses: result.expenses.total,
        passengers: prepared.forecast.demand,
        satisfaction: prepared.forecast.satisfaction,
        transitShare: prepared.financesBefore.transitShare,
        assets: prepared.financesBefore.assets + (result.moneyAfter - economy.cash),
        liabilities: result.loanBalanceAfter,
        crowding: prepared.forecast.crowding,
        waitMin: prepared.forecast.waitMin,
        captureRate: prepared.totalPotential > 0 ? prepared.totalRealized / prepared.totalPotential : 0,
      };
      const applied = context.service.apply(
        { economy: { ...economy, demand: prepared.forecast.demand, satisfaction: prepared.forecast.satisfaction }, loans: context.getLoans(), records: statistics.dailyRecords },
        result,
        record,
      );
      if (!applied.applied) return this.empty("already-settled", gameDay);
      context.applyCommittedState({
        economy: applied.economy,
        loans: applied.loans,
        statistics: {
          ...statistics,
          totalPassengers: statistics.totalPassengers + prepared.forecast.demand,
          totalLoanRepaid: statistics.totalLoanRepaid + result.principalRepaid,
          dailyRecords: applied.records.slice(-90),
        },
      });
      const committed = context.commitDay(gameDay, result.bankruptcy.isBankrupt);
      return {
        status: "applied",
        applied: true,
        gameDay,
        settlement: result,
        updateDomains: [...new Set<UpdateDomain>(["hud-finance", "hud-status", "active-panel", "notifications", "storage", ...(committed.updateDomains ?? [])])],
        newsEvents: committed.newsEvents,
        requiresImmediateSave: true,
      };
    } catch (cause) {
      context.restoreState(snapshot);
      const error = cause instanceof Error ? cause : new Error(String(cause));
      return { ...this.empty("failed", gameDay), error };
    } finally {
      this.inProgress = false;
    }
  }

  private empty(status: DailySettlementStatus, gameDay: number): DailySettlementRuntimeResult<TNews> {
    return { status, applied: false, gameDay, updateDomains: [], newsEvents: [], requiresImmediateSave: false };
  }
}
