/**
 * E1-TRACE-REFUSALS and E1-TRACE-STALE evidence.
 *
 * Every reviewed near-miss refuses with its named code and pointer in the
 * frozen validation precedence; a mismatched document pairing refuses
 * rather than exporting stale state; no refusal carries a partial result.
 * Expected values come only from the reviewed fixtures.
 */
import { describe, expect, test } from "bun:test";

import { MIDI_EXPORT_VALIDATION_PRECEDENCE, exportMidi } from "../../src/export";
import {
  applyE1Override,
  compactRequestForCase,
  loadRefusalCases,
  materializeE1Request,
  overriddenBaseRequest,
  pathToPointer,
  requireGoldenCase,
  requireRefusal,
} from "../support/midi-export-test-kit";

describe("E1 reviewed refusal near-misses", () => {
  test("all fifteen fixture cases refuse with their named code and pointer", async () => {
    const cases = await loadRefusalCases();
    expect(cases.length).toBe(15);
    for (const refusalCase of cases) {
      const refusal = requireRefusal(
        exportMidi(await overriddenBaseRequest(refusalCase.override)),
      );
      expect(`${refusalCase.id}:${refusal.code}`).toBe(
        `${refusalCase.id}:${refusalCase.expected.code}`,
      );
      expect(`${refusalCase.id}:${pathToPointer(refusal.path)}`).toBe(
        `${refusalCase.id}:${refusalCase.expected.pointer}`,
      );
      expect(refusal.partialResult).toBe(false);
    }
  });

  test("every fixture refusal code appears in the frozen precedence", async () => {
    const cases = await loadRefusalCases();
    for (const refusalCase of cases) {
      expect(MIDI_EXPORT_VALIDATION_PRECEDENCE).toContain(
        refusalCase.expected.code as
          (typeof MIDI_EXPORT_VALIDATION_PRECEDENCE)[number],
      );
    }
  });
});

describe("E1 stale-state discipline (E1-REF-005)", () => {
  test("a documentId that does not match the plan refuses midi.document_mismatch", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/documentId",
          value: "doc-e1-other",
        }),
      ),
    );
    expect(refusal.code).toBe("midi.document_mismatch");
    expect(pathToPointer(refusal.path)).toBe("/documentId");
  });

  test("a negative source revision refuses before the document pairing check", async () => {
    const base = await compactRequestForCase(
      await requireGoldenCase("E1-GLD-001"),
    );
    const doubled = applyE1Override(
      applyE1Override(base, { path: "/sourceRevision", value: -1 }),
      { path: "/documentId", value: "doc-e1-other" },
    );
    const refusal = requireRefusal(exportMidi(materializeE1Request(doubled)));
    expect(refusal.code).toBe("midi.revision_invalid");
  });
});

describe("E1 precedence resolves double faults to the earlier stage", () => {
  test("an invalid request id wins over an invalid tempo", async () => {
    const base = await compactRequestForCase(
      await requireGoldenCase("E1-GLD-001"),
    );
    const doubled = applyE1Override(
      applyE1Override(base, { path: "/requestId", value: "bad id!" }),
      { path: "/plan/tempoBpm", value: 999 },
    );
    const refusal = requireRefusal(exportMidi(materializeE1Request(doubled)));
    expect(refusal.code).toBe("midi.request_id_invalid");
  });

  test("invalid text wins over an unbound marker", async () => {
    const base = await compactRequestForCase(
      await requireGoldenCase("E1-GLD-001"),
    );
    const doubled = applyE1Override(
      applyE1Override(base, { path: "/markers/0/eventId", value: "event-9999" }),
      { path: "/title", value: "line\nbreak" },
    );
    const refusal = requireRefusal(exportMidi(materializeE1Request(doubled)));
    expect(refusal.code).toBe("midi.text_invalid");
  });
});

describe("E1 defensive pin refusals beyond the fixture near-misses", () => {
  test("a foreign plan compiler id refuses midi.plan_invalid at its field", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan/compilerId",
          value: "changes.other-compiler",
        }),
      ),
    );
    expect(refusal.code).toBe("midi.plan_invalid");
    expect(pathToPointer(refusal.path)).toBe("/plan/compilerId");
  });

  test("a duplicated note number inside one event refuses midi.plan_invalid", async () => {
    const base = await compactRequestForCase(
      await requireGoldenCase("E1-GLD-001"),
    );
    const doubled = applyE1Override(base, {
      path: "/plan/events/0/midiPitches/1",
      value: 60,
    });
    const refusal = requireRefusal(exportMidi(materializeE1Request(doubled)));
    expect(refusal.code).toBe("midi.plan_invalid");
    expect(pathToPointer(refusal.path)).toBe("/plan/events/0/midiPitches");
  });

  test("a wrong event ordinal refuses midi.plan_invalid at the ordinal", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/plan/events/0/ordinal",
          value: 5,
        }),
      ),
    );
    expect(refusal.code).toBe("midi.plan_invalid");
    expect(pathToPointer(refusal.path)).toBe("/plan/events/0/ordinal");
  });
});
