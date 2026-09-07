/**
 * U2 Chord Inspector Production Module
 *
 * Package: U2 (jcpe-milestone-reliable-studio-l3a.11.2), Reliable Studio milestone.
 *
 * Implements the progressive 7-tab Chord Inspector projection, interactive piano
 * geometry and inert annotation validation. The application owns edits/preview.
 */

import {
  accumulateTimeline,
  measureCapacity,
  normalizeBeatValue,
  pitchClassOf,
  projectSpelledPitch,
  type BeatDuration,
  type ChordEvent,
  type DegreeNumber,
  type PitchClass,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../domain";
import {
  parseChordSymbol,
  resolveChord,
  analyzeChartEvent,
  resolutionOperations,
  type ResolvedChord,
} from "../theory";
import type { AppState } from "./application-state-contract";
import { buildStudioRealizations } from "./studio-realization";
import { projectInspectorMotion } from "./studio-inspector-motion";
import {
  MAX_ANNOTATION_CODE_POINTS,
  PIANO_DEFAULT_VISIBLE_MAX_MIDI,
  PIANO_DEFAULT_VISIBLE_MIN_MIDI,
  PIANO_MAX_MIDI,
  PIANO_MIN_MIDI,
  type ChordInspectorViewModel,
  type InspectorDegreeItem,
  type InspectorHarmonyView,
  type InspectorNotesView,
  type InspectorSyntaxDiagnostic,
  type InspectorTabId,
  type InspectorTimingView,
  type InspectorVoicingMode,
  type InspectorVoicingView,
  type PianoKeyboardViewModel,
  type PianoKeyView,
  type PianoNoteRole,
  type U2RefusalCode,
} from "./u2-chord-inspector-contract";

const ZERO_BEATS_RES = normalizeBeatValue({ numerator: 0, denominator: 1 });
if (!ZERO_BEATS_RES.ok) {
  throw new Error("U2_FATAL: Failed to normalize zero beat value");
}
const ZERO_BEATS = ZERO_BEATS_RES.value;

function midiOf(pitch: SpelledPitch): number {
  const projected = projectSpelledPitch(pitch);
  if (!projected.ok) throw new Error("Inspector pitch is outside validated MIDI data");
  return projected.value.midi;
}

/* -------------------------------------------------------------------------- */
/* Inert Annotation Text (L-MARKUP-01)                                        */
/* -------------------------------------------------------------------------- */

export type InspectorAnnotationResult = Readonly<{
  text: string;
  codePointCount: number;
  isWithinLimit: boolean;
  isRefused: boolean;
  refusalCode: U2RefusalCode | null;
}>;

export function inspectAnnotationText(raw: string): InspectorAnnotationResult {
  const codePointCount = Array.from(raw).length;

  if (codePointCount > MAX_ANNOTATION_CODE_POINTS) {
    return Object.freeze({
      text: raw,
      codePointCount,
      isWithinLimit: false,
      isRefused: true,
      refusalCode: "u2.annotation_length_exceeded",
    });
  }

  return Object.freeze({
    text: raw,
    codePointCount,
    isWithinLimit: true,
    isRefused: false,
    refusalCode: null,
  });
}

/* -------------------------------------------------------------------------- */
/* Piano Geometry & Accessible Labels (L-PIANO-01)                           */
/* -------------------------------------------------------------------------- */

const WHITE_PITCH_CLASSES: readonly PitchClass[] = [
  0, 2, 4, 5, 7, 9, 11,
] as const;
export function isBlackKeyMidi(midi: number): boolean {
  const pc = (midi % 12) as PitchClass;
  return !WHITE_PITCH_CLASSES.includes(pc);
}

export function midiToPitchClass(midi: number): PitchClass {
  return (((midi % 12) + 12) % 12) as PitchClass;
}

export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function defaultSpellingForMidi(
  midi: number,
  preferSharps = true,
): SpelledPitchClass {
  const pc = midiToPitchClass(midi);
  switch (pc) {
    case 0:
      return { step: "C", alter: 0 };
    case 1:
      return preferSharps ? { step: "C", alter: 1 } : { step: "D", alter: -1 };
    case 2:
      return { step: "D", alter: 0 };
    case 3:
      return preferSharps ? { step: "D", alter: 1 } : { step: "E", alter: -1 };
    case 4:
      return { step: "E", alter: 0 };
    case 5:
      return { step: "F", alter: 0 };
    case 6:
      return preferSharps ? { step: "F", alter: 1 } : { step: "G", alter: -1 };
    case 7:
      return { step: "G", alter: 0 };
    case 8:
      return preferSharps ? { step: "G", alter: 1 } : { step: "A", alter: -1 };
    case 9:
      return { step: "A", alter: 0 };
    case 10:
      return preferSharps ? { step: "A", alter: 1 } : { step: "B", alter: -1 };
    case 11:
      return { step: "B", alter: 0 };
  }
}

export function buildPianoAccessibleLabel(
  spelling: SpelledPitchClass,
  octave: number,
  role: PianoNoteRole | null,
  degreeAlter: number | null = null,
): string {
  const alterStr = spelling.alter < 0 ? "b".repeat(-spelling.alter) : "#".repeat(spelling.alter);
  const noteName = `${spelling.step}${alterStr}${String(octave)}`;
  if (role === "root") return `${noteName}, Root`;
  if (role === "guide-third") return `${noteName}, ${degreeAlter === 0 ? "Major " : degreeAlter === -1 ? "Minor " : ""}Third Guide Tone`;
  if (role === "guide-seventh") return `${noteName}, ${degreeAlter === 0 ? "Major " : degreeAlter === -1 ? "Minor " : degreeAlter === -2 ? "Diminished " : ""}Seventh Guide Tone`;
  if (role === "tension") return `${noteName}, Tension`;
  if (role === "bass") return `${noteName}, Bass Note`;
  if (role === "color") return `${noteName}, Chord Tone`;
  return noteName;
}

export function derivePianoKeyboardViewModel(
  activeMidiNotes: readonly number[],
  roleByPitchClass?: ReadonlyMap<PitchClass, PianoNoteRole>,
  spellingByPitchClass?: ReadonlyMap<PitchClass, SpelledPitchClass>,
  hoveredMidi: number | null = null,
  focusedMidi: number | null = null,
  degreeAlterByPitchClass?: ReadonlyMap<PitchClass, number>,
  activeSpelledPitches: readonly SpelledPitch[] = [],
): PianoKeyboardViewModel {
  const activeSet = new Set(activeMidiNotes);
  const keys: PianoKeyView[] = [];

  for (let midi: number = PIANO_MIN_MIDI; midi <= PIANO_MAX_MIDI; midi += 1) {
    const pc = midiToPitchClass(midi);
    const isBlack = isBlackKeyMidi(midi);
    const occurrences = activeSpelledPitches.filter(pitch => midiOf(pitch) === midi);
    const spelling = occurrences[0] ?? spellingByPitchClass?.get(pc) ?? defaultSpellingForMidi(midi);
    // Written octaves follow spelling: B#3 is MIDI60 and Cb5 is MIDI71.
    const octave = Math.floor((midi - pitchClassOf({ step: spelling.step, alter: 0 }) - spelling.alter) / 12) - 1;
    const isActiveVoiced = activeSet.has(midi);
    const role = isActiveVoiced ? (roleByPitchClass?.get(pc) ?? "color") : null;

    keys.push(
      Object.freeze({
        midi,
        pitchClass: pc,
        isBlack,
        spelling,
        isActiveVoiced,
        isRoot: role === "root",
        isBass: role === "bass",
        isGuideTone: role === "guide-third" || role === "guide-seventh",
        role,
        octave,
        accessibleLabel: occurrences.length > 1 ? occurrences.map(pitch => buildPianoAccessibleLabel(pitch, pitch.octave, role, degreeAlterByPitchClass?.get(pc))).join("; ")
          : buildPianoAccessibleLabel(spelling, octave, role, degreeAlterByPitchClass?.get(pc)),
      }),
    );
  }

  return Object.freeze({
    visibleMinMidi: PIANO_DEFAULT_VISIBLE_MIN_MIDI,
    visibleMaxMidi: PIANO_DEFAULT_VISIBLE_MAX_MIDI,
    keys: Object.freeze(keys),
    activeMidiNotes: Object.freeze([...activeMidiNotes]),
    hoveredMidi,
    focusedMidi,
  });
}

/* -------------------------------------------------------------------------- */
/* Main Chord Inspector Projection                                            */
/* -------------------------------------------------------------------------- */

export function projectChordInspectorViewModel(
  state: AppState,
  options: {
    activeTab?: InspectorTabId;
    draftSymbolText?: string;
    draftAnnotationText?: string;
    hoveredPianoMidi?: number | null;
    focusedPianoMidi?: number | null;
    /** Supplied by the application after realizing a validated draft. */
    realizedDraftPitches?: readonly SpelledPitch[];
  } = {},
): ChordInspectorViewModel {
  const activeTab = options.activeTab ?? "symbol";
  const selectedEventId =
    state.bookmarks.selection.kind === "events"
      ? state.bookmarks.selection.focusEventId
      : null;

  // Empty state when no chord is selected
  if (selectedEventId === null) {
    return Object.freeze({
      hasSelectedEvent: false,
      selectedEventId: null,
      selectedMeasureId: null,
      selectedSectionId: null,
      activeTab,
      symbol: Object.freeze({
        sourceText: "",
        canonicalText: null,
        isValidSyntax: false,
        diagnostics: Object.freeze([]),
        isCustomUnrecognized: false,
        draftText: "",
        isDirty: false,
      }),
      structure: Object.freeze({
        rootSpelling: null,
        qualityName: null,
        bassSpelling: null,
        degrees: Object.freeze([]),
        omissions: Object.freeze([]),
        alterations: Object.freeze([]),
        additions: Object.freeze([]),
      }),
      timing: Object.freeze({
        duration: ZERO_BEATS,
        durationLabel: "0 beats",
        measureIndex: 0,
        measureOrdinal: 1,
        measureStartBeat: ZERO_BEATS,
        beatInMeasure: ZERO_BEATS,
        isMeasureComplete: false,
      }),
      voicing: Object.freeze({
        mode: "auto",
        family: null,
        activePitches: Object.freeze([]),
        spelledPitches: Object.freeze([]),
        midiNoteNumbers: Object.freeze([]),
        canSwitchToManual: false,
        canSwitchToAuto: false,
        canSwitchToFrozen: false,
        manualNoteCount: 0,
        realizationFailure: null,
      }),
      harmony: Object.freeze({
        qualityCategory: "None",
        guideTones: Object.freeze([]),
        tensions: Object.freeze([]),
        characteristicTones: Object.freeze([]),
        scaleSuggestions: Object.freeze([]),
        romanNumeral: null,
        tonalFunction: null,
      }),
      motion: Object.freeze({
        unavailableReason: "Select a chord to inspect voice leading.",
        assignmentEvidence: null,
        previousChordSymbol: null,
        nextChordSymbol: null,
        commonToneCount: 0,
        stepwiseMotionCount: 0,
        voicePaths: Object.freeze([]),
      }),
      notes: Object.freeze({
        rawAnnotation: "",
        text: "",
        codePointCount: 0,
        maxCodePoints: MAX_ANNOTATION_CODE_POINTS,
        isDirty: false,
      }),
      piano: derivePianoKeyboardViewModel([]),
      preview: Object.freeze({
        kind: "idle",
        activePitches: Object.freeze([]),
        generation: 0,
        failureCode: null,
      }),
    });
  }

  // Find chord event in document
  let chordEvent: ChordEvent | null = null;
  let measureIndex = 0;
  let selectedMeasureId = null;
  let selectedSectionId = null;
  let isMeasureComplete = false;
  const precedingDurations: BeatDuration[] = [];
  const precedingInMeasure: BeatDuration[] = [];

  for (const section of state.document.sections) {
    for (let mIdx = 0; mIdx < section.measures.length; mIdx += 1) {
      const measure = section.measures[mIdx];
      if (!measure) continue;
      for (const ev of measure.events) {
        if (ev.id === selectedEventId) {
          chordEvent = ev;
          selectedMeasureId = measure.id;
          selectedSectionId = section.id;
          isMeasureComplete = measure.completion.kind === "complete";
          break;
        }
        precedingInMeasure.push(ev.duration);
      }
      if (chordEvent !== null) break;
      // P0: empty measures occupy a bar; partial measures keep their exact sum.
      precedingDurations.push(...(measure.completion.kind === "empty"
        ? [measureCapacity(state.document.meter)] : precedingInMeasure));
      precedingInMeasure.length = 0;
      measureIndex += 1;
    }
    if (chordEvent !== null) break;
  }

  if (chordEvent === null) {
    // Fallback if event id was dangling
    return projectChordInspectorViewModel({
      ...state,
      bookmarks: {
        ...state.bookmarks,
        selection: { kind: "none" },
      },
    }, options);
  }

  const rawSymbol = chordEvent.chord.sourceText;
  const draftText = options.draftSymbolText ?? rawSymbol;
  const isSymbolDirty = draftText !== rawSymbol;

  // 1. Symbol Tab
  const parseResult = parseChordSymbol(draftText, "ascii");
  const isValidSyntax = parseResult.ok;
  const isCustomUnrecognized =
    (chordEvent.chord.kind === "custom" && !isSymbolDirty) || (!isValidSyntax && !isSymbolDirty);
  const canonicalText = parseResult.ok ? parseResult.canonicalText : null;
  const diagnostics: InspectorSyntaxDiagnostic[] = parseResult.ok
    ? []
    : parseResult.diagnostics.map((d) => ({
        code: d.code,
        message: d.message,
        offset: d.range.start,
      }));

  // 2. Structure Tab (T1)
  const resolvedResult =
    !isCustomUnrecognized && parseResult.ok
      ? resolveChord(parseResult.chord)
      : null;
  const resolved: ResolvedChord | null =
    resolvedResult?.ok ? resolvedResult.value : null;

  const degrees: InspectorDegreeItem[] = [];
  const omissions: DegreeNumber[] = [];
  const alterations: string[] = [];
  const additions: string[] = [];

  const roleByPitchClass = new Map<PitchClass, PianoNoteRole>();
  const spellingByPitchClass = new Map<PitchClass, SpelledPitchClass>();
  const degreeAlterByPitchClass = new Map<PitchClass, number>();

  let rootSpelling: SpelledPitchClass | null = null;
  let bassSpelling: SpelledPitchClass | null = null;
  let qualityName: string | null = isCustomUnrecognized
    ? "Custom / Unrecognized"
    : null;

  if (resolved !== null) {
    const realization = resolved.realizations[0];

    rootSpelling = resolved.source.root;
    const { triad, seventh } = resolved.source;
    qualityName = seventh === null ? triad
      : triad === "major" && seventh === "minor" ? "Dominant Seventh"
      : triad === "major" && seventh === "major" ? "Major Seventh"
      : triad === "minor" && seventh === "minor" ? "Minor Seventh"
      : triad === "diminished" && seventh === "minor" ? "Half-diminished Seventh"
      : triad === "diminished" && seventh === "diminished" ? "Diminished Seventh"
      : `${triad}, ${seventh} seventh`;
    const degreeText = (degree: Readonly<{ number: number; alter: number }>): string =>
      `${degree.alter < 0 ? "b".repeat(-degree.alter) : "#".repeat(degree.alter)}${String(degree.number)}`;
    omissions.push(...resolved.source.omissions);
    alterations.push(...resolved.source.alterations.map(degreeText));
    if (resolved.source.colorPolicy === "altered-dominant") alterations.push("alt");
    additions.push(...resolved.source.additions.map(degree => `add${degreeText(degree)}`));
    if (resolved.source.sixth !== null) additions.push(degreeText(resolved.source.sixth));
    if (resolved.source.bass !== null) {
      bassSpelling = resolved.source.bass;
    }


    roleByPitchClass.set(pitchClassOf(rootSpelling), "root");
    spellingByPitchClass.set(pitchClassOf(rootSpelling), rootSpelling);

    for (let i = 0; i < realization.degrees.length; i += 1) {
      const d = realization.degrees[i];
      const sp = realization.spelledPitchNames[i];
      if (!d || !sp) continue;
      const pc = pitchClassOf(sp);
      const isRoot = d.number === 1;
      const isBass =
        bassSpelling !== null && pc === pitchClassOf(bassSpelling);
      let role: PianoNoteRole = "color";
      if (isRoot) role = "root";
      else if (isBass) role = "bass";
      else if (d.number === 3) role = "guide-third";
      else if (d.number === 7) role = "guide-seventh";
      else if (d.number === 9 || d.number === 11 || d.number === 13)
        role = "tension";

      roleByPitchClass.set(pc, role);
      degreeAlterByPitchClass.set(pc, d.alter);
      spellingByPitchClass.set(pc, sp);

      degrees.push(
        Object.freeze({
          degree: d.number,
          spelling: sp,
          pitchClass: pc,
          isRoot,
          isBass,
          isOmitted: false,
          role,
        }),
      );
    }

  }

  // 3. Timing Tab
  const startBeatRes = accumulateTimeline(precedingDurations);
  const beatInMeasureRes = accumulateTimeline(precedingInMeasure);
  if (!startBeatRes.ok || !beatInMeasureRes.ok) throw new Error("Validated inspector timeline exceeded its domain limit");
  const measureStartBeat = startBeatRes.value;
  const beatInMeasure = beatInMeasureRes.value;

  const timingView: InspectorTimingView = Object.freeze({
    duration: chordEvent.duration,
    durationLabel: `${String(chordEvent.duration.numerator)}${chordEvent.duration.denominator === 1 ? "" : `/${String(chordEvent.duration.denominator)}`} beats`,
    measureIndex,
    measureOrdinal: measureIndex + 1,
    measureStartBeat,
    beatInMeasure,
    isMeasureComplete,
  });

  // 4. Voicing Tab
  const voicingMode: InspectorVoicingMode = chordEvent.voicing.mode;
  const voicingFamily =
    chordEvent.voicing.mode === "auto" ? chordEvent.voicing.family : null;

  let activePitches: readonly SpelledPitch[] = [];
  let realizationFailure: InspectorVoicingView["realizationFailure"] = null;
  if (
    chordEvent.voicing.mode === "manual" ||
    chordEvent.voicing.mode === "frozen"
  ) {
    activePitches = chordEvent.voicing.pitches;
  } else if (options.realizedDraftPitches !== undefined) {
    activePitches = options.realizedDraftPitches;
  } else if (!isSymbolDirty) {
    const realized = buildStudioRealizations(state.document);
    const binding = realized.ok ? realized.realizations.get(chordEvent.id) : undefined;
    if (binding?.kind === "generated" && binding.outcome.ok) activePitches = binding.outcome.candidate.pitches;
    else realizationFailure = Object.freeze({
      code: !realized.ok ? realized.refusal.code : binding?.kind === "generated" && !binding.outcome.ok ? binding.outcome.refusal.code : "u2.unresolvable_chord_symbol",
      message: !realized.ok ? realized.refusal.message : "This family and range cannot realize the chord. Choose another voicing or edit the symbol.",
    });
  } else {
    realizationFailure = Object.freeze({ code: "u2.draft_not_realized", message: "Hear the edited chord to realize its current draft." });
  }

  const midiNoteNumbers = activePitches.map(
    (p) => midiOf(p),
  );

  const voicingView: InspectorVoicingView = Object.freeze({
    mode: voicingMode,
    family: voicingFamily,
    activePitches: Object.freeze(activePitches),
    spelledPitches: Object.freeze(
      activePitches.map((p) => ({ step: p.step, alter: p.alter })),
    ),
    midiNoteNumbers: Object.freeze(midiNoteNumbers),
    canSwitchToManual: voicingMode !== "manual" && activePitches.length > 0,
    canSwitchToAuto: voicingMode !== "auto" && !isCustomUnrecognized,
    canSwitchToFrozen: voicingMode === "auto" && activePitches.length > 0,
    manualNoteCount: voicingMode === "manual" ? activePitches.length : 0,
    realizationFailure,
  });

  // 5. Harmony Tab
  const guideTones: SpelledPitchClass[] = [];
  const tensions: string[] = [];
  if (resolved !== null) {
    const realization = resolved.realizations[0];

    for (let i = 0; i < realization.degrees.length; i += 1) {
      const d = realization.degrees[i];
      const sp = realization.spelledPitchNames[i];
      if (!d || !sp) continue;
      if (d.number === 3 || d.number === 7) {
        guideTones.push(sp);
      } else if (d.number === 9 || d.number === 11 || d.number === 13) {
        tensions.push(String(d.number));
      }
    }

  }

  const sectionKey = state.document.sections.find(section => section.id === selectedSectionId)?.keyOverride;
  const analysisChord = !isSymbolDirty && isCustomUnrecognized ? chordEvent.chord : parseResult.ok ? parseResult.chord : null;
  const analysis = analysisChord === null ? null : analyzeChartEvent({ current: analysisChord,
    key: sectionKey ?? state.document.key }, resolutionOperations);
  const harmonyView: InspectorHarmonyView = Object.freeze({
    qualityCategory: isCustomUnrecognized ? "Custom" : (qualityName ?? "Unknown"),
    guideTones: Object.freeze(guideTones),
    tensions: Object.freeze(tensions),
    characteristicTones: Object.freeze(degrees.filter(degree => degree.role === "tension").map(degree =>
      `${degree.spelling.step}${degree.spelling.alter < 0 ? "b".repeat(-degree.spelling.alter) : "#".repeat(degree.spelling.alter)}`)),
    scaleSuggestions: Object.freeze(analysis?.scaleSentence ? [analysis.scaleSentence] : []),
    romanNumeral: analysis?.roman ?? null,
    tonalFunction: analysis?.functionSentence ?? null,
  });

  // 6. Motion Tab
  const motionView = projectInspectorMotion(state.document, chordEvent.id, isSymbolDirty);

  // 7. Notes / Annotation Tab (L-MARKUP-01)
  const rawAnnotation = options.draftAnnotationText ?? chordEvent.annotation;
  const isAnnotationDirty = rawAnnotation !== chordEvent.annotation;
  const annotationResult = inspectAnnotationText(rawAnnotation);

  const notesView: InspectorNotesView = Object.freeze({
    rawAnnotation,
    text: annotationResult.text,
    codePointCount: annotationResult.codePointCount,
    maxCodePoints: MAX_ANNOTATION_CODE_POINTS,
    isDirty: isAnnotationDirty,
  });

  // Piano View (L-PIANO-01)
  const pianoView = derivePianoKeyboardViewModel(
    midiNoteNumbers,
    roleByPitchClass,
    spellingByPitchClass,
    options.hoveredPianoMidi,
    options.focusedPianoMidi,
    degreeAlterByPitchClass,
    activePitches,
  );

  return Object.freeze({
    hasSelectedEvent: true,
    selectedEventId: chordEvent.id,
    selectedMeasureId,
    selectedSectionId,
    activeTab,
    symbol: Object.freeze({
      sourceText: rawSymbol,
      canonicalText,
      isValidSyntax,
      diagnostics: Object.freeze(diagnostics),
      isCustomUnrecognized,
      draftText,
      isDirty: isSymbolDirty,
    }),
    structure: Object.freeze({
      rootSpelling,
      qualityName,
      bassSpelling,
      degrees: Object.freeze(degrees),
      omissions: Object.freeze(omissions),
      alterations: Object.freeze(alterations),
      additions: Object.freeze(additions),
    }),
    timing: timingView,
    voicing: voicingView,
    harmony: harmonyView,
    motion: motionView,
    notes: notesView,
    piano: pianoView,
    preview: Object.freeze({
      kind: realizationFailure === null ? "idle" : "unavailable",
      activePitches: Object.freeze(activePitches),
      generation: 0,
      failureCode: realizationFailure?.code ?? null,
    }),
  });
}
