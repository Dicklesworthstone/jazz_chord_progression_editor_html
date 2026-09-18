/**
 * E0 v2 port-normalization conformance — replays every row of the accepted
 * fixture packet tests/fixtures/interchange-v2/normalization-cases.json
 * against the production normalizers (jcpe-milestone-reliable-studio-l3a.8.2
 * stage 3). The fixture packet is the independently reviewed oracle: each
 * port's exact success and refusal envelopes must normalize, and every
 * extra-key / missing-key / wrong-kind mutation must map to the closed
 * `invalid-envelope` diagnostic with the port's frozen breach stateEffect.
 * The `thrown` rows certify the driver-side `threwOrRejected` mapping, and
 * the discard row certifies the law that the discard port has NO normalizer
 * and stays unwrapped.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  E0_V2_DISCARD_PORT_LAW,
  E0_V2_PORT_BREACH_STATE_EFFECTS,
  normalizeIdentityResult,
  normalizeMarkerResult,
  normalizePreparationResult,
  normalizePublicationResult,
  threwOrRejected,
  type E0V2Normalized,
  type E0V2NormalizedPortName,
} from "../../src/application";
import * as normalizationModule from "../../src/application/e0-v2-port-normalization";

const fixturePath = resolve(
  import.meta.dirname,
  "../fixtures/interchange-v2/normalization-cases.json",
);

/** The placeholder idiom's disclosed materialization: a complete counter
 * object with every one of the ten application work-counter keys. */
const COMPLETE_COUNTER_OBJECT = Object.freeze({
  sectionsVisited: 3,
  measuresVisited: 12,
  eventsVisited: 40,
  stableIdsIndexed: 55,
  historyEntriesVisited: 2,
  historyBytesEstimated: 4096,
  bookmarksRepaired: 0,
  requestsCompared: 1,
  transportNotificationsCompared: 1,
  validationCalls: 1,
} as const);

type FixtureCase = Readonly<{
  id: string;
  port: string;
  variant: string;
  rawReturn: unknown;
  expected: Readonly<{
    outcome: string;
    diagnostic: unknown;
    stateEffect?: string;
    law?: unknown;
  }>;
}>;

function materialize(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(materialize));
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    if (record["$counterObject"] === "complete-application-work-counter-object") {
      return COMPLETE_COUNTER_OBJECT;
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      out[key] = materialize(entry);
    }
    return Object.freeze(out);
  }
  return value;
}

const NORMALIZERS: Readonly<
  Record<string, (raw: unknown) => E0V2Normalized<unknown>>
> = Object.freeze({
  prepareImportReplacementPublication: normalizePreparationResult,
  publishImportReplacement: normalizePublicationResult,
  readCurrentApplicationDocumentIdentity: normalizeIdentityResult,
  publishCanonicalExportRevision: normalizeMarkerResult,
});

const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Readonly<{
  cases: readonly FixtureCase[];
}>;

describe("E0 v2 normalization fixture conformance", () => {
  test("the packet carries all 22 reviewed rows", () => {
    expect(fixture.cases.length).toBe(22);
  });

  for (const row of fixture.cases) {
    const label = `${row.id} ${row.port} ${row.variant}`;

    if (row.variant === "thrown") {
      test(`${label} maps to the threw-or-rejected diagnostic`, () => {
        const diagnostic = threwOrRejected(
          row.port as E0V2NormalizedPortName,
        );
        expect(diagnostic).toEqual(row.expected.diagnostic as never);
        expect(
          E0_V2_PORT_BREACH_STATE_EFFECTS[
            row.port as E0V2NormalizedPortName
          ],
        ).toBe(row.expected.stateEffect as never);
      });
      continue;
    }

    if (row.expected.outcome === "exact-unwrapped") {
      test(`${label} — the discard port is exact and has no normalizer`, () => {
        expect(row.expected.law).toEqual(E0_V2_DISCARD_PORT_LAW as never);
        const exported = Object.keys(normalizationModule).filter((name) =>
          name.toLowerCase().includes("discard"),
        );
        expect(exported).toEqual([]);
        expect(Object.hasOwn(NORMALIZERS, row.port)).toBe(false);
      });
      continue;
    }

    const normalizer = NORMALIZERS[row.port];
    if (normalizer === undefined) {
      throw new Error(`NO_NORMALIZER_FOR_PORT:${row.port}`);
    }

    if (row.expected.outcome === "normalized") {
      test(`${label} normalizes and passes the raw envelope through`, () => {
        const raw = materialize(row.rawReturn);
        const result = normalizer(raw);
        expect(result.outcome).toBe("normalized");
        if (result.outcome !== "normalized") return;
        expect(result.value).toBe(raw);
      });
      continue;
    }

    test(`${label} is protocol-invalid with the frozen diagnostic`, () => {
      const raw = materialize(row.rawReturn);
      const result = normalizer(raw);
      expect(result.outcome).toBe("protocol-invalid");
      if (result.outcome !== "protocol-invalid") return;
      expect(result.diagnostic).toEqual(row.expected.diagnostic as never);
      expect(
        E0_V2_PORT_BREACH_STATE_EFFECTS[row.port as E0V2NormalizedPortName],
      ).toBe(row.expected.stateEffect as never);
    });
  }
});


describe("publication effect occurrence validation", () => {
  const effect = Object.freeze({ kind: "announce", revision: 1, requestId: null, reasonCode: "import.committed" });
  const receipt = (effects: readonly unknown[]) => Object.freeze({
    ok: true, outcome: "committed",
    identity: Object.freeze({ requestId: 1, documentId: "document-before", baseRevision: 0 }),
    documentId: "document-after", revision: 1, effects,
    counters: COMPLETE_COUNTER_OBJECT, liveForRequest: 0,
  });
  for (const kind of ["queue-recovery", "compile-playback-plan", "restore-focus", "announce", "recommend-export"]) {
    test(`preserves the legitimate ${kind} effect receipt`, () => {
      const raw = receipt(Object.freeze([Object.freeze({ ...effect, kind })]));
      const result = normalizePublicationResult(raw);
      expect(result.outcome).toBe("normalized");
      if (result.outcome === "normalized") {
        const observed: unknown = result.value;
        expect(observed).toBe(raw);
      }
    });
  }
  test("preserves an empty effects receipt", () => {
    const raw = receipt(Object.freeze([]));
    const result = normalizePublicationResult(raw);
    expect(result.outcome).toBe("normalized");
    if (result.outcome === "normalized") {
        const observed: unknown = result.value;
        expect(observed).toBe(raw);
      }
  });
  for (const kind of ["", "ANNOUNCE", "replace-document", "state"]) {
    test(`rejects the out-of-vocabulary effect ${JSON.stringify(kind)}`, () => {
      expect(normalizePublicationResult(receipt(Object.freeze([Object.freeze({ ...effect, kind })])))).toEqual({
        outcome: "protocol-invalid", diagnostic: { port: "publishImportReplacement", reason: "invalid-envelope", rawResultRetained: false },
      });
    });
  }
  for (const inherited of [false, true]) {
    test(`rejects a ${inherited ? "prototype-provided" : "missing"} effect occurrence`, () => {
      const effects: unknown[] = Array(2);
      effects[0] = effect;
      if (inherited) {
        const prototype: unknown[] = [];
        prototype[1] = effect;
        Object.setPrototypeOf(effects, prototype);
      }
      expect(normalizePublicationResult(receipt(Object.freeze(effects)))).toEqual({
        outcome: "protocol-invalid", diagnostic: { port: "publishImportReplacement", reason: "invalid-envelope", rawResultRetained: false },
      });
    });
  }
});


describe("frozen own-data port envelopes", () => {
  const validRows = fixture.cases.filter(row => row.expected.outcome === "normalized");
  for (const row of validRows) {
    const normalize = NORMALIZERS[row.port];
    if (normalize === undefined) throw new Error("Missing normalizer");
    const raw = materialize(row.rawReturn);
    if (typeof raw !== "object" || raw === null) throw new Error("Missing envelope");
    const data: Readonly<Record<string, unknown>> = raw as Readonly<Record<string, unknown>>;
    for (const variant of ["mutable", "prototype", "hidden-field", "symbol-field", "accessor"] as const) {
      test(`${row.id} rejects ${variant} without invoking getters`, () => {
        const malformed = { ...data };
        let getterCalls = 0;
        if (variant === "prototype") Object.setPrototypeOf(malformed, { state: "smuggled" });
        if (variant === "hidden-field") Object.defineProperty(malformed, "state", { value: "smuggled" });
        if (variant === "symbol-field") Object.defineProperty(malformed, Symbol("state"), { value: "smuggled" });
        if (variant === "accessor") {
          const key = Object.keys(malformed)[0];
          if (key === undefined) throw new Error("Missing key");
          Object.defineProperty(malformed, key, { enumerable: true, get() { getterCalls += 1; return data[key]; } });
        }
        if (variant !== "mutable") Object.freeze(malformed);
        const result: unknown = normalize(malformed);
        expect(getterCalls).toBe(0);
        expect(result).toEqual({ outcome: "protocol-invalid", diagnostic: {
          port: row.port, reason: "invalid-envelope", rawResultRetained: false,
        } });
      });
    }
    for (const trap of ["revoked", "get", "ownKeys", "getOwnPropertyDescriptor", "getPrototypeOf", "isExtensible"] as const) {
      test(`${row.id} contains ${trap} proxy errors`, () => {
        const rejected = () => { throw new Error("PRIVATE_PORT_PAYLOAD"); };
        const proxy = trap === "revoked" ? Proxy.revocable(data, {}) : null;
        proxy?.revoke();
        const rawProxy = proxy?.proxy ?? new Proxy(data, { [trap]: rejected });
        expect(() => normalize(rawProxy)).not.toThrow();
        const result: unknown = normalize(rawProxy);
        expect(result).toEqual({ outcome: "protocol-invalid", diagnostic: {
          port: row.port, reason: "invalid-envelope", rawResultRetained: false,
        } });
      });
    }
  }
  const identity = Object.freeze({ requestId: 1, documentId: "before", baseRevision: 0 });
  const effect = Object.freeze({ kind: "announce", revision: 1, requestId: null, reasonCode: "import.committed" });
  const publication = Object.freeze({ ok: true, outcome: "committed", identity, documentId: "after", revision: 1,
    effects: Object.freeze([effect]), counters: COMPLETE_COUNTER_OBJECT, liveForRequest: 0 });
  for (const field of ["identity", "counters", "effects", "effect"] as const) {
    test(`rejects a mutable nested ${field}`, () => {
      const raw = Object.freeze({ ...publication,
        ...(field === "identity" ? { identity: { ...identity } } : {}),
        ...(field === "counters" ? { counters: { ...COMPLETE_COUNTER_OBJECT } } : {}),
        ...(field === "effects" ? { effects: [effect] } : {}),
        ...(field === "effect" ? { effects: Object.freeze([{ ...effect }]) } : {}),
      });
      expect(normalizePublicationResult(raw).outcome).toBe("protocol-invalid");
    });
  }
  for (const variant of ["accessor", "hidden-field", "symbol-field", "prototype"] as const) {
    test(`rejects an effects array with ${variant}`, () => {
      const effects = [effect]; let getterCalls = 0;
      if (variant === "accessor") Object.defineProperty(effects, "0", { get() { getterCalls += 1; return effect; } });
      if (variant === "hidden-field") Object.defineProperty(effects, "state", { value: "smuggled" });
      if (variant === "symbol-field") Object.defineProperty(effects, Symbol("state"), { value: "smuggled" });
      if (variant === "prototype") Object.setPrototypeOf(effects, []);
      const result = normalizePublicationResult(Object.freeze({ ...publication, effects: Object.freeze(effects) }));
      expect(getterCalls).toBe(0); expect(result.outcome).toBe("protocol-invalid");
    });
  }
  for (const field of ["value", "identity", "committingTransition"] as const) {
    test(`rejects mutable preparation ${field}`, () => {
      const value = { schema: "changes.prepared-import-replacement-publication.v1", identity,
        sourceFormat: "canonical-json-v2", candidateDocumentId: "after", expectedTransportGeneration: 1,
        committingTransition: Object.freeze({ kind: "committing", requestId: 1, origin: "canonical-import",
          baseRevision: 0, candidateDocumentId: "after", undoDisposition: "retained" }) };
      if (field === "identity") value.identity = { ...identity };
      if (field === "committingTransition") value.committingTransition = { ...value.committingTransition };
      if (field !== "value") Object.freeze(value);
      expect(normalizePreparationResult(Object.freeze({ ok: true, value })).outcome).toBe("protocol-invalid");
    });
  }
  test("a frozen null-prototype data identity remains valid", () => {
    const raw = { documentId: "before", revision: 0 };
    Object.setPrototypeOf(raw, null); Object.freeze(raw);
    const result = normalizeIdentityResult(raw);
    expect(result.outcome).toBe("normalized");
    if (result.outcome === "normalized") {
      const observed: unknown = result.value;
      expect(observed).toBe(raw);
    }
  });

});
