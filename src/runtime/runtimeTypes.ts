import type { UpdateDomain, UpdateReason } from "../updateScheduler.ts";

export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

export interface RuntimeUpdateRequest {
  domains: UpdateDomain[];
  reason: UpdateReason;
  selectedId?: string;
}

export interface SimulationTickResult {
  previousTime: number;
  currentTime: number;
  gameDayChanged: boolean;
  changedTrainIds: string[];
  changedConstructionIds: string[];
  expiredEventIds: string[];
  updateDomains: UpdateDomain[];
}

