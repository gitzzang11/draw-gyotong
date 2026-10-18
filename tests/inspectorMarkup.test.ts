import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  lineMarkHtml,
  lineMarkLabel,
  metricRowsHtml,
  prefersDarkText,
  routeRowsHtml,
  safeColor,
  statusTagHtml,
} from "../src/ui/inspectorMarkup";

describe("inspector markup", () => {
  it("escapes text", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("derives a short line mark label", () => {
    expect(lineMarkLabel("1호선")).toBe("1");
    expect(lineMarkLabel("12호선 급행")).toBe("12");
    expect(lineMarkLabel("공항철도")).toBe("공항");
    expect(lineMarkLabel("광주 1호선")).toBe("1");
    expect(lineMarkLabel("광주2호선")).toBe("2");
    expect(lineMarkLabel(" 신 분당선")).toBe("신분");
    expect(lineMarkLabel("")).toBe("?");
  });

  it("picks the higher-contrast text colour for a line colour", () => {
    expect(prefersDarkText("#F2BE00")).toBe(true);
    expect(prefersDarkText("#E8A93A")).toBe(true);
    expect(prefersDarkText("#2F5BB7")).toBe(false);
    expect(prefersDarkText("#000")).toBe(false);
    expect(prefersDarkText("not-a-colour")).toBe(false);
  });

  it("only lets hex colours into inline styles", () => {
    expect(safeColor("#2E9E4F")).toBe("#2E9E4F");
    expect(safeColor("red;background:url(x)")).toBe("#6B7076");
    expect(lineMarkHtml({ name: "2호선", color: "#2E9E4F" })).toContain("--line-color:#2E9E4F");
  });

  it("marks planned lines with the dashed variant and body text colour", () => {
    const html = lineMarkHtml({ name: "기획선", color: "#F2C200" }, "sm", "plan");
    expect(html).toContain("dg-line-mark--plan");
    expect(html).not.toContain("dg-line-mark--on-dark");
  });

  it("pairs tones with a shape, not colour alone", () => {
    const html = metricRowsHtml([{ label: "추세", value: "하락", tone: "down" }, { label: "혼잡", value: "132%", tone: "danger" }]);
    expect(html).toContain("▼ 하락");
    expect(html).toContain("✕ 132%");
    expect(statusTagHtml("planned", "계획 중")).toContain("◌");
  });

  it("shows an empty-state note when no routes are connected", () => {
    expect(routeRowsHtml([], "연결된 노선이 없습니다.")).toContain("연결된 노선이 없습니다.");
    expect(routeRowsHtml([{ name: "<b>", color: "#000000", status: "운행" }], "")).toContain("&lt;b&gt;");
  });
});
