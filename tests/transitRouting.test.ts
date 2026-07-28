import { describe, expect, it } from "vitest";
import {
  buildNetworkSignature,
  TransitRouter,
  type RoutingNetwork,
  type RoutingService,
  type RoutingStation,
} from "../src/transitRouting.ts";

function chainNetwork(length: number): RoutingNetwork {
  const stations: RoutingStation[] = Array.from({ length: length + 1 }, (_, index) => ({
    id: `p${index}`,
    position: [37.5, 126.9 + index * 0.01],
    routeIds: [
      ...(index > 0 ? [`r${index - 1}`] : []),
      ...(index < length ? [`r${index}`] : []),
    ],
  }));
  const services: RoutingService[] = Array.from({ length }, (_, index) => ({
    id: `r${index}:local`,
    routeId: `r${index}`,
    kind: "local",
    paths: [{ id: `path${index}`, coordinates: [stations[index].position, stations[index + 1].position] }],
    stopStationIds: [`p${index}`, `p${index + 1}`],
    speedKph: 35,
    headwayMin: 4,
    crowding: 0.7,
  }));
  return { stations, services, transfers: [] };
}

describe("graph routing", () => {
  it.each([
    [1, 0],
    [2, 1],
    [3, 2],
    [5, 4],
  ])("supports a %i-service journey", (serviceCount, transfers) => {
    const router = new TransitRouter(chainNetwork(serviceCount));
    expect(router.findJourney("p0", `p${serviceCount}`)?.transferCount).toBe(transfers);
  });

  it("terminates on a loop and uses the closing segment", () => {
    const stations: RoutingStation[] = [
      { id: "a", position: [37.5, 126.9], routeIds: ["loop"] },
      { id: "b", position: [37.5, 126.93], routeIds: ["loop"] },
      { id: "c", position: [37.5, 126.96], routeIds: ["loop"] },
    ];
    const router = new TransitRouter({
      stations,
      transfers: [],
      services: [{
        id: "loop:local",
        routeId: "loop",
        kind: "local",
        paths: [{ id: "loop", coordinates: [...stations.map((station) => station.position), stations[0].position] }],
        stopStationIds: ["a", "b", "c"],
        speedKph: 30,
        headwayMin: 4,
        crowding: 0.7,
      }],
    });
    expect(router.findJourney("c", "a")?.stationIds).toEqual(["c", "a"]);
  });

  it("uses a reachable branch service instead of treating the main line as a dead end", () => {
    const stations: RoutingStation[] = [
      { id: "a", position: [37.5, 126.9], routeIds: ["main"] },
      { id: "junction", position: [37.5, 126.92], routeIds: ["main", "branch"] },
      { id: "b", position: [37.5, 126.94], routeIds: ["branch"] },
    ];
    const router = new TransitRouter({
      stations,
      transfers: [],
      services: [
        { id: "main:local", routeId: "main", kind: "local", paths: [{ id: "main", coordinates: [stations[0].position, stations[1].position] }], stopStationIds: ["a", "junction"], speedKph: 35, headwayMin: 4, crowding: 0.6 },
        { id: "branch:local", routeId: "branch", kind: "local", paths: [{ id: "branch", coordinates: [stations[1].position, stations[2].position] }], stopStationIds: ["junction", "b"], speedKph: 35, headwayMin: 4, crowding: 0.6 },
      ],
    });
    expect(router.findJourney("a", "b")?.routeIds).toEqual(["main", "branch"]);
  });

  it("returns no path for unavailable destinations, closed boarding stations and construction paths", () => {
    const network = chainNetwork(1);
    expect(new TransitRouter(network).findJourney("p0", "missing")).toBeNull();
    expect(new TransitRouter({
      ...network,
      stations: network.stations.map((station) => station.id === "p0" ? { ...station, closed: true } : station),
    }).findJourney("p0", "p1")).toBeNull();
    expect(new TransitRouter({
      ...network,
      services: network.services.map((service) => ({
        ...service,
        paths: service.paths.map((path) => ({ ...path, enabled: false })),
      })),
    }).findJourney("p0", "p1")).toBeNull();
  });

  it("changes route when transfer resistance changes", () => {
    const stations: RoutingStation[] = [
      { id: "o", position: [37.5, 126.9], routeIds: ["start"] },
      { id: "a1", position: [37.5, 126.91], routeIds: ["start"] },
      { id: "b1", position: [37.5, 126.92], routeIds: ["start"] },
      { id: "a2", position: [37.5002, 126.91], routeIds: ["a"] },
      { id: "b2", position: [37.5002, 126.92], routeIds: ["b"] },
      { id: "d", position: [37.5, 126.94], routeIds: ["a", "b"] },
    ];
    const service = (id: string, routeId: string, stopIds: string[]): RoutingService => ({
      id, routeId, kind: "local",
      paths: [{ id, coordinates: stopIds.map((stopId) => stations.find((station) => station.id === stopId)!.position) }],
      stopStationIds: stopIds, speedKph: 35, headwayMin: 3, crowding: 0.6,
    });
    const base = {
      stations,
      services: [
        service("start:local", "start", ["o", "a1", "b1"]),
        service("a:local", "a", ["a2", "d"]),
        service("b:local", "b", ["b2", "d"]),
      ],
    };
    const viaA = new TransitRouter({
      ...base,
      transfers: [
        { id: "ta", stationIds: ["a1", "a2"], walkMin: 2, resistance: 1 },
        { id: "tb", stationIds: ["b1", "b2"], walkMin: 2, resistance: 100 },
      ],
    }).findJourney("o", "d");
    const viaB = new TransitRouter({
      ...base,
      transfers: [
        { id: "ta", stationIds: ["a1", "a2"], walkMin: 2, resistance: 100 },
        { id: "tb", stationIds: ["b1", "b2"], walkMin: 2, resistance: 1 },
      ],
    }).findJourney("o", "d");
    expect(viaA?.transferStationIds).toContain("a1");
    expect(viaB?.transferStationIds).toContain("b1");
  });

  it("compares local and express cost", () => {
    const stations: RoutingStation[] = [
      { id: "a", position: [37.5, 126.9], routeIds: ["x"] },
      { id: "b", position: [37.5, 126.93], routeIds: ["x"] },
      { id: "c", position: [37.5, 126.96], routeIds: ["x"] },
    ];
    const router = new TransitRouter({
      stations,
      transfers: [],
      services: [
        { id: "x:local", routeId: "x", kind: "local", paths: [{ id: "local", coordinates: stations.map((s) => s.position) }], stopStationIds: ["a", "b", "c"], speedKph: 25, headwayMin: 4, crowding: 0.8 },
        { id: "x:express", routeId: "x", kind: "express", paths: [{ id: "express", coordinates: stations.map((s) => s.position) }], stopStationIds: ["a", "c"], speedKph: 65, headwayMin: 5, crowding: 0.7 },
      ],
    });
    expect(router.findJourney("a", "c")?.legs[0].serviceKind).toBe("express");
  });

  it("keeps the structural cache while repricing headway changes", () => {
    const network = chainNetwork(1);
    const router = new TransitRouter(network);
    const before = router.findJourney("p0", "p1")!;
    const changed = {
      ...network,
      services: network.services.map((service) => ({ ...service, headwayMin: 12 })),
    };
    expect(buildNetworkSignature(changed)).toBe(buildNetworkSignature(network));
    router.updateOperatingState(changed.services);
    const after = router.findJourney("p0", "p1")!;
    expect(router.getCacheSize()).toBe(1);
    expect(after.serviceIds).toEqual(before.serviceIds);
    expect(after.waitTimeMin).toBeGreaterThan(before.waitTimeMin);
  });
});
