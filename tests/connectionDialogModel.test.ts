import { describe, expect, it, vi } from "vitest";
import { ConnectionSubmissionGuard, getConnectionChoices } from "../src/connectionDialogModel";

describe("connection dialog model", () => {
  it("offers only feasible choices for the connection tool", () => {
    expect(getConnectionChoices({
      canMerge: true,
      canTransfer: false,
    }).choices.map((choice) => choice.id)).toEqual(["merge", "cross"]);
    expect(getConnectionChoices({
      canMerge: true,
      canTransfer: true,
    }).choices.map((choice) => choice.id)).toEqual(["merge", "transfer", "cross"]);
  });

  it("executes a rapid repeated confirmation only once", async () => {
    const guard = new ConnectionSubmissionGuard();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const action = vi.fn(async () => pending);
    const first = guard.run(action);
    const second = guard.run(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(await second).toBeUndefined();
    release();
    await first;
    expect(guard.active).toBe(false);
  });
});
