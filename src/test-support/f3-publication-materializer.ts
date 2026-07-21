export type F3FixtureRecord = Record<string, unknown>;
export type F3FixturePath = readonly (string | number)[];

function isF3Record(value: unknown): value is F3FixtureRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireF3Record(
  value: unknown,
  label: string,
): F3FixtureRecord {
  if (!isF3Record(value)) {
    throw new Error(`F3_FIXTURE_RECORD:${label}`);
  }
  return value;
}

export function requireF3Array(
  value: unknown,
  label: string,
): unknown[] {
  if (!Array.isArray(value)) throw new Error(`F3_FIXTURE_ARRAY:${label}`);
  return value;
}

export function requireF3String(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`F3_FIXTURE_STRING:${label}`);
  }
  return value;
}

export function requireF3Number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`F3_FIXTURE_NUMBER:${label}`);
  }
  return value;
}

export function requireF3Path(
  value: unknown,
  label: string,
): F3FixturePath {
  if (
    !Array.isArray(value) ||
    !value.every(
      (segment) => typeof segment === "string" || typeof segment === "number",
    )
  ) {
    throw new Error(`F3_FIXTURE_PATH:${label}`);
  }
  return value;
}

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function parentAtPath(
  root: unknown,
  target: F3FixturePath,
): Readonly<{
  parent: F3FixtureRecord | unknown[];
  key: string | number;
}> {
  if (target.length === 0) throw new Error("F3_FIXTURE_ROOT_MUTATION");
  let current = root;
  for (let index = 0; index < target.length - 1; index += 1) {
    const segment = target[index];
    if (segment === undefined) throw new Error("F3_FIXTURE_PATH_INDEX");
    if (Array.isArray(current)) {
      if (typeof segment !== "number") {
        throw new Error("F3_FIXTURE_ARRAY_PATH");
      }
      current = current[segment];
    } else {
      current = requireF3Record(current, "path parent")[String(segment)];
    }
  }
  const key = target[target.length - 1];
  if (key === undefined) throw new Error("F3_FIXTURE_PATH_KEY");
  return {
    parent: Array.isArray(current)
      ? current
      : requireF3Record(current, "path target"),
    key,
  };
}

function applyOperation(root: unknown, value: unknown): void {
  const operation = requireF3Record(value, "operation");
  const operationName = requireF3String(operation["op"], "operation.op");
  const target = requireF3Path(operation["path"], "operation.path");
  const replacement = clone(operation["value"]);
  const { parent, key } = parentAtPath(root, target);

  if (operationName === "set") {
    if (!Reflect.set(parent, key, replacement)) {
      throw new Error("F3_FIXTURE_SET_FAILED");
    }
    return;
  }
  if (
    operationName === "insert" &&
    Array.isArray(parent) &&
    typeof key === "number"
  ) {
    parent.splice(key, 0, replacement);
    return;
  }
  throw new Error(`F3_FIXTURE_OPERATION:${operationName}`);
}

function sourceTemplate(
  fixtureValue: unknown,
  name: string,
): F3FixtureRecord {
  const fixture = requireF3Record(fixtureValue, "fixture");
  const templates = requireF3Record(fixture["templates"], "templates");
  return clone(requireF3Record(templates[name], `template:${name}`));
}

function seedParts(fixtureValue: unknown): Readonly<{
  root: F3FixtureRecord;
  section: F3FixtureRecord;
  measure: F3FixtureRecord;
  event: F3FixtureRecord;
}> {
  const root = sourceTemplate(fixtureValue, "representativeParsedAuto");
  const section = requireF3Record(
    requireF3Array(root["sections"], "sections")[0],
    "section",
  );
  const measure = requireF3Record(
    requireF3Array(section["measures"], "measures")[0],
    "measure",
  );
  const event = requireF3Record(
    requireF3Array(measure["events"], "events")[0],
    "event",
  );
  return { root, section, measure, event };
}

function maximumEmptyMeasures(fixtureValue: unknown): F3FixtureRecord {
  const { root, section, measure } = seedParts(fixtureValue);
  root["sections"] = Array.from({ length: 64 }, (_, sectionIndex) => ({
    ...clone(section),
    id: `section-f3-max-${String(sectionIndex)}`,
    measures: Array.from({ length: 1_024 }, (_, measureIndex) => ({
      ...clone(measure),
      id: `measure-f3-max-${String(sectionIndex)}-${String(measureIndex)}`,
      events: [],
      completion: { kind: "empty" },
    })),
  }));
  return root;
}

function maximumEvents(fixtureValue: unknown): F3FixtureRecord {
  const { root, section, measure, event } = seedParts(fixtureValue);
  root["sections"] = Array.from({ length: 2 }, (_, sectionIndex) => ({
    ...clone(section),
    id: `section-f3-events-${String(sectionIndex)}`,
    measures: Array.from({ length: 1_024 }, (_, measureIndex) => ({
      ...clone(measure),
      id: `measure-f3-events-${String(sectionIndex)}-${String(measureIndex)}`,
      events: Array.from({ length: 4 }, (_, eventIndex) => ({
        ...clone(event),
        id: `event-f3-events-${String(sectionIndex)}-${String(measureIndex)}-${String(eventIndex)}`,
        duration: { numerator: 1, denominator: 1 },
      })),
      completion: { kind: "complete" },
    })),
  }));
  return root;
}

function firstExcessEvent(fixtureValue: unknown): F3FixtureRecord {
  const { root, section, measure, event } = seedParts(fixtureValue);
  const eventCounts = [4_096, 4_096, 1] as const;
  root["sections"] = eventCounts.map((count, sectionIndex) => ({
    ...clone(section),
    id: `section-f3-excess-${String(sectionIndex)}`,
    measures: [
      {
        ...clone(measure),
        id: `measure-f3-excess-${String(sectionIndex)}`,
        events: Array.from({ length: count }, (_, eventIndex) => ({
          ...clone(event),
          id: `event-f3-excess-${String(sectionIndex)}-${String(eventIndex)}`,
          duration: { numerator: 1, denominator: 1 },
        })),
        completion: { kind: "complete" },
      },
    ],
  }));
  return root;
}

export function materializeF3Input(
  fixtureValue: unknown,
  inputValue: unknown,
): F3FixtureRecord {
  const input = requireF3Record(inputValue, "case.input");
  if (typeof input["template"] === "string") {
    const root = sourceTemplate(fixtureValue, input["template"]);
    for (const operation of requireF3Array(
      input["operations"],
      "input.operations",
    )) {
      applyOperation(root, operation);
    }
    return root;
  }
  switch (requireF3String(input["recipe"], "input.recipe")) {
    case "max-empty-measures":
      return maximumEmptyMeasures(fixtureValue);
    case "max-events-complete-measures":
      return maximumEvents(fixtureValue);
    case "f2-first-excess-events":
      return firstExcessEvent(fixtureValue);
    default:
      throw new Error("F3_FIXTURE_RECIPE_UNKNOWN");
  }
}

export function f3ObjectGraph(root: unknown): ReadonlySet<object> {
  const seen = new Set<object>();
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    for (const child of Object.values(value)) pending.push(child);
  }
  return seen;
}

export function f3UnfrozenObjectCount(root: unknown): number {
  let count = 0;
  for (const value of f3ObjectGraph(root)) {
    if (!Object.isFrozen(value)) count += 1;
  }
  return count;
}

export function f3ExpectedPublicationNodes(candidate: {
  readonly sections: readonly {
    readonly measures: readonly { readonly events: readonly unknown[] }[];
  }[];
}): number {
  let total = 1;
  for (const section of candidate.sections) {
    total += 1;
    for (const measure of section.measures) {
      total += 1 + measure.events.length;
    }
  }
  return total;
}

export function canonicalF3Value(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalF3Value);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalF3Value(item)]),
  );
}

export function stableF3Json(value: unknown): string {
  return JSON.stringify(canonicalF3Value(value));
}
