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
