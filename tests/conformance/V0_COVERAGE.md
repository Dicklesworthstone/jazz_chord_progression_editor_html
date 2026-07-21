# V0 Conformance Coverage

Status: verification authority

The specification is `docs/V0_VOICING_CONTRACT.md`, backed by the reviewed
companions under `tests/fixtures/voicing/`. Production output was not used to
author their expectations. The evidence verifier binds the fixture bytes,
executed semantic observations, exact test inventory, trace graph, and raw
logs into one SHA-256-addressed ledger.

## Requirement coverage

Every row below is mandatory. A checked-in fixture or a passing corpus
validator establishes authority shape; it does not establish production
execution.

| Contract area | Required inventory | Executed target | Divergent | Required score |
|---|---:|---:|---:|---:|
| Semantic applicability scan | 112 positions | 112 | 0 | 100% |
| Availability matrix | 1,295 cells | 1,295 | 0 | 100% |
| Family, slash-state, and bass-policy matrix | 42 states | 42 | 0 | 100% |
| Candidate goldens and refusals | 38 cases | 38 | 0 | 100% |
| Laws and independent witnesses | 23 laws / 44 witnesses | 23 / 44 | 0 | 100% |
| Operation state and applicability | 32 cases | 32 | 0 | 100% |
| Work, memory, identifier, MIDI, retention, and wall-time bounds | 63 cases | 63 | 0 | 100% |
| Spelling-aware forward and inverse transposition | 18 x 12 cells | 216 | 0 | 100% |
| Semantic mutation controls | 51 controls / 104 direct links | 51 / 104 | 0 | 100% |
| Reciprocal requirement trace graph | 15 traces / 8 authorities | 15 / 8 | 0 | 100% |

The evidence command computes the executed column from signed observations and
raw JUnit output. This document does not grant a pass by itself. Unknown,
unobserved, duplicated, skipped, retried, quarantined, or expected-failure
records fail the package.

## Verification applicability

V0 is a synchronous, pure Theory value operation. Applicability is fixed so a
downstream adapter test cannot be mislabeled as either V0 coverage or a V0
omission.

| Evidence surface | V0 status | Owner | Required proof |
|---|---|---|---|
| Public voicing generation and stored bypass | applicable | V0 | Execute the reviewed matrices, cases, laws, limits, and exact result/evidence projections through public Theory entry points. |
| Deterministic bounded search and memory | applicable | V0 | Prove every work and memory cap at exact and attempted-plus-one, immutable no-partial refusal, replay, and exact semantic counters. Host wall time is recorded but never gates music. |
| Spelling-aware transposition and inverse | applicable | V0/verify | Execute all 18 reviewed seeds through all 12 roots with range/context transposed together; retain C-sharp and D-flat as distinct spelling witnesses. |
| Reviewed mutation controls | applicable | V0/verify | Apply every reviewed semantic counterfactual to every direct killer link; require baseline-oracle pass, coherent targeted mutation, and mutant-oracle failure. Source-mutant execution is reported separately as zero. |
| Layer purity and ambient isolation | applicable | V0/verify | Prove Theory imports only Domain, accepts injected content evidence, remains synchronous, and cannot read clock, random, network, UI, document revision, neighbor, audio, storage, or adapter state. |
| Cancellation and resume | not applicable | later bounded application operations | V0 completes one synchronous bounded call and has no token, checkpoint, yielded result, or resumable state. |
| Stale document revision | not applicable | application | V0 accepts immutable value inputs and owns no document store or revision. |
| Browser, accessibility, storage, download, audio, and MIDI adapters | not applicable | U0-Q0, P0-E0, X0-X1 | V0 owns no browser or adapter behavior; static boundary proof establishes that absence. |
| Cleanup and lifecycle leaks | not applicable | browser/audio/application adapters | V0 acquires no timers, listeners, nodes, object URLs, storage handles, or external resources. |

## Mutation evidence classification

V0 uses executable semantic-output counterfactuals with independently authored
fixture oracles. Each control selects a detector-relevant projection from a
real production observation, applies its named fault, proves that the baseline
matches the independent expectation, proves the mutant does not, and records
the exact changed paths and before/after hashes. All 104 declared direct links
must execute.

These are semantic counterfactual executions, not patched source binaries. The
ledger therefore reports source mutants executed and killed as zero, separately
from semantic operators and direct links executed and killed.

## Golden stability and review

| Artifact | Deterministic | Platform-dependent | Volatility | Comparison |
|---|---|---|---:|---|
| Reviewed V0 fixture JSON | yes | no | 2 | exact byte and canonical semantic SHA-256 |
| Production semantic observations | yes | no | 2 | canonical stable-JSON SHA-256 |
| Environment and child resource metadata | no | yes | 4 | typed structure; never a musical oracle |

There is no update-from-production mode. A changed expectation requires an
independently reviewed fixture edit, an exact diff, the corpus validator, its
tamper tests, and a new evidence run. Production output may expose a mismatch;
it may never generate or approve the expected value.
