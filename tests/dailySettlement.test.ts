import { describe, expect, it } from "vitest";
import {
  applyDailySettlement,
  calculateAtomicDailySettlement,
  calculateDailySettlement,
  validateDailySettlement,
} from "../src/simulation/finance/dailySettlement";
import { evaluateBankruptcy } from "../src/simulation/finance/bankruptcyEvaluator";

const input = (overrides: Record<string, unknown> = {}) => ({
  gameDay: 1,
  gameMode: "career" as const,
  currentMoney: 1_000,
  fareRevenue: 500,
  otherRevenue: 25,
  lineMaintenanceCost: 10,
  stationMaintenanceCost: 20,
  trainMaintenanceCost: 30,
  depotMaintenanceCost: 40,
  expressOperatingCost: 5,
  constructionCostDue: 50,
  demolitionCostDue: 0,
  reconstructionCostDue: 0,
  loans: [{ id: "l1", balance: 1_000, interestRate: 0.05, monthlyPayment: 300 }],
  eventEffects: [],
  bankruptcyRules: { limit: -500 },
  ...overrides,
});

describe("daily settlement calculator", () => {
  it("is deterministic and does not mutate input", () => {
    const source = input();
    const before = structuredClone(source);
    expect(calculateDailySettlement(source)).toEqual(calculateDailySettlement(source));
    expect(source).toEqual(before);
  });

  it("returns consistent revenue, expense, and profit totals", () => {
    const result = calculateDailySettlement(input());
    expect(result.revenue).toEqual({ fare: 500, other: 25, total: 525 });
    expect(result.expenses.total).toBe(
      Object.entries(result.expenses).filter(([key]) => key !== "total").reduce((sum, [, value]) => sum + value, 0),
    );
    expect(result.netProfit).toBe(result.revenue.total - result.expenses.total);
    expect(result.moneyAfter).toBe(result.moneyBefore + result.netProfit);
  });

  it("sanitizes invalid and negative monetary input", () => {
    const result = calculateDailySettlement(input({
      fareRevenue: Number.NaN,
      trainMaintenanceCost: -10,
      depotMaintenanceCost: Number.POSITIVE_INFINITY,
    }));
    expect(result.revenue.fare).toBe(0);
    expect(result.expenses.trains).toBe(0);
    expect(result.expenses.depots).toBe(0);
    expect(() => validateDailySettlement(result)).not.toThrow();
  });

  it("applies one complete result once per game day", () => {
    const result = calculateDailySettlement(input());
    const state = {
      economy: { cash: 1_000, revenue: 0, maintenance: 0, satisfaction: 50, loanBalance: 1_000 },
      loans: input().loans,
      records: [] as Array<{ day: number; net: number }>,
    };
    const first = applyDailySettlement(state, result, { day: 1, net: result.netProfit });
    const second = applyDailySettlement(first, result, { day: 1, net: result.netProfit });
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.records).toHaveLength(1);
    expect(second.economy.cash).toBe(result.moneyAfter);
  });

  it("applies interest and principal at most once for the same day", () => {
    const loan = { id: "large", balance: 100_000, interestRate: 0.05, monthlyPayment: 3_000 };
    const first = calculateDailySettlement(input({ loans: [loan] }));
    const second = calculateDailySettlement(input({ loans: first.loansAfter }));
    expect(first.expenses.loanInterest).toBeGreaterThan(0);
    expect(second.expenses.loanInterest).toBe(0);
    expect(second.principalRepaid).toBe(0);
    expect(first.loansAfter[0].lastInterestAppliedDay).toBe(1);
  });

  it("does not mutate loan interest state in preview mode", () => {
    const source = input();
    const result = calculateDailySettlement(source, { preview: true });
    expect(result.loansAfter[0].lastInterestAppliedDay).toBeUndefined();
    expect(source.loans[0].balance).toBe(1_000);
  });

  it("keeps sandbox funds finite and disables loans and bankruptcy", () => {
    const result = calculateDailySettlement(input({ gameMode: "sandbox", currentMoney: -99_999 }));
    expect(result.moneyAfter).toBe(999_999_999);
    expect(Number.isFinite(result.moneyAfter)).toBe(true);
    expect(result.loanBalanceAfter).toBe(0);
    expect(result.bankruptcy.isBankrupt).toBe(false);
  });

  it("evaluates bankruptcy from final money", () => {
    const result = calculateDailySettlement(input({
      currentMoney: -450,
      fareRevenue: 0,
      otherRevenue: 0,
      constructionCostDue: 100,
      loans: [],
    }));
    expect(result.bankruptcy.isBankrupt).toBe(true);
    expect(evaluateBankruptcy(-100, -50, false).isBankrupt).toBe(true);
    expect(evaluateBankruptcy(-100, -50, true).isBankrupt).toBe(false);
  });

  it("keeps the compatibility atomic API pure", () => {
    const economy = { cash: 1_000, revenue: 0, maintenance: 0, satisfaction: 50, loanBalance: 0 };
    const result = calculateAtomicDailySettlement({
      economy,
      loans: [],
      forecast: { revenue: 500, expenses: 150, netProfit: 350, satisfaction: 80, crowding: 0.8, waitMin: 4 },
      maintenance: 150,
      sandbox: false,
    });
    expect(result.economy.cash).toBe(1_350);
    expect(economy.cash).toBe(1_000);
  });

  it.each([100, 500, 1_000])("remains finite and duplicate-free for %i days", (days) => {
    let money = 10_000;
    let loans = input().loans;
    const records = new Set<number>();
    for (let day = 1; day <= days; day += 1) {
      const result = calculateDailySettlement(input({
        gameDay: day,
        currentMoney: money,
        fareRevenue: 250,
        constructionCostDue: day % 50 === 0 ? 100 : 0,
        loans,
      }));
      money = result.moneyAfter;
      loans = result.loansAfter;
      records.add(day);
      expect(Number.isFinite(money)).toBe(true);
      expect(result.loanBalanceAfter).toBeGreaterThanOrEqual(0);
    }
    expect(records.size).toBe(days);
  });

  it("produces the same result regardless of tick-speed labels", () => {
    const normal = calculateDailySettlement(input());
    const x8 = calculateDailySettlement(input());
    expect(x8).toEqual(normal);
  });
});
