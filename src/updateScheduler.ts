export type UpdateDomain =
  | "network"
  | "routes"
  | "demand"
  | "capacity"
  | "congestion"
  | "finance"
  | "map-entities"
  | "trains"
  | "hud"
  | "panels"
  | "storage";

export type UpdateReason =
  | "full"
  | "station-label"
  | "route-style"
  | "fleet-service"
  | "fare"
  | "network-structure"
  | "viewport"
  | "clock";

const orderedDomains: UpdateDomain[] = [
  "network",
  "routes",
  "demand",
  "capacity",
  "congestion",
  "finance",
  "map-entities",
  "trains",
  "hud",
  "panels",
  "storage",
];

const dependencies: Record<UpdateReason, readonly UpdateDomain[]> = {
  full: orderedDomains,
  "station-label": ["map-entities", "panels", "storage"],
  "route-style": ["routes", "map-entities", "hud", "panels", "storage"],
  "fleet-service": ["capacity", "congestion", "finance", "trains", "hud", "panels", "storage"],
  fare: ["demand", "congestion", "finance", "hud", "panels", "storage"],
  "network-structure": [
    "network",
    "routes",
    "demand",
    "capacity",
    "congestion",
    "finance",
    "map-entities",
    "trains",
    "hud",
    "panels",
    "storage",
  ],
  viewport: ["map-entities"],
  clock: ["demand", "congestion", "finance", "trains", "hud", "panels"],
};

export function domainsForUpdate(reason: UpdateReason): UpdateDomain[] {
  const selected = new Set(dependencies[reason]);
  return orderedDomains.filter((domain) => selected.has(domain));
}

export class DirtyUpdateScheduler {
  private readonly dirty = new Set<UpdateDomain>();

  mark(reason: UpdateReason) {
    for (const domain of dependencies[reason]) this.dirty.add(domain);
  }

  consume(): UpdateDomain[] {
    const result = orderedDomains.filter((domain) => this.dirty.has(domain));
    this.dirty.clear();
    return result;
  }

  has(domain: UpdateDomain) {
    return this.dirty.has(domain);
  }
}
