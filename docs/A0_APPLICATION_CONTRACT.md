# A0 Application State, Command, and History Contract

Status: reviewed specification authority  
Contract schema: `changes.application.state-contract.v1`  
Policy: `changes.application-state@1`  
History policy: `changes.application-history@1`  
Stale-result policy: `changes.application-stale-result-gate@1`

This document and the reviewed fixtures under
`tests/fixtures/application-state/` are the code-facing A0 authority. They are
independently authored expectations. Production output may be compared with
them; it may not generate, rewrite, bless, or weaken them.

## 1. Ownership and boundary

A0 owns the serializable application tree, pure document commands, bounded
undo/redo, stable UI bookmarks, ephemeral UI reducers, request staleness gates,
transport-view acceptance, and derived selectors. The authoritative document is
a `ValidatedDocument`; A0 cannot cast that brand and must republish every
mutated candidate through F3.

Service handles, `AbortController`, clocks, files, browser storage, Web Audio
objects, playback plans, timers, and Preact nodes never enter `AppState`. The
application layer may emit typed effect requests, but it cannot claim an effect
ran. UI renders selectors and dispatches intents; it does not mutate this tree
or call audio, persistence, import, or export adapters itself.

The public type surface is
`src/application/application-state-contract.ts`. Production implementation will
live in application modules and be re-exported through `src/application/index.ts`.

The proposed E0 authority addendum is
`docs/A0_E0_OWNER_PORTS_CONTRACT.md`, with its cycle-free type surface in
`src/application/application-interchange-owner-contract.ts`. It specifies the
five composition-private controller capabilities for import replacement,
latest identity, and atomic export-marker publication. The addendum contains no
production implementation and does not widen `StudioController` or permit
`AppState` to cross an asynchronous consumer result. Accepted E0 v1 is not
bound to these ports; the separately versioned E0 v2 amendment tracked by
`jcpe-milestone-reliable-studio-l3a.8.4` owns that future semantic migration
and requires explicit project-owner acceptance.

## 2. Authoritative and derived state

`AppState.document` is the only musical source of truth. `revision` is a
monotonic nonnegative safe integer and advances exactly once for each successful
document command, undo, or redo. Ephemeral intents, request bookkeeping,
transport notifications, recovery acknowledgements, export acknowledgements,
and selector calls do not advance it.

`exportRevision` is the last revision whose exact document was successfully
exported in this session. It is `null` before export. Dirty-since-export is
`exportRevision !== revision`; undoing to byte-equivalent content still counts
as a later edit because A0 does not hide change history behind an implicit
content hash. Recovery status is an A1-owned projection and never determines
musical truth.

Panels, dialogs, drafts, notices, focus requests, and pending requests are
ephemeral application state. They never appear in document JSON or history
snapshots. Derived values such as measure fill, canonical symbols, analysis,
candidate voicings, plans, and dirty flags remain selector output and are never
cached into the document.

## 3. Stable bookmarks

Selection stores event IDs in current structural document order, without
duplicates, plus anchor and focus IDs for direction. It never stores array
indexes. Boundaries name a document edge; a section's outer or inner edge; or
the stable measure/event adjacent to the edge. Measure boundaries distinguish
`before-measure`/`after-measure` (between measures) from
`measure-start`/`measure-end` (inside a measure's event sequence). Range anchor/focus direction is retained; the beat
range selector orders and resolves the two boundaries against the current exact
timeline.

Every history entry stores both `beforeBookmarks` and `afterBookmarks` alongside
the exact before/after validated documents. Undo restores the former; redo
restores the latter. Transport/playhead, panels, dialogs, drafts, notices,
recovery state, and async requests are intentionally absent.

After a new command, bookmark repair is deterministic:

1. retain every selected stable event ID that still exists;
2. retain anchor/focus when present, otherwise choose the first/last surviving
   selected event in structural order;
3. retain an insertion/range boundary whose referenced ID still exists;
4. for a removed event boundary choose the same edge before the next surviving
   event, otherwise after the previous surviving event;
5. for a removed measure/section descend to the first valid child at the old
   structural neighborhood, otherwise use the closest surviving sibling edge;
6. when no structural target exists, use `document-start` for insertion and
   clear the range;
7. focus keeps the same stable target, then next pre-command structural event,
   then previous, then first inserted/destination event, then its container,
   then the chart target.

Move preserves identity and therefore preserves selection and event focus.
Duplicate allocates all copied IDs atomically, leaves the original selection
selected, and moves insertion to the edge after the last inserted copy. A caller
may select the copies only through a later explicit ephemeral intent.

## 4. Command envelope and atomic publication

Every command carries a bounded ID and label, expected document ID, expected
revision, injected nonnegative logical time, and an explicit coalescing value.
The runner performs this order:

1. validate envelope and exact preconditions;
2. index stable IDs with bounded structural work;
3. apply the typed mutation to an isolated immutable candidate;
4. structurally decode the complete candidate through F2 exactly once;
5. validate the decoded candidate through F3 exactly once;
6. repair bookmarks and calculate focus;
7. construct or coalesce a complete history entry;
8. enforce history count/byte policy;
9. increment revision exactly once;
10. atomically publish document, bookmarks, history, revision, notices, and
   deterministic effects.

Failure may append one bounded sanitized notice and advance only the notice
sequence. It cannot change document, revision, history, bookmarks, focus,
transport, recovery, export checkpoint, dialogs, drafts, or pending requests.
There is no partial result, retry, repair, fallback chord, or best-effort move.

### 4.1 Command families

| Kind | Exact responsibility |
|---|---|
| `insert` | insert one explicit section, measure, or event at a stable destination |
| `delete` | delete a duplicate-free nonempty node set; ancestor/descendant overlap refuses |
| `move` | move same-kind nodes in source structural order to a valid stable destination |
| `duplicate` | use F1 atomic copy/remap and one injected ID factory; no partial copy |
| `set-text` | edit one declared document/section/event text field |
| `set-duration` | replace one exact event duration plus its explicit resulting measure completion |
| `set-measure-completion` | replace one explicit completion declaration |
| `set-section` | apply an explicit nonempty section metadata patch |
| `set-chord` | replace a complete event chord/voicing pair while retaining ID, duration, annotation |
| `set-voicing` | replace only one explicit voicing; Manual/Frozen values remain exact |
| `set-document-settings` | explicit title/description/meter/tempo/key/playback patch |
| `transpose` | apply a law-produced declared-scope candidate at its exact base revision |
| `apply-suggestion` | apply one current suggestion patch as one undoable command |
| `apply-reharmonization` | apply one current proof-carrying branch as one undoable command |
| `replace-document` | commit New, lesson, canonical import, or legacy import after retirement |

An empty patch refuses. Inserted IDs must be globally unique. Delete/move
targets are canonicalized by current structural order only after duplicate,
missing, kind, and overlap checks. A destination inside a moved subtree refuses.
Every insert/delete/move/duplicate payload also declares the exact completion
state of each affected existing measure. A duration edit declares the containing
measure's resulting completion, and a meter change declares every affected
measure completion. A missing, duplicate, unrelated, or incomplete update
refuses; A0 never silently changes `complete` into `incomplete` or invents a
partial-measure reason.

`set-chord` never relabels existing pitches. Its complete replacement must keep
the current event ID, duration, and annotation. If the current Manual/Frozen
voicing is incompatible with the new chord, the caller must supply an explicit
compatible replacement or the command refuses at F3.

### 4.2 Derived patches

Transpose, suggestion, and reharmonization are not generic document replacement
backdoors. Their patch carries exact source event IDs, base revision, declared
changed IDs, a candidate, an exact-timing assertion, and the stable-identity
policy `preserve-unmodified-allocate-new-inserts`.

Before publication A0 verifies that every source ID exists, the base revision
matches, every structural difference is covered by the declared scope,
unchanged nodes retain IDs, inserted nodes are new, and F3 accepts the complete
candidate. Suggestion/branch request IDs must also match the current request
slot. Preview/search/branch construction remains nonmutating. Apply is one
history entry regardless of patch size.

## 5. Coalescing

Only `set-text` can carry `text-field` coalescing. Two consecutive successful
commands coalesce exactly when all are true:

- both are `set-text` for the identical typed field target;
- coalescing key and focus-session ID are byte-identical and nonblank;
- no intervening command, undo, redo, replacement, focus-session change, or
  history lock occurred;
- logical times are monotonic and the delta is strictly less than 1,000 ms.

At exactly 1,000 ms they do not coalesce. A decreasing logical time refuses.
Structural, duration, section, chord, voicing, settings, transpose, suggestion,
reharmonization, and replacement commands always have `coalescing: null`.

A coalesced entry retains the first `before` document/bookmarks/time and the
latest `after` document/bookmarks/time. Every command still increments revision
once. Undo reverts the entire focused edit session in one step.

Continuous sliders keep preview outside document state and dispatch one final
noncoalescing command at pointer/key completion.

## 6. History limits and replacement disclosure

History contains complete immutable before/after document references and exact
bookmarks. It never JSON-clones a document. The default cap is 200 entries and
16,777,216 conservative retained bytes, whichever binds first. Undo and redo
share the same retained entry set; moving an entry between stacks does not
change its estimate. A new noncoalesced command clears redo before cap
calculation.

The byte estimator is the public structural policy in the TypeScript contract.
It counts object identity once per entry traversal, UTF-8 payload bytes, and
fixed reviewed container/value weights. Adjacent entries are intentionally not
deduplicated, making the bound conservative. JSON serialization/stringification
is forbidden for copying or estimation.

For a normal command, if the new entry alone exceeds the byte cap the command
refuses. Otherwise oldest complete undo entries are evicted until both caps are
met. No partial entry is retained and UI never claims an evicted undo.

New, lesson, and import replacement use one transaction. If the complete entry
fits, it is retained normally. If it does not, commit is allowed only with the
explicit `explicitly-unavailable` disposition, a confirmation ID, and
`exportRecommended: true`; the prior undo/redo history is cleared and a warning
notice/effect records that replacement cannot be undone. The system never makes
that choice silently.

Undo/redo are locked while a blocking dialog is committing or a document
transition is in `retiring-transport`/`committing`. Undo increments revision,
moves the newest undo entry to redo, restores its exact before document and
bookmarks, and leaves transport/playhead untouched. Redo is symmetric. A new
command after undo clears redo.

## 7. Replacement transaction handoff

New, lesson load, canonical import, and legacy import share one command. The
candidate is decoded/migrated and confirmed before commit. A commit requires a
matching transition request plus a receipt that progression and preview
generations were retired and the no-future-attack postcondition holds.

The application service order is:

1. begin one `document-transition` request at the current document/revision;
2. show confirmation, including the computed undo disposition;
3. on cancel, settle/cancel the request without retiring audio or mutating data;
4. serialize and await transport/preview retirement;
5. create the retirement receipt;
6. run the replacement command, revalidating the candidate through F3;
7. publish the new document at one new revision and reset bookmarks to the first
   valid insertion target;
8. request a new plan at beat zero, queue recovery, restore chart focus, and
   announce the result.

Any read, decode, validation, confirmation, or pre-commit retirement failure
leaves the authoritative state unchanged apart from one notice/request cleanup.
The pure A0 runner does not perform or simulate audio retirement.

## 8. Request and stale-result gate

At most one request occupies each declared request kind and no more than eight
requests exist. A request token contains kind, positive safe-integer ID, exact
document ID, and exact base revision. Pending requests are stored in declared
kind order.

Settlement is accepted only when all four token fields match the current slot.
Otherwise the result is `ignored-stale`, the exact input state is returned, and
no notice/effect/payload publication occurs. Cancellation marks or removes only
the matching slot. Starting a busy slot refuses; callers must explicitly cancel
or settle it first.

Every later analysis, import read, voicing search, suggestion, route, branch,
practice, and playback-plan runner must pass this gate before publishing. A
derived document command independently rechecks base revision and source IDs,
so an incorrectly ordered caller still cannot mutate stale state.

## 9. Transport view projection

`TransportViewState` is a read-only projection, never the transport authority.
It contains service generation, command request ID, monotonically increasing
notification sequence, exact document ID, plan revision, start beat, playhead,
status, and a stable failure code. It is excluded from history.

Before dispatching a serialized transport command, the application reduces one
`expect-transport` intent containing the new command request ID, exact document
ID, plan revision, starting/stopping status, start beat, and current playhead.
That intent retains the last accepted service generation/sequence; only a later
matching service notification may replace them or claim `ready`/`playing`/
`paused`/`failed`.

A notification is accepted only if:

- all numeric fields are valid nonnegative safe integers;
- document ID and plan revision equal the currently installed view target;
- command request ID equals the latest command request ID;
- generation is greater than the accepted generation, or generation is equal
  and notification sequence is strictly greater.

Every other notification is `ignored-stale` with exact state identity and no
notice. A notification cannot advance application revision or schedule audio.
An old playhead therefore cannot repaint after Stop, replacement, seek, or
replay.

## 10. Deterministic ordering and termination

- Structural order is section, measure, event array order in the validated
  document; IDs are identity, never ordering surrogates.
- Request order is `APPLICATION_REQUEST_KINDS` declaration order.
- Panel order is caller order after duplicate and membership validation.
- Dialog order is stack bottom-to-top.
- Notice order is increasing sequence. When full, append evicts the oldest
  dismissible notice; if none is dismissible, the new notice replaces the
  oldest notice so failure reporting remains bounded and visible.
- Refusal diagnostics use path then code ordering and never expose chart text,
  labels, annotations, hostile values, or raw imported input.

Every operation terminates by bounded traversal of the F3 document limits,
200 history entries, 8 requests, 8 dialogs, 32 notices, and 8,192 selection IDs.
Counters report work/state/memory. Wall time is performance evidence only and
cannot select, cancel, or change a result.

## 11. Independent fixture families

`state-matrix.json` specifies initialization, every command family, bookmark
repair, coalescing boundaries, history cap/eviction, exact import undo/redo,
oversized disclosure, failure atomicity, and selector behavior.

`stale-and-transport-cases.json` specifies request begin/settle/cancel and
transport acceptance/old-generation/old-request/old-plan behavior.

`sequence-cases.json` specifies independently authored action sequences,
including the fixed 1,000-sequence property protocol. Random generation is
seeded and logged, but the oracle is a declarative reference transition model,
never production output.

`mutation-controls.json` names semantic counterfactuals that verification must
kill. `trace-ledger.json` links every parent requirement, invariant, success
criterion, legacy regression, and selected Idea Wizard application law to case
IDs. `provenance-ledger.json` distinguishes architecture/plan authority from
mechanical definition-derived expectations.

## 12. Handoff and forbidden shortcuts

The A0 implementation agent must be able to work from this document, the public
TypeScript contract, and reviewed fixtures without consulting prose elsewhere.
The following are contract violations:

- storing selection, focus, range, or playback identity as array indexes;
- casting `ValidatedDocument` outside the sole F3 publication module;
- publishing a locally constructed candidate without an F2 structural decode;
- mutating a live document before complete validation;
- cloning with JSON, structured clone, or serialize/parse round trips;
- repairing Manual/Frozen pitches or unsupported chord semantics;
- reading wall time inside pure reducers or using time as a musical cutoff;
- retaining audio, browser, file, abort, timer, or Preact handles in state;
- putting transport/playhead, panels, dialogs, drafts, requests, or notices in
  undo history;
- applying stale analysis/import/voicing/suggestion/transport output;
- silently dropping undo for an oversized replacement;
- computing fixture expectations from production behavior;
- adding runtime AI, telemetry, remote content, or any network dependency.

Browser/audio/storage behavior is not faked by A0: it is explicitly outside the
pure contract and will be exercised by its owning package. A0 does prove the
typed orchestration handshake and exact no-publication behavior on cancellation,
staleness, and pre-commit failure.

## 13. Transport-expectation settlement (additive amendment, 2026-07-30)

Section 9 lets only a later matching service notification replace an installed
`expect-transport` intent. The X1 refusal law is total — a refused command
publishes no notification — so a refused initialize/play/pause/stop previously
left the optimistic `starting`/`stopping` status dangling until the next
command (bug jcpe-e183). This amendment adds exactly one settlement path fed by
the refusal outcome the transport already returns to its submitting caller.

The `EphemeralIntent` union gains one member,
`settle-transport-expectation`, carrying the refused `commandRequestId`, the
exact document ID and plan revision of the installed expectation, a settled
status, and a nonblank bounded `failureCode`. The settled status is the
controller's projection of `TransportCommandRefusal.state` — the transport's
own echoed actual state — through the X1 state-status projection, with
`locked`/`disposed` mapping to `unavailable`. It is never an invented value
and may not claim `starting` or `stopping`.

Acceptance laws:

- a malformed payload (nonpositive/unsafe command request ID, unsafe plan
  revision, a status outside the settled set, or a blank/unbounded failure
  code) refuses `transport.expectation_invalid` at path `["transport"]`;
- a well-formed settlement is accepted only when its command request ID equals
  the installed view's command request ID, its document ID and plan revision
  equal the current document and revision, and the installed status is still
  `starting` or `stopping`; every other settlement returns `ignored-stale`
  with exact state identity — a genuine notification that already settled the
  slot always wins;
- acceptance overwrites only `status` and `failureCode`, retaining generation,
  notification sequence, identities, start beat, and playhead, and advances no
  application revision;
- the next `expect-transport` clears `failureCode`, exactly as before.

Section 9's notification acceptance laws are unchanged: notifications remain
the only path that may advance generation/sequence, and X1 still never
publishes for a refusal. The settlement is the application-side dual of the
refusal result the service already produced; fabricating a
`TransportNotification` to the same effect remains forbidden.

### 13.1 Receipt settlement after identity supersession (additive, 2026-08-02)

A receipt DOES publish a genuine notification, but X1 echoes the
`(documentId, planRevision)` captured when the plan was bound. After a
mid-play document replacement or edit — a library load, a tempo commit, any
chart mutation — that echoed identity is superseded, the acceptance law of
section 9 rightly drops the notification as stale, and no settlement could
ever fire: a successful Stop after a mid-play library load left the
optimistic `stopping` status on screen forever (bug jcpe-my0j).

The controller therefore also feeds the same `settle-transport-expectation`
intent from a command's RECEIPT outcome, with:

- the receipt's `commandRequestId`;
- the dispatch-time document ID and plan revision of the installed
  expectation, exactly as the refusal path captures them;
- the controller's projection of `TransportCommandReceipt.stateAfter` —
  the transport's own echoed post-command state, never an invented value;
- the stable application-settlement cause `transport.plan_superseded`,
  minted by the controller (it is not an X1 refusal code).

Every acceptance law of section 13 applies unchanged. In particular, when
the genuine notification WAS accepted the slot is no longer `starting` or
`stopping`, so the receipt settlement lands as `ignored-stale` and the
notification wins; the settlement can take effect only in the one case
where the notification could not — when the run's bound identity was
superseded while the expectation's dispatch-time identity still equals the
current document and revision. Notifications remain the only path that may
advance generation/sequence, and fabricating a `TransportNotification`
remains forbidden.
