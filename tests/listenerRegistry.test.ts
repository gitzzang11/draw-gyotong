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
});
