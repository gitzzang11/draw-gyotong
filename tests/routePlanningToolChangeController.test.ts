import { describe, expect, it, vi } from "vitest";
import { RoutePlanningController } from "../src/tools/routePlanningController";
import { RoutePlanningToolChangeController } from "../src/tools/routePlanningToolChangeController";

describe("RoutePlanningToolChangeController", () => {
  it("cancels the session before changing tools", () => {
    const planning = new RoutePlanningController<string>();
    planning.start("extend", "planning-1");
    planning.transition("drawing");
    planning.requestToolChange("pan");
    const changeTool = vi.fn();
    const controller = new RoutePlanningToolChangeController(planning, {
      saveDraft: vi.fn(),
      closeDialog: vi.fn(),
      changeTool,
      notifyDraftSaved: vi.fn(),
    });

    expect(controller.cancelAndChange()).toBe(true);
    expect(planning.session?.stage).toBe("cancelled");
    expect(changeTool).toHaveBeenCalledWith("pan");
  });

  it("saves the active session before changing tools", () => {
    const planning = new RoutePlanningController<string>();
    planning.start("extend", "planning-2");
    planning.transition("drawing");
    planning.requestToolChange("pan");
    const saveDraft = vi.fn();
    const closeDialog = vi.fn();
    const changeTool = vi.fn();
    const notifyDraftSaved = vi.fn();
    const controller = new RoutePlanningToolChangeController(planning, {
      saveDraft,
      closeDialog,
      changeTool,
      notifyDraftSaved,
    });

    expect(controller.saveDraftAndChange()).toBe(true);
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "planning-2", stage: "drawing" }));
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(changeTool).toHaveBeenCalledWith("pan");
    expect(notifyDraftSaved).toHaveBeenCalledOnce();
    expect(planning.session).toMatchObject({ id: "planning-2", stage: "drawing" });
  });
});
