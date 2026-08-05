import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SmfPairedNote } from "../../src/export/midi-import-contract";
import type { M1TrackRole } from "../../src/export/midi-import-automation-contract";
import {
  automationTonicSpelling,
  planAutomationImport,
  spellPitchClassInKey,
  chunkImportFragment,
  classifyTrack,
  computeAutomationSpans,
  extractFeelFeatures,
  inferAutomationKey,
  planImportSections,
  rerankAlternativeIndices,
  selectGroove,
} from "../../src/export/midi-import-automation";
import { parseChartText } from "../../src/theory";
import { makeMeter } from "../../src/domain";

/**
 * Runs the PRODUCTION M1 pipeline functions against the independently
 * authored fixture packet (tests/fixtures/midi-import-automation/). The
 * validator recomputes the same families with its own reference
 * implementations; production and validator never share code, so agreement
 * here is two independent implementations meeting on the authored law.
 *
 * Every failure message carries the case name and the full recomputed
 * value so a red run is a complete forensic record on its own.
 */

const FIXTURE_DIR = join(
  import.meta.dir,
  "..",
  "fixtures",
  "midi-import-automation",
);
const readFixture = (file: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")) as unknown;

type NoteTuple = readonly [number, number, number, number];
const toNotes = (tuples: readonly NoteTuple[]): readonly SmfPairedNote[] =>
  tuples.map(([channel, key, onTick, offTick]) =>
    Object.freeze({ channel, key, onTick, offTick, onVelocity: 80 }),
  );

type FixtureTrack = Readonly<{
  name: string | null;
  instrumentName: string | null;
  notes: readonly NoteTuple[];
}>;
type FixtureRoleTrack = Readonly<{ role: string; notes: readonly NoteTuple[] }>;
const toRoleTracks = (tracks: readonly FixtureRoleTrack[]) =>
  tracks.map((track) => ({
    role: track.role as M1TrackRole,
    notes: toNotes(track.notes),
  }));

describe("M1 production pipeline vs the authored fixture packet", () => {
  test("classification-cases: role and rule agree case by case", () => {
    const family = readFixture("classification-cases.json") as {
      cases: readonly Readonly<{
        name: string;
        track: FixtureTrack;
        expected: Readonly<{ role: string; ruleFired: string }>;
      }>[];
    };
    for (const kase of family.cases) {
      const got = classifyTrack({
        index: 0,
        name: kase.track.name,
        instrumentName: kase.track.instrumentName,
        notes: toNotes(kase.track.notes),
      });
      expect(`${kase.name}:${got.role}:${got.ruleFired}`).toBe(
        `${kase.name}:${kase.expected.role}:${kase.expected.ruleFired}`,
      );
    }
  });

  test("segmentation-cases: spans agree tick for tick", () => {
    const family = readFixture("segmentation-cases.json") as {
      cases: readonly Readonly<{
        name: string;
        ppq: number;
        meterMap: readonly Readonly<{
          tick: number;
          numerator: number;
          denominatorPower: number;
        }>[];
        tracks: readonly FixtureRoleTrack[];
        expectedSpans: readonly Readonly<{
          measureIndex: number;
          depth: number;
          startTick: number;
          endTick: number;
          present: readonly number[];
          bass: number | null;
          silent: boolean;
        }>[];
      }>[];
    };
    for (const kase of family.cases) {
      const result = computeAutomationSpans(
        kase.ppq,
        kase.meterMap,
        toRoleTracks(kase.tracks),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const got = result.spans.map((span) => ({
        measureIndex: span.measureIndex,
        depth: span.depth,
        startTick: span.startTick,
        endTick: span.endTick,
        present: [...span.presentPitchClasses],
        bass: span.bassPitchClass,
        silent: span.silent,
      }));
      expect(
        JSON.stringify({ name: kase.name, spans: got }, null, 1),
      ).toBe(
        JSON.stringify({ name: kase.name, spans: kase.expectedSpans }, null, 1),
      );
    }
  });

  test("key-cases: winners, spellings, and 12-fold equivariance agree", () => {
    const family = readFixture("key-cases.json") as {
      cases: readonly Readonly<{
        name: string;
        masses: readonly number[];
        equivariance: boolean;
        expected: Readonly<{
          tonicPitchClass: number;
          mode: "major" | "minor";
          spelling: Readonly<{ step: string; alter: number }>;
        }> | null;
      }>[];
    };
    for (const kase of family.cases) {
      const got = inferAutomationKey(kase.masses);
      if (kase.expected === null) {
        expect(`${kase.name}:${got === null ? "null" : "some-key"}`).toBe(
          `${kase.name}:null`,
        );
        continue;
      }
      expect(got).not.toBeNull();
      if (got === null) continue;
      expect(`${kase.name}:${String(got.tonicPitchClass)}:${got.mode}`).toBe(
        `${kase.name}:${String(kase.expected.tonicPitchClass)}:${kase.expected.mode}`,
      );
      const spelling = automationTonicSpelling(got.tonicPitchClass, got.mode);
      expect(`${kase.name}:${spelling.step}:${String(spelling.alter)}`).toBe(
        `${kase.name}:${kase.expected.spelling.step}:${String(kase.expected.spelling.alter)}`,
      );
      if (kase.equivariance) {
        for (let shift = 0; shift < 12; shift += 1) {
          const shifted = new Array<number>(12).fill(0);
          for (let pc = 0; pc < 12; pc += 1) {
            shifted[(pc + shift) % 12] = kase.masses[pc] ?? 0;
          }
          const transposed = inferAutomationKey(shifted);
          expect(transposed).not.toBeNull();
          if (transposed === null) continue;
          expect(
            `${kase.name}+${String(shift)}:${String(transposed.tonicPitchClass)}:${transposed.mode}`,
          ).toBe(
            `${kase.name}+${String(shift)}:${String((got.tonicPitchClass + shift) % 12)}:${got.mode}`,
          );
        }
      }
    }
  });

  test("rerank-cases: comparator order agrees and is stable", () => {
    const family = readFixture("rerank-cases.json") as {
      cases: readonly Readonly<{
        name: string;
        key: Readonly<{
          tonicPitchClass: number;
          mode: "major" | "minor";
        }> | null;
        alternatives: readonly (readonly [number, string])[];
        expectedOrder: readonly number[];
      }>[];
    };
    for (const kase of family.cases) {
      const got = rerankAlternativeIndices(
        kase.key,
        kase.alternatives.map(([rootPitchClass, inversion]) => ({
          rootPitchClass,
          inversion: inversion === "root" ? ("root" as const) : ("slash" as const),
        })),
      );
      expect(`${kase.name}:${got.join(",")}`).toBe(
        `${kase.name}:${kase.expectedOrder.join(",")}`,
      );
    }
  });

  test("groove-cases: decisions and extracted features agree", () => {
    type Pair = readonly [number, number];
    const family = readFixture("groove-cases.json") as {
      decisionCases: readonly Readonly<{
        name: string;
        features: Readonly<Record<string, Pair>>;
        expected: Readonly<{ row: number; grooveStyleId: string }>;
      }>[];
      featureCases: readonly Readonly<{
        name: string;
        ppq: number;
        microsecondsPerQuarter: number;
        barCount: number;
        tracks: readonly FixtureRoleTrack[];
        expectedFeatures: Readonly<Record<string, Pair>>;
      }>[];
    };
    const toFeatures = (record: Readonly<Record<string, Pair>>) => {
      const out: Record<string, { numerator: number; denominator: number }> =
        {};
      for (const [name, pair] of Object.entries(record)) {
        out[name] = { numerator: pair[0], denominator: pair[1] };
      }
      return out as Parameters<typeof selectGroove>[0];
    };
    for (const kase of family.decisionCases) {
      const got = selectGroove(toFeatures(kase.features));
      expect(`${kase.name}:${String(got.row)}:${got.grooveStyleId}`).toBe(
        `${kase.name}:${String(kase.expected.row)}:${kase.expected.grooveStyleId}`,
      );
      expect(got.evidence).not.toMatch(/\{[a-zA-Z]+\}/);
    }
    for (const kase of family.featureCases) {
      const got = extractFeelFeatures({
        ppq: kase.ppq,
        microsecondsPerQuarter: kase.microsecondsPerQuarter,
        barCount: kase.barCount,
        tracks: toRoleTracks(kase.tracks),
      });
      for (const [name, pair] of Object.entries(kase.expectedFeatures)) {
        const value = got[name as keyof typeof got];
        const equal =
          value.numerator * pair[1] === pair[0] * value.denominator;
        expect(
          `${kase.name}:${name}:${String(value.numerator)}/${String(value.denominator)}:${String(equal)}`,
        ).toBe(`${kase.name}:${name}:${String(value.numerator)}/${String(value.denominator)}:true`);
      }
    }
  });

  test("transfer marker cases: section plans agree", () => {
    const family = readFixture("transfer-cases.json") as {
      markerCases: readonly Readonly<{
        name: string;
        fileName: string;
        markers: readonly (readonly [number, string])[];
        ppq?: number;
        expectedSections: readonly Readonly<{
          name: string;
          startMeasureIndex: number;
        }>[];
      }>[];
    };
    for (const kase of family.markerCases) {
      const got = planImportSections(
        kase.fileName,
        kase.markers.map(([tick, text]) => ({ tick, text })),
        kase.ppq ?? 480,
      );
      expect(JSON.stringify({ name: kase.name, sections: got })).toBe(
        JSON.stringify({ name: kase.name, sections: kase.expectedSections }),
      );
    }
  });

  test("envelope chunking cases: chunk plans agree", () => {
    const family = readFixture("envelope-cases.json") as {
      chunkingCases: readonly Readonly<{
        name: string;
        sectionHeaderCodePoints: number;
        measureTextCodePoints: readonly number[];
        expected: Readonly<{
          chunkCount: number | null;
          chunkMeasureCounts: readonly number[] | null;
          refusal: string | null;
        }>;
      }>[];
    };
    for (const kase of family.chunkingCases) {
      const got = chunkImportFragment(
        kase.sectionHeaderCodePoints,
        kase.measureTextCodePoints,
      );
      const normalized = got.ok
        ? {
            chunkCount: got.chunkCount,
            chunkMeasureCounts: [...got.chunkMeasureCounts],
            refusal: null,
          }
        : { chunkCount: null, chunkMeasureCounts: null, refusal: got.refusal };
      expect(JSON.stringify({ name: kase.name, plan: normalized })).toBe(
        JSON.stringify({ name: kase.name, plan: kase.expected }),
      );
    }
  });

  test("determinism: double runs are byte-identical", () => {
    const family = readFixture("segmentation-cases.json") as {
      cases: readonly Readonly<{
        name: string;
        ppq: number;
        meterMap: readonly Readonly<{
          tick: number;
          numerator: number;
          denominatorPower: number;
        }>[];
        tracks: readonly FixtureRoleTrack[];
      }>[];
    };
    for (const kase of family.cases) {
      const tracks = toRoleTracks(kase.tracks);
      const first = computeAutomationSpans(kase.ppq, kase.meterMap, tracks);
      const second = computeAutomationSpans(kase.ppq, kase.meterMap, tracks);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  test("key-aware spelling: degree walk and chromatic fallback", () => {
    const fSharpMajor = { tonicPitchClass: 6, mode: "major" as const };
    const eFlatMajor = { tonicPitchClass: 3, mode: "major" as const };
    const cases: readonly (readonly [
      Readonly<{ tonicPitchClass: number; mode: "major" | "minor" }> | null,
      number,
      string,
      number,
    ])[] = [
      [fSharpMajor, 5, "E", 1],
      [fSharpMajor, 8, "G", 1],
      [fSharpMajor, 6, "F", 1],
      [eFlatMajor, 8, "A", -1],
      [eFlatMajor, 10, "B", -1],
      [{ tonicPitchClass: 9, mode: "minor" }, 8, "G", 1],
      [fSharpMajor, 7, "G", 0],
      [null, 1, "D", -1],
    ];
    for (const [key, pc, step, alter] of cases) {
      const spelled = spellPitchClassInKey(key, pc);
      const label = key === null ? "none" : String(key.tonicPitchClass) + "/" + key.mode;
      expect(label + ":" + String(pc) + ":" + spelled.step + ":" + String(spelled.alter)).toBe(
        label + ":" + String(pc) + ":" + step + ":" + String(alter),
      );
    }
  });

  test("planAutomationImport: a small band file becomes a sectioned, keyed, grooved plan", () => {
    const ppq = 480;
    const bar = 4 * ppq;
    const chord = (
      keys: readonly number[],
      onTick: number,
      offTick: number,
      channel = 0,
    ) => keys.map((key) => ({ channel, key, onTick, offTick, onVelocity: 80 }));
    const pianoNotes = [
      ...chord([62, 65, 69, 72], 0, bar),
      ...chord([55, 59, 65, 71], bar, 2 * bar),
      ...chord([60, 64, 67, 71], 2 * bar, 4 * bar),
    ];
    const bassNotes = [
      { channel: 1, key: 38, onTick: 0, offTick: bar - 60, onVelocity: 80 },
      { channel: 1, key: 43, onTick: bar, offTick: 2 * bar - 60, onVelocity: 80 },
      { channel: 1, key: 36, onTick: 2 * bar, offTick: 4 * bar, onVelocity: 80 },
    ];
    const drumNotes = [0, 1, 2, 3].flatMap((barIndex) =>
      [0, ppq, 2 * ppq, 3 * ppq].map((beat) => ({
        channel: 9,
        key: 42,
        onTick: barIndex * bar + beat,
        offTick: barIndex * bar + beat + 30,
        onVelocity: 90,
      })),
    );
    const model = {
      header: { division: ppq },
      tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
      meterMap: [{ tick: 0, numerator: 4, denominatorPower: 2 }],
      tracks: [
        {
          index: 0,
          name: "Piano",
          instrumentName: null,
          markers: [
            { tick: 0, text: "Head" },
            { tick: 2 * bar, text: "Out" },
          ],
          notes: pianoNotes,
        },
        { index: 1, name: "Bass", instrumentName: null, markers: [], notes: bassNotes },
        { index: 2, name: "Drums", instrumentName: null, markers: [], notes: drumNotes },
      ],
    };
    const result = planAutomationImport({ model }, "session take 3.mid");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.plan;
    expect(plan.classifications.map((entry) => entry.role).join(",")).toBe(
      "harmony,bass,percussion",
    );
    expect(plan.sections.map((section) => section.name).join("|")).toBe(
      "Head|Out",
    );
    expect(plan.sections.map((section) => section.startMeasureIndex).join(",")).toBe(
      "0,2",
    );
    expect(plan.key).not.toBeNull();
    expect(plan.key?.mode ?? "none").toBe("major");
    expect(plan.key?.tonicPitchClass ?? -1).toBe(0);
    expect(plan.groove.evidence).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(plan.chartText).toContain("[Head]");
    expect(plan.chartText).toContain("[Out]");
    expect(plan.chartText).toContain("Dm7");
    expect(plan.chartText).toContain("G7");
    expect(plan.chartText).toContain("Cmaj7");
    expect(plan.measureCount).toBe(4);
    expect(plan.writtenChordCount).toBe(4);
    expect(plan.chunkTexts.length).toBe(1);
    expect(plan.chunkTexts.join("")).toBe(plan.chartText);
    expect(plan.usesExplicitDurations).toBe(false);
    expect(plan.initialMeter.numerator).toBe(4);
    expect(plan.tempoChangeCount).toBe(0);
    const second = planAutomationImport({ model }, "session take 3.mid");
    expect(JSON.stringify(second)).toBe(JSON.stringify(result));
  });

  test("dorian/raised degrees in minor keep their letters", () => {
    const aMinor = { tonicPitchClass: 9, mode: "minor" as const };
    const fSharp = spellPitchClassInKey(aMinor, 6);
    expect(`${fSharp.step}${String(fSharp.alter)}`).toBe("F1");
    const gSharp = spellPitchClassInKey(aMinor, 8);
    expect(`${gSharp.step}${String(gSharp.alter)}`).toBe("G1");
  });

  test("the emitted chart text parses under the real T0 grammar, whole and chunked", () => {
    const ppq = 480;
    const bar = 4 * ppq;
    const chordAt = (keys: readonly number[], onTick: number, offTick: number) =>
      keys.map((key) => ({ channel: 0, key, onTick, offTick, onVelocity: 80 }));
    const cycle = [
      [60, 64, 67, 71],
      [62, 65, 69, 72],
      [55, 59, 62, 65],
      [57, 60, 64, 67],
    ] as const;
    const notes = Array.from({ length: 900 }, (_, barIndex) =>
      chordAt(
        [...(cycle[barIndex % cycle.length] ?? cycle[0])],
        barIndex * bar,
        (barIndex + 1) * bar,
      ),
    ).flat();
    const model = {
      header: { division: ppq },
      tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
      meterMap: [{ tick: 0, numerator: 4, denominatorPower: 2 }],
      tracks: [
        {
          index: 0,
          name: "Piano",
          instrumentName: null,
          markers: [],
          notes,
        },
      ],
    };
    const result = planAutomationImport({ model }, "long-form.mid");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.plan;
    expect(plan.measureCount).toBe(900);
    expect(plan.chunkTexts.length).toBeGreaterThanOrEqual(2);
    const meter = makeMeter({ beatsPerBar: 4, beatUnit: 4 });
    expect(meter.ok).toBe(true);
    if (!meter.ok) return;
    for (const chunk of plan.chunkTexts) {
      let codePoints = 0;
      const scalars = chunk[Symbol.iterator]();
      while (!scalars.next().done) codePoints += 1;
      expect(codePoints).toBeLessThanOrEqual(4096);
      const parsed = parseChartText(chunk, { mode: "fragment", meter: meter.value }, "ascii");
      expect(`chunk-parse:${String(parsed.ok)}`).toBe("chunk-parse:true");
    }
    expect(plan.chunkTexts.length).toBeLessThanOrEqual(16);
    /*
     * Chunk continuation lines are separate fragments, so byte concatenation
     * differs from the single-line section body. The law is measure-sequence
     * equality: the chunks carry exactly the original bars, in order.
     */
    const barTokens = (text: string): readonly string[] =>
      text
        .split("\n")
        .filter((line) => line.length > 0 && !line.startsWith("["))
        .flatMap((line) => line.split("|"))
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
    expect(plan.chunkTexts.flatMap(barTokens).join("|")).toBe(
      barTokens(plan.chartText).join("|"),
    );
    const whole = parseChartText(plan.chartText, { mode: "fragment", meter: meter.value }, "ascii");
    expect(`whole-parse:${String(whole.ok)}`).toBe("whole-parse:true");
  });
});
