/**
 * E0 canonical-JSON production conformance (jcpe-milestone-reliable-studio
 * l3a.8.2). The expectations come only from the reviewed fixture packet
 * (tests/fixtures/interchange): the golden byte cases pin the exact
 * artifact bytes and SHA-256, authored before this production encoder
 * existed. Production is executed here strictly as a conformance subject;
 * the F2 decoder, F3 validator, and semantic-equality oracle are the real
 * independently owned dependencies, and the hash boundary is real Web
 * Crypto.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import { decodeDocumentShape, documentsSemanticallyEqual } from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import {
  prepareCanonicalJsonExport,
  sanitizeExportFilename,
  serializeCanonicalDocument,
} from "../../src/export/interchange-json";
import type { CanonicalJsonExportDependencies } from "../../src/export/interchange-contract";
import type { DomainPath, ValidatedDocument } from "../../src/domain";

const fixtureRoot = resolve(import.meta.dirname, "../fixtures/interchange");

const realDependencies: CanonicalJsonExportDependencies = Object.freeze({
  decodeDocumentShape,
  validateCanonicalRoundTrip: (candidate: unknown) => {
    const result = validateDocumentSemantics(candidate as any);
    if (result.ok) return { ok: true as const, value: result.value };
    return {
      ok: false as const,
      errors: result.errors.map((issue) => ({
        code: issue.code,
        path: issue.path,
      })) as unknown as readonly [
        Readonly<{ code: string; path: DomainPath }>,
        ...Readonly<{ code: string; path: DomainPath }>[],
      ],
    };
  },
  semanticallyEqualDocuments: documentsSemanticallyEqual,
  hashBytes: async (bytes: Uint8Array) => {
    const digest = createHash("sha256").update(bytes).digest("hex");
    return { ok: true as const, digest };
  },
  sanitizeExportFilename,
});

async function loadValidatedGolden(file: string): Promise<{
  document: ValidatedDocument;
  bytes: Uint8Array;
}> {
  const raw = await readFile(resolve(fixtureRoot, file));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
  const decoded = decodeDocumentShape(parsed);
  if (!decoded.ok) throw new Error(`GOLDEN_SHAPE_DECODE_FAILED: ${file}`);
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error(`GOLDEN_SEMANTICS_FAILED: ${file}`);
  return { document: validated.value, bytes: new Uint8Array(raw) };
}

type GoldenCase = Readonly<{
  id: string;
  inputFixtureIds: readonly string[];
  resultCategory: string;
  expectedGolden: Readonly<{
    file: string;
    bytes: number;
    sha256: string;
  }> | null;
}>;

async function goldenCases(): Promise<readonly GoldenCase[]> {
  const raw = await readFile(
    resolve(fixtureRoot, "canonical-json-cases.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as Readonly<{ cases: readonly GoldenCase[] }>;
  return parsed.cases.filter(
    (entry) => typeof entry.expectedGolden?.file === "string",
  );
}

describe("E0 canonical JSON export against the reviewed goldens", () => {
  test("every byte-golden case round-trips to the exact pinned artifact", async () => {
    const cases = await goldenCases();
    expect(cases.length).toBeGreaterThanOrEqual(2);
    for (const entry of cases) {
      const golden = entry.expectedGolden;
      if (golden === null) continue;
      const { document } = await loadValidatedGolden(golden.file);
      const result = await prepareCanonicalJsonExport(
        { document },
        realDependencies,
      );
      expect(`${entry.id} ok=${String(result.ok)}`).toBe(`${entry.id} ok=true`);
      if (!result.ok) continue;
      const bytes = new TextEncoder().encode(result.value.text);
      expect(`${entry.id} bytes=${String(bytes.length)}`).toBe(
        `${entry.id} bytes=${String(golden.bytes)}`,
      );
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(`${entry.id} sha=${digest}`).toBe(
        `${entry.id} sha=${golden.sha256}`,
      );
      expect(String(result.value.semanticDocumentHash)).toBe(golden.sha256);
      /* Byte identity against the golden file itself: importing the
       * reviewed artifact and re-exporting reproduces it exactly. */
      const original = await readFile(resolve(fixtureRoot, golden.file), "utf8");
      expect(result.value.text).toBe(original);
    }
  });

  test("nested golden re-exports byte-identically without a pinned sha row", async () => {
    const { document } = await loadValidatedGolden("goldens/nested.changes.json");
    const original = await readFile(
      resolve(fixtureRoot, "goldens/nested.changes.json"),
      "utf8",
    );
    const text = serializeCanonicalDocument(document);
    expect(text).toBe(original);
  });

  test("negative zero survives as the -0 token through the full gate", async () => {
    const { document } = await loadValidatedGolden(
      "goldens/negative-zero.changes.json",
    );
    const result = await prepareCanonicalJsonExport(
      { document },
      realDependencies,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text.includes("-0")).toBe(true);
  });

  test("a malformed hash envelope normalizes to export.hash_unavailable", async () => {
    const { document } = await loadValidatedGolden("goldens/minimal.changes.json");
    for (const raw of [
      null,
      42,
      { ok: true },
      { ok: true, digest: "XYZ" },
      { ok: true, digest: "a".repeat(63) },
      { ok: true, digest: "A".repeat(64) },
      { ok: true, digest: "a".repeat(64), extra: 1 },
    ]) {
      const result = await prepareCanonicalJsonExport(
        { document },
        { ...realDependencies, hashBytes: async () => raw },
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.refusal.code).toBe("export.hash_unavailable");
    }
    const throwing = await prepareCanonicalJsonExport(
      { document },
      {
        ...realDependencies,
        hashBytes: () => Promise.reject(new Error("boundary down")),
      },
    );
    expect(throwing.ok).toBe(false);
    if (!throwing.ok) {
      expect(throwing.refusal.code).toBe("export.hash_unavailable");
    }
  });

  test("a semantic-equality veto refuses without offering bytes", async () => {
    const { document } = await loadValidatedGolden("goldens/minimal.changes.json");
    const result = await prepareCanonicalJsonExport(
      { document },
      { ...realDependencies, semanticallyEqualDocuments: () => false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("export.canonical_semantic_mismatch");
    }
  });
});

describe("E0 safe filename projection", () => {
  test("blank titles take the exact fallback", () => {
    const out = sanitizeExportFilename("   ", "canonical-json");
    expect(out.filename).toBe("untitled-changes.json");
    expect(out.usedFallback).toBe(true);
  });

  test("forbidden runs collapse to one hyphen and extensions strip once", () => {
    const out = sanitizeExportFilename('My<>:"Tune.json', "canonical-json");
    expect(out.filename).toBe("My-Tune.changes.json");
    expect(out.changed).toBe(true);
  });

  test("reserved device basenames take the changes- prefix", () => {
    const out = sanitizeExportFilename("CON", "canonical-json");
    expect(out.filename).toBe("changes-CON.changes.json");
  });

  test("120-scalar truncation strips re-exposed trailing dots", () => {
    const long = `${"a".repeat(119)}.x`;
    const out = sanitizeExportFilename(long, "canonical-json");
    expect([...out.basename].length).toBeLessThanOrEqual(120);
    expect(out.basename.endsWith(".")).toBe(false);
  });

  test("ordinary unicode titles pass through with the owned extension", () => {
    const out = sanitizeExportFilename("Après Vous — Take 2", "lead-sheet-text");
    expect(out.filename).toBe("Après Vous — Take 2.changes.txt");
    expect(out.usedFallback).toBe(false);
  });
});
