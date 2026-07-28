import { describe, expect, it } from "vitest";
import {
  advanceStationDemand,
  allocateCatchmentDemand,
  applyPermanentDemandEvents,
  calculateTransitCaptureRate,
  createLegacyDemandZones,
  createRegionalDemandGrid,
  createStationDemandState,
  effectiveZonePotential,
  getAreaPeriodMultiplier,
  getDestinationPeriodMultiplier,
  previewStationDemand,
  type DemandEvent,
  type DemandServiceFactors,
  type DemandStationInput,
  type DemandZone,
} from "./demandModel.ts";

const goodService: DemandServiceFactors = {
  hasAccessibleStation: true,
  reachableDestinationShare: 0.92,
  averageWaitMin: 3,
  averageTravelTimeMin: 28,
  averageTransfers: 0.6,
  transferResistance: 16,
  crowding: 0.85,
  fare: 1_450,
  reliability: 0.96,
  satisfaction: 84,
  serviceAvailable: true,
};

function station(id: string, longitude: number, legacyDemand = 10_000): DemandStationInput {
  return { id, position: [37.56, longitude], operational: true, legacyDemand };
}

function zone(id: string, longitude: number, potential: number, profile: DemandZone["areaProfile"] = "mixed"): DemandZone {
  return {
    id,
    position: [37.56, longitude],
    basePotentialDemand: potential,
    areaProfile: profile,
    permanentPotentialDelta: 0,
    appliedPermanentEventIds: [],
  };
}

describe("fixed potential demand and catchment competition", () => {
  it("redistributes a shared zone without duplicating its total potential", () => {
    const zones = [zone("z", 126.98, 20_000)];
    const before = allocateCatchmentDemand(zones, [station("a", 126.98)], 1, "daytime");
    const after = allocateCatchmentDemand(zones, [station("a", 126.98), station("b", 126.982)], 1, "daytime");
    expect(before.allocatedPotential).toBe(after.allocatedPotential);
    expect(after.stationPotential.get("a")).toBeLessThan(before.stationPotential.get("a")!);
    expect(after.stationPotential.get("b")).toBeGreaterThan(0);
    expect([...after.stationPotential.values()].reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(after.allocatedPotential, -1);
  });

  it("does not create another legacy zone for an adjacent new station", () => {
    const first = createLegacyDemandZones([station("a", 126.98)]);
    const second = createLegacyDemandZones([station("a", 126.98), station("b", 126.981)], first);
    expect(second).toHaveLength(1);
  });

  it("creates the same fixed regional surface for the same city seed", () => {
    expect(createRegionalDemandGrid([37.56, 126.98], "seoul"))
      .toEqual(createRegionalDemandGrid([37.56, 126.98], "seoul"));
  });

  it("keeps heterogeneous stations heterogeneous over a long simulation", () => {
    const stations = [station("a", 126.98, 4_000), station("b", 127.01, 14_000)];
    const zones = [zone("za", 126.98, 10_000), zone("zb", 127.01, 34_000)];
    const allocation = allocateCatchmentDemand(zones, stations, 0, "daytime");
    const capture = calculateTransitCaptureRate(goodService).captureRate;
    let states = stations.map((item) => createStationDemandState(item, allocation, 0));
    for (let day = 1; day <= 1_000; day += 1) {
      states = states.map((state) => advanceStationDemand(
        state,
        allocation.stationPotential.get(state.stationId)!,
        capture,
        day,
      ));
    }
    expect(states[0].realizedDemand).not.toBe(states[1].realizedDemand);
    expect(states.every((state) => state.realizedDemand <= state.potentialDemand)).toBe(true);
    expect(states.every((state) => Number.isFinite(state.realizedDemand) && state.realizedDemand >= 0)).toBe(true);
  });
});

describe("service-sensitive capture and adaptation", () => {
  it("converges to a target instead of growing with compound interest", () => {
    const item = station("a", 126.98, 2_000);
    const allocation = allocateCatchmentDemand([zone("z", 126.98, 12_000)], [item], 0, "daytime");
    const targetCaptureRate = 0.72;
    let state = createStationDemandState(item, allocation, 0);
    for (let day = 1; day <= 365; day += 1) {
      state = advanceStationDemand(state, state.potentialDemand, targetCaptureRate, day);
    }
    expect(state.realizedDemand).toBeCloseTo(state.potentialDemand * targetCaptureRate, -1);
    expect(state.realizedDemand).toBeLessThanOrEqual(state.potentialDemand);
  });

  it("responds monotonically to frequency, cars/crowding, fare, transfer resistance and closure", () => {
    const baseline = calculateTransitCaptureRate(goodService).captureRate;
    expect(calculateTransitCaptureRate({ ...goodService, averageWaitMin: 8 }).captureRate).toBeLessThan(baseline);
    expect(calculateTransitCaptureRate({ ...goodService, crowding: 1.7 }).captureRate).toBeLessThan(baseline);
    expect(calculateTransitCaptureRate({ ...goodService, fare: 2_700 }).captureRate).toBeLessThan(baseline);
    expect(calculateTransitCaptureRate({ ...goodService, transferResistance: 90 }).captureRate).toBeLessThan(baseline);
    expect(calculateTransitCaptureRate({ ...goodService, expressTimeSaving: 0.2 }).captureRate).toBeGreaterThanOrEqual(baseline);
    expect(calculateTransitCaptureRate({ ...goodService, serviceAvailable: false }).captureRate).toBe(0);
  });

  it("does not mutate confirmed state while previewing", () => {
    const item = station("a", 126.98, 3_000);
    const allocation = allocateCatchmentDemand([zone("z", 126.98, 10_000)], [item], 0, "daytime");
    const state = createStationDemandState(item, allocation, 0);
    const snapshot = structuredClone(state);
    const preview = previewStationDemand(state, 0.8);
    expect(state).toEqual(snapshot);
    expect(preview.realizedDemand).toBeGreaterThan(state.realizedDemand);
  });

  it("is independent of rendering or speed when the same game days elapse", () => {
    const item = station("a", 126.98, 2_000);
    const allocation = allocateCatchmentDemand([zone("z", 126.98, 10_000)], [item], 0, "daytime");
    const initial = createStationDemandState(item, allocation, 0);
    let fast = initial;
    for (let day = 1; day <= 30; day += 1) fast = advanceStationDemand(fast, fast.potentialDemand, 0.7, day);
    let slow = initial;
    for (let day = 1; day <= 30; day += 1) {
      for (let render = 0; render < 60; render += 1) {
        slow = advanceStationDemand(slow, slow.potentialDemand, 0.7, day);
      }
    }
    expect(slow).toEqual(fast);
  });
});

describe("scale and persistence", () => {
  it.each([20, 75, 150, 300])("allocates catchments for %i stations within the frame budget", (count) => {
    const zones = createRegionalDemandGrid([37.56, 126.98], "perf", 1, 8, 900);
    const stations = Array.from({ length: count }, (_, index) => station(
      `s${index}`,
      126.98 + ((index % 20) - 10) * 0.004,
      5_000 + index * 17,
    )).map((item, index) => ({
      ...item,
      position: [37.56 + (Math.floor(index / 20) - 5) * 0.004, item.position[1]] as [number, number],
    }));
    const started = performance.now();
    const allocation = allocateCatchmentDemand(zones, stations, 20, "daytime");
    const elapsed = performance.now() - started;
    expect(allocation.stationPotential.size).toBe(count);
    expect(elapsed).toBeLessThan(1_000);
  });

  it("preserves potential and realized values through JSON save/load", () => {
    const item = station("legacy", 126.98, 4_500);
    const allocation = allocateCatchmentDemand([zone("z", 126.98, 12_000)], [item], 7, "daytime");
    const state = createStationDemandState(item, allocation, 7);
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.potentialDemand).toBe(state.potentialDemand);
    expect(restored.realizedDemand).toBe(state.realizedDemand);
  });
});

describe("time profiles and events", () => {
  it("matches residential, business, commercial and night period behavior", () => {
    expect(getAreaPeriodMultiplier("residential", "morning-peak"))
      .toBeGreaterThan(getAreaPeriodMultiplier("residential", "daytime"));
    expect(getDestinationPeriodMultiplier("business", "morning-peak"))
      .toBeGreaterThan(getDestinationPeriodMultiplier("residential", "morning-peak"));
    expect(getAreaPeriodMultiplier("commercial", "daytime"))
      .toBeGreaterThan(getAreaPeriodMultiplier("commercial", "morning-peak"));
    expect(getAreaPeriodMultiplier("mixed", "night"))
      .toBeLessThan(getAreaPeriodMultiplier("mixed", "daytime"));
  });

  it("restores temporary event demand and applies permanent demand only once", () => {
    const base = zone("z", 126.98, 10_000, "tourism");
    const temporary: DemandEvent = {
      id: "concert",
      kind: "temporary",
      zoneIds: ["z"],
      periods: ["evening-peak"],
      multiplier: 1.5,
      startsOnDay: 3,
      endsOnDay: 4,
    };
    expect(effectiveZonePotential(base, 3, "evening-peak", [temporary])).toBe(15_000);
    expect(effectiveZonePotential(base, 5, "evening-peak", [temporary])).toBe(10_000);

    const permanent: DemandEvent = {
      id: "office-open",
      kind: "permanent",
      zoneIds: ["z"],
      potentialDelta: 2_500,
      startsOnDay: 1,
    };
    const once = applyPermanentDemandEvents([base], [permanent]);
    const twice = applyPermanentDemandEvents(once, [permanent]);
    expect(twice[0].permanentPotentialDelta).toBe(2_500);
  });
});
