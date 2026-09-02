# Predeploy Model-Acceptance Gate

Status: production law from bead `jcpe-deploy-listening-gate-rw2n`, created
after the 2026-08-06 regression in which `waveguide-clarinet@2` reached all
production hosts with its listening gate still open (owner verdict on the
live site: winds "utterly bizarre and broken"; all hosts rolled back to the
approved artifact `67b9ae08` on 2026-08-07).

## The law

No artifact deploys while any **reachable** DSP algorithm id lacks an
accepting row in
`release-evidence/audio/listening/model-acceptance-ledger.json`.

Run before every deploy, after the guarded build and before any host upload:

```bash
bun run predeploy:check
```

A nonzero exit blocks the deploy and lists each offending model with a named
finding (`MODEL_OPEN`, `MODEL_RED`, `MODEL_UNLISTED`,
`MODEL_DELEGATED_NO_EVIDENCE`, `MODEL_DELEGATED_INVALID_EVIDENCE`,
`MODEL_DELEGATED_WASM_MISMATCH`, `MODEL_WASM_DIGEST_DRIFT`, and kin — the
delegated-evidence replay additionally requires the reference corpus below).

## Reachability is wider than the recipe registry

The regression shipped through an engine gesture-routing override while the
recipe registry still pointed at the approved model. The gate therefore
unions three sources:

1. every `renderer.algorithmId` in
   `src/audio/instrument-recipes-contract.ts` (imported, authoritative);
2. the embedded impulse algorithm id;
3. a source scan of `src/audio/dsp-renderer.ts` exported algorithm-id
   constants referenced by `src/audio/audio-engine.ts`, plus any algorithm-id
   literal appearing directly in the engine.

Over-inclusion fails closed by design: a model that merely *might* ship must
carry a ledger row.

## Ledger statuses

| Status | Shippable | Meaning |
|---|---|---|
| `approved` | yes | The owner listened and accepted, with evidence. |
| `machine-delegated` | only with on-disk evidence | The owner delegated the verdict (2026-08-07) to the machine reference gate; the row's `evidence` must begin with the path of an existing passing reference-similarity report. |
| `open` | no | No verdict yet. |
| `red` | no | Rejected. Stays red until the implementation is amended and re-judged. |

A shipping id with no row at all fails closed (`MODEL_UNLISTED`).

## Editing the ledger

Rows are edited by hand, with evidence, when a verdict lands — an owner
listening note, or a machine reference-gate report path. Moving a recipe or
engine routing to a new model version is a **ship decision**: the new id
needs its row before the tree can deploy.

## Reference corpus prerequisite

Machine-delegated wind rows are validated by **replaying** their evidence
against the embedded shipping WASM and the University of Iowa anechoic
reference recordings. Those recordings are third-party audio and are NOT in
the repository; without them the replay reports `unavailable`, the gate
fails closed with `MODEL_DELEGATED_INVALID_EVIDENCE`, and the two
`uiowa-*` unit suites in `bun test` go red. This is deliberate — but it
means a clean checkout must install the corpus once:

1. The manifest `tests/fixtures/uiowa-wind-identity-corpus.v1.json` pins
   the exact six files: URL, byte count, and SHA-256 each (three flute
   dynamics, three Bb-clarinet dynamics, all from
   <https://theremin.music.uiowa.edu/MIS.html>; the publisher states the
   recordings may be downloaded and used for any project without
   restriction).
2. Download each `url` into
   `test-results/winds-reference-source/uiowa/<fileName>` (the directory is
   gitignored).
3. Verify every file's SHA-256 against the manifest before trusting a run;
   the loaders re-verify on every gate execution and refuse a mismatched or
   truncated file (`REFERENCE_CORPUS_DIGEST_MISMATCH`).

One shell loop that does all three:

```bash
mkdir -p test-results/winds-reference-source/uiowa
jq -r '.files[] | .url + " " + .fileName' \
  tests/fixtures/uiowa-wind-identity-corpus.v1.json |
while read -r url name; do
  curl -sL -o "test-results/winds-reference-source/uiowa/$name" "$url"
done
# then compare `sha256sum` output against the manifest's pinned digests
```

## Second gate: real-browser per-instrument playback

Status: production law from bead `jcpe-predeploy-playback-gate-kyor`, created
after the 2026-08-07 regression in which artifact `61c5e018` shipped with
every plucked model refusing mid-chart ("audio error"), a refusal→fault
cascade poisoning the whole session, and an unpitched low-register flute —
all invisible to offline gates that swept single in-range notes and never
played a chart.

Run against the freshly built artifact, after `predeploy:check` and before
any host upload (requires a real Node process and the repo's Playwright
Chromium; never Bun's node shim):

```bash
bun run build
bun run predeploy:playback   # defaults to dist/index.html
# or: node scripts/check-predeploy-playback.ts <artifact.html> [--json out.json]
```

Per selectable instrument, in a fresh Chromium page each (isolation keeps one
instrument's failure from masking the next): press Play on the starter chart
and assert zero console/page errors, transport status reaching and holding
"Playing" through a 4.5 s listen window, and audible output — per-note
rendered buffers with a chromatic pitch-lock (±35 cents of some
equal-tempered pitch, search-boundary locks rejected) for rendered/sampled
recipes, or a master-output analyser peak for live-graph synth recipes. A
final recovery fixture seeds with a refusing instrument when one exists and
asserts the session recovers. The RC2 engine fix
(`jcpe-engine-refusal-fault-cascade-vg8h`) landed, so the fixture is
enforced by default; `--no-enforce-recovery` exists only for diagnosing a
broken fixture and never for shipping past it. On a healthy artifact the
fixture passes vacuously and says so.

Proven against both fixtures at creation: the approved artifact `67b9ae08`
passes 13/13 with recovery vacuous; the broken artifact `61c5e018` fails
with all five plucked refusals and reproduces the fault cascade
(`RECOVERY pending — "Audio hit a fault"`).

**No-Claim:** a green playback gate proves error-free, audible, pitch-locked
starter-chart playback in Chromium on the build host — nothing about sound
quality, reference similarity, or register coverage beyond the starter
chart. Those verdicts live in the model-acceptance ledger above.
