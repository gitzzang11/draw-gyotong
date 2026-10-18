import { describe, expect, it } from "vitest";
import { buildSchematicLayout, octilinearBends, type SchematicLine, type SchematicStation } from "../src/diagram/schematicLayout";
import { renderSchematic } from "../src/diagram/schematicRender";

function station(id: string, lat: number, lng: number, transfer = false): SchematicStation {
  return { id, name: id, geo: [lat, lng], transfer, express: false };
}

function line(id: string, paths: string[][], status: SchematicLine["status"] = "operational"): SchematicLine {
  return { id, name: `${id}호선`, color: "#1D4FA0", label: id, status, paths };
}

const theme = { background: "#FBFAF6", surface: "#FBFAF6", ink: "#15171A", muted: "#6B7076", halo: "#FBFAF6" };

describe("schematic layout", () => {
  it("draws a straight east-west line on one row with even spacing", () => {
    const stations = ["a", "b", "c", "d", "e"].map((id, index) => station(id, 37.5 + (index % 2) * 0.0004, 127 + index * 0.012));
    const layout = buildSchematicLayout(stations, [line("1", [["a", "b", "c", "d", "e"]])]);
    const ys = ["a", "b", "c", "d", "e"].map((id) => layout.positions.get(id)!.y);
    expect(new Set(ys).size).toBe(1);
    const xs = ["a", "b", "c", "d", "e"].map((id) => layout.positions.get(id)!.x);
    for (let index = 1; index < xs.length; index += 1) expect(xs[index] - xs[index - 1]).toBeGreaterThanOrEqual(1);
    expect(layout.edges.every((edge) => Math.abs(edge.direction.x) === 1 && edge.direction.y === 0)).toBe(true);
  });

  it("keeps crossing lines octilinear, apart and on the half grid", () => {
    const stations = [
      station("w2", 37.5, 126.96), station("w1", 37.5, 126.98), station("x", 37.5, 127.0, true), station("e1", 37.5, 127.02), station("e2", 37.5, 127.04),
      station("n2", 37.52, 127.0), station("n1", 37.51, 127.0), station("s1", 37.49, 127.0), station("s2", 37.48, 127.0),
    ];
    const layout = buildSchematicLayout(stations, [line("1", [["w2", "w1", "x", "e1", "e2"]]), line("2", [["n2", "n1", "x", "s1", "s2"]])]);
    const points = [...layout.positions.values()];
    for (const point of points) {
      expect(Number.isInteger(point.x * 2)).toBe(true);
      expect(Number.isInteger(point.y * 2)).toBe(true);
    }
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThanOrEqual(0.9);
    }
    // 가로선은 한 줄, 세로선은 한 열
    expect(new Set(["w2", "w1", "x", "e1", "e2"].map((id) => layout.positions.get(id)!.y)).size).toBe(1);
    expect(new Set(["n2", "n1", "x", "s1", "s2"].map((id) => layout.positions.get(id)!.x)).size).toBe(1);
  });

  it("is deterministic and keeps hand-placed stations where the player put them", () => {
    const stations = ["a", "b", "c", "d"].map((id, index) => station(id, 37.5 + index * 0.008, 127 + index * 0.01));
    const lines = [line("1", [["a", "b", "c", "d"]])];
    const first = buildSchematicLayout(stations, lines);
    const second = buildSchematicLayout(stations, lines);
    expect([...first.positions]).toEqual([...second.positions]);
    const pinned = buildSchematicLayout(stations, lines, { c: { x: 5, y: -3 } });
    expect(pinned.positions.get("c")).toEqual({ x: 5, y: -3 });
  });

  it("records every line that shares a stretch of track on that edge", () => {
    const stations = [station("a", 37.5, 127), station("b", 37.5, 127.01, true), station("c", 37.5, 127.02, true), station("d", 37.5, 127.03), station("e", 37.51, 127.03)];
    const layout = buildSchematicLayout(stations, [line("1", [["a", "b", "c", "d"]]), line("2", [["b", "c", "e"]])]);
    const shared = layout.edges.find((edge) => edge.id === "b|c")!;
    expect(shared.lineIds).toEqual(["1", "2"]);
  });

  it("bends a non-octilinear edge once, preferring the edge's own direction first", () => {
    expect(octilinearBends({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 0 })).toEqual([]);
    expect(octilinearBends({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 1 })).toEqual([]);
    expect(octilinearBends({ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 0 })).toEqual([{ x: 2, y: 0 }]);
    expect(octilinearBends({ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("schematic render", () => {
  it("draws stations, terminal line marks, names and dashed lines under construction", () => {
    const stations = [station("a", 37.5, 127), station("b", 37.5, 127.01, true), station("c", 37.5, 127.02), station("d", 37.51, 127.01)];
    const lines = [line("1", [["a", "b", "c"]]), line("2", [["d", "b"]], "building")];
    const layout = buildSchematicLayout(stations, lines);
    const result = renderSchematic(layout, stations, lines, theme, { unit: 64, showNames: true });
    expect(result.stations.match(/class="diagram-station"/g)).toHaveLength(4);
    // 종착역 표지: 1호선 양끝(a, c) + 2호선 끝(d). 2호선의 b는 1호선과 만나는 역이지만 2호선으로는 끝이라 표지가 붙는다.
    expect(result.stations.match(/diagram-terminal-mark/g)?.length).toBe(4);
    expect(result.labels.match(/class="diagram-label"/g)).toHaveLength(4);
    expect(result.routes).toContain('stroke-dasharray="14 8"');
    expect(result.stationPoints.size).toBe(4);
    const hidden = renderSchematic(layout, stations, lines, theme, { unit: 64, showNames: false });
    expect(hidden.labels).toBe("");
  });
});
