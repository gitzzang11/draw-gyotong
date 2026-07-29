import type { IndexedDbRepositoryOptions, SaveSlotRecord } from "./storageTypes";

export class IndexedDbRepository<T extends SaveSlotRecord> {
  constructor(private readonly options: IndexedDbRepositoryOptions<T>) {}

  async put(value: T) {
    const migrated = this.options.migrate(value);
    let fallbackError: unknown;
    let indexedDbError: unknown;
    try {
      this.options.fallback.write(migrated);
    } catch (error) {
      fallbackError = error;
    }
    try {
      await this.withStore("readwrite", (store) => requestResult(store.put(migrated)));
    } catch (error) {
      indexedDbError = error;
    }
    if (fallbackError && indexedDbError) {
      throw new AggregateError([fallbackError, indexedDbError], "Both local backup and IndexedDB save failed");
    }
  }

  async get(slotId: string): Promise<T | null> {
    try {
      const value = await this.withStore("readonly", (store) => requestResult(store.get(slotId)));
      if (value) return this.options.migrate(value);
    } catch {
      // Fall through to the local backup.
    }
    return this.options.fallback.readAll().find((item) => item.meta?.slotId === slotId) ?? null;
  }

  async getAll(): Promise<T[]> {
    let indexedValues: T[] = [];
    try {
      const values = await this.withStore("readonly", (store) => requestResult(store.getAll()));
      indexedValues = (values as unknown[]).map(this.options.migrate);
    } catch {
      indexedValues = [];
    }
    const valuesById = new Map<string, T>();
    for (const value of [...indexedValues, ...this.options.fallback.readAll()]) {
      const slotId = value.meta?.slotId;
      if (!slotId) continue;
      const current = valuesById.get(slotId);
      if (!current || (value.meta?.updatedAt ?? 0) >= (current.meta?.updatedAt ?? 0)) valuesById.set(slotId, value);
    }
    return [...valuesById.values()];
  }

  async delete(slotId: string) {
    await this.withStore("readwrite", (store) => requestResult(store.delete(slotId)));
  }

  private async withStore<R>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<R>): Promise<R> {
    const db = await this.open();
    try {
      const transaction = db.transaction(this.options.storeName, mode);
      const completion = transactionDone(transaction);
      const operationResult = await operation(transaction.objectStore(this.options.storeName));
      await completion;
      return operationResult;
    } finally {
      db.close();
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.databaseName, this.options.version);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.options.storeName)) {
          request.result.createObjectStore(this.options.storeName, { keyPath: this.options.keyPath });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
    });
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}
