import { describe, expect, it } from "vitest";
import { checkTrainRules, trainConstructionRules, turnAngles } from "../src/domain/trainConstructionRules";

describe("train construction rules", () => {
  it("measures the turn at each vertex", () => {
    expect(turnAngles([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])[0]).toBeCloseTo(0);
    expect(turnAngles([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])[0]).toBeCloseTo(90);
  });

  it("warns about sharp curves and close stations per train type", () => {
    const tram = checkTrainRules({ trainType: "tram", label: "트램", turnAnglesDeg: [80], stationSpacingsKm: [0.4], crossingModes: [] });
    expect(tram).toEqual([]);
    const gtx = checkTrainRules({ trainType: "gtx", label: "GTX", turnAnglesDeg: [80], stationSpacingsKm: [0.4], crossingModes: [] });
    expect(gtx.map((item) => item.code)).toEqual(["sharp-turn", "station-too-close"]);
    expect(gtx.every((item) => item.severity === "warning")).toBe(true);
  });

  it("blocks tram tunnels and GTX bridges", () => {
    expect(checkTrainRules({ trainType: "tram", label: "트램", turnAnglesDeg: [], stationSpacingsKm: [], crossingModes: ["tunnel"] })[0]).toMatchObject({ code: "tunnel-not-allowed", severity: "error" });
    expect(checkTrainRules({ trainType: "gtx", label: "GTX", turnAnglesDeg: [], stationSpacingsKm: [], crossingModes: ["bridge"] })[0]).toMatchObject({ code: "bridge-not-allowed", severity: "error" });
    expect(checkTrainRules({ trainType: "heavy", label: "중전철", turnAnglesDeg: [], stationSpacingsKm: [], crossingModes: ["bridge", "tunnel", null] })).toEqual([]);
  });

  it("makes cheaper modes cheaper to build", () => {
    expect(trainConstructionRules.tram.costMultiplier).toBeLessThan(trainConstructionRules.light.costMultiplier);
    expect(trainConstructionRules.light.costMultiplier).toBeLessThan(trainConstructionRules.heavy.costMultiplier);
    expect(trainConstructionRules.heavy.costMultiplier).toBeLessThan(trainConstructionRules.gtx.costMultiplier);
  });
});
