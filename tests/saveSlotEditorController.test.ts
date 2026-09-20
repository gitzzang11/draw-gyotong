import { describe, expect, it, vi } from "vitest";
import { saveEditedSlot } from "../src/ui/saveSlotEditorController";

describe("saveEditedSlot", () => {
  it("flushes active state, persists metadata, then refreshes views", async () => {
    const order: string[] = [];
    const meta = { slotName: "기존", updatedAt: 1 };
    const state = { routes: [] };
    const nextMeta = { slotName: "새 이름", updatedAt: 2 };
    await saveEditedSlot({ slotId: "slot-1", slotName: "새 이름", mode: "sandbox", difficulty: "normal" }, {
      isActiveSlot: () => true,
      flushActiveSlot: async () => { order.push("flush"); },
      readSlot: async () => { order.push("read"); return { state, meta }; },
      buildMeta: () => { order.push("build"); return nextMeta; },
      updateSlot: async () => { order.push("update"); },
      applyActiveMeta: () => { order.push("apply"); },
      refreshSlots: async () => { order.push("slots"); },
      refreshViews: () => { order.push("views"); },
      setStatus: () => { order.push("status"); },
      closeEditor: () => { order.push("close"); },
      notifySuccess: () => { order.push("notify"); },
    });

    expect(order).toEqual(["flush", "read", "build", "update", "apply", "slots", "views", "status", "close", "notify"]);
  });

  it("fails before refresh when the requested slot is unavailable", async () => {
    const refreshViews = vi.fn();
    await expect(saveEditedSlot({ slotId: "missing", slotName: "이름", mode: "sandbox", difficulty: "normal" }, {
      isActiveSlot: () => false,
      flushActiveSlot: vi.fn(async () => undefined),
      readSlot: async () => null,
      buildMeta: vi.fn(),
      updateSlot: vi.fn(async () => undefined),
      applyActiveMeta: vi.fn(),
      refreshSlots: vi.fn(async () => undefined),
      refreshViews,
      setStatus: vi.fn(),
      closeEditor: vi.fn(),
      notifySuccess: vi.fn(),
    })).rejects.toThrow("Save metadata is missing");
    expect(refreshViews).not.toHaveBeenCalled();
  });

  it("does not report success when persistence fails", async () => {
    const refreshSlots = vi.fn(async () => undefined);
    const closeEditor = vi.fn();
    const notifySuccess = vi.fn();
    await expect(saveEditedSlot({ slotId: "slot-1", slotName: "이름", mode: "sandbox", difficulty: "normal" }, {
      isActiveSlot: () => false,
      flushActiveSlot: vi.fn(async () => undefined),
      readSlot: async () => ({ state: { routes: [] }, meta: { slotName: "기존" } }),
      buildMeta: (meta) => ({ ...meta, slotName: "이름" }),
      updateSlot: async () => { throw new Error("write failed"); },
      applyActiveMeta: vi.fn(),
      refreshSlots,
      refreshViews: vi.fn(),
      setStatus: vi.fn(),
      closeEditor,
      notifySuccess,
    })).rejects.toThrow("write failed");
    expect(refreshSlots).not.toHaveBeenCalled();
    expect(closeEditor).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
