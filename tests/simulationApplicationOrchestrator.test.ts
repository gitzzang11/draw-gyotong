import { describe, expect, it } from "vitest";
import { SimulationApplicationOrchestrator } from "../src/runtime/simulationApplicationOrchestrator";

describe("SimulationApplicationOrchestrator", () => {
  it("dispatches applied settlements and reports failures without changing ordering", () => {
    const calls: string[] = [];
    const app = new SimulationApplicationOrchestrator({
      settleDay: () => undefined,
      requestRenderDomains: () => undefined,
      pauseSimulation: () => undefined,
      reportRuntimeError: () => undefined,
      showRuntimeError: () => undefined,
      dispatchSettlement: () => calls.push("dispatch"),
      reportSettlementFailure: () => calls.push("failure"),
    });

    app.handleSettlementResult({ status: "failed", applied: false, error: new Error("failed") });
    app.handleSettlementResult({ status: "applied", applied: true });

    expect(calls).toEqual(["failure", "dispatch"]);
  });

  it("preserves runtime error order and forwards render requests", () => {
    const calls: string[] = [];
    const app = new SimulationApplicationOrchestrator({
      settleDay: () => undefined,
      requestRenderDomains: (domains) => calls.push(`render:${domains.join(",")}`),
      pauseSimulation: () => calls.push("pause"),
      reportRuntimeError: () => calls.push("report"),
      showRuntimeError: () => calls.push("show"),
      dispatchSettlement: () => undefined,
      reportSettlementFailure: () => undefined,
    });

    app.handleRenderRequest({ domains: ["hud-clock"], reason: "clock" });
    app.handleRuntimeError(new Error("tick"));

    expect(calls).toEqual(["render:hud-clock", "report", "pause", "show"]);
  });
});
