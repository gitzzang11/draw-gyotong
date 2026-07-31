import { describe, expect, it } from "vitest";
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  ensureStableId,
  migrateSaveStateRecord,
  stableEntityId,
} from "../src/storage/migrations";

type MigratedSave = {
  schemaVersion: number;
  meta: { slotId: string; slotName: string };
  routes: Array<{ id: string }>;
  stations: Array<{ id: string; connectedRouteIds: string[] }>;
  transfers: unknown[];
  depots: unknown[];
  trainFleets: unknown[];
  loans: unknown[];
  plans?: Array<{ connections?: unknown[]; junctions?: unknown[]; routePlanningDrafts?: unknown[] }>;
  economy: { cash: number };
};

function legacySave(schemaVersion: 1 | 2 | 3) {
  return {
    schemaVersion,
    meta: { slotName: "호환 세이브", createdAt: 10, updatedAt: 20 },
    routes: [{ id: "route-kept", coordinates: [[37.5, 127]], nodes: [], segments: [] }],
    stations: [{ position: [37.5, 127], demand: 10, connectedRouteIds: ["route-kept"] }],
    economy: { cash: 12345 },
  };
}

describe("save migrations", () => {
  it.each([1, 2, 3] as const)("migrates a version %i save to schema version 3", (version) => {
    const migrated = migrateSaveStateRecord<MigratedSave>(legacySave(version));
    expect(migrated.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.meta.slotName).toBe("호환 세이브");
    expect(migrated.economy.cash).toBe(12345);
    expect(migrated.transfers).toEqual([]);
    expect(migrated.depots).toEqual([]);
    expect(migrated.trainFleets).toEqual([]);
    expect(migrated.loans).toEqual([]);
  });

  it("is idempotent and does not mutate its input", () => {
    const input = legacySave(1);
    const before = structuredClone(input);
    const once = migrateSaveStateRecord<MigratedSave>(input);
    const twice = migrateSaveStateRecord<MigratedSave>(once);
    expect(twice).toEqual(once);
    expect(input).toEqual(before);
  });

  it("keeps existing ids and deterministically fills legacy missing ids", () => {
    expect(ensureStableId("existing", "station", "seed")).toBe("existing");
    expect(ensureStableId(undefined, "station", "seed")).toBe(stableEntityId("station", "seed"));
    const first = migrateSaveStateRecord<MigratedSave>(legacySave(1));
    const second = migrateSaveStateRecord<MigratedSave>(legacySave(1));
    expect(first.meta.slotId).toBe(second.meta.slotId);
    expect(first.stations[0].id).toBe(second.stations[0].id);
  });

  it("keeps references used by the existing real save shape", () => {
    const migrated = migrateSaveStateRecord<MigratedSave>(legacySave(3));
    expect(migrated.routes[0].id).toBe("route-kept");
    expect(migrated.stations[0].connectedRouteIds).toEqual(["route-kept"]);
  });

  it("safely normalizes corrupt arrays and invalid numbers", () => {
    const migrated = migrateSaveStateRecord<any>({
      schemaVersion: 1,
      meta: { slotName: "broken", updatedAt: Number.NaN },
      routes: "bad",
      stations: [{ position: null, demand: Number.POSITIVE_INFINITY }],
      economy: { cash: Number.NaN },
    });
    expect(migrated.routes).toEqual([]);
    expect(migrated.stations[0].demand).toBe(0);
    expect(Number.isFinite(migrated.meta.updatedAt)).toBe(true);
  });

  it("preserves connection and junction blueprints when restoring a plan", () => {
    const migrated = migrateSaveStateRecord<MigratedSave>({
      ...legacySave(3),
      plans: [{
        id: "plan-a", name: "계획", routes: [], stations: [], depots: [], transfers: [],
        connections: [{ id: "connection-a", status: "under-construction", sourceEntityId: "a", targetEntityId: "b" }],
        junctions: [{ id: "junction-a", targetLineId: "line-a", sourceSegmentId: "segment-a", position: { lat: 37.5, lng: 127 }, splitRatio: .4, createsStation: false, status: "approved" }],
        routePlanningDrafts: [{ id: "draft-a", tool: "branch", stage: "drawing" }],
      }],
    });
    expect(migrated.plans?.[0].connections?.[0]).toMatchObject({ id: "connection-a", operationType: "connection", status: "under-construction" });
    expect(migrated.plans?.[0].junctions?.[0]).toMatchObject({ id: "junction-a", status: "approved", splitRatio: .4 });
    expect(migrated.plans?.[0].routePlanningDrafts).toHaveLength(1);
  });

  it("marks an incomplete completed connection as failed instead of replaying it on restore", () => {
    const migrated = migrateSaveStateRecord<any>({
      ...legacySave(3),
      plans: [{
        id: "plan-a", name: "plan", routes: [], stations: [], depots: [], transfers: [],
        connections: [{ id: "connection-a", status: "completed", sourceEntityId: "a", targetEntityId: "b" }],
      }],
    });
    expect(migrated.plans[0].connections[0]).toMatchObject({
      status: "failed",
      actualEntityIds: [],
    });
  });
});
