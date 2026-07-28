export function serializeFiniteState(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "number" && !Number.isFinite(item)) return 0;
    return item;
  });
}

export function deserializeState<T>(serialized: string): T {
  return JSON.parse(serialized) as T;
}
