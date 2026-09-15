import { expect, test } from "bun:test";
import { reviewMidiImportSource, sourceReviewPitches } from "../../src/application/studio-midi-source-review";
import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import { realDecodeFrame } from "../support/midi-import-test-kit";
import { batchChordFile } from "../support/midi-batch-fixtures";

// Independently authored SMF occurrences. Track 0 carries the known harmony;
// track 1 contributes boundaries, a short context note, and a drum-channel note.
function track(notes: readonly (readonly [number, number, number, number, number])[]): number[] {
  const vlq = (n: number): number[] => { const out = [n & 127]; for (let x = Math.floor(n / 128); x > 0; x = Math.floor(x / 128)) out.unshift((x & 127) | 128); return out; };
  const events = notes.flatMap(([on, off, key, channel, velocity]) => [
    { at: on, bytes: [144 + channel, key, velocity] }, { at: off, bytes: [128 + channel, key, 0] },
  ]).sort((a, b) => a.at - b.at || (a.bytes[0] ?? 0) - (b.bytes[0] ?? 0));
  let previous = 0;
  const bytes = [0, 255, 3, 5, 80, 105, 97, 110, 111]; // Piano
  for (const e of events) { bytes.push(...vlq(e.at - previous), ...e.bytes); previous = e.at; }
  bytes.push(0, 255, 47, 0);
  return [77, 84, 114, 107, (bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255, ...bytes];
}
function file(extra: readonly (readonly [number, number, number, number, number])[], transpose = 0): Uint8Array {
  return Uint8Array.from([77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, 2, 1, 224,
    ...batchChordFile({ bars: 3, transpose }).slice(14),
    ...track(extra.map(([on, off, key, channel, velocity]) => [on, off, key + transpose, channel, velocity] as const)),
  ]);
}
const span = { measureIndex: 1, startTick: 1920 };
const extras = [
  [1800, 1920, 48, 1, 71], // ends at start: excluded
  [1800, 2100, 52, 1, 72], // crossing start: retained, original ticks
  [1801, 1930, 50, 1, 70], // long note, short overlap: context only
  [1920, 1940, 55, 1, 73], // short attack exactly at start: contributes
  [2000, 2020, 57, 1, 74], // short later attack: context only
  [2100, 2300, 52, 1, 75], // repeat is a separate occurrence
  [2000, 2200, 35, 9, 76], // drum channel: excluded
  [3840, 4000, 59, 1, 77], // starts at end: excluded
] as const;

test("retained occurrences preserve boundaries, track/channel/velocity and duplicates over 12 transpositions", async () => {
  const importer = createStudioMidiImport(realDecodeFrame);
  for (let transpose = 0; transpose < 12; transpose++) {
    const preview = importer.replanWithOverrides(await importer.readFile("source.mid", file(extras, transpose)),
      { excludedTrackIndices: [], alternativeChoices: [], grooveStyleId: null, grid: "bar" });
    const before = JSON.stringify(preview);
    const result = reviewMidiImportSource(preview, span);
    expect(result.ok).toBe(true); if (!result.ok) throw Error(result.message);
    expect(result.review.notes.filter(n => n.trackIndex === 1).map(n => [n.onTick, n.offTick, n.midiPitch - transpose, n.channel, n.velocity, n.contributes])).toEqual([
      [1800, 2100, 52, 1, 72, true], [1801, 1930, 50, 1, 70, false], [1920, 1940, 55, 1, 73, true], [2000, 2020, 57, 1, 74, false], [2100, 2300, 52, 1, 75, true],
    ]);
    expect(result.review.occurrenceCount).toBe(9);
    expect(result.review.trackCount).toBe(2);
    expect(result.review.pitches.map(n => n.midiPitch - transpose)).toEqual([50, 52, 55, 57, 60, 64, 67, 71]);
    expect(result.review.notesVisited).toBe(20);
    expect(result.review.truncatedCount).toBe(0);
    expect(sourceReviewPitches(result.review, 52 + transpose)).toEqual([52 + transpose]);
    expect(sourceReviewPitches(result.review, 35 + transpose)).toBeNull();
    expect(reviewMidiImportSource(preview, span)).toEqual(result);
    expect(JSON.stringify(preview)).toBe(before);
    expect(Object.isFrozen(result.review.notes)).toBe(true);
    const excluded = reviewMidiImportSource(importer.replanWithOverrides(preview, { excludedTrackIndices: [1], alternativeChoices: [], grooveStyleId: null, grid: "bar" }), span);
    expect(excluded.ok).toBe(true); if (!excluded.ok) throw Error(excluded.message);
    expect(excluded.review.occurrenceCount).toBe(4);
    expect(excluded.review.pitches.map(n => n.midiPitch - transpose)).toEqual([60, 64, 67, 71]);
  }
});

test("bounded detail keeps exact counts and the entire dense pitch set; no silently truncated audition", async () => {
  const importer = createStudioMidiImport(realDecodeFrame);
  const notes = Array.from({ length: 80 }, (_, i) => [1920 + i * 10, 1925 + i * 10, 40 + i % 20, 1, 80] as const);
  const preview = importer.replanWithOverrides(await importer.readFile("dense.mid", file(notes)), { excludedTrackIndices: [], alternativeChoices: [], grooveStyleId: null, grid: "bar" });
  const result = reviewMidiImportSource(preview, span);
  expect(result.ok).toBe(true); if (!result.ok) throw Error(result.message);
  expect(result.review.notes.length).toBe(64);
  expect(result.review.occurrenceCount).toBe(84);
  expect(result.review.truncatedCount).toBe(20);
  expect(result.review.pitches.length).toBe(24);
  expect(sourceReviewPitches(result.review, "all")).toBeNull();
  expect(sourceReviewPitches(result.review, 59)).toEqual([59]);
  expect(reviewMidiImportSource(preview, { measureIndex: 1, startTick: 1919 }).ok).toBe(false);
  expect(reviewMidiImportSource({ ...preview, automation: null }, span).ok).toBe(false);
  expect(reviewMidiImportSource({ ...preview, decoded: null }, span).ok).toBe(false);
});

test("empty retained passages and the exact 16-pitch preview boundary remain honest", async () => {
  const importer = createStudioMidiImport(realDecodeFrame);
  const empty = reviewMidiImportSource(await importer.readFile("leading-silence.mid", batchChordFile({ leadingTicks: 1920 })), { measureIndex: 0, startTick: 0 });
  expect(empty.ok).toBe(true); if (!empty.ok) throw Error(empty.message);
  expect(empty.review.occurrenceCount).toBe(0);
  expect(empty.review.pitches).toEqual([]);
  expect(sourceReviewPitches(empty.review, "all")).toBeNull();
  for (const count of [12, 13]) {
    const preview = importer.replanWithOverrides(await importer.readFile("limit.mid", file(Array.from({ length: count }, (_, i) => [1930, 2030, 40 + i, 1, 90] as const))), { excludedTrackIndices: [], alternativeChoices: [], grooveStyleId: null, grid: "bar" });
    const result = reviewMidiImportSource(preview, span);
    expect(result.ok).toBe(true); if (!result.ok) throw Error(result.message);
    expect(result.review.pitches.length).toBe(count + 4);
    expect(sourceReviewPitches(result.review, "all")).toEqual(count === 12 ? [...Array.from({ length: 12 }, (_, i) => 40 + i), 60, 64, 67, 71] : null);
    expect(sourceReviewPitches(result.review, Number.NaN)).toBeNull();
  }
});
