import { evaluateBankruptcy } from "./bankruptcyEvaluator";
import type {
  DailySettlementInput,
  DailySettlementResult,
  FinanceLoan,
  SettlementEconomy,
  SettlementForecast,
} from "./financeTypes";
import { settleDailyLoans } from "./loanService";

export function calculateDailySettlement<L extends FinanceLoan>(
  source: DailySettlementInput<L>,
  options: { preview?: boolean } = {},
): DailySettlementResult<L> {
  const input = sanitizeInput(source);
  const sandbox = input.gameMode === "sandbox";
  const loanResult = sandbox
    ? { loans: input.loans.map((loan) => ({ ...loan })), interestPaid: 0, scheduledPayment: 0, principalRepaid: 0, remainingBalance: 0 }
    : settleDailyLoans(input.loans, input.gameDay, options.preview);
  const eventNet = input.eventEffects.reduce((sum, effect) => sum + finite(effect.amount), 0);
  const otherRevenue = input.otherRevenue + Math.max(0, eventNet);
  const otherExpense = Math.max(0, -eventNet);
  const revenue = {
    fare: input.fareRevenue,
    other: otherRevenue,
    total: roundMoney(input.fareRevenue + otherRevenue),
  };
  const expenses = {
    lines: input.lineMaintenanceCost,
    stations: input.stationMaintenanceCost,
    trains: input.trainMaintenanceCost,
    depots: input.depotMaintenanceCost,
    express: input.expressOperatingCost,
    construction: input.constructionCostDue,
    demolition: input.demolitionCostDue,
    reconstruction: input.reconstructionCostDue,
    loanInterest: loanResult.interestPaid,
    loanPrincipal: loanResult.principalRepaid,
    other: otherExpense,
    total: 0,
  };
  expenses.total = roundMoney(Object.entries(expenses)
    .filter(([key]) => key !== "total")
    .reduce((sum, [, value]) => sum + value, 0));
  const grossOperatingProfit = revenue.total - (
    expenses.lines + expenses.stations + expenses.trains + expenses.depots + expenses.express
  );
  const netProfit = roundMoney(revenue.total - expenses.total);
  const moneyAfter = sandbox ? 999_999_999 : roundMoney(input.currentMoney + netProfit);
  const result: DailySettlementResult<L> = {
    gameDay: input.gameDay,
    revenue,
    expenses,
    grossOperatingProfit,
    netProfit,
    moneyBefore: input.currentMoney,
    moneyAfter,
    loansAfter: loanResult.loans,
    loanBalanceAfter: sandbox ? 0 : loanResult.remainingBalance,
    principalRepaid: loanResult.principalRepaid,
    bankruptcy: evaluateBankruptcy(moneyAfter, input.bankruptcyRules.limit, sandbox),
    warnings: [],
    ledgerEntries: [
      { id: `settlement:${input.gameDay}:fare`, gameDay: input.gameDay, category: "revenue", source: "fare", amount: revenue.fare },
      { id: `settlement:${input.gameDay}:expenses`, gameDay: input.gameDay, category: "expense", source: "daily", amount: expenses.total },
    ],
  };
  validateDailySettlement(result);
  return result;
}

export function validateDailySettlement(result: DailySettlementResult) {
  const numbers = [
    result.gameDay, result.revenue.total, result.expenses.total, result.netProfit,
    result.moneyBefore, result.moneyAfter, result.loanBalanceAfter, result.principalRepaid,
  ];
  if (!numbers.every(Number.isFinite)) throw new Error("Daily settlement contains an invalid number");
  if (result.gameDay < 0 || result.expenses.total < 0 || result.revenue.total < 0 || result.loanBalanceAfter < 0) {
    throw new Error("Daily settlement contains a negative invariant");
  }
  // 합계는 0.01억 단위로 반올림하므로 그 안의 오차는 허용한다.
  if (Math.abs(result.revenue.total - (result.revenue.fare + result.revenue.other)) > 0.005) throw new Error("Revenue total mismatch");
  return result;
}

export function applyDailySettlement<
  E extends SettlementEconomy,
  L extends FinanceLoan,
  R extends { day: number },
>(state: { economy: E; loans: readonly L[]; records: readonly R[] }, result: DailySettlementResult<L>, record: R) {
  validateDailySettlement(result);
  if (state.records.some((item) => item.day === result.gameDay)) {
    return { economy: { ...state.economy }, loans: state.loans.map((loan) => ({ ...loan })), records: [...state.records], applied: false };
  }
  return {
    economy: {
      ...state.economy,
      cash: result.moneyAfter,
      revenue: result.revenue.total,
      maintenance: result.expenses.lines + result.expenses.stations + result.expenses.trains + result.expenses.depots + result.expenses.express,
      loanBalance: result.loanBalanceAfter,
    },
    loans: result.loansAfter.map((loan) => ({ ...loan })),
    records: [...state.records, record],
    applied: true,
  };
}

export class DailySettlementService {
  calculate<L extends FinanceLoan>(input: DailySettlementInput<L>, options: { preview?: boolean } = {}) {
    return calculateDailySettlement(input, options);
  }

  validate(result: DailySettlementResult) {
    return validateDailySettlement(result);
  }

  apply<E extends SettlementEconomy, L extends FinanceLoan, R extends { day: number }>(
    state: { economy: E; loans: readonly L[]; records: readonly R[] },
    result: DailySettlementResult<L>,
    record: R,
  ) {
    return applyDailySettlement(state, result, record);
  }
}

export function calculateAtomicDailySettlement<E extends SettlementEconomy, L extends FinanceLoan>(input: {
  economy: E;
  loans: readonly L[];
  forecast: SettlementForecast;
  maintenance: number;
  sandbox: boolean;
}) {
  const result = calculateDailySettlement({
    gameDay: Number.MAX_SAFE_INTEGER,
    gameMode: input.sandbox ? "sandbox" : "career",
    currentMoney: input.economy.cash,
    fareRevenue: input.forecast.revenue,
    otherRevenue: 0,
    lineMaintenanceCost: 0,
    stationMaintenanceCost: 0,
    trainMaintenanceCost: input.maintenance,
    depotMaintenanceCost: 0,
    expressOperatingCost: 0,
    constructionCostDue: 0,
    demolitionCostDue: 0,
    reconstructionCostDue: 0,
    loans: input.loans,
    eventEffects: [],
    bankruptcyRules: { limit: Number.NEGATIVE_INFINITY },
  });
  return {
    economy: {
      ...input.economy,
      cash: result.moneyAfter,
      revenue: result.revenue.total,
      maintenance: input.maintenance,
      satisfaction: Math.max(0, Math.min(100, Math.round(finite(input.forecast.satisfaction)))),
      loanBalance: result.loanBalanceAfter,
    },
    loans: result.loansAfter,
    principalRepaid: result.principalRepaid,
  };
}

function sanitizeInput<L extends FinanceLoan>(input: DailySettlementInput<L>): DailySettlementInput<L> {
  // 금액은 0.01억(100만 원) 단위. 1억 단위로 반올림하면 작은 노선망의 운영비·운임 외 수입이 통째로 사라진다.
  const cost = (value: number) => Math.max(0, roundMoney(finite(value)));
  return {
    ...input,
    gameDay: cost(input.gameDay),
    currentMoney: finite(input.currentMoney),
    fareRevenue: cost(input.fareRevenue),
    otherRevenue: cost(input.otherRevenue),
    lineMaintenanceCost: cost(input.lineMaintenanceCost),
    stationMaintenanceCost: cost(input.stationMaintenanceCost),
    trainMaintenanceCost: cost(input.trainMaintenanceCost),
    depotMaintenanceCost: cost(input.depotMaintenanceCost),
    expressOperatingCost: cost(input.expressOperatingCost),
    constructionCostDue: cost(input.constructionCostDue),
    demolitionCostDue: cost(input.demolitionCostDue),
    reconstructionCostDue: cost(input.reconstructionCostDue),
    loans: input.loans.map((loan) => ({ ...loan, balance: cost(loan.balance) })),
    eventEffects: input.eventEffects.map((effect) => ({ ...effect, amount: finite(effect.amount) })),
    bankruptcyRules: { limit: finite(input.bankruptcyRules.limit) },
  };
}

/** 0.01억 단위 반올림 */
function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}
