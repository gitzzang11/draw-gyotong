import { describe, expect, it, vi } from "vitest";
import type { Station, TransferGroup } from "../src/domain/networkTypes";
import { buildTransferGroupMutation } from "../src/domain/transferMutations";

function station(id: string): Station {
  return { id, name: id, position: [37.5, 127], demand: 100, connectedRouteIds: [] };
}

describe("buildTransferGroupMutation", () => {
  it("builds one coherent station and transfer replacement", () => {
    const stations = [station("a"), station("b")];
    const result = buildTransferGroupMutation({
      stationIds: ["a", "b", "a"],
      automatic: false,
      stations,
      transfers: [],
      createId: () => "transfer-1",
      calculateMetrics: () => ({
        distanceM: 25,
        congestion: 0.5,
        transferTimeMin: 1.2,
        resistance: 12,
      }),
    });

    expect(result?.transfers).toEqual([{
      id: "transfer-1",
      stationIds: ["a", "b"],
      distanceM: 25,
      congestion: 0.5,
      transferTimeMin: 1.2,
      resistance: 12,
      automatic: false,
    }]);
    expect(result?.stations.map((item) => item.transferGroupId)).toEqual(["transfer-1", "transfer-1"]);
  });

  it("does not generate an id or metrics for an existing transfer", () => {
    const stations = [station("a"), station("b")];
    const transfers: TransferGroup[] = [{
      id: "existing",
      stationIds: ["a", "b"],
      distanceM: 10,
      transferTimeMin: 1,
      congestion: 0,
      resistance: 0,
      automatic: true,
    }];
    const createId = vi.fn(() => "unused");
    const calculateMetrics = vi.fn(() => ({
      distanceM: 0,
      congestion: 0,
      transferTimeMin: 0,
      resistance: 0,
    }));

    expect(buildTransferGroupMutation({
      stationIds: ["a", "b"],
      automatic: true,
      stations,
      transfers,
      createId,
      calculateMetrics,
    })).toBeNull();
    expect(createId).not.toHaveBeenCalled();
    expect(calculateMetrics).not.toHaveBeenCalled();
  });
});
