import type { UpdateDomain } from "../updateScheduler.ts";
import type { NewsEvent } from "../domain/eventTypes.ts";

export interface EventRuntimeResult<TNews> {
  startedEventIds: string[];
  expiredEventIds: string[];
  updateDomains: UpdateDomain[];
  newsEvents: TNews[];
  requiresSave: boolean;
  error?: unknown;
}

export class EventRuntimeAdapter<TEvent extends Pick<NewsEvent, "id">, TSnapshot, TNews> {
  process(input: {
    started: readonly TEvent[];
    expiredIds: readonly string[];
    domains: readonly UpdateDomain[];
    capture(): TSnapshot;
    restore(snapshot: TSnapshot): void;
    applyStarted(event: TEvent): void;
    removeExpired(id: string): void;
    toNews(event: TEvent): TNews;
  }): EventRuntimeResult<TNews> {
    const snapshot = input.capture();
    try {
      input.started.forEach(input.applyStarted);
      input.expiredIds.forEach(input.removeExpired);
      return {
        startedEventIds: input.started.map((event) => event.id),
        expiredEventIds: [...input.expiredIds],
        updateDomains: [...new Set(input.domains)],
        newsEvents: input.started.map(input.toNews),
        requiresSave: input.started.length + input.expiredIds.length > 0,
      };
    } catch (error) {
      input.restore(snapshot);
      return { startedEventIds: [], expiredEventIds: [], updateDomains: [], newsEvents: [], requiresSave: false, error };
    }
  }
}
