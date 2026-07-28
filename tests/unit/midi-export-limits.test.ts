/**
 * E1-TRACE-LIMITS and E1-TRACE-FILENAME evidence.
 *
 * Exact boundary behavior: acceptance at each cap, refusal one past it,
 * and the frozen filename derivation including truncation at sixty-four
 * characters. Expected values come only from the reviewed fixtures.
 */
import { describe, expect, test } from "bun:test";

import { exportMidi } from "../../src/export";
import {
  applyE1Override,
  compactRequestForCase,
  loadLimitCases,
  materializeE1Request,
  overriddenBaseRequest,
  pathToPointer,
  requireExported,
  requireGoldenCase,
  requireRefusal,
  type E1LimitCase,
} from "../support/midi-export-test-kit";

async function runValidateCase(limitCase: E1LimitCase): Promise<void> {
  if (limitCase.override === undefined) {
    throw new Error(`limit case ${limitCase.id} has no override`);
  }
  const result = exportMidi(await overriddenBaseRequest(limitCase.override));
  const expected = limitCase.expected.refusal ?? null;
  if (expected === null) {
    requireExported(result);
    return;
  }
  const refusal = requireRefusal(result);
  expect(`${limitCase.id}:${refusal.code}`).toBe(
    `${limitCase.id}:${expected.code}`,
  );
  expect(`${limitCase.id}:${pathToPointer(refusal.path)}`).toBe(
    `${limitCase.id}:${expected.pointer}`,
  );
}

async function filenameFor(documentId: string): Promise<string> {
  const base = await compactRequestForCase(
    await requireGoldenCase("E1-GLD-001"),
  );
  const retargeted = applyE1Override(
    applyE1Override(base, { path: "/documentId", value: documentId }),
    { path: "/plan/documentId", value: documentId },
  );
  const value = requireExported(exportMidi(materializeE1Request(retargeted)));
  return value.report.filename;
}

describe("E1 reviewed limit cases", () => {
  test("every validate-kind fixture case lands exactly on its boundary", async () => {
    const cases = await loadLimitCases();
    expect(cases.length).toBe(6);
    for (const limitCase of cases) {
      if (limitCase.kind !== "validate") continue;
      await runValidateCase(limitCase);
    }
  });

  test("every filename-kind fixture case derives its exact filename", async () => {
    const cases = await loadLimitCases();
    for (const limitCase of cases) {
      if (limitCase.kind !== "filename") continue;
      if (limitCase.documentId === undefined) {
        throw new Error(`limit case ${limitCase.id} has no documentId`);
      }
      const filename = await filenameFor(limitCase.documentId);
      expect(`${limitCase.id}:${filename}`).toBe(
        `${limitCase.id}:${limitCase.expected.filename ?? ""}`,
      );
      expect(filename.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("E1 text byte caps beyond the reviewed cases", () => {
  test("a 96-byte multi-byte title exports and a 98-byte one refuses", async () => {
    const accepted = exportMidi(
      await overriddenBaseRequest({
        path: "/title",
        value: "é".repeat(48),
      }),
    );
    requireExported(accepted);
    const refused = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/title",
          value: "é".repeat(49),
        }),
      ),
    );
    expect(refused.code).toBe("midi.text_invalid");
    expect(pathToPointer(refused.path)).toBe("/title");
  });

  test("empty text refuses: the law is one to ninety-six bytes", async () => {
    const refusal = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({ path: "/voicingTrackName", value: "" }),
      ),
    );
    expect(refusal.code).toBe("midi.text_invalid");
    expect(pathToPointer(refusal.path)).toBe("/voicingTrackName");
  });
});

describe("E1 marker cap boundary", () => {
  test("8256 markers pass the count stage; the reviewed 8257 case refuses at /markers", async () => {
    const atCap = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/markers",
          value: { generateMarkers: 8256 },
        }),
      ),
    );
    expect(atCap.code).toBe("midi.marker_duplicate");
    const overCap = requireRefusal(
      exportMidi(
        await overriddenBaseRequest({
          path: "/markers",
          value: { generateMarkers: 8257 },
        }),
      ),
    );
    expect(overCap.code).toBe("midi.plan_invalid");
    expect(pathToPointer(overCap.path)).toBe("/markers");
  });
});
