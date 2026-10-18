import { describe, expect, it } from "vitest";
import { listAutomaticStationNames, photonToStationNameFeatures, selectAutomaticStationName, type StationNameFeature } from "../src/stationNaming";

const origin: [number, number] = [0, 0];

function pointAtMeters(distance: number) {
  return { lat: 0, lon: distance / 6_371_000 * 180 / Math.PI };
}

function feature(name: string, tags: Record<string, string>, distance: number): StationNameFeature {
  return { tags: { name, ...tags }, ...pointAtMeters(distance) };
}

const categories = [
  { source: "railway", radius: 500, tags: { railway: "station" }, values: ["station", "halt", "tram_stop"], key: "railway" },
  { source: "area", radius: 850, tags: { place: "suburb" }, values: ["suburb", "quarter", "neighbourhood", "village"], key: "place" },
  { source: "facility", radius: 600, tags: { amenity: "university" }, values: ["university", "hospital", "townhall", "marketplace", "library", "school"], key: "amenity" },
  { source: "park", radius: 450, tags: { leisure: "park" }, values: ["park"], key: "leisure" },
  { source: "landmark", radius: 600, tags: { tourism: "museum" }, values: ["attraction", "museum", "gallery", "viewpoint", "zoo", "theme_park"], key: "tourism" },
  { source: "road", radius: 300, tags: { highway: "residential" }, values: ["residential"], key: "highway" },
] as const;

describe("automatic station naming", () => {
  it("chooses an actual station 450 meters away before every other kind of nearby POI", () => {
    const elements = [
      ...categories.slice(1).map(({ tags }) => feature("Nearby POI", tags, 10)),
      feature("실제역", { railway: "station" }, 450),
    ];

    const result = selectAutomaticStationName(origin, elements);

    expect(result).toMatchObject({ name: "실제", source: "railway" });
    expect(result?.distanceMeters).toBeCloseTo(450, 6);
  });

  it("chooses the closer actual station at 401 meters before one at 499 meters", () => {
    const elements = [feature("가까워보이는역", { railway: "station" }, 499), feature("하늘역", { railway: "station" }, 401)];

    expect(selectAutomaticStationName(origin, elements)).toMatchObject({ name: "하늘", source: "railway" });
  });

  it("includes an actual station on the 500 meter boundary", () => {
    const result = selectAutomaticStationName(origin, [feature("경계역", { railway: "station" }, 500)]);

    expect(result).toMatchObject({ name: "경계", source: "railway" });
    expect(result?.distanceMeters).toBeCloseTo(500, 6);
  });

  it("uses a fallback area when the actual station is outside 500 meters", () => {
    expect(selectAutomaticStationName(origin, [
      feature("밖의역", { railway: "station" }, 501), feature("동네", { place: "quarter" }, 50),
    ])).toMatchObject({ name: "동네", source: "area" });
  });

  it("examines an actual station after more than 48 nonrailway features", () => {
    const elements = Array.from({ length: 50 }, (_, id) => ({ ...feature(`POI ${id}`, { amenity: "school" }, 10), id }));
    elements.push({ ...feature("마지막역", { railway: "station" }, 450), id: 50 });

    expect(selectAutomaticStationName(origin, elements)).toMatchObject({ name: "마지막", source: "railway" });
  });

  it("classifies combined railway and place metadata as railway with its full 500 meter radius", () => {
    expect(selectAutomaticStationName(origin, [feature("복합역", { railway: "station", place: "suburb" }, 500)]))
      .toMatchObject({ name: "복합", source: "railway" });
  });

  it.each(categories)("recognizes every supported $source subtype", ({ source, key, values }) => {
    for (const value of values) {
      expect(selectAutomaticStationName(origin, [feature("Candidate", { [key]: value }, 100)]))
        .toMatchObject({ name: "Candidate", source });
    }
  });

  it.each(categories)("rejects $source candidates outside their $radius meter radius", ({ tags, radius }) => {
    expect(selectAutomaticStationName(origin, [feature("Outside", tags, radius + 1)])).toBeNull();
  });

  it.each(categories)("selects the nearest $source candidate before considering its name", ({ tags, source }) => {
    expect(selectAutomaticStationName(origin, [feature("Alpha", tags, 150), feature("Zulu", tags, 100)]))
      .toMatchObject({ name: "Zulu", source });
  });

  it.each(categories)("breaks equal $source distances by name independently of feature order", ({ tags }) => {
    const alpha = feature("Alpha", tags, 100);
    const zulu = feature("Zulu", tags, 100);

    expect(selectAutomaticStationName(origin, [zulu, alpha])?.name).toBe("Alpha");
    expect(selectAutomaticStationName(origin, [alpha, zulu])?.name).toBe("Alpha");
  });

  it.each(categories.slice(1, -1).map((category, index) => [category, categories[index + 2]] as const))(
    "uses fallback category priority before distance", (higher, lower) => {
      expect(selectAutomaticStationName(origin, [
        feature("Lower priority", lower.tags, 10), feature("Higher priority", higher.tags, higher.radius - 1),
      ])).toMatchObject({ name: "Higher priority", source: higher.source });
    },
  );

  it("recognizes named historic landmarks", () => {
    expect(selectAutomaticStationName(origin, [feature("옛 성문", { historic: "city_gate" }, 500)]))
      .toMatchObject({ name: "옛 성문", source: "landmark" });
  });

  it("prefers the Korean name and removes parenthesized aliases and the station suffix", () => {
    expect(selectAutomaticStationName(origin, [feature("English Name", { railway: "station", "name:ko": "  한글역 (별칭)  " }, 100)]))
      .toMatchObject({ name: "한글", source: "railway" });
  });

  it.each(["", "   "])("falls back to name when name:ko is blank", (koreanName) => {
    expect(selectAutomaticStationName(origin, [feature("대체역", { railway: "station", "name:ko": koreanName }, 100)]))
      .toMatchObject({ name: "대체", source: "railway" });
  });

  it("skips a railway name that becomes blank after normalization", () => {
    expect(selectAutomaticStationName(origin, [
      feature("역 (별칭)", { railway: "station" }, 10), feature("유효한 동네", { place: "quarter" }, 100),
    ])).toMatchObject({ name: "유효한 동네", source: "area" });
  });

  it.each(["node", "center", "geometry"] as const)("supports coordinates supplied by %s", (kind) => {
    const point = pointAtMeters(100);
    const element: StationNameFeature = {
      tags: { name: "좌표역", railway: "station" },
      ...(kind === "node" ? point : kind === "center" ? { center: point } : { geometry: [point] }),
    };

    const result = selectAutomaticStationName(origin, [element]);

    expect(result).toMatchObject({ name: "좌표", source: "railway" });
    expect(result?.distanceMeters).toBeCloseTo(100, 6);
  });

  it("ignores missing names, missing coordinates, and unsupported feature categories", () => {
    const elements: StationNameFeature[] = [
      { ...pointAtMeters(10), tags: { railway: "station" } },
      { tags: { name: "위치없는역", railway: "station" } },
      feature("Signal", { railway: "signal" }, 10),
      feature("Cafe", { amenity: "cafe" }, 10),
      feature("Hotel", { tourism: "hotel" }, 10),
      feature("Valid", { leisure: "park" }, 100),
    ];

    expect(selectAutomaticStationName(origin, elements)).toMatchObject({ name: "Valid", source: "park" });
  });

  it.each([NaN, Infinity, -Infinity])("ignores nonfinite node, center, and geometry coordinates (%s)", (invalid) => {
    const tags = { name: "Invalid", railway: "station" };
    const elements: StationNameFeature[] = [
      { tags, lat: invalid, lon: 0 }, { tags, lat: 0, lon: invalid },
      { tags, center: { lat: invalid, lon: 0 } },
      { tags, geometry: [{ lat: 0, lon: invalid }] },
      feature("Valid", { place: "village" }, 100),
    ];

    expect(selectAutomaticStationName(origin, elements)).toMatchObject({ name: "Valid", source: "area" });
  });

  it("does not merge distinct positions merely because their coordinates round to the same three decimals", () => {
    const firstPosition: [number, number] = [0.0001, 0];
    const secondPosition: [number, number] = [0.0004, 0];
    const elements: StationNameFeature[] = [
      { tags: { name: "첫역", railway: "station" }, lat: 0.00009, lon: 0 },
      { tags: { name: "둘째역", railway: "station" }, lat: 0.00041, lon: 0 },
    ];

    expect(selectAutomaticStationName(firstPosition, elements)?.name).toBe("첫");
    expect(selectAutomaticStationName(secondPosition, elements)?.name).toBe("둘째");
  });

  it("does not mutate the origin or feature metadata and geometry", () => {
    const position: [number, number] = [0, 0];
    const elements: StationNameFeature[] = [
      { id: 1, tags: { name: "Zulu역 (별칭)", railway: "station" }, center: pointAtMeters(200), geometry: [pointAtMeters(200)] },
      { id: 2, tags: { name: "Alpha역", railway: "station" }, ...pointAtMeters(100) },
    ];
    const beforePosition = structuredClone(position);
    const beforeElements = structuredClone(elements);

    selectAutomaticStationName(position, elements);

    expect(position).toEqual(beforePosition);
    expect(elements).toEqual(beforeElements);
  });

  it("returns null when no valid candidate exists", () => {
    expect(selectAutomaticStationName(origin, [])).toBeNull();
    expect(selectAutomaticStationName(origin, [feature("밖의역", { railway: "station" }, 501)])).toBeNull();
  });
});

describe("station name candidates", () => {
  it("lists every name within its category radius by priority, then distance, without duplicates", () => {
    const result = listAutomaticStationNames(origin, [
      feature("공원", { leisure: "park" }, 100),
      feature("동네", { place: "quarter" }, 300),
      feature("가까운역", { railway: "station" }, 400),
      feature("먼역", { railway: "station" }, 501),
      feature("동네", { place: "quarter" }, 120),
      feature("길", { highway: "residential" }, 50),
    ]);
    expect(result.map((item) => [item.name, item.source])).toEqual([
      ["가까운", "railway"], ["동네", "area"], ["공원", "park"], ["길", "road"],
    ]);
    expect(result[1].distanceMeters).toBeCloseTo(120, 6);
  });

  it("keeps the higher-priority category when the same name appears in two categories and respects the limit", () => {
    const result = listAutomaticStationNames(origin, [
      feature("같은이름", { highway: "residential" }, 10),
      feature("같은이름", { amenity: "school" }, 200),
      ...Array.from({ length: 12 }, (_, index) => feature(`도로${index}`, { highway: "residential" }, 20 + index)),
      ...Array.from({ length: 4 }, (_, index) => feature(`역${index}`, { railway: "station" }, 100 + index)),
      feature("공원", { leisure: "park" }, 30),
    ], 5);
    expect(result[0]).toMatchObject({ name: "역0", source: "railway" });
    expect(result.map((item) => item.source)).toEqual(["railway", "railway", "railway", "facility", "park"]);
  });

  it("caps each category so several kinds of names appear", () => {
    const result = listAutomaticStationNames(origin, [
      ...Array.from({ length: 5 }, (_, index) => feature(`동네${index}`, { place: "quarter" }, 10 + index)),
      feature("학교", { amenity: "school" }, 300),
    ]);
    expect(result.map((item) => item.name)).toEqual(["동네0", "동네1", "학교"]);
  });
});

describe("station name candidates language", () => {
  it("skips names without Hangul", () => {
    const result = listAutomaticStationNames(origin, [
      feature("Maxim Mural", { tourism: "attraction" }, 10),
      feature("성수동", { place: "quarter" }, 100),
    ]);
    expect(result.map((item) => item.name)).toEqual(["성수동"]);
  });
});

describe("photon fallback", () => {
  it("turns Photon reverse results into name features the usual rules can pick from", () => {
    const point = (lng: number, lat: number) => ({ type: "Point", coordinates: [lng, lat] });
    const features = photonToStationNameFeatures({
      features: [
        { geometry: point(126.8889, 35.1531), properties: { osm_id: 1, name: "농성", osm_key: "railway", osm_value: "station" } },
        { geometry: point(126.889, 35.1535), properties: { osm_id: 2, name: "농성동", osm_key: "place", osm_value: "quarter" } },
        { geometry: point(126.889, 35.1532), properties: { osm_id: 3, name: "알프스모텔", osm_key: "tourism", osm_value: "motel" } },
        { geometry: point(126.889, 35.1532), properties: { osm_key: "tourism", osm_value: "hotel" } },
        { properties: { name: "좌표 없음", osm_key: "place", osm_value: "quarter" } },
      ],
    });
    expect(features).toHaveLength(3);
    expect(features[0]).toEqual({ id: 1, lat: 35.1531, lon: 126.8889, tags: { name: "농성", railway: "station" } });
    const names = listAutomaticStationNames([35.1531, 126.8889], features).map((item) => item.name);
    expect(names).toEqual(["농성", "농성동"]);
    expect(photonToStationNameFeatures(null)).toEqual([]);
  });
});
