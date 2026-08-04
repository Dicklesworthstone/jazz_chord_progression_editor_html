import { describe, expect, test } from "bun:test";

import {
  assertArtifactInspection,
  canonicalJson,
  createLicenseReport,
  inspectArtifact,
  type ArtifactFinding,
} from "../../scripts/artifact-policy";

type ArtifactCase = {
  id: string;
  source: string;
  expected: "allow" | "reject";
  codes: string[];
};

type SizeCase = {
  id: string;
  bytes: number;
  expected: "allow" | "reject";
  codes?: string[];
};

type StaticCases = {
  artifactCases: ArtifactCase[];
  sizeCases: SizeCase[];
};

const cases = await Bun.file(
  new URL("../fixtures/foundation/static-cases.json", import.meta.url),
).json() as StaticCases;

function findingCodes(findings: readonly ArtifactFinding[]): string[] {
  return [...new Set(findings.map((finding) => finding.code))].sort();
}

describe("standalone artifact policy authority cases", () => {
  for (const fixture of cases.artifactCases) {
    test(fixture.id, () => {
      const inspection = inspectArtifact(fixture.source, {
        requireReleaseEnvelope: false,
      });
      if (fixture.expected === "allow") {
        expect(inspection.findings).toEqual([]);
        expect(() => {
          assertArtifactInspection(inspection);
        }).not.toThrow();
      } else {
        expect(inspection.outcome).toBe("fail");
        expect(findingCodes(inspection.findings)).toEqual([...fixture.codes].sort());
        expect(() => {
          assertArtifactInspection(inspection);
        }).toThrow();
      }
    });
  }
});

describe("artifact byte budget", () => {
  for (const fixture of cases.sizeCases) {
    test(fixture.id, () => {
      const inspection = inspectArtifact("x".repeat(fixture.bytes), {
        maxBytes: 8_388_608,
        requireReleaseEnvelope: false,
      });
      if (fixture.expected === "allow") {
        expect(inspection.findings).toEqual([]);
      } else {
        expect(findingCodes(inspection.findings)).toEqual(
          [...(fixture.codes ?? [])].sort(),
        );
      }
    });
  }
});

test("reports and diagnostics have deterministic order", () => {
  const licenseReport = createLicenseReport([
    {
      name: "z-package",
      version: "1.0.0",
      license: "MIT",
      source: "https://example.test/z",
    },
    {
      name: "a-package",
      version: "1.0.0",
      license: "MIT",
      source: "https://example.test/a",
    },
  ]);
  expect(licenseReport.packages.map((record) => record.name)).toEqual([
    "a-package",
    "z-package",
  ]);
  expect(canonicalJson({ z: 1, a: { d: 2, b: 1 } })).toBe(
    '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "z": 1\n}\n',
  );

  const source =
    '<script src="./chunk.js"></script><img src="https://example.test/x.png" alt="">';
  const first = inspectArtifact(source, { requireReleaseEnvelope: false });
  const second = inspectArtifact(source, { requireReleaseEnvelope: false });
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
});

test("passive image data icons are counted while executable data icons are refused", () => {
  const passive = inspectArtifact(
    '<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E">',
    { requireReleaseEnvelope: false },
  );
  expect(passive.findings).toEqual([]);
  expect(passive.html.embeddedAssets).toBe(1);

  const executable = inspectArtifact(
    '<link rel="icon" href="data:text/html,%3Cscript%3Ealert(1)%3C/script%3E">',
    { requireReleaseEnvelope: false },
  );
  expect(findingCodes(executable.findings)).toEqual([
    "ARTIFACT_RUNTIME_SIDECAR",
  ]);
  expect(executable.html.embeddedAssets).toBe(0);
});
