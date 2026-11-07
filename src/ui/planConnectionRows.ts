import type { BlueprintStatus } from "../routeBlueprints";
import { escapeHtml } from "./inspectorMarkup";

export function planConnectionRowsHtml(rows: readonly { id: string; title: string; status: BlueprintStatus; cost: string }[]) {
  const statuses: Record<BlueprintStatus, string> = {
    draft: "미착공", approved: "미착공", scheduled: "공사 예정", "under-construction": "공사 중",
    completed: "완공", cancelled: "취소", failed: "실패",
  };
  return rows.map((row) => {
    const title = escapeHtml(row.title);
    const canDelete = row.status === "draft" || row.status === "approved";
    return `<div class="game-plan-asset" data-asset-kind="connection"><div class="game-plan-asset__main"><span class="game-plan-asset__icon" aria-hidden="true">↔</span><span class="game-route-item__text"><strong>${title}</strong><small>연결 설계 · ${statuses[row.status]} · ${escapeHtml(row.cost)}</small></span></div>${canDelete ? `<div class="game-plan-asset__actions"><button class="dg-btn dg-btn--danger-quiet dg-btn--compact" type="button" data-plan-action="delete-connection" data-asset-id="${escapeHtml(row.id)}" aria-label="${title} 삭제">삭제</button></div>` : ""}</div>`;
  }).join("");
}
