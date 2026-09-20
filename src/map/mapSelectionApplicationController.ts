export type MapSelectionApplicationResult<T> = {
  selected: T | null;
  alternatives: T[];
};

export type MapSelectionApplicationCallbacks<T> = {
  clearSelection: () => void;
  openAlternatives: (candidates: T[]) => void;
  activateSelection: (selection: T) => void;
};

/** Applies a resolved map hit to the existing application callbacks. */
export class MapSelectionApplicationController<T> {
  constructor(private readonly callbacks: MapSelectionApplicationCallbacks<T>) {}

  apply(result: MapSelectionApplicationResult<T>) {
    if (!result.selected) {
      this.callbacks.clearSelection();
      return;
    }

    if (result.alternatives.length > 0) {
      this.callbacks.openAlternatives([result.selected, ...result.alternatives]);
      return;
    }

    this.callbacks.activateSelection(result.selected);
  }
}
