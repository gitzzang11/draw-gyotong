import type { FrameScheduler, RuntimeUpdateRequest, SimulationTickResult } from "./runtimeTypes.ts";

export interface GameLoopControllerOptions {
  scheduler?: FrameScheduler;
  advanceSimulationTick(deltaSeconds: number): SimulationTickResult;
  onGameDayChanged(result: SimulationTickResult): void;
  requestRenderDomains(request: RuntimeUpdateRequest): void;
  onRuntimeError(error: unknown): void;
  maxFrameDeltaSeconds?: number;
  renderIntervalMs?: number;
}

export class GameLoopController {
  private readonly scheduler: FrameScheduler;
  private readonly maxFrameDeltaSeconds: number;
  private readonly renderIntervalMs: number;
  private frameHandle: number | null = null;
  private lastTimestamp: number | null = null;
  private lastRenderTimestamp = 0;
  private running = false;
  private paused = false;
  private speed = 1;
  private tickInProgress = false;
  private lastDeliveredDayTime: number | null = null;

  constructor(private readonly options: GameLoopControllerOptions) {
    this.scheduler = options.scheduler ?? {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
    this.maxFrameDeltaSeconds = options.maxFrameDeltaSeconds ?? 1;
    this.renderIntervalMs = options.renderIntervalMs ?? 16;
  }

  start(): boolean {
    if (this.running) return false;
    this.running = true;
    this.lastTimestamp = null;
    this.frameHandle = this.scheduler.request(this.onFrame);
    return true;
  }

  stop(): void {
    this.running = false;
    this.lastTimestamp = null;
    if (this.frameHandle !== null) this.scheduler.cancel(this.frameHandle);
    this.frameHandle = null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.lastTimestamp = null;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  isRunning(): boolean {
    return this.running;
  }

  private readonly onFrame: FrameRequestCallback = (timestamp) => {
    if (!this.running) return;
    try {
      const previousTimestamp = this.lastTimestamp ?? timestamp;
      const elapsed = Math.min(
        this.maxFrameDeltaSeconds,
        Math.max(0, (timestamp - previousTimestamp) / 1000),
      );
      this.lastTimestamp = timestamp;
      if (!this.paused && this.speed > 0 && !this.tickInProgress) {
        this.tickInProgress = true;
        const result = this.options.advanceSimulationTick(elapsed * this.speed);
        if (result.gameDayChanged && result.currentTime !== this.lastDeliveredDayTime) {
          this.lastDeliveredDayTime = result.currentTime;
          this.options.onGameDayChanged(result);
        }
        if (timestamp - this.lastRenderTimestamp >= this.renderIntervalMs) {
          this.lastRenderTimestamp = timestamp;
          this.options.requestRenderDomains({
            domains: result.updateDomains,
            reason: "clock",
          });
        }
      }
    } catch (error) {
      this.options.onRuntimeError(error);
    } finally {
      this.tickInProgress = false;
      if (this.running) this.frameHandle = this.scheduler.request(this.onFrame);
    }
  };
}

