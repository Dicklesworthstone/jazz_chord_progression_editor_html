# iOS physical-render cancellation evidence — 2026-09-07

This record covers the cooperative native render work in commit
`87485cf37e9304cfcca805f1c11c288965989437` for Bead
`jcpe-ios-quality-verification-uo47.18`. It proves current-source compilation,
non-audible successful-output identity, causal interruption of live costly
physical runtimes, stale-result exclusion, and post-cancellation reuse. It does
not claim human listening evidence or internally preemptible monolithic calls
for every single-note physical instrument.

## Implemented behavior

- `JazzAudioEngine` owns the current progression and preview tasks plus an
  identity-matched cancellation token. Stop, replacement, and teardown cancel
  the exact worker while the existing generation/request fences remain the
  final authority for publication and playback.
- `JazzAudioRenderer` propagates cancellation through event, beat, mixing,
  percussion, and normalization loops. A cancelled render cannot publish
  partial PCM or insert it into the render cache.
- Concert Grand now uses the source core's existing `cg_runtime_*` lifecycle
  instead of the monolithic Apple FFI call. Cancellation is observed between
  bounded 2,048-frame runtime steps.
- Simultaneous Archtop, Electric, Steel Dreadnought, and Re-entrant Ukulele
  chords now use the source `plk2_chord_runtime_*` lifecycle. A handle-scoped
  atomic cancellation request is checked on every physical simulation frame
  and during reconstruction, so cancellation does not wait for the runtime's
  busy lock.
- Successful cooperative guitar output remains bit-identical to the established
  synchronous renderer, including its reviewed truncation fade. Completed PLK2
  handles are intentionally self-consuming; the Apple bridge does not reset an
  already-completed handle and discard valid output.
- Flute, Clarinet, and individual single-note plucked calls retain cancellation
  fences immediately before and after their monolithic C calls. Those calls do
  not yet observe cancellation from inside Rust.

## Focused non-audible evidence

The fresh Catalyst result bundle at
`/Volumes/USB_NVME/frankenjazz-cooperative-focused-20260907-r6/focused-all-fixed.xcresult`
passed 4 of 4 selected tests in 0.148 seconds:

1. live Concert Grand runtime cancellation;
2. live simultaneous guitar-family chord cancellation, no cache insertion, and
   immediate runtime reuse;
3. monolithic-versus-cooperative PLK2 bit identity; and
4. all seven physical-engine PCM oracles.

The Rust `plucked_v2_physics` cooperative-session identity/cancellation test
also passed with `cargo test --locked` on the RCH worker `hz3`; no local Cargo
fallback was accepted. Swift parsing, Rust formatting, checked-in sample
integrity, generated Apple DSP slices, and `git diff --check` passed. Changed
production code had no actionable critical finding in the changed-file bug
scan; the reported critical matches were pre-existing test-only `panic!`
assertions.

## Source-stable DSR gate

Receipt:
`/Users/jemanuel/.local/state/dsr/quality-logs/jazz_chord_progression_editor_html/20260907T061418-30748/receipt.json`

- status: passed, not dry-run, 1 of 1 configured checks passed;
- source before/after:
  `87485cf37e9304cfcca805f1c11c288965989437` with an empty worktree hash;
- generic iOS build: passed;
- Mac Catalyst unit suite: 72 passed, 0 failed;
- iPhone non-audio UI suite: 11 passed, 0 failed;
- iPad expanded-workspace UI suite: 1 passed, 0 failed; and
- DSR log SHA-256:
  `4d02ac800bf314bba8eebf96447e21035592a619662511a661fe9cc166d7e2ef`.

Every Simulator lane re-established the repository's audio-safety invariant;
no automated test intentionally emitted sound. The Bead remains open for the
owner/device human-listening matrix and for any stricter requirement to make
the remaining monolithic single-instrument FFI calls internally preemptible.
