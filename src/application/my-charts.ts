import { copyDomain, decodeDocumentShape, makeBeatPosition, type StableIdFactory, type ValidatedDocument } from "../domain";
import { serializeCanonicalDocument } from "../export";
import { MY_CHARTS_LIMITS, checkStoredCharts, isMyChartsRecordId, isMyChartsTimestamp, myChartsUtf8Length,
  type MyChartsResult, type StoredChart } from "../persistence";
import { createInitialAppState, runDocumentCommand } from "./application-state";
import { validateDocumentSemantics } from "./document-validation";
import { classifyJsonLexically, parseJsonData } from "./e0-interchange";
import { createStudioApplicationDependencies, STUDIO_INITIAL_PANELS } from "./studio-bootstrap";

export type KeptChart = StoredChart & Readonly<{ document: ValidatedDocument }>;
export type MyChartsRestorePlan = Readonly<{ local: readonly KeptChart[]; incoming: readonly KeptChart[];
  additions: readonly string[]; identical: readonly string[]; conflicts: readonly string[] }>;
export type MyChartsConflictChoice = "local" | "backup";
const invalidBackup = { ok: false, code: "my-charts.invalid_backup" } as const;
const invalidDocument = { ok: false, code: "my-charts.invalid_document" } as const;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Bound recursion before E0's duplicate-key scanner or the owned host parse.
 * Braces in strings, including escaped quotes/backslashes, never add depth. */
function shallowJson(text: string): boolean {
  let quoted = false, escaped = false, depth = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") { depth++; if (depth > 32) return false; }
    else if (char === "}" || char === "]") { depth--; if (depth < 0) return false; }
  }
  return !quoted && depth === 0;
}
function parseBoundedJson(text: string): MyChartsResult<unknown> {
  if (text.charCodeAt(0) === 0xfeff || !shallowJson(text) || !classifyJsonLexically(text).ok) return invalidBackup;
  const result = parseJsonData(text);
  return result.ok ? result : invalidBackup;
}

export function decodeKeptChart(record: StoredChart): MyChartsResult<KeptChart> {
  if (!isMyChartsRecordId(record.recordId) || !isMyChartsTimestamp(record.updatedAt)) return invalidBackup;
  if (myChartsUtf8Length(record.documentText, MY_CHARTS_LIMITS.documentBytes) > MY_CHARTS_LIMITS.documentBytes) {
    return { ok: false, code: "my-charts.document_limit" };
  }
  const parsed = parseBoundedJson(record.documentText);
  if (!parsed.ok) return invalidDocument;
  const decoded = decodeDocumentShape(parsed.value);
  if (!decoded.ok) return invalidDocument;
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) return invalidDocument;
  return keepChartDocument(published.value, record.recordId, record.updatedAt);
}
export function keepChartDocument(document: ValidatedDocument, recordId: string, updatedAt: string): MyChartsResult<KeptChart> {
  const record = Object.freeze({ recordId, updatedAt, documentText: serializeCanonicalDocument(document), document });
  const checked = checkStoredCharts([record]);
  return checked.ok ? { ok: true, value: record } : checked;
}
export function decodeKeptCharts(records: readonly StoredChart[]): MyChartsResult<readonly KeptChart[]> {
  const checked = checkStoredCharts(records);
  if (!checked.ok) return checked;
  const result: KeptChart[] = [];
  for (const record of records) {
    const decoded = decodeKeptChart(record);
    if (!decoded.ok) return decoded;
    result.push(decoded.value);
  }
  const canonicalSize = checkStoredCharts(result);
  return canonicalSize.ok ? { ok: true, value: Object.freeze(result) } : canonicalSize;
}

export function decodeMyChartsBackup(text: string): MyChartsResult<readonly KeptChart[]> {
  if (myChartsUtf8Length(text, MY_CHARTS_LIMITS.backupBytes) > MY_CHARTS_LIMITS.backupBytes) return { ok: false, code: "my-charts.backup_limit" };
  const parsed = parseBoundedJson(text);
  if (!parsed.ok) return parsed;
  const raw = parsed.value;
  if (!object(raw) || Object.keys(raw).length !== 2 || raw["schema"] !== "changes.my-charts.backup.v1" || !Array.isArray(raw["records"])) return invalidBackup;
  if (raw["records"].length > MY_CHARTS_LIMITS.records) return { ok: false, code: "my-charts.record_limit" };
  const records: StoredChart[] = [];
  const rawRecords: readonly unknown[] = raw["records"];
  for (const row of rawRecords) {
    if (!object(row) || Object.keys(row).length !== 3 || !isMyChartsRecordId(row["recordId"]) ||
      !isMyChartsTimestamp(row["updatedAt"]) || typeof row["documentText"] !== "string") return invalidBackup;
    records.push({ recordId: row["recordId"], updatedAt: row["updatedAt"], documentText: row["documentText"] });
  }
  return decodeKeptCharts(records);
}

export function encodeMyChartsBackup(records: readonly KeptChart[]): MyChartsResult<string> {
  const checked = checkStoredCharts(records);
  if (!checked.ok) return checked;
  const sorted = [...records].sort((a, b) => a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0);
  const text = JSON.stringify({ schema: "changes.my-charts.backup.v1", records: sorted.map(row => ({
    recordId: row.recordId, updatedAt: row.updatedAt, documentText: row.documentText,
  })) }) + "\n";
  return myChartsUtf8Length(text, MY_CHARTS_LIMITS.backupBytes) > MY_CHARTS_LIMITS.backupBytes
    ? { ok: false, code: "my-charts.backup_limit" } : { ok: true, value: text };
}

export function planMyChartsRestore(local: readonly KeptChart[], incoming: readonly KeptChart[]): MyChartsRestorePlan {
  const existing = new Map(local.map(record => [record.recordId, record]));
  const additions: string[] = [], identical: string[] = [], conflicts: string[] = [];
  for (const row of incoming) {
    const current = existing.get(row.recordId);
    if (current === undefined) additions.push(row.recordId);
    else if (current.documentText === row.documentText) identical.push(row.recordId);
    else conflicts.push(row.recordId);
  }
  return Object.freeze({ local, incoming, additions: Object.freeze(additions), identical: Object.freeze(identical), conflicts: Object.freeze(conflicts) });
}
export function resolveMyChartsRestore(plan: MyChartsRestorePlan,
  choices: ReadonlyMap<string, MyChartsConflictChoice>): MyChartsResult<readonly KeptChart[]> {
  for (const id of plan.conflicts) if (!choices.has(id)) return { ok: false, code: "my-charts.unresolved_conflict" };
  const merged = new Map(plan.local.map(row => [row.recordId, row]));
  for (const row of plan.incoming) {
    if (!merged.has(row.recordId) || choices.get(row.recordId) === "backup") merged.set(row.recordId, row);
  }
  const result = Object.freeze([...merged.values()]);
  const checked = checkStoredCharts(result);
  return checked.ok ? { ok: true, value: result } : checked;
}

/** Run the accepted title command in a detached state. Never borrow the live
 * controller's edit channel or label a record without changing its document. */
export function renameKeptChart(row: KeptChart, title: string, updatedAt: string): MyChartsResult<KeptChart> {
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zero.ok) return invalidDocument;
  const state = createInitialAppState({ document: row.document, zeroBeat: zero.value, initialPanels: STUDIO_INITIAL_PANELS });
  if (!state.ok) return invalidDocument;
  const changed = runDocumentCommand({ state: state.state, dependencies: createStudioApplicationDependencies(), command: {
    kind: "set-text", id: "my-charts-rename", label: "Rename kept chart", expectedDocumentId: row.document.id,
    expectedRevision: 0, logicalTimeMs: 1, coalescing: { kind: "text-field", key: "title", focusSessionId: "my-charts-rename" },
    target: { kind: "document-title" }, value: title,
  } });
  return changed.ok ? keepChartDocument(changed.state.document, row.recordId, updatedAt)
    : { ok: false, code: "my-charts.invalid_title" };
}
export function duplicateKeptChart(row: KeptChart, recordId: string, updatedAt: string, idFactory: StableIdFactory): MyChartsResult<KeptChart> {
  const copied = copyDomain({ rootKind: "document", purpose: "duplicate", source: row.document, destination: null, idFactory });
  if (!copied.ok) return { ok: false, code: "my-charts.identity_failed" };
  const decoded = decodeDocumentShape(copied.value);
  if (!decoded.ok) return invalidDocument;
  const published = validateDocumentSemantics(decoded.value);
  return published.ok ? keepChartDocument(published.value, recordId, updatedAt) : invalidDocument;
}
