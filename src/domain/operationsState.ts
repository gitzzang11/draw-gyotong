import type { OperatingService } from "../operatingService.ts";

export type TrainFleet = {
  id: string;
  routeId: string;
  serviceId?: string;
  trainType: import("./trainTypes").TrainType;
  cars: number;
  sets: number;
  capacity: number;
  purchaseCost: number;
  maintenanceCost: number;
};

export type ExpressConfig = {
  routeId: string;
  unlocked: boolean;
  enabled: boolean;
  stopStationIds: string[];
  unlockCost: number;
  extraOperatingCost: number;
};

export interface OperationsStateValue {
  fleets: readonly TrainFleet[];
  services: readonly OperatingService[];
  expressConfigs: readonly ExpressConfig[];
}

const emptyOperationsState = (): OperationsStateValue => ({ fleets: [], services: [], expressConfigs: [] });

export class OperationsState {
  private fleetItems: readonly TrainFleet[];
  private serviceItems: readonly OperatingService[];
  private expressConfigItems: readonly ExpressConfig[];

  constructor(initial: OperationsStateValue = emptyOperationsState()) {
    this.fleetItems = initial.fleets;
    this.serviceItems = initial.services;
    this.expressConfigItems = initial.expressConfigs;
  }

  get fleets(): readonly TrainFleet[] { return this.fleetItems; }
  get services(): readonly OperatingService[] { return this.serviceItems; }
  get expressConfigs(): readonly ExpressConfig[] { return this.expressConfigItems; }

  set fleets(fleets: readonly TrainFleet[]) { this.replaceFleets(fleets); }
  set services(services: readonly OperatingService[]) { this.replaceServices(services); }
  set expressConfigs(expressConfigs: readonly ExpressConfig[]) { this.replaceExpressConfigs(expressConfigs); }

  replace(state: OperationsStateValue): void {
    this.fleetItems = state.fleets;
    this.serviceItems = state.services;
    this.expressConfigItems = state.expressConfigs;
  }

  replaceFleets(fleets: readonly TrainFleet[]): void { this.fleetItems = fleets; }
  replaceServices(services: readonly OperatingService[]): void { this.serviceItems = services; }
  replaceExpressConfigs(expressConfigs: readonly ExpressConfig[]): void { this.expressConfigItems = expressConfigs; }

  reset(): void { this.replace(emptyOperationsState()); }

  snapshot(): { fleets: TrainFleet[]; services: OperatingService[]; expressConfigs: ExpressConfig[] } {
    return {
      fleets: [...this.fleetItems],
      services: [...this.serviceItems],
      expressConfigs: [...this.expressConfigItems],
    };
  }
}
