export interface ListenerRegistration {
  key: string;
  scope: string;
  type: string;
  target: EventTarget;
}

export class ListenerRegistry {
  private readonly registrations = new Map<string, ListenerRegistration & { cleanup: () => void }>();

  add<K extends keyof GlobalEventHandlersEventMap>(
    key: string,
    target: EventTarget,
    type: K,
    handler: (event: GlobalEventHandlersEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
    scope = "global",
  ) {
    if (this.registrations.has(key)) return false;
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.registrations.set(key, {
      key,
      scope,
      type,
      target,
      cleanup: () => target.removeEventListener(type, listener, options),
    });
    return true;
  }

  remove(key: string) {
    this.registrations.get(key)?.cleanup();
    return this.registrations.delete(key);
  }

  clearScope(scope: string) {
    for (const [key, registration] of this.registrations) {
      if (registration.scope === scope) this.remove(key);
    }
  }

  dispose() {
    for (const registration of this.registrations.values()) registration.cleanup();
    this.registrations.clear();
  }

  snapshot(): ListenerRegistration[] {
    return [...this.registrations.values()].map(({ cleanup: _cleanup, ...registration }) => registration);
  }

  get size() {
    return this.registrations.size;
  }
}
