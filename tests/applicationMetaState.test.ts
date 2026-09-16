import { describe, expect, it } from "vitest";
import { ApplicationMetaState } from "../src/domain/applicationMetaState";

type TestMeta = {
  slotId: string;
  updatedAt: number;
  unlockedCityIds: string[];
};

describe("ApplicationMetaState", () => {
  it("replaces, patches, resets, and snapshots session metadata", () => {
    const initial: TestMeta = { slotId: "slot-1", updatedAt: 1, unlockedCityIds: ["seoul"] };
    const state = new ApplicationMetaState(initial);

    state.patch({ updatedAt: 2 });
    expect(state.current.updatedAt).toBe(2);

    const replacement: TestMeta = { slotId: "slot-2", updatedAt: 3, unlockedCityIds: ["busan"] };
    state.replace(replacement);
    expect(state.snapshot()).toEqual(replacement);

    state.reset(initial);
    expect(state.current).toEqual(initial);
  });
});
