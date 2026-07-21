import {
  applyFixtureActivation,
  applyFixtureMutation,
  applyFixtureMutations,
  createHarnessObservations,
  deepFreezeFixture,
  expectedIssuesFrom,
  fixturePath,
  isFixtureRecord,
  materializeFixtureValue,
  ownFixtureValue,
  recursivelyWriteTrapInput,
  requireFixtureArray,
  requireFixtureNumber,
  requireFixtureRecord,
  requireFixtureString,
  setFixturePath,
  stableCellId,
  valueAtPath,
  type ExpectedIssue,
  type FixtureOperation,
  type FixturePath,
  type FixtureRecord,
  type HarnessObservationCounters,
  type MaterializedFixtureCell,
} from "./f2-fixture-core";

type AdversarialSources = Readonly<{
  adversarial: FixtureRecord;
  shape: FixtureRecord;
}>;

type AdversarialCellOptions = Readonly<{
  expectedIssues?: readonly ExpectedIssue[];
  expectedOk: boolean;
  expectedEvidence?: FixtureRecord;
  label?: string;
  operation?: FixtureOperation;
}>;

type AdversarialBuilder = (
  root: unknown,
  observations: HarnessObservationCounters,
) => unknown;

const EVENT_PATH = ["sections", 0, "measures", 0, "events", 0] as const;
const MEASURE_PATH = ["sections", 0, "measures", 0] as const;
const SECTION_PATH = ["sections", 0] as const;

function sourcesFrom(adversarialValue: unknown, shapeValue: unknown): AdversarialSources {
  return {
    adversarial: requireFixtureRecord(adversarialValue, "adversarial fixtures"),
    shape: requireFixtureRecord(shapeValue, "shape fixtures"),
  };
}

function templates(sources: AdversarialSources): FixtureRecord {
  return requireFixtureRecord(ownFixtureValue(sources.shape, "templates"), "templates");
}

function fragments(sources: AdversarialSources): FixtureRecord {
  return requireFixtureRecord(
    ownFixtureValue(sources.shape, "branchFragments"),
    "branchFragments",
  );
}

function activationProtocol(sources: AdversarialSources): FixtureRecord {
  return requireFixtureRecord(
    ownFixtureValue(sources.shape, "activationProtocol"),
    "activationProtocol",
  );
}

function freshRepresentative(
  sources: AdversarialSources,
  observations: HarnessObservationCounters,
): unknown {
  return materializeFixtureValue(
    ownFixtureValue(templates(sources), "representativeDocument"),
    observations,
  );
}

function freshPart(
  sources: AdversarialSources,
  path: FixturePath,
  observations: HarnessObservationCounters,
): unknown {
  return materializeFixtureValue(
    valueAtPath(freshRepresentative(sources, observations), path),
    observations,
  );
}

function applyActivation(
  sources: AdversarialSources,
  root: unknown,
  name: string | undefined,
  observations: HarnessObservationCounters,
): void {
  applyFixtureActivation(
    root,
    name,
    observations,
    activationProtocol(sources),
    fragments(sources),
  );
}

function makeCell(
  sources: AdversarialSources,
  caseId: string,
  index: number,
  builder: AdversarialBuilder,
  options: AdversarialCellOptions,
): MaterializedFixtureCell {
  return {
    caseId,
    cellId: stableCellId(caseId, index, options.label),
    operation: options.operation ?? "decodeDocumentShape",
    expectedOk: options.expectedOk,
    ...(options.expectedIssues === undefined
      ? {}
      : { expectedIssues: options.expectedIssues }),
    ...(options.expectedEvidence === undefined
      ? {}
      : { expectedEvidence: options.expectedEvidence }),
    createInput: () => {
      const observations = createHarnessObservations();
      const root = options.operation === "preflightDocumentImportBytes"
        ? undefined
        : freshRepresentative(sources, observations);
      return { input: builder(root, observations), observations };
    },
  };
}

function caseMap(sources: AdversarialSources): ReadonlyMap<string, FixtureRecord> {
  const result = new Map<string, FixtureRecord>();
  for (const value of requireFixtureArray(
    ownFixtureValue(sources.adversarial, "cases"),
    "adversarial cases",
  )) {
    const record = requireFixtureRecord(value, "adversarial case");
    result.set(requireFixtureString(ownFixtureValue(record, "id"), "case.id"), record);
  }
  return result;
}

function requireCase(cases: ReadonlyMap<string, FixtureRecord>, id: string): FixtureRecord {
  const result = cases.get(id);
  if (result === undefined) throw new Error(`F2_ADVERSARIAL_CASE:${id}`);
  return result;
}

function issue(code: string, path: FixturePath): readonly ExpectedIssue[] {
  return [{ code, path }];
}

function requiredIssues(value: FixtureRecord, label: string): readonly ExpectedIssue[] {
  const result = expectedIssuesFrom(value);
  if (result === undefined) throw new Error(`F2_EXPECTED_ISSUES:${label}`);
  return result;
}

function expectedFor(value: FixtureRecord): Readonly<{
  ok: boolean;
  issues?: readonly ExpectedIssue[];
}> {
  const expected = isFixtureRecord(ownFixtureValue(value, "expected"))
    ? requireFixtureRecord(ownFixtureValue(value, "expected"), "expected")
    : value;
  const issues = expectedIssuesFrom(expected);
  if (issues !== undefined) return { ok: false, issues };
  return { ok: ownFixtureValue(expected, "ok") !== false };
}

function optionsFor(value: FixtureRecord, label?: string): AdversarialCellOptions {
  const expected = expectedFor(value);
  const expectedRecord = isFixtureRecord(ownFixtureValue(value, "expected"))
    ? requireFixtureRecord(ownFixtureValue(value, "expected"), "expected")
    : value;
  const expectedEvidence = evidenceSubset(expectedRecord);
  return {
    expectedOk: expected.ok,
    ...(expected.issues === undefined ? {} : { expectedIssues: expected.issues }),
    ...(expectedEvidence === undefined ? {} : { expectedEvidence }),
    ...(label === undefined ? {} : { label }),
  };
}

function defineData(
  target: object,
  key: PropertyKey,
  value: unknown,
  enumerable = true,
  writable = true,
  configurable = true,
): void {
  Object.defineProperty(target, key, {
    configurable,
    enumerable,
    value,
    writable,
  });
}

function objectAt(root: unknown, path: FixturePath): object {
  const value = valueAtPath(root, path);
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    throw new Error("F2_ADVERSARIAL_OBJECT_PATH");
  }
  return value;
}

function descriptorCallback(
  name: string,
  observations: HarnessObservationCounters,
): () => never {
  return () => {
    const key = name as keyof HarnessObservationCounters;
    observations[key] += 1;
    throw new Error("F2_HOST_CALLBACK_INVOKED");
  };
}

function hostDepthChain(containerCount: number): object {
  const root: Record<string, unknown> = {};
  let current = root;
  for (let depth = 1; depth < containerCount; depth += 1) {
    const next: Record<string, unknown> = {};
    defineData(current, "next", next);
    current = next;
  }
  return root;
}

function materializeHostGraph(value: unknown): unknown {
  if (!isFixtureRecord(value)) return value;
  const name = ownFixtureValue(value, "hostGraph");
  if (name === "depth-33-ordinary-chain") return hostDepthChain(33);
  if (name === "self-cycle") {
    const cycle: Record<string, unknown> = {};
    defineData(cycle, "self", cycle);
    return cycle;
  }
  return value;
}

function propertyKeyFrom(value: unknown): PropertyKey {
  const key = requireFixtureRecord(value, "property key");
  const kind = requireFixtureString(ownFixtureValue(key, "kind"), "key.kind");
  if (kind === "symbol") {
    return Symbol(requireFixtureString(ownFixtureValue(key, "description"), "symbol description"));
  }
  return requireFixtureString(ownFixtureValue(key, "value"), "key.value");
}

function defineFixtureDescriptor(
  target: object,
  key: PropertyKey,
  descriptorValue: unknown,
  observations: HarnessObservationCounters,
  replacementValue?: unknown,
): void {
  const fixture = requireFixtureRecord(descriptorValue, "descriptor");
  const descriptor: PropertyDescriptor = {};
  const configurable = ownFixtureValue(fixture, "configurable");
  const enumerable = ownFixtureValue(fixture, "enumerable");
  const writable = ownFixtureValue(fixture, "writable");
  if (typeof configurable === "boolean") descriptor.configurable = configurable;
  if (typeof enumerable === "boolean") descriptor.enumerable = enumerable;
  if (typeof writable === "boolean") descriptor.writable = writable;
  if (replacementValue !== undefined || Object.hasOwn(fixture, "value")) {
    if (replacementValue !== undefined) {
      descriptor.value = replacementValue;
    } else {
      const fixtureValue = ownFixtureValue(fixture, "value");
      const rawValue = materializeHostGraph(fixtureValue);
      descriptor.value = rawValue === fixtureValue
        ? materializeFixtureValue(rawValue, observations)
        : rawValue;
    }
  }
  const getter = ownFixtureValue(fixture, "get");
  if (isFixtureRecord(getter)) {
    descriptor.get = descriptorCallback(
      requireFixtureString(ownFixtureValue(getter, "instrumentedCallback"), "getter callback"),
      observations,
    );
  }
  const setter = ownFixtureValue(fixture, "set");
  if (isFixtureRecord(setter)) {
    descriptor.set = descriptorCallback(
      requireFixtureString(ownFixtureValue(setter, "instrumentedCallback"), "setter callback"),
      observations,
    );
  }
  Object.defineProperty(target, key, descriptor);
}

function arrayTargets(sources: AdversarialSources): readonly FixtureRecord[] {
  return requireFixtureArray(
    ownFixtureValue(sources.adversarial, "arrayConsumerTargets"),
    "arrayConsumerTargets",
  ).map((value) => requireFixtureRecord(value, "array target"));
}

function prepareArrayTarget(
  sources: AdversarialSources,
  root: unknown,
  target: FixtureRecord,
  observations: HarnessObservationCounters,
): Readonly<{ path: FixturePath; validArray: unknown[]; validElement: unknown }> {
  const activation = ownFixtureValue(target, "activation");
  applyActivation(
    sources,
    root,
    typeof activation === "string" ? activation : undefined,
    observations,
  );
  const path = fixturePath(ownFixtureValue(target, "path"), "array target path");
  const array = valueAtPath(root, path);
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error("F2_ARRAY_TARGET_EMPTY");
  }
  return {
    path,
    validArray: materializeFixtureValue(array, observations) as unknown[],
    validElement: materializeFixtureValue(valueAtPath(array, [0]), observations),
  };
}

function expandBoundary(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const fallback = issue("shape.invalid_type", []);
  return requireFixtureArray(ownFixtureValue(caseRecord, "inputs"), "inputs")
    .map((input, index) => makeCell(sources, "F2-BOUNDARY-001", index,
      (_root, observations) => materializeFixtureValue(input, observations), {
        operation: "preflightDocumentImportBytes",
        expectedOk: false,
        expectedIssues: fallback,
      }));
}

function expandFreshness(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  return requireFixtureArray(ownFixtureValue(caseRecord, "cellExpansion"), "cellExpansion")
    .map((cellValue, index) => {
      const cell = requireFixtureRecord(cellValue, "freshness cell");
      const id = requireFixtureString(ownFixtureValue(cell, "id"), "cell.id");
      const operation = requireFixtureString(ownFixtureValue(cell, "operation"), "operation") as FixtureOperation;
      let expectedIssues: readonly ExpectedIssue[] | undefined;
      if (id === "shape-schema-failure") expectedIssues = issue("document.schema_missing", ["schema"]);
      if (id === "shape-redaction-failure") {
        expectedIssues = issue("id.syntax_invalid", [...EVENT_PATH, "id"]);
      }
      if (id === "shape-unknown-key-redaction-failure") {
        expectedIssues = issue("shape.unknown_field", ["LEAK-UNKNOWN-KEY-a49e7d2c"]);
      }
      if (id === "byte-failure") expectedIssues = issue("limit.import_bytes_exceeded", []);
      return makeCell(sources, "F2-FRESH-001", index, (root, observations) => {
        if (operation === "preflightDocumentImportBytes") {
          return ownFixtureValue(cell, "input");
        }
        const mutation = ownFixtureValue(cell, "mutation");
        if (isFixtureRecord(mutation)) {
          applyFixtureMutation(root, mutation, observations, fragments(sources));
        }
        if (ownFixtureValue(cell, "recursivelyFreezeInputBeforeDecode") === true) {
          deepFreezeFixture(root);
        }
        if (ownFixtureValue(cell, "recursivelyProxyEveryInputContainer") !== undefined) {
          return recursivelyWriteTrapInput(root, observations);
        }
        return root;
      }, {
        operation,
        expectedOk: expectedIssues === undefined,
        ...(expectedIssues === undefined ? {} : { expectedIssues }),
        label: id,
      });
    });
}

function expandHostOne(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const pathValue of requireFixtureArray(ownFixtureValue(caseRecord, "paths"), "paths")) {
    const path = fixturePath(pathValue, "host accessor path");
    for (const descriptor of requireFixtureArray(ownFixtureValue(caseRecord, "descriptors"), "descriptors")) {
      const name = requireFixtureString(descriptor, "descriptor kind");
      result.push(makeCell(sources, "F2-HOST-001", index, (root, observations) => {
        const parentPath = path.slice(0, -1);
        const key = path[path.length - 1];
        if (key === undefined) throw new Error("F2_HOST_ACCESSOR_PATH");
        const parent = parentPath.length === 0 ? root : valueAtPath(root, parentPath);
        if ((typeof parent !== "object" || parent === null) && typeof parent !== "function") {
          throw new Error("F2_HOST_ACCESSOR_PARENT");
        }
        Object.defineProperty(parent, key, name === "getter"
          ? {
            configurable: true,
            enumerable: true,
            get: descriptorCallback("getterCallbacks", observations),
          }
          : {
            configurable: true,
            enumerable: true,
            set: descriptorCallback("getterCallbacks", observations),
          });
        return root;
      }, {
        expectedOk: false,
        expectedIssues: issue("shape.invalid_type", path),
        label: `${name}:${path.join(".")}`,
      }));
      index += 1;
    }
  }
  return result;
}

function expandHostTwo(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const successIds = new Set(["null-prototype", "custom-prototype", "frozen-input", "enumerable-nonwritable-title"]);
  return requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells")
    .map((cellValue, index) => {
      const cell = requireFixtureRecord(cellValue, "host two cell");
      const id = requireFixtureString(ownFixtureValue(cell, "id"), "cell.id");
      let expectedIssues: readonly ExpectedIssue[] | undefined;
      if (id === "inherited-required-getters") {
        expectedIssues = [
          { code: "document.schema_missing", path: ["schema"] },
          { code: "shape.invalid_type", path: ["title"] },
        ];
      } else if (id === "nonenumerable-title") {
        expectedIssues = issue("shape.invalid_type", ["title"]);
      } else if (id === "nonenumerable-schema") {
        expectedIssues = issue("shape.invalid_type", ["schema"]);
      }
      return makeCell(sources, "F2-HOST-002", index, (root, observations) => {
        if (id === "null-prototype") Object.setPrototypeOf(root, null);
        if (id === "custom-prototype") Object.setPrototypeOf(root, { sentinel: true });
        if (id === "frozen-input") deepFreezeFixture(root);
        const omitted = ownFixtureValue(cell, "omitOwnFields");
        if (Array.isArray(omitted)) {
          for (const field of omitted) Reflect.deleteProperty(
            requireFixtureRecord(root, "root"),
            requireFixtureString(field, "omitted field"),
          );
          const prototype = {};
          const descriptors = requireFixtureRecord(
            ownFixtureValue(cell, "prototypeDescriptors"),
            "prototypeDescriptors",
          );
          for (const [field, descriptor] of Object.entries(descriptors)) {
            defineFixtureDescriptor(prototype, field, descriptor, observations);
          }
          Object.setPrototypeOf(root, prototype);
        }
        const ownDescriptor = ownFixtureValue(cell, "ownDescriptor");
        if (isFixtureRecord(ownDescriptor)) {
          const path = fixturePath(ownFixtureValue(ownDescriptor, "path"), "descriptor.path");
          const parent = objectAt(root, path.slice(0, -1));
          const key = path[path.length - 1];
          if (key === undefined) throw new Error("F2_HOST_DESCRIPTOR_PATH");
          defineFixtureDescriptor(parent, key, ownDescriptor, observations);
        }
        return root;
      }, {
        expectedOk: successIds.has(id),
        ...(expectedIssues === undefined ? {} : { expectedIssues }),
        label: id,
      });
    });
}

function expandHostThree(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  return requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells")
    .map((cellValue, index) => {
      const cell = requireFixtureRecord(cellValue, "host three cell");
      const key = requireFixtureString(ownFixtureValue(cell, "ownKey"), "ownKey");
      return makeCell(sources, "F2-HOST-003", index, (root, observations) => {
        defineFixtureDescriptor(
          requireFixtureRecord(root, "root"),
          key,
          ownFixtureValue(cell, "descriptor"),
          observations,
        );
        return root;
      }, {
        expectedOk: false,
        expectedIssues: issue("shape.unknown_field", [key]),
        label: requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"),
      });
    });
}

function expandHostFour(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const target of arrayTargets(sources)) {
    for (const probeValue of requireFixtureArray(ownFixtureValue(caseRecord, "probes"), "probes")) {
      const probe = requireFixtureRecord(probeValue, "host four probe");
      result.push(makeCell(sources, "F2-HOST-004", index, (root, observations) => {
        const prepared = prepareArrayTarget(sources, root, target, observations);
        const length = requireFixtureNumber(ownFixtureValue(probe, "arrayLength"), "arrayLength");
        const array = new Array<unknown>(length);
        for (const descriptorValue of requireFixtureArray(
          ownFixtureValue(probe, "ownIndexDescriptors"),
          "ownIndexDescriptors",
        )) {
          const descriptor = requireFixtureRecord(descriptorValue, "index descriptor");
          const descriptorFixture = ownFixtureValue(descriptor, "value") === "fresh clone of target validElement"
            ? { ...descriptor, value: prepared.validElement }
            : descriptor;
          defineFixtureDescriptor(
            array,
            requireFixtureNumber(ownFixtureValue(descriptor, "index"), "index"),
            descriptorFixture,
            observations,
          );
        }
        const inherited = ownFixtureValue(probe, "prototypeIndexDescriptor");
        if (isFixtureRecord(inherited)) {
          const prototype = Object.create(Array.prototype) as object;
          defineFixtureDescriptor(
            prototype,
            requireFixtureNumber(ownFixtureValue(inherited, "index"), "index"),
            { ...inherited, value: prepared.validElement },
            observations,
          );
          Object.setPrototypeOf(array, prototype);
        }
        setFixturePath(root, prepared.path, array);
        return root;
      }, {
        expectedOk: false,
        expectedIssues: issue(
          "shape.invalid_type",
          [...fixturePath(ownFixtureValue(target, "path"), "target.path"), 0],
        ),
        label: `${String(ownFixtureValue(target, "id"))}:${String(ownFixtureValue(probe, "id"))}`,
      }));
      index += 1;
    }
  }
  return result;
}

function poisonPrototypeKey(value: string): PropertyKey {
  return value === "Symbol.iterator" ? Symbol.iterator : value;
}

function expandHostFive(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const target of arrayTargets(sources)) {
    for (const probeValue of requireFixtureArray(ownFixtureValue(caseRecord, "probes"), "probes")) {
      const probe = requireFixtureRecord(probeValue, "host five probe");
      const kind = requireFixtureString(ownFixtureValue(probe, "kind"), "probe.kind");
      const path = fixturePath(ownFixtureValue(target, "path"), "target.path");
      result.push(makeCell(sources, "F2-HOST-005", index, (root, observations) => {
        const prepared = prepareArrayTarget(sources, root, target, observations);
        if (kind === "invalid-index") {
          const length = requireFixtureNumber(ownFixtureValue(probe, "arrayLength"), "arrayLength");
          const array = new Array<unknown>(length);
          const descriptor = requireFixtureRecord(
            ownFixtureValue(probe, "ownIndexDescriptor"),
            "ownIndexDescriptor",
          );
          const fixture = ownFixtureValue(descriptor, "value") === "fresh clone of target validElement"
            ? { ...descriptor, value: prepared.validElement }
            : descriptor;
          defineFixtureDescriptor(array, 0, fixture, observations);
          setFixturePath(root, prepared.path, array);
        } else {
          const array = prepared.validArray;
          const prototypeDescriptor = requireFixtureRecord(
            ownFixtureValue(probe, "prototypeDescriptor"),
            "prototypeDescriptor",
          );
          const prototype = Object.create(Array.prototype) as object;
          const key = poisonPrototypeKey(
            requireFixtureString(ownFixtureValue(prototypeDescriptor, "key"), "prototype key"),
          );
          defineData(
            prototype,
            key,
            materializeFixtureValue(ownFixtureValue(prototypeDescriptor, "value"), observations),
          );
          Object.setPrototypeOf(array, prototype);
          setFixturePath(root, prepared.path, array);
        }
        return root;
      }, {
        expectedOk: kind === "valid-poisoned-prototype",
        ...(kind === "invalid-index"
          ? { expectedIssues: issue("shape.invalid_type", [...path, 0]) }
          : {}),
        label: `${String(ownFixtureValue(target, "id"))}:${String(ownFixtureValue(probe, "id"))}`,
      }));
      index += 1;
    }
  }
  return result;
}

function defineHostEntries(
  target: object,
  entriesValue: unknown,
  observations: HarnessObservationCounters,
): void {
  for (const entryValue of requireFixtureArray(entriesValue, "host entries")) {
    const entry = requireFixtureRecord(entryValue, "host entry");
    defineFixtureDescriptor(
      target,
      propertyKeyFrom(ownFixtureValue(entry, "key")),
      ownFixtureValue(entry, "descriptor"),
      observations,
    );
  }
}

function expandHostSix(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const cellValue of requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells")) {
    const cell = requireFixtureRecord(cellValue, "host six cell");
    result.push(makeCell(sources, "F2-HOST-006", index, (root, observations) => {
      const target = objectAt(root, fixturePath(ownFixtureValue(cell, "targetPath"), "targetPath"));
      defineHostEntries(target, ownFixtureValue(cell, "entries"), observations);
      return root;
    }, optionsFor(cell, requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"))));
    index += 1;
  }
  for (const target of arrayTargets(sources)) {
    for (const probeValue of requireFixtureArray(
      ownFixtureValue(caseRecord, "arrayConsumerProbes"),
      "arrayConsumerProbes",
    )) {
      const probe = requireFixtureRecord(probeValue, "array consumer probe");
      const targetPath = fixturePath(ownFixtureValue(target, "path"), "target.path");
      const kind = requireFixtureString(ownFixtureValue(probe, "kind"), "probe.kind");
      const stringValue = ownFixtureValue(probe, "value");
      const expectedPath = kind === "string"
        ? [...targetPath, requireFixtureString(stringValue, "probe.value")]
        : targetPath;
      const code = kind === "string" ? "shape.unknown_field" : "shape.invalid_type";
      const probeExpected = requireFixtureRecord(
        ownFixtureValue(probe, "expected"),
        "probe.expected",
      );
      const expectedEvidence = evidenceSubset(probeExpected);
      result.push(makeCell(sources, "F2-HOST-006", index, (root, observations) => {
        const prepared = prepareArrayTarget(sources, root, target, observations);
        if (kind === "string") {
          defineFixtureDescriptor(
            prepared.validArray,
            requireFixtureString(stringValue, "probe.value"),
            ownFixtureValue(probe, "descriptor"),
            observations,
          );
        } else {
          for (const description of requireFixtureArray(
            ownFixtureValue(probe, "descriptions"),
            "descriptions",
          )) {
            defineData(
              prepared.validArray,
              Symbol(requireFixtureString(description, "symbol description")),
              true,
            );
          }
        }
        setFixturePath(root, prepared.path, prepared.validArray);
        return root;
      }, {
        expectedOk: false,
        expectedIssues: issue(code, expectedPath),
        ...(expectedEvidence === undefined ? {} : { expectedEvidence }),
        label: `${String(ownFixtureValue(target, "id"))}:${String(ownFixtureValue(probe, "id"))}`,
      }));
      index += 1;
    }
  }
  for (const traversalValue of requireFixtureArray(
    ownFixtureValue(caseRecord, "arrayTraversalCells"),
    "arrayTraversalCells",
  )) {
    const traversal = requireFixtureRecord(traversalValue, "array traversal cell");
    result.push(makeCell(sources, "F2-HOST-006", index, (root, observations) => {
      const path = fixturePath(ownFixtureValue(traversal, "targetPath"), "targetPath");
      const array = materializeFixtureValue(valueAtPath(root, path), observations);
      if (!Array.isArray(array)) throw new Error("F2_ARRAY_TRAVERSAL_TARGET");
      const entry = requireFixtureRecord(ownFixtureValue(traversal, "entry"), "entry");
      const key = requireFixtureString(ownFixtureValue(entry, "key"), "entry.key");
      const descriptor = requireFixtureRecord(ownFixtureValue(entry, "descriptor"), "descriptor");
      if (ownFixtureValue(descriptor, "valueGraph") !== undefined) {
        const back: Record<string, unknown> = {};
        defineData(back, "back", array);
        defineFixtureDescriptor(array, key, descriptor, observations, back);
      } else {
        defineFixtureDescriptor(array, key, descriptor, observations);
      }
      setFixturePath(root, path, array);
      return root;
    }, optionsFor(
      traversal,
      requireFixtureString(ownFixtureValue(traversal, "id"), "cell.id"),
    )));
    index += 1;
  }
  return result;
}

function fixtureArguments(value: unknown): IArguments {
  function capture(argument: unknown): IArguments {
    void argument;
    // eslint-disable-next-line prefer-rest-params -- this fixture must be a genuine IArguments host object.
    return arguments;
  }
  return capture(value);
}

function materializeHostArrayLike(
  id: string,
  validElement: unknown,
  observations: HarnessObservationCounters,
): unknown {
  switch (id) {
    case "uint8array":
      return new Uint8Array([1]);
    case "int32array":
      return new Int32Array([1]);
    case "arguments":
      return fixtureArguments(true);
    case "plain-length":
      return { 0: "value", length: 1 };
    case "set":
      return new Set([validElement]);
    case "iterable": {
      const result: Record<PropertyKey, unknown> = {};
      defineData(
        result,
        Symbol.iterator,
        descriptorCallback("iteratorCallbacks", observations),
      );
      return result;
    }
    default:
      throw new Error(`F2_HOST_ARRAY_LIKE:${id}`);
  }
}

function expandHostSeven(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const target of arrayTargets(sources)) {
    for (const hostValue of requireFixtureArray(ownFixtureValue(caseRecord, "hostValues"), "hostValues")) {
      const host = requireFixtureRecord(hostValue, "host value");
      const id = requireFixtureString(ownFixtureValue(host, "id"), "host.id");
      const path = fixturePath(ownFixtureValue(target, "path"), "target.path");
      result.push(makeCell(sources, "F2-HOST-007", index, (root, observations) => {
        const prepared = prepareArrayTarget(sources, root, target, observations);
        setFixturePath(
          root,
          prepared.path,
          materializeHostArrayLike(id, prepared.validElement, observations),
        );
        return root;
      }, {
        expectedOk: false,
        expectedIssues: issue("shape.invalid_type", path),
        label: `${String(ownFixtureValue(target, "id"))}:${id}`,
      }));
      index += 1;
    }
  }
  return result;
}

function proxyForCell(
  target: object,
  proxySpec: FixtureRecord,
  observations: HarnessObservationCounters,
): object {
  if (ownFixtureValue(proxySpec, "revokedBeforeDecode") === true) {
    const revocable = Proxy.revocable(target, {});
    revocable.revoke();
    return revocable.proxy;
  }
  const trap = ownFixtureValue(proxySpec, "trap");
  const throwKey = ownFixtureValue(proxySpec, "throwKey");
  const poisoned = ownFixtureValue(proxySpec, "poisonTraps") !== undefined;
  const handler: ProxyHandler<object> = {
    getOwnPropertyDescriptor: (candidate, key) => {
      if (trap === "getOwnPropertyDescriptor" &&
          (throwKey === undefined || String(key) === throwKey)) {
        throw new Error("F2_PROXY_DESCRIPTOR");
      }
      return Reflect.getOwnPropertyDescriptor(candidate, key);
    },
    ownKeys: (candidate) => {
      if (trap === "ownKeys") throw new Error("F2_PROXY_OWN_KEYS");
      return Reflect.ownKeys(candidate);
    },
  };
  if (poisoned) {
    handler.get = () => {
      observations.propertyGetCallbacks += 1;
      throw new Error("F2_PROXY_GET");
    };
    handler.getPrototypeOf = () => {
      observations.prototypeCallbacks += 1;
      throw new Error("F2_PROXY_PROTOTYPE");
    };
  }
  return new Proxy(target, handler);
}

function expandHostEight(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  return requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells")
    .map((cellValue, index) => {
      const cell = requireFixtureRecord(cellValue, "host eight cell");
      const id = requireFixtureString(ownFixtureValue(cell, "id"), "cell.id");
      return makeCell(sources, "F2-HOST-008", index, (root, observations) => {
        const inputSetup = ownFixtureValue(cell, "inputSetup");
        if (isFixtureRecord(inputSetup)) {
          root = applyShapeCount(sources, root, inputSetup, observations);
          const mutations = ownFixtureValue(inputSetup, "afterShapeCountMutations");
          if (Array.isArray(mutations)) {
            applyFixtureMutations(root, mutations, observations, fragments(sources));
          }
        }
        const path = fixturePath(ownFixtureValue(cell, "path"), "proxy path");
        const target = path.length === 0 ? root : valueAtPath(root, path);
        if (typeof target !== "object" || target === null) {
          throw new Error("F2_PROXY_TARGET");
        }
        const proxy = proxyForCell(
          target,
          requireFixtureRecord(ownFixtureValue(cell, "proxy"), "proxy"),
          observations,
        );
        if (path.length === 0) return proxy;
        setFixturePath(root, path, proxy);
        return root;
      }, optionsFor(cell, id));
    });
}

function addUnknownData(target: object, key: PropertyKey, value: unknown): void {
  defineData(target, key, value);
}

function applyCycleGraph(
  sources: AdversarialSources,
  root: unknown,
  id: string,
  observations: HarnessObservationCounters,
): void {
  if (id === "object-self-cycle" || id === "cycle-before-sections-limit") {
    const meter = objectAt(root, ["meter"]);
    addUnknownData(meter, "loop", meter);
    return;
  }
  if (id === "root-back-cycle") {
    const extra: Record<string, unknown> = {};
    addUnknownData(extra, "back", root);
    addUnknownData(requireFixtureRecord(root, "root"), "extra", extra);
    return;
  }
  if (id === "shared-dag") {
    applyActivation(sources, root, "sectionKeyOverride", observations);
    const tonic = { step: "C", alter: 0 };
    setFixturePath(root, ["key", "tonic"], tonic);
    setFixturePath(root, ["sections", 0, "keyOverride", "tonic"], tonic);
    return;
  }
  if (id === "lexical-cycle-winner") {
    const target = requireFixtureRecord(root, "root");
    for (const key of ["zeta", "alpha"] as const) {
      const child: Record<string, unknown> = {};
      addUnknownData(child, "back", root);
      addUnknownData(target, key, child);
    }
    return;
  }
  if (id === "array-numeric-cycle-winner") {
    const array = new Array<unknown>(1);
    addUnknownData(array, "alpha", array);
    defineData(array, 0, array);
    addUnknownData(requireFixtureRecord(root, "root"), "extra", array);
    return;
  }
  if (id === "cycle-at-depth-32") {
    const first: Record<string, unknown> = {};
    addUnknownData(requireFixtureRecord(root, "root"), "extra", first);
    let current = first;
    for (let count = 0; count < 30; count += 1) {
      const next: Record<string, unknown> = {};
      addUnknownData(current, "next", next);
      current = next;
    }
    addUnknownData(current, "back", first);
    return;
  }
  throw new Error(`F2_CYCLE_GRAPH:${id}`);
}

function expandHostNine(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const cellValues = [
    ...requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells"),
    ...requireFixtureArray(ownFixtureValue(caseRecord, "precedenceCells"), "precedenceCells"),
  ];
  return cellValues.map((cellValue, index) => {
    const cell = requireFixtureRecord(cellValue, "host nine cell");
    const id = requireFixtureString(ownFixtureValue(cell, "id"), "cell.id");
    return makeCell(sources, "F2-HOST-009", index, (root, observations) => {
      const setup = ownFixtureValue(cell, "inputSetup");
      if (isFixtureRecord(setup)) root = applyShapeCount(sources, root, setup, observations);
      applyCycleGraph(sources, root, id, observations);
      return root;
    }, optionsFor(cell, id));
  });
}

function attachDepthChain(root: unknown, depth: number): void {
  if (depth < 2) return;
  let current: unknown = root;
  for (let containerDepth = 2; containerDepth <= depth; containerDepth += 1) {
    const next: unknown = containerDepth % 2 === 0 ? {} : [];
    if (Array.isArray(current)) defineData(current, 0, next);
    else addUnknownData(requireFixtureRecord(current, "depth container"), "extra", next);
    current = next;
  }
}

function expandHostTen(sources: AdversarialSources): readonly MaterializedFixtureCell[] {
  return [makeCell(sources, "F2-HOST-010", 0, (root) => {
    attachDepthChain(root, 33);
    return root;
  }, {
    expectedOk: false,
    expectedIssues: issue("limit.json_depth_exceeded", []),
  })];
}

function padded(prefix: string, value: number, width: number): string {
  return `${prefix}${String(value).padStart(width, "0")}`;
}

function makeEmptyMeasure(
  sources: AdversarialSources,
  index: number,
  observations: HarnessObservationCounters,
): unknown {
  const measure = freshPart(sources, MEASURE_PATH, observations);
  setFixturePath(measure, ["id"], padded("measure-limit-", index, 4));
  setFixturePath(measure, ["events"], []);
  setFixturePath(measure, ["completion"], { kind: "empty" });
  return measure;
}

function makeEmptySection(
  sources: AdversarialSources,
  index: number,
  observations: HarnessObservationCounters,
): unknown {
  const section = freshPart(sources, SECTION_PATH, observations);
  setFixturePath(section, ["id"], padded("section-limit-", index, 4));
  setFixturePath(section, ["name"], padded("S", index, 4));
  setFixturePath(section, ["annotation"], "");
  setFixturePath(section, ["keyOverride"], null);
  setFixturePath(section, ["voiceLeadingBoundary"], "continue");
  setFixturePath(section, ["measures"], []);
  return section;
}

function makeCountEvent(
  sources: AdversarialSources,
  index: number,
  observations: HarnessObservationCounters,
): unknown {
  const event = freshPart(sources, EVENT_PATH, observations);
  setFixturePath(event, ["id"], padded("event-limit-", index, 5));
  setFixturePath(event, ["duration"], { numerator: 1, denominator: 960 });
  setFixturePath(event, ["annotation"], "");
  return event;
}

function buildCountSections(
  sources: AdversarialSources,
  count: number,
  observations: HarnessObservationCounters,
): readonly unknown[] {
  return Array.from(
    { length: count },
    (_unused, index) => makeEmptySection(sources, index, observations),
  );
}

function buildCountMeasures(
  sources: AdversarialSources,
  count: number,
  observations: HarnessObservationCounters,
): readonly unknown[] {
  return Array.from(
    { length: count },
    (_unused, index) => makeEmptyMeasure(sources, index, observations),
  );
}

function buildCountEventsDocument(
  sources: AdversarialSources,
  count: number,
  observations: HarnessObservationCounters,
): unknown {
  const root = freshRepresentative(sources, observations);
  const sections: unknown[] = [];
  let eventIndex = 0;
  let measureIndex = 0;
  while (eventIndex < count) {
    const section = makeEmptySection(sources, sections.length, observations);
    const measures: unknown[] = [];
    while (eventIndex < count && measures.length < 1_024) {
      const measure = makeEmptyMeasure(sources, measureIndex, observations);
      measureIndex += 1;
      const events: unknown[] = [];
      while (eventIndex < count && events.length < 8) {
        events.push(makeCountEvent(sources, eventIndex, observations));
        eventIndex += 1;
      }
      setFixturePath(measure, ["events"], events);
      setFixturePath(measure, ["completion"], { kind: "complete" });
      measures.push(measure);
    }
    setFixturePath(section, ["measures"], measures);
    sections.push(section);
  }
  setFixturePath(root, ["sections"], sections);
  return root;
}

function pitchClassAt(index: number): unknown {
  const values = [
    { step: "C", alter: 0 },
    { step: "E", alter: -1 },
    { step: "G", alter: 0 },
  ] as const;
  return { ...values[index % values.length] };
}

function manualPitchAt(index: number): unknown {
  const values = [
    { step: "C", alter: 0, octave: 4 },
    { step: "E", alter: -1, octave: 4 },
    { step: "G", alter: 0, octave: 4 },
  ] as const;
  return { ...values[index % values.length] };
}

function frozenPitchAt(index: number): unknown {
  const values = [
    { step: "C", alter: 0, octave: 4 },
    { step: "E", alter: 0, octave: 4 },
    { step: "G", alter: 0, octave: 4 },
    { step: "B", alter: 0, octave: 4 },
  ] as const;
  return { ...values[index % values.length] };
}

function setPitchCounts(
  event: unknown,
  customPitchCount: number | undefined,
  storedPitchCount: number | undefined,
): void {
  if (customPitchCount !== undefined) {
    setFixturePath(
      event,
      ["chord", "pitchNames"],
      Array.from({ length: customPitchCount }, (_unused, index) => pitchClassAt(index)),
    );
  }
  if (storedPitchCount !== undefined) {
    const mode = valueAtPath(event, ["voicing", "mode"]);
    setFixturePath(
      event,
      ["voicing", "pitches"],
      Array.from(
        { length: storedPitchCount },
        (_unused, index) => mode === "frozen" ? frozenPitchAt(index) : manualPitchAt(index),
      ),
    );
  }
}

function applyDottedOverrides(
  event: unknown,
  value: unknown,
  observations: HarnessObservationCounters,
): void {
  if (!isFixtureRecord(value)) return;
  for (const [key, rawValue] of Object.entries(value)) {
    setFixturePath(
      event,
      key.split("."),
      materializeFixtureValue(rawValue, observations),
    );
  }
}

function eventFromLimitSpec(
  sources: AdversarialSources,
  specValue: unknown,
  eventIndex: number,
  observations: HarnessObservationCounters,
): unknown {
  if (specValue === false) return false;
  const spec = requireFixtureRecord(specValue, "limit event spec");
  const event = makeCountEvent(sources, eventIndex, observations);
  const fragmentsValue = ownFixtureValue(spec, "fragments");
  if (isFixtureRecord(fragmentsValue)) {
    for (const field of ["chord", "voicing"] as const) {
      const fragmentName = ownFixtureValue(fragmentsValue, field);
      if (typeof fragmentName === "string") {
        setFixturePath(
          event,
          [field],
          materializeFixtureValue(ownFixtureValue(fragments(sources), fragmentName), observations),
        );
      }
    }
  }
  const activation = ownFixtureValue(spec, "activation");
  if (typeof activation === "string") {
    applyActivation(sources, eventWrapper(event), activation, observations);
    const activated = valueAtPath(eventWrapper(event), EVENT_PATH);
    return finishLimitEvent(activated, spec, observations);
  }
  return finishLimitEvent(event, spec, observations);
}

function eventWrapper(event: unknown): unknown {
  return {
    sections: [{ measures: [{ events: [event] }] }],
  };
}

function finishLimitEvent(
  event: unknown,
  spec: FixtureRecord,
  observations: HarnessObservationCounters,
): unknown {
  const overrides = ownFixtureValue(spec, "overrides");
  applyDottedOverrides(event, overrides, observations);
  const customCount = ownFixtureValue(spec, "customPitchNameCount");
  const storedCount = ownFixtureValue(spec, "storedPitchCount");
  setPitchCounts(
    event,
    typeof customCount === "number" ? customCount : undefined,
    typeof storedCount === "number" ? storedCount : undefined,
  );
  return event;
}

function buildSectionsFromDescriptor(
  sources: AdversarialSources,
  sectionsValue: unknown,
  observations: HarnessObservationCounters,
): readonly unknown[] {
  let globalEventIndex = 0;
  let globalMeasureIndex = 0;
  return requireFixtureArray(sectionsValue, "section descriptors").map((sectionValue, sectionIndex) => {
    const spec = requireFixtureRecord(sectionValue, "section descriptor");
    const section = makeEmptySection(sources, sectionIndex, observations);
    setFixturePath(section, ["id"], ownFixtureValue(spec, "id"));
    if (Object.hasOwn(spec, "measuresOwnDataValue")) {
      setFixturePath(section, ["measures"], ownFixtureValue(spec, "measuresOwnDataValue"));
      return section;
    }
    const measuresCount = ownFixtureValue(spec, "measuresCount");
    if (typeof measuresCount === "number") {
      setFixturePath(
        section,
        ["measures"],
        Array.from({ length: measuresCount }, () => {
          const measure = makeEmptyMeasure(sources, globalMeasureIndex, observations);
          globalMeasureIndex += 1;
          return measure;
        }),
      );
      return section;
    }
    const lengthValues = ownFixtureValue(spec, "measureEventArrayLengths");
    if (Array.isArray(lengthValues)) {
      const measures = lengthValues.map((lengthValue) => {
        const measure = makeEmptyMeasure(sources, globalMeasureIndex, observations);
        globalMeasureIndex += 1;
        const length = requireFixtureNumber(lengthValue, "event array length");
        const events = Array.from({ length }, () => {
          const event = makeCountEvent(sources, globalEventIndex, observations);
          globalEventIndex += 1;
          return event;
        });
        setFixturePath(measure, ["events"], events);
        return measure;
      });
      setFixturePath(section, ["measures"], measures);
      return section;
    }
    const measuresValue = ownFixtureValue(spec, "measures");
    if (Array.isArray(measuresValue)) {
      const measures = measuresValue.map((measureValue) => {
        if (measureValue === false) return false;
        const measureSpec = requireFixtureRecord(measureValue, "measure descriptor");
        const measure = makeEmptyMeasure(sources, globalMeasureIndex, observations);
        globalMeasureIndex += 1;
        if (Object.hasOwn(measureSpec, "id")) {
          setFixturePath(measure, ["id"], ownFixtureValue(measureSpec, "id"));
        }
        const eventsValue = ownFixtureValue(measureSpec, "events");
        if (Array.isArray(eventsValue)) {
          const events = eventsValue.map((eventValue) => {
            const event = eventFromLimitSpec(
              sources,
              eventValue,
              globalEventIndex,
              observations,
            );
            globalEventIndex += 1;
            return event;
          });
          setFixturePath(measure, ["events"], events);
        }
        return measure;
      });
      setFixturePath(section, ["measures"], measures);
    }
    return section;
  });
}

function structurallyInspectableSection(
  sources: AdversarialSources,
  spec: FixtureRecord,
  observations: HarnessObservationCounters,
): unknown {
  const section = makeEmptySection(sources, 0, observations);
  const measureCount = requireFixtureNumber(ownFixtureValue(spec, "measuresCount"), "measuresCount");
  const eventCount = requireFixtureNumber(
    ownFixtureValue(spec, "eventsAcrossThoseMeasures"),
    "eventsAcrossThoseMeasures",
  );
  const measures = buildCountMeasures(sources, measureCount, observations);
  let eventIndex = 0;
  for (const measure of measures) {
    const events: unknown[] = [];
    while (eventIndex < eventCount && events.length < 8) {
      events.push(makeCountEvent(sources, eventIndex, observations));
      eventIndex += 1;
    }
    setFixturePath(measure, ["events"], events);
  }
  setFixturePath(section, ["measures"], measures);
  const firstEvent = valueAtPath(section, ["measures", 0, "events", 0]);
  const firstStoredPitchCount = ownFixtureValue(spec, "firstStoredPitchCount");
  if (typeof firstStoredPitchCount === "number") {
    const wrapper = eventWrapper(firstEvent);
    applyActivation(sources, wrapper, "manualVoicing", observations);
    setPitchCounts(valueAtPath(wrapper, EVENT_PATH), undefined, firstStoredPitchCount);
  }
  return section;
}

function applyShapeCount(
  sources: AdversarialSources,
  initialRoot: unknown,
  descriptor: FixtureRecord,
  observations: HarnessObservationCounters,
): unknown {
  let root = initialRoot;
  const shapeCount = ownFixtureValue(descriptor, "shapeCount");
  const count = ownFixtureValue(descriptor, "count");
  if (shapeCount === "sections" && typeof count === "number") {
    setFixturePath(root, ["sections"], buildCountSections(sources, count, observations));
  } else if (shapeCount === "measuresInSection0" && typeof count === "number") {
    setFixturePath(root, ["sections"], [makeEmptySection(sources, 0, observations)]);
    setFixturePath(
      root,
      ["sections", 0, "measures"],
      buildCountMeasures(sources, count, observations),
    );
  } else if (shapeCount === "eventsAcrossDocument" && typeof count === "number") {
    root = buildCountEventsDocument(sources, count, observations);
  }
  const sectionsValue = ownFixtureValue(descriptor, "sections");
  if (Array.isArray(sectionsValue)) {
    setFixturePath(
      root,
      ["sections"],
      buildSectionsFromDescriptor(sources, sectionsValue, observations),
    );
  }
  const index0 = ownFixtureValue(descriptor, "index0");
  if (isFixtureRecord(index0) && ownFixtureValue(index0, "structurallyInspectableSection") === true) {
    setFixturePath(
      root,
      ["sections", 0],
      structurallyInspectableSection(sources, index0, observations),
    );
  }
  if (ownFixtureValue(descriptor, "index1") === "throwing getter") {
    const sections = objectAt(root, ["sections"]);
    Object.defineProperty(sections, 1, {
      configurable: true,
      enumerable: true,
      get: descriptorCallback("getterCallbacks", observations),
    });
  }
  const lowerPriority = ownFixtureValue(descriptor, "lowerPriorityOversize");
  if (isFixtureRecord(lowerPriority)) {
    const eventCount = ownFixtureValue(lowerPriority, "eventsAcrossDocument");
    if (typeof eventCount === "number") {
      const measures = valueAtPath(root, ["sections", 0, "measures"]);
      if (!Array.isArray(measures)) throw new Error("F2_LOWER_PRIORITY_MEASURES");
      let eventIndex = 0;
      for (const measure of measures) {
        const events: unknown[] = [];
        while (eventIndex < eventCount && events.length < 8) {
          events.push(makeCountEvent(sources, eventIndex, observations));
          eventIndex += 1;
        }
        setFixturePath(measure, ["events"], events);
      }
      const customCount = ownFixtureValue(lowerPriority, "firstCustomPitchNameCount");
      if (typeof customCount === "number") {
        const event = valueAtPath(root, ["sections", 0, "measures", 0, "events", 0]);
        const wrapper = eventWrapper(event);
        applyActivation(sources, wrapper, "customChord-plus-manualVoicing", observations);
        setPitchCounts(valueAtPath(wrapper, EVENT_PATH), customCount, undefined);
      }
    }
  }
  const event0 = ownFixtureValue(descriptor, "event0");
  if (isFixtureRecord(event0)) {
    const event = valueAtPath(root, EVENT_PATH);
    const activation = ownFixtureValue(event0, "activation");
    const wrapper = eventWrapper(event);
    if (typeof activation === "string") applyActivation(sources, wrapper, activation, observations);
    const activatedEvent = valueAtPath(wrapper, EVENT_PATH);
    setFixturePath(root, EVENT_PATH, activatedEvent);
    setPitchCounts(
      activatedEvent,
      typeof ownFixtureValue(event0, "customPitchNameCount") === "number"
        ? requireFixtureNumber(ownFixtureValue(event0, "customPitchNameCount"), "customPitchNameCount")
        : undefined,
      typeof ownFixtureValue(event0, "storedPitchCount") === "number"
        ? requireFixtureNumber(ownFixtureValue(event0, "storedPitchCount"), "storedPitchCount")
        : undefined,
    );
  }
  return root;
}

function depthInput(root: unknown, descriptor: FixtureRecord): unknown {
  const depth = requireFixtureNumber(
    ownFixtureValue(descriptor, "jsonNestingDepth"),
    "jsonNestingDepth",
  );
  attachDepthChain(root, depth);
  const sectionsCount = ownFixtureValue(descriptor, "sectionsCount");
  if (typeof sectionsCount === "number") {
    setFixturePath(root, ["sections"], Array.from({ length: sectionsCount }, () => ({})));
  }
  return root;
}

const DECODER_EVIDENCE_KEYS = Object.freeze([
  "bytesObserved",
  "maxDepthObserved",
  "recordsInspected",
  "arraysInspected",
  "scalarFieldsInspected",
  "descriptorReads",
  "arraySlotsRead",
  "collectionLengthsObserved",
  "sectionSlotsObserved",
  "maxMeasuresPerSectionObserved",
  "eventSlotsObserved",
  "maxPitchArraySlotsObserved",
  "sectionElementsSemanticallyDecoded",
  "measureElementsSemanticallyDecoded",
  "eventValuesSemanticallyDecoded",
  "pitchElementsSemanticallyDecoded",
  "sectionElementsCopied",
  "measureElementsCopied",
  "eventValuesCopied",
  "pitchElementsCopied",
  "candidateObjectsAllocated",
  "candidateArraysAllocated",
  "diagnosticCandidatesProduced",
  "idOccurrences",
  "idClusters",
  "idDuplicateWorkUnits",
  "timelineAdditions",
  "timelineTicksObserved",
] as const);

function evidenceSubset(...records: readonly FixtureRecord[]): FixtureRecord | undefined {
  const result: Record<string, unknown> = {};
  for (const record of records) {
    for (const key of DECODER_EVIDENCE_KEYS) {
      const value = ownFixtureValue(record, key);
      if (typeof value === "number") result[key] = value;
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function limitOptions(
  caseRecord: FixtureRecord,
  cell: FixtureRecord,
  label: string,
  fallbackIssues?: readonly ExpectedIssue[],
): AdversarialCellOptions {
  const expected = expectedFor(cell);
  const caseExpected = isFixtureRecord(ownFixtureValue(caseRecord, "expected"))
    ? requireFixtureRecord(ownFixtureValue(caseRecord, "expected"), "case expected")
    : caseRecord;
  const cellExpected = isFixtureRecord(ownFixtureValue(cell, "expected"))
    ? requireFixtureRecord(ownFixtureValue(cell, "expected"), "cell expected")
    : cell;
  const expectedEvidence = evidenceSubset(caseExpected, cellExpected);
  const selectedIssues = expected.issues ?? fallbackIssues;
  return {
    expectedOk: selectedIssues === undefined ? expected.ok : false,
    ...(selectedIssues === undefined ? {} : { expectedIssues: selectedIssues }),
    ...(expectedEvidence === undefined ? {} : { expectedEvidence }),
    label,
  };
}

function expandByteLimits(
  sources: AdversarialSources,
  cases: ReadonlyMap<string, FixtureRecord>,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  const limitOne = requireCase(cases, "F2-LIMIT-001");
  for (const [index, cellValue] of requireFixtureArray(ownFixtureValue(limitOne, "cells"), "cells").entries()) {
    const cell = requireFixtureRecord(cellValue, "byte limit cell");
    result.push(makeCell(sources, "F2-LIMIT-001", index, () =>
      ownFixtureValue(cell, "input"), {
      operation: "preflightDocumentImportBytes",
      expectedOk: true,
      label: requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"),
    }));
  }
  const limitTwo = requireCase(cases, "F2-LIMIT-002");
  const limitTwoExpected = requireFixtureRecord(
    ownFixtureValue(limitTwo, "expected"),
    "limit two expected",
  );
  result.push(makeCell(sources, "F2-LIMIT-002", 0, () =>
    ownFixtureValue(limitTwo, "input"), {
    operation: "preflightDocumentImportBytes",
    expectedOk: false,
    expectedIssues: requiredIssues(limitTwoExpected, "F2-LIMIT-002"),
    expectedEvidence: evidenceSubset(limitTwoExpected) ?? {},
  }));
  return result;
}

function expandDepthLimits(
  sources: AdversarialSources,
  cases: ReadonlyMap<string, FixtureRecord>,
): readonly MaterializedFixtureCell[] {
  const caseRecord = requireCase(cases, "F2-LIMIT-004");
  const fallback = issue("limit.json_depth_exceeded", []);
  return requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells")
    .map((cellValue, index) => {
      const cell = requireFixtureRecord(cellValue, "depth limit cell");
      return makeCell(sources, "F2-LIMIT-004", index, (root) =>
        depthInput(
          root,
          requireFixtureRecord(ownFixtureValue(cell, "inputDescriptor"), "inputDescriptor"),
        ), limitOptions(
        caseRecord,
        cell,
        requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"),
        fallback,
      ));
    });
}

function expandSingularShapeCount(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = requireFixtureString(ownFixtureValue(caseRecord, "id"), "case.id");
  const descriptor = requireFixtureRecord(
    ownFixtureValue(caseRecord, "inputDescriptor"),
    "inputDescriptor",
  );
  return [makeCell(sources, caseId, 0, (root, observations) =>
    applyShapeCount(sources, root, descriptor, observations),
  limitOptions(caseRecord, caseRecord, caseId))];
}

function expandShapeCountList(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
  fallbackIssues?: readonly ExpectedIssue[],
): readonly MaterializedFixtureCell[] {
  const caseId = requireFixtureString(ownFixtureValue(caseRecord, "id"), "case.id");
  return requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells")
    .map((cellValue, index) => {
      const cell = requireFixtureRecord(cellValue, "shape-count cell");
      const id = requireFixtureString(ownFixtureValue(cell, "id"), "cell.id");
      return makeCell(sources, caseId, index, (root, observations) =>
        applyShapeCount(
          sources,
          root,
          requireFixtureRecord(ownFixtureValue(cell, "inputDescriptor"), "inputDescriptor"),
          observations,
        ), limitOptions(caseRecord, cell, id, fallbackIssues));
    });
}

function pitchCollectionPath(collection: string): FixturePath {
  if (collection === "chord.pitchNames") return [...EVENT_PATH, "chord", "pitchNames"];
  return [...EVENT_PATH, "voicing", "pitches"];
}

function materializePitchCollection(
  sources: AdversarialSources,
  root: unknown,
  collection: string,
  count: number,
  observations: HarnessObservationCounters,
): unknown {
  const activation = collection === "chord.pitchNames"
    ? "customChord-plus-manualVoicing"
    : collection === "manual.pitches"
    ? "manualVoicing"
    : "frozenVoicing";
  applyActivation(sources, root, activation, observations);
  setFixturePath(root, [...EVENT_PATH, "chord", "bass"], null);
  if (collection !== "chord.pitchNames") {
    setFixturePath(root, [...EVENT_PATH, "voicing", "bassPolicy"], "included");
  }
  const values = Array.from({ length: count }, (_unused, index) =>
    collection === "chord.pitchNames"
      ? pitchClassAt(index)
      : collection === "manual.pitches"
      ? manualPitchAt(index)
      : frozenPitchAt(index));
  setFixturePath(root, pitchCollectionPath(collection), values);
  return root;
}

function successfulPitchEvidence(collection: string, count: number): FixtureRecord {
  const decoded = collection === "chord.pitchNames" ? count + 3 : count;
  return {
    pitchElementsSemanticallyDecoded: decoded,
    pitchElementsCopied: decoded,
  };
}

function fatalPitchEvidence(): FixtureRecord {
  return {
    pitchElementsSemanticallyDecoded: 0,
    pitchElementsCopied: 0,
    candidateObjectsAllocated: 0,
    candidateArraysAllocated: 0,
  };
}

function applyEventSpecToRoot(
  sources: AdversarialSources,
  root: unknown,
  spec: FixtureRecord,
  observations: HarnessObservationCounters,
): unknown {
  const event = eventFromLimitSpec(sources, spec, 0, observations);
  setFixturePath(root, EVENT_PATH, event);
  return root;
}

function expandPitchLimits(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-LIMIT-011";
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const collectionValue of requireFixtureArray(
    ownFixtureValue(caseRecord, "collections"),
    "collections",
  )) {
    const collection = requireFixtureString(collectionValue, "collection");
    for (const countValue of requireFixtureArray(ownFixtureValue(caseRecord, "counts"), "counts")) {
      const count = requireFixtureNumber(countValue, "count");
      const path = pitchCollectionPath(collection);
      result.push(makeCell(sources, caseId, index, (root, observations) =>
        materializePitchCollection(sources, root, collection, count, observations), {
        expectedOk: count !== 17,
        ...(count === 17
          ? {
            expectedIssues: issue("limit.voicing_notes_exceeded", path),
            expectedEvidence: fatalPitchEvidence(),
          }
          : { expectedEvidence: successfulPitchEvidence(collection, count) }),
        label: `${collection}:${String(count)}`,
      }));
      index += 1;
    }
  }
  const combined = requireFixtureRecord(
    ownFixtureValue(caseRecord, "combinedOversizeCell"),
    "combinedOversizeCell",
  );
  result.push(makeCell(sources, caseId, index, (root, observations) => {
    applyActivation(
      sources,
      root,
      requireFixtureString(ownFixtureValue(combined, "activation"), "activation"),
      observations,
    );
    setPitchCounts(
      valueAtPath(root, EVENT_PATH),
      requireFixtureNumber(ownFixtureValue(combined, "customPitchNameCount"), "custom count"),
      requireFixtureNumber(ownFixtureValue(combined, "storedPitchCount"), "stored count"),
    );
    return root;
  }, {
    expectedOk: false,
    expectedIssues: requiredIssues(
      requireFixtureRecord(ownFixtureValue(combined, "expected"), "combined expected"),
      "F2-LIMIT-011 combined",
    ),
    expectedEvidence: fatalPitchEvidence(),
    label: "combined",
  }));
  index += 1;
  for (const source of ["preflightBeforeSemanticCells", "crossSiblingReachabilityCells"] as const) {
    for (const cellValue of requireFixtureArray(ownFixtureValue(caseRecord, source), source)) {
      const cell = requireFixtureRecord(cellValue, source);
      const eventSpec = requireFixtureRecord(ownFixtureValue(cell, "event"), "event spec");
      result.push(makeCell(sources, caseId, index, (root, observations) =>
        applyEventSpecToRoot(sources, root, eventSpec, observations), {
        expectedOk: false,
        expectedIssues: requiredIssues(
          requireFixtureRecord(ownFixtureValue(cell, "expected"), "expected"),
          `${caseId}:${String(ownFixtureValue(cell, "id"))}`,
        ),
        expectedEvidence: fatalPitchEvidence(),
        label: requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"),
      }));
      index += 1;
    }
  }
  for (const cellValue of requireFixtureArray(
    ownFixtureValue(caseRecord, "continuationCells"),
    "continuationCells",
  )) {
    const cell = requireFixtureRecord(cellValue, "continuation cell");
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      const sectionsValue = ownFixtureValue(cell, "sections");
      if (Array.isArray(sectionsValue)) {
        setFixturePath(
          root,
          ["sections"],
          buildSectionsFromDescriptor(sources, sectionsValue, observations),
        );
      } else {
        const specs = requireFixtureArray(ownFixtureValue(cell, "events"), "events");
        const events = specs.map((spec, eventIndex) =>
          eventFromLimitSpec(sources, spec, eventIndex, observations));
        setFixturePath(root, [...MEASURE_PATH, "events"], events);
      }
      return root;
    }, {
      expectedOk: false,
      expectedIssues: requiredIssues(
        requireFixtureRecord(ownFixtureValue(cell, "expected"), "expected"),
        `${caseId}:${String(ownFixtureValue(cell, "id"))}`,
      ),
      expectedEvidence: fatalPitchEvidence(),
      label: requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"),
    }));
    index += 1;
  }
  return result;
}

function expandLimits(
  sources: AdversarialSources,
  cases: ReadonlyMap<string, FixtureRecord>,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  result.push(...expandByteLimits(sources, cases));
  result.push(...expandDepthLimits(sources, cases));
  for (const id of ["F2-LIMIT-005", "F2-LIMIT-006", "F2-LIMIT-007", "F2-LIMIT-009"] as const) {
    result.push(...expandSingularShapeCount(sources, requireCase(cases, id)));
  }
  result.push(...expandShapeCountList(
    sources,
    requireCase(cases, "F2-LIMIT-008"),
  ));
  result.push(...expandShapeCountList(
    sources,
    requireCase(cases, "F2-LIMIT-010"),
    issue("limit.events_per_document_exceeded", ["sections"]),
  ));
  result.push(...expandPitchLimits(sources, requireCase(cases, "F2-LIMIT-011")));
  return result;
}

function expandOrderOne(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const summary = requireFixtureRecord(ownFixtureValue(caseRecord, "inputSummary"), "inputSummary");
  return [makeCell(sources, "F2-ORDER-001", 0, (root, observations) => {
    setFixturePath(
      root,
      ["title"],
      materializeFixtureValue(ownFixtureValue(summary, "titleDescriptor"), observations),
    );
    setFixturePath(root, ["tempoBpm"], ownFixtureValue(summary, "tempoBpm"));
    setFixturePath(root, ["sections", 0, "id"], ownFixtureValue(summary, "section0Id"));
    setFixturePath(root, [...EVENT_PATH, "id"], ownFixtureValue(summary, "event0Id"));
    setFixturePath(
      root,
      [...EVENT_PATH, "duration"],
      materializeFixtureValue(ownFixtureValue(summary, "event0Duration"), observations),
    );
    return root;
  }, optionsFor(caseRecord))];
}

function expandOrderTwo(
  sources: AdversarialSources,
): readonly MaterializedFixtureCell[] {
  const expected: ExpectedIssue[] = [2, 10].map((eventIndex) => ({
    code: "beat.duration_not_positive",
    path: ["sections", 0, "measures", 0, "events", eventIndex, "duration", "numerator"],
  }));
  return [makeCell(sources, "F2-ORDER-002", 0, (root, observations) => {
    const events = Array.from({ length: 11 }, (_unused, index) => {
      const event = makeCountEvent(sources, index, observations);
      setFixturePath(event, ["id"], `event-order-${String(index)}`);
      return event;
    });
    for (const index of [10, 2]) {
      const event = events[index];
      if (event === undefined) throw new Error("F2_ORDER_EVENT_INDEX");
      setFixturePath(event, ["duration"], { numerator: 0, denominator: 1 });
    }
    setFixturePath(root, [...MEASURE_PATH, "events"], events);
    return root;
  }, { expectedOk: false, expectedIssues: expected })];
}

function expandOrderThree(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const descriptor = requireFixtureRecord(ownFixtureValue(caseRecord, "inputDescriptor"), "inputDescriptor");
  return [makeCell(sources, "F2-ORDER-003", 0, (root) => {
    const field = requireFixtureString(ownFixtureValue(descriptor, "field"), "field");
    const count = requireFixtureNumber(ownFixtureValue(descriptor, "count"), "count");
    setFixturePath(root, [field], " ".repeat(count));
    return root;
  }, optionsFor(caseRecord))];
}

function expandOrderFour(
  sources: AdversarialSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  const permutationIssues = ["alpha", "mu", "zeta"].map((key) => ({
    code: "shape.unknown_field",
    path: [key],
  }));
  for (const cellValue of requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells")) {
    const cell = requireFixtureRecord(cellValue, "order permutation cell");
    result.push(makeCell(sources, "F2-ORDER-004", index, (root) => {
      for (const key of requireFixtureArray(ownFixtureValue(cell, "insertionOrder"), "insertionOrder")) {
        defineData(
          requireFixtureRecord(root, "root"),
          requireFixtureString(key, "unknown key"),
          true,
        );
      }
      return root;
    }, {
      expectedOk: false,
      expectedIssues: permutationIssues,
      label: requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"),
    }));
    index += 1;
  }
  for (const cellValue of requireFixtureArray(
    ownFixtureValue(caseRecord, "comparatorCells"),
    "comparatorCells",
  )) {
    const cell = requireFixtureRecord(cellValue, "comparator cell");
    result.push(makeCell(sources, "F2-ORDER-004", index, (root) => {
      const rootKeys = ownFixtureValue(cell, "rootUnknownKeysInInsertionOrder");
      if (Array.isArray(rootKeys)) {
        for (const key of rootKeys) {
          defineData(requireFixtureRecord(root, "root"), requireFixtureString(key, "root key"), true);
        }
      }
      const arraySpec = ownFixtureValue(cell, "sectionsArray");
      if (isFixtureRecord(arraySpec)) {
        const array = ownFixtureValue(arraySpec, "cloneRepresentative") === true
          ? materializeFixtureValue(valueAtPath(root, ["sections"]))
          : new Array<unknown>(
            requireFixtureNumber(ownFixtureValue(arraySpec, "length"), "array length"),
          );
        if (!Array.isArray(array)) throw new Error("F2_ORDER_ARRAY");
        const symbolEntries = ownFixtureValue(arraySpec, "symbolEntries");
        if (Array.isArray(symbolEntries)) {
          for (const entryValue of symbolEntries) {
            const entry = requireFixtureRecord(entryValue, "symbol entry");
            defineData(array, Symbol(requireFixtureString(
              ownFixtureValue(entry, "description"),
              "symbol description",
            )), true);
          }
        }
        const strings = ownFixtureValue(arraySpec, "extraStringEntries");
        if (Array.isArray(strings)) {
          for (const entryValue of strings) {
            const entry = requireFixtureRecord(entryValue, "string entry");
            defineData(
              array,
              requireFixtureString(ownFixtureValue(entry, "key"), "entry.key"),
              ownFixtureValue(entry, "value"),
            );
          }
        }
        setFixturePath(root, ["sections"], array);
      }
      return root;
    }, optionsFor(cell, requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"))));
    index += 1;
  }
  return result;
}

function expandOrders(
  sources: AdversarialSources,
  cases: ReadonlyMap<string, FixtureRecord>,
): readonly MaterializedFixtureCell[] {
  return [
    ...expandOrderOne(sources, requireCase(cases, "F2-ORDER-001")),
    ...expandOrderTwo(sources),
    ...expandOrderThree(sources, requireCase(cases, "F2-ORDER-003")),
    ...expandOrderFour(sources, requireCase(cases, "F2-ORDER-004")),
  ];
}

function expandCounterGoldens(
  sources: AdversarialSources,
  cases: ReadonlyMap<string, FixtureRecord>,
): readonly MaterializedFixtureCell[] {
  const work = requireCase(cases, "F2-WORK-001");
  const zero = requireFixtureRecord(ownFixtureValue(work, "zeroDecoderEvidence"), "zero evidence");
  return requireFixtureArray(ownFixtureValue(work, "counterGoldenCells"), "counterGoldenCells")
    .map((cellValue, index) => {
      const cell = requireFixtureRecord(cellValue, "counter golden");
      const id = requireFixtureString(ownFixtureValue(cell, "id"), "counter golden id");
      const privateOperation = requireFixtureString(
        ownFixtureValue(cell, "operation"),
        "counter operation",
      );
      const operation: FixtureOperation = privateOperation.startsWith("preflight")
        ? "preflightDocumentImportBytes"
        : "decodeDocumentShape";
      const directEvidence = ownFixtureValue(cell, "expectedDecoderEvidence");
      let expectedEvidence: FixtureRecord;
      if (isFixtureRecord(directEvidence)) {
        expectedEvidence = requireFixtureRecord(directEvidence, "expected evidence");
      } else {
        const merged: Record<string, unknown> = { ...zero };
        const overrides = requireFixtureRecord(
          ownFixtureValue(cell, "expectedDecoderEvidenceOverrides"),
          "evidence overrides",
        );
        for (const [key, value] of Object.entries(overrides)) merged[key] = value;
        expectedEvidence = merged;
      }
      const expectedResult = requireFixtureRecord(
        ownFixtureValue(cell, "expectedResult"),
        "expected result",
      );
      const issues = expectedIssuesFrom(expectedResult);
      return makeCell(sources, "F2-WORK-001", index, (_root, observations) =>
        operation === "preflightDocumentImportBytes"
          ? ownFixtureValue(cell, "input")
          : freshRepresentative(sources, observations), {
        operation,
        expectedOk: issues === undefined,
        ...(issues === undefined ? {} : { expectedIssues: issues }),
        expectedEvidence,
        label: id,
      });
    });
}

export function materializeF2AdversarialCases(
  adversarialValue: unknown,
  shapeValue: unknown,
): readonly MaterializedFixtureCell[] {
  const sources = sourcesFrom(adversarialValue, shapeValue);
  const cases = caseMap(sources);
  return [
    ...expandBoundary(sources, requireCase(cases, "F2-BOUNDARY-001")),
    ...expandFreshness(sources, requireCase(cases, "F2-FRESH-001")),
    ...expandHostOne(sources, requireCase(cases, "F2-HOST-001")),
    ...expandHostTwo(sources, requireCase(cases, "F2-HOST-002")),
    ...expandHostThree(sources, requireCase(cases, "F2-HOST-003")),
    ...expandHostFour(sources, requireCase(cases, "F2-HOST-004")),
    ...expandHostFive(sources, requireCase(cases, "F2-HOST-005")),
    ...expandHostSix(sources, requireCase(cases, "F2-HOST-006")),
    ...expandHostSeven(sources, requireCase(cases, "F2-HOST-007")),
    ...expandHostEight(sources, requireCase(cases, "F2-HOST-008")),
    ...expandHostNine(sources, requireCase(cases, "F2-HOST-009")),
    ...expandHostTen(sources),
    ...expandLimits(sources, cases),
    ...expandOrders(sources, cases),
  ];
}

export function materializeF2CounterGoldenCases(
  adversarialValue: unknown,
  shapeValue: unknown,
): readonly MaterializedFixtureCell[] {
  const sources = sourcesFrom(adversarialValue, shapeValue);
  return expandCounterGoldens(sources, caseMap(sources));
}
