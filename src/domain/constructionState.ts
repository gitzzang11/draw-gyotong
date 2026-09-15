import type { ConstructionPlan, ConstructionProject } from "./constructionTypes.ts";

export interface ConstructionStateValue {
  plans: readonly ConstructionPlan[];
  projects: readonly ConstructionProject[];
}

const emptyConstructionState = (): ConstructionStateValue => ({ plans: [], projects: [] });

export class ConstructionState {
  private planItems: readonly ConstructionPlan[];
  private projectItems: readonly ConstructionProject[];

  constructor(initial: ConstructionStateValue = emptyConstructionState()) {
    this.planItems = initial.plans;
    this.projectItems = initial.projects;
  }

  get plans(): readonly ConstructionPlan[] { return this.planItems; }
  get projects(): readonly ConstructionProject[] { return this.projectItems; }

  replace(state: ConstructionStateValue): void {
    this.planItems = state.plans;
    this.projectItems = state.projects;
  }

  replacePlans(plans: readonly ConstructionPlan[]): void { this.planItems = plans; }
  replaceProjects(projects: readonly ConstructionProject[]): void { this.projectItems = projects; }

  reset(): void { this.replace(emptyConstructionState()); }

  snapshot(): { plans: ConstructionPlan[]; projects: ConstructionProject[] } {
    return { plans: [...this.planItems], projects: [...this.projectItems] };
  }
}
