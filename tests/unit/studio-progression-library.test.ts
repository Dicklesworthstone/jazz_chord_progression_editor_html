/**
 * jcpe-lib1 evidence: every progression offered by the library parses, lands
 * through the real typed command path, and reaches sound through the real
 * transport composition.
 *
 * The negative half is the point. A chord symbol can parse cleanly and still
 * have no V0 voicing family, in which case Play refuses at the first bar --
 * which is exactly how the first starter chart shipped broken (jcpe-tkos).
 * Parsing is not playability, so this suite asserts both separately.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

/* Rendering real piano buffers for every entry; wall time is not a gate. */
setDefaultTimeout(180_000);

import {
  createStudioAudio,
  createStudioController,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import {
  PROGRESSION_LIBRARY,
  PROGRESSION_LIBRARY_IDS,
} from "../../src/application/studio-progression-library";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { PERFORMANCE_STYLE_IDS } from "../../src/playback";

const PLAY_GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

function audibleController(): StudioController {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

/**
 * Split a chart into its opening bar and the rest.
 *
 * The insertion-plan vocabulary is closed and has no fill-and-append
 * statement, so a multi-bar chart cannot enter a pristine document in one
 * command: the opening bar fills the empty measure (`fits-measure`) and the
 * remainder appends at the section end (`completes-measures`). Aiming the
 * whole chart at either target alone refuses as
 * u1.insertion_plan_overfills_destination or leaves a hollow first bar.
 */
function splitOpeningBar(chartText: string): Readonly<{
  first: string;
  rest: string;
}> {
  const bars = chartText
    .split("|")
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0);
  return Object.freeze({
    first: `| ${bars[0] ?? ""} |`,
    rest: bars.length > 1 ? `| ${bars.slice(1).join(" | ")} |` : "",
  });
}

function insertChart(controller: StudioController, chartText: string): void {
  const snapshot = controller.getSnapshot();
  const sectionId = snapshot.sections[0]?.id ?? "";
  const measureId = snapshot.sections[0]?.measures[0]?.id ?? "";
  const { first, rest } = splitOpeningBar(chartText);
  const steps: readonly (readonly [
    string,
    Parameters<StudioController["setQuickEntryDraft"]>[1],
  ])[] =
    rest.length === 0
      ? [[first, { kind: "measure-start", measureId }]]
      : [
          [first, { kind: "measure-start", measureId }],
          [rest, { kind: "section-end", sectionId }],
        ];
  for (const [text, target] of steps) {
    const preview = controller.previewChartText(text);
    if (preview.status !== "ready") {
      throw new Error(
        `chart does not parse: ${text} :: ${preview.issueCodes.join(",")}`,
      );
    }
    const drafted = controller.setQuickEntryDraft(
      text,
      target,
      preview.status,
      preview.issueCodes,
    );
    if (!drafted.ok) throw new Error(`draft refused: ${drafted.refusal.code}`);
    const applied = controller.applyQuickEntryPreview();
    if (!applied.ok) throw new Error(`insert refused: ${applied.refusal.code}`);
  }
}

describe("progression library", () => {
  test("offers a stable, unique, non-empty catalogue", () => {
    expect(PROGRESSION_LIBRARY.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PROGRESSION_LIBRARY_IDS).size).toBe(
      PROGRESSION_LIBRARY.length,
    );
    for (const entry of PROGRESSION_LIBRARY) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(0);
      expect(entry.kicker.length).toBeGreaterThan(0);
      expect(entry.chartText.startsWith("|")).toBe(true);
      expect(entry.chartText.trim().endsWith("|")).toBe(true);
    }
  });

  /*
   * The provenance law is machine-checked, not merely documented: only the
   * three reviewed kinds may appear, and a study must never be dressed up
   * as a transcription by carrying a composer-and-year kicker.
   */
  test("declares a reviewed provenance for every entry", () => {
    for (const entry of PROGRESSION_LIBRARY) {
      expect(["public-domain", "device", "study"]).toContain(entry.provenance);
      if (entry.provenance === "study") {
        expect(entry.kicker).toBe("Original study");
      }
    }
  });

  /*
   * The groove law mirrors the provenance law: every entry names a style the
   * performance package actually declares, so a library click can never
   * select a groove the compiler would refuse. The set is imported from the
   * declaring package rather than restated, because a style REMOVED from the
   * package must fail here, not silently strand its library entries.
   */
  test("assigns every entry a declared performance style", () => {
    for (const entry of PROGRESSION_LIBRARY) {
      expect(
        `${entry.id}:${String((PERFORMANCE_STYLE_IDS as readonly string[]).includes(entry.grooveStyleId))}`,
      ).toBe(`${entry.id}:true`);
    }
  });

  for (const entry of PROGRESSION_LIBRARY) {
    test(`${entry.id} parses into the studio`, () => {
      const controller = audibleController();
      const preview = controller.previewChartText(entry.chartText);
      expect(preview.status).toBe("ready");
      expect(preview.issueCodes).toEqual([]);
    });

    test(`${entry.id} reaches sound through the real transport`, () => {
      const controller = audibleController();
      insertChart(controller, entry.chartText);
      const snapshot = controller.getSnapshot();
      expect(snapshot.chordCount).toBeGreaterThan(0);

      const played = controller.playProgression(PLAY_GESTURE);
      if (!played.ok) {
        throw new Error(
          `${entry.id} refused to play: ${played.refusal.code} ${
            JSON.stringify(played.refusal)
          }`,
        );
      }
      expect(played.ok).toBe(true);
    });
  }
});
