export interface BootstrapSteps {
  createShell(): void | Promise<void>;
  initializeStorage(): void | Promise<void>;
  loadSettings(): void | Promise<void>;
  loadState(): void | Promise<void>;
  initializeMap(): void | Promise<void>;
  initializeUi(): void | Promise<void>;
  initializeScheduler(): void | Promise<void>;
  initializeLoop(): void | Promise<void>;
  initialReconcile(): void | Promise<void>;
  connectAutosave(): void | Promise<void>;
  startLoop(): void | Promise<void>;
}

export class BootstrapController {
  private initializing: Promise<boolean> | null = null;
  private initialized = false;

  constructor(private readonly steps: BootstrapSteps) {}

  initialize(): Promise<boolean> {
    if (this.initialized) return Promise.resolve(false);
    if (this.initializing) return this.initializing;
    this.initializing = this.run();
    return this.initializing;
  }

  private async run(): Promise<boolean> {
    try {
      await this.steps.createShell();
      await this.steps.initializeStorage();
      await this.steps.loadSettings();
      await this.steps.loadState();
      await this.steps.initializeMap();
      await this.steps.initializeUi();
      await this.steps.initializeScheduler();
      await this.steps.initializeLoop();
      await this.steps.initialReconcile();
      await this.steps.connectAutosave();
      await this.steps.startLoop();
      this.initialized = true;
      return true;
    } finally {
      this.initializing = null;
    }
  }
}

