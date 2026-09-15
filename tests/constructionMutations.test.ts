import { describe, expect, it } from "vitest";
import type { ConstructionPlan } from "../src/domain/constructionTypes";
import { updateConstructionPlan } from "../src/domain/constructionMutations";

const plan = (id: string, remainingCost = 10): ConstructionPlan => ({
  id,
  name: id,
  cityId: "seoul",
  routes: [],
  stations: [],
  depots: [],
  transfers: [],
  expectedTotalCost: remainingCost,
  remainingCost,
  expectedConstructionDays: 1,
  expectedDemand: 0,
  expectedRevenue: 0,
  terrainDifficulty: 1,
  transferEffect: 0,
  createdAt: 0,
  priority: "normal",
  notes: "",
  status: "draft",
});

describe("updateConstructionPlan", () => {
  it("updates only the requested plan and applies the supplied recalculation", () => {
    const plans = [plan("one"), plan("two")];

    expect(updateConstructionPlan(
      plans,
      "two",
      (value) => ({ ...value, remainingCost: 5 }),
      (value) => ({ ...value, expectedTotalCost: value.remainingCost * 2 }),
    )).toEqual([plans[0], { ...plans[1], remainingCost: 5, expectedTotalCost: 10 }]);
  });
});
