# U7 MIDI Export Workflow Contract

Status: proposed independent specification packet — no production
implementation, no UI completion, no human acceptance, and no expert review
is claimed.

Package: U7 (`jcpe-milestone-advanced-craft-ulj.11.1`), Advanced Craft
milestone. Depends on accepted/closed authorities only: U0 (accessible
primitives and overlays), E1 (`jcpe-milestone-advanced-craft-ulj.2`, closed),
P0, T0, A0.

This document, the code-facing module
`src/application/u7-midi-export-workflow-contract.ts`, the fixtures under
`tests/fixtures/midi-export-workflow/`, and the independent validator
`scripts/validate-u7-contract.ts` are the complete authority for `U7/build`.
Another agent must be able to implement the package from this packet without
consulting the markdown plan.

Pinned identities: contract schema
`changes.application.u7-midi-export-workflow-contract.v1`; policy
`changes.u7-midi-export-workflow` version 1; fixture manifest schema
`changes.fixtures.u7-midi-export-workflow-contract.v1`.

## 1. Boundary and implementation model

U7 is the MIDI export workflow: the trigger, dialog/sheet, preview,
generation, and download delivery of the Standard MIDI File that E1 writes.
It owns no musical semantics. Its four responsibilities are:

1. **Preview** — derive and disclose everything the user is entitled to know
   before generating: readiness, realization provenance, the fixed byte-model
   facts, bass-policy disclosure, expected losses, blocked events with chart
   links, the safe filename, the deterministic artifact hash, and the byte
   length.
2. **Generation** — re-verify the pinned binding and adopt the prepared
   artifact, never bytes compiled from a chart that has since changed.
3. **Delivery** — object-URL download under a user gesture with total
   cleanup accounting, through a capacity-one single-use preparation
   registry that mirrors the accepted E0 v1 registry discipline.
4. **Honest status** — every state transition has a pinned announcement;
   every failure is a typed value; nothing is ever claimed that was not
   observed (a handed-off download is never reported as saved to disk).

Layer placement: the workflow contract and the future service live in
`application` (which may import `export` and `playback`); the future dialog
components live in `ui` and consume view models and intents only. `ui` never
imports `export`; the dialog never calls `exportMidi` directly.

U7 adds no mutation channel. It dispatches zero A0 command kinds and exactly
two ephemeral intent kinds (`push-dialog`, `pop-dialog`) for its own dialog.
It never dispatches `mark-exported` and never calls recovery Save: the MIDI
file is a lossy performance artifact, and advancing the canonical export
marker for it would tell the user their document is safely exported when the
lossless form has not been exported. Blocked-event links reuse the existing
chart selection surface and add no channel.

The workflow dialog kind is the proposed seventh application dialog kind
`midi-export`, appended after the six accepted kinds so accepted indices stay
stable. Live `APPLICATION_DIALOG_KINDS` is not amended by this packet.

## 2. Preview model and derivation laws

The preview is computed synchronously at open against a pinned
`(documentId, revision)` binding. Every later stage re-checks the binding;
a mismatch is the stale outcome `u7.revision_stale` — never a silent re-read
and never a refusal, because a changed chart is a fact to disclose.

### 2.1 Readiness and blocked enumeration (U7-LAW-BLOCKED-ENUMERATION)

Readiness is `ready` or `blocked`. The preview enumerates **every** blocker,
not the first one: the U7 service walks each chord event independently and
classifies it —

- a parsed chord that T1 cannot resolve: blocker kind `realization`, the T1
  refusal code verbatim, the event link;
- an auto voicing V0 cannot generate for: kind `realization`, the V0 code;
- a custom chord (no resolvable symbol): kind `plan`, code
  `playback.custom_voicing_missing` (P0 owns it; U7 names it early because
  the walk can see the missing binding before P0 does);
- a document-level realization or plan-compile refusal: kind `realization`
  or `plan` with the owning code and a null event link;
- an empty chart (no chord events): kind `empty-chart`, no code;
- an E1 export refusal discovered by running the export at preview time:
  kind `export`, the E1 code and path verbatim, with the event link recovered
  from a `/plan/events/<ordinal>/…` path when the path names one.

The Manual-unison tension (`jcpe-u0mc`) resolved as an additive E1
amendment: a Manual voicing may double a unison (Manual pitches are never
repaired), and the doubled number now exports as one on/off pair with the
`unison-doubling` loss row mirrored in the preview
(`docs/E1_MIDI_EXPORT_CONTRACT.md` section 3) instead of refusing the
whole chart. The blocked-state law above still holds for every export
refusal that remains — never a crash, and the file is never partially
written.

The blocked list is capped at `MAX_DOCUMENT_CHORD_EVENTS` entries, which the
walk cannot exceed; there is no separate truncation law.

### 2.2 Marker derivation (U7-LAW-DERIVATION-MARKER)

E1 never derives marker text; U7 owns the derivation:

- one `section` marker per section, bound to the section's first event, text
  = the section name;
- one `chord` marker per event, text = the T0 canonical formatting with the
  unicode accidental style for parsed chords, or the stored label for custom
  chords;
- markers are emitted in document source order; E1's byte model orders them
  by tick with `section` before `chord` at an equal tick.

A marker is **omitted and disclosed**, never truncated and never blocking,
when its text is empty after trimming, contains an ASCII control character,
exceeds 96 UTF-8 bytes, or its canonical formatting refuses (defensive:
unreachable for a validated chord). Each omission is a preview notice naming
the event, the marker kind, the reason
(`text-control-chars` | `text-over-limit` | `text-empty` | `format-refused`),
and the UTF-8 byte length. An omitted chord marker means E1's
`annotation-text` loss names the event; the preview mirrors that loss row.

Marker overflow is unreachable by construction: chord markers ≤ 8,192
(`MAX_DOCUMENT_CHORD_EVENTS`), section markers ≤ 64
(`MAX_DOCUMENT_SECTIONS`), and the E1 marker cap is exactly 8,256.

### 2.3 Title and track metadata (U7-LAW-DERIVATION-TITLE)

- `title` = the document title, with two disclosed substitutions and no
  repairs: any ASCII control character → the pinned fallback `Untitled` with
  a `title-control-chars-substituted` notice; more than 96 UTF-8 bytes →
  code-point-boundary truncation to at most 96 bytes with a
  `title-truncated` notice carrying the original byte length. (The domain
  decoder already refuses blank titles; the fallback for empty text is
  pinned as a defensive law and covered by a near-miss fixture row.)
- `voicingTrackName` = `Voicings` and `instrumentName` = `Changes`, pinned
  literals. The file carries no program change, so the instrument metadata
  is a label of the artifact family, not a claim about the playback
  instrument; this keeps the exported bytes a pure function of the document,
  which is what makes the disclosed hash meaningful.
- `requestId` = `u7-midi-export-` + the document id transliterated into the
  E1 request-id alphabet (every other character becomes `-`) + `-` + the
  pinned revision, truncated to 128 ASCII characters. Never a clock, random
  value, or file name.

### 2.4 Artifact hash and determinism (U7-LAW-ARTIFACT-HASH, U7-LAW-DETERMINISTIC-BYTES)

The preview discloses `sha256`, the lowercase-hex SHA-256 of the exact SMF
bytes, computed through an injected hash port; a port failure refuses the
preview with `u7.hash_unavailable`. Because E1 is pure and the plan is a
pure function of the validated document, one `(documentId, revision)` pair
yields byte-identical artifacts — the hash the user sees at preview is the
hash of the bytes they receive at download. The preview also discloses the
E1 report facts: filename (E1's law), byte length, note count, marker count,
and the exact tempo encoding (requested BPM, encoded microseconds per
quarter, and the rational rounding-error pair).

### 2.5 Realization and bass-policy disclosure (U7-LAW-REALIZATION-SUMMARY)

The preview states how many events carry stored Manual voicings, stored
Frozen voicings, and generated (V0/V2) voicings, and lists every event whose
bass policy is external: for those events the file carries **no bass note**,
by design (rootless families require an external bass instrument). This is
the disclosure the "external bass" E2E case proves.

### 2.6 Loss mirroring (U7-LAW-LOSS-MIRROR)

The preview lists the exact E1 loss rows the export report carries:
`enharmonic-spelling`, `annotation-text`, `loop-range`, and
`unison-doubling` (E1 additive amendment, jcpe-u0mc). U7 always exports
with `loop = null` (the whole chart; an armed playback loop is a
playback-monitoring construct, not a document property), so the
`loop-range` loss cannot appear in U7 output — pinned as a stated invariant
with a fixture row, not left as a surprise.

## 3. State machine (U7-LAW-STATE-MACHINE, U7-LAW-REGISTRY-DISCIPLINE)

Dialog states: `idle → preview-open → generating → ready → delivering →
delivered`. `generating` models the synchronous verify-and-adopt transition
so the UI has an honest busy surface; no state implies background work.

The capacity-one preparation registry mirrors the accepted E0 v1 canonical
registry: states `empty | preparing | ready | delivering`; operations begin,
publish, take, abandon, finish; a branded monotonic preparation id in
1..2⁵³−1. U7 restates the discipline structurally; accepted E0 v1 is not
amended, and the static test pins the structural equality.

Transition table (each row is materialized as a state-case fixture):

| # | From | Action | Condition | To | Outcome | Registry after |
|---|---|---|---|---|---|---|
| 1 | idle | open | document available, compute ok | preview-open | preview (ready) | ready |
| 2 | idle | open | blockers found | preview-open | preview (blocked) | empty |
| 3 | idle | open | no current document | idle | refusal `u7.document_unavailable` | empty |
| 4 | idle | open | registry busy | idle | refusal `u7.preparation_conflict` | unchanged |
| 5 | idle | open | hash port failure | idle | refusal `u7.hash_unavailable` | empty |
| 6 | preview-open | generate | binding fresh | ready | generated | ready |
| 7 | preview-open | generate | binding stale | preview-open | stale `u7.revision_stale`, artifact abandoned | empty |
| 8 | preview-open | generate | artifact missing | preview-open | refusal `u7.preparation_missing` | empty |
| 9 | ready | download | binding fresh | delivering → delivered | handed-off | empty |
| 10 | ready | download | binding stale | preview-open | stale `u7.revision_stale`, artifact abandoned | empty |
| 11 | delivered | download | second take | delivered | refusal `u7.preparation_missing` | empty |
| 12 | preview-open / generating / ready | cancel | — | idle | cancelled, total cleanup (zero resources before download) | empty |
| 13 | preview-open / ready | close | — | idle | closed, total cleanup | empty |
| 14 | preview-open (stale) | re-preview | — | preview-open | refreshed preview | ready |
| 15 | delivered | re-preview | — | preview-open | refreshed preview | ready |
| 16 | delivered | dismiss-delivered | — | idle | closed | empty |
| 17 | delivering | completion | activation started | delivered | handed-off; object URL revoked exactly once; `objectUrlsCreated 1 / objectUrlsRevoked 1 / outstandingOwnedResources 0` | empty |
| 18 | delivering | completion | activation start threw | ready | outcome `failed`, zero-created cleanup | ready |
| 19 | delivering | completion | revoke threw | delivered | refusal `u7.delivery_cleanup_failed`, `cleanup: reconciliation-required` | empty |

Cancel and close are offered from `preview-open`, `generating`, and `ready`;
never while `delivering` (the activation is committed) — the state rows pin
the affordance per state. After `handed-off`, the browser's download
management is unobservable; the dialog reports handed-off and never claims
disk persistence.

## 4. Accessibility matrix (U7-LAW-ACCESSIBILITY-MATRIX)

The workflow renders as a modal `Dialog` at or above the U0 compact
breakpoint (640 CSS px) and as a modal `SheetDrawer` below it — the only two
overlay forms U0 licenses for this workflow. Every (state × surface) pair
pins: the initial focus target, the live-region announcement key and
politeness (`polite` for status, `assertive` for refusals), the allowed
actions, and the focus-return target on close (the header trigger).
Announcement keys are frozen (`U7_ANNOUNCEMENT_KEYS`); the state-cases
fixture materializes the full matrix, and the limit cases prove its
completeness.

## 5. Bounds, work, and refusals (U7-LAW-WORK-BOUND)

Preview assembly carries three deterministic work counters —
`events-visited` (≤ 8,192), `markers-derived` (≤ 8,256), `bytes-hashed`
(≤ 4,194,304) — each inherited from an upstream cap. Exceeding one refuses
`limit.u7_preview_work_exceeded`, a failsafe that is unreachable while the
domain caps hold. Wall time is never a bound.

Call-level refusals in precedence order: `u7.request_invalid`,
`u7.document_unavailable`, `u7.hash_unavailable`, `u7.preparation_conflict`,
`u7.preparation_missing`, `u7.delivery_cleanup_failed`,
`limit.u7_preview_work_exceeded`. Staleness is the outcome
`u7.revision_stale`, never a refusal. Blocked previews are values, never
refusals. Every U7 surface failure is one of these — no throw escapes the
service.

## 6. Independent fixtures, traceability, and mutation controls

Fixtures under `tests/fixtures/midi-export-workflow/` (all
`expectedValuesGenerated: false`, `productionOutputUsedAsOracle: false`):

- `u7-midi-export-workflow-contract.json` — manifest binding every constant,
  inventory, limit, refusal/outcome vocabulary, and the companion byte
  digests.
- `preview-cases.json` — literal scenario → expected preview model. Ready
  cases pin `expectedArtifactSha256`, independently derived from the E1 byte
  model over the case's declared plan and U7's derivation laws.
- `state-cases.json` — the transition table materialized, with registry
  states, cleanup accounting, and announcement keys per row.
- `limit-cases.json` — the 96/97-byte marker boundary, the title truncation
  boundary, the marker-cap arithmetic relation, preparation-id bounds, and
  the accessibility-matrix completeness proof obligation.
- `trace-ledger.json` — every parent requirement, invariant, and success
  criterion traced to cases and to named future `U7/build` test files.
- `provenance-ledger.json` — the authority ledger (SMF/E1, P0, T0, U0, E0
  v1, A1, REBUILD_PLAN §16.3) with `expectedValuesGenerated: false` and
  `productionOutputUsed: false`.
- `mutation-controls.json` — JSON-pointer corruptions with expected finding
  codes; the validator replays every control and a surviving mutant fails
  the gate.

`scripts/validate-u7-contract.ts` imports no production module. It restates
the byte model and the derivation laws, re-emits each ready case's artifact
with its own minimal SMF emitter, recomputes the SHA-256, and diffs against
the pinned expectation — so the pinned hashes are judged by two independent
implementations, never by the production writer.

## 7. Handoff and forbidden shortcuts

Contract violations even if a demo appears to work:

- Calling `exportMidi` from `ui`, importing `export` from `ui`, or letting
  the dialog read live controller state at render time instead of the pinned
  preview model.
- Downloading bytes compiled from any revision other than the pinned one;
  re-reading silently on staleness instead of the `u7.revision_stale`
  outcome.
- Advancing the canonical export marker, dispatching `mark-exported`,
  calling recovery Save, or claiming the document is exported after a MIDI
  download.
- Auto-fixing, completing, or substituting a voicing; truncating a marker;
  repairing control characters in user text beyond the pinned disclosed
  title/marker laws.
- Creating an object URL before the download gesture, leaking one after any
  terminal state, or reporting a handed-off download as saved.
- Offering PPQ, tempo, meter, or track count as user options (they are E1/P0
  pins, disclosed verbatim), or exporting an armed playback loop range.
- Claiming notation preservation, DAW templates, MIDI import, device
  playback, or cloud sharing (all non-goals).

Handoff: `U7/build` implements the service in `src/application/` and the
dialog/sheet components in `src/ui/studio/`, satisfies every fixture family
via the trace ledger's named future test files, and leaves the release-matrix
note that the manual DAW/player session (`jcpe-zq92`) already covers the E1
goldens this workflow's artifacts descend from.
