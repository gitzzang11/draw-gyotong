import type { FinanceLoan } from "./financeTypes";

export function settleDailyLoans<T extends FinanceLoan>(loans: readonly T[]) {
  let interestPaid = 0;
  let scheduledPayment = 0;
  let principalRepaid = 0;
  const nextLoans = loans.map((loan) => {
    const interest = finite(Math.max(0, loan.balance * (loan.interestRate / 365)));
    const payment = finite(Math.max(0, loan.monthlyPayment / 30));
    const principal = Math.min(loan.balance, Math.max(0, payment - interest));
    interestPaid += interest;
    scheduledPayment += payment;
    principalRepaid += principal;
    return { ...loan, balance: Math.max(0, Math.round(loan.balance - principal)) };
  }).filter((loan) => loan.balance > 0);
  return {
    loans: nextLoans,
    interestPaid,
    scheduledPayment,
    principalRepaid: Math.round(principalRepaid),
    remainingBalance: Math.round(nextLoans.reduce((sum, loan) => sum + loan.balance, 0)),
  };
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}
