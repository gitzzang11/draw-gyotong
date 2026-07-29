import L from "leaflet";

export class LayerManager {
  private readonly layers = new Map<string, L.LayerGroup>();

  constructor(private readonly map: L.Map) {}

  get(name: string) {
    let layer = this.layers.get(name);
    if (!layer) {
      layer = L.layerGroup().addTo(this.map);
      this.layers.set(name, layer);
    }
    return layer;
  }

  remove(name: string) {
    const layer = this.layers.get(name);
    if (!layer) return;
    layer.clearLayers();
    this.map.removeLayer(layer);
    this.layers.delete(name);
  }

  get size() {
    return this.layers.size;
  }
}
