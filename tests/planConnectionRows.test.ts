import { describe, expect, it } from "vitest";
import { planConnectionRowsHtml } from "../src/ui/planConnectionRows";

describe("planned connection rows", () => {
  it("shows a saved loop with its route, status and a delete action while it is still a draft", () => {
    const html = planConnectionRowsHtml([{ id: "loop", title: "2호선 순환선 연결", status: "draft", cost: "100억" }]);
    expect(html).toContain("2호선 순환선 연결");
    expect(html).toContain("미착공");
    expect(html).toContain('data-plan-action="delete-connection"');
  });
  it("does not offer deletion for connections already in construction", () => {
    const html = planConnectionRowsHtml([{ id: "x", title: "연결", status: "under-construction", cost: "1억" }]);
    expect(html).toContain("공사 중");
    expect(html).not.toContain("delete-connection");
  });
});
