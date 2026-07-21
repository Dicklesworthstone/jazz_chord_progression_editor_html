import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

type JsonRecord = Record<string, unknown>;

export type X0ListeningFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  disposition: "fail" | "incomplete";
}>;

export type X0ListeningReport = Readonly<{
  schema: "changes.validation.x0-listening-evidence.v1";
  traceId: "TR-X0-LISTENING";
  outcome: "pass" | "fail" | "incomplete";
  expectedRecords: number;
  observedRecords: number;
  passingRecords: number;
  unsupportedRecords: number;
  failingRecords: number;
  expectedCells: readonly string[];
  observedCells: readonly string[];
  findings: readonly X0ListeningFinding[];
}>;

const DEFAULT_EVIDENCE_PATH =
  "release-evidence/audio/listening/x0-listening-v1.json";
const RUBRIC_PATH = "tests/fixtures/audio-engine/listening-rubric.json";
const TRACE_PATH = "tests/fixtures/audio-engine/trace-ledger.json";
const AUTOMATION_REVIEWER = /(?:agent|automation|bot|chatgpt|claude|codex|gemini|model)/iu;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finding(
  code: string,
  path: string,
  message: string,
  disposition: X0ListeningFinding["disposition"],
): X0ListeningFinding {
  return Object.freeze({ code, path, message, disposition });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function requiredListeningCaseIds(trace: JsonRecord): readonly string[] {
  const row = records(trace["traces"]).find(
    (entry) => entry["id"] === "TR-X0-LISTENING",
  );
  return row === undefined ? [] : [...strings(row["caseIds"])].sort(compare);
}

function cellKey(caseId: string, browser: string, output: string): string {
  return `${caseId}|${browser}|${output}`;
}

export function validateX0ListeningEvidence(
  evidence: unknown,
  rubric: JsonRecord,
  trace: JsonRecord,
  rubricSha256: string,
): X0ListeningReport {
  const findings: X0ListeningFinding[] = [];
  const requiredCases = requiredListeningCaseIds(trace);
  const browsers = strings(rubric["requiredBrowsers"]);
  const outputs = strings(rubric["requiredOutputs"]);
  const requiredFields = strings(rubric["requiredRecordFields"]);
  const expectedCells = requiredCases
    .flatMap((caseId) =>
      browsers.flatMap((browser) =>
        outputs.map((output) => cellKey(caseId, browser, output)),
      ),
    )
    .sort(compare);

  if (requiredCases.length === 0 || browsers.length === 0 || outputs.length === 0) {
    findings.push(
      finding(
        "X0_LISTENING_AUTHORITY_INVALID",
        "authority",
        "The reviewed trace and rubric must define cases, browsers, and outputs.",
        "fail",
      ),
    );
  }

  const evidencePresent = isRecord(evidence);
  if (!evidencePresent) {
    findings.push(
      finding(
        "X0_LISTENING_EVIDENCE_MISSING",
        DEFAULT_EVIDENCE_PATH,
        "The tracked human listening evidence file is missing or is not an object.",
        "incomplete",
      ),
    );
  }

  const root = evidencePresent ? evidence : {};
  if (
    evidencePresent &&
    (
      root["schema"] !== "changes.release-evidence.x0-listening.v1" ||
      root["traceId"] !== "TR-X0-LISTENING" ||
      root["rubricSchema"] !== rubric["schema"] ||
      root["rubricSha256"] !== rubricSha256
    )
  ) {
    findings.push(
      finding(
        "X0_LISTENING_IDENTITY",
        "evidence",
        "Schema, trace, rubric schema, and rubric byte hash must bind the current authority.",
        "fail",
      ),
    );
  }

  const attestation = isRecord(root["attestation"])
    ? root["attestation"]
    : {};
  if (
    evidencePresent &&
    (
      attestation["automatedListeningClaim"] !== false ||
      attestation["reviewerIsHuman"] !== true ||
      attestation["recordsCreatedAfterAudition"] !== true ||
      attestation["outputCategoriesPhysicallyVerified"] !== true
    )
  ) {
    findings.push(
      finding(
        "X0_LISTENING_ATTESTATION",
        "attestation",
        "A human must attest that every record follows a physical audition and that automation made no listening claim.",
        "incomplete",
      ),
    );
  }

  const observedCells: string[] = [];
  const seen = new Map<string, number>();
  let passingRecords = 0;
  let unsupportedRecords = 0;
  let failingRecords = 0;
  const evidenceRecords = records(root["records"]);
  if (evidencePresent && !Array.isArray(root["records"])) {
    findings.push(
      finding(
        "X0_LISTENING_RECORDS",
        "records",
        "Human listening records must be an array.",
        "fail",
      ),
    );
  }

  for (const [index, record] of evidenceRecords.entries()) {
    const path = `records[${String(index)}]`;
    const missing = requiredFields.filter((field) => !(field in record));
    if (missing.length > 0) {
      findings.push(
        finding(
          "X0_LISTENING_REQUIRED_FIELD",
          path,
          `Missing required fields: ${missing.join(", ")}.`,
          "fail",
        ),
      );
    }

    const caseId = record["caseId"];
    const browser = record["browserName"];
    const output = record["outputCategory"];
    if (
      typeof caseId !== "string" ||
      typeof browser !== "string" ||
      typeof output !== "string"
    ) {
      findings.push(
        finding(
          "X0_LISTENING_CELL_IDENTITY",
          path,
          "caseId, browserName, and outputCategory must be strings.",
          "fail",
        ),
      );
      continue;
    }
    const key = cellKey(caseId, browser, output);
    observedCells.push(key);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!expectedCells.includes(key)) {
      findings.push(
        finding(
          "X0_LISTENING_UNEXPECTED_CELL",
          path,
          `The cell ${key} is outside the X0 listening trace matrix.`,
          "fail",
        ),
      );
    }

    const date = record["date"];
    const reviewer = record["reviewer"];
    const browserVersion = record["browserVersion"];
    const operatingSystem = record["operatingSystem"];
    const notes = record["notes"];
    const knownLimitations = record["knownLimitations"];
    if (typeof date !== "string" || !validDate(date)) {
      findings.push(
        finding("X0_LISTENING_DATE", `${path}.date`, "date must be a real YYYY-MM-DD UTC calendar date.", "fail"),
      );
    }
    if (
      typeof reviewer !== "string" ||
      reviewer.trim().length < 2 ||
      AUTOMATION_REVIEWER.test(reviewer)
    ) {
      findings.push(
        finding(
          "X0_LISTENING_REVIEWER",
          `${path}.reviewer`,
          "reviewer must identify a human and must not identify an automated agent or model.",
          "fail",
        ),
      );
    }
    for (const [field, value] of [
      ["browserVersion", browserVersion],
      ["operatingSystem", operatingSystem],
      ["notes", notes],
    ] as const) {
      if (typeof value !== "string" || value.trim().length === 0) {
        findings.push(
          finding(
            "X0_LISTENING_TEXT_FIELD",
            `${path}.${field}`,
            `${field} must be a non-empty string.`,
            "fail",
          ),
        );
      }
    }
    if (typeof knownLimitations !== "string") {
      findings.push(
        finding(
          "X0_LISTENING_TEXT_FIELD",
          `${path}.knownLimitations`,
          "knownLimitations must be a string; use an empty string only when none were observed.",
          "fail",
        ),
      );
    }

    const result = record["result"];
    if (result === "pass") passingRecords += 1;
    else if (result === "fail") {
      failingRecords += 1;
      findings.push(
        finding(
          "X0_LISTENING_FAILED",
          `${path}.result`,
          "A human listening cell reported a release-blocking failure.",
          "fail",
        ),
      );
    } else if (result === "not-supported-with-recorded-reason") {
      unsupportedRecords += 1;
      findings.push(
        finding(
          "X0_LISTENING_UNSUPPORTED",
          `${path}.result`,
          "Unsupported hardware or browser narrows support and leaves the full X0 listening gate incomplete.",
          "incomplete",
        ),
      );
    } else {
      findings.push(
        finding(
          "X0_LISTENING_RESULT",
          `${path}.result`,
          "result must use the reviewed rubric vocabulary.",
          "fail",
        ),
      );
    }
  }

  for (const expected of expectedCells) {
    const count = seen.get(expected) ?? 0;
    if (count === 0) {
      findings.push(
        finding(
          "X0_LISTENING_CELL_MISSING",
          expected,
          "The required human listening cell has no record.",
          "incomplete",
        ),
      );
    } else if (count > 1) {
      findings.push(
        finding(
          "X0_LISTENING_CELL_DUPLICATE",
          expected,
          `Expected one record and found ${String(count)}.`,
          "fail",
        ),
      );
    }
  }

  findings.sort((left, right) =>
    compare(
      `${left.disposition}:${left.code}:${left.path}:${left.message}`,
      `${right.disposition}:${right.code}:${right.path}:${right.message}`,
    ),
  );
  const outcome = findings.some((item) => item.disposition === "fail")
    ? "fail"
    : findings.length > 0
      ? "incomplete"
      : "pass";
  return Object.freeze({
    schema: "changes.validation.x0-listening-evidence.v1",
    traceId: "TR-X0-LISTENING",
    outcome,
    expectedRecords: expectedCells.length,
    observedRecords: evidenceRecords.length,
    passingRecords,
    unsupportedRecords,
    failingRecords,
    expectedCells: Object.freeze(expectedCells),
    observedCells: Object.freeze([...observedCells].sort(compare)),
    findings: Object.freeze(findings),
  });
}

async function readObject(path: string): Promise<Readonly<{
  bytes: Uint8Array;
  value: JsonRecord;
}>> {
  const bytes = new Uint8Array(await readFile(path));
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value)) throw new Error(`${path} must contain one JSON object.`);
  return { bytes, value };
}

async function main(): Promise<void> {
  const evidencePath = Bun.argv[2] ?? DEFAULT_EVIDENCE_PATH;
  const [rubric, trace] = await Promise.all([
    readObject(RUBRIC_PATH),
    readObject(TRACE_PATH),
  ]);
  let evidence: unknown;
  try {
    evidence = (await readObject(evidencePath)).value;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      evidence = null;
    } else {
      throw error;
    }
  }
  const report = validateX0ListeningEvidence(
    evidence,
    rubric.value,
    trace.value,
    sha256(rubric.bytes),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        schema: "changes.validation.x0-listening-evidence.v1",
        outcome: "tool-failure",
        message: error instanceof Error ? error.message : "Unknown verifier failure.",
      }, null, 2)}\n`,
    );
    process.exitCode = 2;
  }
}
