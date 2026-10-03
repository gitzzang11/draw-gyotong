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
  currentSlotId?(): string | undefined;
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
  private readonly slotWrites = new Map<string, Promise<void>>();
  private readonly deletedSlots = new Set<string>();
  private readonly slotGenerations = new Map<string, number>();

  constructor(private readonly options: SaveFacadeOptions<T>) {
    this.repository = new SaveRepository({
      capture: options.capture,
      write: async (state) => {
        await this.update(state);
      },
      delayMs: options.delayMs,
      onError: options.onError,
    });
  }

  request(): void {
    if (this.currentSlotDeleted()) return;
    this.options.prepareForScheduledSave?.();
    this.repository.request();
  }

  requestImmediate(): void {
    if (this.currentSlotDeleted()) return;
    this.options.prepareForScheduledSave?.();
    this.repository.requestImmediate();
  }

  flush(): Promise<void> {
    if (this.currentSlotDeleted()) return Promise.reject(new Error("삭제 중이거나 삭제된 세이브에는 저장할 수 없습니다."));
    return this.repository.flush();
  }

  cancel(): void {
    this.repository.cancel();
  }

  create(value: T): Promise<T> {
    const slotId = this.slotId(value);
    const generation = this.slotGenerations.get(slotId) ?? 0;
    return this.enqueue(slotId, async () => {
      const result = await this.options.service().create(value);
      if (generation === (this.slotGenerations.get(slotId) ?? 0)) this.deletedSlots.delete(slotId);
      return result;
    });
  }

  update(value: T): Promise<T> {
    const slotId = this.slotId(value);
    if (this.deletedSlots.has(slotId)) return Promise.reject(new Error("삭제 중이거나 삭제된 세이브에는 저장할 수 없습니다."));
    return this.enqueue(slotId, async () => {
      if (this.deletedSlots.has(slotId)) throw new Error("삭제 중이거나 삭제된 세이브에는 저장할 수 없습니다.");
      return this.options.service().update(value);
    });
  }

  async load(slotId: string): Promise<T | null> {
    if (this.deletedSlots.has(slotId)) return null;
    const value = await this.options.service().load(slotId);
    return this.deletedSlots.has(slotId) ? null : value;
  }

  async list(): Promise<T[]> {
    return (await this.options.service().list()).filter((value) => !this.deletedSlots.has(this.slotId(value)));
  }

  remove(slotId: string): Promise<void> {
    const alreadyDeleted = this.deletedSlots.has(slotId);
    const generation = (this.slotGenerations.get(slotId) ?? 0) + 1;
    this.slotGenerations.set(slotId, generation);
    this.deletedSlots.add(slotId);
    if (this.currentSlotId() === slotId) this.repository.cancel();
    return this.enqueue(slotId, () => this.options.service().remove(slotId)).catch((error) => {
      if (!alreadyDeleted && this.slotGenerations.get(slotId) === generation) this.deletedSlots.delete(slotId);
      throw error;
    });
  }

  private slotId(value: T): string {
    const slotId = value.meta?.slotId;
    if (!slotId) throw new Error("Save slot metadata is missing");
    return slotId;
  }

  private currentSlotDeleted(): boolean {
    if (this.deletedSlots.size === 0) return false;
    const slotId = this.currentSlotId();
    return Boolean(slotId && this.deletedSlots.has(slotId));
  }

  private currentSlotId(): string | undefined {
    return this.options.currentSlotId ? this.options.currentSlotId() : this.options.capture().meta?.slotId;
  }

  private enqueue<R>(slotId: string, operation: () => Promise<R>): Promise<R> {
    const result = (this.slotWrites.get(slotId) ?? Promise.resolve()).then(operation);
    // A failed write must not prevent the following delete or retry.
    const settled = result.then(() => undefined, () => undefined);
    this.slotWrites.set(slotId, settled);
    void settled.then(() => { if (this.slotWrites.get(slotId) === settled) this.slotWrites.delete(slotId); });
    return result;
  }
}
