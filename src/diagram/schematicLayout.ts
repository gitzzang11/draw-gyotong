/**
 * 자동 노선도 배치 (DESIGN_SYSTEM §12 Full-screen workspace · 노선도)
 *
 * 실제 지하철 노선도의 관례를 따른다.
 * - 역 사이 구간은 8방향(가로·세로·45°)으로만 그린다.
 * - 역 간격은 고르게 펴되, 실제로 멀리 떨어진 구간은 조금 더 길게 둔다.
 * - 같은 노선은 실제 방향이 크게 바뀌지 않는 한 곧게 이어지게 같은 방향을 이어 쓴다.
 * - 한 역에서 두 구간이 같은 방향으로 겹치지 않게 방향을 나눈다.
 * - 전체 모양은 실제 지리(위도·경도)에 약하게 묶어, 도시 지도와 대략 같은 배치를 유지한다.
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

export function buildSchematicLayout(
  stations: SchematicStation[],
  lines: SchematicLine[],
  pinned: Record<string, SchematicPoint> = {},
): SchematicLayout {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const linePaths = cleanPaths(lines, new Set(stationById.keys()));
  const usedLines = lines.filter((line) => linePaths.has(line.id));
  const lineOrder = new Map(usedLines.map((line, index) => [line.id, index]));

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
  if (nodeIds.length === 0) return { positions: new Map(), edges: [], linePaths, lineOrder };

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
  const lengths = edgeList.map(([, edge]) => geoLength(edge.a, edge.b)).filter((value) => value > 1).sort((a, b) => a - b);
  const medianLength = lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)] : 1000;

  // 구간 길이(칸): 실제 거리 / 중간값을 0.5칸 단위로, 1~4칸(약하게 맞추므로 두 노선이 만나는 곳에서는 늘어날 수 있다)
  const targetLength = new Map<string, number>(
    edgeList.map(([key, edge]) => [key, Math.max(1, Math.min(4, Math.round((geoLength(edge.a, edge.b) / medianLength) * 2) / 2))]),
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
              + (previous !== null && candidate !== previous ? 0.6 : 0)
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
  const adjacent = new Set(edgeList.map(([key]) => key));
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
        .filter((sector) => !taken.get(item.edge.a)?.has(sector) && !taken.get(item.edge.b)?.has((sector + 4) % 8));
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
      const keep = current < norm * 0.999 ? 0 : 0.75;
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
        if (distance >= 0.95) continue;
        if (distance < 1e-6) {
          dx = (i % 2 === 0 ? 1 : -1) * 0.01;
          dy = 0.01;
          distance = Math.hypot(dx, dy);
        }
        const push = (0.95 - distance) / 2;
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
  for (const id of ordered) {
    const raw = position.get(id)!;
    let point = { x: Math.round(raw.x / GRID) * GRID, y: Math.round(raw.y / GRID) * GRID };
    if (occupied.has(cell(point)) || [...snapped.values()].some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 0.9)) {
      // 가까운 빈 칸을 찾는다(나선형).
      let found: SchematicPoint | null = null;
      for (let ring = 1; ring < 12 && !found; ring += 1) {
        for (let dx = -ring; dx <= ring && !found; dx += 1) {
          for (let dy = -ring; dy <= ring && !found; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const candidate = { x: point.x + dx * GRID, y: point.y + dy * GRID };
            if ([...snapped.values()].every((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= 0.9)) found = candidate;
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
  return { positions: snapped, edges, linePaths, lineOrder };
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
