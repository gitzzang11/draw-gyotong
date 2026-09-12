import { describe, expect, it } from "vitest";
import { getRoutePathCoordinates, getRouteRuns } from "../src/map/routePathBuilder.ts";

const route = {
  coordinates: [[37.5, 127], [37.51, 127.01], [37.52, 127.02], [37.53, 127.03]] as Array<[number, number]>,
  disabledSegments: [1],
  branches: [{ id: "branch-1", segmentIds: ["branch-segment"] }],
  segments: [
    { id: "branch-segment", enabled: true, coordinates: [[37.51, 127.01], [37.515, 127.03]] as Array<[number, number]> },
    { id: "disabled-branch", enabled: false, coordinates: [[37.52, 127.02], [37.525, 127.04]] as Array<[number, number]> },
  ],
};

describe("route path builder", () => {
  it("splits main-route paths at disabled segment boundaries without mutating route coordinates", () => {
    const coordinates = structuredClone(route.coordinates);
    expect(getRouteRuns(route)).toEqual([
      [[37.5, 127], [37.51, 127.01]],
      [[37.52, 127.02], [37.53, 127.03]],
    ]);
    expect(route.coordinates).toEqual(coordinates);
  });

  it("adds only enabled branch segments referenced by the route", () => {
    expect(getRoutePathCoordinates(route)).toEqual([
      [[37.5, 127], [37.51, 127.01]],
      [[37.52, 127.02], [37.53, 127.03]],
      [[37.51, 127.01], [37.515, 127.03]],
    ]);
  });
});
