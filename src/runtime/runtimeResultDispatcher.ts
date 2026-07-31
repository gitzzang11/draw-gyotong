import type { UpdateDomain } from "../updateScheduler.ts";

interface DispatchableRuntimeResult<TNews = unknown> {
  updateDomains?: readonly UpdateDomain[];
  newsEvents?: readonly TNews[];
  requiresSave?: boolean;
  requiresImmediateSave?: boolean;
  routerRebuildRequired?: boolean;
  error?: unknown;
}

interface RuntimeResultDispatcherContext<TNews> {
  requestUpdates(domains: UpdateDomain[]): void;
  requestSave(mode: "normal" | "immediate"): void | Promise<void>;
  appendNews(events: readonly TNews[]): boolean;
  invalidateNetwork(): void;
  reportError(error: unknown): void;
}

export class RuntimeResultDispatcher<TNews = unknown> {
  constructor(private readonly context: RuntimeResultDispatcherContext<TNews>) {}

  async dispatch(results: readonly DispatchableRuntimeResult<TNews>[]): Promise<void> {
    const domains = new Set<UpdateDomain>();
    const news = new Map<unknown, TNews>();
    let save: "normal" | "immediate" | null = null;
    let invalidate = false;
    for (const result of results) {
      result.updateDomains?.forEach((domain) => domains.add(domain));
      result.newsEvents?.forEach((event) => {
        const key = typeof event === "object" && event && "id" in event ? (event as { id: unknown }).id : event;
        news.set(key, event);
      });
      if (result.requiresImmediateSave) save = "immediate";
      else if (result.requiresSave && save !== "immediate") save = "normal";
      invalidate ||= Boolean(result.routerRebuildRequired);
      if (result.error) this.context.reportError(result.error);
    }
    if (news.size > 0 && this.context.appendNews([...news.values()])) domains.add("notifications");
    if (invalidate) this.context.invalidateNetwork();
    if (domains.size > 0) this.context.requestUpdates([...domains]);
    if (save) await this.context.requestSave(save);
  }
}
