import { describe, expect, it } from "vitest";
import { selectPassengerDestinations } from "../src/destinationSelection.ts";

const stations = Array.from({ length: 30 }, (_, index) => ({
  id: `s${index}`,
  demand: index === 25 ? 9000 : 1000 + index * 120,
  position: [37.5, 126.8 + index * 0.012] as [number, number],
  accessibility: 1,
}));
const distanceKm = (from: (typeof stations)[number], to: (typeof stations)[number]) =>
  Math.abs(Number(from.id.slice(1)) - Number(to.id.slice(1))) * 1.05;

describe("passenger destination selection", () => {
  it("is deterministic for the same seed and never selects the origin", () => {
    const first = selectPassengerDestinations(stations[10], stations, { seed: "fixed", maxDestinations: 8, distanceKm });
    const second = selectPassengerDestinations(stations[10], stations, { seed: "fixed", maxDestinations: 8, distanceKm });
    expect(second).toEqual(first);
    expect(first.every((choice) => choice.destinationId !== "s10")).toBe(true);
  });

  it("produces near, middle and far trips without concentrating on only the farthest stations", () => {
    const bandTotals = { near: 0, middle: 0, far: 0 };
    const destinationIds = new Set<string>();
    for (let day = 0; day < 40; day += 1) {
      for (const origin of stations) {
        for (const choice of selectPassengerDestinations(origin, stations, {
          seed: String(day),
          maxDestinations: 8,
          distanceKm,
        })) {
          bandTotals[choice.band] += choice.share;
          destinationIds.add(choice.destinationId);
        }
      }
    }
    const total = bandTotals.near + bandTotals.middle + bandTotals.far;
    expect(bandTotals.near / total).toBeGreaterThan(0.38);
    expect(bandTotals.middle / total).toBeGreaterThan(0.3);
    expect(bandTotals.far / total).toBeGreaterThan(0.08);
    expect(destinationIds.size).toBeGreaterThan(24);
  });

  it("selects a high-demand centre more often than a comparable neighbour", () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 120; seed += 1) {
      for (const origin of stations) {
        for (const choice of selectPassengerDestinations(origin, stations, {
          seed: String(seed),
          maxDestinations: 8,
          distanceKm,
        })) {
          counts.set(choice.destinationId, (counts.get(choice.destinationId) ?? 0) + choice.share);
        }
      }
    }
    expect(counts.get("s25") ?? 0).toBeGreaterThan(counts.get("s24") ?? 0);
  });
});
