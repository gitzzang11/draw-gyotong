"""Trim generated Stable Audio sources into small, mono, faded game cues."""
import array
import json
import math
from pathlib import Path
import wave

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/audio-source"
OUTPUT = ROOT / "public/audio"
REGIONS = {
    "ui-click": [(0, 0.16)],
    "plan-pencil": [(1.65, 2.17)],
    "build-rail": [(0, 0.17), (1.84, 2.05)],
    "demolish-debris": [(0, 0.65)],
}


def prepare(name, regions):
    with wave.open(str(SOURCE / f"{name}.wav"), "rb") as source:
        rate, channels = source.getframerate(), source.getnchannels()
        assert source.getsampwidth() == 2
        pcm = array.array("h", source.readframes(source.getnframes()))
    mono = [sum(pcm[i:i + channels]) / channels / 32768 for i in range(0, len(pcm), channels)]
    clip = []
    for index, (begin, end) in enumerate(regions):
        part = mono[round(begin * rate):round(end * rate)]
        fade_in, fade_out = round(0.002 * rate), round(0.018 * rate)
        for i in range(len(part)):
            part[i] *= min(1, i / fade_in, (len(part) - 1 - i) / fade_out)
        if index:
            clip.extend([0] * round(0.035 * rate))
        clip.extend(part)
    rms = math.sqrt(sum(x * x for x in clip) / len(clip))
    peak = max(map(abs, clip))
    assert rms > 0.0001 and all(math.isfinite(x) for x in clip)
    scale = min(0.075 / rms, 0.8 / peak)
    output = array.array("h", (round(x * scale * 32767) for x in clip))
    with wave.open(str(OUTPUT / f"{name}.wav"), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(output.tobytes())
    return {"asset": name, "seconds": round(len(clip) / rate, 3), "sampleRate": rate,
            "channels": 1, "peak": round(peak * scale, 4), "rms": round(rms * scale, 4)}


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    print(json.dumps([prepare(name, regions) for name, regions in REGIONS.items()], indent=2))
