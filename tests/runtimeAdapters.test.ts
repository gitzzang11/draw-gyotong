import { describe, expect, it, vi } from "vitest";
import { NetworkInvalidation } from "../src/routing/networkInvalidation.ts";
import { RuntimeResultDispatcher } from "../src/runtime/runtimeResultDispatcher.ts";
import { DailySettlementRuntime } from "../src/runtime/dailySettlementRuntime.ts";
import { EventRuntimeAdapter } from "../src/events/eventRuntimeAdapter.ts";
import { DailySettlementService } from "../src/simulation/finance/dailySettlement.ts";

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

describe("DailySettlementRuntime", () => {
  it("finalizes demand, calculates once and restores a failed settlement", () => {
    let economy = { cash: 10, fare: 1, autoFare: false, revenue: 0, maintenance: 0, constructionSpent: 0, trainSpent: 0, loanBalance: 0, satisfaction: 50, demand: 0 };
    let statistics = { totalPassengers: 0, totalLoanRepaid: 0, dailyRecords: [] as Array<{ day: number; revenue: number; expenses: number; passengers: number; satisfaction: number; transitShare: number; assets: number; liabilities: number }> };
    const service = new DailySettlementService();
    const calculate = vi.spyOn(service, "calculate");
    const runtime = new DailySettlementRuntime<{ day: number }, { lastSettledGameDay?: number }>();
    const context = {
      service,
      getGameDay: () => 2,
      getLastSettledGameDay: () => -1,
      hasDailyRecord: (day: number) => statistics.dailyRecords.some((record) => record.day === day),
      getGameMode: () => "career" as const,
      getBankruptcyLimit: () => -1000,
      getEconomy: () => economy,
      getLoans: () => [],
      getStatistics: () => statistics,
      getPassengerGroups: () => [],
      captureAuxiliary: () => ({ analysis: { day: 1 }, meta: {}, constructionProjects: [], stationDemandStates: [] }),
      restoreState: (snapshot: { economy: typeof economy; statistics: typeof statistics }) => { economy = snapshot.economy; statistics = snapshot.statistics; },
      prepareDay: () => ({ forecast: { revenue: 20, demand: 3, satisfaction: 60, crowding: 0, waitMin: 0 }, maintenance: { trains: 1, depots: 1, express: 0 }, constructionCostDue: 0, financesBefore: { transitShare: 0, assets: 10 }, totalPotential: 1, totalRealized: 1 }),
      applyCommittedState: (state: { economy: typeof economy; statistics: typeof statistics }) => { economy = state.economy; statistics = state.statistics; },
      commitDay: () => ({ newsEvents: [] }),
    };
    const result = runtime.settleDay(context);
    expect(result.applied).toBe(true);
    expect(result.requiresImmediateSave).toBe(true);
    expect(calculate).toHaveBeenCalledOnce();
    const duplicate = runtime.settleDay(context);
    expect(duplicate.status).toBe("already-settled");
    expect(calculate).toHaveBeenCalledOnce();
    expect(result.updateDomains).not.toContain("network");
    expect(result.updateDomains.some((domain) => domain.startsWith("map-"))).toBe(false);
    const moneyBeforeFailure = economy.cash;
    const failed = runtime.settleDay({ ...context, getGameDay: () => 3, prepareDay: () => { economy = { ...economy, cash: 999 }; throw new Error("fail"); } });
    expect(failed.error).toBeInstanceOf(Error);
    expect(economy.cash).toBe(moneyBeforeFailure);
  });
});

describe("event runtime adapter", () => {
  it("rolls event state back on failure", () => {
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
