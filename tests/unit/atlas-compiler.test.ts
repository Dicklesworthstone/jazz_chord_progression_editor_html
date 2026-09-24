import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";
import {
  compileAtlasCorpus,
  computeFingerprints,
  makeAtlasQueryAdapter,
  sha256Sync,
} from "../../src/theory";
import type { AtlasSourceEntry } from "../../src/theory/atlas-contract";

describe("G1 Atlas Schema and Compiler Engine", () => {
  describe("sha256Sync deterministic hashing", () => {
    test("computes standard SHA-256 for empty string", () => {
      const hash = sha256Sync("");
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    test("matches the FIPS 180-2 published vectors", () => {
      expect(sha256Sync("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
      expect(sha256Sync("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))
        .toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    });

    test("agrees with node:crypto across padding boundaries and multi-byte UTF-8", () => {
      /* 55/56/63/64/65 bytes straddle the single-block padding boundary. */
      const inputs = ["Dm7-G7-Cmaj7", "D♭maj7 → G♭7", "𝄫 double flat", ...[55, 56, 63, 64, 65, 119, 120, 1000].map((n) => "x".repeat(n))];
      for (const input of inputs) {
        expect(`${String(input.length)}:${sha256Sync(input)}`).toBe(`${String(input.length)}:${createHash("sha256").update(input, "utf8").digest("hex")}`);
      }
    });
  });

  describe("computeFingerprints", () => {
    test("computes root interval deltas and cadence for ii-V-I", () => {
      const fps = computeFingerprints(["Dm7", "G7", "Cmaj7"], [4, 4, 4]);
      expect(fps.exactSpellingHash).toBeDefined();
      expect(fps.rootIntervalDeltas).toEqual([5, 5]); // D(2) -> G(7) delta 5, G(7) -> C(0) delta 5
      expect(fps.rhythmPatternProfile).toEqual(["4", "4", "4"]);
      expect(fps.cadenceProfile).toBe("perfect-authentic");
    });
  });

  describe("compileAtlasCorpus and Rights Firewall", () => {
    test("compiles valid public domain entry with complete fingerprints", () => {
      const entries: AtlasSourceEntry[] = [
        {
          entryId: "atlas_entry_test_1",
          title: "Standard ii-V-I",
          chords: ["Dm7", "G7", "Cmaj7"],
          durationBeats: [4, 4, 4],
          provenance: {
            rightsClass: "public-domain",
            commitAllowed: true,
            expressionBytePolicy: "embed-full",
            sourceEvidence: "Standard cadence template",
            payloadHash: "6bce5bffd4b5886aa5274d2d9183ecff0f9781489659ad00407e1baec55154e9",
          },
          practiceMetadata: {
            genre: "swing",
            suggestedTempoBpmRange: [120, 160],
            difficulty: "beginner",
            keyAreaTags: ["C-major"],
          },
        },
      ];

      const result = compileAtlasCorpus(entries);
      expect(result.compiled.entries.length).toBe(1);
      expect(result.rejections.rejectedCount).toBe(0);

      const entry = result.compiled.entries[0];
      expect(entry).toBeDefined();
      if (entry) {
        expect(entry.totalBeats).toBe(12);
        expect(entry.fingerprints.cadenceProfile).toBe("perfect-authentic");
      }
    });

    test("rights firewall rejects quarantined source entries", () => {
      const entries: AtlasSourceEntry[] = [
        {
          entryId: "atlas_entry_quarantined",
          title: "Quarantined Scrape",
          chords: ["Dm7", "G7", "Cmaj7"],
          provenance: {
            rightsClass: "quarantined",
            commitAllowed: false,
            expressionBytePolicy: "reject",
            sourceEvidence: "Unknown source",
            payloadHash: "6bce5bffd4b5886aa5274d2d9183ecff0f9781489659ad00407e1baec55154e9",
          },
          practiceMetadata: {
            genre: "bebop",
            suggestedTempoBpmRange: [120, 160],
            difficulty: "intermediate",
            keyAreaTags: ["C-major"],
          },
        },
      ];

      const result = compileAtlasCorpus(entries);
      expect(result.compiled.entries.length).toBe(0);
      expect(result.rejections.rejectedCount).toBe(1);
      expect(result.rejections.records[0]?.reasonCode).toBe("g1.quarantined_source");
    });

    test("rights firewall rejects protected expression smuggling", () => {
      const entries: AtlasSourceEntry[] = [
        {
          entryId: "atlas_entry_protected_smuggled",
          title: "Protected Arrangement",
          chords: ["Dm7", "G7", "Cmaj7"],
          provenance: {
            rightsClass: "protected-fingerprint-only",
            commitAllowed: true,
            expressionBytePolicy: "embed-full",
            sourceEvidence: "Copyrighted book",
            payloadHash: "6bce5bffd4b5886aa5274d2d9183ecff0f9781489659ad00407e1baec55154e9",
          },
          practiceMetadata: {
            genre: "ballad",
            suggestedTempoBpmRange: [60, 80],
            difficulty: "advanced",
            keyAreaTags: ["C-major"],
          },
        },
      ];

      const result = compileAtlasCorpus(entries);
      expect(result.compiled.entries.length).toBe(0);
      expect(result.rejections.rejectedCount).toBe(1);
      expect(result.rejections.records[0]?.reasonCode).toBe("g1.rights_violation");
    });
  });

  describe("AtlasQueryAdapter", () => {
    test("queries compiled entries by ID, genre, and root intervals", () => {
      const entries: AtlasSourceEntry[] = [
        {
          entryId: "atlas_entry_swing_1",
          title: "Swing ii-V-I",
          chords: ["Dm7", "G7", "Cmaj7"],
          durationBeats: [4, 4, 4],
          provenance: {
            rightsClass: "public-domain",
            commitAllowed: true,
            expressionBytePolicy: "embed-full",
            sourceEvidence: "Standard template",
            payloadHash: "6bce5bffd4b5886aa5274d2d9183ecff0f9781489659ad00407e1baec55154e9",
          },
          practiceMetadata: {
            genre: "swing",
            suggestedTempoBpmRange: [120, 160],
            difficulty: "beginner",
            keyAreaTags: ["C-major"],
          },
        },
        {
          entryId: "atlas_entry_bop_1",
          title: "Bop Rhythm Vamp",
          chords: ["Bbmaj7", "G7", "Cm7", "F7"],
          durationBeats: [2, 2, 2, 2],
          provenance: {
            rightsClass: "public-domain",
            commitAllowed: true,
            expressionBytePolicy: "embed-full",
            sourceEvidence: "Standard contrafact",
            payloadHash: "6c1b71e518c8594ad248012d85da9fb8510ccab6a413d6aff38a556a741f0fae",
          },
          practiceMetadata: {
            genre: "bebop",
            suggestedTempoBpmRange: [180, 240],
            difficulty: "advanced",
            keyAreaTags: ["Bb-major"],
          },
        },
      ];

      const { compiled } = compileAtlasCorpus(entries);
      const adapter = makeAtlasQueryAdapter(compiled);

      expect(adapter.listAllEntries().length).toBe(2);
      expect(adapter.getEntryById("atlas_entry_swing_1")?.title).toBe("Swing ii-V-I");

      const bopFiltered = adapter.filterEntries({ genre: "bebop" });
      expect(bopFiltered.length).toBe(1);
      expect(bopFiltered[0]?.entryId).toBe("atlas_entry_bop_1");

      const intervalMatches = adapter.searchByRootIntervals([9, 5, 5]);
      expect(intervalMatches.length).toBe(1);
      expect(intervalMatches[0]?.entryId).toBe("atlas_entry_bop_1");
    });
  });

  describe("integrity, rights and query laws", () => {
    const entry = (chords: string[], overrides: Partial<AtlasSourceEntry["provenance"]> = {}): AtlasSourceEntry => ({
      entryId: `law_${chords.join("_").toLowerCase()}`,
      title: "Law fixture",
      chords,
      durationBeats: chords.map(() => 4),
      provenance: {
        rightsClass: "internal-original",
        commitAllowed: true,
        expressionBytePolicy: "embed-full",
        sourceEvidence: "Original law fixture",
        payloadHash: createHash("sha256").update(chords.join("-")).digest("hex"),
        ...overrides,
      },
      practiceMetadata: { genre: "swing", suggestedTempoBpmRange: [100, 120], difficulty: "beginner", keyAreaTags: [] },
    });

    test("any digest other than the payload's own SHA-256 is rejected", () => {
      expect(compileAtlasCorpus([entry(["C", "B"])]).compiled.entries).toHaveLength(1);
      for (const payloadHash of ["f".repeat(64), createHash("sha256").update("").digest("hex"), "0".repeat(64)]) {
        const result = compileAtlasCorpus([entry(["C", "B"], { payloadHash })]);
        expect(result.compiled.entries).toHaveLength(0);
        expect(result.rejections.records[0]?.reasonCode).toBe("g1.hash_mismatch");
      }
    });

    test("fingerprint-only entries keep their fingerprints but never the chords", () => {
      const compiled = compileAtlasCorpus([entry(["Dm7", "G7"], { rightsClass: "protected-fingerprint-only", expressionBytePolicy: "fingerprint-only" })]).compiled;
      expect(compiled.entries[0]?.chords).toEqual([]);
      expect(compiled.entries[0]?.fingerprints.rootIntervalDeltas).toEqual([5]);
      expect(JSON.stringify(compiled)).not.toContain("Dm7");
    });

    test("the manifest digest changes whenever the musical payload changes", () => {
      const first = compileAtlasCorpus([entry(["C", "B"])]).compiled.manifest.compiledPayloadHash;
      expect(compileAtlasCorpus([entry(["C", "B"])]).compiled.manifest.compiledPayloadHash).toBe(first);
      expect(compileAtlasCorpus([{ ...entry(["Dm7", "G7"]), entryId: "law_c_b" }]).compiled.manifest.compiledPayloadHash).not.toBe(first);
    });

    test("interval queries match whole intervals, not text fragments", () => {
      /* C -> B is 11 semitones up; a query for 1 must not match it, 11 must. */
      const adapter = makeAtlasQueryAdapter(compileAtlasCorpus([entry(["C", "B"])]).compiled);
      expect(adapter.searchByRootIntervals([1])).toHaveLength(0);
      expect(adapter.searchByRootIntervals([11])).toHaveLength(1);
    });
  });
});

