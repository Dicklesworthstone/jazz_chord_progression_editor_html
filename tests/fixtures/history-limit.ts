import minimal from "./interchange/goldens/minimal.changes.json";

/** Hand-specified valid large charts, without changing a production cap or estimator.
 * Each event has sixteen separately stored C4 occurrences, not sixteen references
 * to one pitch object. This deliberately exercises the retained-object cost.
 */
export function historyLimitDocument(eventCount: 4096 | 6144): unknown {
  return { ...minimal, id: "history-large-document", title: "Keep every unison",
    sections: Array.from({ length: eventCount / 1024 }, (_, section) => ({
      id: `history-section-${String(section)}`, name: "A", annotation: "", keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: Array.from({ length: 1024 }, (_, measure) => ({
        id: `history-measure-${String(section)}-${String(measure)}`, completion: { kind: "complete" },
        events: [{ id: `history-event-${String(section)}-${String(measure)}`,
          duration: { numerator: 4, denominator: 1 }, annotation: "",
          chord: { kind: "custom", sourceText: "Unison", label: "Unison", pitchNames: [{ step: "C", alter: 0 }], bass: null },
          voicing: { mode: "manual", bassPolicy: "included",
            pitches: Array.from({ length: 16 }, () => ({ step: "C", alter: 0, octave: 4 })) },
        }],
      })),
    })),
  };
}
