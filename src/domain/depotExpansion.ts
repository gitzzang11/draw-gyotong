import type { Depot } from "./networkTypes.ts";

export const maxDepotLevel = 5;

export function getDepotExpansionQuote(
  depot: Depot,
  context: { mode: "career" | "sandbox"; cash: number; costMultiplier: number; operational: boolean; busy?: boolean },
): { cost: number; nextLevel: number; reason?: string } {
  const nextLevel = depot.level + 1;
  if (!Number.isInteger(depot.level) || depot.level < 1 || !Number.isFinite(depot.areaHa) || depot.areaHa < 0 ||
      !Number.isFinite(context.costMultiplier) || context.costMultiplier <= 0 || !Number.isFinite(context.cash)) {
    return { cost: 0, nextLevel, reason: "차량기지·재정 데이터를 확인해 주세요." };
  }
  const cost = Math.max(180, Math.round(depot.areaHa * 680 * context.costMultiplier * 0.4 * depot.level));
  if (!Number.isSafeInteger(cost)) return { cost: 0, nextLevel, reason: "차량기지 확장 비용을 계산할 수 없습니다." };
  if (context.busy) return { cost, nextLevel, reason: "차량기지 확장을 저장 중입니다." };
  if (depot.level >= maxDepotLevel) return { cost, nextLevel, reason: `최대 확장 레벨 ${maxDepotLevel}에 도달했습니다.` };
  if (!context.operational) return { cost, nextLevel, reason: "기지 공사와 개통을 먼저 완료해 주세요." };
  if (context.mode === "career" && context.cash < cost) return { cost, nextLevel, reason: "확장 자금이 부족합니다." };
  return { cost, nextLevel };
}
