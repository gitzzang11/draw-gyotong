import { describe, expect, it } from "vitest";
import { MapSelectionGestureController } from "../src/map/mapSelectionGestureController";

describe("MapSelectionGestureController", () => {
  it("reports a stationary single pointer as a map selection", () => {
    const controller = new MapSelectionGestureController();

    controller.begin(1, "mouse", { x: 10, y: 20 });
    controller.move(1, "mouse", { x: 14, y: 20 });

    expect(controller.end(1)).toEqual({ shouldSelect: true, pointerType: "mouse" });
  });

  it("keeps mouse and touch movement thresholds unchanged", () => {
    const mouse = new MapSelectionGestureController();
    mouse.begin(1, "mouse", { x: 0, y: 0 });
    mouse.move(1, "mouse", { x: 6, y: 0 });
    expect(mouse.end(1)?.shouldSelect).toBe(false);

    const touch = new MapSelectionGestureController();
    touch.begin(2, "touch", { x: 0, y: 0 });
    touch.move(2, "touch", { x: 6, y: 0 });
    expect(touch.end(2)?.shouldSelect).toBe(true);
  });

  it("cancels selection when a second pointer joins the gesture", () => {
    const controller = new MapSelectionGestureController();

    controller.begin(1, "touch", { x: 0, y: 0 });
    controller.begin(2, "touch", { x: 20, y: 0 });
    expect(controller.end(2)).toBeNull();
    expect(controller.end(1)?.shouldSelect).toBe(false);
  });
});
