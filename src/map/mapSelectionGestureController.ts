type PointerPosition = {
  x: number;
  y: number;
};

type SelectionGesture = {
  pointerId: number;
  pointerType: string;
  start: PointerPosition;
  moved: boolean;
  cancelled: boolean;
};

export type MapSelectionResult = {
  shouldSelect: boolean;
  pointerType: string;
};

export class MapSelectionGestureController {
  private readonly activePointers = new Set<number>();
  private gesture: SelectionGesture | null = null;

  begin(pointerId: number, pointerType: string, start: PointerPosition) {
    this.activePointers.add(pointerId);
    if (this.activePointers.size > 1 && this.gesture) this.gesture.cancelled = true;
    if (!this.gesture) {
      this.gesture = { pointerId, pointerType, start, moved: false, cancelled: false };
    }
  }

  move(pointerId: number, pointerType: string, position: PointerPosition) {
    if (this.gesture?.pointerId !== pointerId) return;
    const threshold = pointerType === "touch" ? 12 : 5;
    if (Math.hypot(position.x - this.gesture.start.x, position.y - this.gesture.start.y) > threshold) {
      this.gesture.moved = true;
    }
  }

  cancel(pointerId: number) {
    this.activePointers.delete(pointerId);
    if (this.gesture?.pointerId === pointerId) this.gesture = null;
  }

  end(pointerId: number): MapSelectionResult | null {
    this.activePointers.delete(pointerId);
    if (this.gesture?.pointerId !== pointerId) return null;
    const gesture = this.gesture;
    this.gesture = null;
    return {
      shouldSelect: !gesture.moved && !gesture.cancelled && this.activePointers.size === 0,
      pointerType: gesture.pointerType,
    };
  }

  reset() {
    this.activePointers.clear();
    this.gesture = null;
  }
}
