import { describe, expect, it, vi } from "vitest";
import { SoundFeedback } from "../src/audio/soundFeedback";

function harness() {
  let enabled = true;
  let visible = true;
  let now = 0;
  const played: Array<{ rate: number; stopped: boolean }> = [];
  const context = {
    state: "running", currentTime: 0, destination: {},
    resume: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({ duration: 0.3 })),
    createGain: () => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
    createBufferSource: () => {
      const record = { rate: 0, stopped: false };
      return {
        buffer: null, playbackRate: { value: 0 }, onended: null,
        connect: (destination: unknown) => destination, disconnect: vi.fn(),
        start() { record.rate = this.playbackRate.value; played.push(record); },
        stop() { record.stopped = true; },
      };
    },
  };
  const createContext = vi.fn(() => context as unknown as AudioContext);
  const sound = new SoundFeedback({
    enabled: () => enabled, visible: () => visible, now: () => now,
    createContext, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as Response,
  });
  return { sound, played, context, createContext,
    mute: () => { enabled = false; sound.stop(); },
    hide: () => { visible = false; sound.stop(); },
    advance: () => { now += 100; },
  };
}

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 15; i++) await Promise.resolve();
};

describe("sound feedback", () => {
  it("creates audio only on interaction and reuses decoded samples", async () => {
    const h = harness();
    await settle();
    expect(h.createContext).not.toHaveBeenCalled();
    await h.sound.unlock();
    h.sound.play("select");
    await settle();
    h.advance();
    h.sound.play("select");
    await settle();
    expect(h.played).toHaveLength(2);
    expect(h.createContext).toHaveBeenCalledTimes(1);
    expect(h.context.decodeAudioData).toHaveBeenCalledTimes(4);
  });

  it("plays one semantic result instead of stacked click, tool and mode sounds", async () => {
    const h = harness();
    await h.sound.unlock();
    h.sound.play("select");
    h.sound.play("mode-planning");
    h.sound.play("select");
    await settle();
    expect(h.played).toHaveLength(1);
    expect(h.played[0].rate).toBe(1.2);
  });

  it("stops playing and pending sounds when muted and while backgrounded", async () => {
    const h = harness();
    await h.sound.unlock();
    h.sound.play("build");
    await settle();
    h.sound.play("demolish");
    h.mute();
    await settle();
    expect(h.played).toHaveLength(1);
    expect(h.played[0].stopped).toBe(true);
    h.sound.play("select");
    await settle();
    expect(h.played).toHaveLength(1);
    const background = harness();
    await background.sound.unlock();
    background.hide();
    background.sound.play("confirm");
    await settle();
    expect(background.played).toEqual([]);
  });

  it("coalesces capture and target handlers even with a microtask checkpoint between them", async () => {
    const h = harness();
    await h.sound.unlock();
    h.sound.play("select");
    await Promise.resolve();
    h.sound.play("mode-construction");
    await settle();
    expect(h.played).toHaveLength(1);
    expect(h.played[0].rate).toBe(1.15);
  });

  it("bounds overlapping sounds and throttles repeated same-frame selection", async () => {
    const h = harness();
    await h.sound.unlock();
    for (let i = 0; i < 10; i++) {
      h.sound.play("select");
      await settle();
    }
    expect(h.played).toHaveLength(1);
    for (let i = 0; i < 10; i++) {
      h.advance(); h.sound.play("build"); await settle();
    }
    expect(h.played.filter((s) => !s.stopped).length).toBeLessThanOrEqual(4);
  });

  it("recovers from a blocked audio context without failing the game action", async () => {
    const h = harness();
    h.context.state = "suspended";
    h.context.resume.mockRejectedValueOnce(new Error("gesture needed"));
    await expect(h.sound.unlock()).resolves.toBeUndefined();
    h.context.state = "running";
    await h.sound.unlock();
    h.sound.play("confirm");
    await settle();
    expect(h.played).toHaveLength(1);
  });
});
