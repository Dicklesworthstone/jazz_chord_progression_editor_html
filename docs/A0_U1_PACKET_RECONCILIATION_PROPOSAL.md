# A0/U1 Golden-Packet Reconciliation R1

Status: accepted correction packet. The owner recorded the exact acceptance
phrase `Accept A0/U1 reconciliation packet R1` on 2026-07-24, after the
corrections had been implemented and every named static validator, tamper
control, and independent executable fixture gate was green. The reconciled v2
packet in `docs/A0_U1_ATOMIC_EDIT_PLAN_CONTRACT.md` and
`tests/fixtures/a0-u1-edit-plan/` is now the frozen authority; the superseded
v1 laws listed below must not be restored.

This proposal resolved contradictions found while independently implementing
and replaying the A0/U1 atomic-edit-plan packet. It does not amend E0 or undo
the accepted E0 packet.

The recorded acceptance phrase was:

```text
Accept A0/U1 reconciliation packet R1
```

## 1. T0 diagnostic authority

### Finding

The literal `a0u1-ins-002-complete-syntax-refused` result says that T0's
`symbol.root_invalid` diagnostic at UTF-16 range `2..3` becomes
`chart.unsupported_notation` at `2..5`. The independent `parserEvidence` and
the real public T0 operation both return `symbol.root_invalid` at `2..3`.
Application production currently rescans the raw token and performs the
literal-required rewrite.

That rewrite gives A0 a second syntax classifier, conflicts with T0's exclusive
parser authority, and makes the independently authored parser evidence unable
to certify the expected result.

### R1 decision

A0/U1 must preserve each T0 diagnostic's `code` and half-open UTF-16 range
exactly. It may wrap the cause in the A0/U1 refusal envelope, sanitize messages,
sort the resulting structured diagnostics by the frozen diagnostic order, and
apply the retained-row cap. It must not rescan source text, extend a token
range, or substitute a syntax code.

The corrected literal cause for
`a0u1-ins-002-complete-syntax-refused` is therefore:

```json
{
  "sourceRange": { "start": 2, "end": 3 },
  "syntaxCode": "symbol.root_invalid"
}
```

The application-side `symbol.root_invalid` normalization branch is removed.
Positive, multi-diagnostic, ordering, range, and mutation proof must compare
against independently authored T0 evidence rather than production output.

## 2. Null insertion bookmark publication

### Finding

`StableUiBookmarks.insertion` may validly be `null`, independently of a
non-null QuickEntry target. A successful insert still has an exact new
insertion boundary after the last inserted structural item.

The accepted receipt union has only a non-null-to-non-null
`move-after-last-inserted` branch. Production currently substitutes the
QuickEntry target for the absent before bookmark and publishes that invented
boundary as `insertionRewrite.from`. History correctly records that the actual
before bookmark was `null`, so the receipt and history contradict each other.

### R1 decision

The corrected public contract and receipt schemas advance to v2:

```text
changes.application.atomic-edit-plan-contract.v2
changes.application.atomic-edit-plan-receipt.v2
A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION = 2
```

Insert receipts gain this correlated creation branch:

```ts
type AtomicEditPlanCreatedInsertionReceipt = Readonly<{
  insertionPolicy: "create-after-last-inserted";
  insertionRewrite: null;
  insertionCreated: AtomicEditPlanBoundary;
  insertionCleared: false;
}>;
```

The insert bookmark receipt admits exactly:

- `AtomicEditPlanCreatedInsertionReceipt` when the before insertion bookmark is
  `null`, where `insertionCreated` is the exact new after boundary; or
- the existing `move-after-last-inserted` branch with one exact
  `{from, to}` rewrite when the before insertion bookmark is non-null and no
  `insertionCreated` key is present.

In both branches the after bookmark is the exact boundary after the last
inserted event, measure, or section. A QuickEntry target proves placement; it
is never reported as a bookmark that did not exist.

The generic insert operation policy becomes
`preserve-selection-and-range-set-insertion-after-last-inserted`. “Set” is
true for both creation and movement. The conditional receipt extension freezes
`insertionCreated` only on the creation branch; adding
`insertionCreated: null` to unrelated branches is forbidden.

Null-to-non-null creation increments `bookmarkRecordsRewritten` once because
the insertion record changed. It does not increment
`bookmarkRecordsExamined`, because there was no before insertion record to
examine. The existing focus priority then uses the created non-chart
insertion target.

Refusing an otherwise valid state or silently preserving `null` is not
permitted. A golden null-insertion apply/undo/redo sequence and a semantic
tamper that alters `insertionCreated`, fabricates `insertionRewrite.from`, or
confuses the two policies are required.

## 3. Completion-array horizon and text-work ceiling

### Finding

The accepted `6,769` counter ceiling covers the three maximum-size join-section
metadata objects plus one code-point witness:

```text
3 * (256 name + 2,000 annotation) + 1 = 6,769
```

It does not cover the fully shaped first extra completion declaration that
must reach the later `edit-plan.completion-declarations-mismatch` stage. That
row may contain a 2,000-code-point pickup/incomplete reason, or a 2,001st
over-limit/invalid-scalar witness. Current production exhausts the aggregate
budget after one reason code point, marks the scan `truncated`, accepts the
unvalidated suffix, and later returns the completion mismatch.

Merely raising the counter is insufficient. Without a correlated array
horizon, runtime shape validation may descend an arbitrary number of supplied
completion rows.

### R1 decision

The runtime-shape horizon for each completion tuple is:

```text
expected tuple cardinality + one first-unpaired witness
```

The array length is read through its own data-property descriptor before child
capture. A length beyond the horizon is
`edit-plan.plan-shape-invalid` at the completion-array path; no child beyond
the horizon is captured or scanned. Every row within the horizon is validated
completely before the completion-declaration comparison stage:

- a malformed expected or first-extra row is the earlier shape refusal;
- a fully shaped first-extra row reaches
  `edit-plan.completion-declarations-mismatch` at its index;
- a missing expected row reaches the same mismatch stage; and
- no truncated text scan is ever treated as valid.

| Plan/lane | Expected rows | Shape horizon | Maximum metadata | Maximum reason text | Full accepted-shape scan | First excess |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Complete insert into measure | 1 | 2 | 0 | 4,000 | 4,000 | 4,001 |
| Complete insert into section/document | 0 | 1 | 0 | 2,000 | 2,000 | 2,001 |
| Recovered insert into measure | 1 | 2 | 0 | 4,000 | 4,000 | 4,001 |
| Split event | 1 | 2 | 0 | 4,000 | 4,000 | 4,001 |
| Join events | 1 | 2 | 0 | 4,000 | 4,000 | 4,001 |
| Split section | 0 | 1 | 2,256 | 2,000 | 4,256 | 4,257 |
| Join sections | 0 | 1 | 6,768 | 2,000 | 8,768 | 8,769 |

The frozen accepted-shape aggregate becomes `8,768` code points and
`metadataCodePointsObserved` becomes at most `8,769`, including the first
invalid or over-limit witness. The existing per-field limits remain unchanged.

Gross-cardinality, exact `8,768`, first-excess `8,769`, invalid-surrogate at
the last reachable position, and malformed-first-extra precedence fixtures are
required. The implementation must report physical work actually performed;
it may not clamp a larger hidden scan to the public maximum.

## 4. QuickEntry issue-code invariant

### Finding

The snapshot law defines `issueCodes` as an exact ordered string sequence.
Live A0 preserves duplicate codes, but the packet validator and production
runtime shape currently reject them with `Set` semantics. Live A0 also enforces
only the 64-row array bound, while A0/U1 independently imposes a per-code token
bound. That leaves some A0-accepted states impossible to snapshot exactly.

### R1 decision

QuickEntry issue codes are an ordered sequence, not a set. Repeated equal codes
are permitted, significant, preserved, and compared at their original
positions.

The common accepted-state and A0/U1 shape invariant is at most 64 codes, each a
nonblank valid-Unicode-scalar string of at most 128 code points. Live
`set-quick-entry` enforces that invariant before publishing state; the
atomic-edit shape gate mirrors it. An already-corrupted non-authoritative state
does not weaken the command shape gate.

The validator and production `Set` checks are removed. Proof includes a literal
state and snapshot with the same duplicate sequence that reaches T0 or a later
stage, plus duplicate-count mismatch, order mismatch, and per-code
maximum/first-excess cases.

## 5. Mechanical boundary corrections required with R1

These findings do not introduce another product choice, but the corrected
build may not close without them:

1. Every proxy-sensitive reflection operation, including `Array.isArray`,
   must be inside the descriptor-capture refusal boundary. A revoked or hostile
   proxy returns the frozen shape refusal and never throws through the public
   runner. Root and nested revocation cases must retain their exact frozen
   paths and perform zero downstream work.
2. The implementation leaf must complete the already-specified live cutover:
   merge `apply-edit-plan` into the live command/history surface, dispatch it
   through application operations and the controller composition, and bind
   the real public T0 parser plus F2/F3 and history dependencies. A separately
   exported sibling runner is useful proof but is not the completed live A0
   integration. Browser/UI rendering remains a later U1 concern.

The cutover may not rewrite historical A0 evidence as though the sixteenth kind
had always existed. The A0 gate must prove that the first fifteen live kinds
remain exactly the accepted historical tuple and that the sole suffix is the
authorized A0/U1 `apply-edit-plan` amendment. A0/U1 proposed-tuple checks then
become equality checks against the merged live tuple rather than appending a
duplicate suffix.

Each correction needs a positive witness, adjacent near miss, hostile boundary
case, and mutation control. A non-JSON hostile value such as a revoked proxy
uses an executable unit/integration mutation control unless the checked-in JSON
mutation schema is explicitly extended to represent it. The live cutover must
preserve all fifteen existing command paths and their accepted precedence.

## 6. Amendment and proof inventory

After acceptance, the reconciliation implementation updates these owned
surfaces together:

- `docs/A0_U1_ATOMIC_EDIT_PLAN_CONTRACT.md`;
- `src/application/application-state-contract.ts` and
  `src/application/application-state.ts`;
- `src/application/application-edit-plan-contract.ts`;
- the live application operations, history, bootstrap, and controller
  composition;
- `tests/fixtures/a0-u1-edit-plan/a0-u1-edit-plan-contract.json`;
- `tests/fixtures/a0-u1-edit-plan/edit-plan-cases.json`;
- `tests/fixtures/a0-u1-edit-plan/mutation-controls.json`;
- `tests/fixtures/a0-u1-edit-plan/trace-ledger.json`;
- `tests/fixtures/a0-u1-edit-plan/provenance-ledger.json`;
- `scripts/validate-a0-u1-edit-plan-contract.ts`;
- the accepted A0 contract fixture/validator/static gate, retaining its exact
  historical fifteen-kind prefix;
- `tests/static/a0-u1-edit-plan-contract.test.ts`;
- the atomic-edit-plan production modules and their unit, integration,
  property, and history-replay proof.

The validator must independently recompute the `8,768`/`8,769` formulas, prove
each receipt branch against before/after bookmarks and history, compare T0
cause fields with parser evidence, and reject packet tampering that restores
any superseded value or behavior.

The acceptance gate is one internally consistent packet plus green static
validation and tamper controls. The dependent build remains blocked until that
accepted packet is implemented and its named focused and aggregate gates are
green.
