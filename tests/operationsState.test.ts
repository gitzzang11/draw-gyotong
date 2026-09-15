import { describe, expect, it } from "vitest";
import type { OperatingService } from "../src/operatingService";
import { OperationsState, type ExpressConfig, type TrainFleet } from "../src/domain/operationsState";

const fleet = { id: "fleet-1" } as TrainFleet;
const service = { id: "service-1" } as OperatingService;
const expressConfig = { routeId: "route-1" } as ExpressConfig;

describe("OperationsState", () => {
  it("replaces the operations aggregate together", () => {
    const state = new OperationsState();
    state.replace({ fleets: [fleet], services: [service], expressConfigs: [expressConfig] });

    expect(state.fleets).toEqual([fleet]);
    expect(state.services).toEqual([service]);
    expect(state.expressConfigs).toEqual([expressConfig]);
  });

  it("resets fleets, services, and express configs together", () => {
    const state = new OperationsState({ fleets: [fleet], services: [service], expressConfigs: [expressConfig] });
    state.reset();
    expect(state.snapshot()).toEqual({ fleets: [], services: [], expressConfigs: [] });
  });
});
