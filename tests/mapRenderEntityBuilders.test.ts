import { describe, expect, it, vi } from "vitest";
import {
  buildConstructionRenderEntities,
  buildDepotRenderEntities,
} from "../src/map/renderEntityBuilders.ts";

describe("map render entity builders", () => {
  it("derives depot view entities without retaining map objects or mutating game data", () => {
    const depots: Array<{
      id: string;
      polygon: Array<[number, number]>;
      connectedRouteIds: string[];
    }> = [{
      id: "depot-1",
      polygon: [[37.5, 127], [37.51, 127.01]],
      connectedRouteIds: ["line-1"],
    }];
    const isOperational = vi.fn((id: string) => id === "depot-1");

    expect(buildDepotRenderEntities(depots, {
      selectedId: "other",
      selectedDepotId: "depot-1",
      isOperational,
    })).toEqual([{
      id: "depot-1",
      polygon: [[37.5, 127], [37.51, 127.01]],
      selected: true,
      operational: true,
      connected: true,
    }]);
    expect(depots[0].connectedRouteIds).toEqual(["line-1"]);
  });

  it("filters operating construction projects and preserves the existing progress rules", () => {
    const projects: Array<{
      id: string;
      status: string;
      coordinates: Array<[number, number]>;
      elapsedDays: number;
      durationDays: number;
      delayDays: number;
      kind: string;
    }> = [
      { id: "operating", status: "operating", coordinates: [[37.5, 127], [37.51, 127.01]], elapsedDays: 0, durationDays: 2, delayDays: 0, kind: "route" },
      { id: "short", status: "under-construction", coordinates: [[37.5, 127]], elapsedDays: 0, durationDays: 2, delayDays: 0, kind: "route" },
      { id: "ready", status: "opening-ready", coordinates: [[37.5, 127], [37.51, 127.01]], elapsedDays: 0, durationDays: 2, delayDays: 0, kind: "repair" },
      { id: "delayed", status: "under-construction", coordinates: [[37.5, 127], [37.51, 127.01]], elapsedDays: 9, durationDays: 4, delayDays: 2, kind: "edit" },
    ];

    expect(buildConstructionRenderEntities(projects)).toEqual([
      { id: "ready", points: [[37.5, 127], [37.51, 127.01]], progress: 1, ready: true, affected: true },
      { id: "delayed", points: [[37.5, 127], [37.51, 127.01]], progress: 1, ready: false, affected: true },
    ]);
  });
});
