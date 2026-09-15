import type { EconomyState, StatisticsState } from "./financeStateTypes.ts";

export class FinanceState {
  private economyState: EconomyState;
  private statisticsState: StatisticsState;

  constructor(economy: EconomyState, statistics: StatisticsState) {
    this.economyState = economy;
    this.statisticsState = statistics;
  }

  get economy(): EconomyState {
    return this.economyState;
  }

  set economy(economy: EconomyState) {
    this.replaceEconomy(economy);
  }

  get statistics(): StatisticsState {
    return this.statisticsState;
  }

  set statistics(statistics: StatisticsState) {
    this.replaceStatistics(statistics);
  }

  replaceEconomy(economy: EconomyState): EconomyState {
    this.economyState = economy;
    return this.economyState;
  }

  replaceStatistics(statistics: StatisticsState): StatisticsState {
    this.statisticsState = statistics;
    return this.statisticsState;
  }

  replace(state: { economy: EconomyState; statistics: StatisticsState }): void {
    this.replaceEconomy(state.economy);
    this.replaceStatistics(state.statistics);
  }

  reset(defaultEconomy: EconomyState, defaultStatistics: StatisticsState): void {
    this.replace({ economy: defaultEconomy, statistics: defaultStatistics });
  }

  snapshot(): { economy: EconomyState; statistics: StatisticsState } {
    return {
      economy: { ...this.economyState },
      statistics: { ...this.statisticsState, dailyRecords: this.statisticsState.dailyRecords.map((record) => ({ ...record })) },
    };
  }
}
