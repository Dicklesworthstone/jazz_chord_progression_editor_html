import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  E1_FIXTURE_FILES,
  applyMutation,
  validateE1Contract,
} from "../../scripts/validate-e1-contract";
import {
  MAX_MIDI_EXPORT_BYTES,
  MAX_MIDI_EXPORT_EVENTS,
  MAX_MIDI_EXPORT_FILENAME_CHARS,
  MAX_MIDI_EXPORT_MARKERS,
  MAX_MIDI_EXPORT_NOTES,
  MAX_MIDI_EXPORT_TEXT_UTF8_BYTES,
  MAX_MIDI_EXPORT_VLQ_VALUE,
  MAX_MIDI_EXPORT_TEMPO_BPM,
  MIDI_EXPORT_CHANNEL,
  MIDI_EXPORT_CONTRACT_SCHEMA,
  MIDI_EXPORT_DIVISION,
  MIDI_EXPORT_FORMAT,
  MIDI_EXPORT_LOSS_KINDS,
  MIDI_EXPORT_MARKER_SCHEMA,
  MIDI_EXPORT_META_TYPES,
  MIDI_EXPORT_NOTE_OFF_VELOCITY,
  MIDI_EXPORT_OPERATION_NAMES,
  MIDI_EXPORT_REFUSAL_CODES,
  MIDI_EXPORT_REPORT_SCHEMA,
  MIDI_EXPORT_REQUEST_SCHEMA,
  MIDI_EXPORT_RESULT_SCHEMA,
  MIDI_EXPORT_TRACK_COUNT,
  MIDI_EXPORT_VALIDATION_PRECEDENCE,
  MIDI_EXPORT_VELOCITY,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  MIDI_EXPORT_WRITER_VERSION_TAG,
  MIN_MIDI_EXPORT_TEMPO_BPM,
} from "../../src/export";

setDefaultTimeout(240_000);

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "tests/fixtures/midi-export");

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(resolve(fixtureDir, name), "utf8");
  return JSON.parse(raw) as unknown;
}

describe("E1 MIDI export contract authority", () => {
  test("the reviewed fixture authority validates with zero findings and exact counts", async () => {
    const report = await validateE1Contract();
    expect(report.findings).toEqual([]);
    expect(report.outcome).toBe("pass");
    expect(report.counts.files).toBe(7);
    expect(report.counts.goldenCases).toBe(6);
    expect(report.counts.refusalCases).toBe(15);
    expect(report.counts.limitCases).toBe(6);
    expect(report.counts.mutationControls).toBe(16);
    expect(report.counts.traces).toBe(13);
    expect(report.counts.authorities).toBe(4);
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
      const report = await validateE1Contract({
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
      resolve(root, "scripts/validate-e1-contract.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+"\.\.\/src\//u);
    expect(source).not.toMatch(/import\s*\(\s*"\.\.\/src\//u);
  });

  test("the public contract module stays aligned with the manifest", async () => {
    const manifest = (await loadFixture("e1-midi-export-contract.json")) as {
      identity: Record<string, unknown>;
      declaredFiles: readonly string[];
      smf: Record<string, unknown> & { metaTypes: Record<string, number> };
      tempo: Record<string, unknown>;
      limits: Record<string, unknown>;
      lossKinds: readonly string[];
      refusalCodes: readonly string[];
      validationPrecedence: readonly string[];
    };
    expect(manifest.identity["contractSchema"]).toBe(MIDI_EXPORT_CONTRACT_SCHEMA);
    expect(manifest.identity["requestSchema"]).toBe(MIDI_EXPORT_REQUEST_SCHEMA);
    expect(manifest.identity["resultSchema"]).toBe(MIDI_EXPORT_RESULT_SCHEMA);
    expect(manifest.identity["reportSchema"]).toBe(MIDI_EXPORT_REPORT_SCHEMA);
    expect(manifest.identity["markerSchema"]).toBe(MIDI_EXPORT_MARKER_SCHEMA);
    expect(manifest.identity["writerId"]).toBe(MIDI_EXPORT_WRITER_ID);
    expect(manifest.identity["writerVersion"]).toBe(MIDI_EXPORT_WRITER_VERSION);
    expect(manifest.identity["writerVersionTag"]).toBe(
      MIDI_EXPORT_WRITER_VERSION_TAG,
    );
    expect(manifest.identity["operationNames"]).toEqual([
      ...MIDI_EXPORT_OPERATION_NAMES,
    ]);
    expect(manifest.declaredFiles).toEqual([...E1_FIXTURE_FILES]);
    expect(manifest.smf["format"]).toBe(MIDI_EXPORT_FORMAT);
    expect(manifest.smf["trackCount"]).toBe(MIDI_EXPORT_TRACK_COUNT);
    expect(manifest.smf["division"]).toBe(MIDI_EXPORT_DIVISION);
    expect(manifest.smf["channel"]).toBe(MIDI_EXPORT_CHANNEL);
    expect(manifest.smf["noteOnVelocity"]).toBe(MIDI_EXPORT_VELOCITY);
    expect(manifest.smf["noteOffVelocity"]).toBe(MIDI_EXPORT_NOTE_OFF_VELOCITY);
    expect(manifest.smf["maxVlqValue"]).toBe(MAX_MIDI_EXPORT_VLQ_VALUE);
    expect(manifest.smf.metaTypes).toEqual({
      trackName: MIDI_EXPORT_META_TYPES.trackName,
      instrumentName: MIDI_EXPORT_META_TYPES.instrumentName,
      marker: MIDI_EXPORT_META_TYPES.marker,
      endOfTrack: MIDI_EXPORT_META_TYPES.endOfTrack,
      setTempo: MIDI_EXPORT_META_TYPES.setTempo,
      timeSignature: MIDI_EXPORT_META_TYPES.timeSignature,
    });
    expect(manifest.tempo["minBpm"]).toBe(MIN_MIDI_EXPORT_TEMPO_BPM);
    expect(manifest.tempo["maxBpm"]).toBe(MAX_MIDI_EXPORT_TEMPO_BPM);
    expect(manifest.limits["maxEvents"]).toBe(MAX_MIDI_EXPORT_EVENTS);
    expect(manifest.limits["maxNotes"]).toBe(MAX_MIDI_EXPORT_NOTES);
    expect(manifest.limits["maxMarkers"]).toBe(MAX_MIDI_EXPORT_MARKERS);
    expect(manifest.limits["maxTextUtf8Bytes"]).toBe(
      MAX_MIDI_EXPORT_TEXT_UTF8_BYTES,
    );
    expect(manifest.limits["maxFilenameChars"]).toBe(
      MAX_MIDI_EXPORT_FILENAME_CHARS,
    );
    expect(manifest.limits["maxBytes"]).toBe(MAX_MIDI_EXPORT_BYTES);
    expect(manifest.lossKinds).toEqual([...MIDI_EXPORT_LOSS_KINDS]);
    expect(manifest.refusalCodes).toEqual([...MIDI_EXPORT_REFUSAL_CODES]);
    expect(manifest.validationPrecedence).toEqual([
      ...MIDI_EXPORT_VALIDATION_PRECEDENCE,
    ]);
  });
});
