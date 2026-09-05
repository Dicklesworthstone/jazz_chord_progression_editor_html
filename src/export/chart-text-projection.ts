import type { ChordDegree, ChordSpec, SpelledPitchClass, ValidatedDocument } from "../domain";
import type { ChartTextDraft } from "../theory";

function pitchesEqual(left: SpelledPitchClass | null, right: SpelledPitchClass | null): boolean {
  return left === null || right === null ? left === right
    : left.step === right.step && left.alter === right.alter;
}

function degreesEqual(left: readonly ChordDegree[], right: readonly ChordDegree[]): boolean {
  return left.length === right.length && left.every((degree, index) =>
    degree.number === right[index]?.number && degree.alter === right[index].alter);
}

function chordsEqual(left: ChordSpec, right: ChordSpec): boolean {
  return pitchesEqual(left.root, right.root) && pitchesEqual(left.bass, right.bass) &&
    left.triad === right.triad && left.seventh === right.seventh &&
    (left.sixth === null || right.sixth === null ? left.sixth === right.sixth
      : left.sixth.alter === right.sixth.alter) &&
    degreesEqual(left.extensions, right.extensions) && degreesEqual(left.additions, right.additions) &&
    degreesEqual(left.alterations, right.alterations) &&
    left.omissions.length === right.omissions.length &&
    left.omissions.every((degree, index) => degree === right.omissions[index]) &&
    left.colorPolicy === right.colorPolicy;
}

/** E0 §5.1: compare values directly, independently of the encoder/formatter.
 * Only the declared losses and parser source/repeat bookkeeping are omitted.
 * One bounded traversal, constant auxiliary space; no synthesized parser draft.
 */
export function supportedDocumentProjectionEquals(expected: ValidatedDocument, reparsed: ChartTextDraft): boolean {
  const headers = reparsed.headers;
  if (reparsed.mode !== "document" || expected.title !== headers.title ||
      expected.description !== headers.description || expected.tempoBpm !== headers.tempoBpm ||
      expected.meter.beatsPerBar !== headers.meter?.beatsPerBar ||
      expected.meter.beatUnit !== headers.meter.beatUnit ||
      (expected.key === null || headers.key === null ? expected.key !== headers.key
        : expected.key.mode !== headers.key.mode || !pitchesEqual(expected.key.tonic, headers.key.tonic)) ||
      expected.sections.length === 0 || expected.sections.length !== reparsed.sections.length) return false;
  return expected.sections.every((section, sectionIndex) => {
    const other = reparsed.sections[sectionIndex];
    return other !== undefined && section.name === other.name && section.annotation === other.annotation &&
      section.measures.length > 0 && section.measures.length === other.measures.length &&
      section.measures.every((measure, measureIndex) => {
        const otherMeasure = other.measures[measureIndex];
        return otherMeasure !== undefined &&
          measure.completion.kind === (otherMeasure.events.length === 0 ? "empty" : "complete") &&
          measure.events.length === otherMeasure.events.length && measure.events.every((event, eventIndex) => {
            const otherEvent = otherMeasure.events[eventIndex];
            return otherEvent !== undefined && event.chord.kind === "parsed" &&
              event.annotation === otherEvent.annotation &&
              event.duration.numerator === otherEvent.duration.numerator &&
              event.duration.denominator === otherEvent.duration.denominator &&
              chordsEqual(event.chord, otherEvent.chord);
          });
      });
  });
}
