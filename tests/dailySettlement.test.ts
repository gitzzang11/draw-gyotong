import { describe, expect, it } from "vitest";
import { calculateAtomicDailySettlement } from "../src/simulation/finance/dailySettlement";
import { evaluateBankruptcy } from "../src/simulation/finance/bankruptcyEvaluator";

describe("atomic daily settlement", () => {
  it("returns a complete next state without mutating its input", () => {
    const economy = { cash: 1_000, revenue: 0, maintenance: 0, satisfaction: 50, loanBalance: 1_000 };
    const loans = [{ id: "l1", balance: 1_000, interestRate: 0.05, monthlyPayment: 300 }];
    const result = calculateAtomicDailySettlement({
      economy,
      loans,
      forecast: { revenue: 500, expenses: 200, netProfit: 300, satisfaction: 80, crowding: 0.8, waitMin: 4 },
      maintenance: 150,
      sandbox: false,
    });
    expect(result.economy.cash).toBe(1_300);
    expect(result.loans[0].balance).toBeLessThan(1_000);
    expect(economy.cash).toBe(1_000);
    expect(loans[0].balance).toBe(1_000);
  });

  it("isolates sandbox funds and evaluates bankruptcy", () => {
    const result = calculateAtomicDailySettlement({
      economy: { cash: -99, revenue: 0, maintenance: 0, satisfaction: 50, loanBalance: 0 },
      loans: [],
      forecast: { revenue: 0, expenses: 0, netProfit: 0, satisfaction: 50, crowding: 0, waitMin: 0 },
      maintenance: 0,
      sandbox: true,
    });
    expect(result.economy.cash).toBe(999_999_999);
    expect(evaluateBankruptcy(-100, -50, false)).toBe(true);
    expect(evaluateBankruptcy(-100, -50, true)).toBe(false);
  });
});
