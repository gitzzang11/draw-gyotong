export interface DailyFinanceInput {
  passengerDemand: number;
  fare: number;
  maintenance: number;
  loanInterest: number;
  loanPayment: number;
}

export function calculateDailyFinance(input: DailyFinanceInput) {
  const revenue = Math.max(0, Math.round(input.passengerDemand * input.fare));
  const expenses = Math.max(0, Math.round(input.maintenance + input.loanInterest + input.loanPayment));
  return { revenue, expenses, netProfit: revenue - expenses };
}
