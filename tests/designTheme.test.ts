import { describe, expect, it } from "vitest";
import { applyMapTheme, DEFAULT_MAP_THEME, isMapTheme, MAP_THEMES, normalizeMapTheme } from "../src/design/theme";

describe("map theme", () => {
  it("defaults to the paper theme", () => {
    expect(DEFAULT_MAP_THEME).toBe("paper");
    expect(MAP_THEMES).toEqual(["paper", "ink"]);
  });

  it("keeps known themes and falls back for missing or unknown values", () => {
    expect(normalizeMapTheme("ink")).toBe("ink");
    expect(normalizeMapTheme("paper")).toBe("paper");
    expect(normalizeMapTheme(undefined)).toBe("paper");
    expect(normalizeMapTheme("dark")).toBe("paper");
    expect(normalizeMapTheme(1)).toBe("paper");
    expect(isMapTheme("ink")).toBe(true);
    expect(isMapTheme("INK")).toBe(false);
  });

  it("switches only the root data-theme attribute", () => {
    const root = { dataset: { performance: "battery" } as DOMStringMap };
    applyMapTheme(root, "ink");
    expect(root.dataset).toEqual({ performance: "battery", theme: "ink" });
    applyMapTheme(root, "paper");
    expect(root.dataset.theme).toBe("paper");
  });
});
