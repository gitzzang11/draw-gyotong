export const soundCues = {
  select: { asset: "ui-click", gain: 0.24, rate: 1, priority: 0 },
  cancel: { asset: "ui-click", gain: 0.22, rate: 0.75, priority: 1 },
  confirm: { asset: "build-rail", gain: 0.22, rate: 1.35, priority: 3 },
  plan: { asset: "plan-pencil", gain: 0.3, rate: 1, priority: 3 },
  build: { asset: "build-rail", gain: 0.36, rate: 1, priority: 3 },
  demolish: { asset: "demolish-debris", gain: 0.32, rate: 1, priority: 3 },
  "mode-management": { asset: "ui-click", gain: 0.3, rate: 0.85, priority: 2 },
  "mode-planning": { asset: "plan-pencil", gain: 0.28, rate: 1.2, priority: 2 },
  "mode-construction": { asset: "build-rail", gain: 0.26, rate: 1.15, priority: 2 },
  error: { asset: "ui-click", gain: 0.25, rate: 0.6, priority: 4 },
} as const;

export type SoundKind = keyof typeof soundCues;
type SoundOptions = {
  enabled: () => boolean;
  visible: () => boolean;
  createContext?: () => AudioContext;
  fetch?: typeof fetch;
  now?: () => number;
};

export class SoundFeedback {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private files = new Map<string, Promise<ArrayBuffer | null>>();
  private loading: Promise<void> | null = null;
  private pending: SoundKind | null = null;
  private scheduled = false;
  private generation = 0;
  private lastPlayed = new Map<SoundKind, number>();
  private voices = new Set<AudioBufferSourceNode>();
  private readonly now: () => number;

  constructor(private readonly options: SoundOptions) {
    this.now = options.now ?? (() => performance.now());
    const fetchFile = options.fetch ?? fetch;
    for (const asset of new Set(Object.values(soundCues).map((cue) => cue.asset))) {
      const url = `${import.meta.env.BASE_URL}audio/${asset}.wav`;
      this.files.set(asset, fetchFile(url)
        .then((response) => response.ok ? response.arrayBuffer() : null)
        .catch(() => null));
    }
  }

  async unlock() {
    if (!this.options.enabled() || !this.options.visible()) return;
    try {
      this.context ??= (this.options.createContext ?? (() => new AudioContext()))();
      if (!this.output) {
        this.output = this.context.createGain();
        // Four samples at peak 0.8 and gain <= 0.36 retain mix headroom.
        this.output.gain.value = 0.75;
        this.output.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      if (!this.loading) {
        const context = this.context;
        this.loading = Promise.all([...this.files].map(async ([asset, file]) => {
          try {
            const data = await file;
            if (data) this.buffers.set(asset, await context.decodeAudioData(data));
          } catch { /* An unavailable sample must not interrupt gameplay. */ }
        })).then(() => {});
      }
      await this.loading;
    } catch { /* Some WebViews require another foreground gesture to resume. */ }
  }

  play(kind: SoundKind) {
    if (!this.options.enabled() || !this.options.visible()) return;
    if (!this.pending || soundCues[kind].priority >= soundCues[this.pending].priority) this.pending = kind;
    if (this.scheduled) return;
    this.scheduled = true;
    // Native events can run microtasks between capture and target listeners.
    // Wait until dispatch finishes so the action's cue replaces its generic click.
    setTimeout(() => {
      this.scheduled = false;
      const cue = this.pending;
      this.pending = null;
      if (cue) void this.start(cue, this.generation, this.now());
    }, 0);
  }

  stop() {
    this.generation += 1;
    this.pending = null;
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* The sample may already have ended. */ }
    }
    this.voices.clear();
  }

  private async start(kind: SoundKind, generation: number, requestedAt: number) {
    await this.unlock();
    const context = this.context;
    const cue = soundCues[kind];
    const buffer = this.buffers.get(cue.asset);
    if (!context || context.state !== "running" || !buffer || generation !== this.generation ||
        !this.options.enabled() || !this.options.visible() || this.now() - requestedAt > 200) return;
    const last = this.lastPlayed.get(kind);
    if (last !== undefined && this.now() - last < 60) return;
    try {
      while (this.voices.size >= 4) {
        const oldest = this.voices.values().next().value!;
        oldest.stop();
        this.voices.delete(oldest);
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = cue.rate;
      gain.gain.value = cue.gain;
      source.connect(gain).connect(this.output!);
      source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
      this.voices.add(source);
      this.lastPlayed.set(kind, this.now());
      source.start();
    } catch { /* Audio failures never roll back a successful game action. */ }
  }
}
