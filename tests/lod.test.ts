import { describe, expect, it } from "vitest";
import { getLodMode } from "../src/map/lod.ts";

describe("map LOD selection", () => {
  it("keeps the existing overview, district, and build zoom boundaries", () => {
    expect(getLodMode(10.99)).toBe("overview");
    expect(getLodMode(11)).toBe("district");
    expect(getLodMode(14.99)).toBe("district");
    expect(getLodMode(15)).toBe("build");
  });
});
