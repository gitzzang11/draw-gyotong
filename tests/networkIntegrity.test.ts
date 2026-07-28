import { describe, expect, it } from "vitest";
import {
  isValidConstructionStatusTransition,
  normalizeTransferLinks,
  synchronizeNetworkReferences,
  validateNetworkIntegrity,
} from "../src/networkIntegrity.ts";

type Station = { id: string; connectedRouteIds: string[]; transferGroupId?: string };
type Depot = { id: string; connectedRouteIds: string[] };
type Fleet = { id: string; routeId: string };
type Express = { routeId: string; stopStationIds: string[] };
type Passenger = {
  originStationId: string;
  destinationStationId: string;
  routeIds: string[];
  journey?: { stationIds: string[]; routeIds: string[] };
};
type Project = { routeIds: string[]; stationIds: string[]; depotIds: string[] };

describe("validateNetworkIntegrity", () => {
  it("reports broken references and unsafe numeric state", () => {
    const codes = validateNetworkIntegrity({
      routeIds: ["r1"],
      stations: [{ id: "shared", connectedRouteIds: ["missing"], transferGroupId: "t1" }],
      transfers: [{ id: "t1", stationIds: ["shared", "gone", "shared"] }],
      depots: [{ id: "d1", connectedRouteIds: ["r1"], capacity: 1 }],
      fleets: [{ id: "shared", routeId: "missing", sets: 2 }],
      expressConfigs: [],
      passengerGroups: [{ originStationId: "shared", destinationStationId: "gone", routeIds: ["r1"] }],
      projects: [{ id: "p1", routeIds: [], stationIds: [], depotIds: [], status: "broken" }],
      blueprintIds: ["d1"],
      numericState: { cash: Number.NaN },
    }).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining([
      "duplicate-id",
      "missing-route",
      "missing-transfer-station",
      "duplicate-transfer-member",
      "orphan-fleet",
      "orphan-passenger-path",
      "blueprint-id-collision",
      "invalid-construction-status",
      "non-finite-number",
    ]));
  });

  it("accepts a consistent network", () => {
    expect(validateNetworkIntegrity({
      routeIds: ["r1"],
      stations: [
        { id: "s1", connectedRouteIds: ["r1"], transferGroupId: "t1" },
        { id: "s2", connectedRouteIds: ["r1"], transferGroupId: "t1" },
      ],
      transfers: [{ id: "t1", stationIds: ["s1", "s2"] }],
      depots: [{ id: "d1", connectedRouteIds: ["r1"], capacity: 2 }],
      fleets: [{ id: "f1", routeId: "r1", sets: 2 }],
      expressConfigs: [],
      passengerGroups: [],
      projects: [],
      numericState: { cash: 100 },
    })).toEqual([]);
  });
});

function network() {
  return {
    routeIds: ["r1"],
    stations: [
      { id: "a", connectedRouteIds: ["r1", "deleted"], transferGroupId: "t1" },
      { id: "b", connectedRouteIds: ["r1"], transferGroupId: "stale" },
    ] satisfies Station[],
    transfers: [
      { id: "t1", stationIds: ["a", "b", "deleted-station", "a"] },
      { id: "invalid", stationIds: ["a", "gone"] },
    ],
    depots: [{ id: "d1", connectedRouteIds: ["r1", "deleted"] }] satisfies Depot[],
    fleets: [{ id: "f1", routeId: "r1" }, { id: "f2", routeId: "deleted" }] satisfies Fleet[],
    expressConfigs: [{ routeId: "r1", stopStationIds: ["a", "b", "gone"] }, { routeId: "deleted", stopStationIds: ["a"] }] satisfies Express[],
    passengerGroups: [
      { originStationId: "a", destinationStationId: "b", routeIds: ["r1"], journey: { stationIds: ["a", "b"], routeIds: ["r1"] } },
      { originStationId: "a", destinationStationId: "gone", routeIds: ["r1"] },
      { originStationId: "a", destinationStationId: "b", routeIds: ["deleted"] },
    ] satisfies Passenger[],
    projects: [
      { routeIds: ["r1", "deleted"], stationIds: ["a", "gone"], depotIds: ["d1", "gone"] },
      { routeIds: ["deleted"], stationIds: ["gone"], depotIds: ["gone"] },
    ] satisfies Project[],
  };
}

describe("network deletion and reference integrity", () => {
  it("removes deleted route references from fleets, depots, express services and projects", () => {
    const result = synchronizeNetworkReferences(network());
    expect(result.stations[0].connectedRouteIds).toEqual(["r1"]);
    expect(result.depots[0].connectedRouteIds).toEqual(["r1"]);
    expect(result.fleets).toEqual([{ id: "f1", routeId: "r1" }]);
    expect(result.expressConfigs).toEqual([{ routeId: "r1", stopStationIds: ["a", "b"] }]);
    expect(result.projects).toEqual([{ routeIds: ["r1"], stationIds: ["a"], depotIds: ["d1"] }]);
  });

  it("removes passenger groups with deleted station or route references", () => {
    const result = synchronizeNetworkReferences(network());
    expect(result.passengerGroups).toHaveLength(1);
    expect(result.passengerGroups[0].journey?.stationIds).toEqual(["a", "b"]);
  });

  it("normalizes transfer memberships bidirectionally and removes invalid groups", () => {
    const result = normalizeTransferLinks(network().stations, network().transfers);
    expect(result.transfers).toEqual([{ id: "t1", stationIds: ["a", "b"] }]);
    expect(result.stations.map((station) => station.transferGroupId)).toEqual(["t1", "t1"]);
  });

  it("does not leave one station linked to two competing transfer groups", () => {
    const result = normalizeTransferLinks(
      [
        { id: "a", connectedRouteIds: ["r1"] },
        { id: "b", connectedRouteIds: ["r1"] },
        { id: "c", connectedRouteIds: ["r1"] },
      ],
      [
        { id: "first", stationIds: ["a", "b"] },
        { id: "second", stationIds: ["a", "c"] },
      ],
    );
    expect(result.transfers).toEqual([{ id: "first", stationIds: ["a", "b"] }]);
    expect(result.stations.map((station) => station.transferGroupId)).toEqual(["first", "first", undefined]);
  });

  it("has an explicit valid construction lifecycle", () => {
    expect(isValidConstructionStatusTransition("planned", "scheduled")).toBe(true);
    expect(isValidConstructionStatusTransition("scheduled", "building")).toBe(true);
    expect(isValidConstructionStatusTransition("building", "opening-ready")).toBe(true);
    expect(isValidConstructionStatusTransition("building", "operating")).toBe(true);
    expect(isValidConstructionStatusTransition("opening-ready", "operating")).toBe(true);
    expect(isValidConstructionStatusTransition("planned", "operating")).toBe(false);
    expect(isValidConstructionStatusTransition("operating", "building")).toBe(false);
  });

  it("survives JSON save/load without losing valid ID references", () => {
    const saved = JSON.parse(JSON.stringify(synchronizeNetworkReferences(network())));
    expect(saved.stations.map((station: Station) => station.id)).toEqual(["a", "b"]);
    expect(saved.transfers[0].stationIds).toEqual(["a", "b"]);
    expect(saved.projects[0].depotIds).toEqual(["d1"]);
  });
});
