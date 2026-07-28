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
  baseDeclarations: Readonly<Record<string, string>>;
  lightDeclarations: Readonly<Record<string, string>>;
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
const LIGHT_THEME_MARKER = "@media (prefers-color-scheme: light)";
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

/**
 * Only tokens.css may carry theme scopes: its single light-theme media block
 * splits the file into a base map and an override map, and each scope is
 * checked for duplicates independently. Every other stylesheet contributes
 * to the base scope and may not redeclare shared tokens at all.
 */
function themeScopesOf(
  path: string,
  source: string,
): readonly (readonly [scope: "base" | "light", text: string])[] {
  if (path !== "src/styles/tokens.css") return [["base", source]];
  const lightStart = source.indexOf(LIGHT_THEME_MARKER);
  if (lightStart < 0) return [["base", source]];
  return [
    ["base", source.slice(0, lightStart)],
    ["light", source.slice(lightStart)],
  ];
}

function analyzeCss(sources: Readonly<Record<string, string>>): CssAnalysis {
  const baseDeclarations: Record<string, string> = {};
  const lightDeclarations: Record<string, string> = {};
  const declarationOwners = new Map<string, string[]>();
  const literalFindings: string[] = [];
  const references = new Set<string>();

  for (const [path, source] of Object.entries(sources).sort(([left], [right]) => left.localeCompare(right))) {
    for (const [scope, text] of themeScopesOf(path, source)) {
      for (const match of text.matchAll(TOKEN_DECLARATION)) {
        const name = match[1];
        const value = match[2];
        if (name === undefined || value === undefined) continue;
        if (!(name in LOCAL_CUSTOM_PROPERTY_OWNERS)) {
          if (scope === "light") lightDeclarations[name] = value.trim();
          else baseDeclarations[name] = value.trim();
        }
        const owners = declarationOwners.get(name) ?? [];
        owners.push(`${path}#${scope}`);
        declarationOwners.set(name, owners);
      }
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
    baseDeclarations,
    lightDeclarations,
    localDeclarations: Object.fromEntries(
      [...declarationOwners]
        .filter(([name]) => name in LOCAL_CUSTOM_PROPERTY_OWNERS)
        .map(([name, owners]) => [
          name,
          owners.map((owner) => owner.replace(/#(?:base|light)$/u, "")),
        ] as const),
    ),
    literalFindings,
    undefinedReferences: [...references]
      .filter(
        (name) =>
          !(name in baseDeclarations) && !(name in LOCAL_CUSTOM_PROPERTY_OWNERS),
      )
      .sort(),
    duplicateDeclarations: [...declarationOwners]
      .filter(([, owners]) => new Set(owners).size !== owners.length || owners.length > 2)
      .map(([name, owners]) => `${name}:${owners.join(",")}`)
      .concat(
        [...declarationOwners]
          .filter(
            ([, owners]) =>
              owners.length === 2 &&
              new Set(owners).size === 2 &&
              !(owners.includes("src/styles/tokens.css#base") &&
                owners.includes("src/styles/tokens.css#light")),
          )
          .map(([name, owners]) => `${name}:${owners.join(",")}`),
      )
      .sort(),
  };
}

/** Base expectations: every group except the light-theme override group. */
function expectedBaseTokens(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(contract.tokenDefinitions)
      .filter(([group]) => group !== "colorLight")
      .flatMap(([, group]) => Object.entries(group)),
  );
}

function expectedLightTokens(): Readonly<Record<string, string>> {
  return { ...contract.tokenDefinitions["colorLight"] };
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

function contrastFindings(
  tokens: Readonly<Record<string, string>>,
  theme: string,
): readonly string[] {
  const findings: string[] = [];
  for (const pair of contract.allowedContrastPairs) {
    for (const foreground of pair.foregrounds) {
      for (const background of pair.backgrounds) {
        const foregroundValue = tokens[foreground];
        const backgroundValue = tokens[background];
        if (foregroundValue === undefined || backgroundValue === undefined) {
          findings.push(`${theme}:${pair.id}:${foreground}:${background}:missing`);
          continue;
        }
        const ratio = contrast(foregroundValue, backgroundValue);
        if (ratio + Number.EPSILON < pair.minimumRatio) {
          findings.push(`${theme}:${pair.id}:${foreground}:${background}:${ratio.toFixed(4)}`);
        }
      }
    }
  }
  return findings;
}

describe("TR-U0-TOKENS independently checked production CSS", () => {
  test("U0-CONTRAST-001 U0-CONTRAST-002 U0-CONTRAST-003 U0-CONTRAST-004 U0-CONTRAST-005 U0-CONTRAST-006 U0-CONTRAST-007 U0-CONTRAST-008 U0-CONTRAST-009 actual token values satisfy every declared contrast cross-product in both themes", async () => {
    const analysis = analyzeCss(await styleSources());
    expect(analysis.baseDeclarations).toEqual(expectedBaseTokens());
    expect(analysis.lightDeclarations).toEqual(expectedLightTokens());
    expect(contrastFindings(analysis.baseDeclarations, "dark")).toEqual([]);
    const lightMerged = {
      ...analysis.baseDeclarations,
      ...analysis.lightDeclarations,
    };
    expect(contrastFindings(lightMerged, "light")).toEqual([]);
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

  test("every light-theme override names a token the base theme declares", async () => {
    const analysis = analyzeCss(await styleSources());
    const orphans = Object.keys(analysis.lightDeclarations).filter(
      (name) => !(name in analysis.baseDeclarations),
    );
    expect(orphans).toEqual([]);
  });

  test("U0-CONTRAST-001 semantic counterfactual detects a low-contrast production token", async () => {
    const analysis = analyzeCss(await styleSources());
    const damaged = { ...analysis.baseDeclarations, "--text-primary": "#1a1611" };
    expect(contrastFindings(damaged, "dark").length).toBeGreaterThan(0);
    const damagedLight = {
      ...analysis.baseDeclarations,
      ...analysis.lightDeclarations,
      "--text-primary": "#f8f3e8",
    };
    expect(contrastFindings(damagedLight, "light").length).toBeGreaterThan(0);
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
      "--surface-app:src/styles/tokens.css#base,src/styles/tokens.css#base",
    ]);
  });
});
