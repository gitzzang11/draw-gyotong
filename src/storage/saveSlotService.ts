import type { SaveSlotRecord } from "./storageTypes";
import { IndexedDbRepository } from "./indexedDbRepository";

export class SaveSlotService<T extends SaveSlotRecord> {
  constructor(private readonly repository: IndexedDbRepository<T>) {}

  save(value: T) {
    return this.repository.put(value);
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
    const copy = transform(source);
    await this.save(copy);
    return copy;
  }
}
