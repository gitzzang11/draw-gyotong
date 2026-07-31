import { describe, expect, it } from "vitest";
import { DirtyUpdateScheduler, domainsForUpdate } from "../src/updateScheduler";

describe("partial update dependencies", () => {
  it("does not recalculate routes or demand for a station label change", () => {
    const domains = domainsForUpdate("station-label");
    expect(domains).toEqual(["map-stations", "active-panel", "storage"]);
    expect(domains).not.toContain("network");
    expect(domains).not.toContain("demand");
  });

  it("keeps graph and route cache for fleet changes", () => {
    const domains = domainsForUpdate("fleet-service");
    expect(domains).toContain("capacity");
    expect(domains).toContain("congestion");
    expect(domains).not.toContain("network");
    expect(domains).not.toContain("routes");
  });

  it("does not run simulation calculations for viewport changes", () => {
    expect(domainsForUpdate("viewport")).toEqual(["map-lod"]);
  });

  it("limits a route style change to line, station, train, and UI rendering", () => {
    const domains = domainsForUpdate("route-style");
    expect(domains).toEqual(["map-lines", "map-stations", "map-trains", "map-selection", "hud-status", "active-panel", "storage"]);
    expect(domains).not.toContain("demand");
    expect(domains).not.toContain("finance");
  });

  it("invalidates network and dependent calculations for structural changes", () => {
    const scheduler = new DirtyUpdateScheduler();
    scheduler.mark("network-structure");
    expect(scheduler.has("network")).toBe(true);
    expect(scheduler.has("demand")).toBe(true);
    expect(scheduler.consume()).toContain("routes");
    expect(scheduler.consume()).toEqual([]);
  });

  it("updates only finance UI and storage after daily settlement", () => {
    expect(domainsForUpdate("daily-settlement")).toEqual(["finance", "hud-finance", "hud-status", "active-panel", "notifications", "storage"]);
    expect(domainsForUpdate("daily-settlement")).not.toContain("map-lines");
    expect(domainsForUpdate("daily-settlement")).not.toContain("network");
    expect(domainsForUpdate("daily-settlement")).not.toContain("routes");
  });

  it("merges duplicate requests and records their reasons", () => {
    const scheduler = new DirtyUpdateScheduler();
    scheduler.mark("clock");
    scheduler.mark("clock");
    expect(scheduler.consume()).toEqual(["map-trains", "hud-clock"]);
    scheduler.finishFlush();
    expect(scheduler.snapshot().merged).toBe(2);
    expect(scheduler.snapshot().reasons).toEqual(["clock", "clock"]);
  });

  it("defers requests made while flushing to the next cycle", () => {
    const scheduler = new DirtyUpdateScheduler();
    scheduler.mark("clock");
    expect(scheduler.consume()).toEqual(["map-trains", "hud-clock"]);
    scheduler.mark("panel");
    expect(scheduler.consume()).toEqual([]);
    scheduler.finishFlush();
    expect(scheduler.consume()).toEqual(["active-panel"]);
    scheduler.finishFlush();
  });

  it("keeps selection, mode, and construction progress isolated", () => {
    expect(domainsForUpdate("selection")).toEqual(["map-selection", "hud-status", "active-panel"]);
    expect(domainsForUpdate("mode")).toEqual(["map-selection", "hud-status", "active-panel", "workflow"]);
    expect(domainsForUpdate("construction-progress")).not.toContain("network");
    expect(domainsForUpdate("construction-progress")).not.toContain("routes");
  });

  it.each([10, 50, 100])("merges 1,000 train ticks for %i trains into one execution cycle", () => {
    const scheduler = new DirtyUpdateScheduler();
    for (let tick = 0; tick < 1_000; tick += 1) scheduler.mark("clock");
    expect(scheduler.consume()).toEqual(["map-trains", "hud-clock"]);
    scheduler.finishFlush();
    const trace = scheduler.snapshot();
    expect(trace.executed["map-trains"]).toBe(1);
    expect(trace.executed["hud-clock"]).toBe(1);
    expect(trace.merged).toBe(1_998);
  });

  it("keeps repeated map movement and panel activity free of simulation domains", () => {
    const scheduler = new DirtyUpdateScheduler();
    for (let move = 0; move < 100; move += 1) scheduler.mark("viewport");
    for (let panel = 0; panel < 100; panel += 1) scheduler.mark("panel");
    expect(scheduler.consume()).toEqual(["map-lod", "active-panel"]);
    scheduler.finishFlush();
    expect(scheduler.snapshot().executed.network).toBeUndefined();
    expect(scheduler.snapshot().executed.demand).toBeUndefined();
  });
});
