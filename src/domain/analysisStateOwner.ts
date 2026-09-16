/** Owns the mutable analysis state without embedding analysis algorithms. */
export class AnalysisStateOwner<T> {
  private state: T;

  constructor(initialState: T) {
    this.state = initialState;
  }

  get current(): T {
    return this.state;
  }

  set current(state: T) {
    this.state = state;
  }

  replace(state: T): void {
    this.state = state;
  }

  reset(initialState: T): void {
    this.replace(initialState);
  }

  snapshot(): T {
    return this.state;
  }
}
