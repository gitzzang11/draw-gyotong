import { describe, expect, it } from "vitest";
import type { EconomyState, StatisticsState } from "../src/domain/financeStateTypes";
import { FinanceState } from "../src/domain/financeState";

const economy: EconomyState = {
  cash: 100,
  fare: 1200,
  autoFare: false,
  revenue: 0,
  maintenance: 0,
  constructionSpent: 0,
  trainSpent: 0,
  loanBalance: 0,
  satisfaction: 80,
  demand: 0,
};
const statistics: StatisticsState = { totalPassengers: 0, totalLoanRepaid: 0, dailyRecords: [] };

describe("FinanceState", () => {
  it("replaces and snapshots economy and statistics together", () => {
    const state = new FinanceState(economy, statistics);
    state.replace({ economy: { ...economy, cash: 75 }, statistics: { ...statistics, totalPassengers: 12 } });

    expect(state.economy.cash).toBe(75);
    expect(state.statistics.totalPassengers).toBe(12);
    expect(state.snapshot()).toEqual({
      economy: { ...economy, cash: 75 },
      statistics: { ...statistics, totalPassengers: 12 },
    });
  });

  it("resets both finance collections to supplied defaults", () => {
    const state = new FinanceState({ ...economy, cash: 5 }, { ...statistics, totalPassengers: 9 });
    state.reset(economy, statistics);
    expect(state.snapshot()).toEqual({ economy, statistics });
  });
});
