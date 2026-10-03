/**
 * 지도 렌더러가 쓰는 테마 색.
 *
 * 기준: docs/design/DESIGN_SYSTEM.md §4, §11. 노선 고유 색 외의 지도 기호 색은 이 팔레트에서만 가져온다.
 * DOM이 없는 환경(테스트)에서는 종이 테마 값을 쓴다. 테마가 바뀌면 다시 읽도록 `data-theme`별로 캐시한다.
 */
export interface MapPalette {
  surface: string;
  ground: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  info: string;
  caution: string;
  danger: string;
  ok: string;
}

/** 종이 테마 토큰 값 (src/design/tokens.css와 같은 값). */
export const PAPER_MAP_PALETTE: MapPalette = {
  surface: "#FBFAF6",
  ground: "#ECE9E1",
  ink: "#15171A",
  inkMuted: "#454A50",
  inkFaint: "#6B7076",
  info: "#1D5FC2",
  caution: "#F2BE00",
  danger: "#C8242C",
  ok: "#1D7F47",
};

const tokens: Record<keyof MapPalette, string> = {
  surface: "--surface-0",
  ground: "--map-ground",
  ink: "--text-1",
  inkMuted: "--text-2",
  inkFaint: "--text-3",
  info: "--signal-info",
  caution: "--signal-caution",
  danger: "--signal-danger",
  ok: "--signal-ok",
};

let cached: { theme: string; palette: MapPalette } | null = null;

export function mapPalette(): MapPalette {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return PAPER_MAP_PALETTE;
  const root = document.documentElement;
  const theme = root.dataset.theme ?? "";
  if (cached?.theme === theme) return cached.palette;
  const style = getComputedStyle(root);
  const palette = { ...PAPER_MAP_PALETTE };
  for (const key of Object.keys(tokens) as Array<keyof MapPalette>) {
    palette[key] = style.getPropertyValue(tokens[key]).trim() || PAPER_MAP_PALETTE[key];
  }
  cached = { theme, palette };
  return palette;
}
