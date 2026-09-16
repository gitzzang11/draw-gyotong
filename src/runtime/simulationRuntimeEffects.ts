import type { TransitRouterCache } from "./transitRouterCache.ts";

/** Coordinates the existing network invalidation side effect with router cache invalidation. */
export class SimulationRuntimeEffects {
  constructor(
    private readonly invalidateNetwork: () => void,
    private readonly transitRouterCache: TransitRouterCache,
  ) {}

  invalidateStructuralNetwork(): void {
    this.invalidateNetwork();
    this.transitRouterCache.invalidate();
  }
}
