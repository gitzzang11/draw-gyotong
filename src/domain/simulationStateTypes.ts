import type { TransitJourney } from "../transitRouting.ts";
export interface PassengerGroup {
  id: string; originStationId: string; destinationStationId: string; people: number; routeIds: string[];
  distanceKm: number; transferResistance: number; waitMin: number; crowding: number;
  satisfaction: number; activeDemand: number; journey?: TransitJourney;
}

