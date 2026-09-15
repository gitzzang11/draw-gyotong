import { describe, expect, it } from "vitest";
import type { Depot, RouteLine, Station, TransferGroup } from "../src/domain/networkTypes";
import { NetworkState } from "../src/domain/networkState";

const route = { id: "route-1" } as RouteLine;
const station = { id: "station-1" } as Station;
const transfer = { id: "transfer-1" } as TransferGroup;
const depot = { id: "depot-1" } as Depot;

describe("NetworkState", () => {
  it("replaces the coherent network aggregate together", () => {
    const network = new NetworkState();

    network.replace({
      routes: [route],
      stations: [station],
      transfers: [transfer],
      depots: [depot],
    });

    expect(network.routes).toEqual([route]);
    expect(network.stations).toEqual([station]);
    expect(network.transfers).toEqual([transfer]);
    expect(network.depots).toEqual([depot]);
  });

  it("supports focused replacement and coherent reset", () => {
    const network = new NetworkState({
      routes: [route],
      stations: [station],
      transfers: [transfer],
      depots: [depot],
    });

    network.replaceRoutes([]);
    network.replaceStations([]);
    network.replaceTransfers([]);
    network.replaceDepots([]);

    expect(network.snapshot()).toEqual({
      routes: [],
      stations: [],
      transfers: [],
      depots: [],
    });

    network.replace({ routes: [route], stations: [station], transfers: [transfer], depots: [depot] });
    network.reset();

    expect(network.snapshot()).toEqual({
      routes: [],
      stations: [],
      transfers: [],
      depots: [],
    });
  });
});
