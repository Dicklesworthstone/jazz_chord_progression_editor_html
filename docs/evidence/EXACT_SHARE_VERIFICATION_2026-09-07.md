# Exact sharing implementation and verification

Status: build complete; separate verification remains open. This is idea6 of
the September program. Entry Repair and Focus remain the only two completed
ideas until exact-share/verify closes. No deployment or aggregate release pass
is claimed.

## Implemented behavior

Share now previews a version2 fragment over the full E0 canonical document.
Whitespace compaction preserves negative-zero tokens, escaped text, stable IDs,
Manual/Frozen pitch order and duplicate unisons. The decoder enforces canonical
unpadded base64url, strict UTF-8 with no BOM, 8,192 fragment characters and
6,138 decoded bytes. The existing E0 lexical/F2/F3 pipeline refuses duplicate
and unknown keys, future schemas, malformed spelling, IDs and rational time.
The application owns preview revision, dialog lifetime and clipboard settlement;
UI dispatches intents. Copy never marks a document exported. Oversized charts
lead to the existing exact JSON dialog only after an explicit gesture.

V2 startup finishes the existing serialized E0 replacement before recovery
starts and before the first editable render. It adds one Undo, does not
initialize audio, and cannot seed the demo after refusal. Existing v1 links
still open with an omissions notice. Local-file links use jazzchords.org without
revealing local paths; HTTP links retain origin/path and omit credentials,
query and previous fragment. No runtime network or dependency was added.

The generated artifact is SHA-256
`ef5a0cfa371a158b0c0f4c454cbbafca7b6ee08892e056a2ae221e55e8802218`,
8,391,898 bytes, identical to dist/index.html. Source base30526b6 plus the
exact-sharing implementation; all300 production inputs match the frozen native
copy. This record identifies bytes, not a future commit hash.

## Completed evidence

Bun1.3.14, realNode26.0.0, Playwright1.61.1. Browser versions149.0.7827.55,
151.0 and26.5. Native runs use workers1,retries0, unchanged timeouts/CSP, and
user agent `OpenAI File Downloader, XaiImageApiFetch/1.0`.

| Command / trace | Result | Binding and limits |
|---|---|---|
| `bun test tests/unit/exact-share.test.ts tests/integration/exact-share-integration.test.ts tests/static/exact-share-contract.test.ts tests/unit/studio-share.test.ts tests/conformance/exact-share-production-mutations.test.ts tests/integration/studio-document-import.test.ts tests/integration/studio-lifecycle-export.test.ts tests/integration/studio-recovery-orchestrator.test.ts tests/static/u5-contract.test.ts` | 177 pass,0 fail;1,238 assertions;6.56s | `/tmp/jcpe-exact-share-broad-unit.log`. Independent wire vectors, 6137/6138/6139-byte boundaries, multibyte length, negative zero, original and manually spelled F-major specimens, entire-document equality, empty chart, same-build ordered MIDI pitches and rational time, E0 refusals, current/late/cancelled copy and fallback. Clipboard ports are scripted in application tests; real native proof is separate. |
| `bun test tests/conformance/exact-share-production-mutations.test.ts` | 10 pass,0 fail;50 assertions;4.02s | Every unchanged positive baseline passes and every actual source-fault bundle fails its behavioral assertion. Faults: dropped annotation, reordered pitches, deduped unisons, lost provenance, widened limit, pre-parsed duplicate keys, stale/late copy, lossy fallback, erased negative zero. Logs/source hashes/argv in `/tmp/jcpe-exact-share-production-faults-*`; standalone first invocation log `/tmp/jcpe-exact-share-first-mutations.log`. Mutants never enter production. |
| `bun scripts/run-playwright.ts test tests/e2e/exact-share.spec.ts tests/e2e/u1-share-link.spec.ts --workers=1 --config complete.config.ts` | 93 pass,0 unexpected/skipped/flaky;252,459.392ms | `/data/tmp/jcpe-u5-completion.uts7_zbm/complete/results.json`; all1,601 copied inputs unchanged before/after. All150 JSON attachments inspected: no console/page/request/axe findings. File/HTTP, three engines, desktop and320/390 touch, real native clipboard/manual-copy fallback, exact recipient JSON, single Undo/Redo, silent startup,18 real Play/Stop cycles, explicit large-file fallback, recovery Keep, duplicate-source refusal, legacy-v1 compatibility and empty chart. Three640×450 cases verify 200% equivalent CSS viewport and actual reduced-motion preference; not OS-level browser zoom certification. |
| Native copy results within93 | 15 successful clipboard writes;3 genuine clipboard-unavailable outcomes with selectable URL | Chromium HTTP also reads back the actual clipboard. File-mode tests verify the public URL and then open its exact fragment in the local artifact; they do not contact production jazzchords.org. All18 audio observations have started>0,sounding0,futureAttacks0 after Stop. Exact pitches/timing are proven at the immutable plan boundary; the native source observer does not infer MIDI identities from oscillator/sample output. |
| `bun run verify:standalone` | 36 pass,0 unexpected/skipped/flaky | `/data/tmp/jcpe-u5-completion.uts7_zbm/standalone/results.json`; all1,601 inputs unchanged. Twelve positive accessibility/offline reports and24 intentional negative controls pass; native diagnostics inspected. |
| `bun run typecheck`; `bun run lint`; `bun scripts/verify-standalone.ts --static-only`; `bun run verify:reproducible` | All exits0; static/repro outcome pass | `/tmp/jcpe-exact-share-final-{typecheck,lint,static,repro}.log`. Distinct roots and mtimes yield the exact artifact above. |

The fixture is checked-in manually authored JSON; expected document data was
not generated from production output. Native raw reports, source/fixture/artifact
hashes, browser identities, requests, focus routes, real download data, recovery
comparisons and voice counts remain in the copied project evidence. Transposition
specimens test transport preservation, not a new music-transform algorithm.

## Failures retained

The first native collection failed before running any cases because its JSON
import omitted Node's required import attribute. The test import was corrected;
this was not a product pass. That copy is
`/data/tmp/jcpe-u5-completion.7ufshdvo`.

The next complete54-case run on artifact2500fb97 was48 pass/6 failures,
143,081.354ms, `/data/tmp/jcpe-u5-completion.o2przn34/complete/results.json`.
All six WebKit failures were the unchanged exact selected-length assertion:
its read-only textarea keyboard command selected zero characters. Native probes
confirmed text selection was allowed by styles/inert ownership and native
select() succeeded. Selecting the complete URL on focus/click fixes the product
fallback; the same assertions pass in93. Post-failure screenshot stylesheet CSP
errors remain in the old report; CSP/error assertions were not weakened.

The initial54 also used an incorrectly placed reducedMotion fixture option;
it is not reduced-motion proof. The final93 uses contextOptions and checks the
actual media query in the three zoom-equivalent cases. New-test type/lint errors
were corrected through real snapshot fields, unknown observations and explicit
callback types; no brand casts, acceptance pins or suppressions were added.

## Remaining verification and release limits

Finish the separate verification leaf, including native clipboard completion
after Cancel/edit/reopen and the inherited startup-recovery regression suite.
The global cast-policy work and X0 human listening remain open. Existing
aggregate verification, model acceptance, predeploy checks and committed-byte
publication requirements still apply; no human/model acceptance flag changed.
