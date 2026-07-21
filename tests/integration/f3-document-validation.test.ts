import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  validateDocumentSemantics,
} from "../../src/application";
import {
  validateDocumentSemanticsWithEvidence,
} from "../../src/application/document-validation";
import { decodeDocumentShape } from "../../src/domain";
import fixtureValue from "../fixtures/publication/document-cases.json";

setDefaultTimeout(600_000);

type JsonRecord = Record<string, unknown>;
type JsonPath = readonly (string | number)[];

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`F3_TEST_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`F3_TEST_ARRAY:${label}`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`F3_TEST_STRING:${label}`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`F3_TEST_NUMBER:${label}`);
  return value;
}

function path(value: unknown, label: string): JsonPath {
  const segments = array(value, label);
  if (
    !segments.every(
      (segment) => typeof segment === "string" || typeof segment === "number",
    )
  ) {
    throw new Error(`F3_TEST_PATH:${label}`);
  }
  return segments;
}

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function parentAtPath(
  root: unknown,
  target: JsonPath,
): Readonly<{ parent: JsonRecord | unknown[]; key: string | number }> {
  if (target.length === 0) throw new Error("F3_TEST_ROOT_MUTATION");
  let current = root;
  for (let index = 0; index < target.length - 1; index += 1) {
    const segment = target[index];
    if (segment === undefined) throw new Error("F3_TEST_PATH_INDEX");
    if (Array.isArray(current)) {
      if (typeof segment !== "number") throw new Error("F3_TEST_ARRAY_PATH");
      current = current[segment];
    } else {
      current = record(current, "path parent")[String(segment)];
    }
  }
  const key = target[target.length - 1];
  if (key === undefined) throw new Error("F3_TEST_PATH_KEY");
  return {
    parent: Array.isArray(current) ? current : record(current, "path target"),
    key,
  };
}

function applyOperation(root: unknown, value: unknown): void {
  const operation = record(value, "operation");
  const operationName = string(operation["op"], "operation.op");
  const target = path(operation["path"], "operation.path");
  const replacement = clone(operation["value"]);
  const { parent, key } = parentAtPath(root, target);

  if (operationName === "set") {
    if (!Reflect.set(parent, key, replacement)) {
      throw new Error("F3_TEST_SET_FAILED");
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
  throw new Error(`F3_TEST_OPERATION:${operationName}`);
}

function sourceTemplate(name: string): JsonRecord {
  const fixture = record(fixtureValue, "fixture");
  const templates = record(fixture["templates"], "templates");
  return clone(record(templates[name], `template:${name}`));
}

function seedParts(): Readonly<{
  root: JsonRecord;
  section: JsonRecord;
  measure: JsonRecord;
  event: JsonRecord;
}> {
  const root = sourceTemplate("representativeParsedAuto");
  const section = record(array(root["sections"], "sections")[0], "section");
  const measure = record(array(section["measures"], "measures")[0], "measure");
  const event = record(array(measure["events"], "events")[0], "event");
  return { root, section, measure, event };
}

function maximumEmptyMeasures(): JsonRecord {
  const { root, section, measure } = seedParts();
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

function maximumEvents(): JsonRecord {
  const { root, section, measure, event } = seedParts();
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

function firstExcessEvent(): JsonRecord {
  const { root, section, measure, event } = seedParts();
  const eventCounts = [4_096, 4_096, 1];
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

function materializeInput(inputValue: unknown): JsonRecord {
  const input = record(inputValue, "case.input");
  if (typeof input["template"] === "string") {
    const root = sourceTemplate(input["template"]);
    for (const operation of array(input["operations"], "input.operations")) {
      applyOperation(root, operation);
    }
    return root;
  }
  switch (string(input["recipe"], "input.recipe")) {
    case "max-empty-measures":
      return maximumEmptyMeasures();
    case "max-events-complete-measures":
      return maximumEvents();
    case "f2-first-excess-events":
      return firstExcessEvent();
    default:
      throw new Error("F3_TEST_RECIPE_UNKNOWN");
  }
}

function issueProjection(value: unknown): Readonly<{
  code: string;
  path: JsonPath;
}> {
  const issue = record(value, "expected issue");
  return {
    code: string(issue["code"], "expected issue.code"),
    path: path(issue["path"], "expected issue.path"),
  };
}

function objectGraph(root: unknown): ReadonlySet<object> {
  const seen = new Set<object>();
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null || seen.has(value)) continue;
    seen.add(value);
    for (const child of Object.values(value)) pending.push(child);
  }
  return seen;
}

function expectRecursivelyFrozen(root: unknown): void {
  let unfrozenObjectCount = 0;
  for (const value of objectGraph(root)) {
    if (!Object.isFrozen(value)) unfrozenObjectCount += 1;
  }
  expect(unfrozenObjectCount).toBe(0);
}

function expectedPublicationNodes(candidate: {
  readonly sections: readonly {
    readonly measures: readonly { readonly events: readonly unknown[] }[];
  }[];
}): number {
  let total = 1;
  for (const section of candidate.sections) {
    total += 1;
    for (const measure of section.measures) total += 1 + measure.events.length;
  }
  return total;
}

const fixture = record(fixtureValue, "fixture");
const cases = array(fixture["cases"], "fixture.cases").map((value) =>
  record(value, "case")
);

describe("F3 semantic document publication", () => {
  for (const caseValue of cases) {
    const id = string(caseValue["id"], "case.id");
    const category = string(caseValue["category"], `${id}.category`);
    test(`${id} ${category}`, () => {
      const input = materializeInput(caseValue["input"]);
      const expected = record(caseValue["expected"], `${id}.expected`);
      const decoded = decodeDocumentShape(input);

      if (expected["stage"] === "F2") {
        expect(decoded.ok).toBe(false);
        if (decoded.ok) throw new Error(`${id}:EXPECTED_F2_REFUSAL`);
        const actualIssues: unknown = decoded.errors.map((issue) => ({
          code: issue.code,
          path: issue.path,
        }));
        expect(actualIssues).toEqual([
          {
            code: string(expected["code"], `${id}.expected.code`),
            path: path(expected["path"], `${id}.expected.path`),
          },
        ]);
        return;
      }

      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(`${id}:EXPECTED_F2_SUCCESS`);
      const candidateGraph = objectGraph(decoded.value);
      const before = JSON.stringify(decoded.value);
      const first = validateDocumentSemanticsWithEvidence(decoded.value);
      expect(JSON.stringify(decoded.value)).toBe(before);
      const actualTermination: unknown = first.evidence.termination;
      expect(actualTermination).toBe(expected["termination"]);
      expect(first.evidence.counters.sectionsVisited).toBe(
        decoded.value.sections.length,
      );
      expect(first.evidence.counters.issuesEmitted).toBe(
        first.result.ok ? 0 : first.result.errors.length,
      );

      const expectedCountersValue = expected["counters"];
      if (expectedCountersValue !== undefined) {
        const expectedCounters = record(
          expectedCountersValue,
          `${id}.expected.counters`,
        );
        for (const [name, value] of Object.entries(expectedCounters)) {
          expect(
            first.evidence.counters[
              name as keyof typeof first.evidence.counters
            ],
          ).toBe(number(value, `${id}.expected.counters.${name}`));
        }
      }

      if (expected["ok"] === false) {
        expect(first.result.ok).toBe(false);
        if (first.result.ok) throw new Error(`${id}:EXPECTED_F3_REFUSAL`);
        const actualIssues: unknown = first.result.errors.map((issue) => ({
          code: issue.code,
          path: issue.path,
        }));
        expect(actualIssues).toEqual(
          array(expected["errors"], `${id}.expected.errors`).map(
            issueProjection,
          ),
        );
        expect(first.evidence.counters.publicationNodeVisits).toBe(0);
        expect(Object.keys(first.result)).toEqual(["ok", "errors"]);
        expectRecursivelyFrozen(first);
        return;
      }

      expect(expected["ok"]).toBe(true);
      expect(first.result.ok).toBe(true);
      if (!first.result.ok) throw new Error(`${id}:EXPECTED_F3_SUCCESS`);
      expect(first.result.warnings).toEqual([]);
      expect(first.evidence.counters.publicationNodeVisits).toBe(
        expectedPublicationNodes(decoded.value),
      );
      expect(Object.keys(first.result)).toEqual(["ok", "value", "warnings"]);
      expectRecursivelyFrozen(first);

      const publishedGraph = objectGraph(first.result.value);
      let sharedObjectCount = 0;
      for (const publishedNode of publishedGraph) {
        if (candidateGraph.has(publishedNode)) sharedObjectCount += 1;
      }
      expect(sharedObjectCount).toBe(0);

      input["title"] = "mutated after publication";
      expect(first.result.value.title).not.toBe("mutated after publication");
      if (id === "F3-DOC-039") {
        const second = validateDocumentSemanticsWithEvidence(decoded.value);
        expect(second).toEqual(first);
      }
      if (id === "F3-DOC-003") {
        expect(validateDocumentSemantics(decoded.value)).toEqual(first.result);
      }
    });
  }
});
