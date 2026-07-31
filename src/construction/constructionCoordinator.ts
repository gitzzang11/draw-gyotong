import type { UpdateDomain } from "../updateScheduler.ts";
import type { ConstructionProject } from "../domain/constructionTypes.ts";

export type CoordinatedConstructionProject = Pick<
  ConstructionProject,
  "id" | "kind" | "status" | "elapsedDays" | "durationDays" | "delayDays" | "dependsOnProjectId"
>;

export interface ConstructionCompletion {
  projectId: string;
  kind: string;
  networkChanged: boolean;
}

export interface ConstructionDayResult<T> {
  projects: T[];
  completed: ConstructionCompletion[];
  changedProjectIds: string[];
  updateDomains: UpdateDomain[];
  immediateSave: boolean;
}

const networkKinds = new Set(["extension", "branch", "junction", "transfer", "physical-connection", "merge"]);

export class ConstructionCoordinator<T extends CoordinatedConstructionProject> {
  private commitInProgress = false;

  advanceDay(
    projects: readonly T[],
    options: {
      prepare?: (project: T) => T;
      onStarted?: (project: T) => void;
      applyCompletion?: (project: T) => void;
      requiresOpening?: (project: T) => boolean;
      networkChanged?: (project: T) => boolean;
    } = {},
  ): ConstructionDayResult<T> {
    if (this.commitInProgress) return this.empty(projects);
    this.commitInProgress = true;
    try {
      const completed: ConstructionCompletion[] = [];
      const changedProjectIds: string[] = [];
      const operatingIds = new Set(projects.filter((project) => project.status === "operating").map((project) => project.id));
      const next = projects.map((project) => {
        if (!["scheduled", "building"].includes(project.status)) return project;
        if (project.dependsOnProjectId && !operatingIds.has(project.dependsOnProjectId)) {
          return project;
        }
        if (project.status === "scheduled") options.onStarted?.(project);
        const prepared = options.prepare?.(project) ?? project;
        const elapsedDays = prepared.elapsedDays + 1;
        const requiresOpening = options.requiresOpening?.(prepared) ?? networkKinds.has(prepared.kind);
        const status = elapsedDays >= prepared.durationDays + prepared.delayDays
          ? (requiresOpening ? "opening-ready" : "operating")
          : "building";
        const updated = { ...prepared, elapsedDays, status } as T;
        changedProjectIds.push(project.id);
        if (status === "operating" || status === "opening-ready") {
          options.applyCompletion?.(updated);
          completed.push({
            projectId: project.id,
            kind: project.kind,
            networkChanged: options.networkChanged?.(updated) ?? networkKinds.has(project.kind),
          });
        }
        return updated;
      });
      const networkChanged = completed.some((item) => item.networkChanged);
      const updateDomains: UpdateDomain[] = networkChanged
        ? ["network", "routes", "demand", "capacity", "congestion", "map-lines", "map-stations", "map-construction", "active-panel", "storage"]
        : ["map-construction", "active-panel", "workflow", "storage"];
      return { projects: next, completed, changedProjectIds, updateDomains, immediateSave: completed.length > 0 };
    } finally {
      this.commitInProgress = false;
    }
  }

  private empty(projects: readonly T[]): ConstructionDayResult<T> {
    return { projects: [...projects], completed: [], changedProjectIds: [], updateDomains: [], immediateSave: false };
  }
}
