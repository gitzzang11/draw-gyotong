/** Owns persistent session metadata without embedding session or progression rules. */
export class ApplicationMetaState<T extends object> {
  private state: T;

  constructor(initialState: T) {
    this.state = initialState;
  }

  get current(): Readonly<T> {
    return this.state;
  }

  replace(state: T): T {
    this.state = state;
    return this.state;
  }

  patch(patch: Partial<T>): T {
    return this.replace({ ...this.state, ...patch });
  }

  reset(initialState: T): void {
    this.replace(initialState);
  }

  snapshot(): T {
    return this.state;
  }
}
