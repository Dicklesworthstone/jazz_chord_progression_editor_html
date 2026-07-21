# V1 Independent Trace Review

Status: reviewed evidence input for `V1/verify`

Package: V1 — exact noncrossing pairwise voice assignment

This review was authored from the public contract, independent fixture package,
production implementation, and focused verification surfaces. Production output
was treated as an observation, never as the source of an expected value. The
machine-readable authority remains the nine reviewed JSON files under
`tests/fixtures/voice-assignment/`.

## Review method

The review followed each public request from fixture materialization through
validation, the two-dimensional dynamic program, backtrace, identity
publication, arc/cost/relation construction, and immutable result publication.
It separately inspected the exhaustive small-case oracle, public boundary
materializer, exact-plus-one accounting seam, transposition suite, semantic
counterfactual runner, evidence verifier, and static layer/capability checks.
The transposition suite derives its scenario inventory from the reviewed law
fixture, binds all 12 law rows to executed observation digests, proves replay
and immutable ownership on both sides, and checks the shifted `V1-ASN-016`
winner against an exhaustive oracle that imports only public contract types.

The following commands are the acceptance surface. A package is not considered
verified unless every command exits zero from the same current input snapshot:

```text
bun scripts/validate-v1-contract.ts
bun node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
bun node_modules/typescript/bin/tsc -p tsconfig.v1-tests.json --noEmit
bun node_modules/typescript/bin/tsc -p tsconfig.v1-unit-tests.json --noEmit
bun node_modules/eslint/bin/eslint.js scripts/validate-v1-contract.ts scripts/verify-v1-evidence.ts src/test-support/v1-accounting-probes.ts src/theory/voice-assignment-contract.ts src/theory/voice-assignment.ts tests/conformance/v1-mutation-controls.test.ts tests/conformance/v1-production-conformance.test.ts tests/property/v1-assignment-oracle.test.ts tests/property/v1-transposition-laws.test.ts tests/static/v1-contract.test.ts tests/static/v1-evidence.test.ts tests/static/v1-type-contract.test.ts tests/support/v1-assignment-fixtures.ts tests/support/v1-conformance.ts tests/support/v1-independent-oracle.ts tests/support/v1-public-boundaries.ts tests/unit/v1-accounting-probes.test.ts tests/unit/v1-voice-assignment-validation.test.ts tests/unit/v1-voice-assignment.test.ts --max-warnings 0
bun scripts/verify-v1-evidence.ts
```

The final command snapshots every declared contract, production, authority,
harness, review, and tooling input before and after its run. It executes the
contract validator and exact focused test inventory with zero retries, rejects
skip/todo/only/quarantine relaxations, validates the observation markers, and
writes `test-results/v1-evidence.json`. Only an `outcome: pass` ledger with zero
findings is closure evidence.

## Trace-by-trace disposition

| Trace | Independent evidence reviewed | Disposition |
|---|---|---|
| `V1-TRACE-BOUNDARY` | `tests/static/v1-evidence.test.ts`, the verifier's TypeScript-AST production inspection, `V1-OP-005`, and `V1-OP-017` prove a pure synchronous theory operation with no ambient semantic input. | Covered |
| `V1-TRACE-COSTS` | Exact fixture projections in `V1-ASN-008`, `V1-ASN-011`, and `V1-ASN-012`, plus executable controls 007, 008, 015, and 025–027, cover alignment, motion, spacing, guide doubling, color omission, and span as separate axes. | Covered |
| `V1-TRACE-DETERMINISM` | `tests/conformance/v1-production-conformance.test.ts` executes every reviewed case twice, compares semantic and raw-result digests, captures the input before execution, and checks recursive freezing and detachment. Controls 020, 021, 028, and 035 change the bound semantic projection and are rejected. | Covered |
| `V1-TRACE-DP-ORDER` | `tests/property/v1-assignment-oracle.test.ts` independently enumerates only bounded 3x3, 3x4, 4x3, and 4x4 order-preserving paths and compares the winner to production. Cases 006–009, 014, and 018 cover gaps, ties, crossing locks, and the maximum matrix. | Covered |
| `V1-TRACE-GAPS` | Cases 006–008, 017, and 018 assert explicit enter/leave branches, null motion, exact gap cost, fresh entering IDs, and retired-ID nonreuse. Controls 004–008, 019, and 030 materialize the corresponding faulty outputs. | Covered |
| `V1-TRACE-GUIDE-TONES` | Case 011 and `V1-OP-008` preserve exact degree number/alteration and role provenance. Controls 022–027 change guide continuity, null-degree handling, spacing, doubling, or color satisfaction and fail the independent projection. | Covered |
| `V1-TRACE-IDENTITY` | Cases 003–005 and 008 distinguish exact MIDI, pitch class, spelled pitch class, spelled pitch, degree, and request-local voice identity. The C/C-sharp regression and enharmonic/octave near misses are explicit. | Covered |
| `V1-TRACE-IMMUTABILITY` | The production conformance observer serializes requests before either execution, requires byte-equivalent input afterward, recursively checks frozen outputs, and rejects caller-owned aliases. Control 036 mutates the bound request projection and is killed. | Covered |
| `V1-TRACE-LEGACY` | `V1-ASN-003` owns actual runtime assignment and `V1-ASN-005` owns the C versus C-sharp regression. Both execute production and compare with independently authored exact projections. | Covered |
| `V1-TRACE-LIMITS` | Nine public exact/near-miss boundaries execute through `tests/support/v1-public-boundaries.ts`. All 29 work and memory exact-plus-one rows execute through the private accounting seam and prove first-prospective-excess, all-or-nothing refusal. | Covered |
| `V1-TRACE-LOCKS` | Cases 013–014 and operations 012–013 cover exact request/event/voice/pitch/degree binding, stale evidence, satisfied evidence, ordered crossing, and no relaxation. Controls 001–002 and 033–034 change those outcomes and are killed. | Covered |
| `V1-TRACE-MOTION` | Case 012 publishes signed motion and exact stationary, oblique, contrary, parallel, and similar relation counts. Controls 014–017 and 037 independently alter each distinction. | Covered |
| `V1-TRACE-REFUSALS` | `tests/unit/v1-voice-assignment-validation.test.ts` exercises global code-major precedence, same-code frame/ordinal order, schema/policy/request/frame/provenance/role/ID/lock failures, and pitch projection outside MIDI. Public and accounting boundary suites prove no partial publication. | Covered |
| `V1-TRACE-TIES` | Cases 009 and 017 plus the exhaustive oracle prove complete-path comparison rather than last-predecessor or iteration order. Control 028 reverses the complete path and is rejected. | Covered |
| `V1-TRACE-VOICE-IDS` | Initialization and cases 002, 008, 009, and 017 cover low-to-high allocation, matched propagation, entering allocation, retirement, chaining, and the exhausted sentinel. Controls 018–021 change the lifecycle and are rejected. | Covered |

## Counterfactual evidence boundary

The mutation suite executes semantic counterfactuals, not a general-purpose
source-code mutation tool. Each reviewed control/link starts with a real runtime
request and result whose focused projection must equal the independent fixture.
The named faulty behavior is then materialized against that bound request and
projection. The row is killed only when the baseline equals the expected digest,
the mutant projection differs, the semantic-result digest differs, and the full
execution digest binds the operator, control fixture, request, projections,
results, changed paths, and decision. Algorithm-shape controls also change the
observable path/work projection; static AST inspection separately proves the
production implementation remains a bounded two-dimensional DP with no ambient
or forbidden dependency.

This is deliberately narrower and more auditable than claiming an unconfigured
whole-program mutation framework. A prose label or two unrelated hashes cannot
count as a kill.

## Applicability and limitations

V1 is a headless pure value operation. Browser rendering, audio, persistence,
download, cancellation, resume, and application-revision behavior are not V1
adapters and are neither mocked nor claimed here. Request-stale lock handling is
covered; document-revision staleness belongs to A0/U6. Pairwise V1 returns one
canonical assignment; progression-wide alternatives and cooperative
cancellation belong to V2. Wall time is recorded only as performance evidence
and cannot select or truncate a result.

The review found no permitted silent repair, crossing-capable selector,
string-prefix identity comparison, partial result, caller-input mutation, or
unbounded search in the inspected V1 production closure. Closure still depends
on the current-snapshot verifier producing a passing, zero-finding ledger; this
document alone is not self-certifying evidence.
