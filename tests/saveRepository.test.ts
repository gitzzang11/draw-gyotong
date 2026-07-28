import { describe, expect, it, vi } from "vitest";
import { SaveRepository } from "../src/storage/saveRepository";
import { serializeFiniteState } from "../src/storage/serialization";

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

  it("normalizes non-finite numbers during serialization", () => {
    expect(serializeFiniteState({ valid: 2, invalid: Number.NaN, huge: Number.POSITIVE_INFINITY })).toBe(
      '{"valid":2,"invalid":0,"huge":0}',
    );
  });
});
