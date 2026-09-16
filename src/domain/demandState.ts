import type { DemandZone, StationDemandState } from "../demandModel.ts";
import type { PassengerGroup } from "./simulationStateTypes.ts";

export type DemandStateSnapshot = {
  passengerGroups: PassengerGroup[];
  demandZones: DemandZone[];
  stationDemandStates: StationDemandState[];
};

/** Owns the persistent passenger and demand state used by the runtime. */
export class DemandState {
  private passengerGroupsState: readonly PassengerGroup[];
  private demandZonesState: readonly DemandZone[];
  private stationDemandStatesState: readonly StationDemandState[];

  constructor(
    passengerGroups: readonly PassengerGroup[] = [],
    demandZones: readonly DemandZone[] = [],
    stationDemandStates: readonly StationDemandState[] = [],
  ) {
    this.passengerGroupsState = passengerGroups;
    this.demandZonesState = demandZones;
    this.stationDemandStatesState = stationDemandStates;
  }

  get passengerGroups(): readonly PassengerGroup[] {
    return this.passengerGroupsState;
  }

  set passengerGroups(passengerGroups: readonly PassengerGroup[]) {
    this.passengerGroupsState = passengerGroups;
  }

  get demandZones(): readonly DemandZone[] {
    return this.demandZonesState;
  }

  set demandZones(demandZones: readonly DemandZone[]) {
    this.demandZonesState = demandZones;
  }

  get stationDemandStates(): readonly StationDemandState[] {
    return this.stationDemandStatesState;
  }

  set stationDemandStates(stationDemandStates: readonly StationDemandState[]) {
    this.stationDemandStatesState = stationDemandStates;
  }

  replace(state: DemandStateSnapshot): void {
    this.passengerGroupsState = state.passengerGroups;
    this.demandZonesState = state.demandZones;
    this.stationDemandStatesState = state.stationDemandStates;
  }

  reset(): void {
    this.replace({ passengerGroups: [], demandZones: [], stationDemandStates: [] });
  }

  snapshot(): DemandStateSnapshot {
    return {
      passengerGroups: [...this.passengerGroupsState],
      demandZones: [...this.demandZonesState],
      stationDemandStates: this.stationDemandStatesState.map((state) => ({ ...state })),
    };
  }
}
