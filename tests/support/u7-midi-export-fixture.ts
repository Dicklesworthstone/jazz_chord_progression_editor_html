import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ValidatedDocument } from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import { publishA0Candidate } from "./a0-application-fixture";

/**
 * Materializes the U7 preview-cases fixture: builds the scenario documents
 * through the F2 decoder and F3 publication gate exactly as production sees
 * them. The auto-voicing policy per case is test-side construction knowledge
 * (the packet pins only its outcome through the authority-linked planSpec).
 */

export type U7PreviewCaseRecord = Readonly<{
  id: string;
  summary: string;
  scenario: Readonly<Record<string, unknown>>;
  upstreamScenario: Readonly<Record<string, unknown>>;
  planSpec: Readonly<Record<string, unknown>> | null;
  expectedPreview: Readonly<Record<string, unknown>>;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

type JsonObject = Record<string, unknown>;

const FIXTURE_PATH = resolve("tests/fixtures/midi-export-workflow/preview-cases.json");

export function u7PreviewCases(): readonly U7PreviewCaseRecord[] {
  const parsed = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as JsonObject;
  return (parsed["cases"] ?? []) as U7PreviewCaseRecord[];
}

const AUTO_VOICING_BY_CASE: Readonly<Record<string, JsonObject>> = {
  "U7-PRE-003": {
    mode: "auto",
    family: "balanced",
    voiceCount: 4,
    range: { lowMidi: 48, highMidi: 84 },
    bassPolicy: "none",
  },
  "U7-PRE-009": {
    mode: "auto",
    family: "rootless-a",
    voiceCount: 4,
    range: { lowMidi: 48, highMidi: 84 },
    bassPolicy: "external",
  },
};

function durationOf(beats: number): { numerator: number; denominator: number } {
  if (Number.isInteger(beats)) return { numerator: beats, denominator: 1 };
  return { numerator: Math.round(beats * 2), denominator: 2 };
}

function storedPitches(
  planSpec: JsonObject | null,
  eventId: string,
): unknown[] | null {
  if (planSpec === null) return null;
  const events = planSpec["events"];
  if (!Array.isArray(events)) return null;
  for (const event of events) {
    const record = event as JsonObject;
    if (record["eventId"] !== eventId) continue;
    const pitches = record["pitches"];
    if (!Array.isArray(pitches)) return null;
    return pitches.map((pitch) => {
      const spelled = pitch as JsonObject;
      return {
        step: spelled["step"],
        alter: spelled["alter"],
        octave: spelled["octave"],
      };
    });
  }
  return null;
}

export function u7DocumentForCase(
  entry: U7PreviewCaseRecord,
): ValidatedDocument {
  const scenario = entry.scenario;
  const meter = scenario["meter"] as JsonObject;
  const capacity =
    (Number(meter["beatsPerBar"]) * 4) / Number(meter["beatUnit"]);
  const sections = (scenario["sections"] as JsonObject[]).map(
    (section, sectionIndex) => {
      const events = section["events"] as JsonObject[];
      const measures: JsonObject[] = [];
      let cursor = 0;
      let measureOrdinal = 0;
      while (cursor < events.length) {
        const perMeasure: JsonObject[] = [];
        let beats = 0;
        while (cursor < events.length && beats < capacity) {
          const event = events[cursor] as JsonObject;
          perMeasure.push(event);
          beats += Number(event["durationBeats"]);
          cursor += 1;
        }
        if (perMeasure.length === 0) break;
        measures.push({
          id: `measure-${String(sectionIndex)}-${String(measureOrdinal)}`,
          events: perMeasure.map((event) => {
            const chord = event["chord"] as JsonObject;
            const voicing = event["voicing"] as JsonObject;
            const eventId = String(event["eventId"]);
            let chordValue: unknown;
            if (chord["kind"] === "custom") {
              const pitches = storedPitches(entry.planSpec, eventId) ?? [
                { step: "C", alter: 0, octave: 4 },
              ];
              chordValue = {
                kind: "custom",
                sourceText: String(chord["label"]),
                label: String(chord["label"]),
                pitchNames: pitches.map((pitch) => {
                  const spelled = pitch as JsonObject;
                  return { step: spelled["step"], alter: spelled["alter"] };
                }),
                bass: null,
              };
            } else {
              const parsed = parseChordSymbol(
                String(chord["sourceText"]),
                "unicode",
              );
              if (!parsed.ok) {
                throw new Error(`U7_TEST_PARSE:${String(chord["sourceText"])}`);
              }
              chordValue = parsed.chord;
            }
            let voicingValue: unknown;
            if (voicing["mode"] === "auto") {
              voicingValue = AUTO_VOICING_BY_CASE[entry.id] ?? {
                mode: "auto",
                family: "balanced",
                voiceCount: 4,
                range: { lowMidi: 48, highMidi: 84 },
                bassPolicy: "generated",
              };
            } else if (voicing["mode"] === "frozen") {
              voicingValue = {
                mode: "frozen",
                pitches: storedPitches(entry.planSpec, eventId),
                bassPolicy: "included",
                generatedBy: {
                  engineVersion: "changes.voicing-candidates@1",
                  family: "balanced",
                },
              };
            } else {
              voicingValue = {
                mode: "manual",
                pitches: storedPitches(entry.planSpec, eventId),
                bassPolicy: "included",
              };
            }
            return {
              id: eventId,
              duration: durationOf(Number(event["durationBeats"])),
              annotation: "",
              chord: chordValue,
              voicing: voicingValue,
            };
          }),
          completion:
            beats >= capacity
              ? { kind: "complete" }
              : {
                  kind: "incomplete",
                  expectedDuration: { numerator: capacity, denominator: 1 },
                  reason: "fixture measure",
                },
        });
        measureOrdinal += 1;
      }
      if (measures.length === 0) {
        measures.push({
          id: `measure-${String(sectionIndex)}-0`,
          events: [],
          completion: { kind: "empty" },
        });
      }
      return {
        id: `section-${String(sectionIndex)}`,
        name: section["name"],
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "continue",
        measures,
      };
    },
  );
  return publishA0Candidate({
    schema: "changes.progression.v2",
    id: scenario["documentId"],
    title: scenario["title"],
    description: "",
    meter: scenario["meter"],
    tempoBpm: scenario["tempoBpm"],
    key: { tonic: { step: "C", alter: 0 }, mode: "major" },
    sections,
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
    },
  });
}
