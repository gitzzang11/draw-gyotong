export type ScreenPoint = { x: number; y: number };
export type MapTargetKind = "train" | "station" | "transfer" | "depot" | "route" | "construction" | "blueprint";

export type MapHitCandidate = {
  id: string;
  kind: MapTargetKind;
  label: string;
  distancePx: number;
  hit: boolean;
  data?: unknown;
};

export type RankedMapTarget = MapHitCandidate & { score: number };
export type MapWorkspaceMode = "management" | "planning" | "construction";

const priorities: Record<MapTargetKind, number> = {
  train: 0,
  station: 1,
  transfer: 2,
  depot: 3,
  construction: 4,
  blueprint: 5,
  route: 6,
};

const allowedKinds: Record<MapWorkspaceMode, ReadonlySet<MapTargetKind>> = {
  management: new Set(["train", "station", "transfer", "depot", "route"]),
  planning: new Set(["station", "transfer", "blueprint", "route"]),
  construction: new Set(["station", "transfer", "depot", "construction", "route"]),
};

export function isTargetAllowedInMode(kind: MapTargetKind, mode: MapWorkspaceMode) {
  return allowedKinds[mode].has(kind);
}

export function getTargetHitRadius(kind: MapTargetKind, pointerType: string) {
  const touch = pointerType === "touch";
  const mouseRadii: Record<MapTargetKind, number> = {
    train: 18,
    station: 13,
    transfer: 10,
    depot: 0,
    route: 9,
    construction: 11,
    blueprint: 10,
  };
  const touchRadii: Record<MapTargetKind, number> = {
    train: 24,
    station: 22,
    transfer: 18,
    depot: 0,
    route: 18,
    construction: 20,
    blueprint: 19,
  };
  return (touch ? touchRadii : mouseRadii)[kind];
}

export function distanceToSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

export function pointInPolygon(point: ScreenPoint, polygon: ScreenPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

export function rankMapTargets(candidates: MapHitCandidate[], pointerType: string, mode?: MapWorkspaceMode) {
  const touchAdjustment = pointerType === "touch" ? 4 : 0;
  return candidates
    .filter((candidate) => candidate.hit && (!mode || isTargetAllowedInMode(candidate.kind, mode)))
    .map((candidate): RankedMapTarget => ({
      ...candidate,
      score: priorities[candidate.kind] * 100 + Math.max(0, candidate.distancePx - touchAdjustment),
    }))
    .sort((a, b) => a.score - b.score);
}

export function resolveMapTarget(candidates: MapHitCandidate[], pointerType: string, ambiguityScore = 7, mode?: MapWorkspaceMode) {
  const ranked = rankMapTargets(candidates, pointerType, mode);
  if (ranked.length === 0) return { selected: null, alternatives: [] as RankedMapTarget[] };
  const best = ranked[0];
  const alternatives = ranked.filter(
    (candidate, index) =>
      index > 0 &&
      (Math.abs(candidate.score - best.score) <= ambiguityScore ||
        (candidate.kind === best.kind && candidate.distancePx - best.distancePx <= ambiguityScore)),
  );
  return { selected: best, alternatives };
}
