export type UpdateDomain =
  | "network"
  | "routes"
  | "demand"
  | "capacity"
  | "congestion"
  | "finance"
  | "map-lines"
  | "map-stations"
  | "map-trains"
  | "map-depots"
  | "map-blueprints"
  | "map-construction"
  | "map-selection"
  | "map-lod"
  | "hud-clock"
  | "hud-finance"
  | "hud-status"
  | "active-panel"
  | "workflow"
  | "notifications"
  | "storage";

export type UpdateReason =
  | "full"
  | "station-label"
  | "route-style"
  | "fleet-service"
  | "fare"
  | "network-structure"
  | "viewport"
  | "selection"
  | "mode"
  | "clock"
  | "construction-progress"
  | "plan-conversion"
  | "blueprint-preview"
  | "panel"
  | "notifications"
  | "finance-only"
  | "daily-settlement"
  | "express-stops";

const orderedDomains: UpdateDomain[] = [
  "network", "routes", "demand", "capacity", "congestion", "finance",
  "map-lines", "map-stations", "map-trains", "map-depots", "map-blueprints",
  "map-construction", "map-selection", "map-lod", "hud-clock", "hud-finance",
  "hud-status", "active-panel", "workflow", "notifications", "storage",
];

const dependencies: Record<UpdateReason, readonly UpdateDomain[]> = {
  full: orderedDomains,
  "station-label": ["map-stations", "active-panel", "storage"],
  "route-style": ["map-lines", "map-stations", "map-trains", "map-selection", "hud-status", "active-panel", "storage"],
  "fleet-service": ["capacity", "congestion", "finance", "map-trains", "hud-status", "active-panel", "storage"],
  fare: ["demand", "congestion", "finance", "hud-finance", "hud-status", "active-panel", "storage"],
  "network-structure": [
    "network", "routes", "demand", "capacity", "congestion", "finance",
    "map-lines", "map-stations", "map-trains", "map-depots", "map-selection",
    "hud-status", "active-panel", "storage",
  ],
  // Zoom changes affect layer visibility as well as the terrain/tile LOD.
  viewport: ["map-stations", "map-trains", "map-lod"],
  selection: ["map-selection", "active-panel", "hud-status"],
  mode: ["map-selection", "hud-status", "workflow", "active-panel"],
  clock: ["hud-clock", "map-trains"],
  "construction-progress": ["map-construction", "workflow", "notifications", "active-panel", "storage"],
  "plan-conversion": [
    "network", "routes", "demand", "capacity", "congestion", "finance",
    "map-lines", "map-stations", "map-trains", "map-depots", "map-blueprints",
    "map-construction", "map-selection", "hud-finance", "hud-status",
    "active-panel", "workflow", "storage",
  ],
  "blueprint-preview": ["map-blueprints", "workflow"],
  panel: ["active-panel"],
  notifications: ["notifications"],
  "finance-only": ["finance", "hud-finance", "active-panel", "storage"],
  "daily-settlement": ["finance", "hud-finance", "hud-status", "active-panel", "notifications", "storage"],
  "express-stops": ["capacity", "congestion", "finance", "map-stations", "map-trains", "hud-status", "active-panel", "storage"],
};

export interface UpdateTrace {
  requested: Record<string, number>;
  executed: Record<string, number>;
  merged: number;
  reasons: string[];
}

export function domainsForUpdate(reason: UpdateReason): UpdateDomain[] {
  const selected = new Set(dependencies[reason]);
  return orderedDomains.filter((domain) => selected.has(domain));
}

export class DirtyUpdateScheduler {
  private dirty = new Set<UpdateDomain>();
  private nextDirty = new Set<UpdateDomain>();
  private flushing = false;
  private readonly trace: UpdateTrace = { requested: {}, executed: {}, merged: 0, reasons: [] };

  mark(reason: UpdateReason) {
    this.markDomains(domainsForUpdate(reason), reason);
  }

  markDomains(domains: readonly UpdateDomain[], reason = "direct") {
    const target = this.flushing ? this.nextDirty : this.dirty;
    this.trace.reasons.push(reason);
    for (const domain of domains) {
      this.trace.requested[domain] = (this.trace.requested[domain] ?? 0) + 1;
      if (target.has(domain)) this.trace.merged += 1;
      target.add(domain);
    }
  }

  consume(): UpdateDomain[] {
    if (this.flushing) return [];
    this.flushing = true;
    const result = orderedDomains.filter((domain) => this.dirty.has(domain));
    this.dirty.clear();
    for (const domain of result) this.trace.executed[domain] = (this.trace.executed[domain] ?? 0) + 1;
    return result;
  }

  finishFlush() {
    this.flushing = false;
    if (this.nextDirty.size > 0) {
      this.dirty = this.nextDirty;
      this.nextDirty = new Set();
    }
  }

  has(domain: UpdateDomain) {
    return this.dirty.has(domain) || this.nextDirty.has(domain);
  }

  get isFlushing() {
    return this.flushing;
  }

  get hasPending() {
    return this.dirty.size > 0 || this.nextDirty.size > 0;
  }

  snapshot(): UpdateTrace {
    return {
      requested: { ...this.trace.requested },
      executed: { ...this.trace.executed },
      merged: this.trace.merged,
      reasons: [...this.trace.reasons],
    };
  }
}
