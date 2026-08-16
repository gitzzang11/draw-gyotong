import { describe, expect, it } from "vitest";
import { calculateEdgeHudProximity } from "../src/hudProximity.ts";

describe("route drawing HUD proximity", () => {
  it("keeps both HUD bars fully visible in the map centre", () => {
    expect(calculateEdgeHudProximity(180, 360)).toEqual({
      topOpacity: 1,
      topShiftPx: 0,
      bottomOpacity: 1,
      bottomShiftPx: 0,
    });
  });

  it("progressively moves only the top HUD away near the top edge", () => {
    const nearTop = calculateEdgeHudProximity(44, 360);
    expect(nearTop.topOpacity).toBeCloseTo(0.52);
    expect(nearTop.topShiftPx).toBe(-24);
    expect(nearTop.bottomOpacity).toBe(1);
    expect(nearTop.bottomShiftPx).toBe(0);
  });

  it("progressively moves only the bottom HUD away near the bottom edge", () => {
    const nearBottom = calculateEdgeHudProximity(316, 360);
    expect(nearBottom.topOpacity).toBe(1);
    expect(nearBottom.topShiftPx).toBe(0);
    expect(nearBottom.bottomOpacity).toBeCloseTo(0.52);
    expect(nearBottom.bottomShiftPx).toBe(24);
  });

  it("nearly hides the matching HUD at the physical edge", () => {
    expect(calculateEdgeHudProximity(0, 720).topOpacity).toBe(0.04);
    expect(calculateEdgeHudProximity(720, 720).bottomOpacity).toBe(0.04);
  });
});
