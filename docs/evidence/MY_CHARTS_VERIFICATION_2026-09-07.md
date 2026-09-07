# My Charts implementation and verification

Consumer: `jcpe-my-charts-zt9z.2` and `.3`, implementing September idea4 under
`docs/MY_CHARTS.md`. Specification committed in7af0879. This report records
technical implementation and completed independent verification under `.3`.
All three phases and the parent are closed; production commits are7af0879,
a32cfa6 and9ed4925. The overall fifteen-idea program is4/15 complete. No deployment or
aggregate release/human-acceptance claim is made.

## Implemented behavior

The studio has one My Charts dialog with explicit Keep, search, selection,
detached A0 title editing, complete F1 identity duplication, confirmed Replace
and Remove, existing E0/U5 Open preview, exact kept-chart JSON, and portable
backup/restore. Same-record/different-byte conflicts require individual explicit
choices; identical musical IDs or titles do not conflate separate records.
Current chart/history/recovery/export markers remain under their existing owner.

The separate IndexedDB database publishes immutable document payloads and its
versioned manifest in one transaction. Exact prior-manifest CAS and referenced
payload comparisons refuse stale/corrupt writes; request success is not a
transaction receipt. Abort, quota and denial never evict older charts. All
reads/writes have count/byte bounds and connection cleanup. Storage refusal
retains the actual current JSON export path. The final abort diagnostic
recognizes a native explicit abort as aborted rather than unavailable storage.

Backups retain complete validated canonical document strings, including lexical
negative zero, source spelling, Manual/Frozen unisons, exact time and provenance.
The declared64MiB+128KiB outer cap accommodates32MiB of canonical inner text
plus escaping/metadata; both actual sizes are checked. Downloads are prepared
before native activation, single-use, and describe the displayed snapshot;
they do not claim to include another tab's edits after the last refresh.

## Frozen identity and native evidence

Original implementation artifact SHA-256 (superseded by the independently found
selection-race correction below):
`8a0c39850955556f41b3e3d1ec294b7b9b252be4693f773d31f25a8929efe58f`,
8,421,875bytes. All308 source files retain their tested hashes and mtimes;
`/tmp/jcpe-my-charts-source-final.json` records them. Root artifact and
`dist/index.html` are generated, identical bytes.

Toolchain: Bun1.3.14, real Node26.0.0, Playwright1.61.1; Chromium149.0.7827.55,
Firefox151.0 and WebKit26.5. One browser worker, no retries/skips. Required User
Agent is `OpenAI File Downloader, XaiImageApiFetch/1.0`; all other requests are
denied. The builds retain their hash CSP without bypass or relaxation.

The implementation matrix passed129/129,0unexpected/skipped/flaky,
323,313.002ms, starting2026-09-07T16:05:15.662Z. It covers file/HTTP on all three
engines at1280,390x844 and320x568 touch, plus640x450 keyboard/200% equivalent
layout. Actual reduced-motion media is asserted. Command:

```sh
bun scripts/run-playwright.ts test tests/e2e/my-charts.spec.ts --workers=1 --config complete.config.ts
```

Frozen root `/data/tmp/jcpe-u5-completion.4b74pqhs`, with exact wrapper
`run-complete.sh` and result `complete/results.json`; all1622 input hashes
match before and after. `/tmp/jcpe-my-charts-native-audit.json` records the
inspection of all258 JSON attachments: zero console/page errors, denied
requests or axe violations;18 actual sources-started/stop-before-Open cycles;
90 object URLs created/revoked;747 collection database connections opened/
closed, zero outstanding;183 snapshots have exact index/payload referential
integrity. Twenty-one axe reports were inspected. Their incomplete rules are
retained as incomplete observations, not represented as a complete human
accessibility audit.

The cases use real IndexedDB, downloads, Files, audio and separate pages.
Quota and interrupted-manifest controls interpose on actual native transactions
at the add/put checkpoint; corruption edits actual stored bytes. Denial is an
explicit native API boundary fault. These are fault controls, not claims that
the machine's physical disk was filled or that browser permissions were changed.
Every failure path has an honest successful real-adapter twin.

Public `bun run verify:standalone` also passed36/36,0unexpected/skipped/flaky,
48,037.531ms, starting2026-09-07T16:11:43.732Z. Frozen root
`/data/tmp/jcpe-u5-completion.hvmld5a9`, wrapper `run-standalone.sh`, result
`standalone/results.json`; all1623 input hashes match before and after.
`/tmp/jcpe-my-charts-standalone-audit.json` records inspection of all36 JSON
reports:12 positive offline/accessibility cases and24 intentional negative
controls. No CSP, timeout, expected result or gate was weakened.

## Non-browser gates and retained corrections

Specification: `bun test tests/static/my-charts-contract.test.ts` passed3/0,
58assertions, with tests-project TypeScript and focused ESLint exit0.
The packet was authored before production code and reuses the already manually
authored exact-share document witness; production output generated no expected
musical data or state transitions.

Focused production and source-fault command:

```sh
bun test tests/conformance/my-charts-production-mutations.test.ts tests/unit/my-charts.test.ts tests/integration/my-charts-integration.test.ts tests/static/my-charts-contract.test.ts
```

45pass/0fail,279assertions,3.61s. All nine actual source faults have an
unchanged-assertion passing baseline and failing mutant: count cap, unknown
backup field, negative zero, description preservation, F1 identity remapping,
real document rename, explicit restore consent, separate storage/musical
identity, and retired write-completion ownership. Logs and source hashes are
under `/tmp/jcpe-my-charts-production-faults-*`;
`/tmp/jcpe-my-charts-mutations-test.log` is the aggregate result. Application
port controls prove service lifetimes; native storage behavior is independently
exercised by the browser suite above.

`bun run typecheck`, `bun run lint`,
`bun scripts/verify-standalone.ts --static-only`, and
`bun run verify:reproducible` exit0. The reproducibility gate uses different
roots and mtimes and produces the exact8a0c3985 artifact. Logs:
`/tmp/jcpe-my-charts-full-final-types.log`,
`/tmp/jcpe-my-charts-full-final-lint.log`,
`/tmp/jcpe-my-charts-static.log`, and
`/tmp/jcpe-my-charts-reproducible.log`.

The final regression command adds the existing exact-share unit/integration/
contract tests, U0/U5 contract tests, and real lifecycle/local-replacement/
document-import integration suites:192pass/0fail,1594assertions across13files
in6.73s (`/tmp/jcpe-my-charts-broad-unit.log`).

Retained development errors: first core typecheck found two invalid annotated
for-of declarations and a title-command coalescing mismatch; corrected to the
actual A0 contract. First service typecheck caught the invalid `json` hint;
use the actual `canonical-json` enum. First full typecheck caught seven new-test
branded/nullable observation mismatches; explicit unknown observations preserve
the assertions without casting domain brands. ESLint caught unused imports,
unbound native-method capture, nullable Promise rejection values and redundant
type arguments. Native capture now retains the actual prototype writer's typed
key-request contract; no lint suppression or runtime replacement was added.
The first build's five-case Chromium/file390 control passed5/0 in14.1s on
artifact76a6ee52 at `/data/tmp/jcpe-u5-completion.wfklo91d`; the final matrix
includes the explicit-abort diagnostic correction and expanded negative paths.

## Independent storage laws and actual source faults

`tests/e2e/my-charts-storage-probe.ts` exercises the actual production storage
adapter against native IndexedDB. Its independently authored expectations cover
a populated-generation stale writer, an empty-to-populated-to-empty ABA cycle,
an interrupted Remove,128/129 real records, and generation exhaustion at
9,007,199,254,740,991. Exact pre/post snapshots establish preservation.

`tests/support/build-my-charts-storage-probes.ts` compiles isolated browser
harnesses with five single-site changes to the actual adapter source: missing
CAS, premature success before transaction completion, deletion outside the
publication transaction, generation reset on empty, and generation overflow.
Every unchanged law first passes in a fresh native baseline context and then
rejects its corresponding mutant with the specific expected assertion failure.
An unexpected exception or build failure cannot count as a detected fault.

```sh
bun scripts/run-playwright.ts test tests/e2e/my-charts-native-storage.spec.ts --workers=1 --config complete.config.ts
```

Final30/0,25,301.095ms, starting2026-09-07T16:26:11.088Z, at
`/data/tmp/jcpe-u5-completion.mkh5hhp9/complete/results.json`.
All1627 input hashes match before/after. All75 JSON attachments were inspected:
15 baseline laws,15 fresh positive controls,15 specifically detected faults,
30 environment reports. Zero page/console errors, unauthorized requests,
retries, skips or flakes. Source hashes match the production adapter and
distinguish all five mutations. Audit:
`/tmp/jcpe-my-charts-native-storage-audit.json`.

Retained first attempt:15pass/15fail,49,185.731ms, at
`/data/tmp/jcpe-u5-completion.nl748ozb`. All storage outcomes reached their
expected laws, but the harness violated its CSP: Firefox invented a favicon
request, and Playwright's WebKit context-close screenshot injected an inline
stylesheet. The private harness now uses the studio's inert embedded favicon
and explicitly closes the positive page before closing its context. The actual
studio CSP and zero-error assertions remain unchanged; the first attempt is
still a failed gate.

The independent literal backup boundary in
`tests/unit/my-charts-backup-boundary.test.ts` submits an actual67,239,936-byte
valid JSON envelope, then one additional byte. It passes1/0,3assertions,
896ms. This complements the actual2MiB per-document,32MiB aggregate and128
record edge tests; expected bounds do not come from production constants.

## Independent workflow verification and selection-race correction

`tests/e2e/my-charts-transfer.spec.ts` adds fresh-context native two-chart
backup/restore, exact document export, three successive chart replacements
around active preview/playback/recovery, clean-versus-dirty confirmation,
recovery after reload, and native cancelled/aborted/successful Remove and Restore.
Backup hashes include stable record IDs, timestamps and canonical document
strings. Each interrupted operation compares every stored byte before running
its honest successful twin.

Retained controls: `887spgkk` passed1/failed1 because the last Open incorrectly
expected an unsaved warning immediately after a successful current-chart export.
The explicit clean-state expectation was corrected. `df95zp6l` passed2/failed1
because the test expected “interrupted” while the actual abort message says
“cancelled.” Neither correction changes a production outcome.

The next2pass/1fail control at `j_l8wqam` found a real UI race: deferred title
initialization after selecting a kept chart could overwrite immediately typed
input. `MyChartsDialog` now initializes that draft in the layout commit. The
original native title assertion and failing trace are retained. A fresh control
at `bgvdnbn6` passes3/0 in12.8s, including preview retirement and failed-operation
preservation. All roots above are under `/data/tmp/jcpe-u5-completion.*`.

The correction builds to
`e3adae592a3f070cd4f5c53faeac46f7306d712badcd534e7cc702670fb117de`,
8,421,875bytes; root/dist match. All308 source hashes/mtimes are recorded in
`/tmp/jcpe-my-charts-selection-source-final.json`. Focused and existing
regressions pass193/0,1597assertions across14files in7.64s, including the nine
application source faults and new outer-byte boundary. Full types/lint,
standalone static and distinct-root/mtime reproduction pass. Logs are
`/tmp/jcpe-my-charts-selection-{bun,types,lint,static,reproducible}.log`.

The combined183-case matrix on that artifact at
`/data/tmp/jcpe-u5-completion.bgvdnbn6` finished182pass/1fail,
574,682.734ms, starting2026-09-07T16:40:27.866Z. Every one of the129 existing
implementation cases passed; all258 reports were inspected again, with the
same18 native audio-stop cycles,90 created/revoked URLs,747 opened/closed
connections,183 consistent snapshots and21 zero-violation axe reports. Audit:
`/tmp/jcpe-my-charts-selection-implementation-audit.json`. The combined run
remains failed: the new WebKit320 HTTP recovery test pressed Escape after the
native download but before E0's export/recovery receipt. That dialog correctly
remained nondismissible. Its failure screenshot also caused Playwright's known
WebKit inline-style CSP error. The correction waits for the existing visible
handoff receipt before Escape and explicitly asserts the dialog is gone;
production code, CSP, timeout and refusal assertions remain unchanged.

The complete corrected transfer suite additionally proves populated stale
writers in two actual browser tabs over file and HTTP. Command:

```sh
bun scripts/run-playwright.ts test tests/e2e/my-charts-transfer.spec.ts --workers=1 --config complete.config.ts
```

Final60/0,269,190.558ms, starting2026-09-07T16:50:48.097Z, at
`/data/tmp/jcpe-u5-completion.v93c2cq3/complete/results.json`. All1629 input
hashes match before/after; all120 JSON reports were inspected. They prove18
exact fresh-context transfers,18 active-preview/playing/recovery cycles,18
interrupted Remove/Restore successful twins,6 populated real-tab stale writes
and72 referentially consistent snapshots. Zero unexpected errors/requests,
skips, retries or flakes. Audit:
`/tmp/jcpe-my-charts-independent-transfer-audit.json`.

Final `bun run verify:standalone` passes36/0,48,601.924ms, starting
2026-09-07T16:55:19.928Z, at the same frozen root's `standalone/results.json`.
All1629 hashes and36 JSON reports were checked:12 positive offline/accessibility
cases and24 intentional negative controls. Audit:
`/tmp/jcpe-my-charts-selection-standalone-audit.json`. The changed E2E file's
final TypeScript and ESLint checks both exit0 after the receipt correction.

Three additional native Chromium visual checks at1280/390/320 widths have zero
console/page errors or horizontal overflow. All six top/action screenshots were
visually reviewed; small screens scroll the same dialog to its actions. Reports
and screenshots are in `bgvdnbn6/visual`. These are automated/browser visual
observations, not the separate human accessibility session.

Immediately before9ed4925, `bun run build` again produces the exact e3adae59
artifact; root/dist match and all308 source hashes/mtimes remain identical to
the tested snapshot (`/tmp/jcpe-my-charts-verification-precommit-build.log`).
All feature criteria are satisfied. Existing engine owners, U2 human
observations, global cast policy and release/predeploy/committed-byte deployment
gates remain separate and open where applicable.
