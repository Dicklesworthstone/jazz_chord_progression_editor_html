export type FixturePathSegment = string | number;
export type FixturePath = readonly FixturePathSegment[];

export type FixtureRecord = Readonly<Record<string, unknown>>;

export type HarnessObservationCounters = {
  getterCallbacks: number;
  propertyGetCallbacks: number;
  prototypeCallbacks: number;
  iteratorCallbacks: number;
  toJSONCallbacks: number;
  sourceMutations: number;
  stateWrites: number;
};

export type ExpectedIssue = Readonly<{
  code: string;
  path: FixturePath;
}>;

export type FixtureOperation =
  | "decodeDocumentShape"
  | "preflightDocumentImportBytes";

export type MaterializedFixtureCell = Readonly<{
  caseId: string;
  cellId: string;
  operation: FixtureOperation;
  createInput: () => Readonly<{
    input: unknown;
    observations: HarnessObservationCounters;
  }>;
  expectedIssues?: readonly ExpectedIssue[];
  expectedOk?: boolean;
  expectedEvidence?: FixtureRecord;
  depthOnly?: boolean;
  verify?: (input: unknown, result: unknown) => void;
}>;

const SPECIAL_STRING_VALUES = Object.freeze({
  "lone-high-surrogate": "\ud800",
  "lone-low-surrogate": "\udc00",
  "nfc-e-acute": "\u00e9",
  "nfd-e-acute": "e\u0301",
  "astral-g-clef": "\ud834\udd1e",
  nul: "\u0000",
});

export function createHarnessObservations(): HarnessObservationCounters {
  return {
    getterCallbacks: 0,
    propertyGetCallbacks: 0,
    prototypeCallbacks: 0,
    iteratorCallbacks: 0,
    toJSONCallbacks: 0,
    sourceMutations: 0,
    stateWrites: 0,
  };
}

export function isFixtureRecord(value: unknown): value is FixtureRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireFixtureRecord(
  value: unknown,
  label: string,
): FixtureRecord {
  if (!isFixtureRecord(value)) {
    throw new Error(`F2_FIXTURE_RECORD:${label}`);
  }
  return value;
}

export function requireFixtureArray(
  value: unknown,
  label: string,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`F2_FIXTURE_ARRAY:${label}`);
  }
  return value;
}

export function requireFixtureString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`F2_FIXTURE_STRING:${label}`);
  }
  return value;
}

export function requireFixtureNumber(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`F2_FIXTURE_NUMBER:${label}`);
  }
  return value;
}

export function requireFixtureBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`F2_FIXTURE_BOOLEAN:${label}`);
  }
  return value;
}

export function optionalFixtureString(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireFixtureString(value, label);
}

export function fixturePath(value: unknown, label: string): FixturePath {
  return requireFixtureArray(value, label).map((segment, index) => {
    if (typeof segment !== "string" && typeof segment !== "number") {
      throw new Error(`F2_FIXTURE_PATH:${label}:${String(index)}`);
    }
    return segment;
  });
}

function ownValue(record: FixtureRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function oneOwnKey(record: FixtureRecord): string | undefined {
  const keys = Object.keys(record);
  return keys.length === 1 ? keys[0] : undefined;
}

function repeatedCodePoint(descriptor: FixtureRecord): string | undefined {
  const value = ownValue(descriptor, "repeatCodePoint");
  const count = ownValue(descriptor, "count");
  if (typeof value !== "string" || typeof count !== "number") return undefined;
  const codePoint = value.startsWith("U+")
    ? Number.parseInt(value.slice(2), 16)
    : value.codePointAt(0);
  if (codePoint === undefined || !Number.isInteger(codePoint)) {
    throw new Error("F2_FIXTURE_CODE_POINT");
  }
  return String.fromCodePoint(codePoint).repeat(count);
}

function specialPrimitive(
  name: string,
  observations: HarnessObservationCounters,
): unknown {
  switch (name) {
    case "undefined":
      return undefined;
    case "bigint-one":
      return 1n;
    case "symbol-test":
      return Symbol("test");
    case "callable-function":
      return function fixtureCallable(): void {
        observations.stateWrites += 1;
      };
    case "boxed-number":
      return new Number(1);
    case "boxed-string":
      return new String("boxed");
    case "boxed-boolean":
      return new Boolean(true);
    case "boxed-bigint":
      return Object(1n);
    case "boxed-symbol":
      return Object(Symbol("boxed"));
    default:
      throw new Error(`F2_FIXTURE_SPECIAL_PRIMITIVE:${name}`);
  }
}

function specialNumber(name: string): number {
  switch (name) {
    case "NaN":
      return Number.NaN;
    case "+Infinity":
      return Number.POSITIVE_INFINITY;
    case "-Infinity":
      return Number.NEGATIVE_INFINITY;
    case "-0":
      return -0;
    case "unsafe-positive":
      return 9_007_199_254_740_992;
    case "unsafe-negative":
      return -9_007_199_254_740_992;
    default:
      throw new Error(`F2_FIXTURE_SPECIAL_NUMBER:${name}`);
  }
}

function materializeStringSegment(
  value: unknown,
  observations: HarnessObservationCounters,
): string {
  if (typeof value === "string") return value;
  const materialized = materializeFixtureValue(value, observations);
  if (typeof materialized !== "string") {
    throw new Error("F2_FIXTURE_STRING_SEGMENT");
  }
  return materialized;
}

function defineData(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

export function materializeFixtureValue(
  value: unknown,
  observations: HarnessObservationCounters = createHarnessObservations(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => materializeFixtureValue(entry, observations));
  }
  if (!isFixtureRecord(value)) return value;

  const key = oneOwnKey(value);
  if (key === "specialString") {
    const name = requireFixtureString(ownValue(value, key), key);
    if (!Object.hasOwn(SPECIAL_STRING_VALUES, name)) {
      throw new Error(`F2_FIXTURE_SPECIAL_STRING:${name}`);
    }
    return Reflect.get(SPECIAL_STRING_VALUES, name) as string;
  }
  if (key === "specialNumber") {
    return specialNumber(requireFixtureString(ownValue(value, key), key));
  }
  if (key === "specialPrimitive") {
    return specialPrimitive(
      requireFixtureString(ownValue(value, key), key),
      observations,
    );
  }
  if (key === "specialValue") {
    return specialPrimitive(
      requireFixtureString(ownValue(value, key), key),
      observations,
    );
  }
  if (ownValue(value, "repeatAscii") !== undefined) {
    const character = requireFixtureString(
      ownValue(value, "repeatAscii"),
      "repeatAscii",
    );
    return character.repeat(
      requireFixtureNumber(ownValue(value, "count"), "repeatAscii.count"),
    );
  }
  if (ownValue(value, "repeatCodePoint") !== undefined) {
    const result = repeatedCodePoint(value);
    if (result !== undefined) return result;
  }
  if (key === "stringSegments") {
    return requireFixtureArray(ownValue(value, key), key)
      .map((segment) => materializeStringSegment(segment, observations))
      .join("");
  }
  if (key === "repeatLiteralArray") {
    const repetition = requireFixtureRecord(ownValue(value, key), key);
    const count = requireFixtureNumber(ownValue(repetition, "count"), `${key}.count`);
    const repeatedValue = ownValue(repetition, "value");
    return Array.from(
      { length: count },
      () => materializeFixtureValue(repeatedValue, observations),
    );
  }
  if (ownValue(value, "instrumentedCallback") !== undefined) {
    const counter = requireFixtureString(
      ownValue(value, "instrumentedCallback"),
      "instrumentedCallback",
    );
    return function instrumentedFixtureCallback(): never {
      const previous = observations[
        counter as keyof HarnessObservationCounters
      ];
      if (typeof previous === "number") {
        observations[counter as keyof HarnessObservationCounters] = previous + 1;
      }
      throw new Error("F2_INSTRUMENTED_CALLBACK_INVOKED");
    };
  }

  const result: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    defineData(result, field, materializeFixtureValue(fieldValue, observations));
  }
  return result;
}

function getOwnDataValue(container: unknown, key: FixturePathSegment): unknown {
  if ((typeof container !== "object" || container === null) &&
      typeof container !== "function") {
    throw new Error(`F2_FIXTURE_PATH_CONTAINER:${String(key)}`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error(`F2_FIXTURE_PATH_MISSING:${String(key)}`);
  }
  return descriptor.value;
}

export function valueAtPath(root: unknown, path: FixturePath): unknown {
  let current = root;
  for (const segment of path) current = getOwnDataValue(current, segment);
  return current;
}

function parentAtPath(
  root: unknown,
  path: FixturePath,
): Readonly<{ parent: object; key: FixturePathSegment }> {
  if (path.length === 0) throw new Error("F2_FIXTURE_ROOT_MUTATION");
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (segment === undefined) throw new Error("F2_FIXTURE_PATH_INDEX");
    current = getOwnDataValue(current, segment);
  }
  const key = path[path.length - 1];
  if (key === undefined ||
      ((typeof current !== "object" || current === null) &&
       typeof current !== "function")) {
    throw new Error("F2_FIXTURE_PATH_PARENT");
  }
  return { parent: current, key };
}

export function setFixturePath(
  root: unknown,
  path: FixturePath,
  value: unknown,
): void {
  const { parent, key } = parentAtPath(root, path);
  defineData(parent, key, value);
}

export function deleteFixturePath(root: unknown, path: FixturePath): void {
  const { parent, key } = parentAtPath(root, path);
  if (!Reflect.deleteProperty(parent, key)) {
    throw new Error(`F2_FIXTURE_DELETE:${String(key)}`);
  }
}

export function applyFixtureMutation(
  root: unknown,
  mutationValue: unknown,
  observations: HarnessObservationCounters,
  fragments: FixtureRecord,
): void {
  const mutation = requireFixtureRecord(mutationValue, "mutation");
  const operation = requireFixtureString(ownValue(mutation, "operation"), "operation");
  const path = fixturePath(ownValue(mutation, "path"), "mutation.path");
  if (operation === "delete") {
    deleteFixturePath(root, path);
    return;
  }
  if (operation === "setFragment") {
    const fragmentName = requireFixtureString(
      ownValue(mutation, "fragment"),
      "mutation.fragment",
    );
    setFixturePath(
      root,
      path,
      materializeFixtureValue(ownValue(fragments, fragmentName), observations),
    );
    return;
  }
  if (operation === "set" || operation === "add") {
    setFixturePath(
      root,
      path,
      materializeFixtureValue(ownValue(mutation, "value"), observations),
    );
    return;
  }
  throw new Error(`F2_FIXTURE_MUTATION:${operation}`);
}

export function applyFixtureMutations(
  root: unknown,
  mutations: unknown,
  observations: HarnessObservationCounters,
  fragments: FixtureRecord,
): void {
  for (const mutation of requireFixtureArray(mutations, "mutations")) {
    applyFixtureMutation(root, mutation, observations, fragments);
  }
}

export function applyFixtureActivation(
  root: unknown,
  activationName: string | undefined,
  observations: HarnessObservationCounters,
  activationProtocol: FixtureRecord,
  fragments: FixtureRecord,
): void {
  if (activationName === undefined) return;
  const activation = ownValue(activationProtocol, activationName);
  for (const mutation of requireFixtureArray(
    activation,
    `activation:${activationName}`,
  )) {
    applyFixtureMutation(root, mutation, observations, fragments);
  }
}

export function expectedIssuesFrom(value: unknown): readonly ExpectedIssue[] | undefined {
  if (!isFixtureRecord(value)) return undefined;
  const expected = isFixtureRecord(ownValue(value, "expected"))
    ? requireFixtureRecord(ownValue(value, "expected"), "cell.expected")
    : value;
  const issues = ownValue(expected, "issues");
  if (Array.isArray(issues)) {
    return issues.map((issueValue, index) => {
      const issue = requireFixtureRecord(issueValue, `issue:${String(index)}`);
      return {
        code: requireFixtureString(
          ownValue(issue, "code"),
          `issue:${String(index)}.code`,
        ),
        path: fixturePath(
          ownValue(issue, "path"),
          `issue:${String(index)}.path`,
        ),
      };
    });
  }
  const code = ownValue(expected, "code");
  const path = ownValue(expected, "path");
  if (typeof code === "string" && Array.isArray(path)) {
    return [{ code, path: fixturePath(path, "expected.path") }];
  }
  return undefined;
}

export function expectedOkFrom(value: unknown): boolean | undefined {
  if (!isFixtureRecord(value)) return undefined;
  const expected = isFixtureRecord(ownValue(value, "expected"))
    ? requireFixtureRecord(ownValue(value, "expected"), "cell.expected")
    : value;
  const ok = ownValue(expected, "ok");
  if (typeof ok === "boolean") return ok;
  if (ownValue(expected, "issues") !== undefined ||
      typeof ownValue(expected, "code") === "string") return false;
  if (expected === value && ownValue(value, "expected") === "ok") return true;
  return undefined;
}

export function deepFreezeFixture<Value>(value: Value): Value {
  const visited = new Set<object>();
  const stack: object[] = [];
  if (typeof value === "object" && value !== null) stack.push(value);
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      const child: unknown = descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
      if (typeof child === "object" && child !== null) {
        stack.push(child);
      }
    }
    Object.freeze(current);
  }
  return value;
}

export function recursivelyWriteTrapInput(
  value: unknown,
  observations: HarnessObservationCounters,
): unknown {
  const visited = new Map<object, object>();
  const wrap = (candidate: unknown): unknown => {
    if (typeof candidate !== "object" || candidate === null) return candidate;
    const known = visited.get(candidate);
    if (known !== undefined) return known;
    for (const key of Reflect.ownKeys(candidate)) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor !== undefined && "value" in descriptor) {
        Object.defineProperty(candidate, key, {
          ...descriptor,
          value: wrap(descriptor.value),
        });
      }
    }
    const proxy = new Proxy(candidate, {
      defineProperty: () => {
        observations.sourceMutations += 1;
        throw new Error("F2_SOURCE_DEFINE_PROPERTY");
      },
      deleteProperty: () => {
        observations.sourceMutations += 1;
        throw new Error("F2_SOURCE_DELETE_PROPERTY");
      },
      get: () => {
        observations.propertyGetCallbacks += 1;
        throw new Error("F2_SOURCE_PROPERTY_GET");
      },
      getOwnPropertyDescriptor: (target, key) =>
        Reflect.getOwnPropertyDescriptor(target, key),
      getPrototypeOf: () => {
        observations.prototypeCallbacks += 1;
        throw new Error("F2_SOURCE_PROTOTYPE_GET");
      },
      ownKeys: (target) => Reflect.ownKeys(target),
      set: () => {
        observations.sourceMutations += 1;
        throw new Error("F2_SOURCE_SET");
      },
      setPrototypeOf: () => {
        observations.sourceMutations += 1;
        throw new Error("F2_SOURCE_SET_PROTOTYPE");
      },
    });
    visited.set(candidate, proxy);
    return proxy;
  };
  return wrap(value);
}

export function isRecursivelyFrozen(value: unknown): boolean {
  const visited = new Set<object>();
  const stack: object[] = [];
  if (typeof value === "object" && value !== null) stack.push(value);
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    if (!Object.isFrozen(current)) return false;
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      const child: unknown = descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
      if (typeof child === "object" && child !== null) {
        stack.push(child);
      }
    }
  }
  return true;
}

export function collectContainerIdentities(value: unknown): ReadonlySet<object> {
  const result = new Set<object>();
  const stack: object[] = [];
  if (typeof value === "object" && value !== null) stack.push(value);
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || result.has(current)) continue;
    result.add(current);
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      const child: unknown = descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
      if (typeof child === "object" && child !== null) {
        stack.push(child);
      }
    }
  }
  return result;
}

export function hasContainerIdentityOverlap(
  left: unknown,
  right: unknown,
): boolean {
  const leftContainers = collectContainerIdentities(left);
  for (const container of collectContainerIdentities(right)) {
    if (leftContainers.has(container)) return true;
  }
  return false;
}

export function descriptorTreeEqual(left: unknown, right: unknown): boolean {
  const seen = new Map<object, object>();
  const compare = (leftValue: unknown, rightValue: unknown): boolean => {
    if (Object.is(leftValue, rightValue)) return true;
    if (typeof leftValue !== "object" || leftValue === null ||
        typeof rightValue !== "object" || rightValue === null) return false;
    const known = seen.get(leftValue);
    if (known !== undefined) return known === rightValue;
    seen.set(leftValue, rightValue);
    const leftKeys = Reflect.ownKeys(leftValue);
    const rightKeys = Reflect.ownKeys(rightValue);
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const leftKey = leftKeys[index];
      const rightKey = rightKeys[index];
      if (leftKey === undefined || rightKey === undefined || leftKey !== rightKey) {
        return false;
      }
      const leftDescriptor = Object.getOwnPropertyDescriptor(leftValue, leftKey);
      const rightDescriptor = Object.getOwnPropertyDescriptor(rightValue, rightKey);
      if (leftDescriptor === undefined || rightDescriptor === undefined ||
          leftDescriptor.configurable !== rightDescriptor.configurable ||
          leftDescriptor.enumerable !== rightDescriptor.enumerable) return false;
      const leftData = "value" in leftDescriptor;
      const rightData = "value" in rightDescriptor;
      if (leftData !== rightData) return false;
      if (leftData && rightData) {
        if (leftDescriptor.writable !== rightDescriptor.writable ||
            !compare(leftDescriptor.value, rightDescriptor.value)) return false;
      } else if (!(leftData || rightData)) {
        if (leftDescriptor.get !== rightDescriptor.get ||
            leftDescriptor.set !== rightDescriptor.set) return false;
      }
    }
    return true;
  };
  return compare(left, right);
}

export function persistedDataEqual(left: unknown, right: unknown): boolean {
  const seen = new Map<object, Set<object>>();
  const compare = (leftValue: unknown, rightValue: unknown): boolean => {
    if (Object.is(leftValue, rightValue)) return true;
    if (typeof leftValue !== "object" || leftValue === null ||
        typeof rightValue !== "object" || rightValue === null) return false;
    const known = seen.get(leftValue);
    if (known?.has(rightValue) === true) return true;
    if (known === undefined) seen.set(leftValue, new Set([rightValue]));
    else known.add(rightValue);
    let leftArray: boolean;
    let rightArray: boolean;
    try {
      leftArray = Array.isArray(leftValue);
      rightArray = Array.isArray(rightValue);
    } catch {
      return false;
    }
    if (leftArray !== rightArray) return false;
    if (leftArray && rightArray) {
      const leftLength: unknown = Object.getOwnPropertyDescriptor(leftValue, "length")?.value;
      const rightLength: unknown = Object.getOwnPropertyDescriptor(rightValue, "length")?.value;
      if (leftLength !== rightLength || typeof leftLength !== "number") return false;
      for (let index = 0; index < leftLength; index += 1) {
        const leftDescriptor = Object.getOwnPropertyDescriptor(leftValue, index);
        const rightDescriptor = Object.getOwnPropertyDescriptor(rightValue, index);
        if (leftDescriptor === undefined || rightDescriptor === undefined ||
            !("value" in leftDescriptor) || !("value" in rightDescriptor) ||
            !compare(leftDescriptor.value, rightDescriptor.value)) return false;
      }
      return true;
    }
    let leftKeys: string[];
    let rightKeys: string[];
    try {
      leftKeys = Object.keys(leftValue).sort();
      rightKeys = Object.keys(rightValue).sort();
    } catch {
      return false;
    }
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const leftKey = leftKeys[index];
      const rightKey = rightKeys[index];
      if (leftKey === undefined || rightKey === undefined || leftKey !== rightKey) {
        return false;
      }
      let leftDescriptor: PropertyDescriptor | undefined;
      let rightDescriptor: PropertyDescriptor | undefined;
      try {
        leftDescriptor = Object.getOwnPropertyDescriptor(leftValue, leftKey);
        rightDescriptor = Object.getOwnPropertyDescriptor(rightValue, rightKey);
      } catch {
        return false;
      }
      if (leftDescriptor === undefined || rightDescriptor === undefined ||
          !("value" in leftDescriptor) || !("value" in rightDescriptor) ||
          !compare(leftDescriptor.value, rightDescriptor.value)) return false;
    }
    return true;
  };
  return compare(left, right);
}

export function cloneDescriptorTree(value: unknown): unknown {
  const seen = new Map<object, object>();
  const clone = (candidate: unknown): unknown => {
    if (typeof candidate !== "object" || candidate === null) return candidate;
    const known = seen.get(candidate);
    if (known !== undefined) return known;
    const result: object = Array.isArray(candidate) ? [] : {};
    seen.set(candidate, result);
    for (const key of Reflect.ownKeys(candidate)) {
      if (Array.isArray(candidate) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor === undefined) continue;
      Object.defineProperty(result, key, "value" in descriptor
        ? { ...descriptor, value: clone(descriptor.value) }
        : descriptor);
    }
    if (Array.isArray(candidate)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(candidate, "length");
      if (lengthDescriptor !== undefined) {
        Object.defineProperty(result, "length", lengthDescriptor);
      }
    }
    return result;
  };
  return clone(value);
}

export function acyclicDescriptorFingerprint(value: unknown): string {
  let hash = 2_166_136_261;
  let observations = 0;
  const feed = (textValue: string): void => {
    observations += 1;
    for (let index = 0; index < textValue.length; index += 1) {
      hash ^= textValue.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619) >>> 0;
    }
  };
  const visit = (candidate: unknown): void => {
    if (candidate === null) {
      feed("null");
      return;
    }
    if (typeof candidate !== "object" && typeof candidate !== "function") {
      if (typeof candidate === "number") {
        feed(Object.is(candidate, -0) ? "number:-0" : `number:${String(candidate)}`);
      } else if (typeof candidate === "symbol") {
        feed(`symbol:${String(candidate)}`);
      } else if (typeof candidate === "string") {
        feed(`string:${candidate}`);
      } else if (typeof candidate === "boolean") {
        feed(candidate ? "boolean:true" : "boolean:false");
      } else if (typeof candidate === "bigint") {
        feed(`bigint:${candidate.toString()}`);
      } else {
        feed("undefined");
      }
      return;
    }
    feed(Array.isArray(candidate) ? "array" : `record:${typeof candidate}`);
    for (const key of Reflect.ownKeys(candidate)) {
      feed(typeof key === "symbol" ? `key-symbol:${String(key)}` : `key:${key}`);
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor === undefined) {
        feed("missing-descriptor");
        continue;
      }
      feed(`flags:${descriptor.enumerable ? "1" : "0"}${descriptor.configurable ? "1" : "0"}`);
      if ("value" in descriptor) {
        feed(`data:${descriptor.writable ? "1" : "0"}`);
        const child: unknown = descriptor.value;
        visit(child);
      } else {
        const getterName = descriptor.get?.name ?? "undefined";
        const setterName = descriptor.set?.name ?? "undefined";
        feed(`accessor:${getterName}:${setterName}`);
      }
    }
  };
  visit(value);
  return `${String(observations)}:${hash.toString(16).padStart(8, "0")}`;
}

export function stableCellId(caseId: string, index: number, label?: string): string {
  return label === undefined
    ? `${caseId}#${String(index).padStart(4, "0")}`
    : `${caseId}#${String(index).padStart(4, "0")}:${label}`;
}

export function ownFixtureValue(record: FixtureRecord, key: string): unknown {
  return ownValue(record, key);
}
