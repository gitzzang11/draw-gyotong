import type { UpdateDomain } from "../updateScheduler.ts";
import type { NewsEvent } from "../domain/eventTypes.ts";

export type CoordinatedEvent = Pick<NewsEvent, "id" | "kind" | "startedDay" | "durationDays">;

export interface EventDayResult<T> {
  events: T[];
  started: T[];
  expiredIds: string[];
  updateDomains: UpdateDomain[];
}

export interface EventCoordinatorOptions<T extends CoordinatedEvent> {
  create(day: number, seed: number): T;
  affectsDemand(event: T): boolean;
  affectsFinance(event: T): boolean;
  minimumGapDays?: number;
  maximumActive?: number;
  maximumHistory?: number;
}

export class EventCoordinator<T extends CoordinatedEvent> {
  private updating = false;
  constructor(private readonly options: EventCoordinatorOptions<T>) {}

  advanceDay(events: readonly T[], day: number, seed: number): EventDayResult<T> {
    if (this.updating) return { events: [...events], started: [], expiredIds: [], updateDomains: [] };
    this.updating = true;
    try {
      const expiredIds = events
        .filter((event) => day >= event.startedDay + event.durationDays)
        .map((event) => event.id);
      const active = events.filter((event) => day < event.startedDay + event.durationDays);
      const latest = events.reduce((value, event) => Math.max(value, event.startedDay), -Infinity);
      const canStart = active.length < (this.options.maximumActive ?? 3)
        && (events.length === 0 || day - latest >= (this.options.minimumGapDays ?? 4));
      const started = canStart ? [this.options.create(day, seed)] : [];
      const next = [...events, ...started].slice(-(this.options.maximumHistory ?? 80));
      const domains = new Set<UpdateDomain>();
      if (started.length > 0 || expiredIds.length > 0) domains.add("notifications");
      if (started.some(this.options.affectsDemand) || events.filter((event) => expiredIds.includes(event.id)).some(this.options.affectsDemand)) domains.add("demand");
      if (started.some(this.options.affectsFinance) || events.filter((event) => expiredIds.includes(event.id)).some(this.options.affectsFinance)) domains.add("finance");
      return { events: next, started, expiredIds, updateDomains: [...domains] };
    } finally {
      this.updating = false;
    }
  }
}
