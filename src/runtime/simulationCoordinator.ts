import type { UpdateDomain } from "../updateScheduler.ts";
import type { SimulationTickResult } from "./runtimeTypes.ts";

export interface SimulationCoordinatorContext {
  getTime(): number;
  setTime(value: number): void;
  advanceTrains(deltaMinutes: number): string[];
  advancePassengers?(deltaMinutes: number): void;
  advanceConstruction?(deltaMinutes: number): string[];
  expireEvents?(currentTime: number): string[];
  getDay(time: number): number;
}

export class SimulationCoordinator {
  private tickInProgress = false;

  constructor(private readonly context: SimulationCoordinatorContext) {}

  advance(deltaMinutes: number): SimulationTickResult {
    const previousTime = this.context.getTime();
    if (this.tickInProgress || deltaMinutes <= 0) {
      return this.result(previousTime, previousTime, [], [], []);
    }
    this.tickInProgress = true;
    try {
      const currentTime = previousTime + deltaMinutes;
      this.context.setTime(currentTime);
      const changedTrainIds = this.context.advanceTrains(deltaMinutes);
      this.context.advancePassengers?.(deltaMinutes);
      const changedConstructionIds = this.context.advanceConstruction?.(deltaMinutes) ?? [];
      const expiredEventIds = this.context.expireEvents?.(currentTime) ?? [];
      return this.result(previousTime, currentTime, changedTrainIds, changedConstructionIds, expiredEventIds);
    } finally {
      this.tickInProgress = false;
    }
  }

  private result(
    previousTime: number,
    currentTime: number,
    changedTrainIds: string[],
    changedConstructionIds: string[],
    expiredEventIds: string[],
  ): SimulationTickResult {
    const domains = new Set<UpdateDomain>(["hud-clock"]);
    if (changedTrainIds.length > 0) domains.add("map-trains");
    if (changedConstructionIds.length > 0) domains.add("map-construction");
    if (expiredEventIds.length > 0) domains.add("notifications");
    return {
      previousTime,
      currentTime,
      gameDayChanged: this.context.getDay(previousTime) !== this.context.getDay(currentTime),
      changedTrainIds,
      changedConstructionIds,
      expiredEventIds,
      updateDomains: [...domains],
    };
  }
}

