import { distanceMeters, type GeoCoordinate } from "./geometry/constructionGeometry.ts";

export interface StationNameFeature {
  id?: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
}

export type StationNameSource = "railway" | "area" | "facility" | "park" | "landmark" | "road";
export interface StationNameMatch {
  name: string;
  source: StationNameSource;
  distanceMeters: number;
}

const namingCategories = [
  { source: "railway", radius: 500, matches: (tags: Record<string, string>) => /^(station|halt|tram_stop)$/.test(tags.railway ?? "") },
  { source: "area", radius: 850, matches: (tags: Record<string, string>) => /^(suburb|quarter|neighbourhood|village)$/.test(tags.place ?? "") },
  { source: "facility", radius: 600, matches: (tags: Record<string, string>) => /^(university|hospital|townhall|marketplace|library|school)$/.test(tags.amenity ?? "") },
  { source: "park", radius: 450, matches: (tags: Record<string, string>) => tags.leisure === "park" },
  { source: "landmark", radius: 600, matches: (tags: Record<string, string>) => /^(attraction|museum|gallery|viewpoint|zoo|theme_park)$/.test(tags.tourism ?? "") || Boolean(tags.historic && tags.historic !== "no") },
  { source: "road", radius: 300, matches: (tags: Record<string, string>) => Boolean(tags.highway) },
] as const;

export function normalizeAutomaticStationName(value: string): string {
  return value
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/(도시철도|지하철|전철)\s*/g, "")
    .trim()
    .replace(/(행정복지센터|주민센터)$/g, "")
    .replace(/역$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidCoordinate(position: GeoCoordinate): boolean {
  return position.every(Number.isFinite) && Math.abs(position[0]) <= 90 && Math.abs(position[1]) <= 180;
}

export function selectAutomaticStationName(
  position: GeoCoordinate,
  elements: readonly StationNameFeature[],
): StationNameMatch | null {
  if (!isValidCoordinate(position)) return null;
  let best: (StationNameMatch & { priority: number }) | null = null;
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = normalizeAutomaticStationName(tags["name:ko"]?.trim() || tags.name || "");
    const priority = namingCategories.findIndex((category) => category.matches(tags));
    if (!name || priority < 0) continue;
    const point = element.center ??
      (typeof element.lat === "number" && typeof element.lon === "number"
        ? { lat: element.lat, lon: element.lon }
        : element.geometry?.[0]);
    if (!point || !isValidCoordinate([point.lat, point.lon])) continue;
    const distance = distanceMeters(position, [point.lat, point.lon]);
    const category = namingCategories[priority];
    if (distance > category.radius + 1e-6) continue;
    if (!best || priority < best.priority ||
      (priority === best.priority && (distance < best.distanceMeters ||
        (distance === best.distanceMeters && name.localeCompare(best.name) < 0)))) {
      best = { name, source: category.source, distanceMeters: distance, priority };
    }
  }
  return best ? { name: best.name, source: best.source, distanceMeters: best.distanceMeters } : null;
}

export const stationNameSourceLabels: Record<StationNameSource, string> = {
  railway: "철도역",
  area: "동네",
  facility: "시설",
  park: "공원",
  landmark: "명소",
  road: "도로",
};

/**
 * 자동 이름 기준(분류별 반경, 철도역 → 동네 → 시설 → 공원 → 명소 → 도로 순)에 맞는 이름 후보를 모두 고른다.
 * 같은 이름은 우선순위가 높고 가까운 것 하나만 남기고, 우선순위 → 거리 → 이름 순으로 정렬한다.
 * 한 분류가 목록을 다 차지하지 않도록 분류마다 개수를 제한한다(철도역 3개, 나머지 2개).
 */
export function listAutomaticStationNames(
  position: GeoCoordinate,
  elements: readonly StationNameFeature[],
  limit = 8,
): StationNameMatch[] {
  if (!isValidCoordinate(position)) return [];
  const byName = new Map<string, StationNameMatch & { priority: number }>();
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = normalizeAutomaticStationName(tags["name:ko"]?.trim() || tags.name || "");
    const priority = namingCategories.findIndex((category) => category.matches(tags));
    // 후보는 한글 이름만(name:ko가 없는 외국어 이름은 역 이름으로 어색하다).
    if (!name || priority < 0 || !/[가-힣]/.test(name)) continue;
    const point = element.center ??
      (typeof element.lat === "number" && typeof element.lon === "number"
        ? { lat: element.lat, lon: element.lon }
        : element.geometry?.[0]);
    if (!point || !isValidCoordinate([point.lat, point.lon])) continue;
    const distance = distanceMeters(position, [point.lat, point.lon]);
    const category = namingCategories[priority];
    if (distance > category.radius + 1e-6) continue;
    const current = byName.get(name);
    if (!current || priority < current.priority || (priority === current.priority && distance < current.distanceMeters)) {
      byName.set(name, { name, source: category.source, distanceMeters: distance, priority });
    }
  }
  const perSource = new Map<StationNameSource, number>();
  return [...byName.values()]
    .sort((a, b) => a.priority - b.priority || a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name))
    .filter((item) => {
      const count = perSource.get(item.source) ?? 0;
      if (count >= (item.source === "railway" ? 3 : 2)) return false;
      perSource.set(item.source, count + 1);
      return true;
    })
    .slice(0, limit)
    .map(({ name, source, distanceMeters: distance }) => ({ name, source, distanceMeters: distance }));
}
