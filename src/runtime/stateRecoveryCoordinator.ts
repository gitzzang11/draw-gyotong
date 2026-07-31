import type { UpdateDomain, UpdateReason } from "../updateScheduler.ts";

type RecoveryScope = "partial" | "full";

interface RecoveryPlan {
  scope: RecoveryScope;
  domains: UpdateDomain[];
  rebuildRouter: boolean;
}

interface StateRecoveryContext<T> {
  capture(): T;
  restore(snapshot: T): void;
  requestUpdates(domains: UpdateDomain[], reason: UpdateReason): void;
  fullReconcile(): void;
  rebuildRouter(): void;
  validate(): void;
}

export class StateRecoveryCoordinator<T> {
  private recoveryInProgress = false;

  constructor(private readonly context: StateRecoveryContext<T>) {}

  snapshot(): T {
    return this.context.capture();
  }

  recover(snapshot: T, plan: RecoveryPlan): boolean {
    if (this.recoveryInProgress) return false;
    this.recoveryInProgress = true;
    try {
      this.context.restore(snapshot);
      this.context.validate();
      if (plan.rebuildRouter) this.context.rebuildRouter();
      if (plan.scope === "full") this.context.fullReconcile();
      else this.context.requestUpdates(plan.domains, "network-structure");
      return true;
    } finally {
      this.recoveryInProgress = false;
    }
  }
}
