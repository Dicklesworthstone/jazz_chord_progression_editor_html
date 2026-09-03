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
  if (Array.isArray(value)) return value.map(materialize);
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    if (record["$counterObject"] === "complete-application-work-counter-object") {
      return COMPLETE_COUNTER_OBJECT;
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      out[key] = materialize(entry);
    }
    return out;
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
