export interface SaveSlotRecord {
  meta?: {
    slotId?: string;
    slotName?: string;
    updatedAt?: number;
    createdAt?: number;
  };
}

export interface SaveFallbackStore<T extends SaveSlotRecord> {
  readAll: () => T[];
  write: (value: T) => void;
  remove: (slotId: string) => void;
  replaceAll: (values: T[]) => void;
}

export interface SaveSlotRepository<T extends SaveSlotRecord> {
  put(value: T): Promise<void>;
  get(slotId: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  delete(slotId: string): Promise<void>;
}

export interface IndexedDbRepositoryOptions<T extends SaveSlotRecord> {
  databaseName: string;
  version: number;
  storeName: string;
  keyPath: string;
  migrate: (value: unknown) => T;
  fallback: SaveFallbackStore<T>;
  indexedDb?: IDBFactory;
}

export interface LocalStorageFallbackOptions<T extends SaveSlotRecord> {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  key: string;
  migrate: (value: unknown) => T;
  maxEntries?: number;
}
