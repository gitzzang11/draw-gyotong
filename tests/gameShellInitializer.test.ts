import { describe, expect, it, vi } from "vitest";
import { initializeGameShell } from "../src/runtime/gameShellInitializer";

describe("initializeGameShell", () => {
  it("preserves legacy recovery and startup ordering when no slots exist", async () => {
    const order: string[] = [];
    const saveCurrentSlot = vi.fn(async () => order.push("save"));
    await initializeGameShell({
      applySettingsToUi: () => order.push("settings"),
      renderCityOptions: () => order.push("cities"),
      listSaveSlots: async () => { order.push("slots"); return []; },
      setSlotSummaries: () => order.push("set-slots"),
      loadSavedState: () => order.push("load-state"),
      getCityId: () => "seoul",
      applyCityMapConstraints: () => order.push("map"),
      updateEconomyHud: () => order.push("economy"),
      renderStartScreen: () => order.push("start-screen"),
      showStartScreen: () => order.push("show-start"),
      hasNetworkRoutes: () => true,
      activateSession: () => order.push("activate"),
      resetMeta: () => order.push("reset-meta"),
      saveCurrentSlot,
      startAutoSave: () => order.push("autosave"),
      updateCacheReadout: () => order.push("cache"),
    });

    expect(order).toEqual([
      "settings", "cities", "slots", "set-slots", "load-state", "map", "economy",
      "start-screen", "show-start", "activate", "reset-meta", "save", "autosave", "cache",
    ]);
    expect(saveCurrentSlot).toHaveBeenCalledWith("기존 저장 이전");
  });

  it("shows existing slots without creating a recovery save", async () => {
    const saveCurrentSlot = vi.fn(async () => undefined);
    const showStartScreen = vi.fn();
    await initializeGameShell({
      applySettingsToUi: vi.fn(),
      renderCityOptions: vi.fn(),
      listSaveSlots: async () => [{ id: "slot-1" }],
      setSlotSummaries: vi.fn(),
      loadSavedState: vi.fn(),
      getCityId: () => "seoul",
      applyCityMapConstraints: vi.fn(),
      updateEconomyHud: vi.fn(),
      renderStartScreen: vi.fn(),
      showStartScreen,
      hasNetworkRoutes: () => true,
      activateSession: vi.fn(),
      resetMeta: vi.fn(),
      saveCurrentSlot,
      startAutoSave: vi.fn(),
      updateCacheReadout: vi.fn(),
    });

    expect(showStartScreen).toHaveBeenCalledWith(true);
    expect(saveCurrentSlot).not.toHaveBeenCalled();
  });
});
