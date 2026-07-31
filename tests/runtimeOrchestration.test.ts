import { describe, expect, it, vi } from "vitest";
import { GameLoopController } from "../src/runtime/gameLoopController.ts";
import { SimulationCoordinator } from "../src/runtime/simulationCoordinator.ts";
import { ConstructionCoordinator } from "../src/construction/constructionCoordinator.ts";
import { EventCoordinator } from "../src/events/eventCoordinator.ts";
import { NewsService } from "../src/events/newsService.ts";
import { StateRecoveryCoordinator } from "../src/runtime/stateRecoveryCoordinator.ts";
import { BootstrapController } from "../src/runtime/bootstrap.ts";

function frameHarness() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    scheduler: {
      request(callback: FrameRequestCallback) {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
      cancel(id: number) {
        callbacks.delete(id);
      },
    },
    run(timestamp: number) {
      const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) return;
      callbacks.delete(entry[0]);
      entry[1](timestamp);
    },
    count: () => callbacks.size,
  };
}

describe("GameLoopController", () => {
  it("starts once and cancels its owned frame on stop", () => {
    const frames = frameHarness();
    const loop = new GameLoopController({
      scheduler: frames.scheduler,
      advanceSimulationTick: () => ({
        previousTime: 0, currentTime: 1, gameDayChanged: false,
        changedTrainIds: [], changedConstructionIds: [], expiredEventIds: [], updateDomains: ["hud-clock"],
      }),
      onGameDayChanged: vi.fn(),
      requestRenderDomains: vi.fn(),
      onRuntimeError: vi.fn(),
    });
    expect(loop.start()).toBe(true);
    expect(loop.start()).toBe(false);
    expect(frames.count()).toBe(1);
    loop.stop();
    expect(frames.count()).toBe(0);
  });

  it("does not tick while paused and merges an x8 frame into one render request", () => {
    const frames = frameHarness();
    const advance = vi.fn(() => ({
      previousTime: 0, currentTime: 8, gameDayChanged: false,
      changedTrainIds: ["t"], changedConstructionIds: [], expiredEventIds: [],
      updateDomains: ["map-trains", "hud-clock"] as const,
    }));
    const render = vi.fn();
    const loop = new GameLoopController({
      scheduler: frames.scheduler,
      advanceSimulationTick: advance,
      onGameDayChanged: vi.fn(),
      requestRenderDomains: render,
      onRuntimeError: vi.fn(),
      renderIntervalMs: 0,
    });
    loop.setSpeed(8);
    loop.start();
    frames.run(0);
    frames.run(1000);
    expect(advance).toHaveBeenLastCalledWith(8);
    expect(render).toHaveBeenCalledTimes(2);
    loop.pause();
    frames.run(2000);
    expect(advance).toHaveBeenCalledTimes(2);
  });

  it("delivers a date boundary once and clamps tab-return delta", () => {
    const frames = frameHarness();
    const day = vi.fn();
    const advance = vi.fn((delta: number) => ({
      previousTime: 1439, currentTime: 1440, gameDayChanged: true,
      changedTrainIds: [], changedConstructionIds: [], expiredEventIds: [], updateDomains: ["hud-clock"] as const,
    }));
    const loop = new GameLoopController({
      scheduler: frames.scheduler,
      advanceSimulationTick: advance,
      onGameDayChanged: day,
      requestRenderDomains: vi.fn(),
      onRuntimeError: vi.fn(),
    });
    loop.start();
    frames.run(0);
    frames.run(60_000);
    expect(advance).toHaveBeenLastCalledWith(1);
    expect(day).toHaveBeenCalledTimes(1);
  });
});

describe("SimulationCoordinator", () => {
  it("advances in deterministic order and returns only changed domains", () => {
    let time = 1439;
    const order: string[] = [];
    const coordinator = new SimulationCoordinator({
      getTime: () => time,
      setTime: (value) => { order.push("time"); time = value; },
      advanceTrains: () => { order.push("trains"); return ["train-1"]; },
      advancePassengers: () => { order.push("passengers"); },
      advanceConstruction: () => { order.push("construction"); return ["project-1"]; },
      expireEvents: () => { order.push("events"); return ["event-1"]; },
      getDay: (value) => Math.floor(value / 1440),
    });
    const result = coordinator.advance(1);
    expect(order).toEqual(["time", "trains", "passengers", "construction", "events"]);
    expect(result.gameDayChanged).toBe(true);
    expect(result.updateDomains).toEqual(["hud-clock", "map-trains", "map-construction", "notifications"]);
  });
});

describe("ConstructionCoordinator", () => {
  it("completes once and distinguishes network from non-network work", () => {
    const coordinator = new ConstructionCoordinator();
    const extension = { id: "p1", kind: "extension", status: "building" as const, elapsedDays: 0, durationDays: 1, delayDays: 0 };
    const crossing = { id: "p2", kind: "non-connected-crossing", status: "building" as const, elapsedDays: 0, durationDays: 1, delayDays: 0 };
    const first = coordinator.advanceDay([extension, crossing]);
    expect(first.completed).toHaveLength(2);
    expect(first.completed.find((item) => item.projectId === "p1")?.networkChanged).toBe(true);
    expect(first.completed.find((item) => item.projectId === "p2")?.networkChanged).toBe(false);
    const second = coordinator.advanceDay(first.projects);
    expect(second.completed).toHaveLength(0);
  });
});

describe("EventCoordinator and NewsService", () => {
  it("is deterministic for the same seed, blocks duplicates, and expires duration events", () => {
    const create = (day: number, seed: number) => ({ id: `event-${seed}`, kind: "festival", startedDay: day, durationDays: 2 });
    const coordinator = new EventCoordinator({ create, affectsDemand: () => true, affectsFinance: () => false });
    const first = coordinator.advanceDay([], 1, 7);
    const duplicate = coordinator.advanceDay(first.events, 2, 7);
    const expired = coordinator.advanceDay(first.events, 3, 8);
    expect(first.started[0].id).toBe("event-7");
    expect(duplicate.started).toHaveLength(0);
    expect(expired.expiredIds).toEqual(["event-7"]);
    const news = new NewsService<typeof first.started[0] & { read: boolean }>();
    const item = { ...first.started[0], read: false };
    expect(news.append(news.append([], item), item)).toHaveLength(1);
  });
});

describe("StateRecoveryCoordinator", () => {
  it("uses partial domains for limited failures and full reconcile for state replacement", () => {
    let value = 2;
    const updates = vi.fn();
    const full = vi.fn();
    const recovery = new StateRecoveryCoordinator({
      capture: () => value,
      restore: (snapshot: number) => { value = snapshot; },
      requestUpdates: updates,
      fullReconcile: full,
      rebuildRouter: vi.fn(),
      validate: vi.fn(),
    });
    recovery.recover(1, { scope: "partial", domains: ["map-lines"], rebuildRouter: false });
    expect(value).toBe(1);
    expect(updates).toHaveBeenCalledWith(["map-lines"], "network-structure");
    recovery.recover(0, { scope: "full", domains: [], rebuildRouter: true });
    expect(full).toHaveBeenCalledTimes(1);
  });
});

describe("BootstrapController", () => {
  it("runs ordered initialization once", async () => {
    const order: string[] = [];
    const step = (name: string) => () => { order.push(name); };
    const bootstrap = new BootstrapController({
      createShell: step("shell"), initializeStorage: step("storage"), loadSettings: step("settings"),
      loadState: step("state"), initializeMap: step("map"), initializeUi: step("ui"),
      initializeScheduler: step("scheduler"), initializeLoop: step("loop"), initialReconcile: step("reconcile"),
      connectAutosave: step("autosave"), startLoop: step("start"),
    });
    expect(await bootstrap.initialize()).toBe(true);
    expect(await bootstrap.initialize()).toBe(false);
    expect(order).toEqual(["shell", "storage", "settings", "state", "map", "ui", "scheduler", "loop", "reconcile", "autosave", "start"]);
  });
});

describe("long-running orchestration", () => {
  it.each([1, 8])("advances 100 game days at x%s without duplicate boundaries", (speed) => {
    let time = 0;
    let boundaries = 0;
    const simulation = new SimulationCoordinator({
      getTime: () => time,
      setTime: (value) => { time = value; },
      advanceTrains: () => [],
      getDay: (value) => Math.floor(value / 1440),
    });
    for (let day = 0; day < 100; day += 1) {
      const result = simulation.advance(1440);
      if (result.gameDayChanged) boundaries += 1;
    }
    expect(boundaries).toBe(100);
    expect(time / 1440).toBe(100);
    expect(speed).toBeGreaterThan(0);
  });

  it("finishes 50 projects and keeps 100 event updates bounded", () => {
    const construction = new ConstructionCoordinator();
    const projects = Array.from({ length: 50 }, (_, index) => ({
      id: `p-${index}`,
      kind: index % 2 ? "extension" : "non-connected-crossing",
      status: "building" as const,
      elapsedDays: 0,
      durationDays: 1,
      delayDays: 0,
    }));
    const completed = construction.advanceDay(projects);
    expect(new Set(completed.completed.map((item) => item.projectId)).size).toBe(50);
    expect(construction.advanceDay(completed.projects).completed).toHaveLength(0);

    const events = new EventCoordinator({
      create: (day: number) => ({ id: `e-${day}`, kind: "temporary", startedDay: day, durationDays: 1 }),
      affectsDemand: () => false,
      affectsFinance: () => false,
      minimumGapDays: 1,
      maximumHistory: 80,
    });
    let history: Array<{ id: string; kind: string; startedDay: number; durationDays: number }> = [];
    for (let day = 0; day < 100; day += 1) history = events.advanceDay(history, day, day).events;
    expect(history).toHaveLength(80);
    expect(new Set(history.map((event) => event.id)).size).toBe(80);
  });
});
