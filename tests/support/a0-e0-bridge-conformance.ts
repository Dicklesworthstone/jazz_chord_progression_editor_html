import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createStudioCompositionOverState,
  validateDocumentSemantics,
  type AppState,
  type ApplicationCommandDependencies,
  type StudioComposition,
  type StudioController,
  type StudioInterchangeOwnerDiagnostic,
} from "../../src/application";
import {
  createStudioInterchangeOwnerOperations,
  type StudioInterchangeOwnerAccess,
} from "../../src/application/studio-interchange-owner";
import type { A0E0InterchangeOwnerOperations } from "../../src/application/application-interchange-owner-contract";
import {
  decodeDocumentShape,
  makeBeatPosition,
  type ValidatedDocument,
} from "../../src/domain";
import { a0Dependencies } from "./a0-application-fixture";

/**
 * A0/E0 bridge conformance kit (bead jcpe-94yu.3).
 *
 * Independent materialization of the byte-pinned bridge fixture packet under
 * `tests/fixtures/a0-e0-bridge/`, conversion of pinned AppState literals into
 * real runtime states through the production F2/F3 boundary, and two
 * instrumented harnesses that drive the REAL production owner operations:
 *
 * - the composition harness runs `createStudioCompositionOverState`, so the
 *   owner ports close over the real controller state cell, install path, and
 *   listener set;
 * - the owner-seam harness runs `createStudioInterchangeOwnerOperations` over
 *   the production `StudioInterchangeOwnerAccess` seam with a harness-owned
 *   state cell, used ONLY for pinned scenarios whose publish-time controller
 *   state is not reachable through any public controller command (the
 *   same-revision drift family). All A0 logic — owner operations, F2, F3,
 *   the history estimator, bookmark repair, history caps — is real in both.
 *
 * The materializer is authored from the fixture's own `materializationPolicy`
 * text; it never imports the frozen validator's private materializer, so the
 * expectations it resolves stay independent of that implementation.
 */

export type JsonObject = Record<string, unknown>;

const SUPPORT_DIR = dirname(fileURLToPath(import.meta.url));
export const BRIDGE_REPOSITORY_ROOT = dirname(dirname(SUPPORT_DIR));
const BRIDGE_FIXTURE_DIR = join(
  BRIDGE_REPOSITORY_ROOT,
  "tests/fixtures/a0-e0-bridge",
);
const ACCEPTED_E0_DIR = join(
  BRIDGE_REPOSITORY_ROOT,
  "tests/fixtures/interchange",
);
const ACCEPTED_E0_PREFIX = "tests/fixtures/interchange/";

export const BRIDGE_FIXTURE_FILES = Object.freeze([
  "a0-e0-bridge-contract.json",
  "owner-port-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical projection pinned by the fixture: sorted keys, JSON, UTF-8. */
export function canonicalJson(value: unknown): string {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortValue);
    if (typeof input === "object" && input !== null) {
      const entries = Object.entries(input as JsonObject).sort(([a], [b]) =>
        codeUnitCompare(a, b),
      );
      return Object.fromEntries(
        entries.map(([key, child]) => [key, sortValue(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(sortValue(value));
}

export function canonicalSha256(value: unknown): string {
  return sha256Hex(new TextEncoder().encode(canonicalJson(value)));
}

export function isObjectRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => jsonDeepEqual(item, right[index]))
    );
  }
  if (isObjectRecord(left) && isObjectRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) && jsonDeepEqual(left[key], right[key]),
      )
    );
  }
  return false;
}

function decodePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(`BRIDGE_KIT_POINTER:${pointer}`);
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

export function valueAtPointer(value: unknown, pointer: string): unknown {
  let current: unknown = value;
  for (const token of decodePointer(pointer)) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else if (isObjectRecord(current) && Object.hasOwn(current, token)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

type PointerOperation = "replace" | "append" | "remove" | "add";

/** Immutable structural pointer mutation used by both mutation dialects. */
export function applyPointerOperation(
  root: unknown,
  operation: PointerOperation,
  pointer: string,
  value: unknown,
): unknown {
  const tokens = decodePointer(pointer);
  const rebuild = (current: unknown, depth: number): unknown => {
    if (depth === tokens.length) {
      if (operation === "replace" || operation === "add") return value;
      throw new Error(`BRIDGE_KIT_POINTER_ROOT:${pointer}`);
    }
    const token = tokens[depth];
    if (token === undefined) throw new Error("BRIDGE_KIT_POINTER_TOKEN");
    const last = depth === tokens.length - 1;
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`BRIDGE_KIT_POINTER_INDEX:${pointer}`);
      }
      const copy: unknown[] = [...(current as readonly unknown[])];
      if (last && operation === "remove") {
        copy.splice(index, 1);
        return copy;
      }
      copy[index] = rebuild((current as readonly unknown[])[index], depth + 1);
      return copy;
    }
    if (!isObjectRecord(current)) {
      throw new Error(`BRIDGE_KIT_POINTER_TARGET:${pointer}`);
    }
    if (last && operation === "append") {
      const target = current[token];
      if (!Array.isArray(target)) {
        throw new Error(`BRIDGE_KIT_POINTER_APPEND:${pointer}`);
      }
      return {
        ...current,
        [token]: [...(target as readonly unknown[]), value],
      };
    }
    if (last && operation === "remove") {
      return Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== token),
      );
    }
    if (last && (operation === "replace" || operation === "add")) {
      return { ...current, [token]: value };
    }
    return { ...current, [token]: rebuild(current[token], depth + 1) };
  };
  if (tokens.length === 0 && operation === "append") {
    if (!Array.isArray(root)) throw new Error("BRIDGE_KIT_ROOT_APPEND");
    return [...(root as readonly unknown[]), value];
  }
  return rebuild(root, 0);
}

/* -------------------------------------------------------------------------- */
/* Fixture packet loading                                                     */
/* -------------------------------------------------------------------------- */

export type BridgeFixturePacket = Readonly<{
  contract: JsonObject;
  cases: JsonObject;
  mutations: JsonObject;
  provenance: JsonObject;
  traces: JsonObject;
  byteDigests: Readonly<Record<string, string>>;
}>;

let packetCache: BridgeFixturePacket | null = null;

export function loadBridgeFixturePacket(): BridgeFixturePacket {
  if (packetCache !== null) return packetCache;
  const parsed = new Map<string, JsonObject>();
  const byteDigests: Record<string, string> = {};
  for (const name of BRIDGE_FIXTURE_FILES) {
    const bytes = readFileSync(join(BRIDGE_FIXTURE_DIR, name));
    byteDigests[name] = sha256Hex(new Uint8Array(bytes));
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isObjectRecord(value)) throw new Error(`BRIDGE_KIT_FIXTURE:${name}`);
    parsed.set(name, value);
  }
  packetCache = Object.freeze({
    contract: parsed.get("a0-e0-bridge-contract.json") ?? {},
    cases: parsed.get("owner-port-cases.json") ?? {},
    mutations: parsed.get("mutation-controls.json") ?? {},
    provenance: parsed.get("provenance-ledger.json") ?? {},
    traces: parsed.get("trace-ledger.json") ?? {},
    byteDigests: Object.freeze(byteDigests),
  });
  return packetCache;
}

/* -------------------------------------------------------------------------- */
/* Accepted E0 v1 authority context                                           */
/* -------------------------------------------------------------------------- */

type AcceptedContext = Readonly<{
  ledger: JsonObject;
  sharedBases: JsonObject;
  fixturesById: ReadonlyMap<string, JsonObject>;
  loadedFiles: ReadonlyMap<string, unknown>;
  fileSha256: ReadonlyMap<string, string>;
}>;

let acceptedCache: AcceptedContext | null = null;

function listJsonFiles(root: string, prefix = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(join(root, prefix))) {
    const relative = prefix === "" ? entry : `${prefix}/${entry}`;
    const stats = statSync(join(root, relative));
    if (stats.isDirectory()) {
      results.push(...listJsonFiles(root, relative));
    } else if (relative.endsWith(".json")) {
      results.push(relative);
    }
  }
  return results.sort(codeUnitCompare);
}

export function loadAcceptedE0Context(): AcceptedContext {
  if (acceptedCache !== null) return acceptedCache;
  const loadedFiles = new Map<string, unknown>();
  const fileSha256 = new Map<string, string>();
  for (const relative of listJsonFiles(ACCEPTED_E0_DIR)) {
    const bytes = readFileSync(join(ACCEPTED_E0_DIR, relative));
    fileSha256.set(relative, sha256Hex(new Uint8Array(bytes)));
    loadedFiles.set(relative, JSON.parse(bytes.toString("utf8")));
  }
  const ledger = loadedFiles.get("input-fixture-ledger.json");
  if (!isObjectRecord(ledger)) throw new Error("BRIDGE_KIT_ACCEPTED_LEDGER");
  const fixturesById = new Map<string, JsonObject>();
  const fixtures = ledger["fixtures"];
  if (Array.isArray(fixtures)) {
    for (const fixture of fixtures) {
      if (isObjectRecord(fixture) && typeof fixture["id"] === "string") {
        fixturesById.set(fixture["id"], fixture);
      }
    }
  }
  acceptedCache = Object.freeze({
    ledger,
    sharedBases: isObjectRecord(ledger["sharedBases"])
      ? ledger["sharedBases"]
      : {},
    fixturesById,
    loadedFiles,
    fileSha256,
  });
  return acceptedCache;
}

/* -------------------------------------------------------------------------- */
/* Independent bridge materializer (from the fixture materializationPolicy)   */
/* -------------------------------------------------------------------------- */

const acceptedFixtureCache = new Map<string, unknown>();

function materializeAcceptedRepetition(value: JsonObject): unknown {
  if (
    value["kind"] !==
      "test-owned-validated-document-repetition-materialization" ||
    !isObjectRecord(value["recipe"])
  ) {
    return undefined;
  }
  const recipe = value["recipe"];
  const sectionCount = Number(recipe["sectionCount"]);
  const measuresPerSection = Number(recipe["measuresPerSection"]);
  const completeMeasureCount = Number(recipe["completeMeasureCount"]);
  const description = isObjectRecord(recipe["description"])
    ? recipe["description"]
    : {};
  const sectionTemplate = isObjectRecord(recipe["section"])
    ? recipe["section"]
    : {};
  const eventTemplate = isObjectRecord(recipe["completeMeasureEvent"])
    ? recipe["completeMeasureEvent"]
    : {};
  if (
    !Number.isSafeInteger(sectionCount) ||
    !Number.isSafeInteger(measuresPerSection) ||
    sectionCount * measuresPerSection !== Number(recipe["totalMeasures"]) ||
    typeof description["scalar"] !== "string" ||
    !Number.isSafeInteger(description["repeatCodePoints"])
  ) {
    throw new Error("BRIDGE_KIT_REPETITION_RECIPE");
  }
  const sections = Array.from({ length: sectionCount }, (_, sectionIndex) => ({
    id: `s${String(sectionIndex)}`,
    ...structuredClone(sectionTemplate),
    measures: Array.from({ length: measuresPerSection }, (_, measureIndex) => {
      const globalMeasure = sectionIndex * measuresPerSection + measureIndex;
      const containsEvent = globalMeasure < completeMeasureCount;
      return {
        id: `m${String(globalMeasure)}`,
        events: containsEvent
          ? [{ id: `e${String(globalMeasure)}`, ...structuredClone(eventTemplate) }]
          : [],
        completion: { kind: containsEvent ? "complete" : "empty" },
      };
    }),
  }));
  return {
    schema: recipe["schema"],
    id: recipe["documentId"],
    title: recipe["title"],
    description: description["scalar"].repeat(
      Number(description["repeatCodePoints"]),
    ),
    meter: structuredClone(recipe["meter"]),
    tempoBpm: recipe["tempoBpm"],
    key: structuredClone(recipe["key"]),
    sections,
    playback: structuredClone(recipe["playback"]),
  };
}

function materializeAcceptedValue(
  value: unknown,
  context: AcceptedContext,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => materializeAcceptedValue(item, context, visiting));
  }
  if (!isObjectRecord(value)) return structuredClone(value);
  const repeated = materializeAcceptedRepetition(value);
  if (repeated !== undefined) return repeated;
  const sharedBaseId = value["sharedBase"];
  if (typeof sharedBaseId === "string") {
    if (visiting.has(`shared:${sharedBaseId}`)) {
      throw new Error("BRIDGE_KIT_SHARED_CYCLE");
    }
    const base = context.sharedBases[sharedBaseId];
    if (base === undefined) throw new Error("BRIDGE_KIT_SHARED_MISSING");
    const next = new Set(visiting);
    next.add(`shared:${sharedBaseId}`);
    const materializedBase = materializeAcceptedValue(
      isObjectRecord(base) && Object.hasOwn(base, "value") ? base["value"] : base,
      context,
      next,
    );
    const overrides = Object.entries(value).filter(
      ([key]) => key !== "sharedBase",
    );
    if (overrides.length === 0) return materializedBase;
    if (!isObjectRecord(materializedBase)) {
      throw new Error("BRIDGE_KIT_SHARED_OVERRIDE");
    }
    return {
      ...materializedBase,
      ...Object.fromEntries(
        overrides.map(([key, child]) => [
          key,
          materializeAcceptedValue(child, context, next),
        ]),
      ),
    };
  }
  const fixtureId = value["fixtureId"];
  if (typeof fixtureId === "string") {
    if (context.fixturesById.has(fixtureId)) {
      return materializeAcceptedFixture(fixtureId, context, visiting);
    }
    const loaded = context.loadedFiles.get(fixtureId);
    if (loaded !== undefined) return structuredClone(loaded);
  }
  if (Object.hasOwn(value, "value") && typeof value["materializeAs"] === "string") {
    return materializeAcceptedValue(value["value"], context, visiting);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      materializeAcceptedValue(child, context, visiting),
    ]),
  );
}

function pointerForPath(path: readonly (string | number)[]): string {
  return path
    .map(
      (segment) =>
        `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`,
    )
    .join("");
}

function applyAcceptedMutations(
  base: unknown,
  mutations: readonly unknown[],
  context: AcceptedContext,
): unknown {
  let current = base;
  for (const mutation of mutations) {
    if (!isObjectRecord(mutation)) throw new Error("BRIDGE_KIT_MUTATION");
    const operation = mutation["operation"];
    const path = mutation["path"];
    if (typeof operation !== "string" || !Array.isArray(path)) {
      throw new Error("BRIDGE_KIT_MUTATION_SHAPE");
    }
    const pointer = pointerForPath(path as (string | number)[]);
    const before = valueAtPointer(current, pointer);
    if (
      Object.hasOwn(mutation, "from") &&
      !jsonDeepEqual(before, materializeAcceptedValue(mutation["from"], context))
    ) {
      throw new Error(`BRIDGE_KIT_MUTATION_FROM:${pointer}`);
    }
    if (operation === "set") {
      current = applyPointerOperation(
        current,
        "replace",
        pointer,
        materializeAcceptedValue(mutation["to"], context),
      );
    } else if (operation === "append") {
      current = applyPointerOperation(
        current,
        "append",
        pointer,
        materializeAcceptedValue(mutation["value"], context),
      );
    } else if (operation === "remove") {
      current = applyPointerOperation(current, "remove", pointer, undefined);
    } else {
      throw new Error(`BRIDGE_KIT_MUTATION_OPERATION:${operation}`);
    }
  }
  return current;
}

function materializeAcceptedFixture(
  fixtureId: string,
  context: AcceptedContext,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (acceptedFixtureCache.has(fixtureId)) {
    return structuredClone(acceptedFixtureCache.get(fixtureId));
  }
  if (visiting.has(`fixture:${fixtureId}`)) {
    throw new Error("BRIDGE_KIT_FIXTURE_CYCLE");
  }
  const fixture = context.fixturesById.get(fixtureId);
  if (fixture === undefined) {
    const loaded = context.loadedFiles.get(fixtureId);
    if (loaded === undefined) throw new Error(`BRIDGE_KIT_FIXTURE:${fixtureId}`);
    return structuredClone(loaded);
  }
  const next = new Set(visiting);
  next.add(`fixture:${fixtureId}`);
  let result: unknown;
  if (fixture["kind"] === "local-golden") {
    const path = fixture["path"];
    if (typeof path !== "string" || !context.loadedFiles.has(path)) {
      throw new Error("BRIDGE_KIT_LOCAL_GOLDEN");
    }
    result = structuredClone(context.loadedFiles.get(path));
  } else if (Object.hasOwn(fixture, "value")) {
    result = materializeAcceptedValue(fixture["value"], context, next);
  } else {
    const baseReference = fixture["base"];
    let base: unknown;
    if (typeof baseReference === "string") {
      base = materializeAcceptedFixture(baseReference, context, next);
    } else if (isObjectRecord(baseReference)) {
      if (typeof baseReference["sharedBase"] === "string") {
        base = materializeAcceptedValue(baseReference, context, next);
      } else if (typeof baseReference["fixtureId"] === "string") {
        base = materializeAcceptedFixture(
          baseReference["fixtureId"],
          context,
          next,
        );
      }
    }
    if (base === undefined) throw new Error("BRIDGE_KIT_FIXTURE_BASE");
    const mutations = Array.isArray(fixture["orderedMutations"])
      ? fixture["orderedMutations"]
      : [];
    result = applyAcceptedMutations(base, mutations, context);
  }
  acceptedFixtureCache.set(fixtureId, structuredClone(result));
  return result;
}

/* -------------------------------------------------------------------------- */
/* Bridge literal materialization                                             */
/* -------------------------------------------------------------------------- */

export type BridgeMaterializer = Readonly<{
  literal: (literalId: string, stateContext?: unknown) => unknown;
  descriptor: (descriptor: unknown, stateContext?: unknown) => unknown;
  template: (value: unknown, stateContext?: unknown) => unknown;
  applyPatches: (
    base: unknown,
    patches: unknown,
    stateContext?: unknown,
  ) => unknown;
}>;

export function createBridgeMaterializer(
  packet: BridgeFixturePacket = loadBridgeFixturePacket(),
): BridgeMaterializer {
  const accepted = loadAcceptedE0Context();
  const catalog = isObjectRecord(packet.cases["literalCatalog"])
    ? packet.cases["literalCatalog"]
    : {};

  const materializeTemplate = (
    value: unknown,
    stateContext: unknown,
    visiting: ReadonlySet<string>,
  ): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) =>
        materializeTemplate(item, stateContext, visiting),
      );
    }
    if (!isObjectRecord(value)) return structuredClone(value);
    const keys = Object.keys(value);
    if (keys.length === 1 && Object.hasOwn(value, "$literalValue")) {
      return materializeTemplate(value["$literalValue"], stateContext, visiting);
    }
    if (keys.length === 1 && typeof value["$literalRef"] === "string") {
      return materializeLiteral(value["$literalRef"], stateContext, visiting);
    }
    if (keys.length === 1 && typeof value["$statePointer"] === "string") {
      const selected = valueAtPointer(stateContext, value["$statePointer"]);
      if (selected === undefined) throw new Error("BRIDGE_KIT_STATE_POINTER");
      return structuredClone(selected);
    }
    if (keys.length === 1 && typeof value["$specialNumber"] === "string") {
      if (value["$specialNumber"] === "NaN") return Number.NaN;
      if (value["$specialNumber"] === "Infinity") {
        return Number.POSITIVE_INFINITY;
      }
      if (value["$specialNumber"] === "-Infinity") {
        return Number.NEGATIVE_INFINITY;
      }
      throw new Error("BRIDGE_KIT_SPECIAL_NUMBER");
    }
    if (Object.hasOwn(value, "$utf16CodeUnits")) {
      const units = value["$utf16CodeUnits"];
      if (
        keys.length !== 1 ||
        !Array.isArray(units) ||
        units.length === 0 ||
        units.some(
          (unit) =>
            !Number.isInteger(unit) || Number(unit) < 0 || Number(unit) > 0xffff,
        )
      ) {
        throw new Error("BRIDGE_KIT_UTF16");
      }
      return String.fromCharCode(...units.map(Number));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        materializeTemplate(child, stateContext, visiting),
      ]),
    );
  };

  const applyPatches = (
    base: unknown,
    patches: unknown,
    stateContext: unknown,
  ): unknown => {
    if (!Array.isArray(patches) || patches.length === 0) return base;
    let current = base;
    for (const patch of patches) {
      if (!isObjectRecord(patch)) throw new Error("BRIDGE_KIT_PATCH");
      const operator = patch["op"];
      const pointer = patch["jsonPointer"];
      if (typeof operator !== "string" || typeof pointer !== "string") {
        throw new Error("BRIDGE_KIT_PATCH_SHAPE");
      }
      const actualBefore = valueAtPointer(current, pointer);
      if (actualBefore === undefined && operator !== "add") {
        throw new Error(`BRIDGE_KIT_PATCH_TARGET:${pointer}`);
      }
      const materialize = (input: unknown): unknown =>
        materializeTemplate(input, stateContext, new Set());
      if (operator === "assert") {
        if (!jsonDeepEqual(actualBefore, materialize(patch["value"]))) {
          throw new Error(`BRIDGE_KIT_PATCH_ASSERT:${pointer}`);
        }
        continue;
      }
      if (operator === "append") {
        if (!Array.isArray(actualBefore)) {
          throw new Error(`BRIDGE_KIT_PATCH_APPEND:${pointer}`);
        }
        if (
          Object.hasOwn(patch, "fromCount") &&
          patch["fromCount"] !== actualBefore.length
        ) {
          throw new Error(`BRIDGE_KIT_PATCH_APPEND_COUNT:${pointer}`);
        }
        current = applyPointerOperation(
          current,
          "append",
          pointer,
          materialize(patch["value"]),
        );
        continue;
      }
      const expectedBefore = materialize(patch["from"]);
      if (operator === "add") {
        const to = materialize(patch["to"]);
        const value = materialize(patch["value"]);
        if (
          !isObjectRecord(expectedBefore) ||
          expectedBefore["$absent"] !== true ||
          !jsonDeepEqual(to, value)
        ) {
          throw new Error(`BRIDGE_KIT_PATCH_ADD:${pointer}`);
        }
        current = applyPointerOperation(current, "add", pointer, value);
        continue;
      }
      if (operator === "replace") {
        const to = materialize(patch["to"]);
        const value = materialize(patch["value"]);
        if (!jsonDeepEqual(to, value)) {
          throw new Error(`BRIDGE_KIT_PATCH_TO:${pointer}`);
        }
        if (!jsonDeepEqual(actualBefore, expectedBefore)) {
          throw new Error(`BRIDGE_KIT_PATCH_FROM:${pointer}`);
        }
        current = applyPointerOperation(current, "replace", pointer, value);
        continue;
      }
      if (operator !== "remove") {
        throw new Error(`BRIDGE_KIT_PATCH_OPERATOR:${operator}`);
      }
      if (!jsonDeepEqual(actualBefore, expectedBefore)) {
        throw new Error(`BRIDGE_KIT_PATCH_REMOVE_FROM:${pointer}`);
      }
      current = applyPointerOperation(current, "remove", pointer, undefined);
    }
    return current;
  };

  const materializeLiteral = (
    literalId: string,
    stateContext: unknown,
    visiting: ReadonlySet<string>,
  ): unknown => {
    if (visiting.has(literalId)) throw new Error("BRIDGE_KIT_LITERAL_CYCLE");
    const entry = catalog[literalId];
    if (!isObjectRecord(entry)) {
      throw new Error(`BRIDGE_KIT_LITERAL:${literalId}`);
    }
    const next = new Set(visiting);
    next.add(literalId);
    if (entry["kind"] === "inline") {
      return materializeTemplate(entry["value"], stateContext, next);
    }
    if (entry["kind"] === "accepted-e0-v1-reference") {
      const path = entry["path"];
      const pointer = entry["jsonPointer"];
      if (typeof path !== "string" || typeof pointer !== "string") {
        throw new Error("BRIDGE_KIT_LITERAL_REFERENCE");
      }
      if (!path.startsWith(ACCEPTED_E0_PREFIX) || path.includes("..")) {
        throw new Error("BRIDGE_KIT_LITERAL_PATH");
      }
      const relative = path.slice(ACCEPTED_E0_PREFIX.length);
      const actualSha = loadAcceptedE0Context().fileSha256.get(relative);
      if (actualSha === undefined || entry["sha256"] !== actualSha) {
        throw new Error(`BRIDGE_KIT_LITERAL_DIGEST:${relative}`);
      }
      const authority = loadAcceptedE0Context().loadedFiles.get(relative);
      const referenced = valueAtPointer(authority, pointer);
      if (referenced === undefined) {
        throw new Error(`BRIDGE_KIT_LITERAL_POINTER:${pointer}`);
      }
      let materialized: unknown;
      if (isObjectRecord(referenced) && typeof referenced["id"] === "string") {
        if (accepted.fixturesById.has(referenced["id"])) {
          materialized = materializeAcceptedFixture(referenced["id"], accepted);
        }
      }
      materialized ??= materializeAcceptedValue(referenced, accepted);
      return applyPatches(
        materialized,
        entry["materializationPatches"],
        materialized,
      );
    }
    throw new Error(`BRIDGE_KIT_LITERAL_KIND:${String(entry["kind"])}`);
  };

  return Object.freeze({
    literal: (literalId: string, stateContext?: unknown) =>
      materializeLiteral(literalId, stateContext, new Set()),
    template: (value: unknown, stateContext?: unknown) =>
      materializeTemplate(value, stateContext, new Set()),
    applyPatches: (base: unknown, patches: unknown, stateContext?: unknown) =>
      applyPatches(base, patches, stateContext ?? base),
    descriptor: (descriptor: unknown, stateContext?: unknown) => {
      if (!isObjectRecord(descriptor)) {
        throw new Error("BRIDGE_KIT_DESCRIPTOR");
      }
      let base: unknown;
      if (typeof descriptor["literalId"] === "string") {
        base = materializeLiteral(
          descriptor["literalId"],
          stateContext,
          new Set(),
        );
      } else if (Object.hasOwn(descriptor, "value")) {
        base = materializeTemplate(
          descriptor["value"],
          stateContext,
          new Set(),
        );
      } else {
        throw new Error("BRIDGE_KIT_DESCRIPTOR_VALUE");
      }
      return applyPatches(base, descriptor["patches"], stateContext ?? base);
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Case/run inventory                                                         */
/* -------------------------------------------------------------------------- */

export type BridgeRunRef = Readonly<{
  caseId: string;
  runId: string;
  fullId: string;
  operation: string;
  category: string;
  runRole: "conformance" | "mutation-killer";
  caseValue: JsonObject;
  run: JsonObject;
}>;

export function flattenBridgeRuns(
  packet: BridgeFixturePacket = loadBridgeFixturePacket(),
): readonly BridgeRunRef[] {
  const refs: BridgeRunRef[] = [];
  for (const family of ["replacementCases", "identityCases", "markerCases"]) {
    const cases = packet.cases[family];
    if (!Array.isArray(cases)) continue;
    for (const caseValue of cases) {
      if (!isObjectRecord(caseValue)) continue;
      const caseId = String(caseValue["id"]);
      const runs = Array.isArray(caseValue["runs"]) ? caseValue["runs"] : [];
      for (const run of runs) {
        if (!isObjectRecord(run)) continue;
        const runId = String(run["id"]);
        refs.push(
          Object.freeze({
            caseId,
            runId,
            fullId: `${caseId}/${runId}`,
            operation: String(caseValue["operation"]),
            category: String(caseValue["category"]),
            runRole:
              run["runRole"] === "mutation-killer"
                ? ("mutation-killer" as const)
                : ("conformance" as const),
            caseValue,
            run,
          }),
        );
      }
    }
  }
  return Object.freeze(refs);
}

/* -------------------------------------------------------------------------- */
/* Runtime conversion through the real F2/F3 boundary                         */
/* -------------------------------------------------------------------------- */

const runtimeDocumentCache = new Map<string, ValidatedDocument>();

export function runtimeDocumentFromJson(json: unknown): ValidatedDocument {
  const key = canonicalJson(json);
  const cached = runtimeDocumentCache.get(key);
  if (cached !== undefined) return cached;
  const decoded = decodeDocumentShape(json);
  if (!decoded.ok) {
    throw new Error(
      `BRIDGE_KIT_RUNTIME_F2:${decoded.errors.map((issue) => issue.code).join(",")}`,
    );
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(
      `BRIDGE_KIT_RUNTIME_F3:${published.errors.map((issue) => issue.code).join(",")}`,
    );
  }
  /* F2/F3 must not repair: the published projection equals the fixture bytes. */
  const roundTrip = canonicalJson(
    JSON.parse(JSON.stringify(published.value)) as unknown,
  );
  if (roundTrip !== key) {
    throw new Error("BRIDGE_KIT_RUNTIME_DOCUMENT_ROUNDTRIP");
  }
  runtimeDocumentCache.set(key, published.value);
  return published.value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function runtimeBeat(json: unknown): unknown {
  if (
    !isObjectRecord(json) ||
    typeof json["numerator"] !== "number" ||
    typeof json["denominator"] !== "number"
  ) {
    throw new Error("BRIDGE_KIT_RUNTIME_BEAT");
  }
  const beat = makeBeatPosition({
    numerator: json["numerator"],
    denominator: json["denominator"],
  });
  if (!beat.ok) throw new Error("BRIDGE_KIT_RUNTIME_BEAT_REFUSED");
  return beat.value;
}

function runtimeHistoryEntry(json: unknown): unknown {
  if (!isObjectRecord(json)) throw new Error("BRIDGE_KIT_RUNTIME_HISTORY");
  return {
    ...structuredClone(json),
    before: runtimeDocumentFromJson(json["before"]),
    after: runtimeDocumentFromJson(json["after"]),
  };
}

/**
 * Convert a materialized pinned AppState literal into a real runtime state.
 * Documents cross the real F2/F3 boundary (`decodeDocumentShape` +
 * `validateDocumentSemantics`); beat positions cross `makeBeatPosition`; the
 * result is deep-frozen and proven byte-identical to the fixture literal by
 * the canonical round-trip law below.
 */
export function runtimeAppStateFromJson(json: unknown): AppState {
  if (!isObjectRecord(json)) throw new Error("BRIDGE_KIT_RUNTIME_STATE");
  const history = isObjectRecord(json["history"])
    ? json["history"]
    : (() => {
        throw new Error("BRIDGE_KIT_RUNTIME_STATE_HISTORY");
      })();
  const transport = isObjectRecord(json["transport"])
    ? json["transport"]
    : (() => {
        throw new Error("BRIDGE_KIT_RUNTIME_STATE_TRANSPORT");
      })();
  const state = {
    ...structuredClone(json),
    document: runtimeDocumentFromJson(json["document"]),
    history: {
      ...structuredClone(history),
      undo: (Array.isArray(history["undo"]) ? history["undo"] : []).map(
        runtimeHistoryEntry,
      ),
      redo: (Array.isArray(history["redo"]) ? history["redo"] : []).map(
        runtimeHistoryEntry,
      ),
    },
    transport: {
      ...structuredClone(transport),
      startBeat: runtimeBeat(transport["startBeat"]),
      playhead: runtimeBeat(transport["playhead"]),
    },
  } as unknown as AppState;
  deepFreeze(state);
  const projected = projectAppStateToJson(state);
  if (!jsonDeepEqual(projected, json)) {
    throw new Error("BRIDGE_KIT_RUNTIME_STATE_ROUNDTRIP");
  }
  return state;
}

export function projectAppStateToJson(state: AppState): unknown {
  return JSON.parse(JSON.stringify(state)) as unknown;
}

/* -------------------------------------------------------------------------- */
/* Instrumented dependencies                                                  */
/* -------------------------------------------------------------------------- */

export type DependencyCounts = {
  f2DecodeDocumentShape: number;
  f3ValidateDocumentSemantics: number;
  historyEstimator: number;
};

export type EstimatorObservation = Readonly<{
  realEstimate: number;
  returnedEstimate: number;
  injected: boolean;
}>;

export type InstrumentedDependencies = Readonly<{
  dependencies: ApplicationCommandDependencies;
  counts: DependencyCounts;
  snapshotCounts: () => DependencyCounts;
  estimatorObservations: EstimatorObservation[];
  setEstimatorInjection: (value: number | undefined) => void;
}>;

export function createInstrumentedDependencies(): InstrumentedDependencies {
  const base = a0Dependencies();
  const counts: DependencyCounts = {
    f2DecodeDocumentShape: 0,
    f3ValidateDocumentSemantics: 0,
    historyEstimator: 0,
  };
  let injection: number | undefined;
  const estimatorObservations: EstimatorObservation[] = [];
  const dependencies: ApplicationCommandDependencies = Object.freeze({
    ...base,
    decodeDocumentShape: (raw: unknown) => {
      counts.f2DecodeDocumentShape += 1;
      return base.decodeDocumentShape(raw);
    },
    validateDocumentSemantics: ((candidate: never) => {
      counts.f3ValidateDocumentSemantics += 1;
      return base.validateDocumentSemantics(candidate);
    }) as ApplicationCommandDependencies["validateDocumentSemantics"],
    estimateHistoryRetainedBytes: ((entry: never) => {
      counts.historyEstimator += 1;
      const real = base.estimateHistoryRetainedBytes(entry);
      const returned = injection ?? real;
      estimatorObservations.push(
        Object.freeze({
          realEstimate: real,
          returnedEstimate: returned,
          injected: injection !== undefined,
        }),
      );
      return returned;
    }) as ApplicationCommandDependencies["estimateHistoryRetainedBytes"],
  });
  return Object.freeze({
    dependencies,
    counts,
    snapshotCounts: () => ({ ...counts }),
    estimatorObservations,
    setEstimatorInjection: (value: number | undefined) => {
      injection = value;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Diagnostics recording and counter derivation                               */
/* -------------------------------------------------------------------------- */

export type DiagnosticsRecorder = Readonly<{
  sink: (diagnostic: StudioInterchangeOwnerDiagnostic) => void;
  events: StudioInterchangeOwnerDiagnostic[];
  mark: () => number;
  since: (mark: number) => readonly StudioInterchangeOwnerDiagnostic[];
}>;

export function createDiagnosticsRecorder(): DiagnosticsRecorder {
  const events: StudioInterchangeOwnerDiagnostic[] = [];
  return Object.freeze({
    sink: (diagnostic: StudioInterchangeOwnerDiagnostic) => {
      events.push(diagnostic);
    },
    events,
    mark: () => events.length,
    since: (mark: number) => events.slice(mark),
  });
}

export const OWNER_COUNTER_KEYS = Object.freeze([
  "prepareImportReplacementPublication",
  "discardImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
  "e0V2ConsumerNormalizer",
  "f2DecodeDocumentShape",
  "f3ValidateDocumentSemantics",
  "historyEstimator",
  "bookmarkRepair",
  "controllerStateReads",
  "controllerStateInstalls",
  "listenerCallbacks",
  "registryLookups",
  "registryAllocations",
  "registryInvalidations",
  "registryConsumptions",
] as const);

const STATE_READ_EVENTS = new Set([
  "read.controller-state",
  "read.controller-closure",
  "read.controller-state-for-refusal",
]);
const STATE_INSTALL_EVENTS = new Set(["install.next-state", "install.state"]);

/**
 * The documented observation-to-counter mapping (authored from the contract's
 * event vocabulary): dependency counters come from the wrapped real
 * dependencies, listener callbacks from a real subscription, port counters
 * from the harness's own single invocation, and registry/state counters from
 * the production diagnostic stream.
 */
export function deriveOwnerCounters(
  operation: string,
  rawEvents: readonly string[],
  dependencyDelta: DependencyCounts,
  listenerDelta: number,
): JsonObject {
  const counters: JsonObject = Object.fromEntries(
    OWNER_COUNTER_KEYS.map((key) => [key, 0]),
  );
  counters[operation] = 1;
  counters["f2DecodeDocumentShape"] = dependencyDelta.f2DecodeDocumentShape;
  counters["f3ValidateDocumentSemantics"] =
    dependencyDelta.f3ValidateDocumentSemantics;
  counters["historyEstimator"] = dependencyDelta.historyEstimator;
  counters["bookmarkRepair"] = rawEvents.filter(
    (event) => event === "repair.bookmarks-and-focus",
  ).length;
  counters["controllerStateReads"] = rawEvents.filter((event) =>
    STATE_READ_EVENTS.has(event),
  ).length;
  counters["controllerStateInstalls"] = rawEvents.filter((event) =>
    STATE_INSTALL_EVENTS.has(event),
  ).length;
  counters["listenerCallbacks"] = listenerDelta;
  counters["registryLookups"] = rawEvents.filter(
    (event) =>
      event.startsWith("lookup.") || event === "inspect.registry-capacity-one",
  ).length;
  counters["registryAllocations"] = rawEvents.filter(
    (event) => event === "allocate.registry-entry",
  ).length;
  counters["registryInvalidations"] = rawEvents.filter(
    (event) => event === "remove.entry",
  ).length;
  counters["registryConsumptions"] = rawEvents.filter((event) =>
    event.startsWith("consume."),
  ).length;
  return counters;
}

/* -------------------------------------------------------------------------- */
/* Event projection: production diagnostics -> pinned event vocabulary        */
/* -------------------------------------------------------------------------- */

export type HarnessScenarioFacts = Readonly<{
  /** The harness observed this identity's live entry being CONSUMED earlier. */
  consumedForIdentity?: boolean;
  /** The harness observed this identity's live entry being INVALIDATED. */
  invalidatedForIdentity?: boolean;
  /** The presented `prepared` echo was fabricated by the harness. */
  fabricatedLookalike?: boolean;
  /** Harness-scope observation events appended after the owner returned. */
  harnessTail?: readonly string[];
}>;

export type EventProjectionNote = Readonly<{
  index: number;
  raw: string | null;
  projected: string;
  source: "production-diagnostic" | "harness-observation";
  justification?: string;
}>;

/**
 * The pinned `synchronousEventOrder` vocabulary contains three scenario-scope
 * refinements the state-free production sink cannot know
 * (`lookup.consumed-entry-empty`, `lookup.invalidated-entry-empty`, and
 * `reject.lookalike-without-private-entry`), plus harness-tail observations
 * for the queued-edit marker case. This projection maps the production
 * diagnostics onto that vocabulary using only facts the harness itself staged
 * and observed; every substitution is recorded in the ledger.
 */
export function projectEventOrder(
  rawEvents: readonly string[],
  facts: HarnessScenarioFacts = {},
): Readonly<{ projected: readonly string[]; notes: readonly EventProjectionNote[] }> {
  const projected: string[] = [];
  const notes: EventProjectionNote[] = [];
  for (const raw of rawEvents) {
    let name = raw;
    let justification: string | undefined;
    if (raw === "lookup.no-authoritative-entry") {
      if (facts.consumedForIdentity === true) {
        name = "lookup.consumed-entry-empty";
        justification =
          "harness observed consume.* for this identity in the staging segment";
      } else if (facts.invalidatedForIdentity === true) {
        name = "lookup.invalidated-entry-empty";
        justification =
          "harness observed remove.entry for this identity in the staging segment";
      }
    }
    notes.push({
      index: projected.length,
      raw,
      projected: name,
      source: "production-diagnostic",
      ...(justification === undefined ? {} : { justification }),
    });
    projected.push(name);
    if (
      raw === "lookup.no-authoritative-entry" &&
      facts.fabricatedLookalike === true &&
      facts.consumedForIdentity !== true &&
      facts.invalidatedForIdentity !== true
    ) {
      notes.push({
        index: projected.length,
        raw: null,
        projected: "reject.lookalike-without-private-entry",
        source: "harness-observation",
        justification:
          "the harness fabricated the presented echo; no entry was ever allocated for it",
      });
      projected.push("reject.lookalike-without-private-entry");
    }
  }
  for (const tail of facts.harnessTail ?? []) {
    notes.push({
      index: projected.length,
      raw: null,
      projected: tail,
      source: "harness-observation",
    });
    projected.push(tail);
  }
  return Object.freeze({
    projected: Object.freeze(projected),
    notes: Object.freeze(notes),
  });
}

/* -------------------------------------------------------------------------- */
/* Harnesses                                                                  */
/* -------------------------------------------------------------------------- */

export type CompositionHarness = Readonly<{
  tier: "real-composition";
  composition: StudioComposition;
  controller: StudioController;
  owner: A0E0InterchangeOwnerOperations;
  initialState: AppState;
  recorder: DiagnosticsRecorder;
  instruments: InstrumentedDependencies;
  notifications: () => number;
}>;

export function createCompositionHarness(stateJson: unknown): CompositionHarness {
  const initialState = runtimeAppStateFromJson(stateJson);
  const instruments = createInstrumentedDependencies();
  const recorder = createDiagnosticsRecorder();
  /*
   * A deterministic logical clock beyond every pinned history logical time,
   * so REAL controller-command probes (setTitle etc.) are not refused by the
   * non-decreasing logical-time law. Owner operations never read this clock.
   */
  let logicalNowMs = 1_000_000;
  const composition = createStudioCompositionOverState(
    initialState,
    instruments.dependencies,
    {
      interchangeDiagnostics: recorder.sink,
      nowMs: () => {
        logicalNowMs += 10_000;
        return logicalNowMs;
      },
    },
  );
  let notifications = 0;
  composition.controller.subscribe(() => {
    notifications += 1;
  });
  return Object.freeze({
    tier: "real-composition" as const,
    composition,
    controller: composition.controller,
    owner: composition.interchangeOwner,
    initialState,
    recorder,
    instruments,
    notifications: () => notifications,
  });
}

export type OwnerSeamHarness = Readonly<{
  tier: "owner-seam";
  owner: A0E0InterchangeOwnerOperations;
  recorder: DiagnosticsRecorder;
  instruments: InstrumentedDependencies;
  notifications: () => number;
  installs: () => number;
  readCell: () => AppState;
  /**
   * Harness-only drift seam for pinned scenarios not reachable through any
   * public controller command (the same-revision/correlated drift family).
   * The swapped state passes the same runtime round-trip law as every other
   * pinned state.
   */
  swapState: (stateJson: unknown) => AppState;
}>;

export function createOwnerSeamHarness(stateJson: unknown): OwnerSeamHarness {
  let cell = runtimeAppStateFromJson(stateJson);
  const instruments = createInstrumentedDependencies();
  const recorder = createDiagnosticsRecorder();
  let installs = 0;
  let notifications = 0;
  const access: StudioInterchangeOwnerAccess = Object.freeze({
    dependencies: instruments.dependencies,
    readState: () => cell,
    installState: (next: AppState) => {
      if (next === cell) return;
      cell = next;
      installs += 1;
    },
    notifyListeners: () => {
      notifications += 1;
    },
    emitDiagnostic: recorder.sink,
  });
  const owner = createStudioInterchangeOwnerOperations(access);
  return Object.freeze({
    tier: "owner-seam" as const,
    owner,
    recorder,
    instruments,
    notifications: () => notifications,
    installs: () => installs,
    readCell: () => cell,
    swapState: (nextJson: unknown) => {
      cell = runtimeAppStateFromJson(nextJson);
      return cell;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Evidence ledger                                                            */
/* -------------------------------------------------------------------------- */

export type BridgeRunObservation = {
  runId: string;
  operation: string;
  category: string;
  tier: "real-composition" | "owner-seam";
  staging: string[];
  rawEvents: readonly string[];
  projectedEvents: readonly string[];
  projectionNotes: readonly EventProjectionNote[];
  observedCounters: JsonObject;
  observedResult: unknown;
  resultStateFree: boolean;
  afterStateDischarge: string[];
  estimatorObservations: readonly EstimatorObservation[];
  probes: Array<{ probe: string; outcome: string }>;
  deviations: string[];
};

const ledger: BridgeRunObservation[] = [];

export function recordBridgeRunObservation(
  observation: BridgeRunObservation,
): void {
  ledger.push(observation);
}

export function bridgeRunLedger(): readonly BridgeRunObservation[] {
  return ledger;
}

/** Recursive state-free law: no state-bearing key crosses the owner boundary. */
export const FORBIDDEN_STATE_KEYS = Object.freeze([
  "state",
  "currentState",
  "lastKnownState",
  "observedBefore",
] as const);

export function isStateFreeValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  if (Array.isArray(value)) return value.every(isStateFreeValue);
  return Object.entries(value).every(
    ([key, child]) =>
      !(FORBIDDEN_STATE_KEYS as readonly string[]).includes(key) &&
      isStateFreeValue(child),
  );
}
