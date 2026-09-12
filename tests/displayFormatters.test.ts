import { describe, expect, it } from "vitest";
import { formatCost, formatPlayTime, formatSignedCost } from "../src/ui/displayFormatters.ts";

describe("display formatters", () => {
  it("formats costs with the existing non-negative whole-unit convention", () => {
    expect(formatCost(-1)).toBe("0억");
    expect(formatCost(0)).toBe("0억");
    expect(formatCost(12.5)).toBe("13억");
    expect(formatCost(12345)).toBe("12,345억");
  });

  it("formats signed costs without changing the zero convention", () => {
    expect(formatSignedCost(-12.5)).toBe("-12억");
    expect(formatSignedCost(0)).toBe("0억");
    expect(formatSignedCost(12.5)).toBe("13억");
  });

  it("formats play time in the existing Korean minute and hour forms", () => {
    expect(formatPlayTime(-1)).toBe("0분");
    expect(formatPlayTime(3_599)).toBe("59분");
    expect(formatPlayTime(3_600)).toBe("1시간");
    expect(formatPlayTime(5_460)).toBe("1시간 31분");
  });
});
