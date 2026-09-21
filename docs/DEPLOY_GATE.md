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

## Evidence runtime compatibility

Exact flute evidence replay requires a numerically compatible host, in addition
to Bun 1.3.14 and the pinned reference corpus. `check-predeploy.ts` checks six
actual FFT/window sine and cosine inputs before running a machine-delegated
flute replay. A mismatch produces `MODEL_EVIDENCE_RUNTIME_MISMATCH` with the
operation, argument, expected value and observed value. Use a conforming RCH
worker and rerun the original gate. There is no override.

This restriction comes from reproduced defect `jcpe-uid4`, not a theoretical
platform concern. On September 17, 2026, both official Linux x64 Bun 1.3.14
builds (standard and baseline) reproduced the full checked-in report exactly
on worker hz4. The identical baseline executable on ovh-b produced 52 differing
numeric fields and eight differing derived hashes, with identical source,
WASM, reference and rendered-PCM bindings. Tracing found one sine and five
cosine results differing by one floating-point step for identical arguments;
the traced `log10`, `hypot`, `pow` and `sqrt` operations agreed whenever their
inputs agreed.

A subsequent same-host experiment isolated glibc's CPU-feature dispatch:
with the same hz4 host, standard Bun binary, libraries and 1,805 frozen
inputs, the default environment reproduces the accepted report exactly.
Starting Bun with `GLIBC_TUNABLES=glibc.cpu.hwcaps=-FMA,-FMA4` reproduces
all 60 differing fields and the entire ovh-b report exactly; disabling
AVX/AVX2 produces that same report. This is a diagnostic experiment, **not**
a deployment setting or workaround. Both non-default runs still fail exact
accepted-evidence equality. Receipts are in
`test-results/flute-runtime-dispatch-20260917/`.

Bun's version or baseline-build label alone is not an authority. Nor is
switching to Node an exact replacement: Node 26.0.0 differs from two of the
six admitted trigonometric probe values on hz4. A portable analyzer still
needs an explicit numerical contract and proof; changing the runtime or
rounding outputs cannot silently replace the accepted report.

### Optional software CPU for the model gate

On Linux x64, `JCPE_EVIDENCE_QEMU=/absolute/path/to/qemu-x86_64`
opts the model gate into software CPU execution. The launcher requires the
pinned QEMU executable below and an official Bun 1.3.14 standard or baseline
binary, then runs the same `check-predeploy.ts` with `-cpu max`. The child
still performs all six runtime probes and the complete original replay.
The parent propagates failure; there is no native fallback after an emulator
error. Without the variable, the existing native path is unchanged. This
setting also applies when the model gate is reached through `bun run verify`
or `bun run deploy`. Instrument-quality and browser-playback gates remain
separate and mandatory.

The initial supported combination is Ubuntu 26.04 Linux x64 with QEMU
10.2.1, package `1:10.2.1+ds-1ubuntu3.2`. Its `qemu-x86_64` SHA-256 is
`e016785942d935f432db1527472c28288ca324f9c0ca2434084ee61d2d7a59b6`.
The Debian package SHA-512 is
`4ccfbcab0613da0912ffcc314a8c66df09e257dc6208b6b6dd794020784f5d19a4001e99ed0e52eb18db3ad5e2883034616e8ed4d3f16b5238346430de3fb3e3`.
Install or extract this development tool separately; the gate never downloads
or installs anything. Host libraries remain subject to exact replay rather
than being assumed compatible from the OS label.

```sh
JCPE_EVIDENCE_QEMU=/absolute/path/to/qemu-x86_64 bun run predeploy:check
```

This executes the existing numerical implementation on a software CPU; it
does not replace the analyzer, alter accepted evidence, or add anything to
the browser app. It is slower than a conforming native worker.

For source commit `5a4cad7`, RCH on the previously incompatible ovh-b
worker reproduced the complete accepted flute report exactly with this path
(native: 60 differences; emulated: zero). The full model gate passed all 11
models and the separate quality gate passed nine instruments. A red model
and a tampered accepted report both still returned exit 1; an unpinned
emulator returned exit 2. Native Chromium then passed all 15 playback cases
and recovery. On the conforming hz4 worker, 43 tests, all type projects,
full lint and native predeploy also passed. Receipts are under
`test-results/flute-emulation-{replay-complete,acceptance,static,playback}-20260917/`.

This resolves `jcpe-uid4` through its explicit checked-runtime alternative.
It does not promise that native JavaScript math is portable across CPUs,
that arbitrary QEMU versions are interchangeable, or that human listening
and device acceptance are complete.

The probes pin observed values from the environment that reproduces the
accepted report. They are an admission check, not a mathematical accuracy
claim, musical threshold, or complete proof of portability. Passing them still
requires the unchanged complete canonical replay and all source/WASM/corpus/
PCM bindings. No evidence value is rounded, rewritten or accepted by tolerance.
This affects development-time evidence execution only; it does not narrow the
web application's browser contract or change its embedded audio renderer.
Portable analysis across incompatible hosts remains open on `jcpe-uid4`.

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

## One-command deploy

`bun run deploy` (`scripts/deploy.ts`) is the production path and encodes
every law in this document: committed-bytes-only staging from
`git show HEAD`, the running-suite guard, the model-acceptance gate, the
real-browser playback gate against the exact staged bytes (the gate ledger
and the upload share one file — that identity is the hash coupling), the
Cloudflare Pages and Vercel uploads, and a byte-hash poll of both hosts.
`--check` runs every gate and skips the uploads. There is deliberately no
flag that skips a gate, and the script always prints the one obligation
tooling cannot discharge: a real-browser boot check at desktop and phone
widths on each host.

Before a production run spends time on those gates, it checks Pages access
for the exact project and account. A shell API token can be active while
lacking Pages permissions. If environment credentials fail, the command
checks the saved Wrangler OAuth login and uses it only if that Pages check
succeeds. This changes the Cloudflare subprocess environment, not the shell
or credentials used by other projects. `--check` does not require host access.

If both credential paths fail, restore the account's Cloudflare Pages Edit
permission on the API token, or sign in through Wrangler's remote-friendly
device flow (Wrangler versions supporting `--device`):

```bash
env -u CLOUDFLARE_API_TOKEN -u CF_API_TOKEN \
  -u CLOUDFLARE_API_KEY -u CF_API_KEY -u CLOUDFLARE_EMAIL -u CF_EMAIL \
  wrangler login --device --browser=false --scopes account:read user:read pages:write
bun run deploy
```

The account owner completes the browser sign-in; no token belongs in source
control. A successful access check is only a preflight: the upload and live
verification still have to succeed. The upload directory contains the two
public assets and a Vercel allowlist; playback diagnostics stay outside it.
Temporary staging, including any credentials created by `vercel link`, is
removed on both success and failure.

## Source-closure drift law

The gate also compares the `dsp/concert-grand` source tree against the
closure ledger recorded inside the shipping WASM module
(`bun scripts/build-dsp.ts --sources` is the standalone form; no Rust
toolchain is needed). A mismatch means the crate no longer describes the
shipping audio: the gate fails closed with `MODEL_WASM_SOURCE_DRIFT`
naming every changed/added/removed file, and the resolution is a re-pin
with the pinned toolchain (`rust-toolchain.toml` + wasm-opt 131) plus
refreshed delegated-evidence replays — or reverting the source change.
A payload pinned before the ledger existed passes with an explicit
printed NOTICE; the next re-pin records the ledger and closes that
window permanently.

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


### Headless Linux audio output

A PulseAudio dummy output can report a running Web Audio context while its
clock is stalled. On 2026-09-21, a bare oscillator (no application code)
reproduced approximately two seconds without clock progress on the shared
sink in three cold samples. A separate daemon without idle suspension still
stalled. PulseAudio 17's [`module-null-sink` source](https://github.com/pulseaudio/pulseaudio/blob/v17.0/src/modules/module-null-sink.c)
uses a two-second buffer by default; its supported `norewinds=true` setting
reduces that buffer to 50 ms. With that setting, three cold samples advanced
4.44 audio seconds over approximately 4.44 wall seconds between measurements.

For a headless worker with this measured problem, configure a private sink
on that worker; do not change another suite's shared daemon:

```bash
JCPE_AUDIO_DIR=$(mktemp -d /dev/shm/jcpe-pulse.XXXXXX)
DBUS_SESSION_BUS_ADDRESS="unix:path=$JCPE_AUDIO_DIR/no-bus" \
PULSE_RUNTIME_PATH="$JCPE_AUDIO_DIR" \
pulseaudio -n --daemonize=yes --use-pid-file=yes --exit-idle-time=-1 \
  --log-target="file:$JCPE_AUDIO_DIR/server.log" \
  --load="module-native-protocol-unix socket=$JCPE_AUDIO_DIR/native" \
  --load="module-null-sink sink_name=jcpe_test rate=44100 channels=2 norewinds=true"
export JCPE_TEST_PULSE="unix:$JCPE_AUDIO_DIR/native"
PULSE_SERVER="$JCPE_TEST_PULSE" pactl list sinks
```

Pass `PULSE_SERVER="$JCPE_TEST_PULSE"` to the real Node/browser process in
the RCH job. Check native clock progress and retain the output configuration,
original failure and corrected-run results. This changes the test host's
buffering, not the product, listen window, audible threshold or acceptance
rules. A running context or audible impulse buffer alone is not proof that
the chart sounded. The complete original gate must still pass. The separate
recovery fixture remains vacuous when no transport refusal occurs.

After the owned jobs finish, stop only this private daemon:

```bash
PULSE_SERVER="${JCPE_TEST_PULSE:?}" pactl exit
```

Evidence for the diagnosis is in `test-results/audio-clock-probe-20260921/`
and `test-results/audio-clock-lowlatency-20260921/`. The unchanged 15-instrument
release gate then passed in
`test-results/legacy-json-isolated-release-gates-20260921/`; the earlier
14/15 failure remains in `test-results/legacy-json-release-gates-20260920/`.
These are automated build-host measurements, not human listening acceptance.
