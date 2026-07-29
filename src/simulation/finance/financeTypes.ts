export interface FinanceLoan {
  id: string;
  balance: number;
  interestRate: number;
  monthlyPayment: number;
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
