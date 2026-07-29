export interface SaveSlotRecord {
  meta?: {
    slotId?: string;
    updatedAt?: number;
  };
}

export interface IndexedDbRepositoryOptions<T extends SaveSlotRecord> {
  databaseName: string;
  version: number;
  storeName: string;
  keyPath: string;
  migrate: (value: unknown) => T;
  fallback: {
    readAll: () => T[];
    write: (value: T) => void;
  };
}
