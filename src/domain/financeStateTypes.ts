export interface Loan {
  id: string; principal: number; balance: number; interestRate: number;
  monthlyPayment: number; lastInterestAppliedDay?: number;
}
export interface EconomyState {
  cash: number; fare: number; autoFare: boolean; revenue: number; maintenance: number;
  constructionSpent: number; trainSpent: number; loanBalance: number; satisfaction: number; demand: number;
}
export interface DailyStatisticsRecord {
  day: number; revenue: number; expenses: number; passengers: number; satisfaction: number;
  transitShare: number; assets: number; liabilities: number; crowding?: number; waitMin?: number; captureRate?: number;
}
export interface StatisticsState {
  totalPassengers: number; totalLoanRepaid: number; dailyRecords: DailyStatisticsRecord[];
}

