# U4 Transport Controls and Truthful Audio Status Contract

Status: proposed independent specification packet  
Package: `U4`  
Contract schema: `changes.fixtures.u4-transport-controls-contract.v1`  
Operation matrix: `changes.fixtures.u4-control-operation-matrix.v1`  
Status projection cases: `changes.fixtures.u4-status-projection-cases.v1`  
Keyboard guard cases: `changes.fixtures.u4-keyboard-guard-cases.v1`  
Layout cells: `changes.fixtures.u4-layout-cells.v1`  
Trace ledger: `changes.fixtures.u4-trace-ledger.v1`  
Provenance ledger: `changes.fixtures.u4-provenance-ledger.v1`  
Mutation controls: `changes.fixtures.u4-mutation-controls.v1`  
Bead: `jcpe-milestone-reliable-studio-l3a.12.1`

This document and `src/ui/studio/u4-transport-controls-contract.ts` are the
code-facing U4 authority. The independent fixture package under
`tests/fixtures/transport-controls/` supplies the expected control inventory,
enablement matrices, status projections, keyboard guards, and layout cells.
Production components may be compared with those fixtures; they may not
generate, rewrite, or bless their expectations.

The words **must**, **must not**, **exactly**, and **refuse** are normative.

## 1. Boundary and implementation model

U4 builds the transport controls and the truthful audio-status presentation of
the studio: the footer transport bar, its Sound-sheet settings twin, the
per-section loop-scope buttons, the accessible scrubber, and the status block.
It is a presentation and intent layer only:

- U4 renders selector values and dispatches application intents; it never
  imports audio, playback, persistence, export, theory, or compatibility,
  and never mutates a domain value;
- U4 adds **no** transport or mutation channel. Every control resolves to
  exactly one existing or U4-named `StudioController` intent; the X1
  serialized transport remains the only path that schedules or retires
  sound. The complete authorized surface is frozen in
  `U4_TRANSPORT_OPERATIONS` and `U4_AUTHORIZED_EPHEMERAL_INTENT_KINDS`;
- U4 never schedules sound, advances the playhead, owns a timer, or
  interpolates a musical value into state. The animation-frame sweep is a
  display-only read of the X1 display playhead (`readDisplayPlayheadBeat`)
  through the controller's `readTransportPlayheadLabel`; committed state
  changes arrive only through A0's accepted `TransportNotification`
  projection;
- U4 is not a publisher of transport state. A0 owns `expect-transport`
  optimism, notification acceptance with generation/sequence/request
  identity, stale rejection (`ignored-stale`), and refusal settlement. U4
  renders the outcome; it never invents, predicts, or repairs one.

The audio-layer truth U4 presents is frozen upstream: X1 states
`TRANSPORT_STATES`, the state-to-status projection
`TRANSPORT_STATE_STATUS_PROJECTION`, the command kinds
`TRANSPORT_COMMAND_KINDS`, the refusal codes `TRANSPORT_REFUSAL_CODES`, and
the A0 status union `APPLICATION_TRANSPORT_STATUSES`. The code-facing module
declares these bindings as reviewed literal strings, and the static contract
test compares them with the live tuples, so the release bundle carries no
audio or application import while any upstream motion fails loudly.

### 1.1 Relationship to the shipped surface

The studio already ships a partial transport surface (play, pause, stop,
previous/next selection step, whole-chart and per-section loop, click-fraction
scrub, tempo steppers and exact input, groove and instrument pickers,
volume/mute, now-chord and position readout, the seven-status badge, guarded
Space/Shift+Space, and the safe-area footer). U4 keeps every shipped behavior
that this packet does not explicitly amend, and this packet is the authority
for the deltas: the separate Restart control, the count-in and metronome
toggles, the slider-accessible scrubber, the instrument-change boundary
notice, the paused-state Stop, the context-exact previous/next law, and the
interrupted/fault presentation. Nothing here authorizes removing a shipped
control or weakening an existing guard.

## 2. Surfaces and public inventory

The inventory is closed for U4: 22 components across four surfaces.

| Surface | Components |
|---|---|
| `transport-bar` | `U4-CMP-001` … `U4-CMP-012` |
| `status` | `U4-CMP-013` … `U4-CMP-015` |
| `settings` | `U4-CMP-016` … `U4-CMP-020` |
| `scope` | `U4-CMP-021` … `U4-CMP-022` |

Feature components receive selector values and dispatch intents. They compose
the U0 owned primitives; they do not invent one-off controls, and they do not
know about storage, audio, or parser implementation modules. The footer bar
and the Sound sheet render the same settings cluster through one component
with a disambiguating `idSuffix`; an ID is never duplicated in the document.

## 3. Operations and application channels

`U4_TRANSPORT_OPERATIONS` is a closed inventory of 24 rows. Every U4 gesture,
key, and menu affordance resolves to exactly one row, and every row resolves
to at most one controller intent or ephemeral intent. Each row declares its
`channel`, `controllerIntent`, `intentKind`, `gestureRequirement`,
`keyboardAccess`, and `pointerAlternative`.

The channel laws are exact:

- `controller-intent` rows name one StudioController method and create no
  history entry; transport commands remain serialized by X1 with monotonic
  request IDs;
- `ephemeral-intent` rows name one authorized A0 intent kind and never touch
  the transport;
- `presentation-only` rows reach the application in no way at all;
- exactly one application effect may result from one user action; no U4 row
  may compose two controller intents to hide a sequencing gap — sequencing
  belongs to the controller (§7);
- every pointer-driven row has keyboard access, and `keyboardAccess: "none"`
  is not a legal inventory value;
- every keyboard-driven row has a pointer or touch path, and
  `pointerAlternative: "none"` is not a legal inventory value.

Trusted-gesture law: `play`, `resume-from-interruption`, and the
fault-recovery `reinitialize-audio` require a trusted gesture source
(`trusted-pointer` or `trusted-keyboard`) because X1 admits
`initialize-transport` and interruption-recovering `resume` only with an
`AudioUserGestureReceipt`. Programmatic or untrusted dispatch refuses before
any controller call and renders the named reason.

### 3.1 Enablement is a total function of the projected status

Every control row declares enablement for each of the seven A0 transport
statuses (`unavailable`, `ready`, `starting`, `playing`, `paused`,
`stopping`, `failed`). The matrix is total: no cell may be null, and a
disabled control carries the named reason from
`U4_CONTROL_DISABLED_REASONS`. Enablement never reads the DOM, a timer, or
the audio clock; it is a pure function of the accepted
`TransportViewState`, `canPlay` (the chart has at least one chord), and the
loop/mix selector values. The operation matrix fixture states every cell;
the validator recomputes the matrix from the enablement laws rather than
trusting the fixture.

Named enablement laws that amend the shipped surface:

- **Stop** is enabled in `playing` **and** `paused` (X1 admits `stop` from
  both), and its settlement returns the playhead to the run's `startBeat`
  and publishes `ready`. The shipped `disabled unless playing` gating is a
  defect this packet corrects.
- **Restart** is enabled exactly when Stop is, plus `ready` with a bound
  plan: it is the only control that replays a completed or stopped run from
  the run start in one gesture.
- **Previous/next** follow the context law of §5.3: while a run exists
  (`playing`/`paused`) they seek the playhead; otherwise they step the
  selection and preview exactly as shipped.
- **Scrub seek** is enabled in `playing` and `paused`; in `ready` with a
  bound plan it positions the next run's start; otherwise disabled with
  `no-bound-plan`.

## 4. Truthful status presentation

The status block renders exactly the A0 projection, never a UI-invented
state:

| A0 status (+ failureCode) | Badge label | Detail line |
|---|---|---|
| `unavailable` | `Audio unavailable` | the locked/engine-unavailable reason, actionable |
| `ready` | `Ready` | bound plan identity or the empty-transport hint |
| `starting` | `Starting…` | none; never settles to a stale value |
| `playing` | `Playing` | current chord label and exact Bar·beat |
| `paused` (no failureCode) | `Paused` | paused-at exact beat |
| `paused` + `transport.interrupted` | `Interrupted` | resume requires a trusted gesture; says so |
| `stopping` | `Stopping…` | none |
| `failed` (+ stable code) | `Audio fault` | the stable refusal/fault detail and the recovery action |

The projection's invariants:

- initial load must render `unavailable`/`ready`, never `playing`
  (legacy regression L-STATE-02);
- a stale generation/sequence/request notification cannot repaint the
  badge, the scrubber, or the now block — A0 rejects it as
  `ignored-stale` and U4 renders only accepted state;
- an audio `failed` state never blocks editing, selection, or export: the
  chart surfaces stay fully interactive while the status block offers the
  recovery action;
- the display sweep between notifications is presentation only and is
  quantized to the X1 960-PPQ display quantum; it writes nothing back.

## 5. The scrubber and exact seek

### 5.1 Accessible slider

The scrubber is one `role="slider"` control with `aria-valuemin="0"`,
`aria-valuemax` equal to the bound plan's total beats, and `aria-valuenow`
carrying the exact current beat as a decimal rounded for speech, with
`aria-valuetext` carrying the exact rational label (`Bar 2 · beat 3 1/2`)
and the exact beat in the `title`/help text. Pointer scrub keeps the shipped
click/drag-fraction behavior; the slider adds the missing keyboard and
screen-reader path.

### 5.2 Keyboard seek law

With the slider focused: ArrowLeft/ArrowRight seek ±1 beat,
Shift+ArrowLeft/ArrowRight seek ±1 bar (the plan meter's beats-per-bar),
Home/End seek to beat 0 / total beats, and PageDown/PageUp seek ∓/± 4 beats.
Every seek dispatches the exact rational `BeatPosition`; the display
interpolation never feeds a seek value.

### 5.3 Previous/next law

- No bound run (`ready` without a playing/paused run, `unavailable`,
  `failed`): previous/next step the selection to the adjacent chord event
  and preview it, exactly as shipped; the playhead does not move.
- A bound run (`playing`, `paused`): previous seeks to the current event's
  start when the playhead is past its first beat-half, else to the previous
  event's start; next seeks to the next event's start. Both dispatch one
  controller seek intent with the exact event `startBeat`; at plan bounds
  they clamp (previous at 0, next at total beats) and never wrap.

### 5.4 Loop region on the scrub line

The engaged loop range renders as a region overlay on the scrub line
(display only, `aria-hidden`; the loop toggle carries the state). It never
intercepts pointer events from the slider.

## 6. Restart, count-in, and metronome

### 6.1 Restart is one intent

`restart-run` dispatches exactly one new controller intent,
`restartProgression`, whose application-layer semantics are frozen as:
serialize an X1 `stop` (awaiting its no-future-attack receipt and the
return to the run's `startBeat`), then serialize an X1 `play` from that
beat with the bound plan, both under one expectation window. U4 never
dispatches two intents for one gesture, and the controller never publishes
an intermediate `ready` repaint between the pair — the A0 expectation law
(`expect-transport` with the trailing request ID) holds the projection at
`stopping` then `starting` without a stale frame.

### 6.2 Count-in and metronome toggles

Two new toggles bind the existing X1 `set-count-in` / `set-metronome`
commands through new controller intents `setCountInEnabled` /
`setMetronomeEnabled`:

- count-in applies to the next Play and prepends exactly one bar of clicks
  (X1 law: `TRANSPORT_COUNT_IN_BARS = 1`); toggling it never changes a
  sounding run;
- metronome while `playing` follows the X1 epoch law for the command; while
  `ready`/`paused` it stores for the next epoch;
- both toggles render their effective state from the selector
  (`countInEnabled`, `metronomeEnabled` in the transport snapshot), never
  from component-local optimism;
- both are presentation of document-adjacent transport settings: they are
  ephemeral transport state, excluded from history, and never marked as
  document edits.

### 6.3 What U4 does not add

No new X1 command kind, no second scheduler, no preview channel change, no
wall-clock timing. The X1 command union is consumed as frozen.

## 7. Instrument and groove change boundary

Changing the instrument or groove while a run is active follows the X1
horizon law (retire not-yet-attacked voices; sounding voices finish). The
controls must tell the truth about when the change is audible:

- instrument changed while `playing`: transient status detail `Takes effect
  at the next unstarted note` until the next accepted notification;
- instrument changed while `paused`/`ready`: persistent hint `Applies to
  the next Play.` until the next play begins;
- groove changed while `playing`: the same boundary statement; while
  stopped, the shipped static hint remains;
- a change while `unavailable`/`failed` is refused pre-dispatch with the
  named reason and the picker shows the unchanged value.

The notice is derived from the accepted state and the last settled command
kind; it is not a timer, and it clears on the next accepted notification or
on document replacement.

## 8. Loop scope

Loop scope chooses **what** loops: the whole chart or one section. The v1
inventory is exactly these two scopes:

- whole-chart toggle on the transport bar (`aria-pressed`), engaging the
  plan's full range;
- one section button per section header, engaging that section's exact beat
  range; exactly one section scope may be armed at a time and arming a
  section supersedes the chart toggle with a visible state change.

An arbitrary A–B beat range is **not** in v1: it needs an application-level
loop-range authority that P0/A0 do not yet expose, and this packet names
that dependency instead of inventing one. Loop state is ephemeral transport
state: it is excluded from history, survives a pause, and clears on
`replace-plan` exactly as X1 settles it.

## 9. Keyboard, pointer, and touch guards

Global transport keys: Space toggles play/pause; Shift+Space arms the
selection-owning (or first) section loop and plays. The global guard law is
frozen (shipped and re-specified here): the keydown is ignored when the
event is `defaultPrevented`, when any of Ctrl/Meta/Alt is held, when the
target is an `INPUT`, `TEXTAREA`, or `SELECT`, when it is
`isContentEditable`, or when it sits inside a `button`, `a[href]`, or
`[role="button"]`. Slider-focused keys never reach the global handler.

Pointer laws: the scrubber's coarse-pointer strip keeps a 44 CSS-pixel touch
target that grows into the bar without covering it; every control keeps a
named accessible label; no primary action depends on hover; activation on
touch never calls `preventDefault` before a real drag threshold on the
scrub line.

## 10. Layout, viewports, and safe area

The footer bar is grid row two of the studio shell with
`block-size: calc(var(--transport-min-block) + env(safe-area-inset-bottom))`
and safe-area end padding; the token ladder is `--transport-min-block:
4.5rem` default and `6rem` on coarse pointers. The settings cluster hides
below the 71.875 rem breakpoint behind the Sound sheet trigger; the sheet
anchors above the bar including the safe area. Required viewport cells:
320×568, 390×844, 768×1024, 1280×800, and 1440×900, each in default and
coarse-pointer variants. The Restart, count-in, and metronome controls join
the settings cluster and the Sound sheet identically; the bar itself must
remain visible and unoccluded in every cell, and toast overlays never cover
it.

## 11. Bounds, work, and refusals

Every bound is an inherited upstream limit or a value mechanically derived
from one: seek targets are bounded by the bound plan's total beats; the
slider's step count never exceeds the plan's 960-PPQ beat quantum count;
status detail text is bounded by the shared notice/code-point caps; the
operation inventory is closed at 24 rows. Work is bounded by rendered
collections: one slider, one status block, one settings cluster, at most
one armed section scope, and one loop overlay. Elapsed wall time is never a
musical or correctness cutoff.

Pre-dispatch refusals are total and named: untrusted gesture for a
gesture-gated row (`untrusted-gesture`), no playable chord (`no-playable-chord`),
seek outside plan bounds (`seek-out-of-range`), instrument/groove change
while audio is down (`audio-unavailable`), and scrub with no bound plan
(`no-bound-plan`). A refusal changes no state and renders its reason
verbatim from the selector layer.

## 12. States the product cannot enter

- A badge showing `playing` before any accepted playing notification.
- A scrub thumb position that came from the display sweep rather than an
  accepted playhead.
- Stop unreachable while paused, or Restart disabled while Stop is enabled.
- Count-in/metronome toggles rendered from local state after a refusal.
- Two armed section loop scopes, or a loop overlay with no engaged loop.
- A status detail naming an instrument boundary after document replacement.
- A duplicated element ID between the bar cluster and the Sound sheet.
- A transport control occluded by a toast, sheet, or unsafe-area inset.

## 13. Independent fixtures, traceability, and mutation controls

The fixture package under `tests/fixtures/transport-controls/` is
independently authored: production output may be compared with it but may
never generate it.

- `u4-transport-controls-contract.json` — the manifest: schema, package,
  policy, component inventory, limits, and the frozen upstream bindings.
- `control-operation-matrix.json` — all 24 operations with channels,
  gesture requirements, keyboard/pointer coverage, and the total 7-status
  enablement matrix with named disabled reasons.
- `status-projection-cases.json` — X1/A0 state, failure code, and staleness
  inputs to the exact badge label, detail, and control deltas, including
  the initial-load never-playing case, the interrupted presentation, the
  fault recovery action, and stale-notification no-repaint witnesses.
- `keyboard-guard-cases.json` — the global Space/Shift+Space guard matrix
  (edit fields, contenteditable, buttons, links, modifiers, prevented
  defaults) and the slider key law.
- `layout-cells.json` — the viewport × pointer cells with the bar
  visibility, safe-area, sheet anchoring, and ID-uniqueness expectations.
- `provenance-ledger.json` — for every judgment-bearing expectation, the
  reviewed authority it derives from (X1 contract, A0 contract, U0
  inventory, this document's sections) with hashes recorded at validation
  time.
- `trace-ledger.json` — every parent requirement, invariant, success
  criterion, and legacy regression (L-STATE-02 and the X1-carried audio
  regressions as they present in UI) linked to fixture case IDs.
- `mutation-controls.json` — semantic counterfactuals the verify leg must
  kill (e.g. Stop gated off paused, a stale notification repainting the
  badge, a slider key composing two intents, Restart publishing a mid-pair
  repaint).

The validator recomputes the enablement matrix from the stated laws, checks
totality of every matrix, validates schemas and closed unions, verifies
trace links and the provenance authorities, and replays the mutation
controls. It imports no production UI component.

## 14. Handoff and forbidden shortcuts

An implementer needs this document, the contract module, and the fixture
package — not the markdown plan. Assumptions: X1's frozen command union and
notification law are final authority; A0's projection and expectation
settlement already implement the acceptance law this packet renders; the two
new controller intents (`restartProgression`, `setCountInEnabled`,
`setMetronomeEnabled`) are specified here at the UI boundary and owned by
the U4 build leg's application work.

Forbidden shortcuts, all contract violations even if the demo looks right:

- a UI timer, wall clock, or animation frame that advances state;
- a badge or control state invented outside the accepted projection;
- two controller intents composed in one U4 gesture;
- a count-in/metronome toggle rendered from optimism after a refusal;
- a scrubber without the slider role, keyboard law, and exact labels;
- Restart implemented as `stop` without awaiting the no-future-attack
  receipt before `play`;
- a loop scope beyond the two frozen v1 scopes;
- weakening the Space/Shift+Space guards or the edit-field exclusions;
- a `specified-not-implemented` claim flag flipped without the recorded
  human acceptance owned by the U4 verify leg.

This packet makes no production-implementation, UI-completion, human
acceptance, or expert-review claim.
