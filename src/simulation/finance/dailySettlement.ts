import type { FinanceLoan, SettlementEconomy, SettlementForecast } from "./financeTypes";
import { settleDailyLoans } from "./loanService";

export function calculateAtomicDailySettlement<E extends SettlementEconomy, L extends FinanceLoan>(input: {
  economy: E;
  loans: readonly L[];
  forecast: SettlementForecast;
  maintenance: number;
  sandbox: boolean;
}) {
  const loanResult = settleDailyLoans(input.loans);
  const cash = input.sandbox ? 999_999_999 : Math.round(input.economy.cash + finite(input.forecast.netProfit));
  const economy: E = {
    ...input.economy,
    cash,
    revenue: Math.max(0, Math.round(finite(input.forecast.revenue))),
    maintenance: Math.max(0, Math.round(finite(input.maintenance))),
    satisfaction: clamp(Math.round(finite(input.forecast.satisfaction)), 0, 100),
    loanBalance: loanResult.remainingBalance,
  };
  return { economy, loans: loanResult.loans, principalRepaid: loanResult.principalRepaid };
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
