import { mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";

export const JCPE_E2E_RUN_ID_ENV = "JCPE_E2E_RUN_ID";
export const STANDALONE_EVIDENCE_SEED = "F0-NETWORK-01:v1";

export type BrowserMode = "file" | "http";
export type EvidenceOutcome = "pass" | "fail";
export type AssertionOutcome = "pass" | "fail";

export type RequestEvidence = {
  id: string;
  sequence: number;
  method: string;
  normalizedUrl: string;
  resourceType: string;
  navigation: boolean;
  disposition: "allowed-document" | "blocked";
  status?: number;
  failure?: string;
};

export type ConsoleEvidence = {
  id: string;
  sequence: number;
  type: string;
  text: string;
  location?: string;
};

export type EvidenceFinding = {
  code: string;
  message: string;
  diagnosticIds: string[];
};

export type StandaloneDiagnostics = {
  requests: RequestEvidence[];
  console: ConsoleEvidence[];
  pageErrors: string[];
  webErrors: string[];
  workers: string[];
  webSockets: string[];
  dialogs: string[];
  pages: string[];
  resourceEntries: string[];
};

export type StandaloneCellInput = {
  browser: string;
  browserVersion: string;
  mode: BrowserMode;
  toolVersion: string;
  artifactHash: string;
  artifactBytes: number;
  outcome: EvidenceOutcome;
  assertions: Record<string, AssertionOutcome>;
  findings: EvidenceFinding[];
  diagnostics: StandaloneDiagnostics;
};

export type StandaloneCellEvidence = StandaloneCellInput & {
  schemaVersion: 1;
  traceId: "F0-NETWORK-01";
  seed: typeof STANDALONE_EVIDENCE_SEED;
  runId: string;
};

function requireRunId(): string {
  const value = process.env[JCPE_E2E_RUN_ID_ENV];
  if (!value || !/^[A-Za-z0-9._-]{8,128}$/u.test(value)) {
    throw new Error(
      `${JCPE_E2E_RUN_ID_ENV} must be a unique 8-128 character run identifier.`,
    );
  }
  return value;
}

function safeSegment(value: string, name: string): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error(`${name} is not safe for an evidence filename.`);
  }
  return value;
}

export function diagnosticId(kind: string, sequence: number): string {
  return `${safeSegment(kind, "Diagnostic kind")}-${String(sequence).padStart(3, "0")}`;
}

export function createStandaloneCellEvidence(
  input: StandaloneCellInput,
): StandaloneCellEvidence {
  return {
    schemaVersion: 1,
    traceId: "F0-NETWORK-01",
    seed: STANDALONE_EVIDENCE_SEED,
    runId: requireRunId(),
    ...input,
  };
}

export async function writeStandaloneCellEvidence(
  evidence: StandaloneCellEvidence,
  options: { writerId?: string } = {},
): Promise<string> {
  if (evidence.runId !== requireRunId()) {
    throw new Error("Evidence run ID does not match the active Playwright run.");
  }
  const writerId = safeSegment(options.writerId ?? "w0-r0", "Writer ID");
  const directory = resolve(
    "test-results/standalone-browser-evidence-runs",
    safeSegment(evidence.runId, "Run ID"),
  );
  await mkdir(directory, { recursive: true });
  const path = resolve(
    directory,
    `${safeSegment(evidence.browser, "Browser")}-${evidence.mode}-${writerId}.json`,
  );
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return path;
}
