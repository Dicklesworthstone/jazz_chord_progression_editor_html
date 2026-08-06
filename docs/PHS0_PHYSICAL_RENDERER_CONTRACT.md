# PHS0 Gesture and Physical Renderer Contract

Status: proposed specification packet for `jcpe-mnsc.2.1`. Production
implementation is owned by `jcpe-mnsc.2.2`; this document does not claim it
exists.

## 1. Purpose and authority

PHS0 adds a deterministic audio-only realization between the existing immutable
performance plan and the audio renderer. It exists because pitch, velocity, and
duration cannot describe the time-varying actions that excite acoustic
instruments, and because one independently rendered buffer per note cannot
preserve physical state through legato, sympathetic coupling, or pedal-held
resonance.

P0 remains the canonical musical plan shared by MIDI and audio. PHS0 may derive
articulation and physical controls, but it may not alter source pitch, source
duration, voicing identity, spelling, event identity, or plan ordering. UI code
may select reviewed variants and dispatch application intents; it never calls
the renderer or exposes raw solver coefficients.

Normative machine-readable authority lives in:

- `src/audio/physical-renderer-contract.ts` for proposed public types/constants;
- `tests/fixtures/physical-renderer/phs0-contract.json` for independent limits
  and policies;
- the case, trace, provenance, mutation, and baseline companions in that fixture
  directory;
- `scripts/validate-phs0-contract.ts` for source-independent packet validation.

## 2. Layering and immutable plans

```text
PlaybackPlan / PerformancePlan
  -> ExpressiveRealizationPlan
  -> PhysicalRenderPlan
  -> versioned WASM renderer
  -> immutable PCM/state receipt
  -> existing X0 graph and X1 transport
```

`ExpressiveRealizationPlan` is additive audio policy. It binds stable document,
revision, event, and voice identities to a versioned instrument, articulation,
deterministic seed, and quantized curves. `PhysicalRenderPlan` lowers those
gestures into bounded independent notes, stateful phrases, or coupled stems.
Both plans and every descendant array/object are deeply immutable.

The renderer creates no second persistent Web Audio graph. The current X0 graph
and X1 serialized Stop guarantee remain authoritative.

## 3. Quantized performer gestures

Every control point uses an integer tick offset and signed Q16.16 value. Floating
browser inputs never cross the WASM boundary as unvalidated gesture authority.
The closed control set covers air, turbulence, embouchure, tongue, reed, lips,
vibrato, pick, string damping, pickup, mallet, strike location, pedal, and fan.
Instrument packages own narrower legal subsets and physical units.

Validation follows the frozen order in the contract. In particular:

1. validate request shape and schema;
2. validate instrument version and sample rate;
3. validate stable identities;
4. enforce curve/point counts;
5. enforce instrument-family control ownership;
6. require points to be strictly increasing and unique;
7. validate offsets and Q16.16 values;
8. validate the render partition and parameter pack;
9. validate ABI memory ranges before access;
10. enforce total work limits.

Defaults are versioned instrument policy. Missing data is never filled from
ambient mutable state. Unknown controls, duplicate points, unsorted points,
out-of-range offsets/values, contradictory articulation, or over-limit data
refuse with a named code and path.

Noise seeds derive from stable identities using the frozen seed hash and PCG32
policy. Recompiling the same accepted plan must produce identical gesture bytes;
changing an identity deliberately changes the seed. Runtime randomness is
forbidden.

## 4. Render partition and physical continuity

### 4.1 Independent note

Use only when cross-note state is intentionally absent or a reviewed plucked or
percussive variant has no shared resonance. It is not a shortcut for winds,
brass legato, guitar sympathetic resonance, or vibraphone pedal behavior.

### 4.2 Stateful phrase

Monophonic clarinet, flute, and trumpet phrases retain exciter and resonator
state across legato and reviewed repeated-note transitions. A tongue event may
restart excitation without deleting valid bore state. State resets exactly for
transport start/stop, canonical phrase start, loop restart, document replacement,
and renderer disposal.

### 4.3 Coupled stem

Guitar strings sharing bridge/body impedance and vibraphone bars sharing pedal,
frame, or resonator state render as bounded stems. Voice allocation and ordering
use stable musical identities, never task completion order or wall time.

Partition limits are exact. An over-limit region may split only at a reviewed
state boundary. If truthful state handoff cannot fit the bounded receipt, the
renderer refuses; it does not discard resonance silently. A loop always begins
from its canonical state and never inherits the preceding pass.

Exact rational beat positions lower to sample frames with a specified monotone
rounding law in the build packet. Rounding may not reorder attacks or create a
negative duration.

## 5. Cache and preparation

A cache fingerprint includes every render-affecting field named by
`PHYSICAL_CACHE_IDENTITY_FIELDS`: render mode, renderer and parameter-pack
versions, gesture bytes, event/voice identities, pitches, sample offsets and
durations, and sample rate. Display labels and wall-clock observations are not
cache inputs.

Note, phrase, and stem caches have exact entry and PCM-byte bounds. Eviction is
deterministic LRU with a stable identity tie-break. Preparation may render a
bounded future window, but device speed never selects different musical output,
a lower-quality model, or an unreported fallback.

## 6. WASM ABI and memory safety

ABI v2 is additive while v1 recipes remain explicit compatibility comparators.
The host supplies validated integer descriptors, control points, channel output
ranges, and optional state input/output ranges. Before a Rust read or write, the
implementation must validate:

- ABI version and request byte length;
- nonnegative aligned offsets and counts;
- multiplication/addition overflow;
- each range against current linear memory;
- prohibited aliasing among descriptors, controls, state, and outputs;
- output frames, state bytes, control points, scratch, and diagnostic limits.

The receipt reports completion/refusal, frames/state bytes written, refusal
code, nonlinear iteration/fallback counts, limiter engagements, and diagnostic
count. A malformed request must not trap the host or partially publish PCM.

## 7. Energy, nonlinear solves, and loudness

Reduced components use power-conjugate variables: pressure/volume-flow or
force/velocity. Passive scattering, reflection, loss, radiation, bridge/body,
and resonator filters may not create unexplained net energy. Independent proof
records excitation input, stored energy, radiation, damping/collision loss, and
residual with instrument-specific tolerances.

Every nonlinear exciter freezes its method and exact iteration/function bounds.
The shared ceiling is eight primary iterations and sixteen conservative fallback
bisections. Failure produces a named refusal or a separately proven conservative
fallback. Silent coefficient clamping, NaN propagation, infinite loops, and
wall-time cancellation are forbidden.

Physical excitation energy is distinct from recipe output level. V2 does not
use the legacy fixed early-RMS normalization. The safety limiter is
output-only: when it engages it rescales the published PCM block, never the
handed-off physical state or the energy ledger, so a continuation render
resumes from true physical amplitude. Stitching a limited block directly
against its continuation is therefore invalid; the receipt's engagement count
is the evidence a host must consult before treating adjacent blocks as one
continuous signal. A deterministic safety limiter is
allowed only as protection; engagement is counted and cannot be used as musical
normalization. Independently reviewed calibration sets inter-instrument mix.

## 8. Exact bounds

The machine-readable `limits` object is normative. Important ceilings include:

- sample rates: 44.1, 48, and 96 kHz;
- 12 curves and 256 total points per gesture;
- 128 events per phrase and 512 per stem;
- 30 seconds per phrase/stem and 2,880,000 output frames;
- 64 coupled voices;
- 64 MiB scratch, 96 MiB cached PCM, and 256 cache entries;
- 64 diagnostics and 256 KiB state handoff;
- eight primary nonlinear iterations and sixteen fallback bisections.

Other browser sample rates receive an explicit unsupported-sample-rate result
for v2. A legacy renderer may remain user-selectable, but speed-based silent
fallback is forbidden.

## 9. Baseline and size liability

The baseline companion records committed HEAD `d3a7db6`. The root artifact is
7,652,006 bytes with SHA-256
`67b9ae08a40f45040a01e817e508106158c55cff85e9a2889806e4ed6b177042`.
That is already above the architecture's original 1.5 MiB final target. The
decoded Rust/WASM DSP is only 36,359 bytes, so this packet records rather than
hides the existing package-size problem. PHS0 may not claim to preserve an
already-green size gate; every later package must report its incremental bytes
and PHS7 must arbitrate the total budget honestly.

Baseline render hashes are compatibility evidence only. They do not establish
the correctness or realism of v2 and are not used to generate v2 expectations.

## 10. Independent evidence and mutation laws

Gesture fixtures cover each family, accepted curves, unsupported controls,
ordering, duplicate points, limits, and transposition. Partition fixtures cover
wind/brass phrases, shared guitar/vibes stems, independent notes, loops, event
and voice limits, ordering, and state handoff. ABI fixtures cover valid memory,
version, request size, bounds, aliasing, frames, alignment, and point count.

Every production phase must add positive, near-miss, transposition, and mutation
proof. The PHS0 mutation corpus deliberately changes schema, ABI, limits,
numeric/normalization policy, partition state, modes, families, case expectations,
baseline honesty, graph ownership, and fixture independence. Each mutation must
produce its named finding.

Automated metrics cannot author human listening results. The final physical
instrument matrix remains blocked on an owner-authored listening artifact.

## 11. Forbidden interpretations

- PHS0 does not authorize changing P0, MIDI, Manual/Frozen pitches, or source
  durations.
- It does not authorize raw DSP controls in the UI.
- It does not call current FrankenSim LBM an acoustic jet solver or current
  Laplace BEM a Helmholtz radiation solver.
- It does not permit note-buffer resets to masquerade as legato.
- It does not permit post-filtered guitar output to masquerade as bridge/body
  feedback.
- It does not permit output normalization to erase the dynamic response under
  test.
- It does not authorize commit, push, release, or deployment.

## 12. Phase exit

The specification leaf may close when the typed contract, this normative doc,
all companions, validator, type/static tests, mutation replay, architecture and
public-command registrations, typecheck, lint, and named narrow tests pass with
terminal results. That closure does not claim the production renderer exists.
