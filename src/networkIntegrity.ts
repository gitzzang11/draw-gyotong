export type IntegrityStation = {
  id: string;
  connectedRouteIds: string[];
  transferGroupId?: string;
};

export type IntegrityTransfer = { id: string; stationIds: string[] };
export type IntegrityDepot = { id: string; connectedRouteIds: string[] };
export type IntegrityFleet = { routeId: string };
export type IntegrityExpressConfig = { routeId: string; stopStationIds: string[] };
export type IntegrityPassengerGroup = {
  originStationId: string;
  destinationStationId: string;
  routeIds: string[];
  journey?: { stationIds: string[]; routeIds: string[] };
};
export type IntegrityProject = { routeIds: string[]; stationIds: string[]; depotIds: string[] };
export type IntegrityIssue = {
  code: string;
  entityId?: string;
  message: string;
  severity: "warning" | "error";
  recoverable: boolean;
};

export type ConstructionStatus = "planned" | "scheduled" | "building" | "opening-ready" | "operating";

/** Allows only the lifecycle transitions used by the construction day update and opening action. */
export function isValidConstructionStatusTransition(from: ConstructionStatus, to: ConstructionStatus) {
  if (from === to) return true;
  return (
    (from === "planned" && to === "scheduled") ||
    (from === "scheduled" && to === "building") ||
    (from === "building" && (to === "opening-ready" || to === "operating")) ||
    (from === "opening-ready" && to === "operating")
  );
}

export function normalizeTransferLinks<S extends IntegrityStation, T extends IntegrityTransfer>(stations: S[], transfers: T[]) {
  const stationIds = new Set(stations.map((station) => station.id));
  const candidateTransfers = transfers
    .map((transfer) => ({
      ...transfer,
      stationIds: Array.from(new Set(transfer.stationIds.filter((stationId) => stationIds.has(stationId)))),
    }))
    .filter((transfer) => transfer.stationIds.length >= 2) as T[];
  const memberToTransfer = new Map<string, string>();
  for (const transfer of candidateTransfers) {
    for (const stationId of transfer.stationIds) {
      // A station can belong to one transfer group. The first valid stored
      // group wins deterministically if a legacy save contains duplicates.
      if (!memberToTransfer.has(stationId)) memberToTransfer.set(stationId, transfer.id);
    }
  }
  const normalizedTransfers = candidateTransfers
    .map((transfer) => ({
      ...transfer,
      stationIds: transfer.stationIds.filter((stationId) => memberToTransfer.get(stationId) === transfer.id),
    }))
    .filter((transfer) => transfer.stationIds.length >= 2) as T[];
  const finalMembers = new Map<string, string>();
  for (const transfer of normalizedTransfers) {
    for (const stationId of transfer.stationIds) finalMembers.set(stationId, transfer.id);
  }
  const normalizedStations = stations.map((station) => {
    const transferGroupId = finalMembers.get(station.id);
    return transferGroupId === station.transferGroupId
      ? station
      : { ...station, transferGroupId } as S;
  });
  return { stations: normalizedStations, transfers: normalizedTransfers };
}

export function synchronizeNetworkReferences<
  S extends IntegrityStation,
  T extends IntegrityTransfer,
  D extends IntegrityDepot,
  F extends IntegrityFleet,
  E extends IntegrityExpressConfig,
  P extends IntegrityPassengerGroup,
  C extends IntegrityProject,
>(input: {
  routeIds: Iterable<string>;
  stations: S[];
  transfers: T[];
  depots: D[];
  fleets: F[];
  expressConfigs: E[];
  passengerGroups: P[];
  projects: C[];
}) {
  const routeIds = new Set(input.routeIds);
  const stationsWithRoutes = input.stations.map((station) => ({
    ...station,
    connectedRouteIds: Array.from(new Set(station.connectedRouteIds.filter((routeId) => routeIds.has(routeId)))),
  })) as S[];
  const transferState = normalizeTransferLinks(stationsWithRoutes, input.transfers);
  const stationIds = new Set(transferState.stations.map((station) => station.id));
  const depots = input.depots.map((depot) => ({
    ...depot,
    connectedRouteIds: Array.from(new Set(depot.connectedRouteIds.filter((routeId) => routeIds.has(routeId)))),
  })) as D[];
  const depotIds = new Set(depots.map((depot) => depot.id));
  const fleets = input.fleets.filter((fleet) => routeIds.has(fleet.routeId));
  const expressConfigs = input.expressConfigs
    .filter((config) => routeIds.has(config.routeId))
    .map((config) => ({
      ...config,
      stopStationIds: Array.from(new Set(config.stopStationIds.filter((stationId) => {
        const station = transferState.stations.find((candidate) => candidate.id === stationId);
        return Boolean(station?.connectedRouteIds.includes(config.routeId));
      }))),
    })) as E[];
  const passengerGroups = input.passengerGroups.filter((group) => {
    if (!stationIds.has(group.originStationId) || !stationIds.has(group.destinationStationId)) return false;
    if (!group.routeIds.every((routeId) => routeIds.has(routeId))) return false;
    return !group.journey || (
      group.journey.stationIds.every((stationId) => stationIds.has(stationId)) &&
      group.journey.routeIds.every((routeId) => routeIds.has(routeId))
    );
  });
  const projects = input.projects
    .map((project) => ({
      ...project,
      routeIds: project.routeIds.filter((routeId) => routeIds.has(routeId)),
      stationIds: project.stationIds.filter((stationId) => stationIds.has(stationId)),
      depotIds: project.depotIds.filter((depotId) => depotIds.has(depotId)),
    }))
    .filter((project) => project.routeIds.length > 0 || project.stationIds.length > 0 || project.depotIds.length > 0) as C[];
  return {
    stations: transferState.stations,
    transfers: transferState.transfers,
    depots,
    fleets,
    expressConfigs,
    passengerGroups,
    projects,
  };
}

export function validateNetworkIntegrity(input: {
  routeIds: Iterable<string>;
  stations: IntegrityStation[];
  transfers: IntegrityTransfer[];
  depots: Array<IntegrityDepot & { capacity?: number }>;
  fleets: Array<IntegrityFleet & { id?: string; sets?: number }>;
  expressConfigs: IntegrityExpressConfig[];
  passengerGroups: IntegrityPassengerGroup[];
  projects: Array<IntegrityProject & { id?: string; status?: string }>;
  blueprintIds?: Iterable<string>;
  numericState?: unknown;
}): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const routeIds = new Set(input.routeIds);
  const stationIds = new Set(input.stations.map((station) => station.id));
  const allIds = [
    ...routeIds,
    ...input.stations.map((item) => item.id),
    ...input.transfers.map((item) => item.id),
    ...input.depots.map((item) => item.id),
    ...input.fleets.map((item) => item.id).filter((id): id is string => Boolean(id)),
    ...input.projects.map((item) => item.id).filter((id): id is string => Boolean(id)),
  ];
  const seen = new Set<string>();
  for (const id of allIds) {
    if (seen.has(id)) issues.push(makeIssue("duplicate-id", id, `Entity id '${id}' is not unique.`));
    seen.add(id);
  }
  for (const station of input.stations) {
    for (const routeId of station.connectedRouteIds) {
      if (!routeIds.has(routeId)) issues.push(makeIssue("missing-route", station.id, `Station references missing route '${routeId}'.`));
    }
  }
  const membership = new Map<string, string>();
  for (const transfer of input.transfers) {
    const members = new Set<string>();
    for (const stationId of transfer.stationIds) {
      if (!stationIds.has(stationId)) issues.push(makeIssue("missing-transfer-station", transfer.id, `Transfer references missing station '${stationId}'.`));
      if (members.has(stationId)) issues.push(makeIssue("duplicate-transfer-member", transfer.id, `Station '${stationId}' is duplicated in a transfer.`));
      members.add(stationId);
      const previous = membership.get(stationId);
      if (previous && previous !== transfer.id) issues.push(makeIssue("multiple-transfer-groups", stationId, "Station belongs to multiple transfer groups."));
      membership.set(stationId, transfer.id);
      const station = input.stations.find((candidate) => candidate.id === stationId);
      if (station && station.transferGroupId !== transfer.id) issues.push(makeIssue("asymmetric-transfer", stationId, "Station and transfer group links disagree."));
    }
  }
  for (const station of input.stations) {
    if (station.transferGroupId && membership.get(station.id) !== station.transferGroupId) {
      issues.push(makeIssue("orphan-transfer-link", station.id, "Station references a missing or mismatched transfer group."));
    }
  }
  for (const fleet of input.fleets) {
    if (!routeIds.has(fleet.routeId)) issues.push(makeIssue("orphan-fleet", fleet.id, `Fleet references missing route '${fleet.routeId}'.`));
  }
  for (const depot of input.depots) {
    if (depot.connectedRouteIds.some((routeId) => !routeIds.has(routeId))) issues.push(makeIssue("orphan-depot-route", depot.id, "Depot references a missing route."));
    if (depot.capacity !== undefined) {
      const assigned = input.fleets
        .filter((fleet) => depot.connectedRouteIds.includes(fleet.routeId))
        .reduce((sum, fleet) => sum + Math.max(0, fleet.sets ?? 0), 0);
      if (assigned > depot.capacity) issues.push(makeIssue("depot-over-capacity", depot.id, `Assigned train sets ${assigned} exceed capacity ${depot.capacity}.`, "warning"));
    }
  }
  for (const group of input.passengerGroups) {
    const invalidStation = !stationIds.has(group.originStationId) || !stationIds.has(group.destinationStationId) ||
      Boolean(group.journey?.stationIds.some((id) => !stationIds.has(id)));
    const invalidRoute = group.routeIds.some((id) => !routeIds.has(id)) || Boolean(group.journey?.routeIds.some((id) => !routeIds.has(id)));
    if (invalidStation || invalidRoute) issues.push(makeIssue("orphan-passenger-path", `${group.originStationId}:${group.destinationStationId}`, "Passenger group references a deleted network entity."));
  }
  for (const id of new Set(input.blueprintIds ?? [])) {
    if (seen.has(id)) issues.push(makeIssue("blueprint-id-collision", id, "Blueprint id collides with a completed entity."));
  }
  const validStatuses = new Set<unknown>(["planned", "scheduled", "building", "opening-ready", "operating"]);
  for (const project of input.projects) {
    if (project.status !== undefined && !validStatuses.has(project.status)) issues.push(makeIssue("invalid-construction-status", project.id, `Unknown construction status '${project.status}'.`));
  }
  findNonFinite(input.numericState, "$", issues, new WeakSet<object>());
  return issues;
}

function makeIssue(code: string, entityId: string | undefined, message: string, severity: IntegrityIssue["severity"] = "error"): IntegrityIssue {
  return { code, entityId, message, severity, recoverable: true };
}

function findNonFinite(value: unknown, path: string, issues: IntegrityIssue[], visited: WeakSet<object>) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) issues.push(makeIssue("non-finite-number", path, `Non-finite number at ${path}.`));
    return;
  }
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => findNonFinite(item, `${path}[${index}]`, issues, visited));
  else for (const [key, item] of Object.entries(value)) findNonFinite(item, `${path}.${key}`, issues, visited);
}
