import { describe, expect, it } from "vitest";
import { DirtyUpdateScheduler, domainsForUpdate } from "../src/updateScheduler";

describe("partial update dependencies", () => {
  it("does not recalculate routes or demand for a station label change", () => {
    const domains = domainsForUpdate("station-label");
    expect(domains).toEqual(["map-entities", "panels", "storage"]);
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
    expect(domainsForUpdate("viewport")).toEqual(["map-entities"]);
  });

  it("invalidates network and dependent calculations for structural changes", () => {
    const scheduler = new DirtyUpdateScheduler();
    scheduler.mark("network-structure");
    expect(scheduler.has("network")).toBe(true);
    expect(scheduler.has("demand")).toBe(true);
    expect(scheduler.consume()).toContain("routes");
    expect(scheduler.consume()).toEqual([]);
  });
});
