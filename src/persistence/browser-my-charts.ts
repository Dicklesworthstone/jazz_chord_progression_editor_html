import { MY_CHARTS_LIMITS, checkStoredCharts, myChartsUtf8Length,
  type MyChartsResult, type MyChartsStorage, type StoredChart } from "./my-charts-contract";
import { compareRecordIds, decodeMyChartsIndex, type MyChartsIndexRow } from "./my-charts-index";

const DATABASE = "changes-my-charts";
const unavailable = { ok: false, code: "my-charts.unavailable" } as const;
const aborted = { ok: false, code: "my-charts.aborted" } as const;
const corrupt = { ok: false, code: "my-charts.corrupt" } as const;
function storageFailure(error: unknown): MyChartsResult<never> {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "QuotaExceededError"
    ? { ok: false, code: "my-charts.quota" } : unavailable;
}

function openDatabase(signal?: AbortSignal): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (signal?.aborted === true || typeof indexedDB !== "object") { resolve(null); return; }
    let settled = false;
    const finish = (database: IDBDatabase | null): void => {
      if (settled) { database?.close(); return; }
      settled = true; signal?.removeEventListener("abort", cancel); resolve(database);
    };
    const cancel = (): void => { finish(null); };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        for (const name of ["index", "documents"]) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        }
      };
      request.onblocked = cancel;
      request.onerror = cancel;
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); };
        finish(database);
      };
    } catch { finish(null); }
  });
}

/** No application, timer, auto-save, or recovery dependency. All acknowledgements
 * come from native transaction completion, never an individual put receipt. */
export function createIndexedDbMyChartsStorage(): MyChartsStorage {
  async function transaction<T>(mode: IDBTransactionMode, signal: AbortSignal | undefined,
    start: (tx: IDBTransaction, ready: (value: T) => void, refuse: (result: MyChartsResult<never>) => void) => void,
  ): Promise<MyChartsResult<T>> {
    const database = await openDatabase(signal);
    if (database === null) return signal?.aborted === true ? aborted : unavailable;
    try {
      if (signal?.aborted === true) return aborted;
      return await new Promise<MyChartsResult<T>>(resolve => {
        const tx = database.transaction(["index", "documents"], mode);
        let outcome: MyChartsResult<T> = corrupt;
        let refused: MyChartsResult<never> | null = null;
        const cancel = (): void => { refuse(aborted); };
        const finish = (result: MyChartsResult<T>): void => {
          signal?.removeEventListener("abort", cancel); resolve(result);
        };
        const refuse = (result: MyChartsResult<never>): void => {
          refused = result;
          try { tx.abort(); } catch { /* A completed transaction cannot be rolled back. */ }
        };
        // Installed before requests: no fast transaction can outrun its receipt.
        tx.oncomplete = () => { finish(outcome); };
        tx.onabort = () => { finish(refused ?? (tx.error === null ? aborted : storageFailure(tx.error))); };
        tx.onerror = () => { /* Default IndexedDB behavior aborts the transaction. */ };
        signal?.addEventListener("abort", cancel, { once: true });
        try { start(tx, value => { outcome = { ok: true, value }; }, refuse); }
        catch (error) { refuse(storageFailure(error)); }
      });
    } catch (error) { return storageFailure(error); }
    finally { database.close(); }
  }
  return Object.freeze({
    read: signal => transaction("readonly", signal, (tx, ready, refuse) => {
      const indexRequest: IDBRequest<unknown> = tx.objectStore("index").get("current");
      const store = tx.objectStore("documents");
      indexRequest.onsuccess = () => {
        if (indexRequest.result === undefined) {
          const count = store.count();
          count.onsuccess = () => { if (count.result === 0) ready(Object.freeze({ token: null, generation: 0, records: Object.freeze([]) })); else refuse(corrupt); };
          return;
        }
        const decoded = decodeMyChartsIndex(indexRequest.result);
        if (!decoded.ok || typeof indexRequest.result !== "string") { refuse(corrupt); return; }
        const token = indexRequest.result, records: StoredChart[] = [];
        let remaining = decoded.value.records.length, bytes = 0;
        const done = (): void => { ready(Object.freeze({ token, generation: decoded.value.generation,
          records: Object.freeze(records.sort(compareRecordIds)) })); };
        if (remaining === 0) done();
        for (const row of decoded.value.records) {
          const request: IDBRequest<unknown> = store.get(row.payloadKey);
          request.onsuccess = () => {
            const documentText = request.result;
            if (typeof documentText !== "string") { refuse(corrupt); return; }
            const size = myChartsUtf8Length(documentText, MY_CHARTS_LIMITS.documentBytes);
            bytes += size;
            if (size > MY_CHARTS_LIMITS.documentBytes || bytes > MY_CHARTS_LIMITS.collectionBytes) { refuse(corrupt); return; }
            records.push(Object.freeze({ recordId: row.recordId, updatedAt: row.updatedAt, documentText }));
            remaining--; if (remaining === 0) done();
          };
        }
      };
    }),
    compareAndSwap: async (expected, records, signal) => {
      const checked = checkStoredCharts(records);
      if (!checked.ok) return checked;
      const priorIndex = expected.token === null ? null : decodeMyChartsIndex(expected.token);
      if ((priorIndex !== null && !priorIndex.ok) || (expected.token === null &&
        (expected.generation !== 0 || expected.records.length !== 0))) return corrupt;
      const prior = priorIndex?.ok === true ? priorIndex.value : null;
      if ((prior?.generation ?? 0) !== expected.generation) return corrupt;
      if (expected.generation === Number.MAX_SAFE_INTEGER) return { ok: false, code: "my-charts.generation_exhausted" };
      const generation = expected.generation + 1, sorted = [...records].sort(compareRecordIds);
      const oldRows = new Map(prior?.records.map(row => [row.recordId, row]));
      const oldRecords = new Map(expected.records.map(row => [row.recordId, row]));
      const rows: MyChartsIndexRow[] = [], writes: Readonly<{ key: string; text: string }>[] = [];
      for (const record of sorted) {
        const old = oldRecords.get(record.recordId), oldRow = oldRows.get(record.recordId);
        const unchanged = old?.documentText === record.documentText && old.updatedAt === record.updatedAt && oldRow !== undefined;
        const payloadKey = unchanged ? oldRow.payloadKey : `${record.recordId}:${String(generation)}`;
        rows.push({ recordId: record.recordId, updatedAt: record.updatedAt, payloadKey });
        if (!unchanged) writes.push({ key: payloadKey, text: record.documentText });
      }
      const token = JSON.stringify({ schema: "changes.my-charts.index.v1", generation, records: rows });
      if (myChartsUtf8Length(token, MY_CHARTS_LIMITS.indexBytes) > MY_CHARTS_LIMITS.indexBytes) return corrupt;
      return transaction("readwrite", signal, (tx, ready, refuse) => {
        const index = tx.objectStore("index"), documents = tx.objectStore("documents");
        const current: IDBRequest<unknown> = index.get("current");
        current.onsuccess = () => {
          if ((current.result === undefined ? null : current.result) !== expected.token) { refuse({ ok: false, code: "my-charts.conflict" }); return; }
          const publish = (): void => {
            try {
              const retained = new Set(rows.map(row => row.payloadKey));
              for (const row of prior?.records ?? []) if (!retained.has(row.payloadKey)) documents.delete(row.payloadKey);
              for (const write of writes) documents.add(write.text, write.key);
              index.put(token, "current");
              ready(Object.freeze({ token, generation, records: Object.freeze(sorted.map(row => Object.freeze({ ...row }))) }));
            } catch (error) { refuse(storageFailure(error)); }
          };
          if (expected.token === null) {
            const count = documents.count();
            count.onsuccess = () => { if (count.result === 0) publish(); else refuse(corrupt); };
          } else {
            // Check referenced bytes too: corrupted/missing records cannot be
            // erased by a write prepared before the corruption was observed.
            let remaining = prior?.records.length ?? 0;
            if (remaining === 0) publish();
            for (const row of prior?.records ?? []) {
              const request: IDBRequest<unknown> = documents.get(row.payloadKey);
              request.onsuccess = () => {
                if (request.result !== oldRecords.get(row.recordId)?.documentText) { refuse(corrupt); return; }
                remaining--; if (remaining === 0) publish();
              };
            }
          }
        };
      });
    },
  });
}
