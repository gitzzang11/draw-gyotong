export type ConstructionMode = "bridge" | "tunnel";
export type RouteNodeKind = "endpoint" | "control" | "branch" | "merge";
export interface RouteNode { id: string; position: [number, number]; kind: RouteNodeKind }
export interface RouteSegment {
  id: string; fromNodeId: string; toNodeId: string; coordinates: Array<[number, number]>;
  lengthKm: number; terrainImpact: { riverCrossings: number; mountainSegments: number };
  constructionMode: ConstructionMode; constructionCost: number; enabled: boolean;
  riverCrossings?: Array<{ id: string; position: [number, number]; mode: ConstructionMode; cost: number }>;
  mountainLengthKm?: number; constructionDays?: number;
}
export interface Branch { id: string; name: string; junctionNodeId: string; terminalNodeId: string; segmentIds: string[]; dispatchWeight: number }
export interface ServicePattern { id: string; name: string; kind: "local" | "express"; branchIds: string[]; enabled: boolean; dispatchMode: "equal" }
export interface RouteLine {
  id: string; name: string; color: string; coordinates: Array<[number, number]>; lengthKm: number;
  constructionCost: number; riverCrossings: number; mountainSegments: number; riverMode: ConstructionMode;
  disabledSegments?: number[]; nodes?: RouteNode[]; segments?: RouteSegment[]; branches?: Branch[];
  servicePatterns?: ServicePattern[]; visibility?: "public" | "planning";
  localServiceEnabled?: boolean; expressServiceEnabled?: boolean; operationPaused?: boolean;
}
export interface Station {
  id: string; name: string; position: [number, number]; demand: number;
  potentialDemand?: number; realizedDemand?: number; transitCaptureRate?: number;
  connectedRouteIds: string[]; routeNodeIds?: string[]; transferGroupId?: string;
}
export interface TransferGroup {
  id: string; stationIds: string[]; distanceM: number; transferTimeMin: number;
  congestion: number; resistance: number; automatic: boolean;
}
export interface Depot {
  id: string; name: string; polygon: Array<[number, number]>; areaHa: number; capacity: number;
  maintenanceCost: number; connectedRouteIds: string[]; level: number;
  constructionCost?: number; constructionDays?: number;
}

