/**
 * 자동 노선도 배치 (DESIGN_SYSTEM §12 Full-screen workspace · 노선도)
 *
 * 실제 지하철 노선도의 관례를 따른다.
 * - 역 사이 구간은 8방향(가로·세로·45°)으로만 그린다.
 * - 역 간격은 고르게 펴되, 실제로 멀리 떨어진 구간은 조금 더 길게 둔다.
 * - 같은 노선은 실제 방향이 크게 바뀌지 않는 한 곧게 이어지게 같은 방향을 이어 쓴다.
 * - 한 역에서 두 구간이 같은 방향으로 겹치지 않게 방향을 나눈다.
 * - 전체 모양은 실제 지리(위도·경도)에 약하게 묶어, 도시 지도와 대략 같은 배치를 유지한다.
 * - 역 사이 실제 선로가 크게 꺾이면 그 자리에 꺾임점을 넣어 노선도에서도 같은 쪽으로 꺾는다(실제 선형 반영).
 *
 * 결과는 입력이 같으면 항상 같다(난수·저장된 이전 배치를 쓰지 않음). 단위 좌표(구간 1칸 = 1)로 돌려주며
 * 화면 크기는 그리는 쪽에서 곱한다. 플레이어가 손으로 옮긴 역(pinned)은 그 자리에 고정하고 나머지를 맞춘다.
 */

export type SchematicPoint = { x: number; y: number };

export type SchematicStation = {
  id: string;
  name: string;
  /** [위도, 경도] */
  geo: [number, number];
  transfer: boolean;
  express: boolean;
};

export type SchematicLine = {
  id: string;
  name: string;
  color: string;
  /** 노선 기호 글자(번호 또는 두 글자) */
  label: string;
  status: "operational" | "building";
  /** 본선·분기마다 역 id를 순서대로 */
  paths: string[][];
  /**
   * 역과 역 사이 실제 선로 좌표([위도, 경도], 양끝 역 포함). 키는 `출발역>도착역`.
   * 선로가 크게 꺾이는 곳은 노선도에서도 꺾이게 한다(실제 선형 반영).
   */
  tracks?: Record<string, Array<[number, number]>>;
};

export type SchematicEdge = {
  id: string;
  /** 정규화한 끝점(a < b) */
  a: string;
  b: string;
  lineIds: string[];
  /** a → b 방향의 8방향 칸 벡터(각 성분 -1·0·1) */
  direction: SchematicPoint;
};

export type SchematicLayout = {
  positions: Map<string, SchematicPoint>;
  edges: SchematicEdge[];
  /** 노선마다 정리한 경로(역 id 순서, 2개 이상) */
  linePaths: Map<string, string[][]>;
  /** 나란히 그릴 때의 노선 순서 */
  lineOrder: Map<string, number>;
  /** 실제 선형의 꺾임점(역이 아님, 기호·역명 없이 선만 지난다). positions·linePaths에 함께 들어 있다. */
  bendIds: Set<string>;
};

const DIRECTIONS: SchematicPoint[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

const GRID = 0.5;

export function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 화면 좌표(아래가 +y)에서의 각도 → 가장 가까운 8방향 번호 */
function sectorOf(dx: number, dy: number) {
  const angle = Math.atan2(dy, dx);
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

function sectorAngleGap(angle: number, sector: number) {
  const target = sector * (Math.PI / 4);
  let gap = Math.abs(angle - target) % (Math.PI * 2);
  if (gap > Math.PI) gap = Math.PI * 2 - gap;
  return gap;
}

/** 경로를 정리한다: 연속 중복 제거, 2역 미만 경로 제외 */
function cleanPaths(lines: SchematicLine[], stationIds: Set<string>) {
  const result = new Map<string, string[][]>();
  for (const line of lines) {
    const paths: string[][] = [];
    for (const raw of line.paths) {
      const path: string[] = [];
      for (const id of raw) {
        if (!stationIds.has(id)) continue;
        if (path[path.length - 1] === id) continue;
        path.push(id);
      }
      if (path.length >= 2) paths.push(path);
    }
    if (paths.length > 0) result.set(line.id, paths);
  }
  return result;
}

/** 선로가 크게 꺾이는 점의 번호(양끝 제외). 구간 길이의 18%보다 크게 벗어나고 55° 넘게 꺾이는 곳만, 최대 3개. */
function trackBendIndexes(points: SchematicPoint[]) {
  const chord = Math.hypot(points[points.length - 1].x - points[0].x, points[points.length - 1].y - points[0].y);
  const tolerance = Math.max(chord * 0.18, 60);
  const picked: number[] = [];
  const split = (start: number, end: number) => {
    if (end - start < 2 || picked.length >= 3) return;
    const a = points[start];
    const b = points[end];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let best = -1;
    let bestDistance = tolerance;
    for (let index = start + 1; index < end; index += 1) {
      const p = points[index];
      const distance = length < 1e-6
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
      if (distance > bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    if (best < 0) return;
    // 완만한 곡선(양쪽 방향 차이가 작음)은 8방향 한 칸 안에서 그려지므로 꺾지 않는다. 실제로 꺾이는 곳만.
    const p = points[best];
    const turn = Math.abs(Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x));
    if (Math.min(turn, Math.PI * 2 - turn) < (Math.PI / 180) * 55) return;
    picked.push(best);
    split(start, best);
    split(best, end);
  };
  split(0, points.length - 1);
  return picked.sort((left, right) => left - right);
}

/**
 * 역 사이 선로가 크게 꺾이면 그 자리에 꺾임점을 넣은 경로로 바꾼다. 같은 구간을 여러 노선이 지나면
 * 꺾임점도 함께 쓴다(먼저 나온 노선의 선로 모양 기준).
 */
function insertTrackBends(
  lines: SchematicLine[],
  linePaths: Map<string, string[][]>,
  stationById: Map<string, SchematicStation>,
) {
  const bendIds = new Set<string>();
  const latitudes = [...stationById.values()].map((station) => station.geo[0]);
  const latitude0 = latitudes.length > 0 ? latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length : 0;
  const cosLatitude = Math.cos((latitude0 * Math.PI) / 180);
  const toPlane = ([lat, lng]: [number, number]) => ({ x: lng * 111_320 * cosLatitude, y: -lat * 110_540 });
  // 구간(a<b 정규화)마다 a→b 순서의 꺾임점 id
  const bendsByEdge = new Map<string, string[]>();
  const bendsFor = (line: SchematicLine, from: string, to: string) => {
    const key = edgeKey(from, to);
    let bends = bendsByEdge.get(key);
    if (!bends) {
      const forward = line.tracks?.[`${from}>${to}`];
      const backward = line.tracks?.[`${to}>${from}`];
      const track = forward ?? (backward ? [...backward].reverse() : undefined);
      bends = [];
      if (track && track.length >= 3) {
        const indexes = trackBendIndexes(track.map(toPlane));
        // a→b 순서로 저장
        const ordered = from < to ? indexes : [...indexes].reverse();
        ordered.forEach((pointIndex, order) => {
          const id = `bend:${key}:${order}`;
          stationById.set(id, { id, name: "", geo: track[pointIndex], transfer: false, express: false });
          bendIds.add(id);
          bends!.push(id);
        });
      }
      if (bends.length > 0 || track) bendsByEdge.set(key, bends);
    }
    return from < to ? bends : [...bends].reverse();
  };
  for (const line of lines) {
    const paths = linePaths.get(line.id);
    if (!paths) continue;
    linePaths.set(line.id, paths.map((path) => {
      const expanded = [path[0]];
      for (let index = 1; index < path.length; index += 1) {
        expanded.push(...bendsFor(line, path[index - 1], path[index]), path[index]);
      }
      return expanded;
    }));
  }
  return bendIds;
}

export function buildSchematicLayout(
  stations: SchematicStation[],
  lines: SchematicLine[],
  pinned: Record<string, SchematicPoint> = {},
): SchematicLayout {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const linePaths = cleanPaths(lines, new Set(stationById.keys()));
  const usedLines = lines.filter((line) => linePaths.has(line.id));
  const lineOrder = new Map(usedLines.map((line, index) => [line.id, index]));
  const bendIds = insertTrackBends(usedLines, linePaths, stationById);
  const isBend = (id: string) => bendIds.has(id);

  // ----- 구간(역과 역 사이)과 지리 좌표 -----
  const edgeMap = new Map<string, { a: string; b: string; lineIds: string[] }>();
  const nodeIds: string[] = [];
  const seenNodes = new Set<string>();
  for (const line of usedLines) {
    for (const path of linePaths.get(line.id) ?? []) {
      for (let index = 0; index < path.length; index += 1) {
        const id = path[index];
        if (!seenNodes.has(id)) {
          seenNodes.add(id);
          nodeIds.push(id);
        }
        if (index === 0) continue;
        const key = edgeKey(path[index - 1], id);
        const [a, b] = path[index - 1] < id ? [path[index - 1], id] : [id, path[index - 1]];
        const edge = edgeMap.get(key) ?? { a, b, lineIds: [] };
        if (!edge.lineIds.includes(line.id)) edge.lineIds.push(line.id);
        edgeMap.set(key, edge);
      }
    }
  }
  if (nodeIds.length === 0) return { positions: new Map(), edges: [], linePaths, lineOrder, bendIds };

  const latitude0 = nodeIds.reduce((sum, id) => sum + stationById.get(id)!.geo[0], 0) / nodeIds.length;
  const cosLatitude = Math.cos((latitude0 * Math.PI) / 180);
  // 미터 단위 평면(아래가 +y)
  const geo = new Map<string, SchematicPoint>(
    nodeIds.map((id) => {
      const [lat, lng] = stationById.get(id)!.geo;
      return [id, { x: lng * 111_320 * cosLatitude, y: -lat * 110_540 }];
    }),
  );
  const geoLength = (a: string, b: string) => Math.hypot(geo.get(b)!.x - geo.get(a)!.x, geo.get(b)!.y - geo.get(a)!.y);
  const edgeList = Array.from(edgeMap.entries()).sort(([left], [right]) => left.localeCompare(right));
  // 역 간격의 중간값(꺾임점으로 나뉜 구간은 나뉘기 전 역~역 거리로 센다)
  const stationGaps: number[] = [];
  // 꺾임점이 낀 조각마다, 원래 역~역 구간이 몇 조각으로 나뉘었는지
  const piecesOf = new Map<string, number>();
  // 꺾임점만 사이에 둔 두 역(원래 이웃)
  const stationNeighbours = new Set<string>();
  for (const paths of linePaths.values()) {
    for (const path of paths) {
      const stops = path.filter((id) => !isBend(id));
      for (let index = 1; index < stops.length; index += 1) {
        stationGaps.push(geoLength(stops[index - 1], stops[index]));
        stationNeighbours.add(edgeKey(stops[index - 1], stops[index]));
      }
      let start = 0;
      for (let index = 1; index < path.length; index += 1) {
        if (isBend(path[index])) continue;
        for (let k = start + 1; k <= index; k += 1) piecesOf.set(edgeKey(path[k - 1], path[k]), index - start);
        start = index;
      }
    }
  }
  const lengths = stationGaps.filter((value) => value > 1).sort((a, b) => a - b);
  const medianLength = lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)] : 1000;
  /**
   * 두 점 사이 최소 칸 수: 역~역 1칸. 꺾임점이 하나면 두 조각 모두 1칸(역끼리 너무 붙지 않게),
   * 꺾임점이 여럿이면 조각마다 반 칸.
   */
  const minimumLength = (edge: { a: string; b: string }) => ((piecesOf.get(edgeKey(edge.a, edge.b)) ?? 1) > 2 ? GRID : 1);

  // 구간 길이(칸): 실제 거리 / 중간값을 0.5칸 단위로, 1~4칸(약하게 맞추므로 두 노선이 만나는 곳에서는 늘어날 수 있다)
  const targetLength = new Map<string, number>(
    edgeList.map(([key, edge]) => [key, Math.max(minimumLength(edge), Math.min(4, Math.round((geoLength(edge.a, edge.b) / medianLength) * 2) / 2))]),
  );

  // ----- 구간 방향 정하기 -----
  // 노선을 따라가며, 지금까지 그린 노선도 위치가 실제 위치(중간 구간 길이로 줄인 것)를 따라가도록 방향을 고른다.
  // 실제 방향에 가까운 8방향과 그 양옆 방향 중, 누적 위치 차이가 가장 작은 것. 방향을 바꾸면 벌점을 줘서
  // 비스듬한 노선은 대부분 곧게 가다가 어긋남이 쌓인 곳에서 한 번 45°로 꺾는다(사람이 그리는 노선도처럼).
  const sectorByEdge = new Map<string, number>();
  // 역마다 이미 쓰인 나가는 방향. 같은 역에서 두 구간이 같은 방향이면 겹쳐 보이므로 고를 때부터 뺀다.
  const usedAt = new Map<string, Set<number>>();
  const markUsed = (node: string, sector: number) => {
    const set = usedAt.get(node) ?? new Set<number>();
    set.add(sector);
    usedAt.set(node, set);
  };
  const geoAngle = (from: string, to: string) => Math.atan2(geo.get(to)!.y - geo.get(from)!.y, geo.get(to)!.x - geo.get(from)!.x);
  const orderedLines = [...usedLines].sort((left, right) => {
    const count = (line: SchematicLine) => (linePaths.get(line.id) ?? []).reduce((sum, path) => sum + path.length, 0);
    return count(right) - count(left) || left.id.localeCompare(right.id);
  });
  for (const line of orderedLines) {
    for (const path of linePaths.get(line.id) ?? []) {
      let previous: number | null = null;
      // 누적 위치: 실제(geoSum)와 노선도(drawnSum), 단위는 중간 구간 길이
      const geoSum = { x: 0, y: 0 };
      const drawnSum = { x: 0, y: 0 };
      for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1];
        const to = path[index];
        const key = edgeKey(from, to);
        const forward = from < to;
        const length = targetLength.get(key)!;
        geoSum.x += (geo.get(to)!.x - geo.get(from)!.x) / medianLength;
        geoSum.y += (geo.get(to)!.y - geo.get(from)!.y) / medianLength;
        let sector: number;
        const assigned = sectorByEdge.get(key);
        if (assigned !== undefined) {
          sector = forward ? assigned : (assigned + 4) % 8;
        } else {
          const angle = geoAngle(from, to);
          const nearest = sectorOf(Math.cos(angle), Math.sin(angle));
          let best = nearest;
          let bestScore = Number.POSITIVE_INFINITY;
          const candidates = [nearest, (nearest + 1) % 8, (nearest + 7) % 8, (nearest + 2) % 8, (nearest + 6) % 8];
          for (const candidate of candidates) {
            if (sectorAngleGap(angle, candidate) > (Math.PI / 180) * 95) continue;
            if (usedAt.get(from)?.has(candidate) || usedAt.get(to)?.has((candidate + 4) % 8)) continue;
            const vector = DIRECTIONS[candidate];
            const score = Math.hypot(drawnSum.x + vector.x * length - geoSum.x, drawnSum.y + vector.y * length - geoSum.y)
              // 꺾임점에서는 실제로 선로가 꺾이므로 방향을 바꿔도 벌점이 없다.
              + (previous !== null && candidate !== previous && !isBend(from) ? 0.6 : 0)
              + (candidate !== nearest ? 0.15 : 0)
              + (sectorAngleGap(angle, candidate) > Math.PI / 3 ? 1.5 : 0);
            if (score < bestScore) {
              bestScore = score;
              best = candidate;
            }
          }
          sector = best;
          sectorByEdge.set(key, forward ? sector : (sector + 4) % 8);
          markUsed(from, sector);
          markUsed(to, (sector + 4) % 8);
        }
        drawnSum.x += DIRECTIONS[sector].x * length;
        drawnSum.y += DIRECTIONS[sector].y * length;
        previous = sector;
      }
    }
  }

  // 한 역에서 두 구간이 같은 방향을 쓰면 겹쳐 보이므로, 실제 방향에서 더 먼 쪽을 다음으로 가까운 방향으로 옮긴다.
  const incident = new Map<string, string[]>();
  for (const [key, edge] of edgeList) {
    incident.set(edge.a, [...(incident.get(edge.a) ?? []), key]);
    incident.set(edge.b, [...(incident.get(edge.b) ?? []), key]);
  }
  const outgoingSector = (node: string, key: string) => {
    const edge = edgeMap.get(key)!;
    const sector = sectorByEdge.get(key)!;
    return edge.a === node ? sector : (sector + 4) % 8;
  };
  for (let round = 0; round < 4; round += 1) {
    let changed = false;
    for (const node of nodeIds) {
      const keys = incident.get(node) ?? [];
      if (keys.length < 2) continue;
      const used = new Map<number, string>();
      for (const key of keys) {
        const sector = outgoingSector(node, key);
        const other = used.get(sector);
        if (other === undefined) {
          used.set(sector, key);
          continue;
        }
        // 두 구간 중 실제 방향과 더 어긋난 쪽을 옮긴다.
        const edgeOf = (k: string) => edgeMap.get(k)!;
        const angleFrom = (k: string) => {
          const edge = edgeOf(k);
          return edge.a === node ? geoAngle(edge.a, edge.b) : geoAngle(edge.b, edge.a);
        };
        const moveKey = sectorAngleGap(angleFrom(key), sector) >= sectorAngleGap(angleFrom(other), sector) ? key : other;
        const angle = angleFrom(moveKey);
        const candidates = DIRECTIONS.map((_, index) => index)
          .filter((index) => !used.has(index) || used.get(index) === moveKey)
          .filter((index) => index !== sector)
          .sort((left, right) => sectorAngleGap(angle, left) - sectorAngleGap(angle, right));
        const next = candidates[0];
        if (next === undefined) continue;
        const edge = edgeOf(moveKey);
        sectorByEdge.set(moveKey, edge.a === node ? next : (next + 4) % 8);
        if (moveKey === other) used.set(sector, key);
        used.set(next, moveKey);
        changed = true;
      }
    }
    if (!changed) break;
  }


  // ----- 위치 반복 보정 -----
  const scale = 1 / medianLength;
  const center = nodeIds.reduce((sum, id) => ({ x: sum.x + geo.get(id)!.x, y: sum.y + geo.get(id)!.y }), { x: 0, y: 0 });
  center.x /= nodeIds.length;
  center.y /= nodeIds.length;
  const anchor = new Map(nodeIds.map((id) => [id, { x: (geo.get(id)!.x - center.x) * scale, y: (geo.get(id)!.y - center.y) * scale }]));
  const position = new Map(nodeIds.map((id) => [id, pinned[id] ? { ...pinned[id] } : { ...anchor.get(id)! }]));
  const isPinned = (id: string) => Boolean(pinned[id]);
  const adjacent = new Set([...edgeList.map(([key]) => key), ...stationNeighbours]);
  const iterations = 300;
  /**
   * 지금 위치에서 구간 방향을 다시 고른다. 처음 방향은 노선마다 따로 정해서, 노선 둘이 고리를 이루면
   * (예: 1호선과 2호선이 두 역에서 만남) 고리가 닫히지 않는 방향 조합이 나올 수 있다. 위치를 한 번 맞춘 뒤의
   * 실제 구간 모양을 기준으로 다시 고르면 고리가 닫히는 쪽으로 맞춰진다. 확실한 구간(8방향에 가까운 것)부터 고르고,
   * 한 역에서 이미 쓴 방향과 실제 방향에서 90° 넘게 벗어난 방향은 쓰지 않는다.
   */
  const reassignSectors = () => {
    const taken = new Map<string, Set<number>>();
    const take = (node: string, sector: number) => {
      const set = taken.get(node) ?? new Set<number>();
      set.add(sector);
      taken.set(node, set);
    };
    const items = edgeList.map(([key, edge]) => {
      const pa = position.get(edge.a)!;
      const pb = position.get(edge.b)!;
      const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      const nearest = sectorOf(Math.cos(angle), Math.sin(angle));
      return { key, edge, angle, nearest, confidence: sectorAngleGap(angle, nearest) };
    }).sort((left, right) => left.confidence - right.confidence || left.key.localeCompare(right.key));
    for (const item of items) {
      const geoDirection = geoAngle(item.edge.a, item.edge.b);
      const options = [0, 1, 7, 2, 6].map((offset) => (item.nearest + offset) % 8)
        .filter((sector) => sectorAngleGap(geoDirection, sector) <= Math.PI / 2 + 1e-6)
        .filter((sector) => !taken.get(item.edge.a)?.has(sector) && !taken.get(item.edge.b)?.has((sector + 4) % 8))
        // 지금 모양보다 실제 방향을 두 배 무겁게 본다(실제 선형에서 크게 틀어지지 않게).
        .sort((left, right) => (sectorAngleGap(item.angle, left) + 2 * sectorAngleGap(geoDirection, left)) - (sectorAngleGap(item.angle, right) + 2 * sectorAngleGap(geoDirection, right)));
      const sector = options[0] ?? sectorByEdge.get(item.key)!;
      sectorByEdge.set(item.key, sector);
      take(item.edge.a, sector);
      take(item.edge.b, (sector + 4) % 8);
    }
  };
  for (let step = 0; step < iterations; step += 1) {
    if (step === Math.floor(iterations * 0.3) || step === Math.floor(iterations * 0.55)) reassignSectors();
    const heat = 1 - step / iterations;
    const delta = new Map(nodeIds.map((id) => [id, { x: 0, y: 0, weight: 0 }]));
    for (const [key, edge] of edgeList) {
      const direction = DIRECTIONS[sectorByEdge.get(key)!];
      const length = targetLength.get(key)!;
      const pa = position.get(edge.a)!;
      const pb = position.get(edge.b)!;
      // 방향(구간에 수직인 어긋남)은 강하게, 길이(구간 방향 어긋남)는 약하게 맞춘다.
      // 길이까지 강하게 맞추면 두 노선이 만나는 곳에서 서로 당기다 사이 역들이 지그재그로 몰린다.
      const rawX = pa.x + direction.x * length - pb.x;
      const rawY = pa.y + direction.y * length - pb.y;
      const norm = Math.hypot(direction.x, direction.y);
      const ux = direction.x / norm;
      const uy = direction.y / norm;
      const along = rawX * ux + rawY * uy;
      // 늘어나는 것은 느슨하게, 한 칸보다 짧아지는 것은 엄격하게 막는다(역이 붙으면 칸 맞춤에서 옆으로 밀려 꺾임이 생긴다).
      const current = (pb.x - pa.x) * ux + (pb.y - pa.y) * uy;
      const keep = current < norm * minimumLength(edge) * 0.999 ? 0 : 0.75;
      const errorX = rawX - along * ux * keep;
      const errorY = rawY - along * uy * keep;
      const da = delta.get(edge.a)!;
      const db = delta.get(edge.b)!;
      da.x -= errorX / 2;
      da.y -= errorY / 2;
      da.weight += 1;
      db.x += errorX / 2;
      db.y += errorY / 2;
      db.weight += 1;
    }
    // 서로 이웃이 아닌 역이 너무 가까우면 밀어낸다.
    for (let i = 0; i < nodeIds.length; i += 1) {
      for (let j = i + 1; j < nodeIds.length; j += 1) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        if (adjacent.has(edgeKey(a, b))) continue;
        const pa = position.get(a)!;
        const pb = position.get(b)!;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let distance = Math.hypot(dx, dy);
        // 꺾임점은 역 기호가 없으므로 반 칸까지 붙어도 된다.
        const room = isBend(a) || isBend(b) ? 0.5 : 0.95;
        if (distance >= room) continue;
        if (distance < 1e-6) {
          dx = (i % 2 === 0 ? 1 : -1) * 0.01;
          dy = 0.01;
          distance = Math.hypot(dx, dy);
        }
        const push = (room - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        const da = delta.get(a)!;
        const db = delta.get(b)!;
        da.x -= ux * push;
        da.y -= uy * push;
        db.x += ux * push;
        db.y += uy * push;
      }
    }
    // 역이 자기와 이어지지 않은 구간 선 위(0.6칸 안)에 놓이면 선에서 밀어낸다(선 양끝 역은 반대로 조금 당긴다).
    if (step > iterations * 0.3) {
      for (const [, edge] of edgeList) {
        const pa = position.get(edge.a)!;
        const pb = position.get(edge.b)!;
        const sx = pb.x - pa.x;
        const sy = pb.y - pa.y;
        const lengthSquared = sx * sx + sy * sy;
        if (lengthSquared < 1e-9) continue;
        for (const id of nodeIds) {
          if (id === edge.a || id === edge.b) continue;
          const p = position.get(id)!;
          const t = ((p.x - pa.x) * sx + (p.y - pa.y) * sy) / lengthSquared;
          if (t <= 0.05 || t >= 0.95) continue;
          const cx = pa.x + sx * t;
          const cy = pa.y + sy * t;
          let nx = p.x - cx;
          let ny = p.y - cy;
          let distance = Math.hypot(nx, ny);
          if (distance >= 0.6) continue;
          if (distance < 1e-6) {
            nx = -sy;
            ny = sx;
            distance = Math.hypot(nx, ny);
          }
          const push = (0.6 - distance) * 0.5;
          const d = delta.get(id)!;
          d.x += (nx / distance) * push;
          d.y += (ny / distance) * push;
          const da = delta.get(edge.a)!;
          const db = delta.get(edge.b)!;
          da.x -= (nx / distance) * push * 0.25;
          da.y -= (ny / distance) * push * 0.25;
          db.x -= (nx / distance) * push * 0.25;
          db.y -= (ny / distance) * push * 0.25;
        }
      }
    }
    for (const id of nodeIds) {
      if (isPinned(id)) continue;
      const d = delta.get(id)!;
      const p = position.get(id)!;
      const a = anchor.get(id)!;
      const rate = 0.25 + 0.5 * heat;
      const divisor = Math.max(1, d.weight);
      p.x += (d.x / divisor) * rate + (a.x - p.x) * 0.004 * heat;
      p.y += (d.y / divisor) * rate + (a.y - p.y) * 0.004 * heat;
    }
  }

  // ----- 칸에 맞추고 겹친 역 풀기 -----
  const snapped = new Map<string, SchematicPoint>();
  const occupied = new Map<string, string>();
  const cell = (point: SchematicPoint) => `${Math.round(point.x / GRID)}:${Math.round(point.y / GRID)}`;
  const ordered = [...nodeIds].sort((left, right) => Number(isPinned(right)) - Number(isPinned(left)) || (incident.get(right)?.length ?? 0) - (incident.get(left)?.length ?? 0) || left.localeCompare(right));
  /** node에서 이웃으로 가는 구간의 방향(칸 벡터)과 이웃 id */
  const neighbours = (node: string) => (incident.get(node) ?? []).map((key) => {
    const edge = edgeMap.get(key)!;
    const sector = outgoingSector(node, key);
    return { key, other: edge.a === node ? edge.b : edge.a, direction: DIRECTIONS[sector] };
  });
  /**
   * 칸에 놓을 자리 후보(좋은 순서). 기본은 가장 가까운 칸이지만, 역마다 따로 반올림하면 0.98칸 간격이
   * 반 칸으로 붙거나 구간이 8방향에서 벗어난다. 그래서 이미 놓은 이웃에서 정한 방향으로 0.5칸 단위
   * 길이만큼 간 자리도 후보로 두고, 8방향을 지키면서 계산된 위치에 가까운 것을 고른다.
   * (이웃만 따라 놓으면 순환선을 한 바퀴 돌며 어긋남이 쌓이므로 계산된 위치에서 멀어지면 고르지 않는다.)
   */
  const proposals = (id: string) => {
    const raw = position.get(id)!;
    const absolute = { x: Math.round(raw.x / GRID) * GRID, y: Math.round(raw.y / GRID) * GRID };
    const placed = neighbours(id).filter((item) => snapped.has(item.other));
    if (placed.length === 0) return [absolute];
    const candidates = placed.map((item) => {
      const from = snapped.get(item.other)!;
      const fromRaw = position.get(item.other)!;
      // 이웃 → 이 역 방향은 반대
      const direction = { x: -item.direction.x, y: -item.direction.y };
      const along = ((raw.x - fromRaw.x) * direction.x + (raw.y - fromRaw.y) * direction.y) / (direction.x * direction.x + direction.y * direction.y);
      const edge = edgeMap.get(item.key)!;
      const steps = Math.max(minimumLength(edge), Math.round(along / GRID) * GRID);
      return { x: from.x + direction.x * steps, y: from.y + direction.y * steps };
    });
    candidates.push(absolute);
    const octilinear = (a: SchematicPoint, b: SchematicPoint) => {
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      return dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-6;
    };
    const score = (candidate: SchematicPoint) =>
      placed.filter((item) => !octilinear(snapped.get(item.other)!, candidate)).length * 0.6
      + Math.hypot(candidate.x - raw.x, candidate.y - raw.y);
    return candidates.sort((left, right) => score(left) - score(right));
  };
  const queue: string[] = [];
  const placeOrder: string[] = [];
  const queued = new Set<string>();
  for (const seed of ordered) {
    if (queued.has(seed)) continue;
    queue.push(seed);
    queued.add(seed);
    while (queue.length > 0) {
      const id = queue.shift()!;
      placeOrder.push(id);
      for (const item of neighbours(id).sort((left, right) => left.other.localeCompare(right.other))) {
        if (queued.has(item.other)) continue;
        // 고정한 역은 처음부터 자기 자리에 둔다(아래에서 먼저 놓인다).
        queued.add(item.other);
        queue.push(item.other);
      }
    }
  }
  // 고정한 역을 먼저, 그다음 노선을 따라 퍼지는 순서
  const snapOrder = [...placeOrder.filter(isPinned), ...placeOrder.filter((id) => !isPinned(id))];
  // 역끼리는 0.9칸, 꺾임점이 끼면 반 칸까지 붙어도 된다.
  const tooClose = (id: string, point: SchematicPoint) => [...snapped].some(([otherId, other]) =>
    Math.hypot(other.x - point.x, other.y - point.y) < (isBend(id) || isBend(otherId) ? 0.45 : 0.9));
  for (const id of snapOrder) {
    const options = isPinned(id) ? [{ ...pinned[id] }] : proposals(id);
    let point = options.find((option) => !occupied.has(cell(option)) && !tooClose(id, option)) ?? options[0];
    if (occupied.has(cell(point)) || tooClose(id, point)) {
      // 가까운 빈 칸을 찾는다(나선형).
      let found: SchematicPoint | null = null;
      for (let ring = 1; ring < 12 && !found; ring += 1) {
        for (let dx = -ring; dx <= ring && !found; dx += 1) {
          for (let dy = -ring; dy <= ring && !found; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const candidate = { x: point.x + dx * GRID, y: point.y + dy * GRID };
            if (!occupied.has(cell(candidate)) && !tooClose(id, candidate)) found = candidate;
          }
        }
      }
      if (found) point = found;
    }
    snapped.set(id, point);
    occupied.set(cell(point), id);
  }

  const edges: SchematicEdge[] = edgeList.map(([key, edge]) => ({
    id: key,
    a: edge.a,
    b: edge.b,
    lineIds: [...edge.lineIds].sort((left, right) => (lineOrder.get(left) ?? 0) - (lineOrder.get(right) ?? 0)),
    direction: DIRECTIONS[sectorByEdge.get(key)!],
  }));
  return { positions: snapped, edges, linePaths, lineOrder, bendIds };
}

/** 두 점 사이를 한 번 꺾어 8방향으로 잇는 두 가지 방법(대각선 먼저, 직선 먼저). 이미 8방향이면 빈 배열 하나. */
export function octilinearBendOptions(from: SchematicPoint, to: SchematicPoint): SchematicPoint[][] {
  const diagonalFirst = octilinearBends(from, to, { x: 1, y: 1 });
  if (diagonalFirst.length === 0) return [[]];
  return [diagonalFirst, octilinearBends(from, to, { x: 1, y: 0 })];
}

/**
 * 두 점 사이를 8방향 선분으로 잇는 꺾은 점들(시작·끝 제외).
 * 이미 8방향이면 꺾지 않고, 아니면 구간의 기준 방향(preferred)을 먼저 쓰는 쪽으로 한 번 꺾는다.
 */
export function octilinearBends(from: SchematicPoint, to: SchematicPoint, preferred: SchematicPoint): SchematicPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const epsilon = 1e-6;
  if (absX < epsilon || absY < epsilon || Math.abs(absX - absY) < epsilon) return [];
  const diagonal = Math.min(absX, absY);
  const signX = Math.sign(dx);
  const signY = Math.sign(dy);
  const preferredIsDiagonal = preferred.x !== 0 && preferred.y !== 0;
  if (preferredIsDiagonal) {
    // 대각선 먼저, 남은 만큼 직선
    return [{ x: from.x + signX * diagonal, y: from.y + signY * diagonal }];
  }
  // 직선 먼저(가로가 길면 가로, 세로가 길면 세로), 그다음 대각선
  if (absX > absY) return [{ x: from.x + signX * (absX - diagonal), y: from.y }];
  return [{ x: from.x, y: from.y + signY * (absY - diagonal) }];
}
