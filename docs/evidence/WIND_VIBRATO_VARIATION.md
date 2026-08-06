# Seeded Wind Vibrato Variation Evidence

Date: 2026-08-06. Bead: `jcpe-dsp-vibrato-variation-zhif`.

The gesture-aware flute and clarinet entry points select one of eight bounded,
deterministic vibrato performances. The legacy exports remain the no-slot path.
The slot is `deterministicSeedUint32 % 8`, so cache cardinality grows by at
most eight rather than by event count.

At MIDI 72, velocity 96, 48 kHz, one-second renders, an independent 8192-frame
WASM analyzer window starting at 0.5 seconds measured:

| Model | cents range | centroid / legacy range | harmonic concentration / legacy range |
|---|---:|---:|---:|
| flute | +0.905 to +1.594 | 0.939 to 1.194 | 0.989 to 1.005 |
| clarinet | +0.726 to +0.745 | 1.000 to 1.004 | 0.9999 to 1.0000 |

Every slot therefore remained inside the authored 8-cent regression bound,
above 75% of legacy tonal concentration, and inside 0.75x..1.25x legacy
centroid. These are preservation checks around an independently tested model,
not a claim that the production output supplied its own realism target.

Twenty-one local batches were timed; the median batch is informational only
and never affects musical output:

| Model | 8 cold one-second renders | 16 cold one-second renders |
|---|---:|---:|
| flute | 11.649 ms | 21.070 ms |
| clarinet | 9.017 ms | 17.617 ms |

The 16-render comparison repeats the eight reviewed parameter slots and
measures the render-count cost a 16-slot cache would incur; it does not pretend
that sixteen distinct parameter sets were authored. Eight was frozen because
it supplies eight phases and independently permuted rate/depth/onset changes
while halving worst-case cold work relative to sixteen.

Verification receipts:

- Rust unit tests: 20 passed, 0 failed, including exact slot bounds and invalid
  slot refusal.
- Bun focused suite: 36 passed, 0 failed, 320 assertions across independent
  register tuning, waveguide laws, ABI alignment, production cache binding, and
  seeded variation.
- Additional ABI/analysis/recipe suite: 8 passed, 0 failed, 423 assertions.
- Full non-browser Bun suite: 3,459 passed, 0 failed, 566,585 assertions across
  309 files in 940.70 seconds.
- The 65-event seed sweep produced 8 renders and 57 cache hits; the unrelated
  guitar gesture sweep remained 4 renders and 12 hits.
- Same-slot rerender was byte-identical; different slots differed.
- `bun scripts/build-dsp.ts --check` passed at 42,184 bytes, SHA-256
  `e735006c2a89168683086c08711ee226d2416a9a2390587cc474f845978bee99`.
- `bun run typecheck` and `bun run lint` passed; lint inspected 190 files with
  zero findings.
- Guarded build passed at 7,681,251 bytes, SHA-256
  `dd8d396f858a6d6fc99e2aec9f3a16d93d9c6782218b2312fc7d23eead36ddc4`;
  root and `dist/index.html` were byte-identical.

The failed remote Cargo attempts are not counted as evidence: RCH build
`29964935379288098` exited 1 after returning only sync progress. The terminal
Rust result above came from the pinned rustup Cargo binary with the repository's
shared `/data/tmp/cargo-target` target.
