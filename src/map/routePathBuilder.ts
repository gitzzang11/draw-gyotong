export type RouteCoordinate = [latitude: number, longitude: number];

type RoutePathSource = {
  coordinates: Array<RouteCoordinate>;
  disabledSegments?: number[];
  branches?: Array<{ segmentIds: string[] }>;
  segments?: Array<{ id: string; enabled: boolean; coordinates: Array<RouteCoordinate> }>;
};

/**
 * Split a route at disabled segments. Renderers and train movement must not
 * treat separated runs as one continuous path.
 */
export function getRouteRuns(route: RoutePathSource): RouteCoordinate[][] {
  const gaps = new Set(route.disabledSegments ?? []);
  const runs: RouteCoordinate[][] = [];
  let currentRun: RouteCoordinate[] = route.coordinates.length > 0 ? [route.coordinates[0]] : [];
  for (let index = 0; index < route.coordinates.length - 1; index += 1) {
    if (gaps.has(index)) {
      if (currentRun.length > 1) runs.push(currentRun);
      currentRun = [route.coordinates[index + 1]];
      continue;
    }
    currentRun.push(route.coordinates[index + 1]);
  }
  if (currentRun.length > 1) runs.push(currentRun);
  return runs;
}

export function getRoutePathCoordinates(route: RoutePathSource): RouteCoordinate[][] {
  const branchSegmentIds = new Set((route.branches ?? []).flatMap((branch) => branch.segmentIds));
  const branchPaths = (route.segments ?? [])
    .filter((segment) => segment.enabled && branchSegmentIds.has(segment.id))
    .map((segment) => segment.coordinates);
  return [...getRouteRuns(route), ...branchPaths];
}
