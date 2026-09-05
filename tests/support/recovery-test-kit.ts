import { parseStableId, type DocumentId } from "../../src/domain";
import {
  computeEnvelopeChecksum,
  createRecoveryService,
  RECOVERY_ENVELOPE_SCHEMA,
  type RecoveryAdapterPort,
  type RecoveryCapabilityProbe,
  type RecoveryClockPort,
  type RecoveryService,
  type RecoverySnapshot,
} from "../../src/persistence";

/**
 * Shared A1 recovery test harness: deterministic fake adapters with real
 * rotation semantics and a manually advanced fake clock. Production
 * recovery code is exercised; expected values come from the reviewed
 * fixtures, never from this kit. Seeded valid envelopes use the production
 * checksum helper as input construction only — checksum correctness itself
 * is proven against the independently computed fixture goldens.
 */

export type FakeAdapterOptions = Readonly<{
  kind: "indexeddb" | "localstorage";
  probeUsable?: boolean;
  writeOutcome?: "written" | "quota" | "denied";
  throwOnProbe?: boolean;
}>;

export type FakeRecoveryAdapter = Readonly<{
  port: RecoveryAdapterPort;
  store: Map<string, string>;
  writeLog: readonly Readonly<{
    currentKey: string;
    previousKey: string;
    bytes: number;
    outcome: string;
  }>[];
}>;

export function createFakeRecoveryAdapter(
  options: FakeAdapterOptions,
): FakeRecoveryAdapter {
  const store = new Map<string, string>();
  const writeLog: {
    currentKey: string;
    previousKey: string;
    bytes: number;
    outcome: string;
  }[] = [];
  const port: RecoveryAdapterPort = Object.freeze({
    kind: options.kind,
    probe(): Promise<RecoveryCapabilityProbe> {
      if (options.throwOnProbe === true) {
        return Promise.reject(new Error("fake probe failure"));
      }
      const usable = options.probeUsable !== false;
      return Promise.resolve(
        Object.freeze({
          adapter: options.kind,
          usable,
          reasonCode: usable ? null : ("recovery.probe_failed" as const),
        }),
      );
    },
    read(key: string): Promise<string | null> {
      return Promise.resolve(store.get(key) ?? null);
    },
    writeCurrentWithRotation(
      currentKey: string,
      previousKey: string,
      payload: string,
    ): Promise<"written" | "quota" | "denied"> {
      const outcome = options.writeOutcome ?? "written";
      writeLog.push({
        currentKey,
        previousKey,
        bytes: new TextEncoder().encode(payload).byteLength,
        outcome,
      });
      if (outcome !== "written") return Promise.resolve(outcome);
      const priorCurrent = store.get(currentKey);
      if (priorCurrent !== undefined) store.set(previousKey, priorCurrent);
      store.set(currentKey, payload);
      return Promise.resolve("written" as const);
    },
    remove(key: string): Promise<void> {
      store.delete(key);
      return Promise.resolve();
    },
  });
  return Object.freeze({ port, store, writeLog });
}

type PendingTimeout = { at: number; callback: () => void; handle: number };

/** Drain real async work (crypto digests, adapter promises) between ticks. */
async function settle(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await new Promise<void>((resolveSettle) => {
      setTimeout(resolveSettle, 0);
    });
  }
}

export type FakeRecoveryClock = Readonly<{
  port: RecoveryClockPort;
  advance: (milliseconds: number) => Promise<void>;
  now: () => number;
}>;

export function createFakeRecoveryClock(): FakeRecoveryClock {
  let now = 0;
  let nextHandle = 1;
  const pending: PendingTimeout[] = [];
  const port: RecoveryClockPort = Object.freeze({
    nowMs: () => now,
    nowIso: () => new Date(1_753_000_000_000 + now).toISOString(),
    setTimeout(callback: () => void, delayMs: number): number {
      const handle = nextHandle;
      nextHandle += 1;
      pending.push({ at: now + delayMs, callback, handle });
      return handle;
    },
    clearTimeout(handle: number): void {
      const index = pending.findIndex((entry) => entry.handle === handle);
      if (index >= 0) pending.splice(index, 1);
    },
  });
  return Object.freeze({
    port,
    async advance(milliseconds: number): Promise<void> {
      const target = now + milliseconds;
      for (;;) {
        const due = pending
          .filter((entry) => entry.at <= target)
          .sort((left, right) => left.at - right.at)[0];
        if (due === undefined) break;
        now = due.at;
        const index = pending.indexOf(due);
        if (index >= 0) pending.splice(index, 1);
        due.callback();
        await settle();
      }
      now = target;
      await settle();
    },
    now: () => now,
  });
}

export type RecoveryHarness = Readonly<{
  service: RecoveryService;
  clock: FakeRecoveryClock;
  adapters: readonly FakeRecoveryAdapter[];
}>;

export function createRecoveryHarness(
  adapterOptions: readonly FakeAdapterOptions[] = [{ kind: "indexeddb" }],
  onStatusChange?: (snapshot: RecoverySnapshot, savedAt: string | null) => void,
): RecoveryHarness {
  const adapters = adapterOptions.map((options) =>
    createFakeRecoveryAdapter(options),
  );
  const clock = createFakeRecoveryClock();
  const service = createRecoveryService({
    adapters: adapters.map((adapter) => adapter.port),
    clock: clock.port,
  }, onStatusChange);
  return Object.freeze({ service, clock, adapters });
}

export function testDocumentId(wire: string): DocumentId {
  const parsed = parseStableId("document", wire);
  if (!parsed.ok) throw new Error(`RECOVERY_KIT_DOCUMENT_ID:${wire}`);
  return parsed.value;
}

/** Seed a structurally valid envelope payload for adapter stores. */
export async function seededEnvelopeText(fields: {
  revision: number;
  document?: unknown;
  savedAt?: string;
  lastExport?: Readonly<{
    revision: number;
    exportedAt: string;
    semanticDocumentHash: string;
  }>;
}): Promise<string> {
  const body: Record<string, unknown> = {
    schema: RECOVERY_ENVELOPE_SCHEMA,
    savedAt: fields.savedAt ?? "2026-07-23T10:00:00.000Z",
    revision: fields.revision,
    document: fields.document ?? { documentVersion: 2, title: "Seeded" },
  };
  if (fields.lastExport !== undefined) body["lastExport"] = fields.lastExport;
  const checksum = await computeEnvelopeChecksum(body);
  return JSON.stringify({ ...body, checksum });
}
