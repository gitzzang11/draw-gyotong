export class ListenerRegistry {
  private readonly cleanups = new Map<string, () => void>();

  add<K extends keyof GlobalEventHandlersEventMap>(
    key: string,
    target: EventTarget,
    type: K,
    handler: (event: GlobalEventHandlersEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ) {
    if (this.cleanups.has(key)) return false;
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.cleanups.set(key, () => target.removeEventListener(type, listener, options));
    return true;
  }

  remove(key: string) {
    this.cleanups.get(key)?.();
    return this.cleanups.delete(key);
  }

  dispose() {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }

  get size() {
    return this.cleanups.size;
  }
}
