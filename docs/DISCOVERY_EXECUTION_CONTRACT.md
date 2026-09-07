# Discovery execution contract

Status: specification; `jcpe-discovery-execution-proof-gdcw.1`.
This is an additive execution/publication protocol for H1/G0–G9, not an
endorsement or automatic migration of any current engine. The public theory
surface is `src/theory/discovery-execution-contract.ts`; composition ports live
in `src/application/discovery-execution-contract.ts`. Theory imports domain
and its own pure modules only. The application schedules work and publishes
A0 transitions. UI dispatches intents and renders selectors.

The observed defects this contract prevents are synthetic state counts,
wall-clock selection cutoffs, incomplete source identity and invented timing
in proposed patches. Existing H0/V0/V1 synchronous APIs remain unchanged;
application may wrap a complete bounded synchronous call. That wrapper cannot
claim cancellation within a call or responsive execution without measurement.

## Request and identity

A request is immutable admitted data: exact document ID/revision, source events
in timeline order, exact absolute rational positions, the complete ChordEvent
(including annotation, source spelling, Manual/Frozen pitch order and duplicates),
selected T1 realization IDs, full constraints/input, engine/policy/law/corpus
ID-version pairs and an explicit uint32 seed or null. No inferred key is written
back. A multi-realization event requiring a selection must have a valid selected
ID; a missing or unrelated ID refuses through the registered semantic adapter.

IDs use nonempty ASCII `[A-Za-z0-9._-]` up to128 code units, version IDs are
unique within each list and lists are sorted by ID then version. Event IDs are
unique but source event order is preserved. A request ID scopes a job, but is
never sufficient authority: changing any request field, including constraints,
selected realization, corpus version or budgets, creates a different binding.

The application captures the current immutable validated document reference and
revision before starting A0's existing suggestion-search request. It checks the
request's event values/positions/selection against that source. It keeps the
exact admitted canonical request, not only a caller-supplied digest or boolean.
Source replacement, Undo/Redo, recovery, a new revision, or a changed requested
realization selection invalidates the job even if its musical values happen to
match. A new job cancels and releases the old one before claiming capacity.
If transport retirement is already awaiting completion, cancellation removes
Apply authority immediately but its continuation remains charged until the
await settles. Another start refuses the occupied publication-attempt slot;
it cannot hide the retained old snapshot behind a fresh ledger. Disposal closes
ports/listeners immediately and follows the same honest pending-retirement rule.

The decoder accepts passive own-data-property JSON-shaped values only: no
getters, prototypes other than Object/null, holes, symbols, cycles, undefined,
nonfinite numbers or lone surrogates. Object keys sort by code-unit order;
arrays retain order and duplicates; negative zero serializes as zero. Use
length/node/depth admission before copying/encoding. No JSON cast grants a
validated document or application publication capability.

## Finite work, memory and outcomes

`step(q, cursor)` accepts integral1..1024. One unit is one actual bounded engine
expansion, including an empty/rejected expansion; unit count advances where that
expansion executes, not from input size, requested caps or an estimated formula.
Each engine defines its bounded expansion and internal operation/copy counters
before implementation. Common `workQuanta` is ceil(actual units/64), NOT the
number of step calls. The application's yield count and elapsed time are separate
performance diagnostics. Different legal quantum partitions produce identical
semantic results, ordering, IDs, counters and termination for the same request.

A cursor is process-local, immutable and valid only at the latest yielded
position of its issuing stepper and exact admitted request. A cloned, foreign,
old or forged cursor terminates the active stepper as refused without advancing
work, clears its options and releases search ownership. Invalid quantum has the
same terminal refusal semantics. The initial call accepts null. Once terminal,
step/cancel are idempotent and return the same frozen result regardless of later
arguments; it cannot
restart, add work, publish options after cancellation or silently raise a cap.
Cancel/stale at a yield wins before further work and clears all options. The
application also checks cancellation/source identity before initial work and
before publishing a terminal result. A completed result cannot acquire Apply
authority merely by retaining a cursor or copying a result object.

The runtime stepper also exposes idempotent `dispose()`: its consumer drops the
prepared result, relinquishes all job reservations and invalidates the private
measured-result registration. A previously returned immutable value is historical
data and cannot acquire publication authority after disposal. An expansion sink
is valid only during its synchronous seed/expansion call; retaining a sink cannot
enqueue work or emit options later. Seeding enqueues initial states only and
cannot emit uncounted options.

The common ceilings are literal in `contract.json` and the public constants.
All requested budgets are safe nonnegative integers (step is strictly positive)
and may lower a ceiling, never raise it. A zero budget allows an empty terminal
result, but refuses the first operation needing that resource. Newly frozen
bounds are4MiB request,8MiB retained source snapshot,8MiB result,32 value depth,
262144 value nodes,65536 text code units,128 identity code units,64 versions,
128 evidence rows per lane,16 cost axes,128 retained options,100000 queued and
expanded states,128 outgoing edges,256 depth,8388608 expansions and64MiB total
tracked owned bytes. A state is at most65536 charged bytes and an option262144.
Request/result byte caps measure canonical UTF-8; snapshot/state/option and
total tracked-byte caps use the ownership charge below. Encoding buffers and
intermediate copies are owned workspace, not free memory. The application owns
at most one job, scheduled callback, prepared result and publication attempt. Output, request/snapshot, queue, cache, workspace and
retained candidates all count toward the same64MiB ceiling while owned.

Engine-specific ceilings combine by minimum with the common/request ceilings:

| Engine | Additional hard ceiling |
|---|---|
| H1 |64 events,16 laws/candidate,32 patch operations |
| G0 |256 source events,5 alternatives |
| G2 |8 context events,32 candidates/provider,16 displayed options |
| G3 |8 generated route events,64 outgoing/state,50000 states,8 routes,64MiB |
| G4 |16 slots,128 candidates/slot,100000 transition states |
| G5 |depth3,width8,128 canonical nodes |

A semantic budget is checked BEFORE its operation/allocation. Work, state,
candidate, option, queue, outgoing, depth, tracked-memory and result-byte limits
have distinct deterministic terminal reasons. If several would fail at one
operation, the preceding list is the precedence order. Initialization admission
failure is refused; an exhausted admitted search is bounded-partial even with
zero options. No-result means exhaustive completion with zero options. Complete
means exhaustive completion with at least one. Cancelled, stale and refused
contain no options. A completed queue must be recognized before trying to spend
another work unit, so an exact-bound completion is not mislabeled partial.

Composition creates a fresh job-owned arena, reserves the measured captured
source snapshot and bounded control workspace, then passes that same arena to
the registered engine factory. Those reservations reduce available search
memory; no second uncharged ledger or opaque caller byte estimate is allowed.
Application reserves/releases only its own handles, and theory owns its search
handles. The total cap remains the requested cap, including both layers.

Queue/state counters change at actual push/pop/expansion sites. Candidate
counts change only on actual emitted candidates, including duplicates; canonical
deduplication never invents generated work. Retained and peak queue/byte counts
are observed during actual operations. Allocation/release counters in semantic
results count arena-owned musical data and its fixed workspace. Per-yield cursor
and scheduler bookkeeping uses one pre-reserved bounded control slot; actual
callback/yield counts live in the separate application diagnostics. It cannot
change the musical result or manufacture expansion counts. Reservation handles are issued by the
arena; foreign or already released handles cannot decrement its balance. Every
successful reservation increments allocations; each first release increments
releases. No counters are supplied by a caller or trusted from a result payload.

Tracked bytes are an explicit conservative accounting model, not a claim about
a JS engine's physical heap. Count8 bytes per primitive/null/reference slot,
32 bytes per owned object/array/map/record header, and2 per string code unit
including property names. Shared immutable objects count once while any owner
retains them; releasing one reference cannot free another owner's accounting.
A reservation for the proved maximum expansion workspace precedes expansion;
new queue/cache/candidate storage reserves its measured graph charge before
copying. Retaining a source snapshot is charged even if it was already present
in A0. The test instrumentation observes allocation/release sites and actual
container contents; checking a claimed counter against itself is not proof.
Engine-specific transient allocations and bounded expansion internals require
that engine's own proof. The generic service cannot certify arbitrary injected
code or claim a64MiB browser-heap limit.

The generic kernel is registered with an explicit engine family. Requests above
that family's directly corresponding common ceilings refuse; the runtime never
silently rewrites their budgets. Provider, route, slot, law and patch-operation
limits that depend on the engine's data model remain mandatory in that engine's
decoder/expansion proof. Reservation handles spend128 bytes of bounded registry
bookkeeping in addition to their payload. The generic job reserves one fixed
control/cursor/result workspace; each actual expansion acquires and releases its
registered workspace independently of scheduler partitioning.
Captures also reserve1024 bytes for their return records, ownership-set entries,
and queue/option wrappers, separately from measured data graphs and canonical
strings. This deliberately conservative bookkeeping must not be mistaken for
physical heap instrumentation. The final result byte check uses measured UTF-8
payload sizes plus the actual envelope, counters and ordinal IDs; trimming at
that output boundary reports `bounded-partial`/`result-byte-cap` explicitly.

## Options, ordering and musical proof

Every terminal result retains the full admitted request, actual enforced budgets,
identity, measured counters and termination. Its repeated identity/limits fields
must equal the bound request; application never trusts them independently.

An option contains exact value/proposal data, supporting evidence,
counterevidence, missing premises and typed cost axes with units/directions.
The visible versioned policy defines a lexicographic finite numeric order key;
it must explain its connection to those axes. There is no implicit sum across
semitones, ranks or probabilities. Canonical ties compare the full canonical
option payload by code-unit order. Exact duplicate payloads deduplicate;
meaningful spelling, voicing, timing or evidence differences remain distinct.

After deterministic canonical ordering, option IDs are `option.0`, `option.1`,
etc. IDs are scoped to the entire admitted request binding; they are neither
globally unique content hashes nor application capabilities. Display summaries
and elapsed time do not participate. Every proof names its actual input event
and versioned law/corpus references; missing premises remain visible. An
unvalidated proposal is never eligible for Apply. Bounded-partial options may
Apply only after the same complete per-option law/constraint validation as a
complete result; partial means incomplete enumeration, never incomplete music.

## Application scheduling and Apply

One owned local MessageChannel/task scheduler callback advances one quantum,
then yields. Busy is published before the first expansion. Cancel, source edit,
replacement, Stop and disposal invalidate the generation; callbacks check it
before invoking theory. Close both MessagePorts and release queued callbacks,
workspace and options when done/cancelled/disposed. A callback already dequeued
still checks generation. No worker/network/model dependency is introduced.

A prepared result lives in a capacity-one private registry bound to the exact
request, captured source, A0 request ID and actual stepper result. User intents
name the current option ID; caller-created result objects, reported counters,
proof strings and IDs cannot register themselves or authorize an edit.

Apply reserves the sole attempt and follows this sequence:

1. Confirm registry membership, exact current document/revision/selected
   realization, full request/versions, option presence and measured result
   integrity. Recompute the option's law preconditions/postconditions, hard
   constraints, evidence and costs using the registered pure adapter.
2. Decode its engine-specific proposal into an existing A0 DerivedDocumentPatch.
   Recompute affected IDs, source membership and exact timing; preserve everything
   outside the explicit proposal's scope. Run F2/F3 through the existing public
   application dependencies. Refuse before retiring playback if invalid.
3. Await the existing real progression AND preview retirement path. No fake
   ready receipt or new audio adapter may substitute. On failure consume this
   attempt and refuse. Source edits and cancellation remain admissible during
   the await; the adapter cannot overwrite them afterward.
4. Re-read current state and rerun identity, pending A0 request, complete law,
   selected-realization and patch validation after the await. Compare actual
   source/proposal/evidence/counters to the registered immutable result.
5. Synchronously execute exactly one existing A0 apply-suggestion command against
   that latest state and publish its real transition. No async gap between final
   checks and publication. Finish/cancel the A0 request and clear the registry.
   A second click is already-consumed, never a second command/history entry.

A0/F3 remain authority: no new document brand cast, no direct history mutation,
no direct persistence/download/audio call from UI. Failure/cancel/stale preserves
exact document/history/save and export markers; transient job/request state and
normal A0 diagnostic notices may change. A successful Apply is one revision and
one undoable A0 history entry. Undo restores the original exact source document.
Any retirement already performed is observable and is not secretly rolled back.

Existing `exactTimingPreserved` means equal event identity/order/duration under
A0. For insertion/split/rebalance, use the normal explicit confirmation channel;
the generic service cannot set that boolean to bypass time validation. A duration-
changing proposal without the required confirmed edit plan refuses. Manual/Frozen
pitch order, duplicates, bass policy and generated metadata are unchanged unless
the explicit proposal requests that exact change; validate both changed and
unchanged event records. Refuse source-spelling/selected-realization mismatches
rather than silently reparsing, optimizing or normalizing the chart.

## Independent fixtures and named gates

The companion packet fixes finite queue-enumeration examples, canonical ties,
exact time and stored pitch counterexamples, lifecycle traces, every limit edge,
provenance and mutation controls before production. It imports no production
search output. Static checks independently enumerate the finite examples and
all legal compositions of their work counts, compare literal results, verify
limit/terminal/trace coverage and kill altered literal expectations.

Spec: `bun scripts/validate-discovery-execution-contract.ts`;
`bun test tests/static/discovery-execution-contract.test.ts`; `bun run typecheck`.
Build: the same validator; `bun test tests/unit/discovery-execution.test.ts
tests/integration/discovery-execution.test.ts`; full typecheck and lint.
Proof: `scripts/verify-discovery-execution-evidence.ts` must execute the named
unit/integration/conformance/property inventory and
`tests/e2e/discovery-execution.spec.ts` using real supported Node/Playwright,
zero retries/skips/quarantine, input hashes before and after, seeds, actual
request/console/page-error logs, voice/listener/scheduler/memory observations,
positive Apply/Undo and cancellation/edit/Stop races. Its output is
`test-results/discovery-execution-evidence.json`. Add its real commands to the
existing aggregate verifier when production wiring exists, preserving all gates.

Finite protocol workloads prove the generic service, actual scheduling,
accounting and A0 publication. They do not replace musical laws, engine internal
allocation proof or complete discovery UI tests. Consumers retain their own
spec/build/proof and original dependencies; shared proof must not depend on
consumer proof that already depends on it. Q0/R0 retain aggregate/human/deploy
acceptance. No package closes from source presence or this document alone.
