import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex } from "../src/ui/colorPickerModel.ts";

describe("color picker value model", () => {
  it("converts primary colors to the existing picker HSL values", () => {
    expect(hexToHsl("#ff0000")).toEqual({ hue: 0, saturation: 100, lightness: 50 });
    expect(hexToHsl("#00ff00")).toEqual({ hue: 120, saturation: 100, lightness: 50 });
    expect(hexToHsl("#0000ff")).toEqual({ hue: 240, saturation: 100, lightness: 50 });
  });

  it("returns the existing whole-channel picker colors after HSL rounding", () => {
    expect(hslToHex(hexToHsl("#4ce0c3"))).toBe("#4DE0C2");
    expect(hslToHex(hexToHsl("#ff5d5d"))).toBe("#FF5C5C");
    expect(hslToHex(hexToHsl("#7aa7ff"))).toBe("#7AA7FF");
    expect(hslToHex(hexToHsl("#808080"))).toBe("#808080");
  });

  it("uses zero hue and saturation for grayscale colors", () => {
    expect(hexToHsl("#808080")).toEqual({ hue: 0, saturation: 0, lightness: 50 });
  });
});
