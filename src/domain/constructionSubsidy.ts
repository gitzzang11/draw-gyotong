/**
 * 건설 국비 보조(커리어 모드). 사업비 중 보조율만큼은 국비가 내고 회사는 나머지만 낸다.
 * 난이도가 쉬울수록 보조율이 높다. 차량 구입·공사 중 추가 비용·대출에는 붙지 않는다(2026-10-11).
 */
export type SubsidyDifficulty = "easy" | "normal" | "hard";

export const constructionSubsidyRates: Record<SubsidyDifficulty, number> = {
  easy: 0.5,
  normal: 0.4,
  hard: 0.25,
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** 사업비 중 국비 보조액(억, 0.01억 단위) */
export function constructionSubsidy(cost: number, rate: number): number {
  if (!(cost > 0) || !(rate > 0)) return 0;
  return roundMoney(cost * Math.min(1, rate));
}

/** 회사가 실제로 내는 금액(억) = 사업비 − 국비 보조 */
export function payableConstructionCost(cost: number, rate: number): number {
  return roundMoney(cost - constructionSubsidy(cost, rate));
}
