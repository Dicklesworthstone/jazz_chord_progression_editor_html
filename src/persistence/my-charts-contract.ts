/** My Charts v1 byte-store boundary. Musical publication stays in application. */
export const MY_CHARTS_LIMITS = Object.freeze({ records: 128, documentBytes: 2_097_152,
  collectionBytes: 33_554_432, backupBytes: 67_239_936, indexBytes: 131_072 });
export type MyChartsFailureCode = "my-charts.unavailable" | "my-charts.quota" | "my-charts.aborted" |
  "my-charts.corrupt" | "my-charts.conflict" | "my-charts.generation_exhausted" |
  "my-charts.record_limit" | "my-charts.document_limit" | "my-charts.collection_limit" |
  "my-charts.backup_limit" | "my-charts.invalid_backup" | "my-charts.invalid_document" |
  "my-charts.identity_failed" | "my-charts.invalid_title" | "my-charts.unresolved_conflict";
export type MyChartsResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: MyChartsFailureCode }>;
export type StoredChart = Readonly<{ recordId: string; updatedAt: string; documentText: string }>;
export type MyChartsSnapshot = Readonly<{ token: string | null; generation: number; records: readonly StoredChart[] }>;
export type MyChartsStorage = Readonly<{
  read: (signal?: AbortSignal) => Promise<MyChartsResult<MyChartsSnapshot>>;
  compareAndSwap: (expected: MyChartsSnapshot, records: readonly StoredChart[], signal?: AbortSignal) => Promise<MyChartsResult<MyChartsSnapshot>>;
}>;

export function isMyChartsRecordId(value: unknown): value is string {
  return typeof value === "string" && /^chart_[A-Za-z0-9][A-Za-z0-9._:-]{0,121}$/u.test(value);
}
export function isMyChartsTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
export function myChartsUtf8Length(text: string, maximum: number): number {
  return text.length > maximum ? maximum + 1 : new TextEncoder().encode(text).length;
}
export function checkStoredCharts(records: readonly StoredChart[]): MyChartsResult<number> {
  if (records.length > MY_CHARTS_LIMITS.records) return { ok: false, code: "my-charts.record_limit" };
  let bytes = 0;
  const ids = new Set<string>();
  for (const record of records) {
    if (!isMyChartsRecordId(record.recordId) || !isMyChartsTimestamp(record.updatedAt) || ids.has(record.recordId)) {
      return { ok: false, code: "my-charts.corrupt" };
    }
    ids.add(record.recordId);
    const size = myChartsUtf8Length(record.documentText, MY_CHARTS_LIMITS.documentBytes);
    if (size > MY_CHARTS_LIMITS.documentBytes) return { ok: false, code: "my-charts.document_limit" };
    bytes += size;
    if (bytes > MY_CHARTS_LIMITS.collectionBytes) return { ok: false, code: "my-charts.collection_limit" };
  }
  return { ok: true, value: bytes };
}
