import L from "leaflet";

export type MapLayerName =
  | "completed-lines"
  | "stations"
  | "trains"
  | "depots"
  | "blueprints"
  | "construction"
  | "demolition"
  | "route-selection"
  | "selection"
  | "construction-preview"
  | "draft-renderer"
  | "depot-guide"
  | "repair-guide"
  | "edit-guide";

const DEFAULT_LAYER_ORDER: readonly MapLayerName[] = [
  "completed-lines",
  "construction",
  "demolition",
  "blueprints",
  "depots",
  "stations",
  "trains",
  "route-selection",
  "selection",
  "construction-preview",
  "draft-renderer",
  "depot-guide",
  "repair-guide",
  "edit-guide",
];

export class LayerManager {
  private readonly layers = new Map<MapLayerName, L.LayerGroup>();
  private readonly visible = new Map<MapLayerName, boolean>();

  constructor(private readonly map: L.Map, names: readonly MapLayerName[] = DEFAULT_LAYER_ORDER) {
    for (const name of names) this.create(name);
  }

  get(name: MapLayerName) {
    return this.layers.get(name) ?? this.create(name);
  }

  clear(name: MapLayerName) {
    this.get(name).clearLayers();
  }

  setVisible(name: MapLayerName, visible: boolean) {
    const layer = this.get(name);
    if (visible && !this.map.hasLayer(layer)) layer.addTo(this.map);
    else if (!visible && this.map.hasLayer(layer)) this.map.removeLayer(layer);
    this.visible.set(name, visible);
  }

  isVisible(name: MapLayerName) {
    return this.visible.get(name) ?? false;
  }

  remove(name: MapLayerName) {
    const layer = this.layers.get(name);
    if (!layer) return;
    layer.clearLayers();
    if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
    this.layers.delete(name);
    this.visible.delete(name);
  }

  get size() {
    return this.layers.size;
  }

  private create(name: MapLayerName) {
    const layer = L.layerGroup().addTo(this.map);
    this.layers.set(name, layer);
    this.visible.set(name, true);
    return layer;
  }
}
