import { describe, expect, it, vi } from "vitest";
import { ListenerRegistry } from "../src/map/listenerRegistry";

describe("ListenerRegistry", () => {
  it("prevents duplicate persistent listeners and can dispose them", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const registry = new ListenerRegistry();
    expect(registry.add("map:pointerdown", target, "pointerdown", handler)).toBe(true);
    expect(registry.add("map:pointerdown", target, "pointerdown", handler)).toBe(false);
    target.dispatchEvent(new Event("pointerdown"));
    expect(handler).toHaveBeenCalledTimes(1);
    registry.dispose();
    target.dispatchEvent(new Event("pointerdown"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clears listeners by panel or mode scope", () => {
    const target = new EventTarget();
    const registry = new ListenerRegistry();
    registry.add("station:save", target, "click", () => undefined, undefined, "panel:station");
    registry.add("map:click", target, "click", () => undefined, undefined, "mode:management");
    expect(registry.snapshot()).toHaveLength(2);
    registry.clearScope("panel:station");
    expect(registry.snapshot().map((item) => item.key)).toEqual(["map:click"]);
  });
});
