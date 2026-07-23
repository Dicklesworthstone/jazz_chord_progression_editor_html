import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  A1_FIXTURE_FILES,
  applyMutation,
  validateA1Contract,
} from "../../scripts/validate-a1-contract";

setDefaultTimeout(120_000);

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "tests/fixtures/recovery");

async function loadFixtures(): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    A1_FIXTURE_FILES.map(async (name) => {
      const raw = await readFile(resolve(fixtureDir, name), "utf8");
      return [name, JSON.parse(raw)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

describe("A1 recovery contract authority", () => {
  test("the reviewed fixture authority validates with zero findings", async () => {
    const report = await validateA1Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
    expect(report.envelopeCases).toBe(10);
    expect(report.schedulerCases).toBe(10);
    expect(report.adapterCases).toBe(8);
    expect(report.startupCases).toBe(12);
    expect(report.exportCases).toBe(8);
    expect(report.traces).toBe(11);
    expect(report.authorities).toBe(7);
    expect(report.mutationControls).toBe(21);
  });

  test("every named semantic mutation is caught with its expected finding", async () => {
    const fixtures = await loadFixtures();
    const mutations = fixtures["mutation-controls.json"] as {
      controls: readonly {
        id: string;
        file: string;
        pointer: string;
        value: unknown;
        expectedFindingCode: string;
      }[];
    };
    expect(mutations.controls).toHaveLength(21);
    for (const control of mutations.controls) {
      const overlay: Record<string, unknown> = { ...fixtures };
      overlay[control.file] = applyMutation(
        fixtures[control.file],
        control.pointer,
        control.value,
      );
      const report = await validateA1Contract(overlay);
      expect(report.outcome, `${control.id} must fail validation`).toBe(
        "fail",
      );
      expect(
        report.findings.map((finding) => finding.code),
        `${control.id} must produce ${control.expectedFindingCode}`,
      ).toContain(control.expectedFindingCode);
    }
  });

  test("the validator imports no production source", async () => {
    const source = await readFile(
      resolve(root, "scripts/validate-a1-contract.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+"\.\.\/src\//u);
    expect(source).not.toMatch(/import\s*\(\s*"\.\.\/src\//u);
  });

  test("the public recovery contract module stays aligned with the manifest", async () => {
    const contract = await import("../../src/persistence/recovery-contract");
    const manifest = JSON.parse(
      await readFile(
        resolve(fixtureDir, "a1-recovery-contract.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(manifest["contractSchema"]).toBe(
      contract.RECOVERY_CONTRACT_SCHEMA,
    );
    expect(manifest["envelopeSchema"]).toBe(contract.RECOVERY_ENVELOPE_SCHEMA);
    expect(manifest["exportBindingSchema"]).toBe(
      contract.RECOVERY_EXPORT_BINDING_SCHEMA,
    );
    expect(manifest["checksumAlgorithm"]).toBe(
      contract.RECOVERY_CHECKSUM_ALGORITHM,
    );
    expect(manifest["keyPrefix"]).toBe(contract.RECOVERY_KEY_PREFIX);
    expect(manifest["adapterKinds"]).toEqual([
      ...contract.RECOVERY_ADAPTER_KINDS,
    ]);
    expect(manifest["slots"]).toEqual([...contract.RECOVERY_SLOTS]);
    expect(manifest["operationNames"]).toEqual([
      ...contract.RECOVERY_OPERATION_NAMES,
    ]);
    expect(manifest["refusalCodes"]).toEqual([
      ...contract.RECOVERY_REFUSAL_CODES,
    ]);
    expect(manifest["startupDispositions"]).toEqual([
      ...contract.RECOVERY_STARTUP_DISPOSITIONS,
    ]);
    expect(manifest["statusVocabulary"]).toEqual({
      ...contract.RECOVERY_STATUS_VOCABULARY,
    });
    expect(manifest["workCounterNames"]).toEqual([
      ...contract.RECOVERY_WORK_COUNTER_NAMES,
    ]);
    const limits = manifest["limits"] as Record<string, unknown>;
    expect(limits["idleDelayMs"]).toBe(contract.RECOVERY_IDLE_DELAY_MS);
    expect(limits["maxDelayMs"]).toBe(contract.RECOVERY_MAX_DELAY_MS);
    expect(limits["envelopeBytesIndexeddb"]).toBe(
      contract.MAX_RECOVERY_ENVELOPE_BYTES_INDEXEDDB,
    );
    expect(limits["envelopeBytesLocalstorage"]).toBe(
      contract.MAX_RECOVERY_ENVELOPE_BYTES_LOCALSTORAGE,
    );
    expect(limits["maxKeyLength"]).toBe(contract.MAX_RECOVERY_KEY_LENGTH);
    expect(limits["maxReasonCodeLength"]).toBe(
      contract.MAX_RECOVERY_REASON_CODE_LENGTH,
    );
    expect(limits["maxPendingWrites"]).toBe(
      contract.MAX_RECOVERY_PENDING_WRITES,
    );
  });
});
