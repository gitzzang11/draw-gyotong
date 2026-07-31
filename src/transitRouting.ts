export type Coordinate = [number, number];
export type TransitServiceKind = "local" | "express";

export type RoutingStation = {
  id: string;
  position: Coordinate;
  routeIds: string[];
  closed?: boolean;
};

export type RoutingPath = {
  id: string;
  coordinates: Coordinate[];
  enabled?: boolean;
};

export type RoutingService = {
  id: string;
  routeId: string;
  kind: TransitServiceKind;
  paths: RoutingPath[];
  stopStationIds: string[];
  speedKph: number;
  headwayMin: number;
  crowding: number;
};

export type RoutingTransfer = {
  id: string;
  stationIds: string[];
  walkMin: number;
  resistance: number;
};

export type RoutingPhysicalLink = {
  id: string;
  sourceStationId: string;
  targetStationId: string;
  sourceRouteId: string;
  targetRouteId: string;
  travelMin: number;
};

export type TransitLeg = {
  serviceId: string;
  routeId: string;
  serviceKind: TransitServiceKind;
  fromStationId: string;
  toStationId: string;
  stationIds: string[];
  segmentIds: string[];
  rideTimeMin: number;
  waitTimeMin: number;
  crowdingPenaltyMin: number;
  distanceKm: number;
};

export type TransitJourney = {
  originStationId: string;
  destinationStationId: string;
  routeIds: string[];
  serviceIds: string[];
  stationIds: string[];
  segmentIds: string[];
  transferStationIds: string[];
  transferCount: number;
  rideTimeMin: number;
  waitTimeMin: number;
  transferTimeMin: number;
  totalTimeMin: number;
  totalCost: number;
  legs: TransitLeg[];
};

export type RoutingNetwork = {
  stations: RoutingStation[];
  services: RoutingService[];
  transfers: RoutingTransfer[];
  physicalLinks?: RoutingPhysicalLink[];
};

type ProjectedStop = {
  stationId: string;
  distanceAlongKm: number;
  distanceToPathKm: number;
};

type Edge =
  | {
      kind: "ride";
      from: string;
      to: string;
      cost: number;
      rideTimeMin: number;
      crowdingPenaltyMin: number;
      distanceKm: number;
      service: RoutingService;
      segmentId: string;
    }
  | {
      kind: "switch";
      from: string;
      to: string;
      cost: number;
      waitTimeMin: number;
      transferTimeMin: number;
      resistanceCostMin: number;
      toServiceId: string;
      transferStationId: string;
    };

type Previous = { node: string; edge: Edge };

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function coordinateDistanceKm(a: Coordinate, b: Coordinate) {
  const earthKm = 6371;
  const latDelta = radians(b[0] - a[0]);
  const lngDelta = radians(b[1] - a[1]);
  const value =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(lngDelta / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function projectOnPath(point: Coordinate, path: Coordinate[]): ProjectedStop {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let traversed = 0;
  const latitudeScale = 111.32;
  const longitudeScale = 111.32 * Math.cos(radians(point[0]));
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const sx = (start[1] - point[1]) * longitudeScale;
    const sy = (start[0] - point[0]) * latitudeScale;
    const ex = (end[1] - point[1]) * longitudeScale;
    const ey = (end[0] - point[0]) * latitudeScale;
    const dx = ex - sx;
    const dy = ey - sy;
    const denominator = dx * dx + dy * dy;
    const ratio = denominator === 0 ? 0 : Math.max(0, Math.min(1, -(sx * dx + sy * dy) / denominator));
    const px = sx + dx * ratio;
    const py = sy + dy * ratio;
    const distance = Math.hypot(px, py);
    const segmentKm = coordinateDistanceKm(start, end);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = traversed + segmentKm * ratio;
    }
    traversed += segmentKm;
  }
  return { stationId: "", distanceAlongKm: bestAlong, distanceToPathKm: bestDistance };
}

function stateKey(stationId: string, serviceId: string) {
  return `${stationId}\u0000${serviceId}`;
}

export function buildNetworkSignature(network: RoutingNetwork) {
  return JSON.stringify({
    stations: network.stations.map((station) => [station.id, station.position, [...station.routeIds].sort(), station.closed ?? false]),
    services: network.services.map((service) => [
      service.id,
      service.routeId,
      service.kind,
      service.paths.map((path) => [path.id, path.coordinates, path.enabled ?? true]),
      [...service.stopStationIds].sort(),
    ]),
    transfers: network.transfers.map((transfer) => [transfer.id, [...transfer.stationIds].sort(), transfer.walkMin, transfer.resistance]),
    physicalLinks: (network.physicalLinks ?? []).map((link) => [link.id, link.sourceStationId, link.targetStationId, link.sourceRouteId, link.targetRouteId, link.travelMin]),
  });
}

export class TransitRouter {
  private readonly edges = new Map<string, Edge[]>();
  private readonly servicesByStation = new Map<string, RoutingService[]>();
  private readonly cache = new Map<string, TransitJourney | null>();
  private readonly network: RoutingNetwork;

  constructor(network: RoutingNetwork) {
    this.network = network;
    this.buildGraph();
  }

  findJourney(originStationId: string, destinationStationId: string): TransitJourney | null {
    const cacheKey = `${originStationId}>${destinationStationId}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (!cached) return null;
      const repriced = this.repriceJourney(cached);
      this.cache.set(cacheKey, repriced);
      return repriced;
    }
    if (originStationId === destinationStationId) return null;
    const originServices = this.servicesByStation.get(originStationId) ?? [];
    const destinationServices = new Set((this.servicesByStation.get(destinationStationId) ?? []).map((service) => service.id));
    const distances = new Map<string, number>();
    const previous = new Map<string, Previous>();
    const queue: Array<{ node: string; distance: number }> = [];

    for (const service of originServices) {
      const node = stateKey(originStationId, service.id);
      const wait = Math.max(0.5, service.headwayMin / 2);
      distances.set(node, wait);
      queue.push({ node, distance: wait });
    }

    let destinationNode: string | null = null;
    while (queue.length > 0) {
      queue.sort((a, b) => a.distance - b.distance);
      const current = queue.shift()!;
      if (current.distance !== distances.get(current.node)) continue;
      const separator = current.node.indexOf("\u0000");
      const stationId = current.node.slice(0, separator);
      const serviceId = current.node.slice(separator + 1);
      if (stationId === destinationStationId && destinationServices.has(serviceId)) {
        destinationNode = current.node;
        break;
      }
      for (const edge of this.edges.get(current.node) ?? []) {
        const nextDistance = current.distance + edge.cost;
        if (nextDistance >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, { node: current.node, edge });
        queue.push({ node: edge.to, distance: nextDistance });
      }
    }

    const result = destinationNode
      ? this.reconstruct(originStationId, destinationStationId, destinationNode, distances.get(destinationNode) ?? 0, previous)
      : null;
    this.cache.set(cacheKey, result);
    return result;
  }

  updateOperatingState(services: RoutingService[]) {
    const nextById = new Map(services.map((service) => [service.id, service]));
    for (const service of this.network.services) {
      const next = nextById.get(service.id);
      if (!next) continue;
      service.speedKph = next.speedKph;
      service.headwayMin = next.headwayMin;
      service.crowding = next.crowding;
    }
    for (const edgeList of this.edges.values()) {
      for (const edge of edgeList) {
        if (edge.kind === "ride") {
          edge.rideTimeMin = (edge.distanceKm / Math.max(8, edge.service.speedKph)) * 60 + 0.45;
          edge.crowdingPenaltyMin = Math.max(0, edge.service.crowding - 0.85) * edge.rideTimeMin * 0.35;
          edge.cost = edge.rideTimeMin + edge.crowdingPenaltyMin;
        } else {
          const toService = nextById.get(edge.toServiceId);
          edge.waitTimeMin = Math.max(0.5, (toService?.headwayMin ?? 30) / 2);
          edge.cost = edge.transferTimeMin + edge.waitTimeMin + edge.resistanceCostMin;
        }
      }
    }
  }

  getCacheSize() {
    return this.cache.size;
  }

  private addEdge(edge: Edge) {
    const list = this.edges.get(edge.from) ?? [];
    list.push(edge);
    this.edges.set(edge.from, list);
  }

  private buildGraph() {
    const availableStations = this.network.stations.filter((station) => !station.closed);
    const stationsById = new Map(availableStations.map((station) => [station.id, station]));
    for (const service of this.network.services) {
      const allowedStops = new Set(service.stopStationIds);
      const routeStations = availableStations.filter(
        (station) => station.routeIds.includes(service.routeId) && allowedStops.has(station.id),
      );
      for (const station of routeStations) {
        const services = this.servicesByStation.get(station.id) ?? [];
        services.push(service);
        this.servicesByStation.set(station.id, services);
      }
      for (const path of service.paths) {
        if (path.enabled === false || path.coordinates.length < 2) continue;
        const stops = routeStations
          .map((station) => ({ ...projectOnPath(station.position, path.coordinates), stationId: station.id }))
          .filter((stop) => stop.distanceToPathKm <= 0.12)
          .sort((a, b) => a.distanceAlongKm - b.distanceAlongKm);
        for (let index = 1; index < stops.length; index += 1) {
          const from = stops[index - 1];
          const to = stops[index];
          const distanceKm = Math.max(0.05, to.distanceAlongKm - from.distanceAlongKm);
          const rideTimeMin = (distanceKm / Math.max(8, service.speedKph)) * 60 + 0.45;
          const crowdingPenaltyMin = Math.max(0, service.crowding - 0.85) * rideTimeMin * 0.35;
          const segmentId = `${service.id}:${path.id}:${from.stationId}>${to.stationId}`;
          this.addEdge({
            kind: "ride",
            from: stateKey(from.stationId, service.id),
            to: stateKey(to.stationId, service.id),
            cost: rideTimeMin + crowdingPenaltyMin,
            rideTimeMin,
            crowdingPenaltyMin,
            distanceKm,
            service,
            segmentId,
          });
          this.addEdge({
            kind: "ride",
            from: stateKey(to.stationId, service.id),
            to: stateKey(from.stationId, service.id),
            cost: rideTimeMin + crowdingPenaltyMin,
            rideTimeMin,
            crowdingPenaltyMin,
            distanceKm,
            service,
            segmentId: `${service.id}:${path.id}:${to.stationId}>${from.stationId}`,
          });
        }
        const first = stops[0];
        const last = stops.at(-1);
        if (
          first &&
          last &&
          first.stationId !== last.stationId &&
          coordinateDistanceKm(path.coordinates[0], path.coordinates.at(-1)!) <= 0.12
        ) {
          const distanceKm = Math.max(0.05, coordinateDistanceKm(stationsById.get(first.stationId)!.position, stationsById.get(last.stationId)!.position));
          const rideTimeMin = (distanceKm / Math.max(8, service.speedKph)) * 60 + 0.45;
          const crowdingPenaltyMin = Math.max(0, service.crowding - 0.85) * rideTimeMin * 0.35;
          for (const [from, to] of [[first, last], [last, first]] as const) {
            this.addEdge({
              kind: "ride",
              from: stateKey(from.stationId, service.id),
              to: stateKey(to.stationId, service.id),
              cost: rideTimeMin + crowdingPenaltyMin,
              rideTimeMin,
              crowdingPenaltyMin,
              distanceKm,
              service,
              segmentId: `${service.id}:${path.id}:${from.stationId}>${to.stationId}:loop`,
            });
          }
        }
      }
    }

    const transferByPair = new Map<string, RoutingTransfer>();
    for (const transfer of this.network.transfers) {
      for (const from of transfer.stationIds) {
        for (const to of transfer.stationIds) {
          if (from !== to) transferByPair.set(`${from}\u0000${to}`, transfer);
        }
      }
    }
    for (const station of availableStations) {
      const reachableStations = [station.id];
      for (const key of transferByPair.keys()) {
        if (key.startsWith(`${station.id}\u0000`)) reachableStations.push(key.slice(key.indexOf("\u0000") + 1));
      }
      for (const fromService of this.servicesByStation.get(station.id) ?? []) {
        for (const targetStationId of reachableStations) {
          for (const toService of this.servicesByStation.get(targetStationId) ?? []) {
            if (fromService.id === toService.id) continue;
            const transfer = transferByPair.get(`${station.id}\u0000${targetStationId}`);
            const walkMin = transfer?.walkMin ?? (station.id === targetStationId ? 2.5 : 6);
            const resistanceMin = (transfer?.resistance ?? (station.id === targetStationId ? 8 : 20)) * 0.12;
            const waitTimeMin = Math.max(0.5, toService.headwayMin / 2);
            this.addEdge({
              kind: "switch",
              from: stateKey(station.id, fromService.id),
              to: stateKey(targetStationId, toService.id),
              cost: walkMin + waitTimeMin + resistanceMin,
              waitTimeMin,
              transferTimeMin: walkMin,
              resistanceCostMin: resistanceMin,
              toServiceId: toService.id,
              transferStationId: station.id,
            });
          }
        }
      }
    }
    for (const link of this.network.physicalLinks ?? []) {
      if (!stationsById.has(link.sourceStationId) || !stationsById.has(link.targetStationId)) continue;
      const sourceServices = (this.servicesByStation.get(link.sourceStationId) ?? []).filter((service) => service.routeId === link.sourceRouteId);
      const targetServices = (this.servicesByStation.get(link.targetStationId) ?? []).filter((service) => service.routeId === link.targetRouteId);
      for (const [fromStationId, fromServices, toStationId, toServices] of [
        [link.sourceStationId, sourceServices, link.targetStationId, targetServices],
        [link.targetStationId, targetServices, link.sourceStationId, sourceServices],
      ] as const) {
        for (const fromService of fromServices) for (const toService of toServices) {
          const waitTimeMin = Math.max(0.5, toService.headwayMin / 2);
          this.addEdge({
            kind: "switch",
            from: stateKey(fromStationId, fromService.id),
            to: stateKey(toStationId, toService.id),
            cost: link.travelMin + waitTimeMin,
            waitTimeMin,
            transferTimeMin: link.travelMin,
            resistanceCostMin: 0,
            toServiceId: toService.id,
            transferStationId: fromStationId,
          });
        }
      }
    }
  }

  private reconstruct(
    originStationId: string,
    destinationStationId: string,
    destinationNode: string,
    totalCost: number,
    previous: Map<string, Previous>,
  ): TransitJourney {
    const edges: Edge[] = [];
    let cursor = destinationNode;
    while (previous.has(cursor)) {
      const step = previous.get(cursor)!;
      edges.push(step.edge);
      cursor = step.node;
    }
    edges.reverse();
    const firstServiceId = cursor.slice(cursor.indexOf("\u0000") + 1);
    const firstService = this.network.services.find((service) => service.id === firstServiceId)!;
    const initialWait = Math.max(0.5, firstService.headwayMin / 2);
    const legs: TransitLeg[] = [];
    const transferStationIds: string[] = [];
    let transferTimeMin = 0;
    let waitTimeMin = initialWait;
    let currentStationId = originStationId;
    for (const edge of edges) {
      if (edge.kind === "switch") {
        transferStationIds.push(edge.transferStationId);
        transferTimeMin += edge.transferTimeMin;
        waitTimeMin += edge.waitTimeMin;
        currentStationId = edge.to.slice(0, edge.to.indexOf("\u0000"));
        continue;
      }
      const toStationId = edge.to.slice(0, edge.to.indexOf("\u0000"));
      const lastLeg = legs.at(-1);
      if (lastLeg?.serviceId === edge.service.id && lastLeg.toStationId === currentStationId) {
        lastLeg.toStationId = toStationId;
        lastLeg.stationIds.push(toStationId);
        lastLeg.segmentIds.push(edge.segmentId);
        lastLeg.rideTimeMin += edge.rideTimeMin;
        lastLeg.crowdingPenaltyMin += edge.crowdingPenaltyMin;
        lastLeg.distanceKm += edge.distanceKm;
      } else {
        legs.push({
          serviceId: edge.service.id,
          routeId: edge.service.routeId,
          serviceKind: edge.service.kind,
          fromStationId: currentStationId,
          toStationId,
          stationIds: [currentStationId, toStationId],
          segmentIds: [edge.segmentId],
          rideTimeMin: edge.rideTimeMin,
          waitTimeMin: legs.length === 0 ? initialWait : 0,
          crowdingPenaltyMin: edge.crowdingPenaltyMin,
          distanceKm: edge.distanceKm,
        });
      }
      currentStationId = toStationId;
    }
    const rideTimeMin = legs.reduce((sum, leg) => sum + leg.rideTimeMin, 0);
    const stationIds = legs.length > 0
      ? legs.flatMap((leg, index) => index === 0 ? leg.stationIds : leg.stationIds.slice(1))
      : [originStationId, destinationStationId];
    const totalTimeMin = rideTimeMin + waitTimeMin + transferTimeMin;
    return {
      originStationId,
      destinationStationId,
      routeIds: legs.map((leg) => leg.routeId),
      serviceIds: legs.map((leg) => leg.serviceId),
      stationIds,
      segmentIds: legs.flatMap((leg) => leg.segmentIds),
      transferStationIds,
      transferCount: transferStationIds.length,
      rideTimeMin,
      waitTimeMin,
      transferTimeMin,
      totalTimeMin,
      totalCost,
      legs,
    };
  }

  private repriceJourney(journey: TransitJourney): TransitJourney {
    const servicesById = new Map(this.network.services.map((service) => [service.id, service]));
    const previousCrowdingPenalty = journey.legs.reduce((sum, leg) => sum + leg.crowdingPenaltyMin, 0);
    const fixedResistanceCost = Math.max(
      0,
      journey.totalCost - journey.rideTimeMin - journey.waitTimeMin - journey.transferTimeMin - previousCrowdingPenalty,
    );
    const legs = journey.legs.map((leg) => {
      const service = servicesById.get(leg.serviceId);
      const rideTimeMin = service
        ? (leg.distanceKm / Math.max(8, service.speedKph)) * 60 + Math.max(1, leg.stationIds.length - 1) * 0.45
        : leg.rideTimeMin;
      const crowdingPenaltyMin = service ? Math.max(0, service.crowding - 0.85) * rideTimeMin * 0.35 : leg.crowdingPenaltyMin;
      return {
        ...leg,
        rideTimeMin,
        waitTimeMin: Math.max(0.5, (service?.headwayMin ?? 30) / 2),
        crowdingPenaltyMin,
      };
    });
    const rideTimeMin = legs.reduce((sum, leg) => sum + leg.rideTimeMin, 0);
    const waitTimeMin = legs.reduce((sum, leg) => sum + leg.waitTimeMin, 0);
    const crowdingPenaltyMin = legs.reduce((sum, leg) => sum + leg.crowdingPenaltyMin, 0);
    const totalTimeMin = rideTimeMin + waitTimeMin + journey.transferTimeMin;
    return {
      ...journey,
      legs,
      rideTimeMin,
      waitTimeMin,
      totalTimeMin,
      totalCost: totalTimeMin + crowdingPenaltyMin + fixedResistanceCost,
    };
  }
}
