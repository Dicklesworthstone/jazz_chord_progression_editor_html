# U1 Quick-Entry and Chart-Editing Contract

Status: proposed independent specification packet  
Package: `U1`  
Contract schema: `changes.fixtures.u1-editing-contract.v1`  
Quick-entry cases: `changes.fixtures.u1-quick-entry-cases.v1`  
Operation matrix: `changes.fixtures.u1-edit-operation-matrix.v1`  
Interaction matrix: `changes.fixtures.u1-interaction-matrix.v1`  
Trace ledger: `changes.fixtures.u1-trace-ledger.v1`  
Provenance ledger: `changes.fixtures.u1-provenance-ledger.v1`  
Mutation controls: `changes.fixtures.u1-mutation-controls.v1`  
Bead: `jcpe-milestone-reliable-studio-l3a.10.1`

This document and `src/ui/studio/u1-editing-contract.ts` are the code-facing U1
authority. The independent fixture package under `tests/fixtures/editing/`
supplies the expected classifications, channel bindings, and interaction
states. Production components may be compared with those fixtures; they may
not generate, rewrite, or bless their expectations.

The words **must**, **must not**, **exactly**, and **refuse** are normative.

## 1. Boundary and implementation model

U1 builds the quick-entry field, the lead-sheet chart, and the editing
interactions that turn typed changes into committed chart edits. It is a
presentation and intent layer only:

- U1 renders selector values and dispatches application intents; it never
  imports audio, persistence, export, theory, playback, or compatibility, and
  never mutates a domain value;
- U1 adds **no** mutation channel. Every edit is exactly one existing A0
  `DocumentCommand` or one existing ephemeral intent. The complete authorized
  set is frozen in `U1_AUTHORIZED_COMMAND_KINDS`,
  `U1_AUTHORIZED_EPHEMERAL_INTENT_KINDS`, and
  `U1_AUTHORIZED_EDIT_PLAN_KINDS`;
- U1 is not a second syntax classifier. Token status, diagnostics, ranges, and
  the recoverable-chord lane all come from one T0 parse;
- U1 is not a publisher. A0 owns the optimistic revision check, the atomic
  transition, history, bookmark repair, focus, notices, and effects. A U1
  refusal only describes a pre-dispatch guard.

The six A0 command kinds outside this surface — `set-voicing`,
`set-document-settings`, `transpose`, `apply-suggestion`,
`apply-reharmonization`, and `replace-document` — are frozen in
`U1_UNAUTHORIZED_COMMAND_KINDS`. The static contract test proves the two lists
partition the live sixteen-kind A0 tuple exactly, so U1 can neither widen the
command surface nor silently drop a kind.

The code-facing module imports only types from `src/ui/ui-contract.ts`. It
declares the A0 binding as reviewed literal strings, and the static test
compares those strings with the live `APPLICATION_COMMAND_KINDS`,
`A0_U1_ATOMIC_EDIT_PLAN_KINDS`, and `EphemeralIntent` union. That keeps the
release bundle free of an application import while still failing loudly if the
upstream surface moves.

## 2. Surfaces and public inventory

The inventory is closed for U1: 25 components across four surfaces.

| Surface | Components |
|---|---|
| `quick-entry` | `U1-CMP-001` … `U1-CMP-007` |
| `chart` | `U1-CMP-008` … `U1-CMP-021` |
| `range` | `U1-CMP-022` … `U1-CMP-024` |
| `view` | `U1-CMP-025` |

Feature components receive selector values and dispatch intents. They compose
the U0 owned primitives; they do not invent one-off controls, and they do not
know about storage, audio, or parser implementation modules.

## 3. Operations and application channels

`U1_EDIT_OPERATIONS` is a closed inventory of 33 rows. Every U1 gesture, key,
and menu item resolves to exactly one row, and every row resolves to at most
one application command or intent. Each row declares its `channel`,
`commandKind`, `planKind`, `intentKind`, `undoable`, `pointerAlternative`, and
`keyboardAccess`.

The channel laws are exact:

- `document-command` rows name an authorized A0 command kind, carry no
  ephemeral intent, and are undoable;
- `ephemeral-intent` rows name an authorized intent kind, carry no command or
  plan, and create no history entry;
- `presentation-only` rows reach the application in no way at all;
- `commandKind: "apply-edit-plan"` carries exactly one of the five atomic plan
  kinds, and no other command kind carries a plan;
- exactly one application command may result from one user action.

The five atomic plan kinds are used as follows:

| U1 operation | Plan kind | Lane |
|---|---|---|
| `quick-entry-insert-preview` | `insert-fragment` | complete-draft |
| `quick-entry-insert-one-chord` | `insert-fragment` | recovered-chord |
| `split-event-duration` | `split-event-duration` | — |
| `join-event-durations` | `join-event-durations` | — |
| `split-section` | `split-section` | — |
| `join-sections` | `join-sections` | — |

Everything else uses the historical A0 commands: `insert`, `delete`, `move`,
`duplicate`, `set-text` (section name and annotation only), `set-duration`,
`set-measure-completion`, `set-section`, and `set-chord`.

Inline symbol editing dispatches `set-chord` with a complete event
replacement, never a field patch. That is the direct answer to the confirmed
legacy failure where a root edit relabelled stale pitches.

## 4. Quick entry

The draft is caller-owned raw text of at most 4,096 code points and 16,384
UTF-8 bytes. U1 preserves it exactly: it does not canonicalize, trim, repair,
or rewrite the draft, and it never replaces the source text of an invalid
token with a guess.

Preview status comes from one T0 fragment parse against the guarded document
meter. Tokens carry exactly three states:

- `valid` — the token belongs to a successfully parsed draft;
- `insertable` — the draft refused, but T0 published this token in its
  recoverable-chord lane;
- `invalid` — the token did not parse.

A successful draft shows one `valid` row per parsed event. A refused draft
shows exactly one `insertable` row per published recoverable chord and no
`valid` rows.

### 4.1 The five insertion-plan statements

Before insertion, the preview must state exactly one of:

| Statement | Meaning | Committable in v1 |
|---|---|---:|
| `fits-measure` | one complete measure into an empty target measure | yes |
| `completes-measures` | complete measures into a section, or named sections into the document | yes |
| `incomplete-requires-confirmation` | the draft leaves a short bar | no |
| `overfill-requires-split` | the material exceeds the destination | no |
| `not-atomic-refusal` | the draft or placement cannot be applied atomically | no |

The classification is deterministic and total. It is computed with exact
rational arithmetic over the declared meter capacity
(`beatsPerBar × 4 ÷ beatUnit` quarter notes), the parsed draft, and the
destination, in this order: draft preflight, T0 outcome, staleness,
destination level, draft shape, destination occupancy. The validator
recomputes every case rather than trusting the fixture.

The statement is **presentation, not publication**. A0 remains the sole
publisher. If the statement and the A0 outcome disagree at runtime, the A0
receipt or refusal wins and U1 must surface it verbatim.

The two blocked states are stated with explicit resolutions and never resolved
silently:

- `incomplete-requires-confirmation` offers completing the final measure,
  inserting one recovered chord into a measure, or Cancel;
- `overfill-requires-split` offers choosing an empty measure or a structural
  boundary, shortening the draft, or Cancel.

No implicit beat loss, no silent measure rebalance, and no synthesized rest is
allowed in either case.

### 4.2 The two lanes

The complete-draft lane requires T0 success and quick-entry status `ready`. A
complete measure already occupies the whole bar, so a measure-level placement
is legal only into an existing empty measure; a `before-event`/`after-event`
boundary therefore always denotes a non-empty measure and always overfills.

The recovered-chord lane requires T0 failure and status `invalid`. It inserts
exactly one published recoverable chord into one measure, and only when the
remaining capacity admits it: a resolved duration must fit the remainder, and a
`requires-caller` duration needs a positive remainder plus one caller-supplied
exact `BeatDuration`. Applying "the valid parts" of a refused draft is not an
operation. The lane always requires the literal layout-loss acknowledgement
recorded by the upstream A0/U1 contract.

### 4.3 Resolved open decisions

- **Duration suffixes.** T0 already owns the suffix grammar. U1 accepts every
  positive integer and rational T0 accepts and narrows nothing.
- **A section marker naming an existing section.** Document placement is
  insert-only. A colliding name produces a visible warning and still creates a
  new section; section merge remains deliberately deferred.
- **View-mode toggle placement.** The toggle lives in the chart-region toolbar
  and owns presentation-only state that never reaches the application.

## 5. Chart editing

### 5.1 Identity and focus

Chart nodes are keyed by stable domain identity. Array-position keys are
forbidden. Roving focus follows visual order across measure and section
boundaries as a single tab stop, and a reorder preserves the focused and
selected identity as well as playback identity.

After a destructive command, focus repair is exactly: next event, then previous
event, then the section insertion target. U1 never reads or infers current DOM
focus; it renders the A0 focus request, whose priority is selection focus,
then a non-chart insertion target, then the first inserted structural
reference, then the chart.

### 5.2 Selection, insertion point, range, and playhead

The four concepts are independent values with independent owners:

| Concept | Owner | Moves the playhead |
|---|---|---:|
| selection | `bookmarks.selection` | no |
| insertion point | `bookmarks.insertion` | no |
| range | `bookmarks.range` | no |
| playhead | `transport.playhead` | yes |

Selection never moves the playhead, preview never changes selection, playback
never changes selection, selecting never moves the insertion point, and setting
a range never changes selection.

On touch, Select range exposes two boundary handles plus Set start, Set end,
exact start and end beat fields, Done, and Cancel — every one reachable without
a drag. Beat fields accept exact rational text and are stored exactly.
Unordered endpoints refuse; Cancel restores the exact prior range.

### 5.3 Editing transactions

Inline symbol editing keeps raw text in component-local state. Enter or Apply
commits only on a successful parse; Escape restores the exact prior source
text; blur neither commits nor coerces; and switching away with a dirty draft
prompts Apply, Discard, or Continue editing. Inline symbol editing is disabled
with a named reason when the event's voicing mode is Manual or Frozen, because
exact stored pitches must not be relabelled under a new symbol.

Duration edits always state the resulting measure fill:

| Fill | Completion | Resolutions |
|---|---|---|
| `exact-fill` | complete | apply the duration |
| `underfill-requires-reason` | incomplete | declare an explicit incomplete measure with a reason, or Cancel |
| `overfill-requires-resolution` | — | Move following events, shorten the duration, or Cancel |

The first release synthesizes no rests. Move following events is one `move`
command; an atomic split of an overfilled measure at the bar line needs a new
A0 plan variant and is deferred with that dependency named in the packet's
handoff record. No U1 gesture may compose two application commands to hide the
gap.

### 5.4 Pointer, keyboard, and listeners

Drag is an optional enhancement on a dedicated handle. Touch activation does
not call `preventDefault` before a real 8 CSS-pixel drag threshold, so taps and
scrolling survive. Pointer capture is released on cancel and on unmount.

Every pointer-driven operation has a keyboard binding, a named menu item, or
ordinary text entry; `pointerAlternative: "none"` is not a legal inventory
value. Listener counts are component-scoped and constant: three static
listeners per chord card, one per insertion target, three per chart region, and
at most three transient listeners for at most one concurrent drag session, all
removed on unmount. Document mutation never registers listeners.

### 5.5 Views and responsiveness

Compact and teaching views render identical musical facts; teaching adds
explanatory labels only and never invents an absent analysis. Toggling changes
no document state, no bookmark, and no revision. The required viewports are
320×568, 390×844, 768×1024, 1280×800, and 1440×900, and no primary action
depends on hover.

## 6. Bounds, work, and refusals

Every bound is an inherited upstream limit or a value mechanically derived from
one. `maxPreviewTokens` and `maxPreviewMeasures` follow from the 4,096
code-point draft bound because the shortest token and the shortest
shared-barline measure each occupy at least two code points; the UTF-8 byte
bound is four times the code-point bound. The static test proves the shared
values equal their U0, A0, and domain sources rather than restating them.

Work is bounded by rendered collections: at most `maxPreviewTokens` token
visits per draft change, at most `maxRenderedEvents` card and roving-focus
visits, and at most the target measure's event count per duration preview.
Elapsed wall time is never a musical or correctness cutoff.

`U1_REFUSAL_CODES` holds 29 pre-dispatch guard codes. They describe what U1
refuses before dispatch and never rename an application refusal: application,
atomic-edit-plan, and T0 diagnostic codes and ranges are surfaced verbatim, a
refused command is never silently retried, and a refusal is never presented as
a success.

## 7. Independent fixtures, traceability, and mutation controls

The packet under `tests/fixtures/editing/` is reciprocal:

- `u1-editing-contract.json` owns the manifest, inventories, bounds, channel
  authorization, plan and fill authority, policies, counts, and the companion
  byte digests;
- `quick-entry-cases.json` owns 46 draft classification cases whose `t0Result`
  block is a declared scenario input, not a prediction about T0;
- `edit-operation-matrix.json` owns 59 rows binding gestures to channels,
  including stale, malformed, limit, and cancellation guards;
- `interaction-state-matrix.json` owns 58 bookmark, focus, pointer, listener,
  range, view, responsive, and non-happy-path states;
- `trace-ledger.json` owns 8 traces and one coverage row per law;
- `provenance-ledger.json` owns 9 classified authorities;
- `mutation-controls.json` owns 32 controls.

Every law has at least one positive and one negative or near-miss case. Every
case names at least one law, one trace, and one authority, and every trace and
authority links back. Expected values are authored, never captured.

The validator replays all 32 mutation controls: it applies each control's
single declared pointer change to an in-memory copy of the packet, re-runs the
complete oracle set, and requires the declared finding code to appear. Each
control's observation pointer must differ from its mutation target, and the
declared baseline and observation values must already be present. A surviving
mutant is a validator defect, not a passing packet.

The validator must reject a missing or extra companion, a duplicate JSON key, a
changed limit, an unassigned public bound, a widened command authorization, a
channel binding that disagrees with the inventory, a fabricated insertion plan,
a measure sum that is not the exact bar capacity, a token state that
misreports the recoverable lane, a relaxed pointer or listener policy, an
index-keyed chart, a broken reciprocal link, an undeclared refusal token, a
drifted count, a generated expected value, and a premature implementation,
UI-completion, human-acceptance, or expert-review claim.

## 8. Handoff and forbidden shortcuts

An implementing agent can build U1 from this document, the code-facing module,
and the fixture package alone, without consulting the markdown plan. These are
contract violations, not style preferences:

- using array-index keys for chart nodes;
- requiring a drag to author anything;
- losing beats or rebalancing a measure silently;
- synthesizing a hidden rest;
- coercing invalid symbol text on blur;
- classifying chart syntax anywhere in the UI;
- mutating a document from the UI;
- batching or nesting application commands in one gesture;
- using elapsed wall time as a musical or correctness cutoff;
- substituting a mock for a named real-browser gate;
- registering listeners per document mutation.

U1/spec defines the complete editing surface and its proof obligations. It does
not claim that any U1 component exists yet: the packet records
`implementationStatus: "specified-not-implemented"` and no production, UI
completion, human acceptance, or expert review claim.
