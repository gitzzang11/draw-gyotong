import { describe, expect, it } from "vitest";
import { buildSiteEventCandidates, classifySiteFeature, readSiteFeatures } from "../src/events/siteEvents";

const station = { id: "s1", name: "성수", position: [37.5446, 127.0557] as [number, number], routeIds: ["r1"] };

describe("site features from OpenStreetMap", () => {
  it("classifies real places by their tags", () => {
    expect(classifySiteFeature({ leisure: "stadium" })).toBe("sports");
    expect(classifySiteFeature({ amenity: "university" })).toBe("university");
    expect(classifySiteFeature({ tourism: "museum" })).toBe("tourism");
    expect(classifySiteFeature({ leisure: "park" })).toBe("park");
    expect(classifySiteFeature({ shop: "mall" })).toBe("shopping");
    expect(classifySiteFeature({ highway: "primary" })).toBe("road");
    expect(classifySiteFeature({ place: "quarter" })).toBe("place");
    expect(classifySiteFeature({ highway: "residential" })).toBeNull();
    expect(classifySiteFeature({ amenity: "arts_centre" })).toBeNull();
    expect(classifySiteFeature({ amenity: "marketplace" })).toBe("market");
    expect(classifySiteFeature({ tourism: "gallery" })).toBeNull();
    expect(classifySiteFeature({ historic: "monument" })).toBeNull();
  });

  it("keeps only named Korean places once each", () => {
    const features = readSiteFeatures([
      { tags: { leisure: "park", name: "서울숲" }, center: { lat: 37.5444, lon: 127.0374 } },
      { tags: { leisure: "park", name: "서울숲" }, center: { lat: 37.5445, lon: 127.0375 } },
      { tags: { tourism: "attraction", name: "Maxim Mural" }, lat: 37.54, lon: 127.05 },
      { tags: { leisure: "stadium" }, lat: 37.54, lon: 127.05 },
      { tags: { leisure: "park", name: "용흥어린이공원" }, lat: 37.54, lon: 127.05 },
      { tags: { amenity: "university", name: "운동장" }, lat: 37.54, lon: 127.05 },
      { tags: { leisure: "park", name: "신암근린공원" }, lat: 37.54, lon: 127.05 },
    ]);
    expect(features).toEqual([{ kind: "park", name: "서울숲", position: [37.5444, 127.0374] }]);
  });
});

describe("site event candidates", () => {
  it("names events after the real place and attaches them to the nearest station", () => {
    const candidates = buildSiteEventCandidates(
      [
        { kind: "park", name: "서울숲", position: [37.5444, 127.0510] },
        { kind: "place", name: "성수동1가", position: [37.5450, 127.0500] },
        { kind: "sports", name: "멀리 있는 경기장", position: [37.60, 127.20] },
      ],
      [station],
      [],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: "festival", title: "서울숲 축제", regionName: "성수동1가 일대", stationIds: ["s1"], routeIds: ["r1"], position: [37.5444, 127.0510],
    });
    expect(candidates[0].summary).toContain("성수역");
  });

  it("creates weather events only for routes that actually cross rivers or mountains", () => {
    const candidates = buildSiteEventCandidates([], [station], [
      { id: "r1", name: "1호선", coordinates: [[37.5, 127], [37.52, 127.01]], riverCrossingPositions: [[37.51, 127.005]], mountainSegments: 0 },
      { id: "r2", name: "2호선", coordinates: [[37.6, 127], [37.62, 127.01], [37.64, 127.02]], riverCrossingPositions: [], mountainSegments: 2 },
      { id: "r3", name: "3호선", coordinates: [[37.7, 127], [37.71, 127.01]], riverCrossingPositions: [], mountainSegments: 0 },
    ]);
    expect(candidates.map((item) => [item.kind, item.routeIds[0]])).toEqual([["heavy-rain", "r1"], ["heavy-snow", "r2"]]);
    expect(candidates[0].position).toEqual([37.51, 127.005]);
    expect(candidates[1].title).toBe("대설 — 2호선 산악 구간 점검");
  });
});
