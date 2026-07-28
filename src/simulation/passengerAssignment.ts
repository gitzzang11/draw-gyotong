export interface OdPassengerGroup {
  originStationId: string;
  destinationStationId: string;
  people: number;
  activeDemand: number;
}

export function mergeOdPassengerGroup<T extends OdPassengerGroup>(groups: Map<string, T>, next: T) {
  const key = `${next.originStationId}:${next.destinationStationId}`;
  const existing = groups.get(key);
  if (!existing) {
    groups.set(key, next);
    return next;
  }
  existing.people += next.people;
  existing.activeDemand += next.activeDemand;
  return existing;
}

export function mergeOdPassengerGroups<T extends OdPassengerGroup>(groups: readonly T[]) {
  const merged = new Map<string, T>();
  for (const group of groups) mergeOdPassengerGroup(merged, { ...group });
  return [...merged.values()];
}
