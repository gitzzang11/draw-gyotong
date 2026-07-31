export type SnapshotSelector<T, K extends keyof T> = readonly K[];

export function captureRuntimeSlice<T extends object, K extends keyof T>(
  state: T,
  keys: SnapshotSelector<T, K>,
): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, structuredClone(state[key])])) as Pick<T, K>;
}

export function restoreRuntimeSlice<T extends object, K extends keyof T>(
  state: T,
  snapshot: Pick<T, K>,
  keys: SnapshotSelector<T, K>,
): T {
  const restored = { ...state };
  for (const key of keys) restored[key] = structuredClone(snapshot[key]) as T[K];
  return restored;
}

