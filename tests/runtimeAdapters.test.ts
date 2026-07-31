import { describe, expect, it, vi } from "vitest";
import { NetworkInvalidation } from "../src/routing/networkInvalidation.ts";
import { RuntimeResultDispatcher } from "../src/runtime/runtimeResultDispatcher.ts";
import { captureRuntimeSlice, restoreRuntimeSlice } from "../src/runtime/runtimeStateSnapshot.ts";
import { DailySettlementRuntime } from "../src/runtime/dailySettlementRuntime.ts";
import { ConstructionRuntimeAdapter } from "../src/construction/constructionRuntimeAdapter.ts";
import { EventRuntimeAdapter } from "../src/events/eventRuntimeAdapter.ts";

describe("NetworkInvalidation", () => {
  it("increments only for structural changes and merges one evaluation", () => {
    const invalidation = new NetworkInvalidation();
    expect(invalidation.evaluate(["color", "settlement", "non-connected-crossing"]).generation).toBe(0);
    const structural = invalidation.evaluate(["transfer-add", "junction"], ["a", "a"], ["e"]);
    expect(structural).toMatchObject({ generation: 1, rebuildRouter: true, changedNodeIds: ["a"] });
  });
});

describe("RuntimeResultDispatcher", () => {
  it("merges domains, news, router invalidation and immediate save once", async () => {
    const updates = vi.fn();
    const save = vi.fn();
    const invalidate = vi.fn();
    const dispatcher = new RuntimeResultDispatcher<{ id: string }>({
      requestUpdates: updates, requestSave: save, invalidateNetwork: invalidate,
      appendNews: (events) => events.length > 0, reportError: vi.fn(),
    });
    await dispatcher.dispatch([
      { updateDomains: ["hud-status"], requiresSave: true, newsEvents: [{ id: "n" }] },
      { updateDomains: ["hud-status", "map-lines"], requiresImmediateSave: true, newsEvents: [{ id: "n" }], routerRebuildRequired: true },
    ]);
    expect(updates).toHaveBeenCalledWith(["hud-status", "map-lines", "notifications"]);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("immediate");
    expect(invalidate).toHaveBeenCalledOnce();
  });
});

describe("RuntimeStateSnapshot", () => {
  it("restores only selected domains", () => {
    const state = { money: 10, loans: [1], map: "keep" };
    const snapshot = captureRuntimeSlice(state, ["money", "loans"] as const);
    const restored = restoreRuntimeSlice({ money: 0, loans: [], map: "changed" }, snapshot, ["money", "loans"] as const);
    expect(restored).toEqual({ money: 10, loans: [1], map: "changed" });
  });
});

describe("DailySettlementRuntime", () => {
  it("finalizes demand, calculates once and restores a failed settlement", () => {
    let money = 10;
    const calculate = vi.fn(() => ({ total: 3 }));
    const runtime = new DailySettlementRuntime<number, { day: number }, { total: number }, { applied: boolean }>();
    const result = runtime.settleDay({
      getTargetDay: () => 2, wasSettled: () => false, capture: () => money,
      restore: (snapshot) => { money = snapshot; }, finalizeDemand: () => { money = 20; },
      buildInput: (day) => ({ day }), calculate, validate: () => undefined,
      apply: () => ({ applied: true }), wasApplied: (applied) => applied.applied,
      commit: () => [],
    });
    expect(result.applied).toBe(true);
    expect(result.requiresImmediateSave).toBe(true);
    expect(calculate).toHaveBeenCalledOnce();
    const failed = runtime.settleDay({
      getTargetDay: () => 3, wasSettled: () => false, capture: () => money,
      restore: (snapshot) => { money = snapshot; }, finalizeDemand: () => { money = 99; },
      buildInput: () => ({ day: 3 }), calculate: () => { throw new Error("fail"); },
      validate: () => undefined, apply: () => ({ applied: false }), wasApplied: () => false, commit: () => [],
    });
    expect(failed.error).toBeInstanceOf(Error);
    expect(money).toBe(20);
  });
});

describe("construction and event runtime adapters", () => {
  it("deduplicates construction and rolls event state back on failure", () => {
    const construction = new ConstructionRuntimeAdapter<{ id: string }, number, { id: string }>();
    const input = { capture: () => 0, restore: vi.fn(), apply: () => ({ networkChanged: false, news: { id: "done" } }) };
    expect(construction.process([{ id: "p" }], input).routerRebuildRequired).toBe(false);
    expect(construction.process([{ id: "p" }], input).completedProjectIds).toEqual([]);
    let state = 1;
    const events = new EventRuntimeAdapter<{ id: string }, number, { id: string }>();
    const result = events.process({
      started: [{ id: "e" }], expiredIds: [], domains: ["demand"], capture: () => state,
      restore: (snapshot) => { state = snapshot; }, applyStarted: () => { state = 2; throw new Error("fail"); },
      removeExpired: () => undefined, toNews: (event) => event,
    });
    expect(result.error).toBeInstanceOf(Error);
    expect(state).toBe(1);
  });
});
