# Gesture-Driven Physical Synthesis Plan

Status: active planning contract for `jcpe-mnsc`

Owner request: 2026-08-06

This document is the master implementation and proof plan for increasing the
physical and perceptual realism of the studio's acoustic and electro-acoustic
instruments. It is deliberately more detailed than a design sketch. Every
checkbox is work that must either be completed, superseded by a reviewed
contract amendment, or explicitly refused with evidence. An apparently good
sound is not permission to skip the deterministic, architectural, accessibility,
size, performance, or release laws below.

## 1. Product outcome

Build an offline, deterministic performance engine in which an immutable score
is realized as bounded performer gestures driving compact, energy-conscious
instrument models. Clarinet, flute, guitars, trumpet, and vibraphone must react
to articulation and continuously varying controls in recognizably different,
physically motivated ways. The work must improve both isolated-note timbre and
musical behavior across attacks, releases, legato transitions, repeated notes,
register changes, dynamics, damping, and resonance.

The target is not general-purpose CFD or finite-element simulation in the
browser. The target is a compact real-time-quality renderer whose coefficients
and reduced models can be derived and audited offline with measurements,
primary literature, and selected FrankenSim facilities.

## 2. Non-negotiable repository laws

- [ ] Keep runtime operation completely offline.
- [ ] Add no model client, prompt, telemetry, CDN, remote font, remote sample,
  or runtime network dependency.
- [ ] Keep Preact as the only production package.
- [ ] Preserve exact rational musical time and spelling-first domain data.
- [ ] Keep theory pure and importing only domain.
- [ ] Keep the canonical playback plan immutable and shared by audio and MIDI.
- [ ] Derive physical performance data additively; do not make MIDI depend on
  audio-only physical parameters.
- [ ] Keep the UI limited to selectors and application intents.
- [ ] Keep audio behind serialized commands and one persistent graph.
- [ ] Never silently repair Manual/Frozen pitches, spellings, IDs, durations,
  gesture data, parameter packs, or physical solver failures.
- [ ] Maintain deterministic ordering, tie-breaks, seeds, work limits, memory
  limits, and diagnostic precedence.
- [ ] Use independently authored fixtures; production output must not certify
  itself.
- [ ] Give every law positive, negative/near-miss, transposition, and mutation
  proof.
- [ ] Report deterministic work/state/memory termination for every bounded
  search or nonlinear solve. Wall time is evidence, never a musical cutoff.
- [ ] Keep the tracked root HTML generated and `dist/index.html` byte-identical
  to it.
- [ ] Preserve the standalone artifact size budget from the architecture
  contract.
- [ ] Preserve unrelated work and resolve ownership before touching peer dirt.
- [ ] Never race an existing Playwright suite.
- [ ] Treat human listening as a mandatory release gate, not a substitute for
  measurement and not replaceable by automated tests.

## 3. Current-state baseline

### 3.1 Existing strengths

- [ ] Record the current recipe registry, output levels, renderer types, and
  supported pitch/duration bounds in a machine-readable baseline.
- [ ] Record the current WASM byte length, root artifact byte length, renderer
  cache limits, cold render costs, warm render costs, and peak memory.
- [ ] Record reference hashes for the current committed guitar, flute,
  clarinet, concert-grand, sampled-bass, and sampled-vibes outputs.
- [ ] Preserve the existing models as named compatibility/fallback versions
  until each replacement passes its complete proof and listening package.
- [ ] Record the currently accepted persistent-graph and Stop guarantees so the
  new render modes cannot weaken them.

### 3.2 Known limitations to freeze as regression targets

- [ ] The current DSP request carries pitch, velocity, sample rate, and maximum
  duration, but no time-varying performer gesture.
- [ ] Wind notes are rendered independently, resetting bore/exciter state at
  every note boundary.
- [ ] Guitar body coloration is feed-forward rather than a mechanical bridge
  load that feeds energy back into the strings.
- [ ] Clarinet uses a memoryless reed curve rather than a dynamic reed,
  Bernoulli flow, beating contact, and tongue interaction.
- [ ] Flute uses one generic bore loop rather than fingering-dependent bore
  sections and tone-hole scattering.
- [ ] Trumpet is absent from the production instrument registry.
- [ ] Concert vibes are single-layer samples whose velocity primarily changes
  gain and whose model has no physical pedal or fan state.
- [ ] Per-note RMS/peak normalization suppresses physically meaningful energy
  and dynamic differences.
- [ ] Existing automated waveguide tests emphasize tuning, coarse spectra,
  determinism, and decay, not measured transient or impedance behavior.
- [ ] Completed owner-authored listening evidence for the expanded recipe set
  is absent.
- [ ] The repository README understates the current audio implementation and
  must be reconciled only after the new accepted state is known.

### 3.3 Concurrent-work boundary

- [ ] Treat untracked `dsp/concert-grand/src/winds.rs` as peer-owned until its
  author/owner explicitly hands it off or lands it.
- [ ] Do not absorb zero calibration coefficients into a production model.
- [ ] Re-check `git status`, source mtimes, and active test processes before
  every editing and gate phase.
- [ ] Stage explicit owned paths only if the owner later requests a commit.

## 4. Target architecture

### 4.1 Plan layers

The canonical musical `PlaybackPlan` remains the shared audio/MIDI authority.
The performance layer derives an immutable `ExpressiveRealizationPlan` from the
validated plan, selected instrument version, deterministic style policy, and
stable event/voice identities. Audio then lowers that plan into a
`PhysicalRenderPlan` without exposing adapters to the UI.

```text
Validated document
  -> canonical PlaybackPlan (shared musical truth)
  -> deterministic PerformancePlan (timing/voicing/dynamics)
  -> ExpressiveRealizationPlan (quantized performer gestures)
  -> PhysicalRenderPlan (notes, stateful phrases, or coupled stems)
  -> Rust/WASM deterministic PCM + render diagnostics
  -> existing persistent Web Audio graph
```

- [ ] Freeze which layer owns each new type and prohibit reverse imports.
- [ ] Add type-only import and re-export checks for every new boundary.
- [ ] Keep stable document/event/voice identity through every lowering step.
- [ ] Make all new plan arrays and nested values deeply immutable.
- [ ] Include schema/version identifiers in every serialized gesture and
  parameter-pack shape.
- [ ] Define refusal results instead of throwing across trust boundaries.
- [ ] Define diagnostic ordering and bounded diagnostic counts.

### 4.2 Three render granularities

1. **Independent note**: retained for stateless recipes and bounded plucked or
   percussive cases where cross-note state is intentionally disabled.
2. **Stateful phrase**: required for monophonic winds/brass so bore, reed/lip,
   and breath state survives legato and register transitions.
3. **Coupled stem**: required when several events share resonant state, such as
   sympathetic guitar strings or vibraphone bars under one pedal.

- [ ] Specify deterministic partitioning of events into notes, phrases, and
  stems.
- [ ] Specify voice allocation and tie-breaks without wall-clock decisions.
- [ ] Specify exact sample-index rounding from rational beat positions.
- [ ] Guarantee monotone sample positions and no negative duration after
  rounding.
- [ ] Bound phrase duration, events per phrase, controls per event, simultaneous
  coupled voices, output frames, scratch bytes, and diagnostics.
- [ ] Split over-limit phrases only at contract-approved state boundaries.
- [ ] Define state handoff for split phrases or refuse when an honest handoff is
  impossible.
- [ ] Preserve serialized Stop behavior for all scheduled buffer/stem sources.
- [ ] Define loop behavior so a loop starts from a deterministic physical state
  rather than leaked prior-pass state.

## 5. Expressive realization contract

### 5.1 Canonical gesture shape

The contract should express musical control without baking instrument DSP
implementation details into UI or domain types.

```ts
interface ExpressiveVoiceGesture {
  readonly schemaVersion: GestureSchemaVersion;
  readonly eventId: EventId;
  readonly voiceId: PerformanceVoiceId;
  readonly instrumentVersionId: InstrumentVersionId;
  readonly articulation: ArticulationId;
  readonly deterministicSeed: DeterministicSeed;
  readonly curves: readonly QuantizedControlCurve[];
}

interface QuantizedControlCurve {
  readonly controlId: PhysicalControlId;
  readonly interpolation: "step" | "linear" | "monotone-cubic";
  readonly points: readonly QuantizedControlPoint[];
}

interface QuantizedControlPoint {
  readonly offsetTicks: number;
  readonly valueQ: number;
}
```

- [ ] Specify closed control IDs and legal units/ranges per instrument family.
- [ ] Specify articulation IDs including legato, tongued, staccato, accent,
  ghosted, breath attack, finger/pick, muted, and damped variants where valid.
- [ ] Refuse controls that do not belong to the selected instrument family.
- [ ] Freeze the quantization format for each unit.
- [ ] Freeze maximum curves, points per curve, total points per event, and
  interpolation work.
- [ ] Require first/last control coverage or define exact default extension.
- [ ] Reject duplicate, unsorted, out-of-range, non-finite, or semantically
  contradictory control points.
- [ ] Define deterministic missing-control defaults by versioned instrument
  policy, never by ambient mutable state.
- [ ] Derive noise seeds from stable document/run/event/voice/version identity
  with a specified hash and endian order.
- [ ] Prove identical seeds and curves across repeated compilation.
- [ ] Prove intentional variation when stable identity changes.

### 5.2 Realization policy

- [ ] Define how notation, duration, velocity, groove, neighboring notes, and
  selected articulation produce gesture curves.
- [ ] Keep source pitch and duration authoritative; gesture policy must never
  retune Manual/Frozen musical pitches.
- [ ] Define note-context lookbehind/lookahead bounds.
- [ ] Make legato detection explicit and independently fixture-tested.
- [ ] Define repeated-note tongue/pick/mallet behavior.
- [ ] Define dynamic envelopes independently from post-render gain.
- [ ] Define deterministic microvariation limits and disable controls.
- [ ] Expose a finite set of honest user-facing performance variants without
  exposing unstable raw solver coefficients.
- [ ] Make accessibility labels explain audible variants in user language.

### 5.3 Cache identity and preparation

- [ ] Canonically serialize every render-affecting input.
- [ ] Include renderer version, parameter-pack hash, gesture fingerprint,
  pitch sequence, exact timing, sample rate, and render mode in cache identity.
- [ ] Exclude non-audio display metadata from cache identity.
- [ ] Prove collision-resistant fingerprinting with mutation controls.
- [ ] Bound note, phrase, and stem cache entries and total PCM bytes.
- [ ] Define deterministic LRU eviction tie-breaks.
- [ ] Prepare the leading playback window synchronously enough to preserve
  current user feedback, then render bounded future work ahead of the cursor.
- [ ] Never select a lower-quality model based on wall time.
- [ ] Surface deterministic preparation refusal/limit diagnostics.

## 6. Shared Rust/WASM physical runtime

### 6.1 Versioned ABI

- [ ] Replace positional per-instrument exports with a versioned render-request
  ABI or add an additive v2 ABI while retaining v1 compatibility.
- [ ] Pass bounded integer descriptors and control arrays through WASM memory.
- [ ] Validate offsets, lengths, alignments, versions, sample rates, pitches,
  frames, and control IDs before rendering.
- [ ] Return a structured status and bounded diagnostic counters.
- [ ] Never dereference or write outside the validated scratch/output regions.
- [ ] Prove malformed ABI inputs cannot trap the host or corrupt memory.
- [ ] Keep generated WASM TypeScript deterministic and hash-verified.

### 6.2 Energy-conscious components

- [ ] Define power variables for pressure/volume-flow, force/velocity, and
  voltage/current analogues used by the reduced models.
- [ ] Implement or document passive digital-waveguide scattering junctions.
- [ ] Constrain reflection, loss, radiation, body-admittance, and coupling
  filters so passive components cannot create net energy.
- [ ] Add offline per-block energy audits for exciter input, stored energy,
  radiated output, damping loss, collision loss, and residual.
- [ ] Set independently authored residual tolerances by model and sample rate.
- [ ] Add near-miss fixtures that intentionally use active/unstable coefficients
  and must refuse or fail proof.
- [ ] Port only the small, reviewed concepts/kernels needed from FrankenSim;
  do not add FrankenSim as a runtime dependency.

### 6.3 Nonlinear solve contract

- [ ] Choose a bounded method per exciter: closed form, bracketed solve, fixed
  Newton iterations, or a reviewed hybrid.
- [ ] Freeze maximum iterations and function evaluations.
- [ ] Freeze convergence, bracket, finite-value, collision, and energy checks.
- [ ] Record per-render maxima and histograms in local evidence, not telemetry.
- [ ] Define deterministic behavior for nonconvergence: a named refusal or a
  separately proven conservative fallback, never silent coefficient clamping.
- [ ] Prove the fallback cannot produce NaN, infinity, runaway energy, or an
  unbounded loop.
- [ ] Test lowest/highest supported pitch, minimum/maximum pressure, attacks,
  releases, collisions, and sample rates.

### 6.4 Normalization, safety, and loudness

- [ ] Separate physical excitation energy from recipe output-level mixing.
- [ ] Remove fixed per-note early-RMS equalization from physical response or
  version it as a legacy compatibility path.
- [ ] Use a deterministic safety limiter only for exceptional peaks.
- [ ] Count and diagnose limiter engagement in evidence renders.
- [ ] Set instrument loudness from an independently reviewed calibration matrix
  rather than normalizing every note to the same target.
- [ ] Measure loudness and peak ranges across pitch, gesture, and sample rate.
- [ ] Prove soft/loud gestures alter both level and spectrum where physically
  expected.

### 6.5 Deterministic noise and numerics

- [ ] Specify the Rust PRNG algorithm, seed expansion, and exact test vectors.
- [ ] Avoid browser or platform random sources.
- [ ] Prove repeated render bytes or quantized sample hashes across supported
  hosts where floating-point identity is owed.
- [ ] Where byte identity is not portable, define exact quantized tolerances
  without weakening musical measurements.
- [ ] Add denormal protection that does not inject nondeterministic noise.
- [ ] Prove all supported renders contain finite samples.

## 7. FrankenSim offline instrument foundry

### 7.1 Honest scope

- [ ] Document that current `fs-lbm` is incompressible low-Mach and is not an
  authoritative compressible musical-acoustics or turbulent-jet solver.
- [ ] Document that current `fs-bem` uses Laplace/potential-flow kernels and is
  not a Helmholtz acoustic-radiation solver.
- [ ] Document that the current shell surrogate is not authoritative for
  vibraphone bars.
- [ ] Prohibit marketing or evidence claims that exceed those solver contracts.
- [ ] Use external primary measurements or appropriate acoustic solvers where
  FrankenSim lacks the required physics.

### 7.2 Reusable concepts and kernels

- [ ] Follow `docs/PHS1_FRANKENSIM_EXTRACTION_MAP.md` (surveyed 2026-08-06 at
  the pinned commit) as the normative extraction map, no-go list, and license
  arbitration record for every FrankenSim reuse decision below.
- [ ] Evaluate the `fs-time` symplectic integrator for free reed/lip/bar states.
- [ ] Evaluate collision behavior separately; do not assume a free-oscillator
  symplectic method remains correct through unilateral contact.
- [ ] Adapt `fs-couple` power-conjugate port and interface-energy accounting to
  exciter/resonator and string/body boundaries.
- [ ] Use spectral/Chebyshev/material facilities for offline mode generation.
- [ ] Use AD/optimization facilities for bounded parameter fitting and
  sensitivity analysis.
- [ ] Pin the exact FrankenSim commit for any derived parameter pack.
- [ ] Copy or port Rust only with provenance, license, tests, and a minimal
  dependency-free runtime surface.

### 7.3 Parameter-pack contract

- [ ] Define a checked-in, versioned, canonical parameter-pack format.
- [ ] Include instrument/model version, source citations, source-data hashes,
  solver/configuration identity, units, valid ranges, fit objective, residuals,
  sensitivity, and reviewer decision.
- [ ] Keep raw research/reference recordings out of the runtime artifact.
- [ ] Check in only legally distributable fixtures or derived numerical facts
  whose provenance permits distribution.
- [ ] Validate canonical ordering and reject unknown or duplicate fields.
- [ ] Generate compact Rust tables deterministically from accepted packs.
- [ ] Prove generated tables match the reviewed pack hash and are not edited by
  hand.

## 8. Clarinet v2 package

### 8.1 Specification and fixtures

- [ ] Specify an inward-striking one-degree-of-freedom reed with mass,
  stiffness, damping, equilibrium opening, and mouthpiece pressure difference.
- [ ] Specify Bernoulli flow and its sign conventions.
- [ ] Specify reed beating against the lay and collision energy loss.
- [ ] Specify virtual tongue contact/release for legato, portato, staccato, and
  repeated-note articulation.
- [ ] Specify segmented bore, register vent, tone-hole lattice, bell radiation,
  and frequency-dependent viscothermal loss.
- [ ] Decide whether a bounded vocal-tract impedance is v2-required or a later
  additive variant; do not leave it ambiguous.
- [ ] Author independent input-impedance peak fixtures across representative
  fingerings and registers.
- [ ] Author attack, odd/even balance, spectral-centroid, HNR, pitch, decay, and
  register-transition fixtures across dynamics.
- [ ] Include reed stiffness/opening/lip-pressure mutations and transpositions.

### 8.2 Production implementation

- [ ] Implement the dynamic reed state and bounded nonlinear flow solve.
- [ ] Implement energy-consistent lay collision.
- [ ] Implement tongue state and articulation gestures.
- [ ] Implement the bore/tone-hole/register/bell reduced model.
- [ ] Preserve state across phrase notes and reset it exactly at phrase starts.
- [ ] Implement reviewed parameter-pack loading and validation.
- [ ] Keep legacy clarinet available behind an explicit version during proof.
- [ ] Wire the accepted model through the v2 WASM ABI, renderer, cache, recipe,
  and application realization policy.

### 8.3 Independent proof

- [ ] Prove ABI validation, solver termination, finite output, and bounded state.
- [ ] Prove pitch and impedance behavior across the supported register.
- [ ] Prove soft/loud spectral change and articulation distinctions.
- [ ] Prove legato does not contain an artificial buffer reset.
- [ ] Prove tongued repeats restart appropriately without discarding bore state.
- [ ] Run mutation controls for reed sign, collision, tone-hole state, loss,
  radiation, seed, and curve ordering.
- [ ] Run real-browser playback and Stop tests at desktop and phone widths.
- [ ] Complete owner listening against legacy clarinet and legal references.

## 9. Flute v2 package

### 9.1 Specification and fixtures

- [ ] Specify embouchure hole, jet delay, jet offset, nonlinear jet drive,
  breath turbulence, and radiation variables with units.
- [ ] Specify a multi-section bore with tone-hole scattering and fingering
  states.
- [ ] Specify open/closed/partially vented tone-hole impedances and first-open-
  hole radiation.
- [ ] Specify tongue/breath attack, embouchure angle, pressure, vibrato, and
  overblow gesture controls.
- [ ] Author independent impedance/pitch fixtures for representative fingerings.
- [ ] Author attack-noise, HNR, octave transition, spectral-centroid, and dynamic
  fixtures.
- [ ] Include transposition and fingering/tone-hole mutations.
- [ ] Derive tone-hole and embouchure-hole inertance end corrections from
  geometry via the compact-limit (ka ≪ 1) Laplace BEM recipe in the
  extraction map ("Refined honest-use contracts"), validated against the
  0.8216a flanged / 0.6133a unflanged analytic constants before use on
  arbitrary geometry. Geometry-derived inertances supersede per-note
  empirical pitch pulls wherever geometry supplies the resonance (the
  section 9.2 law); only reviewed residual calibration remains. State the
  compact-limit validity bound on every fixture that uses a computed
  correction.

### 9.2 Production implementation

- [ ] Implement bounded tube sections and passive scattering junctions.
- [ ] Implement fingering-controlled tone-hole terminations and radiation.
- [ ] Implement dynamic jet/embouchure coupling driven by gesture curves.
- [ ] Implement breath/tongue transitions without resetting the phrase state.
- [ ] Replace empirical note-by-note pitch pulls where geometry supplies the
  correct resonance; retain only reviewed residual calibration.
- [ ] Wire accepted packs, ABI, cache, recipe, and realization policy.
- [ ] Keep legacy flute as an explicit proof comparator.

### 9.3 Independent proof

- [ ] Prove tuning, impedance, finite output, passive scattering, work bounds,
  and deterministic seeds.
- [ ] Prove fingering mutations move or suppress the expected resonance.
- [ ] Prove breath pressure and embouchure alter spectrum and regime.
- [ ] Prove legato fingering changes have continuous bore state.
- [ ] Prove tongued attacks remain perceptually and measurably distinct.
- [ ] Run browser, Stop, mutation, transposition, and owner-listening gates.

## 10. Plucked-string family package (guitars, ukulele, upright bass)

Amended 2026-08-06 (`jcpe-plan-uke-upright-bass-scgi`): scope widened from
"guitar family" to the plucked-string family. The owner's stated goal is
modeling the physical size and shape differences between instruments — a
ukulele versus a Martin-dreadnought-style acoustic versus a huge upright
bass. The differentiation mechanism is one shared string/bridge/body
architecture with per-instrument parameter packs (scale length, string set
density/tension/stiffness, body mode table derived from body volume and
plate size, bridge admittance scaling); per-body mode tables are cheap and
high-impact even before bridge feedback lands. All pre-amendment guitar
checkboxes below are unchanged.

### 10.1 Specification and fixtures

- [ ] Define explicit nylon/steel/electric string sets with scale length, gauge,
  density, tension, stiffness, damping, termination, and supported fret range.
- [ ] Specify bidirectional waves and frequency-dependent dispersion/loss.
- [ ] Specify a bridge scattering port coupled to body mechanical admittance.
- [ ] Specify body modes and how they feed energy back into every string.
- [ ] Specify sympathetic-string coupling and deterministic voice/state limits.
- [ ] Specify pick/finger position, width, hardness, angle, direction, and force.
- [ ] Specify palm mute, fretting release, slide/fret noise, and optional
  sympathetic controls.
- [ ] Specify electric pickup location/aperture and selector variants.
- [ ] Specify honest recipe targets and names: archtop clean, Martin-style
  acoustic, Strat-style clean, Chet-style twang, and classic-rock drive only if
  each has distinct accepted evidence.
- [ ] Specify a compact measured/fitted amplifier and cabinet path; document
  whether wave-digital stages or fitted nonlinear blocks are used.
- [ ] Author independent string pitch/inharmonicity, decay-slope, bridge/body
  admittance, pluck cancellation, pickup comb, and amp transfer fixtures.
- [ ] Specify the ukulele target: ~0.33–0.38 m scale, four nylon strings with
  the re-entrant/linear G4–C4–E4–A4 decision recorded, small body with a high
  Helmholtz resonance (~500–700 Hz region), low modal density, fast decay,
  and a bright low-sustain character; no amplifier path.
- [ ] Specify the upright-bass target: ~1.04–1.06 m scale, four thick
  steel/gut-hybrid strings (E1–A1–D2–G2), large body with a low Helmholtz
  resonance (~60–100 Hz), long sustain, strong low-mode radiation, and
  pizzicato-first articulation; arco is explicitly deferred because bowing
  is a different exciter class (sustained friction, not a pluck) and must
  arrive as its own reviewed package, never as a pluck variant.
- [ ] Specify per-body parameter packs (scale length, string set, body mode
  table from body volume/plate size, bridge admittance scaling) as the sole
  mechanism differentiating archtop, dreadnought, ukulele, and upright bass.
- [ ] Route new ukulele/upright-bass instrument IDs through the reviewed
  domain/audio registry amendment path (same law as the trumpet ID in
  section 11.1).
- [ ] Record the interplay with the existing sampled upright-bass recipe:
  the physical model is additive, and the CC0 sampled bass remains a named
  comparator in proof and listening (mirroring the vibraphone dual-track
  precedent in section 12).
- [ ] Author independent ukulele/upright-bass fixtures: pitch/inharmonicity
  across strings and frets/positions, body-resonance placement, decay-slope
  versus frequency, and same-pitch A/B rows against the sampled bass for
  the listening rubric.
- [ ] Derive each body's mode table (frequencies, Q, gains) from geometry with
  the offline Kirchhoff–Love plate/box modal solver specified in the
  extraction map ("Offline plate-mode solver recipe"): plate dimensions,
  thickness, and orthotropic wood constants in; mode tables out; Q from
  primary-literature loss factors because FrankenSim carries no damping
  data. Validate the solver against analytic simply-supported plate modes
  before any instrument table is accepted; the production port belongs to
  the PHS1 build (`jcpe-mnsc.3.2`).
- [ ] Specify CQC-style correlated summation for near-degenerate body-mode
  pairs (modes closer than their bandwidths), with cross-correlation
  coefficients in the pack rather than independent-resonator summation.
  Author an analytic fixture: two near-degenerate modes driven by the same
  bridge signal must show the closed-form beat/level behavior, and a
  mutation that drops the correlation term must be caught.
- [ ] Specify deterministic gesture-triggered stick-slip slide/fret squeak
  transients on the Cattaneo–Mindlin partial-slip skeleton (extraction-map
  reference `fs-tribo`): partial-slip states driven by slide
  velocity/pressure curves, radiated through the existing string/body path,
  seeded per gesture, bounded in duration and energy, and strictly additive
  (no change to current renders before the PHS4 build). Slide events enter
  only through the reviewed control registry. Fixtures: transient occurs
  only on slide gestures, spectral signature inside the authored band,
  deterministic repeat, and a dropped-friction-state mutation caught. Arco
  bowing remains deferred as its own package; this transient model is not
  a bowing model.

### 10.2 Production implementation

- [ ] Implement reviewed string sets and fret/pitch mapping.
- [ ] Implement passive bridge/body feedback rather than post-only body color.
- [ ] Implement bounded sympathetic strings and exact state reset/retention.
- [ ] Implement gesture-driven excitation and damping.
- [ ] Implement pickup and named amplifier/cabinet variants.
- [ ] Reconcile current peer guitar work without overwriting or misattributing it.
- [ ] Wire versions, packs, ABI, phrase/stem rendering, recipes, and policy.
- [ ] Retain legacy guitars as explicit proof comparators.

### 10.3 Independent proof

- [ ] Prove tuning/inharmonicity across strings and frets.
- [ ] Prove frequency-dependent decay changes when body coupling changes.
- [ ] Prove energy passes through the bridge without active instability.
- [ ] Prove pick-position nulls, damping, pickup aperture, and sympathetic
  response with independent expectations.
- [ ] Prove clean/twang/drive recipe names match measured and owner-heard targets.
- [ ] Prove amp oversampling/alias bounds, limiter incidence, and finite output.
- [ ] Prove ukulele and upright-bass body-resonance placement, register-correct
  decay character, and audible body-size distinction from the guitars with
  independent expectations (not production-derived).
- [ ] Run browser, polyphony, Stop, mutation, transposition, and listening gates.

## 11. Trumpet package

### 11.1 Specification and fixtures

- [ ] Add a stable trumpet instrument ID only through the reviewed domain/audio
  registry amendment.
- [ ] Specify an outward-striking lip mass-spring-damper and lip-channel flow.
- [ ] Specify mouth pressure, lip resonance/tension, aperture, damping, tongue,
  and vibrato gesture controls.
- [ ] Specify leadpipe, cylindrical/conical sections, three-valve states, tuning
  slides at the chosen reduced fidelity, and bell radiation.
- [ ] Specify nonlinear propagation or a reviewed reduced approximation for
  high-dynamic brassiness.
- [ ] Specify oversampling/filtering around nonlinear components.
- [ ] Author independent input-impedance, regime/partial selection, pitch,
  spectral-brightness, attack, and valve-state fixtures.
- [ ] Include near-miss inward-striking sign and unstable-lip mutations.

### 11.2 Production implementation

- [ ] Generalize the shared exciter/resonator interfaces without pretending reed
  and lip valves have identical sign or collision laws.
- [ ] Implement bounded lip dynamics and flow solve.
- [ ] Implement bore/valve/bell impedance.
- [ ] Implement bounded nonlinear-propagation brightness and oversampling.
- [ ] Preserve lip/bore state across phrase transitions.
- [ ] Wire pack, ABI, cache, recipe registry, labels, UI selector, realization,
  and persistence/import compatibility.

### 11.3 Independent proof

- [ ] Prove solver and energy bounds over mouth pressure and lip resonance.
- [ ] Prove playable resonance regimes and valve-state pitch movement.
- [ ] Prove loud gestures brighten without uncontrolled aliasing.
- [ ] Prove tongued, slurred, repeated, and register-transition behavior.
- [ ] Prove old documents and unknown IDs follow the existing validation law.
- [ ] Run browser, Stop, mutation, transposition, and owner-listening gates.

## 12. Vibraphone package

### 12.1 Specification and fixtures

- [ ] Keep the current CC0 concert-vibes samples as a legal fallback/reference.
- [ ] Specify bar geometry/material and a reduced Euler-Bernoulli or reviewed
  Timoshenko/modal representation.
- [ ] Specify tuned fundamental/fourth partial and measured inharmonic modes.
- [ ] Specify mallet mass/compliance/contact duration, hardness, velocity, and
  strike position.
- [ ] Consider a fitted hysteretic wrap compliance (Stulov-class
  loading/unloading paths over the Hertz/Hunt–Crossley core) as an
  accepted-variant refinement for yarn-wrapped mallets, fitted offline via
  the extraction-map fiber-hysteresis recipe with provenance-pinned
  literature loop data; adopt only with its own measured evidence.
- [ ] Specify resonator-tube coupling and radiation.
- [ ] Specify rotating baffle phase/rate as time-varying radiation/directivity,
  not only global amplitude modulation.
- [ ] Specify pedal/damper contact and shared resonance across notes.
- [ ] Specify bounded cross-bar/frame sympathetic coupling.
- [ ] Author independent modal-frequency, modal-decay, attack-spectrum,
  strike-position, pedal-release, resonator, and fan-sideband fixtures.

### 12.2 Production implementation

- [ ] Implement the accepted compact modal or banded-waveguide bar model.
- [ ] Implement finite-duration mallet contact and gesture mapping.
- [ ] Implement resonator and rotating-baffle state.
- [ ] Implement pedal damper and bounded shared coupled-stem state.
- [ ] Implement parameter packs and optional sample/physical hybrid attack only
  if the contract and licensing evidence accept it.
- [ ] Wire ABI, cache/stem renderer, recipe, UI, and realization policy.
- [ ] Keep sampled and existing synthetic vibes as named comparators until
  acceptance decides their long-term roles.

### 12.3 Independent proof

- [ ] Prove modal ratios, inharmonic modes, decay, and finite output.
- [ ] Prove mallet hardness/velocity/location change the expected spectra.
- [ ] Prove pedal release and shared resonance survive note boundaries.
- [ ] Prove fan phase/rate produces the expected bounded sidebands.
- [ ] Prove polyphony/state/memory/work termination.
- [ ] Run browser, Stop, mutation, transposition, and owner-listening gates.

## Piano sustain-pedal sympathetic resonance package (planned, after PHS6)

Added 2026-08-06 (`jcpe-plan-piano-pedal-resonance-rn6b`). The concert grand
is the studio's flagship instrument, yet nothing shares energy across piano
notes: pedaled jazz comping renders dry and disconnected. The coupled-stem
machinery of PHS0 section 4.3 is being proven on guitar and vibraphone; the
piano is its third and musically most important customer. This package is
additive and deliberately sequenced after PHS6 so it inherits a proven
pedal/damper/coupled-stem pattern rather than inventing a parallel one.

- [ ] Specify a shared string-field stem: with sustain-pedal state down,
  struck-note energy excites one bounded modal field representing the
  undamped strings (a compact reviewed mode set, not 88 full string
  models), fed by a fraction of each note's bridge energy; released notes
  decay into the field.
- [ ] Specify the per-note damper model: pedal up preserves current behavior
  (fast per-note release); pedal down transitions the note tail into the
  shared field.
- [ ] Specify the pedal-state source as deterministic realization policy: the
  playback plan has no pedal events, so derive an auto-pedal policy from
  legato/overlap context in the expressive realization layer (the layer
  that already derives articulation). No domain, document, or MIDI change;
  physical performance data stays additive per section 2.
- [ ] Author fixtures: strike C3 under pedal-down policy and measure energy
  at the E3/G3/C4 string-field modes after a dry note's damper would have
  silenced them; A/B dry-versus-pedal decay slopes; determinism; and the
  field obeying serialized Stop like every source.
- [ ] Specify a Stulov-class hysteretic felt contact law for the hammer model:
  loading and unloading follow different force–compression paths, which is
  what makes attack brightness velocity-dependent. Fit the law offline from
  provenance-pinned literature force–compression loops via the
  extraction-map fiber-hysteresis recipe (`fs-material` machinery with the
  `verify_gradient` gate). Sequencing is stated honestly: the current
  production piano renders sampled attacks plus additive partials and does
  not consume this law; it becomes live only with a future physical hammer
  excitation path, and no checkbox here claims otherwise.
- [ ] Create spec/build/verify children for this package only after PHS6
  closes, with the dependency recorded in the tracker.

## Stage image and shared air (cross-cutting)

Added 2026-08-06 (`jcpe-plan-stereo-space-anhi`). This section is production
and mix realism, not physics: it complements the physical models and never
substitutes for them, and describing it otherwise falls under the section 17
law against equating more effects with realism. It exists because the models
are judged on headphones, where a bone-dry mono point source reads as
synthetic regardless of model quality. Everything here is deterministic,
offline, and cheap. It feeds PHS7 acceptance and requires an X0 contract
amendment for the one master-path graph change.

- [ ] Specify per-instrument static stage placement: reviewed azimuth, width,
  and distance constants in the recipe registry (for example piano wide,
  bass slightly left of center, winds center-right), user-visible only as a
  natural default image; no new UI surface.
- [ ] Specify source width via decorrelated dual-channel rendering where the
  model already computes stereo (`finalize_stereo`): replace identical-
  channel duplication with deterministic per-channel allpass chains using
  instrument-seeded coefficients, with bounded inter-channel coherence
  targets per instrument.
- [ ] Specify one shared early-reflection block for the whole mix, never per
  note: four to eight deterministic taps plus a gentle air-absorption
  lowpass, one instance on the existing persistent-graph master path,
  reviewed fixed coefficients, total tail under 80 ms so the X1 Stop
  guarantee is untouched. Route the addition through a reviewed X0 contract
  amendment (one persistent graph law).
- [ ] Record the explicit non-goals: no reverb tail, no HRTF, no
  user-adjustable room, no per-note graph nodes.
- [ ] Author fixtures: inter-channel coherence per instrument within
  independently authored bounds; mono-sum coloration bounded by an authored
  dB deviation envelope (no comb disasters); bit-identical renders across
  runs; Stop-to-silence timing unchanged against the X1 law.
- [ ] Add owner listening rubric rows with level-matched with/without A/B
  comparisons before acceptance.

## 13. Measurement and evidence system

### 13.1 Reference authority

- [ ] Create a provenance ledger for every judgment-bearing number.
- [ ] Prefer primary literature, standards, instrument measurements, and legally
  usable recordings over production-generated expectations.
- [ ] Pin URL/DOI, retrieval date, license, file hash, excerpted measurement,
  units, transformation, and reviewer interpretation.
- [ ] Separate distributable fixtures from local/non-redistributable evidence.
- [ ] Never ship reference recordings merely because tests can access them.

### 13.2 Metric extractors

- [ ] Implement independent pitch/partial tracking.
- [ ] Implement input-impedance peak comparison for parameter-pack fixtures.
- [ ] Implement attack/release envelope and time-to-peak measurement.
- [ ] Implement spectral centroid, harmonic-to-noise, odd/even balance, and
  partial-energy trajectories.
- [ ] Implement frequency-dependent decay-slope measurement.
- [ ] Implement register/regime transition detection.
- [ ] Implement modulation sideband and alias-energy measurement.
- [ ] Implement inter-note discontinuity and retained-state measurement.
- [ ] Implement energy residual and limiter-incidence reports.
- [ ] Give each extractor independent synthetic controls with known answers.

### 13.3 Fixture matrix

- [ ] Cover all supported sample rates.
- [ ] Cover low/middle/high registers and transpositions.
- [ ] Cover minimum/nominal/maximum legal gestures.
- [ ] Cover attacks, releases, legato, repeated notes, register changes, and
  over-limit refusals.
- [ ] Cover every model version and fallback.
- [ ] Add one-variable mutations for sign, unit, coefficient, ordering, seed,
  solver limit, geometry, and coupling errors.
- [ ] Record exact sample counts, work counters, memory, hashes, versions, and
  diagnostics in machine-readable evidence.

### 13.4 Listening proof

- [ ] Expand the listening rubric for every accepted recipe and gesture family.
- [ ] Include same-pitch/same-loudness A/B comparisons with legacy models.
- [ ] Include phrases that expose articulation, transitions, damping, and shared
  resonance rather than isolated chords only.
- [ ] Define headphones/speakers, browser, OS, sample rate, level-matching, and
  environment fields.
- [ ] Capture owner-authored observations, failures, and decision per row.
- [ ] Never auto-author or infer the human result.
- [ ] Keep a failed listening row red until implementation or target wording is
  honestly amended and re-auditioned.

## 14. Integration, performance, and artifact gates

- [ ] Add static import-boundary and cast-policy coverage for every new module.
- [ ] Add unit tests for contract validation, partitioning, curve interpolation,
  fingerprints, cache eviction, ABI validation, and each DSP component.
- [ ] Add integration tests through the real performance compiler, renderer,
  audio engine, and serialized transport.
- [ ] Add real OfflineAudioContext evidence where named by X0.
- [ ] Add Playwright tests using a supported real Node process, never Bun's node
  shim.
- [ ] Test desktop and phone widths, keyboard operation, status announcements,
  selector labels, and no console/page errors.
- [ ] Test rapid play/stop, replacement, loop, and stale-plan races.
- [ ] Test maximum polyphony/phrase/stem bounds without racing another suite.
- [ ] Record cold/warm render cost, peak scratch/PCM/cache memory, WASM growth,
  and artifact growth.
- [ ] Set budgets from measured supported hardware and freeze them in contract;
  wall time must not change musical output.
- [ ] Keep source mtimes stable through gates and rebuild immediately before any
  owner-authorized commit/deploy.
- [ ] Run the aggregate release-facing gate only after its prerequisite evidence
  is current; report upstream unrelated blockers exactly.
- [ ] Rebuild root and dist through the guarded build and verify byte identity.
- [ ] Do not deploy without explicit owner authorization.
- [ ] If deployment is authorized, compare hosts against committed HEAD bytes,
  poll the custom-domain cache, and run real-browser behavior checks on both
  hosts.

## 15. Migration and compatibility

- [ ] Assign explicit version IDs to all legacy and new physical models.
- [ ] Define whether saved documents store only instrument ID or an optional
  accepted version/variant, with backward-compatible decode behavior.
- [ ] Preserve existing IDs unless a reviewed semantic mismatch requires an
  additive replacement and migration.
- [ ] Do not silently reinterpret “Blues Guitar” as Chet-style twang; arbitrate
  the name, target, and compatibility behavior.
- [ ] Define fallback behavior for unsupported sample rates or model limits as a
  named refusal or explicit user-selected legacy version.
- [ ] Do not silently fall back due to device speed or render wall time.
- [ ] Update README, architecture, X0 contract, recipe manifests, evidence
  inventory, source maps, and generated artifact only when their claimed state
  is true.

## 16. Dependency-ordered execution ledger

The Beads graph must mirror this order. A package epic closes only after its
specification/fixtures, production build, and independent proof children close.

### Phase A — program foundation

- [x] A001 Read complete repository AGENTS.md and README.md.
- [x] A002 Read architecture, rebuild, audio, and relevant legacy contracts.
- [x] A003 Map composition root, playback/performance, audio engine, renderer,
  WASM DSP, recipes, fixtures, tests, history, and current tracker state.
- [x] A004 Inspect relevant FrankenSim contracts and code without overstating
  solver capability.
- [x] A005 Record current peer dirt and active process boundary.
- [x] A006 Create the physical-synthesis program epic.
- [x] A007 Claim exactly one planning leaf.
- [x] A008 Review this plan against every source requirement.
- [x] A009 Run completeness checks for every instrument and cross-cutting law.
- [x] A010 Convert the accepted plan into self-contained Beads.
- [x] A011 Validate dependency direction, readiness, and absence of cycles.
- [x] A012 Flush tracker mutations.

### Phase B — specifications and independent fixtures

- [x] B001 Baseline current recipes, artifacts, performance, PCM, and evidence.
- [x] B002 Specify expressive realization types, bounds, refusals, and fixtures.
- [x] B003 Specify note/phrase/stem partitioning and exact sample timing.
- [x] B004 Specify cache identity, preparation, limits, and fixtures.
- [x] B005 Specify v2 WASM ABI, memory safety, diagnostics, and fixtures.
- [x] B006 Specify energy ports, passive components, nonlinear solves, and
  normalization.
- [x] B007 Specify deterministic PRNG/numerics and cross-host evidence.
- [x] B008 Specify parameter-pack/provenance format and foundry workflow.
- [ ] B009 Build independent metric extractors and their known-answer fixtures.
- [x] B010 Specify clarinet v2 and independent corpus.
- [ ] B011 Specify flute v2 and independent corpus.
- [ ] B012 Specify guitar family and independent corpus.
- [ ] B013 Specify trumpet and independent corpus.
- [ ] B014 Specify vibraphone and independent corpus.
- [ ] B015 Review all specification packets for self-certification and feature
  loss before production implementation.

### Phase C — shared production foundation

- [x] C001 Implement expressive realization compilation.
- [x] C002 Implement immutable validation/refusal and curve interpolation.
- [x] C003 Implement deterministic note/phrase/stem partitioning.
- [x] C004 Implement canonical render fingerprints and bounded caches.
- [x] C005 Implement v2 WASM request/response ABI and host validation.
- [x] C006 Implement shared delay/scattering/loss/radiation components.
- [x] C007 Implement shared oscillator/contact/nonlinear-solve components.
- [x] C008 Implement energy audit hooks and structured diagnostics.
- [x] C009 Separate physical energy, safety limiting, and output-level mixing.
- [ ] C010 Implement parameter-pack validation and generated-table checks.
- [x] C011 Integrate bounded future preparation with persistent transport.
- [x] C012 Independently prove the shared foundation before instrument migration.

### Phase D — instruments

- [ ] D001 Implement clarinet v2.
- [ ] D002 Independently prove clarinet v2.
- [ ] D003 Complete clarinet owner listening.
- [ ] D004 Implement flute v2.
- [ ] D005 Independently prove flute v2.
- [ ] D006 Complete flute owner listening.
- [ ] D007 Resolve guitar peer ownership and target naming.
- [ ] D008 Implement coupled guitar family.
- [ ] D009 Independently prove guitar family.
- [ ] D010 Complete guitar owner listening.
- [ ] D011 Implement trumpet registry, model, and UI integration.
- [ ] D012 Independently prove trumpet.
- [ ] D013 Complete trumpet owner listening.
- [ ] D014 Implement physical/hybrid vibraphone.
- [ ] D015 Independently prove vibraphone.
- [ ] D016 Complete vibraphone owner listening.
- [ ] D017 Implement ukulele (plucked-string family pack; 2026-08-06 amendment).
- [ ] D018 Independently prove ukulele.
- [ ] D019 Complete ukulele owner listening.
- [ ] D020 Implement physical upright bass (plucked-string family pack;
  sampled bass retained as comparator).
- [ ] D021 Independently prove upright bass.
- [ ] D022 Complete upright-bass owner listening.

### Phase E — whole-system acceptance

- [ ] E001 Run complete measurement matrix with terminal machine-readable output.
- [ ] E002 Run mutation/transposition matrix and demonstrate each control is
  detected.
- [ ] E003 Run unit/static/integration gates.
- [ ] E004 Run real browser/audio/Stop/loop/race gates without suite contention.
- [ ] E005 Run accessibility and phone/desktop behavior checks.
- [ ] E006 Reconcile all human listening rows; no inferred results.
- [ ] E007 Reconcile artifact size and performance budgets.
- [ ] E008 Reconcile README, architecture, X0, manifests, inventories, and source
  documentation.
- [ ] E009 Generate root/dist with byte-identity and reproducibility proof.
- [ ] E010 Run aggregate verify and record exact terminal outcomes and blockers.
- [ ] E011 Obtain explicit owner authorization before any commit, push, release,
  or deployment not separately requested.
- [ ] E012 If authorized, stage only owned paths and verify committed-host bytes
  plus real-browser behavior.
- [ ] E013 Close each leaf with exact commands/results, flush tracker state, then
  close package epics and finally `jcpe-mnsc`.

## 17. Forbidden shortcuts

- Do not equate more harmonics, more noise, or a longer algorithm with realism.
- Do not reuse the current output as the only expected fixture.
- Do not call incompressible LBM an acoustic flute simulation.
- Do not call Laplace BEM a bell-radiation solver.
- Do not call the estimate-only shell surrogate a validated vibraphone model.
- Do not reset state at note boundaries and label the result legato.
- Do not represent a rotating vibraphone baffle solely with master-gain tremolo.
- Do not represent guitar body coupling solely with a post-string EQ/modal bank.
- Do not use the clarinet reed sign for a trumpet lip valve.
- Do not normalize away the dynamic behavior being claimed.
- Do not repair unstable coefficients silently.
- Do not make musical results depend on render wall time or device speed.
- Do not expand the runtime dependency or network surface.
- Do not certify a model solely with automated metrics or solely by ear.
- Do not edit, stage, commit, or deploy peer work under this program.

## 18. Initial primary technical authorities

These are starting authorities, not permission to copy claims without checking
the exact model, units, and license used by each fixture.

- Bilbao et al., real-time woodwind player-control models with reed, tongue,
  collision, bore loss, radiation, and bounded nonlinear solution:
  <https://pub.dega-akustik.de/ISMA2019/data/articles/000034.pdf>
- Reed and brass exciter/resonator formulation, including inward- versus
  outward-striking valves and modal input impedance:
  <https://pub.dega-akustik.de/ISMA2019/data/articles/000057.pdf>
- Clarinet tone-hole lattice and measured input impedance:
  <https://arxiv.org/abs/0901.1640>
- Cook, multi-section/tone-hole real-time flute modeling:
  <https://quod.lib.umich.edu/cgi/p/pod/dod-idx/integration-of-physical-modeling-for-synthesis-and-animation.pdf?c=icmc%3Bidno%3Dbbp2372.1995.153%3Bformat%3Dpdf>
- Enhanced wave-based plucked-string modeling with measured dispersion,
  damping, and body response:
  <https://dael.euracoustics.org/landing_pages/aaua/52261.html>
- Vibraphone bar, mallet, resonator, pedal, and fan acoustics:
  <https://escholarship.org/content/qt5g19z937/qt5g19z937.pdf?t=lq6pbx>

## 19. Definition of program completion

The program is complete only when every non-superseded checkbox above is
checked, every package has closed spec/build/verify children, every named gate
has a terminal result, every expected mutation has been caught, every accepted
recipe has owner-authored listening evidence, the standalone artifact remains
within its reviewed budget and reproducible from a commit, and no outstanding
coordination or release liability is concealed by a smaller green subset.
