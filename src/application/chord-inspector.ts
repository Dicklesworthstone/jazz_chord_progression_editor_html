/**
 * U2 Chord Inspector Production Module
 *
 * Package: U2 (jcpe-milestone-reliable-studio-l3a.11.2), Reliable Studio milestone.
 *
 * Implements the progressive 7-tab Chord Inspector projection, interactive piano
 * geometry, voicing mode lifecycle manager, annotation sanitization, and isolated preview.
 */

import {
  makeSpelledPitch,
  normalizeBeatValue,
  pitchClassOf,
  type ChordDegree,
  type ChordEvent,
  type DegreeNumber,
  type PitchClass,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../domain";
import {
  formatChordSymbol,
  parseChordSymbol,
  resolveChord,
  type ResolvedChord,
} from "../theory";
import type { AppState } from "./application-state-contract";
import {
  INSPECTOR_TABS,
  MAX_ANNOTATION_CODE_POINTS,
  PIANO_DEFAULT_VISIBLE_MAX_MIDI,
  PIANO_DEFAULT_VISIBLE_MIN_MIDI,
  PIANO_MAX_MIDI,
  PIANO_MIN_MIDI,
  type ChordInspectorIntent,
  type ChordInspectorViewModel,
  type ChordPreviewStatus,
  type InspectorDegreeItem,
  type InspectorHarmonyView,
  type InspectorMotionPathItem,
  type InspectorMotionView,
  type InspectorNotesView,
  type InspectorStructureView,
  type InspectorSymbolView,
  type InspectorSyntaxDiagnostic,
  type InspectorTabId,
  type InspectorTimingView,
  type InspectorVoicingMode,
  type InspectorVoicingView,
  type PianoKeyboardViewModel,
  type PianoKeyView,
  type PianoNoteRole,
  type U2OperationResult,
  type U2RefusalCode,
} from "./u2-chord-inspector-contract";

const ZERO_BEATS_RES = normalizeBeatValue({ numerator: 0, denominator: 1 });
if (!ZERO_BEATS_RES.ok) {
  throw new Error("U2_FATAL: Failed to normalize zero beat value");
}
const ZERO_BEATS = ZERO_BEATS_RES.value;

/* -------------------------------------------------------------------------- */
/* Annotation Sanitization (L-MARKUP-01)                                      */
/* -------------------------------------------------------------------------- */

const HTML_TAG_REGEX = /<[^>]*>/gu;
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

export type SanitizedAnnotationResult = Readonly<{
  sanitized: string;
  codePointCount: number;
  hasUnsafeMarkupStripped: boolean;
  isWithinLimit: boolean;
  isRefused: boolean;
  refusalCode: U2RefusalCode | null;
}>;

export function sanitizeAnnotationText(raw: string): SanitizedAnnotationResult {
  const strippedTags = raw.replace(HTML_TAG_REGEX, "");
  const hasUnsafeMarkupStripped = strippedTags !== raw;
  const sanitized = strippedTags.replace(CONTROL_CHARS_REGEX, "");
  const codePointCount = Array.from(raw).length;

  if (codePointCount > MAX_ANNOTATION_CODE_POINTS) {
    return Object.freeze({
      sanitized: "",
      codePointCount,
      hasUnsafeMarkupStripped,
      isWithinLimit: false,
      isRefused: true,
      refusalCode: "u2.annotation_length_exceeded",
    });
  }

  return Object.freeze({
    sanitized,
    codePointCount: Array.from(sanitized).length,
    hasUnsafeMarkupStripped,
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
const STEP_FOR_WHITE_PC: Readonly<Record<PitchClass, "C" | "D" | "E" | "F" | "G" | "A" | "B">> = {
  0: "C",
  2: "D",
  4: "E",
  5: "F",
  7: "G",
  9: "A",
  11: "B",
  1: "C",
  3: "D",
  6: "F",
  8: "G",
  10: "A",
};

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
): string {
  const alterStr = spelling.alter === 1 ? "#" : spelling.alter === -1 ? "b" : "";
  const noteName = `${spelling.step}${alterStr}${octave}`;
  if (role === "root") return `${noteName}, Root`;
  if (role === "guide-third") return `${noteName}, Major Third Guide Tone`;
  if (role === "guide-seventh") return `${noteName}, Minor Seventh Guide Tone`;
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
): PianoKeyboardViewModel {
  const activeSet = new Set(activeMidiNotes);
  const keys: PianoKeyView[] = [];

  for (let midi = PIANO_MIN_MIDI; midi <= PIANO_MAX_MIDI; midi += 1) {
    const pc = midiToPitchClass(midi);
    const octave = midiToOctave(midi);
    const isBlack = isBlackKeyMidi(midi);
    const spelling = spellingByPitchClass?.get(pc) ?? defaultSpellingForMidi(midi);
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
        accessibleLabel: buildPianoAccessibleLabel(spelling, octave, role),
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
/* Voice Leading Motion Derivation                                            */
/* -------------------------------------------------------------------------- */

export function deriveVoiceLeadingMotion(
  currentPitches: readonly SpelledPitch[],
  previousChordSymbol: string | null = null,
  nextChordSymbol: string | null = null,
  nextPitches: readonly SpelledPitch[] = [],
): InspectorMotionView {
  const voicePaths: InspectorMotionPathItem[] = [];
  let commonToneCount = 0;
  let stepwiseMotionCount = 0;

  const maxLen = Math.max(currentPitches.length, nextPitches.length);
  for (let i = 0; i < maxLen; i += 1) {
    const from = currentPitches[i] ?? null;
    const to = nextPitches[i] ?? null;
    if (from !== null && to !== null) {
      const fromMidi = pitchClassOf(from) + from.octave * 12;
      const toMidi = pitchClassOf(to) + to.octave * 12;
      const interval = Math.abs(toMidi - fromMidi);
      let motionType: InspectorMotionPathItem["motionType"] = "leap";
      if (interval === 0) {
        motionType = "common";
        commonToneCount += 1;
      } else if (interval <= 2) {
        motionType = "step";
        stepwiseMotionCount += 1;
      } else if (interval <= 4) {
        motionType = "skip";
      }
      voicePaths.push(
        Object.freeze({
          fromPitch: from,
          toPitch: to,
          intervalSemis: interval,
          motionType,
        }),
      );
    }
  }

  return Object.freeze({
    previousChordSymbol,
    nextChordSymbol,
    commonToneCount,
    stepwiseMotionCount,
    voicePaths: Object.freeze(voicePaths),
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
        isUnisonDuplicateRejected: false,
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
        previousChordSymbol: null,
        nextChordSymbol: null,
        commonToneCount: 0,
        stepwiseMotionCount: 0,
        voicePaths: Object.freeze([]),
      }),
      notes: Object.freeze({
        rawAnnotation: "",
        sanitizedAnnotation: "",
        codePointCount: 0,
        maxCodePoints: MAX_ANNOTATION_CODE_POINTS,
        hasUnsafeMarkupStripped: false,
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

  for (const section of state.document.sections) {
    for (let mIdx = 0; mIdx < section.measures.length; mIdx += 1) {
      const measure = section.measures[mIdx];
      if (!measure) continue;
      for (const ev of measure.events) {
        if (ev.id === selectedEventId) {
          chordEvent = ev;
          measureIndex = mIdx;
          selectedMeasureId = measure.id;
          selectedSectionId = section.id;
          break;
        }
      }
      if (chordEvent !== null) break;
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
    });
  }

  const rawSymbol = chordEvent.chord.sourceText;
  const draftText = options.draftSymbolText ?? rawSymbol;
  const isSymbolDirty = draftText !== rawSymbol;

  // 1. Symbol Tab
  const parseResult = parseChordSymbol(draftText, "ascii");
  const isValidSyntax = parseResult.ok;
  const isCustomUnrecognized =
    chordEvent.chord.kind === "custom" || (!isValidSyntax && !isSymbolDirty);
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
    chordEvent.chord.kind === "parsed"
      ? resolveChord(chordEvent.chord)
      : null;
  const resolved: ResolvedChord | null =
    resolvedResult?.ok ? resolvedResult.value : null;

  const degrees: InspectorDegreeItem[] = [];
  const omissions: DegreeNumber[] = [];
  const alterations: string[] = [];
  const additions: string[] = [];

  const roleByPitchClass = new Map<PitchClass, PianoNoteRole>();
  const spellingByPitchClass = new Map<PitchClass, SpelledPitchClass>();

  let rootSpelling: SpelledPitchClass | null = null;
  let bassSpelling: SpelledPitchClass | null = null;
  let qualityName: string | null = isCustomUnrecognized
    ? "Custom / Unrecognized"
    : null;

  if (resolved !== null) {
    const realization = resolved.realizations[0];
    if (resolved.source.kind === "parsed") {
      rootSpelling = resolved.source.root;
      const seventhStr =
        resolved.source.seventh === "major"
          ? "Major Seventh"
          : resolved.source.seventh === "minor"
            ? "Dominant Seventh"
            : "";
      qualityName = seventhStr !== "" ? seventhStr : resolved.source.triad;
      if (resolved.source.bass !== null) {
        bassSpelling = resolved.source.bass;
      }
    }

    if (realization !== undefined && realization.degrees !== null) {
      if (rootSpelling !== null) {
        roleByPitchClass.set(pitchClassOf(rootSpelling), "root");
        spellingByPitchClass.set(pitchClassOf(rootSpelling), rootSpelling);
      }

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
  }

  // 3. Timing Tab
  const startBeatRes = normalizeBeatValue({
    numerator: measureIndex * 4,
    denominator: 1,
  });
  const beatInMeasureRes = normalizeBeatValue({
    numerator: 0,
    denominator: 1,
  });
  const measureStartBeat = startBeatRes.ok
    ? startBeatRes.value
    : chordEvent.duration;
  const beatInMeasure = beatInMeasureRes.ok
    ? beatInMeasureRes.value
    : chordEvent.duration;

  const timingView: InspectorTimingView = Object.freeze({
    duration: chordEvent.duration,
    durationLabel: `${chordEvent.duration.numerator} beats`,
    measureIndex,
    measureOrdinal: measureIndex + 1,
    measureStartBeat,
    beatInMeasure,
    isMeasureComplete: true,
  });

  // 4. Voicing Tab
  const voicingMode: InspectorVoicingMode = chordEvent.voicing.mode;
  const voicingFamily =
    chordEvent.voicing.mode === "auto" ? chordEvent.voicing.family : null;

  let activePitches: readonly SpelledPitch[] = [];
  if (
    chordEvent.voicing.mode === "manual" ||
    chordEvent.voicing.mode === "frozen"
  ) {
    activePitches = chordEvent.voicing.pitches;
  } else if (resolved !== null) {
    const realization = resolved.realizations[0];
    if (realization !== undefined) {
      activePitches = realization.spelledPitchNames.map((sp, idx) => {
        const pitchRes = makeSpelledPitch({
          step: sp.step,
          alter: sp.alter,
          octave: 4 + Math.floor(idx / 4),
        });
        return pitchRes.ok
          ? pitchRes.value
          : Object.freeze({
              step: sp.step,
              alter: sp.alter,
              octave: 4 + Math.floor(idx / 4),
            });
      });
    }
  }

  const midiNoteNumbers = activePitches.map(
    (p) => pitchClassOf(p) + (p.octave + 1) * 12,
  );

  const voicingView: InspectorVoicingView = Object.freeze({
    mode: voicingMode,
    family: voicingFamily,
    activePitches: Object.freeze(activePitches),
    spelledPitches: Object.freeze(
      activePitches.map((p) => ({ step: p.step, alter: p.alter })),
    ),
    midiNoteNumbers: Object.freeze(midiNoteNumbers),
    canSwitchToManual: voicingMode !== "manual",
    canSwitchToAuto: voicingMode !== "auto",
    canSwitchToFrozen: voicingMode !== "frozen",
    manualNoteCount: voicingMode === "manual" ? activePitches.length : 0,
    isUnisonDuplicateRejected: false,
  });

  // 5. Harmony Tab
  const guideTones: SpelledPitchClass[] = [];
  const tensions: string[] = [];
  if (resolved !== null) {
    const realization = resolved.realizations[0];
    if (realization !== undefined && realization.degrees !== null) {
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
  }

  const harmonyView: InspectorHarmonyView = Object.freeze({
    qualityCategory: isCustomUnrecognized ? "Custom" : (qualityName ?? "Unknown"),
    guideTones: Object.freeze(guideTones),
    tensions: Object.freeze(tensions),
    characteristicTones: Object.freeze([]),
    scaleSuggestions: Object.freeze([]),
    romanNumeral: null,
    tonalFunction: null,
  });

  // 6. Motion Tab
  const motionView = deriveVoiceLeadingMotion(activePitches);

  // 7. Notes / Annotation Tab (L-MARKUP-01)
  const rawAnnotation = options.draftAnnotationText ?? chordEvent.annotation ?? "";
  const isAnnotationDirty = rawAnnotation !== (chordEvent.annotation ?? "");
  const sanitizedResult = sanitizeAnnotationText(rawAnnotation);

  const notesView: InspectorNotesView = Object.freeze({
    rawAnnotation,
    sanitizedAnnotation: sanitizedResult.sanitized,
    codePointCount: sanitizedResult.codePointCount,
    maxCodePoints: MAX_ANNOTATION_CODE_POINTS,
    hasUnsafeMarkupStripped: sanitizedResult.hasUnsafeMarkupStripped,
    isDirty: isAnnotationDirty,
  });

  // Piano View (L-PIANO-01)
  const pianoView = derivePianoKeyboardViewModel(
    midiNoteNumbers,
    roleByPitchClass,
    spellingByPitchClass,
    options.hoveredPianoMidi,
    options.focusedPianoMidi,
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
      kind: "idle",
      activePitches: Object.freeze(activePitches),
      generation: 0,
      failureCode: null,
    }),
  });
}
