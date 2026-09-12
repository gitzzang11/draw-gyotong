import { describe, expect, it } from "vitest";
import {
  cancelRoutePlanning,
  createRoutePlanningSession,
  findSnapTargets,
  restartRoutePlanning,
  RoutePlanningHistory,
  transitionRoutePlanning,
  type SnapTarget,
} from "../src/routePlanning";

const target = (id: string, kind: SnapTarget["kind"], x = 0): SnapTarget => ({
  id, entityId: id, kind, screenPoint: { x, y: 0 }, coordinate: { lat: 37, lng: 127 }, label: id,
});

describe("shared route planning input", () => {
  it.each(["extend", "connect", "branch"] as const)("uses the same review state flow for %s", (tool) => {
    let session = createRoutePlanningSession(tool, tool);
    session = transitionRoutePlanning(session, "drawing");
    session = transitionRoutePlanning(session, tool === "connect" ? "selecting-target" : "reviewing");
    if (session.stage === "selecting-target") session = transitionRoutePlanning(session, "reviewing");
    expect(session.stage).toBe("reviewing");
  });

  it("clears all transient data on cancellation", () => {
    let session = createRoutePlanningSession("extend");
    session = transitionRoutePlanning(session, "drawing", {
      snappedSource: target("source", "line-endpoint"),
      draftCoordinates: [{ lat: 1, lng: 2 }],
    });
    expect(cancelRoutePlanning(session)).toMatchObject({ stage: "cancelled", draftCoordinates: [], snappedSource: undefined });
  });

  it("filters and deduplicates snap candidates by tool in screen pixels", () => {
    const endpoint = target("end", "line-endpoint", 20);
    const results = findSnapTargets("extend", "source", { x: 0, y: 0 }, [endpoint, endpoint, target("station", "station", 10)]);
    expect(results.map((item) => item.id)).toEqual(["end"]);
    expect(findSnapTargets("branch", "source", { x: 0, y: 0 }, [endpoint, target("station", "station", 10)]).map((item) => item.id)).toEqual(["station"]);
  });

  it("uses a wider touch snap radius", () => {
    const endpoint = target("end", "line-endpoint", 50);
    expect(findSnapTargets("extend", "source", { x: 0, y: 0 }, [endpoint], { pointerType: "mouse" })).toEqual([]);
    expect(findSnapTargets("extend", "source", { x: 0, y: 0 }, [endpoint], { pointerType: "touch" })).toHaveLength(1);
  });

  it("supports draft undo and redo without changing committed game state", () => {
    const start = createRoutePlanningSession("branch");
    const history = new RoutePlanningHistory(start);
    history.replace(transitionRoutePlanning(start, "drawing", { draftCoordinates: [{ lat: 1, lng: 1 }] }));
    expect(history.undo().draftCoordinates).toEqual([]);
    expect(history.redo().draftCoordinates).toHaveLength(1);
  });

  it("returns a cancelled draft to idle before another tool lifecycle begins", () => {
    let session = createRoutePlanningSession("connect", "draft-1");
    session = transitionRoutePlanning(session, "drawing", { draftCoordinates: [{ lat: 37.5, lng: 127 }] });
    const restarted = restartRoutePlanning(session);
    expect(restarted).toMatchObject({ id: "draft-1", tool: "connect", stage: "idle", draftCoordinates: [] });
  });

  it("rejects an invalid tool lifecycle jump without changing the draft", () => {
    const session = createRoutePlanningSession("extend", "draft-2");
    expect(() => transitionRoutePlanning(session, "committing")).toThrow("Invalid route planning transition");
    expect(session).toMatchObject({ stage: "selecting-source", draftCoordinates: [] });
  });
});
