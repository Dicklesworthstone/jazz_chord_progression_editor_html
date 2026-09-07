import { MY_CHARTS_LIMITS, isMyChartsRecordId, isMyChartsTimestamp, myChartsUtf8Length,
  type MyChartsResult } from "./my-charts-contract";

export type MyChartsIndexRow = Readonly<{ recordId: string; updatedAt: string; payloadKey: string }>;
export type MyChartsIndex = Readonly<{ schema: "changes.my-charts.index.v1"; generation: number; records: readonly MyChartsIndexRow[] }>;
export const compareRecordIds = (a: Readonly<{ recordId: string }>, b: Readonly<{ recordId: string }>): number =>
  a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Storage's own canonical envelope permits no duplicate/extra keys or aliases.
 * Native parse is nonrecursive JS; the shape check never walks attacker nesting. */
export function decodeMyChartsIndex(text: unknown): MyChartsResult<MyChartsIndex> {
  const corrupt = { ok: false, code: "my-charts.corrupt" } as const;
  if (typeof text !== "string" || myChartsUtf8Length(text, MY_CHARTS_LIMITS.indexBytes) > MY_CHARTS_LIMITS.indexBytes) return corrupt;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return corrupt; }
  if (!record(raw) || raw["schema"] !== "changes.my-charts.index.v1" || typeof raw["generation"] !== "number" ||
    !Number.isSafeInteger(raw["generation"]) || raw["generation"] < 1 || !Array.isArray(raw["records"]) ||
    raw["records"].length > MY_CHARTS_LIMITS.records) return corrupt;
  const rows: MyChartsIndexRow[] = [], seen = new Set<string>();
  const rawRows: readonly unknown[] = raw["records"];
  for (const item of rawRows) {
    if (!record(item) || !isMyChartsRecordId(item["recordId"]) || !isMyChartsTimestamp(item["updatedAt"]) ||
      typeof item["payloadKey"] !== "string" || seen.has(item["recordId"]) || Object.keys(item).length !== 3) return corrupt;
    const suffix = item["payloadKey"].slice(item["recordId"].length + 1), version = Number(suffix);
    if (item["payloadKey"] !== `${item["recordId"]}:${suffix}` || !/^[1-9][0-9]*$/u.test(suffix) ||
      !Number.isSafeInteger(version) || version > raw["generation"]) return corrupt;
    seen.add(item["recordId"]);
    rows.push(Object.freeze({ recordId: item["recordId"], updatedAt: item["updatedAt"], payloadKey: item["payloadKey"] }));
  }
  const index: MyChartsIndex = Object.freeze({ schema: "changes.my-charts.index.v1", generation: raw["generation"],
    records: Object.freeze(rows.sort(compareRecordIds)) });
  // This comparison also rejects escaped duplicate keys and alternate root fields.
  return JSON.stringify(index) === text ? { ok: true, value: index } : corrupt;
}
