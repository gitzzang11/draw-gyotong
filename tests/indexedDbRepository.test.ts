import { describe, expect, it, vi } from "vitest";
import { IndexedDbRepository } from "../src/storage/indexedDbRepository";
import { createLocalStorageFallback, SaveSlotService } from "../src/storage/saveSlotService";

type Slot = { meta: { slotId: string; updatedAt: number; slotName?: string }; value: number };

describe("IndexedDbRepository fallback", () => {
  it("reads the recoverable fallback when IndexedDB is unavailable", async () => {
    const fallback: Slot[] = [{ meta: { slotId: "a", updatedAt: 1 }, value: 3 }];
    const repository = new IndexedDbRepository<Slot>({
      databaseName: "test",
      version: 1,
      storeName: "slots",
      keyPath: "meta.slotId",
      migrate: (value) => value as Slot,
      fallback: { readAll: () => fallback, write: (value) => fallback.unshift(value) },
    });
    await expect(repository.get("a")).resolves.toEqual(fallback[0]);
    await expect(repository.getAll()).resolves.toEqual(fallback);
  });

  it("accepts a fallback save when IndexedDB is unavailable", async () => {
    const write = vi.fn();
    const repository = new IndexedDbRepository<Slot>({
      databaseName: "test",
      version: 1,
      storeName: "slots",
      keyPath: "meta.slotId",
      migrate: (value) => value as Slot,
      fallback: { readAll: () => [], write },
    });
    const slot = { meta: { slotId: "a", updatedAt: 1 }, value: 3 };
    await expect(repository.put(slot)).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledWith(slot);
  });

  it("fails only when both IndexedDB and the fallback are unavailable", async () => {
    const repository = new IndexedDbRepository<Slot>({
      databaseName: "test",
      version: 1,
      storeName: "slots",
      keyPath: "meta.slotId",
      migrate: (value) => value as Slot,
      fallback: { readAll: () => [], write: () => { throw new DOMException("full", "QuotaExceededError"); } },
    });
    await expect(repository.put({ meta: { slotId: "a", updatedAt: 1 }, value: 3 })).rejects.toBeInstanceOf(AggregateError);
  });

  it("duplicates through the slot service without sharing identity", async () => {
    const repository = {
      get: vi.fn(async (slotId: string) => slotId === "a" ? ({ meta: { slotId: "a", updatedAt: 1 }, value: 3 }) : null),
      put: vi.fn(async () => undefined),
    };
    const service = new SaveSlotService(repository as never);
    await expect(service.duplicate("a", (source: Slot) => ({ ...source, meta: { slotId: "b", updatedAt: 2 } })))
      .resolves.toMatchObject({ meta: { slotId: "b" } });
    expect(repository.put).toHaveBeenCalledOnce();
  });

  it("keeps the last healthy local saves when an IndexedDB write fails", async () => {
    let fallback: Slot[] = [{ meta: { slotId: "healthy", updatedAt: 1 }, value: 8 }];
    const repository = new IndexedDbRepository<Slot>({
      databaseName: "test",
      version: 1,
      storeName: "slots",
      keyPath: "meta.slotId",
      migrate: (value) => value as Slot,
      fallback: {
        readAll: () => fallback,
        write: (value) => { fallback = [value, ...fallback.filter((item) => item.meta.slotId !== value.meta.slotId)]; },
        remove: (slotId) => { fallback = fallback.filter((item) => item.meta.slotId !== slotId); },
        replaceAll: (values) => { fallback = values; },
      },
      indexedDb: failingIndexedDb(),
    });
    await expect(repository.put({ meta: { slotId: "new", updatedAt: 2 }, value: 9 })).resolves.toBeUndefined();
    expect(fallback.map((slot) => slot.meta.slotId)).toEqual(["new", "healthy"]);
  });

  it("restores a fallback slot when IndexedDB deletion fails", async () => {
    let fallback: Slot[] = [{ meta: { slotId: "a", updatedAt: 1 }, value: 3 }];
    const repository = new IndexedDbRepository<Slot>({
      databaseName: "test",
      version: 1,
      storeName: "slots",
      keyPath: "meta.slotId",
      migrate: (value) => value as Slot,
      fallback: {
        readAll: () => fallback,
        write: (value) => { fallback = [value]; },
        remove: (slotId) => { fallback = fallback.filter((item) => item.meta.slotId !== slotId); },
        replaceAll: (values) => { fallback = values; },
      },
      indexedDb: failingIndexedDb(),
    });
    await expect(repository.delete("a")).rejects.toThrow();
    expect(fallback).toHaveLength(1);
    expect(fallback[0].meta.slotId).toBe("a");
  });

  it("merges local fallback entries by slot and updatedAt", () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value); },
      removeItem: (key: string) => { items.delete(key); },
    };
    const fallback = createLocalStorageFallback<Slot>({
      storage,
      key: "slots",
      migrate: (value) => value as Slot,
      maxEntries: 3,
    });
    fallback.write({ meta: { slotId: "a", updatedAt: 1 }, value: 1 });
    fallback.write({ meta: { slotId: "b", updatedAt: 2 }, value: 2 });
    fallback.write({ meta: { slotId: "a", updatedAt: 3 }, value: 3 });
    expect(fallback.readAll()).toEqual([
      { meta: { slotId: "a", updatedAt: 3 }, value: 3 },
      { meta: { slotId: "b", updatedAt: 2 }, value: 2 },
    ]);
  });

  it("prefers the newest updatedAt while merging IndexedDB and fallback results", async () => {
    const fallback: Slot[] = [
      { meta: { slotId: "shared", updatedAt: 5 }, value: 50 },
      { meta: { slotId: "local", updatedAt: 2 }, value: 20 },
    ];
    const repository = new IndexedDbRepository<Slot>({
      databaseName: "test",
      version: 1,
      storeName: "slots",
      keyPath: "meta.slotId",
      migrate: (value) => value as Slot,
      fallback: {
        readAll: () => fallback,
        write: () => undefined,
        remove: () => undefined,
        replaceAll: () => undefined,
      },
    });
    vi.spyOn(repository as never, "withStore" as never).mockResolvedValue([
      { meta: { slotId: "shared", updatedAt: 3 }, value: 30 },
      { meta: { slotId: "indexed", updatedAt: 4 }, value: 40 },
    ] as never);
    const merged = await repository.getAll();
    expect(merged.find((slot) => slot.meta.slotId === "shared")?.value).toBe(50);
    expect(merged.map((slot) => slot.meta.slotId).sort()).toEqual(["indexed", "local", "shared"]);
  });

  it("supports slot save, list, load, delete, and safe duplication", async () => {
    const values = new Map<string, Slot>();
    const repository = {
      put: vi.fn(async (value: Slot) => { values.set(value.meta.slotId, value); }),
      get: vi.fn(async (slotId: string) => values.get(slotId) ?? null),
      getAll: vi.fn(async () => [...values.values()]),
      delete: vi.fn(async (slotId: string) => { values.delete(slotId); }),
    };
    const service = new SaveSlotService(repository as never);
    await service.create({ meta: { slotId: "a", updatedAt: 1, slotName: "Original" }, value: 1 });
    expect(await service.list()).toHaveLength(1);
    expect(await service.load("a")).toMatchObject({ value: 1 });
    const copy = await service.duplicate("a", (source) => ({
      ...source,
      meta: { slotId: "copy", updatedAt: 2, slotName: source.meta.slotName },
      value: 2,
    }));
    expect(copy.meta.slotId).toBe("copy");
    expect(copy.meta.slotName).toBe("Original 복사본");
    expect(await service.list()).toHaveLength(2);
    await expect(service.create({ meta: { slotId: "a", updatedAt: 3 }, value: 3 })).rejects.toThrow("already exists");
    await service.remove("a");
    expect(await service.load("a")).toBeNull();
  });
});

function failingIndexedDb(): IDBFactory {
  return {
    open() {
      const request: Partial<IDBOpenDBRequest> = {};
      queueMicrotask(() => {
        Object.defineProperty(request, "error", { value: new Error("unavailable") });
        request.onerror?.(new Event("error"));
      });
      return request as IDBOpenDBRequest;
    },
  } as IDBFactory;
}
