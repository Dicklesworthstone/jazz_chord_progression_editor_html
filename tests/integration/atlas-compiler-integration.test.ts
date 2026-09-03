import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileAtlasCorpus,
  makeAtlasQueryAdapter,
} from "../../src/theory";
import type { AtlasRejectionRecord, AtlasSourceEntry } from "../../src/theory/atlas-contract";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/atlas-compiler",
);

describe("G1 Comprehensive Conformance and Evidence", () => {
  test("compiles independent source corpus fixtures and verifies against golden expectations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "source-corpus-fixtures.json"), "utf8");
    const data = JSON.parse(raw) as { entries: AtlasSourceEntry[] };

    const { compiled, rejections } = compileAtlasCorpus(data.entries);
    expect(rejections.rejectedCount).toBe(0);
    expect(compiled.entries.length).toBe(3);

    expect(compiled.manifest.totalPublicDomain).toBe(2);
    expect(compiled.manifest.totalPermissive).toBe(1);
    expect(compiled.manifest.totalOriginal).toBe(0);

    const autumnEntry = compiled.entries.find((e) => e.entryId === "atlas_entry_autumn_leaves_ii_v_i");
    expect(autumnEntry).toBeDefined();
    if (autumnEntry) {
      expect(autumnEntry.totalBeats).toBe(28);
      expect(autumnEntry.fingerprints.rootIntervalDeltas).toEqual([5, 5, 5, 6, 5, 5]);
      expect(autumnEntry.fingerprints.cadenceProfile).toBe("imperfect-authentic");
    }
  });

  test("rights firewall reliably catches all planted failures", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "planted-rights-failures.json"), "utf8");
    const data = JSON.parse(raw) as {
      plantedFailures: Array<AtlasSourceEntry & { expectedRejection: string }>;
    };

    const { compiled, rejections } = compileAtlasCorpus(data.plantedFailures);
    expect(compiled.entries.length).toBe(0);
    expect(rejections.rejectedCount).toBe(data.plantedFailures.length);

    for (const planted of data.plantedFailures) {
      const match = rejections.records.find((r) => r.entryId === planted.entryId);
      expect(match).toBeDefined();
      if (match) {
        expect(match.reasonCode).toBe(planted.expectedRejection as AtlasRejectionRecord["reasonCode"]);
      }
    }
  });

  test("deterministic byte-for-byte reproducibility across runs", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "source-corpus-fixtures.json"), "utf8");
    const data = JSON.parse(raw) as { entries: AtlasSourceEntry[] };

    const run1 = compileAtlasCorpus(data.entries);
    const run2 = compileAtlasCorpus(data.entries);

    expect(JSON.stringify(run1.compiled)).toBe(JSON.stringify(run2.compiled));
    expect(JSON.stringify(run1.rejections)).toBe(JSON.stringify(run2.rejections));
    expect(run1.compiled.manifest.compiledPayloadHash).toBe(run2.compiled.manifest.compiledPayloadHash);
  });

  test("Atlas query adapter executes faceted queries offline without network dependency", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "source-corpus-fixtures.json"), "utf8");
    const data = JSON.parse(raw) as { entries: AtlasSourceEntry[] };

    const { compiled } = compileAtlasCorpus(data.entries);
    const adapter = makeAtlasQueryAdapter(compiled);

    // Filter by genre
    const modalEntries = adapter.filterEntries({ genre: "modal" });
    expect(modalEntries.length).toBe(1);
    expect(modalEntries[0]?.entryId).toBe("atlas_entry_modal_dorian_impression");

    // Filter by cadence
    const iacEntries = adapter.filterEntries({ cadenceType: "imperfect-authentic" });
    expect(iacEntries.length).toBe(1);
    expect(iacEntries[0]?.entryId).toBe("atlas_entry_autumn_leaves_ii_v_i");

    // Search by root intervals
    const bopDeltas = [9, 5, 5];
    const bopMatches = adapter.searchByRootIntervals(bopDeltas);
    expect(bopMatches.length).toBe(1);
    expect(bopMatches[0]?.entryId).toBe("atlas_entry_rhythm_changes_a_section");
  });
});
