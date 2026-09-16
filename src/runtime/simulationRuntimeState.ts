/** Mutable runtime clock state; persistent game metadata remains elsewhere. */
export class SimulationRuntimeState {
  private minutesState: number;
  private clockMinutesState: number;

  constructor(minutes = 0) {
    this.minutesState = minutes;
    this.clockMinutesState = this.toClockMinutes(minutes);
  }

  get minutes(): number {
    return this.minutesState;
  }

  get clockMinutes(): number {
    return this.clockMinutesState;
  }

  setMinutes(minutes: number): void {
    this.minutesState = minutes;
    this.clockMinutesState = this.toClockMinutes(minutes);
  }

  reset(minutes = 0): void {
    this.setMinutes(minutes);
  }

  private toClockMinutes(minutes: number): number {
    return ((minutes % 1440) + 1440) % 1440;
  }
}
