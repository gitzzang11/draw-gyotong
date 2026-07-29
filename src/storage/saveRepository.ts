export interface SaveRepositoryOptions<T> {
  capture: () => T;
  write: (value: T) => void | Promise<void>;
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
}

export class SaveRepository<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private readonly delayMs: number;

  constructor(private readonly options: SaveRepositoryOptions<T>) {
    this.delayMs = Math.max(0, options.delayMs ?? 250);
  }

  request() {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      void this.flush().catch((error) => this.options.onError?.(error));
    }, this.delayMs);
  }

  flush(): Promise<void> {
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    const write = Promise.resolve().then(() => this.options.write(this.options.capture()));
    const completion = write.finally(() => {
      if (this.pending === completion) this.pending = undefined;
    });
    this.pending = completion;
    return completion;
  }

  cancel() {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  private setTimer(callback: () => void, delayMs: number) {
    return (this.options.setTimer ?? setTimeout)(callback, delayMs);
  }

  private clearTimer(timer: ReturnType<typeof setTimeout>) {
    (this.options.clearTimer ?? clearTimeout)(timer);
  }
}
