import type { NewsEvent } from "../domain/eventTypes";
import { NewsService } from "./newsService";

export class NewsEventStateOwner {
  private events: NewsEvent[] = [];
  private readonly service: NewsService<NewsEvent>;

  constructor(maximumItems = 80) {
    this.service = new NewsService<NewsEvent>(maximumItems);
  }

  get current(): readonly NewsEvent[] {
    return this.events;
  }

  get length() {
    return this.events.length;
  }

  replace(events: NewsEvent[]) {
    this.events = events;
    return this.events;
  }

  reset() {
    this.events = [];
  }

  appendMany(events: readonly NewsEvent[]) {
    const previousEvents = this.events;
    for (const event of events) this.events = this.service.append(this.events, event);
    return this.events.length !== previousEvents.length
      || this.events.some((event, index) => event !== previousEvents[index]);
  }

  capture() {
    return this.events.map((event) => ({ ...event }));
  }

  restore(snapshot: NewsEvent[]) {
    this.events = snapshot;
  }

  findById(id?: string) {
    return this.events.find((event) => event.id === id);
  }

  markReadWhere(predicate: (event: NewsEvent) => boolean) {
    this.events = this.events.map((event) => (predicate(event) ? { ...event, read: true } : event));
  }

  prepareResponse(id: string) {
    this.events = this.events.map((event) => (
      event.id === id ? { ...event, responsePrepared: true, read: true } : event
    ));
  }
}
