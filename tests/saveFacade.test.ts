import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SaveFacade, type SaveSlotGateway } from "../src/storage/saveFacade.ts";
import { SaveSlotService } from "../src/storage/saveSlotService.ts";
import { migrateSaveStateRecord } from "../src/storage/migrations.ts";
import type { SaveSlotRepository } from "../src/storage/storageTypes.ts";

type Save = {
  meta: { slotId: string; updatedAt: number };
  value: number;
};

type RepresentativeSave = {
  schemaVersion: number;
  meta: { slotId: string; slotName: string; updatedAt: number; createdAt: number; mode: "career"; difficulty: "normal"; cityId: "seoul"; unlockedCityIds: string[]; bankrupt: boolean };
  routes: Array<{ id: string; coordinates: Array<[number, number]>; nodes: Array<{ id: string; position: [number, number] }>; segments: Array<{ id: string; coordinates: Array<[number, number]> }> }>;
  stations: Array<{ id: string; connectedRouteIds: string[]; position: [number, number]; demand: number }>;
  depots: Array<{ id: string; connectedRouteIds: string[] }>;
  trainFleets: Array<{ id: string; routeId: string; serviceId: string }>;
  operatingServices: Array<{ id: string; ownerRouteId: string; routeIds: string[]; branchIds: string[]; pathCoordinates: Array<[number, number]>; stationIds: string[]; stopStationIds: string[] }>;
  constructionProjects: Array<{ id: string; routeIds: string[]; stationIds: string[]; depotIds: string[]; coordinates: Array<[number, number]>; elapsedDays: number; additionalCost: number; delayDays: number }>;
  economy: { cash: number; fare: number };
  analysisState: { dayIndex: number; demandHistory: unknown[]; suggestions: unknown[]; decisions: Record<string, unknown>; lastFingerprint: string; lastNotifiedDay: number };
  transfers: unknown[];
  plans: unknown[];
  diagramState?: unknown;
  statisticsState?: unknown;
  newsEvents?: unknown[];
  expressConfigs?: unknown[];
  passengerGroups?: unknown[];
  loans?: unknown[];
  demandZones?: unknown[];
  stationDemandStates?: unknown[];
};

function save(value: number): Save {
  return { meta: { slotId: "slot-1", updatedAt: value }, value };
}

function delayedStorage(options: { failWrite?: boolean; failRemove?: boolean; delayCreate?: boolean } = {}) {
  const records = new Map<string, Save>([
    ["slot-1", save(1)], ["slot-2", { meta: { slotId: "slot-2", updatedAt: 1 }, value: 1 }],
  ]);
  let current = save(2);
  let releaseWrite!: () => void;
  let notifyWriteStarted!: () => void;
  let notifyCreateStarted!: () => void;
  const gate = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const writeStarted = new Promise<void>((resolve) => { notifyWriteStarted = resolve; });
  const createStarted = new Promise<void>((resolve) => { notifyCreateStarted = resolve; });
  const gateway: SaveSlotGateway<Save> = {
    create: async (value) => {
      if (options.delayCreate) { notifyCreateStarted(); await gate; }
      records.set(value.meta.slotId, structuredClone(value));
      return value;
    },
    update: async (value) => {
      notifyWriteStarted();
      await gate;
      if (options.failWrite) throw new Error("write failed");
      records.set(value.meta.slotId, structuredClone(value));
      return value;
    },
    load: async (id) => records.get(id) ?? null,
    list: async () => [...records.values()],
    remove: async (id) => {
      if (options.failRemove) throw new Error("delete failed");
      records.delete(id);
    },
  };
  const facade = new SaveFacade<Save>({ capture: () => structuredClone(current), service: () => gateway, delayMs: 100 });
  return { facade, records, releaseWrite, writeStarted, createStarted, setCurrent: (value: Save) => { current = value; } };
}

describe("SaveFacade", () => {
  it.each(["update", "flush"] as const)("a late create cannot enable %s after deletion has been requested", async (operation) => {
    const { facade, records, releaseWrite: finishCreate, createStarted } = delayedStorage({ delayCreate: true });
    records.delete("slot-1");
    const creating = facade.create(save(1));
    await createStarted;
    const deleting = facade.remove("slot-1");
    finishCreate();
    await Promise.all([creating, deleting]);

    const attemptedWrite = operation === "update" ? facade.update(save(3)) : facade.flush();

    await expect(attemptedWrite).rejects.toThrow(/삭제/);
    expect(records.has("slot-1")).toBe(false);
    expect(await facade.load("slot-1")).toBeNull();
  });

  it("a late create cannot enable scheduled requests that resurrect a deleted slot", async () => {
    vi.useFakeTimers();
    try {
      const { facade, records, releaseWrite: finishCreate, createStarted } = delayedStorage({ delayCreate: true });
      records.delete("slot-1");
      const creating = facade.create(save(1));
      await createStarted;
      const deleting = facade.remove("slot-1");
      finishCreate();
      await Promise.all([creating, deleting]);

      facade.request();
      await vi.advanceTimersByTimeAsync(100);

      expect(records.has("slot-1")).toBe(false);
      expect(await facade.load("slot-1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows an explicit new create after deletion and then accepts normal writes", async () => {
    const { facade, records, releaseWrite } = delayedStorage();
    releaseWrite();
    await facade.remove("slot-1");
    expect(records.has("slot-1")).toBe(false);

    await facade.create(save(10));
    expect(await facade.load("slot-1")).toEqual(save(10));
    await facade.update(save(11));
    expect(await facade.load("slot-1")).toEqual(save(11));
  });

  it("does not resurrect a slot when an in-flight flush finishes after deletion is requested", async () => {
    const { facade, records, releaseWrite, writeStarted } = delayedStorage();
    const saving = facade.flush();
    await writeStarted;

    const deleting = facade.remove("slot-1");
    releaseWrite();
    await Promise.all([saving, deleting]);

    expect(await facade.load("slot-1")).toBeNull();
    expect(records.has("slot-1")).toBe(false);
    expect(await facade.list()).toEqual([{ meta: { slotId: "slot-2", updatedAt: 1 }, value: 1 }]);
  });

  it("keeps the deleted slot absent when another request is queued during its in-flight write", async () => {
    const { facade, records, releaseWrite, writeStarted, setCurrent } = delayedStorage();
    const saving = facade.flush();
    await writeStarted;
    setCurrent(save(3));
    facade.request();

    const deleting = facade.remove("slot-1");
    releaseWrite();
    await Promise.all([saving, deleting]);

    expect(records.has("slot-1")).toBe(false);
    expect(await facade.load("slot-1")).toBeNull();
  });

  it("does not run a pending scheduled write that would recreate a deleted slot", async () => {
    vi.useFakeTimers();
    try {
      const { facade, records, releaseWrite } = delayedStorage();
      releaseWrite();
      facade.request();
      await facade.remove("slot-1");

      await vi.advanceTimersByTimeAsync(100);

      expect(records.has("slot-1")).toBe(false);
      expect(await facade.load("slot-1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves a pending scheduled save of another slot when deleting the old slot", async () => {
    vi.useFakeTimers();
    try {
      const { facade, records, releaseWrite, setCurrent } = delayedStorage();
      releaseWrite();
      const latest = { meta: { slotId: "slot-2", updatedAt: 3 }, value: 3 };
      setCurrent(latest);
      facade.request();
      await facade.remove("slot-1");

      await vi.advanceTimersByTimeAsync(100);

      expect(records.has("slot-1")).toBe(false);
      expect(await facade.load("slot-2")).toEqual(latest);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cancel or erase an in-flight write of another slot", async () => {
    const { facade, releaseWrite, writeStarted } = delayedStorage();
    const saving = facade.flush();
    await writeStarted;

    const deleting = facade.remove("slot-2");
    releaseWrite();
    await Promise.all([saving, deleting]);

    expect(await facade.load("slot-1")).toEqual(save(2));
    expect(await facade.load("slot-2")).toBeNull();
  });

  it("still deletes a slot when the preceding in-flight write fails", async () => {
    const { facade, releaseWrite, writeStarted } = delayedStorage({ failWrite: true });
    const saving = facade.flush();
    const savedResult = saving.then(() => "saved", (error: Error) => error.message);
    await writeStarted;

    const deleting = facade.remove("slot-1");
    releaseWrite();
    await deleting;

    expect(await savedResult).toBe("write failed");
    expect(await facade.load("slot-1")).toBeNull();
  });

  it("preserves a slot and allows later writes when deletion fails", async () => {
    const { facade, releaseWrite, writeStarted, setCurrent } = delayedStorage({ failRemove: true });
    const saving = facade.flush();
    await writeStarted;
    const deleting = facade.remove("slot-1");
    const deletedResult = deleting.then(() => "deleted", (error: Error) => error.message);
    releaseWrite();
    await saving;

    expect(await deletedResult).toBe("delete failed");
    expect(await facade.load("slot-1")).toEqual(save(2));
    setCurrent(save(3));
    await facade.flush();
    expect(await facade.load("slot-1")).toEqual(save(3));
  });

  it("is initialized before the map-ready bootstrap can enumerate save slots", () => {
    const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(mainSource.indexOf("const saveFacade = new SaveFacade")).toBeGreaterThan(-1);
    expect(mainSource.indexOf("const saveFacade = new SaveFacade")).toBeLessThan(mainSource.indexOf("registerMapLifecycle(map"));
  });

  it("captures the latest prepared runtime snapshot through the existing update gateway", async () => {
    vi.useFakeTimers();
    let current = save(1);
    const prepare = vi.fn();
    const update = vi.fn(async () => undefined);
    const facade = new SaveFacade<Save>({
      capture: () => current,
      prepareForScheduledSave: prepare,
      service: () => ({
        create: vi.fn(),
        update,
        load: vi.fn(),
        list: vi.fn(),
        remove: vi.fn(),
      }),
      delayMs: 100,
    });

    facade.request();
    current = save(2);
    facade.request();
    await vi.advanceTimersByTimeAsync(100);

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledExactlyOnceWith(save(2));
    vi.useRealTimers();
  });

  it("delegates explicit slot lifecycle operations without rewriting the supplied save", async () => {
    const record = save(7);
    const created: Save[] = [];
    const updated: Save[] = [];
    const removed: string[] = [];
    const facade = new SaveFacade<Save>({
      capture: () => record,
      service: () => ({
        create: async (value) => { created.push(value); return value; },
        update: async (value) => { updated.push(value); return value; },
        load: async (slotId) => slotId === "slot-1" ? record : null,
        list: async () => [record],
        remove: async (slotId) => { removed.push(slotId); },
      }),
    });

    await expect(facade.create(record)).resolves.toBe(record);
    await expect(facade.update(record)).resolves.toBe(record);
    await expect(facade.load("slot-1")).resolves.toBe(record);
    await expect(facade.list()).resolves.toEqual([record]);
    await facade.remove("slot-1");

    expect(created).toEqual([record]);
    expect(updated).toEqual([record]);
    expect(removed).toEqual(["slot-1"]);
  });

  it("round-trips a representative v5 slot while preserving IDs, references, construction, finance, and game time", async () => {
    const records = new Map<string, RepresentativeSave>();
    const repository: SaveSlotRepository<RepresentativeSave> = {
      put: async (value) => { records.set(value.meta.slotId, migrateSaveStateRecord<RepresentativeSave>(value)); },
      get: async (slotId) => records.get(slotId) ?? null,
      getAll: async () => [...records.values()],
      delete: async (slotId) => { records.delete(slotId); },
    };
    const service = new SaveSlotService(repository);
    const facade = new SaveFacade<RepresentativeSave>({
      capture: () => representativeSave(),
      service: () => service,
    });

    await facade.create(representativeSave());
    const loaded = await facade.load("slot-v5");
    expect(loaded?.schemaVersion).toBe(5);
    expect(loaded?.stations[0].connectedRouteIds).toEqual(["line-a"]);
    expect(loaded?.depots[0].connectedRouteIds).toEqual(["line-a"]);
    expect(loaded?.trainFleets[0]).toMatchObject({ id: "fleet-a", routeId: "line-a", serviceId: "service-a" });
    expect(loaded?.constructionProjects[0]).toMatchObject({ id: "project-a", routeIds: ["line-a"], stationIds: ["station-a"], depotIds: ["depot-a"] });
    expect(loaded?.economy).toMatchObject({ cash: 98765, fare: 1450 });
    expect(loaded?.analysisState.dayIndex).toBe(42);

    const runtimeState = structuredClone(loaded!);
    runtimeState.economy.cash = 98700;
    await facade.update(runtimeState);
    const reloaded = await facade.load("slot-v5");
    expect(reloaded?.economy.cash).toBe(98700);
    expect(reloaded?.routes[0].id).toBe("line-a");
    expect(reloaded?.operatingServices[0]).toMatchObject({ id: "service-a", ownerRouteId: "line-a", stationIds: ["station-a"] });
  });
});

function representativeSave(): RepresentativeSave {
  return {
    schemaVersion: 5,
    meta: { slotId: "slot-v5", slotName: "대표 저장", createdAt: 100, updatedAt: 200, mode: "career", difficulty: "normal", cityId: "seoul", unlockedCityIds: ["seoul"], bankrupt: false },
    routes: [{ id: "line-a", coordinates: [[37.5, 127], [37.51, 127.01]], nodes: [{ id: "node-a", position: [37.5, 127] }], segments: [{ id: "segment-a", coordinates: [[37.5, 127], [37.51, 127.01]] }] }],
    stations: [{ id: "station-a", connectedRouteIds: ["line-a"], position: [37.5, 127], demand: 50 }],
    depots: [{ id: "depot-a", connectedRouteIds: ["line-a"] }],
    trainFleets: [{ id: "fleet-a", routeId: "line-a", serviceId: "service-a" }],
    operatingServices: [{ id: "service-a", ownerRouteId: "line-a", routeIds: ["line-a"], branchIds: [], pathCoordinates: [[37.5, 127], [37.51, 127.01]], stationIds: ["station-a"], stopStationIds: ["station-a"] }],
    constructionProjects: [{ id: "project-a", routeIds: ["line-a"], stationIds: ["station-a"], depotIds: ["depot-a"], coordinates: [[37.5, 127], [37.51, 127.01]], elapsedDays: 2, additionalCost: 0, delayDays: 0 }],
    economy: { cash: 98765, fare: 1450 },
    analysisState: { dayIndex: 42, demandHistory: [], suggestions: [], decisions: {}, lastFingerprint: "stable", lastNotifiedDay: 42 },
    transfers: [],
    plans: [],
  };
}
