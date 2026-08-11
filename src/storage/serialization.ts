type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue =
  | SerializablePrimitive
  | SerializableValue[]
  | { [key: string]: SerializableValue };

const OMIT = Symbol("omit-from-save");

export function toSaveData<T>(value: T): T {
  const seen = new WeakSet<object>();
  const converted = convertValue(value, seen);
  if (converted === OMIT) throw new TypeError("The root game state is not serializable");
  return converted as T;
}

export function fromSaveData<T>(value: unknown): T {
  return reviveValue(toSaveData(value) as SerializableValue) as T;
}

export function captureGameState<T>(
  schemaVersion: number,
  meta: unknown,
  routes: unknown,
  stations: unknown,
  transfers: unknown,
  depots: unknown,
  plans: unknown,
  diagramState: unknown,
  analysisState: unknown,
  statisticsState: unknown,
  constructionProjects: unknown,
  newsEvents: unknown,
  trainFleets: unknown,
  operatingServices: unknown,
  expressConfigs: unknown,
  passengerGroups: unknown,
  loans: unknown,
  economy: unknown,
  demandZones: unknown,
  stationDemandStates: unknown,
): T {
  return toSaveData({
    schemaVersion,
    meta,
    routes,
    stations,
    transfers,
    depots,
    plans,
    diagramState,
    analysisState,
    statisticsState,
    constructionProjects,
    newsEvents,
    trainFleets,
    operatingServices,
    expressConfigs,
    passengerGroups,
    loans,
    economy,
    demandZones,
    stationDemandStates,
  }) as T;
}

export function serializeFiniteState(value: unknown): string {
  return JSON.stringify(toSaveData(value));
}

export function deserializeState<T>(serialized: string): T {
  return fromSaveData<T>(JSON.parse(serialized));
}

function convertValue(value: unknown, seen: WeakSet<object>): SerializableValue | typeof OMIT {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return OMIT;
  if (isDomObject(value) || isLeafletObject(value)) return OMIT;
  if (seen.has(value)) return OMIT;
  seen.add(value);
  try {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Set) {
      return { __storageType: "Set", values: Array.from(value, (item) => convertValue(item, seen)).filter(notOmitted) };
    }
    if (value instanceof Map) {
      return {
        __storageType: "Map",
        entries: Array.from(value, ([key, item]) => [convertValue(key, seen), convertValue(item, seen)])
          .filter((entry): entry is [SerializableValue, SerializableValue] => entry[0] !== OMIT && entry[1] !== OMIT),
      };
    }
    if (Array.isArray(value)) return value.map((item) => convertValue(item, seen)).filter(notOmitted);
    const output: Record<string, SerializableValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const converted = convertValue(item, seen);
      if (converted !== OMIT) output[key] = converted;
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function notOmitted(value: SerializableValue | typeof OMIT): value is SerializableValue {
  return value !== OMIT;
}

function reviveValue(value: SerializableValue): unknown {
  if (Array.isArray(value)) return value.map(reviveValue);
  if (value === null || typeof value !== "object") return value;
  if (value.__storageType === "Set" && Array.isArray(value.values)) {
    return new Set(value.values.map(reviveValue));
  }
  if (value.__storageType === "Map" && Array.isArray(value.entries)) {
    return new Map(
      value.entries
        .filter((entry): entry is SerializableValue[] => Array.isArray(entry) && entry.length === 2)
        .map((entry) => [reviveValue(entry[0]), reviveValue(entry[1])]),
    );
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveValue(item)]));
}

function isDomObject(value: object) {
  return typeof Node !== "undefined" && value instanceof Node;
}

function isLeafletObject(value: object) {
  const candidate = value as Record<string, unknown>;
  return typeof candidate.on === "function"
    && typeof candidate.off === "function"
    && ("_leaflet_id" in candidate || "_map" in candidate || "_events" in candidate);
}
