import type { Loan } from "../../domain/financeStateTypes";

export class LoanStateOwner {
  private loans: Loan[] = [];

  get current() {
    return this.loans;
  }

  replace(loans: Loan[]) {
    this.loans = loans;
    return this.loans;
  }

  add(loan: Loan) {
    this.loans = [...this.loans, loan];
    return loan;
  }

  firstOutstanding() {
    return this.loans.find((loan) => loan.balance > 0);
  }

  restore(snapshot: Loan[]) {
    this.loans = snapshot;
  }

  reset() {
    this.loans = [];
  }
}
