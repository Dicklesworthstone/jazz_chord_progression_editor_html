# Exact QR sharing, version 1

CC5 (`jcpe-6ujg.10`). A small-chart convenience inside the existing exact-share
dialog. Copy exact link and native JSON remain available. No server, shortener,
network request, model, new production package, or data loss.

## Feasibility and transport decision

The existing independent two-chord exact-share specimen is 2,016 compact JSON
bytes and about 2,716 characters as an ordinary URL. That is too dense for this
surface. An additive compressed transport is necessary for useful exact QR,
not a new document schema. Real browser feasibility on 2026-09-10 restored those
exact bytes in Chromium 149 / Firefox 151 / WebKit 26.5: zlib payloads 855 / 860 /
850 bytes, URLs 1,171 / 1,178 / 1,165 characters, desktop elapsed 2.2 / 1 / 4 ms.
These are desktop observations, not phone performance or scan promises.

The optional QR transport is `#zdoc=3.` followed by unpadded canonical base64url
of RFC 1950 zlib (`CompressionStream("deflate")`) bytes of the existing lexical
canonical-JSON compaction. Do not parse/stringify it: negative zero, escapes,
Unicode, spelling, duplicates, IDs, durations and every persisted setting must
survive exactly. Compression bytes can differ across engines; musical/document
content must not. Retain the prepared immutable URL/matrix until invalidation.
The ordinary v1/v2 readers and v2 Copy link remain unchanged. The startup root
adds a v3 decoder before the same E0/F2/F3 exact import pipeline, with explicit
share recovery behavior; malformed v3 never opens a demo or silently drops data.
A receiving app needs this v3 reader. Scanning a URL does not install the offline
app on an unprepared phone. Until this version ships, an old hosted app may refuse
v3; keep the current exact link and JSON fallbacks. No deployment is implied.

Limits: existing 6,138 decoded UTF-8 bytes unchanged; compressed input/output
≤880 bytes; full QR URL ≤1,190 printable ASCII bytes. Validate base64url alphabet,
length, unused trailing bits and limits before decoding. Native bounded streaming
inflation cancels on the first chunk that would exceed the decoded limit, refuses
invalid zlib/checksum/UTF-8 and returns no partial text. Count retained output only
up to the cap; browser-internal stream buffers are not a claimed heap ceiling.
Missing compression/decompression APIs refuse and explain the link/JSON fallback.
No compression ratio, lossy pruning, or wall-clock musical cutoff.

## Reviewed QR implementation

QR Code Model 2, byte mode only, error correction M, versions 1–28, no ECL boost.
One segment; choose the smallest fitting version. Version 1–9 count field is 8
bits; 10–28 is 16. Terminator, byte alignment, alternating EC/11 padding, standard
Reed–Solomon blocks/interleaving, finder/separator/timing/alignment patterns,
format/version BCH, zigzag placement and eight masks follow the reviewed standard
implementation. Choose minimum N1/N2/N3/N4 penalty, lowest mask on a tie. Test-only
explicit version/mask inputs remain bounded and must not authorize overflow.

Authorities reviewed 2026-09-10:
- [Denso Wave version/capacity explanation](https://www.qrcode.com/en/about/version.html).
- [Project Nayuki MIT QR implementation](https://github.com/nayuki/QR-Code-generator/blob/master/typescript-javascript/qrcodegen.ts),
  retrieved source SHA256 `1dc03fb5a10e0e2318ea162755bbdb9977ca6ce52cff959e9c9b6deafdccda9c`.
  Adapted formulas/algorithms must retain its license and attribution.
- [WHATWG Compression Streams](https://compression.spec.whatwg.org/).

Production does not consume reference-generated matrices. Independent vectors
were generated *before* production using installed **libqrencode 4.1.1-2build1**,
`QRcode_encodeString8bit`, M: byte v1, explicit version v7, long-count v10 and
1,190-byte v28. `vectors.json` records literal matrices, chosen mask, and SHA256.
`compression.json` records independent Python zlib 1.3.1 wire bytes for literal
JSON including -0, a Unicode escape and non-ASCII text. These are implementation
cross-check vectors, not claimed official ISO published test vectors.

## Work, rendering and ownership

Bounded search: ≤28 version checks, exactly eight mask candidates (one for an
explicit test mask), maximum 129×129 modules, maximum 26 RS blocks, with degree at most 30.
No recursive search. Report bytes, version, mask candidates, module visits and
GF multiplication count, with deterministic complete/refused termination.
Logical matrix work retains at most four 16,641-cell byte buffers plus bounded
codewords/bits/rows; describe measured work separately from elapsed performance.
No wall-time cutoff or memory/performance claim about a physical phone.

Render black modules on white with a four-module quiet zone on every side,
crisp SVG edges, no logo, decorative overlay or theme recoloring. QR display needs
at least two CSS pixels/module including the quiet zone. If the current dialog
is too narrow, do not shrink below that bound: explain that a larger screen is
needed and retain link/JSON alternatives. Desktop may show up to four CSS pixels
per module. Screen density is a conservative display rule, not proof of scanability.

Application owns preparation and source document/revision. Only explicit Show QR
starts compression; one pending attempt. Cancel, source edit, owner replacement
or a new preparation invalidates it and clears the displayed old code immediately.
A late completion cannot publish into a later dialog. A stale initial click
refreshes the ordinary link and requires another click; no unexpected new chart
is shown under old consent. UI renders only the typed matrix and dispatches intents.
Preparation changes no document, history, playback, storage or export marker.

## Required proof

RCH: literal independent matrices, all 28 capacities, empty/non-ASCII/oversize
refusals, mask determinism, source-byte perturbation and semantic mutants;
independent zlib vectors, native compressed-input/checksum/UTF-8/bomb limits;
existing v1/v2 and negative-zero exact-share regressions; source/owner races and
refusal twins; full typecheck/touched lint/source-policy/guarded build.

Real browser: three engines, 320px/desktop, light/dark; actual compression and
rendered SVG; independently decode captured images with installed libzbar, compare
exact URL and native-inflated bytes, load its fragment in a fresh real app, export
native JSON and compare complete document (including Manual/Frozen repetitions,
spellings, rational durations and IDs). Check keyboard/focus/Axe/overflow, stale
code removal, unsupported/oversized fallback, quiet zone, requests and console/page
errors. Preserve versions, artifact hashes, diagnostics and failure history.

The `.10.3` leaf separately requires physical camera scans on supported phones
and independent usability acceptance. Desktop engines, generated pixels, or an
emulated viewport do not close that gate. Do not promise universal scanability.

Supplemental proof: `all-masks.json` was generated independently after the first encoder implementation using libqrencode 4.1.1 `QRcode_encodeMask`, with all eight v7 masks and all 28 byte capacities. It is additional evidence, not retrospectively claimed as a pre-implementation fixture. Native compressed streams intentionally differ from Python wire bytes; encoder proof compares independently inflated exact text, while decoder proof consumes the frozen Python wire itself.

Browser image proof distinguishes CSS geometry from screenshot clipping. The SVG
must remain exactly square with integer CSS module size and four white modules.
Playwright scale=css capture can round a fractional origin outward by one boundary
pixel on either axis; the independent decoder receives the original captured PNG.
The pixel checker permits only that documented extra boundary pixel, tests the
interior white strips, and rejects a full-module crop. This is screenshot-coordinate
accounting, not permission to reduce the SVG quiet zone or shrink its modules.

WebKit capture uses the live target's `Page.snapshotRect` protocol directly through
an explicitly version-checked Playwright 1.61.1 test adapter. The ordinary screenshot
preparation injects a `body {}` style, which correctly violates the app CSP. The
adapter reads actual renderer pixels without changing the DOM, installing styles,
bypassing CSP, repainting a serialized SVG, or filtering console errors. Protocol
changes fail the test and require review. Chromium/Firefox use standard screenshots.
Every image proof also shifts the image left by one module without changing its
size and requires rejection of the resulting three-module quiet zone. Separate
unit proof reconstructs all independent reference matrices from the SVG runs,
including the complete four-module border on all sides.
