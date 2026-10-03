import type { ConnectionBlueprint, JunctionBlueprint } from "../routeBlueprints.ts";
import type { LineExtensionPayload } from "../lineExtension.ts";
import type { RoutePlanningSession } from "../routePlanning.ts";
import type { Depot, RouteSegment } from "./networkTypes.ts";

export type PlanStatus = "draft" | "review" | "insufficient" | "ready" | "partial" | "completed" | "on-hold";
export type PlanPriority = "low" | "normal" | "high" | "critical";

export interface PlannedRoute {
  id: string;
  name: string;
  color: string;
  coordinates: Array<[number, number]>;
  segments: RouteSegment[];
  completedSegmentIds: string[];
  expectedCost: number;
  constructionDays: number;
  expectedDemand: number;
  expectedRevenue: number;
  transferEffect: number;
  actualExtension?: { routeId: string; atStart: boolean };
  actualRouteId?: string;
  operationKind?: "new-line" | "extension";
  rootLineId?: string;
  targetLineId?: string;
  parentBlueprintId?: string;
  extensionAtStart?: boolean;
  branches?: Array<{ branchId: string; junctionNodeId: string; segmentIds: string[] }>;
}

export interface PlannedStation {
  id: string;
  name: string;
  position: [number, number];
  plannedRouteIds: string[];
  actualRouteIds: string[];
  expectedDemand: number;
  completed: boolean;
  actualStationId?: string;
}

export interface PlannedDepot {
  id: string;
  name: string;
  polygon: Depot["polygon"];
  connectedPlannedRouteIds: string[];
  connectedActualRouteIds: string[];
  expectedCost: number;
  constructionDays: number;
  capacity: number;
  completed: boolean;
  actualDepotId?: string;
}

export interface PlannedTransfer {
  id: string;
  stationIds: string[];
  actualStationIds?: string[];
  expectedEffect: number;
  completed: boolean;
}

export interface ManualTransferEndpoint {
  kind: "actual" | "planned";
  id: string;
}

export interface ConstructionPlan {
  id: string;
  name: string;
  cityId: "seoul" | "busan" | "daejeon" | "gwangju";
  routes: PlannedRoute[];
  stations: PlannedStation[];
  depots: PlannedDepot[];
  transfers: PlannedTransfer[];
  connections?: ConnectionBlueprint[];
  junctions?: JunctionBlueprint[];
  routePlanningDrafts?: RoutePlanningSession[];
  expectedTotalCost: number;
  remainingCost: number;
  expectedConstructionDays: number;
  expectedDemand: number;
  expectedRevenue: number;
  terrainDifficulty: number;
  transferEffect: number;
  createdAt: number;
  priority: PlanPriority;
  notes: string;
  status: PlanStatus;
}
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
  pendingPlanAddition?: { route: PlannedRoute; segmentIds: string[] };
  dependsOnProjectId?: string; blueprintId?: string; junctionBlueprint?: JunctionBlueprint;
}
