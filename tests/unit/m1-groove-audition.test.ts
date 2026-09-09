import {expect,test} from "bun:test";
import {compileMidiGrooveAudition} from "../../src/application/studio-midi-audition";
import {createStudioMidiImport} from "../../src/application/studio-midi-import";
import {batchChordFile} from "../support/midi-batch-fixtures";
import {realDecodeFrame} from "../support/midi-import-test-kit";

test("four-bar private excerpt preserves source tempo and deterministic IDs across all twelve roots", async () => {
  const importer=createStudioMidiImport(realDecodeFrame);
  for(let transpose=0;transpose<12;transpose++) {
    const original=await importer.readFile("six-bars.mid",batchChordFile({bars:6,transpose}));
    const preview=importer.replanWithOverrides(original,{excludedTrackIndices:[],alternativeChoices:[],grooveStyleId:"block-chords@1"});
    const before=JSON.stringify(preview);
    const compiled=compileMidiGrooveAudition(importer,preview);
    expect(compiled.ok).toBe(true);
    if(!compiled.ok) throw new Error(compiled.message);
    expect(compiled.barCount).toBe(4);
    expect(compiled.plan.tempoBpm).toBe(120);
    expect(Number(compiled.plan.totalTicks)).toBe(15360);
    expect(compiled.plan.events.map(e=>Number(e.startTick))).toEqual([0,3840,7680,11520]);
    expect(compiled.plan.events.map(e=>Number(e.gateDurationTicks))).toEqual([3816,3816,3816,3816]);
    expect(compiled.plan.events.map(e=>e.velocity)).toEqual([96,96,96,96]);
    expect(compileMidiGrooveAudition(importer,preview)).toEqual(compiled);
    expect(JSON.stringify(preview)).toBe(before);
    expect(Object.isFrozen(compiled.plan)).toBe(true);
  }
});

test("selected groove changes the performance, while all-excluded refuses", async () => {
  const importer=createStudioMidiImport(realDecodeFrame);
  const preview=await importer.readFile("band.mid",batchChordFile({bars:4,tempo:600_000}));
  const planFor=(grooveStyleId:"block-chords@1"|"medium-swing@1",excludedTrackIndices:readonly number[]=[])=>compileMidiGrooveAudition(importer,
    importer.replanWithOverrides(preview,{excludedTrackIndices,alternativeChoices:[],grooveStyleId}));
  const block=planFor("block-chords@1"); const swing=planFor("medium-swing@1");
  expect(block.ok).toBe(true);expect(swing.ok).toBe(true);
  if(!block.ok || !swing.ok) throw new Error("groove refused");
  expect(swing.plan.tempoBpm).toBe(100);
  expect(swing.plan.events.length).toBeGreaterThan(block.plan.events.length);
  expect(new Set(swing.plan.events.map(e=>e.velocity)).size).toBeGreaterThan(1);
  expect(planFor("medium-swing@1",[0]).ok).toBe(false);
});
