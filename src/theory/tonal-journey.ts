import {
  type BeatValue,
  type ChordEventId,
  type KeyContext,
  pitchClassOf,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type CadenceEvidence,
  type KeyAreaSpan,
  type TonalJourneyOptions,
  type TonalJourneyPath,
  type TonalJourneyResult,
  G0_TONAL_JOURNEY_RESULT_SCHEMA,
  MAX_G0_K_BEST_PATHS,
  MAX_G0_PROGRESSION_EVENTS,
} from "./tonal-journey-contract";
import { parseChordSymbol } from "./chord-symbol";
import { detectCadence } from "./phrase-cadence";
import { spelledPitchClassToString } from "./guide-tones";

export function analyzeTonalJourney(
  events: readonly {
    eventId: ChordEventId;
    chordSymbol: string;
    offsetBeat: BeatValue;
    duration: BeatValue;
  }[],
  options?: TonalJourneyOptions,
): TonalJourneyResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g0.empty_progression",
        message: "Progression contains no events to analyze",
      },
    };
  }

  if (events.length > MAX_G0_PROGRESSION_EVENTS) {
    return {
      ok: false,
      refusal: {
        code: "g0.events_exceeded",
        message: `Progression exceeds maximum limit of ${String(MAX_G0_PROGRESSION_EVENTS)} events`,
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const parsedChords = [];

  for (const ev of events) {
    const parsed = parseChordSymbol(ev.chordSymbol, accidentalStyle);
    if (!parsed.ok) {
      return {
        ok: false,
        refusal: {
          code: "g0.invalid_chord",
          message: `Invalid chord symbol: ${ev.chordSymbol}`,
          eventId: ev.eventId,
        },
      };
    }
    parsedChords.push({ ...ev, parsed: parsed.chord });
  }

  let workSteps = 0;
  const cadenceEvidenceList: CadenceEvidence[] = [];

  // Extract all cadence evidence between adjacent events
  for (let i = 0; i < parsedChords.length - 1; i++) {
    workSteps++;
    const from = parsedChords[i];
    const to = parsedChords[i + 1];
    if (!from || !to) continue;

    const cad = detectCadence(
      from.chordSymbol,
      to.chordSymbol,
      from.eventId,
      to.eventId,
      undefined,
      accidentalStyle,
    );
    if (cad) {
      cadenceEvidenceList.push(cad);
    }
  }

  // Determine initial key context from preferred option, cadence target, or first event
  const firstCadence = cadenceEvidenceList.find(
    (c) =>
      c.cadenceType === "perfect-authentic" ||
      c.cadenceType === "imperfect-authentic" ||
      c.cadenceType === "backdoor",
  );
  let currentKeyContext: KeyContext | null = options?.preferredTonic ?? null;

  if (!currentKeyContext && firstCadence) {
    const targetParsed = parsedChords.find((p) => p.eventId === firstCadence.toEventId);
    if (targetParsed) {
      currentKeyContext = {
        tonic: targetParsed.parsed.root,
        mode: targetParsed.parsed.triad === "minor" ? "natural-minor" : "major",
      };
    }
  }

  if (!currentKeyContext && parsedChords[0]) {
    currentKeyContext = {
      tonic: parsedChords[0].parsed.root,
      mode: parsedChords[0].parsed.triad === "minor" ? "natural-minor" : "major",
    };
  }

  // Derive key area segmentation
  const keyAreas: KeyAreaSpan[] = [];
  let spanStartIndex = 0;

  for (let i = 0; i < parsedChords.length; i++) {
    workSteps++;
    const item = parsedChords[i];
    if (!item) continue;

    const chord = item.parsed;
    const rootStr = spelledPitchClassToString(chord.root);

    // Detect modulation or tonicization arrival
    const cadenceArrival = cadenceEvidenceList.find((c) => c.toEventId === item.eventId);
    if (
      cadenceArrival &&
      (cadenceArrival.cadenceType === "perfect-authentic" ||
        cadenceArrival.cadenceType === "imperfect-authentic")
    ) {
      const arrivedTonic = chord.root;
      if (currentKeyContext && pitchClassOf(currentKeyContext.tonic) !== pitchClassOf(arrivedTonic)) {
        // Conclude prior key area
        const prevStart = parsedChords[spanStartIndex];
        const prevEnd = parsedChords[i - 1];
        if (prevStart && prevEnd) {
          keyAreas.push({
            spanId: `span_${String(keyAreas.length + 1)}`,
            keyContext: currentKeyContext,
            startEventIndex: spanStartIndex,
            endEventIndex: i - 1,
            startBeat: prevStart.offsetBeat,
            endBeat: prevEnd.offsetBeat,
            confidenceScore: 90,
            evidence: [`Diatonic progression concluding before modulation to ${rootStr}`],
            isTonicization: false,
            isPivotArea: spanStartIndex > 0,
          });
        }
        currentKeyContext = {
          tonic: arrivedTonic,
          mode: chord.triad === "minor" ? "natural-minor" : "major",
        };
        spanStartIndex = i;
      }
    } else if (
      chord.triad === "major" &&
      (chord.seventh === "major" || chord.seventh === null) &&
      currentKeyContext &&
      pitchClassOf(currentKeyContext.tonic) !== pitchClassOf(chord.root) &&
      (i - spanStartIndex >= 2 || i === parsedChords.length - 1)
    ) {
      // Direct modulation to new major tonic
      const prevStart = parsedChords[spanStartIndex];
      const prevEnd = parsedChords[i - 1];
      if (prevStart && prevEnd) {
        keyAreas.push({
          spanId: `span_${String(keyAreas.length + 1)}`,
          keyContext: currentKeyContext,
          startEventIndex: spanStartIndex,
          endEventIndex: i - 1,
          startBeat: prevStart.offsetBeat,
          endBeat: prevEnd.offsetBeat,
          confidenceScore: 85,
          evidence: [`Key area established prior to direct modulation to ${rootStr}`],
          isTonicization: false,
          isPivotArea: false,
        });
      }
      currentKeyContext = { tonic: chord.root, mode: "major" };
      spanStartIndex = i;
    }
  }

  // Final remaining span
  if (currentKeyContext && spanStartIndex < parsedChords.length) {
    const startItem = parsedChords[spanStartIndex];
    const endItem = parsedChords[parsedChords.length - 1];
    if (startItem && endItem) {
      keyAreas.push({
        spanId: `span_${String(keyAreas.length + 1)}`,
        keyContext: currentKeyContext,
        startEventIndex: spanStartIndex,
        endEventIndex: parsedChords.length - 1,
        startBeat: startItem.offsetBeat,
        endBeat: endItem.offsetBeat,
        confidenceScore: 95,
        evidence: ["Cadential arrival and tonal closure"],
        isTonicization: false,
        isPivotArea: false,
      });
    }
  }

  const modulationsCount = Math.max(0, keyAreas.length - 1);
  const isDiatonicThroughout = modulationsCount === 0;

  const primaryPath: TonalJourneyPath = {
    pathId: "path-1-primary-tonal-reading",
    rank: 1,
    keyAreas,
    cadenceEvidence: cadenceEvidenceList,
    overallConfidence: isDiatonicThroughout ? 95 : 85,
    modulationsCount,
    isDiatonicThroughout,
    explanation: isDiatonicThroughout
      ? `Coherent diatonic progression prolonged in ${spelledPitchClassToString(keyAreas[0]?.keyContext.tonic ?? { step: "C", alter: 0 })} ${keyAreas[0]?.keyContext.mode ?? "major"}.`
      : `Tonal journey traversing ${String(keyAreas.length)} key areas with ${String(modulationsCount)} modulations.`,
  };

  const paths: TonalJourneyPath[] = [primaryPath];
  const maxPaths = Math.min(options?.maxPaths ?? 5, MAX_G0_K_BEST_PATHS);

  return {
    ok: true,
    schema: G0_TONAL_JOURNEY_RESULT_SCHEMA,
    paths: paths.slice(0, maxPaths),
    workSteps,
  };
}
