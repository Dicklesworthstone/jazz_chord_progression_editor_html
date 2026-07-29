/**
 * The band-sketch performance compiler (bead jcpe-1gao).
 *
 * `compilePerformancePlan` is pure, deterministic and bounded: same plan and
 * style in, byte-identical events out, with no clock, no randomness, no
 * ambient input and no float anywhere in musical time. It reads a compiled P0
 * plan and returns another P0-shaped plan whose `events` array is a
 * performance of the same chart.
 *
 * What it emits, per source chord event:
 *
 *  - a BASS voice, transposed into `PERFORMANCE_BASS_REGISTER` (MIDI 28..48),
 *    sounding a chord tone the source event actually contains, placed at the
 *    style's bar-relative bass slots plus always at the event's own start;
 *  - COMP stabs at the style's bar-relative offsets, sounding the source
 *    event's own voicing — its top `PERFORMANCE_COMP_TARGET_VOICES` voices for
 *    an `upper-voices` slot — octave-transposed as a whole into the style's
 *    comping register, plus always one at the event's own start;
 *  - a velocity contour taken from the frozen style table and eased per bar by
 *    the style's bar-cycle accent;
 *  - a RELEASE: every slot's length comes from the table and every clipped
 *    length keeps `PERFORMANCE_RELEASE_GAP_TICKS` of air before the next
 *    attack of its own role, so notes stop rather than smear.
 *
 * Two style levers shape the result, both of them frozen data and both of them
 * integer arithmetic:
 *
 *  - the BAR CYCLE. A bar's phase is its written measure index modulo the
 *    style's `barCycleLength`, and a slot sounds only in the phases it names.
 *    The index comes from the same measure-boundary walk the bar grid uses, so
 *    the pattern cannot drift out of step with the chart.
 *  - SWING. A slot offset that sits exactly halfway through its beat is moved
 *    to `beatStart + round(beatTicks * swingRatio)`. On-beat offsets never
 *    move, so a style declaring the straight 1/2 ratio compiles to the same
 *    ticks it did before swing existed.
 *
 * Three laws hold by construction rather than by hope:
 *
 *  1. Every emitted event satisfies what X1 validates structurally — ascending
 *     start ticks, positive durations, a legal id, 1..16 MIDI pitches, and
 *     `startTick + durationTicks <= totalTicks`. A final self-check re-proves
 *     this before the plan is returned and refuses rather than emit a plan the
 *     transport would reject.
 *  2. No two events of the same role overlap: every emitted event is clipped
 *     to the next start of its own role, to its source event's end, and to the
 *     plan total.
 *  3. Every source chord STATES ITSELF when it arrives: a bass note and its own
 *     voicing both sound at the event's own start tick, whatever the style's
 *     bar-relative offsets happen to be. Slot offsets are bar-relative, so a
 *     chord beginning mid-bar reaches none of the offset-0 slots; without this
 *     law such a chord would never sound its harmony at all. It states the
 *     chord ONCE: where the table already declares a slot on that tick, the
 *     declared slot is the statement and nothing is added.
 *  4. Every comp sits in the style's comping register and clears the bass note
 *     under it by a major third (`placeCompInRegister`). The document's voicing
 *     policy scores candidates for voice leading, which is a relative law, so
 *     absolute register wanders between chords; this layer fixes the register
 *     without touching a single written pitch class or spelling.
 *
 * A refusal here is never fatal. The application falls back to the literal P0
 * plan, so playback can never fail *because* the performance layer exists.
 */
import {
  MIDI_PPQ,
  beatValueToMidiTicks,
  makeBeatDuration,
  makeBeatPosition,
  makeMidiPitch,
  makeSpelledPitch,
  measureCapacity,
  parseStableId,
  type BeatDuration,
  type BeatPosition,
  type ChordEventId,
  type MidiPitch,
  type NonEmptySpelledPitches,
  type SpelledPitch,
} from "../../domain";
import {
  PLAYBACK_EVENT_SCHEMA,
  type PLAYBACK_PLAN_FIXED_VELOCITY,
  PLAYBACK_PLAN_MINIMUM_GATE_TICKS,
  PLAYBACK_PLAN_RELEASE_GAP_TICKS,
  type NonEmptyMidiPitches,
  type PlaybackEvent,
  type PlaybackPlan,
} from "../playback-plan-contract";
import {
  MAX_PERFORMANCE_PLAN_BARS_VISITED,
  MAX_PERFORMANCE_PLAN_EVENTS,
  MAX_PERFORMANCE_PLAN_SLOTS_CONSIDERED,
  MAX_PERFORMANCE_PLAN_SOURCE_EVENTS,
  PERFORMANCE_BASS_REGISTER,
  PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES,
  PERFORMANCE_COMP_MAX_SPAN_SEMITONES,
  PERFORMANCE_COMP_MIN_WIDTH_VOICES,
  PERFORMANCE_COMP_TARGET_VOICES,
  PERFORMANCE_RELEASE_GAP_TICKS,
  PERFORMANCE_ROLE_ID_SUFFIXES,
  PERFORMANCE_STYLES,
  type CompilePerformancePlanFailure,
  type CompilePerformancePlanRequest,
  type CompilePerformancePlanResult,
  type ExactBeats,
  type PerformanceBassPlacement,
  type PerformanceBassTone,
  type PerformanceCompRegister,
  type PerformanceCompVoicing,
  type PerformanceCyclePhases,
  type PerformancePlanRefusalCode,
  type PerformancePlanTermination,
  type PerformancePlanWorkEvidence,
  type PerformanceRole,
  type PerformanceStyle,
  type PerformanceStyleId,
  type PerformanceSwingRatio,
} from "./performance-plan-contract";

/** The largest MIDI pitch count X1 accepts on one event. */
const MAX_EVENT_PITCHES = 16;

/** Octave shifts searched when placing a bass note; 28..48 spans under two. */
const MAX_BASS_OCTAVE_SHIFT = 10;

type Counters = {
  sourceEventsVisited: number;
  barsVisited: number;
  slotsConsidered: number;
  eventsProduced: number;
};

function evidence(
  counters: Counters,
  termination: PerformancePlanTermination,
): PerformancePlanWorkEvidence {
  return Object.freeze({
    sourceEventsVisited: counters.sourceEventsVisited,
    barsVisited: counters.barsVisited,
    slotsConsidered: counters.slotsConsidered,
    eventsProduced: counters.eventsProduced,
    termination,
  });
}

function refuse(
  styleId: PerformanceStyleId,
  code: PerformancePlanRefusalCode,
  eventId: string | null,
  detail: string,
  counters: Counters,
  termination: PerformancePlanTermination,
): CompilePerformancePlanFailure {
  return Object.freeze({
    ok: false,
    refusal: Object.freeze({ code, styleId, eventId, detail }),
    evidence: evidence(counters, termination),
  });
}

/**
 * Exact rational beats to integer ticks at PPQ 960. Returns null when the
 * value is not tick-integral, which every frozen table entry is; the guard
 * exists so a future table cannot introduce a rounded beat by accident.
 */
function ticksFromExactBeats(beats: ExactBeats): number | null {
  if (!Number.isSafeInteger(beats.numerator)) return null;
  if (!Number.isSafeInteger(beats.denominator)) return null;
  if (beats.denominator <= 0) return null;
  if (beats.numerator < 0) return null;
  const scaled = beats.numerator * MIDI_PPQ;
  if (scaled % beats.denominator !== 0) return null;
  return scaled / beats.denominator;
}

/**
 * Integer floor division, exact for negative dividends too. `(a - a % b) / b`
 * truncates toward zero and is therefore wrong below zero; a malformed source
 * plan must still produce integers rather than a float bar index.
 */
function floorDivide(dividend: number, divisor: number): number {
  const remainder = ((dividend % divisor) + divisor) % divisor;
  return (dividend - remainder) / divisor;
}

/** Non-negative remainder, so a phase index is never negative. */
function floorModulo(dividend: number, divisor: number): number {
  return ((dividend % divisor) + divisor) % divisor;
}

/**
 * `round(numerator / denominator)` for non-negative inputs, half rounded up,
 * computed without ever producing a fraction. Swing is the one place a ratio
 * meets the tick grid, and a float there is a value that can differ between
 * engines; this keeps the whole path on integers.
 */
function roundedDivide(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Displace an offbeat eighth by the style's swing ratio.
 *
 * "Offbeat eighth" means exactly what it says: an offset whose position inside
 * its own beat is exactly half a beat. Such an offset is replaced by
 * `beatStart + round(beatTicks * swingRatio)`. Every other offset — on the
 * beat, on a sixteenth, on a triplet — is returned untouched, so swing can
 * never quietly re-time a slot the style did not mean to swing, and a straight
 * 1/2 ratio is the identity at any beat length that is an even tick count.
 */
function swungOffsetTicks(
  offsetTicks: number,
  beatTicks: number,
  swing: PerformanceSwingRatio,
): number {
  const withinBeat = offsetTicks % beatTicks;
  if (withinBeat * 2 !== beatTicks) return offsetTicks;
  const beatStart = offsetTicks - withinBeat;
  return (
    beatStart + roundedDivide(beatTicks * swing.numerator, swing.denominator)
  );
}

/** True when a slot declares that it sounds in this bar-cycle phase. */
function soundsInPhase(
  phases: PerformanceCyclePhases,
  phase: number,
): boolean {
  for (const declared of phases) {
    if (declared === phase) return true;
  }
  return false;
}

/**
 * Everything about a style table that the slot resolver cannot express: the
 * bar cycle is a positive integer with one velocity offset per phase, every
 * slot names only phases that exist, and the swing ratio is a rational at
 * least straight (1/2) and strictly inside its beat (< 1). A table that fails
 * here is refused rather than rounded into shape.
 */
function styleTableWellFormed(style: PerformanceStyle): boolean {
  const cycle = style.barCycleLength;
  if (!Number.isSafeInteger(cycle) || cycle < 1) return false;
  if (style.barCycleVelocityOffsets.length !== cycle) return false;
  for (const offset of style.barCycleVelocityOffsets) {
    if (!Number.isSafeInteger(offset)) return false;
  }
  const swing = style.swingRatio;
  if (!Number.isSafeInteger(swing.numerator)) return false;
  if (!Number.isSafeInteger(swing.denominator)) return false;
  if (swing.denominator < 1) return false;
  if (swing.numerator * 2 < swing.denominator) return false;
  if (swing.numerator >= swing.denominator) return false;
  for (const slot of [...style.bassSlots, ...style.compSlots]) {
    if (slot.cyclePhases.length === 0) return false;
    for (const phase of slot.cyclePhases) {
      if (!Number.isSafeInteger(phase)) return false;
      if (phase < 0 || phase >= cycle) return false;
    }
    if (!Number.isSafeInteger(slot.velocity)) return false;
  }
  return compRegisterWellFormed(style);
}

/**
 * The comp register's own well-formedness, and it is not decoration: the
 * placement law's termination proof rests on exactly these inequalities.
 *
 *  - the home octave is twelve consecutive semitones and the declared
 *    `highMidi` is the octave above it, so a lifted placement is inside the
 *    range the style publishes;
 *  - `lowMidi + 12` clears the TOP of the bass register by the separation, so
 *    ONE lift is always enough however high the bass line climbs. Without this
 *    a bass near its own ceiling would need two lifts and the comp's register
 *    would swing an octave between adjacent bars. With the measured bass
 *    window and the measured major-third separation the bound is
 *    `lowMidi >= 48 + 4 - 12 = 40`, and both published band sketches (47 and
 *    60) clear it by seven and twenty semitones;
 *  - `highMidi` is at or below `ceilingMidi`, so the lifted placement of a
 *    single voice can never exceed the ceiling and the fallback always has an
 *    answer.
 *
 * A band sketch must declare a register; the identity style must not, because
 * it returns the input plan untouched and has no comping hand to place.
 */
function compRegisterWellFormed(style: PerformanceStyle): boolean {
  const register = style.compRegister;
  if (style.kind === "literal") return register === null;
  if (register === null) return false;
  if (!Number.isSafeInteger(register.lowMidi)) return false;
  if (!Number.isSafeInteger(register.highMidi)) return false;
  if (!Number.isSafeInteger(register.ceilingMidi)) return false;
  if (register.lowMidi < 0 || register.ceilingMidi > 127) return false;
  if (register.highMidi !== register.lowMidi + 23) return false;
  if (register.highMidi > register.ceilingMidi) return false;
  return (
    register.lowMidi + 12 >=
    PERFORMANCE_BASS_REGISTER.highMidi +
      PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES
  );
}

function beatPositionFromTicks(ticks: number): BeatPosition | null {
  const made = makeBeatPosition({ numerator: ticks, denominator: MIDI_PPQ });
  return made.ok ? made.value : null;
}

function beatDurationFromTicks(ticks: number): BeatDuration | null {
  const made = makeBeatDuration({ numerator: ticks, denominator: MIDI_PPQ });
  return made.ok ? made.value : null;
}

/**
 * P0's own articulation formula, applied to the performance slot: release the
 * note a hair before the next attack unless the note is shorter than the gap.
 */
function gateTicksFor(durationTicks: number): number {
  const gap = Math.min(PLAYBACK_PLAN_RELEASE_GAP_TICKS, durationTicks - 1);
  const gate = durationTicks - gap;
  return gate < PLAYBACK_PLAN_MINIMUM_GATE_TICKS
    ? PLAYBACK_PLAN_MINIMUM_GATE_TICKS
    : gate;
}

/**
 * A velocity that is not P0's single fixed value.
 *
 * P0 v1 declares `velocity: "fixed"` and types the field as the literal 96,
 * because the literal renderer has no dynamics to express. A performance does:
 * the whole point of a velocity contour is that the bass downbeat is not the
 * same weight as a comp stab. The values this layer emits stay inside the
 * 1..127 envelope P0's own velocity policy declares and inside the range the
 * audio engine validates, so the plan remains structurally indistinguishable
 * downstream. This is the one place the literal type is widened, and it is
 * widened deliberately rather than by leaking `unknown` through the module.
 */
function performanceVelocity(
  value: number,
): typeof PLAYBACK_PLAN_FIXED_VELOCITY {
  const clamped = value < 1 ? 1 : value > 127 ? 127 : Math.trunc(value);
  return clamped as typeof PLAYBACK_PLAN_FIXED_VELOCITY;
}

type Voice = Readonly<{ spelled: SpelledPitch; midi: number }>;

type ChordTones = Readonly<{
  root: Voice;
  third: Voice | null;
  fifth: Voice | null;
}>;

function pitchClassOfMidi(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/**
 * Read the source event's voices, lowest first.
 *
 * `pitches` and `midiPitches` are index-aligned by P0's own output policy, so
 * the spelled name of every MIDI pitch travels with it and the derived bass
 * note keeps the chart's spelling rather than being renamed enharmonically.
 */
function readVoices(event: PlaybackEvent): readonly Voice[] | null {
  const spelled = event.pitches;
  const midis = event.midiPitches;
  if (spelled.length !== midis.length) return null;
  if (midis.length === 0 || midis.length > MAX_EVENT_PITCHES) return null;
  const voices: Voice[] = [];
  for (let index = 0; index < midis.length; index += 1) {
    const midi = midis[index];
    const name = spelled[index];
    if (midi === undefined || name === undefined) return null;
    if (!Number.isSafeInteger(midi)) return null;
    voices.push(Object.freeze({ spelled: name, midi }));
  }
  return Object.freeze(
    [...voices].sort((left, right) => left.midi - right.midi),
  );
}

/**
 * Derive root, third and fifth from the source event's own pitches.
 *
 * The rule, stated exactly and with its limitation:
 *
 *  - the ROOT is the pitch class of the event's LOWEST sounding pitch. This is
 *    the true harmonic root whenever the voicing was generated with the
 *    studio's default Auto policy (`bassPolicy: "generated"`, which places the
 *    root in the bass) — the case for every chord the quick-entry path can
 *    produce. For a rootless family, a slash-chord bass, or a stored
 *    Manual/Frozen voicing whose lowest note is not the root, this names the
 *    written BASS note instead. That is a real note of the chord as voiced, so
 *    the bass line still doubles something the chart actually sounds; it is
 *    simply not guaranteed to be the symbol's root. `PlaybackEvent` carries no
 *    chord symbol, so no better rule is available inside this layer, and
 *    inventing one would mean guessing.
 *  - the FIFTH is the perfect fifth above the root if the event sounds it,
 *    else the augmented fifth, else the diminished fifth, else none. An
 *    altered-dominant or #5 voicing therefore contributes its own #5 rather
 *    than a natural fifth the chord does not contain.
 *  - the THIRD is the major third if the event sounds it, else the minor
 *    third, else none. Major first, because a minor chord never contains the
 *    major third while a dominant #9 contains both — and under a 7#9 the
 *    guide tone a bass line wants is the major third, not the #9.
 *
 * Every returned tone is one of the event's own voices, so a bass note can
 * never be a pitch class the written chord does not sound.
 */
function deriveChordTones(voices: readonly Voice[]): ChordTones | null {
  const root = voices[0];
  if (root === undefined) return null;
  const rootClass = pitchClassOfMidi(root.midi);
  const find = (interval: number): Voice | null => {
    const wanted = (rootClass + interval) % 12;
    for (const voice of voices) {
      if (pitchClassOfMidi(voice.midi) === wanted) return voice;
    }
    return null;
  };
  return Object.freeze({
    root,
    third: find(4) ?? find(3),
    fifth: find(7) ?? find(8) ?? find(6),
  });
}

function toneFor(tones: ChordTones, tone: PerformanceBassTone): Voice {
  switch (tone) {
    case "root":
      return tones.root;
    case "third":
      return tones.third ?? tones.fifth ?? tones.root;
    case "fifth":
      return tones.fifth ?? tones.third ?? tones.root;
  }
}

/**
 * Place a chord tone in the bass register, choosing the octave nearest a TARGET
 * so the line moves stepwise rather than by leaps. Ties resolve to the lower
 * octave, deterministically.
 *
 * The target is the slot's own declared placement:
 *
 *  - `nearest` targets the PREVIOUS bass note, or the register's anchor for the
 *    first note of a plan, which is ordinary voice leading;
 *  - `register-floor` targets `lowMidi`, so the slot takes the lowest placement
 *    the window admits and the line drops to the bottom of the instrument.
 *
 * Both searches are the same search over the same window, so no placement can
 * leave `[lowMidi, highMidi]` whichever target asked for it.
 */
function placeInBassRegister(
  tone: Voice,
  previousBassMidi: number | null,
  placement: PerformanceBassPlacement,
): Voice | null {
  const target =
    placement === "register-floor"
      ? PERFORMANCE_BASS_REGISTER.lowMidi
      : (previousBassMidi ?? PERFORMANCE_BASS_REGISTER.anchorMidi);
  let bestMidi: number | null = null;
  let bestShift = 0;
  let bestDistance = 0;
  for (
    let shift = -MAX_BASS_OCTAVE_SHIFT;
    shift <= MAX_BASS_OCTAVE_SHIFT;
    shift += 1
  ) {
    const midi = tone.midi + 12 * shift;
    if (midi < PERFORMANCE_BASS_REGISTER.lowMidi) continue;
    if (midi > PERFORMANCE_BASS_REGISTER.highMidi) continue;
    const distance = Math.abs(midi - target);
    if (bestMidi === null || distance < bestDistance) {
      bestMidi = midi;
      bestShift = shift;
      bestDistance = distance;
    }
  }
  if (bestMidi === null) return null;
  const spelled = makeSpelledPitch({
    step: tone.spelled.step,
    alter: tone.spelled.alter,
    octave: tone.spelled.octave + bestShift,
  });
  if (!spelled.ok) return null;
  return Object.freeze({ spelled: spelled.value, midi: bestMidi });
}

/**
 * The voices a comp stab sounds.
 *
 * `upper-voices` keeps the TOP `PERFORMANCE_COMP_TARGET_VOICES` voices,
 * dropping from the bottom — the same mechanism and the same direction as the
 * width rule in `placeCompInRegister`, given a voice-count target instead of a
 * span. The lowest voice is the one to drop because a bass slot is already
 * sounding that pitch class two octaves below and doubling it in the comp
 * thickens the middle without adding harmony; the top voices are the guide
 * tones and the colour the voicing was chosen for.
 *
 * Three is measured, not chosen: the comping instrument in the style
 * statistics this package is tuned against plays three simultaneous notes at
 * better than two to one over four. A voicing that already has three or fewer
 * voices is returned exactly as it is — this rule only ever removes.
 */
function compVoices(
  voices: readonly Voice[],
  rule: PerformanceCompVoicing,
): readonly Voice[] {
  if (rule === "all") return voices;
  return voices.length > PERFORMANCE_COMP_TARGET_VOICES
    ? voices.slice(voices.length - PERFORMANCE_COMP_TARGET_VOICES)
    : voices;
}

/**
 * Octave-transpose a WHOLE voicing.
 *
 * Every voice moves by the same number of octaves, so the intervals between
 * the voices are preserved exactly and the harmony is untouched. Spelling
 * moves with it: only the octave number of each `SpelledPitch` changes, never
 * its step or its alteration, so an F## stays an F## and is never quietly
 * renamed G. A shift of 0 returns the voices unchanged, identically.
 */
function transposeOctaves(
  voices: readonly Voice[],
  octaves: number,
): readonly Voice[] | null {
  if (octaves === 0) return voices;
  const moved: Voice[] = [];
  for (const voice of voices) {
    const spelled = makeSpelledPitch({
      step: voice.spelled.step,
      alter: voice.spelled.alter,
      octave: voice.spelled.octave + octaves,
    });
    if (!spelled.ok) return null;
    const midi = voice.midi + 12 * octaves;
    if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) return null;
    moved.push(Object.freeze({ spelled: spelled.value, midi }));
  }
  return Object.freeze(moved);
}

function voicingSpan(voices: readonly Voice[]): number {
  const lowest = voices[0];
  const highest = voices[voices.length - 1];
  if (lowest === undefined || highest === undefined) return 0;
  return highest.midi - lowest.midi;
}

/**
 * Place a comp voicing in the style's comping register.
 *
 * The three frozen rules, applied in this order and stated exactly:
 *
 *  1. WIDTH. While the voicing spans more than
 *     `PERFORMANCE_COMP_MAX_SPAN_SEMITONES` and has more than
 *     `PERFORMANCE_COMP_MIN_WIDTH_VOICES` voices, drop its LOWEST voice. The
 *     lowest voice is the one to drop because the bass slot under it is
 *     already sounding that end of the harmony, and because dropping from the
 *     top would take the colour tone the voicing was chosen for. A voicing
 *     wider than a nineteenth is not one hand's sound; the Auto policy's
 *     optimizer produces such spreads freely because voice leading is a
 *     relative law that never looks at absolute width.
 *
 *  2. REGISTER. Octave-transpose the whole voicing so its lowest voice lands
 *     inside the register's published range `[lowMidi, lowMidi + 23]`. Exactly
 *     two octave placements can qualify — the HOME OCTAVE `[lowMidi,
 *     lowMidi + 11]` and the LIFT above it — and which of the two is taken is
 *     decided by rule 3.
 *
 *  3. SEPARATION, CEILING, and VOICE LEADING. A placement is ADMISSIBLE when
 *     its lowest voice is at least `PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES`
 *     above the bass note sounding under it AND its highest voice is at or
 *     below `ceilingMidi`. Of the admissible placements the one whose bottom
 *     voice is NEAREST the previous comp's bottom voice is taken; ties resolve
 *     DOWN, to the home octave. If neither placement is admissible, the lowest
 *     voice is dropped and the search repeats — dropping it raises the bottom,
 *     which lets a lower placement clear the bass and pulls the top back under
 *     the ceiling.
 *
 * WHY NEAREST-TO-PREVIOUS RATHER THAN ALWAYS-HOME (measured, round 20). Home
 * normalization alone is unique and needs no tie-break, which is why it was
 * written that way first — but it WRAPS. Two chords a semitone apart across the
 * home octave's boundary (a B bottom and the C above it) are normalized eleven
 * semitones APART, and the comping hand leaps an octave between adjacent bars
 * for no musical reason. Measured against the style reference, that put our
 * comp's bottom-voice motion at 1.65 semitones mean / 4.60 p90 against the
 * reference's 0.82 / 2.00 — the comping hand was moving twice as far as a
 * player's does. Choosing the nearer of the two admissible placements IS voice
 * leading, and it is fully deterministic: the previous comp bottom is a pure
 * function of the plan prefix, the candidate set has at most two members, and
 * the tie-break is stated. The register window is unchanged and still bounds
 * the result; only the choice inside it is now led rather than wrapped.
 *
 * The FIRST comp of a plan has no previous bottom, so it is led from
 * `register.lowMidi`. That is below every admissible bottom, so the home octave
 * always wins there and the plan's opening register is exactly what pure home
 * normalization produced.
 *
 * The loop is bounded by the voice count: each pass either returns or removes
 * one voice, and a single voice always has an answer, because the well-formed
 * register guarantees `lowMidi + 12 >= bassRegister.highMidi + separation` and
 * `lowMidi + 23 <= ceilingMidi`. So the comp is never emptied, never sounds
 * under or in unison with the bass, and never sounds above the ceiling.
 *
 * Only the width rule and this fallback ever remove a voice here, and the only
 * other remover in the package is the `upper-voices` target above; nothing
 * anywhere adds, reorders, respells or re-voices one. Whatever survives is an
 * exact octave transposition of a contiguous TOP SLICE of the written voicing.
 */
function placeCompInRegister(
  voices: readonly Voice[],
  bassMidi: number | null,
  register: PerformanceCompRegister,
  previousCompBottomMidi: number | null,
): readonly Voice[] | null {
  let work: readonly Voice[] = voices;
  while (
    work.length > PERFORMANCE_COMP_MIN_WIDTH_VOICES &&
    voicingSpan(work) > PERFORMANCE_COMP_MAX_SPAN_SEMITONES
  ) {
    work = work.slice(1);
  }
  const floor =
    bassMidi === null
      ? register.lowMidi
      : Math.max(
          register.lowMidi,
          bassMidi + PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES,
        );
  const leadFrom = previousCompBottomMidi ?? register.lowMidi;
  for (let pass = 0; pass < voices.length; pass += 1) {
    const lowest = work[0];
    const highest = work[work.length - 1];
    if (lowest === undefined || highest === undefined) return null;
    /* The unique shift that lands the lowest voice in the home octave. */
    const homeShift = floorDivide(register.lowMidi - lowest.midi + 11, 12);
    let bestShift: number | null = null;
    let bestDistance = 0;
    for (const shift of [homeShift, homeShift + 1]) {
      if (lowest.midi + 12 * shift < floor) continue;
      if (highest.midi + 12 * shift > register.ceilingMidi) continue;
      const distance = Math.abs(lowest.midi + 12 * shift - leadFrom);
      if (bestShift === null || distance < bestDistance) {
        bestShift = shift;
        bestDistance = distance;
      }
    }
    if (bestShift !== null) return transposeOctaves(work, bestShift);
    if (work.length <= 1) {
      /*
       * One voice and neither placement answered: the lift clears the bass by
       * construction and a single voice cannot exceed the ceiling from inside
       * the window, so this is the answer rather than a failure.
       */
      return transposeOctaves(work, homeShift + 1);
    }
    work = work.slice(1);
  }
  return null;
}

type SlotDraft = {
  role: PerformanceRole;
  slotIndex: number;
  startTick: number;
  nominalDurationTicks: number;
  velocity: number;
  bassTone: PerformanceBassTone;
  bassPlacement: PerformanceBassPlacement;
  compVoicing: PerformanceCompVoicing;
};

type ResolvedSlot = Readonly<{
  offsetTicks: number;
  durationTicks: number;
}>;

/**
 * Project the frozen table onto the tick grid, applying swing to the offsets.
 *
 * The bar bound is checked twice on purpose: once on the written offset, so a
 * table that declares a slot outside its own bar is refused for what it says,
 * and once after swing, so a displacement can never push a slot across the bar
 * line the table placed it inside.
 */
function resolveSlotTable(
  style: PerformanceStyle,
  barTicks: number,
  beatTicks: number,
): Readonly<{
  bass: readonly ResolvedSlot[];
  comp: readonly ResolvedSlot[];
}> | null {
  const resolve = (
    offsetBeats: ExactBeats,
    durationBeats: ExactBeats,
  ): ResolvedSlot | null => {
    const offsetTicks = ticksFromExactBeats(offsetBeats);
    const durationTicks = ticksFromExactBeats(durationBeats);
    if (offsetTicks === null || durationTicks === null) return null;
    if (offsetTicks >= barTicks || durationTicks < 1) return null;
    const swung = swungOffsetTicks(offsetTicks, beatTicks, style.swingRatio);
    if (!Number.isSafeInteger(swung) || swung < 0 || swung >= barTicks) {
      return null;
    }
    return Object.freeze({ offsetTicks: swung, durationTicks });
  };
  const bass: ResolvedSlot[] = [];
  for (const slot of style.bassSlots) {
    const resolved = resolve(slot.offsetBeats, slot.durationBeats);
    if (resolved === null) return null;
    bass.push(resolved);
  }
  const comp: ResolvedSlot[] = [];
  for (const slot of style.compSlots) {
    const resolved = resolve(slot.offsetBeats, slot.durationBeats);
    if (resolved === null) return null;
    comp.push(resolved);
  }
  return Object.freeze({
    bass: Object.freeze(bass),
    comp: Object.freeze(comp),
  });
}

function compareDrafts(left: SlotDraft, right: SlotDraft): number {
  if (left.startTick !== right.startTick) {
    return left.startTick - right.startTick;
  }
  if (left.role !== right.role) return left.role === "bass" ? -1 : 1;
  return left.slotIndex - right.slotIndex;
}

/**
 * Every emitted event is clipped so that the next event of the SAME role
 * always starts at or after this one ends, and so that no event outlives its
 * own source chord or the plan. That is what makes the no-overlap-per-role law
 * structural rather than a property of the chosen numbers, and it is what lets
 * a style declare "ring until something stops you" as a plain long duration.
 *
 * A CLIPPED release also CLEARS. Where the limit actually cuts a slot short,
 * the release is pulled back a further `PERFORMANCE_RELEASE_GAP_TICKS` so the
 * note stops before the next attack of its own role rather than butting
 * against it — the difference between a chord that changes and a chord that
 * smears. Three properties of that rule matter and all three are deliberate:
 *
 *  - a slot whose declared length already ends before the limit is NOT
 *    shortened. The style tables decide note length; this is only a floor
 *    under the release where clipping has taken that decision away.
 *  - the gap is measured against whichever limit binds — the next same-role
 *    attack, the source chord's end, or the plan total — so a chord change
 *    gets the same clearance an in-chord repeat does.
 *  - where the remaining window is shorter than the gap itself the note keeps
 *    its hard-clipped length instead of vanishing. The arrival law states a
 *    chord at its own start, and an articulation rule may never be the reason
 *    a chord is silent.
 */
function clipDrafts(
  drafts: readonly SlotDraft[],
  eventEndTick: number,
  totalTicks: number,
): readonly Readonly<{ draft: SlotDraft; durationTicks: number }>[] {
  const clipped: Readonly<{ draft: SlotDraft; durationTicks: number }>[] = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    if (draft === undefined) continue;
    let limit = Math.min(eventEndTick, totalTicks);
    for (let ahead = index + 1; ahead < drafts.length; ahead += 1) {
      const next = drafts[ahead];
      if (next === undefined) continue;
      if (next.role !== draft.role) continue;
      limit = Math.min(limit, next.startTick);
      break;
    }
    const hardEnd = Math.min(draft.startTick + draft.nominalDurationTicks, limit);
    const clearedEnd = Math.min(hardEnd, limit - PERFORMANCE_RELEASE_GAP_TICKS);
    const end = clearedEnd > draft.startTick ? clearedEnd : hardEnd;
    const durationTicks = end - draft.startTick;
    if (durationTicks < 1) continue;
    clipped.push(Object.freeze({ draft, durationTicks }));
  }
  return Object.freeze(clipped);
}

function nonEmptySpelled(
  voices: readonly Voice[],
): NonEmptySpelledPitches | null {
  const [first, ...rest] = voices;
  if (first === undefined) return null;
  const pitches: NonEmptySpelledPitches = [
    first.spelled,
    ...rest.map((voice) => voice.spelled),
  ];
  return Object.freeze(pitches);
}

function nonEmptyMidi(voices: readonly Voice[]): NonEmptyMidiPitches | null {
  const projected: MidiPitch[] = [];
  for (const voice of voices) {
    const made = makeMidiPitch(voice.midi);
    if (!made.ok) return null;
    projected.push(made.value);
  }
  const [first, ...rest] = projected;
  if (first === undefined) return null;
  const midiPitches: NonEmptyMidiPitches = [first, ...rest];
  return Object.freeze(midiPitches);
}

/**
 * The style lookup. A map rather than a record read, so a style id that no
 * table declares is an ordinary miss the compiler refuses on instead of an
 * `undefined` that the types promise cannot happen.
 */
const STYLE_INDEX: ReadonlyMap<string, PerformanceStyle> = new Map(
  Object.entries(PERFORMANCE_STYLES),
);

/** Compile a P0 plan into a performance of the same chart. */
export function compilePerformancePlan(
  request: CompilePerformancePlanRequest,
): CompilePerformancePlanResult {
  const counters: Counters = {
    sourceEventsVisited: 0,
    barsVisited: 0,
    slotsConsidered: 0,
    eventsProduced: 0,
  };
  const styleId = request.styleId;
  const style = STYLE_INDEX.get(styleId);
  if (style === undefined) {
    return refuse(
      styleId,
      "performance.style_unknown",
      null,
      styleId,
      counters,
      "style-invalid",
    );
  }

  const plan = request.plan;
  if (style.kind === "literal") {
    /* The identity style returns the very plan it was given, unaltered. */
    return Object.freeze({
      ok: true,
      plan,
      evidence: evidence(counters, "identity"),
    });
  }

  /*
   * A loop rebases and clips event start ticks against the loop window, so the
   * bar grid this layer places slots on is no longer the source bar grid. The
   * honest answer is to refuse and let the caller keep the literal plan rather
   * than place a comp stab against a grid that does not exist.
   */
  if (plan.loop !== null) {
    return refuse(
      styleId,
      "performance.loop_unsupported",
      null,
      "loop-present",
      counters,
      "plan-unsupported",
    );
  }

  if (
    plan.meter.beatsPerBar !== style.meter.beatsPerBar ||
    plan.meter.beatUnit !== style.meter.beatUnit
  ) {
    return refuse(
      styleId,
      "performance.meter_unsupported",
      null,
      `${String(plan.meter.beatsPerBar)}/${String(plan.meter.beatUnit)}`,
      counters,
      "plan-unsupported",
    );
  }

  const barTicks = beatValueToMidiTicks(measureCapacity(plan.meter));
  if (!Number.isSafeInteger(barTicks) || barTicks < 1) {
    return refuse(
      styleId,
      "performance.meter_unsupported",
      null,
      `bar-ticks:${String(barTicks)}`,
      counters,
      "plan-unsupported",
    );
  }

  if (!styleTableWellFormed(style)) {
    return refuse(
      styleId,
      "performance.style_table_invalid",
      null,
      "bar-cycle-or-swing-ratio-out-of-contract",
      counters,
      "style-invalid",
    );
  }

  /*
   * Slot offsets and durations are declared in exact quarter-note beats, so
   * the beat the swing ratio divides is the quarter note, whatever the meter's
   * beat unit happens to be named.
   */
  const beatTicks = MIDI_PPQ;

  const table = resolveSlotTable(style, barTicks, beatTicks);
  if (table === null) {
    return refuse(
      styleId,
      "performance.style_table_invalid",
      null,
      "slot-offsets-not-tick-integral-or-out-of-bar",
      counters,
      "style-invalid",
    );
  }

  if (plan.events.length > MAX_PERFORMANCE_PLAN_SOURCE_EVENTS) {
    return refuse(
      styleId,
      "limit.performance_plan_work_exceeded",
      null,
      `sourceEventsVisited:${String(plan.events.length)}`,
      counters,
      "work-limit-exceeded",
    );
  }

  const totalTicks: number = plan.totalTicks;
  const compRegister = style.compRegister;
  const emitted: PlaybackEvent[] = [];
  /** The role of `emitted[i]`, kept alongside so the self-check can read it. */
  const emittedRoles: PerformanceRole[] = [];
  let previousBassMidi: number | null = null;
  /*
   * The bottom voice of the comp that sounded most recently, and the note the
   * next comp's octave placement is led from. Null until the first comp is
   * emitted. It is a pure function of the plan prefix, so the placement it
   * decides is as deterministic as the plan itself.
   */
  let previousCompBottomMidi: number | null = null;
  /*
   * Slot offsets are relative to the start of the event's own WRITTEN measure,
   * which is not `startTick / barTicks`. A pickup bar or an incomplete bar is
   * shorter than the meter's capacity, so from the first such bar onward every
   * later bar line sits off the meter's tick grid — and placing a downbeat
   * against that grid would put the bar's heaviest bass note in the middle of
   * the written bar for the whole rest of the chart. P0 emits events in
   * document order, so a change of `measureId` is where the next bar begins.
   */
  let measureStartTick = 0;
  let measureId: string | null = null;
  /*
   * The written measure index, taken from the same measure-boundary walk. It
   * is the bar-cycle's phase source: a pattern keyed to where a bar actually
   * sits in the chart can never slide out of step with the chart, which is
   * exactly what a bar counter kept alongside the loop would eventually do.
   */
  let writtenMeasureIndex = -1;

  const cycleLength = style.barCycleLength;
  const phaseOfBar = (bar: number): number =>
    cycleLength <= 1 ? 0 : floorModulo(writtenMeasureIndex + bar, cycleLength);
  const accentForPhase = (phase: number): number =>
    style.barCycleVelocityOffsets[phase] ?? 0;

  for (let eventIndex = 0; eventIndex < plan.events.length; eventIndex += 1) {
    const source = plan.events[eventIndex];
    if (source === undefined) continue;
    counters.sourceEventsVisited += 1;
    if (source.measureId !== measureId) {
      measureId = source.measureId;
      measureStartTick = source.startTick;
      writtenMeasureIndex += 1;
    }
    const voices = readVoices(source);
    if (voices === null) {
      return refuse(
        styleId,
        "performance.source_event_invalid",
        source.eventId,
        "pitch-records-not-index-aligned",
        counters,
        "source-invalid",
      );
    }
    const tones = deriveChordTones(voices);
    if (tones === null) {
      return refuse(
        styleId,
        "performance.source_event_invalid",
        source.eventId,
        "no-chord-tone",
        counters,
        "source-invalid",
      );
    }

    const eventStart = source.startTick;
    const eventEnd = eventStart + source.durationTicks;
    const firstBar = floorDivide(eventStart - measureStartTick, barTicks);
    const lastTick = eventEnd - 1;
    const lastBar = floorDivide(lastTick - measureStartTick, barTicks);

    const drafts: SlotDraft[] = [];
    for (let bar = firstBar; bar <= lastBar; bar += 1) {
      counters.barsVisited += 1;
      if (counters.barsVisited > MAX_PERFORMANCE_PLAN_BARS_VISITED) {
        return refuse(
          styleId,
          "limit.performance_plan_work_exceeded",
          source.eventId,
          `barsVisited:${String(counters.barsVisited)}`,
          counters,
          "work-limit-exceeded",
        );
      }
      const barStart = measureStartTick + bar * barTicks;
      const phase = phaseOfBar(bar);
      const accent = accentForPhase(phase);
      for (let index = 0; index < table.bass.length; index += 1) {
        const slot = table.bass[index];
        const declared = style.bassSlots[index];
        if (slot === undefined || declared === undefined) continue;
        counters.slotsConsidered += 1;
        if (!soundsInPhase(declared.cyclePhases, phase)) continue;
        const startTick = barStart + slot.offsetTicks;
        if (startTick < eventStart || startTick >= eventEnd) continue;
        drafts.push({
          role: "bass",
          slotIndex: index,
          startTick,
          nominalDurationTicks: slot.durationTicks,
          velocity: declared.velocity + accent,
          bassTone: declared.tone,
          bassPlacement: declared.placement,
          compVoicing: "all",
        });
      }
      for (let index = 0; index < table.comp.length; index += 1) {
        const slot = table.comp[index];
        const declared = style.compSlots[index];
        if (slot === undefined || declared === undefined) continue;
        counters.slotsConsidered += 1;
        if (!soundsInPhase(declared.cyclePhases, phase)) continue;
        const startTick = barStart + slot.offsetTicks;
        if (startTick < eventStart || startTick >= eventEnd) continue;
        drafts.push({
          role: "comp",
          slotIndex: index,
          startTick,
          nominalDurationTicks: slot.durationTicks,
          velocity: declared.velocity + accent,
          bassTone: "root",
          bassPlacement: "nearest",
          compVoicing: declared.voicing,
        });
      }
      if (counters.slotsConsidered > MAX_PERFORMANCE_PLAN_SLOTS_CONSIDERED) {
        return refuse(
          styleId,
          "limit.performance_plan_work_exceeded",
          source.eventId,
          `slotsConsidered:${String(counters.slotsConsidered)}`,
          counters,
          "work-limit-exceeded",
        );
      }
    }

    /*
     * A chord that starts inside a bar — the two-chords-per-bar case that
     * matters most for the seeded chart — still has to be heard the moment it
     * arrives, so the bass always sounds at the event's own start even when no
     * bar-relative bass slot lands there.
     */
    const arrivalPhase = phaseOfBar(firstBar);
    let arrivalIndex = -1;
    for (let index = 0; index < table.bass.length; index += 1) {
      const declared = style.bassSlots[index];
      if (declared === undefined) continue;
      if (!soundsInPhase(declared.cyclePhases, arrivalPhase)) continue;
      arrivalIndex = index;
      break;
    }
    const firstBassSlot = arrivalIndex < 0 ? undefined : table.bass[arrivalIndex];
    const firstDeclaredBass =
      arrivalIndex < 0 ? undefined : style.bassSlots[arrivalIndex];
    if (firstBassSlot !== undefined && firstDeclaredBass !== undefined) {
      /*
       * The arrival law ADDS what the table left unsaid; it never doubles what
       * the table already said. The question is asked of the drafts actually
       * pushed — their EMITTED ticks, swing displacement and all — and never
       * of a declared offset, because a swung slot is played somewhere the
       * table does not name and a comparison against the written offset would
       * miss the collision exactly when the style swings.
       */
      const hasBassAtStart = drafts.some(
        (draft) => draft.role === "bass" && draft.startTick === eventStart,
      );
      if (!hasBassAtStart) {
        drafts.push({
          role: "bass",
          slotIndex: arrivalIndex,
          startTick: eventStart,
          nominalDurationTicks: firstBassSlot.durationTicks,
          velocity: firstDeclaredBass.velocity + accentForPhase(arrivalPhase),
          bassTone: firstDeclaredBass.tone,
          bassPlacement: firstDeclaredBass.placement,
          compVoicing: "all",
        });
      }
    }

    /*
     * The same rule for the harmony itself, and it is the more important half:
     * slot offsets are bar-relative, so a chord that begins mid-bar reaches
     * none of the offset-0 slots where the voicing lives. Without this, every
     * second chord of a two-chords-per-bar chart — most of the seeded chart —
     * was announced by a lone bass note and never stated its harmony at all.
     * A chord must be heard as a chord when it arrives; decoration is optional,
     * this is not.
     */
    const arrivalCompIndex = table.comp.findIndex((_, index) => {
      const declared = style.compSlots[index];
      return (
        declared !== undefined &&
        soundsInPhase(declared.cyclePhases, arrivalPhase)
      );
    });
    const arrivalComp =
      arrivalCompIndex < 0 ? undefined : table.comp[arrivalCompIndex];
    const declaredArrivalComp =
      arrivalCompIndex < 0 ? undefined : style.compSlots[arrivalCompIndex];
    if (arrivalComp !== undefined && declaredArrivalComp !== undefined) {
      /*
       * The same guard, and the one that matters most: a style whose table
       * declares a comp landing on the chord's own start tick — offset 0 in a
       * bar-aligned chord, or any offset that a swung displacement carries
       * onto the arrival — already states the harmony there. Adding a second
       * one would emit two voicings at the identical tick: a doubled stab,
       * audibly a flam and structurally a second chord sounding at once. The
       * declared slot wins, because it is what the reviewed table says.
       */
      const hasCompAtStart = drafts.some(
        (draft) => draft.role === "comp" && draft.startTick === eventStart,
      );
      if (!hasCompAtStart) {
        drafts.push({
          role: "comp",
          slotIndex: arrivalCompIndex,
          startTick: eventStart,
          nominalDurationTicks: arrivalComp.durationTicks,
          velocity:
            declaredArrivalComp.velocity + accentForPhase(arrivalPhase),
          bassTone: "root",
          bassPlacement: "nearest",
          compVoicing: declaredArrivalComp.voicing,
        });
      }
    }

    drafts.sort(compareDrafts);

    /*
     * One attack per role per tick, made structural rather than incidental.
     *
     * The arrival guards above stop the arrival law doubling a declared slot.
     * This stops the remaining case: two DECLARED slots of one role that a
     * swing displacement carries onto the same tick, which a table can express
     * without any single entry looking wrong. The earlier draft in the sorted
     * order — lowest slot index at that tick — is kept, deterministically.
     */
    for (let index = drafts.length - 1; index > 0; index -= 1) {
      const current = drafts[index];
      const previous = drafts[index - 1];
      if (current === undefined || previous === undefined) continue;
      if (
        current.role === previous.role &&
        current.startTick === previous.startTick
      ) {
        drafts.splice(index, 1);
      }
    }

    /*
     * The first bass note of every chord states the chord: whichever slot it
     * came from, it sounds the root. Without this, a chord that begins on beat
     * 3 would announce itself with its fifth, which reads as the previous
     * chord continuing rather than as a change.
     */
    let firstBassSeen = false;
    for (const draft of drafts) {
      if (draft.role !== "bass") continue;
      if (!firstBassSeen) {
        draft.bassTone = "root";
        firstBassSeen = true;
      }
    }

    let bassOrdinal = 0;
    let compOrdinal = 0;
    for (const { draft, durationTicks } of clipDrafts(
      drafts,
      eventEnd,
      totalTicks,
    )) {
      let sounding: readonly Voice[];
      if (draft.role === "bass") {
        const placed = placeInBassRegister(
          toneFor(tones, draft.bassTone),
          previousBassMidi,
          draft.bassPlacement,
        );
        if (placed === null) {
          return refuse(
            styleId,
            "performance.emitted_event_invalid",
            source.eventId,
            "bass-register-unreachable",
            counters,
            "emission-invalid",
          );
        }
        previousBassMidi = placed.midi;
        sounding = Object.freeze([placed]);
      } else {
        /*
         * A comp always sounds its OWN source chord's voicing. There is no
         * path by which one chord's comp borrows another chord's pitches.
         *
         * `previousBassMidi` is the bass note sounding under this comp: drafts
         * are emitted in ascending tick order and a bass sorts before a comp
         * at the same tick, so at this point it is the most recent bass ATTACK
         * at or before the comp's own start. That is the note the separation
         * rule must clear, and reading it here — rather than from the slot
         * table — keeps the rule true of what is actually played.
         */
        const chosen = compVoices(voices, draft.compVoicing);
        /*
         * Annotated rather than inferred: `previousCompBottomMidi` is READ in
         * this initializer and WRITTEN from its result two lines down, and
         * without the annotation that is a cycle the checker refuses to walk.
         */
        const placed: readonly Voice[] | null =
          compRegister === null
            ? chosen
            : placeCompInRegister(
                chosen,
                previousBassMidi,
                compRegister,
                previousCompBottomMidi,
              );
        if (placed === null) {
          return refuse(
            styleId,
            "performance.emitted_event_invalid",
            source.eventId,
            "comp-register-unreachable",
            counters,
            "emission-invalid",
          );
        }
        const bottom: Voice | undefined = placed[0];
        if (bottom !== undefined) previousCompBottomMidi = bottom.midi;
        sounding = placed;
      }

      const pitches = nonEmptySpelled(sounding);
      const midiPitches = nonEmptyMidi(sounding);
      if (
        pitches === null ||
        midiPitches === null ||
        midiPitches.length > MAX_EVENT_PITCHES
      ) {
        return refuse(
          styleId,
          "performance.emitted_event_invalid",
          source.eventId,
          "pitch-projection-failed",
          counters,
          "emission-invalid",
        );
      }

      const roleSuffix = PERFORMANCE_ROLE_ID_SUFFIXES[draft.role];
      const roleOrdinal =
        draft.role === "bass" ? bassOrdinal : compOrdinal;
      if (draft.role === "bass") bassOrdinal += 1;
      else compOrdinal += 1;
      const parsedId = parseStableId(
        "event",
        `${source.eventId}.${roleSuffix}${String(roleOrdinal)}`,
      );
      if (!parsedId.ok) {
        return refuse(
          styleId,
          "performance.event_id_invalid",
          source.eventId,
          parsedId.refusal.code,
          counters,
          "emission-invalid",
        );
      }
      const eventId: ChordEventId = parsedId.value;

      const startBeat = beatPositionFromTicks(draft.startTick);
      const durationBeats = beatDurationFromTicks(durationTicks);
      const gateDurationBeats = beatDurationFromTicks(
        gateTicksFor(durationTicks),
      );
      if (
        startBeat === null ||
        durationBeats === null ||
        gateDurationBeats === null
      ) {
        return refuse(
          styleId,
          "performance.emitted_event_invalid",
          source.eventId,
          "beat-projection-failed",
          counters,
          "emission-invalid",
        );
      }

      counters.eventsProduced += 1;
      if (counters.eventsProduced > MAX_PERFORMANCE_PLAN_EVENTS) {
        return refuse(
          styleId,
          "limit.performance_plan_work_exceeded",
          source.eventId,
          `eventsProduced:${String(counters.eventsProduced)}`,
          counters,
          "work-limit-exceeded",
        );
      }

      emittedRoles.push(draft.role);
      emitted.push(
        Object.freeze({
          schema: PLAYBACK_EVENT_SCHEMA,
          ordinal: emitted.length,
          sourceOrdinal: source.sourceOrdinal,
          eventId,
          sectionId: source.sectionId,
          measureId: source.measureId,
          sourceStartBeat: source.sourceStartBeat,
          sourceDurationBeats: source.sourceDurationBeats,
          sourceStartTick: source.sourceStartTick,
          sourceDurationTicks: source.sourceDurationTicks,
          sourceOffsetBeats: source.sourceOffsetBeats,
          sourceOffsetTicks: source.sourceOffsetTicks,
          startBeat,
          durationBeats,
          gateDurationBeats,
          startTick: beatValueToMidiTicks(startBeat),
          durationTicks: beatValueToMidiTicks(durationBeats),
          gateDurationTicks: beatValueToMidiTicks(gateDurationBeats),
          pitches,
          midiPitches,
          velocity: performanceVelocity(draft.velocity),
          articulation: source.articulation,
        } satisfies PlaybackEvent),
      );
    }
  }

  if (plan.events.length > 0 && emitted.length === 0) {
    return refuse(
      styleId,
      "performance.no_events_emitted",
      null,
      "style-produced-silence-for-a-sounding-chart",
      counters,
      "emission-invalid",
    );
  }

  /*
   * Re-prove, against the finished array, exactly what X1 checks. The
   * performance layer must never hand the transport a plan it would reject:
   * the caller falls back to the literal plan on a refusal, so a defect here
   * costs the performance, never the sound.
   */
  /*
   * No role attacks twice at one tick. X1 does not check this — two events at
   * the same tick are structurally legal there — but musically a doubled comp
   * is two chords sounding at once and a doubled bass is a flam, so it is
   * re-proved here against the finished array rather than trusted to the
   * guards that build it.
   */
  const seenRoleTicks = new Set<string>();
  for (let index = 0; index < emitted.length; index += 1) {
    const event = emitted[index];
    const role = emittedRoles[index];
    if (event === undefined || role === undefined) continue;
    const roleTick = `${role}@${String(event.startTick)}`;
    if (seenRoleTicks.has(roleTick)) {
      return refuse(
        styleId,
        "performance.emitted_event_invalid",
        event.eventId,
        `duplicate-role-attack:${roleTick}`,
        counters,
        "emission-invalid",
      );
    }
    seenRoleTicks.add(roleTick);
  }

  const seenIds = new Set<string>();
  let previousStartTick = -1;
  for (const event of emitted) {
    if (event.startTick < previousStartTick) {
      return refuse(
        styleId,
        "performance.emitted_event_invalid",
        event.eventId,
        "start-ticks-not-ascending",
        counters,
        "emission-invalid",
      );
    }
    previousStartTick = event.startTick;
    if (event.durationTicks < 1) {
      return refuse(
        styleId,
        "performance.emitted_event_invalid",
        event.eventId,
        "duration-not-positive",
        counters,
        "emission-invalid",
      );
    }
    if (event.startTick + event.durationTicks > totalTicks) {
      return refuse(
        styleId,
        "performance.emitted_event_invalid",
        event.eventId,
        "event-exceeds-plan-total",
        counters,
        "emission-invalid",
      );
    }
    if (seenIds.has(event.eventId)) {
      return refuse(
        styleId,
        "performance.emitted_event_invalid",
        event.eventId,
        "duplicate-event-id",
        counters,
        "emission-invalid",
      );
    }
    seenIds.add(event.eventId);
  }

  const performance: PlaybackPlan = Object.freeze({
    schema: plan.schema,
    compilerId: plan.compilerId,
    compilerVersion: plan.compilerVersion,
    articulationPolicyId: plan.articulationPolicyId,
    articulationPolicyVersion: plan.articulationPolicyVersion,
    loopPolicyId: plan.loopPolicyId,
    loopPolicyVersion: plan.loopPolicyVersion,
    velocityPolicyId: plan.velocityPolicyId,
    velocityPolicyVersion: plan.velocityPolicyVersion,
    realizationBindingPolicyId: plan.realizationBindingPolicyId,
    realizationBindingPolicyVersion: plan.realizationBindingPolicyVersion,
    sourceDocumentId: plan.sourceDocumentId,
    midiPpq: plan.midiPpq,
    tempoBpm: plan.tempoBpm,
    meter: plan.meter,
    events: Object.freeze(emitted),
    totalBeats: plan.totalBeats,
    totalTicks: plan.totalTicks,
    loop: plan.loop,
    loopTicks: plan.loopTicks,
  } satisfies PlaybackPlan);

  return Object.freeze({
    ok: true,
    plan: performance,
    evidence: evidence(counters, "complete"),
  });
}
