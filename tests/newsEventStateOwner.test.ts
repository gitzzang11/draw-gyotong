import { describe, expect, it } from "vitest";
import type { NewsEvent } from "../src/domain/eventTypes";
import { NewsEventStateOwner } from "../src/events/newsEventStateOwner";

function event(id: string, startedDay = 0): NewsEvent {
  return {
    id,
    kind: "festival",
    tone: "opportunity",
    title: id,
    summary: id,
    regionName: "서울",
    position: [37.5, 127],
    startedDay,
    durationDays: 3,
    demandMultiplier: 1.1,
    operatingCostMultiplier: 1,
    relatedStationIds: [],
    relatedRouteIds: [],
    action: "review-area",
    actionLabel: "검토",
    read: false,
    responsePrepared: false,
  };
}

describe("NewsEventStateOwner", () => {
  it("owns replacement and bounded unique append", () => {
    const owner = new NewsEventStateOwner(2);
    owner.replace([event("a")]);

    expect(owner.appendMany([event("a"), event("b"), event("c")])).toBe(true);
    expect(owner.current.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("reports a bounded append when contents change without changing length", () => {
    const owner = new NewsEventStateOwner(2);
    owner.replace([event("a"), event("b")]);

    expect(owner.appendMany([event("c")])).toBe(true);
    expect(owner.current.map((item) => item.id)).toEqual(["b", "c"]);
    expect(owner.appendMany([event("c")])).toBe(false);
  });

  it("owns read and response mutations", () => {
    const owner = new NewsEventStateOwner();
    owner.replace([event("active"), event("expired", -10)]);

    owner.markReadWhere((item) => item.startedDay >= 0);
    owner.prepareResponse("active");

    expect(owner.findById("active")).toMatchObject({ read: true, responsePrepared: true });
    expect(owner.findById("expired")?.read).toBe(false);
  });

  it("restores an explicit snapshot for transactional rollback", () => {
    const owner = new NewsEventStateOwner();
    owner.replace([event("before")]);
    const snapshot = owner.capture();
    owner.replace([event("after")]);

    owner.restore(snapshot);

    expect(owner.current.map((item) => item.id)).toEqual(["before"]);
  });
});
