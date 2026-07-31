import type { UpdateDomain } from "../updateScheduler.ts";
import type { ConstructionProject } from "../domain/constructionTypes.ts";

export interface ConstructionRuntimeResult<TNews> {
  completedProjectIds: string[];
  changedEntityIds: { lines: string[]; stations: string[]; segments: string[]; transfers: string[]; depots: string[] };
  networkChanged: boolean;
  routerRebuildRequired: boolean;
  updateDomains: UpdateDomain[];
  newsEvents: TNews[];
  requiresImmediateSave: boolean;
  error?: unknown;
}

export class ConstructionRuntimeAdapter<TProject extends Pick<ConstructionProject, "id">, TSnapshot, TNews> {
  private applied = new Set<string>();

  process(projects: readonly TProject[], input: {
    capture(): TSnapshot;
    restore(snapshot: TSnapshot): void;
    apply(project: TProject): { networkChanged: boolean; lines?: string[]; stations?: string[]; segments?: string[]; transfers?: string[]; depots?: string[]; news?: TNews };
  }): ConstructionRuntimeResult<TNews> {
    const pending = projects.filter((project) => !this.applied.has(project.id));
    const snapshot = input.capture();
    const ids = { lines: [] as string[], stations: [] as string[], segments: [] as string[], transfers: [] as string[], depots: [] as string[] };
    try {
      let networkChanged = false;
      const newsEvents: TNews[] = [];
      for (const project of pending) {
        const result = input.apply(project);
        networkChanged ||= result.networkChanged;
        for (const key of Object.keys(ids) as Array<keyof typeof ids>) ids[key].push(...(result[key] ?? []));
        if (result.news) newsEvents.push(result.news);
        this.applied.add(project.id);
      }
      const updateDomains: UpdateDomain[] = networkChanged
        ? ["network", "routes", "demand", "capacity", "congestion", "map-lines", "map-stations", "map-construction", "active-panel", "storage"]
        : ["map-construction", "active-panel", "storage"];
      return { completedProjectIds: pending.map((item) => item.id), changedEntityIds: ids, networkChanged, routerRebuildRequired: networkChanged, updateDomains, newsEvents, requiresImmediateSave: pending.length > 0 };
    } catch (error) {
      input.restore(snapshot);
      return { completedProjectIds: [], changedEntityIds: ids, networkChanged: false, routerRebuildRequired: false, updateDomains: [], newsEvents: [], requiresImmediateSave: false, error };
    }
  }
}
