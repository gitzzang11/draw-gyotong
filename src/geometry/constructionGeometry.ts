import type { RouteSegment, Station } from "../domain/networkTypes.ts";

export type GeoCoordinate = [latitude: number, longitude: number];
const earthRadiusMeters = 6_371_000;

export function distanceMeters(a: GeoCoordinate, b: GeoCoordinate): number {
  if (!a.every(Number.isFinite) || !b.every(Number.isFinite)) return 0;
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLng = (b[1] - a[1]) * radians;
  const lat1 = a[0] * radians;
  const lat2 = b[0] * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(value)));
}

export function polylineLengthMeters(coordinates: readonly GeoCoordinate[]): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) total += distanceMeters(coordinates[index - 1], coordinates[index]);
  return Number.isFinite(total) ? total : 0;
}

export function coordinatesEqual(a: GeoCoordinate, b: GeoCoordinate, epsilon = 1e-7): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

export function dedupeCoordinates(coordinates: readonly GeoCoordinate[]): GeoCoordinate[] {
  return coordinates.reduce<GeoCoordinate[]>((result, point) => {
    if (!result.length || !coordinatesEqual(result.at(-1)!, point)) result.push([point[0], point[1]]);
    return result;
  }, []);
}

export function findNearestConnectionStation(input: {
  coordinate: GeoCoordinate;
  stations: readonly Station[];
  routeId: string;
  maximumDistanceMeters?: number;
  excludedStationIds?: readonly string[];
}): { station: Station; distanceMeters: number } | undefined {
  const excluded = new Set(input.excludedStationIds ?? []);
  return input.stations
    .filter((station) => station.connectedRouteIds.includes(input.routeId) && !excluded.has(station.id))
    .map((station) => ({ station, distanceMeters: distanceMeters(input.coordinate, station.position) }))
    .filter((match) => match.distanceMeters <= (input.maximumDistanceMeters ?? Number.POSITIVE_INFINITY))
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.station.id.localeCompare(b.station.id))[0];
}

function closestEndpoint(endpoints: readonly GeoCoordinate[], hint?: GeoCoordinate): GeoCoordinate {
  if (!endpoints.length) throw new Error("Route endpoint is missing.");
  return [...endpoints].sort((a, b) => hint ? distanceMeters(a, hint) - distanceMeters(b, hint) : 0)[0];
}

export function resolveRouteEndpoint(
  endpoints: readonly GeoCoordinate[],
  selectedEndpoint?: "start" | "end",
  hint?: GeoCoordinate,
): GeoCoordinate {
  if (!endpoints.length) throw new Error("Route endpoint is missing.");
  if (selectedEndpoint === "start") return endpoints[0];
  if (selectedEndpoint === "end") return endpoints.at(-1)!;
  return closestEndpoint(endpoints, hint);
}

export function normalizeConnectionPolyline(input: {
  sourceEndpoints: readonly GeoCoordinate[];
  targetEndpoints: readonly GeoCoordinate[];
  drawnCoordinates?: readonly GeoCoordinate[];
  sourceEndpoint?: "start" | "end";
  targetEndpoint?: "start" | "end";
}): { coordinates: GeoCoordinate[]; lengthMeters: number } {
  const drawn = (input.drawnCoordinates ?? []).map((point) => [point[0], point[1]] as GeoCoordinate);
  const source = resolveRouteEndpoint(input.sourceEndpoints, input.sourceEndpoint, drawn[0]);
  const target = resolveRouteEndpoint(input.targetEndpoints, input.targetEndpoint, drawn.at(-1));
  const coordinates = dedupeCoordinates([
    source,
    ...(drawn.length >= 2 ? drawn : []),
    target,
  ]);
  if (coordinates.length < 2 || polylineLengthMeters(coordinates) <= 0) throw new Error("Connection geometry is too short.");
  return { coordinates, lengthMeters: polylineLengthMeters(coordinates) };
}

export function createConnectionSegment(input: {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  coordinates: readonly GeoCoordinate[];
  constructionCost?: number;
}): RouteSegment {
  const coordinates = dedupeCoordinates(input.coordinates);
  if (coordinates.length < 2) throw new Error("Segment geometry requires two coordinates.");
  return {
    id: input.id,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    coordinates,
    lengthKm: Math.round(polylineLengthMeters(coordinates)) / 1000,
    terrainImpact: { riverCrossings: 0, mountainSegments: 0 },
    constructionMode: "bridge",
    constructionCost: input.constructionCost ?? 0,
    enabled: true,
  };
}

export function mergeRouteGeometry(input: {
  first: readonly GeoCoordinate[];
  second: readonly GeoCoordinate[];
  firstHint?: GeoCoordinate;
  secondHint?: GeoCoordinate;
  bridge: readonly GeoCoordinate[];
}): { coordinates: GeoCoordinate[]; reversedFirst: boolean; reversedSecond: boolean; connectionIndex: number } {
  const reverseFirst = input.firstHint
    ? distanceMeters(input.first[0], input.firstHint) < distanceMeters(input.first.at(-1)!, input.firstHint)
    : false;
  const reverseSecond = input.secondHint
    ? distanceMeters(input.second[0], input.secondHint) >= distanceMeters(input.second.at(-1)!, input.secondHint)
    : false;
  const first = reverseFirst ? [...input.first].reverse() : [...input.first];
  const second = reverseSecond ? [...input.second].reverse() : [...input.second];
  const connectionIndex = first.length - 1;
  return {
    coordinates: dedupeCoordinates([...first, ...input.bridge, ...second]),
    reversedFirst: reverseFirst,
    reversedSecond: reverseSecond,
    connectionIndex,
  };
}

export function splitRouteSegment<T extends Pick<RouteSegment, "id" | "fromNodeId" | "toNodeId" | "coordinates" | "lengthKm">>(input: {
  segment: T;
  junctionPosition: GeoCoordinate;
  splitRatio: number;
  junctionNodeId: string;
  beforeId: string;
  afterId: string;
}): { beforeSegment: T; afterSegment: T; totalLengthMeters: number } {
  if (!(input.splitRatio > 0 && input.splitRatio < 1)) throw new Error("Junction split ratio must be between 0 and 1.");
  const index = Math.max(1, Math.min(input.segment.coordinates.length - 1, Math.round((input.segment.coordinates.length - 1) * input.splitRatio)));
  const beforeCoordinates = dedupeCoordinates([...input.segment.coordinates.slice(0, index), input.junctionPosition]);
  const afterCoordinates = dedupeCoordinates([input.junctionPosition, ...input.segment.coordinates.slice(index)]);
  const totalLengthMeters = input.segment.lengthKm * 1000;
  const beforeLength = totalLengthMeters * input.splitRatio;
  const afterLength = totalLengthMeters - beforeLength;
  return {
    beforeSegment: { ...input.segment, id: input.beforeId, toNodeId: input.junctionNodeId, coordinates: beforeCoordinates, lengthKm: beforeLength / 1000 },
    afterSegment: { ...input.segment, id: input.afterId, fromNodeId: input.junctionNodeId, coordinates: afterCoordinates, lengthKm: afterLength / 1000 },
    totalLengthMeters,
  };
}

export function replaceSegmentId(
  segmentIds: readonly string[],
  originalId: string,
  beforeId: string,
  afterId: string,
): { segmentIds: string[]; originalIndex: number } {
  const indexes = segmentIds.flatMap((id, index) => id === originalId ? [index] : []);
  if (indexes.length !== 1) throw new Error(indexes.length ? "Original segment ID is duplicated." : "Original segment ID is missing.");
  return {
    segmentIds: segmentIds.flatMap((id) => id === originalId ? [beforeId, afterId] : [id]),
    originalIndex: indexes[0],
  };
}

export function findPolylineInsertionIndex(coordinates: readonly GeoCoordinate[], point: GeoCoordinate): number {
  if (coordinates.length < 2) throw new Error("Polyline requires two coordinates.");
  const latitudeScale = Math.cos(point[0] * Math.PI / 180);
  const project = ([lat, lng]: GeoCoordinate) => [lng * latitudeScale, lat] as const;
  const target = project(point);
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = project(coordinates[index - 1]);
    const end = project(coordinates[index]);
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((target[0] - start[0]) * dx + (target[1] - start[1]) * dy) / lengthSquared))
      : 0;
    const x = start[0] + ratio * dx - target[0];
    const y = start[1] + ratio * dy - target[1];
    const distance = x * x + y * y;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}
