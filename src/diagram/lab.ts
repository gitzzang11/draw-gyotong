// 노선도 시험 페이지(docs/design/prototype/diagram-lab.html): 가상의 노선망을 새 배치·그리기로 그려 본다.
import { buildSchematicLayout, type SchematicLine, type SchematicStation } from "./schematicLayout.ts";
import { renderSchematic, type SchematicTheme } from "./schematicRender.ts";

type Net = { title: string; stations: SchematicStation[]; lines: SchematicLine[] };

const paper: SchematicTheme = { background: "#FBFAF6", surface: "#FBFAF6", ink: "#15171A", muted: "#6B7076", halo: "#FBFAF6" };
const ink: SchematicTheme = { background: "#121416", surface: "#121416", ink: "#ECEAE3", muted: "#8C8981", halo: "#121416" };

let seed = 7;
function noise() {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647 - 0.5) * 0.004;
}

function makeNet(title: string, defs: Array<{ id: string; name: string; color: string; label: string; status?: "operational" | "building"; paths: Array<Array<[string, number, number]>> }>): Net {
  const stations = new Map<string, SchematicStation>();
  const lines: SchematicLine[] = [];
  for (const def of defs) {
    const paths = def.paths.map((path) =>
      path.map(([name, lat, lng]) => {
        const id = `s:${name}`;
        const existing = stations.get(id);
        if (existing) existing.transfer = true;
        else stations.set(id, { id, name, geo: [lat + noise(), lng + noise()], transfer: false, express: name.endsWith("*") });
        return id;
      }),
    );
    lines.push({ id: def.id, name: def.name, color: def.color, label: def.label, status: def.status ?? "operational", paths });
  }
  for (const station of stations.values()) station.name = station.name.replace("*", "");
  return { title, stations: [...stations.values()], lines };
}

function along(names: string[], from: [number, number], to: [number, number]): Array<[string, number, number]> {
  return names.map((name, index) => {
    const t = names.length === 1 ? 0 : index / (names.length - 1);
    return [name, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  });
}

const gwangju = makeNet("광주 교통공사 (2개 노선)", [
  { id: "g1", name: "광주 1호선", color: "#0B8F6F", label: "1", paths: [[...along(["녹동", "소태", "학동", "남광주", "문화전당", "금남로4가", "양동시장", "돌고개", "농성", "화정", "쌍촌", "운천", "상무", "김대중컨벤션센터", "공항", "송정공원", "광주송정"], [35.09, 126.99], [35.14, 126.79])]] },
  { id: "g2", name: "광주 2호선", color: "#E8A21B", label: "2", paths: [[...along(["시청", "운천저수지", "상무"], [35.16, 126.85], [35.15, 126.85]), ...along(["백운광장", "남광주", "조선대", "광주역", "전남대"], [35.13, 126.9], [35.18, 126.92])]] },
]);

const loop: Array<[string, number, number]> = Array.from({ length: 14 }, (_, index) => {
  const angle = (index / 14) * Math.PI * 2;
  const names = ["시청", "을지로", "동대문", "성수", "건대입구", "잠실", "삼성", "강남", "교대", "사당", "신림", "구로", "영등포", "신촌"];
  return [names[index], 37.53 + Math.sin(angle) * 0.045, 126.98 + Math.cos(angle) * 0.075] as [string, number, number];
});
const seoul = makeNet("서울 (5개 노선 · 순환·분기·공용 구간)", [
  { id: "l2", name: "2호선", color: "#2E9E4F", label: "2", paths: [[...loop, loop[0]]] },
  { id: "l1", name: "1호선", color: "#1D4FA0", label: "1", paths: [[...along(["의정부", "창동", "청량리"], [37.74, 127.05], [37.58, 127.04]), ["동대문", 0, 0] as never, ...along(["종로3가*"], [37.571, 126.99], [37.571, 126.99]), ["시청", 0, 0] as never, ...along(["서울역", "용산", "노량진"], [37.555, 126.972], [37.513, 126.94]), ["영등포", 0, 0] as never, ...along(["부천", "인천"], [37.48, 126.78], [37.47, 126.62])]] },
  { id: "l3", name: "3호선", color: "#E9762B", label: "3", paths: [[...along(["구파발", "불광", "독립문"], [37.64, 126.92], [37.57, 126.96]), ...along(["종로3가*", "충무로", "약수", "옥수", "압구정", "고속터미널"], [37.571, 126.99], [37.505, 127.0]), ["교대", 0, 0] as never, ...along(["양재", "수서", "오금"], [37.484, 127.03], [37.5, 127.13])]] },
  { id: "l4", name: "4호선", color: "#2AA0D8", label: "4", paths: [[...along(["당고개", "노원", "창동", "성신여대"], [37.67, 127.08], [37.59, 127.02]), ["동대문", 0, 0] as never, ...along(["충무로", "서울역", "숙대입구", "삼각지"], [37.561, 126.994], [37.534, 126.973]), ["사당", 0, 0] as never, ...along(["과천", "인덕원", "금정"], [37.43, 126.99], [37.37, 126.94])]] },
  { id: "l5", name: "5호선", color: "#8B50A4", label: "5", status: "building", paths: [
    [...along(["김포공항", "까치산", "목동"], [37.56, 126.8], [37.53, 126.87]), ["영등포", 0, 0] as never, ...along(["여의도", "공덕", "광화문"], [37.52, 126.92], [37.571, 126.976]), ["종로3가*", 0, 0] as never, ...along(["왕십리", "군자", "천호", "상일동"], [37.561, 127.037], [37.556, 127.166])],
    [...along(["천호", "올림픽공원", "마천"], [37.538, 127.123], [37.49, 127.15])],
  ] },
]);

// along()에 [이름, 0, 0]으로 넣은 역은 이미 있는 역을 다시 지나는 것(좌표는 처음 것을 쓴다)
for (const net of [seoul]) {
  for (const station of net.stations) if (station.geo[0] === 0) station.geo = [37.55, 126.98];
}

function draw(net: Net, theme: SchematicTheme, host: HTMLElement) {
  const started = performance.now();
  const layout = buildSchematicLayout(net.stations, net.lines);
  const result = renderSchematic(layout, net.stations, net.lines, theme, { unit: 64, showNames: true });
  const ms = Math.round(performance.now() - started);
  const pad = 60;
  const { minX, minY, maxX, maxY } = result.bounds;
  const figure = document.createElement("figure");
  figure.innerHTML = `<figcaption>${net.title} · ${ms}ms</figcaption><svg viewBox="${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}" style="background:${theme.background}">${result.routes}${result.stations}${result.labels}</svg>`;
  host.append(figure);
}

const host = document.getElementById("lab")!;
// 개발 중에만: public/__diagram-fixture.json(실제 세이브에서 뽑은 노선망)이 있으면 맨 위에 그린다.
void fetch("/__diagram-fixture.json").then((response) => (response.ok ? response.json() : null)).then((fixture) => {
  if (!fixture) return;
  const net: Net = { title: "실제 세이브 노선망", stations: fixture.stations, lines: fixture.lines.map((line: SchematicLine & { label?: string }) => ({ ...line, label: line.label ?? (line.name.match(/d+/)?.[0] ?? line.name.slice(0, 2)), status: "operational" })) };
  const before = host.firstChild;
  const temp = document.createElement("div");
  draw(net, paper, temp);
  host.insertBefore(temp, before);
}).catch(() => undefined);
draw(gwangju, paper, host);
draw(seoul, paper, host);
draw(seoul, ink, host);
