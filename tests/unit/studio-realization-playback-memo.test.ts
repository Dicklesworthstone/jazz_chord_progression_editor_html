import { expect, test } from "bun:test";
import { decodeDocumentShape, type ValidatedDocument } from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { buildStudioRealizations } from "../../src/application/studio-realization";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";
import { musicalDocument } from "../support/studio-voice-leading";

function publish(value: unknown): ValidatedDocument {
  const decoded = decodeDocumentShape(value);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
  return validated.value;
}

function realization(document: ValidatedDocument) {
  const result = buildStudioRealizations(document);
  if (!result.ok) throw new Error(result.refusal.code);
  return result;
}

function literalPitches(document: ValidatedDocument): readonly (readonly number[])[] {
  const result = compileStudioPlaybackPlan(document);
  if (!result.ok) throw new Error(result.refusal.code);
  return result.plan.events.map(event => [...event.midiPitches]);
}

test("playback-only publication reuses the exact auto realization without changing its source", () => {
  const base = publish({ ...musicalDocument([["Cmaj7"], ["Fmaj7"]]), id: "memo-playback" });
  const before = JSON.stringify(base);
  const first = realization(base);
  const pitches = literalPitches(base);
  const settings = [
    { instrumentId: "vibraphone" }, { grooveStyleId: "bossa-nova@1" },
    { masterVolume: 0.25 }, { reverbAmount: 0.75 }, { countInBars: 1 },
  ];
  for (const setting of settings) {
    const changed = publish({ ...base, playback: { ...base.playback, ...setting } });
    expect(realization(changed)).toBe(first);
    expect(literalPitches(changed)).toEqual(pitches);
  }
  expect(JSON.stringify(base)).toBe(before);
  // Visiting another chart then returning (for example through Undo) must
  // re-arm the recent-document slot even on an identity-memo hit.
  realization(publish({ ...musicalDocument([["Dm7"]]), id: "memo-visited" }));
  expect(realization(base)).toBe(first);
  expect(realization(publish({ ...base, playback: { ...base.playback, instrumentId: "vibraphone" } }))).toBe(first);
});

test("a source edit with the same IDs cannot reuse old pitches or semantic evidence", () => {
  const base = publish({ ...musicalDocument([["Cmaj7"]]), id: "memo-source" });
  const first = realization(base);
  const changed = publish({ ...musicalDocument([["Dm7"]]), id: "memo-source" });
  const next = realization(changed);
  expect(next).not.toBe(first);
  const binding = [...next.realizations.values()][0];
  if (binding?.kind !== "generated") throw new Error("Expected the new generated chord");
  expect(binding.request.resolved.source.sourceText).toBe("Dm7");
  expect(literalPitches(changed)).not.toEqual(literalPitches(base));
  for (const change of [
    { id: "memo-other-document" }, { tempoBpm: 121 }, { title: "New title" },
    { key: { tonic: { step: "D", alter: 0 }, mode: "natural-minor" } },
  ]) {
    // Re-arm the original object memo, then publish a fresh conflicting source.
    expect(realization(base)).toBe(first);
    expect(realization(publish({ ...base, ...change }))).not.toBe(first);
  }
});

test("playback reuse preserves each of twelve transposed charts with the same stable IDs", () => {
  let previous: ReturnType<typeof realization> | undefined;
  for (const [semitones, root] of ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"].entries()) {
    const base = publish({ ...musicalDocument([[`${root}maj7`]]), id: "memo-transposition" });
    const first = realization(base);
    expect(first).not.toBe(previous);
    const changed = publish({ ...base, playback: { ...base.playback, instrumentId: "vibraphone" } });
    expect(realization(changed)).toBe(first);
    const binding = [...first.realizations.values()][0];
    if (binding?.kind !== "generated") throw new Error("Expected generated transposition");
    expect(binding.request.resolved.source.sourceText).toBe(`${root}maj7`);
    const notes = literalPitches(changed).flat();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every(note => [0, 4, 7, 11].includes((note - semitones) % 12))).toBe(true);
    previous = first;
  }
});

for (const mode of ["manual", "frozen"] as const) test(`${mode} pitches retain negative zero, order and duplicate unisons across playback edits`, () => {
  const seed = loopArrangementFixture().state.document;
  const pitches = Array.from({ length: 16 }, (_, i) => ({ step: i % 2 === 0 ? "C" : "G", alter: 0, octave: i % 2 === 0 ? 4 : 3 }));
  const stored = { mode, bassPolicy: "included", pitches,
    ...(mode === "frozen" ? { generatedBy: { engineVersion: "manual-fixture-v1", family: "balanced" } } : {}) };
  const base = publish({ ...seed, id: `memo-${mode}`, sections: seed.sections.slice(0, 1).map(section => ({ ...section,
    measures: section.measures.map(measure => ({ ...measure, events: measure.events.map(event => ({ ...event, voicing: stored })) })),
  })) });
  const first = realization(base);
  const changed = publish({ ...base, playback: { ...base.playback, instrumentId: "vibraphone" } });
  expect(realization(changed)).toBe(first);
  const expected = [60, 55, 60, 55, 60, 55, 60, 55, 60, 55, 60, 55, 60, 55, 60, 55];
  expect(literalPitches(changed)).toEqual([expected]);
  const negativeZero = publish({ ...base, sections: base.sections.map(section => ({ ...section,
    measures: section.measures.map(measure => ({ ...measure, events: measure.events.map(event => ({ ...event,
      voicing: { ...stored, pitches: pitches.map((pitch, i) => i === 0 ? { ...pitch, alter: -0 } : pitch) },
    })) })),
  })) });
  const different = realization(negativeZero);
  expect(different).not.toBe(first);
  const event = negativeZero.sections[0]?.measures[0]?.events[0];
  if (event === undefined || event.voicing.mode === "auto") throw new Error("Missing exact stored pitches");
  expect(Object.is(event.voicing.pitches[0].alter, -0)).toBe(true);
  expect(literalPitches(negativeZero)).toEqual([expected]);
  realization(base);
  const moved = publish({ ...base, sections: base.sections.map(section => ({ ...section,
    measures: section.measures.map(measure => ({ ...measure, events: measure.events.map(chord => ({ ...chord,
      voicing: { ...stored, pitches: pitches.map((pitch, i) => i === 0 ? { ...pitch, octave: 5 } : pitch) },
    })) })),
  })) });
  expect(realization(moved)).not.toBe(first);
  expect(literalPitches(moved)).toEqual([[72, ...expected.slice(1)]]);
});
