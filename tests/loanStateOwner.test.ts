import { describe, expect, it } from "vitest";
import type { Loan } from "../src/domain/financeStateTypes";
import { LoanStateOwner } from "../src/simulation/finance/loanStateOwner";

const loan = (id: string, balance: number): Loan => ({
  id,
  principal: balance,
  balance,
  interestRate: 0.05,
  monthlyPayment: 720,
});

describe("LoanStateOwner", () => {
  it("owns loan additions and outstanding-loan lookup", () => {
    const owner = new LoanStateOwner();

    owner.add(loan("paid", 0));
    owner.add(loan("active", 10_000));

    expect(owner.firstOutstanding()).toEqual(loan("active", 10_000));
    expect(owner.current.map((item) => item.id)).toEqual(["paid", "active"]);
  });

  it("supports explicit replacement for repayment and settlement results", () => {
    const owner = new LoanStateOwner();
    owner.replace([loan("a", 10_000), loan("b", 5_000)]);

    owner.replace(owner.current.map((item) => ({ ...item, balance: item.balance / 2 })));

    expect(owner.current.map((item) => item.balance)).toEqual([5_000, 2_500]);
  });

  it("restores an explicit rollback snapshot", () => {
    const owner = new LoanStateOwner();
    owner.replace([loan("a", 10_000)]);
    owner.reset();
    owner.restore([loan("a", 10_000)]);
    expect(owner.current).toEqual([loan("a", 10_000)]);
  });
});
