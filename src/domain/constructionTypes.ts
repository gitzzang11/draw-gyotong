import type { JunctionBlueprint } from "../routeBlueprints.ts";
import type { LineExtensionPayload } from "../lineExtension.ts";
export type ConstructionProjectStatus = "planned" | "scheduled" | "building" | "opening-ready" | "operating";
export type ConstructionProjectKind = "route" | "extension" | "branch" | "repair" | "edit" | "station" | "depot" | "plan";
export interface ConstructionProjectEvent {
  id: string; kind: "delay" | "extra-cost"; triggerDay: number; delayDays?: number;
  extraCost?: number; message: string; applied: boolean;
}
export interface ConstructionProject {
  id: string; name: string; kind: ConstructionProjectKind; status: ConstructionProjectStatus;
  routeIds: string[]; stationIds: string[]; depotIds: string[]; coordinates: Array<[number, number]>;
  startedDay: number; durationDays: number; elapsedDays: number; expectedCompletionDay: number;
  baseCost: number; additionalCost: number; delayDays: number; events: ConstructionProjectEvent[];
  sourcePlanId?: string; openedAtDay?: number; pendingExtension?: LineExtensionPayload;
  dependsOnProjectId?: string; blueprintId?: string; junctionBlueprint?: JunctionBlueprint;
}
