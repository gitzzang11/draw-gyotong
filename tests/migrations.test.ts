import { describe, expect, it } from "vitest";
import { CURRENT_SAVE_SCHEMA_VERSION, ensureStableId, stableEntityId } from "../src/storage/migrations";

describe("save migration primitives", () => {
  it("keeps existing ids and deterministically fills legacy missing ids", () => {
    expect(ensureStableId("existing", "station", "seed")).toBe("existing");
    expect(ensureStableId(undefined, "station", "seed")).toBe(stableEntityId("station", "seed"));
    expect(ensureStableId(undefined, "station", "seed")).toBe(ensureStableId(null, "station", "seed"));
  });

  it("exposes the current compatible schema version", () => {
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(3);
  });
});
