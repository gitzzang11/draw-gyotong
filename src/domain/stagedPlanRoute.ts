import type { PlannedRoute } from "./constructionTypes.ts";
import type { RouteLine, RouteNode, RouteSegment } from "./networkTypes.ts";
import { distanceMeters } from "../geometry/constructionGeometry.ts";
import { stableEntityId } from "../storage/migrations.ts";

/** Add selected design segments to one line; unbuilt gaps remain disabled. */
export function addStagedPlanSegments(previous: RouteLine, design: PlannedRoute, selectedIds: readonly string[]): RouteLine {
  const selected = design.segments.filter((segment) => selectedIds.includes(segment.id));
  const plannedBranchIds = new Set((design.branches ?? []).flatMap((branch) => branch.segmentIds));
  const existingBranchIds = new Set((previous.branches ?? []).flatMap((branch) => branch.segmentIds));
  const coordinateKey = (point: [number, number]) => `${point[0].toFixed(6)},${point[1].toFixed(6)}`;
  const edgeKey = (first: [number, number], last: [number, number]) => [coordinateKey(first), coordinateKey(last)].sort().join("|");
  const enabledEdges = new Set((previous.segments ?? []).filter((segment) => segment.enabled && !existingBranchIds.has(segment.id))
    .flatMap((segment) => segment.coordinates.slice(1).map((point, index) => edgeKey(segment.coordinates[index], point))));
  // Legacy built lines may not yet have a graph.
  previous.coordinates.slice(1).forEach((point, index) => { if (!(previous.disabledSegments ?? []).includes(index)) enabledEdges.add(edgeKey(previous.coordinates[index], point)); });
  const nodes = new Map((previous.nodes ?? []).map((node) => [coordinateKey(node.position), structuredClone(node)]));
  const node = (point: [number, number]): RouteNode => {
    const key = coordinateKey(point);
    if (!nodes.has(key)) nodes.set(key, { id: stableEntityId("node", `${previous.id}:${key}`), position: [...point], kind: "control" });
    return nodes.get(key)!;
  };
  const newSegments: RouteSegment[] = [];
  const segmentIdsByDesign = new Map<string, string[]>();
  const addedDesignSegments: RouteSegment[] = [];
  for (const segment of selected) {
    const branch = plannedBranchIds.has(segment.id);
    const lengths = segment.coordinates.slice(1).map((point, index) => distanceMeters(segment.coordinates[index], point));
    const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
    const alreadyBuilt = !branch && segment.coordinates.slice(1).every((point, index) => enabledEdges.has(edgeKey(segment.coordinates[index], point)));
    const ids = segment.coordinates.slice(1).map((_, index) => stableEntityId("segment", `${previous.id}:${segment.id}:${index}`));
    const branchAlreadyBuilt = branch && ids.every((id) => previous.segments?.some((item) => item.id === id));
    if (alreadyBuilt || branchAlreadyBuilt) continue;
    addedDesignSegments.push(segment);
    segmentIdsByDesign.set(segment.id, ids);
    segment.coordinates.slice(1).forEach((point, index) => {
      const first = segment.coordinates[index];
      const ratio = lengths[index] / total;
      newSegments.push({
        ...structuredClone(segment), id: ids[index], fromNodeId: node(first).id, toNodeId: node(point).id,
        coordinates: [[...first], [...point]], lengthKm: segment.lengthKm * ratio,
        constructionCost: segment.constructionCost * ratio,
        terrainImpact: index === 0 ? { ...segment.terrainImpact } : { riverCrossings: 0, mountainSegments: 0 },
      });
      if (!branch && segment.enabled) enabledEdges.add(edgeKey(first, point));
    });
  }
  const pathEdgeIndices = new Map(design.coordinates.slice(1).map((point, index) => [edgeKey(design.coordinates[index], point), index]));
  const trunkPaths = [previous.coordinates, ...selected.filter((segment) => !plannedBranchIds.has(segment.id)).map((segment) => segment.coordinates)];
  const indices = trunkPaths.flatMap((path) => path.slice(1).map((point, index) => pathEdgeIndices.get(edgeKey(path[index], point))));
  if (indices.some((index) => index === undefined)) throw new Error("기존 노선의 경로가 계획과 달라 나머지 구간을 이어 붙일 수 없습니다.");
  const firstIndex = indices.reduce<number>((minimum, index) => Math.min(minimum, index!), Infinity);
  const lastIndex = indices.reduce<number>((maximum, index) => Math.max(maximum, index!), -1);
  const coordinates = indices.length ? design.coordinates.slice(firstIndex, lastIndex + 2).map((point): [number, number] => [...point]) : [];
  if (coordinates.length < 2) throw new Error("본선 구간을 먼저 건설한 뒤 지선을 건설해 주세요.");
  const disabledSegments: number[] = [];
  const newBranchSegmentIds = new Set((design.branches ?? []).flatMap((branch) => branch.segmentIds.flatMap((id) => segmentIdsByDesign.get(id) ?? [])));
  const trunkByEdge = new Map([...(previous.segments ?? []).filter((segment) => !existingBranchIds.has(segment.id)), ...newSegments.filter((segment) => !newBranchSegmentIds.has(segment.id))]
    .map((segment) => [edgeKey(segment.coordinates[0], segment.coordinates.at(-1)!), segment]));
  const trunkSegments = coordinates.slice(1).map((point, index): RouteSegment => {
    const first = coordinates[index];
    const enabled = enabledEdges.has(edgeKey(first, point));
    if (!enabled) disabledSegments.push(index);
    const existing = trunkByEdge.get(edgeKey(first, point));
    return {
      id: existing?.id ?? stableEntityId("segment", `${previous.id}:gap:${coordinateKey(first)}:${coordinateKey(point)}`),
      fromNodeId: node(first).id, toNodeId: node(point).id, coordinates: [[...first], [...point]],
      lengthKm: existing?.lengthKm ?? distanceMeters(first, point) / 1000,
      constructionCost: enabled ? existing?.constructionCost ?? 0 : 0,
      terrainImpact: enabled ? existing?.terrainImpact ?? { riverCrossings: 0, mountainSegments: 0 } : { riverCrossings: 0, mountainSegments: 0 },
      constructionMode: existing?.constructionMode ?? previous.riverMode, enabled,
    };
  });
  const plannedNodePositions = new Map(design.segments.flatMap((segment) => [[segment.fromNodeId, segment.coordinates[0]], [segment.toNodeId, segment.coordinates.at(-1)!]] as Array<[string, [number, number]]>));
  const branches = structuredClone(previous.branches ?? []);
  const branchSegments = structuredClone((previous.segments ?? []).filter((segment) => existingBranchIds.has(segment.id)));
  for (const branch of design.branches ?? []) {
    const addedIds = new Set(branch.segmentIds.flatMap((id) => segmentIdsByDesign.get(id) ?? []));
    const added = newSegments.filter((segment) => addedIds.has(segment.id));
    if (!added.length) continue;
    const position = plannedNodePositions.get(branch.junctionNodeId);
    if (!position) throw new Error("계획 지선의 분기점이 없습니다.");
    const junction = node(position);
    junction.kind = "branch";
    const id = stableEntityId("branch", `${previous.id}:${branch.branchId}`);
    const old = branches.find((item) => item.id === id);
    const segmentIds = [...new Set([...(old?.segmentIds ?? []), ...added.map((segment) => segment.id)])];
    const replacement = { id, name: old?.name ?? design.name, junctionNodeId: junction.id, terminalNodeId: added.at(-1)!.toNodeId, segmentIds, dispatchWeight: old?.dispatchWeight ?? 1 };
    if (old) branches.splice(branches.indexOf(old), 1, replacement); else branches.push(replacement);
    branchSegments.push(...added);
  }
  node(coordinates[0]).kind = nodes.get(coordinateKey(coordinates[0]))?.kind === "branch" ? "branch" : "endpoint";
  node(coordinates.at(-1)!).kind = nodes.get(coordinateKey(coordinates.at(-1)!))?.kind === "branch" ? "branch" : "endpoint";
  for (const point of coordinates.slice(1, -1)) if (node(point).kind === "endpoint") node(point).kind = "control";
  return {
    ...previous, coordinates, disabledSegments, nodes: [...nodes.values()], segments: [...trunkSegments, ...branchSegments], branches,
    lengthKm: Math.round((previous.lengthKm + addedDesignSegments.reduce((sum, segment) => sum + segment.lengthKm, 0)) * 1000) / 1000,
    constructionCost: previous.constructionCost + addedDesignSegments.reduce((sum, segment) => sum + segment.constructionCost, 0),
    riverCrossings: previous.riverCrossings + addedDesignSegments.reduce((sum, segment) => sum + segment.terrainImpact.riverCrossings, 0),
    mountainSegments: previous.mountainSegments + addedDesignSegments.reduce((sum, segment) => sum + segment.terrainImpact.mountainSegments, 0),
  };
}
