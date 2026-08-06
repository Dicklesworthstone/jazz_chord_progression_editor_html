# PHS1 Offline Instrument Foundry Contract

Status: normative specification for `jcpe-mnsc.3.1`. This packet specifies an
offline calibration tool; it does not claim that calibrated instrument packs or
vendored FrankenSim code exist.

## Boundary

The foundry turns reviewed measurements and literature values into immutable,
content-addressed parameter packs. It is never shipped in the browser, never
runs during playback, and never uses the network or a model. Runtime synthesis
may consume only a validated generated Rust table plus its pack digest.

`/dp/frankensim` is an algorithm source, not a dependency. The surveyed pin is
`b47259187a31b704f8f0faf6abdf49b32919b96a`; file extraction remains blocked
until `jcpe-frankensim-license-arbitration-rbru` records the applicable grant.
The no-go facts in `PHS1_FRANKENSIM_EXTRACTION_MAP.md` are binding: FrankenSim
does not provide an acoustic wave solver, vibration eigensolver, damping model,
or instrument material corpus.

The current `parameterPackSha256` values in playback plans hash placeholder
names rather than pack bytes. They remain explicitly legacy placeholders. PHS1
build must not relabel them as content hashes. A real pack uses
`contentSha256`, computed over canonical JSON excluding that field, and the
runtime table records the same digest.

## Canonical pack

A pack is schema `changes.physical.parameter-pack.v1`. Canonical JSON sorts
object keys lexicographically, preserves array order, emits finite JSON numbers
in their shortest round-tripping form, uses UTF-8 without BOM, and ends with one
LF. The content digest is SHA-256 of that encoding with `contentSha256` omitted.

Every scalar parameter records: stable ID, SI unit, finite value, inclusive
reviewed range, source authority ID, measurement or literature method, license
grant, and sensitivity classification. Every pack also records instrument
family, pack version, source-data digests, solver name/version/commit/config,
objective definitions and weights, fit seed, iteration/evaluation bounds,
terminal residuals, perturbation/sensitivity results, reviewer identity and
review date, and distribution class.

Only these distribution classes exist:

- `distributable`: sources and derived tables may be checked in and shipped.
- `local-evidence-only`: raw data stays outside the repository; a reviewed,
  non-reconstructive metric receipt may be checked in, but no runtime pack is
  generated.
- `forbidden-runtime`: provenance or license is unresolved; validation refuses
  Rust generation and runtime admission.

Pack generation is fail-closed. Unknown units, missing grants, non-finite
values, out-of-range values, digest disagreement, uncertified modes, excessive
residuals, sensitivity outside the reviewed envelope, or a solver exceeding a
declared work bound are errors. Wall time never changes a result.

## Deterministic foundry pipeline

1. Decode and validate sources; verify byte digests before parsing values.
2. Normalize explicitly declared units to SI. No inferred or guessed units.
3. Build the bounded physical problem from the reviewed model configuration.
4. Derive modal bases with residual intervals, never bare eigenvalues.
5. Fit with a fixed seed and fixed evaluation budget. Gradient-based fits must
   pass a directional finite-difference check; proxy fits must certify their
   error band or escalate to the real renderer.
6. Evaluate all independent metrics and Goodhart perturbations. An aggregate
   score cannot hide a failed metric or regime.
7. Canonicalize, hash, and generate a sorted Rust table. Regeneration from the
   same inputs must be byte-identical on supported hosts.

The generated table contains data only: schema/version, family, digest,
parameters, certified mode intervals, and reviewed applicability bounds. It
contains no optimizer, source parser, filesystem access, network access, or
runtime fallback fitter.

## Independent audio and physics metrics

The independently authored cases in `metric-cases.json` define analytic
signals and expected results without importing production synthesis. The
required metric families are fundamental pitch, partial frequency/amplitude,
input-impedance peak location/Q, attack and release timing, spectral centroid,
harmonic-to-noise ratio, odd/even harmonic balance, partial trajectories,
bandwise decay slopes, register/dynamic regime classification, modulation
sidebands, alias-band energy, boundary continuity, normalized energy residual,
and limiter activation.

Instrument acceptance adds measured targets, but may not weaken these common
laws. Each family package must include positive, negative/near-miss,
transposition or dimensionless-invariance, and single-variable mutation cases.
Frequency comparisons use cents when pitch-relative; decay uses dB/s; time uses
seconds; energy and ratios state their normalization explicitly.

## Boundedness and receipts

One run declares at most 64 parameters, 512 source observations, 256 modes,
16 objectives, 32 regimes, 4096 optimizer evaluations, 64 gradient checks,
256 sensitivity perturbations, and 2 GiB scratch. Exceeding any bound refuses
before allocation or work. A receipt records input/output digests, exact tool
and solver revisions, host numeric profile, seed, work counters, per-metric
results, residual intervals, mutations, distribution decision, and the first
ordered diagnostic. It never embeds local-only raw measurements.

The fixtures and validator are specification evidence. Production foundry code,
real instrument packs, listening acceptance, and runtime integration belong to
PHS1/build and later instrument packages.
