import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  M0_FIXTURE_FILES,
  applyMutation,
  validateM0Contract,
} from "../../scripts/validate-m0-contract";
import {
  MAX_MIDI_IMPORT_BYTES,
  MAX_MIDI_IMPORT_CHORD_ALTERNATIVES,
  MAX_MIDI_IMPORT_EVENTS,
  MAX_MIDI_IMPORT_META_PAYLOAD_BYTES,
  MAX_MIDI_IMPORT_METER_CHANGES,
  MAX_MIDI_IMPORT_METER_DENOMINATOR_POWER,
  MAX_MIDI_IMPORT_METER_NUMERATOR,
  MAX_MIDI_IMPORT_NOTES,
  MAX_MIDI_IMPORT_PPQ,
  MAX_MIDI_IMPORT_REQUEST_ID_ASCII_LENGTH,
  MAX_MIDI_IMPORT_TEMPO_CHANGES,
  MAX_MIDI_IMPORT_TICK_HORIZON,
  MAX_MIDI_IMPORT_TRACKS,
  MAX_MIDI_IMPORT_VLQ_BYTES,
  MAX_MIDI_IMPORT_VLQ_VALUE,
  MIDI_IMPORT_ACCEPTED_FORMATS,
  MIDI_IMPORT_ALTERNATIVE_RANKING,
  MIDI_IMPORT_CANONICAL_SPELLINGS,
  MIDI_IMPORT_CONSUMED_META_TYPES,
  MIDI_IMPORT_CONTRACT_SCHEMA,
  MIDI_IMPORT_DECODE_MODEL_SCHEMA,
  MIDI_IMPORT_DEFAULT_METER_DENOMINATOR_POWER,
  MIDI_IMPORT_DEFAULT_METER_NUMERATOR,
  MIDI_IMPORT_DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER,
  MIDI_IMPORT_FIXED_META_LENGTHS,
  MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT,
  MIDI_IMPORT_IGNORED_EVENT_KINDS,
  MIDI_IMPORT_MATCH_TEMPLATES,
  MIDI_IMPORT_OPERATION_NAMES,
  MIDI_IMPORT_READER_ID,
  MIDI_IMPORT_READER_VERSION,
  MIDI_IMPORT_READER_VERSION_TAG,
  MIDI_IMPORT_REFUSAL_CODES,
  MIDI_IMPORT_REQUEST_ID_PATTERN_SOURCE,
  MIDI_IMPORT_REQUEST_SCHEMA,
  MIDI_IMPORT_RESOLUTION_REPORT_SCHEMA,
  MIDI_IMPORT_RESULT_SCHEMA,
  MIDI_IMPORT_SEQUENCE_NUMBER_LENGTHS,
  MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS,
  MIDI_IMPORT_SONORITY_REPORT_SCHEMA,
  MIDI_IMPORT_TOLERATED_META_TYPES,
  MIN_MIDI_IMPORT_PPQ,
} from "../../src/export/midi-import-contract";

setDefaultTimeout(240_000);

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "tests/fixtures/midi-import");

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(resolve(fixtureDir, name), "utf8");
  return JSON.parse(raw) as unknown;
}

describe("M0 MIDI import contract authority", () => {
  test("the reviewed fixture authority validates with zero findings and exact counts", async () => {
    const report = await validateM0Contract();
    expect(report.findings).toEqual([]);
    expect(report.outcome).toBe("pass");
    expect(report.counts.files).toBe(8);
    expect(report.counts.goldenCases).toBe(6);
    expect(report.counts.refusalCases).toBe(38);
    expect(report.counts.sonorityCases).toBe(8);
    expect(report.counts.resolutionCases).toBe(10);
    expect(report.counts.mutationControls).toBe(16);
    expect(report.counts.traces).toBe(15);
    expect(report.counts.authorities).toBe(5);
  });

  test("every named semantic mutation is caught with its expected finding", async () => {
    const mutations = (await loadFixture("mutation-controls.json")) as {
      controls: readonly {
        id: string;
        file: string;
        operation: string;
        pointer: string;
        value?: unknown;
        expectedFindingCode: string;
      }[];
    };
    expect(mutations.controls).toHaveLength(16);
    for (const control of mutations.controls) {
      const pristine = await loadFixture(control.file);
      const mutated = applyMutation(pristine, control);
      const report = await validateM0Contract({
        file: control.file,
        document: mutated,
      });
      expect(report.outcome, `${control.id} must fail validation`).toBe("fail");
      expect(
        report.findings.map((finding) => finding.code),
        `${control.id} must produce ${control.expectedFindingCode}`,
      ).toContain(control.expectedFindingCode);
    }
  });

  test("the validator imports no production source", async () => {
    const source = await readFile(
      resolve(root, "scripts/validate-m0-contract.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+"\.\.\/src\//u);
    expect(source).not.toMatch(/import\s*\(\s*"\.\.\/src\//u);
  });

  test("the public contract module stays aligned with the manifest", async () => {
    const manifest = (await loadFixture("m0-midi-import-contract.json")) as {
      identity: Record<string, unknown>;
      declaredFiles: readonly string[];
      smf: Record<string, unknown>;
      limits: Record<string, unknown>;
      sonorityLaws: Record<string, unknown>;
      resolutionLaws: Record<string, unknown>;
      templates: readonly Record<string, unknown>[];
      refusalCodes: readonly string[];
    };
    expect(manifest.identity["contractSchema"]).toBe(MIDI_IMPORT_CONTRACT_SCHEMA);
    expect(manifest.identity["requestSchema"]).toBe(MIDI_IMPORT_REQUEST_SCHEMA);
    expect(manifest.identity["resultSchema"]).toBe(MIDI_IMPORT_RESULT_SCHEMA);
    expect(manifest.identity["decodeModelSchema"]).toBe(
      MIDI_IMPORT_DECODE_MODEL_SCHEMA,
    );
    expect(manifest.identity["sonorityReportSchema"]).toBe(
      MIDI_IMPORT_SONORITY_REPORT_SCHEMA,
    );
    expect(manifest.identity["resolutionReportSchema"]).toBe(
      MIDI_IMPORT_RESOLUTION_REPORT_SCHEMA,
    );
    expect(manifest.identity["readerId"]).toBe(MIDI_IMPORT_READER_ID);
    expect(manifest.identity["readerVersion"]).toBe(MIDI_IMPORT_READER_VERSION);
    expect(manifest.identity["readerVersionTag"]).toBe(
      MIDI_IMPORT_READER_VERSION_TAG,
    );
    expect(manifest.identity["operationNames"]).toEqual([
      ...MIDI_IMPORT_OPERATION_NAMES,
    ]);
    expect(manifest.declaredFiles).toEqual([...M0_FIXTURE_FILES]);
    expect(manifest.smf["acceptedFormats"]).toEqual([
      ...MIDI_IMPORT_ACCEPTED_FORMATS,
    ]);
    expect(manifest.smf["minPpq"]).toBe(MIN_MIDI_IMPORT_PPQ);
    expect(manifest.smf["maxPpq"]).toBe(MAX_MIDI_IMPORT_PPQ);
    expect(manifest.smf["defaultTempoMicrosecondsPerQuarter"]).toBe(
      MIDI_IMPORT_DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER,
    );
    expect(manifest.smf["defaultMeter"]).toEqual({
      numerator: MIDI_IMPORT_DEFAULT_METER_NUMERATOR,
      denominatorPower: MIDI_IMPORT_DEFAULT_METER_DENOMINATOR_POWER,
    });
    expect(manifest.smf["consumedMetaTypes"]).toEqual({
      ...MIDI_IMPORT_CONSUMED_META_TYPES,
    });
    expect(manifest.smf["toleratedMetaTypes"]).toEqual({
      ...MIDI_IMPORT_TOLERATED_META_TYPES,
    });
    expect(manifest.smf["fixedMetaLengths"]).toEqual({
      ...MIDI_IMPORT_FIXED_META_LENGTHS,
    });
    expect(manifest.smf["sequenceNumberLengths"]).toEqual([
      ...MIDI_IMPORT_SEQUENCE_NUMBER_LENGTHS,
    ]);
    expect(manifest.smf["ignoredEventKinds"]).toEqual([
      ...MIDI_IMPORT_IGNORED_EVENT_KINDS,
    ]);
    expect(manifest.smf["maxVlqBytes"]).toBe(MAX_MIDI_IMPORT_VLQ_BYTES);
    expect(manifest.smf["maxVlqValue"]).toBe(MAX_MIDI_IMPORT_VLQ_VALUE);
    expect(manifest.limits["maxBytes"]).toBe(MAX_MIDI_IMPORT_BYTES);
    expect(manifest.limits["maxTracks"]).toBe(MAX_MIDI_IMPORT_TRACKS);
    expect(manifest.limits["maxEvents"]).toBe(MAX_MIDI_IMPORT_EVENTS);
    expect(manifest.limits["maxNotes"]).toBe(MAX_MIDI_IMPORT_NOTES);
    expect(manifest.limits["maxTickHorizon"]).toBe(MAX_MIDI_IMPORT_TICK_HORIZON);
    expect(manifest.limits["maxTempoChanges"]).toBe(
      MAX_MIDI_IMPORT_TEMPO_CHANGES,
    );
    expect(manifest.limits["maxMeterChanges"]).toBe(
      MAX_MIDI_IMPORT_METER_CHANGES,
    );
    expect(manifest.limits["maxMetaPayloadBytes"]).toBe(
      MAX_MIDI_IMPORT_META_PAYLOAD_BYTES,
    );
    expect(manifest.limits["maxMeterNumerator"]).toBe(
      MAX_MIDI_IMPORT_METER_NUMERATOR,
    );
    expect(manifest.limits["maxMeterDenominatorPower"]).toBe(
      MAX_MIDI_IMPORT_METER_DENOMINATOR_POWER,
    );
    expect(manifest.limits["maxRequestIdAsciiLength"]).toBe(
      MAX_MIDI_IMPORT_REQUEST_ID_ASCII_LENGTH,
    );
    expect(manifest.limits["requestIdPatternSource"]).toBe(
      MIDI_IMPORT_REQUEST_ID_PATTERN_SOURCE,
    );
    expect(manifest.sonorityLaws["simultaneityWindowMicroseconds"]).toBe(
      MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS,
    );
    expect(manifest.sonorityLaws["gridDivisionsPerBeat"]).toBe(
      MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT,
    );
    expect(manifest.resolutionLaws["ranking"]).toEqual([
      ...MIDI_IMPORT_ALTERNATIVE_RANKING,
    ]);
    expect(manifest.resolutionLaws["maxAlternatives"]).toBe(
      MAX_MIDI_IMPORT_CHORD_ALTERNATIVES,
    );
    expect(manifest.resolutionLaws["canonicalSpellings"]).toEqual(
      MIDI_IMPORT_CANONICAL_SPELLINGS.map((spelling) => ({ ...spelling })),
    );
    expect(manifest.templates).toEqual(
      MIDI_IMPORT_MATCH_TEMPLATES.map((template) => ({
        id: template.id,
        formulaRuleId: template.formulaRuleId,
        realizationId: template.realizationId,
        extensionNumber: template.extensionNumber,
        pitchClassOffsets: [...template.pitchClassOffsets],
        omissibleFifth: template.omissibleFifth,
      })),
    );
    expect(manifest.refusalCodes).toEqual([...MIDI_IMPORT_REFUSAL_CODES]);
  });

  test("the round-trip golden restates the accepted E1 writer golden byte-for-byte", async () => {
    const m0Golden = (await loadFixture("golden-cases.json")) as {
      cases: readonly { id: string; bytesHex?: string }[];
    };
    const e1Raw = await readFile(
      resolve(root, "tests/fixtures/midi-export/golden-cases.json"),
      "utf8",
    );
    const e1Golden = JSON.parse(e1Raw) as {
      cases: readonly { id: string; bytesHex: string }[];
    };
    const m0Case = m0Golden.cases.find((record) => record.id === "M0-GLD-001");
    const e1Case = e1Golden.cases.find((record) => record.id === "E1-GLD-001");
    expect(m0Case?.bytesHex).toBeDefined();
    expect(e1Case?.bytesHex).toBeDefined();
    expect(m0Case?.bytesHex).toBe(e1Case?.bytesHex ?? "");
  });
});
