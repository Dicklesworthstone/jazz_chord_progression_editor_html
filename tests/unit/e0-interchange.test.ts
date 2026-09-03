import { describe, expect, test } from "bun:test";
import minimalGolden from "../fixtures/interchange/goldens/minimal.changes.json";
import negativeZeroGolden from "../fixtures/interchange/goldens/negative-zero.changes.json";
import nestedGolden from "../fixtures/interchange/goldens/nested.changes.json";

import {
  decodeDocumentShape,
  createProductionStableIdFactory,
  type ValidatedDocument,
} from "../../src/domain";
import {
  classifyJsonLexically,
  decodeUtf8Fatal,
  buildChartDocumentCandidate,
  createE0ExportOperations,
  createE0V2TransactionDriver,
  createPrepareImportPreviewCoordinator,
  deliverExportArtifact,
  readImportSource,
  sanitizeExportFilename,
  serializeCanonicalJsonDocument,
  validateDocumentSemantics,
  type AppState,
  type ImportPayload,
  type ImportRequestIdentity,
  type ImportSourceHandle,
  type PrepareImportPreviewDependencies,
} from "../../src/application";
import {
  formatChordSymbol,
  parseChartText,
} from "../../src/theory";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function publishDoc(raw: unknown): ValidatedDocument {
  const decoded = decodeDocumentShape(raw);
  if (!decoded.ok) throw new Error("TEST_DOC_STRUCTURAL");
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error("TEST_DOC_SEMANTIC");
  return validated.value;
}

describe("E0 Export Interchange", () => {
  test("serializeCanonicalJsonDocument produces exact byte match for minimal golden", async () => {
    const doc = publishDoc(minimalGolden);
    const text = serializeCanonicalJsonDocument(doc);
    const bytes = new TextEncoder().encode(text);
    const hash = await sha256Hex(bytes);
    expect(hash).toBe("c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5");
    expect(bytes.byteLength).toBe(352);
  });

  test("serializeCanonicalJsonDocument preserves -0 in negative-zero golden", async () => {
    const doc = publishDoc(negativeZeroGolden);
    const text = serializeCanonicalJsonDocument(doc);
    const bytes = new TextEncoder().encode(text);
    const hash = await sha256Hex(bytes);
    expect(hash).toBe("2a5515c11bc083b03fa36b6a802049355a7a5ff90fdc7505860ea788358f9aad");
    expect(bytes.byteLength).toBe(409);
    expect(text).toContain('"masterVolume": -0,');
    expect(text).toContain('"reverbAmount": -0,');
  });

  test("serializeCanonicalJsonDocument produces valid JSON for nested golden", async () => {
    const doc = publishDoc(nestedGolden);
    const text = serializeCanonicalJsonDocument(doc);
    const parsed = JSON.parse(text);
    expect(parsed.id).toBe("document-e0-nested");
    expect(parsed.sections.length).toBe(1);
    expect(parsed.sections[0].measures.length).toBe(3);
  });

  test("sanitizeExportFilename sanitizes titles and handles reserved names", () => {
    expect(sanitizeExportFilename("", "canonical-json").filename).toBe("untitled-changes.json");
    expect(sanitizeExportFilename("   ", "lead-sheet-text").filename).toBe("untitled-changes.txt");
    expect(sanitizeExportFilename("My Song", "canonical-json").filename).toBe("My Song.changes.json");
    expect(sanitizeExportFilename("Song: Act 1", "canonical-json").filename).toBe("Song- Act 1.changes.json");
    expect(sanitizeExportFilename("CON", "canonical-json").filename).toBe("changes-CON.changes.json");
    expect(sanitizeExportFilename("aux.song", "lead-sheet-text").filename).toBe("changes-aux.song.changes.txt");
    expect(sanitizeExportFilename("Song.changes.json", "canonical-json").filename).toBe("Song.changes.json");
  });
});

describe("E0 Import Acquisition and Lexical Scan", () => {
  test("readImportSource reads and copies bytes up to limit", async () => {
    const identity: ImportRequestIdentity = {
      requestId: 1,
      documentId: "doc-1",
      baseRevision: 1,
    };
    const testBytes = new TextEncoder().encode('{"schema":"changes.progression.v2"}');
    const source: ImportSourceHandle = {
      channel: "file",
      displayName: "test.json",
      mediaType: "application/json",
      declaredByteLength: testBytes.byteLength,
      readAtMost: async () => ({
        ok: true,
        bytes: testBytes,
        observedByteLength: testBytes.byteLength,
      }),
    };
    const controller = new AbortController();
    const result = await readImportSource({ identity, source }, controller.signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.observedByteLength).toBe(testBytes.byteLength);
      expect(result.value.bytes).toEqual(testBytes);
    }
  });

  test("readImportSource handles aborted signal", async () => {
    const identity: ImportRequestIdentity = {
      requestId: 1,
      documentId: "doc-1",
      baseRevision: 1,
    };
    const source: ImportSourceHandle = {
      channel: "file",
      displayName: "test.json",
      mediaType: "application/json",
      declaredByteLength: 10,
      readAtMost: async () => ({ ok: true, bytes: new Uint8Array(10), observedByteLength: 10 }),
    };
    const controller = new AbortController();
    controller.abort();
    const result = await readImportSource({ identity, source }, controller.signal);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("import.read_cancelled");
    }
  });

  test("classifyJsonLexically detects duplicate keys and escapes", () => {
    const dupJson = '{"a": 1, "a": 2}';
    const dupRes = classifyJsonLexically(dupJson);
    expect(dupRes.ok).toBe(false);
    if (!dupRes.ok) {
      expect(dupRes.code).toBe("import.json_duplicate_key");
    }

    const dupEscape = '{"\\u0061": 1, "a": 2}';
    const dupEscapeRes = classifyJsonLexically(dupEscape);
    expect(dupEscapeRes.ok).toBe(false);
    if (!dupEscapeRes.ok) {
      expect(dupEscapeRes.code).toBe("import.json_duplicate_key");
    }

    const validV2 = '{"schema": "changes.progression.v2", "id": "test"}';
    const v2Res = classifyJsonLexically(validV2);
    expect(v2Res.ok).toBe(true);
    if (v2Res.ok) {
      expect(v2Res.route).toBe("canonical-v2");
    }

    const future = '{"schema": "changes.progression.v3"}';
    const futureRes = classifyJsonLexically(future);
    expect(futureRes.ok).toBe(true);
    if (futureRes.ok) {
      expect(futureRes.route).toBe("future-canonical");
    }

    const legacy = '{"title": "Old", "sections": []}';
    const legacyRes = classifyJsonLexically(legacy);
    expect(legacyRes.ok).toBe(true);
    if (legacyRes.ok) {
      expect(legacyRes.route).toBe("unversioned-legacy");
    }
  });

  test("decodeUtf8Fatal rejects invalid UTF-8 byte sequences", () => {
    const invalidBytes = new Uint8Array([0xff, 0xfe, 0xfd]);
    const res = decodeUtf8Fatal(invalidBytes);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("import.utf8_invalid");
    }
  });
});

describe("E0 Chart Text Candidate Construction", () => {
  test("buildChartDocumentCandidate creates valid progression shape from T0 draft", () => {
    const text = '@title "T0 Test"\n@meter 4/4\n@tempo 120\n[A]\n| Cmaj7:2 Dm7:2 | G7:4 |\n';
    const parsed = parseChartText(text, { mode: "document" }, "ascii");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const idFactory = createProductionStableIdFactory();
    const candidateRes = buildChartDocumentCandidate(parsed.draft, idFactory);
    expect(candidateRes.ok).toBe(true);
    if (candidateRes.ok) {
      expect(candidateRes.value.title).toBe("T0 Test");
      expect(candidateRes.value.sections.length).toBe(1);
      expect(candidateRes.value.sections[0].measures.length).toBe(2);
    }
  });
});
