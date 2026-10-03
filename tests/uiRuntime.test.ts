import { describe, expect, it, vi } from "vitest";
import { HudRenderer } from "../src/ui/hudRenderer";
import { PanelManager } from "../src/ui/panelManager";
import { DialogManager } from "../src/ui/dialogManager";
import { StationPanel } from "../src/ui/stationPanel";

class FakeClassList {
  private readonly values = new Set<string>();
  contains(value: string) { return this.values.has(value); }
  toggle(value: string, force?: boolean) {
    const enabled = force ?? !this.values.has(value);
    if (enabled) this.values.add(value);
    else this.values.delete(value);
    return enabled;
  }
}

class FakeElement extends EventTarget {
  hidden = true;
  innerHTML = "";
  textContent = "";
  classList = new FakeClassList();
  style: Record<string, string> = {};
}

const element = () => new FakeElement() as unknown as HTMLElement;

describe("UI runtime ownership", () => {
  it("updates existing HUD nodes without creating replacements", () => {
    const clock = element();
    const renderer = new HudRenderer({ clock });
    renderer.update("clock", "10:00");
    renderer.update("clock", "10:01");
    expect(clock.textContent).toBe("10:01");
  });

  it("changes only the clock nodes for a clock update", () => {
    const day = element();
    const clock = element();
    const cash = element();
    cash.textContent = "100억";
    new HudRenderer({ day, clock, cash }).updateClock("2일차", "06:30");
    expect([day.textContent, clock.textContent, cash.textContent]).toEqual(["2일차", "06:30", "100억"]);
  });

  it("does not invoke unrelated calculation work for a finance update", () => {
    const calculateRoute = vi.fn();
    const renderer = new HudRenderer({ cash: element(), dailyNet: element() });
    renderer.updateFinance("90억", "-2억", true);
    expect(calculateRoute).not.toHaveBeenCalled();
  });

  it("opens, replaces, and closes panels", () => {
    const first = element();
    const second = element();
    const manager = new PanelManager()
      .register({ id: "station", element: first })
      .register({ id: "line", element: second });
    manager.open("station", "s1");
    manager.open("line", "l1");
    expect(first.hidden).toBe(true);
    expect(second.hidden).toBe(false);
    expect(manager.current).toEqual({ kind: "line", entityId: "l1" });
    manager.close();
    expect(second.hidden).toBe(true);
  });

  it("keeps the listener count stable after twenty reopens", () => {
    const panel = element();
    const action = new EventTarget();
    const manager = new PanelManager().register({ id: "station", element: panel });
    for (let index = 0; index < 20; index += 1) {
      manager.open("station", "s1");
      manager.bind("station", "action", action, "click", vi.fn());
    }
    expect(manager.listeners.size).toBe(1);
  });

  it("removes the previous listener scope when a panel is replaced", () => {
    const manager = new PanelManager()
      .register({ id: "station", element: element() })
      .register({ id: "depot", element: element() });
    manager.open("station", "s1");
    manager.bind("station", "action", new EventTarget(), "click", vi.fn());
    manager.open("depot", "d1");
    expect(manager.listeners.snapshot().some((item) => item.scope === "panel:station")).toBe(false);
  });

  it("closes safely when the selected entity was deleted", () => {
    const panel = element();
    const manager = new PanelManager().register({ id: "station", element: panel });
    manager.open("station", "deleted");
    expect(manager.closeMissing("station", () => false)).toBe(true);
    expect(panel.hidden).toBe(true);
  });

  it("cleans dialog listeners after close", () => {
    const backdrop = element();
    const target = new EventTarget();
    const panels = new PanelManager().register({ id: "dialog:decision", element: backdrop });
    const dialogs = new DialogManager(panels);
    dialogs.open("decision");
    dialogs.bind("decision", "cancel", target, "click", vi.fn());
    dialogs.close("decision");
    expect(panels.listeners.size).toBe(0);
  });

  it("cleans backdrop pointer listeners after close", () => {
    const backdrop = element();
    const panels = new PanelManager().register({ id: "dialog:decision", element: backdrop });
    const dialogs = new DialogManager(panels);
    dialogs.open("decision");
    dialogs.bindBackdropDismiss("decision", backdrop, vi.fn());
    expect(panels.listeners.size).toBe(3);
    dialogs.close("decision");
    expect(panels.listeners.size).toBe(0);
  });

  it("runs a rapidly clicked confirmation once", () => {
    const backdrop = element();
    const button = new EventTarget();
    const action = vi.fn();
    const panels = new PanelManager().register({ id: "dialog:decision", element: backdrop });
    const dialogs = new DialogManager(panels);
    dialogs.open("decision");
    dialogs.bindConfirmation("decision", button, action);
    button.dispatchEvent(new Event("click"));
    button.dispatchEvent(new Event("click"));
    expect(action).toHaveBeenCalledOnce();
  });

  it("renders HUD and panel content without a full render function", () => {
    const cash = element();
    const content = element();
    const manager = new PanelManager().register({ id: "operations", element: element(), content });
    new HudRenderer({ cash }).update("cash", "120억");
    manager.render("operations", "overview", "<strong>운영 현황</strong>");
    expect(cash.textContent).toBe("120억");
    expect(content.innerHTML).toContain("운영 현황");
  });

  it("renders transfer-station information through StationPanel", () => {
    const content = element();
    const manager = new PanelManager().register({ id: "station", element: element(), content });
    const panel = new StationPanel(manager, element(), content);
    panel.renderView({
      entityId: "station-1",
      title: "시청",
      name: "시청<script>",
      status: "operational",
      statusLabel: "운영 중",
      metrics: [{ label: "혼잡도", value: "35%" }],
      reasons: [],
      reasonsNote: "안정",
      routes: [{ name: "1호선", color: "#2F5BB7" }, { name: "2호선", color: "#2E9E4F" }],
      transferKind: "환승역",
      transfer: { metrics: [{ label: "평균 환승시간", value: "3.2분" }], notes: [], pairs: ["1호선 ↔ 2호선"] },
      dangerTitle: "환승역 전체 철거",
      dangerDescription: "두 역을 함께 철거합니다.",
      dangerAction: "환승역 철거",
    }, vi.fn());
    expect(content.innerHTML).toContain("환승역");
    expect(content.innerHTML).toContain("평균 환승시간");
    expect(content.innerHTML).toContain("3.2분");
    expect(content.innerHTML).toContain("1호선 ↔ 2호선");
    expect(content.innerHTML).toContain("시청&lt;script&gt;");
    expect(content.innerHTML).not.toContain("<script>");
  });
});
