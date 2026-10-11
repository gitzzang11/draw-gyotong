import type { PlannedRoute } from "./constructionTypes.ts";
import { distanceMeters, type GeoCoordinate } from "../geometry/constructionGeometry.ts";

/**
 * 연장 조각(기획 연장 도구로 만든 계획 노선)은 "붙는 점부터 바깥 끝까지의 새 구간"만 담는다.
 * 예전 세이브는 계획 조각을 이어 연장할 때 부모 조각 경로 + 새 구간 전체를 저장해 비용·길이·수요가 두 번 잡혔다.
 * 그런 조각을 불러올 때 새 구간만 남긴다. 좌표는 [붙는 점, …, 바깥 끝] 순서(운영 노선 연장 조각과 같은 형태).
 */
export function toAdditionOnlyExtension(route: PlannedRoute, parent: PlannedRoute): PlannedRoute {
  const segments = route.extensionAtStart
    ? route.segments.slice(0, Math.max(0, route.segments.length - parent.segments.length))
    : route.segments.slice(Math.min(parent.segments.length, route.segments.length));
  const coordinates = route.extensionAtStart
    ? route.coordinates.slice(0, Math.max(0, route.coordinates.length - parent.coordinates.length) + 1).reverse()
    : route.coordinates.slice(Math.max(0, parent.coordinates.length - 1));
  if (segments.length === 0 || coordinates.length < 2) return { ...route, extensionGeometry: "addition" };
  const fullLength = route.segments.reduce((sum, segment) => sum + segment.lengthKm, 0);
  const keptLength = segments.reduce((sum, segment) => sum + segment.lengthKm, 0);
  const ratio = fullLength > 0 ? keptLength / fullLength : 1;
  const segmentDays = segments.map((segment) => segment.constructionDays);
  const keptIds = new Set(segments.map((segment) => segment.id));
  return {
    ...route,
    coordinates,
    segments,
    completedSegmentIds: route.completedSegmentIds.filter((id) => keptIds.has(id)),
    expectedCost: segments.reduce((sum, segment) => sum + segment.constructionCost, 0),
    constructionDays: segmentDays.every((days) => typeof days === "number")
      ? Math.max(1, Math.round(segmentDays.reduce<number>((sum, days) => sum + (days ?? 0), 0)))
      : Math.max(1, Math.round(route.constructionDays * ratio)),
    expectedDemand: Math.round(route.expectedDemand * ratio),
    expectedRevenue: Math.round(route.expectedRevenue * ratio),
    extensionGeometry: "addition",
  };
}

/** 기획안의 예전 형태 이어 연장 조각을 모두 새 구간만 담는 형태로 바꾼다(부모는 바꾸기 전 경로로 자른다). */
export function normalizeExtensionChains(routes: readonly PlannedRoute[]): PlannedRoute[] {
  const original = new Map(routes.map((route) => [route.id, route]));
  return routes.map((route) => {
    if (!route.parentBlueprintId || route.extensionGeometry === "addition") return route;
    const parent = original.get(route.parentBlueprintId);
    return parent ? toAdditionOnlyExtension(route, parent) : route;
  });
}

export interface ExtensionChainMember {
  owner: { kind: "actual" | "planned"; id: string };
  coordinates: ReadonlyArray<GeoCoordinate>;
}

export interface ExtensionFreeEndpoint {
  owner: { kind: "actual" | "planned"; id: string };
  /** 그 조각의 시작점이면 true, 끝점이면 false */
  atStart: boolean;
  position: GeoCoordinate;
}

/**
 * 한 노선으로 묶인 조각들(운영 노선 + 연장 조각들)의 바깥 끝점. 다른 조각의 끝점과 붙어 있는(tolerance 안) 끝은 이음매라 제외한다.
 * 연장은 이 끝점에서만 시작한다.
 */
export function freeExtensionEndpoints(members: readonly ExtensionChainMember[], toleranceMeters = 3): ExtensionFreeEndpoint[] {
  const ends = members.flatMap((member, memberIndex) => member.coordinates.length < 2 ? [] : [
    { memberIndex, owner: member.owner, atStart: true, position: member.coordinates[0] },
    { memberIndex, owner: member.owner, atStart: false, position: member.coordinates[member.coordinates.length - 1] },
  ]);
  return ends
    .filter((end) => !ends.some((other) => other.memberIndex !== end.memberIndex && distanceMeters(other.position, end.position) <= toleranceMeters))
    .map(({ owner, atStart, position }) => ({ owner, atStart, position: [position[0], position[1]] as GeoCoordinate }));
}

/** 연장 조각이면 그 조각이 속한 노선의 뿌리 id(운영 노선 또는 처음 계획 노선), 아니면 null */
export function extensionRootId(route: PlannedRoute): string | null {
  return route.operationKind === "extension" && route.rootLineId && route.rootLineId !== route.id ? route.rootLineId : null;
}

const compassNames = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"] as const;

/** from → to 방향의 8방위 이름(북·북동·동…) */
export function compassDirection(from: GeoCoordinate, to: GeoCoordinate): string {
  const dy = to[0] - from[0];
  const dx = (to[1] - from[1]) * Math.cos(((from[0] + to[0]) / 2) * (Math.PI / 180));
  const degrees = (Math.atan2(dx, dy) * 180) / Math.PI;
  return compassNames[((Math.round(degrees / 45) % 8) + 8) % 8];
}

export interface ExtensionPieceLabel {
  side: "start" | "end";
  /** 뿌리 노선에서 바깥으로 몇 번째 구간인지(1부터) */
  order: number;
  /** 같은 쪽 구간 수 */
  total: number;
  /** "동쪽 2/3"처럼 화면에 쓰는 이름. 양쪽 방향이 같은 8방위면 "시작 쪽"·"끝 쪽" */
  label: string;
}

/**
 * 한 노선의 연장 조각들(새 구간만 담은 형태)에 방향과 순서를 붙인다.
 * 순서는 뿌리 노선에 붙은 조각이 1, 그 바깥 끝에서 이어 연장한 조각이 2…
 * 방향은 그쪽 첫 조각의 붙는 점에서 가장 바깥 조각 끝까지의 8방위.
 */
export function labelExtensionPieces(pieces: readonly PlannedRoute[]): Map<string, ExtensionPieceLabel> {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const depth = new Map<string, number>();
  const depthOf = (piece: PlannedRoute, seen = new Set<string>()): number => {
    const known = depth.get(piece.id);
    if (known) return known;
    const parent = piece.parentBlueprintId ? byId.get(piece.parentBlueprintId) : undefined;
    const value = parent && !seen.has(parent.id) ? depthOf(parent, new Set([...seen, piece.id])) + 1 : 1;
    depth.set(piece.id, value);
    return value;
  };
  const sideOf = (piece: PlannedRoute): "start" | "end" => (piece.extensionAtStart ?? piece.actualExtension?.atStart) ? "start" : "end";
  const sides = new Map<"start" | "end", { total: number; direction: string }>();
  for (const side of ["start", "end"] as const) {
    const sidePieces = pieces.filter((piece) => sideOf(piece) === side && piece.coordinates.length >= 2);
    if (sidePieces.length === 0) continue;
    const first = sidePieces.reduce((best, piece) => (depthOf(piece) < depthOf(best) ? piece : best));
    const last = sidePieces.reduce((best, piece) => (depthOf(piece) > depthOf(best) ? piece : best));
    sides.set(side, {
      total: Math.max(...sidePieces.map((piece) => depthOf(piece))),
      direction: compassDirection(first.coordinates[0], last.coordinates[last.coordinates.length - 1]),
    });
  }
  const sameDirection = sides.get("start")?.direction !== undefined && sides.get("start")?.direction === sides.get("end")?.direction;
  const labels = new Map<string, ExtensionPieceLabel>();
  for (const piece of pieces) {
    const side = sideOf(piece);
    const info = sides.get(side);
    if (!info) continue;
    const order = depthOf(piece);
    const name = sameDirection ? (side === "start" ? "시작 쪽" : "끝 쪽") : `${info.direction}쪽`;
    labels.set(piece.id, { side, order, total: info.total, label: `${name} ${order}/${info.total}` });
  }
  return labels;
}
