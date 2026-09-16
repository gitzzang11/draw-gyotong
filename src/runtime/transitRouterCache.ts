import type { TransitRouter } from "../transitRouting.ts";

/** Runtime-only router instance and the signature used to validate it. */
export class TransitRouterCache {
  private routerState: TransitRouter | null = null;
  private signatureState = "";

  get current(): TransitRouter | null {
    return this.routerState;
  }

  get signature(): string {
    return this.signatureState;
  }

  set(router: TransitRouter, signature: string): void {
    this.routerState = router;
    this.signatureState = signature;
  }

  invalidate(): void {
    this.routerState = null;
    this.signatureState = "";
  }
}
