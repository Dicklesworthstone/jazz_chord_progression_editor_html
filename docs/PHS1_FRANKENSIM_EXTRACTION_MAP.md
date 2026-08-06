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
