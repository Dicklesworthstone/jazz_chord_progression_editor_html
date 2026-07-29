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
 *  - a BASS voice, transposed into MIDI 33..52, sounding a chord tone the
 *    source event actually contains, placed at the style's bar-relative bass
 *    slots plus always at the event's own start;
 *  - COMP stabs at the style's syncopated bar-relative offsets, sounding the
 *    upper voices of the source event's own voicing;
 *  - a velocity contour taken from the frozen style table.
 *
 * Two laws hold by construction rather than by hope:
 *
 *  1. Every emitted event satisfies what X1 validates structurally — ascending
 *     start ticks, positive durations, a legal id, 1..16 MIDI pitches, and
 *     `startTick + durationTicks <= totalTicks`. A final self-check re-proves
 *     this before the plan is returned and refuses rather than emit a plan the
 *     transport would reject.
 *  2. No two events of the same role overlap: every emitted event is clipped
 *     to the next start of its own role, to its source event's end, and to the
 *     plan total.
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
  PERFORMANCE_ROLE_ID_SUFFIXES,
  PERFORMANCE_STYLES,
  type CompilePerformancePlanFailure,
  type CompilePerformancePlanRequest,
  type CompilePerformancePlanResult,
  type ExactBeats,
  type PerformanceBassTone,
  type PerformanceCompVoicing,
  type PerformancePlanRefusalCode,
  type PerformancePlanTermination,
  type PerformancePlanWorkEvidence,
  type PerformanceRole,
  type PerformanceStyle,
  type PerformanceStyleId,
} from "./performance-plan-contract";

/** The largest MIDI pitch count X1 accepts on one event. */
const MAX_EVENT_PITCHES = 16;

/** Octave shifts searched when placing a bass note; 33..52 spans under two. */
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
 * Place a chord tone in the bass register, choosing the octave nearest the
 * previous bass note so the line moves stepwise rather than by leaps. Ties
 * resolve to the lower octave, deterministically.
 */
function placeInBassRegister(
  tone: Voice,
  previousBassMidi: number | null,
): Voice | null {
  const target = previousBassMidi ?? PERFORMANCE_BASS_REGISTER.anchorMidi;
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
 * The voices a comp stab sounds. `upper-voices` drops the lowest voice of a
 * four-or-more-voice chord, because a bass slot is already sounding that
 * pitch class far below and doubling it in the comp thickens the middle
 * without adding harmony.
 */
function compVoices(
  voices: readonly Voice[],
  rule: PerformanceCompVoicing,
): readonly Voice[] {
  if (rule === "all") return voices;
  return voices.length >= 4 ? voices.slice(1) : voices;
}

type SlotDraft = {
  role: PerformanceRole;
  slotIndex: number;
  startTick: number;
  nominalDurationTicks: number;
  velocity: number;
  bassTone: PerformanceBassTone;
  compVoicing: PerformanceCompVoicing;
};

type ResolvedSlot = Readonly<{
  offsetTicks: number;
  durationTicks: number;
}>;

function resolveSlotTable(
  style: PerformanceStyle,
  barTicks: number,
): Readonly<{
  bass: readonly ResolvedSlot[];
  comp: readonly ResolvedSlot[];
}> | null {
  const bass: ResolvedSlot[] = [];
  for (const slot of style.bassSlots) {
    const offsetTicks = ticksFromExactBeats(slot.offsetBeats);
    const durationTicks = ticksFromExactBeats(slot.durationBeats);
    if (offsetTicks === null || durationTicks === null) return null;
    if (offsetTicks >= barTicks || durationTicks < 1) return null;
    bass.push(Object.freeze({ offsetTicks, durationTicks }));
  }
  const comp: ResolvedSlot[] = [];
  for (const slot of style.compSlots) {
    const offsetTicks = ticksFromExactBeats(slot.offsetBeats);
    const durationTicks = ticksFromExactBeats(slot.durationBeats);
    if (offsetTicks === null || durationTicks === null) return null;
    if (offsetTicks >= barTicks || durationTicks < 1) return null;
    comp.push(Object.freeze({ offsetTicks, durationTicks }));
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
 * own source chord or the plan. That is what makes the no-overlap-per-role
 * law structural rather than a property of the chosen numbers.
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
    const end = Math.min(draft.startTick + draft.nominalDurationTicks, limit);
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

  const table = resolveSlotTable(style, barTicks);
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
  const emitted: PlaybackEvent[] = [];
  let previousBassMidi: number | null = null;
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

  for (const source of plan.events) {
    counters.sourceEventsVisited += 1;
    if (source.measureId !== measureId) {
      measureId = source.measureId;
      measureStartTick = source.startTick;
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
      for (let index = 0; index < table.bass.length; index += 1) {
        const slot = table.bass[index];
        const declared = style.bassSlots[index];
        if (slot === undefined || declared === undefined) continue;
        counters.slotsConsidered += 1;
        const startTick = barStart + slot.offsetTicks;
        if (startTick < eventStart || startTick >= eventEnd) continue;
        drafts.push({
          role: "bass",
          slotIndex: index,
          startTick,
          nominalDurationTicks: slot.durationTicks,
          velocity: declared.velocity,
          bassTone: declared.tone,
          compVoicing: "all",
        });
      }
      for (let index = 0; index < table.comp.length; index += 1) {
        const slot = table.comp[index];
        const declared = style.compSlots[index];
        if (slot === undefined || declared === undefined) continue;
        counters.slotsConsidered += 1;
        const startTick = barStart + slot.offsetTicks;
        if (startTick < eventStart || startTick >= eventEnd) continue;
        drafts.push({
          role: "comp",
          slotIndex: index,
          startTick,
          nominalDurationTicks: slot.durationTicks,
          velocity: declared.velocity,
          bassTone: "root",
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
    const firstBassSlot = table.bass[0];
    const firstDeclaredBass = style.bassSlots[0];
    if (firstBassSlot !== undefined && firstDeclaredBass !== undefined) {
      const hasBassAtStart = drafts.some(
        (draft) => draft.role === "bass" && draft.startTick === eventStart,
      );
      if (!hasBassAtStart) {
        drafts.push({
          role: "bass",
          slotIndex: 0,
          startTick: eventStart,
          nominalDurationTicks: firstBassSlot.durationTicks,
          velocity: firstDeclaredBass.velocity,
          bassTone: firstDeclaredBass.tone,
          compVoicing: "all",
        });
      }
    }

    drafts.sort(compareDrafts);

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
        sounding = compVoices(voices, draft.compVoicing);
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
