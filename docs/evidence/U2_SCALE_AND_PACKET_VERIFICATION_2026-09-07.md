# U2 exact scale advice and executable inspector packet

The inspector no longer suggests a scale that excludes an exact resolved chord
degree or explicitly spelled bass. G7b9 and G7b9#11 retain natural5 and therefore
use half-whole diminished rather than altered. G7#11 uses Lydian dominant;
minor-major7 and half-diminished natural9 use melodic minor and Locrian natural2.
Incompatible explicit colors receive no suggestion and an honest visible message.
All T1 alternatives are checked; #11 cannot be substituted for b5 by pitch class.
This bounded, single-suggestion chart-annotation@2 change does not implement H0's
plural options, contextual evidence, tension availability or clash reporting.

The old inspector packet was illustrative in three of four rows. Policy3 now
executes all seven declared sections through real F2/F3 documents. Its exact
input and authority corrections are recorded in `../U2_CHORD_INSPECTOR_CONTRACT.md`;
old policy2 bytes remain in Git3f52b83. The new validator independently checks
source pitches, Frozen provenance eligibility, analysis/neighbor inputs and
motion arithmetic before enforcing the amended packet's digest pins.

Artifact: SHA-256 `d67a1cb52235e991b1ec45b605e9a96cfe2ff384adb9fb656d00cc7f66ff6654`,
8,393,339 bytes; root and dist identical. All301 production files retain their
pre-gate hashes and mtimes (`/tmp/jcpe-u2-scale-source.json`). Toolchain: Bun1.3.14,
real Node26.0.0, Playwright1.61.1; Chromium149.0.7827.55, Firefox151.0, WebKit26.5.
Native gates use workers1/retries0, original timeouts/CSP, and User-Agent
`OpenAI File Downloader, XaiImageApiFetch/1.0`.

| Gate | Result and retained record |
|---|---|
| Focused U2, chart and source-fault suites | 548 pass,0 fail;1,991 assertions across19 files,4.25s. Exact argv in `/tmp/jcpe-u2-scale-final-unit-command.json`; output `/tmp/jcpe-u2-scale-final-unit.log`. |
| `bun test tests/unit/chart-scale-containment.test.ts tests/unit/chart-analysis.test.ts` | 414/0,1,387 assertions. Twelve roots, keyed/unkeyed positives and contradictory-color near misses; explicit/enharmonic slash-bass refusals, deterministic replay and unchanged requests. `/tmp/jcpe-u2-scale-corrected.log`. |
| `bun test tests/integration/u2-inspector-packet.test.ts tests/conformance/u2-scale-production-mutations.test.ts` | Final10/0,65 assertions,1.93s. Complete four-row real projection and six production-source faults. `/tmp/jcpe-u2-scale-packet-final.log`. |
| Six source faults | Each unchanged baseline passes; each mutant fails its actual behavioral assertion. Missing-degree bypass, #11/b5 conflation, lost natural5, excluded slash bass, invented Harmony and fabricated Frozen eligibility. Source hashes/argv/results in `/tmp/jcpe-u2-scale-production-faults-*`; initial6/0,30 assertions at `/tmp/jcpe-u2-scale-mutations.log`. |
| `bun scripts/run-playwright.ts test tests/e2e/chord-inspector.spec.ts --grep "Harmony preserves exact\|every advanced tab\|symbol and structure share" --workers=1 --config complete.config.ts` | 54 pass,0 unexpected/skipped/flaky;418,639.869ms. Run via `bash /data/tmp/jcpe-u5-completion.g6r5tjwm/run-scale-complete.sh`; results in that root's `complete/results.json`. All1,608 copied inputs unchanged before/after. |
| Native audit | All90 JSON attachments inspected, zero console/page errors, denied requests or axe findings. File/HTTP ×1280/390/320 touch ×three engines. Eighteen exact scale journeys use actual Manual conversion, explicit symbol confirmation and five Undo steps; eighteen structured-draft preview journeys; eighteen seven-tab accessibility/keyboard journeys. All36 observed native audio cycles have started>0,sounding0,futureAttacks0 after release. `/tmp/jcpe-u2-scale-native-audit.json`. |
| `bun run typecheck`; `bun run lint` | Final exits0 in `/tmp/jcpe-u2-scale-final-frozen-types.log` and `/tmp/jcpe-u2-scale-linted-final.log`. Earlier new-test typing/optional-condition failures retained below. |
| `bun scripts/verify-standalone.ts --static-only`; `bun run verify:reproducible` | Both exit0; exact d67a1cb5 bytes, distinct roots and mtimes. `/tmp/jcpe-u2-scale-final-{static,repro}.log`. |
| `bun run verify:standalone` | Static plus36 pass,0 unexpected/skipped/flaky;48,315.277ms. `bash /data/tmp/jcpe-u5-completion._o4r3s26/run-standalone.sh`; all1,608 inputs unchanged. All36 JSON reports inspected: twelve positive offline/accessibility records pass with no error/violation findings and24 intentional negative controls detect their expected faults. `/tmp/jcpe-u2-scale-standalone-audit.json`. |

The native pitch observer proves real source start/retirement, not inferred
sample MIDI identities or human hearing. Synthetic fixture data in test reports
is intentional; no runtime telemetry or user-chart reporting was added.

## Failures retained

- Before production changes, the independent scale suite was192pass/193fail:
  `/tmp/jcpe-u2-scale-before.log`. The first after run was389pass/25fail;24 cases
  exposed extended half-diminished chords represented as minor+b5 rather than
  the parser's special diminished form. Correcting that predicate and the one
  old, mathematically inconsistent G7b9→altered assertion yields414/0.
- Complete original packet projection was1pass/3fail,
  `/tmp/jcpe-u2-packet-before.log`. The first amended range64..74 was3pass/1fail:
  the V0 rootless-a major template is3,7,9,5 in ascending register. Its exact
  E4,B4,D5,G5 input requires64..79. This was corrected from the existing V0
  authority, not by recording an algorithm output as a new expected value.
- The initial native old-byte control at
  `/data/tmp/jcpe-u5-completion.wq9jfw_n/control/results.json` failed before the
  target because four Auto voices could not realize all required altered tones.
  The corrected journey explicitly uses actual G7 Manual pitches and confirms
  symbol changes. No production realization law was weakened.
- The corrected old-byte control at
  `/data/tmp/jcpe-u5-completion.g6r5tjwm/before/results.json` fails the intended
  missing `G half–whole diminished` assertion (0pass/1fail,13,578.358ms), bound
  to old ef5a0cfa bytes. The unchanged assertions pass in the new54-case matrix.
- New packet-test type errors compared JSON strings to branded/nullable values;
  explicit narrowing fixes them. Two unnecessary optional conditions were
  removed after lint identified them. Logs remain in
  `/tmp/jcpe-u2-{current-types,scale-final-types,scale-final-lint}.log`.

U2 verification stays open for the named real human listening/screen-reader
observations and wider acceptance work. This scoped proof does not replace the
earlier full inspector matrix or certify full H0, the release aggregate, model
acceptance or a deployment. September idea completion remains3/15.
