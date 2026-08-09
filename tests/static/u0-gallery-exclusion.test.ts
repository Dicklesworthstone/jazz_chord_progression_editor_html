import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";

import { describe, expect, setDefaultTimeout, test } from "bun:test";
import * as ts from "typescript";

import { buildStandalone } from "../../scripts/build";
import {
  analyzeSourcePolicy,
  SOURCE_POLICY_CODES,
} from "../../scripts/source-policy";
import {
  U0_COMPONENT_GALLERY_APPLICABLE_CELLS,
  U0_COMPONENT_GALLERY_CELLS,
  U0_COMPONENT_GALLERY_COMPONENTS,
  U0_COMPONENT_GALLERY_COUNTS,
  U0_COMPONENT_GALLERY_HEADING,
  U0_COMPONENT_GALLERY_MARKER,
  U0_COMPONENT_GALLERY_NOT_APPLICABLE_CELLS,
  U0_COMPONENT_GALLERY_RELEASE_SENTINELS,
  U0_COMPONENT_GALLERY_ROUTE,
  U0_COMPONENT_GALLERY_TEST_CONTROL,
} from "../visual/u0-component-gallery";

setDefaultTimeout(90_000);

type PrimitiveMatrix = Readonly<{
  components: readonly Readonly<{ id: string; name: string }>[];
  galleryCells: readonly Readonly<{
    id: string;
    componentId: string;
    state: string;
    applicability: "applicable" | "not-applicable";
    notApplicableReason: string | null;
    props: Readonly<{ setId: string }> | null;
  }>[];
}>;

const root = process.cwd();
const galleryPath = "tests/visual/u0-component-gallery.tsx";
const fixture = await Bun.file(
  resolve(root, "tests/fixtures/ui/primitive-state-matrix.json"),
).json() as PrimitiveMatrix;

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function sourceKind(path: string): ts.ScriptKind {
  return path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function moduleSpecifiers(path: string, source: string): readonly string[] {
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourceKind(path),
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return specifiers;
}

function resolveProjectModule(
  importer: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("src/")) {
    return null;
  }
  const base = specifier.startsWith("@/")
    ? resolve(root, "src", specifier.slice(2))
    : specifier.startsWith("src/")
      ? resolve(root, specifier)
      : resolve(root, dirname(importer), specifier);
  const candidates = extname(base).length > 0
    ? [base]
    : [
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
      ];
  const target = candidates.find((candidate) => existsSync(candidate));
  return target === undefined ? null : normalizePath(relative(root, target));
}

async function productionSources(): Promise<ReadonlyMap<string, string>> {
  const sources = new Map<string, string>();
  const glob = new Bun.Glob("src/**/*.{ts,tsx}");
  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    const normalized = normalizePath(path);
    sources.set(normalized, await readFile(resolve(root, normalized), "utf8"));
  }
  return sources;
}

async function reachableProductionGraph(): Promise<readonly string[]> {
  const sources = await productionSources();
  const pending = ["src/main.tsx"];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || visited.has(path)) continue;
    visited.add(path);
    const source = sources.get(path);
    if (source === undefined) continue;
    for (const specifier of moduleSpecifiers(path, source)) {
      const target = resolveProjectModule(path, specifier);
      if (target !== null && !visited.has(target)) pending.push(target);
    }
  }
  return sorted([...visited]);
}

describe("U0 component gallery fixture ownership", () => {
  test("U0-PRIM-002 has the exact reviewed route and complete applicable/not-applicable partition", () => {
    expect(U0_COMPONENT_GALLERY_ROUTE).toEqual({
      id: "u0-component-gallery",
      path: "/__tests__/u0-component-gallery",
    });
    expect(U0_COMPONENT_GALLERY_MARKER).toBe("data-u0-component-gallery");
    expect(U0_COMPONENT_GALLERY_TEST_CONTROL).toBe("data-u0-test-control");
    expect(U0_COMPONENT_GALLERY_HEADING).toBe("U0 Component Gallery");
    expect(U0_COMPONENT_GALLERY_COUNTS).toEqual({
      components: 51,
      cells: 714,
      applicable: 609,
      notApplicable: 105,
    });

    const expectedApplicable = fixture.galleryCells
      .filter((cell) => cell.applicability === "applicable")
      .map((cell) => cell.id);
    const expectedNotApplicable = fixture.galleryCells
      .filter((cell) => cell.applicability === "not-applicable")
      .map((cell) => cell.id);
    expect(sorted(U0_COMPONENT_GALLERY_APPLICABLE_CELLS.map((cell) => cell.id))).toEqual(
      sorted(expectedApplicable),
    );
    expect(sorted(U0_COMPONENT_GALLERY_NOT_APPLICABLE_CELLS.map((cell) => cell.id))).toEqual(
      sorted(expectedNotApplicable),
    );
    expect(
      U0_COMPONENT_GALLERY_NOT_APPLICABLE_CELLS.every(
        (cell) => (cell.notApplicableReason?.length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(new Set(U0_COMPONENT_GALLERY_CELLS.map((cell) => cell.id)).size).toBe(714);
    expect(sorted(U0_COMPONENT_GALLERY_COMPONENTS.map((component) => component.id))).toEqual(
      sorted(fixture.components.map((component) => component.id)),
    );
    for (const component of U0_COMPONENT_GALLERY_COMPONENTS) {
      expect(
        U0_COMPONENT_GALLERY_APPLICABLE_CELLS.some(
          (cell) => cell.componentId === component.id && cell.state === "default",
        ),
      ).toBe(true);
    }
  });

  test("is owned only by the test source graph and the production policy rejects a leak", async () => {
    expect(galleryPath.startsWith("tests/visual/")).toBe(true);
    const sourceIndex = await readFile(resolve(root, "src/index.html"), "utf8");
    expect(sourceIndex).toContain('src="./main.tsx"');
    expect(sourceIndex).not.toContain("tests/visual");

    const mainSource = await readFile(resolve(root, "src/main.tsx"), "utf8");
    expect(moduleSpecifiers("src/main.tsx", mainSource)).toContain("./ui/runtime");
    expect(moduleSpecifiers("src/main.tsx", mainSource)).not.toContain("./ui");
    const runtimeSource = await readFile(resolve(root, "src/ui/runtime.ts"), "utf8");
    /* jcpe-v2r-gates-xaib: runtime.ts also re-exports the theme module (the
     * v2 paper/night pin) — value then type export, hence the pair. */
    /* U7 midi-export-delivery joined the runtime surface (b3000e2). */
    expect(moduleSpecifiers("src/ui/runtime.ts", runtimeSource)).toEqual([
      "./App",
      "./midi-export-delivery",
      "./theme",
      "./theme",
      "./App",
    ]);

    const sources = await productionSources();
    for (const [path, source] of sources) {
      expect(source.includes(U0_COMPONENT_GALLERY_MARKER), path).toBe(false);
      expect(source.includes(U0_COMPONENT_GALLERY_ROUTE.id), path).toBe(false);
      for (const specifier of moduleSpecifiers(path, source)) {
        expect(resolveProjectModule(path, specifier), `${path} -> ${specifier}`).not.toBe(
          galleryPath,
        );
      }
    }
    const productionGraph = await reachableProductionGraph();
    expect(productionGraph).toContain("src/ui/runtime.ts");
    expect(productionGraph).not.toContain("src/ui/index.ts");
    expect(productionGraph).not.toContain(galleryPath);

    const negativeControl = analyzeSourcePolicy([
      {
        path: "src/ui/gallery-leak.ts",
        source:
          "export { U0ComponentGallery } from '../../tests/visual/u0-component-gallery';",
      },
    ]);
    expect(negativeControl.map((finding) => finding.code)).toContain(
      SOURCE_POLICY_CODES.boundaryTestSupport,
    );
  });
});

test("U0-REF-008 fresh standalone build excludes every gallery marker, label, fixture ID, and test control", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-gallery-release-"));
  try {
    const result = await buildStandalone({
      root,
      outDir: temporaryRoot,
      publishRoot: false,
    });
    const artifact = await readFile(result.artifactPath, "utf8");
    for (const sentinel of U0_COMPONENT_GALLERY_RELEASE_SENTINELS) {
      expect(artifact.includes(sentinel), sentinel).toBe(false);
    }
    for (const cell of fixture.galleryCells) {
      expect(artifact.includes(cell.id), cell.id).toBe(false);
      if (cell.props !== null) {
        expect(artifact.includes(cell.props.setId), cell.props.setId).toBe(false);
      }
    }
    expect(artifact).not.toMatch(/U0-GAL-[0-9]{3}-/u);
    expect(artifact).not.toMatch(/U0-PROPS-[0-9]{3}/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
