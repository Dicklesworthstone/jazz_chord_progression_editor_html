# PHS1 FrankenSim Extraction Map

Status: normative spec input for `jcpe-mnsc.3.1` (PHS1 specification) and
`jcpe-mnsc.3.2` (PHS1 build). Authored 2026-08-06 from a direct survey of
`/dp/frankensim` at commit `b47259187a31b704f8f0faf6abdf49b32919b96a`
(no tags; pin by hash). Source bead: `jcpe-plan-frankensim-map-oasz`.

This document exists so the PHS1 packet does not re-derive or overstate what
the sister project can supply. Every claim below was checked against the
surveyed sources at the pinned commit; re-verify per file when extracting,
because the constellation moves.

## 1. Reuse mode: file-level extraction only

- [ ] Never add FrankenSim as a Cargo path or registry dependency, in the
  foundry or the runtime. `fs-exec` (~1.1 MB of source) pulls the sibling
  `asupersync` runtime into `fs-time`, `fs-cheb`, `fs-fft`, and `fs-la`;
  the main workspace does not build offline standalone (it needs the
  `frankenscipy` sibling plus crates-io `npyz`), and `fs-wasm` fails on an
  asupersync nightly-drift error. Extraction is copying reviewed files with
  provenance, license, and tests — nothing else.
- [ ] Pin `b47259187a31b704f8f0faf6abdf49b32919b96a` (or a successor hash,
  re-surveyed) in every derived parameter pack, per plan §7.2.
- [ ] Record per-file provenance (source path, commit, license grant, local
  modifications) in the parameter-pack/vendored-file ledger.

## 2. Clean-file extraction map (verified fs-exec-free at the pinned commit)

Time integration and stiffness:

- [ ] `crates/fs-time/src/symplectic.rs` — `verlet_step` (≈20 lines,
  slice-based, alloc-free): reed/lip/bar oscillator states.
- [ ] `crates/fs-time/src/galpha.rs` — generalized-α (Chung–Hulbert) with
  controllable high-frequency dissipation; right for damped modal banks and
  implicit bar updates. Needs `fs-la`'s `lu`.
- [ ] `crates/fs-time/src/stiff.rs` — `Imex2` and `ExpEuler` for stiff-string
  dispersion terms.

Contact:

- [ ] `crates/fs-contact/src/normal_patch/law.rs` — Hertz sphere/cylinder/
  elliptic plus Hunt–Crossley, in SI units, with a refusing applicability
  envelope. This is the piano-hammer/mallet contact literature already
  implemented; foundry-ready for PHS6 mallet packs and any future piano
  hammer pack.

Linear algebra, spectral, and FFT:

- [ ] `crates/fs-la/src/{eigen,eigen_complex,factor,batched}.rs` — Lanczos/
  LOBPCG, complex Hessenberg + shifted-QR eig, Cholesky/LU/QR, SoA batched
  small-dense kernels.
- [ ] `crates/fs-cheb` — `lobatto_points`, `diff_matrix` (negative-sum-trick
  construction), Clenshaw evaluation, colleague-matrix certified roots.
- [ ] `crates/fs-math` — entire crate: deterministic ULP-budgeted
  sin/cos/exp/tanh/erf/pow, zero deps, trivially `no_std`. Candidate for
  cross-host bit-identical trig inside the runtime itself (plan §6.5);
  benchmark against platform libm before adopting in hot loops.

Parameter fitting (offline foundry only):

- [ ] `crates/fs-dfo/src/neldermead.rs` — 103 lines, zero deps; copy verbatim
  for final polish steps.
- [ ] `crates/fs-dfo` CMA-ES core loop (strip the BIPOP/replay ceremony) for
  ragged or multimodal landscapes; `moo::{nsga2,nsga3}` for Pareto fronts
  over competing spectral objectives (partials vs decay vs attack) instead
  of weighted sums.
- [ ] `crates/fs-ascent` — `lbfgs` plus `wolfe::strong_wolfe` for smooth
  ≤~30-parameter fits with exact gradients from `fs-ad` duals.
- [ ] `crates/fs-adjoint/src/verify.rs` — `verify_gradient` (f64-slices-only)
  as the mandatory fit-correctness gate.
- [ ] `crates/fs-surrogate` — `ConformalBand` certify-or-escalate (~150
  lines, zero deps in the default build) as the "proxy error band too wide,
  re-render the real thing" rule.
- [ ] `crates/fs-opt/src/guard.rs` — Goodhart-guard CONCEPT only; reimplement
  rather than extract. Spectral-distance objectives are exploitable: a fit
  can match magnitude spectra perfectly and still sound wrong. Perturbation
  checks around the optimum are the defense.

## 3. Offline eigenproblem recipes

- [ ] Real-symmetric `K φ = ω² M φ` (bar/plate/string modal bases): adapt the
  ~60-line Cholesky-reduction + LOBPCG pattern from
  `crates/fs-solid/src/stability.rs::buckling_loads`, swapping the geometric
  stiffness for the mass matrix; drive it with `fs-sparse::Csr::spmv` as the
  operator closure.
- [ ] Complex/non-self-adjoint (lossy bore, radiation-loaded columns): follow
  the `crates/fs-cheb/src/orr_sommerfeld.rs` collocation pattern with
  `lu_complex` and the dense complex shifted-QR `eig` from
  `fs-la/src/eigen_complex.rs`.
- [ ] Adopt the residual-derived `CertifiedEigenvalue` interval idea from
  `crates/fs-spectral/src/service.rs` so every pack mode carries an error
  bar, not a bare point estimate.

## 4. Honest no-go list (what FrankenSim cannot supply)

These confirm plan §7.1 with direct evidence; evidence claims must never
exceed them.

- No acoustic wave solver of any kind: `fs-lbm` enforces incompressible
  low-Mach flow (`MACH_LIMIT = 0.3`); `fs-bem` is Laplace/potential-flow
  only; `fs-fmm`'s kernel trait is structurally real-valued and excludes
  Helmholtz.
- No vibration eigenproblem entry point; the buckling code above is a
  pattern to adapt, not a facility to call.
- No damping or viscoelastic constitutive model anywhere (`fs-material` has
  zero Prony/Maxwell/loss-factor content). For instruments, damping is the
  decisive physics — it must come from primary literature and measurement
  (plan §18 authorities).
- No instrument-relevant material data (`fs-matdb` has no woods, no loss
  factors, no Q, no sound speeds; its schema is excellent and reusable, its
  seed data is aerospace/tribology/magnetics).

## 5. Open owner decision: license arbitration (blocks vendoring)

`/dp/frankensim/LICENSE` is the MIT License with the OpenAI/Anthropic Rider,
while `/dp/frankensim/Cargo.toml` `[workspace.package]` declares
`license = "MIT OR Apache-2.0"` for every crate. Extracted files therefore
inherit an ambiguous grant. Both repositories share the same owner, and this
repository's own LICENSE carries the same rider, but the grant that applies
to vendored files must be stated, not assumed.

**Owner question:** For Rust files vendored from `/dp/frankensim` into this
repository's offline foundry (and potentially `fs-math` into the runtime
WASM crate), which license grant applies — the repository-level MIT-with-
Rider, or the per-crate `MIT OR Apache-2.0` declared in the workspace
manifest — and what provenance text must each vendored file carry?

**Owner decision (2026-08-06):** the repository-level MIT License with
OpenAI/Anthropic Rider governs. This repository's `LICENSE`,
`/dp/frankensim/LICENSE`, and `/dp/asupersync/LICENSE` are byte-identical
MIT-with-Rider texts, and the owner has directed that this repository's
license match them; the per-crate `MIT OR Apache-2.0` line in the frankensim
workspace manifest does not extend a rider-free grant to extracted files.
Each vendored file must carry a provenance header naming the source
repository, source path, the pinned commit
`b47259187a31b704f8f0faf6abdf49b32919b96a`, the retrieval date, and the
statement that the file is distributed under this repository's MIT License
with OpenAI/Anthropic Rider. Vendoring for `jcpe-mnsc.3.2` is unblocked;
tracked question bead `jcpe-frankensim-license-arbitration-rbru` is closed
with this answer.

## 6. Practical gotchas for the foundry

- `fs-bo::minimize` panics above 10 dimensions (unguarded Sobol ceiling
  `MAX_SOBOL_DIM = 10`); guard the dimension or avoid BO for larger fits.
- `fs-dfo` optimizers are unconstrained — clamp/rescale parameters yourself;
  `fs-bo` box constraints are a single (lo, hi) shared by all dimensions.
- Everything is f64 and `std`; `fs-math` and `fs-ivl` are trivially
  `no_std`-able, the rest need surgery. The workspace nightly pin is
  `nightly-2026-07-06`, but extracted files are mostly stable-compatible —
  verify per file.
- Strip the determinism-receipt/admission/replay ceremony (roughly 50–75 %
  of lines in the larger crates); the numerics underneath are compact.
- No third-party crates anywhere in FrankenSim (hand-rolled BLAKE3, RNG,
  libm, LA), so no transitive license contamination — but sibling repos
  (`asupersync`, `frankenscipy`, `frankentorch`) ride along only through
  `fs-exec`-tainted files, which this map already excludes.

## 7. PHS1 work item: parameter-pack placeholder honesty

The production code currently derives `parameterPackSha256` by hashing a
NAME, not pack content (`src/audio/transport.ts:494`,
`src/application/studio-audio.ts:474`:
`sha256Hex("changes.physical.parameter-pack.<id>.v1")`). Until real reviewed
packs exist, PHS1 must rename or mark that field so it cannot be mistaken
for a content hash (e.g. `parameterPackPlaceholderId`), and the real pack
format must carry a true content hash plus the commit pin from §1. This is a
named PHS1 spec/build item; do not silently reinterpret the existing field.

## 8. Refined honest-use contracts (additive to §4; the no-go list stands)

Added 2026-08-06 (`jcpe-fsr-bem-endcorrections-db45`,
`jcpe-fsr-lbm-discharge-ix40`). The §4 no-go list remains true as written:
no acoustic wave propagation, ever. These two contracts carve out the
narrow regimes in which the same solvers are exactly the right tool, and
each carries a pilot validation gate that must pass before the recipe is
trusted on instrument geometry.

### 8.1 fs-bem: compact-limit inertance end corrections

- [ ] Contract: in the compact limit (ka ≪ 1, aperture radius acoustically
  small), the acoustic inertance end correction of an aperture is a Laplace
  added-mass problem — the classic 0.6133a unflanged and 0.8216a flanged
  circular-aperture corrections are potential-flow results. `fs-bem` may
  therefore compute geometry-accurate end corrections for arbitrary
  tone-hole shapes, chimney heights, undercut holes, and the flute
  embouchure hole. It remains forbidden to describe this as radiation or
  Helmholtz solving; radiation damping still comes from reviewed reduced
  models and literature.
- [ ] State the compact-limit validity bound (the ka at which the correction
  was computed and the frequency range over which it is applied) on every
  fixture that consumes a computed correction.
- [x] Pilot validation gate (run 2026-08-06, `jcpe-fsr-bem-endcorrections-db45`):
  the CLOSED-BODY added-mass route is validated — oblate-spheroid sweep with
  clean monotone h-convergence, disk-limit extrapolation
  `m/rho -> 2.71483` vs the exact `8/3` (+1.81%), i.e. aperture end
  correction `delta = 0.8642a` vs the uniform-profile analytic
  `8/(3*pi) = 0.84883a`. The mixed flanged-pipe surface formulation
  targeting the pressure-profile constant 0.8216a did NOT converge inside
  fs-bem's work envelopes (M2L cap at >=3456 panels, near-field cap at
  31,104; best result −23.5%). Consequence for instrument use: derive
  end corrections through closed-body/added-mass formulations validated
  against analytic added-mass targets; do not use large mixed
  open-pipe surface meshes without first raising or budgeting the crate's
  work caps. Full logs in the pilot bead's close reason.
- [ ] Audible-outcome honesty: this improves fingering-dependent tuning and
  register accuracy from geometry (replacing per-note empirical pulls per
  plan §9.2); it does not by itself change timbre.

### 8.2 fs-lbm: quasi-static discharge coefficients

- [ ] Contract: steady/quasi-static viscous flow through a reed channel or
  tone hole at low Mach is incompressible low-Mach flow — exactly what
  `fs-lbm` solves (its `MACH_LIMIT = 0.3` stands). Use it offline to fit
  Reynolds-dependent discharge/vena-contracta coefficients Cd(Re) that are
  currently fixed literature constants inside the reed and jet flow
  equations. It remains forbidden to describe this as jet, turbulence, or
  acoustic simulation; the coefficients enter the reduced models as fitted
  tables with provenance.
- [ ] Audible-outcome honesty: Cd(Re) sets the position of the pressure–flow
  knee — where the clarinet speaks and how dynamics respond to breath
  gestures — not a new sound source.
- [x] Pilot validation gate, first pass (run 2026-08-06,
  `jcpe-fsr-lbm-discharge-ix40`): D2Q9 slot flow at Re 50/100/202 measured
  Cd = 0.699/0.705/0.698 (three downstream planes, steady, Mach <= 0.122,
  flux imbalance 0.7–6%), versus the 2D free-streamline thin-plate ideal
  `pi/(pi+2) = 0.611`. The +14–15% excess is physically consistent with
  the pilot geometry's plate thickness (t/w = 0.125) and confinement
  (w/H = 0.125), both of which raise Cd — the quasi-static fitting recipe
  is demonstrated end-to-end within contract.
- [ ] Remaining sub-gate before reed-channel fitting is trusted: a
  geometry-isolation control (thinner plate and/or lower confinement)
  showing Cd trending toward the thin-plate ideal, so the excess is
  attributed by measurement rather than argument. Note also the Re-202
  run's 6% flux imbalance: outlet-reflection sensitivity means source
  extraction work needs the absorbing-layer treatment first.

## 9. Pack-fitting methodology (normative for foundry fits)

Added 2026-08-06 (`jcpe-fsr-fitting-methodology-2kw9`). Pack fitting is
multi-objective and render-expensive; scalar weighted sums are how models
end up metrically green and audibly wrong. Every foundry fit binds these
four practices, all deterministic, seeded, offline, and pinned to the §1
commit:

- [ ] Multi-objective fronts, not weighted sums: fit competing spectral
  objectives (attack fidelity, decay slopes, tuning residual, HNR,
  brightness) with `fs-dfo` NSGA-II Pareto fronts, and put knee candidates
  in front of the owner's ears. The listening gate chooses among honest
  trade-offs; it never ratifies a hidden weighting.
- [ ] Multi-fidelity loops: use `fs-bo` co-kriging with short/coarse renders
  as the cheap arm and full 96 kHz renders with the complete metric battery
  as the expensive arm. Per-component fits stay at or below 10 dimensions —
  `fs-bo::minimize` panics above the Sobol ceiling (§6) — and the dimension
  guard is asserted, not assumed.
- [ ] Goodhart guard: reimplement the `fs-opt` guard concept as perturbation
  checks around every accepted optimum, demonstrating the fit is not
  exploiting the metric (a perfect magnitude match with the wrong sound
  must be detectable). A fit without its guard evidence is not acceptable.
- [ ] Conformal certify-or-escalate: when a surrogate's `ConformalBand` error
  band is too wide to certify a candidate, re-render the real thing; never
  accept a surrogate-only optimum.

## 10. Evidence methodology: oracles and certified passivity

Added 2026-08-06 (`jcpe-fsr-oracle-fixtures-twyn`,
`jcpe-fsr-passivity-cert-zrqk`). Converts "sounds plausible" into "provably
tracks the reference physics" — the same measure-don't-assume law that
caught the +24-cent flute detune.

- [ ] Oracle-versus-reduced fixtures: every reduced component with a
  closed-form reference (the v2 modal kernel against the exact discrete
  damped-oscillator solution; reed roots against an independently
  re-implemented residual) carries an independent oracle fixture with an
  authored tolerance and a mutation control that must fail. For future
  stateful exciters without closed forms, the offline oracle is
  `crates/fs-time/src/rk45.rs` (RK45 with PI step control) run at tight
  tolerance, vendored under the §5 MIT-with-Rider decision with provenance
  headers; the fixture then bounds reduced-versus-oracle residuals.
- [ ] Certified passivity over parameter boxes: sample-point passivity checks
  are necessary but not sufficient. Where a filter has a closed-form
  |H| supremum (one-pole loss, DC blocker, tuning allpass), certify
  sup |H| ≤ 1 analytically over the entire legal coefficient range with
  conservative epsilon inflation, in the test suite, now. For filters
  without closed forms, the production path is the `fs-ivl`
  outward-rounded interval + Krawczyk port in the PHS1 build, certifying
  each pack's coefficient box per version. JS float evaluation is never
  claimed to be rounding-rigorous; the epsilon inflation and its rationale
  are stated where used.

## 11. Contact, hysteresis, and correlated-mode references

Added 2026-08-06 (`jcpe-fsr-felt-hysteresis-21sx`, `jcpe-fsr-cqc-modes-iguq`,
`jcpe-fsr-squeak-34v5`).

- [ ] Felt and mallet-wrap hysteresis: piano hammer felt is the canonical
  hysteretic nonlinear spring (Stulov generalization of Hertz) — loading
  and unloading follow different force–compression paths, which is what
  makes attack brightness velocity-dependent. Fit Stulov-class laws offline
  from provenance-pinned literature force–compression loops using
  `fs-material`'s fiber-hysteresis machinery with `fs-ad` exact tangents
  and the `verify_gradient` gate (§2). Consumers: the piano
  sustain-pedal package's hammer-law spec item (live only with a future
  physical hammer path — stated there) and the PHS6 mallet-wrap
  accepted-variant note. Composes with the Hertz/Hunt–Crossley core in §2.
- [ ] CQC correlated-mode summation: near-degenerate body-mode pairs summed
  as independent resonators produce phasing artifacts; their correlation is
  part of the dreadnought "breathing" sound. Port the CONCEPT of
  `crates/fs-uq/src/seismic.rs` (complete quadratic combination over SDOF
  banks) into the PHS4 body-bank spec — cross-correlation coefficients for
  mode pairs closer than their bandwidths. Concept port, not a code path;
  the fixture is analytic (closed-form beat/level behavior), never
  production-derived.
- [ ] Stick-slip transients: `crates/fs-tribo/src/partial_slip.rs`
  (Cattaneo–Mindlin partial-slip return map, zero-dep, `forbid(unsafe)`)
  is the port source for the PHS4 deterministic slide/fret squeak
  transient model, under the §5 provenance rule. It is also the long-term
  skeleton for arco upright bass, which stays deferred as its own package.

## 12. Offline plate-mode solver recipe (per-body mode tables)

Added 2026-08-06 (`jcpe-fsr-plate-modes-sleq`). The plucked-string family's
body-size differentiation (ukulele versus dreadnought versus archtop versus
upright bass, plan §10) requires per-body mode tables derived from geometry,
not hand-tuning. FrankenSim has no plate eigenproblem (§4 stands); we author
the discretization and drive it with the §3 eigensolver recipes.

- [ ] Discretize the Kirchhoff–Love thin-plate biharmonic eigenproblem
  D∇⁴w = ρh ω²w over the plate outline (finite differences or 1D-tensor
  FEM from `crates/fs-feec/src/highorder/quad1d.rs` element matrices), with
  boundary conditions stated per instrument (simply-supported for
  validation; real edges are between clamped and supported and the choice
  is recorded, never silently mixed).
- [ ] Solve with the §3 real-symmetric recipe (Cholesky reduction + LOBPCG
  from `fs-la`), each mode carrying a §3 certified-interval error bar.
- [ ] Validate the solver against the analytic simply-supported rectangular
  plate before any instrument use:
  f_mn = (π/2)·√(D/(ρh))·((m/a)² + (n/b)²), with the discretization-error
  trend under grid refinement recorded. A scratch prototype demonstrating
  the validation and a two-geometry (ukulele-scale versus
  dreadnought-scale) mode-table comparison is the pilot gate; production
  port belongs to the PHS1 build (`jcpe-mnsc.3.2`).
- [ ] Use orthotropic wood constants from provenance-pinned literature (the
  isotropic constant is a validation-only convenience); couple the lowest
  panel modes to the body's Helmholtz air resonance as a reviewed reduced
  coupling, and take Q from primary-literature loss factors — FrankenSim
  supplies no damping data (§4).
- [ ] Output: a per-body mode table (frequencies, Q, gains referenced to the
  bridge drive point) in the parameter-pack format with the §1 commit pin
  and §5 provenance rule; bracing/ribs and drive-point weighting enter as
  reviewed refinements with their own fixtures, never as silent tweaks.
