import { describe, expect, test } from "bun:test";

import {
  analyzeSourcePolicy,
  inspectProjectSourcePolicy,
  SOURCE_POLICY_CODES,
  type VirtualSource,
} from "../../scripts/source-policy";

type PackageManifest = Readonly<{
  dependencies?: Readonly<Record<string, string>>;
}>;

const FORBIDDEN_UI_PACKAGES = Object.freeze([
  "react",
  "react-dom",
  "preact/compat",
  "@radix-ui/react-dialog",
  "tailwindcss",
  "shadcn",
  "lucide-react",
] as const);

async function uiTextSources(): Promise<readonly Readonly<{
  path: string;
  source: string;
}>[]> {
  const paths: string[] = [];
  for (const pattern of ["src/ui/**/*.{ts,tsx}", "src/styles/*.css"] as const) {
    const glob = new Bun.Glob(pattern);
    for await (const path of glob.scan({ cwd: process.cwd(), onlyFiles: true })) {
      paths.push(path.replaceAll("\\", "/"));
    }
  }
  paths.sort();
  return Promise.all(paths.map(async (path) => ({
    path,
    source: await Bun.file(path).text(),
  })));
}

/*
 * Amended for the v2 ink-on-paper identity (jcpe-v2r-gates-xaib): the
 * generated fonts.css carries the reviewed embedded-OFL faces as
 * `url(data:font/woff2;base64,…)` payloads, and studio.css paints its paper
 * grain from a `url("data:image/svg+xml;…")` texture. A `data:` URL is a
 * local embedded byte payload — the artifact policy inventories every one
 * with provenance and the CSP forbids all network sources — so only
 * NON-data url() resources and @font-face rules OUTSIDE the generated
 * fonts.css remain runtime-dependency findings here.
 */
function cssRuntimeFindings(path: string, source: string): readonly string[] {
  const findings: string[] = [];
  const withoutDataUrls = source.replaceAll(
    /\burl\s*\(\s*(?:"data:[^"]*"|'data:[^']*'|data:[^)]*)\)/giu,
    "url(EMBEDDED_DATA)",
  );
  if (/@import\b/iu.test(withoutDataUrls)) {
    findings.push(`${path}:remote-or-runtime-import`);
  }
  if (/@font-face\b/iu.test(source) && path !== "src/styles/fonts.css") {
    findings.push(`${path}:bundled-or-remote-font`);
  }
  if (/\burl\s*\(\s*(?!EMBEDDED_DATA\))/iu.test(withoutDataUrls)) {
    findings.push(`${path}:url-bearing-css-resource`);
  }
  if (/expression\s*\(/iu.test(withoutDataUrls)) {
    findings.push(`${path}:css-runtime-expression`);
  }
  return findings;
}

function counterfactualSources(): readonly VirtualSource[] {
  return FORBIDDEN_UI_PACKAGES.map((packageName, index) => ({
    path: `src/ui/u0-counterfactual-${String(index)}.tsx`,
    source: `import value from ${JSON.stringify(packageName)}; void value;`,
  }));
}

describe("TR-U0-SOURCE source-owned runtime policy", () => {
  test("U0-PRIM-001 proves the actual project has only Preact in production and a clean source-policy graph", async () => {
    const [manifest, report, sources] = await Promise.all([
      Bun.file(new URL("../../package.json", import.meta.url)).json() as Promise<PackageManifest>,
      inspectProjectSourcePolicy(),
      uiTextSources(),
    ]);

    expect(manifest.dependencies).toEqual({ preact: "10.29.7" });
    expect(report.schema).toBe("jcpe.source-policy.v1");
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
    expect(report.files).toBeGreaterThan(0);

    const cssFindings = sources
      .filter(({ path }) => path.endsWith(".css"))
      .flatMap(({ path, source }) => cssRuntimeFindings(path, source));
    expect(cssFindings).toEqual([]);
  });

  test("U0-REF-007 counterfactuals reject React, compatibility, component, CSS, and icon packages", () => {
    const findings = analyzeSourcePolicy(counterfactualSources());
    expect(findings).toHaveLength(FORBIDDEN_UI_PACKAGES.length);
    expect(
      findings.every(
        ({ code }) => code === SOURCE_POLICY_CODES.boundaryPackageNotAllowed,
      ),
    ).toBe(true);
    expect(
      findings.map(({ path }) => path),
    ).toEqual(counterfactualSources().map(({ path }) => path));
  });

  test("U0-REF-007 CSS counterfactuals reject font, import, URL, and expression sidecars", () => {
    const source = [
      '@import "https://example.invalid/theme.css";',
      '@font-face { font-family: x; src: url("https://example.invalid/x.woff2"); }',
      '.x { width: expression(alert(1)); }',
    ].join("\n");
    expect(cssRuntimeFindings("src/styles/counterfactual.css", source)).toEqual([
      "src/styles/counterfactual.css:remote-or-runtime-import",
      "src/styles/counterfactual.css:bundled-or-remote-font",
      "src/styles/counterfactual.css:url-bearing-css-resource",
      "src/styles/counterfactual.css:css-runtime-expression",
    ]);
  });
});
