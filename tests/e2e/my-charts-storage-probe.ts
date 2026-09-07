/** Independent browser-side laws over the ACTUAL production IndexedDB adapter.
 * This entry is compiled only into private test artifacts, never the studio. */
import { createIndexedDbMyChartsStorage } from "../../src/persistence/browser-my-charts";
import type { MyChartsSnapshot, MyChartsResult, StoredChart } from "../../src/persistence/my-charts-contract";
import fixture from "../fixtures/exact-share/document.changes.json";

type ProbeName = "populated-cas" | "empty-aba" | "failed-remove" | "record-limit" | "generation-limit";
declare global { interface Window { runMyChartsStorageProbe: (name: ProbeName) => Promise<unknown> } }
const text = JSON.stringify(fixture), time = "2026-09-07T00:00:00.000Z";
const chart = (recordId: string): StoredChart => ({ recordId, updatedAt: time, documentText: text });
class ProofFailure extends Error { constructor(readonly law: string, readonly actual: unknown, readonly expected: unknown) { super(law); } }
function equal(law: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new ProofFailure(law, actual, expected);
}
function success<T>(result: MyChartsResult<T>): T { if (!result.ok) throw new Error(`Positive setup refused: ${result.code}`); return result.value; }
async function setGeneration(snapshot: MyChartsSnapshot, generation: number): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("changes-my-charts", 1); request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error("Native fixture open failed")); };
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("index", "readwrite"); tx.oncomplete = () => { resolve(); };
      tx.onabort = () => { reject(tx.error ?? new Error("Native fixture generation failed")); };
      if (snapshot.token === null) throw new Error("Generation fixture requires a populated manifest");
      const raw: unknown = JSON.parse(snapshot.token);
      if (typeof raw !== "object" || raw === null || !("records" in raw)) throw new Error("Invalid setup index");
      tx.objectStore("index").put(JSON.stringify({ schema: "changes.my-charts.index.v1", generation, records: raw.records }), "current");
    });
  } finally { database.close(); }
}

window.runMyChartsStorageProbe = async name => {
  const a = createIndexedDbMyChartsStorage(), b = createIndexedDbMyChartsStorage(), observations: unknown[] = [];
  try {
    const zero = success(await a.read()); equal("fresh-context", zero, { token: null, generation: 0, records: [] });
    if (name === "record-limit") {
      const records = Array.from({ length: 128 }, (_, index) => chart(`chart_${String(index)}`));
      const atLimit = success(await a.compareAndSwap(zero, records));
      equal("record-128", atLimit.records.length, 128);
      const refused = await b.compareAndSwap(atLimit, [...records, chart("chart_extra")]);
      observations.push({ count: atLimit.records.length, refused });
      equal("record-129-refused", refused, { ok: false, code: "my-charts.record_limit" });
      equal("record-129-preserves", await a.read(), { ok: true, value: atLimit });
    } else {
      const first = success(await a.compareAndSwap(zero, [chart("chart_a")]));
      if (name === "populated-cas") {
        const independent = success(await b.read()); equal("independent-tab-version", independent, first);
        const winner = success(await a.compareAndSwap(first, [chart("chart_a"), chart("chart_b")]));
        const loser = await b.compareAndSwap(independent, [chart("chart_a"), chart("chart_c")]);
        observations.push({ independent, winner, loser });
        equal("populated-cas-refuses-stale", loser, { ok: false, code: "my-charts.conflict" });
        equal("populated-cas-preserves-winner", await b.read(), { ok: true, value: winner });
      } else if (name === "empty-aba") {
        const empty = success(await a.compareAndSwap(first, [])); observations.push({ zero, first, empty });
        equal("empty-generation-monotone", empty.generation, 2);
        equal("empty-readable", await b.read(), { ok: true, value: empty });
        const refused = await b.compareAndSwap(zero, [chart("chart_other")]); observations.push({ refused });
        equal("empty-aba-refuses-stale", refused, { ok: false, code: "my-charts.conflict" });
        equal("empty-aba-preserves", await a.read(), { ok: true, value: empty });
      } else if (name === "generation-limit") {
        await setGeneration(first, Number.MAX_SAFE_INTEGER);
        const last = success(await a.read()); equal("generation-maximum-readable", last.generation, 9007199254740991);
        const refused = await a.compareAndSwap(last, [chart("chart_b")]); observations.push({ last, refused });
        equal("generation-exhaustion-refused", refused, { ok: false, code: "my-charts.generation_exhausted" });
        equal("generation-exhaustion-preserves", await b.read(), { ok: true, value: last });
      } else {
        const before = success(await a.compareAndSwap(first, [chart("chart_a"), chart("chart_b")]));
        const native: unknown = Reflect.get(IDBObjectStore.prototype, "put");
        const writer = (value: unknown): value is IDBObjectStore["put"] => typeof value === "function";
        if (!writer(native)) throw new Error("Missing native put");
        let reached = 0;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
          const result = key === undefined ? native.call(this, value) : native.call(this, value, key);
          if (this.transaction.db.name === "changes-my-charts" && this.name === "index") {
            reached++; this.transaction.abort();
          }
          return result;
        };
        const refused = await a.compareAndSwap(before, []);
        IDBObjectStore.prototype.put = native;
        observations.push({ before, refused, reached }); equal("abort-checkpoint-reached", reached, 1);
        equal("failed-remove-requires-transaction-receipt", refused, { ok: false, code: "my-charts.aborted" });
        equal("failed-remove-preserves-both-records", await b.read(), { ok: true, value: before });
      }
    }
    return { ok: true, name, observations };
  } catch (error) {
    return error instanceof ProofFailure ? { ok: false, name, kind: "assertion", law: error.law,
      actual: error.actual, expected: error.expected, observations }
      : { ok: false, name, kind: "unexpected", error: error instanceof Error ? error.message : String(error), observations };
  }
};
