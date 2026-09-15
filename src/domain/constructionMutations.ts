import type { ConstructionPlan } from "./constructionTypes.ts";

/**
 * Applies one plan update while preserving the existing recalculation step.
 * The helper owns only the deterministic collection replacement; plan rules
 * and recalculation remain supplied by the application layer.
 */
export function updateConstructionPlan(
  plans: readonly ConstructionPlan[],
  planId: string,
  updater: (plan: ConstructionPlan) => ConstructionPlan,
  recalculate: (plan: ConstructionPlan) => ConstructionPlan,
): ConstructionPlan[] {
  return plans.map((plan) => plan.id === planId ? recalculate(updater(plan)) : plan);
}
