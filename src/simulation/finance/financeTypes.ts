export interface FinanceLoan {
  id: string;
  balance: number;
  interestRate: number;
  monthlyPayment: number;
  lastInterestAppliedDay?: number;
}

export interface SettlementEconomy {
  cash: number;
  revenue: number;
  maintenance: number;
  satisfaction: number;
  loanBalance: number;
}

export interface SettlementForecast {
  revenue: number;
  expenses: number;
  netProfit: number;
  satisfaction: number;
  crowding: number;
  waitMin: number;
}

export interface FinanceEventEffect {
  id: string;
  amount: number;
}

export interface BankruptcyRules {
  limit: number;
}

export interface DailySettlementInput<L extends FinanceLoan = FinanceLoan> {
  gameDay: number;
  gameMode: "career" | "sandbox";
  currentMoney: number;
  fareRevenue: number;
  otherRevenue: number;
  lineMaintenanceCost: number;
  stationMaintenanceCost: number;
  trainMaintenanceCost: number;
  depotMaintenanceCost: number;
  expressOperatingCost: number;
  constructionCostDue: number;
  demolitionCostDue: number;
  reconstructionCostDue: number;
  loans: readonly L[];
  eventEffects: readonly FinanceEventEffect[];
  bankruptcyRules: BankruptcyRules;
}

export interface RevenueBreakdown {
  fare: number;
  other: number;
  total: number;
}

export interface ExpenseBreakdown {
  lines: number;
  stations: number;
  trains: number;
  depots: number;
  express: number;
  construction: number;
  demolition: number;
  reconstruction: number;
  loanInterest: number;
  loanPrincipal: number;
  other: number;
  total: number;
}

export interface BankruptcyEvaluation {
  isBankrupt: boolean;
  reason?: string;
  debtAmount: number;
}

export interface LedgerEntry {
  id: string;
  gameDay: number;
  category: "revenue" | "expense";
  source: string;
  amount: number;
}

export interface DailySettlementResult<L extends FinanceLoan = FinanceLoan> {
  gameDay: number;
  revenue: RevenueBreakdown;
  expenses: ExpenseBreakdown;
  grossOperatingProfit: number;
  netProfit: number;
  moneyBefore: number;
  moneyAfter: number;
  loansAfter: L[];
  loanBalanceAfter: number;
  principalRepaid: number;
  bankruptcy: BankruptcyEvaluation;
  warnings: string[];
  ledgerEntries: LedgerEntry[];
}
