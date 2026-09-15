import { describe, expect, it } from "vitest";
import type { EconomyState, Loan, StatisticsState } from "../src/domain/financeStateTypes";
import type { Depot, RouteLine } from "../src/domain/networkTypes";
import { calculateNetworkFinancials } from "../src/analysis/networkFinancials";

describe("calculateNetworkFinancials", () => {
  it("preserves asset, liability, fallback forecast, and transit-share calculations", () => {
    const economy: EconomyState = {
      cash: 1_000,
      fare: 1_000,
      autoFare: true,
      revenue: 0,
      maintenance: 0,
      constructionSpent: 0,
      trainSpent: 0,
      loanBalance: 0,
      satisfaction: 80,
      demand: 200_000_000,
    };
    const routes = [{ constructionCost: 100 }] as RouteLine[];
    const depots = [{ areaHa: 2 }] as Depot[];
    const fleets = [{ purchaseCost: 1_000 }];
    const loans: Loan[] = [{ id: "loan", principal: 36_500, balance: 36_500, interestRate: 0.1, monthlyPayment: 30 }];
    const statistics: StatisticsState = { totalPassengers: 0, totalLoanRepaid: 0, dailyRecords: [] };

    expect(calculateNetworkFinancials({
      economy,
      routes,
      depots,
      fleets,
      loans,
      statistics,
      stationPotentialDemand: [250_000_000, 250_000_000],
      dailyMaintenance: 100,
    })).toEqual({
      assets: 3_700,
      liabilities: 36_500,
      dailyRevenue: 2_000,
      dailyExpenses: 111,
      monthlyRevenue: 60_000,
      monthlyExpenses: 3_330,
      transitShare: 0.4,
      loanPayment: 1,
    });
  });
});
