import { describe, expect, test } from "bun:test";

import {
  analyzeSourcePolicy,
  SOURCE_POLICY_CODES,
  type SourcePolicyCode,
  type SourcePolicyFinding,
  type VirtualSource,
} from "../../scripts/source-policy";

type DuplicateCase = {
  id: string;
  source: string;
  expected: "allow" | "reject";
  codes: SourcePolicyCode[];
};

type ExportCase = {
  id: string;
  sources: VirtualSource[];
  expectedDuplicateExports: number;
};

type StaticCases = {
  duplicateCases: DuplicateCase[];
};

type SourcePolicyCases = {
  exportCases: ExportCase[];
};

const [staticCases, sourcePolicyCases] = await Promise.all([
  Bun.file(new URL("../fixtures/foundation/static-cases.json", import.meta.url)).json() as Promise<StaticCases>,
  Bun.file(
    new URL("../fixtures/foundation/source-policy-cases.json", import.meta.url),
  ).json() as Promise<SourcePolicyCases>,
]);

function duplicateMembers(findings: readonly SourcePolicyFinding[]): SourcePolicyFinding[] {
  return findings.filter(
    (item) => item.code === SOURCE_POLICY_CODES.sourceDuplicateMember,
  );
}

function duplicateExports(findings: readonly SourcePolicyFinding[]): SourcePolicyFinding[] {
  return findings.filter(
    (item) => item.code === SOURCE_POLICY_CODES.sourceDuplicateExport,
  );
}

describe("duplicate object and class implementations", () => {
  for (const fixture of staticCases.duplicateCases) {
    test(fixture.id, () => {
      const findings = duplicateMembers(
        analyzeSourcePolicy([
          {
            path: `src/application/${fixture.id}.ts`,
            source: fixture.source,
          },
        ]),
      );
      if (fixture.expected === "allow") {
        expect(findings).toEqual([]);
      } else {
        expect(findings.length).toBeGreaterThan(0);
        expect([...new Set(findings.map((item) => item.code))].sort()).toEqual(
          [...new Set(fixture.codes)].sort(),
        );
      }
    });
  }

  test("static and instance members occupy different receivers", () => {
    const findings = duplicateMembers(
      analyzeSourcePolicy([
        {
          path: "src/application/receiver.ts",
          source: "class Registry { find() {} static find() {} }",
        },
      ]),
    );
    expect(findings).toEqual([]);
  });

  test("only the repeated accessor implementation is reported", () => {
    const objectFindings = duplicateMembers(
      analyzeSourcePolicy([
        {
          path: "src/application/object-accessor.ts",
          source: "const value = { get state() { return 1; }, set state(next: number) { void next; }, get state() { return 2; } };",
        },
      ]),
    );
    const classFindings = duplicateMembers(
      analyzeSourcePolicy([
        {
          path: "src/application/class-accessor.ts",
          source: "class Value { get state() { return 1; } set state(next: number) { void next; } get state() { return 2; } }",
        },
      ]),
    );
    expect(objectFindings).toHaveLength(1);
    expect(classFindings).toHaveLength(1);
  });

  test("literal computed names participate but unknown computed names do not", () => {
    const findings = duplicateMembers(
      analyzeSourcePolicy([
        {
          path: "src/application/computed.ts",
          source: "const dynamic = 'same'; const value = { ['fixed']: 1, fixed: 2, [dynamic]: 3, [dynamic]: 4 };",
        },
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("fixed");
  });

  test("class overload signatures may precede one implementation but not two", () => {
    const findings = duplicateMembers(
      analyzeSourcePolicy([
        {
          path: "src/application/overload-implementations.ts",
          source: "class Parser { parse(value: string): string; parse(value: unknown): unknown { return value; } parse(value: number) { return value; } }",
        },
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(1);
  });
});

describe("duplicate module exports", () => {
  for (const fixture of sourcePolicyCases.exportCases) {
    test(fixture.id, () => {
      const findings = duplicateExports(analyzeSourcePolicy(fixture.sources));
      expect(findings).toHaveLength(fixture.expectedDuplicateExports);
    });
  }

  test("duplicate export ranges point at the later public name", () => {
    const source = "export { left as value } from './left';\nexport { right as value } from './right';";
    const findings = duplicateExports(
      analyzeSourcePolicy([{ path: "src/domain/index.ts", source }]),
    );
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.line).toBe(2);
    expect(source.slice(finding?.start, finding?.end)).toBe("value");
  });

  test("diagnostics remain byte-for-byte stable for reordered virtual files", () => {
    const sources: VirtualSource[] = [
      {
        path: "src/domain/index.ts",
        source: "export * from './a'; export * from './b';",
      },
      { path: "src/domain/a.ts", source: "export const same = 1;" },
      { path: "src/domain/b.ts", source: "export const same = 2;" },
    ];
    expect(analyzeSourcePolicy([...sources].reverse())).toEqual(
      analyzeSourcePolicy(sources),
    );
  });
});
