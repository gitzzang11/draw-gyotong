import { describe, expect, it, vi } from "vitest";
import { EntityRenderer } from "../src/map/entityRenderer";

describe("EntityRenderer", () => {
  it("creates, updates and removes only changed keyed entities", () => {
    const create = vi.fn((entity: { id: string; value: number }) => ({ ...entity }));
    const update = vi.fn((rendered: { id: string; value: number }, entity: { id: string; value: number }) => Object.assign(rendered, entity));
    const remove = vi.fn();
    const renderer = new EntityRenderer({ create, update, remove });
    renderer.render([{ id: "a", value: 1 }, { id: "b", value: 2 }]);
    renderer.render([{ id: "a", value: 3 }, { id: "c", value: 4 }]);
    expect(create).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(renderer.size).toBe(2);
  });
});
