/**
 * M1-OVR production proof (jcpe-qyyn slice 3).
 *
 * Runs the PRODUCTION pipeline and service against the independently
 * authored override fixture family and against real decoded bytes. The
 * validator recomputes the same family with its own reference; production
 * and validator never share code, so agreement here is two independent
 * implementations meeting on the authored law. End-to-end expectations
 * (the F6/D alternative, the bossa override) are written from the M0
 * golden fixture's own documented duality, never from production output.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { M1TrackRole } from "../../src/export/midi-import-automation-contract";
import {
  computeAutomationSpans,
  M1_EMPTY_IMPORT_OVERRIDES,
  M1_GROOVE_OVERRIDE_EVIDENCE,
  M1_GROOVE_OVERRIDE_ROW,
} from "../../src/export/midi-import-automation";
import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import {
  hexToBytes,
  realDecodeFrame,
  requireGoldenCase,
} from "../support/midi-import-test-kit";

const FIXTURE_DIR = join(
  import.meta.dir,
  "..",
  "fixtures",
  "midi-import-automation",
);
const overrides = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "override-cases.json"), "utf8"),
) as {
  exclusionCases: readonly {
    name: string;
    ppq: number;
    meterMap: readonly {
      tick: number;
      numerator: number;
      denominatorPower: number;
    }[];
    tracks: readonly {
      role: string;
      notes: readonly (readonly [number, number, number, number])[];
    }[];
    excludedTrackIndices: readonly number[];
    expected: {
      spanKeys: readonly { measureIndex: number; startTick: number }[];
      allSilent: boolean;
    };
  }[];
};

function service() {
  return createStudioMidiImport(realDecodeFrame);
}

describe("M1-OVR fixture agreement (exclusion, via the production segmenter)", () => {
  for (const kase of overrides.exclusionCases) {
    test(`exclusion-cases: ${kase.name}`, () => {
      const excluded = new Set(
        kase.excludedTrackIndices.filter(
          (index) => index >= 0 && index < kase.tracks.length,
        ),
      );
      const roleTracks = kase.tracks.map((track, index) => ({
        role: (excluded.has(index) ? "silent" : track.role) as M1TrackRole,
        notes: track.notes.map(([channel, key, onTick, offTick]) =>
          Object.freeze({ channel, key, onTick, offTick, onVelocity: 80 }),
        ),
      }));
      const spans = computeAutomationSpans(
        kase.ppq,
        kase.meterMap,
        roleTracks,
      );
      expect(spans.ok).toBe(true);
      if (!spans.ok) return;
      expect(
        spans.spans.map((span) => ({
          measureIndex: span.measureIndex,
          startTick: span.startTick,
        })),
      ).toEqual([...kase.expected.spanKeys]);
      expect(spans.spans.every((span) => span.silent)).toBe(
        kase.expected.allSilent,
      );
    });
  }
});

describe("M1-OVR end-to-end over real decoded bytes", () => {
  async function goldenPreview() {
    return service().readFile(
      "two-chords.mid",
      hexToBytes(requireGoldenCase("M0-GLD-002").bytesHex),
    );
  }

  test("an alternative choice changes exactly one symbol and is trace-recorded", async () => {
    const preview = await goldenPreview();
    const automation = preview.automation;
    expect(automation).not.toBeNull();
    if (automation === null) return;
    /* The documented m7/6 duality: the Dm7 span also reads as F6/D. */
    const dualitySpan = automation.readings.find((reading) =>
      reading.alternativeTexts.includes("F6/D"),
    );
    expect(dualitySpan).toBeDefined();
    if (dualitySpan === undefined) return;
    const ordinal = dualitySpan.alternativeTexts.indexOf("F6/D");
    expect(automation.chartText).toContain("Dm7");
    expect(automation.chartText).not.toContain("F6/D");

    const replanned = service().replanWithOverrides(preview, {
      ...M1_EMPTY_IMPORT_OVERRIDES,
      alternativeChoices: [
        {
          span: {
            measureIndex: dualitySpan.span.measureIndex,
            startTick: dualitySpan.span.startTick,
          },
          alternativeOrdinal: ordinal,
        },
      ],
    });
    const after = replanned.automation;
    expect(after).not.toBeNull();
    expect(after?.chartText).toContain("F6/D");
    expect(after?.chartText).not.toContain("Dm7");
    /* Exactly one symbol changed: the other span's text is untouched. */
    expect(after?.chartText).toContain("C");
    const resolve = replanned.trace.records.find(
      (record) => record.stage === "resolve",
    );
    expect(
      resolve?.decisions.some(
        (decision) => decision.outcome === `alternative-${String(ordinal)}`,
      ),
    ).toBe(true);
  });

  test("a stale span key is dropped with a trace decision, never repaired", async () => {
    const preview = await goldenPreview();
    const replanned = service().replanWithOverrides(preview, {
      ...M1_EMPTY_IMPORT_OVERRIDES,
      alternativeChoices: [
        { span: { measureIndex: 9, startTick: 99_999 }, alternativeOrdinal: 1 },
      ],
    });
    expect(replanned.automation?.chartText).toBe(
      preview.automation?.chartText ?? "",
    );
    const resolve = replanned.trace.records.find(
      (record) => record.stage === "resolve",
    );
    expect(
      resolve?.decisions.some(
        (decision) => decision.outcome === "dropped-stale",
      ),
    ).toBe(true);
  });

  test("a groove override wins with the frozen row and evidence sentence", async () => {
    const preview = await goldenPreview();
    const replanned = service().replanWithOverrides(preview, {
      ...M1_EMPTY_IMPORT_OVERRIDES,
      grooveStyleId: "bossa-nova@1",
    });
    const groove = replanned.automation?.groove;
    expect(groove?.grooveStyleId).toBe("bossa-nova@1");
    expect(groove?.row).toBe(M1_GROOVE_OVERRIDE_ROW);
    expect(groove?.evidence).toBe(M1_GROOVE_OVERRIDE_EVIDENCE);
    /* The measurement stays recorded beside the override. */
    expect(Object.keys(groove?.features ?? {}).length).toBeGreaterThan(0);
  });

  test("excluding every contributing track is the ordinary nothing-to-write refusal", async () => {
    const preview = await goldenPreview();
    const trackCount = preview.decoded?.model.tracks.length ?? 0;
    const replanned = service().replanWithOverrides(preview, {
      ...M1_EMPTY_IMPORT_OVERRIDES,
      excludedTrackIndices: Array.from(
        { length: trackCount },
        (_, index) => index,
      ),
    });
    expect(replanned.automation).toBeNull();
    expect(replanned.automationRefusal).toBe(
      "import.automation_nothing_to_write",
    );
    /* Decode and salvage records travel forward verbatim. */
    expect(replanned.trace.records[0]?.stage).toBe("decode");
    expect(replanned.trace.records[0]?.inputDigest).toBe(
      preview.trace.records[0]?.inputDigest ?? "",
    );
  });

  test("re-planning under identical overrides is deterministic and reversible", async () => {
    const preview = await goldenPreview();
    const withOverride = {
      ...M1_EMPTY_IMPORT_OVERRIDES,
      grooveStyleId: "bossa-nova@1" as const,
    };
    const first = service().replanWithOverrides(preview, withOverride);
    const second = service().replanWithOverrides(preview, withOverride);
    expect(JSON.stringify(first.automation)).toBe(
      JSON.stringify(second.automation),
    );
    /* Clearing the overrides restates the original automatic world. */
    const cleared = service().replanWithOverrides(
      first,
      M1_EMPTY_IMPORT_OVERRIDES,
    );
    expect(JSON.stringify(cleared.automation)).toBe(
      JSON.stringify(preview.automation),
    );
  });
});
