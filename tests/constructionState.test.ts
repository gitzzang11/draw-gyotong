import { describe, expect, it } from "vitest";
import type { ConstructionPlan, ConstructionProject } from "../src/domain/constructionTypes";
import { ConstructionState } from "../src/domain/constructionState";

const plan = { id: "plan-1" } as ConstructionPlan;
const project = { id: "project-1" } as ConstructionProject;

describe("ConstructionState", () => {
  it("replaces plans and projects as one coherent state boundary", () => {
    const state = new ConstructionState();

    state.replace({ plans: [plan], projects: [project] });

    expect(state.plans).toEqual([plan]);
    expect(state.projects).toEqual([project]);
    expect(state.snapshot()).toEqual({ plans: [plan], projects: [project] });
  });

  it("resets both construction collections together", () => {
    const state = new ConstructionState({ plans: [plan], projects: [project] });

    state.reset();

    expect(state.snapshot()).toEqual({ plans: [], projects: [] });
  });
});
