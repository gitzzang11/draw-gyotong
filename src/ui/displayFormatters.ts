export function formatCost(cost: number): string {
  if (cost <= 0) return "0억";
  return `${Math.round(cost).toLocaleString("ko-KR")}억`;
}

export function formatSignedCost(cost: number): string {
  const rounded = Math.round(cost);
  if (rounded < 0) return `-${Math.abs(rounded).toLocaleString("ko-KR")}억`;
  return formatCost(rounded);
}

export function formatPlayTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

export function formatDate(timestamp: number, includeTime = false): string {
  return new Intl.DateTimeFormat("ko-KR", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(timestamp);
}
