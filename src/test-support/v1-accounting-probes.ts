import {
  VOICE_ASSIGNMENT_MEMORY_COUNTER_NAMES,
  VOICE_ASSIGNMENT_WORK_COUNTER_NAMES,
  type VoiceAssignmentMemoryCounterName,
  type VoiceAssignmentWorkCounterName,
  type VoiceAssignmentWorkEvidence,
  type VoiceAssignmentWorkLimitRefusal,
} from "../theory/voice-assignment-contract";
import {
  observeVoiceAssignmentAccountingBoundary,
  type VoiceAssignmentAccountingBoundaryObservation,
} from "../theory/voice-assignment";

export const V1_ACCOUNTING_PROBE_REPORT_SCHEMA =
  "changes.test-support.v1-accounting-probes.v1";

export type V1AccountingProbeFixtureRow = Readonly<{
  id: string;
  counter: string;
  maximum: number;
  received: number;
}>;

export type V1AccountingProbeCase = Readonly<{
  id: string;
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName;
  counterKind: "work" | "memory";
  maximum: number;
  received: number;
  exactLimit: Readonly<{
    accepted: true;
    recorded: number;
  }>;
  exactPlusOne: Readonly<{
    accepted: false;
    recorded: number;
    refusal: VoiceAssignmentWorkLimitRefusal;
    evidence: VoiceAssignmentWorkEvidence &
      Readonly<{ termination: "work-limit-exceeded" }>;
  }>;
  firstProspectiveExcessWins: boolean;
}>;

export type V1AccountingProbeFinding = Readonly<{
  code:
    | "V1_ACCOUNTING_PROBE_ID_INVALID"
    | "V1_ACCOUNTING_PROBE_ID_DUPLICATE"
    | "V1_ACCOUNTING_PROBE_COUNTER_INVALID"
    | "V1_ACCOUNTING_PROBE_COUNTER_DUPLICATE"
    | "V1_ACCOUNTING_PROBE_MAXIMUM_MISMATCH"
    | "V1_ACCOUNTING_PROBE_RECEIVED_MISMATCH"
    | "V1_ACCOUNTING_PROBE_OBSERVATION_MISMATCH";
  path: string;
  message: string;
}>;

export type V1AccountingProbeReport = Readonly<{
  schema: typeof V1_ACCOUNTING_PROBE_REPORT_SCHEMA;
  package: "V1";
  outcome: "pass" | "fail";
  counts: Readonly<{
    requested: number;
    executed: number;
    passed: number;
    failed: number;
    workCounters: number;
    memoryCounters: number;
  }>;
  cases: readonly V1AccountingProbeCase[];
  findings: readonly V1AccountingProbeFinding[];
}>;

function isWorkCounterName(value: string): value is VoiceAssignmentWorkCounterName {
  return VOICE_ASSIGNMENT_WORK_COUNTER_NAMES.some((counter) => counter === value);
}

function isMemoryCounterName(
  value: string,
): value is VoiceAssignmentMemoryCounterName {
  return VOICE_ASSIGNMENT_MEMORY_COUNTER_NAMES.some(
    (counter) => counter === value,
  );
}

function freezeCase(
  id: string,
  observation: VoiceAssignmentAccountingBoundaryObservation,
): V1AccountingProbeCase {
  return Object.freeze({
    id,
    counter: observation.counter,
    counterKind: observation.counterKind,
    maximum: observation.maximum,
    received: observation.maximum + 1,
    exactLimit: observation.exactLimit,
    exactPlusOne: observation.exactPlusOne,
    firstProspectiveExcessWins: observation.firstProspectiveExcessWins,
  });
}

/** Execute one independently named fixture probe through the private ledger. */
export function executeV1AccountingProbe(
  row: V1AccountingProbeFixtureRow,
): V1AccountingProbeCase {
  if (!isWorkCounterName(row.counter) && !isMemoryCounterName(row.counter)) {
    throw new RangeError(`Unknown V1 accounting counter: ${row.counter}`);
  }
  return freezeCase(
    row.id,
    observeVoiceAssignmentAccountingBoundary(row.counter),
  );
}

function finding(
  code: V1AccountingProbeFinding["code"],
  path: string,
  message: string,
): V1AccountingProbeFinding {
  return Object.freeze({ code, path, message });
}

function observationMatches(
  row: V1AccountingProbeFixtureRow,
  actual: V1AccountingProbeCase,
): boolean {
  return actual.maximum === row.maximum &&
    actual.received === row.received &&
    actual.exactLimit.recorded === row.maximum &&
    actual.exactPlusOne.recorded === row.maximum &&
    actual.exactPlusOne.refusal.counter === row.counter &&
    actual.exactPlusOne.refusal.maximum === row.maximum &&
    actual.exactPlusOne.refusal.received === row.received &&
    actual.firstProspectiveExcessWins;
}

/**
 * Build deterministic, fixture-ordered diagnostics for all reviewed probes.
 * Invalid fixture rows become findings instead of reaching the typed seam.
 */
export function buildV1AccountingProbeReport(
  rows: readonly V1AccountingProbeFixtureRow[],
): V1AccountingProbeReport {
  const cases: V1AccountingProbeCase[] = [];
  const findings: V1AccountingProbeFinding[] = [];
  const seenIds = new Set<string>();
  const seenCounters = new Set<string>();
  let passed = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === undefined) continue;
    const path = `derivedAccountingProbes[${index.toString()}]`;
    let rowValid = true;
    if (!/^V1-LIM-PROBE-[0-9]{3}$/u.test(row.id)) {
      findings.push(finding(
        "V1_ACCOUNTING_PROBE_ID_INVALID",
        `${path}.id`,
        "Probe ID must use the reviewed V1-LIM-PROBE-NNN shape.",
      ));
      rowValid = false;
    } else if (seenIds.has(row.id)) {
      findings.push(finding(
        "V1_ACCOUNTING_PROBE_ID_DUPLICATE",
        `${path}.id`,
        "Probe IDs must be unique.",
      ));
      rowValid = false;
    }
    seenIds.add(row.id);

    if (!isWorkCounterName(row.counter) && !isMemoryCounterName(row.counter)) {
      findings.push(finding(
        "V1_ACCOUNTING_PROBE_COUNTER_INVALID",
        `${path}.counter`,
        "Probe counter is not a declared V1 work or memory counter.",
      ));
      continue;
    }
    if (seenCounters.has(row.counter)) {
      findings.push(finding(
        "V1_ACCOUNTING_PROBE_COUNTER_DUPLICATE",
        `${path}.counter`,
        "Every V1 work and memory counter must appear exactly once.",
      ));
      rowValid = false;
    }
    seenCounters.add(row.counter);

    const actual = executeV1AccountingProbe(row);
    cases.push(actual);
    if (actual.maximum !== row.maximum) {
      findings.push(finding(
        "V1_ACCOUNTING_PROBE_MAXIMUM_MISMATCH",
        `${path}.maximum`,
        "Fixture maximum does not match the production accounting limit.",
      ));
      rowValid = false;
    }
    if (row.received !== row.maximum + 1) {
      findings.push(finding(
        "V1_ACCOUNTING_PROBE_RECEIVED_MISMATCH",
        `${path}.received`,
        "The reviewed prospective value must be exact maximum plus one.",
      ));
      rowValid = false;
    }
    if (!observationMatches(row, actual)) {
      findings.push(finding(
        "V1_ACCOUNTING_PROBE_OBSERVATION_MISMATCH",
        path,
        "Exact/+1 accounting did not produce the reviewed all-or-nothing refusal.",
      ));
      rowValid = false;
    }
    if (rowValid) passed += 1;
  }

  const frozenCases = Object.freeze(cases);
  const frozenFindings = Object.freeze(findings);
  return Object.freeze({
    schema: V1_ACCOUNTING_PROBE_REPORT_SCHEMA,
    package: "V1",
    outcome: frozenFindings.length === 0 ? "pass" : "fail",
    counts: Object.freeze({
      requested: rows.length,
      executed: frozenCases.length,
      passed,
      failed: rows.length - passed,
      workCounters: frozenCases.filter(({ counterKind }) =>
        counterKind === "work"
      ).length,
      memoryCounters: frozenCases.filter(({ counterKind }) =>
        counterKind === "memory"
      ).length,
    }),
    cases: frozenCases,
    findings: frozenFindings,
  });
}
