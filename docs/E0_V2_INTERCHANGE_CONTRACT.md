# E0 v2 Interchange Amendment Contract

Status: proposed specification authority — pending explicit project-owner
golden acceptance
Contract schema: `changes.application.e0-interchange-v2-contract.v1`
Amended policies: `changes.import-transaction@2`,
`changes.export-marker-settlement@2`
Bead: `jcpe-milestone-reliable-studio-l3a.8.4`
Production status: specified, unimplemented

This is the visibly versioned E0 v2 amendment the bridge contract defers to.
It binds accepted E0 v1's transactional import/export orchestration to the
five A0 owner ports of `docs/A0_E0_OWNER_PORTS_CONTRACT.md`, resolves every
row of that contract's section 3.2 unresolved-conflict inventory, and defines
the consumer-side normalization of each port's untrusted return. Accepted
E0 v1 — its documentation, sources, validator, tests, support, sixteen-file
fixture closure, and acceptance record — remains immutable archival authority
exactly as pinned by the bridge validator. Nothing here rewrites, weakens, or
retroactively reinterprets v1; v2 is a separate, versioned surface that a
future composition root may bind only after this packet's own explicit
project-owner golden acceptance.

The authoritative type surface is
`src/application/e0-interchange-v2-contract.ts`. It imports the accepted E0
v1 contract modules and the owner contract by type only, re-exports nothing
into production, and is imported by no production module until the separately
tracked E0/build leaf (`jcpe-milestone-reliable-studio-l3a.8.2`) lands behind
its own gates. The independent fixture packet lives under
`tests/fixtures/interchange-v2/` and is validated by
`bun run validate:e0-v2-contract`.

## 1. Version boundary and non-claims

- E0 v1 request/result shapes keep their exact meaning for the archived v1
  packet. The v2 shapes below are new types with new schema strings; no v1
  string is reused for a changed payload.
- The three schema strings E0 v1 and the owner contract share verbatim
  (`changes.prepared-import-replacement-publication.v1`,
  `changes.canonical-export-revision-publication.v1`,
  `changes.import-nonundoable-confirmation.v1`) are adopted by v2 AS the
  owner's: v2 consumes the owner-declared constants and treats the v1
  duplicates as archival mirrors.
- This packet makes no implementation, controller-integration, browser,
  concurrency, expert-review, or human-acceptance claim. Its checked status
  literal is `specified-unimplemented`.
- The conflict resolutions below become binding semantics only at explicit
  project-owner acceptance of this packet's first golden set, recorded the
  same way as `docs/evidence/E0_GOLDEN_PACKET_REVIEW.md`.

## 2. Conflict resolutions

Each row of the bridge's section 3.2 inventory resolves as follows. The row
IDs are frozen as `E0V2-RES-01` … `E0V2-RES-11` and every fixture family
traces to at least one of them.

### E0V2-RES-01 — import request `currentState`

`CommitImportReplacementRequestV2` carries no `currentState`. It is the
state-free evidence union `PrepareImportReplacementPublicationRequest` from
the owner contract, wrapped with the v2 workflow identity. The controller
closure is the only current-state authority; the composition root never
threads an `AppState` through E0 v2.

### E0V2-RES-02 — preview impact-context state

`PrepareImportPreviewRequestV2` replaces
`replacementImpactContext.state: AppState` with
`replacementImpactProjection: ImportReplacementImpact` — the same
retained/explicitly-unavailable disclosure the owner request carries,
computed by the composition from controller-owned state BEFORE the preview
call and recomputed by the owner at preparation. A projection that disagrees
with the owner's recomputation refuses
`import.replacement_impact_mismatch`; E0 v2 never treats the projection as
authority.

### E0V2-RES-03 — preview-to-request projection

The exact flattening law `E0_V2_PREVIEW_TO_OWNER_REQUEST_PROJECTION`
(frozen in the type surface) maps a ready v2 preview to the owner request
field-by-field: identity from the preview's request token; source
format/origin from the routed source; the validated candidate by reference
(never re-decoded); command seed from the preview's displayed command
identity; disclosed impact from the projection under E0V2-RES-02; the exact
`retiring-transport` transition; the acknowledgement under E0V2-RES-04.
No complete preview report, raw source bytes, or caller state crosses. Every
field of the owner request is populated from exactly one declared preview
field; the projection table is total and admits no defaulting.

### E0V2-RES-04 — preview authority and consent provenance

The v2 import draft retains, verbatim, the
`ImportNonUndoableConfirmationRequirement` it displayed — null for the
retained disposition, where no requirement is shown. A submitted
acknowledgement embeds a complete requirement, and that embedded requirement
must deep-equal the retained one on every field (schema, confirmationId,
identity, candidateDocumentId, commandId, disclosedImpact) before the owner
request is built; a mismatch refuses `import.confirmation_identity_mismatch`,
and a missing acknowledgement for the explicitly-unavailable disposition
refuses `history.nonundoable_confirmation_required` — both WITHOUT calling
the owner. This is the provenance proof the owner contract names as
mandatory E0 v2 binding work: v2 proves the acknowledgement answers the
requirement the user actually saw; the owner re-checks only internal
consistency.

### E0V2-RES-05 / E0V2-RES-06 / E0V2-RES-07 — state-free commit results

`CommitImportReplacementResultV2` is fully state-free:

- success carries `identity`, published `documentId`/`revision`,
  deterministic `effects` and `counters` from the owner receipt, and
  `liveForRequest: 0` — never a nested `publication.state`;
- every refusal family carries `observedIdentity`
  (`ApplicationDocumentIdentity`) in place of v1's `state: AppState`;
- the publication-protocol failure carries `observedIdentity` and
  `reconciliation: "application-transport-reconciliation-required"` in place
  of v1's `lastKnownState`.

The v1 stateEffect vocabulary is retained unchanged; what changes is that
the EFFECT is described, never the state itself returned.

### E0V2-RES-08 — raw marker states

The v2 marker path calls the owner's `publishCanonicalExportRevision` port.
`A0CanonicalExportRevisionPublicationAdapterResult` (with `observedBefore`
and `state`) is retired from the v2 path; the port's unknown return is
normalized against the exact state-free
`PublishCanonicalExportRevisionResult` envelope under section 3. The v1
adapter shape remains archival.

### E0V2-RES-09 — widened preparation refusals

v2 adopts the owner's twenty-code
`IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES` tuple by reference as its
complete preparation vocabulary. The six v1 codes are all members of the
twenty; the superset relation (`v2 = owner tuple`, `v1 ⊂ v2`) is frozen in
the type surface and checked by the validator. No code is renamed and no
v1 code changes meaning.

### E0V2-RES-10 — replacement publication refusals

v2 adopts the owner's three-code
`IMPORT_REPLACEMENT_PUBLICATION_REFUSAL_CODES` tuple. v1's success-only
publication remains true of the archived v1 shape; the v2 workflow surfaces
`preparation_missing`/`preparation_stale`/`retirement_mismatch` as terminal
state-free refusals whose stateEffect is
`APPLICATION_TRANSPORT_RECONCILIATION_REQUIRED`.

### E0V2-RES-11 — public marker request state

`PrepareCanonicalExportDeliveryRequestV2` and
`CompleteCanonicalExportMarkerSettlementRequestV2` drop their `state`
fields. Current identity is read at need through
`readCurrentApplicationDocumentIdentity` (normalized under section 3); the
CAS request carries only the versioned `publication` envelope, exactly as
the owner contract requires. Click-time and picker-time snapshots remain
non-authoritative by construction because no snapshot crosses the boundary.

## 3. Port-return normalization

Every fallible owner port returns `unknown`. E0 v2 owns the normalization:

- The raw value is validated with recursively exact keys against the owner's
  exact result type — the same key-exactness discipline as the owner request
  boundary. Extra keys, missing keys, wrong primitive kinds, non-frozen
  containers, and prototype tricks are all `invalid-envelope`.
- A synchronous throw from a port is caught once at the call site and is
  `threw-or-rejected`; the thrown value is never retained, rethrown, or
  logged with payload.
- Both outcomes produce one `E0V2PortProtocolDiagnostic`
  `{ port, reason, rawResultRetained: false }` over the closed five-port
  name tuple, and map to the SAME reconciliation stateEffects the accepted
  v1 `adapterExceptionPolicy` assigns to the corresponding boundary
  (preparation → invalidate-before-return; publication → application +
  transport reconciliation; marker → application reconciliation, no A1 call;
  identity read → release-gate failure with no browser/A0/A1 side effect).
- `discardImportReplacementPublication` is the deliberate exception: its
  port IS the exact operation type. v2 asserts and the build must prove it
  is never wrapped in normalization, never caught, and called exactly per
  the four closed cleanup reasons.
- A normalized SUCCESS envelope is still evidence, not authority: v2 acts
  only on the typed value and never re-derives fields from the raw value.

## 4. Fixture packet

Companions under `tests/fixtures/interchange-v2/`, manifest
`e0-v2-interchange-contract.json`, all with
`pinState: "pending-validator-freeze"` during authoring and
`"reviewed-byte-and-semantic-pinned"` at freeze:

- `resolution-cases.json` — one literal case family per `E0V2-RES-*` row:
  positive, one-field near-miss, malformed, and stale variants with complete
  literal request/result payloads (the bridge packet's materialization
  idiom: literal catalog + RFC-6901 patches + `from` assertions).
- `normalization-cases.json` — per port × {exact envelope, extra key,
  missing key, wrong kind, thrown} with the exact diagnostic and
  stateEffect; discard-exception cases proving no normalization wrap.
- `projection-cases.json` — the E0V2-RES-03 flattening table exercised
  field-by-field, including the acknowledgement byte-match law and its
  refusal-without-owner-call proof.
- `workflow-cases.json` — the v2 re-materialization of the v1 workflow
  families whose payloads changed (the state-carrying commit/marker rows),
  keyed to their v1 ancestors by ID so the delta is reviewable.
- `mutation-controls.json` — bridge-idiom controls (baseline run + killer
  run + independently recomputed observation), including explicit killers
  for state-bearing v2 results, normalization bypass, projection
  defaulting, and acknowledgement-provenance skips.
- `trace-ledger.json`, `provenance-ledger.json` — reciprocal links over the
  eleven resolutions, the owner law IDs, and the accepted-v1/owner/plan
  authorities.

Fixture documents must respect the groove amendment: a stored
`playback.grooveStyleId` is one of the four non-default ids, and the default
groove appears only as the absent field.

## 5. Validator and gates

`scripts/validate-e0-v2-contract.ts` copies the edit-plan validator idiom:
`--allow-pending-freeze` suppresses exactly the per-file byte digests, the
packet semantic digest, companion digests, and absolute frozen counts, while
every structural, semantic, reciprocity, and mutation-oracle check still
runs; an `expectedByteDigests` seam serves the static test's tamper
controls. The validator additionally:

- imports the owner tuples and re-checks the E0V2-RES-09/-10 superset
  relations against its own independent literal copies;
- independently runs the accepted E0 v1 validator and the bridge validator
  and requires both to pass unchanged (archival immutability, not
  compatibility);
- rejects any v2 fixture whose payload carries `state`, `currentState`,
  `lastKnownState`, or `observedBefore` at any depth of a v2 request or
  result (the false-friend registry-lifecycle `state` strings are matched
  by exact path allowlist);
- verifies every `E0V2-RES-*` row has positive, near-miss, malformed, and
  stale coverage and at least one mutation control.

Gate id `e0-v2-interchange-contract` is registered in `scripts/verify.ts`
immediately after `a0-e0-owner-bridge-contract`, and
`package.json` gains `validate:e0-v2-contract` — both only in the freezing
commit, so the aggregate gate never sees a pending packet.

## 6. Forbidden shortcuts

- Reusing a v1 schema string, policy version, or result type for a changed
  payload.
- Editing any accepted E0 v1 or bridge file to make the v2 packet fit.
- Treating the impact projection, click-time snapshot, or normalized port
  success as state authority.
- Wrapping or catching `discardImportReplacementPublication`.
- Retaining, logging, or rethrowing a raw port return or thrown value.
- Claiming semantic compatibility with v1, controller implementation, or
  project-owner acceptance from this proposed packet.
- Authoring fixture expectations from production output.
