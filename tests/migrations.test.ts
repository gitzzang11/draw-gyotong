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
});
