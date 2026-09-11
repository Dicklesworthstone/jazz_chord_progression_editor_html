# Short dry piano WAV

CC1, `jcpe-6ujg.8`. Explicitly render a selected passage as dry Concert Grand
voicings; do not claim live-instrument, accompaniment, effect or mastering parity.
The approved `changes.dsp.concert-grand@1` route and its existing checked-in
attack samples/WASM remain the only renderer. No recipe/ledger/WASM change or
new model becomes reachable. The user's instrument setting remains unchanged.

## Feasibility and admission

RCH Bun 1.3.14 probe `wav-feasibility.ts`: 18 actual renders at MIDI 21/60/108,
32 kHz and 0.25/2/4 seconds were finite and pairwise byte-identical. Largest
copied note PCM: 1,024,000 bytes; largest observed worker render: 30.05 ms.
WASM f505035be85ea98cc6c6c71374a84448c65851aa7a4ca31e5720e71f336a6ca9,
attack samples 08bc1a567e615e498baded37966eef2a13b2b34de288e301a833dd8460727980.
These are worker observations, not a phone latency or memory claim.

Admit a whole chart, one section, or an explicitly selected consecutive excerpt
containing 1–4 measures, at most 16 seconds,
32 attacks and 64 exact pitch occurrences. Full-context P0 source compilation
is bounded to 32 sections, 128 measures and 128 source events before realization.
Use its literal exact Manual/Frozen/current Auto notes, onset ticks and gate
ticks. No implicit bass or accompaniment; external bass is disclosed as omitted.
MIDI pitches must be 21–108; each note gate at most 4 seconds. Refuse unsupported
pitches, invalid plans, empty audible passages, oversize passages and non-finite
PCM without partial downloads, transposition or dropped voices. Section projection
uses the existing exact P0 range operator and starts the selected range at zero.

## Explicit bar excerpts (jcpe-6ujg.8.4 / .8.5)

Whole chart/section remains the default. The user enables “Choose specific bars”
and selects a one-based first bar and a count of 1–4 within that scope. Display
both selected endpoints and available bar count. Enabling starts at bar 1 with
up to four bars; changing chart/section resets this optional selection. Neither
oversize defaults nor invalid ranges are silently shortened. Missing section,
noninteger/out-of-bounds first bar/count and an end beyond the scope refuse.

Resolve boundaries in the original document with domain rational arithmetic:
empty bars consume meter capacity; pickups/incomplete bars consume their exact
stored event sum. Chart-relative excerpts may cross section boundaries. Section
bar numbers start at one but map to absolute document time. Compile full-context
P0 once, then use its exact range projection; do not recompile a sliced document
or change Auto context, Manual/Frozen pitch order/register/spelling/duplicates.
Leading silence and original event IDs remain intact. Renderer offsets absolute
ticks against the projected start, retaining existing gates, tail and budgets.

An excerpt change cancels pending rendering/hashing and invalidates ready bytes.
A cancelled job retains ownership until completion; no overlapping render starts.
Source revision changes and panel closure retain the same cancellation behavior.
Invalid source size refuses before timeline accumulation or P0 compilation.

Independent pre-implementation ticks are in `tests/fixtures/wav-excerpt.json`.
Build proof must include real PCM for a later excerpt, context-preserving plans,
invalid-range refusal before renderer calls, source immutability and cancellation
at rendering/hashing boundaries. Native downloads across all three browser
engines at phone/desktop widths must decode the selected later bars and preserve
leading silence, unchanged revision, cleanup and accessibility. Physical-phone
memory/listening remains the original open `.8.3` verification gate.

## PCM and timing

Stereo 32,000 Hz. Project each nonnegative tick independently to the nearest
sample frame by `floor(tick * 60 * 32000 / (tempo * 960) + 0.5)`; never accumulate
rounded durations. Gate frame = projected absolute gate end minus projected
onset. The maximum quantization error is half a sample at each boundary.
Append exactly 6,400 frames (200 ms) after the passage. Render each occurrence
through the existing hybrid piano with a ceiling of gate length + 200 ms, at
velocity 96. The existing renderer's natural decay may end sooner.

Mix in source-event and occurrence order, preserving duplicates. Apply a linear
64-frame attack guard (`min(1, i/64)`) and a linear 6,400-frame release from gate
end (`max(0, 1-(i-gateFrames)/6400)`). The final release frame is forced to zero.
No filter, room reverb, compressor, master-volume or live-bus processing.
After mixing, scale down only if needed to put the absolute peak at 0.9; never
boost quiet material or clip samples. Describe this as peak reduction, not
loudness normalization. Retain exact leading rests and passage length.

Serialize the existing piano render through its shared cooperative-runtime
queue, with a cancellation check after waiting and before the synchronous
legacy render. This preserves its exact PCM and avoids interrupting a pending
stateful cooperative render. One bounded note render is the indivisible unit;
cooperatively yield between notes and every 16,384 mix/scan/scale frames. No
wall-time musical cutoff. Check cancellation after every await. Existing live
playback continues to use its one persistent graph; the export creates no
AudioContext and schedules no audible sources.

## Bounds, cancellation and bytes

Maximum output: 518,400 frames. Maximum individual note: 134,400 frames. Work
counters include planned/finished occurrences, generated/mixed/scanned frames,
yields and termination. At most 64 notes × 134,400 frames are rendered/mixed;
peak and scale scans each visit at most 518,400 frames. Retain one output stereo
pair and at most one note stereo pair. Release/cancel never starts a second job
until the previous job relinquishes its buffers; repeated Prepare is ignored
while busy. A chart edit, passage change or panel close cancels pending work.

The conservative logical PCM/byte budget is 10 MiB: stereo Float32 output
4,147,200 + note 1,075,200 + PCM16 WAV 2,073,644 + prepared Blob copy 2,073,644 +
up to 1,075,200 bytes of renderer scratch = 10,444,888 bytes. This is not process
RSS or a GC deadline; existing app/renderer/WASM/attack-sample/cache baseline and
small bounded metadata are separate. Physical-browser memory is an acceptance
gate, not inferred from this arithmetic.

WAV is little-endian RIFF/WAVE, fmt size 16, PCM format 1, two channels, 32 kHz,
16 bits, block alignment 4 and byte rate 128,000. Interleave L/R. Quantize finite
samples in [-1,1] as round(sample × (sample < 0 ? 32768 : 32767)); refuse invalid
input rather than substitute silence. Maximum file length 2,073,644 bytes.
Prepare and hash bytes before Download; activate a single-use Blob download
synchronously from that click, account for creation/revocation and report failed
cleanup. Never mark canonical JSON/document export as saved because a WAV was
handed to the browser. A source edit invalidates prepared bytes.

## Proof and user surface

Collapsed Download piano audio tool: whole-chart/section selector, exact limits
and omitted-sound disclosure, Prepare, progress, Cancel, Download and an honest
status. No DSP identifiers or internal counters in product copy. A cancellation
may finish its current bounded render; never show completed/downloadable before
its result and source binding have been verified.

Independent fixtures pin RIFF bytes/PCM quantization, rational onset/gate frames,
leading rests, duplicate mixing and attack/release values, maximum budgets and
near-miss refusals. RCH: those fixtures, exact sync-versus-exclusive renderer
parity, retained independent concert-grand pitch tests, stale/async/cancel and
no-audio-graph application tests, four semantic mutants, types/lint/boundaries,
guarded artifact/size. Real three-engine desktop/phone-width download tests use
the actual embedded renderer, independent RIFF decoding, digest/length, source
immutability, cancel/reprepare, no errors/network, and exact silence before a
known delayed onset. Physical phone peak memory, cancellation and listening
remain `.8.3`; no physical or DAW evidence is fabricated.
