import { describe, expect, it } from "vitest";
import { createManualVerificationState, MANUAL_VERIFICATION_IDS } from "../src/dev/manualVerificationState.ts";

describe("manual verification seed", () => {
  it("contains two operational lines with stations, fleets, a depot, and clean connection slots", () => {
    const state = createManualVerificationState(1234);
    const routeIds = state.routes.map((route) => route.id);

    expect(state.meta.mode).toBe("career");
    expect(state.meta.difficulty).toBe("easy");
    expect(state.meta.slotId).toBe(MANUAL_VERIFICATION_IDS.slot);
    expect(state.economy.cash).toBeGreaterThanOrEqual(500_000);
    expect(state.routes).toHaveLength(2);
    expect(state.routes.every((route) => route.segments?.length === 2 && route.branches?.length === 0)).toBe(true);
    expect(state.stations).toHaveLength(6);
    expect(state.stations.every((station) => station.connectedRouteIds.length === 1 && routeIds.includes(station.connectedRouteIds[0]))).toBe(true);
    expect(state.trainFleets).toHaveLength(2);
    expect(state.trainFleets.every((fleet) => fleet.sets > 0 && routeIds.includes(fleet.routeId))).toBe(true);
    expect(state.depots).toHaveLength(1);
    expect(state.depots[0].connectedRouteIds).toEqual([MANUAL_VERIFICATION_IDS.mainLine]);
    expect(state.transfers).toEqual([]);
    expect(state.plans).toEqual([]);
    expect(state.constructionProjects).toEqual([]);
  });

  it("keeps the transfer pair close and exposes a physical endpoint pair", () => {
    const state = createManualVerificationState(1234);
    const station = (id: string) => state.stations.find((item) => item.id === id)!;
    const distance = (a: [number, number], b: [number, number]) => {
      const latitudeScale = 111_320;
      const longitudeScale = latitudeScale * Math.cos((a[0] * Math.PI) / 180);
      return Math.hypot((b[0] - a[0]) * latitudeScale, (b[1] - a[1]) * longitudeScale);
    };

    expect(distance(station(MANUAL_VERIFICATION_IDS.mainTransferStation).position, station(MANUAL_VERIFICATION_IDS.branchTransferStation).position)).toBeLessThan(100);
    expect(distance(station(MANUAL_VERIFICATION_IDS.mainEastStation).position, station(MANUAL_VERIFICATION_IDS.branchEastStation).position)).toBeLessThan(100);
  });

  it("is repeatable for deterministic browser checks when the timestamp is supplied", () => {
    expect(createManualVerificationState(1234)).toEqual(createManualVerificationState(1234));
  });
});
