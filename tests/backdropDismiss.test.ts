import { describe, expect, it } from "vitest";
import { BackdropDismissTracker } from "../src/ui/backdropDismiss";

const gesture = (target: EventTarget, currentTarget: EventTarget, pointerId = 1) =>
  ({ target, currentTarget, pointerId }) as Pick<PointerEvent, "target" | "currentTarget" | "pointerId">;

describe("BackdropDismissTracker", () => {
  it("dismisses only when a pointer gesture starts and ends on the backdrop", () => {
    const backdrop = new EventTarget();
    const tracker = new BackdropDismissTracker();
    tracker.pointerDown(gesture(backdrop, backdrop));
    expect(tracker.pointerUp(gesture(backdrop, backdrop))).toBe(true);
  });

  it("does not dismiss when a drag begins inside the modal and ends on the backdrop", () => {
    const backdrop = new EventTarget();
    const content = new EventTarget();
    const tracker = new BackdropDismissTracker();
    tracker.pointerDown(gesture(content, backdrop));
    expect(tracker.pointerUp(gesture(backdrop, backdrop))).toBe(false);
  });

  it("does not dismiss when a backdrop press ends inside the modal", () => {
    const backdrop = new EventTarget();
    const content = new EventTarget();
    const tracker = new BackdropDismissTracker();
    tracker.pointerDown(gesture(backdrop, backdrop));
    expect(tracker.pointerUp(gesture(content, backdrop))).toBe(false);
  });

  it("clears a gesture after cancellation and ignores another pointer", () => {
    const backdrop = new EventTarget();
    const tracker = new BackdropDismissTracker();
    tracker.pointerDown(gesture(backdrop, backdrop, 1));
    tracker.reset();
    expect(tracker.pointerUp(gesture(backdrop, backdrop, 1))).toBe(false);
    tracker.pointerDown(gesture(backdrop, backdrop, 1));
    expect(tracker.pointerUp(gesture(backdrop, backdrop, 2))).toBe(false);
  });
});
