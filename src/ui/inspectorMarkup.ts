/**
 * Inspector(안내판 패널) 마크업 조각.
 * 기준: docs/design/DESIGN_SYSTEM.md §7, §12. 모든 문자열은 여기서 이스케이프한다.
 */

export type InspectorTone = "ok" | "caution" | "danger" | "up" | "down";

export interface InspectorMetric {
  label: string;
  value: string;
  tone?: InspectorTone;
}

export interface InspectorRoute {
  name: string;
  color: string;
  status?: string;
}

export type InspectorStatus = "operational" | "building" | "planned" | "paused" | "error";

const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character]);
}

/** 노선 기호에 쓸 짧은 표기: 앞자리 숫자(최대 3자), 없으면 앞 두 글자. */
export function lineMarkLabel(name: string) {
  const trimmed = name.trim();
  const digits = trimmed.match(/^\d{1,3}/);
  if (digits) return digits[0];
  return Array.from(trimmed.replace(/\s+/g, "")).slice(0, 2).join("") || "?";
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const match = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const digits = match[1].length === 3 ? Array.from(match[1]).map((digit) => digit + digit).join("") : match[1];
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const darkInkLuminance = luminance("#15171A") ?? 0;

/** 노선 색 위 글자로 흰색과 먹색 중 대비가 큰 쪽을 고른다. */
export function prefersDarkText(color: string) {
  const background = luminance(color);
  if (background === null) return false;
  const withWhite = 1.05 / (background + 0.05);
  const withDark = (background + 0.05) / (darkInkLuminance + 0.05);
  return withDark > withWhite;
}

/** CSS 값으로 안전한 색만 통과시킨다. */
export function safeColor(color: string) {
  return /^#[0-9a-f]{3,8}$/i.test(color.trim()) ? color.trim() : "#6B7076";
}

export function lineMarkHtml(route: Pick<InspectorRoute, "name" | "color">, size: "sm" | "md" | "lg" = "md") {
  const color = safeColor(route.color);
  const classes = ["dg-line-mark"];
  if (size !== "md") classes.push(`dg-line-mark--${size}`);
  if (prefersDarkText(color)) classes.push("dg-line-mark--on-dark");
  return `<span class="${classes.join(" ")}" style="--line-color:${color}" aria-hidden="true">${escapeHtml(lineMarkLabel(route.name))}</span>`;
}

const statusTags: Record<InspectorStatus, { className: string; icon: string }> = {
  operational: { className: "dg-tag--ok", icon: "●" },
  building: { className: "dg-tag--build", icon: "" },
  planned: { className: "dg-tag--plan", icon: "◌" },
  paused: { className: "dg-tag--paused", icon: "‖" },
  error: { className: "dg-tag--error", icon: "✕" },
};

export function statusTagHtml(status: InspectorStatus, label: string) {
  const tag = statusTags[status];
  return `<span class="dg-tag ${tag.className}"><i class="dg-tag__icon" aria-hidden="true">${tag.icon}</i>${escapeHtml(label)}</span>`;
}

const toneClasses: Record<InspectorTone, string> = {
  ok: "dg-row__value--ok",
  up: "dg-row__value--ok",
  caution: "dg-row__value--caution",
  danger: "dg-row__value--danger",
  down: "dg-row__value--danger",
};
const toneMarks: Partial<Record<InspectorTone, string>> = { up: "▲ ", down: "▼ ", danger: "✕ ", caution: "△ " };

export function metricRowsHtml(metrics: InspectorMetric[]) {
  return metrics.map((metric) => {
    const tone = metric.tone ? ` ${toneClasses[metric.tone]}` : "";
    const mark = metric.tone ? toneMarks[metric.tone] ?? "" : "";
    return `<div class="dg-row"><span class="dg-row__label">${escapeHtml(metric.label)}</span><span class="dg-row__value${tone}">${mark}${escapeHtml(metric.value)}</span></div>`;
  }).join("");
}

export function routeRowsHtml(routes: InspectorRoute[], emptyText: string) {
  if (routes.length === 0) return `<p class="game-inspector__note">${escapeHtml(emptyText)}</p>`;
  return routes.map((route) => `<div class="dg-row"><span class="dg-row__label game-inspector__route">${lineMarkHtml(route, "sm")}${escapeHtml(route.name)}</span>${route.status ? `<span class="dg-row__value game-inspector__muted">${escapeHtml(route.status)}</span>` : ""}</div>`).join("");
}

export function sectionHtml(label: string, body: string, meta = "") {
  return `<section class="dg-panel__section"><h3 class="dg-panel__section-label">${escapeHtml(label)}${meta ? `<span class="game-inspector__section-meta">${escapeHtml(meta)}</span>` : ""}</h3>${body}</section>`;
}
