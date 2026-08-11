import { describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => {
  class LayerGroup {
    layers: unknown[] = [];
    addLayer(layer: unknown) { if (!this.layers.includes(layer)) this.layers.push(layer); return this; }
    removeLayer(layer: unknown) { this.layers = this.layers.filter((item) => item !== layer); return this; }
    getLayers() { return [...this.layers]; }
    clearLayers() { this.layers = []; return this; }
    addTo(group: LayerGroup) { group.addLayer(this); return this; }
  }
  class Polyline {
    latlngs: unknown;
    style: Record<string, unknown> = {};
    tooltip?: string;
    group?: LayerGroup;
    constructor(latlngs: unknown, style: Record<string, unknown> = {}) { this.latlngs = latlngs; this.style = style; }
    addTo(group: LayerGroup) { this.group = group; group.addLayer(this); return this; }
    setLatLngs(latlngs: unknown) { this.latlngs = latlngs; return this; }
    setStyle(style: Record<string, unknown>) { this.style = { ...this.style, ...style }; return this; }
    bringToBack() {
      if (this.group) this.group.layers = [this, ...this.group.layers.filter((layer) => layer !== this)];
      return this;
    }
    bringToFront() {
      if (this.group) this.group.layers = [...this.group.layers.filter((layer) => layer !== this), this];
      return this;
    }
    bindTooltip(value: string) { this.tooltip = value; return this; }
    unbindTooltip() { this.tooltip = undefined; return this; }
  }
  class Polygon extends Polyline {}
  class CircleMarker extends Polyline {
    latlng: unknown;
    constructor(latlng: unknown, style: Record<string, unknown> = {}) { super([], style); this.latlng = latlng; }
    setLatLng(latlng: unknown) { this.latlng = latlng; return this; }
    setRadius(radius: number) { this.style = { ...this.style, radius }; return this; }
    openTooltip() { return this; }
  }
  class Marker {
    position: { lat: number; lng: number };
    options: Record<string, any>;
    constructor(position: [number, number], options: Record<string, any>) {
      this.position = { lat: position[0], lng: position[1] };
      this.options = options;
    }
    addTo(group: LayerGroup) { group.addLayer(this); return this; }
    setLatLng(position: [number, number]) { this.position = { lat: position[0], lng: position[1] }; return this; }
    getLatLng() { return this.position; }
    setIcon(icon: unknown) { this.options.icon = icon; return this; }
    setZIndexOffset(value: number) { this.options.zIndexOffset = value; return this; }
    getElement() { return null; }
  }
  const leaflet = {
    LayerGroup,
    Polyline,
    Polygon,
    CircleMarker,
    Marker,
    layerGroup: () => new LayerGroup(),
    polyline: (points: unknown, style?: Record<string, unknown>) => new Polyline(points, style),
    polygon: (points: unknown, style?: Record<string, unknown>) => new Polygon(points, style),
    circleMarker: (point: unknown, style?: Record<string, unknown>) => new CircleMarker(point, style),
    marker: (point: [number, number], options: Record<string, any>) => new Marker(point, options),
    divIcon: (options: unknown) => options,
    latLng: (lat: number, lng: number) => ({ lat, lng }),
  };
  return { default: leaflet, ...leaflet };
});

import L from "leaflet";
import { BlueprintRenderer } from "../src/map/blueprintRenderer";
import { ConstructionRenderer } from "../src/map/constructionRenderer";
import { DepotRenderer } from "../src/map/depotRenderer";
import { LayerManager } from "../src/map/layerManager";
import { LineRenderer, type LineRenderEntity } from "../src/map/lineRenderer";
import { StationRenderer } from "../src/map/stationRenderer";
import { TrainRenderer } from "../src/map/trainRenderer";

function line(overrides: Partial<LineRenderEntity> = {}): LineRenderEntity {
  return {
    id: "line-1",
    paths: [[[37.5, 127], [37.51, 127.01]]],
    color: "#ff0000",
    selected: false,
    underConstruction: false,
    planning: false,
    paused: false,
    lod: "district",
    ...overrides,
  };
}

describe("incremental map renderers (mocked Leaflet; no DOM)", () => {
  it("creates each managed group once and toggles visibility without duplication", () => {
    const attached = new Set<unknown>();
    const map = {
      addLayer(layer: unknown) { attached.add(layer); },
      removeLayer(layer: unknown) { attached.delete(layer); },
      hasLayer(layer: unknown) { return attached.has(layer); },
    };
    const manager = new LayerManager(map as never);
    const first = manager.get("completed-lines");
    expect(manager.get("completed-lines")).toBe(first);
    manager.setVisible("completed-lines", false);
    expect(manager.isVisible("completed-lines")).toBe(false);
    manager.setVisible("completed-lines", true);
    expect(manager.get("completed-lines")).toBe(first);
  });

  it("updates a line color and LOD without recreating its layers", () => {
    const group = L.layerGroup();
    const renderer = new LineRenderer(group);
    renderer.reconcileEntities([line()]);
    const initial = group.getLayers();
    renderer.reconcileEntities([line({ color: "#00ff00", lod: "build" })]);
    expect(group.getLayers()).toEqual(initial);
    expect(renderer.renderedIds).toEqual(new Set(["line-1"]));
  });

  it("keeps the base line unchanged and creates a selection halo with emphasis", () => {
    const group = L.layerGroup();
    const selection = L.layerGroup();
    const renderer = new LineRenderer(group, selection, "routeSelectionPane");
    renderer.reconcileEntities([line()]);
    const baseLayers = group.getLayers();
    const baseStyles = baseLayers.map((layer) => ({ ...(layer as L.Polyline & { style: Record<string, unknown> }).style }));
    renderer.reconcileEntities([line({ selected: true })]);
    expect(group.getLayers()).toEqual(baseLayers);
    expect(selection.getLayers()).toHaveLength(2);
    expect(baseLayers.map((layer) => (layer as L.Polyline & { style: Record<string, unknown> }).style)).toEqual(baseStyles);
    renderer.reconcileEntities([line({ selected: true, lod: "build" })]);
    expect(selection.getLayers()).toHaveLength(2);
    renderer.reconcileEntities([line({ selected: false, lod: "build" })]);
    expect(selection.getLayers()).toHaveLength(0);
  });

  it("keeps branch outlines below all colored strokes for a seamless junction", () => {
    const group = L.layerGroup();
    const renderer = new LineRenderer(group);
    renderer.reconcileEntities([line({
      paths: [
        [[37.5, 127], [37.51, 127.01], [37.52, 127.02]],
        [[37.51, 127.01], [37.515, 127.03]],
      ],
    })]);
    const colors = group.getLayers().map((layer) =>
      (layer as L.Polyline & { style: Record<string, unknown> }).style.color
    );
    expect(colors.slice(0, 2)).toEqual(["rgba(4, 10, 14, 0.9)", "rgba(4, 10, 14, 0.9)"]);
    expect(colors.slice(2)).toEqual(["#ff0000", "#ff0000"]);
  });

  it("moves the selection halo and emphasis when another line is selected", () => {
    const group = L.layerGroup();
    const selection = L.layerGroup();
    const renderer = new LineRenderer(group, selection);
    renderer.reconcileEntities([line({ selected: true }), line({ id: "line-2" })]);
    expect(selection.getLayers()).toHaveLength(2);
    const firstHalo = selection.getLayers()[0];
    renderer.reconcileEntities([line(), line({ id: "line-2", selected: true })]);
    expect(selection.getLayers()).toHaveLength(2);
    expect(selection.getLayers()[0]).not.toBe(firstHalo);
  });

  it("updates only the train marker when its position changes", () => {
    const lineGroup = L.layerGroup();
    const trainGroup = L.layerGroup();
    const lines = new LineRenderer(lineGroup);
    const trains = new TrainRenderer(trainGroup);
    lines.reconcileEntities([line()]);
    trains.reconcileEntities([{
      id: "train-1", position: [37.5, 127], color: "#ff0000", label: "열차", title: "열차", state: "running",
    }]);
    const routeLayers = lineGroup.getLayers();
    const marker = trainGroup.getLayers()[0] as L.Marker;
    trains.reconcileEntities([{
      id: "train-1", position: [37.51, 127.01], color: "#ff0000", label: "열차", title: "열차", state: "running",
    }]);
    expect(lineGroup.getLayers()).toEqual(routeLayers);
    expect(trainGroup.getLayers()[0]).toBe(marker);
    expect(marker.getLatLng()).toMatchObject({ lat: 37.51, lng: 127.01 });
  });

  it("keeps train icon orientation fixed across movement and turning states", () => {
    const group = L.layerGroup();
    const renderer = new TrainRenderer(group);
    const train = {
      id: "train-1", position: [37.5, 127] as [number, number], color: "#ff0000",
      label: "열차", title: "열차", state: "running" as const,
    };
    renderer.reconcileEntities([train]);
    const marker = group.getLayers()[0] as L.Marker & { options: { icon: { html: string } } };
    const initialHtml = marker.options.icon.html;
    renderer.reconcileEntities([{ ...train, position: [37.51, 127.01], state: "turning" }]);
    expect(marker.options.icon.html).toBe(initialHtml);
    expect(marker.options.icon.html).not.toContain("rotate(");
    expect(marker.options.icon.html).not.toContain("scaleX(");
  });

  it("updates a station name without creating another station marker", () => {
    const group = L.layerGroup();
    const renderer = new StationRenderer(group);
    const station = {
      id: "station-1", name: "이전 이름", position: [37.5, 127] as [number, number],
      color: "#ff0000", selected: false, express: false, transfer: false, operational: true, showLabel: false,
    };
    renderer.reconcileEntities([station], []);
    const marker = group.getLayers()[0];
    renderer.reconcileEntities([{ ...station, name: "새 이름" }], []);
    expect(group.getLayers()).toEqual([marker]);
  });

  it("keeps blueprint ids separate from completed entity ids", () => {
    const lineGroup = L.layerGroup();
    const blueprintGroup = L.layerGroup();
    const lines = new LineRenderer(lineGroup);
    const blueprints = new BlueprintRenderer(blueprintGroup);
    lines.reconcileEntities([line({ id: "shared" })]);
    blueprints.reconcileEntities([{
      id: "blueprint:route:plan-1:shared:segment-1", kind: "route",
      points: [[37.5, 127], [37.51, 127.01]], color: "#00ffff",
      selected: true, canDelete: false, valid: true,
    }]);
    expect(lines.renderedIds).toEqual(new Set(["shared"]));
    expect(blueprints.renderedIds).toEqual(new Set(["blueprint:route:plan-1:shared:segment-1"]));
    expect(lineGroup.getLayers()).toHaveLength(2);
    expect(blueprintGroup.getLayers()).toHaveLength(1);
  });

  it("updates a depot boundary and selection without recreating its polygon", () => {
    const group = L.layerGroup();
    const renderer = new DepotRenderer(group);
    const depot = {
      id: "depot-1",
      polygon: [[37.5, 127], [37.5, 127.01], [37.51, 127.01]] as Array<[number, number]>,
      selected: false,
      operational: true,
      connected: true,
    };
    renderer.reconcileEntities([depot]);
    const polygon = group.getLayers()[0];
    renderer.reconcileEntities([{
      ...depot,
      polygon: [[37.5, 127], [37.5, 127.02], [37.52, 127.02]],
      selected: true,
    }]);
    expect(group.getLayers()).toEqual([polygon]);
  });

  it("updates construction progress without rebuilding unrelated layers", () => {
    const projectGroup = L.layerGroup();
    const draftGroup = L.layerGroup();
    const map = {
      distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
        return Math.hypot(a.lat - b.lat, a.lng - b.lng);
      },
    };
    const renderer = new ConstructionRenderer(map as never, projectGroup, draftGroup);
    const project = {
      id: "project-1",
      points: [[37.5, 127], [37.51, 127.01]] as Array<[number, number]>,
      progress: 0.25,
      ready: false,
      affected: false,
    };
    renderer.reconcileEntities([project]);
    const initial = projectGroup.getLayers();
    renderer.reconcileEntities([{ ...project, progress: 0.75 }]);
    expect(projectGroup.getLayers()).toEqual(initial);
    expect(renderer.renderedIds).toEqual(new Set(["project-1"]));
  });

  it("removes deleted ids from both the registry and Leaflet group", () => {
    const group = L.layerGroup();
    const renderer = new TrainRenderer(group);
    renderer.reconcileEntities([{
      id: "deleted-train", position: [37.5, 127], color: "#ffffff",
      label: "삭제 열차", title: "삭제 열차", state: "stopped",
    }]);
    renderer.reconcileEntities([]);
    expect(renderer.renderedIds).toEqual(new Set());
    expect(group.getLayers()).toHaveLength(0);
  });
});
