import { describe, expect, it } from "vitest";
import { getStationTransferInfo } from "../src/stationTransferInfo";

const stations = [
  { id: "station-a", name: "중앙", connectedRouteIds: ["line-1"], transferGroupId: "transfer-1" },
  { id: "station-b", name: "중앙", connectedRouteIds: ["line-2", "deleted-line"], transferGroupId: "transfer-1" },
];
const routes = [
  { id: "line-1", name: "1호선", color: "#0066ff", operational: true, paused: false, underConstruction: false },
  { id: "line-2", name: "2호선", color: "#00aa55", operational: false, paused: true, underConstruction: false },
];
const transfers = [{
  id: "transfer-1",
  stationIds: ["station-a", "station-b"],
  distanceM: 120,
  transferTimeMin: 4.2,
  congestion: 0.76,
  resistance: 42,
  automatic: false,
}];

describe("getStationTransferInfo", () => {
  it("uses live transfer links and de-duplicates existing route records", () => {
    const info = getStationTransferInfo({
      stationId: "station-a",
      stations,
      routes,
      transfers,
      passengerGroups: [],
    });
    expect(info?.isTransfer).toBe(true);
    expect(info?.connectedLines.map((route) => route.id)).toEqual(["line-1", "line-2"]);
    expect(info?.transferPairs).toEqual([["line-1", "line-2"]]);
    expect(info?.operationalStatus).toBe("invalid");
    expect(info?.integrityIssues).toContain("missing-transfer-route:station-a:deleted-line");
  });

  it("counts only passenger journeys that actually transfer at a member station", () => {
    const info = getStationTransferInfo({
      stationId: "station-a",
      stations: stations.map((station) => ({
        ...station,
        connectedRouteIds: station.connectedRouteIds.filter((routeId) => routeId !== "deleted-line"),
      })),
      routes,
      transfers,
      passengerGroups: [
        {
          activeDemand: 18420,
          crowding: 0.76,
          journey: { routeIds: ["line-1", "line-2"], stationIds: ["station-a", "station-b"], transferStationIds: ["station-a"] },
        },
        {
          activeDemand: 9000,
          crowding: 0.4,
          journey: { routeIds: ["line-1", "line-2"], stationIds: ["elsewhere"], transferStationIds: ["elsewhere"] },
        },
      ],
    });
    expect(info?.transferPassengers).toBe(18420);
    expect(info?.transferCrowding).toBeCloseTo(0.76);
    expect(info?.transferTimeMin).toBe(4.2);
    expect(info?.transferResistance).toBe(42);
    expect(info?.operationalStatus).toBe("partial");
  });

  it("updates immediately when the transfer link is removed", () => {
    const before = getStationTransferInfo({ stationId: "station-a", stations, routes, transfers, passengerGroups: [] });
    const after = getStationTransferInfo({
      stationId: "station-a",
      stations: stations.map((station) => ({ ...station, transferGroupId: undefined })),
      routes,
      transfers: [],
      passengerGroups: [],
    });
    expect(before?.isTransfer).toBe(true);
    expect(after?.isTransfer).toBe(false);
    expect(after?.transferLinks).toEqual([]);
  });

  it("does not mark a multi-route station as a transfer without an explicit link", () => {
    const info = getStationTransferInfo({
      stationId: "station-a",
      stations: [{ id: "station-a", name: "교차역", connectedRouteIds: ["line-1", "line-2"] }],
      routes,
      transfers: [],
      passengerGroups: [],
    });
    expect(info?.connectedLines).toHaveLength(2);
    expect(info?.isTransfer).toBe(false);
    expect(info?.transferLinks).toEqual([]);
  });
});
