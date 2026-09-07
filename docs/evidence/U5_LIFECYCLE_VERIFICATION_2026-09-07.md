# U5 lifecycle production verification — 2026-09-07

Status: **verification in progress**. U5/build is closed; U5/verify and the
package remain open. This record maps the frozen ten-row trace ledger to actual
production tests. It does not change any fixture, accepted baseline, model
acceptance row or human-acceptance flag. Exact sharing is specified but its
implementation still depends on U5 verification.

Current generated artifact: SHA-256
`8aac97ced7520c1cb86d8ac14f3600dae5ebded9c9fa7e26c567ddc3dba45f3e`,
8,385,260 bytes, identical to `dist/index.html`. Source is committed through
`6bd8c93`; the generated artifact checkpoint follows separately. The expanded
411-case invocation is active against a frozen 1,590-input project at
`/data/tmp/jcpe-u5-completion.hur4al6q/project`. Results must be inspected before
claiming it passes. A subsequent lint-only brace change in one browser callback
preserves its native focus call and assertions; the copied tests remain frozen.

## Trace to production behavior

All paths below are relative to the repository. Frozen case IDs and judgments
remain in `tests/fixtures/lifecycle-dialogs/trace-ledger.json` and its companions.
A fixture validator alone is not production evidence.

| Frozen trace | Production evidence | Assertions and limits |
|---|---|---|
| TR-U5-DIALOG-STACK | `tests/integration/studio-document-import.test.ts`, `studio-local-replacement.test.ts`, `studio-lifecycle-export.test.ts`; `tests/e2e/u5-lifecycle-accessibility.spec.ts`; inherited A0/U0 tests | Real A0 dialog kinds, one host through preview/confirmation/Back, committing history lock, stale-owner refusal, one native modal, Tab/Shift+Tab containment and inert background. Kernel bounds remain inherited rather than reimplemented in U5. |
| TR-U5-REPLACEMENT | `tests/integration/studio-local-replacement.test.ts`, `studio-preview-replacement.test.ts`, `studio-preview-fault-recovery.test.ts`; `tests/e2e/u5-local-replacement.spec.ts`, `u5-document-import.spec.ts` | All 112 independent confirmation cells; New/lesson/canonical/legacy through ready, playing, paused and sounding preview; Cancel, pending retirement, actual native clock refusal/reconciliation, exact prior-chart Undo. A real suspended context with controlled resume acknowledgement proves the pending-init branch, not natural device latency. |
| TR-U5-STARTUP-RECOVERY | `tests/integration/studio-recovery-orchestrator.test.ts`; `tests/e2e/u5-automatic-recovery.spec.ts`, `u5-automatic-recovery-audio.spec.ts`, `u5-recovery-lifecycle.spec.ts` | Five startup dispositions; real stored current/previous copies, valid checksum with semantic corruption, explicit Keep/Discard, stale draft/selection protection, explicit share priority, silent automatic startup and later real Play/Stop. |
| TR-U5-IMPORT | `tests/integration/studio-document-import.test.ts`; `tests/e2e/u5-document-import.spec.ts`; E0 lexical/projection suites | File and pasted input never auto-apply; exact document export/Undo, IDs, Manual/Frozen order and repeated pitches; chart text only stages Quick Entry. Nested decoded duplicate keys retain exact source ranges. Complete C0 rejection totals remain visible beyond the first-256 retained report rows, including at confirmation. Oversized paste clears obsolete preview data and authority. |
| TR-U5-EXPORT | `tests/integration/studio-lifecycle-export.test.ts`; `tests/e2e/u5-recovery-lifecycle.spec.ts` | Real native JSON/text downloads, exact bytes and filenames, format losses, Custom refusal, cancellation, object-URL failure and stale delivery. A browser handoff is not represented as a confirmed filesystem save. |
| TR-U5-MARKERS | `tests/integration/studio-lifecycle-export.test.ts`, `studio-midi-export-marker.test.ts`; `tests/unit/e0-v2-marker-settlement.test.ts`; native recovery/export suite | Only exact bound JSON delivery advances the canonical export marker; Cancel, text, MIDI, wrong receipts and stale completion do not. MIDI uses the real composition/U7/E1 encoder with an explicitly scripted delivery port; it is not new native MIDI-download proof. |
| TR-U5-STORAGE-STATES | `tests/integration/studio-recovery-orchestrator.test.ts`, `studio-recovery-storage.test.ts`; `tests/e2e/u5-recovery-lifecycle.spec.ts` | Real recovery envelopes and unavailable/quota/denied/corrupt paths; refusal preserves prior bytes, stays pending, permits actual subsequent edits and JSON export. Native quota and failed Discard have fresh successful twins. |
| TR-U5-VOCABULARY | `tests/integration/studio-recovery-orchestrator.test.ts`; `tests/static/u5-contract.test.ts`; native recovery suite | Frozen recovery vocabulary and revision truth. A production source fault changing pending recovery to Save is killed by the unchanged behavior assertion. |
| TR-U5-HISTORY-BOUNDARY | `tests/fixtures/history-limit.ts`; `tests/integration/studio-real-history-limit.test.ts`; `tests/e2e/u5-history-limit.spec.ts` | Real 16,777,216-byte retained-history cap with hand-authored 4,096/6,144-event charts and sixteen exact notes per event. Inert Cancel, fresh consent, exact below-cap Undo, explicit above-cap non-Undoability and truthful 2 MiB JSON export refusal. Native reduced host uses the production dialogs, controller, estimator, audio, storage and download adapters; it does not prove rendering thousands of chart cards. Small-chart native download is the export success twin. |
| TR-U5-FOCUS | `tests/e2e/u5-local-replacement.spec.ts`, `u5-document-import.spec.ts`, `u5-recovery-lifecycle.spec.ts`, `u5-lifecycle-accessibility.spec.ts`, `chord-inspector.spec.ts` | Exact trigger return after cancellation/download; missing lesson owner falls back to title with `ui.stale_owner`; chart/bookmark preservation; named modal and native inert behavior. Pointer/keyboard panel gestures survive real chord boundaries, and open modals stop background auto-scroll. Automated DOM/axe proof does not certify human screen-reader or listening acceptance. |

## Completed invocations

Bun 1.3.14; supported real Node 26.0.0; Playwright 1.61.1; Chromium1228,
Firefox1532 and WebKit2311 installations. Browser user agent is
`OpenAI File Downloader, XaiImageApiFetch/1.0`. Every browser invocation uses one
worker, zero retries and the repository's unchanged timeouts, CSP and network
policy. Seeded/property cases use their existing checked-in fixtures and seeds;
no new random expectation was generated from production output.

| Invocation | Actual result | Binding / retained record |
|---|---|---|
| 44-file focused Bun suite | 539 pass, 0 fail; 3,592 assertions | Exact argv: `/tmp/jcpe-u5-verification-final-unit-command.json`; log `/tmp/jcpe-u5-verification-final-unit.log`. Includes the permanent production-fault suite. Before the subsequent type annotation and UI auto-follow change; no touched music/lifecycle algorithm changed after this run. |
| `bun test tests/integration/a0-application-state.test.ts tests/unit/u0-overlay-coordinator.test.ts tests/unit/u0-overlay-runtime-preflight.test.ts tests/unit/u0-runtime-kernel.test.ts tests/property/u0-limits.test.ts` | 120 pass, 0 fail; 756 assertions | `/tmp/jcpe-u5-inherited-dialog-gates.log`; real A0/U0 production kernels, not browser proof. |
| Inspector type correction: three focused files | 26 pass, 0 fail; 162 assertions | `/tmp/jcpe-u2-explicit-state-type.log`; explicit AppState annotation preserves artifact bytes. |
| `bun run typecheck`; `bun run lint`; `bun scripts/verify-standalone.ts --static-only`; `bun run verify:reproducible` | All four subprocess exits 0 | `/tmp/jcpe-u5-gesture-gates.json`; current artifact8aac97ce. New accessibility file separately typechecked and linted; initial shorthand-void lint finding corrected without suppressions. |
| Native gesture repair, original preview/band cells and ordinary phone follow | 33 pass, 0 unexpected/skipped/flaky; 226,350.995 ms | `/data/tmp/jcpe-u5-completion.wbjj8fsh/gesture-proof/results.json`; artifact8aac97ce; all1,589 copied inputs unchanged before/after. |
| Native lifecycle accessibility | 24 pass, 0 unexpected/skipped/flaky; 63,486.701 ms; zero axe/console/page findings | `/data/tmp/jcpe-u5-completion.hur4al6q/accessibility/results.json`; artifact8aac97ce. Four workflows × two widths × three engines; malformed-import refusal is also scanned. |
| Earlier focused native build gate | 33 pass, 0 unexpected/skipped/flaky; 135,034.030 ms | `/data/tmp/jcpe-u5-completion.ovt0vgvf/build-proof/results.json`; artifact0c15728f. Real history boundary, title draft scheduling, import loss disclosure and pending native resume. |

Full browser argv is preserved in each sibling `run-*.sh`; configs and input
hash manifests are beside the copied project. Source/artifact identities, browser
versions, native voice counts, URLs, errors and accessibility results are in JSON
attachments, not inferred from a zero shell-wrapper status.

## Actual production-source counterfactuals

`bun test tests/conformance/u5-production-mutations.test.ts` runs fourteen source
fault variants covering thirteen frozen law IDs (U5-MUT-005 has both fallback
branches). Every variant first runs the unchanged positive behavioral test,
then rebuilds actual production source with one fault and requires an assertion
failure. Its full paths, source hashes, argv, stdout/stderr and failures are
retained under the uniquely allocated `/tmp/jcpe-u5-production-faults-*` root.
The original full-file campaign is also retained at
`/tmp/jcpe-u5-law-mutations/summary.json`. No mutant is installed in the product.

The remaining U5-MUT-013 changes only `target.focus()` to
`ownerDocument.body.focus()` in the isolated production focus-restoration source.
All six browser cases fail at the intended exact-trigger `toBeFocused` assertion;
all six positive twins passed on the ordinary artifact. Native mutant report:
`/data/tmp/jcpe-u5-completion.lj7yxuwp/focus-control/results.json`,
52,132.854 ms, artifact7eb57adc; all1,588 inputs unchanged. Baseline focus source
SHA-256 `aef34fb060a0c40d63e31805b855ab381a2bbedff5e3856acd25da845d23b720`;
fault source SHA-256 `22158a5790f035a07ef25b3640e36c56a56c442799c2d1712870e6f70874bf1f`.
This completes the fourteen-law source-fault set; it does not turn a failed
positive aggregate into a pass.

Nine additional implementation-regression source faults have positive baselines
and killed variants at `/tmp/jcpe-u5-all-final-mutations/summary.json`. They cover
specific repaired defects and are not counted as nine additional frozen laws.
The newly added mobile gesture controls fail12/12 on the old0c15728f artifact at
actual control displacement, then pass12/12 after the production auto-follow fix.
Old report: `/data/tmp/jcpe-u5-completion.8_3e1t9_/gesture-baseline/results.json`.

## Failures retained and acceptance limits

The first375-case invocation is **374 pass / 1 failure**, never a green aggregate:
`/data/tmp/jcpe-u5-completion.1arlze17/verification/results.json`,
1,748,012.951 ms, artifact0c15728f. The failing Firefox HTTP390 inspector case
exposed auto-scroll moving the Harmony Lens trigger during activation. All303
U5 cases and71 inspector cases passed; JSON attachments contain no console/page
errors or unexpected requests. Its trace and screenshots led to the production
fix, without changing the old assertion or adding retries.

Earlier controls remain recorded in `docs/IMPLEMENTATION_TODO.md`: stale preview
initialization/Stop ownership, incomplete copy missing tracked tsconfig.json,
Firefox file navigation observation, missing legacy totals and malformed-JSON
diagnostics. Their failures are not counted as successful evidence. A premature
history-pass commentary was explicitly retracted; only inspected final reports
support the pass counts above. A misplaced declaration in a new duration test
was caught and corrected without changing the preservation assertion.

The E0 v1 archive was restored to its original accepted SHA-256
`288c7ba1e36f8422c9753d501feb68efa721fa8b320b5e20bce8503da85e7d4f`.
The already-correct annotated-text behavior is documented in the E0 v2 amendment;
no acceptance pin, validator, golden or grammar assertion was changed.

The strict global cast-policy test remains red with29 findings, tracked under
`jcpe-cast-policy-compatibility-np17`; the inspector annotation removed this
change set's additional finding. X0 human listening remains open. Neither the
aggregate release gate nor a new deployment is claimed here. The fifteen-idea
program remains2/15 complete (Entry Repair and Focus); building prerequisites
and specifying exact sharing do not count as completing those other ideas.
