import { PROGRESSION_DOCUMENT_SCHEMA, decodeDocumentShape, makeBeatPosition } from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createInitialAppState } from "../../src/application/application-state";
import { createStudioApplicationDependencies, STUDIO_INITIAL_PANELS } from "../../src/application/studio-bootstrap";

/** Two sections with hand-written pitches. At 240 BPM the loop is 2 seconds. */
export function loopArrangementFixture() {
  const symbols = ["Cmaj7", "Dm7"];
  const tones = [["C", "E", "G", "B"], ["D", "F", "A", "C"]];
  const decoded = decodeDocumentShape({ schema: PROGRESSION_DOCUMENT_SCHEMA, id: "loop-document", title: "Loop arrangement", description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 }, tempoBpm: 240, key: null,
    sections: symbols.map((symbol, i) => {
      const parsed = parseChordSymbol(symbol, "ascii"); if (!parsed.ok) throw new Error("Invalid fixture chord");
      return { id: `loop-section-${String(i)}`, name: i === 0 ? "A" : "B", annotation: "", keyOverride: null, voiceLeadingBoundary: "continue",
        measures: [{ id: `loop-measure-${String(i)}`, completion: { kind: "complete" }, events: [{ id: `loop-event-${String(i)}`,
          chord: parsed.chord, duration: { numerator: 4, denominator: 1 }, annotation: "Keep my written pitches.",
          voicing: { mode: "manual", bassPolicy: "included", pitches: tones[i]?.map((step, j) => ({ step, alter: 0, octave: i === 1 && j === 3 ? 5 : 4 })) } }] }] };
    }), playback: { instrumentId: "analog-poly", masterVolume: 0.4, reverbAmount: 0, countInBars: 0 },
  });
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
  const published = validateDocumentSemantics(decoded.value); if (!published.ok) throw new Error(JSON.stringify(published.errors));
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 }); if (!zero.ok) throw new Error(zero.refusal.code);
  const initial = createInitialAppState({ document: published.value, zeroBeat: zero.value, initialPanels: STUDIO_INITIAL_PANELS });
  if (!initial.ok) throw new Error(initial.refusal.code);
  return { state: initial.state, dependencies: createStudioApplicationDependencies() };
}
