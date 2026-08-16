import type {
  IndexedDbRepositoryOptions,
  LocalStorageFallbackOptions,
  SaveFallbackStore,
  SaveSlotRecord,
  SaveSlotRepository,
} from "./storageTypes";
import { IndexedDbRepository } from "./indexedDbRepository";
import { deserializeState, serializeFiniteState, toSaveData } from "./serialization";

export class SaveSlotService<T extends SaveSlotRecord> {
  constructor(private readonly repository: SaveSlotRepository<T>) {}

  private write(value: T) {
    return this.repository.put(toSaveData(value));
  }

  async update(value: T) {
    const slotId = requireSlotId(value);
    if (!await this.load(slotId)) throw new Error(`Save slot '${slotId}' does not exist`);
    await this.write(value);
    return value;
  }

  async create(value: T) {
    const slotId = requireSlotId(value);
    if (await this.load(slotId)) throw new Error(`Save slot '${slotId}' already exists`);
    await this.write(value);
    return value;
  }

  load(slotId: string) {
    return this.repository.get(slotId);
  }

  list() {
    return this.repository.getAll();
  }

  remove(slotId: string) {
    return this.repository.delete(slotId);
  }

  async duplicate(slotId: string, transform: (source: T) => T) {
    const source = await this.load(slotId);
    if (!source) throw new Error(`Save slot '${slotId}' does not exist`);
    const copy = toSaveData(transform(toSaveData(source)));
    const copyId = requireSlotId(copy);
    if (copyId === slotId) throw new Error("A duplicated save must use a new slot id");
    if (await this.load(copyId)) throw new Error(`Save slot '${copyId}' already exists`);
    const sourceName = source.meta?.slotName?.trim();
    const copyName = copy.meta?.slotName?.trim();
    if (copy.meta && (!copyName || copyName === sourceName)) {
      copy.meta.slotName = `${sourceName || "Save"} 복사본`;
    }
    await this.create(copy);
    return copy;
  }
}

export function createSaveSlotService<T extends SaveSlotRecord>(
  repositoryOptions: Omit<IndexedDbRepositoryOptions<T>, "fallback">,
  fallbackOptions: LocalStorageFallbackOptions<T>,
) {
  return new SaveSlotService(new IndexedDbRepository({
    ...repositoryOptions,
    fallback: createLocalStorageFallback(fallbackOptions),
  }));
}

export function createLocalStorageFallback<T extends SaveSlotRecord>(
  options: LocalStorageFallbackOptions<T>,
): SaveFallbackStore<T> {
  const maxEntries = Math.max(1, options.maxEntries ?? 2);
  const readAll = () => {
    try {
      const raw = options.storage.getItem(options.key);
      if (!raw) return [];
      const values = deserializeState<unknown>(raw);
      return Array.isArray(values)
        ? values.filter((value) => value && typeof value === "object").map(options.migrate)
        : [];
    } catch {
      return [];
    }
  };
  const replaceAll = (values: T[]) => {
    if (values.length === 0) options.storage.removeItem(options.key);
    else options.storage.setItem(options.key, serializeFiniteState(values.slice(0, maxEntries)));
  };
  return {
    readAll,
    replaceAll,
    write(value) {
      const slotId = requireSlotId(value);
      replaceAll([value, ...readAll().filter((item) => item.meta?.slotId !== slotId)]);
    },
    remove(slotId) {
      replaceAll(readAll().filter((item) => item.meta?.slotId !== slotId));
    },
  };
}

export class LocalRecoveryStore<T> {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    private readonly stateKey: string,
    private readonly legacyRoutesKey: string,
    private readonly migrate: (value: unknown) => T,
  ) {}

  write(value: T) {
    const serialized = serializeFiniteState(value);
    this.storage.setItem(this.stateKey, serialized);
  }

  read(): T | null {
    const serialized = this.storage.getItem(this.stateKey);
    if (!serialized) return null;
    return this.migrate(deserializeState(serialized));
  }

  readLegacyRoutes<R>(): R[] {
    const serialized = this.storage.getItem(this.legacyRoutesKey);
    if (!serialized) return [];
    const parsed = deserializeState<unknown>(serialized);
    return Array.isArray(parsed) ? parsed as R[] : [];
  }

  clear() {
    this.storage.removeItem(this.stateKey);
    this.storage.removeItem(this.legacyRoutesKey);
  }
}

function requireSlotId(value: SaveSlotRecord) {
  const slotId = value.meta?.slotId;
  if (!slotId) throw new Error("Save slot metadata is missing");
  return slotId;
}
