import type { LeafletEvent, Map as LeafletMap, TileLayer } from "leaflet";

export type MapLifecycleCallbacks = {
  onReady: () => void | Promise<void>;
  onBaseLayerLoad: () => void;
  onBaseLayerError: () => void;
  onViewportChange: (event: LeafletEvent) => void;
  onDragEnd: () => void;
  onZoomEnd: () => void;
  onLoadingTimeout: () => void;
};

/** Registers top-level map lifecycle events without owning map or application state. */
export function registerMapLifecycle(map: LeafletMap, baseLayer: TileLayer, callbacks: MapLifecycleCallbacks) {
  map.whenReady(() => {
    void callbacks.onReady();
  });
  baseLayer.on("load", callbacks.onBaseLayerLoad);
  baseLayer.on("tileerror", callbacks.onBaseLayerError);
  map.on("zoomend moveend", callbacks.onViewportChange);
  map.on("dragend", callbacks.onDragEnd);
  map.on("zoomend", callbacks.onZoomEnd);
  window.setTimeout(callbacks.onLoadingTimeout, 3500);
}
