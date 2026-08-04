# A0/E0 Interchange Owner Ports Contract

Status: proposed specification authority  
Contract schema: `changes.application.interchange-owner-contract.v1`  
Owner: A0 application controller  
Prospective consumer: separately versioned E0 v2 composition  
Production status: specified, unimplemented

This owner-only contract proposes five A0 capabilities for transactional
document replacement and canonical-export marker publication. It does not bind,
reinterpret, supersede, or amend the accepted E0 v1 contract. That semantic
binding belongs exclusively to the visibly versioned E0 v2 amendment
`jcpe-milestone-reliable-studio-l3a.8.4` and requires a separate explicit
project-owner golden acceptance. This leaf does not claim that the controller
implements the owner ports; implementation belongs to `jcpe-94yu.2`, and real
controller/concurrency proof belongs to `jcpe-94yu.3`.

Repository-history correction (2026-07-22): commit `72b951e` accurately added
a narrower application runtime entry and UI changes, but its message also said
the UI mounted through these owner ports. No production module in that commit
references or binds the owner aggregate; `main.tsx` still creates the ordinary
studio controller with no bridge dependency. That wording is not production
integration evidence, and the checked status remains `specified-unimplemented`.

The authoritative type surface is
`src/application/application-interchange-owner-contract.ts`. The independent
fixture packet is under `tests/fixtures/a0-e0-bridge/` and is validated by
`bun run validate:a0-e0-bridge-contract`. Accepted E0 v1 documentation, source,
validator, tests, support, fixtures, and review record are immutable archival
authority. They are not bridge fixtures and cannot be changed or semantically
reinterpreted to make this proposal fit.

## 1. Ownership boundary

`StudioController` owns the sole current `AppState` in its closure. A future,
separately accepted E0 v2 composition may submit state-free evidence to the five
owner ports, but it cannot supply, install, or receive an authoritative
application snapshot. The future composition root may bind the ports only after
that versioned semantic contract is accepted.

```text
UI request
   |
   v
prospective E0 v2 -- state-free request/versioned normalization --> A0 ports
                                                               |
                                                               v
                                               controller closure current state
```

The owner contract imports only domain values and the A0 state contract. It
never imports E0, export, compatibility, theory, audio, persistence, or UI. A
future E0 v2 contract may import the owner contract after its own versioned
acceptance; the one-way edge remains mandatory even for type-only imports and
re-exports.

The owner contract contains no production function or class. Its checked
status literal is `specified-unimplemented`; no spec, fixture, validator, or
test may imply that the controller integration already exists.

## 2. Exact five-port surface

`A0E0InterchangeOwnerOperations` and `A0E0InterchangeOwnerPorts` have exactly
these proposed members in this order:

| Port                                     | Exact producer result                       | Prospective consumer result | Timing                 |
| ---------------------------------------- | ------------------------------------------- | --------------------------- | ---------------------- |
| `prepareImportReplacementPublication`    | `PrepareImportReplacementPublicationResult` | `unknown`                   | synchronous            |
| `discardImportReplacementPublication`    | `DiscardImportReplacementPublicationResult` | the same exact type         | synchronous, total     |
| `publishImportReplacement`               | `PublishImportReplacementResult`            | `unknown`                   | synchronous            |
| `readCurrentApplicationDocumentIdentity` | `ApplicationDocumentIdentity`               | `unknown`                   | synchronous            |
| `publishCanonicalExportRevision`         | `PublishCanonicalExportRevisionResult`      | `unknown`                   | synchronous atomic CAS |

`A0E0InterchangeOwnerOperations` is the exact producer aggregate: each member
uses its named `...Operation` type and returns the typed producer result shown
above. `A0E0InterchangeOwnerPorts` is the narrowed, untrusted consumer view:
each member uses its named `...Port` type. The producer aggregate is
structurally assignable to the consumer aggregate, in that direction only. A
future composition root receives the exact producer operations and passes only
the narrowed ports to the separately versioned consumer.

Every fallible consumer port returns `unknown`. A future versioned consumer
must validate the complete raw envelope and define how malformed values or
synchronous throws are normalized. This leaf does not assign that behavior to
accepted E0 v1. Cleanup is the deliberate exact-result exception: its operation
and port are the same type, and the later build and verification phases must
prove it total, synchronous, nonthrowing, and idempotent.

The interface is composition-private. It is not added to `StudioController`,
passed through public E0 calls, exposed to Preact, or accepted from callers.

## 3. State isolation

No proposed owner request or result contains `AppState`, `state`,
`currentState`, `lastKnownState`, or `observedBefore`. Whether and how a future
E0 public surface adopts the same rule is an E0 v2 semantic decision, not an
effect of this owner-only proposal.

Accepted E0 v1 does not satisfy that proposed boundary: its successful import
result nests `publication.state: AppState`, four refusal families return
`state: AppState`, and its publication-protocol failure returns
`lastKnownState: AppState`. This packet records those shapes as unresolved
versioned conflicts; it does not relabel them as state-free.

`ApplicationDocumentIdentity` is exactly:

```ts
Readonly<{
  documentId: DocumentId;
  revision: AppRevision;
}>;
```

It is a locator, not a state snapshot, authority token, selector cache, or
promise. Preservation of unrelated state is proved against the real controller
inside the bridge verification package; the owner receipt itself cannot prove
that invariant by carrying an installable before/after pair.

### 3.1 Immutable E0 v1 boundary

E0 v1 remains accepted exactly as written at commit
`a91b5bc5e70c2bf40dff97211d3c0f4ba63f58fd`. Its semantic digest remains
`0455fe8afa398e9f5cbafa3209d563ad72365435b4cd4f896477271a06027ccc`.
The bridge makes `semanticCompatibilityClaim = false`. It may verify these
archival bytes, but it may not describe the proposed A0 surface as compatible
with, binding to, or superseding E0 v1.

The live accepted non-fixture closure is pinned as follows. The machine-checked
authority for these values is `ACCEPTED_E0_V1_ARTIFACT_PINS` in
`scripts/validate-a0-e0-bridge-contract.ts` together with the fixture's
`immutableArtifactPins`; the table mirrors them for readers.

| Role               | Immutable E0 v1 path                         | SHA-256                                                            |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| documentation      | `docs/E0_INTERCHANGE_CONTRACT.md`            | `288c7ba1e36f8422c9753d501feb68efa721fa8b320b5e20bce8503da85e7d4f` |
| export source      | `src/export/interchange-contract.ts`         | `a8db592fb3b4f8c35385052753284f1a604b683d207b6aa7abd89fec04f2d035` |
| application source | `src/application/e0-interchange-contract.ts` | `32a51ef9eac0948a069fc3498348562f70e7703b430f9e1ad9c9961fe53cf10a` |
| validator          | `scripts/validate-e0-contract.ts`            | `3cc96d2ece16e22f98689057dbf1d64b64929dfbb2f92fd85391a7dc1d6bee04` |
| static test        | `tests/static/e0-contract.test.ts`           | `9873a0342bdf4ce6ab3754572d2f62cef6dbecbcb2a41105b316635204719cf4` |
| test support       | `tests/support/e0-interchange-fixture.ts`    | `cda73a5421b2635d1feb845ad39e1681920eddbf9d09f51b0ed624b19e06d522` |
| acceptance review  | `docs/evidence/E0_GOLDEN_PACKET_REVIEW.md`   | `a11d79fe73811364d3d631f2a5b2d9d1fcce0f79fdc3ed64472d5980a2397693` |

The accepted 16-file fixture closure remains pinned separately by its byte
manifest digest
`a056af4cc18d502ff75a4890e4ce360b26365976e18962ce8da4d827b971ce48`.

Pin-supersession record (2026-07-31): the hashes above were re-pinned by the
accepted additive groove-field amendment (`jcpe-jnnu`, commit `51b1240`),
which added the single optional persisted `playback.grooveStyleId` property.
Every owner-accepted golden byte and the acceptance record are unchanged; the
amended closure remains the immutable v1 authority in this bridge's sense —
"immutable" forbids semantic reinterpretation by the bridge, not the parent
packet's own recorded additive amendments, each of which re-pins this table
and the validator constants together.

### 3.2 Unresolved semantic conflict inventory

These are versioned semantic deltas, not compatibility interpretations:

| Conflict                              | Accepted E0 v1 authority                                                                                                                                                          | Proposed A0 owner surface                                                                                                                                     | Disposition                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| import request `currentState`         | `CommitImportReplacementRequest` requires `currentState: AppState`                                                                                                                | `PrepareImportReplacementPublicationRequest` forbids caller state                                                                                             | unresolved until accepted E0 v2 |
| preview impact-context state          | `PrepareImportPreviewRequest.replacementImpactContext.state` carries `AppState` into the public E0 preview call, and `AssessImportReplacementImpact` consumes that context        | owner preparation recomputes exact impact from controller-closure current state and accepts no caller state                                                   | unresolved until accepted E0 v2 |
| import preview projection             | `CommitImportReplacementRequest` carries a complete retained or explicitly-unavailable `preview`                                                                                  | the owner request flattens only state-free identity, candidate, command, impact, transition, and confirmation evidence                                        | unresolved until accepted E0 v2 |
| preview authority and consent         | E0 v1 carries the preview and acknowledgement through its public orchestration, but no A0 registry binds the originally displayed candidate, command, or confirmation requirement | the owner validates candidate semantics and request self-consistency but cannot prove exact user-confirmed bytes, command seed, or acknowledgement provenance | unresolved until accepted E0 v2 |
| import success `publication.state`    | successful `CommitImportReplacementResult` nests `PublishImportReplacementResult.state: AppState`                                                                                 | owner publication success is state-free                                                                                                                       | unresolved until accepted E0 v2 |
| import refusal `state`                | four public `CommitImportReplacementResult` refusal families return `state: AppState`                                                                                             | owner results are state-free                                                                                                                                  | unresolved until accepted E0 v2 |
| publication protocol `lastKnownState` | the public replacement-publication protocol failure returns `lastKnownState: AppState`                                                                                            | owner publication refusal returns only observed identity                                                                                                      | unresolved until accepted E0 v2 |
| raw marker states                     | `A0CanonicalExportRevisionPublicationAdapterResult` success returns `observedBefore` and `state`; refusal returns `state`; the accepted fixture pins the raw success fields       | owner marker CAS returns a state-free receipt/refusal                                                                                                         | unresolved until accepted E0 v2 |
| preparation refusals                  | E0 v1 has six preparation refusal codes                                                                                                                                           | the owner proposal has twenty codes, adding fourteen request, transition, metadata, exhaustion, F2/F3, history, impact, and busy refusals                     | unresolved until accepted E0 v2 |
| replacement publication refusals      | E0 v1 publication is success-only with no normal refusal                                                                                                                          | the owner proposal adds missing, stale, and retirement-mismatch refusals                                                                                      | unresolved until accepted E0 v2 |
| public marker request                 | E0 v1 public preparation requires `state`, and public completion requires `state`, `preparationId`, and `deliveryPreference`                                                      | the owner CAS request accepts only `publication`; the future public E0 shape is not specified here                                                            | unresolved until accepted E0 v2 |

Only `jcpe-milestone-reliable-studio-l3a.8.4` may specify the versioned E0
resolution, new schemas, normalization, public projections, and literal E0 v2
fixtures. It remains proposed until the project owner explicitly accepts its
golden packet.

## 4. Replacement preparation

A future, separately accepted E0 v2 composition may project a ready preview
into `PrepareImportReplacementPublicationRequest`. The proposed owner request
contains only:

- complete `{ requestId, documentId, baseRevision }` identity;
- source format paired with its sole canonical/legacy replacement origin;
- the validated candidate;
- immutable command ID, label, and logical time;
- disclosed retained or explicitly-unavailable impact;
- exact `retiring-transport` transition;
- exact nonundoable acknowledgement or `null`.

It contains no complete preview report, raw source, caller `AppState`, history,
bookmarks, focus, notices, recovery state, panels, transport object, adapters,
or authority handle.

The exact source/origin law is frozen independently in A0 by
`IMPORT_REPLACEMENT_ORIGIN_BY_SOURCE_FORMAT`, and
`ImportReplacementSourceIdentity` is a discriminated union over this table:

| Source format             | Required replacement origin |
| ------------------------- | --------------------------- |
| `canonical-json-v2`       | `canonical-import`          |
| `unversioned-legacy-json` | `legacy-import`             |
| `chart-text-v1`           | `canonical-import`          |

Typed producers cannot construct any other pair. Defensive validation still
refuses a malformed raw pair as `import.replacement_request_invalid`; in
particular, chart text with `canonical-import` is valid, not a negative case.

The request is evidence, not a preview-authority token. A0 can compare current
document/revision/request/transition fields, require the candidate document ID
to match the current transition, run F2/F3 over the supplied candidate,
validate command metadata, recompute impact from controller-owned current
state, and check confirmation fields for internal consistency. Current
`AppState` stores neither the full candidate/command snapshot nor a pre-prepare
confirmation seed. Therefore this owner cannot prove that candidate bytes and
command metadata are exactly what the user saw, or that the acknowledgement
came from the originally displayed requirement. Exact preview-to-request
projection and acknowledgement provenance are mandatory E0 v2 binding work;
this owner packet neither claims nor simulates them.

Preparation reads the controller's current state and performs this order before
allocating anything:

1. validate recursively exact keys at every owner-defined request boundary and
   the source/origin pairing;
2. compare current request, document, revision, and transition fields, including
   the candidate document ID but not unrecorded preview bytes;
3. validate the command ID at no more than 128 Unicode code points and label at
   no more than 160 under A0's bounded-token law, and require logical time to
   be a nonnegative safe integer no earlier than the latest undo entry's
   `lastLogicalTimeMs`, without claiming that A0 can prove preview provenance;
4. prove revision and application-sequence increments are available;
5. run a complete F2 structural decode of the candidate;
6. run complete F3 semantic publication without repairing musical data;
7. calculate bookmark/focus repair and exact post-command material;
8. run the real A0 retained-history byte estimator and cap/eviction policy;
9. recompute the current replacement impact;
10. validate retained/nonundoable disposition and acknowledgement field
    consistency, including a present confirmation ID with nonempty trim, valid
    Unicode scalar encoding, and at most 128 Unicode code points, without
    claiming independent consent provenance;
11. prove the private registry is empty;
12. allocate exactly one complete private preparation and return its echo.

The closed refusal vocabulary covers malformed or stale requests, wrong
document/transition bindings, command metadata, revision/sequence exhaustion,
F2/F3 refusal, history estimation, impact drift, confirmation structural near
misses, and registry busy. A present malformed confirmation ID maps to
`import.confirmation_identity_mismatch`; a missing required acknowledgement
maps to `history.nonundoable_confirmation_required`. Every refusal allocates
nothing and starts no X1 retirement.

The returned `PreparedImportReplacementPublication` is a structural echo only.
A caller-created lookalike is never authority. Private command, history,
bookmark, focus, validation, and publication material remains inside A0.

## 5. Private registry laws

The registry has a global capacity of one and only two observable states:
`empty` and `prepared`. Its complete key is
`{ requestId, documentId, baseRevision }`; request ID alone is insufficient.

The following laws are indivisible:

- allocation occurs only after every fallible preparation check succeeds;
- duplicate preparation cannot allocate a second entry;
- a wrong-identity discard cannot erase the matching live entry;
- discard uses the original E0 request identity, never fields recovered from a
  malformed raw preparation result;
- all four cleanup reasons are exact and closed:
  `preparation-protocol-invalid`, `retirement-refused`,
  `retirement-protocol-invalid`, and `publication-protocol-invalid`;
- discard is synchronous, total, nonthrowing, idempotent, and reports
  `liveForRequest: 0` even when no entry exists;
- publish requires the exact still-live entry and exact X1 retirement receipt;
- publish consumes before it returns;
- consumed, invalidated, forged, stale, and wrong-retirement echoes never
  publish;
- every terminal path has zero live entries for the request.

The registry has no timeout, wall-clock expiry, random token, user-visible
capability ID, fallback map, or best-effort cleanup.

## 6. Replacement publication

After exact X1 no-future-attack evidence, A0 constructs the private
`replace-document` command from the stored preparation and publishes it once.
It does not accept a raw replacement command from E0 or the UI, rerun parsing or
migration, or infer missing evidence.

Publication re-reads the controller's latest state and rechecks the complete
document/revision/transition identity, the exact ordered
`pendingRequestsBefore` snapshot captured at preparation (including every
unrelated request and each request status), the preparation-time bookmark input,
available sequence headroom, and that the X1 receipt's retired generation
covers the latest transport generation. A0's immutable reducer law means
history cannot change without revision, so the exact revision check also guards
the precomputed history without storing a second prepare-time `HistoryState`. It must
not install a whole `AppState` captured at preparation time. Same-revision
ephemeral edits may occur during X1 retirement, so publication applies the
precomputed command material to that latest state using this complete field
partition:

| Publication treatment                        | Exact top-level fields                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| preserve latest value                        | `exportRevision`                                                                                                                |
| preserve latest reference                    | `recovery`, `panels`, `dialogs`, `transport`                                                                                    |
| replacement-owned projection                 | `document`, `revision`, `history`, `bookmarks`, `quickEntry`, `importDraft`, `pendingRequests`, `documentTransition`, `notices` |
| allocate from latest sequence at publication | `focusRequest`, `nextSequence`                                                                                                  |

The replacement-owned fields intentionally implement A0's existing
`replace-document` reset/publication semantics. The sequence-dependent focus
request and optional warning notice are completed from the latest
`nextSequence`; no prepare-time sequence can overwrite a later allocation.
The latest value must remain below `MAX_APPLICATION_SEQUENCE`. At the exact
`MAX_APPLICATION_SEQUENCE - 1` boundary, a nonundoable replacement allocates
that value to focus, allocates the maximum to its warning, and leaves
`nextSequence` saturated at the maximum, matching A0's notice law.

A same-revision change anywhere in the ordered pending-request snapshot or the
transition invalidates the prepared command binding. This includes adding an
otherwise unrelated request, removing one, reordering requests, or changing a
request status. A same-revision bookmark edit would change the retained history
entry and its byte estimate, so it is not mergeable. Pending-request,
transition, or bookmark drift, or exhausted latest sequence, consumes the live
entry and refuses
`import.replacement_preparation_stale`; a transport generation newer than the
retirement receipt consumes and refuses
`import.replacement_retirement_mismatch`. These are concurrency rechecks, not
permission to reinstall prepared state or rerun fallible preparation work.
After they pass, the final merge is synchronous and nonfallible. It does not
rerun F2, F3, bookmark repair, history estimation, or impact calculation.

The state-free success receipt contains request identity, published document
ID/revision, deterministic A0 effects and counters, and `liveForRequest: 0`.
Replay, missing/stale preparation, or retirement mismatch returns a state-free
refusal with observed document identity and `liveForRequest: 0`. A valid
refusal after X1 retirement requires reconciliation; it cannot pretend that
the old transport remains usable.

Manual/Frozen pitches, source spellings, stable IDs, exact durations, and every
candidate value are preserved. The owner bridge performs no music-theory
analysis, transposition, respelling, optimization, or silent repair.

## 7. Latest identity read

`readCurrentApplicationDocumentIdentity` synchronously reads `state.document.id`
and `state.revision` from the controller closure at call time. It cannot read a
click-time snapshot, prior selection/view-model projection, memoized selector,
prepared-export binding, or cached previous result.

Ephemeral-only edits may install a new state object while leaving the returned
identity unchanged. Document commands change the revision immediately visible
to the next call. Document replacement changes the document ID and revision as
defined by A0. Normalization of a malformed or throwing consumer-bound result
is deferred to the separately versioned consumer contract.

## 8. Atomic canonical-export marker CAS

`publishCanonicalExportRevision` accepts only the versioned publication
envelope with expected document ID and revision. In one synchronous critical
section, with no await or microtask boundary, it:

1. validates the complete publication envelope;
2. reads controller-owned current state;
3. compares both document ID and revision;
4. refuses stale publication without changing state;
5. if current `exportRevision` already equals the publication revision,
   returns a state-free success receipt without creating or installing state
   and without notifying listeners;
6. otherwise creates the next state by replacing only `exportRevision`;
7. installs that state;
8. notifies listeners only after installation;
9. returns a state-free receipt or refusal.

Document-only and revision-only comparisons are invalid. A delivered revision
7 artifact cannot mark revision 8, and a different document at revision 7
cannot match. Picker-time ephemeral changes are retained when the musical
identity still matches.

On success, all of these current fields and references are preserved:
`document`, `revision`, `recovery`, `history`, `bookmarks`, `panels`, `dialogs`,
`quickEntry`, `importDraft`, `transport`, `pendingRequests`,
`documentTransition`, `focusRequest`, `notices`, and `nextSequence`.
For every installing success, the fixture contract requires
`after[field] === before[field]` for each named field; equal JSON values are not
a substitute for reference identity. The exact replay branch additionally
requires `after === before`. These are frozen implementation expectations for
the later real-controller build and verification phases; this spec-only leaf
does not claim it has executed that production code.

The operation cannot spread a historical object over current state, return
before a required installation, notify before installation, route through an
unchecked public `mark-exported` intent, or expose before/after states to E0.
Repeating an exact successful publication while document/revision still match
takes the explicit no-install/no-listener success branch; a later document edit
makes the old publication stale.

## 9. Applicability and termination

All five ports terminate by fixed state/work bounds. Wall time is never an
input, cutoff, stale test, expiry, retry budget, or tie-break.

Preparation and replacement publication have an independently transposed valid
pair. The expected decision is invariant, and Manual/Frozen pitches are
byte-preserved. Discard, identity read, and marker CAS are harmony-independent:
their applicability rows say transposition is not applicable and include
content-invariance cases proving that they inspect no pitch or chord content.

User cancellation is resolved by the import preview before preparation and
never begins the replacement transaction: it makes no owner call and allocates
no live registry entry. Once preparation begins, user cancellation cannot
interleave. Any post-prepare cleanup is caused only by one of the four closed
protocol, retirement, or publication failure reasons accepted by `discard`.

## 10. Independent packet and gates

To close this owner-only leaf, the five-file packet must contain:

- 28 replacement/registry cases;
- 4 latest-identity cases;
- 10 marker-CAS cases;
- 118 literal A0-owner runs, with no E0-v2 behavior rows;
- 5 complete applicability rows;
- 32 mutation controls;
- 5 reciprocal operation traces;
- 5 provenance authorities.

Every decision-bearing case must materialize literal `before`, `request`,
`result`, and `after` payloads. Full application states and documents may be
deduplicated only through exact fixture IDs whose referenced literals are
present, independently decoded, and semantically validated; prose summaries or
bare case IDs are not proof. The recursively computed before/after diff must
equal the complete declared delta; a partial list of interesting fields is not
an exact delta. Registry cases must show the exact ordered
transition (`empty`/`prepared`), complete key, matching and unrelated live-entry
counts, consume/invalidate point, and terminal count. Controller cases must
record literal event order, including compare, install, notify, and return, and
must include the complete exact work-counter object rather than a claimed
bound.

Production modules may be executed only as conformance subjects or independent
cross-checks after the literal expectations exist. They may not author,
generate, or certify their own expected results.

A prepared registry entry must freeze every private value needed for
publication: the validated candidate, replacement command, the complete ordered
prepare-time `pendingRequestsBefore` sequence, repaired bookmarks, history entry
and resulting history, replacement-owned field projection, late-bound sequence
templates, effects, and counters. The request snapshot is exact data for a
later deep-equality guard, not a digest or target-request-only projection. The
entry must not contain an installable prepare-time whole-state authority.
Publication may consume that material but may not silently rerun F2, F3,
bookmark repair, history estimation, or impact calculation.

Transposition cases must pin base candidate bytes, transposed candidate bytes,
base and transposed SHA-256 values, expected invariant decisions, exact
Manual/Frozen pitch bytes, and inverse-transposition equality. Every mutation
control must materialize its baseline observation, the one changed input or
law, and a distinct derived changed observation that kills the mutant. The
validator must independently recompute the owner-law result or deterministically
reject the mutated law with its exact finding code; a hand-authored killer run
cannot serve as its own oracle. Patching an expected output and then observing
that same patched field is tautological, not mutation proof. Merely naming a
mutation, expected relation, event, counter, or hash is insufficient.
The controls include explicit killers for early preparation allocation,
publish-before-consume, frozen prepare-time state installation, state-bearing
boundary results, marker notification or return before installation, and
deep-cloned preserved marker references.

Malformed-return normalization, thrown or rejected consumer ports, and every
other E0-v2 request/result/event behavior are absent from this A0-owner packet.
They remain wholly deferred to the separately accepted E0-v2 amendment leaf.

The packet must include positive, one-field near-miss, stale/concurrent,
malformed owner-input, replay, transposition/applicability, and mutation
evidence.
An `AppState` revision advance is not a one-field near miss: every
revision-correlated pending request, document transition, quick-entry draft,
and other present revision-bound field must advance with it. A correlated
state witness must list every changed comparison-input pointer, aligned
prepare-time and live values, and the independently recomputed exact change
count. One-field stale-request and stale-marker witnesses instead change the
respective request or publication input while keeping the controller state
valid.
Cleanup must be called twice for each of the four reasons. Wrong-request
isolation, consume replay, invalidation replay, structural lookalike, wrong X1
receipt, picker-time edit, late A1 edit, and compare/write interleaving must be
literal cases rather than prose substitutes.

The validator must pin every bridge byte and a recursively key-sorted semantic
digest, reject duplicate JSON keys and inventory drift, validate every literal
and reference above, and check reciprocal case/trace/control/authority links.
It must independently run the accepted E0 v1 validator and verify the archived
source/doc/test/support/review hashes, the 16-file byte-manifest digest, and the
accepted semantic digest. Those checks prove only archival immutability; they
cannot prove semantic compatibility or acceptance of an E0 v2 binding.

Passing this spec gate proves only the proposed A0 owner contract and its
independent fixture handoff. It does not prove semantic E0 binding, E0 v2
acceptance, controller implementation, real E0 composition, browser delivery,
X1 retirement, A1 persistence, concurrency behavior, expert review, or human
acceptance.

## 11. Forbidden shortcuts

- Adding `AppState` or a state-bearing nested result to any owner/public result.
- Treating preview-time or click-time state as current authority.
- Claiming that A0 proves exact preview candidate/command equality or consent
  provenance without controller-owned binding material.
- Keying the private registry by request ID alone.
- Allocating before F2, F3, history, bookmark, impact, and confirmation checks.
- Letting cleanup throw, await, clear unrelated work, or depend on whether an
  entry exists.
- Publishing a lookalike, consumed, invalidated, or wrong-retirement echo.
- Calling the general document runner with caller-supplied `replace-document`.
- Comparing only document ID or only revision for marker publication.
- Inserting an await between marker compare and write.
- Spreading or reinstalling historical state.
- Exposing raw `mark-exported` as the E0-facing authority.
- Inspecting or changing harmony in identity, registry, cleanup, or marker code.
- Using production output to author fixtures or changing any accepted E0 v1
  doc, source, validator, test, support, fixture, review record, hash, or
  semantic meaning to make this bridge validator pass.
- Claiming that an overlay, addendum, adapter, comment, fixture, or validator
  reinterprets, supersedes, binds, or is semantically compatible with accepted
  E0 v1.
- Moving any E0 semantic delta out of
  `jcpe-milestone-reliable-studio-l3a.8.4` or bypassing its explicit
  project-owner golden acceptance.
- Claiming implementation, expert review, browser proof, or project-owner
  acceptance from this proposed specification packet.
