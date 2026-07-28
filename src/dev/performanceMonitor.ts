export type PerformanceTask =
  | "network-graph"
  | "pathfinding"
  | "passenger-groups"
  | "segment-assignment"
  | "congestion"
  | "demand"
  | "map-entities"
  | "trains"
  | "hud"
  | "save-serialization"
  | "indexeddb-save";

const samples = new Map<PerformanceTask, number[]>();

export function measureTask<T>(task: PerformanceTask, operation: () => T): T {
  const start = performance.now();
  try {
    return operation();
  } finally {
    if (import.meta.env.DEV) {
      const list = samples.get(task) ?? [];
      list.push(performance.now() - start);
      if (list.length > 100) list.shift();
      samples.set(task, list);
    }
  }
}

export function getPerformanceSnapshot() {
  return Object.fromEntries([...samples].map(([task, values]) => [
    task,
    {
      calls: values.length,
      latestMs: values.at(-1) ?? 0,
      averageMs: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
      maxMs: Math.max(0, ...values),
    },
  ]));
}

export function clearPerformanceSamples() {
  samples.clear();
}
