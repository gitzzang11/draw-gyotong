import type { FinanceLoan } from "./financeTypes";

export function settleDailyLoans<T extends FinanceLoan>(
  loans: readonly T[],
  gameDay = Number.MAX_SAFE_INTEGER,
  preview = false,
) {
  let interestPaid = 0;
  let scheduledPayment = 0;
  let principalRepaid = 0;
  const nextLoans = loans.map((loan) => {
    if ((loan.lastInterestAppliedDay ?? -1) >= gameDay) return { ...loan };
    const interest = finite(Math.max(0, loan.balance * (loan.interestRate / 365)));
    const payment = Math.min(loan.balance + interest, finite(Math.max(0, loan.monthlyPayment / 30)));
    const principal = Math.min(loan.balance, Math.max(0, payment - interest));
    interestPaid += interest;
    scheduledPayment += payment;
    principalRepaid += principal;
    return {
      ...loan,
      balance: Math.max(0, Math.round(loan.balance - principal)),
      lastInterestAppliedDay: preview ? loan.lastInterestAppliedDay : gameDay,
    };
  }).filter((loan) => loan.balance > 0);
  return {
    loans: nextLoans,
    interestPaid: round(interestPaid),
    scheduledPayment: round(scheduledPayment),
    principalRepaid: round(principalRepaid),
    remainingBalance: round(nextLoans.reduce((sum, loan) => sum + loan.balance, 0)),
  };
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function round(value: number) {
  return Math.max(0, Math.round(finite(value)));
}
