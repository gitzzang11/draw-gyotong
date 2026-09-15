import type { EconomyState, Loan, StatisticsState } from "../domain/financeStateTypes";
import type { Depot, RouteLine } from "../domain/networkTypes";

type FleetAsset = Pick<{ purchaseCost: number }, "purchaseCost">;

export interface NetworkFinancialsInput {
  economy: EconomyState;
  routes: readonly RouteLine[];
  depots: readonly Depot[];
  fleets: readonly FleetAsset[];
  loans: readonly Loan[];
  statistics: StatisticsState;
  stationPotentialDemand: readonly number[];
  dailyMaintenance: number;
}

export function calculateNetworkFinancials(input: NetworkFinancialsInput) {
  const assets =
    input.economy.cash +
    input.routes.reduce((sum, route) => sum + route.constructionCost, 0) +
    input.depots.reduce((sum, depot) => sum + (depot.constructionCost ?? depot.areaHa * 900), 0) +
    input.fleets.reduce((sum, fleet) => sum + Math.round(fleet.purchaseCost * 0.8), 0);
  const liabilities = input.loans.reduce((sum, loan) => sum + loan.balance, 0);
  const dailyRevenue = input.economy.revenue || Math.round((input.economy.demand * input.economy.fare) / 100000000);
  const loanInterest = input.loans.reduce((sum, loan) => sum + loan.balance * (loan.interestRate / 365), 0);
  const loanPayment = input.loans.reduce((sum, loan) => sum + loan.monthlyPayment / 30, 0);
  const dailyExpenses = Math.round(input.dailyMaintenance + loanInterest + loanPayment);
  const recent = input.statistics.dailyRecords.slice(-30);
  const monthlyRevenue = recent.length > 0 ? recent.reduce((sum, item) => sum + item.revenue, 0) : dailyRevenue * 30;
  const monthlyExpenses = recent.length > 0 ? recent.reduce((sum, item) => sum + item.expenses, 0) : dailyExpenses * 30;
  const totalPotentialDemand = input.stationPotentialDemand.reduce((sum, demand) => sum + demand, 0);
  const transitShare = totalPotentialDemand > 0
    ? Math.min(0.98, Math.max(0, input.economy.demand / totalPotentialDemand))
    : 0;
  return { assets, liabilities, dailyRevenue, dailyExpenses, monthlyRevenue, monthlyExpenses, transitShare, loanPayment };
}
