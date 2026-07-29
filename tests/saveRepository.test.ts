import { describe, expect, it, vi } from "vitest";
import { SaveRepository } from "../src/storage/saveRepository";
import {
  deserializeState,
  serializeFiniteState,
  toSaveData,
} from "../src/storage/serialization";
import { LocalRecoveryStore } from "../src/storage/saveSlotService";

describe("SaveRepository", () => {
  it("coalesces several debounced requests into one write", async () => {
    vi.useFakeTimers();
    let state = 1;
    const writes: number[] = [];
    const repository = new SaveRepository({ capture: () => state, write: (value) => writes.push(value), delayMs: 100 });
    repository.request();
    state = 2;
    repository.request();
    state = 3;
    repository.request();
    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toEqual([3]);
    vi.useRealTimers();
  });

  it("flushes important changes immediately", async () => {
    const writes: number[] = [];
    const repository = new SaveRepository({ capture: () => 7, write: (value) => writes.push(value), delayMs: 1000 });
    await repository.flush();
    expect(writes).toEqual([7]);
  });

  it("writes the latest state after a request arrives during a save", async () => {
    let state = 1;
    let releaseFirst: (() => void) | undefined;
    const writes: number[] = [];
    const repository = new SaveRepository({
      capture: () => state,
      write: async (value) => {
        writes.push(value);
        if (value === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      },
    });
    const saving = repository.flush();
    await vi.waitFor(() => expect(writes).toEqual([1]));
    state = 2;
    repository.request();
    releaseFirst?.();
    await saving;
    expect(writes).toEqual([1, 2]);
  });

  it("normalizes non-finite numbers during serialization", () => {
    expect(serializeFiniteState({ valid: 2, invalid: Number.NaN, huge: Number.POSITIVE_INFINITY })).toBe(
      '{"valid":2,"invalid":0,"huge":0}',
    );
  });

  it("preserves ids and explicit Set/Map values across serialization", () => {
    const restored = deserializeState<any>(serializeFiniteState({
      route: { id: "route-1" },
      station: { id: "station-1", routeId: "route-1" },
      selectedIds: new Set(["station-1"]),
      weights: new Map([["route-1", 2]]),
    }));
    expect(restored.station.routeId).toBe(restored.route.id);
    expect(restored.selectedIds).toEqual(new Set(["station-1"]));
    expect(restored.weights).toEqual(new Map([["route-1", 2]]));
  });

  it("excludes functions, DOM-like values, Leaflet-like values, and cycles", () => {
    class FakeNode {}
    vi.stubGlobal("Node", FakeNode);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const saved = toSaveData<any>({
      valid: 1,
      callback: () => undefined,
      dom: new FakeNode(),
      leaflet: { _leaflet_id: 1, on() {}, off() {} },
      cyclic,
    });
    expect(saved).toEqual({ valid: 1, cyclic: {} });
    vi.unstubAllGlobals();
  });

  it("round-trips the latest state through the refresh recovery store", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const recovery = new LocalRecoveryStore(
      storage,
      "state",
      "routes",
      (value) => value as { meta: { slotId: string }; routes: Array<{ id: string }> },
    );
    const state = { meta: { slotId: "slot-1" }, routes: [{ id: "route-1" }] };
    recovery.write(state);
    expect(recovery.read()).toEqual(state);
  });

  it("reports a debounced write failure without an unhandled rejection", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const repository = new SaveRepository({
      capture: () => 1,
      write: () => { throw new Error("blocked"); },
      delayMs: 10,
      onError,
    });
    repository.request();
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
