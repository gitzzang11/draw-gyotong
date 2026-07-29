import type { IndexedDbRepositoryOptions, SaveSlotRecord } from "./storageTypes";

export class IndexedDbRepository<T extends SaveSlotRecord> {
  constructor(private readonly options: IndexedDbRepositoryOptions<T>) {}

  async put(value: T) {
    const migrated = this.options.migrate(value);
    const fallbackSnapshot = this.safeFallbackSnapshot();
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
      this.restoreFallback(fallbackSnapshot);
      throw new AggregateError([fallbackError, indexedDbError], "Both local backup and IndexedDB save failed");
    }
  }

  async get(slotId: string): Promise<T | null> {
    let indexedValue: T | null = null;
    try {
      const value = await this.withStore("readonly", (store) => requestResult(store.get(slotId)));
      if (value) indexedValue = this.options.migrate(value);
    } catch {
      // Fall through to the local backup.
    }
    const fallbackValue = this.readFallback().find((item) => item.meta?.slotId === slotId) ?? null;
    if (!indexedValue) return fallbackValue;
    if (!fallbackValue) return indexedValue;
    return (fallbackValue.meta?.updatedAt ?? 0) >= (indexedValue.meta?.updatedAt ?? 0)
      ? fallbackValue
      : indexedValue;
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
    for (const value of [...indexedValues, ...this.readFallback()]) {
      const slotId = value.meta?.slotId;
      if (!slotId) continue;
      const current = valuesById.get(slotId);
      if (!current || (value.meta?.updatedAt ?? 0) >= (current.meta?.updatedAt ?? 0)) valuesById.set(slotId, value);
    }
    return [...valuesById.values()];
  }

  async delete(slotId: string) {
    const fallbackSnapshot = this.safeFallbackSnapshot();
    try {
      this.options.fallback.remove(slotId);
      await this.withStore("readwrite", (store) => requestResult(store.delete(slotId)));
    } catch (error) {
      this.restoreFallback(fallbackSnapshot);
      throw error;
    }
  }

  private async withStore<R>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<R>): Promise<R> {
    const db = await this.open();
    try {
      const transaction = db.transaction(this.options.storeName, mode);
      const completion = transactionDone(transaction);
      try {
        const operationResult = await operation(transaction.objectStore(this.options.storeName));
        await completion;
        return operationResult;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const factory = this.options.indexedDb ?? globalThis.indexedDB;
      if (!factory) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = factory.open(this.options.databaseName, this.options.version);
      let settled = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.options.storeName)) {
          request.result.createObjectStore(this.options.storeName, { keyPath: this.options.keyPath });
        }
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        resolve(request.result);
      };
      request.onerror = () => {
        settled = true;
        reject(request.error ?? new Error("IndexedDB open failed"));
      };
      request.onblocked = () => {
        settled = true;
        reject(new Error("IndexedDB upgrade is blocked by another tab"));
      };
    });
  }

  private readFallback() {
    try {
      return this.options.fallback.readAll().map(this.options.migrate);
    } catch {
      return [];
    }
  }

  private safeFallbackSnapshot() {
    try {
      return this.options.fallback.readAll();
    } catch {
      return null;
    }
  }

  private restoreFallback(snapshot: T[] | null) {
    if (!snapshot) return;
    try {
      this.options.fallback.replaceAll(snapshot);
    } catch {
      // Preserve the original storage error; recovery is best-effort.
    }
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
