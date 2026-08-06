# PHS1 Offline Foundry Build Evidence

Status: production build evidence for `jcpe-mnsc.3.2`, recorded 2026-08-06.

## Delivered boundary

The package is an offline TypeScript foundry library and deterministic receipt
runner. It validates content-addressed parameter packs against an injected
authority ledger, emits data-only sorted Rust tables, evaluates all 15 common
analytic metric families independently of the instrument renderers, and
refuses work beyond fixed limits before visiting any case. It adds no runtime
dependency and is not included in the browser artifact.

The only FrankenSim-derived numerical concept is the small velocity-Verlet
step in `scripts/physical-foundry-verlet.ts`. Its provenance record pins
`/dp/frankensim/crates/fs-time/src/symplectic.rs` at commit
`b47259187a31b704f8f0faf6abdf49b32919b96a`, source SHA-256
`bdf6f36d4679c9f5be1789952a3b738a070debbaf4eb8a8770fe7fba94102277`,
retrieval date 2026-08-06, and the owner-approved repository MIT License with
OpenAI/Anthropic Rider. The adjoint and surrounding FrankenSim machinery were
not copied.

## Deterministic receipts and bounds

`bun run verify:physical-foundry` visits 16 independently authored analytic
cases across 15 metric families. The expected near-miss alias refusal is a
conforming result, not a skipped case. Its canonical 2,461-byte stdout receipt
had SHA-256
`36697900fe89f7fab8b4ff01afc3310b588f69aa0c1214f9384cf19940bed3ef`.
The receipt records the input and result digests, numeric profile, tool
revision, seed, case count and maximum, ordered first diagnostic, and the fact
that wall time does not affect output.

The unit package covers canonical key ordering, finite-number refusal, digest
field exclusion, authority-ledger admission, distribution refusal, missing
license authority, inclusive parameter ranges, SI units, solver evaluation and
scratch bounds, residual and sensitivity near misses, certified mode intervals,
sorted byte-identical Rust regeneration, all known answers, an octave
transposition law, a mutated centroid oracle, 512-case boundary and 513-case
pre-work refusal, deterministic Verlet replay, shape refusal, and bounded
harmonic-oscillator energy error.

## Terminal commands

- `bun run validate:phs1-contract`: pass; 8 pack cases, 16 metric cases, 15
  families, 4 authorities, 6 traces, and 11 mutation controls; zero findings.
- `bun test tests/unit/physical-foundry.test.ts`: 33 pass, 0 fail, 83
  assertions, 1 file.
- `bun run typecheck`: pass.
- `bun run lint`: pass; source policy inspected 190 files with zero findings,
  and ESLint terminated with exit 0.
- `bun run verify:physical-foundry`: pass; 16/16 cases conform, deterministic
  receipt emitted.

Implementation SHA-256 values at the evidence point:

- `scripts/physical-foundry.ts`:
  `3790a4958b8b25e454e93ce66bfd20729560363ac1096b2e7167746cfd45ea1a`
- `scripts/physical-foundry-verlet.ts`:
  `6a98d725f9245c7410b86d7df800ddd87c81746158f26f588e61f0d52abbe22b`
- `tests/unit/physical-foundry.test.ts`:
  `cacad2da7ba0071dea89d45754537bddc952c4b5dfdf1c1bf053a79aa7ccf654`
- `tests/fixtures/physical-foundry/frankensim-extraction.json`:
  `f6c925be547b3fb8de388fe1addf6fb10609368193ed93f92334a14769e938c3`

## Claim boundary

This build supplies foundry machinery, synthetic known-answer controls, and
provenance enforcement. It does not claim a calibrated real-instrument pack,
permission to redistribute any reference recording or paper, browser runtime
integration, or human listening acceptance. Those require instrument-specific
measurement sources, reviewed grants, build packages, independent verification,
and owner listening. The existing playback-plan placeholder hashes remain
placeholders and were not relabelled as content hashes.
