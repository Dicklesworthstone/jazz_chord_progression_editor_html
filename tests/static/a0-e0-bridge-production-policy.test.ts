import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import type {
  A0E0InterchangeOwnerOperations,
  A0E0InterchangeOwnerPorts,
  ApplicationDocumentIdentity,
  DiscardImportReplacementPublicationOperation,
  DiscardImportReplacementPublicationPort,
  PrepareImportReplacementPublicationResult,
  PublishCanonicalExportRevisionResult,
  PublishImportReplacementResult,
} from "../../src/application/application-interchange-owner-contract";
import type {
  StudioComposition,
  StudioController,
} from "../../src/application";
import type {
  StudioInterchangeOwnerDiagnostic,
  createStudioInterchangeOwnerOperations,
} from "../../src/application/studio-interchange-owner";
import {
  BRIDGE_REPOSITORY_ROOT,
  FORBIDDEN_STATE_KEYS,
  loadBridgeFixturePacket,
  sha256Hex,
} from "../support/a0-e0-bridge-conformance";
import { A0_E0_BRIDGE_SPEC_BYTE_DIGESTS } from "../../scripts/validate-a0-e0-bridge-contract";

/**
 * Type-level and source-policy evidence for the PRODUCTION A0/E0 owner-ports
 * implementation (bead jcpe-94yu.3): the sealed producer aggregate, the
 * state-free public results, the composition-private binding, the synchronous
 * no-wall-time critical sections, and the install/notify ordering law — all
 * checked against `src/application/studio-interchange-owner.ts` and the
 * composition seam in `src/application/studio-controller.ts` with the
 * TypeScript AST, in the established source-policy style.
 */

/* -------------------------------------------------------------------------- */
/* Type-level evidence (compile-time; the array pins each law's discharge)    */
/* -------------------------------------------------------------------------- */

type Extends<A, B> = [A] extends [B] ? true : false;
type Not<A extends boolean> = A extends true ? false : true;
type Equal<A, B> = Extends<A, B> extends true
  ? Extends<B, A> extends true
    ? true
    : false
  : false;

type ProducerFactoryReturn = ReturnType<
  typeof createStudioInterchangeOwnerOperations
>;

type ForbiddenResultKey = (typeof FORBIDDEN_STATE_KEYS)[number];
type KeysOf<T> = T extends unknown ? keyof T & string : never;
type StateFreeTopLevel<T> = Extract<KeysOf<T>, ForbiddenResultKey> extends never
  ? true
  : false;

const typeLevelEvidence: readonly true[] = [
  /* The factory returns the exact sealed producer aggregate. */
  true satisfies Equal<ProducerFactoryReturn, A0E0InterchangeOwnerOperations>,
  /* The composition exposes exactly the producer aggregate. */
  true satisfies Equal<
    StudioComposition["interchangeOwner"],
    A0E0InterchangeOwnerOperations
  >,
  /* Producer operations narrow to the untrusted consumer ports... */
  true satisfies Extends<
    A0E0InterchangeOwnerOperations,
    A0E0InterchangeOwnerPorts
  >,
  /* ...and only in that direction. */
  true satisfies Not<
    Extends<A0E0InterchangeOwnerPorts, A0E0InterchangeOwnerOperations>
  >,
  /* Cleanup is the deliberate exact-result exception: operation === port. */
  true satisfies Equal<
    DiscardImportReplacementPublicationOperation,
    DiscardImportReplacementPublicationPort
  >,
  /* The owner aggregate is NOT a StudioController member. */
  true satisfies Not<Extends<"interchangeOwner", keyof StudioController>>,
  true satisfies Not<Extends<"dispatch", keyof StudioController>>,
  /* Every public owner result is state-free at the top level, per variant. */
  true satisfies StateFreeTopLevel<PrepareImportReplacementPublicationResult>,
  true satisfies StateFreeTopLevel<PublishImportReplacementResult>,
  true satisfies StateFreeTopLevel<PublishCanonicalExportRevisionResult>,
  true satisfies StateFreeTopLevel<ApplicationDocumentIdentity>,
  /* The diagnostics record carries exactly operation, event, and ordinal. */
  true satisfies Equal<
    keyof StudioInterchangeOwnerDiagnostic,
    "operation" | "event" | "ordinal"
  >,
];

/* -------------------------------------------------------------------------- */
/* AST source policy over the production owner module                          */
/* -------------------------------------------------------------------------- */

const OWNER_MODULE_PATH = join(
  BRIDGE_REPOSITORY_ROOT,
  "src/application/studio-interchange-owner.ts",
);
const CONTROLLER_MODULE_PATH = join(
  BRIDGE_REPOSITORY_ROOT,
  "src/application/studio-controller.ts",
);
const APPLICATION_INDEX_PATH = join(
  BRIDGE_REPOSITORY_ROOT,
  "src/application/index.ts",
);
const APPLICATION_RUNTIME_PATH = join(
  BRIDGE_REPOSITORY_ROOT,
  "src/application/runtime.ts",
);

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

const ALLOWED_OWNER_IMPORTS = new Set([
  "../domain",
  "./application-interchange-owner-contract",
  "./application-state-contract",
  "./application-bookmarks",
  "./application-history",
  "./application-state-helpers",
]);

describe("A0/E0 bridge production source policy: studio-interchange-owner.ts", () => {
  const source = parse(OWNER_MODULE_PATH);

  test("type-level evidence array is fully discharged", () => {
    /* Each entry compiles only when its law holds; the count pins coverage. */
    expect(typeLevelEvidence).toHaveLength(12);
  });

  test("imports only the pinned application-layer dependency edges", () => {
    const specifiers: string[] = [];
    walk(source, (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifiers.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        throw new Error("BRIDGE_POLICY_DYNAMIC_IMPORT");
      }
    });
    for (const specifier of specifiers) {
      expect(ALLOWED_OWNER_IMPORTS.has(specifier)).toBe(true);
    }
    /* No E0, export, UI, audio, persistence, or theory edge exists. */
    expect(
      specifiers.some((specifier) =>
        /export|e0|\.\.\/ui|audio|persistence|theory|compatibility/u.test(
          specifier,
        ),
      ),
    ).toBe(false);
  });

  test("the module is fully synchronous: no await, async, promise, timer, or microtask", () => {
    const violations: string[] = [];
    walk(source, (node) => {
      if (ts.isAwaitExpression(node)) violations.push("await-expression");
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isMethodDeclaration(node)) &&
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
        ) === true
      ) {
        violations.push("async-function");
      }
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const isPropertyNamePosition =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isPropertySignature(parent) && parent.name === node);
        if (
          [
            "Promise",
            "setTimeout",
            "setInterval",
            "queueMicrotask",
            "requestAnimationFrame",
          ].includes(node.text) &&
          !isPropertyNamePosition
        ) {
          violations.push(`identifier:${node.text}`);
        }
      }
    });
    expect(violations).toEqual([]);
  });

  test("no wall-clock source is consulted", () => {
    const clockIdentifiers: string[] = [];
    walk(source, (node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["Date", "performance"].includes(node.expression.text)
      ) {
        clockIdentifiers.push(
          `${node.expression.text}.${node.name.text}`,
        );
      }
    });
    expect(clockIdentifiers).toEqual([]);
  });

  test("no object literal in the module carries a state-bearing key", () => {
    const forbidden = new Set<string>(FORBIDDEN_STATE_KEYS);
    const violations: string[] = [];
    walk(source, (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          const name = property.name;
          if (
            name !== undefined &&
            (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
            forbidden.has(name.text)
          ) {
            violations.push(name.text);
          }
        }
      }
    });
    expect(violations).toEqual([]);
  });

  test("installState receives only the two pure state constructors' outputs", () => {
    /* Collect `const X = createExportRevisionMarkedState(...)` style bindings. */
    const constructorBindings = new Set<string>();
    const installArguments: string[] = [];
    walk(source, (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        [
          "createExportRevisionMarkedState",
          "applyPreparedImportReplacementToLatestState",
        ].includes(node.initializer.expression.text)
      ) {
        constructorBindings.add(node.name.text);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "installState"
      ) {
        const argument = node.arguments[0];
        installArguments.push(
          argument !== undefined && ts.isIdentifier(argument)
            ? argument.text
            : "<non-identifier>",
        );
      }
    });
    expect(installArguments.length).toBe(2);
    for (const argument of installArguments) {
      expect(constructorBindings.has(argument)).toBe(true);
    }
  });

  test("every notifyListeners call follows an installState call in the same body", () => {
    const bodies: ts.Block[] = [];
    walk(source, (node) => {
      if (
        (ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) &&
        node.body !== undefined &&
        ts.isBlock(node.body)
      ) {
        bodies.push(node.body);
      }
    });
    /* Nested bodies are visited from every enclosing body; dedupe by span. */
    const notifyPositions = new Set<number>();
    for (const body of bodies) {
      const calls: Array<{ name: string; position: number }> = [];
      walk(body, (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ["installState", "notifyListeners"].includes(node.expression.text)
        ) {
          calls.push({ name: node.expression.text, position: node.pos });
        }
      });
      for (const call of calls) {
        if (call.name !== "notifyListeners") continue;
        notifyPositions.add(call.position);
        expect(
          calls.some(
            (other) =>
              other.name === "installState" && other.position < call.position,
          ),
        ).toBe(true);
      }
    }
    expect(notifyPositions.size).toBe(2);
  });
});

describe("A0/E0 bridge production source policy: composition privacy", () => {
  test("the controller object literal exposes no owner or raw-dispatch member", () => {
    const source = parse(CONTROLLER_MODULE_PATH);
    const violations: string[] = [];
    let compositionReturns = 0;
    let ownerFactoryCalls = 0;
    walk(source, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "createStudioInterchangeOwnerOperations"
      ) {
        ownerFactoryCalls += 1;
      }
      if (ts.isObjectLiteralExpression(node)) {
        const names = node.properties
          .map((property) => {
            if (ts.isShorthandPropertyAssignment(property)) {
              return property.name.text;
            }
            const name = property.name;
            if (name !== undefined && ts.isIdentifier(name)) return name.text;
            return null;
          })
          .filter((name): name is string => name !== null);
        if (
          names.includes("controller") &&
          names.includes("interchangeOwner") &&
          names.length === 2
        ) {
          compositionReturns += 1;
        }
        /* No larger literal may re-expose the owner aggregate. */
        if (names.includes("interchangeOwner") && names.length !== 2) {
          violations.push("interchangeOwner-widened");
        }
        if (names.includes("dispatch") || names.includes("markExported")) {
          violations.push("raw-dispatch-member");
        }
      }
    });
    expect(violations).toEqual([]);
    /* The owner aggregate is constructed exactly once, in the composition. */
    expect(ownerFactoryCalls).toBe(1);
    expect(compositionReturns).toBeGreaterThanOrEqual(1);
  });

  test("the public application barrels never export the owner factory or access seam", () => {
    for (const path of [APPLICATION_INDEX_PATH, APPLICATION_RUNTIME_PATH]) {
      const text = readFileSync(path, "utf8");
      expect(text.includes("createStudioInterchangeOwnerOperations")).toBe(
        false,
      );
      expect(text.includes("StudioInterchangeOwnerAccess")).toBe(false);
    }
  });
});

describe("A0/E0 bridge production policy: pinned fixture input closure", () => {
  test("the five bridge fixture files match the frozen validator byte pins", () => {
    const packet = loadBridgeFixturePacket();
    for (const [name, digest] of Object.entries(packet.byteDigests)) {
      expect(A0_E0_BRIDGE_SPEC_BYTE_DIGESTS[name]).toBe(digest);
    }
    expect(Object.keys(packet.byteDigests).sort()).toEqual(
      Object.keys(A0_E0_BRIDGE_SPEC_BYTE_DIGESTS).sort(),
    );
  });

  test("emits the machine-readable static observation", () => {
    const ownerModuleSha256 = sha256Hex(readFileSync(OWNER_MODULE_PATH));
    const summary = {
      typeLevelAssertions: typeLevelEvidence.length,
      ownerModuleSha256,
      forbiddenStateKeys: [...FORBIDDEN_STATE_KEYS],
      installConstructorLaw: "installState-only-from-pure-state-constructors",
      notifyAfterInstallLaw: "every-notify-follows-install-in-body",
    };
    console.log(`BRIDGE_STATIC_OBSERVATION ${JSON.stringify(summary)}`);
    expect(ownerModuleSha256.length).toBe(64);
  });
});
