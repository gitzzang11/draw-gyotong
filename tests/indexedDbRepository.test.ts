import { describe, expect, it, vi } from "vitest";
import { IndexedDbRepository } from "../src/storage/indexedDbRepository";
import { SaveSlotService } from "../src/storage/saveSlotService";

type Slot = { meta: { slotId: string; updatedAt: number }; value: number };

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
      get: vi.fn(async () => ({ meta: { slotId: "a", updatedAt: 1 }, value: 3 })),
      put: vi.fn(async () => undefined),
    };
    const service = new SaveSlotService(repository as never);
    await expect(service.duplicate("a", (source: Slot) => ({ ...source, meta: { slotId: "b", updatedAt: 2 } })))
      .resolves.toMatchObject({ meta: { slotId: "b" } });
    expect(repository.put).toHaveBeenCalledOnce();
  });
});
