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

  it("does not duplicate a layer when the same visual state is reconciled twice", () => {
    const create = vi.fn((entity: { id: string; value: number }) => ({ ...entity }));
    const update = vi.fn();
    const renderer = new EntityRenderer({ create, update, remove: vi.fn() });
    const entity = { id: "same", value: 1 };
    renderer.reconcileEntities([entity]);
    renderer.reconcileEntities([{ ...entity }]);
    expect(create).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(renderer.renderedIds).toEqual(new Set(["same"]));
  });

  it("removes the rendered object and its adapter-owned listener cleanup", () => {
    const dispose = vi.fn();
    const remove = vi.fn((rendered: { dispose: () => void }) => rendered.dispose());
    const renderer = new EntityRenderer({
      create: () => ({ dispose }),
      update: vi.fn(),
      remove,
    });
    renderer.reconcileEntities([{ id: "gone" }]);
    renderer.reconcileEntities([]);
    expect(remove).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(renderer.renderedIds).toEqual(new Set());
  });

  it("exposes focused style, position, selection, and visibility updates", () => {
    const updateStyle = vi.fn();
    const updatePosition = vi.fn();
    const updateSelection = vi.fn();
    const updateVisibility = vi.fn();
    const renderer = new EntityRenderer({
      create: () => ({}),
      update: vi.fn(),
      remove: vi.fn(),
      updateStyle,
      updatePosition,
      updateSelection,
      updateVisibility,
    });
    renderer.createEntity({ id: "a" });
    renderer.updateStyle("a");
    renderer.updatePosition("a");
    renderer.updateSelection("a", true);
    renderer.updateVisibility("a", false);
    expect(updateStyle).toHaveBeenCalledOnce();
    expect(updatePosition).toHaveBeenCalledOnce();
    expect(updateSelection).toHaveBeenCalledWith({}, true, { id: "a" });
    expect(updateVisibility).toHaveBeenCalledWith({}, false, { id: "a" });
  });
});
