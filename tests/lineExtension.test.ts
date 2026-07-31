import { describe, expect, it } from "vitest";
import { mergeLineExtension } from "../src/lineExtension";

function line() {
  return {
    id: "line-1",
    name: "1호선",
    color: "#0055ff",
    coordinates: [[37.5, 127], [37.51, 127.01]] as Array<[number, number]>,
    lengthKm: 2,
    constructionCost: 100,
    riverCrossings: 0,
    mountainSegments: 0,
    operationPaused: false,
    fleetAssignmentIds: ["fleet-1"],
    depotIds: ["depot-1"],
    revenueHistory: [10, 20],
  };
}

describe("mergeLineExtension", () => {
  it("extends the end while preserving line identity and assignments", () => {
    const source = line();
    const result = mergeLineExtension(source, {
      targetLineId: source.id,
      atStart: false,
      coordinates: [[37.51, 127.01], [37.52, 127.02]],
      lengthKm: 1.5,
      constructionCost: 70,
      riverCrossings: 1,
      mountainSegments: 0,
    });
    expect(result.id).toBe(source.id);
    expect(result.name).toBe(source.name);
    expect(result.color).toBe(source.color);
    expect(result.fleetAssignmentIds).toBe(source.fleetAssignmentIds);
    expect(result.depotIds).toBe(source.depotIds);
    expect(result.revenueHistory).toBe(source.revenueHistory);
    expect(result.coordinates).toEqual([[37.5, 127], [37.51, 127.01], [37.52, 127.02]]);
    expect(result.lengthKm).toBe(3.5);
  });

  it("extends the start in travel order without creating a second line", () => {
    const source = line();
    const result = mergeLineExtension(source, {
      targetLineId: source.id,
      atStart: true,
      coordinates: [[37.5, 127], [37.49, 126.99], [37.48, 126.98]],
      lengthKm: 2,
      constructionCost: 90,
      riverCrossings: 0,
      mountainSegments: 1,
    });
    expect(result.id).toBe("line-1");
    expect(result.coordinates).toEqual([
      [37.48, 126.98],
      [37.49, 126.99],
      [37.5, 127],
      [37.51, 127.01],
    ]);
  });

  it("rejects a mismatched target instead of mutating another line", () => {
    const source = line();
    expect(() => mergeLineExtension(source, {
      targetLineId: "line-2",
      atStart: false,
      coordinates: [[37.51, 127.01], [37.52, 127.02]],
      lengthKm: 1,
      constructionCost: 1,
      riverCrossings: 0,
      mountainSegments: 0,
    })).toThrow("does not match");
    expect(source.coordinates).toEqual([[37.5, 127], [37.51, 127.01]]);
  });
});
