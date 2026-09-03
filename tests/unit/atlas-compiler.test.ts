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

    test("computes standard SHA-256 for test string", () => {
      const hash = sha256Sync("Dm7-G7-Cmaj7");
      expect(hash).toHaveLength(64);
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
            payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
            payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
            payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
            payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
            payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
});
