/**
 * Implementation-status truth gate (bead jcpe-docs-truth-pass-rcvm.2).
 *
 * The `*_IMPLEMENTATION_STATUS` constants are reviewed-packet statements, and
 * two of them rotted silently while the code moved (U7 shipped a full
 * production workflow while its packet still reads `specified-not-implemented`;
 * the A0/E0 owner ports landed while their packet still reads
 * `specified-unimplemented`). Because amending a reviewed packet's claim flags
 * needs recorded human acceptance, this test does NOT assert that the
 * constants match reality. It pins BOTH sides — each constant's current
 * literal value and the current production reachability of its witness
 * modules, computed from real imports out of `src/main.tsx` — so that when
 * either side moves, the change is forced through this table and its owning
 * bead instead of rotting silently.
 *
 * When a verify leg amends a packet's status, update the matching row here in
 * the same change and cite the acceptance:
 *  - U7 packet flags: jcpe-milestone-advanced-craft-ulj.11.3
 *  - A0/E0 owner packet flags: jcpe-94yu.2 (gated behind l3a.8.2)
 *  - E0 v2 packet flags: jcpe-milestone-reliable-studio-l3a.8.4
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

import { describe, expect, test } from "bun:test";
import * as ts from "typescript";

import { A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS } from "../../src/application/application-edit-plan-contract";
import { A0_E0_INTERCHANGE_OWNER_IMPLEMENTATION_STATUS } from "../../src/application/application-interchange-owner-contract";
import { E0_V2_IMPLEMENTATION_STATUS } from "../../src/application/e0-interchange-v2-contract";
import { U7_MIDI_EXPORT_WORKFLOW_IMPLEMENTATION_STATUS } from "../../src/application/u7-midi-export-workflow-contract";
import { U1_EDITING_IMPLEMENTATION_STATUS } from "../../src/ui/studio/u1-editing-contract";

const root = process.cwd();

function normalizePath(value: string): string {
  return value.split("\\").join("/");
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
  if (
    !specifier.startsWith(".") &&
    !specifier.startsWith("@/") &&
    !specifier.startsWith("src/")
  ) {
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

async function reachableProductionGraph(): Promise<ReadonlySet<string>> {
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
  return visited;
}

interface StatusRow {
  readonly constant: string;
  readonly declared: string;
  /** The packet's current literal value, pinned. */
  readonly expectedDeclared: string;
  /** Module whose production reachability witnesses the surface. */
  readonly witness: string;
  /** The witness's current reachability from src/main.tsx, pinned. */
  readonly expectedReachable: boolean;
  /** Bead owning any future reconciliation of this row. */
  readonly owner: string;
}

describe("implementation-status constants versus production reachability", () => {
  test("every status constant and its witness reachability match the pinned truth table", async () => {
    const graph = await reachableProductionGraph();
    const rows: readonly StatusRow[] = [
      {
        constant: "A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS",
        declared: A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS,
        expectedDeclared: "implemented-live",
        witness: "src/application/application-edit-plan.ts",
        expectedReachable: true,
        owner: "consistent — no action",
      },
      {
        constant: "U1_EDITING_IMPLEMENTATION_STATUS",
        declared: U1_EDITING_IMPLEMENTATION_STATUS,
        expectedDeclared: "implemented-live",
        witness: "src/ui/studio/ChartWorkspace.tsx",
        expectedReachable: true,
        owner: "consistent — no action",
      },
      {
        constant: "E0_V2_IMPLEMENTATION_STATUS",
        declared: E0_V2_IMPLEMENTATION_STATUS,
        expectedDeclared: "specified-unimplemented",
        witness: "src/application/e0-interchange-v2-contract.ts",
        expectedReachable: false,
        owner: "jcpe-milestone-reliable-studio-l3a.8.4",
      },
      {
        /* KNOWN DIVERGENCE, review-gated: the controller-owned production
         * ports exist (src/application/studio-interchange-owner.ts, reachable
         * and deliberately sealed in the composition root) while the packet
         * still reads specified-unimplemented. Amending the packet is
         * jcpe-94yu.2's recorded-acceptance work; delete this note and flip
         * expectedDeclared in that change. */
        constant: "A0_E0_INTERCHANGE_OWNER_IMPLEMENTATION_STATUS",
        declared: A0_E0_INTERCHANGE_OWNER_IMPLEMENTATION_STATUS,
        expectedDeclared: "specified-unimplemented",
        witness: "src/application/studio-interchange-owner.ts",
        expectedReachable: true,
        owner: "jcpe-94yu.2",
      },
      {
        /* KNOWN DIVERGENCE, review-gated: the production U7 workflow ships
         * (studio-midi-export + MidiExportPanel wired through the composition
         * root) while the packet still reads specified-not-implemented.
         * Amending the packet flags is jcpe-milestone-advanced-craft-ulj.11.3's
         * recorded-acceptance work; delete this note and flip expectedDeclared
         * in that change. ARCHITECTURE.md documents this split. */
        constant: "U7_MIDI_EXPORT_WORKFLOW_IMPLEMENTATION_STATUS",
        declared: U7_MIDI_EXPORT_WORKFLOW_IMPLEMENTATION_STATUS,
        expectedDeclared: "specified-not-implemented",
        witness: "src/application/studio-midi-export.ts",
        expectedReachable: true,
        owner: "jcpe-milestone-advanced-craft-ulj.11.3",
      },
    ];

    for (const row of rows) {
      expect(
        `${row.constant}=${row.declared}`,
      ).toBe(`${row.constant}=${row.expectedDeclared}`);
      expect(
        `${row.witness} reachable=${String(graph.has(row.witness))} (owner: ${row.owner})`,
      ).toBe(
        `${row.witness} reachable=${String(row.expectedReachable)} (owner: ${row.owner})`,
      );
    }
  });
});
