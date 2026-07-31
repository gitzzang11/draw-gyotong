export type TransferInfoStation = {
  id: string;
  name: string;
  connectedRouteIds: string[];
  transferGroupId?: string;
};

export type TransferInfoRoute = {
  id: string;
  name: string;
  color: string;
  operational: boolean;
  paused: boolean;
  underConstruction: boolean;
};

export type TransferInfoLink = {
  id: string;
  stationIds: string[];
  distanceM: number;
  transferTimeMin: number;
  congestion: number;
  resistance: number;
  automatic: boolean;
};

export type TransferPassengerPath = {
  activeDemand: number;
  crowding: number;
  journey?: {
    routeIds: string[];
    stationIds: string[];
    transferStationIds: string[];
  };
};

export type StationTransferInfo = {
  stationId: string;
  stationName: string;
  isTransfer: boolean;
  members: TransferInfoStation[];
  connectedLines: TransferInfoRoute[];
  transferLinks: TransferInfoLink[];
  transferPairs: Array<[string, string]>;
  transferTimeMin: number;
  transferResistance: number;
  transferPassengers: number;
  transferCrowding: number;
  automatic: boolean | null;
  operationalStatus: "operational" | "partial" | "closed" | "invalid";
  integrityIssues: string[];
};

export function getStationTransferInfo(input: {
  stationId: string;
  stations: readonly TransferInfoStation[];
  routes: readonly TransferInfoRoute[];
  transfers: readonly TransferInfoLink[];
  passengerGroups: readonly TransferPassengerPath[];
}): StationTransferInfo | null {
  const station = input.stations.find((candidate) => candidate.id === input.stationId);
  if (!station) return null;
  const stationById = new Map(input.stations.map((candidate) => [candidate.id, candidate]));
  const routeById = new Map(input.routes.map((route) => [route.id, route]));
  const integrityIssues: string[] = [];
  const transferLinks = input.transfers.filter((transfer) =>
    transfer.id === station.transferGroupId || transfer.stationIds.includes(station.id)
  );
  const memberIds = new Set([station.id]);
  for (const transfer of transferLinks) {
    for (const memberId of transfer.stationIds) {
      if (stationById.has(memberId)) memberIds.add(memberId);
      else integrityIssues.push(`missing-transfer-station:${transfer.id}:${memberId}`);
    }
    if (station.transferGroupId && transfer.id !== station.transferGroupId) {
      integrityIssues.push(`mismatched-transfer-group:${station.id}:${transfer.id}`);
    }
  }
  if (station.transferGroupId && !transferLinks.some((transfer) => transfer.id === station.transferGroupId)) {
    integrityIssues.push(`missing-transfer-group:${station.id}:${station.transferGroupId}`);
  }
  const members = Array.from(memberIds, (id) => stationById.get(id)).filter(
    (candidate): candidate is TransferInfoStation => Boolean(candidate),
  );
  const routeIds = Array.from(new Set(members.flatMap((member) => member.connectedRouteIds)));
  const connectedLines = routeIds
    .map((routeId) => {
      const route = routeById.get(routeId);
      if (!route) integrityIssues.push(`missing-transfer-route:${station.id}:${routeId}`);
      return route;
    })
    .filter((route): route is TransferInfoRoute => Boolean(route));
  const transferPairs: Array<[string, string]> = [];
  for (let first = 0; first < connectedLines.length; first += 1) {
    for (let second = first + 1; second < connectedLines.length; second += 1) {
      transferPairs.push([connectedLines[first].id, connectedLines[second].id]);
    }
  }
  const transferMemberIds = new Set(members.map((member) => member.id));
  const actualTransferGroups = input.passengerGroups.filter((group) =>
    group.journey?.transferStationIds.some((stationId) => transferMemberIds.has(stationId))
  );
  const transferPassengers = actualTransferGroups.reduce((sum, group) => sum + Math.max(0, group.activeDemand), 0);
  const weightedCrowding = actualTransferGroups.reduce(
    (state, group) => ({
      demand: state.demand + Math.max(0, group.activeDemand),
      crowding: state.crowding + Math.max(0, group.activeDemand) * Math.max(0, group.crowding),
    }),
    { demand: 0, crowding: 0 },
  );
  const transferTimeMin = average(transferLinks.map((transfer) => transfer.transferTimeMin));
  const transferResistance = average(transferLinks.map((transfer) => transfer.resistance));
  const transferCrowding = weightedCrowding.demand > 0
    ? weightedCrowding.crowding / weightedCrowding.demand
    : average(transferLinks.map((transfer) => transfer.congestion));
  const availableLines = connectedLines.filter((route) => route.operational && !route.paused && !route.underConstruction);
  const operationalStatus = integrityIssues.length > 0
    ? "invalid"
    : connectedLines.length > 0 && availableLines.length === 0
      ? "closed"
      : availableLines.length < connectedLines.length
        ? "partial"
        : "operational";
  return {
    stationId: station.id,
    stationName: Array.from(new Set(members.map((member) => member.name))).join(" · "),
    isTransfer: connectedLines.length > 1 && (transferLinks.length > 0 || station.connectedRouteIds.length > 1),
    members,
    connectedLines,
    transferLinks,
    transferPairs,
    transferTimeMin,
    transferResistance,
    transferPassengers,
    transferCrowding,
    automatic: transferLinks.length === 0 ? null : transferLinks.every((transfer) => transfer.automatic),
    operationalStatus,
    integrityIssues,
  };
}

function average(values: readonly number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}
