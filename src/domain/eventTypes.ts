export type NewsEventKind =
  | "festival" | "concert" | "sports" | "tourism" | "new-town" | "university"
  | "commercial-growth" | "heavy-rain" | "heavy-snow" | "roadworks"
  | "demand-decline" | "operating-cost" | "construction-delay" | "recession";
export type NewsEventAction = "add-service" | "review-area" | "review-fare" | "review-construction";
export interface NewsEvent {
  id: string; kind: NewsEventKind; tone: "opportunity" | "change"; title: string; summary: string;
  regionName: string; position: [number, number]; startedDay: number; durationDays: number;
  demandMultiplier: number; operatingCostMultiplier: number; relatedStationIds: string[];
  relatedRouteIds: string[]; action: NewsEventAction; actionLabel: string; read: boolean; responsePrepared: boolean;
}

