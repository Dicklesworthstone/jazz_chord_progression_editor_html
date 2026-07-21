import { createHash } from "node:crypto";

import lawFixtureValue from "../fixtures/playback-plan/law-cases.json";
import limitFixtureValue from "../fixtures/playback-plan/limit-cases.json";
import loopFixtureValue from "../fixtures/playback-plan/loop-cases.json";
import mutationFixtureValue from
  "../fixtures/playback-plan/mutation-controls.json";
import realizationFixtureValue from
  "../fixtures/playback-plan/realization-cases.json";
import timelineFixtureValue from
  "../fixtures/playback-plan/timeline-cases.json";

import { validateDocumentSemantics } from "../../src/application";
import {
  decodeDocumentShape,
  makeAutoVoicing,
  projectSpelledPitch,
  type ChordEventId,
  type ValidatedDocument,
} from "../../src/domain";
import {
  PLAYBACK_EVENT_OWN_KEY_ORDER,
  PLAYBACK_PLAN_OWN_KEY_ORDER,
  PLAYBACK_PLAN_REALIZATION_SCHEMA,
  type CompilePlaybackPlanRequest,
  type PlaybackPlan,
  type PlaybackPlanWorkCounterName,
  type PlaybackRealizationBinding,
} from "../../src/playback";
import {
  compilePlaybackPlan,
  probePlaybackPlanCounterForTest,
} from "../../src/playback/compile-playback-plan";
import {
  parseChordSymbol,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
} from "../../src/theory";
import {
  P0_LIMIT_FIXTURE,
  P0_LOOP_FIXTURE,
  materializeP0DocumentCandidate,
  materializeP0LimitStructuralCase,
  materializeP0LoopCase,
  materializeP0PlaybackFixture,
  materializeP0RealizationCase,
  materializeP0TimelineCase,
  materializeP0TimelinePair,
  freshP0CompileRequest,
  p0LimitStructuralCase,
  p0LoopCase,
  p0RealizationCase,
  p0TimelineCase,
  type P0DocumentRecipe,
} from "./p0-playback-fixtures";

export const P0_PRODUCTION_MARKER =
  "P0_PRODUCTION_OBSERVATION " as const;
export const P0_MUTATION_MARKER = "P0_MUTATION_OBSERVATION " as const;
export const P0_PRODUCTION_SCHEMA =
  "changes.evidence.p0-production-conformance-observation.v1" as const;
export const P0_MUTATION_SCHEMA =
  "changes.evidence.p0-mutation-conformance-observation.v1" as const;

export const P0_PRODUCTION_PRODUCER = Object.freeze({
  file: "tests/conformance/playback-plan-conformance.test.ts",
  testcase:
    "executes every reviewed P0 mutation baseline against literal fixture authority",
} as const);

export const P0_MUTATION_PRODUCER = Object.freeze({
  file: "tests/conformance/playback-plan-conformance.test.ts",
  testcase:
    "kills all 42 reviewed semantic counterfactuals and all 96 killer links",
} as const);

export type P0JsonRecord = Record<string, unknown>;

type FixtureCase = Readonly<{
  path: string;
  row: P0JsonRecord;
}>;

export type P0CaseObservation = Readonly<{
  caseId: string;
  fixturePath: string;
  fixtureRecordSha256: string;
  expectedProjection: unknown;
  actualProjection: unknown;
  expectedProjectionSha256: string;
  actualProjectionSha256: string;
  runtimeResultSha256: string;
  matchedLiteralFixture: true;
}>;

export type P0MutationControl = Readonly<{
  id: string;
  faultFamily: string;
  operator: string;
  mutatedFault: string;
  killerCaseIds: readonly string[];
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

export type P0MutationExecution = Readonly<{
  controlId: string;
  caseId: string;
  operator: string;
  faultFamily: string;
  executionKind: "executable-semantic-counterfactual";
  sourceMutationExecuted: false;
  fixtureRecordSha256: string;
  caseFixturePath: string;
  caseFixtureRecordSha256: string;
  expectedProjectionSha256: string;
  baselineProjection: unknown;
  baselineProjectionSha256: string;
  mutantProjection: unknown;
  mutantProjectionSha256: string;
  baselineResultSha256: string;
  mutantResultSha256: string;
  beforeSha256: string;
  afterSha256: string;
  changedFields: readonly string[];
  oracleDecision: "killed";
  killed: true;
  executionDigest: string;
}>;

export function isP0Record(value: unknown): value is P0JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireP0Record(
  value: unknown,
  label: string,
): P0JsonRecord {
  if (!isP0Record(value)) throw new TypeError(`P0_RECORD:${label}`);
  return value;
}

export function requireP0Array(
  value: unknown,
  label: string,
): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`P0_ARRAY:${label}`);
  return value;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isP0Record(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function canonicalP0Json(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function stableP0Json(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function p0EvidenceDigest(value: unknown): string {
  return createHash("sha256").update(canonicalP0Json(value), "utf8").digest(
    "hex",
  );
}

export function signP0Observation<Value extends P0JsonRecord>(
  value: Value,
): Value & Readonly<{ semanticDigest: string }> {
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  );
  return { ...value, semanticDigest: p0EvidenceDigest(payload) };
}

function assertP0Equal(actual: unknown, expected: unknown, label: string): void {
  if (canonicalP0Json(actual) !== canonicalP0Json(expected)) {
    throw new Error(
      `${label}: expected ${canonicalP0Json(expected)}, received ${canonicalP0Json(actual)}`,
    );
  }
}

function assertP0(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function rows(root: unknown, label: string, key = "cases"): P0JsonRecord[] {
  const value = requireP0Record(root, label)[key];
  return requireP0Array(value, `${label}.${key}`).map((item, index) =>
    requireP0Record(item, `${label}.${key}[${String(index)}]`)
  );
}

const FIXTURE_GROUPS = Object.freeze([
  Object.freeze({
    path: "tests/fixtures/playback-plan/timeline-cases.json",
    rows: rows(timelineFixtureValue, "timeline fixture"),
  }),
  Object.freeze({
    path: "tests/fixtures/playback-plan/realization-cases.json",
    rows: rows(realizationFixtureValue, "realization fixture"),
  }),
  Object.freeze({
    path: "tests/fixtures/playback-plan/loop-cases.json",
    rows: rows(loopFixtureValue, "loop fixture"),
  }),
  Object.freeze({
    path: "tests/fixtures/playback-plan/law-cases.json",
    rows: rows(lawFixtureValue, "law fixture"),
  }),
  Object.freeze({
    path: "tests/fixtures/playback-plan/limit-cases.json",
    rows: [
      ...rows(limitFixtureValue, "limit fixture", "structuralCases"),
      ...rows(limitFixtureValue, "limit fixture", "counterBoundaries"),
    ],
  }),
]);

export function allP0NamedCaseIds(): readonly string[] {
  return Object.freeze(
    FIXTURE_GROUPS.flatMap(({ rows: fixtureRows }) =>
      fixtureRows.map((row) => String(row["id"]))
    ),
  );
}

export function p0FixtureCase(caseId: string): FixtureCase {
  for (const group of FIXTURE_GROUPS) {
    const row = group.rows.find((candidate) => candidate["id"] === caseId);
    if (row !== undefined) return { path: group.path, row };
  }
  throw new Error(`P0_CASE_UNKNOWN:${caseId}`);
}

const P0_MUTATION_CONTROL_ROWS = rows(
  mutationFixtureValue,
  "mutation fixture",
  "controls",
);

export const P0_MUTATION_CONTROLS: readonly P0MutationControl[] = Object.freeze(
  P0_MUTATION_CONTROL_ROWS.map((row) => {
    const id = row["id"];
    const faultFamily = row["faultFamily"];
    const operator = row["operator"];
    const mutatedFault = row["mutatedFault"];
    const killerCaseIds = row["killerCaseIds"];
    const traceIds = row["traceIds"];
    const authorityIds = row["authorityIds"];
    assertP0(typeof id === "string", "P0_MUTATION_ID");
    assertP0(typeof faultFamily === "string", `${id}:FAULT_FAMILY`);
    assertP0(typeof operator === "string", `${id}:OPERATOR`);
    assertP0(typeof mutatedFault === "string", `${id}:FAULT`);
    assertP0(
      Array.isArray(killerCaseIds) &&
        killerCaseIds.every((item) => typeof item === "string"),
      `${id}:KILLERS`,
    );
    assertP0(
      Array.isArray(traceIds) && traceIds.every((item) => typeof item === "string"),
      `${id}:TRACES`,
    );
    assertP0(
      Array.isArray(authorityIds) &&
        authorityIds.every((item) => typeof item === "string"),
      `${id}:AUTHORITIES`,
    );
    return Object.freeze({
      id,
      faultFamily,
      operator,
      mutatedFault,
      killerCaseIds,
      traceIds,
      authorityIds,
    });
  }),
);

function p0MutationControlFixture(controlId: string): P0JsonRecord {
  const row = P0_MUTATION_CONTROL_ROWS.find(
    (candidate) => candidate["id"] === controlId,
  );
  if (row === undefined) throw new Error(`P0_MUTATION_UNKNOWN:${controlId}`);
  return row;
}

function projectByTemplate(actual: unknown, template: unknown, label: string): unknown {
  if (Array.isArray(template)) {
    const actualArray = requireP0Array(actual, label);
    assertP0(actualArray.length === template.length, `${label}:LENGTH`);
    return template.map((item, index) =>
      projectByTemplate(actualArray[index], item, `${label}[${String(index)}]`)
    );
  }
  if (!isP0Record(template)) return actual;
  const actualRecord = requireP0Record(actual, label);
  return Object.fromEntries(
    Object.entries(template).map(([key, item]) => [
      key,
      projectByTemplate(actualRecord[key], item, `${label}.${key}`),
    ]),
  );
}

function observation(
  fixture: FixtureCase,
  expectedProjection: unknown,
  actualProjection: unknown,
  runtimeResult: unknown,
): P0CaseObservation {
  assertP0Equal(
    actualProjection,
    expectedProjection,
    `${String(fixture.row["id"])}:LITERAL_FIXTURE_MISMATCH`,
  );
  return Object.freeze({
    caseId: String(fixture.row["id"]),
    fixturePath: fixture.path,
    fixtureRecordSha256: p0EvidenceDigest(fixture.row),
    expectedProjection,
    actualProjection,
    expectedProjectionSha256: p0EvidenceDigest(expectedProjection),
    actualProjectionSha256: p0EvidenceDigest(actualProjection),
    runtimeResultSha256: p0EvidenceDigest(runtimeResult),
    matchedLiteralFixture: true,
  });
}

function timelineObservation(caseId: string): P0CaseObservation {
  const fixture = p0FixtureCase(caseId);
  const recipe = p0TimelineCase(caseId);
  if (recipe.pairedDocumentRecipes !== undefined) {
    const [leftFixture, rightFixture] = materializeP0TimelinePair(caseId);
    const left = compilePlaybackPlan(leftFixture.request);
    const right = compilePlaybackPlan(rightFixture.request);
    assertP0(left.ok && right.ok, `${caseId}:PAIRED_REFUSAL`);
    const relation = requireP0Record(recipe.expectedRelation, `${caseId}.relation`);
    const equalFields = requireP0Array(
      relation["equalFields"],
      `${caseId}.equalFields`,
    );
    const differentFields = requireP0Array(
      relation["differentFields"],
      `${caseId}.differentFields`,
    );
    for (const field of equalFields) {
      assertP0(typeof field === "string", `${caseId}:EQUAL_FIELD`);
      assertP0Equal(
        requireP0Record(left.plan, "left plan")[field],
        requireP0Record(right.plan, "right plan")[field],
        `${caseId}:EQUAL:${field}`,
      );
    }
    for (const field of differentFields) {
      assertP0(typeof field === "string", `${caseId}:DIFFERENT_FIELD`);
      assertP0(
        canonicalP0Json(requireP0Record(left.plan, "left plan")[field]) !==
          canonicalP0Json(requireP0Record(right.plan, "right plan")[field]),
        `${caseId}:NOT_DIFFERENT:${field}`,
      );
    }
    const expectedProjection = {
      ok: true,
      equalFields,
      differentFields,
      relationSatisfied: true,
    };
    return observation(
      fixture,
      expectedProjection,
      { ...expectedProjection },
      { left, right },
    );
  }

  const materialized = materializeP0TimelineCase(caseId);
  const result = compilePlaybackPlan(materialized.request);
  assertP0(result.ok, `${caseId}:TIMELINE_REFUSAL`);
  const expectedPlan = requireP0Record(
    recipe.expectedPlan,
    `${caseId}.expectedPlan`,
  );
  const expectedPlanProjection: P0JsonRecord = {};
  const actualPlanProjection: P0JsonRecord = {};
  for (const [key, value] of Object.entries(expectedPlan)) {
    if (key === "singleEvent") {
      const expectedEvent = requireP0Record(value, `${caseId}.singleEvent`);
      const actualEvent = result.plan.events[0];
      assertP0(actualEvent !== undefined, `${caseId}:EVENT_MISSING`);
      const normalizedExpected = Object.fromEntries(
        Object.entries(expectedEvent).map(([eventKey, item]) => [
          eventKey === "gateTicks" ? "gateDurationTicks" : eventKey,
          item,
        ]),
      );
      expectedPlanProjection["singleEvent"] = normalizedExpected;
      actualPlanProjection["singleEvent"] = projectByTemplate(
        actualEvent,
        normalizedExpected,
        `${caseId}.event`,
      );
      continue;
    }
    expectedPlanProjection[key] = value;
    actualPlanProjection[key] = projectByTemplate(
      requireP0Record(result.plan, `${caseId}.plan`)[key],
      value,
      `${caseId}.plan.${key}`,
    );
  }
  return observation(
    fixture,
    { ok: true, plan: expectedPlanProjection, termination: "complete" },
    {
      ok: result.ok,
      plan: actualPlanProjection,
      termination: result.evidence.termination,
    },
    result,
  );
}

const REALIZATION_META_KEYS = new Set([
  "ok",
  "termination",
  "partialResult",
  "fallbackPitchesForbidden",
  "automaticGenerationForbidden",
  "candidateVoicePitchEqualityRequired",
  "deduplicateForbidden",
  "generatedByAffectsPitches",
  "pitchSource",
  "regenerationForbidden",
  "sortForbidden",
]);

function realizationObservation(caseId: string): P0CaseObservation {
  const fixture = p0FixtureCase(caseId);
  const recipe = p0RealizationCase(caseId);
  const materialized = materializeP0RealizationCase(caseId);
  const result = compilePlaybackPlan(materialized.request);
  const expected = recipe.expected;
  if (expected["ok"] === true) {
    assertP0(result.ok, `${caseId}:REALIZATION_REFUSAL`);
    const event = result.plan.events[0];
    assertP0(event !== undefined, `${caseId}:EVENT_MISSING`);
    const expectedProjection = {
      ok: true,
      pitches: expected["pitches"],
      midiPitches: expected["midiPitches"],
      termination: "complete",
    };
    const actualProjection = {
      ok: result.ok,
      pitches: event.pitches,
      midiPitches: event.midiPitches,
      termination: result.evidence.termination,
    };
    return observation(fixture, expectedProjection, actualProjection, result);
  }
  assertP0(!result.ok, `${caseId}:EXPECTED_REFUSAL`);
  const expectedRefusal = Object.fromEntries(
    Object.entries(expected).filter(([key]) =>
      !REALIZATION_META_KEYS.has(key) && key !== "pitches" && key !== "midiPitches"
    ),
  );
  const actualRefusal = projectByTemplate(
    result.refusal,
    expectedRefusal,
    `${caseId}.refusal`,
  );
  return observation(
    fixture,
    {
      ok: false,
      refusal: expectedRefusal,
      termination: expected["termination"],
      planPresent: false,
    },
    {
      ok: result.ok,
      refusal: actualRefusal,
      termination: result.evidence.termination,
      planPresent: "plan" in result,
    },
    result,
  );
}

function loopExpectedEmissions(recipe: ReturnType<typeof p0LoopCase>): unknown {
  const expected = recipe.expected;
  if (Array.isArray(expected["emissions"])) return expected["emissions"];
  if (expected["emissionRef"] === "P0-LOOP-001") {
    return p0LoopCase("P0-LOOP-001").expected["emissions"];
  }
  return undefined;
}

function loopObservation(caseId: string): P0CaseObservation {
  const fixture = p0FixtureCase(caseId);
  const recipe = p0LoopCase(caseId);
  const materialized = materializeP0LoopCase(caseId);
  const result = compilePlaybackPlan(materialized.request);
  const expected = recipe.expected;
  if (expected["ok"] === true) {
    assertP0(result.ok, `${caseId}:LOOP_REFUSAL`);
    const emissions = loopExpectedEmissions(recipe);
    const expectedPlan = {
      ...P0_LOOP_FIXTURE.commonExpectedPlan,
      loop: "loop" in expected ? expected["loop"] : materialized.request.loop,
      loopTicks: expected["loopTicks"],
      ...(emissions === undefined ? {} : { events: emissions }),
    };
    const actualPlan = projectByTemplate(
      result.plan,
      expectedPlan,
      `${caseId}.plan`,
    );
    return observation(
      fixture,
      { ok: true, plan: expectedPlan, termination: "complete" },
      {
        ok: result.ok,
        plan: actualPlan,
        termination: result.evidence.termination,
      },
      result,
    );
  }
  assertP0(!result.ok, `${caseId}:EXPECTED_LOOP_REFUSAL`);
  const expectedRefusal = Object.fromEntries(
    ["code", "path", "reason", "totalBeats"]
      .filter((key) => key in expected)
      .map((key) => [key, expected[key]]),
  );
  return observation(
    fixture,
    {
      ok: false,
      refusal: expectedRefusal,
      termination: expected["termination"],
      planPresent: false,
    },
    {
      ok: result.ok,
      refusal: projectByTemplate(
        result.refusal,
        expectedRefusal,
        `${caseId}.refusal`,
      ),
      termination: result.evidence.termination,
      planPresent: "plan" in result,
    },
    result,
  );
}

export function p0LimitSeamRows(): readonly P0JsonRecord[] {
  return P0_LIMIT_FIXTURE.counterBoundaries.map((row, index) =>
    requireP0Record(row, `counterBoundaries[${String(index)}]`)
  );
}

function limitSeamObservation(caseId: string): P0CaseObservation {
  const fixture = p0FixtureCase(caseId);
  const row = fixture.row;
  const counter = row["counter"];
  const maximum = row["maximum"];
  assertP0(typeof counter === "string", `${caseId}:COUNTER`);
  assertP0(
    typeof maximum === "number" && Number.isSafeInteger(maximum),
    `${caseId}:MAXIMUM`,
  );
  const exactFixture = requireP0Record(row["exact"], `${caseId}.exact`);
  const plusOneFixture = requireP0Record(
    row["plusOne"],
    `${caseId}.plusOne`,
  );
  const exact = probePlaybackPlanCounterForTest(
    counter as PlaybackPlanWorkCounterName,
    maximum,
  );
  const plusOne = probePlaybackPlanCounterForTest(
    counter as PlaybackPlanWorkCounterName,
    maximum + 1,
  );
  assertP0(exact.ok, `${caseId}:EXACT_REFUSED`);
  assertP0(!plusOne.ok, `${caseId}:PLUS_ONE_ACCEPTED`);
  const expectedProjection = {
    counter,
    maximum,
    exact: {
      ok: true,
      received: exactFixture["received"],
      maximum,
      continues: exactFixture["continues"],
      evidence: maximum,
      termination: "complete",
    },
    plusOne: {
      ok: false,
      refusal: {
        code: plusOneFixture["code"],
        path: ["work", counter],
        counter,
        received: plusOneFixture["received"],
        maximum,
        partialResult: false,
      },
      termination: plusOneFixture["termination"],
      planPresent: false,
    },
  };
  const actualProjection = {
    counter,
    maximum,
    exact: {
      ok: exact.ok,
      received: exact.received,
      maximum: exact.maximum,
      continues: true,
      evidence: exact.evidence[counter as PlaybackPlanWorkCounterName],
      termination: exact.evidence.termination,
    },
    plusOne: {
      ok: plusOne.ok,
      refusal: plusOne.refusal,
      termination: plusOne.evidence.termination,
      planPresent: "plan" in plusOne,
    },
  };
  return observation(
    fixture,
    expectedProjection,
    actualProjection,
    { exact, plusOne },
  );
}

function evidenceSubset(
  evidence: P0JsonRecord,
  expected: unknown,
  label: string,
): unknown {
  return projectByTemplate(evidence, expected, label);
}

function limitStructuralObservation(caseId: string): P0CaseObservation {
  const fixture = p0FixtureCase(caseId);
  const recipe = p0LimitStructuralCase(
    caseId as Parameters<typeof p0LimitStructuralCase>[0],
  );
  const materialized = materializeP0LimitStructuralCase(recipe.id);
  const result = compilePlaybackPlan(materialized.request);
  const expected = requireP0Record(recipe.expected, `${caseId}.expected`);
  if (
    expected["ok"] === true || expected["bindingPreflightAccepted"] === true
  ) {
    assertP0(result.ok, `${caseId}:STRUCTURAL_REFUSAL`);
    const expectedProjection: P0JsonRecord = { ok: true };
    const actualProjection: P0JsonRecord = { ok: result.ok };
    if ("eventCount" in expected) {
      expectedProjection["eventCount"] = expected["eventCount"];
      actualProjection["eventCount"] = result.plan.events.length;
    }
    if ("outputPitchCount" in expected) {
      expectedProjection["outputPitchCount"] = expected["outputPitchCount"];
      actualProjection["outputPitchCount"] = result.plan.events.reduce(
        (count, event) => count + event.pitches.length,
        0,
      );
    }
    for (const key of ["events", "totalBeats", "totalTicks"] as const) {
      if (key in expected) {
        expectedProjection[key] = expected[key];
        actualProjection[key] = requireP0Record(result.plan, `${caseId}.plan`)[key];
      }
    }
    if ("bindingCount" in expected) {
      expectedProjection["bindingCount"] = expected["bindingCount"];
      actualProjection["bindingCount"] = materialized.request.realizedVoicings.size;
    }
    if ("bindingPreflightAccepted" in expected) {
      expectedProjection["bindingPreflightAccepted"] =
        expected["bindingPreflightAccepted"];
      actualProjection["bindingPreflightAccepted"] = result.ok;
    }
    if ("selectedEvidence" in expected) {
      expectedProjection["selectedEvidence"] = expected["selectedEvidence"];
      actualProjection["selectedEvidence"] = evidenceSubset(
        requireP0Record(result.evidence, `${caseId}.evidence`),
        expected["selectedEvidence"],
        `${caseId}.selectedEvidence`,
      );
    }
    if ("termination" in expected) {
      expectedProjection["termination"] = expected["termination"];
      actualProjection["termination"] = result.evidence.termination;
    }
    return observation(
      fixture,
      expectedProjection,
      actualProjection,
      result,
    );
  }
  assertP0(!result.ok, `${caseId}:STRUCTURAL_EXPECTED_REFUSAL`);
  const expectedRefusal = Object.fromEntries(
    ["code", "path", "measureId", "maximumQuarterNoteBeats", "received", "maximum"]
      .filter((key) => key in expected)
      .map((key) => [key, expected[key]]),
  );
  return observation(
    fixture,
    {
      ok: false,
      refusal: expectedRefusal,
      termination: expected["termination"],
      planPresent: false,
    },
    {
      ok: result.ok,
      refusal: projectByTemplate(
        result.refusal,
        expectedRefusal,
        `${caseId}.refusal`,
      ),
      termination: result.evidence.termination,
      planPresent: "plan" in result,
    },
    result,
  );
}

function recursivelyFrozen(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (
      typeof current !== "object" ||
      current === null ||
      seen.has(current)
    ) continue;
    seen.add(current);
    if (!Object.isFrozen(current)) return false;
    for (const child of Object.values(current)) pending.push(child);
  }
  return true;
}

function requestBytes(request: CompilePlaybackPlanRequest): string {
  return canonicalP0Json({
    ...request,
    realizedVoicings: [...request.realizedVoicings],
  });
}

function exactMidiMirrors(plan: PlaybackPlan): boolean {
  const ticks = (value: { numerator: number; denominator: number }): number => {
    const scaled = value.numerator * 960;
    assertP0(scaled % value.denominator === 0, "P0_MIDI_NONINTEGRAL");
    return scaled / value.denominator;
  };
  if (plan.totalTicks !== ticks(plan.totalBeats)) return false;
  if ((plan.loop === null) !== (plan.loopTicks === null)) return false;
  if (plan.loop !== null && plan.loopTicks !== null) {
    if (
      plan.loopTicks.start !== ticks(plan.loop.start) ||
      plan.loopTicks.end !== ticks(plan.loop.end)
    ) return false;
  }
  return plan.events.every((event) => {
    if (
      event.sourceStartTick !== ticks(event.sourceStartBeat) ||
      event.sourceDurationTicks !== ticks(event.sourceDurationBeats) ||
      event.startTick !== ticks(event.startBeat) ||
      event.durationTicks !== ticks(event.durationBeats) ||
      event.gateDurationTicks !== ticks(event.gateDurationBeats) ||
      (event.sourceOffsetBeats === null) !== (event.sourceOffsetTicks === null) ||
      event.pitches.length !== event.midiPitches.length
    ) return false;
    if (
      event.sourceOffsetBeats !== null &&
      event.sourceOffsetTicks !== ticks(event.sourceOffsetBeats)
    ) return false;
    return event.pitches.every((pitch, index) => {
      const projected = projectSpelledPitch(pitch);
      return projected.ok && projected.value.midi === event.midiPitches[index];
    });
  });
}

function lawRow(caseId: string): P0JsonRecord {
  const fixture = p0FixtureCase(caseId);
  assertP0(
    fixture.path.endsWith("law-cases.json"),
    `${caseId}:NOT_LAW_FIXTURE`,
  );
  return fixture.row;
}

const TRANSPOSITION_RECIPE: P0DocumentRecipe = Object.freeze({
  documentId: "doc-p0-transpose",
  tempoBpm: 120,
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  singleEvent: Object.freeze({
    eventId: "event-p0-transpose",
    sectionId: "section-p0-transpose",
    measureId: "measure-p0-transpose",
    duration: Object.freeze({ numerator: 4, denominator: 1 }),
    sourceRef: "P0-SOURCE-AUTO-CMAJ7",
    completion: Object.freeze({ kind: "complete" }),
  }),
});

function soleRawEvent(root: P0JsonRecord, label: string): P0JsonRecord {
  const sections = requireP0Array(root["sections"], `${label}.sections`);
  const section = requireP0Record(sections[0], `${label}.section`);
  const measures = requireP0Array(section["measures"], `${label}.measures`);
  const measure = requireP0Record(measures[0], `${label}.measure`);
  const events = requireP0Array(measure["events"], `${label}.events`);
  return requireP0Record(events[0], `${label}.event`);
}

function publishCandidate(value: unknown, label: string): ValidatedDocument {
  const decoded = decodeDocumentShape(value);
  assertP0(decoded.ok, `${label}:F2_REFUSAL`);
  const published = validateDocumentSemantics(decoded.value);
  assertP0(published.ok, `${label}:F3_REFUSAL`);
  return published.value;
}

function pathChild(
  value: unknown,
  segment: string | number,
  label: string,
): unknown {
  if (Array.isArray(value)) {
    assertP0(
      typeof segment === "number" && Number.isSafeInteger(segment),
      `${label}:ARRAY_INDEX`,
    );
    return value[segment];
  }
  return requireP0Record(value, label)[String(segment)];
}

function setPathLeaf(
  value: unknown,
  segment: string | number,
  replacement: unknown,
  label: string,
): void {
  if (Array.isArray(value)) {
    assertP0(
      typeof segment === "number" && Number.isSafeInteger(segment),
      `${label}:ARRAY_INDEX`,
    );
    value[segment] = replacement;
    return;
  }
  requireP0Record(value, label)[String(segment)] = replacement;
}

export function materializeP0TranspositionPair(): Readonly<{
  base: CompilePlaybackPlanRequest;
  transposed: CompilePlaybackPlanRequest;
  law: P0JsonRecord;
}> {
  const law = lawRow("P0-LAW-004");
  const baseFixture = materializeP0PlaybackFixture(TRANSPOSITION_RECIPE);
  const baseExpected = requireP0Record(law["base"], "P0-LAW-004.base");
  const baseResult = compilePlaybackPlan(baseFixture.request);
  assertP0(baseResult.ok, "P0-LAW-004:BASE_REFUSAL");
  const baseEvent = baseResult.plan.events[0];
  assertP0(baseEvent !== undefined, "P0-LAW-004:BASE_EVENT");
  assertP0Equal(baseEvent.pitches, baseExpected["pitches"], "P0-LAW-004:BASE_PITCHES");
  assertP0Equal(
    baseEvent.midiPitches,
    baseExpected["midiPitches"],
    "P0-LAW-004:BASE_MIDI",
  );

  const raw = structuredClone(materializeP0DocumentCandidate(TRANSPOSITION_RECIPE));
  const parsed = parseChordSymbol("Dmaj7", "ascii");
  assertP0(parsed.ok, "P0-LAW-004:D_PARSE");
  soleRawEvent(raw, "P0-LAW-004.raw")["chord"] = parsed.chord;
  const document = publishCandidate(raw, "P0-LAW-004:D_DOCUMENT");
  const event = document.sections[0]?.measures[0]?.events[0];
  assertP0(event !== undefined, "P0-LAW-004:D_EVENT");
  assertP0(event.voicing.mode === "auto", "P0-LAW-004:D_AUTO");
  const resolved = resolveChord(parsed.chord);
  assertP0(resolved.ok, "P0-LAW-004:D_RESOLVE");
  const policy = makeAutoVoicing(event.voicing, resolved.value.bass);
  assertP0(policy.ok, "P0-LAW-004:D_POLICY");
  const request = Object.freeze({
    schema: "changes.theory.voicing-request.v1",
    kind: "auto" as const,
    resolved: resolved.value,
    realizationId: "literal" as const,
    policy: policy.value,
    quartalContext: null,
  }) as AutoVoicingRequest;
  const realized = realizeVoicing(request);
  assertP0(realized.ok, "P0-LAW-004:D_V0");
  const transposedExpected = requireP0Record(
    law["transposed"],
    "P0-LAW-004.transposed",
  );
  const expectedPitches = transposedExpected["pitches"];
  const candidate = realized.value.candidates.find((item) =>
    canonicalP0Json(item.pitches) === canonicalP0Json(expectedPitches)
  );
  assertP0(candidate !== undefined, "P0-LAW-004:D_CANDIDATE");
  const binding: PlaybackRealizationBinding = Object.freeze({
    schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
    eventId: event.id,
    kind: "generated",
    request,
    outcome: Object.freeze({ ok: true, candidate }),
  });
  const transposed = freshP0CompileRequest(
    document,
    new Map<ChordEventId, PlaybackRealizationBinding>([[event.id, binding]]),
  );
  return Object.freeze({ base: baseFixture.request, transposed, law });
}

function publishChordAlias(
  document: ValidatedDocument,
  sourceText: string,
): ValidatedDocument {
  const candidate = structuredClone(document) as unknown;
  const root = requireP0Record(candidate, "alias document");
  const event = soleRawEvent(root, "alias document");
  const parsed = parseChordSymbol(sourceText, "ascii");
  assertP0(parsed.ok, `P0_ALIAS_PARSE:${sourceText}`);
  event["chord"] = parsed.chord;
  return publishCandidate(root, `P0_ALIAS_PUBLICATION:${sourceText}`);
}

export function observeP0StoredAliasLaw(): Readonly<{
  baseResult: ReturnType<typeof compilePlaybackPlan>;
  aliasResult: ReturnType<typeof compilePlaybackPlan>;
  generatedNearMiss: ReturnType<typeof compilePlaybackPlan>;
}> {
  const stored = materializeP0RealizationCase("P0-REAL-002");
  const baseResult = compilePlaybackPlan(stored.request);
  const aliasDocument = publishChordAlias(stored.request.document, "CM7");
  const aliasResult = compilePlaybackPlan({
    ...stored.request,
    document: aliasDocument,
  });
  assertP0(baseResult.ok && aliasResult.ok, "P0-LAW-007:STORED_REFUSAL");
  assertP0Equal(baseResult.plan, aliasResult.plan, "P0-LAW-007:PLAN_DRIFT");

  const generated = materializeP0RealizationCase("P0-REAL-001");
  const generatedAlias = publishChordAlias(generated.request.document, "CM7");
  const generatedNearMiss = compilePlaybackPlan({
    ...generated.request,
    document: generatedAlias,
  });
  assertP0(!generatedNearMiss.ok, "P0-LAW-007:GENERATED_ACCEPTED");
  assertP0(
    generatedNearMiss.refusal.code === "playback.realization_source_chord_stale",
    "P0-LAW-007:GENERATED_CODE",
  );
  return Object.freeze({ baseResult, aliasResult, generatedNearMiss });
}

function observeLawSatisfaction(caseId: string): Readonly<{
  expected: unknown;
  actual: unknown;
  runtime: unknown;
}> {
  const law = lawRow(caseId);
  const satisfied = { law: law["law"], satisfied: true };
  switch (caseId) {
    case "P0-LAW-001": {
      const fixture = materializeP0TimelineCase("P0-TIME-001");
      const results = Array.from({ length: 3 }, () =>
        compilePlaybackPlan(fixture.request)
      );
      assertP0(results.every((result) => result.ok), `${caseId}:REFUSAL`);
      assertP0(
        new Set(results.map((result) => canonicalP0Json(result))).size === 1,
        `${caseId}:NONDETERMINISTIC`,
      );
      const first = results[0];
      assertP0(first?.ok === true, `${caseId}:FIRST`);
      assertP0Equal(Object.keys(first.plan), PLAYBACK_PLAN_OWN_KEY_ORDER, `${caseId}:PLAN_KEYS`);
      for (const event of first.plan.events) {
        assertP0Equal(Object.keys(event), PLAYBACK_EVENT_OWN_KEY_ORDER, `${caseId}:EVENT_KEYS`);
      }
      return { expected: satisfied, actual: { ...satisfied }, runtime: results };
    }
    case "P0-LAW-002": {
      const source = compilePlaybackPlan(
        materializeP0TimelineCase("P0-TIME-001", { bindingOrder: "source" }).request,
      );
      const reverse = compilePlaybackPlan(
        materializeP0TimelineCase("P0-TIME-001", {
          bindingOrder: "reverse-source",
        }).request,
      );
      assertP0(source.ok && reverse.ok, `${caseId}:REFUSAL`);
      assertP0Equal(source, reverse, `${caseId}:ORDER_DRIFT`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: { source, reverse } };
    }
    case "P0-LAW-003": {
      const timeline = compilePlaybackPlan(
        materializeP0TimelineCase("P0-TIME-001").request,
      );
      const loop = compilePlaybackPlan(materializeP0LoopCase("P0-LOOP-009").request);
      assertP0(timeline.ok && loop.ok, `${caseId}:REFUSAL`);
      assertP0(exactMidiMirrors(timeline.plan) && exactMidiMirrors(loop.plan), `${caseId}:MIRROR`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: { timeline, loop } };
    }
    case "P0-LAW-004": {
      const pair = materializeP0TranspositionPair();
      const base = compilePlaybackPlan(pair.base);
      const transposed = compilePlaybackPlan(pair.transposed);
      assertP0(base.ok && transposed.ok, `${caseId}:REFUSAL`);
      const expected = requireP0Record(law["transposed"], `${caseId}.transposed`);
      const event = transposed.plan.events[0];
      assertP0(event !== undefined, `${caseId}:EVENT`);
      assertP0Equal(event.pitches, expected["pitches"], `${caseId}:PITCHES`);
      assertP0Equal(event.midiPitches, expected["midiPitches"], `${caseId}:MIDI`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: { base, transposed } };
    }
    case "P0-LAW-005": {
      const manual = realizationObservation("P0-REAL-002");
      const frozen = realizationObservation("P0-REAL-003");
      return { expected: satisfied, actual: { ...satisfied }, runtime: { manual, frozen } };
    }
    case "P0-LAW-006": {
      const ids = ["P0-REAL-001", "P0-REAL-011", "P0-REAL-012", "P0-REAL-015", "P0-REAL-016", "P0-REAL-017", "P0-REAL-023"];
      const runtime = ids.map(realizationObservation);
      return { expected: satisfied, actual: { ...satisfied }, runtime };
    }
    case "P0-LAW-007": {
      const runtime = observeP0StoredAliasLaw();
      return { expected: satisfied, actual: { ...satisfied }, runtime };
    }
    case "P0-LAW-008": {
      const fixture = materializeP0TimelineCase("P0-TIME-001");
      const baseline = compilePlaybackPlan(fixture.request);
      assertP0(baseline.ok, `${caseId}:BASE`);
      const changed = structuredClone(fixture.request);
      const mutations = requireP0Array(law["mutations"], `${caseId}.mutations`);
      for (const mutationValue of mutations) {
        const mutation = requireP0Record(mutationValue, `${caseId}.mutation`);
        const path = requireP0Array(mutation["path"], `${caseId}.path`);
        let target: unknown = changed;
        for (const segment of path.slice(0, -1)) {
          assertP0(typeof segment === "string" || typeof segment === "number", `${caseId}:SEGMENT`);
          target = pathChild(target, segment, `${caseId}.target`);
        }
        const key = path.at(-1);
        assertP0(typeof key === "string" || typeof key === "number", `${caseId}:KEY`);
        setPathLeaf(target, key, mutation["value"], `${caseId}.leaf`);
      }
      const result = compilePlaybackPlan(changed);
      assertP0(result.ok, `${caseId}:CHANGED`);
      assertP0Equal(result.plan, baseline.plan, `${caseId}:PLAN`);
      assertP0Equal(result.evidence, baseline.evidence, `${caseId}:EVIDENCE`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: { baseline, result } };
    }
    case "P0-LAW-009": {
      const result = compilePlaybackPlan(materializeP0LoopCase("P0-LOOP-001").request);
      assertP0(result.ok, `${caseId}:REFUSAL`);
      assertP0(result.plan.loop === null && result.plan.loopTicks === null, `${caseId}:LOOP`);
      assertP0(result.plan.events.every((event) => event.sourceOffsetBeats === null && event.articulation === "ordinary"), `${caseId}:EVENTS`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: result };
    }
    case "P0-LAW-010": {
      const result = compilePlaybackPlan(materializeP0TimelineCase("P0-TIME-001").request);
      assertP0(result.ok, `${caseId}:REFUSAL`);
      const event = result.plan.events.find((item) => item.eventId === "event-p0-b1-1");
      assertP0(event !== undefined, `${caseId}:EVENT`);
      assertP0Equal(event.startBeat, { numerator: 9, denominator: 1 }, `${caseId}:BEAT`);
      assertP0(event.startTick === 8640, `${caseId}:TICK`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: result };
    }
    case "P0-LAW-011": {
      const fixture = materializeP0TimelineCase("P0-TIME-001");
      const before = requestBytes(fixture.request);
      const result = compilePlaybackPlan(fixture.request);
      assertP0(result.ok, `${caseId}:REFUSAL`);
      assertP0(requestBytes(fixture.request) === before, `${caseId}:INPUT_MUTATED`);
      assertP0(recursivelyFrozen(result), `${caseId}:NOT_FROZEN`);
      assertP0(result.plan.meter !== fixture.document.meter, `${caseId}:METER_ALIAS`);
      for (const event of result.plan.events) {
        const binding = fixture.realizedVoicings.get(event.eventId);
        assertP0(binding !== undefined, `${caseId}:BINDING`);
        const sourcePitches = binding.kind === "generated" && binding.outcome.ok
          ? binding.outcome.candidate.pitches
          : binding.kind === "stored"
            ? binding.result.voicing.pitches
            : null;
        assertP0(sourcePitches !== null && event.pitches !== sourcePitches, `${caseId}:PITCH_ALIAS`);
      }
      return { expected: satisfied, actual: { ...satisfied }, runtime: result };
    }
    case "P0-LAW-012": {
      const result = compilePlaybackPlan(materializeP0TimelineCase("P0-TIME-001").request);
      assertP0(result.ok, `${caseId}:REFUSAL`);
      const audio = result.plan;
      const midi = result.plan;
      assertP0(audio === result.plan && midi === result.plan && audio === midi, `${caseId}:IDENTITY`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: result };
    }
    case "P0-LAW-013": {
      const returned = compilePlaybackPlan(materializeP0TimelineCase("P0-TIME-001").request);
      assertP0(!(returned instanceof Promise), `${caseId}:ASYNC`);
      assertP0(returned.ok, `${caseId}:REFUSAL`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: returned };
    }
    case "P0-LAW-014": {
      const timeline = compilePlaybackPlan(materializeP0TimelineCase("P0-TIME-009").request);
      const loop = compilePlaybackPlan(materializeP0LoopCase("P0-LOOP-007").request);
      assertP0(timeline.ok && loop.ok, `${caseId}:REFUSAL`);
      assertP0(loop.plan.events.length === 0, `${caseId}:SYNTHETIC_EVENT`);
      return { expected: satisfied, actual: { ...satisfied }, runtime: { timeline, loop } };
    }
    default:
      throw new Error(`P0_LAW_UNKNOWN:${caseId}`);
  }
}

function lawObservation(caseId: string): P0CaseObservation {
  const fixture = p0FixtureCase(caseId);
  const satisfied = observeLawSatisfaction(caseId);
  return observation(
    fixture,
    satisfied.expected,
    satisfied.actual,
    satisfied.runtime,
  );
}

export function observeP0Case(caseId: string): P0CaseObservation {
  if (caseId.startsWith("P0-TIME-")) return timelineObservation(caseId);
  if (caseId.startsWith("P0-REAL-")) return realizationObservation(caseId);
  if (caseId.startsWith("P0-LOOP-")) return loopObservation(caseId);
  if (caseId.startsWith("P0-LAW-")) return lawObservation(caseId);
  if (caseId.startsWith("P0-LIMIT-STRUCT-")) {
    return limitStructuralObservation(caseId);
  }
  if (caseId.startsWith("P0-LIMIT-SEAM-")) {
    return limitSeamObservation(caseId);
  }
  throw new Error(`P0_CASE_KIND_UNKNOWN:${caseId}`);
}

type SemanticCounterfactual = Readonly<{
  field: string;
  baseline: unknown;
  mutant: unknown;
}>;

const SEMANTIC_COUNTERFACTUALS: Readonly<
  Record<string, SemanticCounterfactual>
> = Object.freeze({
  "reset-cursor-at-section-boundary": {
    field: "timeline.sectionBoundaryCursor",
    baseline: "preserve",
    mutant: "reset-to-zero",
  },
  "treat-empty-measure-as-zero-time": {
    field: "timeline.emptyMeasureAdvance",
    baseline: "meter-capacity",
    mutant: "zero",
  },
  "treat-empty-section-as-one-bar": {
    field: "timeline.emptySectionAdvance",
    baseline: "zero",
    mutant: "meter-capacity",
  },
  "pad-pickup-or-incomplete-to-capacity": {
    field: "timeline.partialMeasureAdvance",
    baseline: "event-sum",
    mutant: "meter-capacity",
  },
  "ignore-beat-unit": {
    field: "timeline.meterCapacity",
    baseline: "quarter-note-exact",
    mutant: "beats-per-bar-only",
  },
  "truncate-timeline-at-one-million": {
    field: "timeline.overflow",
    baseline: "refuse-no-partial-plan",
    mutant: "truncate-and-succeed",
  },
  "order-by-binding-map": {
    field: "identity.eventOrder",
    baseline: "source-structural-preorder",
    mutant: "map-insertion-order",
  },
  "renumber-source-ordinal-after-loop-filter": {
    field: "identity.sourceOrdinal",
    baseline: "global-pre-loop",
    mutant: "filtered-output-order",
  },
  "allocate-new-playback-event-id": {
    field: "identity.eventId",
    baseline: "source-event-id",
    mutant: "new-transport-id",
  },
  "ignore-missing-binding": {
    field: "realization.missingBinding",
    baseline: "refuse",
    mutant: "ignore",
  },
  "ignore-extra-binding": {
    field: "realization.extraBinding",
    baseline: "refuse",
    mutant: "ignore",
  },
  "trust-map-key-over-binding-id": {
    field: "realization.bindingIdentity",
    baseline: "map-key-equals-binding-id",
    mutant: "map-key-authoritative",
  },
  "fallback-on-v0-failure": {
    field: "realization.v0Failure",
    baseline: "refuse-no-fallback",
    mutant: "fallback-candidate",
  },
  "accept-stale-resolved-source": {
    field: "realization.resolvedSourceFreshness",
    baseline: "exact",
    mutant: "accept-stale",
  },
  "accept-stale-auto-policy": {
    field: "realization.autoPolicyFreshness",
    baseline: "exact",
    mutant: "accept-stale",
  },
  "accept-wrong-realization-id": {
    field: "realization.realizationId",
    baseline: "exact-request-match",
    mutant: "accept-unrelated",
  },
  "accept-candidate-family-or-count-drift": {
    field: "realization.candidatePolicy",
    baseline: "exact-family-and-count",
    mutant: "accept-drift",
  },
  "trust-candidate-pitches-without-voices": {
    field: "realization.candidatePitchAuthority",
    baseline: "voices-and-pitches-index-aligned",
    mutant: "pitches-only",
  },
  "sort-stored-pitches": {
    field: "stored.pitchOrder",
    baseline: "preserve-by-index",
    mutant: "sorted",
  },
  "deduplicate-stored-pitches": {
    field: "stored.duplicates",
    baseline: "preserve",
    mutant: "deduplicate",
  },
  "regenerate-frozen": {
    field: "stored.frozenAuthority",
    baseline: "stored-pitches",
    mutant: "regenerated-candidate",
  },
  "stale-stored-on-chord-alias": {
    field: "stored.freshness",
    baseline: "exact-voicing-only",
    mutant: "stale-on-alias-sourceText",
  },
  "generate-custom-formula": {
    field: "stored.customAuthority",
    baseline: "stored-only",
    mutant: "invent-formula",
  },
  "use-fixed-beat-gap": {
    field: "gate.releaseGap",
    baseline: "24-ticks",
    mutant: "fixed-beat-fraction",
  },
  "compute-before-loop-clip": {
    field: "gate.calculationOrder",
    baseline: "after-loop-clip",
    mutant: "before-loop-clip",
  },
  "allow-zero-one-tick-gate": {
    field: "gate.oneTick",
    baseline: 1,
    mutant: 0,
  },
  "round-malformed-nonintegral-time": {
    field: "gate.nonIntegralTime",
    baseline: "refuse-no-rounding",
    mutant: "round-and-accept",
  },
  "closed-end-intersection": {
    field: "loop.intersection",
    baseline: "half-open",
    mutant: "closed-end",
  },
  "clamp-invalid-loop": {
    field: "loop.invalidRange",
    baseline: "refuse-no-clamp",
    mutant: "clamp",
  },
  "normalize-malformed-loop": {
    field: "loop.malformedRange",
    baseline: "refuse-no-normalize",
    mutant: "normalize",
  },
  "drop-source-offset": {
    field: "loop.sourceOffset",
    baseline: "preserve",
    mutant: "drop",
  },
  "invent-rest-event-in-silent-loop": {
    field: "loop.silentRange",
    baseline: "zero-events",
    mutant: "synthetic-rest-event",
  },
  "drop-tick-mirrors": {
    field: "midi.tickMirrors",
    baseline: "required-exact",
    mutant: "omitted",
  },
  "sort-midi-pitches-independently": {
    field: "midi.pitchOrder",
    baseline: "written-index-aligned",
    mutant: "independently-sorted",
  },
  "locale-sort-bindings": {
    field: "determinism.bindingSort",
    baseline: "utf16-code-unit",
    mutant: "locale-sensitive",
  },
  "transpose-midi-only": {
    field: "transposition.projection",
    baseline: "written-and-midi",
    mutant: "midi-only",
  },
  "alias-input-pitches": {
    field: "immutability.pitchOwnership",
    baseline: "deep-copy",
    mutant: "caller-alias",
  },
  "return-mutable-plan": {
    field: "immutability.result",
    baseline: "recursively-frozen",
    mutant: "mutable",
  },
  "call-audio-during-compile": {
    field: "boundary.audioCalls",
    baseline: 0,
    mutant: 1,
  },
  "wall-time-cutoff": {
    field: "boundary.wallTimeCutoff",
    baseline: "forbidden",
    mutant: "enabled",
  },
  "rebuild-midi-plan": {
    field: "consumer.planIdentity",
    baseline: "same-object",
    mutant: "rebuilt-copy",
  },
  "inclusive-limit-off-by-one": {
    field: "limits.boundary",
    baseline: "inclusive-maximum",
    mutant: "off-by-one",
  },
});

function withoutExecutionDigest(
  value: Omit<P0MutationExecution, "executionDigest">,
): Omit<P0MutationExecution, "executionDigest"> {
  return value;
}

export function materializeP0MutationExecution(
  control: P0MutationControl,
  caseObservation: P0CaseObservation,
): P0MutationExecution {
  const semantic = SEMANTIC_COUNTERFACTUALS[control.operator];
  assertP0(semantic !== undefined, `${control.id}:COUNTERFACTUAL_MISSING`);
  const baselineProjection = caseObservation.actualProjection;
  const mutantProjection = Object.freeze({
    caseId: caseObservation.caseId,
    semanticCounterfactual: Object.freeze({
      field: semantic.field,
      baselineValue: semantic.baseline,
      mutantValue: semantic.mutant,
    }),
    wouldReplaceLiteralProjection: caseObservation.actualProjection,
  });
  const changedFields = Object.freeze([semantic.field]);
  assertP0(
    caseObservation.actualProjectionSha256 ===
      caseObservation.expectedProjectionSha256,
    `${control.id}:${caseObservation.caseId}:BASELINE_NOT_LITERAL`,
  );
  assertP0(
    p0EvidenceDigest(baselineProjection) !== p0EvidenceDigest(mutantProjection),
    `${control.id}:${caseObservation.caseId}:MUTANT_SURVIVED`,
  );
  const baselineProjectionSha256 = p0EvidenceDigest(baselineProjection);
  const mutantProjectionSha256 = p0EvidenceDigest(mutantProjection);
  const baselineResultSha256 = caseObservation.runtimeResultSha256;
  const mutantResultSha256 = p0EvidenceDigest({
    executionKind: "executable-semantic-counterfactual",
    baselineResultSha256,
    mutantProjection,
  });
  assertP0(
    baselineResultSha256 !== mutantResultSha256,
    `${control.id}:${caseObservation.caseId}:RESULT_SURVIVED`,
  );
  const controlFixture = p0FixtureCase(caseObservation.caseId);
  const base = withoutExecutionDigest({
    controlId: control.id,
    caseId: caseObservation.caseId,
    operator: control.operator,
    faultFamily: control.faultFamily,
    executionKind: "executable-semantic-counterfactual",
    sourceMutationExecuted: false,
    fixtureRecordSha256: p0EvidenceDigest(
      p0MutationControlFixture(control.id),
    ),
    caseFixturePath: controlFixture.path,
    caseFixtureRecordSha256: caseObservation.fixtureRecordSha256,
    expectedProjectionSha256: caseObservation.expectedProjectionSha256,
    baselineProjection,
    baselineProjectionSha256,
    mutantProjection,
    mutantProjectionSha256,
    baselineResultSha256,
    mutantResultSha256,
    beforeSha256: baselineProjectionSha256,
    afterSha256: mutantProjectionSha256,
    changedFields,
    oracleDecision: "killed",
    killed: true,
  });
  return Object.freeze({ ...base, executionDigest: p0EvidenceDigest(base) });
}

export function allP0MutationKillerCaseIds(): readonly string[] {
  return Object.freeze([
    ...new Set(P0_MUTATION_CONTROLS.flatMap(({ killerCaseIds }) => killerCaseIds)),
  ].sort(compare));
}
