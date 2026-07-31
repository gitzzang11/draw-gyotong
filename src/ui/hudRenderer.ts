export interface HudView {
  text?: string;
  hidden?: boolean;
  active?: boolean;
}

export type HudElementKey =
  | "city"
  | "cash"
  | "dailyNet"
  | "satisfaction"
  | "satisfactionIcon"
  | "demand"
  | "day"
  | "clock"
  | "speed"
  | "pause"
  | "mode"
  | "tool"
  | "routeCount"
  | "stationCount"
  | "depotCount"
  | "selectedRoute"
  | "totalCost"
  | "cost"
  | "facility"
  | "headway"
  | "crowding"
  | "wait";

export type HudElements = Partial<Record<HudElementKey, HTMLElement | null>>;

export function renderHudView(element: HTMLElement | null | undefined, view: HudView) {
  if (!element) return false;
  let changed = false;
  if (view.text !== undefined && element.textContent !== view.text) {
    element.textContent = view.text;
    changed = true;
  }
  if (view.hidden !== undefined && element.hidden !== view.hidden) {
    element.hidden = view.hidden;
    changed = true;
  }
  if (view.active !== undefined && element.classList.contains("active") !== view.active) {
    element.classList.toggle("active", view.active);
    changed = true;
  }
  return changed;
}

export class HudRenderer {
  constructor(private readonly elements: HudElements) {}

  update(key: HudElementKey, view: HudView | string) {
    return renderHudView(this.elements[key], typeof view === "string" ? { text: view } : view);
  }

  updateMany(views: Partial<Record<HudElementKey, HudView | string>>) {
    for (const [key, view] of Object.entries(views)) {
      if (view !== undefined) this.update(key as HudElementKey, view);
    }
  }

  updateClock(day: string, clock: string) {
    this.update("day", day);
    this.update("clock", clock);
  }

  updateFinance(cash: string, dailyNet: string, negative: boolean) {
    this.update("cash", cash);
    this.update("dailyNet", dailyNet);
    this.elements.dailyNet?.classList.toggle("negative", negative);
  }
}
