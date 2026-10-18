/**
 * 자동 노선도 그리기 (DESIGN_SYSTEM §11 역 기호, §12 노선도)
 *
 * schematicLayout의 단위 좌표를 받아 SVG 조각을 만든다. 지도와 같은 기호를 쓴다.
 * - 노선: 노선 색 굵은 선 + 바탕색 테두리. 여러 노선이 함께 지나는 구간은 나란히(겹치지 않게) 그린다.
 * - 일반역: 바탕색 원 + 노선 색 테두리. 환승역: 더 큰 바탕색 원 + 먹 테두리(나란한 노선을 모두 덮음).
 * - 급행 정차역: 역 기호 안에 먹 점. 공사 중 노선: 점선.
 * - 종착역: 역명 굵게 + 노선 끝 바깥쪽에 노선 기호(정사각형, 번호).
 * - 역명: 바탕색 테두리 글자. 선·역·다른 역명과 겹치지 않는 자리를 고른다.
 */
import { octilinearBendOptions, octilinearBends, type SchematicEdge, type SchematicLayout, type SchematicLine, type SchematicPoint, type SchematicStation } from "./schematicLayout.ts";

export type SchematicTheme = {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  halo: string;
  grid?: string;
};

export type SchematicRenderOptions = {
  /** 구간 1칸의 화면 크기 */
  unit: number;
  showNames: boolean;
  /** 손으로 옮기는 중인 역의 임시 위치(단위 좌표) */
  override?: { id: string; point: SchematicPoint } | null;
};

export type SchematicRenderResult = {
  routes: string;
  stations: string;
  labels: string;
  /** 그린 내용의 범위(화면 좌표) */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** 역 중심(화면 좌표), 손으로 옮기기·공유에 쓴다 */
  stationPoints: Map<string, SchematicPoint>;
};

type Box = { x: number; y: number; width: number; height: number };
type Segment = { a: SchematicPoint; b: SchematicPoint };

const LINE_WIDTH = 9;
const LINE_GAP = 11;
const CASING = 4;

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function luminance(hex: string) {
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return 0.2;
  const value = Number.parseInt(match[1], 16);
  const channel = (raw: number) => {
    const normalized = raw / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
}

/** 정규화한 법선(a→b 기준 왼쪽) */
function normalOf(direction: SchematicPoint) {
  const length = Math.hypot(direction.x, direction.y) || 1;
  return { x: -direction.y / length, y: direction.x / length };
}

/** 직선 p1p2와 q1q2의 교점(평행하면 null) */
function intersectLines(p1: SchematicPoint, p2: SchematicPoint, q1: SchematicPoint, q2: SchematicPoint): SchematicPoint | null {
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;
  const sx = q2.x - q1.x;
  const sy = q2.y - q1.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-6) return null;
  const t = ((q1.x - p1.x) * sy - (q1.y - p1.y) * sx) / denominator;
  return { x: p1.x + rx * t, y: p1.y + ry * t };
}

function boxesOverlap(a: Box, b: Box) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function segmentHitsBox(segment: Segment, box: Box) {
  // 선분 양끝 또는 선분과 상자 네 변의 교차로 판정(선 굵기만큼 상자를 넓힌다)
  const pad = LINE_WIDTH / 2 + 2;
  const expanded = { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
  const inside = (point: SchematicPoint) => point.x >= expanded.x && point.x <= expanded.x + expanded.width && point.y >= expanded.y && point.y <= expanded.y + expanded.height;
  if (inside(segment.a) || inside(segment.b)) return true;
  const corners = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
    { x: expanded.x, y: expanded.y + expanded.height },
  ];
  const cross = (o: SchematicPoint, p: SchematicPoint, q: SchematicPoint) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  for (let index = 0; index < 4; index += 1) {
    const c = corners[index];
    const d = corners[(index + 1) % 4];
    const d1 = cross(c, d, segment.a);
    const d2 = cross(c, d, segment.b);
    const d3 = cross(segment.a, segment.b, c);
    const d4 = cross(segment.a, segment.b, d);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  }
  return false;
}

/** 글자 폭 추정(한글은 글자 크기와 거의 같고, 숫자·영문은 좁다) */
function textWidth(text: string, size: number) {
  return Array.from(text).reduce((sum, char) => sum + (/[ㄱ-힝]/.test(char) ? size * 0.98 : /[A-Z0-9]/.test(char) ? size * 0.62 : size * 0.52), 0);
}

export function renderSchematic(
  layout: SchematicLayout,
  stations: SchematicStation[],
  lines: SchematicLine[],
  theme: SchematicTheme,
  options: SchematicRenderOptions,
): SchematicRenderResult {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const unit = options.unit;
  const center = new Map<string, SchematicPoint>();
  for (const [id, point] of layout.positions) {
    const source = options.override?.id === id ? options.override.point : point;
    center.set(id, { x: source.x * unit, y: source.y * unit });
  }
  const edgeById = new Map(layout.edges.map((edge) => [edge.id, edge]));
  const edgeOf = (from: string, to: string) => edgeById.get(from < to ? `${from}|${to}` : `${to}|${from}`);

  /** 이 구간에서 노선이 차지하는 나란한 자리(법선 방향 거리, a→b 기준) */
  const offsetFor = (edge: SchematicEdge, lineId: string) => {
    const index = edge.lineIds.indexOf(lineId);
    return (index - (edge.lineIds.length - 1) / 2) * LINE_GAP;
  };

  // 8방향이 아닌 구간은 한 번 꺾어 그린다. 꺾는 방법 두 가지 중, 양끝 역에서 다른 구간이 이미 쓰는
  // 방향으로 나가지 않는 쪽을 고른다(같은 방향으로 나가면 다른 노선과 겹쳐 하나처럼 보인다).
  const directionKey = (from: SchematicPoint, to: SchematicPoint) => `${Math.sign(Math.round(to.x - from.x))},${Math.sign(Math.round(to.y - from.y))}`;
  const usedDirections = new Map<string, Set<string>>();
  const useDirection = (node: string, key: string) => {
    const set = usedDirections.get(node) ?? new Set<string>();
    set.add(key);
    usedDirections.set(node, set);
  };
  const edgeBends = new Map<string, SchematicPoint[]>();
  const kinked: SchematicEdge[] = [];
  for (const edge of layout.edges) {
    const pa = center.get(edge.a)!;
    const pb = center.get(edge.b)!;
    const options = octilinearBendOptions(pa, pb);
    if (options.length === 1) {
      edgeBends.set(edge.id, []);
      useDirection(edge.a, directionKey(pa, pb));
      useDirection(edge.b, directionKey(pb, pa));
    } else kinked.push(edge);
  }
  for (const edge of kinked) {
    const pa = center.get(edge.a)!;
    const pb = center.get(edge.b)!;
    const preferred = octilinearBends(pa, pb, edge.direction);
    const options = octilinearBendOptions(pa, pb).sort((left, right) => {
      const conflicts = (bends: SchematicPoint[]) =>
        Number(usedDirections.get(edge.a)?.has(directionKey(pa, bends[0])) ?? false)
        + Number(usedDirections.get(edge.b)?.has(directionKey(pb, bends[bends.length - 1])) ?? false);
      const same = (bends: SchematicPoint[]) => (bends[0].x === preferred[0].x && bends[0].y === preferred[0].y ? 0 : 1);
      return conflicts(left) - conflicts(right) || same(left) - same(right);
    });
    const bends = options[0];
    edgeBends.set(edge.id, bends);
    useDirection(edge.a, directionKey(pa, bends[0]));
    useDirection(edge.b, directionKey(pb, bends[bends.length - 1]));
  }

  /** 구간을 그리는 중심선 점들(꺾임 포함, 순서 from→to) */
  const centerPolyline = (from: string, edge: SchematicEdge) => {
    const pa = center.get(edge.a)!;
    const pb = center.get(edge.b)!;
    const points = [pa, ...(edgeBends.get(edge.id) ?? octilinearBends(pa, pb, edge.direction)), pb];
    return from === edge.a ? points : [...points].reverse();
  };

  // ----- 노선 -----
  const segmentsForLabels: Segment[] = [];
  const stationLinePoint = new Map<string, Map<string, SchematicPoint>>();
  const rememberStationPoint = (stationId: string, lineId: string, point: SchematicPoint) => {
    const map = stationLinePoint.get(stationId) ?? new Map<string, SchematicPoint>();
    if (!map.has(lineId)) map.set(lineId, point);
    stationLinePoint.set(stationId, map);
  };
  const terminalEnds: Array<{ lineId: string; stationId: string; outward: SchematicPoint; point: SchematicPoint }> = [];
  const casingPaths: string[] = [];
  const colorPaths: string[] = [];
  const orderedLines = [...lines].filter((line) => layout.linePaths.has(line.id)).sort((left, right) => (layout.lineOrder.get(left.id) ?? 0) - (layout.lineOrder.get(right.id) ?? 0));
  for (const line of orderedLines) {
    for (const path of layout.linePaths.get(line.id) ?? []) {
      const points: SchematicPoint[] = [];
      for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1];
        const to = path[index];
        const edge = edgeOf(from, to);
        if (!edge) continue;
        const offset = offsetFor(edge, line.id);
        const polyline = centerPolyline(from, edge);
        const shifted: SchematicPoint[] = [];
        for (let k = 0; k < polyline.length; k += 1) {
          // 꺾인 구간은 조각마다 자기 법선으로, 조각 사이 점은 두 법선의 평균(miter)으로 민다. 법선은 a→b 기준이라 방향을 맞춘다.
          const forward = from === edge.a;
          const segmentNormal = (start: SchematicPoint, end: SchematicPoint) => {
            const n = normalOf({ x: end.x - start.x, y: end.y - start.y });
            return forward ? n : { x: -n.x, y: -n.y };
          };
          const previousNormal = k > 0 ? segmentNormal(polyline[k - 1], polyline[k]) : null;
          const nextNormal = k < polyline.length - 1 ? segmentNormal(polyline[k], polyline[k + 1]) : null;
          let n = previousNormal ?? nextNormal!;
          if (previousNormal && nextNormal) {
            const sum = { x: previousNormal.x + nextNormal.x, y: previousNormal.y + nextNormal.y };
            const dot = previousNormal.x * nextNormal.x + previousNormal.y * nextNormal.y;
            const factor = 1 / Math.max(0.5, 1 + dot);
            n = { x: sum.x * factor, y: sum.y * factor };
          }
          shifted.push({ x: polyline[k].x + n.x * offset, y: polyline[k].y + n.y * offset });
        }
        rememberStationPoint(from, line.id, shifted[0]);
        rememberStationPoint(to, line.id, shifted[shifted.length - 1]);
        for (let k = 1; k < shifted.length; k += 1) segmentsForLabels.push({ a: shifted[k - 1], b: shifted[k] });
        const last = points[points.length - 1];
        if (points.length === 0) points.push(...shifted);
        else if (last.x === shifted[0].x && last.y === shifted[0].y) points.push(...shifted.slice(1));
        else {
          // 실제 선형의 꺾임점에서는 나란히 민 두 조각을 모서리에서 이어 붙인다(역 기호가 없어 끊김이 보인다).
          const corner = layout.bendIds.has(from) && points.length >= 2 && shifted.length >= 2
            ? intersectLines(points[points.length - 2], last, shifted[0], shifted[1])
            : null;
          if (corner) {
            points[points.length - 1] = corner;
            points.push(...shifted.slice(1));
          } else points.push(...shifted);
        }
      }
      if (points.length < 2) continue;
      const d = `M ${points.map((point) => `${round(point.x)} ${round(point.y)}`).join(" L ")}`;
      const dash = line.status === "building" ? ` stroke-dasharray="14 8"` : "";
      casingPaths.push(`<path d="${d}" fill="none" stroke="${theme.background}" stroke-width="${LINE_WIDTH + CASING * 2}" stroke-linecap="round" stroke-linejoin="round"/>`);
      colorPaths.push(`<path class="diagram-route" data-route-id="${escapeXml(line.id)}" d="${d}" fill="none" stroke="${escapeXml(line.color)}" stroke-width="${LINE_WIDTH}" stroke-linecap="butt" stroke-linejoin="round"${dash}/>`);
      // 종착역(경로 양끝): 바깥쪽 방향으로 노선 기호를 둔다.
      const ends: Array<[number, number]> = [[0, 1], [points.length - 1, points.length - 2]];
      for (const [endIndex, innerIndex] of ends) {
        const stationId = endIndex === 0 ? path[0] : path[path.length - 1];
        const end = points[endIndex];
        const inner = points[innerIndex];
        const length = Math.hypot(end.x - inner.x, end.y - inner.y) || 1;
        terminalEnds.push({ lineId: line.id, stationId, outward: { x: (end.x - inner.x) / length, y: (end.y - inner.y) / length }, point: end });
      }
    }
  }
  // 분기 끝이 다른 노선·같은 노선 경로가 이어지는 역이면 종착이 아니다.
  const lineStationDegree = new Map<string, number>();
  for (const line of orderedLines) {
    for (const path of layout.linePaths.get(line.id) ?? []) {
      path.forEach((stationId, index) => {
        const key = `${line.id}|${stationId}`;
        const degree = (index > 0 ? 1 : 0) + (index < path.length - 1 ? 1 : 0);
        lineStationDegree.set(key, (lineStationDegree.get(key) ?? 0) + degree);
      });
    }
  }
  const terminals = terminalEnds.filter((end) => (lineStationDegree.get(`${end.lineId}|${end.stationId}`) ?? 0) <= 1);
  const terminalStationIds = new Set(terminals.map((end) => end.stationId));

  // ----- 역 -----
  const stationSymbols: string[] = [];
  const obstacles: Box[] = [];
  const stationPoints = new Map<string, SchematicPoint>();
  const stationRadius = new Map<string, number>();
  for (const [stationId] of layout.positions) {
    const station = stationById.get(stationId);
    if (!station) continue;
    const perLine = stationLinePoint.get(stationId) ?? new Map<string, SchematicPoint>();
    const linePoints = [...perLine.values()];
    const lineIds = [...perLine.keys()];
    const transfer = station.transfer || lineIds.length > 1;
    let point = center.get(stationId)!;
    let radius = 7;
    let symbol: string;
    if (transfer) {
      // 나란한 노선 자리를 모두 덮는 원
      const cx = linePoints.reduce((sum, item) => sum + item.x, 0) / Math.max(1, linePoints.length) || point.x;
      const cy = linePoints.reduce((sum, item) => sum + item.y, 0) / Math.max(1, linePoints.length) || point.y;
      const spread = linePoints.reduce((max, item) => Math.max(max, Math.hypot(item.x - cx, item.y - cy)), 0);
      point = { x: cx, y: cy };
      radius = Math.max(10, spread + LINE_WIDTH / 2 + 4);
      symbol = `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="${theme.surface}" stroke="${theme.ink}" stroke-width="3"/>`;
    } else {
      const lineId = lineIds[0];
      point = perLine.get(lineId) ?? point;
      const color = lineById.get(lineId)?.color ?? theme.ink;
      symbol = `<circle cx="${round(point.x)}" cy="${round(point.y)}" r="${radius}" fill="${theme.surface}" stroke="${escapeXml(color)}" stroke-width="3"/>`;
    }
    const express = station.express ? `<circle cx="${round(point.x)}" cy="${round(point.y)}" r="3" fill="${theme.ink}"/>` : "";
    stationSymbols.push(`<g class="diagram-station" data-station-id="${escapeXml(stationId)}" role="button" tabindex="0" aria-label="${escapeXml(station.name)} 위치 조정">${symbol}${express}</g>`);
    stationPoints.set(stationId, point);
    stationRadius.set(stationId, radius);
    obstacles.push({ x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 });
  }

  // ----- 종착 노선 기호 -----
  const markSize = 24;
  const terminalMarks: string[] = [];
  const terminalMarkDirection = new Map<string, SchematicPoint>();
  for (const end of terminals) {
    const line = lineById.get(end.lineId);
    if (!line) continue;
    const radius = stationRadius.get(end.stationId) ?? 7;
    const distance = radius + 6 + markSize / 2;
    const cx = end.point.x + end.outward.x * distance;
    const cy = end.point.y + end.outward.y * distance;
    const box = { x: cx - markSize / 2, y: cy - markSize / 2, width: markSize, height: markSize };
    obstacles.push(box);
    terminalMarkDirection.set(end.stationId, end.outward);
    const textColor = luminance(line.color) > 0.45 ? "#15171A" : "#FFFFFF";
    const fontSize = line.label.length > 2 ? 10 : line.label.length > 1 ? 12 : 14;
    terminalMarks.push(`<g class="diagram-terminal-mark" pointer-events="none"><rect x="${round(box.x)}" y="${round(box.y)}" width="${markSize}" height="${markSize}" rx="2" fill="${escapeXml(line.color)}" stroke="${theme.background}" stroke-width="2"/><text x="${round(cx)}" y="${round(cy + fontSize * 0.36)}" text-anchor="middle" font-size="${fontSize}" font-weight="800" fill="${textColor}">${escapeXml(line.label)}</text></g>`);
  }

  // ----- 역명 -----
  const labels: string[] = [];
  if (options.showNames) {
    const placed: Box[] = [];
    const order = [...stationPoints.keys()].sort((left, right) => {
      const rank = (id: string) => (stationRadius.get(id)! > 7 ? 0 : terminalStationIds.has(id) ? 1 : 2);
      return rank(left) - rank(right) || left.localeCompare(right);
    });
    for (const stationId of order) {
      const station = stationById.get(stationId)!;
      const point = stationPoints.get(stationId)!;
      const radius = stationRadius.get(stationId)!;
      const terminal = terminalStationIds.has(stationId);
      const size = terminal || radius > 7 ? 15 : 13;
      const weight = terminal || radius > 7 ? 800 : 700;
      const width = textWidth(station.name, size) + 2;
      const height = size + 2;
      const gap = radius + 5;
      // 8방향 후보: 오른쪽·왼쪽·위·아래·대각선. 앵커에 맞춰 상자 위치를 계산한다.
      const candidates = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: -1 },
        { dx: 1, dy: 1 },
        { dx: -1, dy: 1 },
      ].map((direction, index) => {
        const diagonal = direction.dx !== 0 && direction.dy !== 0;
        const reach = diagonal ? gap * 0.75 : gap;
        const ax = point.x + direction.dx * reach;
        const ay = point.y + direction.dy * reach;
        const x = direction.dx > 0 ? ax : direction.dx < 0 ? ax - width : ax - width / 2;
        const y = direction.dy > 0 ? ay : direction.dy < 0 ? ay - height : ay - height / 2;
        return { index, direction, box: { x, y, width, height } };
      });
      const markDirection = terminalMarkDirection.get(stationId);
      let best = candidates[0];
      let bestScore = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        let score = candidate.index * 2;
        // 다른 역명과 바짝 붙으면 한 이름처럼 읽히므로 여백을 두고 잰다.
        const padded = { x: candidate.box.x - 6, y: candidate.box.y - 4, width: candidate.box.width + 12, height: candidate.box.height + 8 };
        for (const other of placed) score += boxesOverlap(padded, other) * 8;
        for (const other of obstacles) score += boxesOverlap(candidate.box, other) * 4;
        for (const segment of segmentsForLabels) if (segmentHitsBox(segment, candidate.box)) score += 900;
        // 종착 노선 기호 쪽은 피한다.
        if (markDirection && candidate.direction.dx * markDirection.x + candidate.direction.dy * markDirection.y > 0.5) score += 1500;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      placed.push(best.box);
      const anchor = best.direction.dx > 0 ? "start" : best.direction.dx < 0 ? "end" : "middle";
      const tx = best.direction.dx > 0 ? best.box.x : best.direction.dx < 0 ? best.box.x + best.box.width : best.box.x + best.box.width / 2;
      const ty = best.box.y + size * 0.86;
      labels.push(`<text class="diagram-label" x="${round(tx)}" y="${round(ty)}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${theme.ink}" stroke="${theme.halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke" pointer-events="none">${escapeXml(station.name)}</text>`);
    }
    obstacles.push(...placed);
  }

  // ----- 범위 -----
  const allBoxes = [...obstacles];
  for (const segment of segmentsForLabels) {
    allBoxes.push({ x: Math.min(segment.a.x, segment.b.x), y: Math.min(segment.a.y, segment.b.y), width: Math.abs(segment.a.x - segment.b.x), height: Math.abs(segment.a.y - segment.b.y) });
  }
  const bounds = allBoxes.reduce(
    (acc, box) => ({ minX: Math.min(acc.minX, box.x), minY: Math.min(acc.minY, box.y), maxX: Math.max(acc.maxX, box.x + box.width), maxY: Math.max(acc.maxY, box.y + box.height) }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );

  return {
    routes: casingPaths.join("") + colorPaths.join(""),
    stations: stationSymbols.join("") + terminalMarks.join(""),
    labels: labels.join(""),
    bounds: Number.isFinite(bounds.minX) ? bounds : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    stationPoints,
  };
}
