/**
 * 화면 테마(지도 테마) 정의.
 *
 * 기준: docs/design/DESIGN_SYSTEM.md §3 테마.
 * 테마는 기기 설정이며 세이브 슬롯에 저장하지 않는다.
 */
export const MAP_THEMES = ["paper", "ink"] as const;

export type MapTheme = (typeof MAP_THEMES)[number];

export const DEFAULT_MAP_THEME: MapTheme = "paper";

export const MAP_THEME_LABELS: Record<MapTheme, string> = {
  paper: "종이",
  ink: "먹",
};

export function isMapTheme(value: unknown): value is MapTheme {
  return typeof value === "string" && (MAP_THEMES as readonly string[]).includes(value);
}

/** 저장된 값이 없거나 알 수 없는 값이면 기본 테마로 되돌린다. */
export function normalizeMapTheme(value: unknown): MapTheme {
  return isMapTheme(value) ? value : DEFAULT_MAP_THEME;
}

/** 루트 요소의 `data-theme`을 바꿔 토큰 집합을 전환한다. 다른 상태는 건드리지 않는다. */
export function applyMapTheme(root: Pick<HTMLElement, "dataset">, theme: MapTheme): void {
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
}

/**
 * 상태 표시줄 색(`<meta name="theme-color">`)을 현재 테마의 기본 바탕(`--surface-0`)에 맞춘다.
 * 테마를 적용한 뒤 호출한다. 읽은 값이 비어 있으면 그대로 둔다.
 */
export function syncThemeColorMeta(meta: { content: string } | null, readSurfaceColor: () => string): void {
  if (!meta) return;
  const color = readSurfaceColor().trim();
  if (color && meta.content !== color) meta.content = color;
}
