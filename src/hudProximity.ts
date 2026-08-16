export type EdgeHudProximity = {
  topOpacity: number;
  topShiftPx: number;
  bottomOpacity: number;
  bottomShiftPx: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));
const roundOpacity = (value: number) => Number(value.toFixed(3));

export function calculateEdgeHudProximity(clientY: number, viewportHeight: number): EdgeHudProximity {
  const safeViewportHeight = Math.max(1, viewportHeight);
  const pointerY = clamp(clientY, 0, safeViewportHeight);
  const fadeDistance = Math.min(132, Math.max(88, safeViewportHeight * 0.22));
  const maxShift = Math.min(78, Math.max(48, safeViewportHeight * 0.1));
  const topStrength = clamp((fadeDistance - pointerY) / fadeDistance, 0, 1);
  const bottomStrength = clamp((fadeDistance - (safeViewportHeight - pointerY)) / fadeDistance, 0, 1);

  return {
    topOpacity: roundOpacity(Math.max(0.04, 1 - topStrength * 0.96)),
    topShiftPx: topStrength === 0 ? 0 : Math.round(-maxShift * topStrength),
    bottomOpacity: roundOpacity(Math.max(0.04, 1 - bottomStrength * 0.96)),
    bottomShiftPx: Math.round(maxShift * bottomStrength),
  };
}
