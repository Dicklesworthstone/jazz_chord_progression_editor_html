import type {
  RecoveryAdapterPort,
  RecoveryCapabilityProbe,
} from "./recovery-contract";

/**
 * Real browser recovery adapters.
 *
 * Both adapters are dumb bounded byte stores behind `RecoveryAdapterPort`:
 * writing `current` atomically demotes the prior current payload to
 * `previous` (inside one IndexedDB transaction, or one synchronous
 * localStorage sequence), and a failed write leaves both slots unchanged.
 * All recovery semantics live in the service.
 */

const DATABASE_NAME = "changes-recovery";
const DATABASE_VERSION = 1;
const STORE_NAME = "recovery-envelopes";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolveOpen, rejectOpen) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolveOpen(request.result);
    };
    request.onerror = () => {
      rejectOpen(request.error ?? new Error("indexeddb open failed"));
    };
    request.onblocked = () => {
      rejectOpen(new Error("indexeddb open blocked"));
    };
  });
}

function awaitRequest<Value>(request: IDBRequest<Value>): Promise<Value> {
  return new Promise((resolveRequest, rejectRequest) => {
    request.onsuccess = () => {
      resolveRequest(request.result);
    };
    request.onerror = () => {
      rejectRequest(request.error ?? new Error("indexeddb request failed"));
    };
  });
}

function awaitTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolveTransaction, rejectTransaction) => {
    transaction.oncomplete = () => {
      resolveTransaction();
    };
    transaction.onerror = () => {
      rejectTransaction(
        transaction.error ?? new Error("indexeddb transaction failed"),
      );
    };
    transaction.onabort = () => {
      rejectTransaction(
        transaction.error ?? new Error("indexeddb transaction aborted"),
      );
    };
  });
}

function isQuotaError(error: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "QuotaExceededError"
  );
}

export function createIndexedDbRecoveryAdapter(): RecoveryAdapterPort {
  return Object.freeze({
    kind: "indexeddb",
    async probe(): Promise<RecoveryCapabilityProbe> {
      try {
        if (typeof indexedDB !== "object") {
          return Object.freeze({
            adapter: "indexeddb",
            usable: false,
            reasonCode: "recovery.probe_failed",
          });
        }
        const database = await openDatabase();
        database.close();
        return Object.freeze({
          adapter: "indexeddb",
          usable: true,
          reasonCode: null,
        });
      } catch {
        return Object.freeze({
          adapter: "indexeddb",
          usable: false,
          reasonCode: "recovery.probe_failed",
        });
      }
    },
    async read(key: string): Promise<string | null> {
      const database = await openDatabase();
      try {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const stored = await awaitRequest<unknown>(
          transaction.objectStore(STORE_NAME).get(key),
        );
        await awaitTransaction(transaction);
        return typeof stored === "string" ? stored : null;
      } finally {
        database.close();
      }
    },
    async writeCurrentWithRotation(
      currentKey: string,
      previousKey: string,
      payload: string,
    ): Promise<"written" | "quota" | "denied"> {
      let database: IDBDatabase;
      try {
        database = await openDatabase();
      } catch {
        return "denied";
      }
      try {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const prior = await awaitRequest<unknown>(store.get(currentKey));
        if (typeof prior === "string") {
          store.put(prior, previousKey);
        }
        store.put(payload, currentKey);
        await awaitTransaction(transaction);
        return "written";
      } catch (error) {
        return isQuotaError(error) ? "quota" : "denied";
      } finally {
        database.close();
      }
    },
    async remove(key: string): Promise<void> {
      const database = await openDatabase();
      try {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(key);
        await awaitTransaction(transaction);
      } finally {
        database.close();
      }
    },
  });
}

export function createLocalStorageRecoveryAdapter(): RecoveryAdapterPort {
  const PROBE_KEY = "changes.recovery.v1:__probe__";
  return Object.freeze({
    kind: "localstorage",
    probe(): Promise<RecoveryCapabilityProbe> {
      try {
        localStorage.setItem(PROBE_KEY, "1");
        localStorage.removeItem(PROBE_KEY);
        return Promise.resolve(
          Object.freeze({
            adapter: "localstorage" as const,
            usable: true,
            reasonCode: null,
          }),
        );
      } catch {
        return Promise.resolve(
          Object.freeze({
            adapter: "localstorage" as const,
            usable: false,
            reasonCode: "recovery.probe_failed" as const,
          }),
        );
      }
    },
    read(key: string): Promise<string | null> {
      try {
        return Promise.resolve(localStorage.getItem(key));
      } catch {
        return Promise.resolve(null);
      }
    },
    writeCurrentWithRotation(
      currentKey: string,
      previousKey: string,
      payload: string,
    ): Promise<"written" | "quota" | "denied"> {
      let priorCurrent: string | null;
      let priorPrevious: string | null;
      try {
        priorCurrent = localStorage.getItem(currentKey);
        priorPrevious = localStorage.getItem(previousKey);
      } catch {
        return Promise.resolve("denied");
      }
      try {
        if (priorCurrent !== null) {
          localStorage.setItem(previousKey, priorCurrent);
        }
        localStorage.setItem(currentKey, payload);
        return Promise.resolve("written");
      } catch (error) {
        // Roll back so a failed write leaves both slots unchanged.
        try {
          if (priorPrevious === null) {
            localStorage.removeItem(previousKey);
          } else {
            localStorage.setItem(previousKey, priorPrevious);
          }
          if (priorCurrent === null) {
            localStorage.removeItem(currentKey);
          } else {
            localStorage.setItem(currentKey, priorCurrent);
          }
        } catch {
          // Restoration is best-effort under a hostile store.
        }
        return Promise.resolve(isQuotaError(error) ? "quota" : "denied");
      }
    },
    remove(key: string): Promise<void> {
      try {
        localStorage.removeItem(key);
      } catch {
        // Removing from a denied store is a no-op.
      }
      return Promise.resolve();
    },
  });
}
