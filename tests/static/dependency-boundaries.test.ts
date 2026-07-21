import { describe, expect, test } from "bun:test";

import {
  analyzeSourcePolicy,
  DEFAULT_LAYER_RULES,
  SOURCE_POLICY_CODES,
  type SourcePolicyFinding,
  type VirtualSource,
} from "../../scripts/source-policy";

type DependencyCase = {
  id: string;
  from: string;
  to?: string;
  toPackage?: string;
  syntax: string;
  expected: "allow" | "reject";
  codes?: string[];
};

type CapabilityCase = {
  id: string;
  path: string;
  source: string;
  codes: string[];
};

type StaticCases = {
  dependencyCases: DependencyCase[];
};

type CapabilityCases = {
  capabilityCases: CapabilityCase[];
};

type FoundationContract = {
  layers: Array<{ name: string; mayImport: string[] }>;
};

const [staticCases, capabilityCases, contract] = await Promise.all([
  Bun.file(new URL("../fixtures/foundation/static-cases.json", import.meta.url)).json() as Promise<StaticCases>,
  Bun.file(
    new URL("../fixtures/foundation/source-policy-cases.json", import.meta.url),
  ).json() as Promise<CapabilityCases>,
  Bun.file(
    new URL("../fixtures/foundation/foundation-contract.json", import.meta.url),
  ).json() as Promise<FoundationContract>,
]);

const BOUNDARY_CODES = new Set<string>([
  SOURCE_POLICY_CODES.boundaryLayerDirection,
  SOURCE_POLICY_CODES.boundaryTheoryContent,
  SOURCE_POLICY_CODES.boundaryTestSupport,
  SOURCE_POLICY_CODES.boundaryPreactOwner,
  SOURCE_POLICY_CODES.boundaryPackageNotAllowed,
  SOURCE_POLICY_CODES.boundaryPrivateImport,
  SOURCE_POLICY_CODES.boundaryUnknownLayer,
]);

function uniqueCodes(findings: readonly SourcePolicyFinding[]): string[] {
  return [...new Set(findings.map((item) => item.code))].sort();
}

function dependencyFixture(value: DependencyCase): VirtualSource {
  const path = `src/${value.from}/fixture.ts`;
  let specifier = value.toPackage;
  if (specifier === undefined) {
    if (value.to === undefined) {
      throw new Error(`Fixture ${value.id} requires either to or toPackage.`);
    }
    specifier =
      value.syntax === "private-path-traversal"
        ? `../${value.to}/private/secret`
        : value.to === value.from
          ? "./internal"
          : `../${value.to}`;
  }

  switch (value.syntax) {
    case "import-type":
      return {
        path,
        source: `import type { Value } from ${JSON.stringify(specifier)}; export type Seen = Value;`,
      };
    case "re-export":
      return {
        path,
        source: `export { value } from ${JSON.stringify(specifier)};`,
      };
    case "multiline-import":
      return {
        path,
        source: `import {\n  value,\n} from ${JSON.stringify(specifier)}; void value;`,
      };
    default:
      return {
        path,
        source: `import { value } from ${JSON.stringify(specifier)}; void value;`,
      };
  }
}

describe("foundation dependency boundaries", () => {
  test("default rules are exactly the independently authored authority matrix", () => {
    expect(DEFAULT_LAYER_RULES).toEqual(contract.layers);
  });

  for (const fixture of staticCases.dependencyCases) {
    test(fixture.id, () => {
      const findings = analyzeSourcePolicy([dependencyFixture(fixture)]).filter((item) =>
        BOUNDARY_CODES.has(item.code),
      );
      if (fixture.expected === "allow") {
        expect(findings).toEqual([]);
      } else {
        const actual = uniqueCodes(findings);
        for (const expected of fixture.codes ?? []) {
          expect(actual).toContain(expected);
        }
      }
    });
  }

  test("import-type expressions and type re-exports obey ordinary edges", () => {
    const findings = analyzeSourcePolicy([
      {
        path: "src/theory/import-type.ts",
        source: "export type Pitch = import('../domain').Pitch;",
      },
      {
        path: "src/ui/reexport.ts",
        source: "export type { AppView } from '../application';",
      },
      {
        path: "src/ui/private-reexport.ts",
        source: "export type { Secret } from '../application/private/secret';",
      },
    ]);
    expect(
      findings.filter(
        (item) =>
          item.path !== "src/ui/private-reexport.ts" && BOUNDARY_CODES.has(item.code),
      ),
    ).toEqual([]);
    expect(
      findings.some(
        (item) =>
          item.path === "src/ui/private-reexport.ts" &&
          item.code === SOURCE_POLICY_CODES.boundaryPrivateImport,
      ),
    ).toBe(true);
  });

  test("aliases use the same public-entrypoint and layer rules", () => {
    const findings = analyzeSourcePolicy([
      {
        path: "src/ui/public.ts",
        source: "import type { AppView } from '@/application'; void (0 as unknown as AppView);",
      },
      {
        path: "src/ui/private.ts",
        source: "import type { Secret } from '@/application/private/secret'; void (0 as unknown as Secret);",
      },
    ]);
    expect(
      findings.filter((item) => item.path === "src/ui/public.ts" && BOUNDARY_CODES.has(item.code)),
    ).toEqual([]);
    expect(
      findings.some(
        (item) =>
          item.path === "src/ui/private.ts" &&
          item.code === SOURCE_POLICY_CODES.boundaryPrivateImport,
      ),
    ).toBe(true);
  });

  test("Preact and browser assets have narrow owners while tooling packages stay outside production", () => {
    const findings = analyzeSourcePolicy([
      {
        path: "src/main.tsx",
        source: "import { render } from 'preact'; import './styles/app.css'; void render;",
      },
      {
        path: "src/ui/component.tsx",
        source: "import { h } from 'preact'; void h;",
      },
      {
        path: "src/domain/package.ts",
        source: "import value from 'left-pad'; void value;",
      },
      {
        path: "scripts/compiler.ts",
        source: "import * as ts from 'typescript'; void ts;",
      },
    ]);
    expect(findings.filter((item) => item.path === "src/main.tsx")).toEqual([]);
    expect(findings.filter((item) => item.path === "src/ui/component.tsx")).toEqual([]);
    expect(
      findings.some(
        (item) =>
          item.path === "src/domain/package.ts" &&
          item.code === SOURCE_POLICY_CODES.boundaryPackageNotAllowed,
      ),
    ).toBe(true);
    expect(findings.filter((item) => item.path === "scripts/compiler.ts")).toEqual([]);
  });

  test("the composition root may use the narrow public UI runtime entry only", () => {
    const findings = analyzeSourcePolicy([
      {
        path: "src/main.tsx",
        source: "import { App } from './ui/runtime'; void App;",
      },
      {
        path: "src/application/private-ui.ts",
        source: "import { App } from '../ui/runtime'; void App;",
      },
      {
        path: "src/main.ts",
        source: "import { App } from './ui/App'; void App;",
      },
    ]);
    expect(findings.filter((item) => item.path === "src/main.tsx")).toEqual([]);
    expect(
      findings.some(
        (item) =>
          item.path === "src/application/private-ui.ts" &&
          item.code === SOURCE_POLICY_CODES.boundaryLayerDirection,
      ),
    ).toBe(true);
    expect(
      findings.some(
        (item) =>
          item.path === "src/main.ts" &&
          item.code === SOURCE_POLICY_CODES.boundaryPrivateImport,
      ),
    ).toBe(true);
  });

  test("unknown source layers cannot become implicit dependencies", () => {
    const findings = analyzeSourcePolicy([
      {
        path: "src/application/unknown.ts",
        source: "import { value } from '../mystery'; void value;",
      },
    ]);
    expect(uniqueCodes(findings)).toContain(SOURCE_POLICY_CODES.boundaryUnknownLayer);
  });
});

describe("offline and source capability policy", () => {
  for (const fixture of capabilityCases.capabilityCases) {
    test(fixture.id, () => {
      const actual = uniqueCodes(
        analyzeSourcePolicy([{ path: fixture.path, source: fixture.source }]),
      );
      expect(actual).toEqual([...fixture.codes].sort());
    });
  }

  test("finding order and ranges are stable across input order", () => {
    const sources: VirtualSource[] = [
      {
        path: "src/domain/illegal.ts",
        source: "const before = 1;\nimport { value } from '../theory';\nvoid before; void value;",
      },
      {
        path: "src/ui/unsafe.ts",
        source: "element.innerHTML = value;",
      },
    ];
    const forward = analyzeSourcePolicy(sources);
    const reverse = analyzeSourcePolicy([...sources].reverse());
    expect(reverse).toEqual(forward);

    const boundary = forward.find(
      (item) => item.code === SOURCE_POLICY_CODES.boundaryLayerDirection,
    );
    expect(boundary).toBeDefined();
    expect(boundary?.line).toBe(2);
    expect(boundary?.column).toBeGreaterThan(1);
    const source = sources[0]?.source ?? "";
    expect(source.slice(boundary?.start, boundary?.end)).toBe("'../theory'");
  });
});
