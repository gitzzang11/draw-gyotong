import { describe, expect, it, vi } from "vitest";
import { MapSelectionApplicationController } from "../src/map/mapSelectionApplicationController";

describe("MapSelectionApplicationController", () => {
  it("clears selection when the map hit has no selected target", () => {
    const callbacks = {
      clearSelection: vi.fn(),
      openAlternatives: vi.fn(),
      activateSelection: vi.fn(),
    };
    const controller = new MapSelectionApplicationController(callbacks);

    controller.apply({ selected: null, alternatives: [] });

    expect(callbacks.clearSelection).toHaveBeenCalledOnce();
    expect(callbacks.openAlternatives).not.toHaveBeenCalled();
    expect(callbacks.activateSelection).not.toHaveBeenCalled();
  });

  it("opens alternatives before activating an ambiguous target", () => {
    const callbacks = {
      clearSelection: vi.fn(),
      openAlternatives: vi.fn(),
      activateSelection: vi.fn(),
    };
    const controller = new MapSelectionApplicationController(callbacks);
    const selected = { id: "station-1" };
    const alternative = { id: "route-1" };

    controller.apply({ selected, alternatives: [alternative] });

    expect(callbacks.openAlternatives).toHaveBeenCalledWith([selected, alternative]);
    expect(callbacks.activateSelection).not.toHaveBeenCalled();
  });
});
