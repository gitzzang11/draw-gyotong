# Game sound sources

Generated locally on 2026-10-07 using Agent Audio, Stable Audio 3 Medium (TFLite).
These are generated source files, not recorded or externally downloaded samples.
No music or voices were requested. Raw stereo files are retained here; only the
short mono files in `public/audio` ship with the game.

Run `python scripts/prepare-sound-effects.py` to reproduce the trimmed samples.
It joins useful transients, fades cut boundaries, and normalizes with a 0.8 peak
ceiling. Sample rate is 44.1 kHz, 16-bit PCM. Playback gain and pitch variants live
in `src/audio/soundFeedback.ts`.

| Source | Prompt direction | Final event |
| --- | --- | --- |
| ui-click.wav | Single dry mechanical button click, soft tick, muted wooden body | Buttons, selections, cancel, management mode |
| plan-pencil.wav | Quick graphite stroke across drafting paper and a light pencil tap | Planning and planning mode |
| build-rail.wav | Dry tool taps seating rail, muted thud, metallic settling tick | Construction, confirm, construction mode |
| demolish-debris.wav | Controlled low impact, small stone crunch, settling metal clink | Demolition and planned asset removal |

Verification checks signal energy, sample format, duration, clipping, asset loading
and actual Web Audio playback triggers. This does not constitute subjective listening review.
