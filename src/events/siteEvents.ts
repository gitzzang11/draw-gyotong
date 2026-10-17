import { distanceMeters, type GeoCoordinate } from "../geometry/constructionGeometry.ts";

/**
 * 실제 장소·지형 기반 랜덤 이벤트(2026-10-17).
 * OpenStreetMap에서 받은 장소(경기장·공연장·대학·관광지·공원·쇼핑·도로·동네)와 노선의 실제 지형(강 횡단·산악 구간)으로
 * 이벤트 후보를 만든다. 어떤 후보를 고를지는 부르는 쪽이 정한다(난수 시드).
 */
export type SiteKind = "sports" | "concert" | "university" | "tourism" | "park" | "shopping" | "market" | "road" | "place";

export interface SiteFeature {
  kind: SiteKind;
  name: string;
  position: GeoCoordinate;
}

export interface SiteFeatureSource {
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
}

/** OSM 태그 → 장소 종류. 이름이 없거나 해당 없음이면 null */
export function classifySiteFeature(tags: Record<string, string>): SiteKind | null {
  if (tags.leisure === "stadium" || (tags.leisure === "sports_centre" && tags.building)) return "sports";
  // 작은 화랑·미술관(arts_centre)과 events_venue(단체 사무실 등이 섞임)는 공연장으로 보지 않는다.
  if (/^(theatre|concert_hall)$/.test(tags.amenity ?? "")) return "concert";
  if (/^(university|college)$/.test(tags.amenity ?? "")) return "university";
  // 작은 갤러리·기념물·동상은 관광객이 몰리는 곳으로 보지 않는다.
  if (/^(attraction|museum|theme_park|zoo|aquarium)$/.test(tags.tourism ?? "") || /^(palace|castle)$/.test(tags.historic ?? "")) return "tourism";
  if (tags.leisure === "park" || tags.place === "square") return "park";
  if (/^(mall|department_store)$/.test(tags.shop ?? "")) return "shopping";
  if (tags.amenity === "marketplace") return "market";
  if (/^(trunk|primary)$/.test(tags.highway ?? "")) return "road";
  if (/^(suburb|quarter|neighbourhood)$/.test(tags.place ?? "")) return "place";
  return null;
}

/** 이벤트 이름으로 어색한 일반 이름, 축제가 열릴 리 없는 작은 공원 */
const genericSiteNames = new Set(["운동장", "공원", "근린공원", "광장", "시장"]);
const smallParkPattern = /어린이공원|놀이터|쉼터|소공원|쌈지|근린공원$/;

/** 한글 이름이 있는 장소만 쓴다(게임 안 문구가 한국어). */
export function readSiteFeatures(elements: readonly SiteFeatureSource[]): SiteFeature[] {
  const seen = new Set<string>();
  const features: SiteFeature[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = (tags["name:ko"] ?? tags.name ?? "").trim();
    if (!name || !/[가-힣]/.test(name)) continue;
    const kind = classifySiteFeature(tags);
    if (!kind || genericSiteNames.has(name)) continue;
    if (kind === "park" && smallParkPattern.test(name)) continue;
    const point = element.center
      ?? (typeof element.lat === "number" && typeof element.lon === "number" ? { lat: element.lat, lon: element.lon } : element.geometry?.[0]);
    if (!point) continue;
    const key = `${kind}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({ kind, name, position: [point.lat, point.lon] });
  }
  return features;
}

export interface SiteEventStation {
  id: string;
  name: string;
  position: GeoCoordinate;
  routeIds: string[];
}

export interface SiteEventRoute {
  id: string;
  name: string;
  coordinates: ReadonlyArray<GeoCoordinate>;
  riverCrossingPositions: ReadonlyArray<GeoCoordinate>;
  mountainSegments: number;
}

/** 이벤트 종류(게임의 NewsEventKind와 같은 이름) */
export type SiteEventKind = "sports" | "concert" | "university" | "tourism" | "festival" | "roadworks" | "heavy-rain" | "heavy-snow";

export interface SiteEventCandidate {
  kind: SiteEventKind;
  title: string;
  summary: string;
  regionName: string;
  position: GeoCoordinate;
  stationIds: string[];
  routeIds: string[];
}

const siteRadiusM: Record<Exclude<SiteKind, "place">, number> = {
  sports: 900, concert: 700, university: 900, tourism: 800, park: 600, shopping: 600, market: 600, road: 250,
};

/**
 * 장소 이벤트: 운영 중인 역에서 가까운 실제 장소마다 후보 하나. 지형 이벤트: 강을 건너는 노선(호우), 산악 구간이 있는 노선(대설).
 * 지역 이름은 그 역에서 가장 가까운 동네 이름(없으면 역 이름).
 */
export function buildSiteEventCandidates(
  features: readonly SiteFeature[],
  stations: readonly SiteEventStation[],
  routes: readonly SiteEventRoute[],
): SiteEventCandidate[] {
  const places = features.filter((feature) => feature.kind === "place");
  const regionOf = (position: GeoCoordinate, fallback: string) => {
    const nearest = places
      .map((place) => ({ place, distance: distanceMeters(position, place.position) }))
      .filter((item) => item.distance <= 1200)
      .sort((a, b) => a.distance - b.distance)[0];
    return `${nearest?.place.name ?? fallback} 일대`;
  };
  const candidates: SiteEventCandidate[] = [];
  for (const feature of features) {
    if (feature.kind === "place") continue;
    // 예전에 받아 둔 데이터에도 같은 기준을 적용한다.
    if (genericSiteNames.has(feature.name) || (feature.kind === "park" && smallParkPattern.test(feature.name))) continue;
    const radius = siteRadiusM[feature.kind];
    const nearest = stations
      .map((station) => ({ station, distance: distanceMeters(feature.position, station.position) }))
      .filter((item) => item.distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) continue;
    const { station } = nearest;
    const stationLabel = station.name.endsWith("역") ? station.name : `${station.name}역`;
    const base = { regionName: regionOf(feature.position, station.name), position: feature.position, stationIds: [station.id], routeIds: [...station.routeIds] };
    if (feature.kind === "sports") candidates.push({ ...base, kind: "sports", title: `${feature.name} 경기 개최`, summary: `경기 전후 저녁 시간에 ${stationLabel} 이용객이 몰립니다.` });
    else if (feature.kind === "concert") candidates.push({ ...base, kind: "concert", title: `${feature.name} 공연`, summary: `공연이 끝나는 저녁에 ${stationLabel}으로 관객이 한꺼번에 몰립니다.` });
    else if (feature.kind === "university") candidates.push({ ...base, kind: "university", title: `${feature.name} 축제`, summary: `축제 기간 ${stationLabel} 아침·낮 승하차가 늘어납니다.` });
    else if (feature.kind === "tourism") candidates.push({ ...base, kind: "tourism", title: `${feature.name} 관광객 증가`, summary: `관광철을 맞아 ${stationLabel}과 주변 환승역 이용객이 늘어납니다.` });
    else if (feature.kind === "park") candidates.push({ ...base, kind: "festival", title: `${feature.name} 축제`, summary: `축제를 찾는 시민이 저녁 시간 ${stationLabel}으로 모입니다.` });
    else if (feature.kind === "shopping") candidates.push({ ...base, kind: "festival", title: `${feature.name} 대규모 할인 행사`, summary: `행사 기간 ${stationLabel} 주변 쇼핑객이 늘어납니다.` });
    else if (feature.kind === "market") candidates.push({ ...base, kind: "festival", title: `${feature.name} 장날 행사`, summary: `장을 보러 오는 손님으로 ${stationLabel} 낮 시간 이용객이 늘어납니다.` });
    else if (feature.kind === "road") candidates.push({ ...base, kind: "roadworks", title: `${feature.name} 도로 공사`, summary: `차로가 줄어 버스·승용차 이용자 일부가 ${stationLabel} 철도로 옮겨옵니다.` });
  }
  for (const route of routes) {
    const crossing = route.riverCrossingPositions[0];
    if (crossing) {
      candidates.push({
        kind: "heavy-rain",
        title: `집중호우 — ${route.name} 강 횡단 구간 서행`,
        summary: `강을 건너는 구간을 안전 속도로 운행해 운영 부담이 늘고, 도로가 막혀 철도 수요는 조금 늘어납니다.`,
        regionName: regionOf(crossing, route.name),
        position: crossing,
        stationIds: [],
        routeIds: [route.id],
      });
    }
    if (route.mountainSegments > 0 && route.coordinates.length > 0) {
      const middle = route.coordinates[Math.floor(route.coordinates.length / 2)];
      candidates.push({
        kind: "heavy-snow",
        title: `대설 — ${route.name} 산악 구간 점검`,
        summary: `산을 지나는 구간에 눈이 쌓여 설비 점검과 제설로 운영 부담이 늘어납니다.`,
        regionName: regionOf(middle, route.name),
        position: middle,
        stationIds: [],
        routeIds: [route.id],
      });
    }
  }
  return candidates;
}
