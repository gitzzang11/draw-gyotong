export type MapLodMode = "overview" | "district" | "build";

export function getLodMode(zoom: number): MapLodMode {
  if (zoom < 11) return "overview";
  if (zoom < 15) return "district";
  return "build";
}
