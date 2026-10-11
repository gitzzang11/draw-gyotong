import { describe, expect, it } from "vitest";
import { constructionSubsidy, constructionSubsidyRates, payableConstructionCost } from "../src/domain/constructionSubsidy";

describe("construction subsidy by difficulty", () => {
  it("gives easier difficulties a higher share", () => {
    expect(constructionSubsidyRates.easy).toBeGreaterThan(constructionSubsidyRates.normal);
    expect(constructionSubsidyRates.normal).toBeGreaterThan(constructionSubsidyRates.hard);
  });

  it("splits a cost into subsidy and the company's share at 0.01억 precision", () => {
    expect(constructionSubsidy(1_000, constructionSubsidyRates.normal)).toBe(400);
    expect(payableConstructionCost(1_000, constructionSubsidyRates.normal)).toBe(600);
    expect(payableConstructionCost(333.33, 0.25)).toBe(250);
    expect(constructionSubsidy(333.33, 0.25) + payableConstructionCost(333.33, 0.25)).toBeCloseTo(333.33, 6);
  });

  it("does not subsidize refunds, zero costs or a zero rate", () => {
    expect(payableConstructionCost(-200, 0.4)).toBe(-200);
    expect(constructionSubsidy(0, 0.4)).toBe(0);
    expect(payableConstructionCost(500, 0)).toBe(500);
  });
});
