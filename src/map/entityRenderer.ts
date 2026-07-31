export interface KeyedEntity {
  id: string;
}

export interface EntityRendererAdapter<T extends KeyedEntity, R> {
  create: (entity: T) => R;
  update: (rendered: R, entity: T, previous: T) => void;
  remove: (rendered: R, entity: T) => void;
  fingerprint?: (entity: T) => string;
  updateStyle?: (rendered: R, entity: T) => void;
  updatePosition?: (rendered: R, entity: T) => void;
  updateSelection?: (rendered: R, selected: boolean, entity: T) => void;
  updateVisibility?: (rendered: R, visible: boolean, entity: T) => void;
}

type RenderedEntry<T, R> = {
  rendered: R;
  entity: T;
  fingerprint: string;
};

export class EntityRenderer<T extends KeyedEntity, R> {
  private readonly rendered = new Map<string, RenderedEntry<T, R>>();

  constructor(private readonly adapter: EntityRendererAdapter<T, R>) {}

  createEntity(entity: T) {
    const current = this.rendered.get(entity.id);
    if (current) return current.rendered;
    const entry = {
      rendered: this.adapter.create(entity),
      entity,
      fingerprint: this.getFingerprint(entity),
    };
    this.rendered.set(entity.id, entry);
    return entry.rendered;
  }

  updateEntity(entity: T) {
    const current = this.rendered.get(entity.id);
    if (!current) return this.createEntity(entity);
    const fingerprint = this.getFingerprint(entity);
    if (fingerprint === current.fingerprint) return current.rendered;
    this.adapter.update(current.rendered, entity, current.entity);
    current.entity = entity;
    current.fingerprint = fingerprint;
    return current.rendered;
  }

  removeEntity(id: string) {
    const current = this.rendered.get(id);
    if (!current) return false;
    this.adapter.remove(current.rendered, current.entity);
    this.rendered.delete(id);
    return true;
  }

  updateStyle(id: string) {
    const current = this.rendered.get(id);
    if (!current) return;
    this.adapter.updateStyle?.(current.rendered, current.entity);
  }

  updatePosition(id: string) {
    const current = this.rendered.get(id);
    if (!current) return;
    this.adapter.updatePosition?.(current.rendered, current.entity);
  }

  updateSelection(id: string, selected: boolean) {
    const current = this.rendered.get(id);
    if (!current) return;
    this.adapter.updateSelection?.(current.rendered, selected, current.entity);
  }

  updateVisibility(id: string, visible: boolean) {
    const current = this.rendered.get(id);
    if (!current) return;
    this.adapter.updateVisibility?.(current.rendered, visible, current.entity);
  }

  reconcileEntities(entities: readonly T[]) {
    const visible = new Set<string>();
    for (const entity of entities) {
      visible.add(entity.id);
      this.updateEntity(entity);
    }
    for (const id of this.rendered.keys()) {
      if (!visible.has(id)) this.removeEntity(id);
    }
  }

  render(entities: readonly T[]) {
    this.reconcileEntities(entities);
  }

  clear() {
    for (const id of [...this.rendered.keys()]) this.removeEntity(id);
  }

  has(id: string) {
    return this.rendered.has(id);
  }

  getRendered(id: string) {
    return this.rendered.get(id)?.rendered;
  }

  get renderedIds() {
    return new Set(this.rendered.keys());
  }

  get size() {
    return this.rendered.size;
  }

  private getFingerprint(entity: T) {
    return this.adapter.fingerprint?.(entity) ?? JSON.stringify(entity);
  }
}
