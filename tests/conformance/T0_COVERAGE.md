# T0 Conformance Coverage

Status: verification authority

The specification is `docs/T0_SYNTAX_CONTRACT.md` version 1.1.0, backed by
the reviewed JSON companions under `tests/fixtures/theory/`. Production output
was not used to author those expectations. The fixture validator binds both
file bytes and sorted-object semantic digests.

## Requirement coverage

The trace ledger is the clause inventory. Every trace is mandatory; T0 has no
optional or intentionally divergent syntax behavior.

| Contract area | Mandatory traces | Executed target | Divergent | Required score |
|---|---:|---:|---:|---:|
| Symbol grammar, aliases, modifiers, formatting, ranges, suggestions | 12 | 12 | 0 | 100% |
| Chart modes, headers, structure, annotations, comments, time, repeats, transactions | 8 | 8 | 0 | 100% |
| Round trips, determinism, limits, and legacy refusal | 5 | 5 | 0 | 100% |
| **Total** | **25** | **25** | **0** | **100%** |

The evidence verifier computes the passing column from executed case and law
observations; this document does not grant a pass by itself. Every one of the
111 symbol rows, 82 chart rows, 17 laws, and 60 mutation controls must be
accounted for. An unknown, skipped, quarantined, or expected-failure row is a
package failure.

## Verification applicability

T0 is a synchronous, pure Theory package. Applicability is fixed here so a
missing downstream adapter test cannot be mislabeled as either T0 coverage or a
T0 omission.

| Evidence surface | T0 status | Owner | Reason and required proof |
|---|---|---|---|
| Public symbol/chart parse and format | applicable | T0 | Every reviewed fixture row executes through the public Theory index. |
| Private work-evidence seams | applicable | T0/verify | Boundary and replay cases compare exact counters, termination, delegation order, and hashes. |
| Domain/Theory integration and layer purity | applicable | T0/verify | Integration and static boundary tests exercise the real Domain values and forbid inverted imports. |
| Deterministic replay and seeded metamorphic laws | applicable | T0/verify | All four reviewed seeds and all 17 laws produce byte-stable observations. |
| Reviewed mutation controls | applicable | T0/verify | All 60 exact-case implications must discharge; source-mutant execution is reported separately as zero. |
| Performance and bounded termination | applicable | T0/verify | Exact input, token, structure, visitation, delegated-work, and formatter bounds gate the package. Child wall time and resource usage are recorded but are not musical cutoffs. |
| Cancellation and resume | not applicable | later bounded-search packages | T0 operations are synchronous, accept no cancellation token, and expose no resumable state. |
| Stale document revision | not applicable | application | T0 accepts immutable request values and has no document revision or store. |
| Cleanup and lifecycle leaks | not applicable | browser/audio/application adapters | T0 acquires no timers, listeners, nodes, object URLs, storage handles, or external resources. |
| Browser, accessibility, storage, download, audio, and MIDI | not applicable | U0-Q0, P0-E0, X0-X1 | The T0 contract names no such adapter; the owning downstream packages require real-adapter evidence. |

No applicability row is a waiver for a named T0 case. Local malformed shape
must win before a would-be resource limit where the contract says so, while a
valid first-excess item must terminate at its exact deterministic bound.

## Metamorphic-law strength

Scores use fault sensitivity times independence divided by runtime cost. The
review threshold is 2.0. These relations supplement exact fixture oracles; they
do not replace an available expected value with a weaker self-comparison.

| Law | Relation class | Sensitivity | Independence | Cost | Score |
|---|---|---:|---:|---:|---:|
| T0-META-001 | invertive symbol parse/format/parse | 5 | 5 | 2 | 12.50 |
| T0-META-002 | covariant root/style cross-product | 4 | 4 | 2 | 8.00 |
| T0-META-003 | permutative legal modifiers | 5 | 4 | 3 | 6.67 |
| T0-META-004 | permutative fault location | 4 | 4 | 2 | 8.00 |
| T0-META-005 | structural extension invariance | 5 | 4 | 1 | 20.00 |
| T0-META-006 | invertive chart export/import | 5 | 5 | 3 | 8.33 |
| T0-META-007 | additive exact-time conservation | 5 | 5 | 3 | 8.33 |
| T0-META-008 | equivalence across virtual/barred layout | 3 | 4 | 1 | 12.00 |
| T0-META-009 | equivalence with distinct repeat origin | 4 | 4 | 1 | 16.00 |
| T0-META-010 | exclusive comment erasure | 3 | 4 | 1 | 12.00 |
| T0-META-011 | additive UTF-16 range covariance | 5 | 5 | 2 | 12.50 |
| T0-META-012 | inclusive bounded suggestion policy | 4 | 4 | 2 | 8.00 |
| T0-META-013 | deterministic seeded replay | 5 | 3 | 4 | 3.75 |
| T0-META-014 | exclusive single-fault refusal | 5 | 5 | 2 | 12.50 |
| T0-META-015 | local replacement plus whole-candidate validation | 5 | 5 | 2 | 12.50 |
| T0-META-016 | one-pass visitation bound | 5 | 5 | 3 | 8.33 |
| T0-META-017 | mutation noninterference of frozen policy | 4 | 5 | 2 | 10.00 |

Compound relations deliberately chain canonicalization, reparsing, semantic
projection, and replay. Seeds and iteration order come from the reviewed law
fixture, not from runtime randomness.

## Mutation evidence classification

T0 uses `reviewed-exact-case-implication`, not a duplicate parser or formatter
implemented inside the tests. Each reviewed fault names the independently
authored cases that distinguish it. A control is discharged only when every
linked case or law executes, matches its expected observation, and contributes
to the hash-bound case inventory.

The ledger reports source mutants executed and source mutants killed as zero.
It separately reports reviewed controls discharged, survived, and unobserved;
all 60 must be discharged. This distinction prevents case coverage from being
misrepresented as direct source-mutation tooling.

## Golden stability and review

| Artifact | Deterministic | Platform-dependent | Volatility | Comparison |
|---|---|---|---:|---|
| Reviewed theory fixture JSON | yes | no | 2 | exact byte and semantic SHA-256 |
| Canonical symbol/chart observations | yes | no | 2 | canonical stable-JSON SHA-256 |
| Environment/resource metadata | no | yes | 4 | typed structure; never a musical oracle |

There is no automatic update-from-production mode. To change a reviewed
fixture, edit the independent expectation, run `bun run validate:t0-contract`,
inspect the exact JSON diff, obtain review, then update both reviewed digest
constants and rerun the validator plus its tamper tests. Production output may
help reveal a mismatch but may never supply or approve the expected value.
