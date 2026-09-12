import { SaveRepository } from "./saveRepository.ts";
import type { SaveSlotRecord } from "./storageTypes.ts";

export interface SaveSlotGateway<T extends SaveSlotRecord> {
  create(value: T): Promise<T>;
  update(value: T): Promise<T>;
  load(slotId: string): Promise<T | null>;
  list(): Promise<T[]>;
  remove(slotId: string): Promise<void>;
}

export interface SaveFacadeOptions<T extends SaveSlotRecord> {
  capture(): T;
  service(): SaveSlotGateway<T>;
  prepareForScheduledSave?(): void;
  delayMs?: number;
  onError?(error: unknown): void;
}

/**
 * Application-facing storage boundary. It keeps slot operations and debounced
 * current-session writes on one existing serialization/storage path without
 * owning runtime state or changing the save payload.
 */
export class SaveFacade<T extends SaveSlotRecord> {
  private readonly repository: SaveRepository<T>;

  constructor(private readonly options: SaveFacadeOptions<T>) {
    this.repository = new SaveRepository({
      capture: options.capture,
      write: async (state) => {
        await this.options.service().update(state);
      },
      delayMs: options.delayMs,
      onError: options.onError,
    });
  }

  request(): void {
    this.options.prepareForScheduledSave?.();
    this.repository.request();
  }

  requestImmediate(): void {
    this.options.prepareForScheduledSave?.();
    this.repository.requestImmediate();
  }

  flush(): Promise<void> {
    return this.repository.flush();
  }

  cancel(): void {
    this.repository.cancel();
  }

  create(value: T): Promise<T> {
    return this.options.service().create(value);
  }

  update(value: T): Promise<T> {
    return this.options.service().update(value);
  }

  load(slotId: string): Promise<T | null> {
    return this.options.service().load(slotId);
  }

  list(): Promise<T[]> {
    return this.options.service().list();
  }

  remove(slotId: string): Promise<void> {
    return this.options.service().remove(slotId);
  }
}
