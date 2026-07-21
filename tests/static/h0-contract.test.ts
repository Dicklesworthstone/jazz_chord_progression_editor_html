import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  H0_REVIEWED_ANALYSIS_RULE_IDS,
  H0_REVIEWED_CLASSIFICATIONS,
  H0_REVIEWED_COMPANIONS,
  H0_REVIEWED_DISPOSITIONS,
  H0_REVIEWED_EVIDENCE_TIERS,
  H0_REVIEWED_LIMITS,
  H0_REVIEWED_OPERATION_IDS,
  H0_REVIEWED_REFUSAL_CODES,
  H0_REVIEWED_REFUSAL_PRECEDENCE,
  H0_REVIEWED_SCALE_FAMILIES,
  H0_REVIEWED_SCALE_MAPPING_RULE_IDS,
  validateH0Contract,
} from "../../scripts/validate-h0-contract";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/harmony-analysis", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

async function withFixtureCopy(
  run: (copyRoot: string) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "changes-h0-contract-"));
  const copyRoot = join(temporaryRoot, "harmony-analysis");
  await cp(fixtureRoot, copyRoot, { recursive: true });
  try {
    await run(copyRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function mutateFixture(
  copyRoot: string,
  filename: string,
  mutate: (root: JsonObject) => void,
): Promise<void> {
  const path = join(copyRoot, filename);
  const root = JSON.parse(await readFile(path, "utf8")) as JsonObject;
  mutate(root);
  await writeFile(path, `${JSON.stringify(root, null, 2)}\n`, "utf8");
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonObject =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function replaceStringValues(
  value: unknown,
  from: string,
  to: string,
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      if (item === from) value[index] = to;
      else replaceStringValues(item, from, to);
    }
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    if (item === from) (value as JsonObject)[key] = to;
    else replaceStringValues(item, from, to);
  }
}

const packetFilenames = [
  "h0-harmony-analysis-contract.json",
  ...H0_REVIEWED_COMPANIONS,
] as const;

function findingCodes(
  report: Awaited<ReturnType<typeof validateH0Contract>>,
): readonly string[] {
  return report.findings.map((finding) => finding.code);
}

describe("H0 independent specification packet", () => {
  test("pins the complete reviewed packet and all declared inventories", async () => {
    const report = await validateH0Contract(fixtureRoot);
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
    expect(report.counts.companions).toBe(14);
    expect(report.counts.sourceRoots).toBe(12);
    expect(report.counts.analysisRules).toBe(16);
    expect(report.counts.romanRootModeCells).toBe(336);
    expect(report.counts.scaleMappings).toBe(13);
    expect(report.counts.scaleRootPolarityCells).toBe(312);
    expect(report.counts.transpositionCases).toBe(24);
    expect(report.counts.limitRows).toBe(25);
    expect(report.counts.operationStateCases).toBe(17);
    expect(report.counts.mutationControls).toBe(25);
    expect(H0_REVIEWED_COMPANIONS).toHaveLength(14);
    expect(H0_REVIEWED_OPERATION_IDS).toEqual([
      "deriveLiteralFacts",
      "analyzeChordInContext",
      "enumerateChordScaleOptions",
    ]);
    expect(H0_REVIEWED_EVIDENCE_TIERS).toEqual([
      "exact",
      "strong",
      "plausible",
      "speculative",
    ]);
    expect(H0_REVIEWED_DISPOSITIONS).toHaveLength(4);
    expect(H0_REVIEWED_CLASSIFICATIONS).toHaveLength(12);
    expect(H0_REVIEWED_ANALYSIS_RULE_IDS).toHaveLength(16);
    expect(H0_REVIEWED_SCALE_FAMILIES).toHaveLength(12);
    expect(H0_REVIEWED_SCALE_MAPPING_RULE_IDS).toHaveLength(13);
    expect(H0_REVIEWED_REFUSAL_CODES).toHaveLength(12);
    expect(H0_REVIEWED_REFUSAL_PRECEDENCE).toHaveLength(12);
    expect(H0_REVIEWED_LIMITS).toMatchObject({
      previousEvents: 1,
      nextEvents: 1,
      readings: 12,
      scaleOptions: 12,
      degreeComparisons: 4096,
      emittedRecords: 512,
      trackedRecords: 1024,
    });
  });

  test("rejects an undeclared fixture instead of widening the corpus", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await writeFile(join(copyRoot, "unreviewed.json"), "{}\n", "utf8");
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-FIXTURE-INVENTORY");
    });
  });

  test("rejects undeclared top-level fields instead of widening a fixture schema", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "analysis-rules.json", (root) => {
        root["unreviewedPolicy"] = "accept-anything";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-TOP-LEVEL-KEYS");
    });
  });

  test("rejects duplicate decoded JSON keys before last-key-wins parsing", async () => {
    await withFixtureCopy(async (copyRoot) => {
      const path = join(copyRoot, "h0-harmony-analysis-contract.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          '"fixtureVersion":',
          '"schema": "changes.fixtures.h0-duplicate.v1",\n  "fixtureVersion":',
        ),
        "utf8",
      );
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-JSON-DUPLICATE-KEY");
    });
  });

  test("rejects production-authored or generated expected theory values", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "context-reading-cases.json", (root) => {
        root["expectedValuesGenerated"] = true;
        root["productionOutputUsed"] = true;
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-INDEPENDENCE-GENERATED");
      expect(findingCodes(report)).toContain("H0-INDEPENDENCE-PRODUCTION");
    });
  });

  test("kills the tonic-target-is-secondary regression", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "context-reading-cases.json", (root) => {
        const witness = objects(root["cases"])[0];
        const expected = witness?.["expected"];
        if (typeof expected !== "object" || expected === null) return;
        const readings = objects((expected as JsonObject)["orderedReadings"]);
        if (readings[0] !== undefined) {
          readings[0]["classification"] = "secondary-dominant";
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-ORDINARY-DOMINANT");
    });
  });

  test("kills Roman spelling collapse without relying on pitch-class inequality", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "context-reading-cases.json", (root) => {
        const witness = objects(root["cases"]).find(
          (candidate) => candidate["id"] === "H0-CONTEXT-029",
        );
        const expected = witness?.["expected"];
        if (typeof expected !== "object" || expected === null) return;
        const readings = objects((expected as JsonObject)["orderedReadings"]);
        if (readings[0] !== undefined) readings[0]["romanLabel"] = "bIIImaj7";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-ROMAN-SPELLING");
    });
  });

  test("rejects altered literal weights masquerading as confidence", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(
        copyRoot,
        "h0-harmony-analysis-contract.json",
        (root) => {
          const weights = root["literalMatchWeights"];
          if (typeof weights !== "object" || weights === null) return;
          (weights as JsonObject)["root"] = 0.9;
        },
      );
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-MATCH-WEIGHTS");
    });
  });

  test("requires an exact and plus-one witness for every public cap", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "limit-cases.json", (root) => {
        root["boundaryRows"] = objects(root["boundaryRows"]).filter(
          (row) => row["field"] !== "degreeComparisons",
        );
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-LIMIT-BOUNDARY-MISSING");
    });
  });

  test("rejects a missing normative scale mapping", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "chord-scale-mappings.json", (root) => {
        root["mappings"] = objects(root["mappings"]).slice(0, -1);
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-SCALE-MAPPING-INVENTORY");
    });
  });

  test("does not promote the packet to unearned expert review", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "provenance-ledger.json", (root) => {
        const first = objects(root["authorities"])[0];
        if (first !== undefined) first["authorityClass"] = "expert-reviewed";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-AUTHORITY-HONESTY");
    });
  });

  test("keeps pure-operation non-applicability explicit", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "operation-state-cases.json", (root) => {
        root["cases"] = objects(root["cases"]).filter(
          (row) => row["id"] !== "H0-OP-STATE-017",
        );
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-OPERATION-APPLICABILITY");
      expect(findingCodes(report)).toContain("H0-OPERATION-STATE-CASES");
    });
  });

  test("rejects a law proof that names an unknown case", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "law-cases.json", (root) => {
        const firstLaw = objects(root["laws"])[0];
        if (firstLaw !== undefined) {
          firstLaw["positiveCaseIds"] = ["H0-UNKNOWN-LAW-CASE"];
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-LAW-CASE-UNKNOWN");
    });
  });

  test("requires every law to retain at least one reciprocal mutation killer", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "law-cases.json", (root) => {
        const firstLaw = objects(root["laws"])[0];
        if (firstLaw !== undefined) firstLaw["mutationControlIds"] = [];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-LAW-MUTATION-MISSING");
      expect(findingCodes(report)).toContain(
        "H0-LAW-MUTATION-RECIPROCITY",
      );
    });
  });

  test("rejects cleared mutation law and trace links", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "mutation-controls.json", (root) => {
        const firstControl = objects(root["controls"])[0];
        if (firstControl !== undefined) {
          firstControl["lawIds"] = [];
          firstControl["traceIds"] = [];
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-MUTATION-LAW-MISSING");
      expect(findingCodes(report)).toContain("H0-MUTATION-TRACE-MISSING");
      expect(findingCodes(report)).toContain(
        "H0-LAW-MUTATION-RECIPROCITY",
      );
      expect(findingCodes(report)).toContain(
        "H0-MUTATION-TRACE-RECIPROCITY",
      );
    });
  });

  test("rejects a trace that names an unknown case", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "trace-ledger.json", (root) => {
        const firstTrace = objects(root["traces"])[0];
        if (firstTrace !== undefined) {
          firstTrace["caseIds"] = ["H0-UNKNOWN-TRACE-CASE"];
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-TRACE-CASE-UNKNOWN");
    });
  });

  test("requires the exact 25-control mutation inventory", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "mutation-controls.json", (root) => {
        root["controls"] = objects(root["controls"]).filter(
          (control) =>
            !["H0-MUT-023", "H0-MUT-024", "H0-MUT-025"].includes(
              String(control["id"]),
            ),
        );
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-MUTATION-INVENTORY");
      expect(findingCodes(report)).toContain("H0-MUTATION-COVERAGE");
      expect(findingCodes(report)).toContain("H0-MUTATION-ID");
    });
  });

  test("rejects an empty source catalog instead of leaving dangling refs", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "source-catalog.json", (root) => {
        root["chords"] = [];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-SOURCE-CATALOG-EMPTY");
      expect(findingCodes(report)).toContain("H0-SOURCE-REF-UNKNOWN");
    });
  });

  test("closes every declared T1 reference against its real reviewed owner", async () => {
    const source = JSON.parse(
      await readFile(join(fixtureRoot, "source-catalog.json"), "utf8"),
    ) as JsonObject;
    const owners = objects(source["t1ReferenceOwners"]);
    expect(owners).toHaveLength(41);
    for (const owner of owners) {
      const id = owner["id"];
      const ownerFixture = owner["ownerFixture"];
      const ownerCollection = owner["ownerCollection"];
      expect(typeof id).toBe("string");
      expect(typeof ownerFixture).toBe("string");
      expect(typeof ownerCollection).toBe("string");
      if (
        typeof id !== "string" ||
        typeof ownerFixture !== "string" ||
        typeof ownerCollection !== "string"
      ) {
        continue;
      }
      const ownerRoot = JSON.parse(
        await readFile(join(repositoryRoot, ownerFixture), "utf8"),
      ) as JsonObject;
      expect(
        objects(ownerRoot[ownerCollection]).some((row) => row["id"] === id),
      ).toBe(true);
    }
  });

  test("freezes source T1 identity, row shape, formula, spelling, and ownership", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "source-catalog.json", (root) => {
        const authority = root["t1AuthoritySnapshot"];
        if (typeof authority === "object" && authority !== null) {
          (authority as JsonObject)["formulaTableVersion"] = 2;
        }
        const chord = objects(root["chords"])[0];
        if (chord !== undefined) {
          chord["formulaRuleId"] = "not-a-t1-formula";
          const spellings = objects(chord["degreeSpellings"]);
          if (spellings[0] !== undefined) spellings[0]["alter"] = 1;
        }
        const owner = objects(root["t1ReferenceOwners"])[0];
        if (owner !== undefined) owner["ownerCollection"] = "not-owned-here";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      const codes = findingCodes(report);
      expect(codes).toContain("H0-SOURCE-T1-IDENTITY");
      expect(codes).toContain("H0-SOURCE-CHORD-IDENTITY");
      expect(codes).toContain("H0-SOURCE-FORMULA-RULE");
      expect(codes).toContain("H0-SOURCE-CHORD-DEGREE-SPELLING");
      expect(codes).toContain("H0-SOURCE-T1-REF-OWNER");
    });
  });

  test("closes source, context, and local event references", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "context-reading-cases.json", (root) => {
        const firstCase = objects(root["cases"])[0];
        if (firstCase === undefined) return;
        firstCase["contextId"] = "H0-CONTEXT-UNKNOWN";
        const events = firstCase["events"];
        if (typeof events === "object" && events !== null) {
          const current = (events as JsonObject)["current"];
          if (typeof current === "object" && current !== null) {
            (current as JsonObject)["sourceId"] = "H0-SRC-UNKNOWN";
          }
        }
        const expected = firstCase["expected"];
        if (typeof expected !== "object" || expected === null) return;
        const reading = objects((expected as JsonObject)["orderedReadings"])[0];
        if (reading !== undefined) {
          reading["governingTargetEventId"] = "evt-not-in-window";
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-SOURCE-REF-UNKNOWN");
      expect(findingCodes(report)).toContain("H0-CONTEXT-REF-UNKNOWN");
      expect(findingCodes(report)).toContain("H0-EVENT-REF-UNKNOWN");
    });
  });

  test("rejects an empty all-root scale expansion declaration", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "chord-scale-cases.json", (root) => {
        const expansion = root["rootExpansion"];
        if (typeof expansion !== "object" || expansion === null) return;
        (expansion as JsonObject)["rootRefs"] = [];
        (expansion as JsonObject)["expectedMinimumCells"] = 0;
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-SCALE-ROOT-EXPANSION");
    });
  });

  test("recomputes Roman cells and enforces all-root transposition scope", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "roman-root-mode-matrix.json", (root) => {
        const matrix = root["matrix"];
        if (typeof matrix === "object" && matrix !== null) {
          (matrix as JsonObject)["expectedCellCount"] = 335;
        }
        const minorSeed = objects(root["modeSeeds"]).find(
          (seed) => seed["id"] === "H0-ROM-NMIN-03",
        );
        if (minorSeed !== undefined) minorSeed["rootDegree"] = "3";
      });
      await mutateFixture(copyRoot, "transposition-cases.json", (root) => {
        const first = objects(root["cases"])[0];
        if (first !== undefined) first["rootScope"] = "one-root-only";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-ROMAN-MATRIX-COMPUTED");
      expect(findingCodes(report)).toContain("H0-ROMAN-MODE-COVERAGE");
      expect(findingCodes(report)).toContain("H0-TRANSPOSITION-ROOT-SCOPE");
    });
  });

  test("kills material Roman, scale-polarity, interval, seed, and inverse-payload drift", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "roman-root-mode-matrix.json", (root) => {
        const matrix = root["matrix"];
        if (typeof matrix !== "object" || matrix === null) return;
        const cell = objects((matrix as JsonObject)["cells"])[0];
        const expected = cell?.["expected"];
        if (typeof expected === "object" && expected !== null) {
          (expected as JsonObject)["romanLabel"] = "not-the-seed-label";
        }
      });
      await mutateFixture(copyRoot, "chord-scale-cases.json", (root) => {
        const expansion = root["rootExpansion"];
        if (typeof expansion !== "object" || expansion === null) return;
        const cell = objects((expansion as JsonObject)["cells"])[0];
        const expected = cell?.["expected"];
        if (typeof expected === "object" && expected !== null) {
          (expected as JsonObject)["predicateMatches"] = false;
        }
      });
      await mutateFixture(copyRoot, "transposition-cases.json", (root) => {
        const interval = objects(root["reviewedRootTranspositionsFromC"])[1]?.[
          "interval"
        ];
        if (typeof interval === "object" && interval !== null) {
          (interval as JsonObject)["diatonicSteps"] = 0;
        }
        const first = objects(root["cases"])[0];
        if (first !== undefined) {
          first["seedRefs"] = ["H0-ROM-UNKNOWN"];
          const expected = first["expected"];
          if (typeof expected === "object" && expected !== null) {
            (expected as JsonObject)["inverseRestoresExactSpelling"] = false;
          }
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      const codes = findingCodes(report);
      expect(codes).toContain("H0-ROMAN-MATERIAL-CELLS");
      expect(codes).toContain("H0-SCALE-MATERIAL-CELLS");
      expect(codes).toContain("H0-TRANSPOSITION-ROOT-INTERVALS");
      expect(codes).toContain("H0-TRANSPOSITION-SEED-REF");
      expect(codes).toContain("H0-TRANSPOSITION-PAYLOAD");
    });
  });

  test("requires fixture and trace file links to remain reciprocal", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "literal-fact-cases.json", (root) => {
        root["traceIds"] = [];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-TRACE-FILE-RECIPROCITY");
      expect(findingCodes(report)).toContain("H0-LINK-MISSING");
    });
  });

  test("freezes critical functional and scale-mapping payloads", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "analysis-rules.json", (root) => {
        const rules = objects(root["rules"]);
        const ordinary = rules.find(
          (rule) => rule["id"] === "h0.function.ordinary-dominant",
        );
        if (ordinary !== undefined) ordinary["precedenceOver"] = [];
        const secondary = rules.find(
          (rule) => rule["id"] === "h0.function.secondary-dominant",
        );
        if (secondary !== undefined) secondary["forbids"] = [];
      });
      await mutateFixture(copyRoot, "chord-scale-mappings.json", (root) => {
        const mappings = objects(root["mappings"]);
        const altered = mappings.find(
          (mapping) => mapping["id"] === "h0.scale.altered",
        );
        if (altered !== undefined) altered["contextPredicates"] = [];
        const wholeHalf = mappings.find(
          (mapping) => mapping["id"] === "h0.scale.whole-half-diminished",
        );
        if (wholeHalf !== undefined) {
          wholeHalf["requiredChordDegrees"] = ["1", "b3", "b5", "6"];
        }
        const suspended = mappings.find(
          (mapping) => mapping["id"] === "h0.scale.suspended-dominant",
        );
        if (suspended !== undefined) suspended["forbiddenChordDegrees"] = [];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain(
        "H0-CRITICAL-ORDINARY-PRECEDENCE",
      );
      expect(findingCodes(report)).toContain(
        "H0-CRITICAL-SECONDARY-ADJACENCY",
      );
      expect(findingCodes(report)).toContain(
        "H0-CRITICAL-ALTERED-SELECTION",
      );
      expect(findingCodes(report)).toContain(
        "H0-CRITICAL-WHOLE-HALF-DEGREE",
      );
      expect(findingCodes(report)).toContain(
        "H0-CRITICAL-SUSPENDED-THIRD",
      );
    });
  });

  test("rejects boundary, termination, and combined-precedence drift", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "limit-cases.json", (root) => {
        const rows = objects(root["boundaryRows"]);
        root["boundaryRows"] = [rows[1], rows[0], ...rows.slice(2)];
        const termination = root["terminationEvidence"];
        if (typeof termination === "object" && termination !== null) {
          (termination as JsonObject)["silentTruncationForbidden"] = false;
        }
        const precedence = objects(root["combinedPrecedenceCases"])[0];
        if (precedence !== undefined) {
          precedence["expectedRefusalCode"] = "harmony.base_revision_invalid";
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-LIMIT-ROW-ORDER");
      expect(findingCodes(report)).toContain("H0-TERMINATION-EVIDENCE");
      expect(findingCodes(report)).toContain("H0-LIMIT-PRECEDENCE-CASES");
    });
  });

  test("rejects an undeclared provenance authority on a decision", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "provenance-ledger.json", (root) => {
        const firstDecision = objects(root["decisionLedger"])[0];
        if (firstDecision !== undefined) {
          firstDecision["authorityIds"] = ["H0-AUTH-UNKNOWN"];
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain(
        "H0-DECISION-AUTHORITY-UNKNOWN",
      );
    });
  });

  test("rejects globally renamed authority and trace vocabularies", async () => {
    await withFixtureCopy(async (copyRoot) => {
      for (const filename of packetFilenames) {
        await mutateFixture(copyRoot, filename, (root) => {
          replaceStringValues(
            root,
            "H0-AUTH-PLAN",
            "H0-AUTH-PLAN-RENAMED",
          );
          replaceStringValues(
            root,
            "H0-TRACE-LITERAL",
            "H0-TRACE-LITERAL-RENAMED",
          );
        });
      }
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-AUTHORITY-INVENTORY");
      expect(findingCodes(report)).toContain("H0-TRACE-INVENTORY");
      expect(findingCodes(report)).toContain("H0-FILE-TRACE-INVENTORY");
    });
  });

  test("freezes table, containment, trace-policy, and state identities", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "analysis-rules.json", (root) => {
        root["tableId"] = "changes.harmony-analysis-rules-renamed";
        root["tableVersion"] = 2;
      });
      await mutateFixture(copyRoot, "chord-scale-mappings.json", (root) => {
        root["tableId"] = "changes.chord-scale-mappings-renamed";
        root["tableVersion"] = 2;
        const containment = root["containmentPolicy"];
        if (typeof containment !== "object" || containment === null) return;
        (containment as JsonObject)["pitchClassOnlyMatchForbidden"] = false;
      });
      await mutateFixture(copyRoot, "trace-ledger.json", (root) => {
        root["stableTraceIdsOnly"] = false;
        const policy = root["reciprocityPolicy"];
        if (typeof policy !== "object" || policy === null) return;
        (policy as JsonObject)[
          "everyTraceIdAppearsInAtLeastOneOwningFixtureRoot"
        ] = false;
      });
      await mutateFixture(copyRoot, "operation-state-cases.json", (root) => {
        root["states"] = ["applicable", "not-applicable", "refused", "complete"];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-ANALYSIS-TABLE-IDENTITY");
      expect(findingCodes(report)).toContain("H0-SCALE-TABLE-IDENTITY");
      expect(findingCodes(report)).toContain("H0-TRACE-STABLE-IDS");
      expect(findingCodes(report)).toContain(
        "H0-TRACE-RECIPROCITY-POLICY",
      );
      expect(findingCodes(report)).toContain(
        "H0-OPERATION-STATE-VOCABULARY",
      );
    });
  });

  test("freezes each fixture root's reviewed trace ownership", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "literal-fact-cases.json", (root) => {
        root["traceIds"] = [
          "H0-TRACE-SPELLING",
          "H0-TRACE-EVIDENCE",
          "H0-TRACE-ALTERED",
          "H0-TRACE-CUSTOM",
        ];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-FILE-TRACE-INVENTORY");
      expect(findingCodes(report)).toContain("H0-TRACE-FILE-RECIPROCITY");
    });
  });

  test("requires non-ASCII request and malformed revision witnesses", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "limit-cases.json", (root) => {
        for (const row of objects(root["boundaryRows"])) {
          if (
            row["field"] === "requestIdAsciiCharacters" ||
            row["field"] === "baseRevision"
          ) {
            row["additionalInvalid"] = [];
          }
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-LIMIT-ROW-PAYLOAD");
    });
  });

  test("requires previous and next event N-minus-one, N, and N-plus-one rows", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "limit-cases.json", (root) => {
        root["boundaryRows"] = objects(root["boundaryRows"]).filter(
          (row) => row["field"] !== "previousEvents",
        );
        const next = objects(root["boundaryRows"]).find(
          (row) => row["field"] === "nextEvents",
        );
        if (next === undefined) return;
        const above = next["nPlusOne"];
        if (typeof above !== "object" || above === null) return;
        (above as JsonObject)["accepted"] = true;
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-LIMIT-ROW-ORDER");
      expect(findingCodes(report)).toContain("H0-LIMIT-BOUNDARY-MISSING");
      expect(findingCodes(report)).toContain("H0-LIMIT-ROW-PAYLOAD");
      expect(findingCodes(report)).toContain("H0-LIMIT-N-PLUS-ONE");
    });
  });

  test("freezes operation IDs, setups, outcomes, and refusal paths", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "operation-state-cases.json", (root) => {
        const cases = objects(root["cases"]);
        const first = cases.find((row) => row["id"] === "H0-OP-STATE-001");
        if (first !== undefined) {
          first["id"] = "H0-OP-STATE-001-RENAMED";
          const setup = first["setup"];
          if (typeof setup === "object" && setup !== null) {
            (setup as JsonObject)["sourceId"] = "H0-SRC-G7";
          }
        }
        const selection = cases.find(
          (row) => row["id"] === "H0-OP-STATE-005",
        );
        const expected = selection?.["expected"];
        if (typeof expected === "object" && expected !== null) {
          (expected as JsonObject)["state"] = "complete";
          const refusal = (expected as JsonObject)["refusal"];
          if (typeof refusal === "object" && refusal !== null) {
            (refusal as JsonObject)["path"] = ["sourceId"];
          }
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-OPERATION-STATE-CASES");
    });
  });

  test("checks applicability structurally instead of by substring", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "operation-state-cases.json", (root) => {
        const applicability = objects(root["cases"]).find(
          (row) => row["id"] === "H0-OP-STATE-017",
        );
        const expected = applicability?.["expected"];
        if (typeof expected !== "object" || expected === null) return;
        const surfaces = (expected as JsonObject)[
          "pureOperationApplicability"
        ];
        if (typeof surfaces !== "object" || surfaces === null) return;
        (surfaces as JsonObject)["cancellation"] =
          "applicable cancellation is now supported";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-OPERATION-APPLICABILITY");
      expect(findingCodes(report)).toContain("H0-OPERATION-STATE-CASES");
    });
  });

  test("freezes provenance sources, claims, and decision ownership", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "provenance-ledger.json", (root) => {
        root["authoringStatement"] = "Expected values came from production.";
        root["independenceRules"] = [];
        const published = objects(root["authorities"]).find(
          (authority) => authority["id"] === "H0-AUTH-OMT-APPLIED",
        );
        if (published !== undefined) {
          published["url"] = "https://example.invalid";
          published["claims"] = [
            "A remote service chooses one universally correct scale.",
          ];
        }
        const decision = objects(root["decisionLedger"])[0];
        if (decision !== undefined) {
          decision["decision"] = "Inspect any convenient future event.";
          decision["authorityIds"] = ["H0-AUTH-T1"];
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-PROVENANCE-AUTHORING");
      expect(findingCodes(report)).toContain("H0-PROVENANCE-INDEPENDENCE");
      expect(findingCodes(report)).toContain("H0-PROVENANCE-AUTHORITIES");
      expect(findingCodes(report)).toContain("H0-PROVENANCE-DECISIONS");
    });
  });

  test("freezes every normative analysis rule and scale mapping payload", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "analysis-rules.json", (root) => {
        const tritone = objects(root["rules"]).find(
          (row) => row["id"] === "h0.function.tritone-substitute",
        );
        if (tritone !== undefined) tritone["predicate"] = "Every chord matches.";
      });
      await mutateFixture(copyRoot, "chord-scale-mappings.json", (root) => {
        const ionian = objects(root["mappings"]).find(
          (row) => row["id"] === "h0.scale.ionian",
        );
        if (ionian !== undefined) ionian["scaleDegrees"] = ["1"];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-ANALYSIS-RULE-PAYLOAD");
      expect(findingCodes(report)).toContain("H0-SCALE-MAPPING-PAYLOAD");
    });
  });

  test("requires exact positive, near-miss, transposition, mutation, and trace ownership", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "analysis-rules.json", (root) => {
        const first = objects(root["proofOwnership"])[0];
        if (first !== undefined) {
          first["positiveCaseIds"] = [];
          first["transpositionCaseIds"] = ["H0-CONTEXT-001"];
        }
      });
      await mutateFixture(copyRoot, "chord-scale-mappings.json", (root) => {
        const first = objects(root["proofOwnership"])[0];
        if (first !== undefined) first["mutationControlIds"] = [];
      });
      await mutateFixture(copyRoot, "trace-ledger.json", (root) => {
        for (const trace of objects(root["traces"])) trace["ruleIds"] = [];
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-PROOF-OWNERSHIP-MISSING");
      expect(findingCodes(report)).toContain(
        "H0-PROOF-TRANSPOSITION-UNKNOWN",
      );
      expect(findingCodes(report)).toContain("H0-PROOF-TRACE-RECIPROCITY");
      expect(findingCodes(report)).toContain("H0-PROOF-OWNERSHIP-PAYLOAD");
      expect(findingCodes(report)).toContain("H0-TRACE-RULE-COVERAGE");
    });
  });

  test("freezes mutation meaning and concrete trace handoff ownership", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "mutation-controls.json", (root) => {
        const controls = objects(root["controls"]);
        for (const control of controls) {
          control["operator"] = "one-unrelated-fault";
          control["mutatedFault"] = "";
          control["killerCaseIds"] = ["H0-CONTEXT-001"];
        }
      });
      await mutateFixture(copyRoot, "trace-ledger.json", (root) => {
        const first = objects(root["traces"])[0];
        if (first !== undefined) {
          first["caseIds"] = [];
          first["plannedProductionOwners"] = [];
          first["plannedEvidenceTestOwners"] = [];
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-MUTATION-PAYLOAD");
      expect(findingCodes(report)).toContain("H0-MUTATION-FAULT-MISSING");
      expect(findingCodes(report)).toContain("H0-MUTATION-OPERATOR-DUPLICATE");
      expect(findingCodes(report)).toContain("H0-TRACE-CASE-MISSING");
      expect(findingCodes(report)).toContain("H0-TRACE-PRODUCTION-OWNERS");
      expect(findingCodes(report)).toContain("H0-TRACE-EVIDENCE-OWNERS");
    });
  });

  test("freezes every reviewed literal, contextual, and scale-case expectation", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "literal-fact-cases.json", (root) => {
        const row = objects(root["cases"]).find(
          (candidate) => candidate["id"] === "H0-LITERAL-004",
        );
        if (row !== undefined) row["expected"] = { literalFacts: "invented" };
      });
      await mutateFixture(copyRoot, "context-reading-cases.json", (root) => {
        const row = objects(root["cases"]).find(
          (candidate) => candidate["id"] === "H0-CONTEXT-006",
        );
        const expected = row?.["expected"];
        const reading =
          typeof expected === "object" && expected !== null
            ? objects((expected as JsonObject)["orderedReadings"])[0]
            : undefined;
        if (reading !== undefined) {
          reading["classification"] = "secondary-dominant";
          reading["romanLabel"] = "V7/V";
        }
      });
      await mutateFixture(copyRoot, "chord-scale-cases.json", (root) => {
        const row = objects(root["cases"]).find(
          (candidate) => candidate["id"] === "H0-SCALE-LYD-001",
        );
        const expected = row?.["expected"];
        const option =
          typeof expected === "object" && expected !== null
            ? objects((expected as JsonObject)["orderedOptions"])[0]
            : undefined;
        if (option !== undefined) option["family"] = "altered";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      const codes = findingCodes(report);
      expect(codes).toContain("H0-LITERAL-CASE-PAYLOAD");
      expect(codes).toContain("H0-CONTEXT-CASE-PAYLOAD");
      expect(codes).toContain("H0-SCALE-CASE-PAYLOAD");
    });
  });

  test("freezes trace meaning and reviewed authority ownership", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "trace-ledger.json", (root) => {
        const trace = objects(root["traces"]).find(
          (candidate) => candidate["id"] === "H0-TRACE-LITERAL",
        );
        if (trace !== undefined) {
          trace["requirement"] = "A remote service chooses the best scale.";
          trace["authorityIds"] = ["H0-AUTH-OMT-MIXTURE"];
        }
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      expect(findingCodes(report)).toContain("H0-TRACE-PAYLOAD");
    });
  });

  test("freezes every fixture-specific independence and oracle policy", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await mutateFixture(copyRoot, "source-catalog.json", (root) => {
        root["independenceStatement"] = "Copied from production output.";
      });
      await mutateFixture(copyRoot, "context-reading-cases.json", (root) => {
        root["fixturePolicy"] = "Generated from production and scans the chart.";
      });
      await mutateFixture(copyRoot, "roman-root-mode-matrix.json", (root) => {
        root["independentOracle"] = "production-output";
      });
      await mutateFixture(copyRoot, "transposition-cases.json", (root) => {
        root["independenceStatement"] = "Copied from production output.";
      });
      const report = await validateH0Contract(copyRoot, {
        enforceDigests: false,
      });
      const codes = findingCodes(report);
      expect(codes).toContain("H0-SOURCE-INDEPENDENCE");
      expect(codes).toContain("H0-CONTEXT-FIXTURE-POLICY");
      expect(codes).toContain("H0-ROMAN-INDEPENDENT-ORACLE");
      expect(codes).toContain("H0-TRANSPOSITION-INDEPENDENCE");
    });
  });
});
