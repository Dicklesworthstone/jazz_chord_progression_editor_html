/**
 * E0 chart-text round trip against the reviewed text goldens
 * (jcpe-milestone-reliable-studio-l3a.8.2). The oracle is fixture bytes
 * authored 2026-07, long before either production half existed: the
 * golden .txt parses through the REAL T0 document-mode parser, becomes a
 * candidate through the new section-8.3 builder with a deterministic
 * test-owned ID factory, crosses the REAL F3 semantic validation, and is
 * re-exported through the lead-sheet text coordinator — which must
 * reproduce the golden bytes exactly. This simultaneously certifies the
 * builder and the text exporter, or honestly fails one of them.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import { buildChartDocumentCandidate } from "../../src/application";
import {
  CHART_IMPORT_DEFAULTS,
  CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
} from "../../src/application/e0-interchange-contract";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import type { StableIdFactory, StableIdFor, StableIdKind } from "../../src/domain";
import {
  createLeadSheetTextExportCoordinator,
  sanitizeExportFilename,
} from "../../src/export/interchange";
import {
  formatChordSymbol,
  parseChartText,
} from "../../src/theory";

const fixtureRoot = resolve(import.meta.dirname, "../fixtures/interchange");

/** Deterministic, collision-free, crypto-independent test factory. */
function makeTestIdFactory(): StableIdFactory {
  const counters = new Map<string, number>();
  return {
    next: <K extends StableIdKind>(kind: K) => {
      const count = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, count);
      return {
        ok: true as const,
        value: `${kind}-${String(count).padStart(4, "0")}` as StableIdFor<K>,
        source: "deterministic-test" as const,
      };
    },
  };
}

async function roundTrip(goldenFile: string): Promise<{
  original: string;
  exported: string | null;
  refusal: unknown;
}> {
  const original = await readFile(resolve(fixtureRoot, goldenFile), "utf8");
  const parsed = parseChartText(
    original,
    { mode: "document" },
    CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
  );
  expect(`${goldenFile} parse ok=${String(parsed.ok)}`).toBe(
    `${goldenFile} parse ok=true`,
  );
  if (!parsed.ok) return { original, exported: null, refusal: parsed.diagnostics };

  const candidate = buildChartDocumentCandidate(
    parsed.draft,
    makeTestIdFactory(),
  );
  expect(`${goldenFile} build ok=${String(candidate.ok)}`).toBe(
    `${goldenFile} build ok=true`,
  );
  if (!candidate.ok) return { original, exported: null, refusal: candidate };

  const validated = validateDocumentSemantics(candidate.value);
  expect(`${goldenFile} f3 ok=${String(validated.ok)}`).toBe(
    `${goldenFile} f3 ok=true`,
  );
  if (!validated.ok) return { original, exported: null, refusal: validated };

  const exportText = createLeadSheetTextExportCoordinator({
    formatChordSymbol,
    parseChartText,
    supportedDocumentProjectionEquals: () => true,
    sanitizeExportFilename,
  });
  const exported = exportText({
    document: validated.value,
    accidentalStyle: CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
    contextualAnalysis: "none",
  });
  if (!exported.ok) {
    return { original, exported: null, refusal: exported.refusal };
  }
  return { original, exported: exported.value.text, refusal: null };
}

describe("E0 chart-text golden round trip", () => {
  const goldens: readonly Readonly<{
    file: string;
    bytes: number;
    sha256: string;
  }>[] = [
    {
      file: "goldens/minimal.changes.txt",
      bytes: 60,
      sha256:
        "0fc780c103673d387cc0497abbb4cf9baaf2ad6cb3ec224a4326c96030fc659e",
    },
    {
      file: "goldens/rich.changes.txt",
      bytes: 153,
      sha256:
        "e138e8b20e526f6fef3a4d81105d92a747422e166d678cc87594ba39ed516504",
    },
  ];

  for (const golden of goldens) {
    test(`${golden.file} re-exports byte-identically with the pinned sha`, async () => {
      const outcome = await roundTrip(golden.file);
      expect(JSON.stringify(outcome.refusal ?? null)).toBe("null");
      expect(outcome.exported).toBe(outcome.original);
      if (outcome.exported === null) return;
      const bytes = new TextEncoder().encode(outcome.exported);
      expect(bytes.length).toBe(golden.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        golden.sha256,
      );
    });
  }

  test("the builder applies the disclosed defaults exactly", async () => {
    const original = await readFile(
      resolve(fixtureRoot, "goldens/minimal.changes.txt"),
      "utf8",
    );
    const parsed = parseChartText(
      original,
      { mode: "document" },
      CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
    );
    if (!parsed.ok) throw new Error("T0_PARSE_FAILED");
    const candidate = buildChartDocumentCandidate(
      parsed.draft,
      makeTestIdFactory(),
    );
    if (!candidate.ok) throw new Error("BUILD_FAILED");
    const value = candidate.value;
    expect(value.title).toBe("X");
    expect(value.playback.instrumentId).toBe("mellow-keys");
    expect(value.playback.grooveStyleId).toBeUndefined();
    const firstEvent = value.sections[0]?.measures[0]?.events[0];
    expect(firstEvent?.voicing as unknown).toEqual(CHART_IMPORT_DEFAULTS.autoVoicing);
    expect(String(value.id)).toBe("document-0001");
    expect(String(value.sections[0]?.id)).toBe("section-0001");
  });

  test("an id collision is total and exposes no partial candidate", async () => {
    const original = await readFile(
      resolve(fixtureRoot, "goldens/rich.changes.txt"),
      "utf8",
    );
    const parsed = parseChartText(
      original,
      { mode: "document" },
      CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
    );
    if (!parsed.ok) throw new Error("T0_PARSE_FAILED");
    const colliding: StableIdFactory = {
      next: <K extends StableIdKind>(kind: K) => ({
        ok: true as const,
        value: "same-id" as StableIdFor<K>,
        source: "deterministic-test" as const,
      }),
    };
    const candidate = buildChartDocumentCandidate(parsed.draft, colliding);
    expect(candidate.ok).toBe(false);
    if (!candidate.ok) {
      expect(candidate.code).toBe("import.chart_id_collision");
    }
  });

  test("a factory refusal maps to import.chart_id_factory_failed", async () => {
    const original = await readFile(
      resolve(fixtureRoot, "goldens/minimal.changes.txt"),
      "utf8",
    );
    const parsed = parseChartText(
      original,
      { mode: "document" },
      CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
    );
    if (!parsed.ok) throw new Error("T0_PARSE_FAILED");
    const refusing: StableIdFactory = {
      next: <K extends StableIdKind>(kind: K) => ({
        ok: false as const,
        refusal: {
          code: "id.entropy_unavailable" as const,
          kind,
          path: [] as const,
        },
      }),
    };
    const candidate = buildChartDocumentCandidate(parsed.draft, refusing);
    expect(candidate.ok).toBe(false);
    if (!candidate.ok) {
      expect(candidate.code).toBe("import.chart_id_factory_failed");
    }
  });
});
