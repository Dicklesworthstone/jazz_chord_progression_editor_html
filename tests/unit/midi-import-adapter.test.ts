/**
 * The import adapter boundary.
 *
 * The byte decoder crosses one narrow seam — bytes in, `i32` words out — and
 * this file proves the seam rather than the decoder: an injected frame drives
 * the whole export-layer pipeline, a frame that is not the M0 decoder's refuses
 * instead of publishing a half model, and the application service turns a
 * decoded preview into exactly the chart text one Quick Entry command carries.
 *
 * It also proves the symbol-text law: every rendered chord comes from the real
 * T0 formatter and re-parses under the real T0 grammar, so the import cannot
 * fork the chord vocabulary.
 */
import { describe, expect, test } from "bun:test";

import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import {
  MIDI_IMPORT_MATCH_TEMPLATES,
  createMidiImportOperations,
  planMidiImportChart,
  symbolTextForAlternative,
  type MidiImportChordAlternative,
  type SmfDecodeFrame,
} from "../../src/export";
import { MIDI_IMPORT_CANONICAL_SPELLINGS } from "../../src/export/midi-import-contract";
import { parseChartText, parseChordSymbol } from "../../src/theory";
import { makeMeter } from "../../src/domain";
import {
  hexToBytes,
  importRequest,
  realDecodeFrame,
  requireGoldenCase,
} from "../support/midi-import-test-kit";

function alternativeFor(
  templateIndex: number,
  inversion: "root" | "slash",
  matchKind: "exact" | "omitted-fifth",
): MidiImportChordAlternative {
  const template = MIDI_IMPORT_MATCH_TEMPLATES[templateIndex];
  if (template === undefined) throw new Error("missing template");
  return Object.freeze({
    templateId: template.id,
    formulaRuleId: template.formulaRuleId,
    realizationId: template.realizationId,
    extensionNumber: template.extensionNumber,
    rootPitchClass: 0,
    rootSpelled: MIDI_IMPORT_CANONICAL_SPELLINGS[0],
    bassPitchClass: inversion === "slash" ? 4 : 0,
    inversion,
    matchKind,
    missingDegreeNumbers: Object.freeze(
      matchKind === "omitted-fifth" ? [5] : [],
    ),
  });
}

describe("the injected decode boundary", () => {
  test("a frame that is not the M0 decoder's refuses instead of publishing", () => {
    const empty: SmfDecodeFrame = () => new Int32Array(0);
    const operations = createMidiImportOperations(empty);
    const result = operations.decodeSmf(
      importRequest("m0-adapter", new Uint8Array([0, 1, 2, 3])),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe("smf.header_invalid");
    expect(result.refusal.partialResult).toBe(false);
  });

  test("a recorded frame drives the identical pipeline as the live decoder", async () => {
    const bytes = hexToBytes(requireGoldenCase("M0-GLD-002").bytesHex);
    const live = await realDecodeFrame();
    const recorded = live(bytes);
    const replay: SmfDecodeFrame = () => Int32Array.from(recorded);
    const fromLive = createMidiImportOperations(live).decodeSmf(
      importRequest("m0-live", bytes),
    );
    const fromReplay = createMidiImportOperations(replay).decodeSmf(
      importRequest("m0-live", bytes),
    );
    expect(fromReplay).toEqual(fromLive);
  });
});

describe("symbol text goes through the T0 formatter", () => {
  test("every template renders text the real T0 grammar re-parses", () => {
    for (
      let index = 0;
      index < MIDI_IMPORT_MATCH_TEMPLATES.length;
      index += 1
    ) {
      const template = MIDI_IMPORT_MATCH_TEMPLATES[index];
      if (template === undefined) continue;
      const kinds: readonly ("exact" | "omitted-fifth")[] =
        template.omissibleFifth ? ["exact", "omitted-fifth"] : ["exact"];
      for (const inversion of ["root", "slash"] as const) {
        for (const matchKind of kinds) {
          const text = symbolTextForAlternative(
            alternativeFor(index, inversion, matchKind),
          );
          expect(text).not.toBeNull();
          if (text === null) continue;
          const reparsed = parseChordSymbol(text, "ascii");
          expect(reparsed.ok).toBe(true);
        }
      }
    }
  });
});

describe("decoded results become one Quick Entry command's chart text", () => {
  test("the emitted fragment parses under the real T0 fragment grammar", async () => {
    const decodeFrame = await realDecodeFrame();
    const operations = createMidiImportOperations(decodeFrame);
    const meter = makeMeter({ beatsPerBar: 4, beatUnit: 4 });
    expect(meter.ok).toBe(true);
    if (!meter.ok) return;
    for (const id of [
      "M0-GLD-001",
      "M0-GLD-002",
      "M0-GLD-003",
      "M0-GLD-004",
      "M0-GLD-006",
    ]) {
      const entry = requireGoldenCase(id);
      const result = operations.decodeSmf(
        importRequest("m0-chart", hexToBytes(entry.bytesHex)),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const plan = planMidiImportChart(result.value, "Imported");
      expect(plan).not.toBeNull();
      if (plan === null) continue;
      const parsed = parseChartText(
        plan.chartText,
        { mode: "fragment", meter: meter.value },
        "ascii",
      );
      expect(parsed.ok).toBe(true);
    }
  });

  test("a file with no nameable sonority yields no chart and states why", async () => {
    const decodeFrame = await realDecodeFrame();
    const service = createStudioMidiImport(() => Promise.resolve(decodeFrame));
    const preview = await service.readFile(
      "cluster.mid",
      hexToBytes(requireGoldenCase("M0-GLD-005").bytesHex),
    );
    expect(preview.refusal).toBeNull();
    expect(preview.plan).toBeNull();
    expect(preview.blockedReason).toContain("nothing to write");
  });

  test("the preview names every unnamed sonority literally", async () => {
    const decodeFrame = await realDecodeFrame();
    const operations = createMidiImportOperations(decodeFrame);
    const result = operations.decodeSmf(
      importRequest(
        "m0-custom",
        hexToBytes(requireGoldenCase("M0-GLD-004").bytesHex),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = planMidiImportChart(result.value, "Imported");
    expect(plan).not.toBeNull();
    if (plan === null) return;
    const unnamed = plan.sonorities.filter((entry) => !entry.written);
    expect(unnamed.length).toBe(1);
    expect(unnamed[0]?.symbolText).toBeNull();
    /* The literal dyad, canonically spelled, bass first. */
    expect(unnamed[0]?.customPitchNames).toEqual(["C", "E"]);
    expect(plan.unnamedSonorityCount).toBe(1);
  });

  test("the file name becomes the imported section's name", async () => {
    const decodeFrame = await realDecodeFrame();
    const service = createStudioMidiImport(() => Promise.resolve(decodeFrame));
    const preview = await service.readFile(
      "Blue Bossa.mid",
      hexToBytes(requireGoldenCase("M0-GLD-002").bytesHex),
    );
    expect(preview.plan?.sectionName).toBe("Blue Bossa");
    expect(preview.plan?.chartText.startsWith("[Blue Bossa]")).toBe(true);
  });
});
