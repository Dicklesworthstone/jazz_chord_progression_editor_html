import { expect, test } from "bun:test";

import { domainOperations } from "../../src/domain";

const REVIEWED_OPERATION_ORDER = [
  "parseStableId",
  "createProductionStableIdFactory",
  "copyDomain",
  "makeSpelledPitchClass",
  "makeSpelledPitch",
  "makeMidiPitch",
  "pitchClassOf",
  "projectSpelledPitch",
  "frequencyForMidi",
  "compareSpelledPitchClasses",
  "compareSpelledPitches",
  "normalizeBeatValue",
  "makeBeatPosition",
  "makeBeatDuration",
  "addBeatValues",
  "subtractBeatValues",
  "compareBeatValues",
  "beatValueToMidiTicks",
  "makeBeatRange",
  "accumulateTimeline",
  "makeMeter",
  "makeTempoBpm",
  "measureCapacity",
  "makeKeyMode",
  "makeInstrumentId",
  "makeChordDegree",
  "validateChordDegreeArray",
  "validateOmissionArray",
  "makeMidiRange",
  "makeAutoVoiceCount",
  "makeChordSpec",
  "makeCustomChordSpec",
  "makeAutoVoicing",
  "makeManualVoicing",
  "makeFrozenVoicing",
  "makeChordEvent",
  "transitionFrozenToAuto",
  "makePlaybackSettings",
  "compareDomainPaths",
  "compareValidationIssues",
] as const;

test("F1 public operations implement exactly the reviewed callable surface", () => {
  expect(Object.isFrozen(domainOperations)).toBe(true);
  expect(Object.keys(domainOperations)).toEqual([...REVIEWED_OPERATION_ORDER]);
  expect(domainOperations.parseStableId("document", "runtime-doc").ok).toBe(true);
  const pitch = domainOperations.makeSpelledPitch({ step: "B", alter: 1, octave: 3 });
  expect(pitch.ok).toBe(true);
  if (!pitch.ok) throw new Error("reviewed pitch construction failed");
  expect(domainOperations.projectSpelledPitch(pitch.value)).toMatchObject({
    ok: true,
    value: { midi: 60 },
  });
  expect(domainOperations.compareDomainPaths(["events", 2], ["events", 10])).toBe(-1);
});
