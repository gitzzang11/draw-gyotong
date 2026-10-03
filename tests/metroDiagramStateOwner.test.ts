import { describe, expect, it } from "vitest";
import { MetroDiagramStateOwner } from "../src/ui/metroDiagramStateOwner";

describe("MetroDiagramStateOwner", () => {
  it("owns UI preference and manual-position mutations", () => {
    const owner = new MetroDiagramStateOwner();

    owner.selectRoute("route-1");
    owner.setBackground("blueprint");
    owner.setStationNamesVisible(false);
    owner.setCompanyInfoVisible(false);
    owner.setManualPosition("station-1", { x: 120, y: 240 });

    expect(owner.current).toMatchObject({
      selectedRouteId: "route-1",
      background: "blueprint",
      showStationNames: false,
      showCompanyInfo: false,
      manualPositions: { "station-1": { x: 120, y: 240 } },
    });
  });

  it("normalizes legacy layout state with the existing version semantics", () => {
    const owner = new MetroDiagramStateOwner({
      autoPositions: { old: { x: 1, y: 2 } },
      manualPositions: { old: { x: 3, y: 4 } },
      background: "dark",
      showStationNames: false,
      showCompanyInfo: false,
      selectedRouteId: "route-2",
      layoutVersion: 2,
      networkSignature: "old-network",
    });

    expect(owner.current).toEqual({
      autoPositions: {},
      manualPositions: {},
      background: "theme",
      showStationNames: false,
      showCompanyInfo: false,
      selectedRouteId: "route-2",
      layoutVersion: 3,
      networkSignature: "old-network",
    });
  });

  it("removes invalid diagram nodes without changing other saved settings", () => {
    const owner = new MetroDiagramStateOwner();
    owner.updateLayout(
      { keep: { x: 10, y: 20 }, remove: { x: 30, y: 40 } },
      { keep: { x: 50, y: 60 }, remove: { x: 70, y: 80 } },
      "network",
    );

    owner.removeNodes(new Set(["remove"]));

    expect(owner.current).toMatchObject({
      autoPositions: { keep: { x: 10, y: 20 } },
      manualPositions: { keep: { x: 50, y: 60 } },
      networkSignature: "",
    });
  });
});
