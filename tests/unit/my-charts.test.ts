import { expect, test } from "bun:test";
import fixture from "../fixtures/exact-share/document.changes.json";
import packet from "../fixtures/my-charts/cases.json";
import { parseStableId, type StableIdFactory } from "../../src/domain";
import { checkStoredCharts, MY_CHARTS_LIMITS, isMyChartsRecordId, isMyChartsTimestamp } from "../../src/persistence";
import { decodeMyChartsIndex } from "../../src/persistence/my-charts-index";
import { decodeKeptChart, decodeMyChartsBackup, duplicateKeptChart, encodeMyChartsBackup,
  planMyChartsRestore, renameKeptChart, resolveMyChartsRestore } from "../../src/application/my-charts";

const time = "2026-09-07T00:00:00.000Z", later = "2026-09-07T01:00:00.000Z";
const sourceText = JSON.stringify(fixture);
function chart(recordId = "chart_a", id = fixture.id, title = fixture.title) {
  const result = decodeKeptChart({ recordId, updatedAt: time, documentText: JSON.stringify({ ...fixture, id, title }) });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}
function envelope(records: readonly unknown[]) { return JSON.stringify({ schema: "changes.my-charts.backup.v1", records }); }
const stored = { recordId: "chart_a", updatedAt: time, documentText: sourceText };

test("canonical backup restores every independent field, ordered unison and exact duration", () => {
  const row = chart(), encoded = encodeMyChartsBackup([row]);
  expect(encoded.ok).toBe(true); if (!encoded.ok) return;
  const decoded = decodeMyChartsBackup(encoded.value);
  expect(decoded.ok).toBe(true); if (!decoded.ok) return;
  const actualDocument: unknown = decoded.value[0]?.document;
  expect(actualDocument).toEqual(fixture);
  expect(decoded.value[0]?.documentText).toBe(row.documentText);
  expect(String(decoded.value[0]?.document.id)).toBe(fixture.id);
  expect(encodeMyChartsBackup(decoded.value)).toEqual(encoded);
  expect(decodeMyChartsBackup(envelope([]))).toEqual({ ok: true, value: [] });
});

test("canonical backup preserves lexical negative zero instead of ordinary JSON stringify", () => {
  const result = decodeKeptChart({ ...stored, documentText: sourceText.replace('"masterVolume":0.8', '"masterVolume":-0') });
  expect(result.ok).toBe(true); if (!result.ok) return;
  const encoded = encodeMyChartsBackup([result.value]);
  expect(encoded.ok).toBe(true); if (!encoded.ok) return;
  const decoded = decodeMyChartsBackup(encoded.value);
  expect(decoded.ok).toBe(true); if (!decoded.ok) return;
  expect(Object.is(decoded.value[0]?.document.playback.masterVolume, -0)).toBe(true);
  expect(decoded.value[0]?.documentText).toContain('"masterVolume": -0');
});

for (const row of packet.restore) test(`restore independently classifies ${row.id}`, () => {
  const make = (entry: readonly string[]) => chart(entry[0], entry[1], entry[2]);
  const local = row.local.map(make), incoming = row.incoming.map(make), before = JSON.stringify(local);
  const plan = planMyChartsRestore(local, incoming);
  expect(plan.additions).toEqual(row.additions); expect(plan.identical).toEqual(row.identical); expect(plan.conflicts).toEqual(row.conflicts);
  if (row.conflicts.length > 0) expect(resolveMyChartsRestore(plan, new Map())).toEqual({ ok: false, code: "my-charts.unresolved_conflict" });
  for (const choice of ["local", "backup"] as const) {
    const result = resolveMyChartsRestore(plan, new Map(row.conflicts.map(id => [id, choice])));
    expect(result.ok).toBe(true); if (!result.ok) return;
    for (const record of result.value) {
      const expected = choice === "backup" && row.conflicts.some(id => id === record.recordId)
        ? incoming.find(value => value.recordId === record.recordId)
        : local.find(value => value.recordId === record.recordId) ?? incoming.find(value => value.recordId === record.recordId);
      const actual: unknown = record;
      expect(actual).toEqual(expected);
    }
  }
  expect(JSON.stringify(local)).toBe(before);
});

test("identical record keeps local timestamp; a newer timestamp never resolves a real conflict", () => {
  const local = chart(), incoming = { ...local, updatedAt: later };
  expect(resolveMyChartsRestore(planMyChartsRestore([local], [incoming]), new Map())).toEqual({ ok: true, value: [local] });
  const different = chart("chart_a", fixture.id, "Renamed");
  expect(resolveMyChartsRestore(planMyChartsRestore([local], [{ ...different, updatedAt: later }]), new Map()).ok).toBe(false);
});

test("rename changes exactly the kept document title through A0, leaving the source untouched", () => {
  const original = chart(), before = JSON.stringify(original), title = "Second copy 🎹";
  const renamed = renameKeptChart(original, title, later);
  expect(renamed.ok).toBe(true); if (!renamed.ok) return;
  const actual: unknown = renamed.value.document;
  expect(actual).toEqual({ ...fixture, title });
  expect(renamed.value.recordId).toBe(original.recordId);
  expect(renamed.value.updatedAt).toBe(later);
  expect(JSON.stringify(original)).toBe(before);
  for (const invalid of ["", "   ", "🎹".repeat(257)]) expect(renameKeptChart(original, invalid, later).ok).toBe(false);
  expect(renameKeptChart(original, "🎹".repeat(256), later).ok).toBe(true);
});

test("F1 duplicate remaps every musical identity without changing a single other semantic field", () => {
  let sequence = 0;
  const ids: StableIdFactory = { next: kind => {
    sequence++;
    const id = parseStableId(kind, `copy-${kind}-${String(sequence)}`);
    if (!id.ok) throw new Error("Independent valid ID rejected");
    return { ok: true, value: id.value, source: "deterministic-test" };
  } };
  const original = chart(), copied = duplicateKeptChart(original, "chart_duplicate", later, ids);
  expect(copied.ok).toBe(true); if (!copied.ok) return;
  const expected = structuredClone(fixture);
  let index = 0;
  const next = () => { const id = packet.identity.duplicate[index++]; if (id === undefined) throw new Error("Missing independent remap"); return id; };
  expected.id = next();
  for (const section of expected.sections) { section.id = next(); for (const measure of section.measures) {
    measure.id = next(); for (const event of measure.events) event.id = next();
  } }
  const actual: unknown = copied.value.document, originalDocument: unknown = original.document;
  expect(actual).toEqual(expected);
  expect(sequence).toBe(7); expect(originalDocument).toEqual(fixture);
});

for (const [name, text] of [
  ["unknown outer field", envelope([stored]).replace('"records":', '"extra":true,"records":')],
  ["unknown version", envelope([stored]).replace("backup.v1", "backup.v2")],
  ["duplicate record", envelope([stored, stored])],
  ["escaped duplicate key", envelope([stored]).replace('"recordId":', '"record\\u0049d":"chart_other","recordId":')],
  ["duplicate inner key", envelope([{ ...stored, documentText: sourceText.replace('"title":', '"title":"Lost","title":') }])],
  ["unknown inner field", envelope([{ ...stored, documentText: sourceText.replace('"title":', '"unknown":1,"title":') }])],
  ["future inner version", envelope([{ ...stored, documentText: sourceText.replace("progression.v2", "progression.v3") }])],
  ["bom", "\ufeff" + envelope([stored])], ["invalid syntax", '{"schema":'],
  ["nesting33", "[".repeat(33) + "0" + "]".repeat(33)],
  ["one invalid record refuses all", envelope([stored, { ...stored, recordId: "chart_bad", documentText: "{}" }])],
] as const) test(`backup refuses ${name} without partial publication`, () => {
  expect(decodeMyChartsBackup(text).ok).toBe(false);
});

test("byte and count caps measure actual values, including UTF-8 and final restore union", () => {
  const length = new TextEncoder().encode(sourceText).length;
  expect(decodeKeptChart({ ...stored, documentText: sourceText + " ".repeat(MY_CHARTS_LIMITS.documentBytes - length) }).ok).toBe(true);
  expect(decodeKeptChart({ ...stored, documentText: sourceText + " ".repeat(MY_CHARTS_LIMITS.documentBytes - length + 1) })).toEqual({ ok: false, code: "my-charts.document_limit" });
  const row = chart(), many = Array.from({ length: 128 }, (_, n) => ({ ...row, recordId: `chart_${String(n)}` }));
  expect(checkStoredCharts(many).ok).toBe(true);
  expect(checkStoredCharts([...many, { ...row, recordId: "chart_extra" }])).toEqual({ ok: false, code: "my-charts.record_limit" });
  expect(resolveMyChartsRestore(planMyChartsRestore(many, [{ ...row, recordId: "chart_extra" }]), new Map())).toEqual({ ok: false, code: "my-charts.record_limit" });
  const text = "a".repeat(MY_CHARTS_LIMITS.documentBytes);
  const large = Array.from({ length: 16 }, (_, n) => ({ ...stored, recordId: `chart_${String(n)}`, documentText: text }));
  expect(checkStoredCharts(large)).toEqual({ ok: true, value: MY_CHARTS_LIMITS.collectionBytes });
  expect(checkStoredCharts([...large, { ...stored, recordId: "chart_extra", documentText: "a" }])).toEqual({ ok: false, code: "my-charts.collection_limit" });
});

test("record IDs and dates have separate exact bounded authority", () => {
  expect(isMyChartsRecordId("chart_" + "a".repeat(122))).toBe(true);
  for (const id of ["chart_" + "a".repeat(123), "chart_", fixture.id, "chart_bad space", "chart_🎹"]) expect(isMyChartsRecordId(id)).toBe(false);
  expect(isMyChartsTimestamp(time)).toBe(true);
  for (const value of ["2026-02-30T00:00:00.000Z", "2026-09-07", "yesterday", 0]) expect(isMyChartsTimestamp(value)).toBe(false);
});

test("canonical index refuses duplicate keys, dangling versions and unknown fields", () => {
  const text = JSON.stringify({ schema: "changes.my-charts.index.v1", generation: 7,
    records: [{ recordId: "chart_a", updatedAt: time, payloadKey: "chart_a:6" }] });
  expect(decodeMyChartsIndex(text).ok).toBe(true);
  for (const bad of [text.replace('"generation":7', '"generation":6,"generation":7'),
    text.replace("chart_a:6", "chart_a:8"), text.replace("chart_a:6", "chart_b:6"), text.replace("chart_a:6", "chart_a:06"),
    text.replace('"records":', '"extra":null,"records":'), text.replace('"generation":7', '"generation":0'), "null"]) {
    expect(decodeMyChartsIndex(bad).ok).toBe(false);
  }
});
