# PHS0 Independent Verification

Status: automated PHS0 acceptance passed; human listening not assessed

Date: 2026-08-06

Bead: `jcpe-mnsc.2.3`

## Capability proved

PHS0 adds a real, additive audio realization layer between the immutable
`PlaybackPlan` and X0. Production now compiles bounded, deeply immutable,
instrument-family-specific gesture curves; derives stable seeds and SHA-256
fingerprints; partitions wind phrases and coupled guitar/vibraphone stems; and
carries each gesture through X1 into X0's preparation, cache identity, and
attack path. Physical gestures change rendered PCM through their excitation
control instead of being metadata ignored by the engine.

The Rust/WASM module now also exposes a validated ABI-v2 boundary, a passive
modal primitive with exact state handoff and energy accounting, and a bounded
dynamic-reed pressure/flow solve. Those shared primitives are positive working
capabilities, but they are not yet the complete clarinet, flute, guitar,
trumpet, or vibraphone v2 models. Instrument-specific model integration belongs
to PHS2-PHS6. PHS0 therefore makes no claim that those later instruments are
finished or perceptually realistic yet.

## Independent proof

The independent packet under `tests/fixtures/physical-renderer/` owns expected
gesture, partition, ABI, mutation, provenance, trace, and baseline facts. The
production compiler does not generate those expectations.

- `bun scripts/validate-phs0-contract.ts`: pass.
- `bun test tests/conformance/phs0-production-conformance.test.ts`: pass.
  Every reviewed fixture was replayed against production validation and all 16
  semantic mutations were rejected.
- `bun test tests/unit/physical-abi.test.ts tests/unit/physical-modal.test.ts
  tests/unit/physical-nonlinear.test.ts`: pass. This covers ABI version/range/
  alignment/alias/count refusal, finite deterministic PCM, exact partition
  state, energy residuals below `1e-14`, a maximum of 8 nonlinear iterations
  plus 16 fallback bisections, physical soft/loud scaling, and limiter
  engagement.
- `bun test tests/integration/physical-audio-path.test.ts
  tests/integration/transport-instrument.test.ts`: pass. This covers production
  PCM divergence from the legacy velocity-only identity, exact prepare/attack
  cache reuse, collision-resistant gesture identity, deterministic 64-entry
  LRU behavior, and flute-stop-clarinet restart.
- `/usr/bin/time -v bun test tests/integration/physical-audio-path.test.ts`:
  3 pass, 0 fail, 15 assertions, 0.96 seconds elapsed, 206,188 KiB maximum
  process RSS. This is whole-process peak RSS for Bun plus the test harness,
  WASM, copied PCM, and engine objects; it is not presented as isolated WASM
  heap usage.

The complete Bun phase inside `bun run verify` passed 3,415 tests across 301
files with 565,693 `expect()` calls and zero failures in 940.67 seconds. The
guarded build immediately following it passed.

## Real browser and audio proof

The final browser run was
`c3259f4a-8393-4c4e-8833-d09b9b040fc1`. It used Node 24.18.0, Playwright
1.61.1, Bun 1.3.14, one worker, and zero retries. All 12 cells passed across
Chromium, Firefox, and WebKit. Each browser played flute, stopped to measured
silence, restarted as clarinet, stopped, played guitar, stopped, and retained
zero nonreleasing voices. Browser records are under
`test-results/studio-audible-evidence-runs/c3259f4a-8393-4c4e-8833-d09b9b040fc1/`.

- Harness: 8,290,189 bytes, SHA-256
  `ac0f0012e01047c58d9c5a4694932d892c3dd482e5107f14bb0d416de497d75a`.
- Input manifest digest:
  `271c0fec514cb13de0dc9dbff9c38fadea7e08e8a5c2e40f24cdab85ddebf119`.
- Chromium await-Play phases: flute 713.7 ms, clarinet 470.1 ms, guitar
  535.9 ms.
- Firefox await-Play phases: flute 1,364 ms, clarinet 937 ms, guitar 1,342 ms.
- WebKit await-Play phases: flute 1,810 ms, clarinet 1,064 ms, guitar 1,065 ms.

Those phase costs include controller preparation, setting the instrument, and
the Play transition. They are browser end-to-end evidence, not isolated cold
renderer benchmarks. Warm reuse is separately proved by the engine integration
test: prepare creates one buffer, attack creates none, and repeated prepare
reports one cache hit and zero renders.

Two red browser runs are deliberately retained:

- `42382966-7557-4efd-ba19-a0a3be4ddf7d`: 9 pass, 3 fail. WebKit PHS0 and two
  older vibraphone reference cells failed before complete failure evidence was
  preserved.
- `8d580fdd-aac8-43ce-b19a-d194fab52060`: 8 pass, 4 fail. Its journal localized
  the physical failure to the first clarinet restart after flute Stop.

The root cause was X1 sampling `currentTime` before bounded physical gesture
compilation and hashing. On a slow browser that work consumed the 10 ms attack
margin, so X0 correctly refused the now-stale start time. X1 now completes the
deterministic CPU work before its final live-clock sample. The final zero-retry
matrix is the regression proof.

## Bounds and artifact accounting

- Maximum output: 2,880,000 frames or 23,040,000 bytes of stereo `f32` PCM.
- Maximum scratch: 67,108,864 bytes.
- Maximum state handoff: 262,144 bytes.
- Global renderer cache contract: 100,663,296 PCM bytes and 256 entries.
- Current physical recipe cache: 64 entries. A two-second 48 kHz stereo buffer
  is 768,000 bytes, so 64 such buffers occupy 49,152,000 PCM bytes before host
  object overhead.
- ABI-v2 WASM: 39,154 decoded bytes, SHA-256
  `c6bdabdd6b740575669effa80f0b54ecddf56372aa8b934b76433226499374ed`.
  The reviewed pre-PHS0 baseline was 36,359 bytes, so growth is 2,795 bytes.
- Current generated root and `dist/index.html`: byte-identical at 7,675,657
  bytes, SHA-256
  `2683732fbdb6719cd61cd07af233dcd5fff99fda142a3e7dbde5a2f51c420809`.
  Growth from the 7,652,006-byte baseline is 23,651 bytes.

The root artifact remains above the architecture's eventual 1.5 MiB target.
PHS0 records the regression delta; it does not mislabel the pre-existing size
debt as resolved.

## Honest blockers and exclusions

`bun run verify` passed every gate from toolchain through A0 evidence, including
the complete Bun suite and build, then terminated at `u0-evidence`. U0 reported
`U0_EVIDENCE_LEDGER_IDENTITY`, `U0_EVIDENCE_MANUAL_ACCESSIBILITY_PENDING`, and
`U0_EVIDENCE_MANUAL_CLAIM` because a human operator has not attached its six
manual accessibility observations. This is a repository release blocker, not a
PHS0 automated-audio failure, and was not waived or fabricated.

Native `cargo test --locked` was attempted through the configured remote
compilation path, but available workers failed preflight. The repository's
guarded DSP build did complete with its explicit supported bypass and produced
the hash above. No local native-Cargo success is claimed.

No human listened to or rated the PHS0 output in this verification. Automated
non-silence, spectra, dynamics, and Stop evidence cannot certify realism. The
separate physical listening rows remain incomplete and must stay so until an
authorized human audition is attached.
