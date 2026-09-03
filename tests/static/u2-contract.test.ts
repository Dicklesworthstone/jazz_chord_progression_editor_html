/**
 * Static contract test for U2 Chord Inspector Specification
 * (bead jcpe-milestone-reliable-studio-l3a.11.1).
 *
 * Verifies:
 * - Public types, constants, schemas, and limits match the reviewed validator
 * - validateU2Contract() passes with zero findings and exact counts
 * - Companion files, byte digests, and semantic digest match frozen pins
 * - Mutation controls are properly formed and reference valid cases
 * - Module source policy obeys layer boundaries (imports only domain and theory)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

import {
  INSPECTOR_TABS,
  MAX_ANNOTATION_CODE_POINTS,
  MAX_MANUAL_VOICING_NOTES,
  MIN_MANUAL_VOICING_NOTES,
  PIANO_DEFAULT_VISIBLE_MAX_MIDI,
  PIANO_DEFAULT_VISIBLE_MIN_MIDI,
  PIANO_MAX_MIDI,
  PIANO_MIN_MIDI,
  PIANO_NOTE_ROLES,
  U2_BEAD_ID,
  U2_CONTRACT_SCHEMA,
  U2_MANIFEST_SCHEMA,
  U2_PACKAGE,
  U2_POLICY_ID,
  U2_POLICY_VERSION,
  U2_REFUSAL_CODES,
  VOICING_MODES,
} from "../../src/ui/studio/u2-chord-inspector-contract";

import {
  U2_EXPECTED_COMPANIONS,
  U2_EXPECTED_COUNTS,
  U2_REVIEWED_BEAD_ID,
  U2_REVIEWED_CONTRACT_SCHEMA,
  U2_REVIEWED_MANIFEST_SCHEMA,
  U2_REVIEWED_PACKAGE,
  U2_REVIEWED_PIANO_BOUNDS,
  U2_REVIEWED_PIANO_NOTE_ROLES,
  U2_REVIEWED_POLICY_ID,
  U2_REVIEWED_POLICY_VERSION,
  U2_REVIEWED_REFUSAL_CODES,
  U2_REVIEWED_TABS,
  U2_REVIEWED_VOICING_MODES,
  U2_SPEC_BYTE_DIGESTS,
  U2_SPEC_SEMANTIC_DIGEST,
  validateU2Contract,
} from "../../scripts/validate-u2-contract";

describe("U2 Chord Inspector Specification Contract", () => {
  test("reviewed constants and schemas match code-facing module", () => {
    expect(U2_CONTRACT_SCHEMA).toBe(U2_REVIEWED_CONTRACT_SCHEMA);
    expect(U2_MANIFEST_SCHEMA).toBe(U2_REVIEWED_MANIFEST_SCHEMA);
    expect(U2_PACKAGE).toBe(U2_REVIEWED_PACKAGE);
    expect(U2_BEAD_ID).toBe(U2_REVIEWED_BEAD_ID);
    expect(U2_POLICY_ID).toBe(U2_REVIEWED_POLICY_ID);
    expect(U2_POLICY_VERSION).toBe(U2_REVIEWED_POLICY_VERSION);

    expect(INSPECTOR_TABS).toEqual(U2_REVIEWED_TABS);
    expect(VOICING_MODES).toEqual(U2_REVIEWED_VOICING_MODES);
    expect(PIANO_NOTE_ROLES).toEqual(U2_REVIEWED_PIANO_NOTE_ROLES);
    expect(U2_REFUSAL_CODES).toEqual(U2_REVIEWED_REFUSAL_CODES);

    expect(PIANO_MIN_MIDI).toBe(U2_REVIEWED_PIANO_BOUNDS.minMidi);
    expect(PIANO_MAX_MIDI).toBe(U2_REVIEWED_PIANO_BOUNDS.maxMidi);
    expect(PIANO_DEFAULT_VISIBLE_MIN_MIDI).toBe(
      U2_REVIEWED_PIANO_BOUNDS.visibleMinMidi,
    );
    expect(PIANO_DEFAULT_VISIBLE_MAX_MIDI).toBe(
      U2_REVIEWED_PIANO_BOUNDS.visibleMaxMidi,
    );
    expect(MIN_MANUAL_VOICING_NOTES).toBe(
      U2_REVIEWED_PIANO_BOUNDS.minManualNotes,
    );
    expect(MAX_MANUAL_VOICING_NOTES).toBe(
      U2_REVIEWED_PIANO_BOUNDS.maxManualNotes,
    );
    expect(MAX_ANNOTATION_CODE_POINTS).toBe(
      U2_REVIEWED_PIANO_BOUNDS.maxAnnotationCodePoints,
    );
  });

  test("independent contract validator passes with zero findings and exact counts", async () => {
    const result = await validateU2Contract();
    expect(result.outcome).toBe("pass");
    expect(result.findings).toEqual([]);
    expect(result.counts).toEqual(U2_EXPECTED_COUNTS);
  });

  test("fixture companions and digests match frozen specification pins", () => {
    expect(Object.keys(U2_SPEC_BYTE_DIGESTS).sort()).toEqual(
      [...U2_EXPECTED_COMPANIONS, "u2-chord-inspector-contract.json"].sort(),
    );
    expect(U2_SPEC_SEMANTIC_DIGEST).toHaveLength(64);
  });

  test("module source policy: u2-chord-inspector-contract imports only domain", () => {
    const modulePath = resolve(
      import.meta.dirname,
      "../../src/ui/studio/u2-chord-inspector-contract.ts",
    );
    const content = readFileSync(modulePath, "utf8");
    const source = ts.createSourceFile(
      modulePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    const importedModules: string[] = [];
    ts.forEachChild(source, (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        importedModules.push(node.moduleSpecifier.text);
      }
    });

    for (const specifier of importedModules) {
      expect(["../../domain"].includes(specifier)).toBe(true);
    }
  });
});
