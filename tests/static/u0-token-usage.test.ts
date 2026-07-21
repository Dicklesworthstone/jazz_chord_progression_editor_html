import { describe, expect, test } from "bun:test";

type ContractFixture = Readonly<{
  tokenDefinitions: Readonly<Record<string, Readonly<Record<string, string>>>>;
  allowedContrastPairs: readonly Readonly<{
    id: string;
    foregrounds: readonly string[];
    backgrounds: readonly string[];
    minimumRatio: number;
  }>[];
}>;

type CssAnalysis = Readonly<{
  declarations: Readonly<Record<string, string>>;
  localDeclarations: Readonly<Record<string, readonly string[]>>;
  literalFindings: readonly string[];
  undefinedReferences: readonly string[];
  duplicateDeclarations: readonly string[];
}>;

const contract = await Bun.file(
  new URL("../fixtures/ui/u0-ui-contract.json", import.meta.url),
).json() as ContractFixture;

const TOKEN_DECLARATION = /^\s*(--[a-z][a-z0-9-]*)\s*:\s*([^;\r\n]+)\s*;/gmu;
const TOKEN_REFERENCE = /var\(\s*(--[a-z][a-z0-9-]*)/gu;
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(/giu;
const LOCAL_CUSTOM_PROPERTY_OWNERS = Object.freeze({
  "--studio-collapsed-rail": "src/styles/studio.css",
  "--ui-tree-level": "src/ui/primitives/StructuredViews.tsx",
} as const);

async function styleSources(): Promise<Readonly<Record<string, string>>> {
  const paths: string[] = [];
  const glob = new Bun.Glob("src/styles/*.css");
  for await (const path of glob.scan({ cwd: process.cwd(), onlyFiles: true })) {
    paths.push(path.replaceAll("\\", "/"));
  }
  paths.sort();
  return Object.fromEntries(
    await Promise.all(paths.map(async (path) => [path, await Bun.file(path).text()] as const)),
  );
}

function analyzeCss(sources: Readonly<Record<string, string>>): CssAnalysis {
  const declarations: Record<string, string> = {};
  const declarationOwners = new Map<string, string[]>();
  const literalFindings: string[] = [];
  const references = new Set<string>();

  for (const [path, source] of Object.entries(sources).sort(([left], [right]) => left.localeCompare(right))) {
    for (const match of source.matchAll(TOKEN_DECLARATION)) {
      const name = match[1];
      const value = match[2];
      if (name === undefined || value === undefined) continue;
      if (!(name in LOCAL_CUSTOM_PROPERTY_OWNERS)) {
        declarations[name] = value.trim();
      }
      const owners = declarationOwners.get(name) ?? [];
      owners.push(path);
      declarationOwners.set(name, owners);
    }
    for (const match of source.matchAll(TOKEN_REFERENCE)) {
      const name = match[1];
      if (name !== undefined) references.add(name);
    }
    if (path !== "src/styles/tokens.css") {
      for (const match of source.matchAll(COLOR_LITERAL)) {
        literalFindings.push(`${path}:${String(match.index)}:${match[0]}`);
      }
    }
  }

  return {
    declarations,
    localDeclarations: Object.fromEntries(
      [...declarationOwners]
        .filter(([name]) => name in LOCAL_CUSTOM_PROPERTY_OWNERS)
        .map(([name, owners]) => [name, owners] as const),
    ),
    literalFindings,
    undefinedReferences: [...references]
      .filter(
        (name) =>
          !(name in declarations) && !(name in LOCAL_CUSTOM_PROPERTY_OWNERS),
      )
      .sort(),
    duplicateDeclarations: [...declarationOwners]
      .filter(([, owners]) => owners.length !== 1)
      .map(([name, owners]) => `${name}:${owners.join(",")}`)
      .sort(),
  };
}

function expectedTokens(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.values(contract.tokenDefinitions).flatMap((group) =>
      Object.entries(group)
    ),
  );
}

function rgb(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/iu.exec(hex);
  if (match?.[1] === undefined) throw new Error(`Opaque contrast token is not six-digit hex: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(left: string, right: string): number {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function contrastFindings(tokens: Readonly<Record<string, string>>): readonly string[] {
  const findings: string[] = [];
  for (const pair of contract.allowedContrastPairs) {
    for (const foreground of pair.foregrounds) {
      for (const background of pair.backgrounds) {
        const foregroundValue = tokens[foreground];
        const backgroundValue = tokens[background];
        if (foregroundValue === undefined || backgroundValue === undefined) {
          findings.push(`${pair.id}:${foreground}:${background}:missing`);
          continue;
        }
        const ratio = contrast(foregroundValue, backgroundValue);
        if (ratio + Number.EPSILON < pair.minimumRatio) {
          findings.push(`${pair.id}:${foreground}:${background}:${ratio.toFixed(4)}`);
        }
      }
    }
  }
  return findings;
}

describe("TR-U0-TOKENS independently checked production CSS", () => {
  test("U0-CONTRAST-001 U0-CONTRAST-002 U0-CONTRAST-003 U0-CONTRAST-004 U0-CONTRAST-005 U0-CONTRAST-006 U0-CONTRAST-007 U0-CONTRAST-008 U0-CONTRAST-009 actual token values satisfy every declared contrast cross-product", async () => {
    const analysis = analyzeCss(await styleSources());
    expect(analysis.declarations).toEqual(expectedTokens());
    expect(contrastFindings(analysis.declarations)).toEqual([]);
  });

  test("U0-PRIM-012 U0-PRIM-013 U0-VIEW-005 component CSS uses declared semantic tokens without copied color literals", async () => {
    const analysis = analyzeCss(await styleSources());
    const structuredSource = await Bun.file(
      new URL("../../src/ui/primitives/StructuredViews.tsx", import.meta.url),
    ).text();
    expect(analysis.literalFindings).toEqual([]);
    expect(analysis.undefinedReferences).toEqual([]);
    expect(analysis.duplicateDeclarations).toEqual([]);
    expect(analysis.localDeclarations).toEqual({
      "--studio-collapsed-rail": ["src/styles/studio.css"],
    });
    expect(structuredSource).toContain(
      'style={`--ui-tree-level: ${String(item.level)}`}',
    );
  });

  test("U0-CONTRAST-001 semantic counterfactual detects a low-contrast production token", async () => {
    const analysis = analyzeCss(await styleSources());
    const damaged = { ...analysis.declarations, "--text-primary": "#151a21" };
    expect(contrastFindings(damaged).length).toBeGreaterThan(0);
  });

  test("U0-PRIM-013 mutation controls detect copied literals, undefined references, and duplicate declarations", () => {
    const analysis = analyzeCss({
      "src/styles/tokens.css": [
        ":root {",
        "  --surface-app: #000000;",
        "  --surface-app: #000000;",
        "}",
      ].join("\n"),
      "src/styles/component.css": ".x { color: #ffffff; background: var(--missing); }",
    });
    expect(analysis.literalFindings).toHaveLength(1);
    expect(analysis.undefinedReferences).toEqual(["--missing"]);
    expect(analysis.duplicateDeclarations).toEqual([
      "--surface-app:src/styles/tokens.css,src/styles/tokens.css",
    ]);
  });
});
