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
  { source: "railway", radius: 1000, matches: (tags: Record<string, string>) => /^(station|halt|tram_stop)$/.test(tags.railway ?? "") },
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
