# My Charts implementation and verification

Consumer: `jcpe-my-charts-zt9z.2` and `.3`, implementing September idea4 under
`docs/MY_CHARTS.md`. Specification committed in7af0879. This report records
technical implementation evidence; build is closed and independent verification
is active under `.3`.
The overall fifteen-idea program remains3/15 complete. No deployment or
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

Final artifact SHA-256:
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

## Independent verification still required

Before closing `.3` or the package, test fresh-context two-chart backup restore,
repeated dirty/playing/preview navigation and recovery, a populated-generation
two-tab race, empty-collection ABA, maximum/maximum+1 and generation exhaustion,
failed remove/restore preservation, and native source-fault sensitivity. The
initial-empty two-tab case alone is not proof of populated-version CAS. Keep
existing engine owners, U2 human observations, global cast policy and release/
predeploy/committed-byte deployment gates separate and open where applicable.
