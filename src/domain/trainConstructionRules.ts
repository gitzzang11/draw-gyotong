/**
 * 차종별 선로 건설 규칙. 노선 차종은 기획·건설 단계에서 먼저 정하고, 선로는 그 규칙에 맞춰 깐다.
 *
 * - costMultiplier: km당 공사비(기본·산악·강 통과)에 곱하는 배율
 * - 역 간격: 최소보다 가까우면 경고
 * - maxTurnDeg: 한 꼭짓점에서 꺾이는 각도가 이보다 크면 급커브 경고
 * - 강 통과: 트램은 지하 불가(교량만), GTX는 대심도 지하만
 */
import type { TrainType } from "./trainTypes";

export interface TrainConstructionRule {
  costMultiplier: number;
  minStationSpacingKm: number;
  maxStationSpacingKm: number;
  maxTurnDeg: number;
  allowBridge: boolean;
  allowTunnel: boolean;
  summary: string;
}

export const trainConstructionRules: Record<TrainType, TrainConstructionRule> = {
  tram: { costMultiplier: 0.35, minStationSpacingKm: 0.3, maxStationSpacingKm: 1, maxTurnDeg: 90, allowBridge: true, allowTunnel: false, summary: "지상(도로 위) · 역 간격 0.3~1km · 급커브 가능 · 지하 불가" },
  light: { costMultiplier: 0.65, minStationSpacingKm: 0.6, maxStationSpacingKm: 1.5, maxTurnDeg: 70, allowBridge: true, allowTunnel: true, summary: "고가·지하 · 역 간격 0.6~1.5km · 다소 급한 곡선 허용" },
  heavy: { costMultiplier: 1, minStationSpacingKm: 0.8, maxStationSpacingKm: 2, maxTurnDeg: 50, allowBridge: true, allowTunnel: true, summary: "지하·고가 · 역 간격 0.8~2km · 완만한 곡선" },
  gtx: { costMultiplier: 2.2, minStationSpacingKm: 3, maxStationSpacingKm: 15, maxTurnDeg: 25, allowBridge: false, allowTunnel: true, summary: "대심도 지하 · 역 간격 3km 이상 · 아주 완만한 곡선" },
};

/** 꺾인 각도(0° = 직진). 점은 평면 좌표(m 또는 화면 px)로 준다. */
export function turnAngles(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  const angles: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const c = points[index + 1];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const lengths = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (lengths === 0) continue;
    const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / lengths));
    angles.push((Math.acos(cos) * 180) / Math.PI);
  }
  return angles;
}

export interface TrainRuleViolation {
  code: "sharp-turn" | "station-too-close" | "tunnel-not-allowed" | "bridge-not-allowed";
  severity: "warning" | "error";
  message: string;
}

/**
 * 규칙 검사. 역 간격은 노선 위 인접 역 사이 거리(km), 강 통과 방식은 선택된 것만 넘긴다.
 */
export function checkTrainRules(input: {
  trainType: TrainType;
  label: string;
  turnAnglesDeg: readonly number[];
  stationSpacingsKm: readonly number[];
  crossingModes: ReadonlyArray<"bridge" | "tunnel" | null>;
}): TrainRuleViolation[] {
  const rule = trainConstructionRules[input.trainType];
  const violations: TrainRuleViolation[] = [];
  const sharpest = Math.max(0, ...input.turnAnglesDeg);
  if (sharpest > rule.maxTurnDeg)
    violations.push({ code: "sharp-turn", severity: "warning", message: `${input.label}에는 급한 곡선(${Math.round(sharpest)}°)이 있습니다. ${rule.maxTurnDeg}° 이하로 완만하게 그리면 속도를 유지합니다.` });
  const closest = input.stationSpacingsKm.length > 0 ? Math.min(...input.stationSpacingsKm) : Infinity;
  if (closest < rule.minStationSpacingKm)
    violations.push({ code: "station-too-close", severity: "warning", message: `${input.label} 역 간격이 ${Math.round(closest * 1000)}m인 곳이 있습니다. ${input.label}은 ${rule.minStationSpacingKm}km 이상을 권장합니다.` });
  if (!rule.allowTunnel && input.crossingModes.includes("tunnel"))
    violations.push({ code: "tunnel-not-allowed", severity: "error", message: `${input.label}은 지하로 건설할 수 없습니다. 강 통과를 교량으로 바꾸세요.` });
  if (!rule.allowBridge && input.crossingModes.includes("bridge"))
    violations.push({ code: "bridge-not-allowed", severity: "error", message: `${input.label}은 대심도 지하로만 건설합니다. 강 통과를 지하로 바꾸세요.` });
  return violations;
}
