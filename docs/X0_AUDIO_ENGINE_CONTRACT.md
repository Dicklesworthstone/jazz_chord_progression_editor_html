# X0 Persistent Audio Engine Contract

Status: reviewed specification and independent fixture authority  
Contract schema: `changes.audio.engine-contract.v1`  
Engine policy: `changes.audio-engine@1`  
Registry policy: `changes.audio-active-voice-registry@1`  
Recipe set: `changes.audio.instrument-recipes@1`

This document, the public contracts under `src/audio/`, and the reviewed files
under `tests/fixtures/audio-engine/` are the complete code-facing X0 authority.
An implementer does not need the legacy file or `docs/REBUILD_PLAN.md` to build
X0. Production output may be checked against these records; it may not create,
rewrite, bless, or weaken them.

The design follows the current [Web Audio API 1.1 Editor's Draft](https://webaudio.github.io/web-audio-api/)
for context time, scheduled sources, parameter automation, compressor,
WaveShaper, Convolver, and OfflineAudioContext semantics. That development
reference adds no runtime request: the shipped studio remains fully offline.

## 1. Ownership and layer boundary

X0 owns the only production `AudioContext`, every Web Audio node, the persistent
master graph, synth voice factories, the active/retiring voice registry, fixed
impulse generation, audio-time automation, graph/voice debug evidence, and
page-teardown disposal.

The audio layer may import only domain and playback. It never imports
application, compatibility, persistence, export, or UI. Instrument recipes
contain no document, transport, or component logic. Raw browser contexts,
nodes, parameters, buffers, and periodic waves stay behind
`audio-platform-contract.ts`; they never enter application state, a playback
plan, UI props, or an engine snapshot.

The UI does not call X0. It dispatches an application intent. The application
and transport services serialize that intent and call X0. X0 receives explicit
MIDI pitches and audio-clock times; it does not parse symbols, choose voicings,
read a document, map beats, own a playhead, or run a control-thread timer.

The public source files are:

| File | Authority |
|---|---|
| `src/audio/audio-platform-contract.ts` | narrow injectable browser/fake/offline adapter ports |
| `src/audio/audio-engine-contract.ts` | operations, states, inputs, receipts, refusals, snapshots, ordering, and bounds |
| `src/audio/instrument-recipes-contract.ts` | graph DSP constants, impulse policy, six recipes, pulse, and normalization |
| `src/audio/index.ts` | the only public package barrel |

Only production audio modules may construct Web Audio objects. Fake and real
adapters implement the same narrow ports. Tests may inspect fake logs and
serializable snapshots, never private native nodes.

## 2. Context and engine state

There is zero context before the first explicit Play or Preview. The UI adapter
may create an `AudioUserGestureReceipt` only synchronously inside a trusted
pointer or keyboard handler. Its positive safe-integer sequence is strictly
greater than the last accepted gesture sequence. A receipt is an architectural
handoff, not a claim that plain data can manufacture browser activation.

`initializeAudioEngine()` validates closed state, gesture, sequence, and the
complete initial mix before it calls the injected context factory. It calls
`createContext({latencyHint: "interactive"})` synchronously before its first
`await`, builds the graph synchronously, and then resumes as necessary. Two
initialization calls admitted before the first settles share one pending
operation and resolve with the same graph instance. They never create two
contexts or graphs.

The state machine is:

```text
uninitialized --trusted initialize--> initializing --> ready
                                             |-------> suspended
                                             `-------> fault
ready --browser suspend/interruption-------> suspended
suspended --trusted resume-----------------> resuming --> ready/suspended/fault
ready/suspended/resuming --fatal platform--> fault
fault with no usable context --trusted initialize--> initializing
any nonclosed --page teardown-------------> closed
closed ------------------------------------> closed
```

`ready` means the context reports `running`. `suspended` covers both suspended
and interrupted platform states while retaining the same usable context and
graph. A resume that resolves while the platform remains suspended completes
with a suspended receipt; the caller may present another explicit gesture. A
platform exception or unusable/closed context enters `fault`, retires owned
voices, disconnects partial resources exactly once, and leaves no usable
context. Only a later trusted gesture may create a replacement. A callback
captures its graph instance ID; a callback from an older instance is logged and
ignored.

Ready-state reinitialization returns `reusedExistingGraph: true`. Ordinary
Play, Preview, Stop, Release, seek, pause, progression end, instrument change,
new document, import, mix change, or playback error can never close, replace,
disconnect, or reconnect the context/master graph. `disposeAudioEngine()`
accepts only `page-teardown`, retires everything with a zero ramp, disconnects
once, calls context close once, and makes `closed` terminal.

Initialization and teardown are serialized and noncancellable after admission.
A page teardown arriving during initialization runs after the admitted attempt
settles and then performs terminal cleanup. There is no cancellation callback
that can strand a partially connected graph.

## 3. One persistent graph

The context destination already exists. X0 creates exactly twelve persistent
nodes and thirteen edges once, in this order:

```text
instrument-bus -> dc-block -> low-shelf -> high-shelf
high-shelf -> dry-gain ---------------------------> dynamics
high-shelf -> reverb-send -> convolver -> reverb-return -> dynamics
dynamics -> soft-clip -> safety-gain -> master-gain -> destination
```

| Node | Exact initial settings |
|---|---|
| `instrument-bus` | gain 1 |
| `dc-block` | high-pass, 24 Hz, Q 0.707 |
| `low-shelf` | low shelf, 180 Hz, +1.5 dB |
| `high-shelf` | high shelf, 6,000 Hz, -1 dB |
| `dry-gain` | gain 1 |
| `reverb-send` | `reverbAmount * 0.28`, never above 0.28 |
| `convolver` | one fixed impulse, `normalize = true` |
| `reverb-return` | gain 1 |
| `dynamics` | threshold -18 dB, knee 18 dB, ratio 4, attack 0.006 s, release 0.18 s |
| `soft-clip` | 4,097-point `tanh(1.5*x)/tanh(1.5)` curve, `2x` oversampling |
| `safety-gain` | gain 0.9 |
| `master-gain` | current bounded master-volume setting |

The compressor is a conservative dynamics stage, never a brick-wall limiter.
The soft curve, voice normalization, safety gain, automated render bounds, and
human listening collectively provide the safety margin; no UI or documentation
may make a mastering-quality claim.

All progression, section, and preview voices connect their final per-voice gain
to `instrument-bus`. Reverb amount zero mutes only the wet send; it does not
disconnect nodes. Instrument selection changes only the factory used for future
voices. Already sounding voices retain their original recipe through release.

`setAudioMix()` captures `currentTime` once, validates both fields atomically,
holds the current master/send values, and linearly ramps to the new values over
0.015 seconds. It uses `cancelAndHoldAtTime` when present. The fallback evaluates
the declared analytic automation value, calls `cancelScheduledValues`, and
sets that held value at the same time before the ramp. Reading a possibly stale
`AudioParam.value` is not the fallback oracle.

## 4. Fixed project-authored impulse

The impulse is generated once per graph into a two-channel `AudioBuffer`. It is
project code under the project license, not a recording or third-party asset.
It uses no fetch, decode, sample package, CDN, telemetry, clock, or random API.

Algorithm `changes.audio.impulse.hall-quartic-q15.v2` (2026-07-28 "hall v2"
amendment, bead jcpe-6veb: the v1 two-second white-noise/quadratic impulse
sounded metallic; v2 is a longer, lowpass-colored, quartic-decay hall with a
20 ms predelay) uses seed `0x58403031`, four seconds, and the context sample
rate. Sample rates are finite integers in 8,000...192,000 Hz.
`predelayFrames = floor(sampleRate / 50)`. For every frame, visit left then
right; each channel keeps two persistent integer one-pole lowpass states
(`lp1`, `lp2`), all starting at 0:

```text
state ^= state << 13
state ^= state >>> 17
state ^= state << 5
state = uint32(state)

noise       = (state >>> 16) - 32768
lp1         = lp1 + trunc(6000 * (noise - lp1) / 32768)
lp2         = lp2 + trunc(6000 * (lp1 - lp2) / 32768)
envelopeQ15 = 0 when frameIndex < predelayFrames, else
              trunc((frameLength - frameIndex)^4 * 32767 / frameLength^4)
sampleQ15   = trunc(lp2 * envelopeQ15 / 32768)
sampleFloat = sampleQ15 / 32768
```

The quartic envelope must be computed with exact big-integer arithmetic:
`(frameLength - frameIndex)^4` overflows IEEE doubles. The PRNG and both
lowpass stages advance on every frame including the predelay; only the
envelope silences the head.

At 48,000 Hz the buffer has 192,000 frames and 960 predelay frames. Interleaved
signed-int16 little-endian reference bytes hash to
`ee0449f080bc31f1a9710ec7a316e8e34fb7979421f1a56c6ffd55b667df2017`.
The left/right hashes, eight checkpoints, peak, and final PRNG state are frozen
in `impulse-golden.json`. The validator independently recomputes this integer
oracle; production impulse code is never imported.

## 5. Six honest recipes

All components of an additive recipe sum to 1. FM's modulator routes only to the
carrier frequency parameter. A recipe filter is a per-voice low-pass before the
voice's final envelope/tremolo gain and persistent instrument bus. The graph EQ
is separate and remains fixed.

| Recipe | Sources | Level | Nonreleasing cap | Amplitude A/D/S/R | Filter start/peak/sustain, Q, decay |
|---|---:|---:|---:|---|---|
| Mellow Keys | triangle 1x .78; sine 2x .16; sine 3x .06 | .62 | 64 | .008/.42/.22/.55 | 2100/5200/2100 Hz, .7, .45 s |
| FM Electric Piano | sine carrier 1x; sine modulator 2x +3 cents | .48 | 48 | .003/.85/.14/.9 | 4200/9000/4200 Hz, .5, .6 s |
| Vibraphone | sine 1x .88; sine 4x .12; sine transient 7x .1; tremolo LFO | .5 | 48 | .002/1.4/.45/1.1 | 7000/12000/7000 Hz, .3, .25 s |
| Warm Pad | saws at -7/+7 cents .34 each; triangle .32 | .3 | 32 | .32/1.2/.72/1.8 | 900/2800/1600 Hz, .8, 1.4 s |
| Analog Poly | saw -4 cents .48; 25% pulse +4 cents .36; sine sub .5x .16 | .34 | 48 | .012/.3/.52/.65 | 700/4800/1300 Hz, 4.2, .32 s |
| Concert Grand | one rendered PCM buffer source (embedded project DSP) | .85 | 64 | .002/0/1/.2 | 16000/16000/16000 Hz, .5, .1 s |

FM peak/sustain indices are 3.2/.55 over .65 seconds. Velocity linearly maps its
index multiplier from .55 at velocity 1 to 1 at velocity 127. Vibraphone's
transient decays over .018 seconds; tremolo is 5.8 Hz, depth .16, delayed .12
seconds. The nonboosting tremolo multiplier has range `1-depth...1` and ramps
to full depth over .01 seconds after the delay.

The 25% pulse is a real 32-harmonic periodic wave with DC coefficient zero,
normalization enabled, cosine coefficient
`sin(2*pi*n*duty)/(pi*n)`, and sine coefficient
`(1-cos(2*pi*n*duty))/(pi*n)` for harmonics 1...32.

The independently authored recipe file is the exhaustive value authority. A
recipe's label claims only the declared synthetic design; it does not claim a
sampled brand, acoustic model, analog circuitry, or mastering behavior.

### 5.1 Concert Grand rendered recipe (additive amendment, 2026-07-28)

Concert Grand is a rendered deterministic PCM instrument. The embedded
project-owned wasm DSP module (`changes.dsp.concert-grand@1`, two channels,
at most 8 render seconds per note) deterministically synthesizes inharmonic
partials, unison detuning, dual-rate decay, and hammer noise; no sample,
network, or third-party asset is involved. A rendered voice schedules exactly
one `AudioBufferSourceNode` and keeps the uniform source → filter → gain →
bus per-voice topology. Its recipe amplitude carries only a click-guard
attack (.002 s) and the damper release (.2 s) because the buffer's own decay
is the musical envelope, and its flat 16 kHz low-pass preserves the shared
filter stage without coloring the render. Rendered buffers live in a
per-note LRU cache bounded at 96 entries. The eighth public operation,
`prepareRenderedAudioVoices()`, warms that cache so the synchronous attack
path finds every buffer ready; an attack that misses the cache still
succeeds by rendering synchronously. An engine whose renderer module failed
to load refuses rendered work with `audio.renderer_unavailable` while every
oscillator recipe keeps working.

### 5.2 Flute, Organ, and Guitar additive recipes (additive amendment, 2026-08-05)

The reviewed recipe set grows from six to nine recipes. The §5 table remains
the historical record of the original six and is not rewritten; the three
additive recipes below are appended to the reviewed recipe authority after
Concert Grand. Every additive law keeps holding: each recipe's oscillator
component levels sum to exactly 1, every release is at most 1.8 seconds, and
each voice schedules at most seven sources. Every label claims only its
declared synthetic design.

| Recipe | Sources | Level | Polyphony | Amplitude A/D/S/R | Filter start/peak/sustain, Q, decay |
|---|---|---:|---:|---|---|
| Flute | sine 1x .78; sine 2x .13; sine 3x .06; sine 4x .03; sine transient 6x .06; tremolo LFO | .52 | 32 | .05/.25/.68/.35 | 3200/5600/3200 Hz, .5, .3 s |
| Organ | sine 1x .36; sine 2x .24; sine 3x .18; sine 4x .13; sine 6x .09; tremolo LFO | .44 | 48 | .012/.08/.92/.14 | 7500/9500/7500 Hz, .4, .1 s |
| Guitar | saw -3 cents .6; saw +3 cents .4; sine transient 5x .12 | .5 | 48 | .002/1.5/.05/.5 | 5200/7800/1400 Hz, 1.1, 1 s |

Flute is additive sine partials with a soft breath onset and delayed vibrato:
its transient decays over .03 seconds and its nonboosting tremolo is 5 Hz,
depth .09, delayed .28 seconds. Organ is additive drawbar sine partials with
a shallow sustained vibrato: no transient, tremolo 6 Hz, depth .07, delayed
.08 seconds. Guitar is the plucked decay of two detuned saws through a
closing lowpass, with a short pick transient that decays over .012 seconds
and no tremolo.

The independently authored recipe fixture carries the same literals plus
normalization reference gains for each new recipe at voice counts 1, 4, 7,
and 16, and the listening rubric grows three human rows,
X0-LISTEN-INST-007 through X0-LISTEN-INST-009. At this amendment date the
reviewed render matrix retains its eighteen rows: the three new recipes do
not yet own real-browser offline render rows, so their browser certification
is pending the next X0 evidence run, and until those rows are reviewed the
X0 contract validator reports the missing three render rows per new recipe.

### 5.3 Upright Bass and Concert Vibes sampled rendered recipes (additive amendment, 2026-08-06)

The reviewed recipe set grows from nine to eleven recipes, and the reviewed
rendered set grows from one to three. The §5 table and the §5.1/§5.2
amendments remain the historical record and are not rewritten. The two
recipes below are appended to the reviewed recipe authority after Guitar.

| Recipe | Sources | Level | Polyphony | Amplitude A/D/S/R | Filter start/peak/sustain, Q, decay |
|---|---|---:|---:|---|---|
| Upright Bass | one rendered PCM buffer source (embedded recorded pizzicato) | .5 | 32 | .002/0/1/.25 | 16000/16000/16000 Hz, .5, .1 s |
| Concert Vibes | one rendered PCM buffer source (embedded recorded vibraphone) | .42 | 48 | .002/0/1/1.1 | 16000/16000/16000 Hz, .5, .1 s |

Both are sampled rendered instruments: deterministic PCM read from embedded,
pitch-verified CC0 recordings (VSCO 2 CE solo contrabass pizzicato;
Versilian Community Sample Library vibraphone, soft mallets) through the
pure synchronous Catmull-Rom renderer `src/audio/sampled-renderer.ts`
(`changes.dsp.sampled-upright-bass@1`, `changes.dsp.sampled-vibraphone@1`,
two channels, at most 4 render seconds per note, cache bound 64). Nearest
recorded key wins with ties to the higher key; the recorded tuning deviation
is folded into the playback ratio so output lands exactly on 12-TET; a pitch
outside the recorded span transposes from the nearest edge key, so every
in-contract request renders. Velocity shapes level only, at the voice gain,
exactly as for oscillator recipes — identical PCM per velocity band is what
lets the render cache share buffers. Like Concert Grand, a rendered voice
schedules exactly one `AudioBufferSourceNode`, keeps the uniform
source → filter → gain → bus topology, and carries only a click-guard
attack and the instrument's release in its recipe amplitude.

The honesty law is refined, not weakened, for sampled recipes: a label and
design claim must state what the sound actually is. A sampled recipe's claim
says "recorded"; it does not claim synthesis it does not perform, a
commercial brand, or mastering behavior. (Concert Grand's claim remains
"deterministic rendered piano" for its synthesized sustain; its recorded
attack layer is declared in the §5.1 amendment and the architecture
document.) The §5 rule that exactly one reviewed rendered recipe exists is
superseded: the rendered recipes are reviewed as a list, each pinned
literal-by-literal against the recipe fixture.

The independently authored recipe fixture carries the same literals plus
normalization reference gains for both new recipes at voice counts 1, 4, 7,
and 16; the listening rubric grows two human rows, X0-LISTEN-INST-010 and
X0-LISTEN-INST-011; and the reviewed render matrix grows six rows,
X0-RENDER-028 through X0-RENDER-033, following the Concert Grand
single-note / dense-seven / release-tail pattern. `X0-LIFE-046`'s
failed-renderer law is unchanged and remains stated against the wasm
renderer: the sampled renderers are synchronous checked-in TypeScript with
no instantiation step, so a load failure lane specific to them does not
exist; a corrupt payload throws at first render and the engine's existing
`audio.renderer_unavailable` refusal covers it.

### 5.4 Waveguide Guitar, Blues Guitar, and Flute (physical-model amendment, 2026-08-06)

Owner direction: the additive Guitar and Flute recipes did not meet the
quality bar. Both are superseded by first-principles physical models in the
embedded wasm DSP module (the same payload as Concert Grand), and a second
guitar voicing joins the set, growing the reviewed recipes from eleven to
twelve and the rendered set from three to six. The additive recipe rows in
§5/§5.2 remain the historical record.

| Recipe | Model | Level | Polyphony | Amplitude A/D/S/R |
|---|---|---:|---:|---|
| Guitar | plucked waveguide → clean archtop amp (`changes.dsp.waveguide-guitar-clean@1`) | .5 | 48 | .002/0/1/.35 |
| Blues Guitar | the same waveguide → driven amp with cab voicing (`changes.dsp.waveguide-guitar-drive@1`) | .46 | 48 | .002/0/1/.35 |
| Flute | jet-drive waveguide (`changes.dsp.waveguide-flute@1`) | .5 | 32 | .002/0/1/.3 |

The guitar is an extended Karplus-Strong digital waveguide: velocity-shaped
pluck excitation with a pick-position comb, two coupled string
polarizations (energy-exchanging bridge coupling bounded by the loop's loss
headroom — additive coupling measurably diverged), frequency-dependent
damping, dispersion allpasses on wound-string registers, a fractional
tuning allpass, and an eight-mode archtop body bank, rendered through one
of two amp chains (a barely-driven dark clean chain; a pre-emphasized hot
tanh stage into a cab bandpass with a presence peak). The flute is a
jet-drive waveguide: a bore delay behind a lowpass end reflection, a
half-period air jet through the offset cubic nonlinearity `x·(x²−1)`,
breath pressure with turbulence noise and delayed vibrato, and a
differentiated radiation output. Both models' tuning is verified by the
render-and-measure harness (guitar within ±1 cent; flute within a few
cents after its measured jet-participation calibration), both are
deterministic per (pitch, velocity, rate, profile), and both carry their
own musical envelopes so their recipes keep only the click-guard attack
and release, the flat filter, and one buffer source per voice.

The render matrix grows three Blues Guitar rows (X0-RENDER-034…036) and
the existing Guitar/Flute rows re-pin their expected source counts to the
rendered law (one buffer source per voice); the listening rubric rewrites
the Guitar and Flute rows for the physical models and adds
X0-LISTEN-INST-012 for Blues Guitar.

### 5.5 Clarinet (physical-model amendment, 2026-08-06)

The waveguide machinery generalizes: the clarinet reuses the flute's
delay-line architecture with the two physical substitutions that define the
instrument — a **closed-open bore** (the delay is half a period with an
inverting open-end reflection, which is why the spectrum is
odd-harmonic-dominant and the instrument sounds an octave below a flute of
its length) and a **reed valve** (the STK-family reed table
`r = clamp(0.7 − 0.3·Δp)` in place of the air jet; its saturation is the
harmonic source and brightens with breath exactly as a harder-blown
clarinet does). Breath dynamics, turbulence, delayed vibrato, the
rate-compensated in-loop DC blocker, the analytic reflection phase
compensation, and a measured loop-participation calibration (cubic fit,
in-register residuals within ±9 cents at 44.1/48/96 kHz) all carry over.
An oboe was considered and deferred: its conical bore is not honestly
approximated by cylindrical machinery.

The reviewed recipe set grows to thirteen (`clarinet`, rendered,
`changes.dsp.waveguide-clarinet@1`, level .48, polyphony 32, amplitude
.002/0/1/.3, flat filter), the render matrix to thirty-nine
(X0-RENDER-037…039), and the listening rubric gains X0-LISTEN-INST-013.

## 6. Parameter automation and normalization

An accepted batch contains 1...16 generated voices. Its normalization gain is
calculated once from its original batch size and retained by every voice:

```text
normalizationGain = recipe.outputLevel / sqrt(originalBatchVoiceCount)
velocityGain      = pow(velocity / 127, 1.5)
peakGain          = normalizationGain * velocityGain
```

Velocity is an integer 1...127. A later steal or cleanup does not renormalize
remaining voices and create an audible jump.

For each ordinary voice, scheduling uses only audio-clock automation:

1. amplitude is zero at start, linearly reaches `peakGain` over attack, then
   linearly reaches `peakGain*sustain` over decay;
2. filter frequency starts at the recipe start value, linearly reaches peak over
   amplitude attack, then exponentially reaches sustain over filter decay;
3. FM index starts at its velocity-scaled peak and exponentially reaches its
   velocity-scaled sustain over the modulator decay;
4. a transient starts at its normalized component peak and linearly reaches zero
   over its declared decay;
5. tremolo remains unity until its delay and then applies its nonboosting sine;
6. natural note-off holds the analytic current value and linearly reaches zero
   over the recipe release;
7. a forced note-off uses the exact reason ramp instead;
8. sources stop at release end plus .02 seconds and disconnect exactly once.

All positive exponential targets remain positive. Zero targets use linear ramps.
No `setTimeout`, interval, promise delay, animation frame, or anonymous delayed
callback initiates attack, release, reconnection, or cleanup.

The quietest-voice estimate samples the same analytic amplitude envelope at the
single `currentTime` captured for steal planning. Before start and after release
it is zero. Attack is linear from zero to peak; decay linearly interpolates peak
to sustain; sustain is constant; release linearly interpolates the held value to
zero. NaN or infinity is an invariant failure, never a sortable value.

## 7. Attack batch and refusal atomicity

`attackAudioVoices()` accepts one owner, event ID, instrument, start/release
time, and a nonempty voice tuple. It captures `currentTime` once and validates in
this exact order:

1. engine is ready;
2. owner kind, positive safe-integer generation, and preview ID where applicable;
3. event ID;
4. exact domain instrument ID;
5. finite start in `currentTime...currentTime+0.25`, inclusive;
6. finite release and gate in 0.005...600 seconds, inclusive;
7. batch count 1...16;
8. ASCII voice IDs and within-batch duplicates;
9. integer MIDI pitches 0...127;
10. integer velocities 1...127;
11. owner/recipe/global/retained-tail feasibility.

IDs match `^[A-Za-z0-9][A-Za-z0-9._:-]*$` and contain no more than 128 ASCII
bytes. Generations and sequences are positive safe integers. Every field is
runtime-validated even when TypeScript narrows it.

Validation, retrigger discovery, steal selection, retained-cap calculation, and
all receipt arrays complete before the first node, parameter event, registry
write, or old-voice mutation. Refusal adds only one bounded sanitized debug
event and cumulative deterministic work counts. It cannot partially attack,
retire, steal, change mix, or change graph state.

A voice ID that collides with unrelated ownership/event/pitch refuses. Reusing
an ID for an exact retrigger is allowed; the voice-ID index maps to instance
tokens, so the old releasing instance and new sounding instance remain fully
discoverable until old cleanup.

## 8. Voice lifecycle and registry

Every accepted voice receives a positive monotonic instance token and stores:

- voice ID, owner, generation, event, instrument, MIDI pitch, and velocity;
- original batch count, normalization gain, and velocity gain;
- recipe and every source/node it created;
- start, natural release, effective release, release duration, stop, and cleanup
  deadline times;
- per-source ended status and a one-way cleanup flag.

The snapshot phase is `scheduled` before start, `attacking` through attack and
decay, `sustaining` afterward, and `releasing` at/after effective release. A
cleaned voice is absent. If a forced release precedes a future attack, every
source receives a stop time at or before its start time, so it cannot become
audible. The retirement receipt's `noFutureAttackPostcondition` is true only
after those stop calls and registry state are committed.

The registry stores each retained instance in six indexes:

| Index | Key |
|---|---|
| voice | voice ID -> set of instance tokens |
| generation | owner kind + generation |
| event | exact owner + event ID |
| pitch | exact owner + MIDI pitch |
| owner | exact progression or preview owner identity |
| instrument | instrument ID |

Selectors retire voice IDs, exact owner/event, exact owner/pitch, owner-kind
generation, exact preview, exact owner, or all. Matching tokens are sorted by
voice ID then instance token before mutation and receipts. Unknown selectors
complete as an empty idempotent retirement. A second retirement reports an
already-releasing voice without scheduling a second stop or disconnect.

Each scheduled source has a named token-checked `onended` callback. When all
sources for that exact instance have ended, cleanup removes its six references
and disconnects owned nodes once. A duplicate callback is inert. A late callback
whose `(graphInstanceId, voiceId, instanceToken)` no longer names the current
instance cannot remove or disconnect anything newer.

Natural release removes every voice by at most eight seconds after note-off;
the recipe release and source padding are much shorter, while the eight-second
deadline remains a hard tested ceiling. The persistent graph and convolver tail
may remain after the voice registry becomes empty.

## 9. Retrigger and polyphony

Before a batch creates new nodes, exact existing owner/event/MIDI matches are
marked for `note-retrigger` release. At equal audio times the old release
parameter and stop scheduling occur before any new source `start()` call. A
different pitch, event, generation, preview ID, or owner is a near miss and is
not retriggered.

Nonreleasing caps are 48 progression voices, 16 preview voices, each recipe's
cap, and 64 globally. Releasing tails do not consume an admission slot, but
remain audibly owned in the registry. The registry retains at most 128 total voices, 896 scheduled
sources, and 768 index references. If the complete new batch would exceed the
retained-tail cap, it refuses atomically with
`audio.retiring_voice_capacity`; it never drops an undiscoverable tail or
silently hard-cuts a voice.

Caps are enforced in this order: retrigger retirement, owner-kind cap, recipe
cap, global cap, retained-tail cap, then new creation. Each cap selects only
eligible nonreleasing voices in its affected group and never selects one
instance twice. A releasing tail is not a victim candidate: releasing it again
cannot reduce the nonreleasing admission deficit, and it remains owned until
its exact sources finish. Victims use one captured selection time and this
ascending tuple:

1. exact incoming owner before other owners;
2. lower finite estimated envelope gain;
3. earlier attack time;
4. voice ID by UTF-16 code-unit order;
5. instance token.

Victims enter the .02-second `voice-steal` release before new attacks are
scheduled. Progression and preview caps therefore remain true for nonreleasing
voices while release tails remain owned and bounded.

Forced release durations are exact:

| Reason | Seconds |
|---|---:|
| preview release | .04 |
| voice steal | .02 |
| generation retirement | .012 |
| all notes off | .012 |
| note retrigger | .012 |
| page teardown | 0 |

Natural note-off uses the recipe release. Starting a new preview first retires
the prior preview through the preview selector. Preview-only Release cannot
change progression voices, document state, selection, insertion, range, or
playhead. Global Stop is an X1 operation that invokes X0 retirement for both
owner kinds and relies on the no-future-attack receipt.

## 10. Diagnostics, work, and memory bounds

Snapshots contain only immutable data. They expose state, graph instance,
platform state/sample rate, mix, retained/nonreleasing/releasing and owner-kind
nonreleasing counts, voices, six index counts, graph counts, the bounded debug ring,
dropped-event count, and cumulative work counters. They never expose a native
object or exception.

Voices sort by voice ID then instance token. Debug events use a positive
monotonic safe-integer sequence and retain the newest 4,096; eviction increments
`debugEventsDropped`. The detail code is a stable bounded code, not browser
exception text. Graph, voice, and debug sequences may never wrap; exhaustion
faults/refuses with `audio.internal_sequence_exhausted`.

Work counters cover operation starts, graph nodes/edges, impulse writes, batch
and voice validation, retrigger/retirement/steal examination, voice/source
creation, registry reads/writes, parameter events, and cleanup callbacks. They
are monotonic safe integers. Elapsed wall time is performance evidence only and
is never a musical cutoff, search cutoff, cleanup trigger, or reason to alter a
result.

| Resource | Hard maximum |
|---|---:|
| nonreleasing voices | 64 |
| retained nonreleasing + releasing voices | 128 |
| progression nonreleasing voices | 48 |
| preview nonreleasing voices | 16 |
| voices in one batch | 16 |
| source nodes per voice | 7 |
| retained source nodes | 896 |
| registry index references | 768 |
| persistent created nodes / edges | 12 / 13 |
| impulse scalar samples / Float32 bytes | 1,536,000 / 6,144,000 |
| soft-clip curve points | 4,097 |
| debug events retained | 4,096 |
| schedule lookahead accepted by X0 | .25 seconds |
| gate | .005...600 seconds |
| recipe release | at most 1.8 seconds |
| natural cleanup after release | at most 8 seconds |

## 11. Independent proof contract

The main manifest byte-binds ten companions. The validator imports no production
audio code and checks exact schemas, counts, identities, limits, topology,
recipes, normalization references, impulse integer output, lifecycle and
registry witnesses, render matrix, listening honesty, provenance, trace links,
and thirty-one semantic mutations (2026-07-28 amendment: the thirty-first
control targets the rendered recipe).

The future X0 implementation must pass:

- fake-adapter topology, scheduling, state, registry, ordering, and cleanup
  tests;
- real OfflineAudioContext renders for all eighteen matrix rows, including
  finite/non-silent output, onset, release/tail decay, peak/RMS, dense seven-note
  safety, zero NaN/infinity/unity clipping, source counts, and impulse identity;
- supported real-browser AudioContext state, gesture, graph bookkeeping, and
  console-cleanliness tests;
- one hundred attack/Stop/cleanup cycles with one graph, empty final registry,
  no stale attacks, and no duplicate disconnect;
- exact executable refusal and boundary proof for every reviewed lifecycle,
  registry, routing, work, and memory limit; a static constant is not runtime
  evidence for a named boundary case;
- manual listening in Chromium, Firefox, and WebKit/Safari where supported, on
  headphones and laptop speakers, using every required record field.

The reviewed render analysis is stereo at master volume `0.8`. Frame count is
`ceil(sampleRate * renderDuration)`. Peak, finite-value, clipping, and RMS
measurements visit all channels for each frame in ascending channel order. The
active RMS window is `[start, release)`; early-tail RMS covers the first 0.5
seconds after release; final-tail RMS covers the final 0.5 seconds without
crossing before release. Onset is the first frame whose absolute value on any
channel is strictly greater than the reviewed threshold. Tail decay compares
RMS values without division, so an exactly silent final window remains valid
JSON. Rendered PCM hashes are diagnostics and are not required to agree across
browser DSP implementations. Impulse identity uses interleaved signed-int16
little-endian Q15 bytes: 48 kHz binds the reviewed hash and other sample rates
bind an independent replay of the reviewed integer algorithm.

Automation never claims to hear. An unsupported browser capability is recorded
with browser version, exercised through the declared fallback where possible,
and completed manually; it is never silently skipped or marked passing. The
specification leaf validates the rubric but does not pretend the release
listening session has already occurred.

## 12. Implementation handoff and forbidden shortcuts

Production implementation will provide `createAudioEngine(platform)` and the
eight public operations (the 2026-07-28 amendment appends
`prepareRenderedAudioVoices`, whose unavailable-renderer path refuses with
`audio.renderer_unavailable`) without broadening the public platform ports. Before
claiming X0 complete, an implementer must prove every trace in
`trace-ledger.json`, including L-AUDIO-02 at
`tests/integration/audio-routing.test.ts` under evidence heading
`audio/routing`.

The following are contract violations even if a smoke test emits sound:

- a second ordinary context or graph, or ordinary close/disconnect/reconnect;
- a voice, section, or preview path that bypasses recipe filter, EQ, reverb
  policy, dynamics, soft clip, safety, or master;
- direct voice-to-destination connection or duplicated graph edge;
- an anonymous timer/delayed callback that can attack, release, reconnect, or
  clean up audio;
- describing the compressor as a limiter or making a mastering claim;
- runtime fetch, sample, decode, CDN, remote font, telemetry, model, prompt, or
  other network dependency;
- cleanup keyed only by voice ID or generation, allowing an old callback to
  remove a new instance;
- removing releasing voices from ownership before their sources end;
- silently repairing IDs/times/pitches, partially accepting a batch, random
  stealing, or wall-time cutoffs;
- generating goldens from production output or substituting mocks for required
  OfflineAudioContext, real-browser, or human evidence.
