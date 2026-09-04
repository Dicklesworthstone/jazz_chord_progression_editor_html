# U5 Lifecycle Dialogs Contract

Status: proposed independent specification packet  
Package: `U5`  
Contract schema: `changes.fixtures.u5-lifecycle-contract.v1`  
Dialog state matrix: `changes.fixtures.u5-dialog-state-matrix.v1`  
Lifecycle cases: `changes.fixtures.u5-lifecycle-cases.v1`  
Import/export cases: `changes.fixtures.u5-import-export-cases.v1`  
Focus restoration cases: `changes.fixtures.u5-focus-restoration-cases.v1`  
Trace ledger: `changes.fixtures.u5-trace-ledger.v1`  
Provenance ledger: `changes.fixtures.u5-provenance-ledger.v1`  
Mutation controls: `changes.fixtures.u5-mutation-controls.v1`  
Bead: `jcpe-milestone-reliable-studio-l3a.13.1`

This document and `src/ui/studio/u5-lifecycle-contract.ts` are the
code-facing U5 authority. The independent fixture package under
`tests/fixtures/lifecycle-dialogs/` supplies the expected dialog inventory,
state matrices, lifecycle cases, import/export surfaces, and focus
restoration expectations. Production components may be compared with those
fixtures; they may not generate, rewrite, or bless their expectations.

The words **must**, **must not**, **exactly**, and **refuse** are normative.

## 1. Boundary and implementation model

U5 builds the document, recovery, and import/export lifecycle dialogs of the
studio: replacement confirmation for New / lesson / import, the
dirty/export/recovery status strip, the startup recovery offer including its
fallback states, the canonical/legacy import preview with its grouped report,
the JSON/text export dialog with success/failure surfaces, the storage
failure presentations, and the dialog-stack and focus-restoration discipline
for all of them. It is a presentation and intent layer only:

- U5 renders selector values and dispatches application intents; it never
  imports persistence, export, audio, theory, playback, or compatibility
  implementations, and never mutates a domain value;
- U5 adds **no** mutation, import, export, recovery, or transport channel.
  Every lifecycle effect crosses exactly one existing A0 ephemeral intent or
  one composition-surface method named in this packet; the complete
  authorized set is frozen in `U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS` and the
  operation inventory;
- confirmed replacement rides the serialized stop-and-swap transaction
  (`StudioReplacementWorkflow.begin`): the document is published only after
  transport retirement settles, and cancel is inert — it installs nothing,
  retires nothing, and leaves every marker untouched;
- browser recovery is never called Save, in any string, tooltip, or
  announcement. The sole string authority for recovery status is the frozen
  `RECOVERY_STATUS_VOCABULARY`;
- storage failure (unavailable, quota, denied, corrupt) never blocks
  editing, selection, transport, or export; it renders an actionable status
  and nothing else.

The upstream truth U5 presents is frozen: the A0 dialog kernel
(`APPLICATION_DIALOG_KINDS`, `DialogDescriptor`, stack cap, LIFO pop,
`blocksHistory`), the A0 document-transition states and replacement origins,
the A1 startup dispositions and refusal codes, the E0 import preview model
and grouped report, the C0 legacy migration groups, and the U0 overlay
kernel (single modal root, focus containment and restoration). The
code-facing module declares these bindings as reviewed literal strings, and
the static contract test compares them with the live tuples, so the release
bundle carries no application import while any upstream motion fails loudly.

### 1.1 Relationship to the shipped surface

Shipped and governed unchanged except as named: the recovery Keep/Discard
offer (an `alertdialog` region, not a stack dialog), the MIDI import/export
panels (U7's surface), the share-link Copy button, and the overlay kernel.
This packet is the authority for the deltas: the A0 dialog stack becomes the
real host for lifecycle dialogs (replacing ad-hoc boolean mutual exclusion
for those dialogs), the armed two-press Clear retires in favor of the
`new-document` dialog, replacement confirmation appears for New / lesson /
import when state is dirty or a run is active, the startup fallback states
gain visible surfaces, the import preview and JSON/text export dialogs are
new, and the status strip renders the dirty/export/recovery truth that today
goes unrendered.

## 2. Surfaces and public inventory

The inventory is closed for U5: 22 components across four surfaces.

| Surface | Components |
|---|---|
| `startup` | `U5-CMP-001` … `U5-CMP-004` |
| `lifecycle-dialogs` | `U5-CMP-005` … `U5-CMP-012` |
| `import-export` | `U5-CMP-013` … `U5-CMP-018` |
| `status-strip` | `U5-CMP-019` … `U5-CMP-022` |

Feature components receive selector values and dispatch intents. They compose
the U0 owned primitives (`Dialog`, `AlertDialog`, `SheetDrawer`, `Button`,
notice and toast surfaces); they do not invent one-off controls, and they do
not know about storage, audio, or codec implementation modules.

## 3. Dialog stack and channels

The A0 dialog stack is the single host authority for U5 lifecycle dialogs:

- every lifecycle dialog is one `DialogDescriptor` with a kind from
  `APPLICATION_DIALOG_KINDS` plus this packet's two additive proposals,
  `import-preview` and `lifecycle-export`, pinned in
  `U5_PROPOSED_DIALOG_KINDS`;
- push and pop cross the A0 ephemeral intents only; stack overflow refuses
  as `dialog.stack_limit`, duplicate IDs refuse, and pop removes only the
  top of stack — the UI neither reorders nor force-closes;
- a committing dialog locks history (`blocksHistory`) exactly as the kernel
  honors it; U5 never hides that Undo is unavailable — the control renders
  disabled with the named reason while a blocking dialog commits;
- at most one modal scope exists at a time (U0 kernel law); a mobile sheet
  and a dialog never nest modally.

The two additive kinds are proposals on the append-only A0 union, exactly
the U7 `midi-export` precedent: the accepted A0 v1 surface neither imports
nor consumes them, and the static test proves the declared base tuple still
equals the live six kinds.

## 4. Replacement confirmation

### 4.1 When confirmation is required

New document, library lesson pick, and canonical/legacy import commit
replace the current document. Confirmation is required exactly when the
current document is nonempty **and** (dirty or a transport run is active):

- dirty means the selector's dirty truth: revision differs from the last
  export marker, or recovery is not current for this revision;
- a run is active in X1 terms when the accepted transport status is
  `starting`, `playing`, `paused`, or `stopping`;
- a pristine, idle document replaces without a dialog (the gesture is the
  consent).

The dialog names the source (`new`, `lesson`, `canonical-import`,
`legacy-import` — the frozen A0 replacement origins), states exactly what is
preserved and what is discarded, and offers Confirm and Cancel. Copy never
says Save; when the current work is unexported and unrecovered, the dialog
recommends export first, with a working export path offered inline.

### 4.2 Confirm and cancel law

- Confirm dispatches exactly one composition call that rides
  `StudioReplacementWorkflow.begin`; publication happens only after the
  serialized retirement settles; a busy workflow refuses with
  `import.replacement_workflow_busy` and the dialog shows the busy state,
  never a second in-flight replacement;
- Cancel is inert: no request begins, no dialog residue remains, no marker
  moves, and focus restores (§9);
- validation or audio failure during the transition preserves the
  authoritative current document: the workflow's cancel path settles the
  transition back to `idle` and the dialog reports the failure with its
  code; the studio is never left without its prior state;
- an oversized, non-undoable replacement adds the frozen boundary
  disclosure (§8) before Confirm becomes available.

## 5. Startup recovery surfaces

The startup flow renders the blank workspace immediately and then follows
the A1 startup matrix exactly; U5 owns the presentations:

| Disposition | Surface |
|---|---|
| `open-current-automatically` | the recovered chart opens with the visible explanation and Discard/New actions (shipped) |
| `offer-keep-discard` | the Keep/Discard `alertdialog` offer (shipped) |
| `offer-previous` | the fallback offer: the current copy is unreadable, the previous copy is offered with Keep previous / Discard |
| `report-unrecoverable` | a nonblocking diagnostic notice: recovery data could not be read, editing and export work, export recommended |
| `none-available` | no surface; the blank workspace stands |

All five dispositions are renderable states with accessible names; the two
silent-in-v1 rows (`offer-previous`, `report-unrecoverable`) are new U5
surfaces. Recovery never initializes audio, never auto-imports a file
selection, and never overwrites an in-memory document the user already
edited — the downgrade-to-offer law is A1's and U5 renders it unchanged.

## 6. Import preview and grouped report

The import dialog (`import-preview`) accepts a file pick or pasted text and
produces the E0 preview before anything is applied:

- channels: `file` and `paste`; format hints: `auto`, `canonical-json`,
  `legacy-json`, `chart-text` — the frozen E0 vocabulary;
- selecting a file never applies it: the preview reads, classifies, and
  reports; Commit is a separate gesture that rides the replacement
  confirmation of §4;
- the report renders the E0 grouped model in the frozen group order
  (preserved, canonicalized, custom, ignored, rejected for legacy; the E0
  item groups for canonical), with the retention policy
  `group-source-path-code-target-path-first-256`; every refusal shows its
  code verbatim;
- chart text is insert-only: it routes to quick entry, never to
  replacement, and the dialog says so when the hint classifies as text;
- a refused or unreadable input keeps the current document byte-for-byte
  and reports the refusal with what was preserved;
- Discard abandons the preview, releases the draft (`set-import-draft` with
  null), and restores focus.

MIDI import keeps its own U7 surface and its append semantics; U5 changes
nothing about it.

## 7. Export dialog and markers

The export dialog (`lifecycle-export`) covers the canonical JSON and the
lead-sheet text formats:

- both exports render the preview facts (byte count, filename, format) and
  the deterministic filename law's output; delivery follows the U7
  browser-handoff honesty: success says the file was handed to the
  browser's downloads, never that it reached disk; failure shows the
  refusal or the browser-did-not-take-it wording with the next action;
- exactly one export marker law: only exact export success — bound delivery
  plus A0 publication — advances the canonical export marker
  (`mark-exported`) and lets A1 record the export binding; a cancelled or
  failed download advances nothing, and a stale marker for a superseded
  revision stays stale;
- MIDI export never advances the canonical marker (U7 law, restated);
- the share link remains the header Copy button with its shipped copied /
  manual / refused feedback; it is not a dialog and U5 changes nothing
  about it.

## 8. Status strip and oversized disclosure

The status strip renders the lifecycle truth that today has no consumer:

- the recovery status line speaks only the frozen
  `RECOVERY_STATUS_VOCABULARY` strings with their `{time}`/`{revision}`
  substitutions — no other wording exists;
- the export marker line speaks the same vocabulary's
  `exportedAtRevision` / `changedSinceExport` rows; when no export exists
  the line says nothing rather than inventing a third string;
- storage unavailable, quota, and write-denied present the frozen
  unavailable string plus the refusal code's next action; corrupt at
  startup follows §5; a failed background write surfaces as
  `Changes pending recovery` state truthfully, never as saved;
- the oversized, non-undoable replacement boundary is the `history-limit`
  dialog: it states that history is at its boundary, that this replacement
  cannot be undone, recommends export, and requires explicit confirmation;
  Undo unavailability is always visible with its reason, never hidden.

## 9. Focus restoration and announcements

- Every U5 dialog and sheet restores focus by the U0 law: exact trigger,
  then the stable workflow target, then the workspace; a non-exact restore
  reports `ui.stale_owner` to the contract-refusal channel;
- dialog open, refusal, and settlement announcements cross the shared
  live-region discipline exactly once per transition; the status strip is
  `role="status"` and never interrupts;
- cancel, failure, and success restore focus identically; the chart's
  roving focus and selection survive every lifecycle dialog unchanged;
- mobile sheets nest under the one modal root and restore to their trigger
  on the sheet's own close path.

## 10. Bounds, work, and refusals

Every bound is inherited: the dialog stack cap (8), notice cap (32), pending
request cap (8), the U0 overlay caps (one modal scope, at most 4 nonmodal
descendants, dismiss ancestry at most 8), the E0 report retention bound
(first 256 items per group), the draft text caps, and the dialog copy caps
frozen in `U5_LIFECYCLE_LIMITS`. Work is bounded by rendered collections:
one stack, one status strip, at most one import preview's retained report
rows. Elapsed wall time is never a correctness cutoff.

Pre-dispatch refusals are total and named: `dialog.stack_limit` on
overflow, duplicate dialog ID, `import.replacement_workflow_busy` on a
second replacement, `history.nonundoable_confirmation_required` without the
disclosed confirmation, format hint outside the frozen vocabulary, and the
untrusted-state guards of §4. A refusal changes no state and renders its
reason verbatim from the selector layer.

## 11. States the product cannot enter

- A document replaced while audio still owns scheduled attacks.
- A replacement dialog confirm that begins two transitions.
- A recovery string outside the frozen vocabulary, or the word Save applied
  to recovery anywhere.
- A file selection that applies without a separate Commit gesture.
- An export marker advanced by a cancelled or failed download.
- A dirty current document replaced with no confirmation.
- A lifecycle dialog outside the A0 stack, or two modal scopes at once.
- Focus lost after any dialog outcome, or a chart selection disturbed by a
  lifecycle dialog.
- A silent `offer-previous` or `report-unrecoverable` startup.

## 12. Independent fixtures, traceability, and mutation controls

The fixture package under `tests/fixtures/lifecycle-dialogs/` is
independently authored: production output may be compared with it but may
never generate it.

- `u5-lifecycle-contract.json` — the manifest: schema, package, policy,
  component inventory, limits, proposed dialog kinds, and the frozen
  upstream bindings.
- `dialog-state-matrix.json` — every dialog kind × phase with stack
  behavior, history locking, dismissal paths, and announcement
  expectations; the replacement-confirmation requirement matrix over dirty
  and transport states.
- `lifecycle-cases.json` — the startup disposition matrix, replacement
  confirm/cancel/failure cases across ready/playing/paused/previewing
  transport, storage unavailable/quota/denied/corrupt cases, marker
  truthfulness cases, and the never-Save vocabulary case.
- `import-export-cases.json` — file/paste preview, format-hint
  classification, grouped-report order and retention, chart-text
  insert-only routing, commit-via-confirmation, discard, JSON/text export
  success/failure/cancellation, and marker settlement cases.
- `focus-restoration-cases.json` — trigger/workflow/workspace restore
  order, stale-owner refusal, cancel/failure/success symmetry, selection
  preservation, and mobile sheet nesting.
- `provenance-ledger.json` — the reviewed authority behind every
  judgment-bearing expectation.
- `trace-ledger.json` — every parent requirement, invariant, success
  criterion, and legacy regression linked to fixture case IDs.
- `mutation-controls.json` — semantic counterfactuals the verify leg must
  kill (a confirming cancel, a marker advanced on failure, a silent
  fallback, a Save string, an unstacked lifecycle dialog).

The validator recomputes the confirmation-requirement matrix from the
stated laws, checks totality of every matrix, validates schemas and closed
unions, verifies trace links and the provenance authorities, and replays
the mutation controls. It imports no production UI component.

## 13. Handoff and forbidden shortcuts

An implementer needs this document, the contract module, and the fixture
package — not the markdown plan. Assumptions: the A0 dialog kernel and
document-transition states are final authority; the replacement workflow,
the recovery orchestrator, and the E0 engines are shipped below this
surface; the two additive dialog kinds follow the U7 append precedent; the
composition methods this packet names but does not ship
(`openLifecycleDialog`, `commitImportPreview`, `deliverCanonicalExport`,
and the replacement-confirmation entry points) are owned by the U5 build
leg's application work.

Forbidden shortcuts, all contract violations even if the demo looks right:

- replacing the document without the serialized stop-and-swap receipt
  chain, or publishing before retirement settles;
- a Cancel that installs, retires, marks, or moves anything;
- the word Save applied to recovery, or any recovery string outside the
  frozen vocabulary;
- auto-applying a picked file, or a preview whose groups drop refusals;
- an export marker advanced by anything but exact bound-delivery success;
- hiding Undo unavailability, or a lifecycle dialog hosted outside the A0
  stack;
- a startup fallback state that renders nothing;
- a storage failure that blocks editing, transport, or export;
- a `specified-not-implemented` claim flag flipped without the recorded
  human acceptance owned by the U5 verify leg.

This packet makes no production-implementation, UI-completion, human
acceptance, or expert-review claim.
