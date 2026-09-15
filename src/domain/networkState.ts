import type { Depot, RouteLine, Station, TransferGroup } from "./networkTypes";

export interface NetworkStateValue {
  routes: readonly RouteLine[];
  stations: readonly Station[];
  transfers: readonly TransferGroup[];
  depots: readonly Depot[];
}

const emptyNetworkState = (): NetworkStateValue => ({
  routes: [],
  stations: [],
  transfers: [],
  depots: [],
});

export class NetworkState {
  private routeItems: readonly RouteLine[];
  private stationItems: readonly Station[];
  private transferItems: readonly TransferGroup[];
  private depotItems: readonly Depot[];

  constructor(initial: NetworkStateValue = emptyNetworkState()) {
    this.routeItems = initial.routes;
    this.stationItems = initial.stations;
    this.transferItems = initial.transfers;
    this.depotItems = initial.depots;
  }

  get routes(): readonly RouteLine[] {
    return this.routeItems;
  }

  set routes(routes: readonly RouteLine[]) {
    this.replaceRoutes(routes);
  }

  get stations(): readonly Station[] {
    return this.stationItems;
  }

  set stations(stations: readonly Station[]) {
    this.replaceStations(stations);
  }

  get transfers(): readonly TransferGroup[] {
    return this.transferItems;
  }

  set transfers(transfers: readonly TransferGroup[]) {
    this.replaceTransfers(transfers);
  }

  get depots(): readonly Depot[] {
    return this.depotItems;
  }

  set depots(depots: readonly Depot[]) {
    this.replaceDepots(depots);
  }

  replace(state: NetworkStateValue): void {
    this.routeItems = state.routes;
    this.stationItems = state.stations;
    this.transferItems = state.transfers;
    this.depotItems = state.depots;
  }

  replaceRoutes(routes: readonly RouteLine[]): void {
    this.routeItems = routes;
  }

  replaceStations(stations: readonly Station[]): void {
    this.stationItems = stations;
  }

  replaceTransfers(transfers: readonly TransferGroup[]): void {
    this.transferItems = transfers;
  }

  replaceDepots(depots: readonly Depot[]): void {
    this.depotItems = depots;
  }

  reset(): void {
    this.replace(emptyNetworkState());
  }

  snapshot(): { routes: RouteLine[]; stations: Station[]; transfers: TransferGroup[]; depots: Depot[] } {
    return {
      routes: [...this.routeItems],
      stations: [...this.stationItems],
      transfers: [...this.transferItems],
      depots: [...this.depotItems],
    };
  }
}
