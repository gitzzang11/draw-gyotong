export interface KeyedEntity {
  id: string;
}

export class EntityRenderer<T extends KeyedEntity, R> {
  private readonly rendered = new Map<string, R>();

  constructor(private readonly adapter: {
    create: (entity: T) => R;
    update: (rendered: R, entity: T) => void;
    remove: (rendered: R) => void;
  }) {}

  render(entities: readonly T[]) {
    const visible = new Set<string>();
    for (const entity of entities) {
      visible.add(entity.id);
      const rendered = this.rendered.get(entity.id);
      if (rendered) this.adapter.update(rendered, entity);
      else this.rendered.set(entity.id, this.adapter.create(entity));
    }
    for (const [id, rendered] of this.rendered) {
      if (visible.has(id)) continue;
      this.adapter.remove(rendered);
      this.rendered.delete(id);
    }
  }

  clear() {
    for (const rendered of this.rendered.values()) this.adapter.remove(rendered);
    this.rendered.clear();
  }

  get size() {
    return this.rendered.size;
  }
}
