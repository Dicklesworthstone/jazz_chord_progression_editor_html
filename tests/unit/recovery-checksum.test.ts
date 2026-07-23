import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  canonicalRecoveryJson,
  computeEnvelopeChecksum,
  decodeRecoveryEnvelope,
} from "../../src/persistence";

setDefaultTimeout(120_000);

const root = resolve(import.meta.dirname, "../..");

type EnvelopeCase = Readonly<{
  caseId: string;
  envelope?: Readonly<Record<string, unknown>>;
  expected: Readonly<{ outcome?: string; reasonCode?: string }>;
}>;

async function loadCases(): Promise<readonly EnvelopeCase[]> {
  const raw = await readFile(
    resolve(root, "tests/fixtures/recovery/envelope-cases.json"),
    "utf8",
  );
  return (JSON.parse(raw) as { cases: readonly EnvelopeCase[] }).cases;
}

describe("TR-A1-CHECKSUM frozen checksum algorithm", () => {
  test("A1-ENV-001/A1-ENV-002 production recomputes the independent goldens exactly", async () => {
    const cases = await loadCases();
    for (const id of ["A1-ENV-001", "A1-ENV-002"]) {
      const row = cases.find((candidate) => candidate.caseId === id);
      expect(row?.envelope).toBeDefined();
      if (row?.envelope === undefined) continue;
      const recomputed = await computeEnvelopeChecksum(row.envelope);
      expect(recomputed).toBe(row.envelope["checksum"] as string);
      const decoded = await decodeRecoveryEnvelope(
        JSON.stringify(row.envelope),
      );
      expect(decoded.outcome).toBe("valid");
    }
  });

  test("A1-ENV-003/A1-ENV-004 corruption witnesses fail the checksum with the stable code", async () => {
    const cases = await loadCases();
    for (const id of ["A1-ENV-003", "A1-ENV-004"]) {
      const row = cases.find((candidate) => candidate.caseId === id);
      expect(row?.envelope).toBeDefined();
      if (row?.envelope === undefined) continue;
      const decoded = await decodeRecoveryEnvelope(
        JSON.stringify(row.envelope),
      );
      expect(decoded.outcome).toBe("corrupt");
      expect(decoded.reasonCode).toBe("recovery.checksum_mismatch");
      expect(decoded.envelope).toBeNull();
    }
  });

  test("canonical JSON sorts keys at every depth without whitespace", () => {
    const canonical = canonicalRecoveryJson({
      b: [{ z: 1, a: 2 }],
      a: "x",
    });
    expect(canonical).toBe('{"a":"x","b":[{"a":2,"z":1}]}');
  });
});
