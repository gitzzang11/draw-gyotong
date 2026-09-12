import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SaveFacade } from "../src/storage/saveFacade.ts";
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

describe("SaveFacade", () => {
  it("is initialized before the map-ready bootstrap can enumerate save slots", () => {
    const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(mainSource.indexOf("const saveFacade = new SaveFacade")).toBeGreaterThan(-1);
    expect(mainSource.indexOf("const saveFacade = new SaveFacade")).toBeLessThan(mainSource.indexOf("map.whenReady"));
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
