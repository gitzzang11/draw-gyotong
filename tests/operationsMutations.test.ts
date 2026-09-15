import { describe, expect, it } from "vitest";
import type { OperatingService } from "../src/operatingService";
import type { TrainFleet } from "../src/domain/operationsState";
import { removeOperatingService, replaceOperatingService } from "../src/domain/operationsMutations";

const service = (id: string): OperatingService => ({ id } as OperatingService);
const fleet = (id: string, serviceId?: string): TrainFleet => ({ id, serviceId } as TrainFleet);

describe("operations mutations", () => {
  it("updates existing services and removes their fleets together", () => {
    const result = replaceOperatingService([service("a")], service("a"));
    expect(result).toEqual([service("a")]);
    expect(removeOperatingService([service("a"), service("b")], [fleet("f1", "a"), fleet("f2", "b")], "a")).toEqual({
      services: [service("b")],
      fleets: [fleet("f2", "b")],
    });
  });
});
