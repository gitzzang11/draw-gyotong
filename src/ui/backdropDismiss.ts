/**
 * Tracks a complete pointer gesture so a modal only dismisses after an
 * intentional press and release on the backdrop itself.
 */
export class BackdropDismissTracker {
  private backdropPointerId: number | null = null;

  pointerDown(event: Pick<PointerEvent, "target" | "currentTarget" | "pointerId">) {
    this.backdropPointerId = event.target === event.currentTarget ? event.pointerId : null;
  }

  pointerUp(event: Pick<PointerEvent, "target" | "currentTarget" | "pointerId">): boolean {
    const shouldDismiss = this.backdropPointerId === event.pointerId && event.target === event.currentTarget;
    this.reset();
    return shouldDismiss;
  }

  reset() {
    this.backdropPointerId = null;
  }
}

export function createBackdropDismissHandlers(closeModal: () => void) {
  const tracker = new BackdropDismissTracker();
  return {
    pointerDown: (event: PointerEvent) => tracker.pointerDown(event),
    pointerUp: (event: PointerEvent) => {
      if (tracker.pointerUp(event)) closeModal();
    },
    pointerCancel: () => tracker.reset(),
  };
}

/** Binds pointer-event backdrop dismissal without relying on synthetic click events. */
export function bindBackdropDismiss(backdrop: HTMLElement, closeModal: () => void): () => void {
  const handlers = createBackdropDismissHandlers(closeModal);

  backdrop.addEventListener("pointerdown", handlers.pointerDown);
  backdrop.addEventListener("pointerup", handlers.pointerUp);
  backdrop.addEventListener("pointercancel", handlers.pointerCancel);

  return () => {
    backdrop.removeEventListener("pointerdown", handlers.pointerDown);
    backdrop.removeEventListener("pointerup", handlers.pointerUp);
    backdrop.removeEventListener("pointercancel", handlers.pointerCancel);
  };
}
