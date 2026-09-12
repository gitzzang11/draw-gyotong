import { describe, expect, it } from "vitest";
import { RoutePlanningController } from "../src/tools/routePlanningController";

describe("RoutePlanningController", () => {
  it("owns the route-planning lifecycle without creating entity IDs", () => {
    const controller = new RoutePlanningController<string>();

    controller.start("extend", "planning-1");
    expect(controller.session).toMatchObject({ id: "planning-1", tool: "extend", stage: "selecting-source" });

    controller.transition("drawing", { draftCoordinates: [{ lat: 37.5, lng: 127 }] });
    expect(controller.shouldConfirmToolChange("branch")).toBe(true);

    controller.cancel();
    expect(controller.session).toMatchObject({ stage: "cancelled", draftCoordinates: [] });
  });

  it("owns pending tool changes and scopes the guard bypass", () => {
    const controller = new RoutePlanningController<string>();
    controller.start("connect", "planning-2");
    controller.transition("drawing");
    controller.requestToolChange("pan");

    expect(controller.pendingToolChange).toBe("pan");
    expect(controller.shouldConfirmToolChange(null)).toBe(true);

    controller.runBypassingToolChangeGuard(() => {
      expect(controller.shouldConfirmToolChange(null)).toBe(false);
    });

    expect(controller.shouldConfirmToolChange(null)).toBe(true);
    controller.clearPendingToolChange();
    expect(controller.pendingToolChange).toBeNull();
  });

  it("orchestrates drawing pointer lifecycle from source selection through review", () => {
    const controller = new RoutePlanningController<string>();
    controller.start("extend", "planning-3");

    controller.beginDrawing({ sourceEntityId: "route-1" });
    controller.updateDraftCoordinates([{ lat: 37.5, lng: 127 }]);
    controller.finishDrawing([{ lat: 37.5, lng: 127 }, { lat: 37.6, lng: 127.1 }]);

    expect(controller.session).toMatchObject({
      stage: "reviewing",
      sourceEntityId: "route-1",
      draftCoordinates: [{ lat: 37.5, lng: 127 }, { lat: 37.6, lng: 127.1 }],
    });
  });

  it("orchestrates connection target selection without owning snap rules", () => {
    const controller = new RoutePlanningController<string>();
    controller.start("connect", "planning-4");
    controller.beginDrawing({ sourceEntityId: "route-1" });

    controller.connectionTargetMissed();
    controller.reviewConnection({
      targetEntityId: "route-2",
      draftCoordinates: [{ lat: 37.5, lng: 127 }, { lat: 37.6, lng: 127.1 }],
    });

    expect(controller.session).toMatchObject({
      stage: "reviewing",
      sourceEntityId: "route-1",
      targetEntityId: "route-2",
    });
  });
});
